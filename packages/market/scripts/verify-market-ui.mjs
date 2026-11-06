/**
 * Beweis für MV1 M4 — „Oberfläche": die Seite „Markt", der Quellen-Wähler, das
 * Opt-in fremder Marken, die Rolle `self` und der Eintrag in der
 * Werkstatt-Leiste, gegen ECHTE Routen, echte SSR-Seiten und die echte Ablage.
 *
 * Geprüft werden die Zusagen, die keine pure Funktion belegen kann:
 *
 *  1. GESPERRT VOR KAPITEL B (§2.4): die Seite antwortet 200 und ERKLÄRT die
 *     Sperre — kein 404. Mit GEGENPROBE: nach der Abnahme steht die
 *     Kandidatenliste da und der Sperr-Text ist weg.
 *  2. DATENTÜR: ein fremdes Branding und der Aufruf ohne Anmeldung enden
 *     beide auf 404 (nie 403, nie eine halbe Seite).
 *  3. KEINE ROHEN i18n-SCHLÜSSEL im gerenderten HTML.
 *  4. QUELLEN-WÄHLER (§7.2): eigene Brandings, Bibliothek, freigegebene
 *     fremde Marken — mit GEGENPROBEN (das eigene Branding fehlt in seiner
 *     eigenen Liste; eine PRIVATE fremde Marke erscheint nirgends).
 *  5. OPT-IN: die Route schreibt die Spalte `brand_profiles.marketVisibility`
 *     und wirkt SOFORT in der Suche — in beide Richtungen.
 *  6. VERTRAULICHKEIT: das Marktprofil einer freigegebenen fremden Marke
 *     trägt ihren ÖFFENTLICHEN Satz und NICHT den Satz aus einer internen
 *     Session (`sensitivity: 'internal'`).
 *  7. WIDERRUF: nimmt die Eigentümerin die Freigabe zurück, schliesst der
 *     nächste Lauf den Kandidaten mit `withdrawn` aus — der schon
 *     geschriebene Bericht bleibt.
 *  8. ROLLE `self` (§7.2 Nr. 2): sie zählt NICHT gegen die fünf Wettbewerber,
 *     es gibt nur EINE davon, und sie erscheint weder in der Matrix noch in
 *     den drei Listen des Berichts.
 *  9. LEISTE: der Eintrag „Markt" steht im HTML einer brand-Seite (Dokument)
 *     — gesperrt vor der Abnahme, mit Befund-Zähler nach einem Bericht.
 *
 * ── WAS DIESER BEWEIS NICHT BEWEIST ──────────────────────────────────────
 * Den Klick. Er misst SSR-Antworten und Routen; ob ein Umschalter umschaltet
 * und ein Chip verschwindet, prüft der Mensch im Browser (Klick-Rezept im
 * Bericht des Pakets). Und er beweist keinen Anbieter: er läuft mit
 * `MARKET_DEV_STUB=1`, also ohne einen bezahlten Aufruf.
 *
 * ── EIN SERVERPROZESS JE BEWEIS ──────────────────────────────────────────
 * Die Eimer (3 Läufe und 3 Berichte je Branding und Tag, Instanz-Deckel,
 * IP-Bucket der Rate-Limit-Middleware) leben ohne Redis IM PROZESS. Dieser
 * Beweis fährt zwei Läufe auf DEMSELBEN Branding und liegt damit knapp unter
 * dem Tages-Deckel — vor dem Start den Dev-Server frisch hochfahren, sonst
 * meldet Schritt 7 ein 429 und das ist der Deckel, kein Fehler.
 *
 * ── VORBEDINGUNGEN ───────────────────────────────────────────────────────
 * Lokale Dev-Appwrite mit den `brand_*`- UND `market_*`-Tabellen (inkl.
 * market-004 und brand-019) und ein Dev-Server der branding-App AUS DEM
 * WORKTREE (CLAUDE.md, „Worktree-Beweise": ein Server aus dem Haupt-Repo misst
 * unveränderten Code).
 *
 *   BRAND_DEV_STUB_REVIEW=1 MARKET_DEV_STUB=1 BRAND_SITE_FETCH_ALLOW_LOOPBACK=1 \
 *     pnpm --filter branding exec nuxi dev --port 3016
 *   BRANDING_PORT=3016 node --env-file=apps/branding/.env \
 *     packages/market/scripts/verify-market-ui.mjs
 *
 * `KEEP=1` lässt das Test-Branding stehen (für den Klick-Beweis im Browser);
 * ohne das Flag räumt der Lauf alles wieder weg.
 *
 * ── DAS PRODUKT-GATE MUSS DAFÜR AN SEIN ──────────────────────────────────
 * `apps/branding/app/app.config.ts` steht auf `market: { enabled: false }`,
 * bis die Prod-Migrationen gelaufen sind (Begründung dort). AUS heisst seit
 * dem M4-Nachfix wirklich AUS: Seite, Leiste UND Routen antworten 404 — der
 * Beweis meldet dann lauter „nicht gefunden" und das ist der Schalter, kein
 * Fehler. Vor dem Lauf die eine Zeile lokal auf `true` stellen (und danach
 * NICHT mitcommitten, solange die Migration aussteht).
 */
