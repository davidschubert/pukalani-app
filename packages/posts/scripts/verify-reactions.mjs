#!/usr/bin/env node
/**
 * EMOJI-REAKTIONEN — der Beweis (F57 Mechanik 1, 2026-08-13).
 *
 * Geprueft wird BEIDES: dass die Mechanik tut, was sie soll (umschalten,
 * mehrere Emojis, buendeln, zaehlen) — und die Zusage, die das Konzept
 * daneben macht: **Reaktionen sind badge-neutral** (Teil 4 Punkt 3). Die
 * letzte Gruppe ist deshalb eine GEGENPROBE: fuenf Reaktionen duerfen an den
 * Upvote-Zaehlern und den upvote-basierten Abzeichen NICHTS bewegen.
 *
 * Aus packages/posts (dort loest node-appwrite auf), gegen einen LAUFENDEN
 * Dev-Server DERSELBEN Instanz:
 *   node --env-file=../../apps/comments/.env scripts/verify-reactions.mjs http://localhost:3011
 *
 * WAS ES NICHT PRUEFT, und warum das hier ehrlich stehen muss:
 *  - **M13 (Zahlungs-Sperre) und die Mandanten-Grenze ueber HTTP.** Die
 *    Dev-Instanz `reddit-comments` ist EIN-mandantig (`communityId: ''`) — es
 *    gibt dort keine gesperrte und keine fremde Community, gegen die man
 *    laufen koennte. Beides braucht `platform` UND das Control Plane
 *    gleichzeitig im Worktree. Getragen wird es strukturell von der
 *    Mitglieder-Klinke der Datentuer (`tenantDb(event)`), und genau das haelt
 *    `tests/reactions-door.test.ts` an der Quelle fest; die Trennung zweier
 *    Communities auf Datenebene zeigt Abschnitt 6 unten.
 *  - Den Klick selbst (Popover geht auf, Chip faerbt sich) — Browser-Verhalten.
 *
 * Legt Wegwerf-Nutzer, -Beitraege und -Reaktionen an und raeumt sie wieder
 * weg, auch im Fehlerfall.
 */
import '../../../scripts/lib/assert-target.mjs'
import { request } from 'node:http'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'
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
const REACTIONS = 'discussion_reactions'
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
/** Aufräumen MIT Nachzählen (Bühnen-Regel 2). */
const sweep = createEinzelCleanup({ script: 'verify-reactions' })

async function seedRow(tableId, data) {
  const row = await tablesDB.createRow({ databaseId, tableId, rowId: ID.unique(), data })
  cleanup.rows.push({ tableId, id: row.$id })
  sweep.track('poolRow', `${tableId}/${row.$id}`)
  return row
}

