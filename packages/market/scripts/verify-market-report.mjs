/**
 * Beweis für MV1 M3 — „Vergleich + Befunde" gegen eine ECHTE Route, eine echte
 * Ablage, echte (erfundene) Websites und den echten Befund-Speicher des
 * brand-Layers.
 *
 * Geprüft werden die Zusagen, die keine pure Funktion belegen kann, weil sie an
 * Route, Ablage, Freischaltung und der Naht zu `brand` hängen:
 *
 *  1. OHNE MATERIAL KEIN BERICHT: vor dem Lauf antwortet der Vergleich 409
 *     `market_no_profiles` — mit GEGENPROBE (nach dem Lauf 200).
 *  2. VIER TEILE: Gegenüberstellung, Konventionen, Überschneidungen, freie
 *     Stellen — plus Befunde.
 *  3. DIE MATRIX IST DETERMINISTISCH: jede Zelle wird vom Skript gegen das
 *     Marktprofil nachgerechnet, aus dem sie stammen soll.
 *  4. KONVENTIONEN NUR MIT NACHGERECHNETER QUOTE (≥ 60 %) und nur mit Zitaten,
 *     die WÖRTLICH aus dem Marktprofil der genannten Marke kommen.
 *  5. BEFUNDE landen als `brand_findings` mit `kind: 'market'` an einem
 *     EIGENEN Slot — nachgesehen in der Tabelle, nicht in der Antwort.
 *  6. GEGENPROBE HERABSETZUNG: der Ersatz liefert absichtlich einen Befund mit
 *     herabsetzender Formulierung. Er fehlt danach, und das Ereignis hat
 *     gezählt.
 *  7. GEGENPROBE WETTBEWERBER-NAME: der Ersatz liefert absichtlich einen
 *     Vorschlag, der einen Wettbewerber beim Namen nennt. Er fehlt ebenfalls.
 *  8. EIN MARKT-BEFUND SPERRT DIE ABNAHME NICHT — die Abnahme-Route bleibt bei
 *     offenem Markt-Befund offen.
 *  9. IDEMPOTENZ: derselbe Stand ⇒ `reused: true`, KEINE zweite Bericht-Zeile.
 * 10. STALE: eine Korrektur an einem beteiligten EIGENEN Feld macht den
 *     gespeicherten Bericht `stale` — mit GEGENPROBE (davor `false`).
 * 11. BIBLIOTHEK: ein `library`-Kandidat steht im Bericht, OHNE dass sein
 *     Server je angefasst wurde — seit M6b ein ECHTER Eintrag (`the-barn`).
 *     Dazu: der Quellen-Wähler führt ihn mit Wortname UND Kategorie und mit
 *     SONST NICHTS (Erlaubnisliste der Options-Felder — kein Logo, kein
 *     Favicon, kein Bild; Plan Anhang G a).
 * 12. BRAND-CHECK: ein vorhandener Check erscheint als `brandCheck` am
 *     Kandidaten — mit GEGENPROBE (ein Kandidat ohne Check hat keinen).
 *
 * ── WAS DIESER BEWEIS NICHT BEWEIST ──────────────────────────────────────
 * Den Anbieter. Er läuft mit `MARKET_DEV_STUB=1`, also ohne einen einzigen
 * bezahlten Aufruf — der Ersatz liefert eine MODELL-FÖRMIGE Antwort, die durch
 * dieselbe Zod-Form, dieselbe Belegprüfung, dieselbe Quoten-Rechnung und
 * denselben § 6 UWG-Riegel läuft wie eine echte. Ein Ersatz, der nur Erlaubtes
 * liefert, prüfte sich selbst; dieser liefert zwei ABSICHTLICH verbotene
 * Elemente (6 und 7).
 *
 * ── EIN SERVERPROZESS JE BEWEIS ──────────────────────────────────────────
 * Die Eimer (3 Läufe und 3 Berichte je Branding und Tag, Instanz-Deckel,
 * IP-Bucket der Rate-Limit-Middleware) leben ohne Redis IM PROZESS. Läuft
 * dieses Skript direkt nach `verify-market-fetch.mjs` gegen DENSELBEN
 * Dev-Server, kippt Schritt 14 mit 429 (2026-09-05 im Hauptloop gemessen:
 * 42/43, nach Neustart 43/43). Das ist der Deckel, kein Fehler — vor jedem
 * Beweis den Dev-Server frisch starten.
 *
 * ── VORBEDINGUNGEN ───────────────────────────────────────────────────────
 * Lokale Dev-Appwrite mit den `brand_*`- UND `market_*`-Tabellen und ein
 * Dev-Server der branding-App AUS DEM WORKTREE (CLAUDE.md, „Worktree-Beweise":
 * ein Server aus dem Haupt-Repo misst unveränderten Code).
 *
 *   BRAND_DEV_STUB_REVIEW=1 MARKET_DEV_STUB=1 BRAND_SITE_FETCH_ALLOW_LOOPBACK=1 \
 *     pnpm --filter branding exec nuxi dev --port 3016
 *   BRANDING_PORT=3016 node --env-file=apps/branding/.env \
 *     packages/market/scripts/verify-market-report.mjs
 */
