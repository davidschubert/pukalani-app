#!/usr/bin/env node
/**
 * Täglicher Blick „Liegt auf den Servern, was im Repo steht?" (CI1 c,
 * 2026-11-18).
 *
 * WARUM ES IHN GIBT: mehrere Dateien liegen VON HAND eingespielt auf den
 * Servern — die beiden Tore, das Ausliefer-Skript, der Realtime-Wächter, das
 * Backup, ihre Listen und der öffentliche Backup-Schlüssel. Ändert sich eine
 * davon im Repo und wird nicht neu eingespielt, läuft auf dem Server still die
 * alte Fassung weiter. Das merkte bis hierher niemand.
 *
 * WIE: beide Tore kennen das Wort `sums` und geben je Datei EINE Zeile
 * `sum <name> <sha256>` (oder `sum <name> fehlt`) aus —
 *   app-prod       ops/app-watch-gate.sh  (Wächter-Tor, Dateien unter ~/ops)
 *   appwrite-prod  ops/appwrite-cert-gate.sh (liegt dort als
 *                  ~/bin/pukalani-cert-gate.sh, Dateien unter ~/ops)
 * Dieses Skript rechnet die Summen der Repo-Dateien und vergleicht. Welche
 * Server-Datei zu welcher Repo-Datei gehört, steht an EINER Stelle:
 * `SERVER_FILES` unten. Neue von Hand eingespielte Datei ⇒ dort eintragen UND
 * in die Liste des Tors (der Test appWatchGate.test.ts hält beide zusammen).
 *
 * ROT (mit `--strict`): eine Datei weicht ab oder fehlt. Je Befund ein Satz,
 * was zu tun ist (docs/runbooks/CI-SCHLUESSEL-TAUSCHEN.md).
 * KEINE AUSSAGE, KEIN ROT: der Server ist nicht erreichbar, oder sein Tor
 * kennt `sums` noch nicht (Exit 64 — so antwortet appwrite-prod, bis das neue
 * Tor von Hand eingespielt ist). Dann steht eine deutliche Warnzeile „nicht
 * geprüft" im Protokoll; ein Wächter, der bei jedem Aussetzer rot wird, wird
 * überlesen.
 *
 *   node scripts/ops/verify-server-scripts.mjs [--strict]
 *   PUKALANI_OPS_SSH       App-Server (Vorgabe wie die anderen Wächter)
 *   PUKALANI_APPWRITE_SSH  Datenbank-Server (Vorgabe `appwrite-prod`, der
 *                          ssh-Alias des Workflows)
 *   PUKALANI_APPWRITE_SUMS_COMMAND  was dorthin geschickt wird (Vorgabe `sums`;
 *                          mit dem eigenen Zugang: '~/bin/pukalani-cert-gate.sh sums')
 *   PUKALANI_FINDINGS_FILE je rotem Befund eine Zeile (für das Issue)
 *
 * Das Protokoll ist öffentlich: hinaus gehen nur Namen aus dieser Datei und
 * ein Kurzstück der Summen.
 *
 * Exit: 0 grün (oder rot ohne --strict) · 1 rot mit --strict
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { APP_SERVER, GATE_REJECTED, gateSshArgs } from './app-watch-gate.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RETRY_DELAY_MS = 15_000
const RUNBOOK = 'docs/runbooks/CI-SCHLUESSEL-TAUSCHEN.md'

/**
 * DIE ZUORDNUNG — Server, Name in der Ausgabe des Tors, Datei im Repo und wo
 * im Runbook das Einspielen steht.
 */
