/**
 * Beweis für U15 Teil 1 (Davids Zuschnitt vom 2026-08-13) — DER OWNER STELLT
 * SEIN ÖFFENTLICHES MENÜ SELBST ZUSAMMEN: ausblenden · umordnen · umbenennen ·
 * eigene Links (auf CMS-Seiten dieser Community und auf externe https-Adressen).
 *
 * Fährt den ECHTEN Kundenpfad gegen den laufenden Platform-Server + das
 * laufende Control Plane: zwei Communities anlegen, dann auf dem
 * Community-Host prüfen. GEMESSEN WIRD IM SSR-HTML des Mandanten-Hosts und
 * nicht an der Speicher-Antwort — eine gespeicherte Wahl, die im Kopf der
 * Community nicht ankommt, ist keine:
 *
 *   1. ohne Row: das Standard-Menü nach `order`, GET liefert `{entries:[]}`
 *   2. umordnen: die Einträge stehen in DIESER Reihenfolge im HTML
 *      (Gegenprobe: vorher standen sie in der anderen)
 *   3. ausblenden: der Eintrag ist WEG (Gegenprobe: vorher war er da)
 *   4. umbenennen: der eigene Text steht da, der mitgelieferte nicht mehr
 *      (Gegenprobe: leeres Label ⇒ der mitgelieferte ist zurück)
 *   5. externer Link: `target="_blank"` UND `rel="noopener"` im HTML;
 *      http/javascript/protokollrelativ ⇒ 400
 *   6. interner Link auf eine fremde Seite ⇒ 400 `unknown_page`
 *      (Gegenprobe: eine WIRKLICH veröffentlichte Seite ⇒ 200 und im HTML)
 *   7. Umlenken verboten: ein `to` an einem Produkt-Eintrag ⇒ 400
 *   8. Autorisierung: Fremder ⇒ 403, ohne Anmeldung ⇒ 401/403
 *   9. Mandanten-Isolation: Community B sieht das Menü von A nicht
 *  10. Kontroll-Host: die Route existiert dort nicht ⇒ 404
 *  11. Least Privilege (system-033): die Row ist mit einer SESSION nicht lesbar
 *      (Gegenprobe: mit dem Admin-Key schon, und die öffentliche Route liefert
 *      das Menü weiter aus — der Server kommt ran, der Client nicht)
 *  12. DIE WICHTIGSTE GEGENPROBE — das Tarif-Gate: ein Produkt, das der Tarif
 *      dieser Community nicht enthält, bleibt unsichtbar, auch wenn das
 *      Override es nennt (mit und ohne eigenes Label). Das Menü darf nichts
 *      freischalten (Zusage 1 in core/shared/communityNavigation.ts).
 *  13. UNTERPUNKTE (U15 Teil 3, seit 2026-09-08): eine Gruppe mit zwei Kindern
 *      erscheint als AUSLÖSER (`data-nav-group`), und die Kinder stehen nicht
 *      mehr als Hauptpunkte in der Reihe. Drei Gegenproben: Hauptpunkt
 *      ausgeblendet ⇒ die Kinder sind wieder Hauptpunkte (Zusage 6) · Gruppe
 *      ohne Kinder ⇒ sie erscheint gar nicht (Zusage 7) · das Schema weist
 *      Ebene zwei und eine Gruppe mit eigenem Ziel ab.
 *
 * Setzt am Ende alles zurück und räumt jede angelegte Zeile weg — auch die
 * `community_navigation`-Rows im Runtime-Projekt und die Seite, die für den
 * Link-Beweis angelegt wurde.
 *
 * VORAUSSETZUNG — zwei laufende Dev-Server AUS DEM WORKTREE (eigene Ports,
 * damit parallele Sessions sich nicht in die Quere kommen; `exec nuxi dev`,
 * weil `dev -- --port` den Port NICHT durchreicht):
 *   pnpm --filter control exec nuxi dev --port 3164
 *   NUXT_ONBOARDING_CONTROL_URL=http://localhost:3164 \
 *     pnpm --filter platform exec nuxi dev --port 3165
 *
 *   PLATFORM_PORT=3165 POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/pages/scripts/verify-community-navigation.mjs
 *
 * POOL_KEY ist der Schlüssel des RUNTIME-Projekts (lokal `reddit-comments`) —
 * `NUXT_APPWRITE_KEY` aus apps/platform/.env. Er wird für drei Dinge gebraucht:
 * Test-Konten anlegen, die `community_navigation`-Row am Ende wegräumen und die
 * Gegenprobe „mit dem Admin-Key geht es doch" in Abschnitt 13.
 */
