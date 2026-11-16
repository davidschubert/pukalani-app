/**
 * Beweis für U15 Teil 2 (Davids Zuschnitt vom 2026-08-13) — DER OWNER STELLT
 * SEINEN SUCHEINTRAG SELBST EIN: eigene Beschreibung der Startseite ·
 * noindex-Schalter · Vorschau.
 *
 * Fährt den ECHTEN Kundenpfad gegen den laufenden Platform-Server + das
 * laufende Control Plane: zwei Communities anlegen, dann auf dem
 * Community-Host prüfen. GEMESSEN WIRD IM SSR-HTML des Mandanten-Hosts und
 * nicht an der Speicher-Antwort — eine gespeicherte Beschreibung, die im Kopf
 * der Community nicht ankommt, ist keine. Suchmaschinen sehen genau dieses
 * HTML.
 *
 *   1. ohne Row: die Beschreibung der Community (heutiges Verhalten) und es
 *      steht KEIN robots-Tag im Kopf
 *   2. eigene Beschreibung: sie steht im `meta[name=description]` UND im
 *      `og:description` (Gegenprobe: die alte steht nicht mehr da)
 *   3. wieder geleert: die Community-Beschreibung ist zurück — ein leeres Feld
 *      löscht die Beschreibung nicht (Zusage 2 der Regel)
 *   4. Zeilenumbrüche werden zu Leerzeichen, und zwar schon beim SPEICHERN
 *   5. noindex AN ⇒ `noindex, nofollow` im Kopf, auch auf einer UNTERSEITE
 *      (Gegenprobe: AUS ⇒ das Tag ist WEG)
 *   6. das Vorschaubild bleibt bei noindex ERHALTEN (anders als bei C18) —
 *      die Community ist aus der Suche, nicht aus dem Chat
 *   7. Kontroll-Host: trägt NIE das robots-Tag der Community, und die Route
 *      gibt es dort nicht (404)
 *   8. Autorisierung: ohne Anmeldung 401/403, Fremder 403
 *   9. zu lang (mehr als 320 Zeichen) ⇒ 400
 *  10. Mandanten-Isolation: Community B zeigt weder A's Beschreibung noch
 *      A's noindex
 *  11. Least Privilege (system-034): die Row ist mit einer SESSION nicht
 *      lesbar (Gegenprobe: mit dem Admin-Key schon, und der Kopf trägt die
 *      Beschreibung weiter — der Server kommt ran, der Client nicht)
 *  12. der Reiter selbst rendert: Feld, Zähler und BEIDE Vorschauen stehen im
 *      SSR-HTML, und kein roher i18n-Schlüssel steht darin
 *
 * WAS „DIE COMMUNITY-BESCHREIBUNG" KONKRET IST, steht bei Abschnitt 2 — es ist
 * keine eigene Kopf-Quelle, sondern der Weg Wizard → geseedete Startseite →
 * Anriss. Diese Zeile ist eine Messung: die erste Fassung dieses Beweises hat
 * etwas anderes erwartet und war deshalb rot, obwohl der Code stimmte.
 *
 * Setzt am Ende alles zurück und räumt jede angelegte Zeile weg — auch die
 * `community_seo`-Rows im Runtime-Projekt.
 *
 * VORAUSSETZUNG — zwei laufende Dev-Server AUS DEM WORKTREE (eigene Ports,
 * damit parallele Sessions sich nicht in die Quere kommen; `exec nuxi dev`,
 * weil `dev -- --port` den Port NICHT durchreicht):
 *   pnpm --filter control exec nuxi dev --port 3174
 *   NUXT_ONBOARDING_CONTROL_URL=http://localhost:3174 \
 *     pnpm --filter platform exec nuxi dev --port 3175
 *
 *   PLATFORM_PORT=3175 POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/pages/scripts/verify-community-seo.mjs
 *
 * POOL_KEY ist der Schlüssel des RUNTIME-Projekts (lokal `reddit-comments`) —
 * `NUXT_APPWRITE_KEY` aus apps/platform/.env. Gebraucht für Test-Konten, das
 * Wegräumen der `community_seo`-Row und die Gegenprobe in Abschnitt 11.
 */