export const SERVER_FILES = [
  { server: 'app-prod', name: 'app-release.sh', repo: 'ops/app-release.sh', how: `${RUNBOOK}, „Feste Befehle auf app-prod"` },
  { server: 'app-prod', name: 'app-watch-gate.sh', repo: 'ops/app-watch-gate.sh', how: `${RUNBOOK}, „Das Wächter-Tor"` },
  { server: 'app-prod', name: 'apps.conf', repo: 'ops/apps.conf', how: `${RUNBOOK}, „Feste Befehle auf app-prod"` },
  { server: 'app-prod', name: 'app-env-bundle.sh', repo: 'ops/app-env-bundle.sh', how: 'docs/runbooks/APPWRITE-WIEDERHERSTELLUNG.md, § 6.1' },
  { server: 'app-prod', name: 'appwrite-backup.pub.asc', repo: 'ops/appwrite-backup.pub.asc', how: 'docs/runbooks/APPWRITE-WIEDERHERSTELLUNG.md, § 6.1' },
  { server: 'appwrite-prod', name: 'pukalani-cert-gate.sh', repo: 'ops/appwrite-cert-gate.sh', how: `${RUNBOOK}, „Tor auf appwrite-prod"` },
  { server: 'appwrite-prod', name: 'cron-check.sh', repo: 'ops/cron-check.sh', how: `${RUNBOOK}, „Tor auf appwrite-prod"` },
  { server: 'appwrite-prod', name: 'cron.conf', repo: 'ops/cron.conf', how: `${RUNBOOK}, „Tor auf appwrite-prod"` },
  { server: 'appwrite-prod', name: 'realtime-watchdog.sh', repo: 'ops/realtime-watchdog.sh', how: 'docs/runbooks/PRODUKTIONS-ALARM.md, „Live-Verbindung"' },
  { server: 'appwrite-prod', name: 'appwrite-backup.sh', repo: 'ops/appwrite-backup.sh', how: 'docs/runbooks/APPWRITE-WIEDERHERSTELLUNG.md, § 6' },
  { server: 'appwrite-prod', name: 'appwrite-volumes.conf', repo: 'ops/appwrite-volumes.conf', how: 'docs/runbooks/APPWRITE-WIEDERHERSTELLUNG.md, § 6' },
  { server: 'appwrite-prod', name: 'appwrite-backup.pub.asc', repo: 'ops/appwrite-backup.pub.asc', how: 'docs/runbooks/APPWRITE-WIEDERHERSTELLUNG.md, § 6' },
]

const SUM_LINE = /^sum ([a-z0-9][a-z0-9._-]{0,80}) ([0-9a-f]{64}|fehlt)$/

/** Die Zeilen eines Tors (pure): Name ⇒ Summe oder `'fehlt'`. Zeilen in anderer Form fallen weg. */
export function parseSums(text) {
  const sums = new Map()
  for (const raw of String(text ?? '').split('\n')) {
    const hit = SUM_LINE.exec(raw.trim())
    if (hit) sums.set(hit[1], hit[2])
  }
  return sums
}

/**
 * Was ein Server geantwortet hat (pure): `{ state: 'ok', sums }`,
 * `{ state: 'unknown-word' }` (Exit 64) oder `{ state: 'unreachable', detail }`.
 */
export function answerFrom({ status, stdout }) {
  if (status === GATE_REJECTED) return { state: 'unknown-word' }
  if (status !== 0) return { state: 'unreachable', detail: status === null ? 'keine Antwort' : `Exit ${status}` }
  const sums = parseSums(stdout)
  if (!sums.size) return { state: 'unreachable', detail: 'Antwort ohne lesbare Zeile' }
  return { state: 'ok', sums }
}

/**
 * DER VERGLEICH (pure). `answers`: Server ⇒ Antwort (aus `answerFrom`),
 * `repoSums`: Repo-Pfad ⇒ sha256. Ergebnis: `lines` fürs Protokoll, `red`
 * (je Befund ein Satz) und `notChecked` (Warnzeilen, kein Befund).
 */
