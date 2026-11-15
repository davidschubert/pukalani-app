#!/usr/bin/env node
/**
 * EMOJI-REAKTIONEN AUF ANTWORTEN — der Beweis (F57, Davids Entscheidung
 * 2026-08-13 „Ja, nachbauen").
 *
 * Geprueft wird DREIERLEI: dass die Mechanik tut, was sie soll (umschalten,
 * mehrere Emojis, buendeln, zaehlen) — die Zusage, die das Konzept daneben
 * macht (**Reaktionen sind badge-neutral**, Teil 4 Punkt 3) — und die
 * Zusage, die dieser Bau NEU macht: dass die Antwort-Reaktionen die
 * THEMEN-Reaktionen nicht anfassen und mit ihnen DENSELBEN Zaehler teilen.
 *
 * Aus packages/comments (dort loest node-appwrite auf), gegen einen LAUFENDEN
 * Dev-Server DERSELBEN Instanz:
 *   node --env-file=../../apps/comments/.env scripts/verify-comment-reactions.mjs http://localhost:3021
 *
 * WAS ES NICHT PRUEFT, und warum das hier ehrlich stehen muss:
 *  - **M13 (Zahlungs-Sperre) und die Mandanten-Grenze ueber HTTP.** Die
 *    Dev-Instanz `reddit-comments` ist EIN-mandantig (`communityId: ''`) — es
 *    gibt dort keine gesperrte und keine fremde Community, gegen die man
 *    laufen koennte. Beides braucht `platform` UND das Control Plane
 *    gleichzeitig im Worktree. Getragen wird es strukturell von der
 *    Mitglieder-Klinke der Datentuer (`tenantDb(event)`), und genau das haelt
 *    `tests/comment-reactions-door.test.ts` an der Quelle fest; die Trennung
 *    zweier Communities auf Datenebene zeigt Abschnitt 7 unten.
 *  - Den Klick selbst (Popover geht auf, Chip faerbt sich) — Browser-Verhalten.
 *
 * Legt Wegwerf-Nutzer, -Kommentare und -Reaktionen an und raeumt sie wieder
 * weg, auch im Fehlerfall.
 */
import '../../../scripts/lib/assert-target.mjs'
import { request } from 'node:http'
import { Client, ID, Permission, Query, Role, TablesDB, Users } from 'node-appwrite'

const base = process.argv[2] ?? 'http://localhost:3021'
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

const COMMENTS = 'comments'
const REACTIONS = 'comment_reactions'
const DISCUSSION_REACTIONS = 'discussion_reactions'
const COUNTERS = 'member_counters'
const BADGES = 'user_badges'
const POSTS = 'community_posts'

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
  const row = await tablesDB.createRow({ databaseId, tableId, rowId: ID.unique(), data, ...(permissions ? { permissions } : {}) })
  cleanup.rows.push({ tableId, id: row.$id })
  return row
}

/**
 * DIE LESERECHTE EINES ECHTEN KOMMENTARS — beim Bau des Beweises live
 * erwischt, und die Lehre ist teurer als die Zeile.
 *
 * `comments` ist eine rowSecurity-Tabelle: eine per Admin-Client gesaete Zeile
 * OHNE Permissions sieht der Session-Client NIE. Die Kommentar-Liste kam
 * deshalb leer zurueck — und weil „keine Reaktionen" und „keine Kommentare"
 * beide als leere Map ankommen, war die Pruefung „der geloeschte Platzhalter
 * hat keinen Eintrag" GRUEN, ohne irgendetwas zu zeigen. Genau die Sorte
 * immer-gruener Test, vor der die Doku an anderer Stelle warnt.
 * `withPublishedRead([], event)` der echten Route ergibt auf einer
 * oeffentlichen Instanz `read(any)`; das bilden wir hier nach.
 */
function commentPermissions(ownerId) {
  return [
    Permission.read(Role.any()),
    Permission.update(Role.user(ownerId)),
    Permission.delete(Role.user(ownerId)),
  ]
}

