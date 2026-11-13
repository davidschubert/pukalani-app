#!/usr/bin/env node
/**
 * courses im Pool — LIVE-Isolationsbeweis über die ECHTE API (Muster
 * events/verify-pool-isolation + events/verify-site-authz, zusammengelegt).
 *
 * Fährt den echten Kundenpfad gegen den laufenden Platform-Dev-Server
 * (Default Port 3150) mit Host-Headern der beiden LOKALEN Tenants
 * kunde-a.localhost / kunde-b.localhost:
 *
 *   1. Produkt-Gate: courses ist ab Plan pro — auf Plan basic antwortet die
 *      Galerie 404 (Katalog pukalani.tenancy.products), auf pro einem GAST 200
 *      (seit SEC-029 ist die Übersicht öffentlich).
 *   2. Ein community_members-OWNER auf kunde-a OHNE jedes Operator-Label legt Kurs
 *      + Lektion an (Datentür stempelt tenantId — per Admin-SDK nachgeprüft).
 *   3. Ein MITGLIED von B sieht bei B von A NICHTS (Galerie ohne den Kurs,
 *      Detail/Enroll/Lektion 404), A sieht alles (200/201).
 *   4. Verwaltung: derselbe Owner ist auf kunde-b draußen (403) — die Rolle
 *      reist nicht mit; ein Fremder ohne Rolle ebenfalls 403, ein Gast 401.
 *   5. Operator-Break-Glass (globales admin-Label): kommt auf kunde-b durch
 *      (200, protokolliert) und sieht den A-Kurs TROTZDEM nicht — beim
 *      Admin-Client ist die Tür die EINZIGE Grenze. Schreibzugriffe auf die
 *      A-Zeilen von B aus enden mit 404.
 *   6. Slug pro Mandant (courses-002): derselbe Slug auf B → 201 statt 409.
 *   7. Publikum/Mitgliedschaft (SEC-029): A steht auf „nur für Mitglieder" und
 *      geschlossener Registrierung. Gast: Übersicht/Vorschau 200 ohne interne
 *      Felder und ohne Lektions-Inhalt, Lektion/Einschreiben 401. Fremdes Konto
 *      des Pools: Vorschau 200 mit enrolled=false, alles Weitere 403
 *      `not_a_member`, keine Einschreibungs-Zeile. Direkt an der Appwrite-REST-API
 *      (Session- und Gast-Client): 0 Zeilen von A in courses/lessons. Mitglied:
 *      Einschreiben 201, Lektion 200 mit Inhalt, Abschluss 200. Entwurf: 404.
 *      Mit offener Registrierung wird ein Fremder durch das Einschreiben
 *      Mitglied — übersprungen, wenn die Service-Naht zum Control Plane nicht
 *      antwortet.
 *
 * node:http über ::1, weil fetch den Host-Header verwirft und Nitro auf [::1]
 * hört. Setzt die Tenant-Pläne temporär auf 'pro' und für A Publikum +
 * Registrierung (Resolver-Cache 30 s → Warte-Schleife bzw. Wartezeit) und
 * stellt alles am Ende wieder her; räumt Kurse, Lektionen, Buchungen,
 * Fortschritt, Mitgliedschaften und Test-User auch im Fehlerfall weg.
 *
 * Aus packages/courses (dort löst node-appwrite auf):
 *   node --env-file=../../apps/platform/.env scripts/verify-pool-isolation.mjs
 */
import { request } from 'node:http'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const PORT = Number(process.env.PLATFORM_PORT || 3150)
const HOST_A = process.env.TENANT_A_HOST || 'kunde-a.localhost'
const HOST_B = process.env.TENANT_B_HOST || 'kunde-b.localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const poolProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const poolKey = process.env.NUXT_APPWRITE_KEY
const controlEndpoint = process.env.NUXT_PLATFORM_CONTROL_ENDPOINT
const controlProject = process.env.NUXT_PLATFORM_CONTROL_PROJECT_ID
const controlDb = process.env.NUXT_PLATFORM_CONTROL_DATABASE_ID
const controlKey = process.env.NUXT_PLATFORM_CONTROL_KEY