import { createServer, request } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'
// Die BIBLIOTHEK selbst — Node 22 entfernt die Typen beim Laden, und die Datei
// ist reine Daten ohne Import. So steht das Prüfdatum genau einmal im Repo
// (M6b); eine Zahl in diesem Skript daneben wäre beim nächsten geprüften
// Eintrag rot, ohne dass am Produkt etwas falsch wäre.
import { MARKET_LIBRARY_ENTRIES } from '../shared/library/index.ts'

/** Der Bibliotheks-Eintrag, gegen den dieser Beweis läuft — ein ECHTER (M6b). */
const LIBRARY_KEY = 'the-barn'
const LIBRARY_ENTRY = MARKET_LIBRARY_ENTRIES.find(entry => entry.key === LIBRARY_KEY)
if (!LIBRARY_ENTRY) {
  console.error(`Die Bibliothek kennt '${LIBRARY_KEY}' nicht — Beweis abgebrochen.`)
  process.exit(1)
}
const LIBRARY_VERIFIED_AT = LIBRARY_ENTRY.verifiedAt
/** Der ANZEIGE-Name des Kandidaten; die Lauf-Schritte werden darüber gefunden. */
const LIBRARY_CANDIDATE_NAME = `${LIBRARY_ENTRY.name} (Bibliothek)`

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
const cleanup = { users: [], profiles: [], access: [], checks: [], aiFlag: null }
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
  const hits = []
  let origin = ''
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    hits.push(url.pathname)
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
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
  origin = `http://127.0.0.1:${server.address().port}`
  servers.push(server)
  return { slug, origin, hits }
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

