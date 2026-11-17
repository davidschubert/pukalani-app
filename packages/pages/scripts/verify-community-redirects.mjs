/**
 * Beweis für U15 Teil 3 (Davids Entscheidung vom 2026-08-13) — DER OWNER LEGT
 * SEINE WEITERLEITUNGEN SELBST AN: alte Adresse ⇒ neue Adresse.
 *
 * Fährt den ECHTEN Kundenpfad gegen den laufenden Platform-Server + das
 * laufende Control Plane: zwei Communities anlegen, dann auf dem
 * Community-Host prüfen. GEMESSEN WIRD AN DER ANTWORT DES SERVERS — Status
 * und `location`-Kopfzeile —, nicht an der Speicher-Antwort. Eine gespeicherte
 * Weiterleitung, die den Besucher nicht bewegt, ist keine.
 *
 *   1. zwei Communities, beide antworten
 *   2. VORHER: die alte Adresse ist eine 404, die Startseite eine 200
 *      (die Gegenprobe, ohne die alles Weitere wertlos wäre)
 *   3. interner Umzug ⇒ **301** auf das neue Ziel, und der Query-String reist
 *      mit (Gegenprobe: die Startseite antwortet weiter 200 — es wird nicht
 *      ALLES umgeleitet)
 *   4. der Schrägstrich am Ende trifft dieselbe Regel, in EINEM Schritt
 *      (die Middleware läuft vor 08.trailing-slash)
 *   5. die Sprache: `/de/alt` ⇒ `/de/neu` — das Präfix wandert mit
 *   6. externes Ziel ⇒ **302**, und ohne Sprach-Präfix davor
 *   7. Sperrliste, fail-closed: `/api/…`, `/dashboard/…`, `/login` und `/`
 *      als Quelle ⇒ je 400
 *   8. Schleifenschutz: ein Ziel, das selbst Quelle ist ⇒ 400
 *   9. Autorisierung: Gast 401, Fremder 403 — auf BEIDEN Routen (PATCH+GET)
 *  10. Mandanten-Isolation: B's Weiterleitung greift nicht auf A, und A sieht
 *      B's Liste nicht
 *  11. Least Privilege (system-035): die Row ist mit einer SESSION nicht
 *      lesbar (Gegenprobe: mit dem Admin-Key schon)
 *  12. Kontroll-Host: die Middleware greift dort NICHT, und die Schreibroute
 *      gibt es dort nicht (404)
 *  13. der Reiter selbst rendert, ohne rohe i18n-Schlüssel
 *
 * WARUM JEDE ZUSAGE EINE GEGENPROBE HAT: die wichtigen Aussagen sind hier
 * NEGATIV. Ein Test, der nur „Regel gesetzt ⇒ 301" prüft, bliebe grün, wenn
 * die Middleware JEDEN Pfad umleitete — und das wäre der schlimmste denkbare
 * Fehler dieser Fläche, weil er die Community nicht falsch aussehen lässt,
 * sondern unerreichbar macht.
 *
 * Setzt am Ende alles zurück und räumt jede angelegte Zeile weg — auch die
 * `community_redirects`-Rows im Runtime-Projekt.
 *
 * VORAUSSETZUNG — zwei laufende Dev-Server AUS DEM WORKTREE (eigene Ports,
 * damit parallele Sessions sich nicht in die Quere kommen; `exec nuxi dev`,
 * weil `dev -- --port` den Port NICHT durchreicht):
 *   pnpm --filter control exec nuxi dev --port 3184
 *   NUXT_ONBOARDING_CONTROL_URL=http://localhost:3184 \
 *     pnpm --filter platform exec nuxi dev --port 3185
 *
 *   PLATFORM_PORT=3185 POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/pages/scripts/verify-community-redirects.mjs
 *
 * POOL_KEY ist der Schlüssel des RUNTIME-Projekts (lokal `reddit-comments`) —
 * `NUXT_APPWRITE_KEY` aus apps/platform/.env. Gebraucht für Test-Konten, das
 * Wegräumen der `community_redirects`-Row und die Gegenprobe in Abschnitt 11.
 */