if (!endpoint || !poolProject || !databaseId || !poolKey || !controlEndpoint || !controlProject || !controlDb || !controlKey) {
  console.error('✗ Env unvollständig — mit --env-file=../../apps/platform/.env aufrufen.')
  process.exit(1)
}

const pool = new TablesDB(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
const poolUsers = new Users(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
const control = new TablesDB(new Client().setEndpoint(controlEndpoint).setProject(controlProject).setKey(controlKey))

let pass = 0
let fail = 0
const cleanup = { users: [], courses: [], lessons: [], members: [], planRestore: [], communityRestore: [] }

function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
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

async function createUser(tag, labels = []) {
  const email = `courses-iso-${tag}-${Date.now()}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `Courses-Iso ${tag}` })
  cleanup.users.push(user.$id)
  if (labels.length) await poolUsers.updateLabels({ userId: user.$id, labels })
  return { userId: user.$id, email, password }
}

async function login(host, account) {
  const res = await call(host, '/api/auth/login', { method: 'POST', body: { email: account.email, password: account.password } })
  const cookie = res.setCookie.find(c => c.startsWith('a_session_'))?.split(';')[0]
  if (!cookie) throw new Error(`Login auf ${host} fehlgeschlagen (${res.status}): ${res.text.slice(0, 160)}`)
  return cookie
}

async function tenantRowByHost(host) {
  const res = await control.listRows({
    databaseId: controlDb, tableId: 'communities',
    queries: [Query.equal('host', host), Query.limit(1)],
  })
  return res.rows[0] ?? null
}

/** Mitgliedschaft im Control Plane anlegen (wie ein Owner es per Einladung täte). */
async function addMember(tenant, userId, role) {
  const row = await control.createRow({
    databaseId: controlDb, tableId: 'community_members', rowId: ID.unique(),
    data: { communityId: tenant.$id, runtimeProjectId: tenant.projectId, runtimeUserId: userId, role, status: 'active' },
  })
  cleanup.members.push(row.$id)
  return row
}

/** Der Resolver cacht den Mandanten 30 s — Publikum/Registrierung haben kein Echo in der API. */
const waitForResolverCache = () => new Promise(resolve => setTimeout(resolve, 32_000))

/** Was eine öffentliche Antwort NIE tragen darf. */
const INTERNAL_KEYS = ['authorId', 'communityId', 'entitlementProduct', '$permissions']

async function waitFor(label, fn, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (await fn()) return true
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  console.error(`  ✗ Timeout: ${label}`)
  return false
}

const slug = `iso-kurs-${Date.now()}`

try {
  console.log(`\ncourses-Pool-Isolation gegen http://[::1]:${PORT} (Pool ${poolProject})\n`)

  const tenantA = await tenantRowByHost(HOST_A)
  const tenantB = await tenantRowByHost(HOST_B)
  if (!tenantA || !tenantB) {
    console.error(`✗ Lokale Tenants ${HOST_A}/${HOST_B} nicht gefunden — zuerst seeden.`)
    process.exit(1)
  }

  console.log('1. Produkt-Gate (courses = ab Plan pro)')
  /**
   * DER BEWEIS STELLT SEINE VORBEDINGUNG HER, statt sie zu erwarten
   * (2026-08-02, zweimal live erwischt — dieselbe Lehre wie F19).
   *
   * Vorher stand hier „beide Tenants stehen lokal auf plan null" als ANNAHME,
   * und der Aufräum-Schritt stellte am Ende wieder her, was er beim Start
   * vorgefunden hatte. Ein ABGEBROCHENER Lauf (ein Beweis dauert lange und
   * steht zwischendurch still) hinterlässt die Tenants damit auf 'pro' — und
   * der nächste Lauf merkt sich 'pro' als „Original", stellt 'pro' wieder her
   * und kann die Eingangsprüfung NIE wieder bestehen. Die Verunreinigung
   * erhält sich selbst und sah wie eine Regression aus.
   *
   * Deshalb: Plan hier aktiv auf basic setzen und den WIEDERHERSTELL-Wert auf
   * basic festnageln, statt den Vorfund zu übernehmen. Diese beiden Hosts sind
   * reine Test-Fixtures; ihr Plan gehört dem Beweis.
   */
  cleanup.planRestore.push({ id: tenantA.$id, plan: null }, { id: tenantB.$id, plan: null })
  await control.updateRow({ databaseId: controlDb, tableId: 'communities', rowId: tenantA.$id, data: { plan: null } })
  await control.updateRow({ databaseId: controlDb, tableId: 'communities', rowId: tenantB.$id, data: { plan: null } })

  const gatedClosed = await waitFor('Produkt-Gate zu (Plan basic → 404)', async () => {
    const res = await call(HOST_A, '/api/courses')
    return res.status === 404
  })
  check('Plan basic → /api/courses antwortet 404 (Produkt existiert nicht)', gatedClosed)

  await control.updateRow({ databaseId: controlDb, tableId: 'communities', rowId: tenantA.$id, data: { plan: 'pro' } })
  await control.updateRow({ databaseId: controlDb, tableId: 'communities', rowId: tenantB.$id, data: { plan: 'pro' } })
  const planLive = await waitFor('Plan-Upgrade sichtbar (Resolver-Cache 30 s)', async () => {
    const [a, b] = await Promise.all([call(HOST_A, '/api/courses'), call(HOST_B, '/api/courses')])
    return a.status === 200 && b.status === 200
  })
  check('Plan pro → /api/courses antwortet einem Gast 200 (öffentliche Übersicht, SEC-029)', planLive)

  console.log('\n2. Site-Owner OHNE Operator-Label legt auf A an')
  const owner = await createUser('owner')
  const member = await control.createRow({
    databaseId: controlDb, tableId: 'community_members', rowId: ID.unique(),
    data: {
      communityId: tenantA.$id,
      runtimeProjectId: tenantA.projectId,
      runtimeUserId: owner.userId,
      role: 'owner',
      status: 'active',
    },
  })
  cleanup.members.push(member.$id)
  const ownerAfter = await poolUsers.get({ userId: owner.userId })
  check('Owner trägt KEIN Operator-Label', !(ownerAfter.labels ?? []).some(l => l === 'admin' || l === 'moderator'), JSON.stringify(ownerAfter.labels))

  const ownerCookie = await login(HOST_A, owner)

  const created = await call(HOST_A, '/api/courses', {
    method: 'POST', cookie: ownerCookie,
    body: { title: 'Iso-Kurs A', slug, description: 'Gehört Kunde A.', access: 'free', status: 'published' },
  })
  const courseId = created.json?.$id
  check('POST /api/courses auf A → 201 (Site-Rolle genügt, kein globales Label)', created.status === 201 && !!courseId, `Status ${created.status} ${created.text.slice(0, 160)}`)
  if (courseId) cleanup.courses.push(courseId)

  // TenantContext.tenantId = tenants.tenantId (Scope-Wert der Datenzeilen);
  // tenants.$id ist die communityId (Label-Schlüssel) — zwei Schlüssel, ein Tenant.
  const rawCourse = courseId ? await pool.getRow({ databaseId, tableId: 'courses', rowId: courseId }).catch(() => null) : null
  check('Tür hat communityId von A gestempelt (nie vom Aufrufer)', rawCourse?.communityId === tenantA.tenantId, `communityId=${rawCourse?.communityId}, erwartet ${tenantA.tenantId}`)

  const lessonRes = await call(HOST_A, `/api/courses/${courseId}/lessons`, {
    method: 'POST', cookie: ownerCookie,
    body: { title: 'Lektion 1', content: 'Nur für Kunde A.', status: 'published' },
  })
  const lessonId = lessonRes.json?.$id
  check('POST Lektion auf A → 201', lessonRes.status === 201 && !!lessonId, `Status ${lessonRes.status} ${lessonRes.text.slice(0, 160)}`)
  if (lessonId) cleanup.lessons.push(lessonId)
  const rawLesson = lessonId ? await pool.getRow({ databaseId, tableId: 'lessons', rowId: lessonId }).catch(() => null) : null
  check('Tür hat communityId auch auf die Lektion gestempelt', rawLesson?.communityId === tenantA.tenantId, `communityId=${rawLesson?.communityId}`)

  console.log('\n3. Mitglieder-Sicht: der Nachbar sieht nichts')
  // Ein MITGLIED von B: sonst wiese die Mitglieder-Wache ihn schon vor der
  // Datentür ab, und die 404 unten bewiesen nichts über die Mandanten-Grenze.
  const stranger = await createUser('stranger')
  await addMember(tenantB, stranger.userId, 'viewer')
  const strangerCookie = await login(HOST_B, stranger)

  const galleryA = await call(HOST_A, '/api/courses', { cookie: ownerCookie })
  const galleryB = await call(HOST_B, '/api/courses', { cookie: strangerCookie })
  check('A sieht seinen Kurs in der Galerie', galleryA.status === 200 && (galleryA.json?.rows ?? []).some(r => r.$id === courseId), `Status ${galleryA.status}`)
  check('B sieht den A-Kurs NICHT (Liste gescopt)', galleryB.status === 200 && !(galleryB.json?.rows ?? []).some(r => r.$id === courseId), `Status ${galleryB.status}`)
  const galleryBGuest = await call(HOST_B, '/api/courses')
  check('… auch ein Gast bei B nicht', galleryBGuest.status === 200 && !(galleryBGuest.json?.rows ?? []).some(r => r.$id === courseId), `Status ${galleryBGuest.status}`)

  const detailA = await call(HOST_A, `/api/courses/${slug}`, { cookie: ownerCookie })
  const detailB = await call(HOST_B, `/api/courses/${slug}`, { cookie: strangerCookie })
  check('A liest sein Kurs-Detail per Slug (200)', detailA.status === 200, `Status ${detailA.status}`)
  check('B bekommt denselben Slug nicht (404)', detailB.status === 404, `Status ${detailB.status}`)

  const enrollB = await call(HOST_B, `/api/courses/${slug}/enroll`, { method: 'POST', cookie: strangerCookie })
  check('B kann sich nicht in den A-Kurs einschreiben (404)', enrollB.status === 404, `Status ${enrollB.status}`)
  const enrollA = await call(HOST_A, `/api/courses/${slug}/enroll`, { method: 'POST', cookie: ownerCookie })
  check('A schreibt sich ein (201)', enrollA.status === 201, `Status ${enrollA.status} ${enrollA.text.slice(0, 160)}`)

  const lessonFromB = await call(HOST_B, `/api/lessons/${lessonId}`, { cookie: strangerCookie })
  check('B bekommt den Lektions-CONTENT per ID nicht (404)', lessonFromB.status === 404, `Status ${lessonFromB.status}`)
  const lessonFromA = await call(HOST_A, `/api/lessons/${lessonId}`, { cookie: ownerCookie })
  check('A liest den Lektions-Content (200, nach Enrollment)', lessonFromA.status === 200, `Status ${lessonFromA.status} ${lessonFromA.text.slice(0, 160)}`)
  const completeFromB = await call(HOST_B, `/api/lessons/${lessonId}/complete`, { method: 'POST', cookie: strangerCookie })
  check('B kann den A-Fortschritt nicht schreiben (404)', completeFromB.status === 404, `Status ${completeFromB.status}`)

  console.log('\n4. Verwaltung: die Site-Rolle reist nicht mit')
  const manageA = await call(HOST_A, '/api/courses/manage', { cookie: ownerCookie })
  check('Owner: GET /api/courses/manage auf A → 200 und enthält den Kurs', manageA.status === 200 && (manageA.json?.rows ?? []).some(r => r.$id === courseId), `Status ${manageA.status}`)
  const manageBOwner = await call(HOST_B, '/api/courses/manage', { cookie: ownerCookie })
  check('Derselbe Owner auf kunde-b → 403', manageBOwner.status === 403, `Status ${manageBOwner.status}`)
  const manageBStranger = await call(HOST_B, '/api/courses/manage', { cookie: strangerCookie })
  check('Eingeloggt ohne Rolle → 403', manageBStranger.status === 403, `Status ${manageBStranger.status}`)
  const manageGuest = await call(HOST_A, '/api/courses/manage')
  check('Gast ohne Session → 401', manageGuest.status === 401, `Status ${manageGuest.status}`)

  console.log('\n5. Operator-Break-Glass (globales admin-Label) — die Tür bleibt')
  const operator = await createUser('operator', ['admin'])
  const opCookie = await login(HOST_B, operator)
  const opManageB = await call(HOST_B, '/api/courses/manage', { cookie: opCookie })
  check('Operator kommt auf kunde-b durch (200, protokolliert)', opManageB.status === 200, `Status ${opManageB.status}`)
  check('… sieht den A-Kurs dort TROTZDEM nicht (Tür = einzige Grenze)', !(opManageB.json?.rows ?? []).some(r => r.$id === courseId))
  const opDetailB = await call(HOST_B, `/api/courses/${courseId}/manage`, { cookie: opCookie })
  check('Builder-Detail des A-Kurses von B aus → 404', opDetailB.status === 404, `Status ${opDetailB.status}`)
  const opPatchB = await call(HOST_B, `/api/courses/${courseId}`, { method: 'PATCH', cookie: opCookie, body: { title: 'Übernahme' } })
  check('PATCH des A-Kurses von B aus → 404', opPatchB.status === 404, `Status ${opPatchB.status}`)
  const opLessonB = await call(HOST_B, `/api/courses/${courseId}/lessons`, { method: 'POST', cookie: opCookie, body: { title: 'Fremd', content: 'x' } })
  check('Lektion in den A-Kurs von B aus → 404', opLessonB.status === 404, `Status ${opLessonB.status}`)
  if (opLessonB.json?.$id) cleanup.lessons.push(opLessonB.json.$id)
  const opLessonDelB = await call(HOST_B, `/api/lessons/${lessonId}`, { method: 'DELETE', cookie: opCookie })
  check('A-Lektion von B aus löschen → 404', opLessonDelB.status === 404, `Status ${opLessonDelB.status}`)
  const stillThere = lessonId ? await pool.getRow({ databaseId, tableId: 'lessons', rowId: lessonId }).catch(() => null) : null
  check('… die A-Lektion existiert unverändert weiter', !!stillThere && stillThere.title === 'Lektion 1', `title=${stillThere?.title}`)
  console.log('  ℹ Break-Glass-Protokoll: im Dev-Server-Log muss "community.operator_access" mit capability=courses.manage stehen')

  console.log('\n6. Slug gehört dem Mandanten (courses-002: uq_tenant_slug)')
  const sameSlugOnB = await call(HOST_B, '/api/courses', {
    method: 'POST', cookie: opCookie,
    body: { title: 'Gleicher Slug bei B', slug, description: 'Gehört Kunde B.', access: 'free', status: 'draft' },
  })
  check('Derselbe Slug bei B → 201 statt 409 (Unique ist tenant-relativ)', sameSlugOnB.status === 201, `Status ${sameSlugOnB.status} ${sameSlugOnB.text.slice(0, 160)}`)
  if (sameSlugOnB.json?.$id) cleanup.courses.push(sameSlugOnB.json.$id)

  console.log('\n7. Publikum/Mitgliedschaft (SEC-029)')
  /**
   * A steht für diesen Abschnitt auf „nur für Mitglieder" und geschlossener
   * Registrierung — die Vorbedingung wird HERGESTELLT, nicht erwartet (siehe
   * Abschnitt 1), und am Ende auf den Vorfund zurückgesetzt.
   */
  cleanup.communityRestore.push({ id: tenantA.$id, data: { audience: tenantA.audience ?? 'members', openRegistration: tenantA.openRegistration ?? false } })
  await control.updateRow({ databaseId: controlDb, tableId: 'communities', rowId: tenantA.$id, data: { audience: 'members', openRegistration: false } })
  console.log('  … warte 32 s auf den Resolver-Cache')
  await waitForResolverCache()

  // (a) Gast
  const guestList = await call(HOST_A, '/api/courses')
  const guestRow = (guestList.json?.rows ?? []).find(r => r.$id === courseId)
  check('Gast: Übersicht 200 mit dem Kurs', guestList.status === 200 && !!guestRow, `Status ${guestList.status}`)
  check('Gast: Übersicht ohne interne Felder', !!guestRow && INTERNAL_KEYS.every(k => !(k in guestRow)), JSON.stringify(guestRow ?? {}).slice(0, 200))
  const guestPreview = await call(HOST_A, `/api/courses/${slug}`)
  check('Gast: Vorschau 200', guestPreview.status === 200, `Status ${guestPreview.status}`)
  check('Gast: Vorschau ohne interne Felder', INTERNAL_KEYS.every(k => !(k in (guestPreview.json ?? {}))))
  check('Gast: Gliederung ohne Lektions-Inhalt und Video',
    (guestPreview.json?.lessons ?? []).length > 0
    && (guestPreview.json?.lessons ?? []).every(l => !('content' in l) && !('videoUrl' in l))
    && !guestPreview.text.includes('Nur für Kunde A.'))
  const guestLesson = await call(HOST_A, `/api/lessons/${lessonId}`)
  check('Gast: Lektion 401', guestLesson.status === 401, `Status ${guestLesson.status}`)
  const guestEnroll = await call(HOST_A, `/api/courses/${slug}/enroll`, { method: 'POST' })
  check('Gast: Einschreiben 401', guestEnroll.status === 401, `Status ${guestEnroll.status}`)

  // (b) fremdes Konto des Pools, ohne Mitgliedschaft in A
  const outsider = await createUser('outsider')
  const outsiderCookie = await login(HOST_A, outsider)
  const outsiderList = await call(HOST_A, '/api/courses', { cookie: outsiderCookie })
  const outsiderRow = (outsiderList.json?.rows ?? []).find(r => r.$id === courseId)
  check('Fremder: Übersicht 200, enrolled=false', outsiderList.status === 200 && outsiderRow?.enrolled === false, `Status ${outsiderList.status}`)
  const outsiderPreview = await call(HOST_A, `/api/courses/${slug}`, { cookie: outsiderCookie })
  check('Fremder: Vorschau 200, enrolled=false', outsiderPreview.status === 200 && outsiderPreview.json?.enrolled === false, `Status ${outsiderPreview.status}`)
  const notMember = res => res.status === 403 && res.json?.reason === 'not_a_member'
  const outsiderEnroll = await call(HOST_A, `/api/courses/${slug}/enroll`, { method: 'POST', cookie: outsiderCookie })
  check('Fremder: Einschreiben 403 not_a_member', notMember(outsiderEnroll), `Status ${outsiderEnroll.status} ${outsiderEnroll.text.slice(0, 160)}`)
  const outsiderLesson = await call(HOST_A, `/api/lessons/${lessonId}`, { cookie: outsiderCookie })
  check('Fremder: Lektion 403 not_a_member', notMember(outsiderLesson), `Status ${outsiderLesson.status}`)
  const outsiderComplete = await call(HOST_A, `/api/lessons/${lessonId}/complete`, { method: 'POST', cookie: outsiderCookie })
  check('Fremder: Abschluss 403', notMember(outsiderComplete), `Status ${outsiderComplete.status}`)
  const outsiderLessonTranslate = await call(HOST_A, `/api/lessons/${lessonId}/translate`, { method: 'POST', cookie: outsiderCookie, body: { locale: 'de' } })
  check('Fremder: Lektion übersetzen 403', notMember(outsiderLessonTranslate), `Status ${outsiderLessonTranslate.status}`)
  const outsiderCourseTranslate = await call(HOST_A, `/api/courses/${slug}/translate`, { method: 'POST', cookie: outsiderCookie, body: { locale: 'de' } })
  check('Fremder: Kurs übersetzen 403', notMember(outsiderCourseTranslate), `Status ${outsiderCourseTranslate.status}`)
  const outsiderEnrollments = await pool.listRows({
    databaseId, tableId: 'enrollments', queries: [Query.equal('userId', outsider.userId), Query.limit(10)],
  })
  check('Fremder: KEINE Einschreibungs-Zeile entstanden (Admin-SDK)', outsiderEnrollments.total === 0, `total=${outsiderEnrollments.total}`)

  // (c) Direktweg an der Appwrite-REST-API, an unseren Routen vorbei
  const outsiderSession = await poolUsers.createSession({ userId: outsider.userId })
  const sessionDb = new TablesDB(new Client().setEndpoint(endpoint).setProject(poolProject).setSession(outsiderSession.secret))
  const guestDb = new TablesDB(new Client().setEndpoint(endpoint).setProject(poolProject))
  /** Zeilen von A, die ein Client direkt lesen kann — ein abgewiesener Aufruf zählt als 0. */
  const directRowsOfA = async (db, tableId) => {
    const res = await db.listRows({ databaseId, tableId, queries: [Query.limit(100)] }).catch(() => ({ rows: [] }))
    return res.rows.filter(r => r.communityId === tenantA.tenantId).length
  }
  for (const tableId of ['courses', 'lessons']) {
    const viaSession = await directRowsOfA(sessionDb, tableId)
    check(`Direktweg: Session des Fremden liest 0 Zeilen von A aus ${tableId}`, viaSession === 0, `${viaSession} Zeile(n)`)
    const viaGuest = await directRowsOfA(guestDb, tableId)
    check(`Direktweg: Gast-Client liest 0 Zeilen von A aus ${tableId}`, viaGuest === 0, `${viaGuest} Zeile(n)`)
  }

  // (d) Mitglied
  const learner = await createUser('learner')
  await addMember(tenantA, learner.userId, 'viewer')
  const learnerCookie = await login(HOST_A, learner)
  const learnerEnroll = await call(HOST_A, `/api/courses/${slug}/enroll`, { method: 'POST', cookie: learnerCookie })
  check('Mitglied: Einschreiben 201', learnerEnroll.status === 201, `Status ${learnerEnroll.status} ${learnerEnroll.text.slice(0, 160)}`)
  const learnerLesson = await call(HOST_A, `/api/lessons/${lessonId}`, { cookie: learnerCookie })
  check('Mitglied: Lektion 200 mit Inhalt', learnerLesson.status === 200 && learnerLesson.json?.content === 'Nur für Kunde A.', `Status ${learnerLesson.status}`)
  const learnerComplete = await call(HOST_A, `/api/lessons/${lessonId}/complete`, { method: 'POST', cookie: learnerCookie })
  check('Mitglied: Abschluss 200', learnerComplete.status === 200, `Status ${learnerComplete.status} ${learnerComplete.text.slice(0, 160)}`)

  // (e) Entwurf
  const draftSlug = `${slug}-entwurf`
  const draft = await call(HOST_A, '/api/courses', {
    method: 'POST', cookie: ownerCookie,
    body: { title: 'Iso-Entwurf A', slug: draftSlug, description: 'Noch nicht fertig.', access: 'free', status: 'draft' },
  })
  if (draft.json?.$id) cleanup.courses.push(draft.json.$id)
  check('Entwurf angelegt (201)', draft.status === 201, `Status ${draft.status}`)
  const draftGuest = await call(HOST_A, `/api/courses/${draftSlug}`)
  check('Entwurf: Vorschau 404 für einen Gast', draftGuest.status === 404, `Status ${draftGuest.status}`)
  const draftMember = await call(HOST_A, `/api/courses/${draftSlug}`, { cookie: learnerCookie })
  check('Entwurf: Vorschau 404 für ein Mitglied', draftMember.status === 404, `Status ${draftMember.status}`)

  // (f) offene Registrierung: Einschreiben ist der Beitritt
  const controlUrl = process.env.NUXT_ONBOARDING_CONTROL_URL
  const seamUp = controlUrl
    ? await fetch(new URL('/api/health', controlUrl)).then(res => res.ok).catch(() => false)
    : false
  if (!seamUp) {
    console.log(`  ↷ übersprungen, Naht nicht erreichbar (NUXT_ONBOARDING_CONTROL_URL=${controlUrl || 'leer'})`)
  }
  else {
    await control.updateRow({ databaseId: controlDb, tableId: 'communities', rowId: tenantA.$id, data: { openRegistration: true } })
    console.log('  … warte 32 s auf den Resolver-Cache (Registrierung offen)')
    await waitForResolverCache()
    const joiner = await createUser('joiner')
    const joinerCookie = await login(HOST_A, joiner)
    const joinerEnroll = await call(HOST_A, `/api/courses/${slug}/enroll`, { method: 'POST', cookie: joinerCookie })
    check('Offene Registrierung: Fremder schreibt sich ein (201)', joinerEnroll.status === 201, `Status ${joinerEnroll.status} ${joinerEnroll.text.slice(0, 160)}`)
    const joinedRows = await control.listRows({
      databaseId: controlDb, tableId: 'community_members',
      queries: [Query.equal('communityId', tenantA.$id), Query.equal('runtimeUserId', joiner.userId), Query.limit(5)],
    })
    for (const row of joinedRows.rows) cleanup.members.push(row.$id)
    check('… und ist danach Mitglied (Zeile in community_members)', joinedRows.total > 0, `total=${joinedRows.total}`)
  }
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n8. Aufräumen')
  // Buchungen/Fortschritt hängen an den Kursen — vor den Kursen weg.
  for (const courseId of cleanup.courses) {
    for (const table of ['enrollments', 'lesson_progress']) {
      const rows = await pool.listRows({ databaseId, tableId: table, queries: [Query.equal('courseId', courseId), Query.limit(100)] }).catch(() => ({ rows: [] }))
      for (const row of rows.rows) await pool.deleteRow({ databaseId, tableId: table, rowId: row.$id }).catch(() => {})
    }
    const lessons = await pool.listRows({ databaseId, tableId: 'lessons', queries: [Query.equal('courseId', courseId), Query.limit(100)] }).catch(() => ({ rows: [] }))
    for (const row of lessons.rows) await pool.deleteRow({ databaseId, tableId: 'lessons', rowId: row.$id }).catch(() => {})
    await pool.deleteRow({ databaseId, tableId: 'courses', rowId: courseId }).catch(() => {})
  }
  for (const id of cleanup.lessons) await pool.deleteRow({ databaseId, tableId: 'lessons', rowId: id }).catch(() => {})
  for (const id of cleanup.members) await control.deleteRow({ databaseId: controlDb, tableId: 'community_members', rowId: id }).catch(() => {})
  for (const id of cleanup.users) await poolUsers.delete({ userId: id }).catch(() => {})
  for (const { id, plan } of cleanup.planRestore) {
    await control.updateRow({ databaseId: controlDb, tableId: 'communities', rowId: id, data: { plan } }).catch(() => {})
  }
  for (const { id, data } of cleanup.communityRestore) {
    await control.updateRow({ databaseId: controlDb, tableId: 'communities', rowId: id, data }).catch(() => {})
  }
  console.log(`  ✔ aufgeräumt (${cleanup.courses.length} Kurs(e), ${cleanup.members.length} Mitgliedschaft(en), ${cleanup.users.length} User, Pläne und Publikum zurückgesetzt)`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
