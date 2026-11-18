/**
 * Beweis für die MITGLIEDER-KARTE (Etappe 2, 2026-08-23).
 *
 * Fährt den echten Kundenpfad gegen den laufenden Platform-Server: Konten
 * anlegen → Community per Wizard-Route anlegen → Mitgliedschaften über die
 * Service-Naht setzen → dann auf dem Community-Host prüfen:
 *
 *   1. Die GRENZE: Gast 401, Fremder (eingeloggt, kein Mitglied) 403 — für die
 *      Karte UND für die Detailseite.
 *   2. Ein Mitglied OHNE eigenen Standort darf die Karte trotzdem sehen (200),
 *      sie ist dann nur leer. Und zwar auch als `viewer` — die Karte hängt an
 *      `members.invite`, nicht an `team.manage`.
 *   3. Wer einen Standort setzt, taucht auf — mit GENAU den Werten, die gesetzt
 *      wurden (gegen die Eingabe geprüft, nie gegen die Antwort selbst).
 *   4. Die Detailseite liefert Rolle und Beitrittsdatum, aber KEINE E-Mail.
 *   5. Eine fremde userId ⇒ 404, ununterscheidbar von „gibt es nicht".
 *   6. Zwei Menschen am selben Ort stehen BEIDE in der Antwort (die Bündelung
 *      ist Sache des Browsers — hier zählen die Daten).
 *   7. GEGENPROBE: die Karte ist keine Hintertür zur Mitgliederliste. Ein
 *      `viewer` bekommt auf `/api/community/members` (mit E-Mail-Adressen)
 *      weiterhin 403.
 *   8. Wem der Zugang entzogen wird, verschwindet von der Karte — und seine
 *      Detailseite antwortet 404.
 *
 * Räumt am Ende alles weg, was es angelegt hat.
 *
 * WORKTREE-REGEL (CLAUDE.md): ein Beweis über Prozessgrenzen ist nur so ehrlich
 * wie sein ENTFERNTESTER Dienst. Platform UND Control Plane müssen aus DIESEM
 * Arbeitsstand laufen, und die Naht muss auf den eigenen Control-Server zeigen:
 *
 *   pnpm --filter control  exec nuxi dev --port 3034
 *   NUXT_ONBOARDING_CONTROL_URL=http://localhost:3034 \
 *     pnpm --filter platform exec nuxi dev --port 3036
 *
 *   POOL_KEY=… PLATFORM_PORT=3036 node --env-file=apps/control/.env \
 *     packages/onboarding/scripts/verify-members-map.mjs
 */
import '../../../scripts/lib/assert-target.mjs'
import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'
import { probeSiteBody } from '../../../scripts/lib/probe-stage.mjs'

const PORT = Number(process.env.PLATFORM_PORT || 3036)
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

let pass = 0
let fail = 0
const cleanup = { users: [], codes: [], tenants: [], members: [] }

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
        catch { /* HTML-Fehlerseite */ }
        resolve({ status: res.statusCode, json, text, setCookie: res.headers['set-cookie'] ?? [] })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function createPoolUser(tag) {
  const email = `map-${tag}-${Date.now()}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `Karte ${tag}` })
  cleanup.users.push(user.$id)
  return { userId: user.$id, email, password, name: `Karte ${tag}` }
}

async function login(account) {
  const res = await call(CONTROL_HOST, '/api/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  })
  if (res.status !== 200) throw new Error(`Login fehlgeschlagen (${res.status}): ${res.text.slice(0, 160)}`)
  const raw = res.setCookie.find(c => c.startsWith('a_session_'))
  if (!raw) throw new Error('Kein Session-Cookie erhalten')
  return raw.split(';')[0]
}

async function issueCode() {
  const code = `PUKA-MAPTEST-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const row = await control.createRow({
    databaseId, tableId: 'invite_codes', rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex'),
      label: 'Karten-Beweis', maxUses: 0, uses: 0, expiresAt: null, status: 'active',
    },
  })
  cleanup.codes.push(row.$id)
  return code
}

