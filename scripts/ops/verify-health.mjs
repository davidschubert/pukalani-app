#!/usr/bin/env node
/**
 * Erreichbarkeits-Wächter: fragt JEDEN Produktions-Host nach seinem
 * `/api/health` und wird rot, sobald einer nicht `ok:true` antwortet.
 *
 *   node scripts/ops/verify-health.mjs                 # alle Hosts
 *   node scripts/ops/verify-health.mjs pukalani.studio # ein Host
 *   PUKALANI_HEALTH_DRILL=1 node scripts/ops/verify-health.mjs   # Probealarm
 *   PUKALANI_SCHEMA_DRILL=1 node scripts/ops/verify-health.mjs   # Probealarm Datenbank-Stand
 *
 * WARUM ES DAS GIBT (Vorfall 2026-10-16 bis 2026-10-24): das Zertifikat von
 * `api.pukalani.app` lief ab, node-appwrite in jeder App lehnte es ab, und
 * ACHT TAGE lang antworteten portfolio, platform, admin und branding auf
 * `/api/health` mit `{"ok":false}` — ohne dass ein Alarm ankam. Entdeckt
 * wurde es zufällig, weil ein `curl` beim Abschluss eines ANDEREN Vorfalls
 * stolperte. UptimeRobot prüft nur den Statuscode des Hosts, nicht die
 * Aussage dahinter; der Deploy-Workflow prüft Health nur beim Deploy.
 *
 * Dieser Wächter prüft, was die App WIRKLICH sagt — alle 30 Minuten aus der
 * CI, zusammen mit dem TLS-Blick (`.github/workflows/production-watch.yml`).
 * Rot wird er bei: Host nicht erreichbar, Statuscode ≠ 200, Antwort kein
 * JSON, `ok` ≠ true, oder (Appwrite) keine Versionsangabe.
 *
 * DATENBANK-STAND (OPS-008, seit 2026-11-16): jede App mit Appwrite meldet
 * in `/api/health` neben `ok` ein Feld `schema` — passt die Datenbank zum
 * ausgerollten Programm? (`state: ok | behind | unknown`, dazu zwei Zahlen;
 * die App prüft je Layer eine Probe am wirklichen Schema.) Zweimal ging neues
 * Programm live, bevor seine Migration gelaufen war, und nichts wurde rot.
 * Dieser Wächter wird rot bei `behind` (eine Migration fehlt), bei `unknown`
 * nach dem zweiten Versuch (die App kann es nicht prüfen — eine Sicherung,
 * die nicht prüfen kann, meldet sich) und wenn das Feld ganz fehlt. `ok` der
 * App bleibt davon unberührt: die Seite läuft, nur ein Teil kann kaputt sein.
 * WELCHE Migration fehlt, steht nicht in der öffentlichen Antwort, sondern im
 * Log der App (`schema.behind`) und im täglichen Lauf von
 * `verify-schema-parity.mjs`. Was dann zu tun ist:
 * docs/runbooks/PRODUKTIONS-ALARM.md, „Datenbank passt nicht zum Programm".
 *
 * VORIGER SCHLÜSSEL DER KARTE (PK1 E1c): meldet eine App
 * `siteCard.previous: true`, liegt neben dem Schlüssel der Eintrittskarte noch
 * ein VORIGER zum Lesen (`NUXT_SITE_CARD_PREVIOUS_KEY`). Das ist während eines
 * Tauschs richtig und danach ein vergessener Rest — der Wächter WARNT (eine
 * Zeile, in der CI eine Anmerkung am Lauf), rot wird davon nichts. Was zu tun
 * ist: docs/runbooks/PK1-EINSCHALTEN.md, „Schlüssel tauschen".
 *
 * EIN AUSSETZER IST KEIN BEFUND: jeder Host bekommt nach einem Fehlschlag
 * genau EINEN zweiten Versuch nach kurzer Pause. Ein Wächter, der bei jedem
 * Netz-Schluckauf schreit, wird nach der dritten Fehlmeldung ignoriert — und
 * genau das ist der Zustand, der acht Tage `ok:false` möglich gemacht hat.
 *
 * PROBEALARM (`PUKALANI_HEALTH_DRILL=1`): hängt einen Host an, den es nicht
 * gibt, und wird damit SICHER rot. Der Sinn ist nicht dieser Wächter, sondern
 * die Kette dahinter (Issue, Mail, Heartbeat): ein Alarmweg, der nie geprobt
 * wurde, ist keiner — der TLS-Wächter war vom 2026-10-05 bis 2026-10-24 rund
 * 900 Läufe lang rot, und niemand hat es gesehen.
 *
 * PROBEALARM DATENBANK-STAND (`PUKALANI_SCHEMA_DRILL=1`): tut so, als hätte
 * der erste Host mit Datenbank-Stand `behind` gemeldet. An Production fehlt
 * dabei nichts — vorgetäuscht wird nur die gelesene Antwort, der Weg danach
 * (Auswertung, roter Lauf, Issue, Mail) ist der echte.
 *
 * KUNDENDOMAINS AUS DEM CONTROL PLANE (WA1 d, 2026-11-18): mit dem Geheimnis
 * `PUKALANI_WATCH_HOSTS_SECRET` fragt der Wächter ZUSÄTZLICH zur festen Liste
 * die live geschalteten Kundendomains, die selbst antworten (`health: true`
 * in der Antwort der Route; Regeln in `customer-hosts.mjs`). Ohne Geheimnis
 * oder ohne Antwort der Route bleibt es bei der festen Liste und einer Zeile
 * dazu — rot wird davon nichts. Eine Kundendomain heißt in der Ausgabe
 * „Kundendomain 3/5", nie beim Namen (das Protokoll der Läufe ist öffentlich).
 *
 *   node scripts/ops/verify-health.mjs --nur-kundendomains   # nur die aus dem Control Plane (Job `kundendomains`)
 *   node scripts/ops/verify-health.mjs --namen               # von Hand: Kundendomains beim Namen
 *
 * `PUKALANI_CUSTOMER_HOSTS_MODE`: `count` (Vorgabe — ein Befund an einer
 * Kundendomain ist eine Zeile „Nur gezählt") oder `alarm` (Befund = rot).
 *
 * Exit 0 = alle Hosts gesund · Exit 1 = mindestens ein Host kaputt (CI rot).
 */
