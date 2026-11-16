#!/usr/bin/env node
// Zähl-Skript des Produktions-Wächters auf dem App-Server (OPS-011, 2026-11-16).
//
// WOZU: der Alarm sah bis dahin, ob ein Host antwortet — nicht, ob die App
// darin Fehler macht. Fehler-Zeilen, Zeit-Läufe und KI-Ausfälle standen nur im
// pm2-Log, und niemand zählte sie. Dieses Skript zählt sie DORT, wo sie
// liegen, und gibt NUR ZAHLEN zurück.
//
// DAS PROTOKOLL DES AUFRUFERS IST ÖFFENTLICH (GitHub Actions, 90 Tage, jedes
// angemeldete Konto). Deshalb gilt hier dieselbe Regel wie im Tor-Skript auf
// dem Appwrite-Server (ops/appwrite-cert-gate.sh): gefiltert wird, wo die
// Ausgabe entsteht. Dieses Skript gibt aus:
//   · Zahlen
//   · Wörter aus einer festen Liste (ok, failed, skipped, nie, online …)
//   · Kennungen von Zeit-Läufen — nur, wenn sie wie eine Kennung aussehen
//     (/^[a-z][a-z0-9-]{1,39}$/; sie stehen als Literal im öffentlichen Repo)
// und NIE: eine Log-Zeile, eine Meldung, einen Pfad, eine Adresse, eine
// Nutzer-Id. Was es nicht ausgibt, kann auch ein geänderter Workflow nicht ins
// Protokoll schreiben. Es liest nur (zwei Log-Dateien und `pm2 jlist`).
//
// WIE ES AUF DEN SERVER KOMMT: der Deploy legt es neben die Ecosystem-Datei
// (/home/ploi/<site>/ops/, .github/workflows/deploy.yml). Eine Änderung hier
// löst ein Ausliefern aus — Skript und Auswertung
// (scripts/ops/verify-app-signals.mjs) bleiben so beieinander; die erste Zeile
// der Ausgabe nennt trotzdem die Version, damit ein Versatz auffällt statt
// falsch zu zählen.
//
// WELCHE DATEIEN: die zwei, in die der Prozess GERADE schreibt — aus
// `pm2 jlist`, nicht per Muster. Im Log-Ordner liegen je Prozess alte Dateien
// früherer pm2-Nummern (gemessen 2026-11-16: bis zurück in den Juli); ein
// `*-error*.log` zählte sie mit. pm2 selbst setzt keinen Zeitstempel und
// rotiert nicht — gezählt werden deshalb nur JSON-Zeilen, die die App mit
// `time` schreibt (core/server/utils/logEvent.ts).
//
// WAS GEZÄHLT WIRD (im Fenster der letzten <stunden> Stunden):
//   server.error                  5xx am zentralen Fehler-Hook
//   client.error                  Fehler aus dem Browser (Annahme je Prozess gedeckelt)
//   telemetry.client_error_capped der Deckel hat gegriffen
//   ai.failed                     Ausfall eines bezahlten KI-Aufrufs; eigens
//                                 Status 402 (kein Guthaben / Limit) und 404
//                                 (kein Endpunkt unter der Bindung)
//   ai.disabled                   der Abschalter hat einen Aufruf verhindert
//   job.registered / job.run      Zeit-Läufe (core/server/utils/timedJob.ts)
// Für die Zeit-Läufe zählt zusätzlich die GANZE aktuelle Datei: „letzter
// guter Lauf vor n Minuten" darf älter sein als das Fenster.
//
// AUFRUF
//   node app-watch-counts.mjs <prozess> [stunden]      (Standard: 25)
//   prozess = pm2-Name, Site ohne Punkte (ops/apps.conf)
//
// Exit: 0 gezählt · 5 pm2 antwortet nicht oder kennt den Prozess nicht ·
//       64 Aufruf nicht erlaubt
import { execFileSync } from 'node:child_process'
import { createReadStream, statSync } from 'node:fs'
import { createInterface } from 'node:readline'

