/**
 * Beweis für MV1 M2 — „Abruf + Extraktion" gegen eine ECHTE Route, eine echte
 * Ablage und echte (erfundene) Websites.
 *
 * Geprüft werden die Zusagen, die keine pure Funktion belegen kann, weil sie an
 * Route, Ablage, Freischaltung und SSRF-Schutz hängen:
 *
 *  1. FREISCHALTUNG: solange Kapitel B (`pvm`) nicht abgenommen ist, antwortet
 *     der Lauf 409 `market_locked` — mit GEGENPROBE (nach der Abnahme läuft er).
 *  2. KANDIDATEN FÜHREN: anlegen, Adresse normalisieren, Dublette je HOST ⇒ 409
 *     `competitor_duplicate`, der SECHSTE ⇒ 409 `competitor_limit`.
 *  3. FREMDES BRANDING ⇒ 404 (nicht 403): ein zweites Konto MIT Beta-Zugang
 *     bekommt auf dieselbe Profil-Id ein 404 — nur so beweist es den BESITZ
 *     und nicht bloss das geschlossene Tor.
 *  4. DER LAUF: liest Startseite + Unterseiten, findet sitemap.xml und
 *     llms.txt, legt Rohtext MIT Seiten-Markern und eine 24-h-Frist an.
 *  5. DER BELEG-RIEGEL greift durch die ganze Kette: jedes Feld des
 *     Marktprofils trägt ein Zitat, das WÖRTLICH im Rohtext seiner Seite steht
 *     (nachgerechnet vom Skript, nicht geglaubt) — mit GEGENPROBE: der Ersatz
 *     liefert absichtlich EIN Feld mit erfundenem Zitat, und das fehlt danach.
 *  6. IDEMPOTENZ: der zweite Lauf auf unverändertem Stand legt KEIN neues
 *     Marktprofil an (`reused`), obwohl er neu abruft.
 *  7. AUSSCHLUSS ROBOTS: `kona-trading` sagt in der robots.txt nein ⇒
 *     `excluded/robots`, und der Server wurde für SEITEN nie angefasst.
 *  8. AUSSCHLUSS TDM: `island-grind` trägt `noai` im Kopf ⇒ `excluded/tdm`.
 *  9. PFAD-SPERRLISTE: `/impressum` der Demo-Site wurde NIE geholt (die
 *     Zugriffe des Demo-Servers werden mitgeschrieben) — mit GEGENPROBE
 *     (`/about` wurde sehr wohl geholt).
 * 10. KI-AUSSENSICHT getrennt: sie steht in `aiViews`, nie in `profiles`, und
 *     der Konsens-Filter lässt das Feld weg, in dem die zwei Ersatz-Modelle
 *     uneinig sind.
 *
 * ── WAS DIESER BEWEIS NICHT BEWEIST ──────────────────────────────────────
 * Den Anbieter. Er läuft mit `MARKET_DEV_STUB=1`, also ohne einen einzigen
 * bezahlten Aufruf — der Ersatz nimmt als Beleg den ersten Satz jeder
 * gelesenen Seite, damit der RIEGEL greift statt umgangen zu werden (ein Stub
 * mit erfundenen Zitaten fiele durch und man sähe nie, ob der Riegel taugt).
 *
 * ── VORBEDINGUNGEN ───────────────────────────────────────────────────────
 * Lokale Dev-Appwrite mit den `brand_*`- UND `market_*`-Tabellen und ein
 * Dev-Server der branding-App AUS DEM WORKTREE (CLAUDE.md, „Worktree-Beweise":
 * ein Server aus dem Haupt-Repo misst unveränderten Code).
 *
 *   BRAND_DEV_STUB_REVIEW=1 MARKET_DEV_STUB=1 BRAND_SITE_FETCH_ALLOW_LOOPBACK=1 \
 *     pnpm --filter branding exec nuxi dev --port 3016
 *   BRANDING_PORT=3016 node --env-file=apps/branding/.env \
 *     packages/market/scripts/verify-market-fetch.mjs
 *
 * `BRAND_SITE_FETCH_ALLOW_LOOPBACK=1` ist die Dev-Ausnahme im SSRF-Vertrag
 * (`packages/brand/server/utils/brandSiteFetch.ts`): ohne sie weist der Abruf
 * die Demo-Server auf `127.0.0.1:<freier Port>` zu Recht ab, und dieser Beweis
 * wäre nicht führbar. Auf einem Server ist sie wirkungslos (`NODE_ENV`).
 */
import { createServer, request } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const PORT = Number(process.env.BRANDING_PORT || 3016)
const HOST = process.env.BRANDING_HOST || 'localhost'

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

