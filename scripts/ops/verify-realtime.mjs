#!/usr/bin/env node
/**
 * Zwei Blicke auf die Live-Verbindung (Appwrite Realtime), OPS-004, 2026-11-16.
 *
 *   node scripts/ops/verify-realtime.mjs --handshake
 *       VON AUSSEN, alle 30 Minuten: gelingt ein WebSocket-Handshake gegen
 *       api.pukalani.app? Ohne ssh, ohne Secret.
 *   node scripts/ops/verify-realtime.mjs --watchdog-line "<zeile>" [--max-age 20]
 *       TÄGLICH: wertet die EINE Zeile aus, die das Tor-Skript auf dem
 *       Appwrite-Server für `realtime-status` zurückgibt (den ssh-Aufruf macht
 *       der Workflow, damit das Wort dort als Literal steht).
 *   PUKALANI_REALTIME_DRILL=1 node scripts/ops/verify-realtime.mjs --handshake
 *       Probealarm.
 *
 * WARUM ES DAS GIBT: der Realtime-Container kann nach einem Absturz
 * „running" bleiben und trotzdem nichts mehr senden; `/api/health` der Apps
 * bleibt dabei grün. Auf dem Server prüft ein Wächter alle fünf Minuten den
 * Handshake und erstellt den Container neu (ops/realtime-watchdog.sh) — bis
 * OPS-004 bei JEDEM Fehlschlag, ohne zu zählen, und ohne dass jemand davon
 * erfuhr (die freiwillige Melde-Adresse war nie gesetzt). Seitdem gibt er nach
 * drei Neustarts in Folge auf und schreibt nur noch seinen Stand. „Meldet"
 * heißt: dieser Blick macht daraus einen Alarm.
 *
 * WARUM ZWEI BLICKE: der Stand des Wächters ist nur über ssh lesbar, und der
 * ssh-Job läuft einmal am Tag — eine tote Live-Verbindung fiele sonst bis zu
 * 24 Stunden später auf. Der Handshake von außen braucht nichts davon und
 * läuft im Halbstunden-Takt. Der tägliche Blick sieht dafür, was von außen
 * nicht zu sehen ist: dass der Wächter aufgegeben hat, dass er wiederholt neu
 * startet, oder dass sein Zeitplan gar nicht mehr läuft.
 *
 * EIN AUSFALL, DEN DER SERVER SELBST HEILT, IST KEIN ALARM: drei Versuche,
 * der dritte erst nach 5½ Minuten — länger als der Takt des Wächters auf dem
 * Server (5 Minuten) plus sein Neustart. Rot wird der Blick nur, wenn die
 * Live-Verbindung auch danach nicht antwortet.
 *
 * GEMESSEN am 2026-11-16: in vier Monaten hat der Wächter genau zweimal neu
 * gestartet, beide Male am 2026-10-24 und beide ohne Erfolg (die Ursache lag
 * nicht am Container). Normal sind 0 Neustarts am Tag.
 *
 * Was bei Rot zu tun ist: docs/runbooks/PRODUKTIONS-ALARM.md,
 * „Live-Verbindung (Realtime)".
 *
 * Exit 0 = in Ordnung · 1 = Befund · 2 = Aufruf falsch
 */
import { randomBytes } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import https from 'node:https'
import { pathToFileURL } from 'node:url'

const RUNBOOK = 'docs/runbooks/PRODUKTIONS-ALARM.md'

/** `console` gibt es in jeder Appwrite-Instanz; der Handshake braucht keine Anmeldung. */
export const REALTIME_URL = 'https://api.pukalani.app/v1/realtime?project=console'
const DRILL_URL = 'https://probealarm.invalid/v1/realtime?project=console'
const TIMEOUT_MS = 15_000
/** Pausen vor dem zweiten und dritten Versuch (Sekunden), s. Kopf. */
const WAITS_S = [20, 330]

/** Dieselbe Form prüft das Tor-Skript selbst (ops/appwrite-cert-gate.sh) — und ein Test hält beide zusammen. */
export const WATCHDOG_LINE = /^realtime ergebnis=(ok|neustart-geholfen|neustart-erfolglos|aufgegeben) fehlschlaege=([0-9]{1,12}) neustarts_24h=([0-9]{1,6}) neustarts_7t=([0-9]{1,6}) alter_minuten=([0-9]{1,9}|nie)$/