export function compareSums({ answers, repoSums, files = SERVER_FILES }) {
  const lines = []
  const red = []
  const notChecked = []
  for (const server of [...new Set(files.map(f => f.server))]) {
    const answer = answers.get(server) ?? { state: 'unreachable', detail: 'nicht gefragt' }
    if (answer.state === 'unknown-word') {
      notChecked.push(`${server}: das Tor kennt das Wort „sums“ noch nicht — NICHT GEPRÜFT. Das Tor aus dem Repo von Hand einspielen (${RUNBOOK}).`)
      continue
    }
    if (answer.state !== 'ok') {
      notChecked.push(`${server}: nicht erreichbar (${answer.detail}) — NICHT GEPRÜFT, keine Aussage über die Dateien dort.`)
      continue
    }
    for (const file of files.filter(f => f.server === server)) {
      const onServer = answer.sums.get(file.name)
      const inRepo = repoSums.get(file.repo)
      if (onServer === undefined) {
        red.push(`${server}: das Tor meldet ${file.name} nicht — die Liste des Tors und SERVER_FILES in scripts/ops/verify-server-scripts.mjs angleichen, das Tor neu einspielen (${RUNBOOK}).`)
        lines.push(`✗ ${server.padEnd(14)} ${file.name.padEnd(26)} nicht gemeldet`)
      }
      else if (onServer === 'fehlt') {
        red.push(`${server}: ${file.name} fehlt auf dem Server — ${file.repo} von Hand einspielen (${file.how}).`)
        lines.push(`✗ ${server.padEnd(14)} ${file.name.padEnd(26)} fehlt`)
      }
      else if (onServer !== inRepo) {
        red.push(`${server}: ${file.name} weicht von ${file.repo} ab — neu einspielen (${file.how}), danach zeigt dieser Blick dieselbe Summe.`)
        lines.push(`✗ ${server.padEnd(14)} ${file.name.padEnd(26)} weicht ab (Server ${onServer.slice(0, 12)}…, Repo ${String(inRepo).slice(0, 12)}…)`)
      }
      else {
        lines.push(`✔ ${server.padEnd(14)} ${file.name.padEnd(26)} wie im Repo (${onServer.slice(0, 12)}…)`)
      }
    }
  }
  return { lines, red, notChecked }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function run(args) {
  const result = spawnSync('ssh', args, { encoding: 'utf8', timeout: 60_000 })
  return { status: result.error ? null : result.status, stdout: result.stdout ?? '' }
}

/** Eine Antwort holen; ein Aussetzer bekommt nach kurzer Pause genau einen zweiten Versuch. */
async function ask(args) {
  let answer = answerFrom(run(args))
  if (answer.state === 'unreachable') {
    await sleep(RETRY_DELAY_MS)
    answer = answerFrom(run(args))
  }
  return answer
}

async function main() {
  const strict = process.argv.includes('--strict')
  const appwriteServer = process.env.PUKALANI_APPWRITE_SSH || 'appwrite-prod'
  // Der Wächter-Schlüssel hat dort einen festen Befehl: geschickt wird nur das WORT.
  const appwriteCommand = process.env.PUKALANI_APPWRITE_SUMS_COMMAND || 'sums'
  const findingsFile = process.env.PUKALANI_FINDINGS_FILE

  const repoSums = new Map(SERVER_FILES.map(f => [f.repo, sha256(join(REPO, f.repo))]))
  const answers = new Map([
    ['app-prod', await ask(gateSshArgs(APP_SERVER, 'sums'))],
    ['appwrite-prod', await ask(['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', appwriteServer, appwriteCommand])],
  ])

  console.log('Liegt auf den Servern, was im Repo steht? — von Hand eingespielte Dateien\n')
  const { lines, red, notChecked } = compareSums({ answers, repoSums })
  for (const line of lines) console.log(line)
  for (const line of notChecked) {
    console.log(process.env.GITHUB_ACTIONS ? `::warning::${line}` : `⚠ ${line}`)
  }
  if (!red.length) {
    console.log(notChecked.length ? '\nKein Befund in dem, was geprüft werden konnte.' : '\n✔ Alles wie im Repo.')
    return
  }
  console.log('')
  for (const line of red) {
    console.log(process.env.GITHUB_ACTIONS ? `::error::${line}` : `✗ ${line}`)
    if (findingsFile) appendFileSync(findingsFile, `${line}\n`)
  }
  if (strict) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
