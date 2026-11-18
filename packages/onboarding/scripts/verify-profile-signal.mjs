/**
 * Beweis für U19 — die Karte „Hilf uns, Pukalani zu schärfen" UND ihr Leser.
 *
 * Fährt den ECHTEN Weg gegen einen laufenden Platform- UND einen laufenden
 * Control-Server (die Service-Naht gehört mit zum Beweis — ein Beweis ist nur
 * so ehrlich wie sein entferntester Dienst):
 *
 *   1. Community per Wizard anlegen — OHNE die drei Antworten (so wie U12 den
 *      Wizard gekürzt hat). Das Profil trägt sie danach nicht.
 *   2. VOR dem Aha: die Karte bleibt weg (kein eigener Beitrag).
 *   3. NACH dem ersten eigenen Beitrag: die Karte erscheint. Das ist die
 *      Erscheinungs-Bedingung, und sie wird hier gemessen, nicht behauptet.
 *   4. Wer sie NICHT sieht: Gast (401), Fremder (403), VIEWER dieser Community
 *      (403 — es ist eine Owner-Sache), Kontroll-Host (404).
 *   5. TEILANTWORT abgeben → die Row nachlesen: die zwei gegebenen Antworten
 *      stehen im Profil, die dritte NICHT, und `category`/`description` haben
 *      überlebt (das JSON wird gemergt, nicht überschrieben).
 *   6. Danach ist die Karte weg — die Karte fragt EINMAL.
 *   7. Zweite Community: „Nicht mehr fragen" hält, und zwar NUR für sie (der
 *      Merker liegt in den Konto-prefs, die sich im Pool alle Communities
 *      teilen).
 *   8. DER LESER: die Betreiber-Route weist einen Nicht-Betreiber ab und zählt
 *      für den Betreiber richtig — gemessen als DELTA gegen den Stand VOR dem
 *      Lauf, damit Bestands-Communities der lokalen Instanz nichts verfälschen.
 *
 * Räumt am Ende alles weg, was es angelegt hat.
 *
 *   POOL_KEY=… PLATFORM_PORT=3016 CONTROL_URL=http://localhost:3014 \
 *     node --env-file=apps/control/.env \
 *     packages/onboarding/scripts/verify-profile-signal.mjs
 */
import '../../../scripts/lib/assert-target.mjs'
import { Client, ID, Users } from 'node-appwrite'
import {
  addStageMember,
  appwriteRest,
  createCleanup,
  createHttpCaller,
  createProbeAccount,
  createProbeCommunity,
  generatePassword,
  login as loginOn,
  runStamp,
  waitForHost as waitForHostOn,
} from '../../../scripts/lib/probe-stage.mjs'

const PORT = Number(process.env.PLATFORM_PORT || 3016)
const CONTROL_URL = process.env.CONTROL_URL || 'http://localhost:3014'
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
// Das Betreiber-Konto entsteht im Projekt des Control Plane — dafür braucht es
// `users.write`. Der Laufzeit-Schlüssel der Betreiber-App hat das, der
// Migrations-Schlüssel lokal nicht (in der CI hat EIN Schlüssel alle Rechte).
const controlUsersKey = process.env.NUXT_APPWRITE_KEY || controlKey
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'account'
const poolKey = process.env.POOL_KEY

if (!endpoint || !controlProject || !databaseId || !controlKey || !poolKey) {
  console.error('✗ Env unvollständig (POOL_KEY nötig).')
  process.exit(1)
}

const script = 'verify-profile-signal'
const control = appwriteRest({ endpoint, projectId: controlProject, key: controlKey, script })
const pool = appwriteRest({ endpoint, projectId: poolProject, key: poolKey, script })
const controlUsers = new Users(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlUsersKey))
const { call } = createHttpCaller({ port: PORT })
const cleanup = createCleanup({ pool, control, controlDatabaseId: databaseId })
const runId = runStamp()
/** Betreiber-Konten im Projekt des Control Plane — die räumt dieses Skript selbst. */
const operators = []

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

/** Das Control Plane läuft als EIGENER Dienst — hier per fetch, kein Host-Trick. */
async function callControl(path, { cookie } = {}) {
  const res = await fetch(`${CONTROL_URL}${path}`, {
    headers: { ...(cookie ? { cookie } : {}) },
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) }
  catch { /* HTML */ }
  return { status: res.status, json, text }
}

/** Probe-Konto im Pool. Seit BE-015 verlangt das Anlegen einer Community eine BESTÄTIGTE Adresse. */
async function createPoolUser(tag) {
  const account = await createProbeAccount(pool, { tag: `u19-${tag}`, stamp: runId, name: `U19 ${tag}` })
  cleanup.track('account', account.userId)
  return account
}