import '../../../scripts/lib/assert-target.mjs'
import { request } from 'node:http'
import { Client, Query, TablesDB } from 'node-appwrite'
import {
  appwriteRest,
  createCleanup,
  createProbeAccount,
  createProbeCommunity,
  login as loginOn,
  runStamp,
} from '../../../scripts/lib/probe-stage.mjs'

const PORT = Number(process.env.PLATFORM_PORT || 3185)
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'pool'
const poolKey = process.env.POOL_KEY
const poolDatabaseId = process.env.POOL_DATABASE_ID || databaseId

const REDIRECTS_TABLE = 'community_redirects'

if (!endpoint || !controlProject || !databaseId || !controlKey || !poolKey) {
  console.error('✗ Env unvollständig (POOL_KEY nötig).')
  process.exit(1)
}

const poolClient = new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey)
const poolDb = new TablesDB(poolClient)
const script = 'verify-community-redirects'
const controlRest = appwriteRest({ endpoint, projectId: controlProject, key: controlKey, script })
const pool = appwriteRest({ endpoint, projectId: poolProject, key: poolKey, script })
const cleanup = createCleanup({ pool, control: controlRest, poolDatabaseId, controlDatabaseId: databaseId })
const runId = runStamp()

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
 * node:http, weil fetch den Host-Header verwirft; ::1, weil Nitro dort hört.
 *
 * KEIN AUTOMATISCHES FOLGEN von Weiterleitungen — das ist hier der ganze
 * Punkt: gemessen werden Status und `location`, nicht das, was am Ende der
 * Kette steht.
 */
function call(host, path, { method = 'GET', body, cookie, accept } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: '::1',
      port: PORT,
      path,
      method,
      headers: {
        host,
        ...(accept ? { accept } : {}),
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { cookie } : {}),
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) }
        catch { /* HTML-Seite */ }
        resolve({
          status: res.statusCode,
          location: res.headers.location ?? null,
          headers: res.headers,
          json,
          text,
          setCookie: res.headers['set-cookie'] ?? [],
        })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/** Seiten-Aufruf wie ein Browser (Accept: text/html — sonst antwortet Nitro JSON). */
function page(host, path, cookie) {
  return call(host, path, { cookie, accept: 'text/html' })
}

/** Probe-Konto. Seit BE-015 verlangt das Anlegen einer Community eine BESTÄTIGTE Adresse. */
async function createPoolUser(tag) {
  const account = await createProbeAccount(pool, { tag: `u15rd-${tag}`, stamp: runId, name: `U15 RD ${tag}` })
  cleanup.track('account', account.userId)
  return account
}

function login(host, account) {
  return loginOn(call, host, account)
}

/** Der reine Session-GEHEIMNIS-Wert aus dem Cookie (für `client.setSession`). */
function sessionSecret(cookie) {
  return decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1))
}


async function createCommunity(cookie, slug, name) {
  // Anlage über die echte Route `POST /api/onboarding/site` — Rumpf, Code und
  // Aufräumen kommen aus der gemeinsamen Hilfe (scripts/lib/probe-stage.mjs).
  const created = await createProbeCommunity({
    call, controlHost: CONTROL_HOST, cookie, control: controlRest, databaseId, slug, name, cleanup,
    bodyOverrides: { description: 'U15-Beweis: der Owner legt seine Weiterleitungen selbst an.', vibe: 'fresh' },
  })
  // Die Weiterleitungs-Zeile hat die communityId als Zeilen-Id, keine Stempel-Spalte.
  cleanup.track('poolRow', `${REDIRECTS_TABLE}/${created.communityId}`)
  return { communityId: created.communityId, host: created.host }
}

