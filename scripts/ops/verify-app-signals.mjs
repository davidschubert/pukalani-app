#!/usr/bin/env node
/**
 * Blick „In die App hinein" (OPS-011, 2026-11-16): zählt je ausgerollter App
 * Fehler, Zeit-Läufe und KI-Ausfälle der letzten 25 Stunden und wird rot,
 * wenn etwas davon eindeutig kaputt ist.
 *
 *   node scripts/ops/verify-app-signals.mjs --ssh            # der Server
 *   node scripts/ops/verify-app-signals.mjs --ssh --strict   # CI: Befund = rot
 *   node scripts/ops/verify-app-signals.mjs --from-dir <ordner> --strict
 *                                 # gespeicherte Antworten (<app>.txt), für Proben
 *   PUKALANI_SIGNALS_DRILL=1 node scripts/ops/verify-app-signals.mjs --ssh --strict
 *                                 # Probealarm
 *
 * WARUM ES DAS GIBT: der Alarm sah, ob ein Host antwortet — nicht, ob die App
 * darin Fehler macht. Ein Fehler in einer Route, ein toter Zeit-Lauf (an
 * zweien hängt die Sperre bei Zahlungsverzug) oder eine ausgefallene
 * KI-Funktion wurde bemerkt, wenn ein Kunde schrieb. Die Zeichen-Entwürfe von
 * branding.supply waren so sechs Tage ohne Ergebnis.
 *
 * WIE: auf dem App-Server liegt neben jeder Ecosystem-Datei das Zähl-Skript
 * `ops/app-watch-counts.mjs` (der Deploy legt es dorthin). Es liest die zwei
 * aktuellen pm2-Logs des Prozesses und gibt NUR Zahlen und Kennungen in fester
 * Form zurück. Dieses Skript ruft es je App über ssh auf, prüft jede Zeile
 * gegen ihre Form, bevor sie in die Rechnung oder ins (öffentliche) Protokoll
 * kommt, und wendet die Regeln aus `app-signals-rules.mjs` an. Die erwarteten
 * Zeit-Läufe je App stehen in `ops/timed-jobs.conf`.
 *
 * WAS ROT WIRD und was nur gezählt wird, mit Begründung und Messwerten:
 * `app-signals-rules.mjs` (Kopf und `RULES`). Was bei Rot zu tun ist:
 * docs/runbooks/PRODUKTIONS-ALARM.md, „In die App hinein".
 *
 * EIN AUSSETZER IST KEIN BEFUND: ist eine App über ssh nicht erreichbar, gibt
 * es nach kurzer Pause genau einen zweiten Versuch.
 *
 * `PUKALANI_FINDINGS_FILE`: bekommt je rotem Befund eine Zeile — der Job
 * `alarm` schreibt sie ins Issue („was zu tun ist").
 *
 * PROBEALARM (`PUKALANI_SIGNALS_DRILL=1`): verfälscht die GELESENE Antwort der
 * ersten App so, dass ein Zeit-Lauf überfällig aussieht. An Production ändert
 * das nichts; der Weg danach ist der echte.
 *
 * Exit 0 = nichts Rotes (oder ohne `--strict`) · 1 = mindestens ein Befund ·
 * 2 = Aufruf falsch
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { WINDOW_HOURS, drillCounts, evaluateApp, parseCounts, parseExpectedJobs, summaryLine } from './app-signals-rules.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RETRY_DELAY_MS = 15_000

/** `ops/apps.conf` (je Zeile `<app> <site>`) — dieselbe Liste wie beim Ausliefern. */
export function readApps(text) {
  const apps = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim()
    if (!line) continue
    const hit = line.match(/^([a-z0-9-]+)\s+([a-z0-9.-]+)$/)
    if (hit) apps.push({ app: hit[1], site: hit[2], process: hit[2].replaceAll('.', '') })
  }
  return apps
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function askServer(server, entry) {
  // Geschickt werden nur Namen aus `ops/apps.conf` (dort auf Kleinbuchstaben,
  // Ziffern, Punkt und Bindestrich begrenzt) und eine Zahl.
  const remote = `node /home/ploi/${entry.site}/ops/app-watch-counts.mjs ${entry.process} ${WINDOW_HOURS}`
  const run = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', server, remote], { encoding: 'utf8', timeout: 120_000 })
  // Exit 5 = das Zähl-Skript hat geantwortet („Prozess fehlt"); alles andere
  // außer 0 heißt: keine Antwort des Skripts.
  if (run.error || (run.status !== 0 && run.status !== 5)) return null
  return run.stdout
}

async function collect(entry, { server, fromDir }) {
  if (fromDir) {
    const file = join(fromDir, `${entry.app}.txt`)
    return existsSync(file) ? parseCounts(readFileSync(file, 'utf8')) : { problem: 'nicht-erreichbar' }
  }
  let answer = askServer(server, entry)
  if (answer === null) {
    await sleep(RETRY_DELAY_MS)
    answer = askServer(server, entry)
  }
  return answer === null ? { problem: 'nicht-erreichbar' } : parseCounts(answer)
}

async function main() {
  const args = process.argv.slice(2)
  const strict = args.includes('--strict')
  const fromDirAt = args.indexOf('--from-dir')
  const fromDir = fromDirAt >= 0 ? args[fromDirAt + 1] : undefined
  if (!args.includes('--ssh') && !fromDir) {
    console.error('Aufruf: verify-app-signals.mjs --ssh [--strict]   oder   --from-dir <ordner> [--strict]')
    process.exit(2)
  }
  const server = process.env.PUKALANI_OPS_SSH || 'ploi@49.13.211.173'
  const drill = process.env.PUKALANI_SIGNALS_DRILL === '1'
  const findingsFile = process.env.PUKALANI_FINDINGS_FILE

  const apps = readApps(readFileSync(join(REPO, 'ops', 'apps.conf'), 'utf8'))
  const { expected, problems } = parseExpectedJobs(readFileSync(join(REPO, 'ops', 'timed-jobs.conf'), 'utf8'))
  if (problems.length) {
    console.error(`ops/timed-jobs.conf: Zeile(n) ${problems.join(', ')} nicht lesbar (erwartet: <app> <kennung>).`)
    process.exit(2)
  }

  console.log(`In die App hinein — Fehler, Zeit-Läufe und KI der letzten ${WINDOW_HOURS} Stunden${drill ? '  [PROBEALARM]' : ''}\n`)

  const red = []
  const notes = []
  let drilled = false
  for (const entry of apps) {
    const jobs = expected.get(entry.app) ?? new Set()
    let counts = await collect(entry, { server, fromDir })
    if (drill && !drilled) {
      counts = drillCounts(counts, jobs)
      drilled = true
    }
    console.log(summaryLine({ site: entry.site, counts, expected: jobs }))
    const result = evaluateApp({ app: entry.app, site: entry.site, counts, expected: jobs })
    red.push(...result.red.map(line => (drill ? `PROBEALARM — ${line}` : line)))
    notes.push(...result.notes)
  }

  if (notes.length) {
    console.log('\nNur gezählt (kein Alarm):')
    for (const line of notes) console.log(`  ℹ ${line}`)
  }
  if (!red.length) {
    console.log('\n✔ Nichts Rotes.')
    return
  }
  console.log('')
  for (const line of red) {
    // In CI wird daraus eine rote Anmerkung am Lauf; lokal ist es eine Zeile.
    console.log(process.env.GITHUB_ACTIONS ? `::error::${line}` : `✗ ${line}`)
    if (findingsFile) appendFileSync(findingsFile, `${line}\n`)
  }
  if (strict) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