import '../../../scripts/lib/assert-target.mjs'
import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const PORT = Number(process.env.PLATFORM_PORT || 3175)
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'pool'
const poolKey = process.env.POOL_KEY
const poolDatabaseId = process.env.POOL_DATABASE_ID || databaseId

const SEO_TABLE = 'community_seo'
const ROBOTS = 'noindex, nofollow'

if (!endpoint || !controlProject || !databaseId || !controlKey || !poolKey) {
  console.error('✗ Env unvollständig (POOL_KEY nötig).')
  process.exit(1)
}

const control = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const poolClient = new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey)
const poolUsers = new Users(poolClient)
const poolDb = new TablesDB(poolClient)

let pass = 0
let fail = 0
const cleanup = { users: [], codes: [], tenants: [], members: [], seoRows: [], pages: [] }

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

/** node:http, weil fetch den Host-Header verwirft; ::1, weil Nitro dort hört. */
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
        resolve({ status: res.statusCode, headers: res.headers, json, text, setCookie: res.headers['set-cookie'] ?? [] })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/** Seiten-SSR wie ein Browser (Accept: text/html — sonst antwortet Nitro JSON). */
function page(host, path, cookie) {
  return call(host, path, { cookie, accept: 'text/html' })
}

/**
 * Den Inhalt eines meta-Tags aus dem SSR-HTML holen.
 *
 * BEWUSST ATTRIBUT-REIHENFOLGE-TOLERANT: unhead schreibt mal `name` zuerst,
 * mal `content` — ein Muster, das nur eine Reihenfolge kennt, meldet ein
 * fehlendes Tag, wo keines fehlt. Rückgabe `null` heisst „kein solches Tag",
 * und genau das ist bei mehreren Prüfungen die ZUSAGE (kein leeres
 * description-Meta, kein robots ohne Grund).
 */
function metaContent(html, key, attr = 'name') {
  const re = new RegExp(`<meta[^>]*\\b${attr}="${key}"[^>]*>`, 'i')
  const tag = html.match(re)?.[0]
  if (!tag) return null
  return tag.match(/\bcontent="([^"]*)"/i)?.[1] ?? null
}

/** HTML-Entities zurückübersetzen — unhead maskiert `&`, `<`, Anführungszeichen. */
function unescapeHtml(value) {
  return value === null
    ? null
    : value.replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

const descriptionOf = html => unescapeHtml(metaContent(html, 'description'))
const ogDescriptionOf = html => unescapeHtml(metaContent(html, 'og:description', 'property'))
const robotsOf = html => metaContent(html, 'robots')
const ogImageOf = html => metaContent(html, 'og:image', 'property')

async function createPoolUser(tag) {
  const email = `u15seo-${tag}-${Date.now()}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `U15 SEO ${tag}` })
  cleanup.users.push(user.$id)
  // Seit BE-015 verlangt das Anlegen einer Community eine BESTÄTIGTE Adresse.
  await poolUsers.updateEmailVerification({ userId: user.$id, emailVerification: true })
  return { userId: user.$id, email, password }
}

async function login(host, account) {
  const res = await call(host, '/api/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  })
  if (res.status !== 200) throw new Error(`Login auf ${host} fehlgeschlagen (${res.status}): ${res.text.slice(0, 160)}`)
  const raw = res.setCookie.find(c => c.startsWith('a_session_'))
  if (!raw) throw new Error('Kein Session-Cookie erhalten')
  return raw.split(';')[0]
}

/** Der reine Session-GEHEIMNIS-Wert aus dem Cookie (für `client.setSession`). */
function sessionSecret(cookie) {
  return decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1))
}

async function issueCode(tag) {
  const code = `PUKA-SEO${tag}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const row = await control.createRow({
    databaseId,
    tableId: 'invite_codes',
    rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex'),
      label: 'U15-SEO-Beweis',
      maxUses: 0,
      uses: 0,
      expiresAt: null,
      status: 'active',
    },
  })
  cleanup.codes.push(row.$id)
  return code
}