import { appendFileSync } from 'node:fs'
import {
  customerLabel,
  customerMode,
  customerStatusLine,
  DRILL_ENV,
  namesAllowed,
  numbersText,
  planCustomerChecks,
  readCustomerHosts,
  safeErrorCode,
} from './customer-hosts.mjs'

/**
 * Produktions-Hosts mit Health-Endpunkt. Pool-Kunden sind durch `demo`
 * vertreten (Stellvertreter wie im TLS-Wächter); Altnamen mit 301 gehören
 * NICHT hierher — sie haben keinen eigenen Health.
 *
 * `kind: 'app'`     → unser `/api/health`, Antwort `{ ok: true, build }`
 * `schema: true`    → die App hat eine Appwrite-Instanz und meldet zusätzlich
 *   `schema` (Datenbank-Stand). Landing und Hilfe haben einen eigenen Health
 *   ohne Appwrite und deshalb kein Feld.
 * `kind: 'appwrite'`→ Appwrites `/v1/health/version`, Antwort `{ version }`
 *   (BEWUSST nicht `doctor`: der schickt eine Test-Mail über SMTP, s. Memory)
 */
const HOSTS = [
  { host: 'api.pukalani.app', kind: 'appwrite', note: 'Appwrite-Prod — fällt sie, fallen ALLE Apps mit (Vorfall 2026-10-16)' },
  { host: 'platform.pukalani.app', kind: 'app', schema: true, note: 'Pool-App' },
  { host: 'account.pukalani.app', kind: 'app', schema: true, note: 'Kundenbereich (Pool-App, zweiter Host)' },
  { host: 'demo.pukalani.app', kind: 'app', schema: true, note: 'Pool-Tenant (Stellvertreter für ALLE Kunden)' },
  { host: 'admin.pukalani.app', kind: 'app', schema: true, note: 'Betreiber-Konsole' },
  { host: 'pukalani.studio', kind: 'app', schema: true, note: 'Silo portfolio — Kundendomain' },
  { host: 'portfolio.pukalani.app', kind: 'app', schema: true, note: 'Silo portfolio — Plattform-Host' },
  { host: 'branding.supply', kind: 'app', schema: true, note: 'Silo branding — Brand-Wizard' },
  { host: 'pukalani.app', kind: 'app', note: 'Landing (eigener Health ohne Appwrite)' },
  { host: 'help.pukalani.app', kind: 'app', note: 'Hilfe-Site (eigener Health ohne Appwrite)' },
]

/** Zweiter Versuch nach dieser Pause — gegen Schluckauf, nicht gegen Ausfall. */
const RETRY_DELAY_MS = 15_000
const TIMEOUT_MS = 20_000

