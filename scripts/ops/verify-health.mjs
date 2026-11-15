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
 * Exit 0 = alle Hosts gesund · Exit 1 = mindestens ein Host kaputt (CI rot).
 */

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
const auswahl = process.argv.slice(2)
const hosts = (auswahl.length ? HOSTS.filter(h => auswahl.includes(h.host)) : HOSTS).slice()
if (DRILL) hosts.push({ host: 'probealarm.invalid', kind: 'app', note: 'PROBEALARM — Host existiert absichtlich nicht' })
/** Beweis-Haken: eine beliebige URL zusätzlich wie einen App-Health prüfen —
 *  so lässt sich der `ok:false`-Pfad gegen einen lokalen Wegwerf-Server
 *  zeigen, ohne die Produktion anzufassen. */
const PROBE_URL = process.env.PUKALANI_HEALTH_PROBE_URL
if (PROBE_URL) hosts.push({ host: PROBE_URL, kind: 'app', schema: process.env.PUKALANI_HEALTH_PROBE_SCHEMA === '1', url: PROBE_URL, note: 'PROBE — nur für Beweise' })
/** Der Host, dessen Antwort der Probealarm für den Datenbank-Stand verfälscht. */
const schemaDrillHost = SCHEMA_DRILL ? hosts.find(h => h.schema)?.host : undefined

if (auswahl.length && !hosts.length) {
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
async function pruefe({ host, kind, url: fest, schema: mitSchema }) {
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
    const grund = json?.reason || json?.code
    return { ok: false, grund: `ok:${JSON.stringify(json?.ok)}${grund ? ` (${grund})` : ''}` }
  }
  const build = `build ${String(json.build || '—').slice(0, 8)}`
  if (!mitSchema) return { ok: true, info: build }
  let schema = json.schema
  if (host === schemaDrillHost) {
    const expected = Number.isInteger(schema?.expected) ? schema.expected : 1
    schema = { state: 'behind', expected, found: Math.max(0, expected - 1) }
  }
  const stand = pruefeSchema(schema)
  if (!stand.ok) return { ok: false, grund: `${stand.grund}${host === schemaDrillHost ? ' [PROBEALARM — vorgetäuscht]' : ''}`, schema: true }
  return { ok: true, info: `${build} · ${stand.info}` }
}

const failures = []
console.log(`Erreichbarkeits-Wächter — ${hosts.length} Hosts${DRILL ? ' (PROBEALARM)' : ''}${SCHEMA_DRILL ? ' (PROBEALARM DATENBANK-STAND)' : ''}\n`)
let schemaFailures = 0

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
console.log('\n✔ Alle Hosts antworten gesund.')
