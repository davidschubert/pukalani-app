#!/usr/bin/env node
/**
 * UptimeRobot-Abgleich: liest die Monitore des Kontos, erklärt je Monitor,
 * WARUM er alarmiert oder schweigt, und bringt sie auf das Soll aus der
 * Klickliste (Keyword-Monitore `"ok":true` je Produktions-Host).
 *
 *   UPTIMEROBOT_API_KEY=… node scripts/ops/uptimerobot-sync.mjs            # nur lesen + Plan
 *   UPTIMEROBOT_API_KEY=… node scripts/ops/uptimerobot-sync.mjs --apply    # Soll anlegen/umbiegen
 *   UPTIMEROBOT_API_KEY=… node scripts/ops/uptimerobot-sync.mjs --apply --prune      # dazu Fremde löschen
 *   UPTIMEROBOT_API_KEY=… node scripts/ops/uptimerobot-sync.mjs --apply --heartbeat  # dazu Heartbeat anlegen
 *   UPTIMEROBOT_API_KEY=… node scripts/ops/uptimerobot-sync.mjs --contacts 123,456    # nur diese Alert Contacts
 *
 * Der Schlüssel ist der *Main API key* (UptimeRobot → Integrations & API);
 * ein *Read-only key* reicht für den Plan, nicht für `--apply`. Er wird nie
 * ausgegeben und nirgends abgelegt — nur aus der Umgebung gelesen.
 *
 * WARUM ES DAS GIBT (MON2, 2026-10-28): im Oktober 2026 lief das Zertifikat
 * von `api.pukalani.app` ab, alle Apps antworteten acht Tage `ok:false`.
 * UptimeRobot HAT alarmiert — vier DOWN-Mails am 2026-10-16 (demo, comments,
 * control, portfolio, Ursache „HTTP 502") lagen ungelesen im Posteingang, der
 * HTTP-Monitor auf `api.pukalani.app` blieb dagegen die ganze Zeit „UP"
 * (99,95 % in der Woche 18.–24.10.): der kostenlose Tarif prüft kein
 * Zertifikat, und ein HTTP-Monitor liest den Rumpf nicht — `200` mit
 * `{"ok":false}` ist für ihn gesund. Deshalb Keyword-Monitore, die ALARM
 * geben, wenn `"ok":true` FEHLT, und ein Blick auf die Alert Contacts:
 * ein Kontakt ohne Bestätigung oder ein pausierter Monitor schweigt für
 * immer, ohne dass es irgendwo rot wird.
 *
 * ── Was das Skript NICHT tut ──────────────────────────────────────────────
 * - SSL-Ablauf-Erinnerung einschalten: das ist bei UptimeRobot eine Funktion
 *   der bezahlten Tarife (die DOWN-Mail vom 2026-10-24 sagt es wörtlich) und
 *   hat in API v2 keinen dokumentierten Parameter. Zweiter Weg für den
 *   Zertifikat-Ablauf bleibt `scripts/ops/verify-tls.mjs` + Alarm-Issue.
 * - Heartbeat-Monitore erzwingen: `--heartbeat` VERSUCHT einen Monitor vom
 *   Typ 5 anzulegen; lehnt der Tarif ab, steht die Antwort der API im Log,
 *   und der Heartbeat läuft über https://healthchecks.io (kostenlos).
 *
 * ── API v2 (verb-förmige POST-Aufrufe, Formular-Körper) ───────────────────
 * Zahlen-Codes wie in der v2-Referenz: Monitor-Typ 1 HTTP, 2 Keyword, 3 Ping,
 * 4 Port, 5 Heartbeat; `keyword_type` 1 = Alarm, wenn das Wort DA ist, 2 =
 * Alarm, wenn es FEHLT; Status 0 pausiert, 1 noch nicht geprüft, 2 up,
 * 8 scheint down, 9 down; `alert_contacts` als `id_schwelle_wiederholung`,
 * mehrere mit `-` verbunden; `interval` in Sekunden. Alle Schreibaufrufe
 * zeigen ihren Formular-Körper VOR dem Senden — ohne `--apply` wird nichts
 * gesendet, und JEDE Antwort der API wird roh ausgegeben, damit ein
 * Irrtum über die Codes sofort sichtbar ist statt still zu wirken.
 *
 * Exit 0 = Plan/Abgleich gelaufen · Exit 1 = API-Fehler oder Schlüssel fehlt.
 */