const DRILL = process.env.PUKALANI_HEALTH_DRILL === '1'
const SCHEMA_DRILL = process.env.PUKALANI_SCHEMA_DRILL === '1'
const ONLY_CUSTOMER = process.argv.includes('--nur-kundendomains')
const auswahl = process.argv.slice(2).filter(arg => !arg.startsWith('--'))
const hosts = ONLY_CUSTOMER ? [] : (auswahl.length ? HOSTS.filter(h => auswahl.includes(h.host)) : HOSTS).slice()
if (DRILL) hosts.push({ host: 'probealarm.invalid', kind: 'app', note: 'PROBEALARM — Host existiert absichtlich nicht' })
/** Beweis-Haken: eine beliebige URL zusätzlich wie einen App-Health prüfen —
 *  so lässt sich der `ok:false`-Pfad gegen einen lokalen Wegwerf-Server
 *  zeigen, ohne die Produktion anzufassen. */
const PROBE_URL = process.env.PUKALANI_HEALTH_PROBE_URL
if (PROBE_URL) hosts.push({ host: PROBE_URL, kind: 'app', schema: process.env.PUKALANI_HEALTH_PROBE_SCHEMA === '1', url: PROBE_URL, note: 'PROBE — nur für Beweise' })
/** Der Host, dessen Antwort der Probealarm für den Datenbank-Stand verfälscht. */
const schemaDrillHost = SCHEMA_DRILL ? hosts.find(h => h.schema)?.host : undefined

if (auswahl.length && !hosts.length && !ONLY_CUSTOMER) {
  console.error(`Unbekannte(r) Host(s): ${auswahl.join(', ')} — bekannt sind ${HOSTS.map(h => h.host).join(', ')}`)
  process.exit(2)
}

function pfad(kind) {
  return kind === 'appwrite' ? '/v1/health/version' : '/api/health'
}

/**
 * Datenbank-Stand aus der Antwort einer App. Öffentlich sind dort nur ein
 * Zustandswort und zwei Zahlen — alles andere wird hier NICHT ausgegeben (das
 * Protokoll dieses Laufs ist öffentlich).
 */
function pruefeSchema(schema) {
  const zahl = wert => (Number.isInteger(wert) && wert >= 0 && wert < 1000 ? wert : '?')
  if (!schema || typeof schema !== 'object' || !['ok', 'behind', 'unknown'].includes(schema.state)) {
    return { ok: false, grund: 'meldet keinen Datenbank-Stand (Feld `schema` fehlt) — trägt der Host den Stand mit der Prüfung?' }
  }
  if (schema.state === 'behind') {
    return { ok: false, grund: `Datenbank passt nicht zum Programm (schema: behind, ${zahl(schema.found)} von ${zahl(schema.expected)} Proben) — eine Migration fehlt` }
  }
  if (schema.state === 'unknown') {
    return { ok: false, grund: 'Datenbank-Stand unbekannt (schema: unknown) — die App konnte ihn nicht prüfen' }
  }
  return { ok: true, info: `Datenbank ${zahl(schema.found)}/${zahl(schema.expected)}` }
}

