/**
 * Beweis für den F50-Nachtrag — die zwei Switcher-Ausgänge kommen EINGELOGGT an.
 *
 * „Community anlegen" und „Communities verwalten" waren schlichte Links auf die
 * Kontroll-Hosts; wer klickte, stand drüben vor dem Anmeldeformular. Jetzt
 * siegelt `POST /api/community/control-handoff` die Session (Ziel-Host aus der
 * CONFIG, nie vom Aufrufer), und `GET /api/auth/site-session` löst drüben ein.
 * Geprüft werden beide Seiten der Zusage UND ihre Verweigerungen:
 *   - ohne Session → 401, unbekanntes Ziel → 400
 *   - auf dem KONTROLL-Host → 404 (die Route lebt nur auf Mandanten-Hosts,
 *     und `/api/community/` steht nicht in `controlApiPrefixes`)
 *   - `manage` siegelt für den Kundenbereich, `create` für den Wizard (seit
 *     AH-1 ohne eigenen Host: der Kontroll-Host, Pfad `/start`) — Host und
 *     Pfad kommen aus der ANTWORT
 *   - die Einlösung setzt drüben ein Cookie und leitet auf den Pfad weiter;
 *     mit dem Cookie ist man dort WIRKLICH eingeloggt (/api/auth/me → 200)
 *   - ein Siegel für den Kundenbereich öffnet auf einem MANDANTEN-Host NICHT
 *     (Host-Bindung, Audit 2026-08-02)
 *
 * Voraussetzungen: laufender Platform-Dev-Server (PLATFORM_PORT) samt
 * Control-Plane-Naht, lokale Dev-Appwrite. Räumt am Ende alles weg.
 *
 *   POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/onboarding/scripts/verify-control-exit.mjs
 */
import '../../../scripts/lib/assert-target.mjs'
import {
  appwriteRest,
  createCleanup,
  createHttpCaller,
  createProbeAccount,
  createProbeCommunity,
  login,
  runStamp,
  waitForHost,
} from '../../../scripts/lib/probe-stage.mjs'

const PORT = Number(process.env.PLATFORM_PORT || 3006)
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'
// Wohin „Community anlegen" führt, sagt `resolveWizardHosts`
// (core/shared/controlCenter.ts): ein eigener Wizard-Host, falls einer
// eingetragen ist, sonst der Kontroll-Host. Seit AH-1 ist die Liste in
// Produktion LEER — der Ausgang landet auf `account.` bzw. lokal auf dem
// Kontroll-Host, und `/start` gibt es dort. Genau diesen Fall prüft der
// Beweis standardmäßig. Wer einen eigenen Wizard-Host prüfen will, startet den
// Platform-Server mit NUXT_PUBLIC_TENANCY_WIZARD_HOSTS=<host> (der Host gehört
// dann AUCH in NUXT_PUBLIC_TENANCY_CONTROL_HOSTS, sonst ist er unbekannt und
// die Einlösung antwortet 404) und setzt WIZARD_HOST auf denselben Namen.
const WIZARD_HOST = process.env.WIZARD_HOST || CONTROL_HOST

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'account'
const poolKey = process.env.POOL_KEY

if (!endpoint || !controlProject || !databaseId || !controlKey || !poolKey) {
  console.error('✗ Env unvollständig (POOL_KEY nötig).')
  process.exit(1)
}

const script = 'verify-control-exit'
const control = appwriteRest({ endpoint, projectId: controlProject, key: controlKey, script })
const pool = appwriteRest({ endpoint, projectId: poolProject, key: poolKey, script })
const cleanup = createCleanup({ pool, control, poolDatabaseId: process.env.POOL_DATABASE_ID || 'main', controlDatabaseId: databaseId })
const http = createHttpCaller({ port: PORT })
const stamp = runStamp()

let pass = 0
let fail = 0

