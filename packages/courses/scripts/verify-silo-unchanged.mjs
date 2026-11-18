#!/usr/bin/env node
/**
 * Silo-Gegenprobe: Kurse verhalten sich in apps/comments UNVERÄNDERT.
 *
 * Die Datentür-Umstellung darf im Einzelbetrieb nichts ändern — dort gibt es
 * keinen Mandanten-Kontext, also scopet die Tür nicht, stempelt nichts und
 * `requirePlanProduct` ist ein No-Op. Der Beweis fährt die ECHTE API gegen
 * den laufenden comments-Dev-Server (Default Port 3151):
 *
 *   1. Kein Produkt-Gate: die Galerie antwortet dem Gast 200 (die Vorschau ist
 *      seit SEC-029 für alle offen — im Pool auf basic wäre es 404).
 *   2. Ein User mit globalem admin-Label verwaltet wie bisher: anlegen,
 *      Lektion, Builder-Detail, publish, manage-Liste.
 *   3. Ein User OHNE Label bleibt draußen (403) — im Silo gibt es keine
 *      Site-Rolle, die hilft.
 *   4. Mitglieder-Pfad: Galerie, Detail per Slug, Enroll, Lektions-Content,
 *      Abschluss — genau die Semantik von vor der Umstellung.
 *   5. Rows tragen KEIN tenantId (per Admin-SDK nachgeprüft) und auch eine
 *      veröffentlichte Kurs-Zeile trägt KEIN Leserecht (SEC-029: die Route ist
 *      die Grenze, courseAccess.ts).
 *
 * node:http über ::1 (fetch verwirft den Host-Header, Nitro hört auf [::1]).
 *
 * Aus packages/courses:
 *   node --env-file=../../apps/comments/.env scripts/verify-silo-unchanged.mjs
 */
import '../../../scripts/lib/assert-target.mjs'
import { request } from 'node:http'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'
import { createEinzelCleanup } from '../../../scripts/lib/probe-stage.mjs'

// Der Läufer setzt EINZEL_PORT (die Einzel-Instanz im nächtlichen Lauf).
const PORT = Number(process.env.EINZEL_PORT || process.env.COMMENTS_PORT || 3151)
const HOST = process.env.SILO_HOST || 'localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=../../apps/comments/.env aufrufen.')
  process.exit(1)
}