const VERSION = 1

const PROCESS_PATTERN = /^[a-z0-9]{3,40}$/
const JOB_PATTERN = /^[a-z][a-z0-9-]{1,39}$/
const RESULTS = new Set(['ok', 'failed', 'skipped'])
const STATES = new Set(['online', 'stopping', 'stopped', 'launching', 'errored'])
/** Mehr Läufe hat keine App; der Deckel hält eine vergiftete Datei klein. */
const MAX_JOBS = 60
/** Von einer sehr großen Datei nur das Ende lesen (die Zeilen sind zeitlich geordnet). */
const MAX_READ_BYTES = 200 * 1024 * 1024

function refuse(message) {
  console.log(message)
  process.exit(64)
}

function wholeNumber(value, max) {
  return Number.isInteger(value) && value >= 0 && value <= max ? value : 0
}

/**
 * `pm2 jlist` schreibt gelegentlich Hinweise vor das JSON, und die beginnen
 * selbst mit einer Klammer (`[PM2] Spawning …`) — gelesen wird deshalb ab der
 * ersten Zeile, die wie der Anfang der Liste aussieht (`[{` oder `[]`).
 */
function readProcessList() {
  let raw
  try {
    raw = execFileSync('pm2', ['jlist'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 })
  }
  catch {
    return null
  }
  const start = raw.search(/^\[(\{|\])/m)
  if (start < 0) return null
  try {
    const list = JSON.parse(raw.slice(start))
    return Array.isArray(list) ? list : null
  }
  catch {
    return null
  }
}

async function scan(file, onEvent) {
  let size
  try {
    size = statSync(file).size
  }
  catch {
    return
  }
  const start = size > MAX_READ_BYTES ? size - MAX_READ_BYTES : 0
  const lines = createInterface({ input: createReadStream(file, { start, encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const line of lines) {
    // Nur Zeilen aus `logEvent` — alles andere (Stacks, freie Meldungen) wird
    // nicht einmal geparst.
    if (!line.startsWith('{"time":"')) continue
    let entry
    try {
      entry = JSON.parse(line)
    }
    catch {
      continue
    }
    if (typeof entry?.time !== 'string' || typeof entry?.event !== 'string') continue
    const at = Date.parse(entry.time)
    if (!Number.isFinite(at)) continue
    onEvent(entry, at)
  }
}

function minutesSince(now, at) {
  if (at === null) return 'nie'
  return String(Math.max(0, Math.round((now - at) / 60000)))
}

async function main() {
  const [name, hoursArg] = process.argv.slice(2)
  if (!name || !PROCESS_PATTERN.test(name)) refuse('Abgelehnt: erwartet wird <prozess> [stunden].')
  const hours = hoursArg === undefined ? 25 : Number(hoursArg)
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) refuse('Abgelehnt: stunden muss eine ganze Zahl von 1 bis 168 sein.')

  const now = Date.now()
  const since = now - hours * 3600000

  const list = readProcessList()
  const proc = list?.find(item => item?.name === name)
  if (!proc) {
    console.log(`zaehler version=${VERSION} prozess=${name} stunden=${hours} status=${list ? 'fehlt' : 'unbekannt'}`)
    process.exit(5)
  }
  const env = proc.pm2_env ?? {}
  const state = STATES.has(env.status) ? env.status : 'unbekannt'
  const memoryMb = wholeNumber(Math.round((proc.monit?.memory ?? 0) / 1048576), 1000000)
  const restarts = wholeNumber(env.restart_time, 100000000)
  const upMinutes = Number.isFinite(env.pm_uptime) ? wholeNumber(Math.round((now - env.pm_uptime) / 60000), 100000000) : 0

  const counts = { server: 0, browser: 0, capped: 0, ai: 0, aiNoCredit: 0, aiNoEndpoint: 0, aiDisabled: 0 }
  const jobs = new Map()
  const job = (id) => {
    if (typeof id !== 'string' || !JOB_PATTERN.test(id)) return null
    if (!jobs.has(id)) {
      if (jobs.size >= MAX_JOBS) return null
      jobs.set(id, { everyMin: 0, ok: 0, failed: 0, skipped: 0, overlap: 0, lastOk: null, lastRun: null, lastResult: 'nie', registered: null })
    }
    return jobs.get(id)
  }

  const onEvent = (entry, at) => {
    const inWindow = at >= since
    switch (entry.event) {
      case 'server.error':
        if (inWindow) counts.server++
        break
      case 'client.error':
        if (inWindow) counts.browser++
        break
      case 'telemetry.client_error_capped':
        if (inWindow) counts.capped++
        break
      case 'ai.failed':
        if (!inWindow) break
        counts.ai++
        if (entry.status === 402) counts.aiNoCredit++
        if (entry.status === 404) counts.aiNoEndpoint++
        break
      case 'ai.disabled':
        if (inWindow) counts.aiDisabled++
        break
      case 'job.registered': {
        const item = job(entry.job)
        if (!item) break
        // Die FRÜHESTE Anmeldung in der Datei: für einen Lauf, der noch nie
        // gut gelaufen ist, beginnt die Frist dort — nicht bei jedem Neustart
        // neu (sonst bliebe ein Lauf, der seit seiner Einführung scheitert, an
        // einem Tag mit vielen Auslieferungen unsichtbar).
        if (item.registered === null || at < item.registered) item.registered = at
        if (Number.isInteger(entry.everyMin)) item.everyMin = wholeNumber(entry.everyMin, 100000)
        break
      }
      case 'job.run': {
        const item = job(entry.job)
        if (!item || !RESULTS.has(entry.result)) break
        if (Number.isInteger(entry.everyMin)) item.everyMin = wholeNumber(entry.everyMin, 100000)
        // „Der vorige Takt läuft noch" ist ein Übersprungen eigener Art: ein
        // Lauf, der HÄNGT, schreibt bei jedem Takt genau diese Zeile. Sie
        // zählt deshalb eigens und hält den Lauf NICHT am Leben.
        const overlap = entry.result === 'skipped' && entry.reason === 'overlap'
        if (inWindow) {
          if (overlap) item.overlap++
          else item[entry.result]++
        }
        if (item.lastRun === null || at >= item.lastRun) {
          item.lastRun = at
          item.lastResult = entry.result
        }
        // Ein bewusstes „Übersprungen" (Tor je Takt geschlossen) hält einen
        // Lauf am Leben — für „überfällig" zählt es wie ein guter.
        if (entry.result !== 'failed' && !overlap && (item.lastOk === null || at > item.lastOk)) item.lastOk = at
        break
      }
    }
  }

  for (const file of [env.pm_err_log_path, env.pm_out_log_path]) {
    if (typeof file === 'string' && file.length > 0) await scan(file, onEvent)
  }

  console.log(`zaehler version=${VERSION} prozess=${name} stunden=${hours} status=${state}`)
  console.log(`prozess speicher_mb=${memoryMb} neustarts=${restarts} laeuft_min=${upMinutes}`)
  console.log(`fehler server=${counts.server} browser=${counts.browser} browser_gedeckelt=${counts.capped}`)
  console.log(`ki ausfaelle=${counts.ai} ohne_guthaben=${counts.aiNoCredit} kein_endpunkt=${counts.aiNoEndpoint} abgeschaltet=${counts.aiDisabled}`)
  for (const id of [...jobs.keys()].sort()) {
    const item = jobs.get(id)
    console.log(`lauf name=${id} takt_min=${item.everyMin} ok=${item.ok} gescheitert=${item.failed} uebersprungen=${item.skipped} haengt=${item.overlap} letzter_ok_min=${minutesSince(now, item.lastOk)} letzter_lauf_min=${minutesSince(now, item.lastRun)} letztes_ergebnis=${item.lastResult} angemeldet_min=${minutesSince(now, item.registered)}`)
  }
  console.log(`ende laeufe=${jobs.size}`)
}

await main()