import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const PORT = Number(process.env.PLATFORM_PORT || 3165)
// Lokal ist der Kontroll-Host `app.localhost` (NUXT_PUBLIC_TENANCY_CONTROL_HOSTS
// in apps/platform/.env); produktiv ist es account.pukalani.app.
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'pool'
const poolKey = process.env.POOL_KEY
// Beide Projekte tragen lokal dieselbe Datenbank-Id ('main'); der Override ist
// für Umgebungen da, in denen sie auseinanderfallen.
const poolDatabaseId = process.env.POOL_DATABASE_ID || databaseId

const NAV_TABLE = 'community_navigation'

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
const cleanup = { users: [], codes: [], tenants: [], members: [], navRows: [], pages: [] }

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
 * Der Bereich des SSR-HTML, in dem die Haupt-Navigation steht.
 *
 * Vom Haken `data-testid="chrome-nav"` bis zum Ende der Kopfzeile. Bewusst
 * NICHT bis zum Ende des `<div>`: verschachtelte Elemente lassen sich mit
 * Zeichenkettensuche nicht sauber schliessen, `</header>` dagegen schon. Im
 * Bereich liegen ausser den Menü-Einträgen nur die Utilities und der
 * Anmelde-Knopf — geprüft wird ohnehin auf Ziel-Adressen und gestempelte
 * Texte, die dort nicht vorkommen können.
 */
function navRegion(html) {
  const start = html.indexOf('data-testid="chrome-nav"')
  if (start === -1) return ''
  const end = html.indexOf('</header>', start)
  return html.slice(start, end === -1 ? html.length : end)
}

/**
 * Die Links der Haupt-Navigation in DOKUMENT-Reihenfolge (= Anzeigereihenfolge).
 *
 * KOMMENTARE FLIEGEN ZUERST RAUS, und das ist kein Schönheitsschritt: der
 * Template-Kommentar über dem externen Link steht wörtlich im SSR-HTML und
 * enthält die Zeichenfolge `<a>`. Ohne dieses Wegräumen findet die Suche vier
 * Treffer OHNE `href` und meldet ein leeres Menü — der Beweis wäre rot, obwohl
 * die Seite richtig ist (beim Bau genau so passiert). Vues Fragment-Marker
 * (`<!--[-->`) gehen im selben Zug mit.
 */