const db = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const users = new Users(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

let pass = 0
let fail = 0
const cleanup = { users: [], courses: [], lessons: [] }

function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

function call(path, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolve, reject) => {
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
        resolve({ status: res.statusCode, json, text, setCookie: res.headers['set-cookie'] ?? [] })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function createUser(tag, labels = []) {
  const email = `courses-silo-${tag}-${Date.now()}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await users.create({ userId: ID.unique(), email, password, name: `Courses-Silo ${tag}` })
  cleanup.users.push(user.$id)
  if (labels.length) await users.updateLabels({ userId: user.$id, labels })
  return { email, password }
}

async function login(account) {
  const res = await call('/api/auth/login', { method: 'POST', body: { email: account.email, password: account.password } })
  const cookie = res.setCookie.find(c => c.startsWith('a_session_'))?.split(';')[0]
  if (!cookie) throw new Error(`Login fehlgeschlagen (${res.status}): ${res.text.slice(0, 160)}`)
  return cookie
}

const slug = `silo-kurs-${Date.now()}`

try {
  console.log(`\ncourses im Silo (apps/comments) gegen http://[::1]:${PORT} — Verhalten unverändert?\n`)

  console.log('1. Kein Produkt-Gate im Einzelbetrieb')
  // SEC-029 (2026-11-13, Davids Entscheidung): die Galerie ist eine VORSCHAU für
  // jeden, auch ohne Konto. Vorher stand hier 401. Ein Plan-Gate gäbe 404.
  const guest = await call('/api/courses')
  check('Gast → 200 (Vorschau für alle; nicht 404: es gibt hier kein Plan-Gate)', guest.status === 200, `Status ${guest.status}`)

  console.log('\n2. Verwaltung über das globale admin-Label')
  const admin = await createUser('admin', ['admin'])
  const adminCookie = await login(admin)

  const created = await call('/api/courses', {
    method: 'POST', cookie: adminCookie,
    body: { title: 'Silo-Kurs', slug, description: 'Einzelbetrieb.', access: 'members', status: 'published' },
  })
  const courseId = created.json?.$id
  check('POST /api/courses → 201', created.status === 201 && !!courseId, `Status ${created.status} ${created.text.slice(0, 160)}`)
  if (courseId) cleanup.courses.push(courseId)

  const lessonRes = await call(`/api/courses/${courseId}/lessons`, {
    method: 'POST', cookie: adminCookie,
    body: { title: 'Silo-Lektion', content: 'Inhalt.', status: 'published' },
  })
  const lessonId = lessonRes.json?.$id
  if (lessonId) cleanup.lessons.push(lessonId)
  check('POST Lektion → 201', lessonRes.status === 201 && !!lessonId, `Status ${lessonRes.status} ${lessonRes.text.slice(0, 160)}`)

  const manage = await call('/api/courses/manage', { cookie: adminCookie })
  check('GET /api/courses/manage → 200 und enthält den Kurs', manage.status === 200 && (manage.json?.rows ?? []).some(r => r.$id === courseId), `Status ${manage.status}`)
  const builder = await call(`/api/courses/${courseId}/manage`, { cookie: adminCookie })
  check('Builder-Detail → 200 mit Lektion inkl. Content', builder.status === 200 && (builder.json?.lessons ?? []).some(l => l.$id === lessonId && l.content === 'Inhalt.'), `Status ${builder.status}`)
  const patched = await call(`/api/courses/${courseId}`, { method: 'PATCH', cookie: adminCookie, body: { description: 'Bearbeitet.' } })
  check('PATCH → 200', patched.status === 200, `Status ${patched.status}`)
  const reorder = await call(`/api/courses/${courseId}/reorder`, { method: 'POST', cookie: adminCookie, body: { lessonIds: [lessonId] } })
  check('Reorder → 200', reorder.status === 200, `Status ${reorder.status}`)

  console.log('\n3. Ohne Label bleibt die Verwaltung zu')
  const plain = await createUser('plain')
  const plainCookie = await login(plain)
  const plainManage = await call('/api/courses/manage', { cookie: plainCookie })
  check('manage → 403', plainManage.status === 403, `Status ${plainManage.status}`)
  const plainCreate = await call('/api/courses', {
    method: 'POST', cookie: plainCookie,
    body: { title: 'darf nicht', slug: `${slug}-x`, description: 'x', access: 'members' },
  })
  check('POST /api/courses → 403', plainCreate.status === 403, `Status ${plainCreate.status}`)
  if (plainCreate.json?.$id) cleanup.courses.push(plainCreate.json.$id)

  console.log('\n4. Mitglieder-Pfad (der Kurs-Konsum)')
  const gallery = await call('/api/courses', { cookie: plainCookie })
  check('Galerie → 200 und enthält den published Kurs', gallery.status === 200 && (gallery.json?.rows ?? []).some(r => r.$id === courseId), `Status ${gallery.status}`)
  const detail = await call(`/api/courses/${slug}`, { cookie: plainCookie })
  check('Detail per Slug → 200 mit Lektions-Titel, ohne Content', detail.status === 200
    && (detail.json?.lessons ?? []).some(l => l.$id === lessonId)
    && !JSON.stringify(detail.json?.lessons ?? []).includes('Inhalt.'), `Status ${detail.status}`)
  const beforeEnroll = await call(`/api/lessons/${lessonId}`, { cookie: plainCookie })
  check('Lektions-Content OHNE Enrollment → 403', beforeEnroll.status === 403, `Status ${beforeEnroll.status}`)
  const enroll = await call(`/api/courses/${slug}/enroll`, { method: 'POST', cookie: plainCookie })
  check('Enroll → 201', enroll.status === 201, `Status ${enroll.status} ${enroll.text.slice(0, 160)}`)
  const enrollAgain = await call(`/api/courses/${slug}/enroll`, { method: 'POST', cookie: plainCookie })
  check('Enroll erneut → 201 (idempotent)', enrollAgain.status === 201, `Status ${enrollAgain.status}`)
  const content = await call(`/api/lessons/${lessonId}`, { cookie: plainCookie })
  check('Lektions-Content NACH Enrollment → 200', content.status === 200 && content.json?.content === 'Inhalt.', `Status ${content.status}`)
  const complete = await call(`/api/lessons/${lessonId}/complete`, { method: 'POST', cookie: plainCookie })
  check('Abschluss → 200 und Kurs gilt als fertig', complete.status === 200 && complete.json?.courseCompleted === true, `Status ${complete.status} ${complete.text.slice(0, 160)}`)
  const afterDetail = await call(`/api/courses/${slug}`, { cookie: plainCookie })
  check('Detail zeigt Fortschritt + completedAt', (afterDetail.json?.completedLessonIds ?? []).includes(lessonId) && !!afterDetail.json?.completedAt)

  console.log('\n5. Zeilen tragen keinen Mandanten')
  const rawCourse = await db.getRow({ databaseId, tableId: 'courses', rowId: courseId })
  check('courses.communityId ist leer (Silo stempelt nicht)', (rawCourse.communityId ?? rawCourse.tenantId ?? '') === '', `communityId='${rawCourse.communityId}'`)
  // SEC-029: Kurs-Zeilen tragen KEIN Leserecht, auch veröffentlichte nicht —
  // die Routen sind die Grenze (courseAccess.ts). Vorher stand hier read("users").
  check('published trägt KEIN Leserecht (SEC-029)', (rawCourse.$permissions ?? []).length === 0, JSON.stringify(rawCourse.$permissions))
  const rawLesson = await db.getRow({ databaseId, tableId: 'lessons', rowId: lessonId })
  check('lessons.communityId ist leer und die Lektion trägt keine Read-Permission', (rawLesson.communityId ?? rawLesson.tenantId ?? '') === '' && (rawLesson.$permissions ?? []).length === 0, JSON.stringify(rawLesson.$permissions))
  const unpublish = await call(`/api/courses/${courseId}`, { method: 'PATCH', cookie: adminCookie, body: { status: 'draft' } })
  const rawAfter = await db.getRow({ databaseId, tableId: 'courses', rowId: courseId })
  check('Unpublish → 200, die Zeile bleibt ohne Leserecht', unpublish.status === 200 && (rawAfter.$permissions ?? []).length === 0, JSON.stringify(rawAfter.$permissions))
  const del = await call(`/api/lessons/${lessonId}`, { method: 'DELETE', cookie: adminCookie })
  check('Lektion löschen → 200', del.status === 200, `Status ${del.status}`)
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n6. Aufräumen')
  for (const courseId of cleanup.courses) {
    for (const table of ['enrollments', 'lesson_progress', 'lessons']) {
      const rows = await db.listRows({ databaseId, tableId: table, queries: [Query.equal('courseId', courseId), Query.limit(100)] }).catch(() => ({ rows: [] }))
      for (const row of rows.rows) await db.deleteRow({ databaseId, tableId: table, rowId: row.$id }).catch(() => {})
    }
    await db.deleteRow({ databaseId, tableId: 'courses', rowId: courseId }).catch(() => {})
  }
  for (const id of cleanup.users) await users.delete({ userId: id }).catch(() => {})
  // NACHZÄHLEN (Bühnen-Regel 2) statt „✔ aufgeräumt" ohne Zählung: Konten,
  // die eigenen Zeilen und alles, was an den Wegwerf-Konten hängt, sind weg.
  const sweep = createEinzelCleanup({ script: 'verify-silo-unchanged' })
  for (const entry of [...cleanup.courses.map(id => `courses/${id}`), ...cleanup.lessons.map(id => `lessons/${id}`)]) sweep.track('poolRow', entry)
  for (const id of cleanup.users) sweep.track('account', id)
  const { leftovers } = await sweep.run().catch(error => ({ leftovers: [`Nachzählen gescheitert: ${error.message}`] }))
  check('aufgeräumt und nachgezählt: nichts übrig', leftovers.length === 0, leftovers.join(', '))
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