import { createServer, request } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'
// Die BIBLIOTHEK selbst — Node 22 entfernt die Typen beim Laden, die Datei
// ist reine Daten ohne Import. Eine Schlüssel-Liste in diesem Skript wäre
// eine zweite Wahrheit über den Inhalt der Bibliothek (M6b).
import { MARKET_LIBRARY_ENTRIES } from '../shared/library/index.ts'

/** Die Schlüssel der ausgelieferten Bibliothek — höchstens die zehn der Liste. */
const LIBRARY_KEYS = MARKET_LIBRARY_ENTRIES.slice(0, 10).map(entry => entry.key)

const PORT = Number(process.env.BRANDING_PORT || 3016)
const HOST = process.env.BRANDING_HOST || 'localhost'
const KEEP = process.env.KEEP === '1'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — Aufruf mit --env-file=apps/branding/.env')
  process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(client)
const users = new Users(client)

let pass = 0
let fail = 0
const cleanup = { users: [], profiles: [], access: [], aiFlag: null }
const servers = []

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

// ── Die erfundenen Websites ────────────────────────────────────────────────

const DEMO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../.playground/public/demo-sites')

/** EIN Server je Demo-Site (Begründung: `verify-market-fetch.mjs`). */
async function startDemoSite(slug) {
  let origin = ''
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const relative = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '')
    const candidates = relative === '/' || relative === ''
      ? ['index.html']
      : [relative.slice(1), `${relative.slice(1)}.html`]
    for (const candidate of candidates) {
      try {
        const body = await readFile(join(DEMO_ROOT, slug, candidate))
        const type = candidate.endsWith('.xml')
          ? 'application/xml'
          : candidate.endsWith('.txt') || candidate.endsWith('.json')
            ? 'text/plain; charset=utf-8'
            : 'text/html; charset=utf-8'
        const text = candidate.endsWith('.xml')
          ? body.toString('utf8').replace(new RegExp(`https://${slug}\\.example`, 'g'), origin)
          : body
        res.writeHead(200, { 'content-type': type })
        res.end(text)
        return
      }
      catch { /* nächster Kandidat */ }
    }
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  origin = `http://127.0.0.1:${server.address().port}`
  servers.push(server)
  return { slug, origin }
}

// ── Der Dev-Server der branding-App ────────────────────────────────────────

/** node:http über ::1 mit gesetztem Host (CLAUDE.md, „Beweise"). */
function call(path, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolveCall, rejectCall) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: '::1',
      port: PORT,
      path,
      method,
      headers: {
        host: HOST,
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
        resolveCall({ status: res.statusCode, json, text })
      })
    })
    req.on('error', rejectCall)
    if (payload) req.write(payload)
    req.end()
  })
}

const stamp = Date.now()