async function createCommunity(cookie, slug, name) {
  const code = await issueCode(slug.slice(-4).toUpperCase())
  const created = await call(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST',
    cookie,
    body: {
      operatorTerms: true, // Betreiber-Bedingungen: Pflicht, wo die App sie einschaltet
      name,
      slug,
      purpose: 'new',
      memberRange: 'to100',
      category: 'club',
      goal: 'discussion',
      description: 'U15-Beweis: der Owner stellt seinen Sucheintrag selbst ein.',
      vibe: 'fresh',
      inviteCode: code,
      locale: 'de',
    },
  })
  if (created.status !== 200 || !created.json?.communityId) {
    throw new Error(`Community ${slug} nicht angelegt (${created.status}): ${created.text.slice(0, 200)}`)
  }
  cleanup.tenants.push(created.json.communityId)
  cleanup.seoRows.push(created.json.communityId)
  const members = await control.listRows({
    databaseId,
    tableId: 'community_members',
    queries: [Query.equal('communityId', created.json.communityId), Query.limit(10)],
  })
  cleanup.members.push(...members.rows.map(row => row.$id))
  return { communityId: created.json.communityId, host: created.json.host }
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

/** Den Sucheintrag speichern (die Route ist die einzige Schreibstelle). */
const patchSeo = (host, cookie, body) =>
  call(host, '/api/pages/seo', { method: 'PATCH', cookie, body })