/**
 * EIN Server je Demo-Site, jeder auf einem EIGENEN Port.
 *
 * Warum nicht alle unter einem Server mit Unterpfaden: `robots.txt`,
 * `sitemap.xml`, `llms.txt` und `/.well-known/tdmrep.json` sind pro URSPRUNG
 * definiert, nicht pro Verzeichnis. Ein Beweis, der sie unter `/site-a/robots.txt`
 * ablegte, prüfte eine Regel, die es im Web nicht gibt.
 *
 * Jeder Zugriff wird MITGESCHRIEBEN (`hits`) — das ist die einzige ehrliche
 * Art, „diese Seite wurde NICHT geholt" zu beweisen.
 */
async function startDemoSite(slug) {
  const hits = []
  // VOR dem Server deklariert, weil der Handler ihn liest: er läuft erst nach
  // dem `listen`, aber ein `const` weiter unten wäre eine Zeitbombe für jeden,
  // der die Reihenfolge später ändert.
  let origin = ''
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    hits.push(url.pathname)

    // Pfad-Traversal ist hier kein Sicherheits-, sondern ein Ehrlichkeits-
    // Problem: der Beweis soll die Dateien lesen, die im Repo liegen.
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
        // DIE SITEMAP WIRD UMGESCHRIEBEN: sie nennt `https://<slug>.example/…`,
        // und dieser Server läuft auf `127.0.0.1:<port>`. Ohne die Umschreibung
        // fielen alle Sitemap-Adressen durch die Same-Origin-Regel — der
        // Sitemap-Pfad wäre nie geprüft. Umgeschrieben wird nur der URSPRUNG,
        // die Pfade bleiben, wie sie in der Datei stehen.
        const text = candidate.endsWith('.xml')
          ? body.toString('utf8').replace(new RegExp(`https://${slug}\\.example`, 'g'), origin)
          : body
        res.writeHead(200, { 'content-type': type })
        res.end(text)
        return
      }
      catch {
        // nächster Kandidat
      }
    }
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
  })

  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
  origin = `http://127.0.0.1:${server.address().port}`
  servers.push(server)
  return { slug, origin, hits }
}

// ── Der Dev-Server der branding-App ────────────────────────────────────────

/**
 * Nitro hört auf `[::1]`; Node's `fetch` verwirft einen eigenen Host-Header
 * (CLAUDE.md, „Beweise"). Deshalb node:http über ::1 mit gesetztem Host.
 */
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