export const WATCHDOG_RULES = {
  /** Der Wächter läuft alle 5 Minuten; vier ausgefallene Läufe sind kein Schluckauf mehr. */
  maxAgeMin: 20,
  /** Normal sind 0 am Tag (Messung im Kopf). Ab drei ist es eine Schleife. */
  restartsRedFrom: 3,
}

/** Ein Upgrade-Aufruf; `ok` nur bei `101 Switching Protocols`. Gibt nie etwas von der Antwort zurück außer dem Status. */
export function handshake(url, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve) => {
    const request = https.request(url, {
      headers: {
        'Connection': 'Upgrade',
        'Upgrade': 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
      },
      timeout: timeoutMs,
    })
    let done = false
    const finish = (result) => {
      if (done) return
      done = true
      resolve(result)
    }
    request.on('upgrade', (response, socket) => {
      socket.destroy()
      finish({ ok: response.statusCode === 101, detail: `Status ${response.statusCode}` })
    })
    request.on('response', (response) => {
      response.resume()
      finish({ ok: false, detail: `Status ${response.statusCode} statt 101` })
    })
    request.on('timeout', () => request.destroy(new Error('timeout')))
    request.on('error', error => finish({ ok: false, detail: error.message === 'timeout' ? 'keine Antwort in der Frist' : 'keine Verbindung' }))
    request.end()
  })
}

/** Bis zu drei Versuche; `waitsS` sind die Pausen davor. */
export async function handshakeWithRetries(url, { waitsS = WAITS_S, attempt = handshake, sleep = seconds => new Promise(resolve => setTimeout(resolve, seconds * 1000)), log = console.log } = {}) {
  let last
  for (let index = 0; index <= waitsS.length; index++) {
    if (index > 0) {
      log(`  ${index}. Versuch gescheitert (${last.detail}) — nächster in ${waitsS[index - 1]} s`)
      await sleep(waitsS[index - 1])
    }
    last = await attempt(url)
    if (last.ok) return { ok: true, attempts: index + 1 }
  }
  return { ok: false, attempts: waitsS.length + 1, detail: last.detail }
}

/** Die Regeln für die Zeile des Tor-Worts `realtime-status`. */
export function evaluateWatchdogLine(line, rules = WATCHDOG_RULES) {
  const red = []
  const notes = []
  const hit = String(line ?? '').trim().match(WATCHDOG_LINE)
  if (!hit) {
    red.push(`Realtime-Wächter: kein lesbarer Stand vom Appwrite-Server. Tun: dort nachsehen, ob \`~/ops/realtime-watchdog.sh\` und das Tor-Skript die Fassung aus dem Repo sind und der Zeitplan läuft (\`crontab -l\`). (${RUNBOOK}, „Live-Verbindung (Realtime)")`)
    return { red, notes }
  }
  const [, result, failures, restarts24, restarts7, ageRaw] = hit
  const age = ageRaw === 'nie' ? null : Number(ageRaw)
  if (result === 'aufgegeben') {
    red.push(`Realtime-Wächter: hat nach ${failures} Fehlschlägen in Folge AUFGEGEBEN — die Live-Verbindung ist gestört, und ein Neustart des Containers hilft nicht. Tun: Ursache außerhalb des Containers suchen (Proxy, Zertifikat, Platte: Tor-Wort \`probe\`); er startet erst wieder neu, wenn ein Handshake gelungen ist. (${RUNBOOK}, „Live-Verbindung (Realtime)")`)
  }
  else if (result === 'neustart-erfolglos') {
    red.push(`Realtime-Wächter: der letzte Neustart hat nicht geholfen (${failures} Fehlschläge in Folge; nach drei gibt er auf). Tun: Ursache außerhalb des Containers suchen (Tor-Wort \`probe\`). (${RUNBOOK}, „Live-Verbindung (Realtime)")`)
  }
  if (age === null || age > rules.maxAgeMin) {
    red.push(`Realtime-Wächter: sein letzter Lauf ist ${age === null ? 'nie gewesen' : `${age} Minuten her`} (erlaubt ${rules.maxAgeMin}) — der Zeitplan auf dem Appwrite-Server läuft nicht. Tun: dort \`crontab -l\` und das Log des Wächters ansehen. (${RUNBOOK}, „Live-Verbindung (Realtime)")`)
  }
  if (Number(restarts24) >= rules.restartsRedFrom) {
    red.push(`Realtime-Wächter: ${restarts24} Neustarts in 24 Stunden (normal: 0) — der Container stirbt wiederholt, jeder Neustart trennt alle offenen Verbindungen. Tun: das Log des Containers \`appwrite-realtime\` auf dem Server lesen. (${RUNBOOK}, „Live-Verbindung (Realtime)")`)
  }
  else if (Number(restarts24) > 0) {
    notes.push(`Realtime-Wächter: ${restarts24} Neustart(s) in 24 h, ${restarts7} in 7 Tagen — unter der Schwelle (${rules.restartsRedFrom})`)
  }
  return { red, notes }
}

