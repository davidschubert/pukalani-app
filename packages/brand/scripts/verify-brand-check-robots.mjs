/**
 * Beweis für BS1 R2b — der Brand-Check respektiert `robots.txt` und den
 * TDM-Nutzungsvorbehalt (Davids Entscheidung 2026-09-08).
 *
 * Gemessen wird gegen die ECHTE Route, die echte Ablage und drei erfundene
 * Websites, die dieses Skript selbst ausliefert. Der Kern des Beweises ist
 * nicht die Statuszahl, sondern das ZUGRIFFSPROTOKOLL der Demo-Server: nur so
 * lässt sich zeigen, dass eine verbotene Seite nicht bloss verworfen, sondern
 * gar nicht erst GEHOLT wurde.
 *
 *  1. ERLAUBT: eine Website mit harmloser `robots.txt` läuft ganz normal durch
 *     — 200, eine Id, und unter der Id steht ein Score mit Band. Ihr Server hat
 *     `/robots.txt`, `/.well-known/tdmrep.json` UND `/` gesehen: die
 *     Erlaubnis-Frage kostet genau zwei zusätzliche Abrufe, nicht mehr.
 *  2. ROBOTS-VERBOT: eine Website, die `PukalaniBrandCheck` aussperrt, ergibt
 *     409 `site_blocked` — und ihr Server wurde für die SEITE nie angefasst
 *     (`/` fehlt im Protokoll). Es entsteht KEINE Zeile in `brand_checks`.
 *  3. NUTZUNGSVORBEHALT: eine Website mit `<meta name="robots" content="noai">`
 *     ergibt ebenfalls 409 `site_blocked`. Hier MUSS die Seite geholt worden
 *     sein — der Vorbehalt steht in ihr; gespeichert wird trotzdem nichts.
 *  4. DER ABSENDER: alle drei Server haben `PukalaniBrandCheck/1.0` im
 *     `User-Agent` gesehen, nie den des Wizards. Wer eine `robots.txt` gegen
 *     einen anderen Namen prüft als den, mit dem er anfragt, prüft nichts.
 *  5. GEGENPROBE, das Herzstück: der WIZARD-Weg
 *     (`POST /api/brand/profiles/:id/analyze`) liest dieselbe robots-gesperrte
 *     Website WEITERHIN. Er ist bewusst ausgenommen — dort trägt ein
 *     eingeloggter Betreiber seine EIGENE Adresse ein. Ohne diese Gegenprobe
 *     bewiese Schritt 2 nur, dass irgendetwas kaputt ist.
 *  6. DIE ÖFFENTLICHE ZUSAGE: `/brand-check/methodik` sagt in beiden Sprachen,
 *     dass `robots.txt` und Vorbehalt geachtet werden, und zeigt die Zeile, mit
 *     der man uns aussperrt. Geprüft am SSR-HTML, nicht an der Locale-Datei.
 *
 * ── WAS DIESER BEWEIS NICHT BEWEIST ──────────────────────────────────────
 * Den Anbieter. Er läuft mit `BRAND_DEV_STUB_CHECK=1`, also ohne einen
 * bezahlten Aufruf — sonst endete Schritt 1 auf der Entwicklungs-Maschine bei
 * 503 (dort liegt kein KI-Schlüssel), und die Gegenprobe wäre keine. Die
 * REGELN selbst (robots-Gruppen, die vier Formen des Vorbehalts) hängen an
 * `packages/brand/tests/brandCheckRobots.test.ts`.
 *
 * ── VORBEDINGUNGEN ───────────────────────────────────────────────────────
 * Lokale Dev-Appwrite mit den `brand_*`-Tabellen und ein FRISCHER Dev-Server
 * der branding-App AUS DEM WORKTREE (CLAUDE.md „Worktree-Beweise"; frisch,
 * weil der Gast-Deckel 3 Checks am Tag je Anschluss zulässt und dieses Skript
 * genau drei braucht):
 *
 *   BRAND_DEV_STUB_CHECK=1 BRAND_SITE_FETCH_ALLOW_LOOPBACK=1 \
 *     pnpm --filter branding exec nuxi dev --port 3016
 *   BRANDING_PORT=3016 node --env-file=apps/branding/.env \
 *     packages/brand/scripts/verify-brand-check-robots.mjs
 *
 * `BRAND_SITE_FETCH_ALLOW_LOOPBACK=1` ist die Dev-Ausnahme im SSRF-Vertrag
 * (`packages/brand/server/utils/brandSiteFetch.ts`): ohne sie weist der Abruf
 * die Demo-Server auf `127.0.0.1:<freier Port>` zu Recht ab. Auf einem Server
 * sind beide Schalter wirkungslos (`NODE_ENV`).
 */
