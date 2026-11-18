#!/usr/bin/env node
/**
 * THEMEN-VERLINKUNG MIT RUECKVERWEIS — der Beweis (F57, letzte Mechanik,
 * 2026-08-14).
 *
 * Geprueft wird BEIDES: dass ein Verweis traegt — und die Zusagen daneben, die
 * man beim „Aufraeumen" als Erstes verlieren wuerde:
 *   - ein toter Verweis bleibt TEXT und wirft nichts,
 *   - das BEARBEITEN entfernt den alten Rueckverweis (Ersetzen, nicht Anhaengen),
 *   - Oeffnen und Speichern OHNE Tastendruck aendert nichts (bodyToSave),
 *   - Erwaehnungen (@) und Verweise (#) stehen unbehelligt nebeneinander,
 *   - die Suche ist hinter dem MITGLIEDER-Gate,
 *   - ein Selbstverweis erzeugt keinen Rueckverweis auf sich selbst,
 *   - dieselbe Id zweimal im Text ergibt EINE Zeile,
 *   - und das Abzeichen `first-link` haengt am WIRKSAMEN Verweis, nicht am `#`.
 *
 * Aus packages/posts (dort loest node-appwrite auf), gegen einen LAUFENDEN
 * Dev-Server DERSELBEN Instanz:
 *   node --env-file=../../apps/comments/.env scripts/verify-topic-links.mjs http://localhost:3011
 *
 * WAS ES NICHT PRUEFT, und warum das hier ehrlich stehen muss:
 *  - **Die Mandanten-TRENNUNG ueber HTTP.** Die Dev-Instanz `reddit-comments`
 *    ist EIN-mandantig, und dort scopet die Datentuer BEWUSST nicht
 *    (`rowBelongsToTenant`: „Silo/Single-Tenant: das Projekt ist die Grenze").
 *    Ein Test „fremdes Thema loest nicht auf" wuerde hier also eine Zusage
 *    messen, die die Architektur an dieser Betriebsart gar nicht macht.
 *    Abschnitt 7 prueft stattdessen, was die Pool-Trennung TRAEGT und hier
 *    pruefbar ist: den `communityId`-STEMPEL der Tuer — und dass ein vom
 *    Aufrufer mitgeschickter Mandant verworfen wird (`stripTenantKey`).
 *  - **Das Menue selbst** (Tippen von `#`, Auswahl per Tastatur) — Browser-
 *    Verhalten. Geprueft wird sein ZUTRAEGER und das Speicherformat, das er
 *    liefert: der Token aus der Suchroute muss die Erkennungs-Regel bestehen.
 *  - **Das Rendern als Link.** Der Renderer bekommt `topicLinks` und ersetzt
 *    exakte Zeichenketten (`core/shared/contentLinks.ts`, unit-getestet);
 *    geprueft wird hier, dass der Server GENAU die Token liefert, die im Text
 *    stehen — daran haengt alles Weitere.
 *
 * Legt Wegwerf-Nutzer, -Kategorien und -Themen an und raeumt sie wieder weg,
 * auch im Fehlerfall.
 */
import '../../../scripts/lib/assert-target.mjs'
import { request } from 'node:http'
import { Client, ID, Permission, Query, Role, TablesDB, Users } from 'node-appwrite'
import { createEinzelCleanup, einzelBaseUrl } from '../../../scripts/lib/probe-stage.mjs'

const base = einzelBaseUrl('http://localhost:3011')
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollstaendig — mit --env-file=<app-.env> aufrufen.')
  process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const users = new Users(client)
const tablesDB = new TablesDB(client)

const POSTS = 'community_posts'
const CATEGORIES = 'post_categories'
const LINKS = 'discussion_links'
const COUNTERS = 'member_counters'
const BADGES = 'user_badges'

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`✔ ${name}`) }
  else { failed++; console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** node:http ueber ::1 statt `fetch` (Nitro hoert im Dev auf IPv6-Loopback). */
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
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(data) }
        catch { /* HTML-Fehlerseite */ }
        resolve({ status: res.statusCode, body: data, json })
      })
    })
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

const stamp = Date.now().toString(36)
const cleanup = { users: [], rows: [] }

async function seedRow(tableId, data, permissions) {
  const row = await tablesDB.createRow({
    databaseId, tableId, rowId: ID.unique(), data, ...(permissions ? { permissions } : {}),
  })
  cleanup.rows.push({ tableId, id: row.$id })
  return row
}