function report(red, notes) {
  for (const line of notes) console.log(`  ℹ ${line}`)
  for (const line of red) {
    console.log(process.env.GITHUB_ACTIONS ? `::error::${line}` : `✗ ${line}`)
    if (process.env.PUKALANI_FINDINGS_FILE) appendFileSync(process.env.PUKALANI_FINDINGS_FILE, `${line}\n`)
  }
  if (red.length) process.exit(1)
}

async function main() {
  const args = process.argv.slice(2)
  const drill = process.env.PUKALANI_REALTIME_DRILL === '1'

  if (args.includes('--handshake')) {
    const url = drill ? DRILL_URL : REALTIME_URL
    const waitsS = drill ? [1, 1] : (process.env.PUKALANI_REALTIME_WAITS ? process.env.PUKALANI_REALTIME_WAITS.split(',').map(Number) : WAITS_S)
    console.log(`Live-Verbindung von außen — Handshake gegen ${new URL(url).host}${drill ? '  [PROBEALARM]' : ''}`)
    const result = await handshakeWithRetries(url, { waitsS })
    if (result.ok) {
      console.log(`✔ Handshake gelungen (101)${result.attempts > 1 ? ` — beim ${result.attempts}. Versuch` : ''}.`)
      return
    }
    report([`${drill ? 'PROBEALARM — ' : ''}Live-Verbindung: ${result.attempts} Handshakes gegen ${new URL(url).host} in Folge gescheitert (${result.detail}) — Kommentare, Anwesenheit und Benachrichtigungen kommen nicht mehr live an. Tun: Tor-Wort \`realtime-status\` und \`probe\` lesen (Workflow von Hand mit „appwrite_probe"); der Wächter auf dem Server startet den Container höchstens dreimal selbst neu. (${RUNBOOK}, „Live-Verbindung (Realtime)")`], [])
    return
  }

  const lineAt = args.indexOf('--watchdog-line')
  if (lineAt >= 0) {
    const maxAgeAt = args.indexOf('--max-age')
    const rules = { ...WATCHDOG_RULES }
    if (maxAgeAt >= 0) rules.maxAgeMin = Number(args[maxAgeAt + 1])
    if (!Number.isFinite(rules.maxAgeMin)) {
      console.error('--max-age braucht eine Zahl.')
      process.exit(2)
    }
    const line = args[lineAt + 1] ?? ''
    const { red, notes } = evaluateWatchdogLine(line, rules)
    // Die Zeile kommt nur ins Protokoll, wenn sie die feste Form hat.
    if (WATCHDOG_LINE.test(line.trim())) console.log(line.trim())
    if (!red.length) console.log('✔ Realtime-Wächter in Ordnung.')
    report(red.map(text => (rules.maxAgeMin < 0 ? `PROBEALARM — ${text}` : text)), notes)
    return
  }

  console.error('Aufruf: verify-realtime.mjs --handshake   oder   --watchdog-line "<zeile>" [--max-age <minuten>]')
  process.exit(2)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
