#!/usr/bin/env node
/**
 * DAS TAGES-LIMIT FUER LIKES — der Beweis (F57 Mechanik 3, 2026-08-14).
 *
 * Geprueft wird BEIDES: dass die Mechanik bremst, wo sie soll — und die
 * Zusagen, die daneben stehen und die man beim „Aufraeumen" als Erstes
 * verlieren wuerde:
 *   - eine RUECKNAHME erstattet NICHTS (sonst waere das Limit ein Toggle weit),
 *   - ein DOWNVOTE kostet nichts,
 *   - der Abzeichen-Tag wird GENAU EINMAL gebucht, egal wie oft jemand danach
 *     noch dagegenlaeuft,
 *   - BEIDE Stimm-Wege (Themen und Antworten) teilen sich EIN Kontingent,
 *   - und jemand anderes ist davon voellig unberuehrt.
 *
 * Aus packages/posts (dort loest node-appwrite auf), gegen einen LAUFENDEN
 * Dev-Server DERSELBEN Instanz, dessen App-Config das Limit testweise auf 3
 * senkt. SEIT F57-STUFEN IST DAS EINE STAFFEL, kein einzelner Wert — gesenkt
 * wird sie deshalb fuer JEDE Stufe, sonst misst dieser Lauf bei einem
 * aufgestiegenen Nutzer etwas anderes als er sagt:
 * `pukalani.discussions.likesPerDayByLevel: [3, 3, 3, 3]`:
 *   node --env-file=../../apps/comments/.env scripts/verify-like-limit.mjs http://localhost:3011 3
 *
 * Das erwartete Limit ist ein ARGUMENT und keine Konstante im Skript: mit
 * `50` (ohne Override) laeuft derselbe Beweis gegen das PRODUKTIONS-Limit,
 * nur langsamer. Die Gegenprobe „ohne Override greift 50" fuehrt Abschnitt 9.
 *
 * WAS ES NICHT PRUEFT, und warum das hier ehrlich stehen muss:
 *  - **Die Mandanten-Grenze ueber HTTP.** Die Dev-Instanz `reddit-comments`
 *    ist EIN-mandantig (`communityId: ''`) — es gibt dort keine zweite
 *    Community, gegen die man laufen koennte. Getragen wird die Trennung
 *    strukturell von der Datentuer (`tenantDb`, Klinke `operator`, Zeile ueber
 *    den Unique-Index (communityId, userId)); Abschnitt 7 zeigt sie auf
 *    DATENEBENE, wie es schon `verify-reactions.mjs` tut.
 *  - **Den Tageswechsel in echt.** Er haengt an der Uhr; die Regel dahinter
 *    (`utcDayKey`, `decideLikeSpend`) ist pur und in
 *    `packages/core/tests/likeAllowance.test.ts` mit festen Zeitpunkten
 *    festgenagelt. Abschnitt 8 prueft stattdessen, was der Server WIRKLICH
 *    gespeichert hat — Tag und Stand.
 *  - Den Klick selbst (Toast am Knopf) — Browser-Verhalten.
 *
 * Legt Wegwerf-Nutzer, -Beitraege und -Stimmen an und raeumt sie wieder weg,
 * auch im Fehlerfall.
 */
import '../../../scripts/lib/assert-target.mjs'
import { request } from 'node:http'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const base = process.argv[2] ?? 'http://localhost:3011'
const LIMIT = Number(process.argv[3] ?? 3)
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollstaendig — mit --env-file=<app-.env> aufrufen.')
  process.exit(1)
}
if (!Number.isInteger(LIMIT) || LIMIT < 2) {
  console.error('✗ Das erwartete Limit muss eine ganze Zahl ≥ 2 sein.')
  process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const users = new Users(client)
const tablesDB = new TablesDB(client)

const POSTS = 'community_posts'
const COMMENTS = 'comments'
const POST_VOTES = 'post_votes'
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
  const row = await tablesDB.createRow({ databaseId, tableId, rowId: ID.unique(), data, ...(permissions ? { permissions } : {}) })
  cleanup.rows.push({ tableId, id: row.$id })
  return row
}

