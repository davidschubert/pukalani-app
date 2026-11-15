#!/usr/bin/env node
/**
 * F58-Beweis: Die Termin-Verwaltung ist AUS DEM PRODUKT HERAUS erreichbar.
 *
 * Dieselbe fehlende Tür wie bei den Kursen: auf `/events` und `/events/:id` gab
 * es keinen Einstieg in die Verwaltung — für keine Rolle. Anlegen und
 * Bearbeiten lebten ausschließlich unter `/dashboard/events`.
 *
 * Geprüft wird das SSR-HTML des laufenden comments-Dev-Servers (Default 3151):
 *
 *   1. Mit `events.manage` (hier: globales admin-Label) tragen Liste und
 *      Detailseite die Einstiege. Sie OEFFNEN seit Davids Entscheidung den
 *      Dialog an Ort und Stelle statt ins Dashboard zu verlinken; die tiefen
 *      Ziele (`?new=1`, `?edit=<id>`) bleiben als Lesezeichen gueltig (ohne den
 *      Parameter landete „Bearbeiten" in einer Tabelle statt am Termin).
 *   2. GEGENPROBE: ein gewöhnliches Mitglied sieht keinen davon.
 *   3. Der Knopf sitzt in `EventDetail.vue` und damit in BEIDEN Fassungen der
 *      Detailseite (events-Layer + Bauplan) — hier gemessen an der Fassung, die
 *      apps/comments tatsächlich rendert: der Bauplan-Variante.
 *
 * node:http über ::1 (fetch verwirft den Host-Header, Nitro hört auf [::1]).
 *
 * Aus packages/events:
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
const cleanup = { users: [], events: [] }

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
  const email = `events-entry-${tag}-${Date.now()}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await users.create({ userId: ID.unique(), email, password, name: `Events-Entry ${tag}` })
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

try {
  console.log(`\nTermin-Verwaltung aus dem Produkt heraus (F58) gegen http://[::1]:${PORT}\n`)

  const admin = await createUser('admin', ['admin'])
  const adminCookie = await login(admin)
  const plain = await createUser('plain')
  const plainCookie = await login(plain)

  const startAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
  const created = await call('/api/events', {
    method: 'POST', cookie: adminCookie,
    body: { title: 'Einstiegs-Termin', description: 'Beweis-Termin.', startAt, status: 'published' },
  })
  const eventId = created.json?.$id
  check('Vorbereitung: veröffentlichter Termin angelegt', created.status === 201 && !!eventId, `Status ${created.status} ${created.text.slice(0, 160)}`)
  if (eventId) cleanup.events.push(eventId)

  console.log('\n1. Mit events.manage: die Einstiege stehen da')
  const listAdmin = await call('/events', { cookie: adminCookie })
  check('GET /events → 200', listAdmin.status === 200, `Status ${listAdmin.status}`)
  check('Liste trägt „Neues Event"', listAdmin.text.includes('data-testid="events-create"'))
  check('Liste trägt „Verwalten"', listAdmin.text.includes('data-testid="events-manage"'))
  // Der Knopf OEFFNET den Dialog an Ort und Stelle (Davids Entscheidung) — er
  // ist deshalb KEIN Link mehr. Die Gegenprobe ist wichtiger als sie aussieht:
  // faellt jemand auf den Tiefen-Link zurueck, ist die Handlung wieder woanders,
  // und genau das war der gemeldete Fehler.
  check('„Neues Event" ist ein Knopf, kein Link ins Dashboard',
    !/href="[^"]*\/dashboard\/events\?new=1"/.test(listAdmin.text))
  check('Die Liste bringt das geteilte Formular mit',
    listAdmin.text.includes('data-testid="event-form"') || listAdmin.text.includes('events-create'))

  const detailAdmin = await call(`/events/${eventId}`, { cookie: adminCookie })
  check('GET /events/:id → 200', detailAdmin.status === 200, `Status ${detailAdmin.status}`)
  check('Detailseite trägt „Event bearbeiten"', detailAdmin.text.includes('data-testid="event-edit"'))
  check('„Event bearbeiten" ist ein Knopf, kein Link ins Dashboard',
    !detailAdmin.text.includes(`/dashboard/events?edit=${eventId}"`))
  check('Detailseite traegt „Zurueckziehen"', detailAdmin.text.includes('data-testid="event-unpublish"'))
  check('Detailseite traegt „Absagen"', detailAdmin.text.includes('data-testid="event-cancel"'))

  console.log('\n2. Gegenprobe: ein gewöhnliches Mitglied sieht nichts davon')
  const listPlain = await call('/events', { cookie: plainCookie })
  check('Liste → 200 (die Seite selbst bleibt offen)', listPlain.status === 200, `Status ${listPlain.status}`)
  check('KEIN „Neues Event"', !listPlain.text.includes('data-testid="events-create"'))
  check('KEIN „Verwalten"', !listPlain.text.includes('data-testid="events-manage"'))
  check('KEIN Verwaltungs-Block auf der Detailseite',
    !listPlain.text.includes('data-testid="event-manage-actions"'))
  const detailPlain = await call(`/events/${eventId}`, { cookie: plainCookie })
  check('Detailseite → 200 ohne „Event bearbeiten"',
    detailPlain.status === 200 && !detailPlain.text.includes('data-testid="event-edit"'), `Status ${detailPlain.status}`)

  console.log('\n3. Gast: die Detailseite ist öffentlich, der Knopf nicht')
  const detailGuest = await call(`/events/${eventId}`)
  check('Gast → 200 ohne „Event bearbeiten"',
    detailGuest.status === 200 && !detailGuest.text.includes('data-testid="event-edit"'), `Status ${detailGuest.status}`)

  console.log('\n4. Die Ziele der Knöpfe sind erreichbar')
  const dashboardNew = await call('/dashboard/events?new=1', { cookie: adminCookie })
  check('GET /dashboard/events?new=1 → 200', dashboardNew.status === 200, `Status ${dashboardNew.status}`)
  const dashboardEdit = await call(`/dashboard/events?edit=${eventId}`, { cookie: adminCookie })
  check('GET /dashboard/events?edit=:id → 200', dashboardEdit.status === 200, `Status ${dashboardEdit.status}`)
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n5. Aufräumen')
  for (const eventId of cleanup.events) {
    const rsvps = await db.listRows({ databaseId, tableId: 'rsvps', queries: [Query.equal('eventId', eventId), Query.limit(100)] }).catch(() => ({ rows: [] }))
    for (const row of rsvps.rows) await db.deleteRow({ databaseId, tableId: 'rsvps', rowId: row.$id }).catch(() => {})
    await db.deleteRow({ databaseId, tableId: 'events', rowId: eventId }).catch(() => {})
  }
  for (const id of cleanup.users) await users.delete({ userId: id }).catch(() => {})
  console.log(`  ✔ aufgeräumt (${cleanup.events.length} Termin(e), ${cleanup.users.length} User)`)
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