async function makeUser(tag) {
  const user = await users.create({
    userId: ID.unique(),
    email: `topiclink-${tag}-${stamp}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: `Link-Tester ${tag}`,
  })
  cleanup.users.push(user.$id)
  const session = await users.createSession({ userId: user.$id })
  return { id: user.$id, cookie: `a_session_${projectId}=${encodeURIComponent(session.secret)}` }
}

async function linkRows(sourceId) {
  const res = await tablesDB.listRows({
    databaseId, tableId: LINKS, queries: [Query.equal('sourceId', sourceId), Query.limit(50)],
  })
  return res.rows
}
async function counterRow(userId) {
  const res = await tablesDB.listRows({
    databaseId, tableId: COUNTERS, queries: [Query.equal('userId', userId), Query.limit(10)],
  })
  return res.rows[0] ?? null
}
async function badgeKeys(userId) {
  const res = await tablesDB.listRows({
    databaseId, tableId: BADGES, queries: [Query.equal('userId', userId), Query.limit(100)],
  })
  return res.rows.map(row => row.badgeKey)
}

try {
  console.log(`Themen-Verlinkung gegen ${base} / Projekt ${projectId} / DB ${databaseId}\n`)

  const anna = await makeUser('anna')
  const now = new Date().toISOString()

  // rowSecurity ist an und die Tabellen-Rechte sind leer (Migration 007/001) —
  // ohne explizites Leserecht faende der Session-Client die Zeile nie.
  const publicRead = [Permission.read(Role.any())]

  const category = await seedRow(CATEGORIES, {
    name: `Beweis ${stamp}`, slug: `beweis-${stamp}`, description: '',
    sortOrder: 0, active: true, communityId: '',
  }, publicRead)

  const topicBase = {
    type: 'post', authorId: anna.id, authorName: 'Anna',
    status: 'published', scheduledAt: null, publishedAt: now,
    pollOptions: null, pollEndsAt: null, categoryId: category.$id,
    upvotes: 0, downvotes: 0, score: 0, communityId: '',
    pinned: false, closed: false, solved: false, editedAt: null,
    lastActivityAt: now,
  }

  // Das ZIEL, auf das verwiesen wird.
  const ziel = await seedRow(POSTS, { ...topicBase, title: `Polipoli offen ${stamp}`, body: 'Ist die Huette offen?' }, publicRead)
  // Ein zweites Ziel fuer den Bearbeiten-Beweis.
  const ziel2 = await seedRow(POSTS, { ...topicBase, title: `Haleakala Sonnenaufgang ${stamp}`, body: 'Wann losfahren?' }, publicRead)
  // Ein FEED-Beitrag (keine Kategorie) — nie ein Verweisziel.
  const feed = await seedRow(POSTS, { ...topicBase, categoryId: '', title: `Feed ${stamp}`, body: 'Nur Feed.' }, publicRead)

  /* ── 1. Der Verweis wird aufgeloest ─────────────────────────────────── */
  console.log('\n── 1. Ein Verweis loest auf ──')

  const token = `#${ziel.$id}-polipoli-offen`
  const created = await http('/api/posts', {
    method: 'POST', cookie: anna.cookie,
    body: { type: 'post', title: `Quelle ${stamp}`, body: `Siehe ${token} dazu.`, categoryId: category.$id },
  })
  check('Beitrag mit Verweis wird angelegt', created.status === 201, `status ${created.status} ${created.body.slice(0, 200)}`)
  const quelle = created.json
  if (quelle?.$id) cleanup.rows.push({ tableId: POSTS, id: quelle.$id })

  const detail = await http(`/api/posts/discussions/${quelle.$id}`, { cookie: anna.cookie })
  const links = detail.json?.post?.topicLinks ?? []
  check('die Antwort traegt genau EINEN aufgeloesten Verweis', links.length === 1, `${links.length}`)
  check('der Token ist WOERTLICH der aus dem Text', links[0]?.token === token, `${links[0]?.token}`)
  check('der Verweis zeigt auf den kanonischen Themen-Pfad',
    links[0]?.href === `/discussions/${category.slug}/${ziel.$id}/polipoli-offen-${stamp}`,
    `${links[0]?.href}`)
  check('angezeigt wird der HEUTIGE Titel des Ziels, nicht der Token',
    links[0]?.label === `Polipoli offen ${stamp}`, `${links[0]?.label}`)

  /* ── 2. Der Rueckverweis am Ziel ────────────────────────────────────── */
  console.log('\n── 2. Das Ziel zeigt „verlinkt von" ──')

  const back = await http(`/api/posts/discussions/backlinks?targetId=${ziel.$id}`, { cookie: anna.cookie })
  check('die Rueckverweis-Route antwortet', back.status === 200, `status ${back.status}`)
  const backlinks = back.json?.backlinks ?? []
  check('das Ziel kennt GENAU die Quelle', backlinks.length === 1 && backlinks[0]?.$id === quelle.$id,
    JSON.stringify(backlinks))
  check('der Rueckverweis traegt Titel und Pfad der Quelle',
    backlinks[0]?.title === `Quelle ${stamp}` && backlinks[0]?.path?.startsWith(`/discussions/${category.slug}/${quelle.$id}/`),
    JSON.stringify(backlinks[0]))
  check('es steht GENAU EINE Index-Zeile in der Tabelle', (await linkRows(quelle.$id)).length === 1)

  /* ── 3. Bearbeiten ERSETZT ──────────────────────────────────────────── */
  console.log('\n── 3. Bearbeiten entfernt den alten Rueckverweis ──')

  const token2 = `#${ziel2.$id}-haleakala`
  const edited = await http(`/api/posts/${quelle.$id}`, {
    method: 'PATCH', cookie: anna.cookie,
    body: { title: `Quelle ${stamp}`, body: `Jetzt lieber ${token2}.` },
  })
  check('die Bearbeitung geht durch', edited.status === 200, `status ${edited.status} ${edited.body.slice(0, 200)}`)

  const backAlt = await http(`/api/posts/discussions/backlinks?targetId=${ziel.$id}`, { cookie: anna.cookie })
  check('das ALTE Ziel hat seinen Rueckverweis VERLOREN',
    (backAlt.json?.backlinks ?? []).length === 0, JSON.stringify(backAlt.json))
  const backNeu = await http(`/api/posts/discussions/backlinks?targetId=${ziel2.$id}`, { cookie: anna.cookie })
  check('das NEUE Ziel hat ihn bekommen',
    (backNeu.json?.backlinks ?? []).length === 1, JSON.stringify(backNeu.json))
  check('die Quelle hat weiterhin GENAU EINE Index-Zeile', (await linkRows(quelle.$id)).length === 1)

  /* ── 4. Tote Verweise bleiben Text ──────────────────────────────────── */
  console.log('\n── 4. Ein toter Verweis bleibt Text ──')

  const totToken = '#gibtesnichtabcdefghij'
  const tot = await http('/api/posts', {
    method: 'POST', cookie: anna.cookie,
    body: { type: 'post', title: `Tot ${stamp}`, body: `Siehe ${totToken} und ${'#42'} und #wp-t-kurz.`, categoryId: category.$id },
  })
  check('ein Beitrag mit totem Verweis wird ANGENOMMEN (kein Fehler)', tot.status === 201, `status ${tot.status}`)
  if (tot.json?.$id) cleanup.rows.push({ tableId: POSTS, id: tot.json.$id })

  const totDetail = await http(`/api/posts/discussions/${tot.json.$id}`, { cookie: anna.cookie })
  check('nichts davon wird aufgeloest', (totDetail.json?.post?.topicLinks ?? []).length === 0,
    JSON.stringify(totDetail.json?.post?.topicLinks))
  check('der Text steht unveraendert im Beitrag', totDetail.json?.post?.body?.includes(totToken))
  check('es entsteht KEINE Index-Zeile', (await linkRows(tot.json.$id)).length === 0)

  /* ── 5. Ein FEED-Beitrag ist kein Ziel ──────────────────────────────── */
  console.log('\n── 5. Nur Themen sind Ziele ──')

  const aufFeed = await http('/api/posts', {
    method: 'POST', cookie: anna.cookie,
    body: { type: 'post', title: `AufFeed ${stamp}`, body: `Siehe #${feed.$id}-feed dazu.`, categoryId: category.$id },
  })
  if (aufFeed.json?.$id) cleanup.rows.push({ tableId: POSTS, id: aufFeed.json.$id })
  const aufFeedDetail = await http(`/api/posts/discussions/${aufFeed.json.$id}`, { cookie: anna.cookie })
  check('ein Verweis auf einen kategorielosen Feed-Beitrag loest NICHT auf',
    (aufFeedDetail.json?.post?.topicLinks ?? []).length === 0)
  check('und legt keine Index-Zeile an', (await linkRows(aufFeed.json.$id)).length === 0)

  /* ── 6. Selbstverweis und Doppelnennung ─────────────────────────────── */
  console.log('\n── 6. Selbstverweis und Doppelnennung ──')

  const doppelt = await http('/api/posts', {
    method: 'POST', cookie: anna.cookie,
    body: { type: 'post', title: `Doppelt ${stamp}`, body: `${token} und nochmal #${ziel.$id}-andere-schreibweise.`, categoryId: category.$id },
  })
  if (doppelt.json?.$id) cleanup.rows.push({ tableId: POSTS, id: doppelt.json.$id })
  check('dieselbe Id zweimal ergibt EINE Index-Zeile', (await linkRows(doppelt.json.$id)).length === 1)

  const doppeltDetail = await http(`/api/posts/discussions/${doppelt.json.$id}`, { cookie: anna.cookie })
  const doppeltLinks = doppeltDetail.json?.post?.topicLinks ?? []
  check('der Renderer bekommt aber BEIDE Schreibweisen', doppeltLinks.length === 2,
    JSON.stringify(doppeltLinks.map(l => l.token)))
  check('beide zeigen auf dasselbe Ziel',
    doppeltLinks[0]?.href === doppeltLinks[1]?.href && doppeltLinks[0]?.token !== doppeltLinks[1]?.token)

  const selbst = await http('/api/posts', {
    method: 'POST', cookie: anna.cookie,
    body: { type: 'post', title: `Selbst ${stamp}`, body: 'Platzhalter.', categoryId: category.$id },
  })
  if (selbst.json?.$id) cleanup.rows.push({ tableId: POSTS, id: selbst.json.$id })
  await http(`/api/posts/${selbst.json.$id}`, {
    method: 'PATCH', cookie: anna.cookie,
    body: { title: `Selbst ${stamp}`, body: `Ich verweise auf #${selbst.json.$id}-mich-selbst.` },
  })
  check('ein Selbstverweis erzeugt KEINE Zeile', (await linkRows(selbst.json.$id)).length === 0)

  /* ── 7. Der Mandanten-Stempel ───────────────────────────────────────── */
  console.log('\n── 7. Der Mandanten-Stempel ──')

  /**
   * WAS HIER GEPRUEFT WIRD — UND WAS NICHT.
   *
   * Diese Instanz ist EIN-mandantig, und dort scopet die Datentuer BEWUSST
   * nicht: `rowBelongsToTenant` sagt woertlich „Silo/Single-Tenant: das
   * Projekt ist die Grenze, jede Zeile gehoert dazu". Eine Zeile mit fremder
   * `communityId` ist hier also ein Zustand, den es real nie gibt — zu pruefen,
   * dass sie NICHT aufloest, hiesse eine Zusage zu messen, die die
   * Architektur an dieser Betriebsart gar nicht macht (beim ersten Lauf am
   * 2026-08-14 genau so passiert: der Test war rot, der Code richtig).
   *
   * Getragen wird die Pool-Trennung von zwei Dingen, und beide sind hier
   * pruefbar: die Index-Zeile bekommt ihren `communityId`-STEMPEL von der Tuer
   * (nie vom Aufrufer), und JEDER Zugriff auf Ziele und Quellen laeuft durch
   * dieselbe Tuer. Die Regel selbst ist pur und in core unit-getestet.
   */
  const stempel = (await linkRows(quelle.$id))[0]
  check('die Index-Zeile traegt den communityId-Stempel der Tuer',
    stempel !== undefined && typeof stempel.communityId === 'string',
    JSON.stringify(stempel?.communityId))

  const geschmuggelt = await http('/api/posts', {
    method: 'POST', cookie: anna.cookie,
    body: {
      type: 'post', title: `Schmuggel ${stamp}`, body: `Siehe ${token} dazu.`,
      categoryId: category.$id,
      // Der Aufrufer VERSUCHT, den Mandanten zu setzen — stripTenantKey wirft
      // beide Schluessel weg, bevor die Zeile entsteht.
      communityId: `fremd-${stamp}`, tenantId: `fremd-${stamp}`,
    },
  })
  if (geschmuggelt.json?.$id) cleanup.rows.push({ tableId: POSTS, id: geschmuggelt.json.$id })
  const geschmuggelteZeile = (await linkRows(geschmuggelt.json.$id))[0]
  check('eine vom Aufrufer mitgeschickte communityId landet NICHT in der Index-Zeile',
    geschmuggelteZeile !== undefined && geschmuggelteZeile.communityId !== `fremd-${stamp}`,
    JSON.stringify(geschmuggelteZeile?.communityId))

  /* ── 8. Das Gate der Suche ──────────────────────────────────────────── */
  console.log('\n── 8. Die Suche ist hinter dem Gate ──')

  const gast = await http('/api/posts/discussions/link-search?q=Polipoli')
  check('ein GAST bekommt 401', gast.status === 401, `status ${gast.status}`)

  const suche = await http(`/api/posts/discussions/link-search?q=Polipoli+${stamp}`, { cookie: anna.cookie })
  check('ein Mitglied bekommt Treffer', suche.status === 200 && (suche.json ?? []).length > 0,
    `status ${suche.status} ${JSON.stringify(suche.json)}`)
  const treffer = (suche.json ?? []).find(item => item.id.includes(ziel.$id))
  check('der Treffer traegt den FERTIGEN Token als id', Boolean(treffer) && treffer.id.startsWith(`#${ziel.$id}-`),
    JSON.stringify(treffer))
  check('und den Titel als label', treffer?.label === `Polipoli offen ${stamp}`, `${treffer?.label}`)

  const leer = await http('/api/posts/discussions/link-search', { cookie: anna.cookie })
  check('ohne Suchbegriff kommen die juengsten Themen', leer.status === 200 && (leer.json ?? []).length > 0,
    `status ${leer.status}`)
  check('darunter ist KEIN kategorieloser Feed-Beitrag',
    !(leer.json ?? []).some(item => item.id.includes(feed.$id)), JSON.stringify(leer.json))

  /* ── 9. Der Token der Suche besteht die Erkennungs-Regel ────────────── */
  console.log('\n── 9. Das Menue liefert, was die Regel erkennt ──')

  const ausMenue = await http('/api/posts', {
    method: 'POST', cookie: anna.cookie,
    body: { type: 'post', title: `AusMenue ${stamp}`, body: `Wie in ${treffer.id} beschrieben.`, categoryId: category.$id },
  })
  if (ausMenue.json?.$id) cleanup.rows.push({ tableId: POSTS, id: ausMenue.json.$id })
  const menueDetail = await http(`/api/posts/discussions/${ausMenue.json.$id}`, { cookie: anna.cookie })
  check('der Token AUS DER SUCHROUTE loest wieder auf',
    (menueDetail.json?.post?.topicLinks ?? [])[0]?.token === treffer.id,
    JSON.stringify(menueDetail.json?.post?.topicLinks))

  /* ── 10. Erwaehnungen daneben ───────────────────────────────────────── */
  console.log('\n── 10. @ und # im selben Beitrag ──')

  const handleRes = await http('/api/account/handle', { cookie: anna.cookie })
  const handle = handleRes.json?.handle
  check('die Testperson hat einen Handle', Boolean(handle), JSON.stringify(handleRes.json))

  const beides = await http('/api/posts', {
    method: 'POST', cookie: anna.cookie,
    body: { type: 'post', title: `Beides ${stamp}`, body: `@${handle} schau auf ${token} bitte.`, categoryId: category.$id },
  })
  if (beides.json?.$id) cleanup.rows.push({ tableId: POSTS, id: beides.json.$id })
  const beidesDetail = await http(`/api/posts/discussions/${beides.json.$id}`, { cookie: anna.cookie })
  check('die Erwaehnung wird weiterhin aufgeloest',
    (beidesDetail.json?.post?.mentions ?? []).includes(handle),
    JSON.stringify(beidesDetail.json?.post?.mentions))
  check('und der Verweis daneben ebenfalls',
    (beidesDetail.json?.post?.topicLinks ?? [])[0]?.token === token,
    JSON.stringify(beidesDetail.json?.post?.topicLinks))

  /* ── 11. Oeffnen + Speichern ohne Tastendruck ───────────────────────── */
  console.log('\n── 11. Oeffnen und Speichern aendert nichts ──')

  const vorher = await http(`/api/posts/discussions/${beides.json.$id}`, { cookie: anna.cookie })
  const bodyVorher = vorher.json?.post?.body
  const editedAtVorher = vorher.json?.post?.editedAt
  const zeilenVorher = (await linkRows(beides.json.$id)).length

  const nochmal = await http(`/api/posts/${beides.json.$id}`, {
    method: 'PATCH', cookie: anna.cookie,
    body: { title: `Beides ${stamp}`, body: bodyVorher },
  })
  check('das erneute Speichern geht durch', nochmal.status === 200, `status ${nochmal.status}`)
  const nachher = await http(`/api/posts/discussions/${beides.json.$id}`, { cookie: anna.cookie })
  check('der Text ist Zeichen fuer Zeichen derselbe', nachher.json?.post?.body === bodyVorher)
  check('es gilt NICHT als Bearbeitung (editedAt unveraendert)',
    nachher.json?.post?.editedAt === editedAtVorher, `${editedAtVorher} → ${nachher.json?.post?.editedAt}`)
  check('die Index-Zeilen bleiben unveraendert',
    (await linkRows(beides.json.$id)).length === zeilenVorher)

  /* ── 12. Das Abzeichen ──────────────────────────────────────────────── */
  console.log('\n── 12. „First Link" ──')

  const counter = await counterRow(anna.id)
  check('der Zaehler linksMade zaehlt die WIRKSAMEN Verweise',
    typeof counter?.linksMade === 'number' && counter.linksMade >= 1, `${counter?.linksMade}`)
  check('das Abzeichen first-link ist verliehen', (await badgeKeys(anna.id)).includes('first-link'))

  const ben = await makeUser('ben')
  const nurTot = await http('/api/posts', {
    method: 'POST', cookie: ben.cookie,
    body: { type: 'post', title: `NurTot ${stamp}`, body: 'Siehe #erfundenabcdefghijkl dazu.', categoryId: category.$id },
  })
  if (nurTot.json?.$id) cleanup.rows.push({ tableId: POSTS, id: nurTot.json.$id })
  const benCounter = await counterRow(ben.id)
  check('ein toter Verweis verdient KEIN Abzeichen',
    !(benCounter?.linksMade > 0) && !(await badgeKeys(ben.id)).includes('first-link'),
    `linksMade ${benCounter?.linksMade}`)
}
catch (error) {
  failed++
  console.error('\n✗ Unerwarteter Fehler:', error?.message ?? error)
}
finally {
  for (const row of cleanup.rows.reverse()) {
    await tablesDB.deleteRow({ databaseId, tableId: row.tableId, rowId: row.id }).catch(() => undefined)
  }
  // Die Index-Zeilen gehoeren keinem Beitrag mehr — mit aufraeumen.
  for (const row of cleanup.rows.filter(entry => entry.tableId === POSTS)) {
    const stale = await tablesDB.listRows({
      databaseId, tableId: LINKS, queries: [Query.equal('sourceId', row.id), Query.limit(50)],
    }).catch(() => ({ rows: [] }))
    for (const link of stale.rows) {
      await tablesDB.deleteRow({ databaseId, tableId: LINKS, rowId: link.$id }).catch(() => undefined)
    }
  }
  for (const userId of cleanup.users) {
    await users.delete({ userId }).catch(() => undefined)
  }
  // NACHZÄHLEN (Bühnen-Regel 2): alles Registrierte und alles, was an den
  // Wegwerf-Konten hängt, muss weg sein — nicht dem eigenen Löschen glauben.
  const sweep = createEinzelCleanup({ script: 'verify-topic-links' })
  for (const { tableId, id } of cleanup.rows) sweep.track('poolRow', `${tableId}/${id}`)
  for (const userId of cleanup.users) sweep.track('account', userId)
  const { leftovers } = await sweep.run().catch(error => ({ leftovers: [`Nachzählen gescheitert: ${error.message}`] }))
  check('aufgeräumt und nachgezählt: nichts übrig', leftovers.length === 0, leftovers.join(', '))
}

console.log(`\n${failed === 0 ? '✔' : '✗'} ${passed}/${passed + failed} Pruefungen bestanden`)
process.exit(failed === 0 ? 0 : 1)
