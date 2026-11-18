#!/usr/bin/env node
/**
 * „THEMA ERÖFFNEN AUS DISCUSSIONS HERAUS" — der Beweis (2026-08-04).
 *
 * Davids Regel: Feed und Discussions sind UNABHÄNGIGE Produkte, jedes muss für
 * sich allein vollständig funktionieren. Vorher ließ sich ein Thema nur über
 * den Feed-Composer eröffnen — ein Produkt setzte das andere als Einstieg
 * voraus. Dieses Skript prüft beides zugleich:
 *
 *   der EINSTIEG ist neu   — der Knopf steht auf `/discussions` UND in jeder
 *                            Kategorie-Ansicht, und zwar nur für Angemeldete;
 *   der WEG ist derselbe   — geschrieben wird über `POST /api/posts`, das
 *                            Thema erscheint danach in der Themen-Liste UND
 *                            bleibt im Feed (Konzept-Entscheidung 2).
 *
 * WARUM DIE SESSION ÜBER DEN ADMIN-KEY KOMMT (users.createSession) und nicht
 * über das Anmeldeformular: geprüft wird der Discussions-Einstieg, nicht die
 * Anmeldung. Der Umweg über ein Passwort brächte hier keine Aussage dazu.
 *
 * WAS ES NICHT PRÜFT: den Klick selbst — dass das Fenster aufgeht, die
 * Kategorie darin vorbelegt ist und die Liste sich danach auffrischt, ist
 * Browser-Verhalten. Diese Hälfte ist von Hand belegt (Bericht zum Paket);
 * hier steht das, was ohne Browser ehrlich messbar ist.
 *
 * Aus packages/posts (dort löst node-appwrite auf), gegen einen LAUFENDEN
 * Dev-Server derselben Instanz:
 *   node --env-file=../../apps/comments/.env scripts/verify-new-topic-entry.mjs http://localhost:3001
 *
 * Legt einen Wegwerf-Nutzer und EIN Thema an und räumt beides wieder weg —
 * auch im Fehlerfall.
 */
import '../../../scripts/lib/assert-target.mjs'
import { request } from 'node:http'
import { Client, ID, Permission, Role, TablesDB, Users } from 'node-appwrite'
import { createEinzelCleanup, einzelBaseUrl } from '../../../scripts/lib/probe-stage.mjs'

const base = einzelBaseUrl('http://localhost:3001')
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=<app-.env> aufrufen (Runtime-Key mit users/sessions).')
  process.exit(1)
}