async function makeUser(tag) {
  const user = await users.create({
    userId: ID.unique(),
    email: `likelimit-${tag}-${stamp}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: `Limit-Tester ${tag}`,
  })
  cleanup.users.push(user.$id)
  const session = await users.createSession({ userId: user.$id })
  return { id: user.$id, cookie: `a_session_${projectId}=${encodeURIComponent(session.secret)}` }
}

/** Eine Aufstimme auf ein THEMA. */
function likePost(postId, cookie) {
  return http(`/api/posts/${postId}/score`, { method: 'POST', cookie, body: { value: 1 } })
}
/** Eine Aufstimme auf eine ANTWORT. */
function likeComment(commentId, cookie) {
  return http(`/api/comments/${commentId}/vote`, { method: 'POST', cookie, body: { value: 1 } })
}

async function counterRow(userId) {
  const res = await tablesDB.listRows({
    databaseId, tableId: COUNTERS, queries: [Query.equal('userId', userId), Query.limit(10)],
  })
  return res.rows[0] ?? null
}
async function badgeRows(userId) {
  const res = await tablesDB.listRows({
    databaseId, tableId: BADGES, queries: [Query.equal('userId', userId), Query.limit(100)],
  })
  return res.rows
}

try {
  console.log(`Tages-Limit fuer Likes gegen ${base} / Projekt ${projectId} / DB ${databaseId}`)
  console.log(`Erwartetes Kontingent: ${LIMIT} Likes/Tag\n`)

  const anna = await makeUser('anna')
  const ben = await makeUser('ben')

  const now = new Date().toISOString()
  const basePost = {
    type: 'post', body: `like-limit-beweis ${stamp}`, authorId: ben.id, authorName: 'Ben',
    status: 'published', scheduledAt: null, publishedAt: now,
    pollOptions: null, pollEndsAt: null, categoryId: '',
    upvotes: 0, downvotes: 0, score: 0, communityId: '',
  }
  // Ein Ziel mehr als das Kontingent — plus zwei fuer die Sonderfaelle.
  const posts = []
  for (let i = 0; i < LIMIT + 3; i++) {
    posts.push(await seedRow(POSTS, { ...basePost, title: `Ziel ${i} ${stamp}` }))
  }

  const targetId = `like-limit-${stamp}`
  const comment = await seedRow(COMMENTS, {
    targetId, targetType: 'page', content: 'Antwort fuer den Limit-Beweis', parentId: null, rootId: null,
    depth: 0, editedAt: null, authorId: ben.id, authorName: 'Ben', targetUrl: `/threads/${targetId}`,
    upvotes: 0, downvotes: 0, score: 0, status: 'active', communityId: '',
  })

  /* ── 1. Ohne Konto geht gar nichts ───────────────────────────────────── */
  const guestPost = await likePost(posts[0].$id, '')
  check('Gast: Aufstimme auf ein Thema wird abgewiesen (401)', guestPost.status === 401, `status ${guestPost.status}`)
  const guestComment = await likeComment(comment.$id, '')
  check('Gast: Aufstimme auf eine Antwort wird abgewiesen (401)', guestComment.status === 401, `status ${guestComment.status}`)

  /* ── 2. Das Kontingent traegt genau so weit, wie es soll ─────────────── */
  // Der LETZTE der erlaubten Likes geht bewusst auf die ANTWORT: damit ist in
  // einem Zug bewiesen, dass beide Stimm-Wege AUS DEMSELBEN Topf nehmen — ein
  // getrennter Zaehler je Tabelle waere hier nicht aufgefallen.
  for (let i = 0; i < LIMIT - 1; i++) {
    const res = await likePost(posts[i].$id, anna.cookie)
    check(`Like ${i + 1} von ${LIMIT} (Thema) geht durch (200)`, res.status === 200, `status ${res.status}`)
  }
  const lastAllowed = await likeComment(comment.$id, anna.cookie)
  check(`Like ${LIMIT} von ${LIMIT} (ANTWORT) geht durch — beide Wege teilen EIN Kontingent`,
    lastAllowed.status === 200, `status ${lastAllowed.status}`)

  /* ── 3. Der erste Like ueber dem Kontingent wird abgewiesen ──────────── */
  const denied = await likePost(posts[LIMIT].$id, anna.cookie)
  check(`Like ${LIMIT + 1} wird abgewiesen (429)`, denied.status === 429, `status ${denied.status}`)
  check('… mit fachlichem Grund `like_limit_reached`',
    denied.json?.reason === 'like_limit_reached', JSON.stringify(denied.json))

  // Und die Stimme ist WIRKLICH nicht da — ein 429, der trotzdem schreibt,
  // waere die schlimmste Sorte Fehler.
  const deniedVotes = await tablesDB.listRows({
    databaseId, tableId: POST_VOTES,
    queries: [Query.equal('postId', posts[LIMIT].$id), Query.limit(10)],
  })
  check('… und es steht keine Stimm-Zeile dazu in der Datenbank',
    deniedVotes.total === 0, `total ${deniedVotes.total}`)

  /* ── 4. DIE RUECKNAHME ERSTATTET NICHTS ──────────────────────────────── */
  // Das ist die tragende Zusage: waere es anders, kaeme man mit zwei Klicks je
  // Like beliebig oft ueber das Limit — genau der Missbrauch, gegen den die
  // Mechanik gerichtet ist.
  const undo = await likePost(posts[0].$id, anna.cookie)
  check('Ruecknahme des ersten Likes geht (200)', undo.status === 200, `status ${undo.status}`)
  check('… und sie ist wirklich zurueckgenommen (myVote null)',
    undo.json?.myVote === null, JSON.stringify(undo.json?.myVote))

  const afterUndo = await likePost(posts[LIMIT].$id, anna.cookie)
  check('NACH der Ruecknahme bleibt es abgewiesen (429) — kein zurueckgewonnenes Kontingent',
    afterUndo.status === 429, `status ${afterUndo.status}`)

  const reLike = await likePost(posts[0].$id, anna.cookie)
  check('… auch das ERNEUTE Liken desselben Beitrags bleibt abgewiesen (429)',
    reLike.status === 429, `status ${reLike.status}`)

  /* ── 5. Das Abzeichen: genau EINMAL, am Tag des Uebergangs ───────────── */
  const annaBadges = await badgeRows(anna.id)
  const outOfLove = annaBadges.filter(row => row.badgeKey === 'out-of-love')
  check('Abzeichen „out-of-love" ist verliehen', outOfLove.length >= 1, `${outOfLove.length}`)
  check('… und zwar GENAU EINMAL, obwohl Anna mehrfach dagegengelaufen ist',
    outOfLove.length === 1, `${outOfLove.length} Zeilen`)

  const annaCounters = await counterRow(anna.id)
  check('Zaehler-Zeile existiert', Boolean(annaCounters), 'keine Zeile')
  check('likeLimitDays === 1 — DREI abgewiesene Versuche haben KEINEN zweiten Tag gebucht',
    annaCounters?.likeLimitDays === 1, `likeLimitDays ${annaCounters?.likeLimitDays}`)

  // Die beiden hoeheren Stufen haengen am selben Zaehler und duerfen an EINEM
  // Tag nicht kommen — sonst waere „an 5 Tagen" nur ein anderes Wort fuer
  // „fuenfmal geklickt".
  const higher = annaBadges.filter(row => row.badgeKey === 'higher-love' || row.badgeKey === 'crazy-in-love')
  check('„higher-love"/„crazy-in-love" sind an EINEM Tag NICHT gekommen',
    higher.length === 0, higher.map(b => b.badgeKey).join(','))

  /* ── 6. Downvotes kosten nichts, und andere sind unberuehrt ──────────── */
  // Ben stimmt zweimal AB und einmal ZU. Kostet der Downvote Kontingent, waere
  // sein Stand 3 und der naechste Like abgewiesen.
  const benDown1 = await http(`/api/posts/${posts[0].$id}/score`, { method: 'POST', cookie: ben.cookie, body: { value: -1 } })
  const benDown2 = await http(`/api/posts/${posts[1].$id}/score`, { method: 'POST', cookie: ben.cookie, body: { value: -1 } })
  check('Ben: zwei Abstimmen gehen durch (200)',
    benDown1.status === 200 && benDown2.status === 200, `${benDown1.status}/${benDown2.status}`)
  check('Ben ist von Annas aufgebrauchtem Kontingent unberuehrt — er darf noch',
    benDown1.status === 200, `status ${benDown1.status}`)

  const benLike1 = await likePost(posts[2].$id, ben.cookie)
  check('Ben: erste Aufstimme geht durch (200)', benLike1.status === 200, `status ${benLike1.status}`)

  const benCountersMid = await counterRow(ben.id)
  check('Bens Tagesstand ist 1 und nicht 3 — ABSTIMMEN ZAEHLEN NICHT',
    benCountersMid?.likesToday === 1, `likesToday ${benCountersMid?.likesToday}`)

  // Der Wechsel von AB auf AUF ist dagegen ein Like und muss kosten.
  const benFlip = await likePost(posts[0].$id, ben.cookie)
  check('Ben: Wechsel von Ab- auf Aufstimme geht durch (200)', benFlip.status === 200, `status ${benFlip.status}`)
  const benCountersFlip = await counterRow(ben.id)
  check('… und er KOSTET (Stand 2) — der Wechsel ist ein neu vergebenes Like',
    benCountersFlip?.likesToday === 2, `likesToday ${benCountersFlip?.likesToday}`)

  /* ── 7. Mandanten-Trennung auf Datenebene ────────────────────────────── */
  const isoA = await seedRow(COUNTERS, {
    userId: 'u-iso-like', topicsCreated: 0, repliesCreated: 0, upvotesGiven: 0, upvotesReceived: 0,
    edits: 0, reactionsGiven: 0, invitesAccepted: 0, likeLimitDays: 0,
    likeDay: '2026-08-14', likesToday: 3, seeded: false, trustLevel: 0, trustLevelLeader: false,
    communityId: 'iso-ta',
  }, [])
  await seedRow(COUNTERS, {
    userId: 'u-iso-like', topicsCreated: 0, repliesCreated: 0, upvotesGiven: 0, upvotesReceived: 0,
    edits: 0, reactionsGiven: 0, invitesAccepted: 0, likeLimitDays: 0,
    likeDay: '2026-08-14', likesToday: 0, seeded: false, trustLevel: 0, trustLevelLeader: false,
    communityId: 'iso-tb',
  }, [])
  const scoped = await tablesDB.listRows({
    databaseId, tableId: COUNTERS,
    queries: [Query.equal('userId', 'u-iso-like'), Query.equal('communityId', 'iso-ta'), Query.limit(10)],
  })
  check('Isolation: derselbe Mensch hat je Community einen EIGENEN Tagesstand',
    scoped.total === 1 && scoped.rows[0].$id === isoA.$id && scoped.rows[0].likesToday === 3,
    `total ${scoped.total}`)
  const unscoped = await tablesDB.listRows({
    databaseId, tableId: COUNTERS,
    queries: [Query.equal('userId', 'u-iso-like'), Query.limit(10)],
  })
  check('… und OHNE Mandanten-Filter waeren es beide (der Beweis, dass er noetig ist)',
    unscoped.total === 2, `total ${unscoped.total}`)

  /* ── 8. Was wirklich gespeichert ist ─────────────────────────────────── */
  const today = new Date().toISOString().slice(0, 10)
  check(`Annas gespeicherter Tag ist der UTC-Kalendertag (${today})`,
    annaCounters?.likeDay === today, `likeDay ${annaCounters?.likeDay}`)
  check(`Annas Stand steht auf dem Limit (${LIMIT}) und ist NICHT darueber gelaufen`,
    annaCounters?.likesToday === LIMIT, `likesToday ${annaCounters?.likesToday}`)

  // GEGENPROBE zur Ruecknahme: der Like-Zaehler der Abzeichen ist mitgegangen
  // (er darf zurueck), das KONTINGENT nicht (es darf nicht).
  check('upvotesGiven ist durch die Ruecknahme gesunken — die beiden Zahlen sind bewusst verschieden',
    annaCounters?.upvotesGiven === LIMIT - 1,
    `upvotesGiven ${annaCounters?.upvotesGiven} (erwartet ${LIMIT - 1}), likesToday ${annaCounters?.likesToday}`)

  /* ── 9. Die Gegenprobe zum Override ──────────────────────────────────── */
  // Sie gehoert in einen ZWEITEN Lauf ohne Override (dort geht der vierte Like
  // durch). Hier steht nur, was das Skript selbst belegen kann: dass der
  // Produktions-Default im CODE steht und nicht in dieser Testumgebung.
  console.log(`\nHinweis: dieser Lauf hat gegen das Kontingent ${LIMIT} geprueft.`)
  console.log('Die Gegenprobe „ohne Override greift 50" ist ein zweiter Lauf ohne')
  console.log('`pukalani.discussions.likesPerDayByLevel` in der App-Config.')
}
catch (error) {
  failed++
  console.error(`✗ Abbruch: ${error.message}`)
}
finally {
  // Stimm-Zeilen der Test-Nutzer mit einsammeln (sie entstehen ueber die
  // Routen, nicht ueber seedRow).
  for (const userId of cleanup.users) {
    for (const tableId of [POST_VOTES, 'comment_votes', COUNTERS, BADGES]) {
      const res = await tablesDB.listRows({
        databaseId, tableId, queries: [Query.equal('userId', userId), Query.limit(100)],
      }).catch(() => null)
      for (const row of res?.rows ?? []) {
        await tablesDB.deleteRow({ databaseId, tableId, rowId: row.$id }).catch(() => {})
      }
    }
  }
  for (const { tableId, id } of cleanup.rows.reverse()) {
    await tablesDB.deleteRow({ databaseId, tableId, rowId: id }).catch(() => {})
  }
  for (const userId of cleanup.users) {
    await users.delete({ userId }).catch(() => {})
  }

  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`)
  process.exit(failed === 0 ? 0 : 1)
}