function navLinks(html) {
  const region = navRegion(html).replace(/<!--[\s\S]*?-->/g, '')
  const links = []
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let match
  while ((match = re.exec(region)) !== null) {
    const attrs = match[1]
    const text = match[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
    links.push({ href: attrs.match(/href="([^"]*)"/)?.[1] ?? '', text, attrs })
  }
  return links
}

const hrefsOf = html => navLinks(html).map(link => link.href)
const linkFor = (html, href) => navLinks(html).find(link => link.href === href) ?? null
/** Nur die Ziele, um die es in diesem Beweis geht — in ihrer Reihenfolge. */
const orderOf = (html, watched) => hrefsOf(html).filter(href => watched.includes(href))

async function createPoolUser(tag) {
  const email = `u15-${tag}-${Date.now()}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `U15 ${tag}` })
  cleanup.users.push(user.$id)
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
  const code = `PUKA-U15${tag}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const row = await control.createRow({
    databaseId,
    tableId: 'invite_codes',
    rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex'),
      label: 'U15-Beweis',
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
      name,
      slug,
      purpose: 'new',
      memberRange: 'to100',
      category: 'club',
      goal: 'discussion',
      description: 'U15-Beweis: der Owner stellt sein Menü selbst zusammen.',
      vibe: 'fresh',
      inviteCode: code,
      locale: 'de',
    },
  })
  if (created.status !== 200 || !created.json?.communityId) {
    throw new Error(`Community ${slug} nicht angelegt (${created.status}): ${created.text.slice(0, 200)}`)
  }
  cleanup.tenants.push(created.json.communityId)
  cleanup.navRows.push(created.json.communityId)
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

/** Das Menü dieser Community speichern (die Route ist die einzige Schreibstelle). */
const patchNav = (host, cookie, entries) =>
  call(host, '/api/pages/navigation', { method: 'PATCH', cookie, body: { entries } })

/**
 * Auf eine Wirkung im SSR-HTML warten.
 *
 * NUR FÜR DEN TARIF-WECHSEL (Abschnitt 14) — und das ist die dokumentierte
 * Latenz: der Plan steht in `communities` im CONTROL-Projekt, und der
 * Tenant-Resolver der Platform-App cacht die Host-Auflösung 30 s. Nach einem
 * PATCH auf das MENÜ wird dagegen NICHT gewartet: die Schreib-Route verwirft
 * den Eintrag ihres Mandanten sofort (`forgetCommunityNavOverride`).
 */
async function waitForSsr(host, predicate, timeoutMs = 60_000) {
  const started = Date.now()
  let last = await page(host, '/')
  while (Date.now() - started < timeoutMs) {
    if (predicate(last.text)) return { ok: true, ms: Date.now() - started, html: last.text }
    await new Promise(resolve => setTimeout(resolve, 2000))
    last = await page(host, '/')
  }
  return { ok: predicate(last.text), ms: Date.now() - started, html: last.text }
}

try {
  console.log(`\nU15-Beweis (Navigations-Editor) gegen http://localhost:${PORT} (Pool ${poolProject})\n`)

  const owner = await createPoolUser('owner')
  const neighbor = await createPoolUser('neighbor')

  const ownerControlCookie = await login(CONTROL_HOST, owner)
  const neighborControlCookie = await login(CONTROL_HOST, neighbor)
  const stamp = Date.now().toString(36)

  console.log('1. Zwei Communities anlegen (kunde-a: Owner-Mitglied, kunde-b: fremd)')
  const siteA = await createCommunity(ownerControlCookie, `u15-kunde-a-${stamp}`, 'U15 Kunde A')
  const siteB = await createCommunity(neighborControlCookie, `u15-kunde-b-${stamp}`, 'U15 Kunde B')
  check('kunde-a angelegt', !!siteA.host, JSON.stringify(siteA))
  check('kunde-b angelegt', !!siteB.host, JSON.stringify(siteB))
  check('kunde-a antwortet', !!(await waitForHost(siteA.host)))
  check('kunde-b antwortet', !!(await waitForHost(siteB.host)))

  const ownerCookieA = await login(siteA.host, owner)

  console.log('\n2. Ohne Row: das Menü des Bauplans, unverändert')
  const emptyGet = await call(siteA.host, '/api/pages/navigation')
  check('GET → 200', emptyGet.status === 200, `Status ${emptyGet.status}`)
  check('GET liefert `{entries: []}` (keine Row = keine eigene Wahl)',
    Array.isArray(emptyGet.json?.entries) && emptyGet.json.entries.length === 0,
    JSON.stringify(emptyGet.json))

  // Als GAST gemessen — das Menü ist die öffentliche Fläche, und eingeloggt
  // kämen die `requiresAuth`-Einträge dazu (mehr als 5 ⇒ Überlauf-Dropdown,
  // dessen Inhalt beim SSR gar nicht gerendert wird).
  const base = await page(siteA.host, '/')
  check('Startseite SSR 200', base.status === 200, `Status ${base.status}`)
  check('die Navigations-Reihe steht im SSR-HTML (data-testid="chrome-nav")',
    navRegion(base.text).length > 0, `HTML-Anfang: ${base.text.slice(0, 200)}`)
  // Was der Bauplan hier anbietet: feed(10) · discussions(11) · events(20) ·
  // die veröffentlichte CMS-Seite `guidelines`(60). Die Zahlen sind `order`
  // aus den app.config.ts der Layer.
  const WATCHED = ['/feed', '/discussions', '/events', '/guidelines']
  const baseOrder = orderOf(base.text, WATCHED)
  check('Standard-Menü steht nach `order` im HTML (feed · discussions · events · guidelines)',
    JSON.stringify(baseOrder) === JSON.stringify(WATCHED), JSON.stringify(baseOrder))
  check('kein Überlauf-Dropdown (sonst misst dieser Beweis Löcher statt Einträge)',
    !base.text.includes('data-testid="chrome-nav-more"'))

  const shippedFeed = linkFor(base.text, '/feed')?.text ?? ''
  const shippedEvents = linkFor(base.text, '/events')?.text ?? ''
  check('die mitgelieferten Texte stehen im HTML (Ausgangspunkt fürs Umbenennen)',
    !!shippedFeed && !!shippedEvents, `feed="${shippedFeed}" events="${shippedEvents}"`)

  console.log('\n3. Umordnen')
  const reorder = await patchNav(siteA.host, ownerCookieA, [{ id: 'events' }, { id: 'feed' }])
  check('PATCH → 200 und die Antwort ist der gespeicherte Stand',
    reorder.status === 200 && reorder.json?.entries?.length === 2,
    `Status ${reorder.status} ${reorder.text.slice(0, 160)}`)
  // OHNE WARTEN: die Schreib-Route verwirft den Cache-Eintrag ihres Mandanten.
  const reordered = await page(siteA.host, '/')
  const reorderedOrder = orderOf(reordered.text, WATCHED)
  check('SSR-HTML: /events steht jetzt VOR /feed',
    reorderedOrder.indexOf('/events') === 0 && reorderedOrder.indexOf('/feed') === 1,
    JSON.stringify(reorderedOrder))
  check('Gegenprobe: vorher war es andersherum',
    baseOrder.indexOf('/feed') < baseOrder.indexOf('/events'), JSON.stringify(baseOrder))
  check('nicht erwähnte Einträge hängen HINTEN an, statt zu verschwinden (Zusage 3)',
    reorderedOrder.includes('/discussions') && reorderedOrder.includes('/guidelines'),
    JSON.stringify(reorderedOrder))

  console.log('\n4. Ausblenden')
  const hide = await patchNav(siteA.host, ownerCookieA, [{ id: 'events', hidden: true }])
  check('PATCH → 200', hide.status === 200, `Status ${hide.status}`)
  const hidden = await page(siteA.host, '/')
  check('SSR-HTML: /events ist WEG', !hrefsOf(hidden.text).includes('/events'),
    JSON.stringify(orderOf(hidden.text, WATCHED)))
  check('Gegenprobe: vorher war /events da', baseOrder.includes('/events'))
  check('die anderen Einträge stehen unverändert', orderOf(hidden.text, WATCHED).includes('/feed'))

  console.log('\n5. Umbenennen')
  const ownLabel = `Wohnzimmer-${stamp}`
  const rename = await patchNav(siteA.host, ownerCookieA, [{ id: 'feed', label: ownLabel }])
  check('PATCH → 200', rename.status === 200, `Status ${rename.status}`)
  const renamed = await page(siteA.host, '/')
  check('SSR-HTML: der eigene Text steht am Eintrag', linkFor(renamed.text, '/feed')?.text === ownLabel,
    `gemessen "${linkFor(renamed.text, '/feed')?.text}"`)
  check('… und der mitgelieferte Text steht NICHT mehr im Menü',
    !navLinks(renamed.text).some(link => link.text === shippedFeed), `mitgeliefert "${shippedFeed}"`)
  const reset = await patchNav(siteA.host, ownerCookieA, [{ id: 'feed', label: '' }])
  check('Gegenprobe: leeres Label → 200', reset.status === 200, `Status ${reset.status}`)
  const resetHtml = await page(siteA.host, '/')
  check('… und der mitgelieferte Text ist zurück', linkFor(resetHtml.text, '/feed')?.text === shippedFeed,
    `gemessen "${linkFor(resetHtml.text, '/feed')?.text}"`)

  console.log('\n6. Eigener EXTERNER Link')
  const externalUrl = 'https://example.com/handbuch'
  const externalLabel = `Handbuch-${stamp}`
  const external = await patchNav(siteA.host, ownerCookieA, [
    { id: 'link-1', label: externalLabel, to: externalUrl, external: true },
  ])
  check('PATCH → 200', external.status === 200, `Status ${external.status} ${external.text.slice(0, 160)}`)
  const externalHtml = await page(siteA.host, '/')
  const externalLink = linkFor(externalHtml.text, externalUrl)
  check('SSR-HTML: der Link steht mit seinem Text im Menü', externalLink?.text === externalLabel,
    `gemessen "${externalLink?.text}"`)
  check('… trägt target="_blank"', !!externalLink?.attrs.includes('target="_blank"'), externalLink?.attrs)
  check('… und rel="noopener" (nimmt der Zielseite den window.opener-Griff)',
    !!externalLink?.attrs.includes('rel="noopener"'), externalLink?.attrs)
  check('… und ist als eigener externer Link erkennbar (data-nav-external)',
    !!externalLink?.attrs.includes('data-nav-external="true"'), externalLink?.attrs)

  console.log('\n7. https-Pflicht: alles andere wird abgewiesen')
  for (const [label, to] of [
    ['http:// (ungesichert)', 'http://example.com/handbuch'],
    ['javascript: (Skript im Menü)', 'javascript:alert(1)'],
    ['//evil.example (protokollrelativ = fremder Server)', '//evil.example'],
  ]) {
    const res = await patchNav(siteA.host, ownerCookieA, [
      { id: 'link-9', label: 'Unfug', to, external: true },
    ])
    check(`${label} → 400`, res.status === 400, `Status ${res.status} ${res.text.slice(0, 120)}`)
  }
  const afterJunk = await call(siteA.host, '/api/pages/navigation')
  check('nach allen Ablehnungen steht die gute Wahl unverändert',
    afterJunk.json?.entries?.[0]?.to === externalUrl, JSON.stringify(afterJunk.json))

  console.log('\n8. Eigener INTERNER Link: nur auf Seiten, die es hier wirklich gibt')
  const unknown = await patchNav(siteA.host, ownerCookieA, [
    { id: 'link-2', label: 'Nirgendwo', to: `/gibt-es-nicht-${stamp}` },
  ])
  check('unbekannte Seite → 400', unknown.status === 400, `Status ${unknown.status}`)
  check('… mit Begründung `unknown_page` im Umschlag', unknown.json?.reason === 'unknown_page',
    JSON.stringify(unknown.json))

  // Gegenprobe mit einer WIRKLICH veröffentlichten Seite. Bewusst ein
  // RECHTS-Slug (`terms`): der landet im Fuß und nicht in der Hauptnavigation,
  // der Beweis bekommt dadurch also keinen sechsten Menüpunkt (ab 6 wandert
  // der Rest ins Dropdown und steht nicht mehr im SSR-HTML).
  const pageSlug = 'terms'
  const pagePut = await call(siteA.host, '/api/pages', {
    method: 'PUT',
    cookie: ownerCookieA,
    body: { slug: pageSlug, locale: 'en', title: `U15 Terms ${stamp}`, body: 'U15', status: 'published' },
  })
  check(`Vorbedingung: /${pageSlug} ist in kunde-a veröffentlicht`, pagePut.status === 200,
    `Status ${pagePut.status} ${pagePut.text.slice(0, 160)}`)
  if (pagePut.status === 200) cleanup.pages.push({ host: siteA.host, cookie: ownerCookieA, slug: pageSlug })

  const internal = await patchNav(siteA.host, ownerCookieA, [
    { id: 'link-1', label: externalLabel, to: externalUrl, external: true },
    { id: 'link-2', label: `Regeln-${stamp}`, to: `/${pageSlug}` },
  ])
  check('Gegenprobe: Link auf die veröffentlichte Seite → 200', internal.status === 200,
    `Status ${internal.status} ${internal.text.slice(0, 160)}`)
  const internalHtml = await page(siteA.host, '/')
  check(`SSR-HTML: der interne Link zeigt auf /${pageSlug}`,
    linkFor(internalHtml.text, `/${pageSlug}`)?.text === `Regeln-${stamp}`,
    `gemessen "${linkFor(internalHtml.text, `/${pageSlug}`)?.text}"`)
  check('… und ist KEIN externer Link (kein target="_blank")',
    !linkFor(internalHtml.text, `/${pageSlug}`)?.attrs.includes('target="_blank"'))

  console.log('\n9. Umbenennen ja, UMLENKEN nein')
  for (const [label, entry] of [
    ['eigenes Ziel an einem Produkt-Eintrag', { id: 'feed', to: '/anderswo' }],
    ['externes Ziel an einem Produkt-Eintrag', { id: 'feed', to: 'https://evil.example', external: true }],
    ['blosses `external` an einem Produkt-Eintrag', { id: 'feed', external: true }],
  ]) {
    const res = await patchNav(siteA.host, ownerCookieA, [entry])
    check(`${label} → 400`, res.status === 400, `Status ${res.status} ${res.text.slice(0, 120)}`)
  }
  const stillLinked = await page(siteA.host, '/')
  check('der Produkt-Eintrag zeigt weiter auf sein eigenes Ziel',
    hrefsOf(stillLinked.text).includes('/feed'), JSON.stringify(orderOf(stillLinked.text, WATCHED)))

  console.log('\n10. Autorisierung')
  const neighborCookieA = await login(siteA.host, neighbor)
  const stranger = await patchNav(siteA.host, neighborCookieA, [{ id: 'feed', hidden: true }])
  check('Fremder (Owner von kunde-b) auf kunde-a → 403', stranger.status === 403, `Status ${stranger.status}`)
  const anonymous = await call(siteA.host, '/api/pages/navigation', {
    method: 'PATCH',
    body: { entries: [{ id: 'feed', hidden: true }] },
  })
  check('nicht angemeldet → 401/403', [401, 403].includes(anonymous.status), `Status ${anonymous.status}`)
  const untouched = await call(siteA.host, '/api/pages/navigation')
  check('nichts geschrieben (die Wahl des Owners steht unverändert)',
    untouched.json?.entries?.length === 2, JSON.stringify(untouched.json))

  console.log('\n11. Mandanten-Isolation: kunde-b sieht das Menü von kunde-a nicht')
  const navB = await call(siteB.host, '/api/pages/navigation')
  check('kunde-b: GET liefert `{entries: []}`',
    navB.status === 200 && navB.json?.entries?.length === 0, `Status ${navB.status} ${JSON.stringify(navB.json)}`)
  const htmlB = await page(siteB.host, '/')
  check('kunde-b: der fremde Link steht NICHT im HTML', !htmlB.text.includes(externalLabel))
  check('kunde-b: das eigene Standard-Menü steht da',
    JSON.stringify(orderOf(htmlB.text, WATCHED)) === JSON.stringify(WATCHED),
    JSON.stringify(orderOf(htmlB.text, WATCHED)))

  console.log('\n12. Kontroll-Host: die Route gibt es dort nicht')
  const onControl = await call(CONTROL_HOST, '/api/pages/navigation', {
    method: 'PATCH',
    cookie: ownerControlCookie,
    body: { entries: [{ id: 'feed', hidden: true }] },
  })
  check('PATCH auf dem Kontroll-Host → 404', onControl.status === 404, `Status ${onControl.status}`)
  const getOnControl = await call(CONTROL_HOST, '/api/pages/navigation')
  check('GET auf dem Kontroll-Host → 404', getOnControl.status === 404, `Status ${getOnControl.status}`)

  /**
   * 13. LEAST PRIVILEGE (Davids Entscheidung 2026-08-13): `community_navigation`
   *     trägt KEINE Client-Rechte. Es liest niemand — es wird gelesen: der
   *     Server holt die Zeile mit dem Admin-Client und gibt sie über die
   *     öffentliche Route heraus, die vorher das Publikum prüft.
   *
   *     OHNE DIE GEGENPROBE WÄRE DAS GRÜN, WENN DIE TABELLE GAR NICHT
   *     EXISTIERTE — deshalb steht neben jedem verweigerten Zugriff derselbe
   *     mit dem Admin-Key.
   */
  console.log('\n13. Least Privilege: die Row ist mit einer Session NICHT lesbar')
  let tablePermissions = null
  try {
    const table = await poolDb.getTable({ databaseId: poolDatabaseId, tableId: NAV_TABLE })
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
    await sessionDb.getRow({ databaseId: poolDatabaseId, tableId: NAV_TABLE, rowId: siteA.communityId })
  }
  catch (error) { sessionGet = `${error?.code} ${error?.type}` }
  check(`Owner-Session: getRow scheitert (${sessionGet})`, sessionGet !== 'gelesen(!)')

  let sessionList = 'gelesen(!)'
  try {
    await sessionDb.listRows({ databaseId: poolDatabaseId, tableId: NAV_TABLE, queries: [Query.limit(25)] })
  }
  catch (error) { sessionList = `${error?.code} ${error?.type}` }
  check(`Owner-Session: listRows scheitert (${sessionList})`, sessionList !== 'gelesen(!)')

  const adminRow = await poolDb.getRow({ databaseId: poolDatabaseId, tableId: NAV_TABLE, rowId: siteA.communityId })
  check('Gegenprobe: mit dem Admin-Key steht die Row da (die Tabelle EXISTIERT)',
    typeof adminRow?.config === 'string' && adminRow.config.includes(externalLabel),
    String(adminRow?.config).slice(0, 120))
  const adminList = await poolDb.listRows({ databaseId: poolDatabaseId, tableId: NAV_TABLE, queries: [Query.limit(25)] })
  check('Gegenprobe: mit dem Admin-Key listet sie sich auch', adminList.total >= 1, `total ${adminList.total}`)

  const publicStillWorks = await call(siteA.host, '/api/pages/navigation')
  check('… und die öffentliche Route liefert das Menü weiterhin aus (der Server kommt ran, der Client nicht)',
    publicStillWorks.status === 200 && publicStillWorks.json?.entries?.length === 2,
    `Status ${publicStillWorks.status} ${publicStillWorks.text.slice(0, 120)}`)

  /**
   * 14. DIE WICHTIGSTE GEGENPROBE — das Menü schaltet NICHTS frei.
   *
   * `candidates` ist autoritativ (Zusage 1): das Tarif-Gate (`planAllows`, C2)
   * läuft VOR der Auflösungsregel, ein Produkt ausserhalb des Tarifs steht
   * deshalb gar nicht erst zur Wahl. Gemessen wird das am schärfsten Fall:
   * das Override NENNT das Produkt — einmal mit eigenem Text, einmal ohne.
   */
  console.log('\n14. Tarif-Gate: was der Tarif nicht enthält, holt auch das Menü nicht zurück')
  await control.updateRow({ databaseId, tableId: 'communities', rowId: siteA.communityId, data: { plan: 'basic' } })
  // Warten ist hier PFLICHT und hat einen Grund: der Plan steht im
  // Control-Projekt, der Tenant-Resolver der Platform-App cacht ihn 30 s.
  const downgraded = await waitForSsr(siteA.host, html => !hrefsOf(html).includes('/feed'))
  check(`kunde-a steht auf Tarif "basic" (nach ${Math.round(downgraded.ms / 1000)} s)`, downgraded.ok,
    JSON.stringify(orderOf(downgraded.html, WATCHED)))

  const smuggleLabel = `Termine-${stamp}`
  const smuggle = await patchNav(siteA.host, ownerCookieA, [
    { id: 'events', label: smuggleLabel },
    { id: 'feed' },
  ])
  check('das Override NENNT die gesperrten Produkte → PATCH 200 (gespeichert wird es)',
    smuggle.status === 200, `Status ${smuggle.status} ${smuggle.text.slice(0, 160)}`)
  const smuggled = await page(siteA.host, '/')
  check('SSR-HTML: /events bleibt weg', !hrefsOf(smuggled.text).includes('/events'),
    JSON.stringify(orderOf(smuggled.text, WATCHED)))
  // Geprüft wird die KOPFZEILE, nicht das ganze Dokument: die gespeicherte Wahl
  // reist als SSR-Payload mit (useAsyncData) und steht damit ohnehin im HTML —
  // sie ist über `GET /api/pages/navigation` auch öffentlich lesbar. Die Zusage
  // ist, dass sie nicht GERENDERT wird.
  check('… auch der eigene Text steht nicht im Menü', !navRegion(smuggled.text).includes(smuggleLabel))
  check('… und /feed bleibt ebenfalls weg (der Tarif entscheidet, nicht das Menü)',
    !hrefsOf(smuggled.text).includes('/feed'), JSON.stringify(orderOf(smuggled.text, WATCHED)))

  const plainSmuggle = await patchNav(siteA.host, ownerCookieA, [{ id: 'events' }])
  check('dasselbe OHNE eigenes Label → 200', plainSmuggle.status === 200, `Status ${plainSmuggle.status}`)
  const plainHtml = await page(siteA.host, '/')
  check('SSR-HTML: /events bleibt weg', !hrefsOf(plainHtml.text).includes('/events'),
    JSON.stringify(orderOf(plainHtml.text, WATCHED)))
  check('die Seite rendert dabei normal weiter (die CMS-Seite steht noch im Menü)',
    hrefsOf(plainHtml.text).includes('/guidelines'), JSON.stringify(orderOf(plainHtml.text, WATCHED)))
  const storedAnyway = await call(siteA.host, '/api/pages/navigation')
  check('die Wahl bleibt GESPEICHERT (Zusage 2: unbekannte Id wird ignoriert, nicht gelöscht)',
    storedAnyway.json?.entries?.[0]?.id === 'events', JSON.stringify(storedAnyway.json))

  /**
   * 15. UNTERPUNKTE (U15 Teil 3, Davids Entscheidung 2026-09-08).
   *
   * GEMESSEN WIRD IM SSR-HTML, wie überall in diesem Beweis. Der Aufklapper
   * selbst rendert seinen INHALT beim Seitenaufbau NICHT (ein `UDropdownMenu`
   * baut ihn erst beim Öffnen) — und genau das macht die Messung scharf: steht
   * das Ziel eines Kindes nicht mehr in der Kopfzeile, ist es wirklich unter
   * seinen Hauptpunkt gewandert und nicht bloss umsortiert. Der Auslöser trägt
   * dafür den Haken `data-nav-group="<id>"`.
   *
   * TARIF ZUERST ZURÜCK: Abschnitt 14 hat kunde-a auf `basic` gesetzt, und
   * `basic` sperrt auch `/discussions` — der erste Lauf am 2026-09-08 war
   * hier viermal rot, weil die „Kinder" gar nicht mehr im Menü standen (die
   * Gruppen-Prüfung wäre damit eine Tautologie gewesen). Deshalb erst auf
   * `pro` (enthält alles), auf das SSR-HTML warten, und die Vorbedingung
   * NACHSEHEN statt annehmen.
   */
  console.log('\n15. Unterpunkte: Gruppe, Kinder, und was passiert, wenn der Hauptpunkt ausgeht')
  await control.updateRow({ databaseId, tableId: 'communities', rowId: siteA.communityId, data: { plan: 'pro' } })
  const upgraded = await waitForSsr(siteA.host, html => hrefsOf(html).includes('/discussions'))
  check(`kunde-a steht wieder auf Tarif "pro" (nach ${Math.round(upgraded.ms / 1000)} s)`, upgraded.ok,
    JSON.stringify(hrefsOf(upgraded.html)))
  const beforeGroup = await patchNav(siteA.host, ownerCookieA, [])
  check('Vorbedingung: zurück auf das Standard-Menü → 200', beforeGroup.status === 200, `Status ${beforeGroup.status}`)
  const plainHtml2 = await page(siteA.host, '/')
  const KINDER = ['/discussions', '/guidelines']
  check('Vorbedingung: beide künftigen Kinder stehen als HAUPTPUNKTE im HTML',
    KINDER.every(href => hrefsOf(plainHtml2.text).includes(href)),
    JSON.stringify(hrefsOf(plainHtml2.text)))

  const groupLabel = `Bereiche-${stamp}`
  const grouped = await patchNav(siteA.host, ownerCookieA, [
    { id: 'group-1', label: groupLabel },
    { id: 'discussions', parent: 'group-1' },
    { id: 'page-guidelines', parent: 'group-1' },
  ])
  check('Gruppe + zwei Kinder speichern → 200', grouped.status === 200,
    `Status ${grouped.status} ${grouped.text.slice(0, 200)}`)
  const groupedHtml = await page(siteA.host, '/')
  check(`SSR-HTML: der Auslöser steht da (data-nav-group="group-1", Text „${groupLabel}")`,
    navRegion(groupedHtml.text).includes('data-nav-group="group-1"')
    && navRegion(groupedHtml.text).includes(groupLabel),
    navRegion(groupedHtml.text).slice(0, 300))
  check('… und die Kinder stehen NICHT mehr als Hauptpunkte in der Reihe',
    KINDER.every(href => !hrefsOf(groupedHtml.text).includes(href)),
    JSON.stringify(hrefsOf(groupedHtml.text)))
  check('Gegenprobe: vorher standen genau diese beiden dort',
    KINDER.every(href => hrefsOf(plainHtml2.text).includes(href)))

  console.log('\n15b. Gegenprobe (Zusage 6): Hauptpunkt ausgeblendet ⇒ die Kinder stehen als Hauptpunkte')
  const hiddenGroup = await patchNav(siteA.host, ownerCookieA, [
    { id: 'group-1', label: groupLabel, hidden: true },
    { id: 'discussions', parent: 'group-1' },
    { id: 'page-guidelines', parent: 'group-1' },
  ])
  check('PATCH → 200', hiddenGroup.status === 200, `Status ${hiddenGroup.status}`)
  const hiddenGroupHtml = await page(siteA.host, '/')
  check('SSR-HTML: der Auslöser ist weg', !navRegion(hiddenGroupHtml.text).includes('data-nav-group="group-1"'))
  check('… und beide Kinder stehen wieder als Hauptpunkte da (nichts ist verschwunden)',
    KINDER.every(href => hrefsOf(hiddenGroupHtml.text).includes(href)),
    JSON.stringify(hrefsOf(hiddenGroupHtml.text)))

  console.log('\n15c. Gegenprobe (Zusage 7): eine Gruppe ohne Kinder ist ein toter Klick und erscheint nicht')
  const lonelyGroup = await patchNav(siteA.host, ownerCookieA, [{ id: 'group-1', label: groupLabel }])
  check('PATCH → 200 (gespeichert wird sie)', lonelyGroup.status === 200, `Status ${lonelyGroup.status}`)
  const lonelyHtml = await page(siteA.host, '/')
  check('SSR-HTML: kein Auslöser', !navRegion(lonelyHtml.text).includes('data-nav-group="group-1"'))
  check('… und ihr Text steht nicht im Menü', !navRegion(lonelyHtml.text).includes(groupLabel),
    navRegion(lonelyHtml.text).slice(0, 300))
  check('… die übrigen Einträge stehen unverändert (kein Loch in der Reihe)',
    KINDER.every(href => hrefsOf(lonelyHtml.text).includes(href)),
    JSON.stringify(hrefsOf(lonelyHtml.text)))

  console.log('\n15d. Das Schema hält die eine Ebene und die Gruppen-Form')
  for (const [label, entries] of [
    ['`parent` zeigt auf ein KIND (Ebene zwei)', [
      { id: 'discussions' },
      { id: 'page-guidelines', parent: 'discussions' },
      { id: 'group-1', label: 'X', parent: 'page-guidelines' },
    ]],
    ['`parent` steht nicht im Dokument', [{ id: 'discussions', parent: 'gibt-es-nicht' }]],
    ['`parent` zeigt auf sich selbst', [{ id: 'discussions', parent: 'discussions' }]],
    ['Gruppe MIT eigenem Ziel', [{ id: 'group-2', label: 'X', to: '/discussions' }]],
    ['Gruppe MIT external', [{ id: 'group-2', label: 'X', external: true }]],
    ['Gruppe OHNE Text', [{ id: 'group-2' }]],
  ]) {
    const res = await patchNav(siteA.host, ownerCookieA, entries)
    check(`${label} → 400`, res.status === 400, `Status ${res.status} ${res.text.slice(0, 140)}`)
  }
  const afterSchema = await call(siteA.host, '/api/pages/navigation')
  check('nach allen Ablehnungen steht die letzte gute Wahl unverändert',
    afterSchema.json?.entries?.length === 1 && afterSchema.json.entries[0]?.id === 'group-1',
    JSON.stringify(afterSchema.json))
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n16. Aufräumen')
  for (const p of cleanup.pages) {
    await call(p.host, `/api/pages/${p.slug}`, { method: 'DELETE', cookie: p.cookie }).catch(() => {})
  }
  for (const id of cleanup.navRows) {
    await poolDb.deleteRow({ databaseId: poolDatabaseId, tableId: NAV_TABLE, rowId: id }).catch(() => {})
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