function check(label, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`  ✔ ${label}`)
  }
  else {
    fail++
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** HTTP mit Host-Kopfzeile; `location` gleich mit herausgezogen. */
async function call(host, path, options) {
  const res = await http.call(host, path, options)
  return { ...res, location: String(res.headers.location ?? '') }
}

try {
  console.log(`\nBeweis Control-Exit gegen http://localhost:${PORT} (Kundenbereich ${CONTROL_HOST}, Wizard ${WIZARD_HOST})\n`)

  // ── Aufbau: Konto + Community, wie ein echter Kunde ───────────────────────
  // Seit BE-015 verlangt das Anlegen einer Community eine BESTÄTIGTE Adresse.
  const account = await createProbeAccount(pool, { tag: 'exit', stamp, name: 'Exit-Beweis' })
  cleanup.track('account', account.userId)
  const { email } = account
  const cookie = await login(http.call, CONTROL_HOST, account)

  const site = await createProbeCommunity({
    call: http.call, controlHost: CONTROL_HOST, cookie, control, databaseId, cleanup,
    slug: `exit-${stamp}`, name: 'Exit-Beweis',
    bodyOverrides: { category: 'other', description: 'Beweislauf Control-Exit.', vibe: 'calm' },
  })
  if (!await waitForHost(http.call, site.host)) throw new Error('Site wurde nicht erreichbar')
  console.log(`  Community steht: ${site.host}`)

  // ── 1. Die Verweigerungen ─────────────────────────────────────────────────
  console.log('\n1. Verweigerungen')
  const noSession = await call(site.host, '/api/community/control-handoff', { method: 'POST', body: { target: 'manage' } })
  check('ohne Session → 401', noSession.status === 401, `Status ${noSession.status}`)

  const badTarget = await call(site.host, '/api/community/control-handoff', { method: 'POST', cookie, body: { target: 'elsewhere' } })
  check('unbekanntes Ziel → 400', badTarget.status === 400, `Status ${badTarget.status}`)

  const onControl = await call(CONTROL_HOST, '/api/community/control-handoff', { method: 'POST', cookie, body: { target: 'manage' } })
  check('auf dem Kontroll-Host → 404 (Präfix-Tor)', onControl.status === 404, `Status ${onControl.status}`)

  // ── 2. „Communities verwalten" — Siegel + Einlösung im Kundenbereich ──────
  console.log('\n2. „Communities verwalten" (manage)')
  const manage = await call(site.host, '/api/community/control-handoff', { method: 'POST', cookie, body: { target: 'manage' } })
  check('Siegel ausgestellt (200)', manage.status === 200, `Status ${manage.status}: ${manage.text.slice(0, 120)}`)
  check('Host = Kundenbereich aus der Config', manage.json?.host === CONTROL_HOST, `${manage.json?.host}`)
  check('Pfad = /communities', manage.json?.path === '/communities', `${manage.json?.path}`)
  check('Token vorhanden', typeof manage.json?.token === 'string' && manage.json.token.length > 0)

  const redeem = await call(CONTROL_HOST, `/api/auth/site-session?token=${encodeURIComponent(manage.json?.token ?? '')}&to=${encodeURIComponent(manage.json?.path ?? '/')}`)
  const redeemedCookie = redeem.setCookie.find(c => c.startsWith('a_session_'))?.split(';')[0]
  check('Einlösung → 302 auf /communities', redeem.status === 302 && redeem.location === '/communities', `Status ${redeem.status} → ${redeem.location}`)
  check('Einlösung setzt das Session-Cookie', Boolean(redeemedCookie))

  const me = await call(CONTROL_HOST, '/api/auth/me', { cookie: redeemedCookie })
  // /api/auth/me liefert den User DIREKT (kein Umschlag) — s. me.get.ts.
  check('mit dem Cookie WIRKLICH eingeloggt (/api/auth/me → 200)', me.status === 200 && me.json?.email === email, `Status ${me.status}, ${JSON.stringify(me.json)?.slice(0, 80)}`)

  // ── 3. Host-Bindung: ein Kundenbereichs-Siegel öffnet auf dem Mandanten nicht
  console.log('\n3. Host-Bindung (Audit 2026-08-02)')
  const second = await call(site.host, '/api/community/control-handoff', { method: 'POST', cookie, body: { target: 'manage' } })
  const wrongHost = await call(site.host, `/api/auth/site-session?token=${encodeURIComponent(second.json?.token ?? '')}&to=%2F`)
  check('Einlösung auf dem MANDANTEN-Host → 401', wrongHost.status === 401, `Status ${wrongHost.status}`)

  // ── 4. „Community anlegen" — Siegel für den Wizard-Host ───────────────────
  console.log('\n4. „Community anlegen" (create)')
  const create = await call(site.host, '/api/community/control-handoff', { method: 'POST', cookie, body: { target: 'create' } })
  check('Siegel ausgestellt (200)', create.status === 200, `Status ${create.status}: ${create.text.slice(0, 120)}`)
  check('Host = Wizard-Host aus der Config', create.json?.host === WIZARD_HOST, `${create.json?.host}`)
  check('Pfad = /start', create.json?.path === '/start', `${create.json?.path}`)

  const redeemCreate = await call(WIZARD_HOST, `/api/auth/site-session?token=${encodeURIComponent(create.json?.token ?? '')}&to=${encodeURIComponent(create.json?.path ?? '/')}`)
  check('Einlösung auf dem Wizard-Host → 302 auf /start', redeemCreate.status === 302 && redeemCreate.location === '/start', `Status ${redeemCreate.status} → ${redeemCreate.location}`)
  check('setzt auch dort das Session-Cookie', redeemCreate.setCookie.some(c => c.startsWith('a_session_')))

  // ── 5. Härtetests am Siegel selbst ────────────────────────────────────────
  console.log('\n5. Härtetests')
  // Manipulation: ein gekipptes Zeichen muss am GCM-Tag scheitern — dieselbe
  // Antwort wie „falscher Host", damit nichts über die Ursache verrät.
  const raw = create.json?.token ?? ''
  const tampered = raw.slice(0, -2) + (raw.endsWith('AA') ? 'BB' : 'AA')
  const tamperedRes = await call(WIZARD_HOST, `/api/auth/site-session?token=${encodeURIComponent(tampered)}&to=%2F`)
  check('manipuliertes Token → 401', tamperedRes.status === 401, `Status ${tamperedRes.status}`)

  // Open-Redirect: `to` darf nur ein relativer Pfad sein (safeRedirectTarget);
  // `//evil.example` liest ein Browser als schema-relative URL.
  const openRedirect = await call(WIZARD_HOST, `/api/auth/site-session?token=${encodeURIComponent(raw)}&to=${encodeURIComponent('//evil.example')}`)
  check('Weiterleitungsziel //evil.example → 400', openRedirect.status === 400, `Status ${openRedirect.status}`)

  // Replay INNERHALB der 60 s ist BEWUSST akzeptiert (embedHandoff.ts, Kopf):
  // das Secret wird ohnehin gegen Appwrite geprüft, und die Bindung an den
  // einen Host bleibt. Diese Prüfung NAGELT die Entscheidung fest — kippt sie
  // eines Tages auf Einmal-Token, soll dieser Beweis es melden, nicht ein
  // verwirrter Kunde mit zwei Tabs.
  const replay = await call(WIZARD_HOST, `/api/auth/site-session?token=${encodeURIComponent(raw)}&to=%2Fstart`)
  check('Replay binnen 60 s → 302 (dokumentierte Entscheidung)', replay.status === 302, `Status ${replay.status}`)

  // Drossel (Selbst-Review 2026-08-09): der Siegel-Aussteller teilt den Bucket
  // `onboarding:communities` (10/min und IP). Die bisherigen Aufrufe dieses
  // Laufs zählen mit — spätestens nach zwölf weiteren muss ein 429 kommen.
  let throttled = false
  for (let i = 0; i < 12; i++) {
    const res = await call(site.host, '/api/community/control-handoff', { method: 'POST', cookie, body: { target: 'manage' } })
    if (res.status === 429) { throttled = true; break }
  }
  check('Siegel-Aussteller ist gedrosselt (429 im Dauerfeuer)', throttled)
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n6. Aufräumen')
  const { deleted, leftovers } = await cleanup.run()
  const total = Object.values(deleted).reduce((sum, n) => sum + n, 0)
  console.log(`  gelöscht: ${total} Einträge (Konto, Community, Mitglieds-Zeilen, Code, Zeilen der Community)`)
  check('aufgeräumt — nachgezählt, nichts übrig', leftovers.length === 0, leftovers.join(', '))
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