try {
  console.log(`\nU15-Beweis Teil 2 (Sucheintrag) gegen http://localhost:${PORT} (Pool ${poolProject})\n`)

  const owner = await createPoolUser('owner')
  const neighbor = await createPoolUser('neighbor')

  const ownerControlCookie = await login(CONTROL_HOST, owner)
  const neighborControlCookie = await login(CONTROL_HOST, neighbor)
  const stamp = Date.now().toString(36)

  console.log('1. Zwei Communities anlegen (kunde-a: Owner-Mitglied, kunde-b: fremd)')
  const siteA = await createCommunity(ownerControlCookie, `u15seo-kunde-a-${stamp}`, 'U15 SEO Kunde A')
  const siteB = await createCommunity(neighborControlCookie, `u15seo-kunde-b-${stamp}`, 'U15 SEO Kunde B')
  check('kunde-a angelegt', !!siteA.host, JSON.stringify(siteA))
  check('kunde-b angelegt', !!siteB.host, JSON.stringify(siteB))
  check('kunde-a antwortet', !!(await waitForHost(siteA.host)))
  check('kunde-b antwortet', !!(await waitForHost(siteB.host)))

  const ownerCookieA = await login(siteA.host, owner)
  const neighborCookieA = await login(siteA.host, neighbor)

  /**
   * 2. DER RÜCKFALL, DEN ES SCHON GAB — und wie er konkret aussieht.
   *
   * „Die Community-Beschreibung" ist im Kopf keine eigene Quelle, sondern ein
   * WEG: das Onboarding legt jeder frischen Community eine `home`-Seite an und
   * schreibt die Wizard-Beschreibung in deren Text (`seedHomePage`, O6); die
   * Startseite macht daraus den Anriss (`pageExcerpt`, Audit-Befund S5). Was
   * ohne eigene Beschreibung im `meta[name=description]` steht, ist also genau
   * der Satz, den der Owner im Wizard geschrieben hat.
   *
   * DAS IST EINE MESSUNG UND KEINE ANNAHME: beim ersten Lauf dieses Beweises
   * stand hier die Erwartung „ohne Startseite gar keine Beschreibung" — und
   * war rot, weil es die Startseite längst gibt. Der Code war richtig, der
   * Test hatte den Weg nicht gekannt.
   */
  console.log('\n2. Ohne Row: die Beschreibung der Community (heutiges Verhalten)')
  const excerpt = 'U15-Beweis: der Owner stellt seinen Sucheintrag selbst ein.'
  const baseline = await page(siteA.host, '/')
  check('SSR: meta description = die Beschreibung der Community (Wizard → Startseite → Anriss)',
    descriptionOf(baseline.text) === excerpt, String(descriptionOf(baseline.text)))
  check('SSR: og:description trägt denselben Text', ogDescriptionOf(baseline.text) === excerpt,
    String(ogDescriptionOf(baseline.text)))
  check('SSR: KEIN robots-Tag (die Community will gefunden werden)', robotsOf(baseline.text) === null,
    String(robotsOf(baseline.text)))

  console.log('\n3. Eigene Beschreibung: sie schlägt den Anriss')
  const own = `Proben jeden Dienstag, Konzerte im Sommer — Beweis ${stamp}.`
  const saved = await patchSeo(siteA.host, ownerCookieA, { metaDescription: own, noindex: false })
  check('PATCH → 200', saved.status === 200, `Status ${saved.status} ${saved.text.slice(0, 160)}`)
  check('die Antwort ist der GESPEICHERTE Zustand', saved.json?.metaDescription === own && saved.json?.noindex === false,
    JSON.stringify(saved.json))

  const withOwn = await page(siteA.host, '/')
  check('SSR: meta description = der eigene Text', descriptionOf(withOwn.text) === own,
    String(descriptionOf(withOwn.text)))
  check('GEGENPROBE: der Anriss steht NICHT mehr im Kopf', descriptionOf(withOwn.text) !== excerpt)
  check('SSR: og:description zieht mit', ogDescriptionOf(withOwn.text) === own,
    String(ogDescriptionOf(withOwn.text)))

  console.log('\n4. Wieder geleert: die Community-Beschreibung ist zurück (ein leeres Feld löscht nichts)')
  const cleared = await patchSeo(siteA.host, ownerCookieA, { metaDescription: '', noindex: false })
  check('PATCH mit leerem Feld → 200', cleared.status === 200, `Status ${cleared.status}`)
  const afterClear = await page(siteA.host, '/')
  check('SSR: meta description ist wieder die Community-Beschreibung',
    descriptionOf(afterClear.text) === excerpt, String(descriptionOf(afterClear.text)))

  console.log('\n5. Zeilenumbrüche werden schon beim SPEICHERN zu Leerzeichen')
  const multiline = await patchSeo(siteA.host, ownerCookieA, {
    metaDescription: `  Erste Zeile\n\nZweite   Zeile ${stamp}  `,
    noindex: false,
  })
  check('PATCH → 200', multiline.status === 200, `Status ${multiline.status}`)
  check('die gespeicherte Fassung ist einzeilig und getrimmt',
    multiline.json?.metaDescription === `Erste Zeile Zweite Zeile ${stamp}`,
    JSON.stringify(multiline.json?.metaDescription))
  const flatHtml = await page(siteA.host, '/')
  check('SSR: derselbe geputzte Text steht im Kopf',
    descriptionOf(flatHtml.text) === `Erste Zeile Zweite Zeile ${stamp}`,
    String(descriptionOf(flatHtml.text)))

  console.log('\n6. noindex AN: das robots-Tag steht da — auf JEDER Seite')
  const noindexOn = await patchSeo(siteA.host, ownerCookieA, { metaDescription: own, noindex: true })
  check('PATCH → 200', noindexOn.status === 200, `Status ${noindexOn.status}`)
  const hidden = await page(siteA.host, '/')
  check(`SSR Startseite: robots = "${ROBOTS}"`, robotsOf(hidden.text) === ROBOTS, String(robotsOf(hidden.text)))
  const hiddenSub = await page(siteA.host, '/login')
  check('SSR UNTERSEITE (/login): dasselbe robots-Tag — der Kopf gilt für die ganze Community',
    robotsOf(hiddenSub.text) === ROBOTS, String(robotsOf(hiddenSub.text)))
  check('… und die Beschreibung bleibt unberührt', descriptionOf(hidden.text) === own,
    String(descriptionOf(hidden.text)))

  /**
   * 7. DAS VORSCHAUBILD BLEIBT. Der Unterschied zu C18 („nur für Mitglieder"),
   *    wo das og:image bewusst mit wegfällt: dort ist die Community
   *    unsichtbar, hier nur aus der Suche. Wer seinen Link teilt, soll
   *    weiterhin eine Karte bekommen — für viele ist genau das der Grund, auf
   *    die Suche zu verzichten.
   */
  console.log('\n7. Das Vorschaubild überlebt den noindex-Schalter (anders als bei C18)')
  check('og:image steht weiterhin im Kopf', typeof ogImageOf(hidden.text) === 'string' && ogImageOf(hidden.text).includes('/og/'),
    String(ogImageOf(hidden.text)))

  console.log('\n8. GEGENPROBE: noindex AUS ⇒ das Tag ist WEG')
  const noindexOff = await patchSeo(siteA.host, ownerCookieA, { metaDescription: own, noindex: false })
  check('PATCH → 200', noindexOff.status === 200, `Status ${noindexOff.status}`)
  const visible = await page(siteA.host, '/')
  check('SSR: kein robots-Tag mehr', robotsOf(visible.text) === null, String(robotsOf(visible.text)))
  const visibleSub = await page(siteA.host, '/login')
  check('SSR Unterseite: ebenfalls keines', robotsOf(visibleSub.text) === null, String(robotsOf(visibleSub.text)))

  console.log('\n9. Kontroll-Host: trägt NIE das robots-Tag einer Community')
  await patchSeo(siteA.host, ownerCookieA, { metaDescription: own, noindex: true })
  const controlPage = await page(CONTROL_HOST, '/')
  check('SSR Kontroll-Host: kein robots-Tag, obwohl kunde-a auf noindex steht',
    robotsOf(controlPage.text) === null, String(robotsOf(controlPage.text)))
  check('SSR Kontroll-Host: auch nicht A’s Beschreibung',
    descriptionOf(controlPage.text) !== own, String(descriptionOf(controlPage.text)))
  const patchOnControl = await patchSeo(CONTROL_HOST, ownerControlCookie, { metaDescription: 'x', noindex: false })
  check('PATCH auf dem Kontroll-Host → 404 (die Route gibt es dort nicht)',
    patchOnControl.status === 404, `Status ${patchOnControl.status}`)

  console.log('\n10. Autorisierung')
  const guest = await patchSeo(siteA.host, null, { metaDescription: 'Gast war hier', noindex: false })
  check(`ohne Anmeldung → ${guest.status} (401/403)`, guest.status === 401 || guest.status === 403)
  const stranger = await patchSeo(siteA.host, neighborCookieA, { metaDescription: 'Fremder war hier', noindex: false })
  check(`Fremder (kein Team-Mitglied von A) → ${stranger.status} (403)`, stranger.status === 403)
  const afterAttacks = await page(siteA.host, '/')
  check('GEGENPROBE: der Kopf trägt weiterhin den Text des OWNERS',
    descriptionOf(afterAttacks.text) === own, String(descriptionOf(afterAttacks.text)))

  console.log('\n11. Zu lang: mehr als 320 Zeichen ⇒ 400')
  const tooLong = await patchSeo(siteA.host, ownerCookieA, { metaDescription: 'a'.repeat(321), noindex: false })
  check('321 Zeichen → 400', tooLong.status === 400, `Status ${tooLong.status} ${tooLong.text.slice(0, 160)}`)
  const exact = await patchSeo(siteA.host, ownerCookieA, { metaDescription: 'b'.repeat(320), noindex: true })
  check('GEGENPROBE: GENAU 320 Zeichen → 200 (die Grenze ist die Grenze)', exact.status === 200,
    `Status ${exact.status}`)
  await patchSeo(siteA.host, ownerCookieA, { metaDescription: own, noindex: true })

  console.log('\n12. Mandanten-Isolation: B sieht nichts von A')
  const htmlB = await page(siteB.host, '/')
  check('kunde-b: A’s Beschreibung steht nicht im Kopf', descriptionOf(htmlB.text) !== own,
    String(descriptionOf(htmlB.text)))
  check('kunde-b: A’s noindex wirkt dort nicht', robotsOf(htmlB.text) === null, String(robotsOf(htmlB.text)))
  check('kunde-b: A’s Text steht auch sonst nirgends im Dokument', !htmlB.text.includes(own))

  /**
   * 13. LEAST PRIVILEGE (system-034): `community_seo` trägt KEINE
   *     Client-Rechte. Es liest niemand — es wird gelesen: der Server holt die
   *     Zeile mit dem Admin-Client und rendert das Ergebnis in den Kopf.
   *
   *     OHNE DIE GEGENPROBE WÄRE DAS GRÜN, WENN DIE TABELLE GAR NICHT
   *     EXISTIERTE — deshalb steht neben jedem verweigerten Zugriff derselbe
   *     mit dem Admin-Key.
   */
  console.log('\n13. Least Privilege: die Row ist mit einer Session NICHT lesbar')
  let tablePermissions = null
  try {
    const table = await poolDb.getTable({ databaseId: poolDatabaseId, tableId: SEO_TABLE })
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
    await sessionDb.getRow({ databaseId: poolDatabaseId, tableId: SEO_TABLE, rowId: siteA.communityId })
  }
  catch (error) { sessionGet = `${error?.code} ${error?.type}` }
  check(`Owner-Session: getRow scheitert (${sessionGet})`, sessionGet !== 'gelesen(!)')

  let sessionList = 'gelesen(!)'
  try {
    await sessionDb.listRows({ databaseId: poolDatabaseId, tableId: SEO_TABLE, queries: [Query.limit(25)] })
  }
  catch (error) { sessionList = `${error?.code} ${error?.type}` }
  check(`Owner-Session: listRows scheitert (${sessionList})`, sessionList !== 'gelesen(!)')

  const adminRow = await poolDb.getRow({ databaseId: poolDatabaseId, tableId: SEO_TABLE, rowId: siteA.communityId })
  check('Gegenprobe: mit dem Admin-Key steht die Row da (die Tabelle EXISTIERT)',
    adminRow?.metaDescription === own && adminRow?.noindex === true,
    JSON.stringify({ metaDescription: adminRow?.metaDescription, noindex: adminRow?.noindex }))

  const stillInHead = await page(siteA.host, '/')
  check('… und der Kopf trägt sie weiterhin (der Server kommt ran, der Client nicht)',
    descriptionOf(stillInHead.text) === own && robotsOf(stillInHead.text) === ROBOTS,
    `${descriptionOf(stillInHead.text)} / ${robotsOf(stillInHead.text)}`)

  /**
   * 14. DIE FLÄCHE SELBST. Alles bisher misst die Wirkung im Kopf; dieser
   *     Abschnitt misst, dass der Owner überhaupt an sie herankommt — der
   *     Reiter rendert, das Feld ist da, und beide Vorschauen stehen im SSR.
   *     Ohne ihn wäre ein Tippfehler im Template ein grüner Beweis.
   */
  console.log('\n14. Die Editor-Seite rendert')
  const editor = await page(siteA.host, '/dashboard/community/seo', ownerCookieA)
  check('SSR /dashboard/community/seo → 200', editor.status === 200, `Status ${editor.status}`)
  check('das Beschreibungs-Feld ist da', editor.text.includes('data-testid="seo-description"'))
  check('der Zeichenzähler ist da', editor.text.includes('data-testid="seo-counter"'))
  check('die Google-Vorschau ist da', editor.text.includes('data-testid="seo-preview-search"'))
  check('die Social-Karte ist da (das Gate ist in platform an)',
    editor.text.includes('data-testid="seo-preview-social"'))
  check('die Vorschau zeigt den GESPEICHERTEN Text (nicht den Rückfall)',
    editor.text.includes(own), own)
  check('der Reiter steht im Community-Hub', editor.text.includes('/dashboard/community/seo'))
  check('kein roher i18n-Schlüssel im Markup (Übersetzungen sind da)',
    !editor.text.includes('pages.seo.'), 'pages.seo.* im HTML gefunden')
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n15. Aufräumen')
  for (const p of cleanup.pages) {
    await call(p.host, `/api/pages/${p.slug}`, { method: 'DELETE', cookie: p.cookie }).catch(() => {})
  }
  for (const id of cleanup.seoRows) {
    await poolDb.deleteRow({ databaseId: poolDatabaseId, tableId: SEO_TABLE, rowId: id }).catch(() => {})
  }
  for (const id of cleanup.members) await control.deleteRow({ databaseId, tableId: 'community_members', rowId: id }).catch(() => {})
  for (const id of cleanup.tenants) await control.deleteRow({ databaseId, tableId: 'communities', rowId: id }).catch(() => {})
  for (const id of cleanup.codes) await control.deleteRow({ databaseId, tableId: 'invite_codes', rowId: id }).catch(() => {})
  for (const id of cleanup.users) await poolUsers.delete({ userId: id }).catch(() => {})
  const rest = await control.listRows({ databaseId, tableId: 'communities', queries: [Query.limit(25)] })
  console.log(`  ✔ aufgeräumt — verbleibende Tenants: ${rest.rows.map(r => r.host).join(', ') || '(keine)'}`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