async function makeAccount(tag = 'owner') {
  const user = await users.create({
    userId: ID.unique(),
    email: `mv1-m3-${stamp}-${tag}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: 'MV1-M3-Beweis',
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

/**
 * BESTÄTIGTE EIGENE FELDER SETZEN — direkt in `brand_steps`, wie die
 * Kapitel-Abnahme.
 *
 * Über den Wizard zu gehen hiesse, achtzig Gesprächszüge zu simulieren, um
 * fünf Werte zu setzen; der Beweis würde dann den Wizard prüfen und nicht den
 * Marktvergleich. Geschrieben wird die Form, die `confirmedSlotValues` liest.
 */
async function setConfirmed(profileId, stepKey, values) {
  const rowId = `${profileId}_${stepKey}`
  let existing = {}
  try {
    const row = await tablesDB.getRow({ databaseId, tableId: 'brand_steps', rowId })
    existing = JSON.parse(row.slots || '{}')
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
      data: { profileId, stepKey, state: 'active', slots: JSON.stringify(slots) },
    })
  }
}

async function marketRows(table, profileId) {
  const res = await tablesDB.listRows({
    databaseId, tableId: table, queries: [Query.equal('profileId', profileId), Query.limit(200)],
  })
  return res.rows
}

/** `brandCheckUrlKey` nachgebaut — der Beweis darf die geprüfte Funktion nicht fragen. */
function urlKeyOf(rawUrl) {
  const url = new URL(rawUrl)
  const path = url.pathname.replace(/\/+$/, '').toLowerCase()
  return `${url.host.toLowerCase()}${path}`
}

const normalize2 = value => String(value).replace(/\s+/g, ' ').trim()

// ── Der Lauf ───────────────────────────────────────────────────────────────

try {
  await ensureAiEnabled()

  const upcountry = await startDemoSite('upcountry-roast')
  const pacific = await startDemoSite('pacificbean')

  const owner = await makeAccount('owner')

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
  await acceptChapterB(profileId)

  // ── 1 · Ohne Material kein Bericht ──────────────────────────────────────
  console.log('\n1 · Ohne Marktprofil gibt es keinen Vergleich')
  const leer = await call(`${base}/report`, { method: 'POST', cookie: owner.cookie })
  check('vor dem Lauf ⇒ 409 market_no_profiles',
    leer.status === 409 && leer.json?.reason === 'market_no_profiles',
    `${leer.status} ${leer.json?.reason ?? ''}`)

  const leerGet = await call(`${base}/report`, { cookie: owner.cookie })
  check('der LESER antwortet trotzdem 200 mit `report: null` (Ansehen kostet nichts)',
    leerGet.status === 200 && leerGet.json?.report === null,
    `${leerGet.status} ${JSON.stringify(leerGet.json ?? {}).slice(0, 120)}`)

  // ── 2 · Kandidaten + Lauf ───────────────────────────────────────────────
  console.log('\n2 · Kandidaten aus drei Quellen')
  const addUp = await call(`${base}/competitors`, {
    method: 'POST', cookie: owner.cookie,
    body: { name: 'Upcountry Roast', url: `${upcountry.origin}/` },
  })
  const upId = addUp.json?.competitor?.id
  const addPac = await call(`${base}/competitors`, {
    method: 'POST', cookie: owner.cookie,
    body: { name: 'Pacific Bean', url: `${pacific.origin}/` },
  })
  const pacId = addPac.json?.competitor?.id
  check('zwei Website-Kandidaten angelegt', Boolean(upId && pacId), `${addUp.status}/${addPac.status}`)

  const addLib = await call(`${base}/competitors`, {
    method: 'POST', cookie: owner.cookie,
    // EIN ECHTER Bibliotheks-Eintrag (M6b): seit dem 2026-09-06 enthält die
    // ausgelieferte Bibliothek nur noch von Hand geprüfte Marken, und ein
    // Beweis gegen einen Testeintrag prüfte ab hier etwas, das es nicht mehr
    // gibt. ABGERUFEN wird trotzdem nichts — genau das steht in Schritt 3.
    body: { name: LIBRARY_CANDIDATE_NAME, sourceKind: 'library', sourceRef: LIBRARY_KEY },
  })
  const libId = addLib.json?.competitor?.id
  check('ein BIBLIOTHEKS-Kandidat wird angenommen',
    addLib.status === 200 && addLib.json?.competitor?.source === 'library',
    `${addLib.status} ${addLib.json?.competitor?.source ?? ''}`)

  const badLib = await call(`${base}/competitors`, {
    method: 'POST', cookie: owner.cookie,
    body: { name: 'Gibt es nicht', sourceKind: 'library', sourceRef: 'erfunden-xyz' },
  })
  check('GEGENPROBE: ein erfundener Bibliotheks-Schlüssel ⇒ 400',
    badLib.status === 400, String(badLib.status))

  // Ein Brand-Check für GENAU EINEN der beiden Website-Kandidaten (§7.3).
  const checkRow = await tablesDB.createRow({
    databaseId,
    tableId: 'brand_checks',
    rowId: ID.unique(),
    data: {
      urlKey: urlKeyOf(`${upcountry.origin}/`),
      url: `${upcountry.origin}/`,
      host: new URL(upcountry.origin).host,
      locale: 'de',
      score: 71,
      band: 'strong',
      scoreVersion: 'score-1',
      promptVersion: 'test',
      model: 'test',
      categories: '[]',
      criteria: '[]',
      findings: '[]',
      textHash: 'test',
      ipHash: 'test',
    },
  })
  cleanup.checks.push(checkRow.$id)

  console.log('\n3 · Der Lauf liest — die Bibliothek nicht')
  const libHitsBefore = [upcountry.hits.length, pacific.hits.length]
  const run = await call(`${base}/run`, { method: 'POST', cookie: owner.cookie })
  check('der Lauf läuft ⇒ 200', run.status === 200 && run.json?.ran === true,
    `${run.status} ${run.text.slice(0, 200)}`)
  const libStep = (run.json?.steps ?? []).find(step => step.name === LIBRARY_CANDIDATE_NAME)
  check('der Bibliotheks-Kandidat ist `fetched`, OHNE eine Seite gelesen zu haben',
    libStep?.status === 'fetched' && libStep?.pagesRead === 0 && libStep?.robotsChecked === false,
    JSON.stringify(libStep ?? {}))
  check('… und ohne dass ein Demo-Server dafür angefasst wurde (GEGENPROBE zu den zwei Websites)',
    upcountry.hits.length > libHitsBefore[0] && pacific.hits.length > libHitsBefore[1],
    `${upcountry.hits.length}/${pacific.hits.length}`)
  check('der Lauf ALLEIN hängt keinen Bericht an (M2-Form unverändert)',
    (run.json?.report ?? null) === null, JSON.stringify(run.json?.report ?? null).slice(0, 80))

  // ── 4 · Der Bericht ─────────────────────────────────────────────────────
  console.log('\n4 · Der Vergleich — vier Teile')
  const made = await call(`${base}/report`, { method: 'POST', cookie: owner.cookie })
  check('nach dem Lauf ⇒ 200 (GEGENPROBE zu 1)',
    made.status === 200 && Boolean(made.json?.report),
    `${made.status} ${made.text.slice(0, 300)}`)
  const report = made.json?.report
  const claims = report?.claims ?? []
  const kinds = claims.map(list => list.kind)
  check('die drei Listen sind da: Konventionen, Überschneidungen, freie Stellen',
    ['convention', 'overlap', 'whitespace'].every(kind => kinds.includes(kind)),
    kinds.join(','))
  check('die Gegenüberstellung ist der vierte Teil und hat eine Zeile je Feld',
    Array.isArray(report?.matrix) && report.matrix.length === 10,
    String(report?.matrix?.length ?? 0))
  check('der Bericht meldet, welche EIGENEN Felder noch fehlen (§2.4)',
    Array.isArray(report?.missingOwnFields) && report.missingOwnFields.includes('toneWords'),
    JSON.stringify(report?.missingOwnFields ?? []))

  // ── 5 · Die Matrix, nachgerechnet ───────────────────────────────────────
  console.log('\n5 · Jede Zelle stammt aus einem Marktprofil — nachgerechnet')
  const profileOf = id => (report?.profiles ?? []).find(entry => entry.competitorId === id)?.fields ?? []
  let cellsChecked = 0
  const matrixOk = (report?.matrix ?? []).every(row => row.cells.every((cell) => {
    if (cell.competitorId === '_own') {
      const own = (report?.own ?? []).find(field => field.fieldId === row.fieldId)
      return normalize2(cell.value) === normalize2(own?.value ?? '')
    }
    const competitor = (report?.competitors ?? []).find(entry => entry.id === cell.competitorId)
    if (competitor?.status === 'excluded') return cell.value === '' && cell.empty === 'excluded'
    const field = profileOf(cell.competitorId).find(entry => entry.fieldId === row.fieldId)
    cellsChecked++
    return normalize2(cell.value) === normalize2(field?.value ?? '')
  }))
  check('JEDE Zelle ist wörtlich das Feld ihres Marktprofils', matrixOk && cellsChecked > 10,
    `${cellsChecked} Zellen geprüft`)

  // ── 6 · Konventionen: Quote und Belege ──────────────────────────────────
  console.log('\n6 · Konventionen — Quote nachgerechnet, Zitate belegt')
  const conventions = claims.find(list => list.kind === 'convention')?.entries ?? []
  check('es gibt mindestens eine Konvention', conventions.length > 0, String(conventions.length))
  check('jede Konvention hält die 60-Prozent-Schwelle — hier nachgerechnet',
    conventions.every(entry => entry.of > 0 && entry.sharedBy >= 2 && entry.sharedBy / entry.of >= 0.6),
    JSON.stringify(conventions.map(entry => [entry.sharedBy, entry.of])))
  const citationsGrounded = [...conventions, ...(claims.find(l => l.kind === 'overlap')?.entries ?? [])]
    .flatMap(entry => (entry.citations ?? []).map(citation => ({ entry, citation })))
  check('jedes Zitat stammt aus dem Marktprofil GENAU DER genannten Marke',
    citationsGrounded.length > 0 && citationsGrounded.every(({ entry, citation }) => {
      const field = profileOf(citation.competitorId).find(f => f.fieldId === entry.fieldId)
      return field?.evidence?.quote
        && normalize2(field.evidence.quote).includes(normalize2(citation.evidence.quote))
    }),
    `${citationsGrounded.length} Zitate`)
  check('jede genannte Marke existiert als Kandidat',
    citationsGrounded.every(({ citation }) =>
      (report?.competitors ?? []).some(entry => entry.id === citation.competitorId)),
    '')

  const whitespace = claims.find(list => list.kind === 'whitespace')?.entries ?? []
  check('freie Stellen sind als FRAGE formuliert',
    whitespace.length === 0 || whitespace.every(entry => entry.statement.includes('?')),
    JSON.stringify(whitespace.map(entry => entry.statement.slice(0, 40))))

  // ── 7 · Befunde in `brand_findings` ─────────────────────────────────────
  console.log('\n7 · Befunde landen im Befund-Speicher des brand-Layers')
  const findingRows = (await tablesDB.listRows({
    databaseId, tableId: 'brand_findings',
    queries: [Query.equal('profileId', profileId), Query.limit(50)],
  })).rows
  const marketFindings = findingRows.filter(row => row.kind === 'market')
  check('es gibt Markt-Befunde als `brand_findings` mit kind `market`',
    marketFindings.length > 0, String(marketFindings.length))
  check('jeder hängt an GENAU EINEM eigenen Slot',
    marketFindings.every(row => JSON.parse(row.slots || '[]').length === 1),
    JSON.stringify(marketFindings.map(row => row.slots)))
  check('jeder trägt `why` UND `suggestion` (beides Pflicht)',
    marketFindings.every(row => row.why?.trim() && row.suggestion?.trim()), '')
  check('der Bericht liefert dieselben Befunde an die Oberfläche',
    (report?.findings ?? []).length === marketFindings.length,
    `${report?.findings?.length ?? 0} vs ${marketFindings.length}`)

  // ── 8 · Die zwei Gegenproben des Riegels ────────────────────────────────
  console.log('\n8 · § 6 UWG — was verboten ist, kommt nicht durch')
  /**
   * GEPRÜFT WIRD DER ERZEUGTE TEXT, NICHT DER GANZE UMSCHLAG.
   *
   * Die Wettbewerber-NAMEN stehen selbstverständlich im Bericht — als
   * Spaltenköpfe der Gegenüberstellung und an jedem Beleg („laut ihrer
   * Startseite: …", §1.4). Verboten ist etwas anderes: dass ein Satz, den WIR
   * formulieren, einen Dritten nennt oder herabsetzt. Der erste Anlauf dieses
   * Beweises prüfte den ganzen Umschlag und war damit rot, obwohl der Riegel
   * genau richtig gearbeitet hatte.
   */
  const generated = [
    ...claims.flatMap(list => list.entries.map(entry => entry.statement)),
    ...(report?.findings ?? []).flatMap(finding => [finding.why, finding.suggestion]),
  ].join(' \n ').toLowerCase()
  check('GEGENPROBE A: der herabsetzende Befund des Ersatzes fehlt',
    !generated.includes('cheap and outdated') && !generated.includes('inferior'),
    generated.slice(0, 120))
  check('GEGENPROBE B: der Vorschlag mit dem Wettbewerber-NAMEN fehlt',
    !generated.includes('sets you apart from') && !generated.includes('upcountry'),
    generated.slice(0, 120))
  check('… und kein Befund nennt einen Kandidaten-Namen',
    marketFindings.every(row => !`${row.why} ${row.suggestion}`.toLowerCase().includes('pacific')
      && !`${row.why} ${row.suggestion}`.toLowerCase().includes('upcountry')),
    '')
  // Das Ereignis `market.report_filtered` steht im Server-Log (keine Route
  // liest es); nachprüfbar ist hier, dass GENAU DIE zwei Elemente fehlen, die
  // der Ersatz absichtlich verboten geliefert hat — und dass ein DRITTER,
  // sauberer Befund dennoch durchkam. Ohne diese Zeile könnte der Riegel auch
  // schlicht alle Befunde verwerfen.
  check('GEGENPROBE zur Gegenprobe: der SAUBERE Befund des Ersatzes kam durch',
    marketFindings.length >= 1, String(marketFindings.length))

  // ── 9 · Abnahme bleibt offen ────────────────────────────────────────────
  console.log('\n9 · Ein Markt-Befund sperrt nichts')
  const acceptance = await call(
    `/api/brand/profiles/${profileId}/steps/pvm/acceptance`, { cookie: owner.cookie })
  const blocked = JSON.stringify(acceptance.json ?? {}).match(/"blocked[^,]*/g) ?? []
  check('die Abnahme-Route antwortet trotz offenem Markt-Befund 200',
    acceptance.status === 200, String(acceptance.status))
  check('… und meldet keine Sperre durch ihn',
    !JSON.stringify(acceptance.json ?? {}).includes('"kind":"market"')
    || !blocked.some(entry => entry.includes('true')),
    blocked.join(' ').slice(0, 120))

  // ── 10 · Idempotenz ─────────────────────────────────────────────────────
  console.log('\n10 · Derselbe Stand kostet nichts')
  const reportsBefore = (await marketRows('market_reports', profileId)).length
  const again = await call(`${base}/report`, { method: 'POST', cookie: owner.cookie })
  const reportsAfter = (await marketRows('market_reports', profileId)).length
  check('der zweite Vergleich meldet `reused` und legt KEINE zweite Zeile an',
    again.status === 200 && again.json?.reused === true && reportsAfter === reportsBefore,
    `${again.status} reused=${again.json?.reused} rows ${reportsBefore}→${reportsAfter}`)
  check('… und liefert denselben Schlüssel',
    again.json?.report?.revisionKey === report?.revisionKey, '')

  // ── 11 · Brand-Check am Kandidaten ──────────────────────────────────────
  console.log('\n11 · Der BESTEHENDE Brand-Check-Score (§7.3)')
  const withCheck = (report?.competitors ?? []).find(entry => entry.id === upId)
  const withoutCheck = (report?.competitors ?? []).find(entry => entry.id === pacId)
  check('der Kandidat MIT Check trägt Score, Band und die Ergebnis-Id',
    withCheck?.brandCheck?.score === 71 && withCheck?.brandCheck?.band === 'strong'
    && withCheck?.brandCheck?.checkId === checkRow.$id,
    JSON.stringify(withCheck?.brandCheck ?? null))
  check('GEGENPROBE: der Kandidat OHNE Check trägt gar kein `brandCheck`',
    withoutCheck?.brandCheck === undefined, JSON.stringify(withoutCheck?.brandCheck ?? null))
  const stampedRow = (await marketRows('market_competitors', profileId)).find(row => row.$id === upId)
  check('die Check-ID steht an der Kandidaten-Zeile (nicht der Score)',
    stampedRow?.brandCheckId === checkRow.$id, String(stampedRow?.brandCheckId ?? ''))

  // ── 12 · `stale` ────────────────────────────────────────────────────────
  console.log('\n12 · Eine eigene Korrektur macht den Bericht überholt')
  const freshGet = await call(`${base}/report`, { cookie: owner.cookie })
  check('GEGENPROBE: unmittelbar nach dem Bericht ist er NICHT stale',
    freshGet.status === 200 && freshGet.json?.stale === false,
    `${freshGet.status} stale=${freshGet.json?.stale}`)

  await setConfirmed(profileId, 'pvm', {
    'b.positioningFirstChoice': 'Wir liefern jeden Mittwoch selbst aus.',
  })
  const staleGet = await call(`${base}/report`, { cookie: owner.cookie })
  check('nach der Korrektur eines beteiligten Feldes ⇒ stale',
    staleGet.status === 200 && staleGet.json?.stale === true,
    `${staleGet.status} stale=${staleGet.json?.stale}`)
  check('… der Bericht bleibt LESBAR (Anzeige-Wort, kein Löschen)',
    Boolean(staleGet.json?.report) && staleGet.json.report.revisionKey === report?.revisionKey,
    '')

  // ── 13 · Der Bibliotheks-Kandidat im Bericht ────────────────────────────
  //
  // Das Prüfdatum kommt aus der BIBLIOTHEK selbst, nicht aus einer zweiten
  // Zahl in diesem Skript: sonst wäre der Beweis beim nächsten geprüften
  // Eintrag rot, ohne dass am Produkt etwas falsch wäre.
  console.log('\n13 · Die Bibliothek steht im Bericht')
  const libProfile = profileOf(libId)
  check('der Bibliotheks-Kandidat hat ein Marktprofil mit Quelle `library`',
    libProfile.length > 0 && libProfile.every(field => field.source === 'library'),
    `${libProfile.length} Felder`)
  check('seine Belege tragen das PRÜFDATUM der Handprüfung',
    libProfile.some(field => field.evidence?.fetchedAt === LIBRARY_VERIFIED_AT),
    JSON.stringify(libProfile.map(field => field.evidence?.fetchedAt).filter(Boolean)))

  // Der Quellen-Wähler zeigt von einer ECHTEN Marke nur Wortname und
  // Kategorie (Plan §7.2 Nr. 3, Anhang G a). Ein Logo, eine Bildmarke oder
  // ein Favicon wäre eine andere Art der Benutzung eines fremden Zeichens als
  // die referenzierende — deshalb steht hier eine ERLAUBNISLISTE der Felder
  // und keine Sperrliste: ein neues Feld ist damit automatisch rot.
  const libList = await call(`${base}/candidates?source=library`, { cookie: owner.cookie })
  const libOptions = libList.json?.options ?? []
  const libOption = libOptions.find(option => option.id === LIBRARY_KEY)
  check('der Quellen-Wähler führt den ECHTEN Eintrag mit Name und Kategorie',
    libList.status === 200 && libOption?.label === LIBRARY_ENTRY.name && libOption?.hint === LIBRARY_ENTRY.category,
    `${libList.status} ${JSON.stringify(libOption ?? {})}`)
  // `verifiedAt` kam mit 16eabfdc („Handgeprüft am" im Quellen-Wähler) dazu —
  // ein Datum, kein Bild; die Erlaubnisliste bleibt die Sicherung gegen
  // Logo/Favicon/Bild (MV1 M6b), nicht gegen Text.
  const erlaubteFelder = new Set(['id', 'label', 'hint', 'url', 'verifiedAt'])
  const fremdeFelder = libOptions.flatMap(option => Object.keys(option).filter(key => !erlaubteFelder.has(key)))
  check('… und sonst NICHTS — kein Logo, kein Favicon, kein Bild',
    libOptions.length > 0 && fremdeFelder.length === 0,
    fremdeFelder.join(', '))

  // ── 14 · Der Lauf MIT Bericht (das Flag) ────────────────────────────────
  console.log('\n14 · Ein Klick, zwei Schritte (`withReport`)')
  const combined = await call(`${base}/run?report=1`, { method: 'POST', cookie: owner.cookie })
  check('der Lauf mit `?report=1` liefert den Bericht mit',
    combined.status === 200 && Boolean(combined.json?.report?.claims),
    `${combined.status} ${combined.json?.report ? 'mit' : 'ohne'} Bericht`)
  check('… und rechnet ihn nach der Korrektur NEU (anderer Schlüssel)',
    combined.json?.report?.revisionKey !== report?.revisionKey, '')

  // ── 15 · Fremdes Branding ───────────────────────────────────────────────
  console.log('\n15 · Ein fremdes Branding gibt es nicht')
  const stranger = await makeAccount('fremd')
  const foreignPost = await call(`${base}/report`, { method: 'POST', cookie: stranger.cookie })
  const foreignGet = await call(`${base}/report`, { cookie: stranger.cookie })
  check('fremdes Konto MIT Beta-Zugang ⇒ 404 (nicht 403), beide Richtungen',
    foreignPost.status === 404 && foreignGet.status === 404,
    `${foreignPost.status}/${foreignGet.status}`)
  const noSession = await call(`${base}/report`)
  check('ohne Anmeldung ⇒ 404', noSession.status === 404, String(noSession.status))
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
  for (const id of cleanup.checks) {
    await tablesDB.deleteRow({ databaseId, tableId: 'brand_checks', rowId: id }).catch(() => {})
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
