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
 *   - `manage` siegelt für den Kundenbereich, `create` für den Wizard-Host —
 *     Host und Pfad kommen aus der ANTWORT
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
import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const PORT = Number(process.env.PLATFORM_PORT || 3006)
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'
// Lokal MUSS der Platform-Server den Wizard-Host kennen — und zwar auf BEIDEN
// Achsen: NUXT_PUBLIC_TENANCY_CONTROL_HOSTS=app.localhost,start.localhost
// NUXT_PUBLIC_TENANCY_WIZARD_HOSTS=start.localhost. Fehlt der Host in
// controlHosts, ist er ein UNBEKANNTER Host und die Einlösung antwortet 404.
// Der Beweis prüft damit den Fall MIT eigenem Wizard-Host; in Produktion ist
// die Liste seit AH-1 leer und der Ausgang fällt auf den Kontroll-Host zurück
// (`resolveWizardHosts`, unit-getestet in core + onboarding).
const WIZARD_HOST = process.env.WIZARD_HOST || 'start.localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'pool'
const poolKey = process.env.POOL_KEY

if (!endpoint || !controlProject || !databaseId || !controlKey || !poolKey) {
  console.error('✗ Env unvollständig (POOL_KEY nötig).')
  process.exit(1)
}

const control = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const poolUsers = new Users(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
const pool = new TablesDB(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
const poolDatabaseId = process.env.POOL_DATABASE_ID || 'main'

let pass = 0
let fail = 0
const cleanup = { users: [], codes: [], tenants: [], members: [], pages: [] }

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

function call(host, path, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: '::1',
      port: PORT,
      path,
      method,
      headers: {
        host,
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { cookie } : {}),
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) }
        catch { /* HTML */ }
        resolve({
          status: res.statusCode,
          json,
          text,
          location: res.headers.location ?? '',
          setCookie: res.headers['set-cookie'] ?? [],
        })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function issueCode() {
  const code = `PUKA-EXIT-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const row = await control.createRow({
    databaseId, tableId: 'invite_codes', rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex'),
      label: 'Beweis Control-Exit', maxUses: 0, uses: 0, expiresAt: null, status: 'active',
    },
  })
  cleanup.codes.push(row.$id)
  return code
}

try {
  console.log(`\nBeweis Control-Exit gegen http://localhost:${PORT} (Kundenbereich ${CONTROL_HOST}, Wizard ${WIZARD_HOST})\n`)

  // ── Aufbau: Konto + Community, wie ein echter Kunde ───────────────────────
  const code = await issueCode()
  const stamp = Date.now()
  const email = `exit-${stamp}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: 'Exit-Beweis' })
  cleanup.users.push(user.$id)

  const loginRes = await call(CONTROL_HOST, '/api/auth/login', { method: 'POST', body: { email, password } })
  if (loginRes.status !== 200) throw new Error(`Login ${loginRes.status}`)
  const cookie = loginRes.setCookie.find(c => c.startsWith('a_session_'))?.split(';')[0]
  if (!cookie) throw new Error('kein Session-Cookie')

  const createRes = await call(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST', cookie,
    body: {
      name: 'Exit-Beweis', slug: `exit-${stamp.toString(36)}`, purpose: 'new', memberRange: 'to100',
      category: 'other', goal: 'discussion', description: 'Beweislauf Control-Exit.', vibe: 'calm',
      inviteCode: code, locale: 'de',
    },
  })
  if (createRes.status !== 200) throw new Error(`Anlage ${createRes.status}: ${createRes.text.slice(0, 120)}`)
  const site = createRes.json
  cleanup.tenants.push(site.communityId)

  let reachable = false
  for (let i = 0; i < 90; i++) {
    const res = await call(site.host, '/')
    if (res.status === 200) { reachable = true; break }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  if (!reachable) throw new Error('Site wurde nicht erreichbar')
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
  for (const tenantRow of cleanup.tenants) {
    const t = await control.getRow({ databaseId, tableId: 'communities', rowId: tenantRow }).catch(() => null)
    if (!t?.tenantId) continue
    const pages = await pool.listRows({ databaseId: poolDatabaseId, tableId: 'pages', queries: [Query.equal('tenantId', t.tenantId), Query.limit(25)] }).catch(() => null)
    for (const page of pages?.rows ?? []) {
      await pool.deleteRow({ databaseId: poolDatabaseId, tableId: 'pages', rowId: page.$id }).catch(() => {})
      cleanup.pages.push(page.$id)
    }
  }
  if (cleanup.tenants.length) {
    const members = await control.listRows({
      databaseId, tableId: 'community_members',
      queries: [Query.equal('communityId', cleanup.tenants), Query.limit(100)],
    }).catch(() => null)
    cleanup.members.push(...(members?.rows ?? []).map(row => row.$id))
  }
  for (const id of cleanup.members) await control.deleteRow({ databaseId, tableId: 'community_members', rowId: id }).catch(() => {})
  for (const id of cleanup.tenants) await control.deleteRow({ databaseId, tableId: 'communities', rowId: id }).catch(() => {})
  for (const id of cleanup.codes) await control.deleteRow({ databaseId, tableId: 'invite_codes', rowId: id }).catch(() => {})
  for (const id of cleanup.users) await poolUsers.delete({ userId: id }).catch(() => {})
  console.log(`  ✔ aufgeräumt`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