const adminClient = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const users = new Users(adminClient)
const tablesDB = new TablesDB(adminClient)
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID || 'main'
/** Aufräumen MIT Nachzählen (Bühnen-Regel 2): Konto, Beitrag und alles, was am Konto hängt. */
const sweep = createEinzelCleanup({ script: 'verify-new-topic-entry' })

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`✔ ${name}`) }
  else { failed++; console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/**
 * node:http über ::1 statt `fetch`: Nitro hört im Dev auf der IPv6-Loopback,
 * und Node's `fetch` verwirft einen selbst gesetzten Host-Header (CLAUDE.md).
 */
function http(path, { method = 'GET', cookie = '', body } = {}) {
  const url = new URL(path, base)
  return new Promise((resolve, reject) => {
    const req = request({
      host: '::1',
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'host': url.host,
        ...(cookie ? { cookie } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

const stamp = Date.now().toString(36)
const cleanup = { users: [], posts: [] }
let cookie = ''

try {
  const user = await users.create({
    userId: ID.unique(),
    email: `new-topic-${stamp}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: `Thema Tester ${stamp}`,
  })
  cleanup.users.push(user.$id)
  sweep.track('account', user.$id)
  const session = await users.createSession({ userId: user.$id })
  cookie = `a_session_${projectId}=${encodeURIComponent(session.secret)}`

  // Eine EIGENE Wegwerf-Kategorie (Bühnen-Regel 1: das Skript setzt seine
  // Annahmen selbst) — eine frische Instanz hat noch keine. Leserecht wie bei
  // der Standard-Kategorie der App (seedDefaultCategory.ts).
  const ownCategory = await tablesDB.createRow({
    databaseId, tableId: 'post_categories', rowId: ID.unique(),
    data: { name: `Thema ${stamp}`, slug: `thema-${stamp}`, description: '', sortOrder: 0, active: true, communityId: '' },
    permissions: [Permission.read(Role.any())],
  })
  sweep.track('poolRow', `post_categories/${ownCategory.$id}`)

  // ── 1. Der Gast bekommt keinen Einstieg ───────────────────────────────────
  // Dieselbe Bedingung wie beim Feed-Composer (`isLoggedIn`) — nicht neu
  // erfunden, nur an einer zweiten Stelle gezeigt.
  const guest = await http('/discussions')
  check('Gast: /discussions rendert', guest.status === 200, `status ${guest.status}`)
  check('Gast: KEIN Eröffnen-Knopf', !guest.body.includes('data-discussions-new-topic'))

  // ── 2. Das Mitglied bekommt ihn — auf BEIDEN Seiten ───────────────────────
  const overview = await http('/discussions', { cookie })
  check('Mitglied: /discussions rendert', overview.status === 200, `status ${overview.status}`)
  check('Mitglied: Eröffnen-Knopf auf der Übersicht', overview.body.includes('data-discussions-new-topic'))

  const catRes = await http('/api/posts/categories?all=1')
  const active = JSON.parse(catRes.body).rows.map(row => row.category).filter(category => category.active)
  const target = active.find(category => category.$id === ownCategory.$id)
  check('die eigene Kategorie steht aktiv in /api/posts/categories', Boolean(target))
  if (!target) throw new Error('ohne die eigene Kategorie gibt es nichts zu eröffnen')

  const inCategory = await http(`/discussions/${target.slug}`, { cookie })
  check(`Mitglied: Eröffnen-Knopf in /discussions/${target.slug}`, inCategory.body.includes('data-discussions-new-topic'))

  // ── 3. Derselbe Schreibweg wie im Feed ────────────────────────────────────
  const title = `Beweis Thema ${stamp}`
  const created = await http('/api/posts', {
    method: 'POST',
    cookie,
    body: {
      type: 'post',
      title,
      body: 'Aus der Discussions-Ansicht eröffnet (verify-new-topic-entry).',
      categoryId: target.$id,
    },
  })
  check('POST /api/posts mit Kategorie → 201', created.status === 201, `status ${created.status} ${created.body.slice(0, 160)}`)
  const row = created.status === 201 ? JSON.parse(created.body) : null
  if (row?.$id) {
    cleanup.posts.push(row.$id)
    sweep.track('poolRow', `community_posts/${row.$id}`)
  }

  const topics = await http(`/api/posts/discussions?category=${target.slug}`)
  check('Thema steht in der Themen-Liste', topics.body.includes(title))

  // Konzept-Entscheidung 2: eine Community hat EINEN Ort — das Thema
  // verschwindet nicht aus dem Feed, nur weil es eine Kategorie trägt.
  const feed = await http('/api/posts')
  check('… und bleibt im Feed (Entscheidung 2)', feed.body.includes(title))
}
catch (error) {
  failed++
  console.error(`✗ Abbruch: ${error?.message ?? error}`)
}
finally {
  // Erst der Beitrag (über die eigene Session — der Autor darf das), dann der
  // Nutzer: umgekehrt gäbe es keine Session mehr, mit der gelöscht werden kann.
  for (const id of cleanup.posts) await http(`/api/posts/${id}`, { method: 'DELETE', cookie }).catch(() => {})
  for (const id of cleanup.users) await users.delete({ userId: id }).catch(() => {})
  // Was die Route löschen ließ oder liegen ließ — danach NACHZÄHLEN.
  const { leftovers } = await sweep.run().catch(error => ({ leftovers: [`Nachzählen gescheitert: ${error.message}`] }))
  check('aufgeräumt und nachgezählt: nichts übrig', leftovers.length === 0, leftovers.join(', '))
}

console.log(`\n${failed === 0 ? '✔' : '✗'} ${passed}/${passed + failed} Prüfungen bestanden`)
process.exit(failed === 0 ? 0 : 1)
