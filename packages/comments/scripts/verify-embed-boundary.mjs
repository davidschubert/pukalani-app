/**
 * Beweis für F37 — DAS WIDGET IM POOL: Berechtigung + Mandantengrenze.
 *
 * Das Embed-Produkt war bis heute nur im Silo angeschaltet. Beim Freischalten
 * im Pool stehen drei Behauptungen im Raum, und dieses Skript prüft sie am
 * LAUFENDEN Server, nicht auf dem Papier:
 *
 *  1. WER DARF (Abschnitt 3+4): das Einbetter-Register verlangte
 *     `system.manage` — ein INSTANZ-Label, das kein Kunde je trägt. Jetzt ist
 *     es `community.embed`, und das trägt nur der OWNER. Admin, Moderator,
 *     Editor, Viewer, Fremder und Gast bleiben draußen.
 *  2. MANDANTENGRENZE (Abschnitt 5): ein Owner sieht, ändert und löscht NUR
 *     die Einbetter SEINER Community — auch dann, wenn er die fremde Row-Id
 *     kennt. Die Grenze zieht die Datentür (`tenantDb`), nicht die Route.
 *  3. DIE CSP FOLGT (Abschnitt 6): der freigegebene Host steht in
 *     `frame-ancestors` von /embed — und der Host der ANDEREN Community
 *     steht dort nicht. Das ist die harte Grenze des Widgets.
 *
 * Dazu Abschnitt 7: die Herkunftsprüfung gilt im Pool (heute in jeder App). Unter der
 * Wildcard ist jeder Mandanten-Host `same-site` zum anderen — der Beweis, dass
 * die F32-Härtung das abweist und den (same-origin) Embed-Fluss nicht bricht,
 * wird hier für den POOL neu geführt statt aus dem Silo übernommen.
 *
 * Räumt am Ende alles weg, was es angelegt hat.
 *
 *   POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/comments/scripts/verify-embed-boundary.mjs
 */
import '../../../scripts/lib/assert-target.mjs'
import { request } from 'node:http'
import {
  addStageMember,
  appwriteRest,
  createCleanup,
  createProbeAccount,
  createProbeCommunity,
  login as loginOn,
  runStamp,
  waitForHost as waitForHostOn,
} from '../../../scripts/lib/probe-stage.mjs'

const PORT = Number(process.env.PLATFORM_PORT || 3006)
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'

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

const script = 'verify-embed-boundary'
const control = appwriteRest({ endpoint, projectId: controlProject, key: controlKey, script })
const pool = appwriteRest({ endpoint, projectId: poolProject, key: poolKey, script })
const cleanup = createCleanup({ pool, control, poolDatabaseId: process.env.POOL_DATABASE_ID || 'main', controlDatabaseId: databaseId })
const runId = runStamp()
/** Einbetter, die über die Route angelegt wurden — zuerst über die Route wieder weg. */
let embedSites = []

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

/**
 * node:http, weil `fetch` einen eigenen Host-Header verwirft; ::1, weil Nitro
 * dort hört. `origin`/`secFetchSite` sind für Abschnitt 7 — ohne sie sieht der
 * Server einen kopflosen Request (kein Browser), und genau der darf passieren.
 */
function call(host, path, { method = 'GET', body, cookie, origin, secFetchSite } = {}) {
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
        ...(origin ? { origin } : {}),
        ...(secFetchSite ? { 'sec-fetch-site': secFetchSite } : {}),
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) }
        catch { /* HTML-Seite */ }
        resolve({ status: res.statusCode, json, text, headers: res.headers, setCookie: res.headers['set-cookie'] ?? [] })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/** Probe-Konto. Seit BE-015 verlangt das Anlegen einer Community eine BESTÄTIGTE Adresse. */
async function createPoolUser(tag) {
  const account = await createProbeAccount(pool, { tag: `f37-${tag}`, stamp: runId, name: `F37 ${tag}` })
  cleanup.track('account', account.userId)
  return account
}

