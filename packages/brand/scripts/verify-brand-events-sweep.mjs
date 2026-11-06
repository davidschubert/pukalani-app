/**
 * Beweis für BS1 R1b — die 24-Monats-Frist der Funnel-Ereignisse
 * (`brand_events`) hat ab jetzt eine MECHANIK, nicht nur einen Kommentar im
 * Kopf von `007-brand-events.ts`.
 *
 * Geprüft wird gegen echte Routen, echte Ablage und die ECHTE UHR:
 *
 *  1. VORBEDINGUNG: drei Ereignis-Zeilen liegen da — 25 Monate alt, 23 Monate
 *     alt, frisch. Die alten sind WIRKLICH alt: Appwrite nimmt `$createdAt`
 *     beim Anlegen mit dem Server-Schlüssel entgegen, der Beweis muss also
 *     weder zwei Jahre warten noch dem Sweep eine falsche Uhr unterschieben.
 *  2. DER BETREIBER-KNOPF: `POST /api/brand/ops/events-sweep` antwortet 200
 *     mit Zählern. GEGENPROBEN: ohne Session 401, mit gewöhnlichem Konto 403 —
 *     der Sweep läuft über ALLE Brandings, das ist ein Betreiber-Recht.
 *  3. DIE FRIST WIRKT: die 25 Monate alte Zeile ist WEG (gelöscht, nicht
 *     geleert — es sind Ereignisse, keine Belege).
 *  4. GEGENPROBE, das Herzstück: die 23 Monate alte Zeile und die frische
 *     stehen unverändert da. Ein Sweep, der alles löscht, bestünde jede
 *     Prüfung, die nur „alt ist weg" fragt — und nähme dem Betreiber seinen
 *     Trichter.
 *  5. KEIN INDEX NÖTIG: dass der Sweep die alte Zeile überhaupt gefunden hat,
 *     ist der Beleg — er sucht ausschliesslich über
 *     `Query.lessThan('$createdAt', …)` + `orderAsc('$createdAt')`. Antwortete
 *     Appwrite hier mit „index not found", wäre Schritt 3 rot. Deshalb kostet
 *     die Frist KEINE Folge-Migration.
 *  6. IDEMPOTENZ: ein zweiter Lauf löscht nichts mehr (die gelöschten Zeilen
 *     fallen aus der Abfrage) und meldet keine Fehler.
 *
 * ── WAS DIESER BEWEIS NICHT BEWEIST ──────────────────────────────────────
 * Den TAKT. Ob `setInterval` nach 24 Stunden feuert, misst hier niemand;
 * geprüft wird die ARBEIT, die beide Einstiege teilen (`runBrandEventsSweep`),
 * über den Betreiber-Knopf. Die reine REGEL (Stichtag, Fail-Richtung,
 * Schaltjahr) hängt an `packages/brand/tests/brandEventsRetention.test.ts` —
 * dieses Skript beweist, dass sie an echten Zeilen greift.
 *
 * ── ER FASST NUR SEINE EIGENEN ZEILEN AN ─────────────────────────────────
 * Die drei Zeilen tragen einen Lauf-Stempel in `profileId` und werden am Ende
 * restlos weggeräumt. Der Sweep selbst ist tabellenweit — auf einer
 * Entwicklungs-Appwrite ist das folgenlos (dort ist nichts zwei Jahre alt),
 * gegen eine ECHTE Instanz gehört dieses Skript deshalb NICHT.
 *
 * ── VORBEDINGUNGEN ───────────────────────────────────────────────────────
 * Lokale Dev-Appwrite mit den `brand_*`-Tabellen und ein Dev-Server der
 * branding-App AUS DEM WORKTREE (CLAUDE.md „Tests"):
 *
 *   pnpm --filter branding exec nuxi dev --port 3016
 *   BRANDING_PORT=3016 node --env-file=apps/branding/.env \
 *     packages/brand/scripts/verify-brand-events-sweep.mjs
 *
 * `--base=http://localhost:3016` tut dasselbe, wenn ein anderer Worktree den
 * Standard-Port belegt.
 */
import { request } from 'node:http'
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

const EVENTS = 'brand_events'
const stamp = Date.now()
/** Der Lauf-Stempel steht in `profileId` — so findet das Aufräumen alles wieder. */
const RUN_TAG = `r1b-${stamp}`

let pass = 0
let fail = 0
const cleanup = { users: [], rows: [] }

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

