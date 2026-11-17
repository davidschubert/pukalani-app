/**
 * Abnahme des Self-Service-Onboardings (SAAS-ROADMAP #1, Definition of Done):
 *
 *   „Zehn unbeaufsichtigte Testläufe ohne Operator-Eingriff; Median vom Signup
 *    bis zur live erreichbaren Site ≤ 60 Sekunden, keine verwaiste Tenant-/
 *    Community-Row bei Abbruch, Retry ist idempotent."
 *
 * Gemessen wird der GANZE Weg: Konto anlegen → anmelden → Community anlegen →
 * warten, bis der Community-Host wirklich antwortet. Der letzte Schritt gehört
 * dazu, weil zwischen Datenbank-Row und erreichbarer Site die Host-Auflösung
 * liegt — ohne ihn wäre die Zahl geschönt.
 *
 *   POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/onboarding/scripts/acceptance-onboarding.mjs [--runs 10]
 */
import '../../../scripts/lib/assert-target.mjs'
import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'
import { probeSiteBody } from '../../../scripts/lib/probe-stage.mjs'

const RUNS = Number(process.argv.includes('--runs') ? process.argv[process.argv.indexOf('--runs') + 1] : 10)
const PORT = Number(process.env.PLATFORM_PORT || 3006)
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'

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

const control = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const poolUsers = new Users(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
// Inhalte (pages) leben im RUNTIME-Projekt, nicht im Control Plane — fürs
// Aufräumen braucht es deshalb einen zweiten Client.
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
        resolve({ status: res.statusCode, json, text, setCookie: res.headers['set-cookie'] ?? [] })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function countTenants() {
  const { total } = await control.listRows({ databaseId, tableId: 'communities', queries: [Query.limit(1)] })
  return total
}

async function issueCode(maxUses = 0) {
  const code = `PUKA-ABNAHME-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const row = await control.createRow({
    databaseId, tableId: 'invite_codes', rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex'),
      label: 'Abnahmelauf', maxUses, uses: 0, expiresAt: null, status: 'active',
    },
  })
  cleanup.codes.push(row.$id)
  return code
}

/** Ein vollständiger Durchlauf; liefert die Dauer in Millisekunden. */
async function runOnce(index, code) {
  const started = Date.now()

  // 1. „Signup" — ein frisches Konto im Runtime-Projekt.
  const email = `abnahme-${index}-${started}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `Abnahme ${index}` })
  cleanup.users.push(user.$id)
  // Seit BE-015 verlangt das Anlegen einer Community eine BESTÄTIGTE Adresse.
  await poolUsers.updateEmailVerification({ userId: user.$id, emailVerification: true })

  // 2. Anmelden.
  const loginRes = await call(CONTROL_HOST, '/api/auth/login', { method: 'POST', body: { email, password } })
  if (loginRes.status !== 200) throw new Error(`Login ${loginRes.status}`)
  const cookie = loginRes.setCookie.find(c => c.startsWith('a_session_'))?.split(';')[0]
  if (!cookie) throw new Error('kein Session-Cookie')

  // 3. Community anlegen (der Wizard-Abschluss).
  //
  // GENAU DIE DREI PFLICHT-ANTWORTEN (U12): Name/Adresse, Kategorie, Vibe —
  // mehr schickt der Wizard seit dem 2026-08-10 nicht mehr. Dass die alte,
  // siebenteilige Nutzlast weiterhin gilt, beweist Abschnitt 2 (Retry).
  const slug = `abnahme-${index}-${started.toString(36)}`
  const createRes = await call(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST',
    cookie,
    body: probeSiteBody({
      name: `Abnahme ${index}`,
      slug,
      category: 'other',
      vibe: 'calm',
      inviteCode: code,
      purpose: undefined,
      memberRange: undefined,
      goal: undefined,
      description: undefined,
    }),
  })
  if (createRes.status !== 200) throw new Error(`Anlage ${createRes.status}: ${createRes.text.slice(0, 120)}`)
  const site = createRes.json
  cleanup.tenants.push(site.communityId)

  // 4. Warten, bis die Site wirklich antwortet (Host-Auflösung inklusive).
  let reachable = false
  for (let i = 0; i < 90; i++) {
    const res = await call(site.host, '/')
    if (res.status === 200) { reachable = true; break }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  if (!reachable) throw new Error('Site wurde nicht erreichbar')

  return { ms: Date.now() - started, site, cookie }
}