async function makeUser(tag) {
  const user = await users.create({
    userId: ID.unique(),
    email: `creaction-${tag}-${stamp}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: `Antwort-Reaktions-Tester ${tag}`,
  })
  cleanup.users.push(user.$id)
  const session = await users.createSession({ userId: user.$id })
  return { id: user.$id, cookie: `a_session_${projectId}=${encodeURIComponent(session.secret)}` }
}

function chip(list, reaction) {
  return (list ?? []).find(entry => entry.reaction === reaction) ?? null
}

/** Die Chips EINES Kommentars aus der LISTEN-Antwort (es gibt keine eigene Route). */
async function chipsFromList(targetId, targetType, cookie, commentId) {
  const res = await http(`/api/comments?targetId=${targetId}&targetType=${targetType}`, { cookie })
  return { res, chips: res.json?.reactions?.[commentId] ?? [], allowed: res.json?.reactionsAllowed }
}

async function countRows(tableId, queries) {
  return await tablesDB.listRows({ databaseId, tableId, queries: [...queries, Query.limit(100)] })
}

try {
  console.log(`Antwort-Reaktionen gegen ${base} / Projekt ${projectId} / DB ${databaseId}\n`)

  const anna = await makeUser('anna')
  const ben = await makeUser('ben')

  const targetId = `verify-creactions-${stamp}`
  const targetType = 'page'

  const baseComment = {
    targetId, targetType, authorId: anna.id, authorName: 'Anna',
    parentId: null, rootId: null, depth: 0, targetUrl: '/verify',
    upvotes: 0, downvotes: 0, score: 0, status: 'active',
    editedAt: null, communityId: '',
  }
  const reply = await seedRow(COMMENTS, { ...baseComment, content: `Antwort A ${stamp}` }, commentPermissions(anna.id))
  const deleted = await seedRow(COMMENTS, { ...baseComment, content: '', status: 'deleted' }, commentPermissions(anna.id))

  /* ── 1. Wer darf ueberhaupt? ─────────────────────────────────────────── */
  const guest = await http(`/api/comments/${reply.$id}/reactions`, {
    method: 'POST', body: { reaction: 'tada' },
  })
  check('Gast: Reagieren wird abgewiesen (401)', guest.status === 401, `status ${guest.status}`)

  const guestRead = await chipsFromList(targetId, targetType, '', reply.$id)
  check('Gast: LESEN ist erlaubt (200)', guestRead.res.status === 200, `status ${guestRead.res.status}`)

  /**
   * DER WAECHTER UEBER DIESEN BEWEIS SELBST.
   *
   * Alles, was unten aus der LISTE gelesen wird, ist wertlos, wenn die Liste
   * die Kommentare gar nicht enthaelt — „keine Reaktionen" und „keine
   * Kommentare" kommen beide als leere Map an. Genau das ist beim Bau
   * passiert (gesaete Zeilen ohne Row-Permissions), und fuenf Pruefungen waren
   * still gruen. Diese Zeile faellt zuerst, wenn es wieder passiert.
   */
  check('… und die Liste enthaelt die gesaeten Antworten (sonst beweist unten nichts)',
    (guestRead.res.json?.rows ?? []).some(row => row.$id === reply.$id),
    `rows ${(guestRead.res.json?.rows ?? []).length}`)

  /* ── 2. Die Erlaubnisliste ist fail-closed ───────────────────────────── */
  const alien = await http(`/api/comments/${reply.$id}/reactions`, {
    method: 'POST', cookie: anna.cookie, body: { reaction: 'thumbsup' },
  })
  check('fremdes Emoji („thumbsup") wird abgewiesen (400)', alien.status === 400, `status ${alien.status}`)

  const alienChar = await http(`/api/comments/${reply.$id}/reactions`, {
    method: 'POST', cookie: anna.cookie, body: { reaction: '🎉' },
  })
  check('das ZEICHEN statt des Schluessels wird abgewiesen (400)', alienChar.status === 400, `status ${alienChar.status}`)

  /* ── 3. Auf einen geloeschten Kommentar geht nichts ──────────────────── */
  const onDeleted = await http(`/api/comments/${deleted.$id}/reactions`, {
    method: 'POST', cookie: anna.cookie, body: { reaction: 'tada' },
  })
  check('[geloescht]-Platzhalter: keine Reaktion (409)', onDeleted.status === 409, `status ${onDeleted.status}`)
  check('… mit fachlichem Grund `reaction_target_not_reactable`',
    onDeleted.json?.reason === 'reaction_target_not_reactable', JSON.stringify(onDeleted.json))

  /* ── 4. Umschalten: an, zweites dazu, wieder aus ─────────────────────── */
  const on = await http(`/api/comments/${reply.$id}/reactions`, {
    method: 'POST', cookie: anna.cookie, body: { reaction: 'tada' },
  })
  check('Anna reagiert auf eine ANTWORT: 200', on.status === 200, `status ${on.status}`)
  check('… ein Chip mit Anzahl 1, als eigener markiert',
    on.json?.reactions?.length === 1 && on.json.reactions[0].reaction === 'tada'
    && on.json.reactions[0].count === 1 && on.json.reactions[0].mine === true,
    JSON.stringify(on.json))

  const second = await http(`/api/comments/${reply.$id}/reactions`, {
    method: 'POST', cookie: anna.cookie, body: { reaction: 'fire' },
  })
  check('ZWEITES Emoji derselben Person kommt DAZU (nicht statt)',
    second.json?.reactions?.length === 2
    && chip(second.json.reactions, 'tada')?.count === 1
    && chip(second.json.reactions, 'fire')?.count === 1,
    JSON.stringify(second.json))

  const off = await http(`/api/comments/${reply.$id}/reactions`, {
    method: 'POST', cookie: anna.cookie, body: { reaction: 'tada' },
  })
  check('dasselbe Emoji noch einmal nimmt es zurueck',
    off.json?.reactions?.length === 1 && chip(off.json.reactions, 'tada') === null,
    JSON.stringify(off.json))

  const rowsAfterToggle = await countRows(REACTIONS, [Query.equal('targetId', reply.$id)])
  check('… und die Zeile ist wirklich weg (1 Zeile in der DB)',
    rowsAfterToggle.total === 1, `total ${rowsAfterToggle.total}`)

  /* ── 5. Aggregation: zwei Menschen, zwei Emojis ──────────────────────── */
  // Anna hat 'fire'. Ben legt 'fire' (fremde Anzahl) und 'laugh' dazu.
  await http(`/api/comments/${reply.$id}/reactions`, {
    method: 'POST', cookie: ben.cookie, body: { reaction: 'fire' },
  })
  await http(`/api/comments/${reply.$id}/reactions`, {
    method: 'POST', cookie: ben.cookie, body: { reaction: 'laugh' },
  })

  const seenByAnna = await chipsFromList(targetId, targetType, anna.cookie, reply.$id)
  check('Aggregation: fire = 2, laugh = 1',
    chip(seenByAnna.chips, 'fire')?.count === 2 && chip(seenByAnna.chips, 'laugh')?.count === 1,
    JSON.stringify(seenByAnna.chips))
  check('„meine" stimmt fuer Anna (fire ja, laugh nein)',
    chip(seenByAnna.chips, 'fire')?.mine === true && chip(seenByAnna.chips, 'laugh')?.mine === false,
    JSON.stringify(seenByAnna.chips))

  const seenByBen = await chipsFromList(targetId, targetType, ben.cookie, reply.$id)
  check('„meine" stimmt fuer Ben (beide ja) — dieselben Zahlen, andere Markierung',
    chip(seenByBen.chips, 'fire')?.mine === true && chip(seenByBen.chips, 'laugh')?.mine === true
    && chip(seenByBen.chips, 'fire')?.count === 2,
    JSON.stringify(seenByBen.chips))

  check('Chips stehen in Katalog-Reihenfolge (laugh vor fire)',
    seenByAnna.chips.map(c => c.reaction).join(',') === 'laugh,fire',
    seenByAnna.chips.map(c => c.reaction).join(','))

  /* ── 5b. GEBUENDELT: die Liste beantwortet MEHRERE Ziele in EINEM Ruf ── */
  const other = await seedRow(COMMENTS, { ...baseComment, content: `Antwort B ${stamp}` }, commentPermissions(anna.id))
  await http(`/api/comments/${other.$id}/reactions`, {
    method: 'POST', cookie: anna.cookie, body: { reaction: 'idea' },
  })
  const bundle = await http(`/api/comments?targetId=${targetId}&targetType=${targetType}`, { cookie: anna.cookie })
  check('gebuendelt: EIN Listen-Aufruf traegt die Chips MEHRERER Antworten',
    bundle.status === 200
    && (bundle.json?.reactions?.[reply.$id] ?? []).length === 2
    && (bundle.json?.reactions?.[other.$id] ?? []).length === 1,
    JSON.stringify(bundle.json?.reactions))
  check('… der erlaubte Satz kommt mit (8 Emojis)',
    Array.isArray(bundle.json?.reactionsAllowed) && bundle.json.reactionsAllowed.length === 8,
    JSON.stringify(bundle.json?.reactionsAllowed))
  check('… und es gibt KEINE eigene Reaktions-Leseroute mehr (404)',
    (await http('/api/comments/reactions?targetIds=x')).status === 404)

  /* ── 6. Der geloeschte Kommentar traegt keine Chips ──────────────────── */
  check('ein [geloescht]-Platzhalter hat keinen Eintrag in der Liste',
    bundle.json?.reactions?.[deleted.$id] === undefined,
    JSON.stringify(bundle.json?.reactions?.[deleted.$id]))

  /* ── 7. Mandanten-Trennung auf Datenebene ────────────────────────────── */
  const isoA = await seedRow(REACTIONS, {
    targetId: `iso-a-${stamp}`, userId: 'u-iso', reaction: 'tada', communityId: 'iso-ta',
  })
  await seedRow(REACTIONS, {
    targetId: `iso-b-${stamp}`, userId: 'u-iso', reaction: 'tada', communityId: 'iso-tb',
  })
  const scoped = await countRows(REACTIONS, [Query.equal('userId', 'u-iso'), Query.equal('communityId', 'iso-ta')])
  check('Isolation: der Mandanten-Filter trennt zwei Communities (1 statt 2)',
    scoped.total === 1 && scoped.rows[0].$id === isoA.$id, `total ${scoped.total}`)
  const unscoped = await countRows(REACTIONS, [Query.equal('userId', 'u-iso')])
  check('… und OHNE Filter waeren es beide (der Beweis, dass er noetig ist)',
    unscoped.total === 2, `total ${unscoped.total}`)

  /* ── 8. Das Abzeichen — genau EINMAL, egal WO man zuerst reagiert ────── */
  const annaBadges = await countRows(BADGES, [Query.equal('userId', anna.id)])
  const firstReaction = annaBadges.rows.filter(row => row.badgeKey === 'first-reaction')
  check('Abzeichen „first-reaction" ist verliehen', firstReaction.length >= 1, `${firstReaction.length}`)
  check('… und zwar GENAU EINMAL, obwohl Anna mehrfach reagiert hat',
    firstReaction.length === 1, `${firstReaction.length} Zeilen`)

  /**
   * DIE GEGENPROBE ZUM VERSPRECHEN „EIN Abzeichen, egal wo": Anna reagiert
   * jetzt zusaetzlich auf ein THEMA. Kaeme dabei ein zweites `first-reaction`
   * heraus, waeren es zwei Zaehler und zwei Abzeichen — genau das, was der
   * gemeinsame CORE-Vertrag verhindern soll.
   */
  const category = await tablesDB.listRows({ databaseId, tableId: 'post_categories', queries: [Query.limit(1)] })
  if (category.total > 0) {
    const topic = await seedRow(POSTS, {
      type: 'post', title: `Thema ${stamp}`, body: `thema ${stamp}`,
      authorId: ben.id, authorName: 'Ben', status: 'published',
      scheduledAt: null, publishedAt: new Date().toISOString(),
      pollOptions: null, pollEndsAt: null,
      upvotes: 0, downvotes: 0, score: 0, communityId: '',
      categoryId: category.rows[0].$id,
    })
    const onTopic = await http('/api/posts/discussions/reactions', {
      method: 'POST', cookie: anna.cookie,
      body: { targetType: 'post', targetId: topic.$id, reaction: 'thanks' },
    })
    check('Anna reagiert auch auf ein THEMA (200)', onTopic.status === 200, `status ${onTopic.status}`)

    const badgesAfter = await countRows(BADGES, [Query.equal('userId', anna.id)])
    const firstAfter = badgesAfter.rows.filter(row => row.badgeKey === 'first-reaction')
    check('„first-reaction" bleibt EIN Abzeichen — Thema UND Antwort teilen es',
      firstAfter.length === 1, `${firstAfter.length} Zeilen`)

    const countersMixed = await countRows(COUNTERS, [Query.equal('userId', anna.id)])
    check('reactionsGiven zaehlt BEIDE Welten in denselben Stand (2 Antwort + 1 Thema = 3)',
      countersMixed.rows[0]?.reactionsGiven === 3,
      `reactionsGiven ${countersMixed.rows[0]?.reactionsGiven}`)

    /* ── 9. Die THEMEN-Reaktionen sind unveraendert ───────────────────── */
    const topicRead = await http(`/api/posts/discussions/reactions?targetIds=${topic.$id}`, { cookie: anna.cookie })
    check('Themen-Reaktionen antworten weiter aus IHRER Route',
      topicRead.status === 200 && chip(topicRead.json?.reactions?.[topic.$id], 'thanks')?.count === 1,
      JSON.stringify(topicRead.json))

    const crossA = await countRows(DISCUSSION_REACTIONS, [Query.equal('targetId', reply.$id)])
    check('KEINE Antwort-Reaktion ist in der Themen-Tabelle gelandet',
      crossA.total === 0, `total ${crossA.total}`)
    const crossB = await countRows(REACTIONS, [Query.equal('targetId', topic.$id)])
    check('… und keine Themen-Reaktion in der Antwort-Tabelle',
      crossB.total === 0, `total ${crossB.total}`)
  }
  else {
    console.log('↷ Themen-Gegenprobe uebersprungen (keine post_categories in dieser Instanz)')
  }

  /* ── 10. GEGENPROBE: badge-neutral ───────────────────────────────────── */
  const annaCounters = await countRows(COUNTERS, [Query.equal('userId', anna.id)])
  const row = annaCounters.rows[0]
  check('Zaehler-Zeile existiert', Boolean(row), 'keine Zeile')
  check('UPVOTE-ZAEHLER UNBERUEHRT: upvotesGiven === 0',
    row?.upvotesGiven === 0, `upvotesGiven ${row?.upvotesGiven}`)
  check('UPVOTE-ZAEHLER UNBERUEHRT: upvotesReceived === 0 (auch beim AUTOR der Antwort)',
    row?.upvotesReceived === 0, `upvotesReceived ${row?.upvotesReceived}`)

  const upvoteBadges = ['first-like', 'welcome', 'appreciated', 'thank-you', 'nice-topic', 'nice-reply']
  const wrongly = annaBadges.rows.filter(b => upvoteBadges.includes(b.badgeKey)).map(b => b.badgeKey)
  check('KEIN upvote-basiertes Abzeichen durch Reaktionen entstanden',
    wrongly.length === 0, wrongly.join(','))

  // Und die Gegenprobe zur Gegenprobe: die ANTWORT selbst hat keine Stimme
  // bekommen — eine Reaktion ist kein Upvote, auch nicht auf der Kommentarzeile.
  const replyAfter = await tablesDB.getRow({ databaseId, tableId: COMMENTS, rowId: reply.$id })
  check('die Antwort hat weiterhin 0 Upvotes und Score 0',
    replyAfter.upvotes === 0 && replyAfter.score === 0,
    `upvotes ${replyAfter.upvotes}, score ${replyAfter.score}`)
}
catch (error) {
  failed++
  console.error(`✗ Abbruch: ${error.message}`)
}
finally {
  // Reaktions-Zeilen der Test-Nutzer mit einsammeln (sie entstehen ueber die
  // Route, nicht ueber `seedRow`).
  for (const userId of cleanup.users) {
    for (const tableId of [REACTIONS, DISCUSSION_REACTIONS, COUNTERS, BADGES]) {
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
  console.log(`\n${failed === 0 ? '✔' : '✗'} ${passed} bestanden, ${failed} fehlgeschlagen`)
  process.exit(failed === 0 ? 0 : 1)
}