import { createServer, request } from 'node:http'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const baseArg = process.argv.slice(2).find(arg => arg.startsWith('--base='))
const baseUrl = baseArg ? new URL(baseArg.slice('--base='.length)) : null
const PORT = Number(baseUrl?.port || process.env.BRANDING_PORT || 3016)
const HOST = baseUrl?.hostname || process.env.BRANDING_HOST || 'localhost'

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

const stamp = Date.now()
let pass = 0
let fail = 0
const cleanup = { users: [], profiles: [], access: [], checks: [] }
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

// ── Die drei erfundenen Websites ───────────────────────────────────────────

/**
 * Eine Seite mit genug Substanz, dass die gerechneten Kriterien etwas zu
 * messen haben — der Score selbst ist hier nicht der Beweis, aber eine leere
 * Seite ergäbe einen, den niemand ernst nehmen könnte.
 */
function page({ title, extraHead = '' }) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="Wir rösten Kaffee in kleinen Mengen auf Maui und liefern ihn frisch an Cafés.">
<meta name="viewport" content="width=device-width, initial-scale=1">
${extraHead}
</head>
<body>
<h1>${title}</h1>
<p>Wir rösten Kaffee in kleinen Mengen. Jede Charge kommt von einer Farm, die wir kennen,
und wird am Tag nach der Röstung ausgeliefert. Für Cafés auf Maui, die wissen wollen,
woher ihr Kaffee kommt.</p>
<h2>Sorten</h2>
<p>Drei Röstungen, das ganze Jahr über dieselben. Wir wechseln nichts, nur weil eine Saison
vorbei ist.</p>
<a href="/kontakt">Jetzt bestellen</a>
</body>
</html>`
}

/**
 * EIN Server je Demo-Site auf einem EIGENEN, freien Port — `robots.txt` und
 * `/.well-known/tdmrep.json` sind pro URSPRUNG definiert, nicht pro
 * Verzeichnis. Jeder Zugriff wird MITGESCHRIEBEN (Pfad + Absender): das ist die
 * einzige ehrliche Art, „diese Seite wurde NICHT geholt" zu beweisen.
 */
async function startDemoSite(routes) {
  const hits = []
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    hits.push({ path: url.pathname, agent: String(req.headers['user-agent'] ?? '') })
    const route = routes[url.pathname]
    if (!route) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('not found')
      return
    }
    res.writeHead(200, { 'content-type': route.type, ...(route.headers ?? {}) })
    res.end(route.body)
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  servers.push(server)
  const port = server.address().port
  return { origin: `http://127.0.0.1:${port}`, hits, paths: () => hits.map(hit => hit.path) }
}

const HTML = 'text/html; charset=utf-8'
const TEXT = 'text/plain; charset=utf-8'