async function makeAccount(tag) {
  const user = await users.create({
    userId: ID.unique(),
    email: `mv1-m4-${stamp}-${tag}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: 'MV1-M4-Beweis',
  })
  cleanup.users.push(user.$id)
  await users.updateEmailVerification({ userId: user.$id, emailVerification: true })
  const access = await tablesDB.createRow({
    databaseId,
    tableId: 'brand_access',
    rowId: ID.unique(),
    data: { userId: user.$id, grantedVia: 'operator', inviteId: '', revokedAt: null },
  })
  cleanup.access.push(access.$id)
  const session = await users.createSession({ userId: user.$id })
  return {
    id: user.$id,
    cookie: `a_session_${projectId}=${encodeURIComponent(session.secret)}`,
  }
}

async function ensureAiEnabled() {
  let row = null
  try {
    row = await tablesDB.getRow({ databaseId, tableId: 'app_config', rowId: 'global' })
  }
  catch { /* keine Zeile */ }
  if (row?.brandAiEnabled === true) return
  cleanup.aiFlag = row ? { existed: true, before: row.brandAiEnabled ?? null } : { existed: false }
  if (row) {
    await tablesDB.updateRow({ databaseId, tableId: 'app_config', rowId: 'global', data: { brandAiEnabled: true } })
  }
  else {
    await tablesDB.createRow({ databaseId, tableId: 'app_config', rowId: 'global', data: { brandAiEnabled: true } })
  }
}

async function createProfile(account, title) {
  const created = await call('/api/brand/profiles', {
    method: 'POST',
    cookie: account.cookie,
    body: {
      title,
      contentLocale: 'de',
      pathKind: 'new',
      hasName: true,
      team: 'solo',
      industry: 'Kaffeerösterei',
      about: 'Wir rösten Kaffee in kleinen Mengen.',
      audience: 'Cafés auf Maui.',
    },
  })
  const id = created.json?.profile?.id ?? created.json?.id
  if (!id) throw new Error(`Kein Branding angelegt (${created.status}): ${created.text.slice(0, 200)}`)
  cleanup.profiles.push(id)
  return id
}

/** Kapitel abnehmen — ohne Route, damit der Beweis nicht am Wizard hängt. */
async function acceptChapter(profileId, stepKey) {
  try {
    await tablesDB.updateRow({
      databaseId, tableId: 'brand_steps', rowId: `${profileId}_${stepKey}`, data: { state: 'done' },
    })
  }
  catch {
    await tablesDB.createRow({
      databaseId,
      tableId: 'brand_steps',
      rowId: `${profileId}_${stepKey}`,
      data: { profileId, stepKey, state: 'done', slots: '{}' },
    })
  }
}

/** Bestätigte eigene Felder setzen — die Form, die `confirmedSlotValues` liest. */
async function setConfirmed(profileId, stepKey, values) {
  const rowId = `${profileId}_${stepKey}`
  let existing = {}
  let state = 'active'
  try {
    const row = await tablesDB.getRow({ databaseId, tableId: 'brand_steps', rowId })
    existing = JSON.parse(row.slots || '{}')
    state = row.state ?? 'active'
  }
  catch { /* Zeile fehlt — wird angelegt */ }
  const slots = { ...existing }
  for (const [slotId, value] of Object.entries(values)) {
    slots[slotId] = { ...(slots[slotId] ?? {}), confirmed: value, updatedAt: new Date().toISOString() }
  }
  try {
    await tablesDB.updateRow({
      databaseId, tableId: 'brand_steps', rowId, data: { slots: JSON.stringify(slots) },
    })
  }
  catch {
    await tablesDB.createRow({
      databaseId,
      tableId: 'brand_steps',
      rowId,
      data: { profileId, stepKey, state, slots: JSON.stringify(slots) },
    })
  }
}

async function marketRows(table, profileId) {
  const res = await tablesDB.listRows({
    databaseId, tableId: table, queries: [Query.equal('profileId', profileId), Query.limit(200)],
  })
  return res.rows
}

/**
 * Sichtbarer TEXT einer SSR-Antwort. Skripte und Attribute fliegen raus, weil
 * dort der SSR-Payload steht: er trägt die rohen Antwort-Daten, und ein Grep
 * über das ganze HTML fände dort jeden i18n-Schlüssel, der irgendwo als Wert
 * vorkommt — genau der Fehler, an dem die erste UWG-Gegenprobe in M3
 * gescheitert ist.
 */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
}

// ── Der Lauf ───────────────────────────────────────────────────────────────

try {
  await ensureAiEnabled()

  const upcountry = await startDemoSite('upcountry-roast')
  const oldSite = await startDemoSite('kailua-coffee-old')

  const owner = await makeAccount('owner')
  const neighbour = await makeAccount('nachbar')
  const stranger = await makeAccount('fremd')

  const profileId = await createProfile(owner, 'Kailua Coffee')
  const secondOwn = await createProfile(owner, 'Kailua Cold Brew')
  const sharedId = await createProfile(neighbour, 'Northline Nachbar')
  const privateId = await createProfile(neighbour, 'Northline Privat')

  const base = `/api/market/profiles/${profileId}`
  const page = `/de/brand/${profileId}/market`

  // Die eigenen bestätigten Felder — ohne sie gäbe es nichts zu vergleichen.
  await setConfirmed(profileId, 'context', {
    'a.category': 'Kleine Rösterei',
    'a.pitch': 'Wir rösten Kaffee in kleinen Mengen für Cafés auf Maui und liefern selbst.',
    'a.audienceSketch': 'Cafés und Restaurants auf Maui.',
  })
  await setConfirmed(profileId, 'pvm', {
    'b.positioningFirstChoice': 'Wir kennen jede Farm persönlich.',
    'b.purpose': 'Kaffee soll rückverfolgbar bleiben.',
  })

  // Der Nachbar: EIN öffentlicher Satz und EIN interner. Der interne ist der
  // Kern von Prüfung 6 — er darf nirgends in einem fremden Marktprofil landen.
  const PUBLIC_SENTENCE = 'Wir liefern Bohnen an Cafés im ganzen Norden.'
  const INTERNAL_SENTENCE = 'Zweimal war die Lieferung zu spät und der Kunde hat sich beschwert.'
  await setConfirmed(sharedId, 'context', {
    'a.category': 'Grosshandel für Röstkaffee',
    'a.pitch': PUBLIC_SENTENCE,
    'a.complaints': INTERNAL_SENTENCE,
  })
  await setConfirmed(sharedId, 'pvm', { 'b.purpose': 'Guter Kaffee soll überall ankommen.' })
  await acceptChapter(sharedId, 'pvm')
  await setConfirmed(privateId, 'context', { 'a.category': 'Rösterei' })
  await acceptChapter(privateId, 'pvm')

  // ── 1 · Gesperrt vor Kapitel B ───────────────────────────────────────────
  console.log('\n1 · Vor der Abnahme von Kapitel B ist die Seite GESPERRT, nicht weg')
  const locked = await call(page, { cookie: owner.cookie })
  const lockedText = visibleText(locked.text)
  check('die Seite antwortet 200 (kein 404 für den eigenen Kunden)',
    locked.status === 200, String(locked.status))
  check('sie ERKLÄRT die Sperre („wartet auf Kapitel B")',
    lockedText.includes('wartet auf Kapitel B'), lockedText.slice(0, 200))
  check('GEGENPROBE: die Kandidatenliste steht dort NICHT',
    !lockedText.includes('Höchstens 5 Wettbewerber'), '')

  // ── 2 · Nach der Abnahme ────────────────────────────────────────────────
  console.log('\n2 · Nach der Abnahme steht die Kandidatenliste da')
  await acceptChapter(profileId, 'pvm')
  const open = await call(page, { cookie: owner.cookie })
  const openText = visibleText(open.text)
  check('200 mit Kandidaten-Abschnitt',
    open.status === 200 && openText.includes('Höchstens 5 Wettbewerber'),
    `${open.status}`)
  check('der Sperr-Text ist weg', !openText.includes('wartet auf Kapitel B'), '')
  check('die Schranke nennt den Beta-Zustand',
    openText.includes('Für euer Beta-Konto freigeschaltet'), '')
  check('die ehrliche Grenze steht im Kopf (§2.5)',
    openText.includes('nicht, wie erfolgreich sie damit sind'), '')
  check('das Opt-in steht in der rechten Spalte „Stand"',
    openText.includes('im Marktvergleich anderer Kunden erscheinen'), '')

  // ── 3 · Die Datentür ────────────────────────────────────────────────────
  console.log('\n3 · Fremd und ohne Anmeldung: 404, nicht 403 und keine halbe Seite')
  const foreign = await call(page, { cookie: stranger.cookie })
  check('fremdes Konto MIT Beta-Zugang ⇒ 404', foreign.status === 404, String(foreign.status))
  const anonymous = await call(page)
  check('ohne Anmeldung ⇒ 404', anonymous.status === 404, String(anonymous.status))

  // ── 4 · Keine rohen i18n-Schlüssel ──────────────────────────────────────
  console.log('\n4 · Im gerenderten Text steht kein roher Schlüssel')
  const rawKeys = openText.match(/\bmarket\.[a-z][A-Za-z0-9_.]+/g) ?? []
  check('kein `market.*` im sichtbaren Text', rawKeys.length === 0, rawKeys.slice(0, 5).join(', '))

  // ── 5 · Der Quellen-Wähler ──────────────────────────────────────────────
  console.log('\n5 · Der Quellen-Wähler liefert drei Listen (§7.2)')
  const foundation = await call(`${base}/candidates?source=foundation`, { cookie: owner.cookie })
  const foundationIds = (foundation.json?.options ?? []).map(o => o.id)
  check('eigene Brandings: das zweite ist dabei',
    foundation.status === 200 && foundationIds.includes(secondOwn),
    `${foundation.status} ${foundationIds.join(',')}`)
  check('GEGENPROBE: das AKTUELLE Branding steht nicht in seiner eigenen Liste',
    !foundationIds.includes(profileId), '')

  const library = await call(`${base}/candidates?source=library`, { cookie: owner.cookie })
  const libraryIds = (library.json?.options ?? []).map(o => o.id)
  // Seit M6b (2026-09-06) stehen dort ECHTE, von Hand geprüfte Marken statt
  // der zwei erfundenen Testeinträge — die Liste darf also nicht mehr auf
  // `demo-*` prüfen. Geprüft wird gegen die Bibliothek SELBST, damit ein
  // weiterer redaktioneller Eintrag den Beweis nicht rot macht.
  check('Bibliothek: die von Hand geprüften Einträge stehen da',
    library.status === 200 && LIBRARY_KEYS.length > 0 && LIBRARY_KEYS.every(key => libraryIds.includes(key)),
    `${library.status} ${libraryIds.join(',')}`)

  const sharedBefore = await call(`${base}/candidates?source=shared`, { cookie: owner.cookie })
  const sharedIdsBefore = (sharedBefore.json?.options ?? []).map(o => o.id)
  check('GEGENPROBE: ohne Opt-in gibt es keine fremde Marke',
    sharedBefore.status === 200 && !sharedIdsBefore.includes(sharedId),
    `${sharedBefore.status} ${sharedIdsBefore.join(',')}`)

  // ── 6 · Das Opt-in ──────────────────────────────────────────────────────
  console.log('\n6 · Das Opt-in schreibt die Spalte und wirkt sofort')
  const optIn = await call(`/api/market/profiles/${sharedId}/visibility`, {
    method: 'PATCH', cookie: neighbour.cookie, body: { marketVisibility: 'shared' },
  })
  check('PATCH antwortet mit dem GESPEICHERTEN Stand',
    optIn.status === 200 && optIn.json?.marketVisibility === 'shared',
    `${optIn.status} ${JSON.stringify(optIn.json ?? {})}`)
  const sharedRow = await tablesDB.getRow({ databaseId, tableId: 'brand_profiles', rowId: sharedId })
  check('die Spalte `brand_profiles.marketVisibility` steht auf `shared`',
    sharedRow.marketVisibility === 'shared', String(sharedRow.marketVisibility))

  const strangerOptIn = await call(`/api/market/profiles/${sharedId}/visibility`, {
    method: 'PATCH', cookie: owner.cookie, body: { marketVisibility: 'private' },
  })
  check('GEGENPROBE: ein fremdes Konto kann die Freigabe nicht umlegen (404)',
    strangerOptIn.status === 404, String(strangerOptIn.status))

  const sharedAfter = await call(`${base}/candidates?source=shared`, { cookie: owner.cookie })
  const sharedIdsAfter = (sharedAfter.json?.options ?? []).map(o => o.id)
  check('die freigegebene Marke steht jetzt im Wähler',
    sharedIdsAfter.includes(sharedId), sharedIdsAfter.join(','))
  check('GEGENPROBE: die PRIVATE Marke desselben Kontos fehlt',
    !sharedIdsAfter.includes(privateId), '')
  check('kein Eintrag verrät eine `ownerId`',
    (sharedAfter.json?.options ?? []).every(o => !('ownerId' in o)), '')

  // ── 7 · Kandidaten, Rolle und Vertraulichkeit ───────────────────────────
  console.log('\n7 · Kandidaten anlegen: Wettbewerber, freigegebene Marke, eigene alte Website')
  const addCompetitor = await call(`${base}/competitors`, {
    method: 'POST', cookie: owner.cookie,
    body: { name: 'Upcountry Roast', url: `${upcountry.origin}/` },
  })
  const competitorId = addCompetitor.json?.competitor?.id
  check('ein Website-Wettbewerber wird angelegt', addCompetitor.status === 200 && Boolean(competitorId),
    `${addCompetitor.status}`)

  const addShared = await call(`${base}/competitors`, {
    method: 'POST', cookie: owner.cookie,
    body: { name: 'Northline Nachbar', sourceKind: 'shared', sourceRef: sharedId },
  })
  const sharedCompetitorId = addShared.json?.competitor?.id
  check('eine FREIGEGEBENE fremde Marke wird angenommen',
    addShared.status === 200 && Boolean(sharedCompetitorId), `${addShared.status}`)

  const addPrivate = await call(`${base}/competitors`, {
    method: 'POST', cookie: owner.cookie,
    body: { name: 'Northline Privat', sourceKind: 'shared', sourceRef: privateId },
  })
  check('GEGENPROBE: eine PRIVATE fremde Marke wird abgelehnt (shared_unavailable)',
    addPrivate.status === 400 && addPrivate.json?.reason === 'shared_unavailable',
    `${addPrivate.status} ${addPrivate.json?.reason ?? ''}`)

  const addSelf = await call(`${base}/competitors`, {
    method: 'POST', cookie: owner.cookie,
    body: { name: 'Unsere alte Website', url: `${oldSite.origin}/`, role: 'self' },
  })
  const selfId = addSelf.json?.competitor?.id
  check('die eigene alte Website wird als `self` angelegt',
    addSelf.status === 200 && addSelf.json?.competitor?.role === 'self',
    `${addSelf.status} ${addSelf.json?.competitor?.role ?? ''}`)

  const secondSelf = await call(`${base}/competitors`, {
    method: 'POST', cookie: owner.cookie,
    body: { name: 'Noch eine alte Website', url: 'https://alt2.example/', role: 'self' },
  })
  check('GEGENPROBE: eine zweite eigene alte Website wird abgelehnt (self_limit)',
    secondSelf.status === 409 && secondSelf.json?.reason === 'self_limit',
    `${secondSelf.status} ${secondSelf.json?.reason ?? ''}`)

  console.log('\n8 · Der Lauf mit Bericht')
  const run = await call(`${base}/run?report=1`, { method: 'POST', cookie: owner.cookie })
  check('der Lauf antwortet 200 und liefert einen Bericht',
    run.status === 200 && Boolean(run.json?.report), `${run.status} ${run.json?.reason ?? ''}`)

  const profileRows = await marketRows('market_profiles', profileId)
  const sharedProfile = profileRows.find(row => row.competitorId === sharedCompetitorId)
  check('die freigegebene Marke hat ein Marktprofil', Boolean(sharedProfile), '')
  const sharedFields = sharedProfile?.fields ?? ''
  check('es trägt ihren ÖFFENTLICHEN Satz',
    sharedFields.includes(PUBLIC_SENTENCE), sharedFields.slice(0, 160))
  check('und NICHT den Satz aus ihrer internen Session (§2.9 Nr. 7)',
    !sharedFields.includes(INTERNAL_SENTENCE), '')

  // ── 9 · `self` steht ausserhalb des Feldes ──────────────────────────────
  console.log('\n9 · Die eigene alte Website ist kein Teil des Feldes (§2.3)')
  const reportGet = await call(`${base}/report`, { cookie: owner.cookie })
  const view = reportGet.json?.report
  const matrixIds = new Set((view?.matrix ?? []).flatMap(row => row.cells.map(cell => cell.competitorId)))
  check('die Matrix kennt den `self`-Kandidaten nicht',
    Boolean(view) && !matrixIds.has(selfId), [...matrixIds].join(','))
  check('GEGENPROBE: den Wettbewerber kennt sie sehr wohl',
    matrixIds.has(competitorId), [...matrixIds].join(','))
  const claimsJson = JSON.stringify(view?.claims ?? [])
  check('keine Konvention, Überschneidung oder freie Stelle nennt ihn',
    !claimsJson.includes(selfId), '')
  check('die Liste der Kandidaten trägt ihn trotzdem (für die Relaunch-Ansicht)',
    (view?.competitors ?? []).some(entry => entry.id === selfId), '')

  // Der Deckel: fünf WETTBEWERBER, die eigene alte Website zählt nicht mit.
  const capProfile = await createProfile(owner, 'Deckel-Probe')
  await acceptChapter(capProfile, 'pvm')
  const capBase = `/api/market/profiles/${capProfile}`
  for (let i = 1; i <= 5; i++) {
    await call(`${capBase}/competitors`, {
      method: 'POST', cookie: owner.cookie,
      body: { name: `W${i}`, url: `https://w${i}.example/` },
    })
  }
  const sixth = await call(`${capBase}/competitors`, {
    method: 'POST', cookie: owner.cookie,
    body: { name: 'W6', url: 'https://w6.example/' },
  })
  check('der sechste Wettbewerber wird abgelehnt (competitor_limit)',
    sixth.status === 409 && sixth.json?.reason === 'competitor_limit',
    `${sixth.status} ${sixth.json?.reason ?? ''}`)
  const capSelf = await call(`${capBase}/competitors`, {
    method: 'POST', cookie: owner.cookie,
    body: { name: 'Alte Website', url: 'https://alt.example/', role: 'self' },
  })
  check('die eigene alte Website geht trotzdem durch (sie zählt nicht mit)',
    capSelf.status === 200, `${capSelf.status} ${capSelf.json?.reason ?? ''}`)
  const capList = await call(`${capBase}/competitors`, { cookie: owner.cookie })
  check('die Liste zeigt danach sechs Zeilen — fünf davon im Feld',
    (capList.json?.competitors ?? []).length === 6, String((capList.json?.competitors ?? []).length))

  // ── 10 · Der Widerruf ───────────────────────────────────────────────────
  console.log('\n10 · Widerruf: der nächste Lauf schliesst die Marke aus')
  const revoke = await call(`/api/market/profiles/${sharedId}/visibility`, {
    method: 'PATCH', cookie: neighbour.cookie, body: { marketVisibility: 'private' },
  })
  check('die Eigentümerin nimmt die Freigabe zurück',
    revoke.status === 200 && revoke.json?.marketVisibility === 'private', String(revoke.status))

  const rerun = await call(`${base}/run`, { method: 'POST', cookie: owner.cookie })
  const revokedStep = (rerun.json?.steps ?? []).find(step => step.competitorId === sharedCompetitorId)
  check('der Lauf meldet ihn als ausgeschlossen mit Grund `withdrawn`',
    revokedStep?.status === 'excluded' && revokedStep?.excludedReason === 'withdrawn',
    JSON.stringify(revokedStep ?? {}))
  const competitorRows = await marketRows('market_competitors', profileId)
  const revokedRow = competitorRows.find(row => row.$id === sharedCompetitorId)
  check('die Zeile trägt den Grund ebenfalls',
    revokedRow?.status === 'excluded' && revokedRow?.excludedReason === 'withdrawn',
    `${revokedRow?.status}/${revokedRow?.excludedReason}`)
  const stillThere = await call(`${base}/report`, { cookie: owner.cookie })
  check('der SCHON geschriebene Bericht bleibt lesbar (Schnappschuss)',
    stillThere.status === 200 && Boolean(stillThere.json?.report), String(stillThere.status))

  // ── 11 · Der Eintrag in der Leiste ──────────────────────────────────────
  console.log('\n11 · Der Eintrag „Markt" steht in der Leiste einer brand-Seite')
  const doc = await call(`/de/brand/${profileId}/document`, { cookie: owner.cookie })
  const docText = visibleText(doc.text)
  check('die Dokument-Seite antwortet 200', doc.status === 200, String(doc.status))
  check('sie zeigt den Eintrag „Markt"', docText.includes('Markt'), '')
  const findingRows = await tablesDB.listRows({
    databaseId,
    tableId: 'brand_findings',
    queries: [Query.equal('profileId', profileId), Query.equal('kind', 'market'), Query.limit(10)],
  })
  const openFindings = findingRows.rows.filter(row => row.status === 'open').length
  check('der Bericht hat mindestens einen offenen Markt-Befund erzeugt',
    openFindings > 0, String(openFindings))
  check('der Zähler steht am Eintrag',
    docText.includes(openFindings === 1 ? '1 Befund offen' : `${openFindings} Befunde offen`),
    '')

  const lockedDoc = await call(`/de/brand/${capProfile}/document`, { cookie: owner.cookie })
  check('GEGENPROBE: auf einem Branding OHNE Befunde steht kein Zähler',
    lockedDoc.status === 200 && !visibleText(lockedDoc.text).includes('Befund offen'),
    String(lockedDoc.status))

  if (KEEP) {
    console.log('\nKEEP=1 — das Test-Branding bleibt stehen:')
    console.log(`  ownerId   ${owner.id}`)
    console.log(`  profileId ${profileId}`)
    console.log(`  Seite     http://localhost:${PORT}/de/brand/${profileId}/market`)
    console.log(`  Cookie    ${owner.cookie}`)
  }
}
catch (error) {
  console.error(`\n✗ Beweis abgebrochen: ${error?.message ?? error}`)
  fail++
}
finally {
  for (const server of servers) server.closeAllConnections?.()
  for (const server of servers) await new Promise(done => server.close(done))

  if (!KEEP) {
    for (const table of ['market_reports', 'market_profiles', 'market_competitors']) {
      for (const id of cleanup.profiles) {
        const rows = await tablesDB.listRows({
          databaseId, tableId: table, queries: [Query.equal('profileId', id), Query.limit(200)],
        }).catch(() => ({ rows: [] }))
        for (const row of rows.rows) {
          await tablesDB.deleteRow({ databaseId, tableId: table, rowId: row.$id }).catch(() => {})
        }
      }
    }
    for (const id of cleanup.profiles) {
      for (const table of ['brand_steps', 'brand_messages', 'brand_findings', 'brand_events']) {
        const rows = await tablesDB.listRows({
          databaseId, tableId: table, queries: [Query.equal('profileId', id), Query.limit(200)],
        }).catch(() => ({ rows: [] }))
        for (const row of rows.rows) {
          await tablesDB.deleteRow({ databaseId, tableId: table, rowId: row.$id }).catch(() => {})
        }
      }
      await tablesDB.deleteRow({ databaseId, tableId: 'brand_profiles', rowId: id }).catch(() => {})
    }
    for (const id of cleanup.access) {
      await tablesDB.deleteRow({ databaseId, tableId: 'brand_access', rowId: id }).catch(() => {})
    }
    for (const id of cleanup.users) {
      await users.delete({ userId: id }).catch(() => {})
    }
  }

  if (cleanup.aiFlag) {
    if (cleanup.aiFlag.existed) {
      await tablesDB.updateRow({
        databaseId, tableId: 'app_config', rowId: 'global',
        data: { brandAiEnabled: cleanup.aiFlag.before },
      }).catch(() => {})
    }
    else {
      await tablesDB.deleteRow({ databaseId, tableId: 'app_config', rowId: 'global' }).catch(() => {})
    }
  }

  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass}/${pass + fail} Prüfungen bestanden`)
  process.exit(fail === 0 ? 0 : 1)
}