/** Überschreibbar nur für den Beweis gegen einen lokalen Attrappen-Server (tests). */
const API = process.env.UPTIMEROBOT_API_URL ?? 'https://api.uptimerobot.com/v2/'

/** Alarm, wenn `"ok":true` FEHLT — Hosts wie in `scripts/ops/verify-health.mjs` (dort ist die Stammliste). */
const KEYWORD_OK = '"ok":true'

const SOLL = [
  { name: 'platform.pukalani.app', url: 'https://platform.pukalani.app/api/health', keyword: KEYWORD_OK },
  { name: 'account.pukalani.app', url: 'https://account.pukalani.app/api/health', keyword: KEYWORD_OK },
  { name: 'demo.pukalani.app', url: 'https://demo.pukalani.app/api/health', keyword: KEYWORD_OK },
  { name: 'admin.pukalani.app', url: 'https://admin.pukalani.app/api/health', keyword: KEYWORD_OK },
  { name: 'pukalani.studio', url: 'https://pukalani.studio/api/health', keyword: KEYWORD_OK },
  { name: 'portfolio.pukalani.app', url: 'https://portfolio.pukalani.app/api/health', keyword: KEYWORD_OK },
  { name: 'branding.supply', url: 'https://branding.supply/api/health', keyword: KEYWORD_OK },
  { name: 'pukalani.app', url: 'https://pukalani.app/api/health', keyword: KEYWORD_OK },
  { name: 'help.pukalani.app', url: 'https://help.pukalani.app/api/health', keyword: KEYWORD_OK },
  // Appwrite: NIE `doctor` (sendet SMTP-Testmail), nur die Versionsauskunft.
  { name: 'api.pukalani.app (Appwrite)', url: 'https://api.pukalani.app/v1/health/version', keyword: '"version"' },
]

/** Keyword-Monitor alle 5 Minuten; Heartbeat: Ping stündlich erwartet. */
const KEYWORD_INTERVAL_S = 300
const HEARTBEAT_NAME = 'production-watch'
const HEARTBEAT_INTERVAL_S = 3600

const TYPE_KEYWORD = 2
const TYPE_HEARTBEAT = 5
const KEYWORD_TYPE_MISSING = 2
const STATUS_PAUSED = 0
const CONTACT_STATUS_ACTIVE = 2

const TYPE_NAME = { 1: 'HTTP', 2: 'Keyword', 3: 'Ping', 4: 'Port', 5: 'Heartbeat' }
const STATUS_NAME = { 0: 'PAUSIERT', 1: 'noch nicht geprüft', 2: 'up', 8: 'scheint down', 9: 'DOWN' }
const KEYWORD_TYPE_NAME = { 1: 'Alarm wenn Wort DA', 2: 'Alarm wenn Wort FEHLT' }
const CONTACT_STATUS_NAME = { 0: 'NICHT BESTÄTIGT', 1: 'pausiert', 2: 'aktiv' }

const APPLY = process.argv.includes('--apply')
const PRUNE = process.argv.includes('--prune')
const HEARTBEAT = process.argv.includes('--heartbeat')
const argContacts = process.argv.indexOf('--contacts')
const CONTACT_IDS = argContacts !== -1 && process.argv[argContacts + 1]
  ? process.argv[argContacts + 1].split(',').map((s) => s.trim()).filter(Boolean)
  : null

const apiKey = process.env.UPTIMEROBOT_API_KEY
if (!apiKey) {
  console.error('UPTIMEROBOT_API_KEY fehlt (UptimeRobot → Integrations & API → Main API key).')
  process.exit(1)
}

/**
 * Ein v2-Aufruf: POST mit Formular-Körper, Antwort `{ stat: 'ok' | 'fail' }`.
 * Der Schlüssel wird NUR hier angehängt und nie geloggt.
 */
async function call(method, fields = {}) {
  const body = new URLSearchParams({ api_key: apiKey, format: 'json', ...fields })
  const res = await fetch(API + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body,
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`${method}: keine JSON-Antwort (HTTP ${res.status}): ${text.slice(0, 200)}`)
  }
  if (json.stat !== 'ok') {
    throw new Error(`${method}: ${JSON.stringify(json.error ?? json)}`)
  }
  return json
}