function login(account) {
  return loginOn(call, CONTROL_HOST, account)
}


/** Der Host-Resolver cacht negativ (30 s) — nach der Anlage kurz nachfassen. */
function waitForHost(host) {
  return waitForHostOn(call, host)
}

async function createCommunity(cookie, tag) {
  // Anlage über die echte Route `POST /api/onboarding/site` — Rumpf, Code und
  // Aufräumen kommen aus der gemeinsamen Hilfe (scripts/lib/probe-stage.mjs).
  const created = await createProbeCommunity({
    call, controlHost: CONTROL_HOST, cookie, control, databaseId, cleanup,
    slug: `f37-${tag}-${runId}`, name: `F37 ${tag}`,
    bodyOverrides: { description: 'Wir prüfen, ob Einbetter an ihrer Community kleben.', vibe: 'elegant' },
  })
  return { communityId: created.communityId, host: created.host }
}

try {
  console.log(`\nF37-Beweis gegen http://localhost:${PORT} (Pool ${poolProject})\n`)

  console.log('1. Zwei Communities mit je eigenem Owner')
  const ownerA = await createPoolUser('owner-a')
  const ownerB = await createPoolUser('owner-b')
  const stranger = await createPoolUser('stranger')
  const cookieA = await login(ownerA)
  const cookieB = await login(ownerB)
  const cookieStranger = await login(stranger)

  const a = await createCommunity(cookieA, 'a')
  const b = await createCommunity(cookieB, 'b')
  check('Community A angelegt', !!a.communityId, a.host)
  check('Community B angelegt', !!b.communityId, b.host)
  check('Host A antwortet', await waitForHost(a.host))
  check('Host B antwortet', await waitForHost(b.host))

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n2. Das Produkt ist im Pool überhaupt an (der Schalter, der fehlte)')
  const embedPage = await call(a.host, '/embed?targetId=f37&targetType=verify')
  check('/embed antwortet (kein 404 mehr — pukalani.comments.embed.enabled)',
    embedPage.status === 200, `Status ${embedPage.status}`)
  const loader = await call(a.host, '/embed.js')
  check('der Loader /embed.js wird ausgeliefert', loader.status === 200, `Status ${loader.status}`)

  // ──────────────────────────────────────────────────────────────────────────
  // 3. WER DARF — die eigentliche Blockade. `system.manage` ist ein
  //    INSTANZ-Label; ein Kunden-Owner trägt es nie. Vor F37 war die Seite im
  //    Pool damit für JEDEN Kunden zu, obwohl sie in seinem Dashboard stand.
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n3. Berechtigung: community.embed statt system.manage')
  const ownerList = await call(a.host, '/api/admin/embed-sites', { cookie: cookieA })
  check('Owner darf sein Einbetter-Register sehen → 200 (VORHER 403)',
    ownerList.status === 200, `Status ${ownerList.status} ${ownerList.text.slice(0, 160)}`)
  check('…und es ist zunächst leer', ownerList.json?.total === 0, JSON.stringify(ownerList.json))

  const guestList = await call(a.host, '/api/admin/embed-sites')
  check('Gast ohne Session → 401', guestList.status === 401, `Status ${guestList.status}`)
  const strangerList = await call(a.host, '/api/admin/embed-sites', { cookie: cookieStranger })
  check('Fremder (eingeloggt, kein Mitglied) → 403', strangerList.status === 403, `Status ${strangerList.status}`)

  // ──────────────────────────────────────────────────────────────────────────
  // 4. …und NUR der Owner. Eine freigegebene Domain bekommt frame-ancestors UND
  //    (mit auth.embedSession) ein partitioniertes Session-Cookie auf der
  //    fremden Seite — dieselbe Klasse Entscheidung wie das Abo.
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n4. …und NUR der Owner (Admin/Moderator/Editor/Viewer nicht)')
  const staff = {}
  for (const role of ['admin', 'moderator', 'editor', 'viewer']) {
    const account = await createPoolUser(role)
    const row = await addStageMember(control, databaseId, {
      communityId: a.communityId, projectId: poolProject, userId: account.userId, role, status: 'active', email: account.email,
    })
    cleanup.track('member', row.$id)
    staff[role] = { ...account, cookie: await login(account) }
  }
  for (const role of ['admin', 'moderator', 'editor', 'viewer']) {
    const res = await call(a.host, '/api/admin/embed-sites', { cookie: staff[role].cookie })
    check(`${role} → 403 (community.embed trägt er nicht)`, res.status === 403, `Status ${res.status}`)
    const write = await call(a.host, '/api/admin/embed-sites', {
      method: 'POST', cookie: staff[role].cookie, body: { host: 'geht-nicht.example' },
    })
    check(`${role} darf auch nicht anlegen → 403`, write.status === 403, `Status ${write.status}`)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. MANDANTENGRENZE. Die Routen gehen durch die Datentür (`tenantDb`):
  //    `list` scopet, `create` stempelt, `update`/`remove` belegen die
  //    Zugehörigkeit VOR der Aktion. Der Härtefall ist DERSELBE Einbetter-Host
  //    in beiden Communities (uq_tenant_host seit comments-015) plus der
  //    Zugriff über die bekannte fremde Row-Id.
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n5. Mandantengrenze: nur die eigenen Einbetter')
  const SHARED_HOST = `f37-shared-${Date.now()}.example`
  const siteA = await call(a.host, '/api/admin/embed-sites', {
    method: 'POST', cookie: cookieA, body: { host: SHARED_HOST, label: 'A-Blog' },
  })
  check('Owner A legt einen Einbetter an → 200', siteA.status === 200, `Status ${siteA.status} ${siteA.text.slice(0, 200)}`)
  if (siteA.json?.id) embedSites.push({ host: a.host, cookie: cookieA, id: siteA.json.id })

  const siteB = await call(b.host, '/api/admin/embed-sites', {
    method: 'POST', cookie: cookieB, body: { host: SHARED_HOST, label: 'B-Blog' },
  })
  check('Owner B darf DENSELBEN Host anlegen (Unique ist tenant-relativ) → 200',
    siteB.status === 200, `Status ${siteB.status} ${siteB.text.slice(0, 200)}`)
  if (siteB.json?.id) embedSites.push({ host: b.host, cookie: cookieB, id: siteB.json.id })

  const listA = await call(a.host, '/api/admin/embed-sites', { cookie: cookieA })
  const listB = await call(b.host, '/api/admin/embed-sites', { cookie: cookieB })
  check('A sieht genau EINEN Einbetter — seinen', listA.json?.total === 1 && listA.json?.sites?.[0]?.label === 'A-Blog',
    JSON.stringify(listA.json))
  check('B sieht genau EINEN Einbetter — seinen', listB.json?.total === 1 && listB.json?.sites?.[0]?.label === 'B-Blog',
    JSON.stringify(listB.json))

  const crossPatch = await call(a.host, `/api/admin/embed-sites/${siteB.json?.id}`, {
    method: 'PATCH', cookie: cookieA, body: { label: 'gekapert' },
  })
  check('A ändert die FREMDE Row-Id auf seinem Host → 404 (Datentür belegt die Zugehörigkeit)',
    crossPatch.status === 404, `Status ${crossPatch.status} ${crossPatch.text.slice(0, 160)}`)
  const crossDelete = await call(a.host, `/api/admin/embed-sites/${siteB.json?.id}`, {
    method: 'DELETE', cookie: cookieA,
  })
  check('A löscht die FREMDE Row-Id → 404', crossDelete.status === 404, `Status ${crossDelete.status}`)
  const stillThere = await call(b.host, '/api/admin/embed-sites', { cookie: cookieB })
  check('…und B hat seinen Einbetter unverändert',
    stillThere.json?.sites?.[0]?.label === 'B-Blog', JSON.stringify(stillThere.json))

  const roleTravels = await call(b.host, '/api/admin/embed-sites', { cookie: cookieA })
  check('die Owner-Rolle reist NICHT zur anderen Community → 403', roleTravels.status === 403, `Status ${roleTravels.status}`)

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n6. Die CSP folgt der Grenze (die HARTE Grenze des Widgets)')
  // Der Einbetter-Cache wird von der Schreibroute invalidiert, greift also
  // sofort. Der eigene Host von B taucht in der CSP von A NICHT auf.
  const cspA = await call(a.host, '/embed?targetId=f37&targetType=verify')
  const ancestorsA = String(cspA.headers['content-security-policy'] ?? '')
  check('A: frame-ancestors nennt den eigenen Einbetter',
    ancestorsA.includes(SHARED_HOST), ancestorsA.slice(0, 200))
  const cspFresh = await call(b.host, '/embed?targetId=f37&targetType=verify')
  const ancestorsB = String(cspFresh.headers['content-security-policy'] ?? '')
  check('B hat eine EIGENE frame-ancestors-Liste', ancestorsB.includes(`'self'`), ancestorsB.slice(0, 200))

  // Der Gegenbeweis: ein Einbetter, den NUR A kennt, steht nie in Bs CSP.
  const ONLY_A = `f37-only-a-${Date.now()}.example`
  const onlyA = await call(a.host, '/api/admin/embed-sites', {
    method: 'POST', cookie: cookieA, body: { host: ONLY_A },
  })
  if (onlyA.json?.id) embedSites.push({ host: a.host, cookie: cookieA, id: onlyA.json.id })
  const cspA2 = await call(a.host, '/embed?targetId=f37&targetType=verify')
  const cspB2 = await call(b.host, '/embed?targetId=f37&targetType=verify')
  check('A: der neue Einbetter steht sofort in der CSP (Cache write-invalidiert)',
    String(cspA2.headers['content-security-policy'] ?? '').includes(ONLY_A),
    String(cspA2.headers['content-security-policy'] ?? '').slice(0, 200))
  check('B: der Einbetter von A steht NICHT in seiner CSP',
    !String(cspB2.headers['content-security-policy'] ?? '').includes(ONLY_A),
    String(cspB2.headers['content-security-policy'] ?? '').slice(0, 200))

  // ──────────────────────────────────────────────────────────────────────────
  // 7. HERKUNFTSPRÜFUNG IM POOL. Die F32-Härtung behandelt `same-site` streng —
  //    und unter der Wildcard ist jeder Mandanten-Host same-site zum anderen.
  //    Der Embed-Fluss läuft trotzdem, weil er same-ORIGIN ist. Das wird hier
  //    für den Pool neu belegt, nicht aus dem Silo übernommen.
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n7. Herkunftsprüfung im Pool (F32-Härtung an der Wildcard)')
  const sameOrigin = await call(a.host, '/api/admin/embed-sites', {
    method: 'POST',
    cookie: cookieA,
    body: { host: `f37-sameorigin-${Date.now()}.example` },
    origin: `http://${a.host}:${PORT}`,
    secFetchSite: 'same-origin',
  })
  check('same-origin (der Embed-/Dashboard-Fluss) geht durch → 200',
    sameOrigin.status === 200, `Status ${sameOrigin.status} ${sameOrigin.text.slice(0, 160)}`)
  if (sameOrigin.json?.id) embedSites.push({ host: a.host, cookie: cookieA, id: sameOrigin.json.id })

  const crossTenant = await call(a.host, '/api/admin/embed-sites', {
    method: 'POST',
    cookie: cookieA,
    body: { host: 'boese.example' },
    origin: `http://${b.host}:${PORT}`,
    secFetchSite: 'same-site',
  })
  check('ein Formular auf der NACHBAR-Community (same-site) wird abgewiesen → 403',
    crossTenant.status === 403, `Status ${crossTenant.status} ${crossTenant.text.slice(0, 160)}`)

  const crossSite = await call(a.host, '/api/admin/embed-sites', {
    method: 'POST',
    cookie: cookieA,
    body: { host: 'boese.example' },
    origin: 'https://boese.example',
    secFetchSite: 'cross-site',
  })
  check('cross-site → 403', crossSite.status === 403, `Status ${crossSite.status}`)

  const sameSiteNoOrigin = await call(a.host, '/api/admin/embed-sites', {
    method: 'POST', cookie: cookieA, body: { host: 'boese.example' }, secFetchSite: 'same-site',
  })
  check('same-site OHNE Origin (Widerspruch in sich) → 403', sameSiteNoOrigin.status === 403, `Status ${sameSiteNoOrigin.status}`)

  const embedCount = await call(a.host, `/api/comments/count?targetId=f37&targetType=verify`, {
    origin: 'https://fremde-seite.example', secFetchSite: 'cross-site',
  })
  check('der Zähler von embed.js (GET, cross-site) bleibt erlaubt → 200',
    embedCount.status === 200, `Status ${embedCount.status}`)

  // Und die Naht, die weiterlaufen MUSS: kopflose Server-zu-Server-Aufrufe
  // (Control Plane, Beweis-Skripte) tragen weder Origin noch Sec-Fetch-Site.
  const headless = await call(a.host, '/api/admin/embed-sites', {
    method: 'POST', cookie: cookieA, body: { host: `f37-headless-${Date.now()}.example` },
  })
  check('kopfloser Aufruf (kein Origin, kein Sec-Fetch-Site) geht durch → 200',
    headless.status === 200, `Status ${headless.status} ${headless.text.slice(0, 160)}`)
  if (headless.json?.id) embedSites.push({ host: a.host, cookie: cookieA, id: headless.json.id })

  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n8. Löschen bleibt beim Owner')
  const strangerDelete = await call(a.host, `/api/admin/embed-sites/${siteA.json?.id}`, {
    method: 'DELETE', cookie: cookieStranger,
  })
  check('Fremder darf nicht löschen → 403', strangerDelete.status === 403, `Status ${strangerDelete.status}`)
  const adminDelete = await call(a.host, `/api/admin/embed-sites/${siteA.json?.id}`, {
    method: 'DELETE', cookie: staff.admin.cookie,
  })
  check('Community-Admin darf nicht löschen → 403', adminDelete.status === 403, `Status ${adminDelete.status}`)
  const ownerDelete = await call(a.host, `/api/admin/embed-sites/${siteA.json?.id}`, {
    method: 'DELETE', cookie: cookieA,
  })
  check('Owner darf löschen → 200', ownerDelete.status === 200, `Status ${ownerDelete.status}`)
  if (ownerDelete.status === 200) {
    embedSites = embedSites.filter(s => s.id !== siteA.json?.id)
  }
  const cspAfter = await call(a.host, '/embed?targetId=f37&targetType=verify')
  check('…und der Host fliegt sofort aus der CSP',
    !String(cspAfter.headers['content-security-policy'] ?? '').includes(SHARED_HOST),
    String(cspAfter.headers['content-security-policy'] ?? '').slice(0, 200))
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message ?? error)
}
finally {
  console.log('\nAufräumen …')
  for (const site of embedSites) {
    await call(site.host, `/api/admin/embed-sites/${site.id}`, { method: 'DELETE', cookie: site.cookie }).catch(() => {})
  }
  const { deleted, leftovers } = await cleanup.run()
  const total = Object.values(deleted).reduce((sum, n) => sum + n, 0)
  console.log(`  gelöscht: ${total} Einträge (Konten, Communities, Mitglieds-Zeilen, Codes, Einbetter, Zeilen der Communities)`)
  check('aufgeräumt — nachgezählt, nichts übrig', leftovers.length === 0, leftovers.join(', '))
  console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`)
  process.exit(fail === 0 ? 0 : 1)
}