/** node:http über ::1 mit gesetztem Host (CLAUDE.md, „Beweise"). */
function call(path, { method = 'GET', body, cookie } = {}) {
  return new Promise((done, reject) => {
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
        done({ status: res.statusCode, json, text })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/** Ein Konto MIT Beta-Zugang — nur für die Wizard-Gegenprobe (Schritt 5). */
async function makeAccount(tag) {
  const user = await users.create({
    userId: ID.unique(),
    email: `bs1-r2b-${stamp}-${tag}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: 'BS1-R2b-Beweis',
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

/** Wie viele Zeilen liegen für DIESEN Wirt in `brand_checks`? */
async function checkRowsFor(origin) {
  const host = new URL(origin).host
  const found = await tablesDB.listRows({
    databaseId,
    tableId: 'brand_checks',
    queries: [Query.equal('host', host), Query.limit(25)],
  }).catch(() => ({ rows: [] }))
  for (const row of found.rows) cleanup.checks.push(row.$id)
  return found.rows
}

try {
  // ── Die drei Websites ───────────────────────────────────────────────────
  console.log('0 · Drei erfundene Websites, jede auf eigenem Ursprung')

  const allowed = await startDemoSite({
    '/': { type: HTML, body: page({ title: 'Kailua Coffee' }) },
    // Ein Verbot, das uns NICHT meint — es beweist zugleich, dass der Parser
    // nicht einfach jede vorhandene Datei als „nein" liest.
    '/robots.txt': { type: TEXT, body: 'User-agent: *\nDisallow: /admin\n' },
  })
  const blocked = await startDemoSite({
    '/': { type: HTML, body: page({ title: 'Kona Trading' }) },
    '/robots.txt': { type: TEXT, body: 'User-agent: PukalaniBrandCheck\nDisallow: /\n' },
  })
  const reserved = await startDemoSite({
    '/': {
      type: HTML,
      body: page({ title: 'Island Grind', extraHead: '<meta name="robots" content="index, noai">' }),
    },
    '/robots.txt': { type: TEXT, body: 'User-agent: *\nDisallow:\n' },
  })
  check('drei Ursprünge stehen', Boolean(allowed.origin && blocked.origin && reserved.origin),
    `${allowed.origin} · ${blocked.origin} · ${reserved.origin}`)

  // ── 1 · Erlaubt ─────────────────────────────────────────────────────────
  console.log('\n1 · Erlaubte Website: 200 mit Score')

  const ok = await call('/api/brand/check', {
    method: 'POST',
    body: { url: `${allowed.origin}/`, locale: 'de' },
  })
  check('POST /api/brand/check ⇒ 200 mit Id', ok.status === 200 && Boolean(ok.json?.id),
    `${ok.status} ${ok.text.slice(0, 200)}`)

  const result = ok.json?.id
    ? await call(`/api/brand/check/${encodeURIComponent(ok.json.id)}`)
    : { status: 0, json: null, text: '' }
  check('unter der Id steht ein Score mit Band',
    result.status === 200
    && typeof result.json?.score === 'number'
    && typeof result.json?.band === 'string',
    `${result.status} ${result.text.slice(0, 200)}`)

  check('die Erlaubnis wurde GEFRAGT: /robots.txt steht im Protokoll',
    allowed.paths().includes('/robots.txt'), allowed.paths().join(' '))
  check('und der Vorbehalt: /.well-known/tdmrep.json steht im Protokoll',
    allowed.paths().includes('/.well-known/tdmrep.json'), allowed.paths().join(' '))
  check('die SEITE wurde danach geholt', allowed.paths().includes('/'), allowed.paths().join(' '))
  check('DAS BUDGET: genau drei Abrufe, kein vierter',
    allowed.paths().length === 3, allowed.paths().join(' '))
  check('die Reihenfolge stimmt — erst fragen, dann lesen',
    allowed.paths()[0] === '/robots.txt' && allowed.paths().at(-1) === '/',
    allowed.paths().join(' '))

  // ── 2 · robots.txt sagt nein ────────────────────────────────────────────
  console.log('\n2 · robots.txt sperrt unseren Absender aus')

  const refused = await call('/api/brand/check', {
    method: 'POST',
    body: { url: `${blocked.origin}/`, locale: 'de' },
  })
  check('⇒ 409 mit `site_blocked` im Envelope',
    refused.status === 409 && refused.json?.reason === 'site_blocked',
    `${refused.status} ${refused.text.slice(0, 200)}`)
  check('GEGENPROBE, das Herzstück: die SEITE wurde nie angefasst',
    !blocked.paths().includes('/'), blocked.paths().join(' '))
  check('gefragt wurde nur die robots.txt',
    blocked.paths().length === 1 && blocked.paths()[0] === '/robots.txt',
    blocked.paths().join(' '))
  check('und es entstand KEINE Zeile in brand_checks',
    (await checkRowsFor(blocked.origin)).length === 0)

  // ── 3 · Nutzungsvorbehalt ───────────────────────────────────────────────
  console.log('\n3 · Die Seite erklärt einen Nutzungsvorbehalt (noai)')

  const reservedAnswer = await call('/api/brand/check', {
    method: 'POST',
    body: { url: `${reserved.origin}/`, locale: 'de' },
  })
  check('⇒ 409 mit `site_blocked` im Envelope',
    reservedAnswer.status === 409 && reservedAnswer.json?.reason === 'site_blocked',
    `${reservedAnswer.status} ${reservedAnswer.text.slice(0, 200)}`)
  check('die Seite MUSSTE geholt werden — der Vorbehalt steht in ihr',
    reserved.paths().includes('/'), reserved.paths().join(' '))
  check('gespeichert wurde trotzdem nichts',
    (await checkRowsFor(reserved.origin)).length === 0)

  // ── 4 · Der Absender ────────────────────────────────────────────────────
  console.log('\n4 · Wir haben uns überall gleich vorgestellt')

  const agents = [...allowed.hits, ...blocked.hits, ...reserved.hits].map(hit => hit.agent)
  check('jeder Abruf trug `PukalaniBrandCheck/1.0`',
    agents.length > 0 && agents.every(agent => agent.startsWith('PukalaniBrandCheck/1.0')),
    [...new Set(agents)].join(' | '))
  check('GEGENPROBE: der Absender des Wizards kam nirgends vor',
    agents.every(agent => !agent.includes('PukalaniBrandWizard')),
    [...new Set(agents)].join(' | '))
  check('die +-Adresse zeigt auf die Methodik-Seite',
    agents.every(agent => agent.includes('/brand-check/methodik')),
    [...new Set(agents)].join(' | '))

  // ── 5 · Die Gegenprobe: der Wizard-Weg bleibt offen ─────────────────────
  console.log('\n5 · GEGENPROBE — die eigene Website im Wizard wird weiter gelesen')

  const owner = await makeAccount('owner')
  const created = await call('/api/brand/profiles', {
    method: 'POST',
    cookie: owner.cookie,
    body: {
      title: 'Kona Trading',
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
  if (profileId) cleanup.profiles.push(profileId)
  check('ein Branding für die Gegenprobe steht',
    Boolean(profileId), `${created.status} ${created.text.slice(0, 200)}`)

  const hitsBefore = blocked.paths().length
  const analyzed = profileId
    ? await call(`/api/brand/profiles/${profileId}/analyze`, {
        method: 'POST',
        cookie: owner.cookie,
        body: { url: `${blocked.origin}/` },
      })
    : { status: 0, text: '' }
  check('der Wizard liest DIESELBE robots-gesperrte Adresse ⇒ 200',
    analyzed.status === 200, `${analyzed.status} ${analyzed.text.slice(0, 200)}`)
  check('und hat die SEITE dafür wirklich geholt',
    blocked.paths().slice(hitsBefore).includes('/'),
    blocked.paths().slice(hitsBefore).join(' '))
  check('er hat dafür KEINE robots.txt gefragt — der Weg ist bewusst ausgenommen',
    !blocked.paths().slice(hitsBefore).includes('/robots.txt'),
    blocked.paths().slice(hitsBefore).join(' '))
  check('und hat sich als Wizard vorgestellt, nicht als Check',
    blocked.hits.slice(hitsBefore).every(hit => hit.agent.startsWith('PukalaniBrandWizard/1.0')),
    [...new Set(blocked.hits.slice(hitsBefore).map(hit => hit.agent))].join(' | '))

  // ── 6 · Die öffentliche Zusage ──────────────────────────────────────────
  console.log('\n6 · Die Methodik-Seite sagt es — in beiden Sprachen')

  const de = await call('/de/brand-check/methodik')
  const en = await call('/brand-check/methodik')
  check('die Seite antwortet in beiden Sprachen',
    de.status === 200 && en.status === 200, `${de.status} / ${en.status}`)
  check('DE: nennt robots.txt und den Nutzungsvorbehalt als geachtet',
    de.text.includes('robots.txt') && de.text.includes('Nutzungsvorbehalt'))
  check('EN: nennt robots.txt und die Reservation',
    en.text.includes('robots.txt') && en.text.toLowerCase().includes('reservation'))
  check('beide zeigen die Zeile, mit der man uns aussperrt',
    de.text.includes('User-agent: PukalaniBrandCheck')
    && en.text.includes('User-agent: PukalaniBrandCheck'))
  check('beide nennen den Absender wörtlich',
    de.text.includes('PukalaniBrandCheck/1.0')
    && en.text.includes('PukalaniBrandCheck/1.0'))
  check('GEGENPROBE: der alte Satz „wertet keine robots.txt aus" steht nicht mehr da',
    !de.text.includes('fragt keine robots.txt ab')
    && !en.text.includes('does not consult robots.txt'))
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error instanceof Error ? error.message : error)
}
finally {
  for (const id of cleanup.checks) {
    await tablesDB.deleteRow({ databaseId, tableId: 'brand_checks', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.profiles) {
    await tablesDB.deleteRow({ databaseId, tableId: 'brand_profiles', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.access) {
    await tablesDB.deleteRow({ databaseId, tableId: 'brand_access', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.users) {
    await users.delete({ userId: id }).catch(() => {})
  }
  for (const server of servers) {
    // Erst die Keep-alive-Sockets, dann schliessen — sonst wartet `close()`
    // auf Verbindungen, die niemand mehr braucht (CLAUDE.md, „Tests").
    server.closeAllConnections()
    await new Promise(done => server.close(done))
  }

  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass}/${pass + fail} Prüfungen bestanden`)
  process.exit(fail === 0 ? 0 : 1)
}