const login = account => loginOn(call, CONTROL_HOST, account)
const waitForHost = host => waitForHostOn(call, host)

/** Community anlegen — bewusst OHNE purpose/memberRange/goal (U12-Wizard). */
async function createCommunity(cookie, name, slug) {
  // Anlage über die echte Route `POST /api/onboarding/site` — Rumpf, Code und
  // Aufräumen kommen aus der gemeinsamen Hilfe (scripts/lib/probe-stage.mjs).
  const created = await createProbeCommunity({
    call, controlHost: CONTROL_HOST, cookie, control, databaseId, slug, name, cleanup,
    bodyOverrides: { vibe: 'calm', purpose: undefined, memberRange: undefined, goal: undefined, description: undefined },
  })
  return { communityId: created.communityId, host: created.host }
}

/**
 * Der Mandanten-Resolver cacht 30 s. Nach einem Profil-Schreibvorgang sieht die
 * Route den neuen Stand also nicht sofort — es wird auf den WECHSEL gewartet,
 * nicht geraten. Ohne dieses Warten wäre der nächste Haken grün, ohne etwas
 * gemessen zu haben.
 */
async function waitForVisible(host, cookie, want) {
  let last = null
  for (let i = 0; i < 45; i++) {
    const res = await call(host, '/api/community/profile-signal', { cookie })
    last = res
    if (res.status === 200 && res.json?.visible === want) return res
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return last
}

function optionCount(report, question, id) {
  const dist = report?.distributions?.find(entry => entry.question === question)
  return dist?.options?.find(option => option.id === id)?.count ?? 0
}

try {
  console.log(`\nU19-Beweis — Platform :${PORT}, Control ${CONTROL_URL} (Pool ${poolProject})\n`)

  console.log('0. Wegwerf-Betreiber + Ausgangsstand der Auswertung')
  const operator = await controlUsers.create({
    userId: ID.unique(),
    email: `u19-betreiber-${runId}@example.test`,
    password: generatePassword(),
    name: 'U19-Beweis',
  })
  operators.push(operator.$id)
  await controlUsers.updateLabels({ userId: operator.$id, labels: ['admin'] })
  const operatorSession = await controlUsers.createSession({ userId: operator.$id })
  const operatorCookie = `a_session_${controlProject}=${operatorSession.secret}`

  const anonReport = await callControl('/api/control/market-signal')
  check('Auswertung ohne Betreiber-Sitzung: kein Zugriff',
    anonReport.status === 401 || anonReport.status === 403, `Status ${anonReport.status}`)

  const beforeRes = await callControl('/api/control/market-signal', { cookie: operatorCookie })
  check('Betreiber sieht die Auswertung', beforeRes.status === 200, `${beforeRes.status} ${beforeRes.text.slice(0, 160)}`)
  const before = beforeRes.json
  if (!before) throw new Error('Ohne Ausgangsstand kein Delta-Beweis')

  const owner = await createPoolUser('owner')
  const stranger = await createPoolUser('stranger')
  const ownerCookie = await login(owner)
  const strangerCookie = await login(stranger)

  console.log('\n1. Community A anlegen — der Wizard fragt die drei Dinge nicht mehr')
  const a = await createCommunity(ownerCookie, 'U19 Signal A', `u19a-${runId}`)
  check('Community-Host antwortet', await waitForHost(a.host), 'Host wurde nicht aufgelöst')
  const rowFresh = await control.getRow(databaseId, 'communities', a.communityId)
  const profileFresh = JSON.parse(rowFresh.profile || '{}')
  check('Profil trägt KEINE der drei Antworten',
    !profileFresh.purpose && !profileFresh.memberRange && !profileFresh.goal, rowFresh.profile)
  check('… aber die Wizard-Kategorie steht drin', profileFresh.category === 'club', rowFresh.profile)

  console.log('\n2. VOR dem Aha-Moment: die Karte bleibt weg')
  const beforeAha = await call(a.host, '/api/community/profile-signal', { cookie: ownerCookie })
  check('Owner bekommt 200', beforeAha.status === 200, `${beforeAha.status} ${beforeAha.text.slice(0, 160)}`)
  check('… und die Karte erscheint NICHT (kein eigener Beitrag)',
    beforeAha.json?.visible === false, JSON.stringify(beforeAha.json))

  console.log('\n3. Der erste eigene Beitrag — und die Karte erscheint')
  const post = await call(a.host, '/api/posts', {
    method: 'POST',
    cookie: ownerCookie,
    body: { type: 'post', title: 'Unser erster eigener Beitrag', body: 'Damit ist der Aha-Moment erreicht.' },
  })
  check('Beitrag geschrieben', post.status === 200 || post.status === 201, `${post.status} ${post.text.slice(0, 200)}`)
  const afterAha = await waitForVisible(a.host, ownerCookie, true)
  check('Karte erscheint (die Erscheinungs-Bedingung greift)',
    afterAha?.json?.visible === true, JSON.stringify(afterAha?.json))

  console.log('\n4. Wer die Karte NICHT sieht')
  const guest = await call(a.host, '/api/community/profile-signal')
  check('Gast ohne Session → 401', guest.status === 401, `Status ${guest.status}`)
  const strangerRes = await call(a.host, '/api/community/profile-signal', { cookie: strangerCookie })
  check('Fremder (eingeloggt, kein Mitglied) → 403', strangerRes.status === 403, `Status ${strangerRes.status}`)

  const viewer = await createPoolUser('viewer')
  const viewerRow = await addStageMember(control, databaseId, {
    communityId: a.communityId, projectId: poolProject, userId: viewer.userId, role: 'viewer', status: 'active', email: viewer.email,
  })
  cleanup.track('member', viewerRow.$id)
  const viewerCookie = await login(viewer)
  const viewerRes = await call(a.host, '/api/community/profile-signal', { cookie: viewerCookie })
  check('VIEWER dieser Community → 403 (die Frage ist Owner-Sache)', viewerRes.status === 403, `Status ${viewerRes.status}`)
  const viewerWrite = await call(a.host, '/api/community/profile-signal', {
    method: 'POST', cookie: viewerCookie, body: { purpose: 'new' },
  })
  check('… und er kann auch nicht antworten → 403', viewerWrite.status === 403, `Status ${viewerWrite.status}`)

  const onControl = await call(CONTROL_HOST, '/api/community/profile-signal', { cookie: ownerCookie })
  check('Kontroll-Host → 404 (dort gibt es keine Community)', onControl.status === 404, `Status ${onControl.status}`)

  console.log('\n5. Teilantwort abgeben — zwei von drei')
  const answered = await call(a.host, '/api/community/profile-signal', {
    method: 'POST', cookie: ownerCookie, body: { purpose: 'new', goal: 'discussion' },
  })
  check('Antwort angenommen', answered.status === 200, `${answered.status} ${answered.text.slice(0, 200)}`)
  const empty = await call(a.host, '/api/community/profile-signal', {
    method: 'POST', cookie: ownerCookie, body: {},
  })
  check('… eine LEERE Antwort wird abgewiesen (400)', empty.status === 400, `Status ${empty.status}`)

  const rowAfter = await control.getRow(databaseId, 'communities', a.communityId)
  const profileAfter = JSON.parse(rowAfter.profile || '{}')
  check('Row nachgelesen: purpose steht im Profil', profileAfter.purpose === 'new', rowAfter.profile)
  check('Row nachgelesen: goal steht im Profil', profileAfter.goal === 'discussion', rowAfter.profile)
  check('Row nachgelesen: memberRange steht NICHT drin (Teilantwort)', !profileAfter.memberRange, rowAfter.profile)
  check('Row nachgelesen: die Kategorie hat überlebt (JSON gemergt, nicht überschrieben)',
    profileAfter.category === 'club', rowAfter.profile)

  console.log('\n6. Danach ist die Karte weg — sie fragt EINMAL')
  const afterAnswer = await waitForVisible(a.host, ownerCookie, false)
  check('Karte verschwindet nach dem Antworten', afterAnswer?.json?.visible === false, JSON.stringify(afterAnswer?.json))

  console.log('\n7. Community B: „Nicht mehr fragen" hält')
  // EIGENER Owner: die Testphase lässt genau EINE Community je Konto zu
  // (`One community per account during trial`) — mit demselben Konto wäre hier
  // kein zweiter Mandant zu bekommen. Dass der Merker je COMMUNITY gilt und
  // nicht je Konto, ist ohnehin in `tests/profileSignal.test.ts` genagelt; hier
  // wird gemessen, dass er überhaupt hält.
  const ownerB = await createPoolUser('owner-b')
  const ownerBCookie = await login(ownerB)
  const b = await createCommunity(ownerBCookie, 'U19 Signal B', `u19b-${runId}`)
  check('Community-Host B antwortet', await waitForHost(b.host), 'Host wurde nicht aufgelöst')
  await call(b.host, '/api/posts', {
    method: 'POST',
    cookie: ownerBCookie,
    body: { type: 'post', title: 'Auch hier ein erster Beitrag', body: 'Damit die Karte erscheinen darf.' },
  })
  const bVisible = await waitForVisible(b.host, ownerBCookie, true)
  check('Karte erscheint auch in B', bVisible?.json?.visible === true, JSON.stringify(bVisible?.json))

  const never = await call(b.host, '/api/community/profile-signal/postpone', {
    method: 'POST', cookie: ownerBCookie, body: { mode: 'never' },
  })
  check('„Nicht mehr fragen" angenommen', never.status === 200, `${never.status} ${never.text.slice(0, 160)}`)
  const bGone = await call(b.host, '/api/community/profile-signal', { cookie: ownerBCookie })
  check('Karte ist weg', bGone.json?.visible === false, JSON.stringify(bGone.json))
  const bStillGone = await call(b.host, '/api/community/profile-signal', { cookie: ownerBCookie })
  check('… und sie HÄLT beim nächsten Aufruf', bStillGone.json?.visible === false, JSON.stringify(bStillGone.json))

  const prefs = (await pool.get(`/users/${ownerB.userId}`)).prefs ?? {}
  const merker = String(prefs.profileSignalPostponed ?? '')
  // Die FORM des Merkers, nicht nur seine Anwesenheit: er trägt die
  // communityId UND die Frist. Ein blankes `true` würde die Frage in der
  // nächsten Community desselben Kontos mitverschlucken (dass das nicht
  // passiert, nagelt `tests/profileSignal.test.ts`).
  check('der Merker trägt communityId und Frist', merker.includes(`${b.communityId}:never`), merker)

  console.log('\n8. Der Leser: die Auswertung zählt richtig (gemessen als Delta)')
  const afterRes = await callControl('/api/control/market-signal', { cookie: operatorCookie })
  check('Betreiber bekommt die Auswertung', afterRes.status === 200, `${afterRes.status} ${afterRes.text.slice(0, 160)}`)
  const after = afterRes.json
  check('zwei Communities mehr im Nenner',
    after?.communities === before.communities + 2, `${before.communities} → ${after?.communities}`)
  check('genau EINE davon hat geantwortet',
    after?.answeredAny === before.answeredAny + 1, `${before.answeredAny} → ${after?.answeredAny}`)
  check('purpose „new" um 1 gestiegen',
    optionCount(after, 'purpose', 'new') === optionCount(before, 'purpose', 'new') + 1,
    `${optionCount(before, 'purpose', 'new')} → ${optionCount(after, 'purpose', 'new')}`)
  check('goal „discussion" um 1 gestiegen',
    optionCount(after, 'goal', 'discussion') === optionCount(before, 'goal', 'discussion') + 1,
    `${optionCount(before, 'goal', 'discussion')} → ${optionCount(after, 'goal', 'discussion')}`)
  check('memberRange UNVERÄNDERT (die dritte Frage blieb offen)',
    optionCount(after, 'memberRange', 'to100') === optionCount(before, 'memberRange', 'to100')
    && optionCount(after, 'memberRange', 'none') === optionCount(before, 'memberRange', 'none'),
    'eine nicht gegebene Antwort darf nirgends auftauchen')

  const purposeDist = after?.distributions?.find(entry => entry.question === 'purpose')
  check('alle Katalog-Optionen erscheinen, auch die von niemandem gewählten',
    purposeDist?.options?.length === 3, JSON.stringify(purposeDist?.options?.map(o => o.id)))
  check('offene Antworten werden als solche ausgewiesen',
    typeof purposeDist?.unanswered === 'number' && purposeDist.unanswered >= 1,
    JSON.stringify({ answered: purposeDist?.answered, unanswered: purposeDist?.unanswered }))
}
catch (error) {
  fail++
  console.error(`\n✗ Abbruch: ${error instanceof Error ? error.message : String(error)}`)
}
finally {
  console.log('\n9. Aufräumen')
  const { deleted, leftovers } = await cleanup.run()
  let operatorsLeft = 0
  for (const id of operators) {
    await controlUsers.delete({ userId: id }).catch(() => {})
    // Nachzählen: das Betreiber-Konto muss weg sein (404), nicht nur „gelöscht" heißen.
    if (await controlUsers.get({ userId: id }).then(() => true, error => error?.code !== 404)) operatorsLeft++
  }
  const total = Object.values(deleted).reduce((sum, n) => sum + n, 0)
  console.log(`  gelöscht: ${total} Einträge (Konten, Communities, Mitglieds-Zeilen, Code, Zeilen der Communities) + ${operators.length} Betreiber-Konto`)
  check('aufgeräumt — nachgezählt, nichts übrig', leftovers.length === 0 && operatorsLeft === 0,
    [...leftovers, ...(operatorsLeft ? [`Betreiber-Konten: ${operatorsLeft}`] : [])].join(', '))
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