try {
  console.log(`\nAbnahme: ${RUNS} unbeaufsichtigte Durchläufe gegen http://localhost:${PORT}\n`)
  const tenantsBefore = await countTenants()
  const code = await issueCode()
  const durations = []
  let last = null

  /**
   * Taktung, KEIN Umgehen: die Anlage ist auf 5 pro Minute und IP gedrosselt
   * (Missbrauchs-Bremse). Zehn echte Kunden kommen von zehn IPs, dieser Lauf
   * von einer — also wartet er das Fenster ab, statt das Limit für den Test
   * hochzudrehen. Die gemessene Dauer je Durchlauf bleibt davon unberührt.
   */
  const BATCH = 4
  const WINDOW_MS = 61_000

  for (let i = 1; i <= RUNS; i++) {
    if (i > 1 && (i - 1) % BATCH === 0) {
      console.log(`     … ${Math.round(WINDOW_MS / 1000)} s Pause (Rate-Limit-Fenster)`)
      await new Promise(resolve => setTimeout(resolve, WINDOW_MS))
    }
    const result = await runOnce(i, code)
    durations.push(result.ms)
    last = result
    console.log(`  ${String(i).padStart(2)}. ${(result.ms / 1000).toFixed(1)} s → ${result.site.host}`)
  }

  const sorted = [...durations].sort((a, b) => a - b)
  const median = sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2

  console.log('\n1. Definition of Done')
  check(`${RUNS} Durchläufe ohne Operator-Eingriff`, durations.length === RUNS)
  check(`Median ≤ 60 s (ist ${(median / 1000).toFixed(1)} s)`, median <= 60_000, `${(median / 1000).toFixed(1)} s`)
  check(`Langsamster Durchlauf: ${(sorted.at(-1) / 1000).toFixed(1)} s`, true)

  console.log('\n2. Retry ist idempotent — mit der ALTEN Nutzlast')
  /**
   * ZWEI BEWEISE IN EINEM AUFRUF. Der Retry schickt bewusst die
   * SIEBENTEILIGE Nutzlast von vor U12 (purpose/memberRange/goal/description):
   * das ist die Lage zwischen zwei Deploys, wenn eine ältere `platform` mit
   * der schon ausgetauschten `control` spricht (deploy.yml fährt control
   * zuerst). Das Naht-Schema ist `.strict()` — wären die Felder gestrichen
   * statt optional, stünde hier ein 400 und JEDE Anlage in diesem Fenster
   * wäre tot.
   */
  const retry = await call(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST',
    cookie: last.cookie,
    body: probeSiteBody({
      name: last.site.host,
      slug: last.site.host.split('.')[0],
      category: 'other',
      description: 'Aus einer älteren platform.',
      vibe: 'calm',
      inviteCode: code,
    }),
  })
  check('alte Nutzlast bleibt gültig (nicht 400)', retry.status === 200, `Status ${retry.status}: ${retry.text.slice(0, 120)}`)
  check('gibt dieselbe Community zurück', retry.json?.communityId === last.site.communityId && retry.json?.reused === true, JSON.stringify(retry.json))
  // Seiten sind Teil der Idempotenz: ein Doppelklick darf keine zweite
  // Startseite und keine zweiten Rechtsseiten-Vorlagen erzeugen (Befund S7).
  const pagesAfterRetry = await pool.listRows({
    databaseId: poolDatabaseId, tableId: 'pages',
    queries: [Query.equal('communityId', last.site.tenantId), Query.limit(25)],
  })
  // FÜNF, nicht drei: die Startseite wird seit U4 in BEIDE Sprachen gesät
  // (Trichter-M4), dazu Impressum, Datenschutz und die Community-Regeln.
  check('genau 5 Seiten nach dem Retry (home de+en, Impressum, Datenschutz, Regeln)',
    pagesAfterRetry.rows.length === 5,
    pagesAfterRetry.rows.map(row => `${row.slug}/${row.locale}`).join(', '))

  console.log('\n3. Abbruch hinterlässt nichts')
  const before = await countTenants()
  const invalid = await call(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST', cookie: last.cookie,
    body: probeSiteBody({
      name: 'x',
      slug: 'login',
      category: 'other',
      vibe: 'calm',
      inviteCode: code,
      purpose: undefined,
      memberRange: undefined,
      goal: undefined,
      description: undefined,
      locale: undefined,
    }),
  })
  const quotaBlocked = await call(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST', cookie: last.cookie,
    body: probeSiteBody({
      name: 'Zweite',
      slug: `zweite-${Date.now().toString(36)}`,
      category: 'other',
      vibe: 'calm',
      inviteCode: code,
      purpose: undefined,
      memberRange: undefined,
      goal: undefined,
      description: undefined,
      locale: undefined,
    }),
  })
  const after = await countTenants()
  check('abgelehnte Eingabe (reservierter Name) → 400', invalid.status === 400, `Status ${invalid.status}`)
  check('zweite Community in der Testphase → 403', quotaBlocked.status === 403, `Status ${quotaBlocked.status}`)
  check('KEINE zusätzliche Tenant-Row entstanden', after === before, `${before} → ${after}`)

  console.log('\n4. Was jeder Durchlauf hinterlassen hat')
  const members = await control.listRows({
    databaseId, tableId: 'community_members',
    queries: [Query.equal('communityId', cleanup.tenants), Query.limit(100)],
  })
  cleanup.members.push(...members.rows.map(row => row.$id))
  check(`genau ${RUNS} Owner-Mitgliedschaften`, members.rows.length === RUNS && members.rows.every(row => row.role === 'owner'), `${members.rows.length}`)

  const tenantRows = await control.listRows({
    databaseId, tableId: 'communities', queries: [Query.equal('$id', cleanup.tenants), Query.limit(100)],
  })
  check('alle im Trial-Plan (pro) mit 14 Tagen', tenantRows.rows.every(row =>
    row.plan === 'pro' && Math.round((Date.parse(row.trialEndsAt) - Date.now()) / 86_400_000) === 14))
  // C18 (2026-07-30): öffentlich als Default — siehe onboardingProvision.ts.
  check('alle öffentlich (audience public)', tenantRows.rows.every(row => row.audience === 'public'))

  /**
   * DIE STARTSEITE STEHT — MIT DEM RÜCKFALLTEXT (U12).
   *
   * Bis zum 2026-08-10 kam ihr Text aus der Wizard-Beschreibung; die fragt
   * der Wizard nicht mehr, also greift der Rückfalltext aus site.post.ts.
   * Geprüft wird beides: dass die Seite überhaupt da und veröffentlicht ist
   * (sonst stünde der Owner vor einer leeren Community), und dass sie den
   * Namen seiner Community trägt statt eines Platzhalters. Den eigenen Text
   * schreibt er danach — das ist der Checklisten-Punkt „Startseite".
   */
  const homeRes = await call(last.site.host, '/api/pages/public/home?locale=de')
  const homeBody = homeRes.json?.body ?? ''
  check('Startseite steht und ist öffentlich', homeRes.status === 200, `Status ${homeRes.status}`)
  check('Startseite trägt den Rückfalltext mit dem Community-Namen',
    homeBody.includes(last.site.host.split('.')[0]) || /Willkommen bei/.test(homeBody),
    homeBody.slice(0, 120))

  // Audit-Befund S7: Impressum + Datenschutz entstehen als VORLAGEN-ENTWÜRFE.
  // Geprüft werden beide Seiten der Sache — im Datenbestand vorhanden UND
  // öffentlich unsichtbar. Nur zusammen ist das die Zusage: der Betreiber hat
  // etwas zum Ausfüllen, aber niemand sieht einen leeren Rechtstext.
  const legalRows = await pool.listRows({
    databaseId: poolDatabaseId, tableId: 'pages',
    queries: [Query.equal('communityId', last.site.tenantId), Query.equal('slug', ['imprint', 'privacy']), Query.limit(25)],
  })
  check('Impressum + Datenschutz als Vorlage angelegt', legalRows.rows.length === 2, `${legalRows.rows.length} Rows`)
  check('beide sind ENTWURF (nicht veröffentlicht)', legalRows.rows.every(row => row.status === 'draft'))
  check('beide tragen den Mandanten-Scope', legalRows.rows.every(row => row.communityId === last.site.tenantId))
  check('beide tragen Platzhalter-Marker', legalRows.rows.every(row => row.body.includes('[AUSFÜLLEN:')))
  const imprintPublic = await call(last.site.host, '/api/pages/public/imprint?locale=de')
  check('Impressum ist öffentlich NICHT abrufbar → 404', imprintPublic.status === 404, `Status ${imprintPublic.status}`)
  const imprintPage = await call(last.site.host, '/de/imprint')
  check('Seite /de/imprint antwortet 404 (Entwurf)', imprintPage.status === 404, `Status ${imprintPage.status}`)
  const nav = await call(last.site.host, '/api/pages/public?locale=de')
  check('Entwürfe stehen nicht in der öffentlichen Navigation',
    Array.isArray(nav.json) && !nav.json.some(item => item.slug === 'imprint' || item.slug === 'privacy'),
    JSON.stringify(nav.json))

  console.log(`\n  Tenants vor dem Lauf: ${tenantsBefore} · danach: ${after}`)
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n5. Aufräumen')
  // Seiten der Testläufe (tenant-gescopt, im RUNTIME-Projekt) mitnehmen.
  for (const tenantRow of cleanup.tenants) {
    const t = await control.getRow({ databaseId, tableId: 'communities', rowId: tenantRow }).catch(() => null)
    if (!t?.tenantId) continue
    const pages = await pool.listRows({ databaseId: poolDatabaseId, tableId: 'pages', queries: [Query.equal('communityId', t.tenantId), Query.limit(25)] }).catch(() => null)
    for (const page of pages?.rows ?? []) {
      await pool.deleteRow({ databaseId: poolDatabaseId, tableId: 'pages', rowId: page.$id }).catch(() => {})
      cleanup.pages.push(page.$id)
    }
  }
  for (const id of cleanup.members) await control.deleteRow({ databaseId, tableId: 'community_members', rowId: id }).catch(() => {})
  for (const id of cleanup.tenants) await control.deleteRow({ databaseId, tableId: 'communities', rowId: id }).catch(() => {})
  for (const id of cleanup.codes) await control.deleteRow({ databaseId, tableId: 'invite_codes', rowId: id }).catch(() => {})
  for (const id of cleanup.users) await poolUsers.delete({ userId: id }).catch(() => {})
  const rest = await control.listRows({ databaseId, tableId: 'communities', queries: [Query.limit(25)] })
  console.log(`  ✔ aufgeräumt — verbleibende Tenants: ${rest.rows.map(r => r.host).join(', ') || '(keine)'}`)
  if (cleanup.pages.length) console.log(`  ✔ ${cleanup.pages.length} erzeugte Startseiten entfernt`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