/** Formular-Körper ohne Schlüssel — so sieht David VOR dem Senden, was geht. */
function zeige(method, fields) {
  console.log(`   → ${method} ${new URLSearchParams(fields).toString()}`)
}

async function schreibe(method, fields) {
  zeige(method, fields)
  if (!APPLY) return null
  const json = await call(method, fields)
  console.log(`   ← ${JSON.stringify(json)}`)
  return json
}

function normUrl(u) {
  return String(u ?? '').trim().replace(/\/+$/, '').toLowerCase()
}

async function main() {
  console.log(`UptimeRobot-Abgleich — ${APPLY ? 'SCHREIBEND (--apply)' : 'nur lesen; Plan unten'}\n`)

  // ── Alert Contacts: wer bekommt den Alarm überhaupt? ─────────────────────
  const contacts = (await call('getAlertContacts')).alert_contacts ?? []
  console.log(`Alert Contacts (${contacts.length}):`)
  for (const c of contacts) {
    const status = CONTACT_STATUS_NAME[c.status] ?? `Status ${c.status}`
    const typ = c.type === 2 ? 'E-Mail' : `Typ ${c.type}`
    console.log(`  - #${c.id} ${typ} ${c.friendly_name ?? ''} ${c.value ?? ''} — ${status}`)
    if (c.status !== CONTACT_STATUS_ACTIVE) {
      console.log('    ⚠ dieser Kontakt bekommt KEINEN Alarm (nicht bestätigt oder pausiert)')
    }
  }
  const aktiveKontakte = contacts.filter((c) => c.status === CONTACT_STATUS_ACTIVE).map((c) => String(c.id))
  const zielKontakte = CONTACT_IDS ?? aktiveKontakte
  if (zielKontakte.length === 0) {
    console.log('\n⚠ Kein aktiver Alert Contact — ein Monitor ohne Kontakt ist ein Wächter ohne Alarmweg.')
  }
  const alertContactsFeld = zielKontakte.map((id) => `${id}_0_0`).join('-')
  console.log(`  Ziel für neue/umgebogene Monitore: ${alertContactsFeld || '(keiner)'}\n`)

  // ── Ist-Zustand: jeder Monitor mit dem Grund, warum er schweigen könnte ──
  const monitors = (await call('getMonitors', { alert_contacts: '1' })).monitors ?? []
  console.log(`Monitore (${monitors.length}):`)
  // Je URL der beste Kandidat: ein Keyword-Monitor schlägt einen HTTP-Monitor
  // auf derselben Adresse (nach einem Ersatz stehen kurz beide da).
  const nachUrl = new Map()
  for (const m of monitors) {
    const key = normUrl(m.url)
    const bisher = nachUrl.get(key)
    if (!bisher || (bisher.type !== TYPE_KEYWORD && m.type === TYPE_KEYWORD)) nachUrl.set(key, m)
    const typ = TYPE_NAME[m.type] ?? `Typ ${m.type}`
    const status = STATUS_NAME[m.status] ?? `Status ${m.status}`
    const kw = m.type === TYPE_KEYWORD
      ? ` · Keyword ${JSON.stringify(m.keyword_value ?? '')} (${KEYWORD_TYPE_NAME[m.keyword_type] ?? `keyword_type ${m.keyword_type}`})`
      : ''
    const kontakte = (m.alert_contacts ?? []).map((c) => `#${c.id}`).join(',') || 'KEINE'
    console.log(`  - #${m.id} [${typ}] ${m.friendly_name} → ${m.url} — ${status}, alle ${m.interval}s${kw}, Kontakte ${kontakte}`)
    if (m.status === STATUS_PAUSED) console.log('    ⚠ pausiert: prüft nichts, meldet nichts')
    if (!m.alert_contacts || m.alert_contacts.length === 0) console.log('    ⚠ ohne Alert Contact: wird rot, erreicht aber niemanden')
    if (m.type === 1) console.log('    ℹ HTTP-Monitor: sieht nur den Statuscode — `200` mit `{"ok":false}` ist für ihn gesund')
  }

  // ── Plan ────────────────────────────────────────────────────────────────
  console.log('\nPlan:')
  const sollUrls = new Set(SOLL.map((s) => normUrl(s.url)))
  const ersetzt = new Set()
  for (const s of SOLL) {
    const vorhanden = nachUrl.get(normUrl(s.url))
    const felder = {
      friendly_name: s.name,
      url: s.url,
      type: String(TYPE_KEYWORD),
      keyword_type: String(KEYWORD_TYPE_MISSING),
      keyword_value: s.keyword,
      interval: String(KEYWORD_INTERVAL_S),
      alert_contacts: alertContactsFeld,
    }
    // Ein HTTP-Monitor wird NICHT umgetypt (der Typ ist in v2 kein
    // editMonitor-Feld): daneben entsteht ein Keyword-Monitor, der alte
    // landet unter „nicht im Soll" und geht erst mit --prune.
    if (!vorhanden || vorhanden.type !== TYPE_KEYWORD) {
      console.log(`  + anlegen: ${s.name}${vorhanden ? ` (ersetzt #${vorhanden.id} [${TYPE_NAME[vorhanden.type] ?? vorhanden.type}])` : ''}`)
      await schreibe('newMonitor', felder)
      if (vorhanden) ersetzt.add(vorhanden.id)
      continue
    }
    const passt = vorhanden.keyword_type === KEYWORD_TYPE_MISSING
      && String(vorhanden.keyword_value ?? '') === s.keyword
      && Number(vorhanden.interval) === KEYWORD_INTERVAL_S
      && vorhanden.status !== STATUS_PAUSED
    if (passt) {
      console.log(`  = passt: #${vorhanden.id} ${vorhanden.friendly_name}`)
      continue
    }
    // Umbiegen statt neu: Historie und Monitor-Id bleiben. `status: 1`
    // reaktiviert einen pausierten Monitor (editMonitor: 0 = pausieren,
    // 1 = fortsetzen); `type` wird nicht mitgeschickt.
    const ohneTyp = Object.fromEntries(Object.entries(felder).filter(([k]) => k !== 'type'))
    console.log(`  ~ umbiegen: #${vorhanden.id} ${vorhanden.friendly_name} → Keyword ${JSON.stringify(s.keyword)} fehlt ⇒ Alarm`)
    await schreibe('editMonitor', { id: String(vorhanden.id), status: '1', ...ohneTyp })
  }

  const fremde = monitors.filter((m) => m.type !== TYPE_HEARTBEAT
    && (ersetzt.has(m.id) || !sollUrls.has(normUrl(m.url))))
  for (const m of fremde) {
    console.log(`  ${PRUNE ? '-' : '?'} nicht im Soll: #${m.id} ${m.friendly_name} → ${m.url}${PRUNE ? ' (löschen)' : ' (behalten; --prune löscht)'}`)
    if (PRUNE) await schreibe('deleteMonitor', { id: String(m.id) })
  }

  if (HEARTBEAT) {
    const vorhanden = monitors.find((m) => m.type === TYPE_HEARTBEAT && m.friendly_name === HEARTBEAT_NAME)
    if (vorhanden) {
      console.log(`  = Heartbeat vorhanden: #${vorhanden.id} — Ping-URL laut API: ${vorhanden.url}`)
    } else {
      console.log(`  + Heartbeat anlegen: ${HEARTBEAT_NAME} (erwartet alle ${HEARTBEAT_INTERVAL_S}s)`)
      const json = await schreibe('newMonitor', {
        friendly_name: HEARTBEAT_NAME,
        type: String(TYPE_HEARTBEAT),
        interval: String(HEARTBEAT_INTERVAL_S),
        alert_contacts: alertContactsFeld,
      })
      if (json) {
        console.log('   Ping-URL: im Dashboard beim Monitor ablesen (oder erneut ohne --apply laufen lassen: Feld url) → Secret PRODUCTION_WATCH_HEARTBEAT_URL')
      }
    }
  }

  if (!APPLY) console.log('\nNichts gesendet. Mit --apply ausführen, wenn der Plan stimmt.')
}

main().catch((err) => {
  console.error(`✗ ${err.message}`)
  process.exit(1)
})
