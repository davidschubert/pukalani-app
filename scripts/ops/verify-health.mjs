#!/usr/bin/env node
/**
 * Erreichbarkeits-Wächter: fragt JEDEN Produktions-Host nach seinem
 * `/api/health` und wird rot, sobald einer nicht `ok:true` antwortet.
 *
 *   node scripts/ops/verify-health.mjs                 # alle Hosts
 *   node scripts/ops/verify-health.mjs pukalani.studio # ein Host
 *   PUKALANI_HEALTH_DRILL=1 node scripts/ops/verify-health.mjs   # Probealarm
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
 * Exit 0 = alle Hosts gesund · Exit 1 = mindestens ein Host kaputt (CI rot).
 */

/**
 * Produktions-Hosts mit Health-Endpunkt. Pool-Kunden sind durch `demo`
 * vertreten (Stellvertreter wie im TLS-Wächter); Altnamen mit 301 gehören
 * NICHT hierher — sie haben keinen eigenen Health.
 *
 * `kind: 'app'`     → unser `/api/health`, Antwort `{ ok: true, build }`
 * `kind: 'appwrite'`→ Appwrites `/v1/health/version`, Antwort `{ version }`
 *   (BEWUSST nicht `doctor`: der schickt eine Test-Mail über SMTP, s. Memory)
 */
const HOSTS = [
  { host: 'api.pukalani.app', kind: 'appwrite', note: 'Appwrite-Prod — fällt sie, fallen ALLE Apps mit (Vorfall 2026-10-16)' },
  { host: 'platform.pukalani.app', kind: 'app', note: 'Pool-App' },
  { host: 'account.pukalani.app', kind: 'app', note: 'Kundenbereich (Pool-App, zweiter Host)' },
  { host: 'demo.pukalani.app', kind: 'app', note: 'Pool-Tenant (Stellvertreter für ALLE Kunden)' },
  { host: 'admin.pukalani.app', kind: 'app', note: 'Betreiber-Konsole' },
  { host: 'pukalani.studio', kind: 'app', note: 'Silo portfolio — Kundendomain' },
  { host: 'portfolio.pukalani.app', kind: 'app', note: 'Silo portfolio — Plattform-Host' },
  { host: 'branding.supply', kind: 'app', note: 'Silo branding — Brand-Wizard' },
  { host: 'pukalani.app', kind: 'app', note: 'Landing (eigener Health ohne Appwrite)' },
  { host: 'help.pukalani.app', kind: 'app', note: 'Hilfe-Site (eigener Health ohne Appwrite)' },
]

/** Zweiter Versuch nach dieser Pause — gegen Schluckauf, nicht gegen Ausfall. */
const RETRY_DELAY_MS = 15_000
const TIMEOUT_MS = 20_000

const DRILL = process.env.PUKALANI_HEALTH_DRILL === '1'
const auswahl = process.argv.slice(2)
const hosts = (auswahl.length ? HOSTS.filter(h => auswahl.includes(h.host)) : HOSTS).slice()
if (DRILL) hosts.push({ host: 'probealarm.invalid', kind: 'app', note: 'PROBEALARM — Host existiert absichtlich nicht' })
/** Beweis-Haken: eine beliebige URL zusätzlich wie einen App-Health prüfen —
 *  so lässt sich der `ok:false`-Pfad gegen einen lokalen Wegwerf-Server
 *  zeigen, ohne die Produktion anzufassen. */
const PROBE_URL = process.env.PUKALANI_HEALTH_PROBE_URL
if (PROBE_URL) hosts.push({ host: PROBE_URL, kind: 'app', url: PROBE_URL, note: 'PROBE — nur für Beweise' })

if (auswahl.length && !hosts.length) {
  console.error(`Unbekannte(r) Host(s): ${auswahl.join(', ')} — bekannt sind ${HOSTS.map(h => h.host).join(', ')}`)
  process.exit(2)
}

function pfad(kind) {
  return kind === 'appwrite' ? '/v1/health/version' : '/api/health'
}

/** Ein Versuch. Gibt `{ ok: true, info }` oder `{ ok: false, grund }` zurück. */
async function pruefe({ host, kind, url: fest }) {
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
  if (json?.ok !== true) return { ok: false, grund: `ok:${JSON.stringify(json?.ok)}${json?.code ? ` (${json.code})` : ''}` }
  return { ok: true, info: `build ${String(json.build || '—').slice(0, 8)}` }
}

const failures = []
console.log(`Erreichbarkeits-Wächter — ${hosts.length} Hosts${DRILL ? ' (PROBEALARM)' : ''}\n`)

for (const eintrag of hosts) {
  let ergebnis = await pruefe(eintrag)
  if (!ergebnis.ok) {
    console.log(`… ${eintrag.host.padEnd(24)} ${ergebnis.grund} — zweiter Versuch in ${RETRY_DELAY_MS / 1000} s`)
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
    ergebnis = await pruefe(eintrag)
  }
  if (!ergebnis.ok) {
    failures.push(`${eintrag.host}: ${ergebnis.grund}`)
    console.log(`✗ ${eintrag.host.padEnd(24)} ${ergebnis.grund}`)
    continue
  }
  console.log(`✔ ${eintrag.host.padEnd(24)} ${ergebnis.info.padEnd(16)} — ${eintrag.note}`)
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} Host(s) kaputt:`)
  for (const f of failures) console.error(`  · ${f}`)
  console.error('\nWenn ALLE Apps gleichzeitig ok:false melden, liegt es fast immer an Appwrite')
  console.error('(api.pukalani.app): Zertifikat abgelaufen oder Instanz steht. Zuerst')
  console.error('`node scripts/ops/verify-tls.mjs api.pukalani.app` und')
  console.error('`curl https://api.pukalani.app/v1/health/version`; Reparatur-Wege im Runbook')
  console.error('docs/runbooks/PRODUKTIONS-ALARM.md (Abschnitt „Wenn ein Alarm kommt").')
  process.exit(1)
}
console.log('\n✔ Alle Hosts antworten gesund.')