/** Ein Versuch. Gibt `{ ok: true, info }` oder `{ ok: false, grund }` zurück. */
async function pruefe({ host, kind, url: fest, schema: mitSchema, kunde }) {
  const url = fest ?? `https://${host}${pfad(kind)}`
  let antwort
  try {
    antwort = await fetch(url, {
      redirect: 'manual',
      headers: { 'user-agent': 'pukalani-production-watch/1 (verify-health)' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  }
  catch (fehler) {
    // Bei einer Kundendomain nur das Kürzel: der Wortlaut kann den Namen nennen.
    if (kunde) return { ok: false, grund: `nicht erreichbar (${safeErrorCode(fehler)})` }
    return { ok: false, grund: `nicht erreichbar (${fehler?.cause?.code || fehler?.name || fehler?.message || 'unbekannt'})` }
  }
  if (antwort.status !== 200) return { ok: false, grund: `HTTP ${antwort.status}` }
  let json
  try { json = await antwort.json() }
  catch { return { ok: false, grund: 'Antwort ist kein JSON' } }
  if (kind === 'appwrite') {
    if (typeof json?.version !== 'string' || !json.version) return { ok: false, grund: 'keine Versionsangabe' }
    return { ok: true, info: `Appwrite ${json.version}` }
  }
  // `reason` = benannter Grund der App selbst (seit SEC-025:
  // `tenant_resolver_missing` — Trennung an, aber kein Resolver; die App lehnt
  // dann alles außer /api/health mit 503 ab). `code` stammt aus dem
  // Fehler-Envelope, falls die Route selbst geworfen hat.
  if (json?.ok !== true) {
    const roh = json?.reason || json?.code
    // Der Grund kommt aus der Antwort — bei einer Kundendomain nur, wenn er wie
    // eines unserer Grund-Wörter aussieht (`tenant_resolver_missing`).
    const grund = kunde && !(typeof roh === 'string' && /^[a-z0-9_]{1,60}$/.test(roh)) ? '' : roh
    return { ok: false, grund: `ok:${kunde ? (json?.ok === false ? 'false' : 'fehlt') : JSON.stringify(json?.ok)}${grund ? ` (${grund})` : ''}` }
  }
  const build = `build ${String(json.build || '—').slice(0, 8)}`
  // Nur ein Hinweis, nie rot (s. Kopf, „Voriger Schlüssel der Karte").
  const warnung = json?.siteCard?.previous === true
    ? 'voriger Schlüssel der Eintrittskarte gesetzt (NUXT_SITE_CARD_PREVIOUS_KEY) — nach dem Tausch entfernen, Runbook docs/runbooks/PK1-EINSCHALTEN.md'
    : ''
  if (!mitSchema) return { ok: true, info: build, warnung }
  let schema = json.schema
  if (host === schemaDrillHost) {
    const expected = Number.isInteger(schema?.expected) ? schema.expected : 1
    schema = { state: 'behind', expected, found: Math.max(0, expected - 1) }
  }
  const stand = pruefeSchema(schema)
  if (!stand.ok) return { ok: false, grund: `${stand.grund}${host === schemaDrillHost ? ' [PROBEALARM — vorgetäuscht]' : ''}`, schema: true }
  return { ok: true, info: `${build} · ${stand.info}`, warnung }
}

// ── Kundendomains (s. Kopf) ────────────────────────────────────────────────
const NAMES = namesAllowed()
const MODE = customerMode()
// Nur im vollen Lauf oder mit `--nur-kundendomains`, nicht bei einer Auswahl.
const customer = auswahl.length ? null : await readCustomerHosts()
const planned = customer?.state === 'read'
  ? planCustomerChecks({ hosts: customer.hosts, fixedHosts: HOSTS.map(h => h.host), mode: MODE, drill: process.env[DRILL_ENV] === '1' })
    // Die Geschwister-Form leitet nur um (kein eigener Health) — für sie gilt der TLS-Blick.
    .filter(entry => entry.health)
  : []

const failures = []
console.log(ONLY_CUSTOMER && !hosts.length ? 'Erreichbarkeits-Wächter — nur Kundendomains' : `Erreichbarkeits-Wächter — ${hosts.length} Hosts${DRILL ? ' (PROBEALARM)' : ''}${SCHEMA_DRILL ? ' (PROBEALARM DATENBANK-STAND)' : ''}\n`)
let schemaFailures = 0
/** Hinweise ohne Rot (voriger Schlüssel der Karte). */
const warnungen = []

for (const eintrag of hosts) {
  let ergebnis = await pruefe(eintrag)
  if (!ergebnis.ok) {
    console.log(`… ${eintrag.host.padEnd(24)} ${ergebnis.grund} — zweiter Versuch in ${RETRY_DELAY_MS / 1000} s`)
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
    ergebnis = await pruefe(eintrag)
  }
  if (!ergebnis.ok) {
    if (ergebnis.schema) schemaFailures++
    failures.push(`${eintrag.host}: ${ergebnis.grund}`)
    console.log(`✗ ${eintrag.host.padEnd(24)} ${ergebnis.grund}`)
    continue
  }
  console.log(`✔ ${eintrag.host.padEnd(24)} ${ergebnis.info.padEnd(33)} — ${eintrag.note}`)
  if (ergebnis.warnung) warnungen.push(`${eintrag.host}: ${ergebnis.warnung}`)
}

if (customer) console.log(`\n${customerStatusLine(customer, planned, MODE)}${customer.state === 'read' ? ' (Erreichbarkeit: nur die Hosts, die selbst antworten.)' : ''}`)
const counted = []
const customerRed = []
for (const entry of planned) {
  const label = customerLabel(entry, { names: NAMES })
  // `ziel` trägt den Namen und geht NUR an `pruefe` — nie in eine Ausgabe
  // (Wächter-Test in packages/core/tests/customerHosts.test.ts).
  const ziel = { host: entry.host, kind: 'app', schema: true, kunde: true }
  let ergebnis = entry.drill ? { ok: false, grund: 'ok:false [PROBEALARM — vorgetäuscht]' } : await pruefe(ziel)
  if (!ergebnis.ok && !entry.drill) {
    console.log(`… ${label.padEnd(24)} ${ergebnis.grund} — zweiter Versuch in ${RETRY_DELAY_MS / 1000} s`)
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
    ergebnis = await pruefe(ziel)
  }
  if (ergebnis.ok) {
    console.log(`✔ ${label.padEnd(24)} ${ergebnis.info}`)
    continue
  }
  if (MODE === 'alarm' || entry.drill) {
    customerRed.push(entry)
    if (ergebnis.schema) schemaFailures++
    failures.push(`${label}: ${ergebnis.grund}`)
    console.log(`✗ ${label.padEnd(24)} ${ergebnis.grund}`)
  }
  else {
    counted.push(entry)
    console.log(`· ${label.padEnd(24)} Nur gezählt: ${ergebnis.grund}`)
  }
}
// Hinweise kommen VOR dem Ergebnis und färben nichts (Kundendomains tragen
// hier keinen Namen: die Liste enthält nur feste Hosts).
for (const w of warnungen) {
  console.log(`⚠ ${w}`)
  if (process.env.GITHUB_ACTIONS === 'true') console.log(`::warning title=Eintrittskarte::${w}`)
}
if (counted.length) console.log(`\nNur gezählt: ${counted.length} Kundendomain(s) mit Befund an der Erreichbarkeit (Modus count — rot wird davon nichts).`)

// Für den Job `alarm`: je rotem Befund an einer Kundendomain ein Satz fürs
// Issue (nur die Nummer) und die Nummern für die private Mail mit den Namen.
if (customerRed.length) {
  if (process.env.PUKALANI_FINDINGS_FILE) {
    for (const entry of customerRed) {
      appendFileSync(process.env.PUKALANI_FINDINGS_FILE, `${customerLabel(entry)}: antwortet nicht gesund. Tun: den Namen aus der Mail „Betroffene Kundendomains" nehmen (oder am eigenen Rechner \`node scripts/ops/verify-health.mjs --nur-kundendomains --namen\`), dann docs/runbooks/PRODUKTIONS-ALARM.md, „Kundendomain rot".\n`)
    }
  }
  if (process.env.PUKALANI_CUSTOMER_NUMBERS_FILE) appendFileSync(process.env.PUKALANI_CUSTOMER_NUMBERS_FILE, `${numbersText(customerRed)}\n`)
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} Host(s) kaputt:`)
  for (const f of failures) console.error(`  · ${f}`)
  if (failures.length > schemaFailures) console.error('\nWenn ALLE Apps gleichzeitig ok:false melden, liegt es fast immer an Appwrite')
  if (failures.length > schemaFailures) console.error('(api.pukalani.app): Zertifikat abgelaufen oder Instanz steht. Zuerst')
  if (failures.length > schemaFailures) console.error('`node scripts/ops/verify-tls.mjs api.pukalani.app` und')
  if (failures.length > schemaFailures) console.error('`curl https://api.pukalani.app/v1/health/version`; Reparatur-Wege im Runbook')
  if (failures.length > schemaFailures) console.error('docs/runbooks/PRODUKTIONS-ALARM.md (Abschnitt „Wenn ein Alarm kommt").')
  if (schemaFailures > 0) {
    console.error('\nDATENBANK-STAND: die Seite antwortet, aber ihre Datenbank passt nicht zum')
    console.error('ausgerollten Programm (oder die App kann es nicht prüfen). Meist ist neues')
    console.error('Programm live gegangen, bevor seine Migration gelaufen ist. Welche fehlt:')
    console.error('`pnpm ops:schema-parity` am Mac. Nachholen (nach Davids Ja):')
    console.error('  pnpm migrate --app <app> --env ~/.appwrite-secrets/migrations/<projekt>.env --only <layer>-<NNN> --prod')
    console.error('Runbook: docs/runbooks/PRODUKTIONS-ALARM.md, „Datenbank passt nicht zum Programm".')
  }
  process.exit(1)
}
console.log(hosts.length ? '\n✔ Alle Hosts antworten gesund.' : '\n✔ Kein roter Befund an einer Kundendomain.')
