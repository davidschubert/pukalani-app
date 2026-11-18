#!/usr/bin/env node
/**
 * Täglicher Blick „Server-Einstellungen wie in der Vorlage?" (OPS-003,
 * 2026-11-16) — Webserver-Einstellungen und Zeitpläne.
 *
 * WARUM ES IHN GIBT: nginx-Dateien und Zeitpläne lagen nur auf den Servern.
 * Zwei Sites reichten monatelang die Adresse des Aufrufers nicht weiter, der
 * Erinnerungs-Lauf bediente nur eine Community, und nichts davon wurde von
 * selbst rot. Die Vorlagen (ops/nginx/), die Liste der Sites
 * (ops/nginx-sites.conf) und die Liste der Zeitpläne (ops/cron.conf) stehen
 * jetzt im Repo; dieser Blick vergleicht sie täglich mit den Servern.
 *
 * WIE: auf den Servern laufen zwei feste, nur lesende Skripte —
 *   app-prod       node …/ops/nginx-check.mjs   und   bash …/ops/cron-check.sh app-prod
 *                  (der Deploy legt beide neben die Ecosystem-Datei; seit
 *                  2026-11-18 über die Tor-Worte `nginx-check` und
 *                  `cron-check` von ops/app-watch-gate.sh — das Tor wählt
 *                  den Ordner: platform.pukalani.app, sonst die erste Site)
 *   appwrite-prod  das Tor-Wort `cron-status` (ops/appwrite-cert-gate.sh ruft
 *                  ~/ops/cron-check.sh; von Hand eingespielt)
 * Sie geben nur Zahlen, Site-Namen aus der Liste und Regel-Namen aus. Bewertet
 * wird hier (scripts/ops/server-config-rules.mjs). Das Protokoll dieses Laufs
 * ist öffentlich: keine Zeile aus einer nginx-Datei oder einem crontab kommt
 * hierher.
 *
 * KEIN FEHLALARM NACH EINEM HANDGRIFF IN PLOI: verglichen werden Pflicht-
 * Zeilen, nicht Zeichen. Ein neues Zertifikat oder ein Alias ändert die Datei,
 * aber nicht das Ergebnis.
 *
 *   node scripts/ops/verify-server-config.mjs --ssh [--strict]
 *   node scripts/ops/verify-server-config.mjs --from-dir <ordner> [--strict]
 *     (Ordner mit nginx.txt, cron-app-prod.txt, cron-appwrite-prod.txt — Tests)
 *
 * Probealarm: PUKALANI_CONFIG_DRILL=1 täuscht eine fehlende Pflicht-Zeile vor.
 * Exit: 0 grün (oder rot ohne --strict) · 1 rot mit --strict · 2 Aufruf/Liste
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { APP_SERVER, gateSshArgs } from './app-watch-gate.mjs'
import { drillNginx, evaluateCron, evaluateNginx, parseCronOutput, parseNginxOutput, summaryLines } from './server-config-rules.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RETRY_DELAY_MS = 15_000

/** Namen der Sites aus ops/nginx-sites.conf (erste Spalte). */
export function readSiteNames(text) {
  const names = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim()
    if (!line) continue
    const hit = /^([a-z0-9][a-z0-9.-]{2,80})\s+(pool|einzel|lange-routen)\s+\d{4,5}\s+(an|aus)$/.exec(line)
    if (!hit) return null
    names.push(hit[1])
  }
  return names.length ? names : null
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** `remote`: eine Befehlszeile (appwrite-prod: das Tor-Wort) oder ein Wort des Wächter-Tors auf app-prod als Liste. */
function ssh(target, remote) {
  const args = Array.isArray(remote) ? gateSshArgs(target, ...remote) : ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', target, remote]
  const run = spawnSync('ssh', args, { encoding: 'utf8', timeout: 120_000 })
  if (run.error || run.status !== 0) return null
  return run.stdout
}

async function ask(target, remote) {
  let answer = ssh(target, remote)
  if (answer === null) {
    await sleep(RETRY_DELAY_MS)
    answer = ssh(target, remote)
  }
  return answer
}

async function main() {
  const args = process.argv.slice(2)
  const strict = args.includes('--strict')
  const fromDirAt = args.indexOf('--from-dir')
  const fromDir = fromDirAt >= 0 ? args[fromDirAt + 1] : undefined
  if (!args.includes('--ssh') && !fromDir) {
    console.error('Aufruf: verify-server-config.mjs --ssh [--strict]   oder   --from-dir <ordner> [--strict]')
    process.exit(2)
  }
  const appServer = APP_SERVER
  const appwriteServer = process.env.PUKALANI_APPWRITE_SSH || 'appwrite-prod'
  // Der Wächter-Schlüssel hat auf appwrite-prod einen festen Befehl: geschickt
  // wird nur das WORT. Mit dem eigenen Zugang (freie Shell) ruft man das Tor
  // ausdrücklich: PUKALANI_APPWRITE_CRON_COMMAND='~/bin/pukalani-cert-gate.sh cron-status'.
  const appwriteCommand = process.env.PUKALANI_APPWRITE_CRON_COMMAND || 'cron-status'
  const drill = process.env.PUKALANI_CONFIG_DRILL === '1'
  const findingsFile = process.env.PUKALANI_FINDINGS_FILE

  const siteNames = readSiteNames(readFileSync(join(REPO, 'ops', 'nginx-sites.conf'), 'utf8'))
  if (!siteNames) {
    console.error('ops/nginx-sites.conf ist nicht lesbar (erwartet je Zeile: <site> <art> <port> <an|aus>).')
    process.exit(2)
  }
  // Auf app-prod wählt das Wächter-Tor (ops/app-watch-gate.sh) den Ordner der
  // Skripte selbst — nach der Regel von früher (platform.pukalani.app, sonst
  // die erste Site), aber aus der App-Liste auf dem Server. Geschickt wird nur das
  // Wort (seit CI1 a, 2026-11-18).
  const read = async (file, target, remote) => {
    if (fromDir) {
      const path = join(fromDir, file)
      return existsSync(path) ? readFileSync(path, 'utf8') : null
    }
    return ask(target, remote)
  }

  console.log(`Server-Einstellungen wie in der Vorlage? — Webserver und Zeitpläne${drill ? '  [PROBEALARM]' : ''}\n`)

  let nginx = parseNginxOutput(await read('nginx.txt', appServer, ['nginx-check']))
  if (drill) nginx = drillNginx(nginx, siteNames[0])
  const cron = new Map([
    ['app-prod', parseCronOutput(await read('cron-app-prod.txt', appServer, ['cron-check']), 'app-prod')],
    ['appwrite-prod', parseCronOutput(await read('cron-appwrite-prod.txt', appwriteServer, appwriteCommand), 'appwrite-prod')],
  ])

  for (const line of summaryLines({ nginx, cron })) console.log(line)

  const red = [
    ...evaluateNginx(nginx, siteNames),
    ...[...cron].flatMap(([server, parsed]) => evaluateCron(parsed, server)),
  ].map(line => (drill ? `PROBEALARM — ${line}` : line))

  if (!red.length) {
    console.log('\n✔ Nichts Rotes.')
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
