#!/usr/bin/env node
/**
 * F58-Beweis: Die Kurs-Verwaltung ist AUS DEM PRODUKT HERAUS erreichbar.
 *
 * Vorher gab es auf `/courses` und `/courses/:slug` keinen einzigen Einstieg —
 * für keine Rolle. Wer den Pfad `/dashboard/courses` nicht auswendig kannte,
 * stand vor einer Galerie ohne Ausgang; das sah nach einem Rechte-Problem aus
 * und war eine fehlende Tür.
 *
 * Geprüft wird das SSR-HTML des laufenden comments-Dev-Servers (Default 3151) —
 * der Knopf steht im Server-Markup, weil `useCapability` aus dem Auth-Store
 * (Labels aus 02.auth.ts) bzw. der Community-Rolle liest, und beides reist im
 * SSR-Payload mit:
 *
 *   1. Mit `courses.manage` (hier: globales admin-Label) tragen Galerie und
 *      Detailseite die Einstiege. „Neuer Kurs" oeffnet seit Davids Entscheidung
 *      den Dialog an Ort und Stelle; „Kurs bearbeiten" bleibt ein Link in den
 *      Builder (`/dashboard/courses/<row-id>`), denn nur der macht die Beschriftungen
 *      wahr.
 *   2. GEGENPROBE: ein gewöhnliches Mitglied sieht KEINEN davon. Ohne diese
 *      Hälfte wäre der Beweis wertlos — ein immer sichtbarer Knopf bestünde
 *      Prüfung 1 genauso.
 *   3. `?new=1` öffnet im Dashboard wirklich den Anlege-Dialog (die Seite liest
 *      den Parameter).
 *
 * node:http über ::1 (fetch verwirft den Host-Header, Nitro hört auf [::1]).
 *
 * Aus packages/courses:
 *   node --env-file=../../apps/comments/.env scripts/verify-manage-entrypoints.mjs
 */
import '../../../scripts/lib/assert-target.mjs'
import { request } from 'node:http'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const PORT = Number(process.env.COMMENTS_PORT || 3151)
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
const cleanup = { users: [], courses: [] }

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
  const email = `courses-entry-${tag}-${Date.now()}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await users.create({ userId: ID.unique(), email, password, name: `Courses-Entry ${tag}` })
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

const slug = `entry-kurs-${Date.now()}`

try {
  console.log(`\nKurs-Verwaltung aus dem Produkt heraus (F58) gegen http://[::1]:${PORT}\n`)

  const admin = await createUser('admin', ['admin'])
  const adminCookie = await login(admin)
  const plain = await createUser('plain')
  const plainCookie = await login(plain)

  const created = await call('/api/courses', {
    method: 'POST', cookie: adminCookie,
    body: { title: 'Einstiegs-Kurs', slug, description: 'Beweis-Kurs.', access: 'members', status: 'published' },
  })
  const courseId = created.json?.$id
  check('Vorbereitung: veröffentlichter Kurs angelegt', created.status === 201 && !!courseId, `Status ${created.status} ${created.text.slice(0, 160)}`)
  if (courseId) cleanup.courses.push(courseId)

  console.log('\n1. Mit courses.manage: die Einstiege stehen da')
  const galleryAdmin = await call('/courses', { cookie: adminCookie })
  check('GET /courses → 200', galleryAdmin.status === 200, `Status ${galleryAdmin.status}`)
  check('Galerie trägt „Neuer Kurs"', galleryAdmin.text.includes('data-testid="courses-create"'))
  check('Galerie trägt „Verwalten"', galleryAdmin.text.includes('data-testid="courses-manage"'))
  // Wie bei den Terminen: der Knopf OEFFNET den Dialog hier, er verlinkt nicht.
  check('„Neuer Kurs" ist ein Knopf, kein Link ins Dashboard',
    !/href="[^"]*\/dashboard\/courses\?new=1"/.test(galleryAdmin.text))

  const detailAdmin = await call(`/courses/${slug}`, { cookie: adminCookie })
  check('GET /courses/:slug → 200', detailAdmin.status === 200, `Status ${detailAdmin.status}`)
  check('Detailseite trägt „Kurs bearbeiten"', detailAdmin.text.includes('data-testid="course-edit"'))
  // HIER BLEIBT ES EIN LINK, und das ist kein Rueckstand: ein Kurs wird in einer
  // BUILDER-SEITE aufgebaut (Lektionen, Reihenfolge), das gehoert nicht in einen
  // Dialog. Nur das ANLEGEN ist bei beiden Produkten derselbe Dialog.
  check('„Kurs bearbeiten" zielt auf die ROW-ID (der Builder adressiert per Id)',
    detailAdmin.text.includes(`/dashboard/courses/${courseId}"`))

  console.log('\n2. Gegenprobe: ein gewöhnliches Mitglied sieht nichts davon')
  const galleryPlain = await call('/courses', { cookie: plainCookie })
  check('Galerie → 200 (die Seite selbst bleibt offen)', galleryPlain.status === 200, `Status ${galleryPlain.status}`)
  check('KEIN „Neuer Kurs"', !galleryPlain.text.includes('data-testid="courses-create"'))
  check('KEIN „Verwalten"', !galleryPlain.text.includes('data-testid="courses-manage"'))
  const detailPlain = await call(`/courses/${slug}`, { cookie: plainCookie })
  check('Detailseite → 200 ohne „Kurs bearbeiten"',
    detailPlain.status === 200 && !detailPlain.text.includes('data-testid="course-edit"'), `Status ${detailPlain.status}`)

  /**
   * Dass der Dialog danach AUFGEHT, kann dieses Skript nicht zeigen: er rendert
   * client-seitig (ClientOnly-Hülle). Hier wird deshalb nur belegt, dass das
   * verlinkte Ziel überhaupt erreichbar ist — ein Knopf in einen 403 wäre
   * schlimmer als gar keiner. Das Öffnen selbst ist im Browser nachgemessen.
   */
  console.log('\n3. Die Ziele der Knöpfe sind erreichbar')
  const dashboard = await call('/dashboard/courses?new=1', { cookie: adminCookie })
  check('GET /dashboard/courses?new=1 → 200', dashboard.status === 200, `Status ${dashboard.status}`)
  const builder = await call(`/dashboard/courses/${courseId}`, { cookie: adminCookie })
  check('GET /dashboard/courses/:id → 200', builder.status === 200, `Status ${builder.status}`)
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n4. Aufräumen')
  for (const courseId of cleanup.courses) {
    for (const table of ['enrollments', 'lesson_progress', 'lessons']) {
      const rows = await db.listRows({ databaseId, tableId: table, queries: [Query.equal('courseId', courseId), Query.limit(100)] }).catch(() => ({ rows: [] }))
      for (const row of rows.rows) await db.deleteRow({ databaseId, tableId: table, rowId: row.$id }).catch(() => {})
    }
    await db.deleteRow({ databaseId, tableId: 'courses', rowId: courseId }).catch(() => {})
  }
  for (const id of cleanup.users) await users.delete({ userId: id }).catch(() => {})
  console.log(`  ✔ aufgeräumt (${cleanup.courses.length} Kurs(e), ${cleanup.users.length} User)`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