async function makeUser(tag) {
  const user = await users.create({
    userId: ID.unique(),
    email: `reaction-${tag}-${stamp}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: `Reaktions-Tester ${tag}`,
  })
  cleanup.users.push(user.$id)
  sweep.track('account', user.$id)
  const session = await users.createSession({ userId: user.$id })
  return { id: user.$id, cookie: `a_session_${projectId}=${encodeURIComponent(session.secret)}` }
}

/** Die Chips EINES Ziels aus der Antwort der Leseroute. */
function chipsOf(json, targetId) {
  return json?.reactions?.[targetId] ?? []
}
function chip(list, reaction) {
  return list.find(entry => entry.reaction === reaction) ?? null
}

async function countRows(tableId, queries) {
  const res = await tablesDB.listRows({ databaseId, tableId, queries: [...queries, Query.limit(100)] })
  return res
}

try {
  console.log(`Emoji-Reaktionen gegen ${base} / Projekt ${projectId} / DB ${databaseId}\n`)

  // Eine EIGENE Wegwerf-Kategorie (Bühnen-Regel 1: das Skript setzt seine
  // Annahmen selbst) — eine frische Instanz hat noch keine.
  const category = await seedRow('post_categories', {
    name: `Reaktionen ${stamp}`, slug: `reaktionen-${stamp}`, description: '',
    sortOrder: 0, active: true, communityId: '',
  })
  const categoryId = category.$id

  const anna = await makeUser('anna')
  const ben = await makeUser('ben')

  const now = new Date().toISOString()
  const basePost = {
    type: 'post', body: `reaktions-beweis ${stamp}`, authorId: anna.id, authorName: 'Anna',
    status: 'published', scheduledAt: null, publishedAt: now,
    pollOptions: null, pollEndsAt: null,
    upvotes: 0, downvotes: 0, score: 0, communityId: '',
  }
  // Das THEMA (mit Kategorie) und ein FEED-Beitrag (ohne) — der Unterschied
  // ist die ganze Abgrenzung des MVP.
  const topic = await seedRow(POSTS, { ...basePost, title: `Thema ${stamp}`, categoryId })
  const feedPost = await seedRow(POSTS, { ...basePost, title: `Feed ${stamp}`, categoryId: '' })

  /* ── 1. Wer darf ueberhaupt? ─────────────────────────────────────────── */
  const guest = await http('/api/posts/discussions/reactions', {
    method: 'POST', body: { targetType: 'post', targetId: topic.$id, reaction: 'tada' },
  })
  check('Gast: Reagieren wird abgewiesen (401)', guest.status === 401, `status ${guest.status}`)

  const guestRead = await http(`/api/posts/discussions/reactions?targetIds=${topic.$id}`)
  check('Gast: LESEN ist erlaubt (200)', guestRead.status === 200, `status ${guestRead.status}`)

  /* ── 2. Die Erlaubnisliste ist fail-closed ───────────────────────────── */
  const alien = await http('/api/posts/discussions/reactions', {
    method: 'POST', cookie: anna.cookie,
    body: { targetType: 'post', targetId: topic.$id, reaction: 'thumbsup' },
  })
  check('fremdes Emoji („thumbsup") wird abgewiesen (400)', alien.status === 400, `status ${alien.status}`)

  const alienChar = await http('/api/posts/discussions/reactions', {
    method: 'POST', cookie: anna.cookie,
    body: { targetType: 'post', targetId: topic.$id, reaction: '🎉' },
  })
  check('das ZEICHEN statt des Schluessels wird abgewiesen (400)', alienChar.status === 400, `status ${alienChar.status}`)

  /* ── 3. Feed-Beitraege sind im MVP ausgenommen ───────────────────────── */
  const feedTry = await http('/api/posts/discussions/reactions', {
    method: 'POST', cookie: anna.cookie,
    body: { targetType: 'post', targetId: feedPost.$id, reaction: 'tada' },
  })
  check('Beitrag OHNE Kategorie: keine Reaktion (409)', feedTry.status === 409, `status ${feedTry.status}`)
  check('… mit fachlichem Grund `reaction_target_not_topic`',
    feedTry.json?.reason === 'reaction_target_not_topic', JSON.stringify(feedTry.json))

  /* ── 4. Umschalten: an, zweites dazu, wieder aus ─────────────────────── */
  const on = await http('/api/posts/discussions/reactions', {
    method: 'POST', cookie: anna.cookie,
    body: { targetType: 'post', targetId: topic.$id, reaction: 'tada' },
  })
  check('Anna reagiert: 200', on.status === 200, `status ${on.status}`)
  check('… ein Chip mit Anzahl 1, als eigener markiert',
    on.json?.reactions?.length === 1 && on.json.reactions[0].reaction === 'tada'
    && on.json.reactions[0].count === 1 && on.json.reactions[0].mine === true,
    JSON.stringify(on.json))

  const second = await http('/api/posts/discussions/reactions', {
    method: 'POST', cookie: anna.cookie,
    body: { targetType: 'post', targetId: topic.$id, reaction: 'fire' },
  })
  check('ZWEITES Emoji derselben Person kommt DAZU (nicht statt)',
    second.json?.reactions?.length === 2
    && chip(second.json.reactions, 'tada')?.count === 1
    && chip(second.json.reactions, 'fire')?.count === 1,
    JSON.stringify(second.json))

  const off = await http('/api/posts/discussions/reactions', {
    method: 'POST', cookie: anna.cookie,
    body: { targetType: 'post', targetId: topic.$id, reaction: 'tada' },
  })
  check('dasselbe Emoji noch einmal nimmt es zurueck',
    off.json?.reactions?.length === 1 && chip(off.json.reactions, 'tada') === null,
    JSON.stringify(off.json))

  const rowsAfterToggle = await countRows(REACTIONS, [Query.equal('targetId', topic.$id)])
  check('… und die Zeile ist wirklich weg (1 Zeile in der DB)',
    rowsAfterToggle.total === 1, `total ${rowsAfterToggle.total}`)

  /* ── 5. Aggregation: zwei Menschen, zwei Emojis ──────────────────────── */
  // Anna hat 'fire'. Ben legt 'fire' (fremde Anzahl) und 'laugh' dazu.
  await http('/api/posts/discussions/reactions', {
    method: 'POST', cookie: ben.cookie,
    body: { targetType: 'post', targetId: topic.$id, reaction: 'fire' },
  })
  await http('/api/posts/discussions/reactions', {
    method: 'POST', cookie: ben.cookie,
    body: { targetType: 'post', targetId: topic.$id, reaction: 'laugh' },
  })

  const seenByAnna = await http(`/api/posts/discussions/reactions?targetIds=${topic.$id}`, { cookie: anna.cookie })
  const annaChips = chipsOf(seenByAnna.json, topic.$id)
  check('Aggregation: fire = 2, laugh = 1',
    chip(annaChips, 'fire')?.count === 2 && chip(annaChips, 'laugh')?.count === 1,
    JSON.stringify(annaChips))
  check('„meine" stimmt fuer Anna (fire ja, laugh nein)',
    chip(annaChips, 'fire')?.mine === true && chip(annaChips, 'laugh')?.mine === false,
    JSON.stringify(annaChips))

  const seenByBen = await http(`/api/posts/discussions/reactions?targetIds=${topic.$id}`, { cookie: ben.cookie })
  const benChips = chipsOf(seenByBen.json, topic.$id)
  check('„meine" stimmt fuer Ben (beide ja) — dieselben Zahlen, andere Markierung',
    chip(benChips, 'fire')?.mine === true && chip(benChips, 'laugh')?.mine === true
    && chip(benChips, 'fire')?.count === 2,
    JSON.stringify(benChips))

  check('Chips stehen in Katalog-Reihenfolge (laugh vor fire)',
    annaChips.map(c => c.reaction).join(',') === 'laugh,fire', annaChips.map(c => c.reaction).join(','))

  /* ── 5b. EINE Abfrage fuer MEHRERE Ziele ─────────────────────────────── */
  await http('/api/posts/discussions/reactions', {
    method: 'POST', cookie: anna.cookie,
    body: { targetType: 'post', targetId: topic.$id, reaction: 'idea' },
  })
  const bundle = await http(`/api/posts/discussions/reactions?targetIds=${topic.$id},${feedPost.$id}`, { cookie: anna.cookie })
  check('gebuendelt: EIN Aufruf beantwortet mehrere Ziele',
    bundle.status === 200 && chipsOf(bundle.json, topic.$id).length === 3,
    JSON.stringify(bundle.json))
  check('… der erlaubte Satz kommt mit (8 Emojis)',
    Array.isArray(bundle.json?.allowed) && bundle.json.allowed.length === 8,
    JSON.stringify(bundle.json?.allowed))

  /* ── 6. Mandanten-Trennung auf Datenebene ────────────────────────────── */
  const isoA = await seedRow(REACTIONS, {
    targetType: 'post', targetId: `iso-a-${stamp}`, userId: 'u-iso', reaction: 'tada', communityId: 'iso-ta',
  })
  await seedRow(REACTIONS, {
    targetType: 'post', targetId: `iso-b-${stamp}`, userId: 'u-iso', reaction: 'tada', communityId: 'iso-tb',
  })
  const scoped = await countRows(REACTIONS, [Query.equal('userId', 'u-iso'), Query.equal('communityId', 'iso-ta')])
  check('Isolation: der Mandanten-Filter trennt zwei Communities (1 statt 2)',
    scoped.total === 1 && scoped.rows[0].$id === isoA.$id, `total ${scoped.total}`)
  const unscoped = await countRows(REACTIONS, [Query.equal('userId', 'u-iso')])
  check('… und OHNE Filter waeren es beide (der Beweis, dass er noetig ist)',
    unscoped.total === 2, `total ${unscoped.total}`)

  /* ── 7. Das Abzeichen — genau EINMAL ─────────────────────────────────── */
  const annaBadges = await countRows(BADGES, [Query.equal('userId', anna.id)])
  const firstReaction = annaBadges.rows.filter(row => row.badgeKey === 'first-reaction')
  check('Abzeichen „first-reaction" ist verliehen', firstReaction.length >= 1, `${firstReaction.length}`)
  check('… und zwar GENAU EINMAL, obwohl Anna mehrfach reagiert hat',
    firstReaction.length === 1, `${firstReaction.length} Zeilen`)

  /* ── 8. GEGENPROBE: badge-neutral ────────────────────────────────────── */
  const annaCounters = await countRows(COUNTERS, [Query.equal('userId', anna.id)])
  const row = annaCounters.rows[0]
  check('Zaehler-Zeile existiert', Boolean(row), 'keine Zeile')
  check('reactionsGiven zaehlt mit (Anna: 2 offene Reaktionen)',
    row?.reactionsGiven === 2, `reactionsGiven ${row?.reactionsGiven}`)
  check('UPVOTE-ZAEHLER UNBERUEHRT: upvotesGiven === 0',
    row?.upvotesGiven === 0, `upvotesGiven ${row?.upvotesGiven}`)
  check('UPVOTE-ZAEHLER UNBERUEHRT: upvotesReceived === 0 (auch beim AUTOR des Themas)',
    row?.upvotesReceived === 0, `upvotesReceived ${row?.upvotesReceived}`)

  const upvoteBadges = ['first-like', 'welcome', 'appreciated', 'thank-you', 'nice-topic', 'nice-reply']
  const wrongly = annaBadges.rows.filter(b => upvoteBadges.includes(b.badgeKey)).map(b => b.badgeKey)
  check('KEIN upvote-basiertes Abzeichen durch Reaktionen entstanden',
    wrongly.length === 0, wrongly.join(','))

  // Und die Gegenprobe zur Gegenprobe: der Beitrag selbst hat keine Stimme
  // bekommen — eine Reaktion ist kein Upvote, auch nicht auf der Beitragszeile.
  const topicAfter = await tablesDB.getRow({ databaseId, tableId: POSTS, rowId: topic.$id })
  check('der Beitrag hat weiterhin 0 Upvotes und Score 0',
    topicAfter.upvotes === 0 && topicAfter.score === 0,
    `upvotes ${topicAfter.upvotes}, score ${topicAfter.score}`)
}
catch (error) {
  failed++
  console.error(`✗ Abbruch: ${error.message}`)
}
finally {
  // Reaktions-Zeilen der Test-Nutzer mit einsammeln (sie entstehen ueber die
  // Route, nicht ueber `seedRow`).
  for (const userId of cleanup.users) {
    for (const tableId of [REACTIONS, COUNTERS, BADGES]) {
      const res = await tablesDB.listRows({
        databaseId, tableId, queries: [Query.equal('userId', userId), Query.limit(100)],
      }).catch(() => ({ rows: [] }))
      for (const row of res.rows) {
        await tablesDB.deleteRow({ databaseId, tableId, rowId: row.$id }).catch(() => {})
      }
    }
  }
  for (const { tableId, id } of cleanup.rows) {
    await tablesDB.deleteRow({ databaseId, tableId, rowId: id }).catch(() => {})
  }
  for (const userId of cleanup.users) {
    await users.delete({ userId }).catch(() => {})
  }
  // NACHZÄHLEN — nicht dem eigenen Löschen glauben.
  const { leftovers } = await sweep.run().catch(error => ({ leftovers: [`Nachzählen gescheitert: ${error.message}`] }))
  check('aufgeräumt und nachgezählt: nichts übrig', leftovers.length === 0, leftovers.join(', '))
  console.log(`\n${failed === 0 ? '✔' : '✗'} ${passed} bestanden, ${failed} fehlgeschlagen`)
  process.exit(failed === 0 ? 0 : 1)
}