/** Der Host-Resolver cacht negativ (30 s) — nach der Anlage kurz nachfassen. */
async function waitForHost(host) {
  for (let i = 0; i < 40; i++) {
    const res = await call(host, '/api/themes')
    if (res.status === 200) return true
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

/**
 * DIE ORTE SIND FEST VERDRAHTET, nicht aus dem Verzeichnis geholt.
 *
 * Der Beweis prüft die KARTEN-Kette (prefs → Naht → Route), nicht die
 * Orts-Suche (die hat ihren eigenen Beweis, verify-geo-cities.mjs). Die Route
 * `/api/auth/profile` nimmt jedes Label/Koordinaten-Tripel entgegen, das dem
 * Schema genügt — sie schlägt bewusst NICHT im Verzeichnis nach. Feste Werte
 * machen die Prüfung damit unabhängig davon, ob lokal ein Verzeichnis
 * konfiguriert ist.
 */
const PLACE_A = { label: 'Pukalani, Hawaii', lat: 20.8395, lon: -156.3372 }
const PLACE_B = { label: 'Hamburg, Deutschland', lat: 53.5511, lon: 9.9937 }

/** Standort im KONTO setzen (`prefs`) — der echte Weg des Profil-Formulars. */
async function setLocation(host, account, cookie, location) {
  return await call(host, '/api/auth/profile', {
    method: 'PUT', cookie, body: { name: account.name, location },
  })
}

try {
  console.log(`\nMitglieder-Karte gegen http://localhost:${PORT} (Pool ${poolProject})\n`)

  const owner = await createPoolUser('owner')
  // Seit BE-015 verlangt das Anlegen einer Community eine BESTÄTIGTE Adresse —
  // nur der Gründer, die übrigen Konten bleiben, wie der Beweis sie braucht.
  await poolUsers.updateEmailVerification({ userId: owner.userId, emailVerification: true })
  const memberA = await createPoolUser('a')
  const memberB = await createPoolUser('b')
  const memberC = await createPoolUser('c')
  const stranger = await createPoolUser('stranger')
  const code = await issueCode()

  const ownerCookie = await login(owner)
  const strangerCookie = await login(stranger)

  console.log('1. Community anlegen (echter Wizard-Abschluss)')
  const created = await call(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST',
    cookie: ownerCookie,
    body: probeSiteBody({
      name: 'Karten-Probe',
      slug: `map-${Date.now().toString(36)}`,
      description: 'Wir prüfen die Mitglieder-Karte.',
      vibe: 'elegant',
      inviteCode: code,
    }),
  })
  check('angelegt', created.status === 200 && !!created.json?.communityId, `${created.status} ${created.text.slice(0, 200)}`)
  const communityId = created.json?.communityId
  const host = created.json?.host
  if (communityId) cleanup.tenants.push(communityId)
  if (!communityId || !host) throw new Error('Ohne Community geht es nicht weiter.')

  const founding = await control.listRows({
    databaseId, tableId: 'community_members', queries: [Query.equal('communityId', communityId), Query.limit(10)],
  })
  cleanup.members.push(...founding.rows.map(row => row.$id))

  check('Community-Host antwortet', await waitForHost(host), 'Host wurde nicht aufgelöst')

  // Drei Mitglieder, alle als `viewer` — die niedrigste Rolle. Genau sie soll
  // die Karte sehen dürfen, und genau sie darf die Mitgliederliste NICHT sehen.
  const staff = {}
  for (const [tag, account] of [['a', memberA], ['b', memberB], ['c', memberC]]) {
    const row = await control.createRow({
      databaseId, tableId: 'community_members', rowId: ID.unique(),
      data: {
        communityId,
        runtimeProjectId: poolProject,
        runtimeUserId: account.userId,
        role: 'viewer',
        status: 'active',
        email: account.email,
      },
    })
    cleanup.members.push(row.$id)
    staff[tag] = { ...account, memberId: row.$id, cookie: await login(account) }
  }

  console.log('\n2. Die Grenze: wer die Karte NICHT sehen darf')
  const guestMap = await call(host, '/api/community/members/map')
  check('Gast ohne Session → 401', guestMap.status === 401, `Status ${guestMap.status} ${guestMap.text.slice(0, 120)}`)
  const strangerMap = await call(host, '/api/community/members/map', { cookie: strangerCookie })
  check('Fremder (eingeloggt, kein Mitglied) → 403', strangerMap.status === 403, `Status ${strangerMap.status}`)
  const guestProfile = await call(host, `/api/community/members/${memberA.userId}/profile`)
  check('Detailseite für Gäste → 401', guestProfile.status === 401, `Status ${guestProfile.status}`)
  const strangerProfile = await call(host, `/api/community/members/${memberA.userId}/profile`, { cookie: strangerCookie })
  check('Detailseite für Fremde → 403', strangerProfile.status === 403, `Status ${strangerProfile.status}`)

  console.log('\n3. Mitglied OHNE eigenen Standort sieht die (leere) Karte')
  const emptyMap = await call(host, '/api/community/members/map', { cookie: staff.a.cookie })
  check('viewer → 200 (Gate ist members.invite, nicht team.manage)',
    emptyMap.status === 200, `Status ${emptyMap.status} ${emptyMap.text.slice(0, 200)}`)
  check('…und die Liste ist leer — niemand hat einen Ort angegeben',
    Array.isArray(emptyMap.json?.members) && emptyMap.json.members.length === 0,
    JSON.stringify(emptyMap.json ?? {}).slice(0, 200))
  check('…truncated ist false (vier Mitglieder liegen weit unter dem Deckel)',
    emptyMap.json?.truncated === false, JSON.stringify(emptyMap.json?.truncated))
  const ownerEmpty = await call(host, '/api/community/members/map', { cookie: ownerCookie })
  check('Owner → 200', ownerEmpty.status === 200, `Status ${ownerEmpty.status}`)

  console.log('\n4. Standort setzen ⇒ auf der Karte, mit den GESETZTEN Werten')
  const savedA = await setLocation(host, memberA, staff.a.cookie, PLACE_A)
  check('Standort gespeichert (PUT /api/auth/profile)', savedA.status === 200, `Status ${savedA.status} ${savedA.text.slice(0, 160)}`)

  const mapWithA = await call(host, '/api/community/members/map', { cookie: staff.a.cookie })
  check('Karte → 200', mapWithA.status === 200, `Status ${mapWithA.status}`)
  const entryA = (mapWithA.json?.members ?? []).find(m => m.userId === memberA.userId)
  check('…Mitglied A steht darauf', !!entryA, JSON.stringify(mapWithA.json?.members ?? []).slice(0, 200))
  // Gegen die EINGABE geprüft, nicht gegen die Antwort selbst (sonst wäre die
  // Prüfung eine Tautologie und immer grün).
  check('…mit genau dem gesetzten Label', entryA?.location?.label === PLACE_A.label, `${entryA?.location?.label}`)
  check('…mit genau den gesetzten Koordinaten',
    entryA?.location?.lat === PLACE_A.lat && entryA?.location?.lon === PLACE_A.lon,
    `${entryA?.location?.lat}/${entryA?.location?.lon}`)
  check('…und Rolle + Beitrittsdatum reisen mit',
    entryA?.role === 'viewer' && typeof entryA?.joinedAt === 'string' && !Number.isNaN(Date.parse(entryA.joinedAt)),
    `${entryA?.role} ${entryA?.joinedAt}`)
  check('…OHNE E-Mail-Adresse (die Karte ist kein Adressbuch)',
    !('email' in (entryA ?? {})) && !mapWithA.text.includes(memberA.email),
    Object.keys(entryA ?? {}).join(','))
  check('…und ohne Standort steht Mitglied B NICHT darauf',
    !(mapWithA.json?.members ?? []).some(m => m.userId === memberB.userId))

  console.log('\n5. Detailseite eines Mitglieds')
  const profileA = await call(host, `/api/community/members/${memberA.userId}/profile`, { cookie: staff.b.cookie })
  check('Mitglied B darf das Profil von A sehen → 200', profileA.status === 200, `Status ${profileA.status} ${profileA.text.slice(0, 160)}`)
  check('…mit Rolle', profileA.json?.role === 'viewer', `${profileA.json?.role}`)
  check('…mit Beitrittsdatum',
    typeof profileA.json?.joinedAt === 'string' && !Number.isNaN(Date.parse(profileA.json.joinedAt)),
    `${profileA.json?.joinedAt}`)
  check('…mit dem gesetzten Standort', profileA.json?.location?.label === PLACE_A.label, `${profileA.json?.location?.label}`)
  check('…und OHNE E-Mail/Telefon', !profileA.text.includes(memberA.email) && !('email' in (profileA.json ?? {})),
    Object.keys(profileA.json ?? {}).join(','))
  const profileB = await call(host, `/api/community/members/${memberB.userId}/profile`, { cookie: staff.a.cookie })
  check('Mitglied OHNE Standort hat trotzdem eine Detailseite (location null)',
    profileB.status === 200 && profileB.json?.location === null, `Status ${profileB.status} ${JSON.stringify(profileB.json?.location)}`)

  console.log('\n6. Fremde userId ⇒ 404, ununterscheidbar von „gibt es nicht"')
  const profileStranger = await call(host, `/api/community/members/${stranger.userId}/profile`, { cookie: staff.a.cookie })
  check('Konto existiert, ist aber kein Mitglied → 404', profileStranger.status === 404, `Status ${profileStranger.status}`)
  const profileNobody = await call(host, '/api/community/members/gibtesnicht000000/profile', { cookie: staff.a.cookie })
  check('erfundene Id → dasselbe 404', profileNobody.status === 404, `Status ${profileNobody.status}`)

  console.log('\n7. Zwei Menschen am SELBEN Ort — beide in der Antwort')
  const savedB = await setLocation(host, memberB, staff.b.cookie, PLACE_B)
  const savedC = await setLocation(host, memberC, staff.c.cookie, PLACE_B)
  check('beide Standorte gespeichert', savedB.status === 200 && savedC.status === 200, `${savedB.status}/${savedC.status}`)

  const mapAll = await call(host, '/api/community/members/map', { cookie: staff.a.cookie })
  const atB = (mapAll.json?.members ?? []).filter(m => m.location?.lat === PLACE_B.lat && m.location?.lon === PLACE_B.lon)
  check('beide stehen mit IDENTISCHEN Koordinaten darin (Bündelung ist Client-Sache)',
    atB.length === 2 && atB.some(m => m.userId === memberB.userId) && atB.some(m => m.userId === memberC.userId),
    JSON.stringify(atB.map(m => m.userId)))
  check('insgesamt drei Mitglieder mit Ort', (mapAll.json?.members ?? []).length === 3,
    JSON.stringify((mapAll.json?.members ?? []).map(m => m.userId)))

  console.log('\n8. Gegenprobe: die Karte ist keine Hintertür zur Mitgliederliste')
  const viewerList = await call(host, '/api/community/members', { cookie: staff.a.cookie })
  check('viewer bekommt /api/community/members weiterhin 403 (dort stehen E-Mails)',
    viewerList.status === 403, `Status ${viewerList.status}`)
  const ownerList = await call(host, '/api/community/members', { cookie: ownerCookie })
  check('…der Owner unverändert 200', ownerList.status === 200, `Status ${ownerList.status}`)

  console.log('\n9. Zugang entzogen ⇒ von der Karte verschwunden')
  const removed = await call(host, `/api/community/members/${staff.c.memberId}`, { method: 'DELETE', cookie: ownerCookie })
  check('Zugang entzogen', removed.status === 200, `Status ${removed.status} ${removed.text.slice(0, 160)}`)
  const mapAfter = await call(host, '/api/community/members/map', { cookie: staff.a.cookie })
  check('…steht nicht mehr auf der Karte',
    !(mapAfter.json?.members ?? []).some(m => m.userId === memberC.userId),
    JSON.stringify((mapAfter.json?.members ?? []).map(m => m.userId)))
  check('…und die anderen beiden schon', (mapAfter.json?.members ?? []).length === 2,
    JSON.stringify((mapAfter.json?.members ?? []).map(m => m.userId)))
  const profileRemoved = await call(host, `/api/community/members/${memberC.userId}/profile`, { cookie: staff.a.cookie })
  check('…seine Detailseite antwortet 404 wie für einen Unbekannten', profileRemoved.status === 404, `Status ${profileRemoved.status}`)
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n10. Aufräumen')
  for (const id of cleanup.members) await control.deleteRow({ databaseId, tableId: 'community_members', rowId: id }).catch(() => {})
  for (const id of cleanup.tenants) await control.deleteRow({ databaseId, tableId: 'communities', rowId: id }).catch(() => {})
  for (const id of cleanup.codes) await control.deleteRow({ databaseId, tableId: 'invite_codes', rowId: id }).catch(() => {})
  for (const id of cleanup.users) await poolUsers.delete({ userId: id }).catch(() => {})
  console.log('  ✔ aufgeräumt')
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