async function makeAccount(tag = 'owner') {
  const user = await users.create({
    userId: ID.unique(),
    email: `mv1-m2-${stamp}-${tag}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: 'MV1-M2-Beweis',
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
  return { id: user.$id, cookie: `a_session_${projectId}=${encodeURIComponent(session.secret)}` }
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

/** Kapitel B abnehmen — ohne Route, damit der Beweis nicht am Wizard hängt. */
async function acceptChapterB(profileId) {
  await tablesDB.updateRow({
    databaseId, tableId: 'brand_steps', rowId: `${profileId}_pvm`, data: { state: 'done' },
  })
}

/** Die market-Zeilen eines Brandings — gelesen mit dem Migrations-Schlüssel. */
async function marketRows(table, profileId) {
  const res = await tablesDB.listRows({
    databaseId, tableId: table, queries: [Query.equal('profileId', profileId), Query.limit(100)],
  })
  return res.rows
}

// ── Der Lauf ───────────────────────────────────────────────────────────────

try {
  await ensureAiEnabled()

  const upcountry = await startDemoSite('upcountry-roast')
  const kona = await startDemoSite('kona-trading')
  const island = await startDemoSite('island-grind')
  const pacific = await startDemoSite('pacificbean')
  const kailua = await startDemoSite('kailua-coffee-old')

  const owner = await makeAccount('owner')
  const stranger = await makeAccount('fremd')

  const created = await call('/api/brand/profiles', {
    method: 'POST',
    cookie: owner.cookie,
    body: {
      title: 'Kailua Coffee',
      contentLocale: 'de',
      pathKind: 'new',
      hasName: true,
      team: 'solo',
      industry: 'Kaffeerösterei',
      about: 'Wir rösten Kaffee in kleinen Mengen.',
      audience: 'Cafés auf Maui.',
    },
  })
  const profileId = created.json?.profile?.id ?? created.json?.id
  if (!profileId) {
    console.error(`✗ Kein Branding angelegt (${created.status}): ${created.text.slice(0, 300)}`)
    process.exit(1)
  }
  cleanup.profiles.push(profileId)
  const base = `/api/market/profiles/${profileId}`

  // ── 1 · Freischaltung ───────────────────────────────────────────────────
  console.log('\n1 · Die Freischaltung hängt an Kapitel B')
  const lockedRun = await call(`${base}/run`, { method: 'POST', cookie: owner.cookie })
  check('Lauf vor der Abnahme ⇒ 409 market_locked',
    lockedRun.status === 409 && lockedRun.json?.reason === 'market_locked',
    `${lockedRun.status} ${lockedRun.json?.reason ?? ''}`)

  const lockedList = await call(`${base}/competitors`, { cookie: owner.cookie })
  check('die Kandidatenliste ist trotzdem erreichbar (sie kostet nichts)',
    lockedList.status === 200 && Array.isArray(lockedList.json?.competitors),
    String(lockedList.status))

  // ── 2 · Kandidaten führen ───────────────────────────────────────────────
  console.log('\n2 · Kandidaten führen')
  const addUpcountry = await call(`${base}/competitors`, {
    method: 'POST', cookie: owner.cookie,
    body: { name: 'Upcountry Roast', url: `${upcountry.origin}/?utm_source=beweis#oben` },
  })
  check('anlegen ⇒ 200 und die Adresse ist normalisiert (ohne Tracking, ohne Fragment)',
    addUpcountry.status === 200 && addUpcountry.json?.competitor?.url === `${upcountry.origin}/`,
    `${addUpcountry.status} ${addUpcountry.json?.competitor?.url ?? ''}`)
  const upcountryId = addUpcountry.json?.competitor?.id

  const duplicate = await call(`${base}/competitors`, {
    method: 'POST', cookie: owner.cookie,
    body: { name: 'Noch mal dieselben', url: `${upcountry.origin}/about` },
  })
  check('derselbe HOST ein zweites Mal ⇒ 409 competitor_duplicate',
    duplicate.status === 409 && duplicate.json?.reason === 'competitor_duplicate',
    `${duplicate.status} ${duplicate.json?.reason ?? ''}`)

  const badUrl = await call(`${base}/competitors`, {
    method: 'POST', cookie: owner.cookie, body: { name: 'Unsinn', url: 'nicht mal eine adresse' },
  })
  check('eine unbrauchbare Adresse ⇒ 400 competitor_url_invalid',
    badUrl.status === 400 && badUrl.json?.reason === 'competitor_url_invalid',
    `${badUrl.status} ${badUrl.json?.reason ?? ''}`)

  for (const [name, site] of [['Kona Trading', kona], ['Island Grind', island], ['Pacific Bean', pacific]]) {
    const added = await call(`${base}/competitors`, {
      method: 'POST', cookie: owner.cookie, body: { name, url: `${site.origin}/` },
    })
    if (added.status !== 200) {
      console.log(`  ✗ ${name} konnte nicht angelegt werden (${added.status}) — ${added.text.slice(0, 200)}`)
      fail++
    }
  }
  // Der fünfte: die EIGENE alte Website (Relaunch-Fall §7.2 Nr. 2 als Adresse).
  await call(`${base}/competitors`, {
    method: 'POST', cookie: owner.cookie, body: { name: 'Kailua Coffee (alt)', url: `${kailua.origin}/` },
  })

  const sixth = await call(`${base}/competitors`, {
    method: 'POST', cookie: owner.cookie, body: { name: 'Einer zu viel', url: 'https://zuviel.example/' },
  })
  check('der SECHSTE Kandidat ⇒ 409 competitor_limit',
    sixth.status === 409 && sixth.json?.reason === 'competitor_limit',
    `${sixth.status} ${sixth.json?.reason ?? ''}`)

  // ── 3 · Fremdes Branding ────────────────────────────────────────────────
  console.log('\n3 · Ein fremdes Branding gibt es nicht')
  const foreignList = await call(`${base}/competitors`, { cookie: stranger.cookie })
  check('fremdes Konto MIT Beta-Zugang ⇒ 404 (nicht 403)', foreignList.status === 404, String(foreignList.status))
  const foreignRun = await call(`${base}/run`, { method: 'POST', cookie: stranger.cookie })
  check('auch der Lauf ⇒ 404', foreignRun.status === 404, String(foreignRun.status))
  const noSession = await call(`${base}/competitors`)
  check('ohne Anmeldung ⇒ 404', noSession.status === 404, String(noSession.status))

  // ── 4 · Der Lauf ────────────────────────────────────────────────────────
  console.log('\n4 · Der Lauf liest, wertet aus und legt ab')
  await acceptChapterB(profileId)
  const run = await call(`${base}/run`, { method: 'POST', cookie: owner.cookie })
  check('nach der Abnahme läuft er ⇒ 200 (GEGENPROBE zu 1)',
    run.status === 200 && run.json?.ran === true, `${run.status} ${run.text.slice(0, 200)}`)

  const steps = run.json?.steps ?? []
  const stepFor = name => steps.find(step => step.name === name)

  const upcountryStep = stepFor('Upcountry Roast')
  check('Upcountry Roast: gelesen, mehr als eine Seite',
    upcountryStep?.status === 'fetched' && upcountryStep?.pagesRead > 1,
    JSON.stringify(upcountryStep ?? {}))
  check('die sitemap.xml wurde gefunden und ausgewertet',
    (upcountryStep?.sitemapUrls ?? 0) >= 6, String(upcountryStep?.sitemapUrls ?? 0))
  check('die llms.txt wurde gefunden', upcountryStep?.llmsTxt === 'found', String(upcountryStep?.llmsTxt))

  const rows = await marketRows('market_competitors', profileId)
  const upcountryRow = rows.find(row => row.$id === upcountryId)
  check('der Rohtext trägt Seiten-Marker (Häufigkeit und Riegel hängen daran)',
    (upcountryRow?.rawText ?? '').includes('=== '), '')
  check('die 24-Stunden-Frist steht in der Zeile', (() => {
    if (!upcountryRow?.rawExpiresAt || !upcountryRow?.fetchedAt) return false
    const delta = new Date(upcountryRow.rawExpiresAt) - new Date(upcountryRow.fetchedAt)
    return Math.abs(delta - 24 * 60 * 60_000) < 60_000
  })(), `${upcountryRow?.fetchedAt ?? ''} → ${upcountryRow?.rawExpiresAt ?? ''}`)

  // ── 5 · Der Beleg-Riegel, nachgerechnet ─────────────────────────────────
  console.log('\n5 · Der Beleg-Riegel — nachgerechnet, nicht geglaubt')
  const overview = await call(base, { cookie: owner.cookie })
  const profiles = overview.json?.profiles ?? []
  const upcountryProfile = profiles.find(profile => profile.competitorId === upcountryId)
  const withEvidence = (upcountryProfile?.fields ?? []).filter(field => field.evidence)
  check('das Marktprofil hat belegte Felder', withEvidence.length > 0, String(withEvidence.length))

  /**
   * Die Seiten aus dem gespeicherten Rohtext zurückgewinnen — HIER noch einmal
   * von Hand und NICHT über `splitMarketRawText`. Der Beweis soll nicht
   * dieselbe Funktion befragen, die er prüft; das wäre die Tautologie aus der
   * Beweis-Regel.
   */
  const pageTexts = new Map()
  {
    const raw = String(upcountryRow?.rawText ?? '')
    const marker = /\n?\n?=== (\S+) ===\n/g
    let hit = marker.exec(raw)
    while (hit !== null) {
      const start = hit.index + hit[0].length
      const next = marker.exec(raw)
      pageTexts.set(hit[1], raw.slice(start, next ? next.index : raw.length))
      hit = next
    }
  }
  const normalize2 = value => value.replace(/\s+/g, ' ').trim()
  const grounded = withEvidence.every((field) => {
    const page = pageTexts.get(field.evidence.sourceUrl)
    return page !== undefined && normalize2(page).includes(normalize2(field.evidence.quote))
  })
  check('JEDES Zitat steht wörtlich im Rohtext GENAU seiner Seite', grounded, '')
  check('jedes Zitat hält die Zitatschranke (≤ 200 Zeichen)',
    withEvidence.every(field => field.evidence.quote.length <= 200), '')
  check('jedes belegte Feld trägt eine gezählte Häufigkeit',
    withEvidence.every(field => field.frequency && field.frequency.of > 0), '')
  /**
   * DIE GEGENPROBE ZUM RIEGEL, im laufenden System.
   *
   * Der Ersatz liefert absichtlich EIN Feld (`distinctiveAsset`) mit einem
   * erfundenen Zitat (s. `stubAnswer` in `server/utils/marketExtract.ts`). Es
   * muss verworfen sein — sonst ist der Riegel im Betrieb wirkungslos, und die
   * Zeilen darüber prüften nur, dass der Ersatz ehrlich ist.
   */
  check('GEGENPROBE: das Feld mit dem ERFUNDENEN Zitat wurde verworfen',
    !(upcountryProfile?.fields ?? []).some(field => field.fieldId === 'distinctiveAsset'),
    JSON.stringify((upcountryProfile?.fields ?? []).map(field => field.fieldId)))

  // ── 6 · Ausschlüsse ─────────────────────────────────────────────────────
  console.log('\n6 · Wer nein sagt, wird nicht ausgewertet')
  const konaStep = stepFor('Kona Trading')
  check('robots.txt-Verbot ⇒ excluded/robots',
    konaStep?.status === 'excluded' && konaStep?.excludedReason === 'robots',
    JSON.stringify(konaStep ?? {}))
  check('und der Server wurde für SEITEN nie angefasst',
    kona.hits.every(path => path === '/robots.txt' || path.startsWith('/.well-known/')),
    kona.hits.join(' '))

  const islandStep = stepFor('Island Grind')
  check('`noai` im Kopf ⇒ excluded/tdm',
    islandStep?.status === 'excluded' && islandStep?.excludedReason === 'tdm',
    JSON.stringify(islandStep ?? {}))
  check('bei einem Vorbehalt wird KEINE Unterseite mehr geholt',
    !island.hits.includes('/about'), island.hits.join(' '))

  console.log('\n7 · Die Pfad-Sperrliste')
  check('GEGENPROBE: `/about` der offenen Site wurde geholt',
    upcountry.hits.some(path => path.startsWith('/about')), upcountry.hits.join(' '))
  check('`/impressum` und `/contact` wurden NIE geholt — obwohl die Sitemap sie nennt',
    !upcountry.hits.some(path => path.startsWith('/imprint') || path.startsWith('/contact')),
    upcountry.hits.join(' '))

  // ── 8 · Idempotenz ──────────────────────────────────────────────────────
  console.log('\n8 · Derselbe Stand kostet nichts')
  const before = (await marketRows('market_profiles', profileId)).length
  const second = await call(`${base}/run`, { method: 'POST', cookie: owner.cookie })
  const after = (await marketRows('market_profiles', profileId)).length
  check('der zweite Lauf meldet `reused` und legt KEIN neues Marktprofil an',
    second.status === 200 && (second.json?.reused ?? 0) > 0 && after === before,
    `${second.status} reused=${second.json?.reused} rows ${before}→${after}`)

  // ── 9 · Die KI-Aussensicht bleibt getrennt ──────────────────────────────
  console.log('\n9 · Die KI-Aussensicht steht NEBEN dem Website-Profil')
  const aiViews = overview.json?.aiViews ?? []
  const upcountryView = aiViews.find(view => view.competitorId === upcountryId)
  check('sie kommt als eigene Liste `aiViews`', Array.isArray(aiViews) && aiViews.length > 0, String(aiViews.length))
  check('kein Feld des Website-Profils trägt eine KI-Aussage',
    (upcountryProfile?.fields ?? []).every(field => field.source !== 'ai-search'), '')
  check('jede übernommene Aussage hat mindestens zwei zustimmende Modelle',
    (upcountryView?.statements ?? []).every(statement => statement.agree >= 2),
    JSON.stringify(upcountryView?.statements?.map(s => s.agree) ?? []))
  check('GEGENPROBE: das Feld, in dem die zwei Ersatz-Modelle uneinig sind, fehlt',
    !(upcountryView?.statements ?? []).some(statement => statement.fieldId === 'firstChoice'),
    JSON.stringify((upcountryView?.statements ?? []).map(s => s.fieldId)))

  // ── 10 · Adress-Änderung setzt den Stand zurück ─────────────────────────
  console.log('\n10 · Eine neue Adresse macht den Abrufstand wertlos')
  const patched = await call(`${base}/competitors/${upcountryId}`, {
    method: 'PATCH', cookie: owner.cookie, body: { url: 'https://ganz-andere-marke.example/' },
  })
  const afterPatch = (await marketRows('market_competitors', profileId)).find(row => row.$id === upcountryId)
  check('Status zurück auf `pending`, Rohtext und Frist geleert',
    patched.status === 200 && afterPatch?.status === 'pending' && !afterPatch?.rawText && !afterPatch?.rawExpiresAt,
    `${patched.status} ${afterPatch?.status} raw=${afterPatch?.rawText ? 'da' : 'leer'}`)

  const removed = await call(`${base}/competitors/${upcountryId}`, { method: 'DELETE', cookie: owner.cookie })
  check('entfernen nimmt die Marktprofile mit',
    removed.status === 200
    && (await marketRows('market_profiles', profileId)).every(row => row.competitorId !== upcountryId),
    String(removed.status))
}
catch (error) {
  console.error(`\n✗ Beweis abgebrochen: ${error?.message ?? error}`)
  fail++
}
finally {
  for (const server of servers) server.closeAllConnections?.()
  for (const server of servers) await new Promise(done => server.close(done))

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