async function makeAccount(tag, { labels } = {}) {
  const user = await users.create({
    userId: ID.unique(),
    email: `bs1-r1b-${stamp}-${tag}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: 'BS1-R1b-Beweis',
  })
  cleanup.users.push(user.$id)
  await users.updateEmailVerification({ userId: user.$id, emailVerification: true })
  if (labels) await users.updateLabels({ userId: user.$id, labels })
  const session = await users.createSession({ userId: user.$id })
  return { id: user.$id, cookie: `a_session_${projectId}=${encodeURIComponent(session.secret)}` }
}

/** Eine Ereignis-Zeile mit einem WIRKLICH alten `$createdAt`. */
async function makeEvent(monthsAgo, type) {
  const created = new Date()
  created.setUTCMonth(created.getUTCMonth() - monthsAgo)
  const row = await tablesDB.createRow({
    databaseId,
    tableId: EVENTS,
    rowId: ID.unique(),
    data: {
      type,
      profileId: RUN_TAG,
      userId: '',
      payload: JSON.stringify({ probe: monthsAgo }),
      $createdAt: created.toISOString(),
    },
  })
  cleanup.rows.push(row.$id)
  return row
}

async function eventExists(rowId) {
  return await tablesDB.getRow({ databaseId, tableId: EVENTS, rowId })
    .then(row => row)
    .catch(() => null)
}

try {
  // ── 1 · Vorbedingung ────────────────────────────────────────────────────
  console.log('1 · Drei Ereignisse: 25 Monate alt, 23 Monate alt, frisch')

  const older = await makeEvent(25, 'step.restarted')
  const edge = await makeEvent(23, 'profile.created')
  const fresh = await makeEvent(0, 'profile.created')

  const monthsOf = row => (Date.now() - Date.parse(row.$createdAt)) / (30.44 * 86_400_000)
  check('die alte Zeile ist WIRKLICH alt — Appwrite hat `$createdAt` angenommen',
    monthsOf(older) > 24.5, `${monthsOf(older).toFixed(1)} Monate`)
  check('GEGENPROBE-Zeile liegt knapp INNERHALB der Frist',
    monthsOf(edge) > 22 && monthsOf(edge) < 24, `${monthsOf(edge).toFixed(1)} Monate`)
  check('die frische Zeile ist von jetzt', monthsOf(fresh) < 0.1, `${monthsOf(fresh).toFixed(3)} Monate`)

  // ── 2 · Der Betreiber-Knopf ─────────────────────────────────────────────
  console.log('\n2 · Der Knopf ist ein BETREIBER-Knopf')

  const anonymous = await call('/api/brand/ops/events-sweep', { method: 'POST' })
  check('GEGENPROBE: ohne Session ⇒ 401', anonymous.status === 401, String(anonymous.status))

  const member = await makeAccount('member')
  const denied = await call('/api/brand/ops/events-sweep', { method: 'POST', cookie: member.cookie })
  check('GEGENPROBE: gewöhnliches Konto ohne `system.manage` ⇒ 403',
    denied.status === 403, String(denied.status))

  const operator = await makeAccount('operator', { labels: ['admin'] })
  const swept = await call('/api/brand/ops/events-sweep', { method: 'POST', cookie: operator.cookie })
  check('der Betreiber-Knopf antwortet 200 mit Zählern',
    swept.status === 200 && typeof swept.json?.deleted === 'number',
    `${swept.status} ${JSON.stringify(swept.json ?? {})}`)
  check('mindestens die alte Zeile wurde gelöscht, ohne Fehler',
    (swept.json?.deleted ?? 0) >= 1 && (swept.json?.errors ?? 0) === 0,
    JSON.stringify(swept.json ?? {}))

  // ── 3+4 · Die Frist wirkt — und nur sie ─────────────────────────────────
  console.log('\n3 · Älter als 24 Monate ist WEG — jünger steht unverändert da')

  const olderAfter = await eventExists(older.$id)
  const edgeAfter = await eventExists(edge.$id)
  const freshAfter = await eventExists(fresh.$id)

  check('die 25 Monate alte Zeile ist gelöscht (nicht geleert)', olderAfter === null,
    olderAfter ? 'steht noch da' : '')
  check('GEGENPROBE: die 23 Monate alte Zeile steht noch da', edgeAfter !== null, '')
  check('GEGENPROBE: und trägt ihre Nutzlast unverändert',
    edgeAfter?.payload === edge.payload, `${edge.payload} → ${edgeAfter?.payload ?? 'weg'}`)
  check('GEGENPROBE: die frische Zeile steht noch da', freshAfter !== null, '')

  // ── 5 · Kein Index nötig ────────────────────────────────────────────────
  console.log('\n4 · Die Abfrage über `$createdAt` läuft ohne eigenen Index')

  check('der Sweep hat die alte Zeile über `$createdAt` gefunden — sonst wäre Schritt 3 rot',
    olderAfter === null, 'Appwrite hätte sonst „index not found" geantwortet')
  const direct = await tablesDB.listRows({
    databaseId,
    tableId: EVENTS,
    queries: [Query.lessThan('$createdAt', new Date().toISOString()), Query.orderAsc('$createdAt'), Query.limit(1)],
  }).catch(error => ({ error }))
  check('und dieselbe Abfrage direkt gegen Appwrite antwortet ebenfalls',
    !direct.error, direct.error?.message ?? '')

  // ── 6 · Idempotenz ──────────────────────────────────────────────────────
  console.log('\n5 · Ein zweiter Lauf hat nichts mehr zu tun')

  const again = await call('/api/brand/ops/events-sweep', { method: 'POST', cookie: operator.cookie })
  check('zweiter Lauf: 200, nichts gelöscht, keine Fehler',
    again.status === 200 && (again.json?.deleted ?? -1) === 0 && (again.json?.errors ?? -1) === 0,
    `${again.status} ${JSON.stringify(again.json ?? {})}`)
  check('GEGENPROBE: die beiden jüngeren Zeilen haben auch den zweiten Lauf überlebt',
    (await eventExists(edge.$id)) !== null && (await eventExists(fresh.$id)) !== null, '')
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error instanceof Error ? error.message : error)
}
finally {
  // Restlos aufräumen: erst die bekannten Zeilen-Ids, dann alles, was den
  // Lauf-Stempel trägt (falls eine Id nicht mitgeschrieben wurde).
  for (const id of cleanup.rows) {
    await tablesDB.deleteRow({ databaseId, tableId: EVENTS, rowId: id }).catch(() => {})
  }
  const leftovers = await tablesDB.listRows({
    databaseId, tableId: EVENTS, queries: [Query.equal('profileId', RUN_TAG), Query.limit(50)],
  }).catch(() => ({ rows: [] }))
  for (const row of leftovers.rows) {
    await tablesDB.deleteRow({ databaseId, tableId: EVENTS, rowId: row.$id }).catch(() => {})
  }
  for (const id of cleanup.users) {
    await users.delete({ userId: id }).catch(() => {})
  }

  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass}/${pass + fail} Prüfungen bestanden`)
  process.exit(fail === 0 ? 0 : 1)
}