/** Der Host-Resolver cacht negativ (30 s) — nach der Anlage kurz nachfassen. */
async function waitForHost(host) {
  for (let i = 0; i < 40; i++) {
    const res = await call(host, '/api/themes')
    if (res.status === 200) return res
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return null
}

/** Die Weiterleitungen speichern (die Route ist die einzige Schreibstelle). */
const patchRedirects = (host, cookie, rules) =>
  call(host, '/api/pages/redirects', { method: 'PATCH', cookie, body: { rules } })

try {
  console.log(`\nU15-Beweis Teil 3 (Weiterleitungen) gegen http://localhost:${PORT} (Pool ${poolProject})\n`)

  const owner = await createPoolUser('owner')
  const neighbor = await createPoolUser('neighbor')

  const ownerControlCookie = await login(CONTROL_HOST, owner)
  const neighborControlCookie = await login(CONTROL_HOST, neighbor)
  const stamp = runId

  console.log('1. Zwei Communities anlegen (kunde-a: Owner-Mitglied, kunde-b: fremd)')
  const siteA = await createCommunity(ownerControlCookie, `u15rd-kunde-a-${stamp}`, 'U15 RD Kunde A')
  const siteB = await createCommunity(neighborControlCookie, `u15rd-kunde-b-${stamp}`, 'U15 RD Kunde B')
  check('kunde-a angelegt', !!siteA.host, JSON.stringify(siteA))
  check('kunde-b angelegt', !!siteB.host, JSON.stringify(siteB))
  check('kunde-a antwortet', !!(await waitForHost(siteA.host)))
  check('kunde-b antwortet', !!(await waitForHost(siteB.host)))

  const ownerCookieA = await login(siteA.host, owner)
  const neighborCookieA = await login(siteA.host, neighbor)
  const neighborCookieB = await login(siteB.host, neighbor)

  const OLD = `/alte-seite-${stamp}`
  const NEW = `/neue-seite-${stamp}`

  /**
   * 2. DIE GEGENPROBE, OHNE DIE ALLES WEITERE WERTLOS IST.
   *
   * Wenn die alte Adresse schon ohne Regel eine Weiterleitung ausspuckte,
   * bewiese Abschnitt 3 gar nichts. Also erst messen, wie es OHNE aussieht:
   * die alte Adresse ist eine 404 (der CMS-Auffang antwortet so), die
   * Startseite eine 200.
   */
  console.log('\n2. Vorher: die alte Adresse ist eine 404, die Startseite eine 200')
  const before = await page(siteA.host, OLD)
  check(`SSR ${OLD} → 404 (noch keine Regel)`, before.status === 404, `Status ${before.status}`)
  check('… und KEINE Weiterleitung', before.location === null, String(before.location))
  const homeBefore = await page(siteA.host, '/')
  check('SSR / → 200', homeBefore.status === 200, `Status ${homeBefore.status}`)

  console.log('\n3. Interner Umzug ⇒ 301, und der Query-String reist mit')
  const savedInternal = await patchRedirects(siteA.host, ownerCookieA, [{ from: OLD, to: NEW }])
  check('PATCH → 200', savedInternal.status === 200, `Status ${savedInternal.status} ${savedInternal.text.slice(0, 200)}`)
  check('die Antwort ist der GESPEICHERTE Zustand',
    savedInternal.json?.rules?.[0]?.from === OLD && savedInternal.json?.rules?.[0]?.to === NEW,
    JSON.stringify(savedInternal.json))

  const hit = await page(siteA.host, OLD)
  check(`${OLD} → 301`, hit.status === 301, `Status ${hit.status}`)
  check(`location = ${NEW}`, hit.location === NEW, String(hit.location))

  const withQuery = await page(siteA.host, `${OLD}?utm_source=brief&x=1`)
  check('mit Query: 301', withQuery.status === 301, `Status ${withQuery.status}`)
  check('… und der Query-String ist erhalten',
    withQuery.location === `${NEW}?utm_source=brief&x=1`, String(withQuery.location))

  // DIE ENTSCHEIDENDE GEGENPROBE: es wird nicht ALLES umgeleitet.
  const homeAfter = await page(siteA.host, '/')
  check('GEGENPROBE: die Startseite antwortet weiter 200 (kein Rundumschlag)',
    homeAfter.status === 200 && homeAfter.location === null, `Status ${homeAfter.status} → ${homeAfter.location}`)
  const other = await page(siteA.host, `/ganz-anderer-pfad-${stamp}`)
  check('GEGENPROBE: ein anderer unbekannter Pfad bleibt 404',
    other.status === 404 && other.location === null, `Status ${other.status} → ${other.location}`)

  /**
   * 4. Der Schrägstrich am Ende. Die Middleware läuft VOR
   *    `08.trailing-slash.ts` — die Regel normalisiert deshalb selbst, und der
   *    Besucher wird EINMAL umgeleitet (auf das Ziel), nicht zweimal (erst
   *    Schrägstrich weg, dann umgezogen).
   */
  console.log('\n4. Der Schrägstrich am Ende trifft dieselbe Regel — in EINEM Schritt')
  const slash = await page(siteA.host, `${OLD}/`)
  check(`${OLD}/ → 301`, slash.status === 301, `Status ${slash.status}`)
  check(`… direkt auf ${NEW} (nicht erst auf ${OLD})`, slash.location === NEW, String(slash.location))

  console.log('\n5. Die Sprache: das Präfix wandert mit')
  const localized = await page(siteA.host, `/de${OLD}`)
  check(`/de${OLD} → 301`, localized.status === 301, `Status ${localized.status}`)
  check(`location = /de${NEW}`, localized.location === `/de${NEW}`, String(localized.location))

  console.log('\n6. Externes Ziel ⇒ 302 (nicht 301), und ohne Sprach-Präfix')
  const EXT = 'https://example.com/das-neue-zuhause'
  const savedExternal = await patchRedirects(siteA.host, ownerCookieA, [
    { from: OLD, to: NEW },
    { from: `/extern-${stamp}`, to: EXT, external: true },
  ])
  check('PATCH → 200', savedExternal.status === 200, `Status ${savedExternal.status} ${savedExternal.text.slice(0, 200)}`)
  const extHit = await page(siteA.host, `/extern-${stamp}`)
  check('extern → 302 (NICHT 301: ein fremdes Ziel ist keine dauerhafte Zusage)',
    extHit.status === 302, `Status ${extHit.status}`)
  check(`location = ${EXT}`, extHit.location === EXT, String(extHit.location))
  const extLocalized = await page(siteA.host, `/de/extern-${stamp}`)
  check('… und über /de trifft dieselbe Regel, OHNE /de vor der fremden Adresse',
    extLocalized.status === 302 && extLocalized.location === EXT,
    `${extLocalized.status} → ${extLocalized.location}`)
  check('GEGENPROBE: der interne Umzug daneben bleibt 301',
    (await page(siteA.host, OLD)).status === 301)

  /**
   * 7. DIE SPERRLISTE. Eine Weiterleitung von `/login` auf eine fremde
   *    https-Adresse wäre ein Anmeldeformular unter dem Namen DIESER
   *    Community; eine von `/dashboard` sperrte den Owner aus der Fläche aus,
   *    auf der er es zurücknehmen müsste. Und `/` als Quelle wäre die
   *    Vordertür.
   */
  console.log('\n7. Sperrliste, fail-closed: System-Pfade sind keine Quelle')
  for (const bad of ['/api/pages', '/dashboard/community/redirects', '/login', '/', '/_nuxt/entry.js', '/de/login']) {
    const res = await patchRedirects(siteA.host, ownerCookieA, [{ from: bad, to: NEW }])
    check(`from ${bad} ⇒ 400`, res.status === 400, `Status ${res.status} ${res.text.slice(0, 120)}`)
  }
  check('GEGENPROBE: eine gewöhnliche Adresse geht durch',
    (await patchRedirects(siteA.host, ownerCookieA, [{ from: `/logindaten-${stamp}`, to: NEW }])).status === 200)
  check('GEGENPROBE: ein Produkt-Pfad ist erlaubt (er gehört der Community)',
    (await patchRedirects(siteA.host, ownerCookieA, [{ from: '/feed', to: NEW }])).status === 200)

  console.log('\n8. Schleifenschutz: ein Ziel darf nicht selbst Quelle sein')
  const loop = await patchRedirects(siteA.host, ownerCookieA, [
    { from: '/a-' + stamp, to: '/b-' + stamp },
    { from: '/b-' + stamp, to: '/a-' + stamp },
  ])
  check('Ringschluss (A⇒B, B⇒A) ⇒ 400', loop.status === 400, `Status ${loop.status} ${loop.text.slice(0, 120)}`)
  const chain = await patchRedirects(siteA.host, ownerCookieA, [
    { from: '/a-' + stamp, to: '/b-' + stamp },
    { from: '/b-' + stamp, to: '/c-' + stamp },
  ])
  check('auch die harmlose Kette (A⇒B, B⇒C) ⇒ 400 (bewusst gröber)',
    chain.status === 400, `Status ${chain.status}`)
  const self = await patchRedirects(siteA.host, ownerCookieA, [{ from: '/a-' + stamp, to: '/a-' + stamp }])
  check('die Regel auf sich selbst ⇒ 400', self.status === 400, `Status ${self.status}`)
  check('GEGENPROBE: zwei Regeln auf DASSELBE Ziel gehen durch',
    (await patchRedirects(siteA.host, ownerCookieA, [
      { from: '/a-' + stamp, to: '/c-' + stamp },
      { from: '/b-' + stamp, to: '/c-' + stamp },
    ])).status === 200)

  // Zustand für die folgenden Abschnitte wiederherstellen.
  await patchRedirects(siteA.host, ownerCookieA, [{ from: OLD, to: NEW }])

  console.log('\n9. Autorisierung: Gast 401, Fremder 403 — auf BEIDEN Routen')
  const guestPatch = await patchRedirects(siteA.host, null, [{ from: OLD, to: NEW }])
  check(`Gast PATCH ⇒ 401 (${guestPatch.status})`, guestPatch.status === 401, guestPatch.text.slice(0, 120))
  const guestGet = await call(siteA.host, '/api/pages/redirects')
  check(`Gast GET ⇒ 401 (${guestGet.status})`, guestGet.status === 401, guestGet.text.slice(0, 120))
  const strangerPatch = await patchRedirects(siteA.host, neighborCookieA, [{ from: OLD, to: NEW }])
  check(`Fremder PATCH ⇒ 403 (${strangerPatch.status})`, strangerPatch.status === 403, strangerPatch.text.slice(0, 120))
  const strangerGet = await call(siteA.host, '/api/pages/redirects', { cookie: neighborCookieA })
  check(`Fremder GET ⇒ 403 (${strangerGet.status})`, strangerGet.status === 403, strangerGet.text.slice(0, 120))
  const ownerGet = await call(siteA.host, '/api/pages/redirects', { cookie: ownerCookieA })
  check('GEGENPROBE: der Owner liest seine eigene Liste (200)',
    ownerGet.status === 200 && ownerGet.json?.rules?.[0]?.from === OLD, JSON.stringify(ownerGet.json))

  console.log('\n10. Mandanten-Isolation')
  const bOld = `/nur-bei-b-${stamp}`
  const savedB = await patchRedirects(siteB.host, neighborCookieB, [{ from: bOld, to: '/b-ziel' }])
  check('B speichert seine eigene Weiterleitung (200)', savedB.status === 200, `Status ${savedB.status}`)
  const bOnB = await page(siteB.host, bOld)
  check('… und sie greift auf B (301)', bOnB.status === 301, `Status ${bOnB.status}`)
  const bOnA = await page(siteA.host, bOld)
  check('B\'s Weiterleitung greift NICHT auf A (404, keine Umleitung)',
    bOnA.status === 404 && bOnA.location === null, `Status ${bOnA.status} → ${bOnA.location}`)
  const aOnB = await page(siteB.host, OLD)
  check('A\'s Weiterleitung greift NICHT auf B (404, keine Umleitung)',
    aOnB.status === 404 && aOnB.location === null, `Status ${aOnB.status} → ${aOnB.location}`)
  const bListForOwnerOfA = await call(siteB.host, '/api/pages/redirects', { cookie: await login(siteB.host, owner) })
  check('A\'s Owner sieht B\'s Liste nicht (403)', bListForOwnerOfA.status === 403, `Status ${bListForOwnerOfA.status}`)

  /**
   * 11. LEAST PRIVILEGE (system-035): `community_redirects` trägt KEINE
   *     Client-Rechte. Es liest niemand — es wird gelesen: der Server holt die
   *     Zeile mit dem Admin-Client und leitet um.
   *
   *     OHNE DIE GEGENPROBE WÄRE DAS GRÜN, WENN DIE TABELLE GAR NICHT
   *     EXISTIERTE — deshalb steht neben jedem verweigerten Zugriff derselbe
   *     mit dem Admin-Key.
   */
  console.log('\n11. Least Privilege: die Row ist mit einer Session NICHT lesbar')
  let tablePermissions = null
  try {
    const table = await poolDb.getTable({ databaseId: poolDatabaseId, tableId: REDIRECTS_TABLE })
    tablePermissions = table.$permissions ?? []
  }
  catch (error) {
    tablePermissions = `Fehler: ${error?.type || error?.message}`
  }
  check('Vorbedingung: die Tabelle trägt keine Client-Rechte (`permissions: []`)',
    Array.isArray(tablePermissions) && tablePermissions.length === 0, JSON.stringify(tablePermissions))

  const sessionDb = new TablesDB(
    new Client().setEndpoint(endpoint).setProject(poolProject).setSession(sessionSecret(ownerCookieA)),
  )
  let sessionGet = 'gelesen(!)'
  try {
    await sessionDb.getRow({ databaseId: poolDatabaseId, tableId: REDIRECTS_TABLE, rowId: siteA.communityId })
  }
  catch (error) { sessionGet = `${error?.code} ${error?.type}` }
  check(`Owner-Session: getRow scheitert (${sessionGet})`, sessionGet !== 'gelesen(!)')

  let sessionList = 'gelesen(!)'
  try {
    await sessionDb.listRows({ databaseId: poolDatabaseId, tableId: REDIRECTS_TABLE, queries: [Query.limit(25)] })
  }
  catch (error) { sessionList = `${error?.code} ${error?.type}` }
  check(`Owner-Session: listRows scheitert (${sessionList})`, sessionList !== 'gelesen(!)')

  const adminRow = await poolDb.getRow({ databaseId: poolDatabaseId, tableId: REDIRECTS_TABLE, rowId: siteA.communityId })
  check('Gegenprobe: mit dem Admin-Key steht die Row da (die Tabelle EXISTIERT)',
    typeof adminRow?.config === 'string' && adminRow.config.includes(OLD),
    String(adminRow?.config).slice(0, 120))
  check('… und die Weiterleitung greift weiterhin (der Server kommt ran, der Client nicht)',
    (await page(siteA.host, OLD)).status === 301)

  /**
   * 12. DER KONTROLL-HOST. Dort gibt es keinen Mandanten — die Middleware
   *     steigt in ihrer ersten Zeile aus, und die Schreibroute antwortet 404.
   *     Ohne diese Messung könnte A's Regel den Kundenbereich mitreissen.
   */
  console.log('\n12. Kontroll-Host: die Middleware greift dort nicht')
  const onControl = await page(CONTROL_HOST, OLD, ownerControlCookie)
  check('A\'s alte Adresse leitet auf dem Kontroll-Host NICHT um',
    onControl.status !== 301 && onControl.status !== 302 && onControl.location === null,
    `Status ${onControl.status} → ${onControl.location}`)
  const controlPatch = await patchRedirects(CONTROL_HOST, ownerControlCookie, [{ from: OLD, to: NEW }])
  check(`die Schreibroute gibt es dort nicht (${controlPatch.status})`,
    controlPatch.status === 404, controlPatch.text.slice(0, 120))

  console.log('\n13. Die Editor-Seite rendert')
  const editor = await page(siteA.host, '/dashboard/community/redirects', ownerCookieA)
  check('SSR /dashboard/community/redirects → 200', editor.status === 200, `Status ${editor.status}`)
  check('das Quell-Feld ist da', editor.text.includes('data-testid="redirects-from"'))
  check('das Ziel-Feld ist da', editor.text.includes('data-testid="redirects-to"'))
  check('der Hinzufügen-Knopf ist da', editor.text.includes('data-testid="redirects-add"'))
  check('der Speichern-Knopf ist da', editor.text.includes('data-testid="redirects-save"'))
  check('die Tabelle ist da', editor.text.includes('data-testid="redirects-table"'))
  check('der Reiter steht im Community-Hub', editor.text.includes('/dashboard/community/redirects'))
  check('kein roher i18n-Schlüssel im Markup (Übersetzungen sind da)',
    !editor.text.includes('pages.redirects.'), 'pages.redirects.* im HTML gefunden')
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n14. Aufräumen')
  const { deleted, leftovers } = await cleanup.run()
  const total = Object.values(deleted).reduce((sum, n) => sum + n, 0)
  console.log(`  gelöscht: ${total} Einträge (Konten, Communities, Mitglieds-Zeilen, Codes, Weiterleitungs-Zeilen, Zeilen der Communities)`)
  check('aufgeräumt — nachgezählt, nichts übrig', leftovers.length === 0, leftovers.join(', '))
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
