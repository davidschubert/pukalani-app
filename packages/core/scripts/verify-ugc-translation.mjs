#!/usr/bin/env node
/**
 * Beweis: KI-Übersetzung für User-Content (Davids Entscheidungen 2026-08-17 —
 * Beiträge + Kommentare · Knopf statt Automatik · Inhalts-Produkt als Gate ·
 * nur Eingeloggte, gedrosselt · EIN Übersetzungs-Cache je Zeile, posts-023 /
 * comments-020).
 *
 * DIE FRAGE, DIE DIESER BEWEIS BEANTWORTET: übersetzt EINER für ALLE — und
 * bleibt der Cache ehrlich? Konkret, über die ECHTEN Routen (Datentür, Gates,
 * Drossel, KI-Anbieter — nichts nachgebaut):
 *   1. Ein eingeloggter Nutzer übersetzt einen englischen Beitrag nach Deutsch
 *      → 200, `cached: false`, Text vorhanden und vom Original verschieden.
 *   2. Der ZWEITE Abruf derselben Sprache kommt aus der SPALTE → `cached: true`
 *      und ZEICHENGLEICH zum ersten — kein zweiter KI-Aufruf (der Beweis liest
 *      die Zeile zusätzlich direkt und sieht die Fassung dort liegen).
 *   3. Dasselbe für einen Kommentar (`content`, ohne Titel).
 *   3b. UMFRAGEN ÜBERSETZEN IHRE OPTIONEN MIT (Davids Entscheidung 2026-08-18):
 *      eine Umfrage mit drei englischen Wahlmöglichkeiten liefert drei
 *      übersetzte zurück — EXAKT so viele wie das Original (der Index trägt die
 *      Stimme, eine verschobene Liste wäre schlimmer als gar keine Übersetzung)
 *      und jede vom Original verschieden. Der zweite Abruf kommt aus der Spalte
 *      und trägt dieselben Optionen.
 *   3c. DIESELBE MECHANIK AUF EVENTS UND KURSEN (Davids Entscheidung
 *      2026-08-18, Migrationen events-013 / courses-007): ein Termin, ein Kurs
 *      und eine Lektion werden übersetzt und beim zweiten Abruf aus der Spalte
 *      geliefert. Die Lektion ist der schärfste der drei Fälle — ihre Route
 *      trägt dieselben fünf Vorprüfungen wie das Lesen (Einschreibung inklusive),
 *      und der Beweis geht deshalb durch die echte Einschreibung.
 *   3d. SCHON IN DER ZIELSPRACHE (Davids Entscheidung 2026-08-21): derselbe
 *      englische Beitrag, nach 'en' „übersetzt" — das Modell antwortet mit dem
 *      Marker statt mit einem bezahlten Echo, die Route cacht die GRUNDFASSUNG,
 *      und der zweite Abruf ist deshalb ein Cache-Treffer (ein verworfener
 *      Same-Fall bezahlte bei jedem Klick aufs Neue dafür, nichts zu tun).
 *      GEGENPROBE: der Marker ist kein Freibrief — dieselbe Zeile trägt daneben
 *      eine echte deutsche Fassung, die vom Original verschieden ist.
 *   4. BEARBEITEN LEERT DEN CACHE: nach `PATCH` mit neuem Text steht die
 *      `translations`-Spalte der Zeile auf '' — die alte Fassung wäre eine
 *      stille Lüge gewesen.
 *   5. GEGENPROBEN: ohne Session 401 (Gäste kosten kein Geld) · unbrauchbare
 *      Sprachcodes 400 · `PATCH` OHNE Textänderung lässt den Cache stehen
 *      (zweimal „Speichern" wirft keine bezahlte Übersetzung weg).
 *
 * VORAUSSETZUNGEN (alle lokal, nichts zeigt auf Produktion):
 *   - Appwrite lokal, Migrationen gelaufen (`pnpm migrate --app comments`).
 *   - comments-Dev-Server aus DIESEM Arbeitsstand, z. B.
 *       pnpm --filter comments exec nuxi dev --port 3021
 *   - `NUXT_AI_KEY` gesetzt (der Beweis bezahlt zwei kleine, echte
 *     KI-Aufrufe — genau das ist der Punkt).
 *
 * Aufruf aus dem Repo-Wurzelverzeichnis:
 *   COMMENTS_PORT=3021 node --env-file=apps/comments/.env \
 *     packages/core/scripts/verify-ugc-translation.mjs
 *
 * Selbst-aufräumend: Nutzer, Beitrag und Kommentar werden am Ende gelöscht
 * (auch im Fehlerfall).
 */
import '../../../scripts/lib/assert-target.mjs'
import { request as httpRequest } from 'node:http'
import { Client, Query, TablesDB, Users } from 'node-appwrite'

const PORT = Number(process.env.COMMENTS_PORT || 3021)
const ORIGIN = `http://localhost:${PORT}`

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('Fehlende Appwrite-Env — mit --env-file=apps/comments/.env aufrufen.')
  process.exit(1)
}
if (!process.env.NUXT_AI_KEY) {
  console.error('NUXT_AI_KEY fehlt — ohne Schlüssel antwortet die Route 503 und der Beweis misst nichts.')
  process.exit(1)
}

const admin = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(admin)
const users = new Users(admin)

/** node:http über ::1 — Nitro hört dort, und fetch verwürfe den Host-Header. */
function call(method, path, { body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body)
    const req = httpRequest({
      host: '::1', port: PORT, method, path,
      headers: {
        'Origin': ORIGIN,
        'Host': `localhost:${PORT}`,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    }, (res) => {
      let data = ''
      res.on('data', chunk => (data += chunk))
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(data) } catch { /* Text bleibt Text */ }
        resolve({ status: res.statusCode, json, text: data, headers: res.headers })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

let passed = 0
let failed = 0
function check(label, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✔ ${label}`) }
  else { failed++; console.error(`  ✘ ${label}${detail ? ` — ${detail}` : ''}`) }
}

const stamp = Date.now().toString(36)
const email = `verify-ugc-${stamp}@pukalani.test`
let userId = null
let postId = null
let pollId = null
let commentId = null
let eventId = null
let courseId = null
let lessonId = null

const POST_TITLE = 'A quiet morning on the mountain'
const POST_BODY = 'We watched the **sunrise** from the summit. Bring warm clothes — the wind up there is `cold` and relentless.'
const COMMENT_BODY = 'Thanks for sharing this! I visited last year and the trail was much harder than expected.'
const POLL_TITLE = 'Which trail should we take next weekend?'
const POLL_BODY = 'Both routes end at the same hut, but they are very different in effort.'
const POLL_OPTIONS = ['The short but steep one', 'The long ridge walk', 'Stay in the valley']
const EVENT_TITLE = 'Sunrise hike for beginners'
const EVENT_DESCRIPTION = 'We start before dawn and walk up slowly. Bring a headlamp and something warm to drink.'
const COURSE_TITLE = 'Reading the weather in the mountains'
const COURSE_DESCRIPTION = 'A short course about clouds, wind and the small signs that tell you to turn around.'
const LESSON_TITLE = 'Clouds that mean trouble'
const LESSON_CONTENT = 'Lenticular clouds sit still while everything else moves. They are a sign of strong wind aloft.'

try {
  console.log(`\nBeweis UGC-Übersetzung gegen ${ORIGIN} (Projekt ${projectId})\n`)

  // ── Konto + Session (echter Signup-Weg) ──────────────────────────────────
  const signup = await call('POST', '/api/auth/signup', {
    body: { email, password: `Vv-${stamp}-2026!x`, name: 'Verify UGC' },
  })
  const setCookies = signup.headers['set-cookie'] ?? []
  const cookie = setCookies.map(c => c.split(';')[0]).join('; ')
  check('Signup liefert Session', signup.status === 200 && cookie.includes('a_session'), `Status ${signup.status}`)
  const me = await call('GET', '/api/auth/me', { cookie })
  userId = me.json?.$id ?? me.json?.user?.$id ?? null
  check('Session trägt (GET /api/auth/me)', Boolean(userId), JSON.stringify(me.json)?.slice(0, 120))

  // ── Beitrag: übersetzen · Cache · Zeile ──────────────────────────────────
  const created = await call('POST', '/api/posts', {
    cookie, body: { type: 'post', title: POST_TITLE, body: POST_BODY },
  })
  postId = created.json?.post?.$id ?? created.json?.$id ?? null
  check('Beitrag angelegt', created.status === 201 && Boolean(postId), `Status ${created.status}: ${created.text?.slice(0, 160)}`)

  const t1 = await call('POST', `/api/posts/${postId}/translate`, { cookie, body: { locale: 'de' } })
  check('1. Übersetzung: 200 + cached:false', t1.status === 200 && t1.json?.cached === false, `Status ${t1.status}: ${t1.text?.slice(0, 200)}`)
  check('1. Übersetzung: Text vorhanden und ≠ Original', Boolean(t1.json?.body) && t1.json.body !== POST_BODY)
  check('1. Übersetzung: Titel übersetzt', Boolean(t1.json?.title) && t1.json.title !== POST_TITLE)

  const t2 = await call('POST', `/api/posts/${postId}/translate`, { cookie, body: { locale: 'de' } })
  check('2. Abruf: cached:true', t2.status === 200 && t2.json?.cached === true, `Status ${t2.status}`)
  check('2. Abruf: zeichengleich (EINER übersetzt für ALLE)', t2.json?.body === t1.json?.body && t2.json?.title === t1.json?.title)

  const rowAfter = await tablesDB.getRow({ databaseId, tableId: 'community_posts', rowId: postId })
  const stored = JSON.parse(rowAfter.translations || '{}')
  check('Fassung liegt in der Zeile (translations.de)', stored?.de?.body === t1.json?.body)

  // ── Schon in der Zielsprache: Marker statt Echo, aber GECACHT ────────────
  /**
   * Derselbe ENGLISCHE Beitrag, diesmal nach 'en'. Das Modell soll nicht
   * übersetzen, sondern `{"same": true}` antworten; die Route legt daraufhin die
   * GRUNDFASSUNG in die Spalte. Beides wird hier gemessen — der Body IST das
   * Original, und der zweite Abruf ist ein Cache-Treffer. Ein verworfener
   * Same-Fall sähe im ersten Aufruf genauso aus und bezahlte trotzdem jeden
   * weiteren Klick.
   */
  const s1 = await call('POST', `/api/posts/${postId}/translate`, { cookie, body: { locale: 'en' } })
  check('Gleiche Sprache: 200 + Antwort-Body IST das Original',
    s1.status === 200 && s1.json?.body === POST_BODY,
    `Status ${s1.status}: ${s1.text?.slice(0, 200)}`)
  const s2 = await call('POST', `/api/posts/${postId}/translate`, { cookie, body: { locale: 'en' } })
  check('Gleiche Sprache: 2. Abruf cached:true (der Same-Fall wurde GECACHT, nicht verworfen)',
    s2.status === 200 && s2.json?.cached === true && s2.json?.body === POST_BODY,
    `Status ${s2.status}: ${s2.text?.slice(0, 200)}`)

  /**
   * GEGENPROBE: der Marker darf kein Freibrief sein. Dieselbe Zeile trägt
   * daneben die deutsche Fassung von oben — wäre der Zweig „gib immer das
   * Original zurück", stünde dort derselbe englische Text.
   */
  const rowBothLocales = await tablesDB.getRow({ databaseId, tableId: 'community_posts', rowId: postId })
  const both = JSON.parse(rowBothLocales.translations || '{}')
  check('Gegenprobe: en = Original, de = echte Übersetzung (beides nebeneinander in der Spalte)',
    both?.en?.body === POST_BODY && Boolean(both?.de?.body) && both.de.body !== POST_BODY,
    `translations=${JSON.stringify(both)?.slice(0, 240)}`)

  // ── Bearbeiten: echter Edit leert, No-op-Edit lässt stehen ───────────────
  const noop = await call('PATCH', `/api/posts/${postId}`, { cookie, body: { title: POST_TITLE, body: POST_BODY } })
  const rowNoop = await tablesDB.getRow({ databaseId, tableId: 'community_posts', rowId: postId })
  check('PATCH ohne Textänderung lässt den Cache stehen', noop.status === 200 && Boolean(rowNoop.translations), `Status ${noop.status}`)

  const edit = await call('PATCH', `/api/posts/${postId}`, { cookie, body: { title: POST_TITLE, body: `${POST_BODY} Edited.` } })
  const rowEdited = await tablesDB.getRow({ databaseId, tableId: 'community_posts', rowId: postId })
  check('PATCH mit Textänderung LEERT den Cache', edit.status === 200 && !rowEdited.translations, `Status ${edit.status}, translations=${JSON.stringify(rowEdited.translations)?.slice(0, 80)}`)

  // ── Kommentar: derselbe Mechanismus ohne Titel ───────────────────────────
  const commented = await call('POST', '/api/comments', {
    cookie, body: { targetId: `verify-ugc-${stamp}`, targetType: 'blog', content: COMMENT_BODY },
  })
  commentId = commented.json?.comment?.$id ?? commented.json?.$id ?? null
  check('Kommentar angelegt', commented.status === 201 && Boolean(commentId), `Status ${commented.status}: ${commented.text?.slice(0, 160)}`)

  const c1 = await call('POST', `/api/comments/${commentId}/translate`, { cookie, body: { locale: 'de' } })
  check('Kommentar 1. Übersetzung: 200 + cached:false + Text ≠ Original', c1.status === 200 && c1.json?.cached === false && Boolean(c1.json?.body) && c1.json.body !== COMMENT_BODY, `Status ${c1.status}: ${c1.text?.slice(0, 200)}`)
  const c2 = await call('POST', `/api/comments/${commentId}/translate`, { cookie, body: { locale: 'de' } })
  check('Kommentar 2. Abruf: cached:true + zeichengleich', c2.status === 200 && c2.json?.cached === true && c2.json?.body === c1.json?.body)

  // ── Umfrage: die Wahlmöglichkeiten reisen mit ────────────────────────────
  const poll = await call('POST', '/api/posts', {
    cookie,
    body: { type: 'poll', title: POLL_TITLE, body: POLL_BODY, pollOptions: POLL_OPTIONS },
  })
  pollId = poll.json?.post?.$id ?? poll.json?.$id ?? null
  check('Umfrage angelegt (3 Optionen)', poll.status === 201 && Boolean(pollId), `Status ${poll.status}: ${poll.text?.slice(0, 160)}`)

  const p1 = await call('POST', `/api/posts/${pollId}/translate`, { cookie, body: { locale: 'de' } })
  const p1Options = p1.json?.options
  check('Umfrage 1. Übersetzung: 200 + cached:false', p1.status === 200 && p1.json?.cached === false, `Status ${p1.status}: ${p1.text?.slice(0, 200)}`)
  // EXAKT drei: der Index trägt die Stimme, eine verschobene Liste ließe
  // jemanden auf „Ja" klicken und für „Nein" stimmen (translatedPollOptions).
  check('Umfrage: EXAKT so viele Optionen wie das Original', Array.isArray(p1Options) && p1Options.length === POLL_OPTIONS.length, `options=${JSON.stringify(p1Options)?.slice(0, 200)}`)
  check('Umfrage: jede Option übersetzt (≠ Original)', Array.isArray(p1Options) && p1Options.every((option, index) => option && option !== POLL_OPTIONS[index]), `options=${JSON.stringify(p1Options)?.slice(0, 200)}`)

  const p2 = await call('POST', `/api/posts/${pollId}/translate`, { cookie, body: { locale: 'de' } })
  check('Umfrage 2. Abruf: cached:true + identische Optionen', p2.status === 200 && p2.json?.cached === true && JSON.stringify(p2.json?.options) === JSON.stringify(p1Options), `Status ${p2.status}: ${JSON.stringify(p2.json?.options)?.slice(0, 200)}`)

  // ── Termin, Kurs, Lektion: dieselbe Mechanik in zwei weiteren Layern ─────
  /**
   * ANLEGEN BRAUCHT EINE ROLLE, ÜBERSETZEN NICHT — und genau deshalb wird sie
   * hier VERLIEHEN und nicht umgangen: Termine und Kurse legt nur an, wer
   * `events.manage`/`courses.manage` trägt (im Silo über das globale Label).
   * Die Zeilen von Hand über den Admin-Client zu schreiben, würde am Schema
   * vorbei ein Testobjekt bauen, das es in der Wirklichkeit nicht gibt — also
   * bekommt der Prüf-Nutzer kurz das Label und legt alles über die ECHTEN
   * Routen an. Die Übersetzungs-Routen selbst verlangen keine Rolle; das prüft
   * dieser Beweis nicht extra, es steht in `verify-site-authz.mjs`.
   */
  await users.updateLabels({ userId, labels: ['admin'] })

  const eventStart = new Date(Date.now() + 7 * 24 * 3600_000).toISOString()
  const createdEvent = await call('POST', '/api/events', {
    cookie,
    body: { title: EVENT_TITLE, description: EVENT_DESCRIPTION, startAt: eventStart, status: 'published' },
  })
  eventId = createdEvent.json?.$id ?? null
  check('Termin angelegt (veröffentlicht)', createdEvent.status === 201 && Boolean(eventId), `Status ${createdEvent.status}: ${createdEvent.text?.slice(0, 160)}`)

  const e1 = await call('POST', `/api/events/${eventId}/translate`, { cookie, body: { locale: 'de' } })
  check('Termin 1. Übersetzung: 200 + cached:false + Titel und Text ≠ Original',
    e1.status === 200 && e1.json?.cached === false
    && Boolean(e1.json?.body) && e1.json.body !== EVENT_DESCRIPTION
    && Boolean(e1.json?.title) && e1.json.title !== EVENT_TITLE,
    `Status ${e1.status}: ${e1.text?.slice(0, 200)}`)
  const e2 = await call('POST', `/api/events/${eventId}/translate`, { cookie, body: { locale: 'de' } })
  check('Termin 2. Abruf: cached:true + zeichengleich',
    e2.status === 200 && e2.json?.cached === true && e2.json?.body === e1.json?.body && e2.json?.title === e1.json?.title,
    `Status ${e2.status}`)

  const courseSlug = `verify-ugc-${stamp}`
  const createdCourse = await call('POST', '/api/courses', {
    cookie,
    body: { title: COURSE_TITLE, slug: courseSlug, description: COURSE_DESCRIPTION, access: 'free', status: 'published' },
  })
  courseId = createdCourse.json?.$id ?? null
  check('Kurs angelegt (veröffentlicht, frei)', createdCourse.status === 201 && Boolean(courseId), `Status ${createdCourse.status}: ${createdCourse.text?.slice(0, 160)}`)

  // Das [slug]-Segment der BUILDER-Routen ist die Row-Id (die Lese-Routen
  // nehmen den Slug) — hier also bewusst die Id.
  const createdLesson = await call('POST', `/api/courses/${courseId}/lessons`, {
    cookie,
    body: { title: LESSON_TITLE, content: LESSON_CONTENT, status: 'published' },
  })
  lessonId = createdLesson.json?.$id ?? null
  check('Lektion angelegt (veröffentlicht)', createdLesson.status === 201 && Boolean(lessonId), `Status ${createdLesson.status}: ${createdLesson.text?.slice(0, 160)}`)

  const k1 = await call('POST', `/api/courses/${courseSlug}/translate`, { cookie, body: { locale: 'de' } })
  check('Kurs 1. Übersetzung: 200 + cached:false + Titel und Text ≠ Original',
    k1.status === 200 && k1.json?.cached === false
    && Boolean(k1.json?.body) && k1.json.body !== COURSE_DESCRIPTION
    && Boolean(k1.json?.title) && k1.json.title !== COURSE_TITLE,
    `Status ${k1.status}: ${k1.text?.slice(0, 200)}`)
  const k2 = await call('POST', `/api/courses/${courseSlug}/translate`, { cookie, body: { locale: 'de' } })
  check('Kurs 2. Abruf: cached:true + zeichengleich', k2.status === 200 && k2.json?.cached === true && k2.json?.body === k1.json?.body, `Status ${k2.status}`)

  /**
   * DIE LEKTION LIEGT HINTER DER EINSCHREIBUNG — erst die Gegenprobe, dann der
   * Beweis. Ohne Einschreibung muss die Übersetzungs-Route 403 antworten, wie
   * die Leseroute: sonst wäre sie die Hintertür in den bezahlten Inhalt (der
   * Text steht in der ANTWORT).
   */
  const lockedLesson = await call('POST', `/api/lessons/${lessonId}/translate`, { cookie, body: { locale: 'de' } })
  check('Lektion ohne Einschreibung: 403 (kein Weg am Tor vorbei)', lockedLesson.status === 403, `Status ${lockedLesson.status}: ${lockedLesson.text?.slice(0, 160)}`)

  const enrolled = await call('POST', `/api/courses/${courseSlug}/enroll`, { cookie })
  check('Eingeschrieben', enrolled.status === 200 || enrolled.status === 201, `Status ${enrolled.status}: ${enrolled.text?.slice(0, 160)}`)

  const l1 = await call('POST', `/api/lessons/${lessonId}/translate`, { cookie, body: { locale: 'de' } })
  check('Lektion 1. Übersetzung: 200 + cached:false + Titel und Text ≠ Original',
    l1.status === 200 && l1.json?.cached === false
    && Boolean(l1.json?.body) && l1.json.body !== LESSON_CONTENT
    && Boolean(l1.json?.title) && l1.json.title !== LESSON_TITLE,
    `Status ${l1.status}: ${l1.text?.slice(0, 200)}`)
  const l2 = await call('POST', `/api/lessons/${lessonId}/translate`, { cookie, body: { locale: 'de' } })
  check('Lektion 2. Abruf: cached:true + zeichengleich', l2.status === 200 && l2.json?.cached === true && l2.json?.body === l1.json?.body, `Status ${l2.status}`)

  // ── Gegenproben ──────────────────────────────────────────────────────────
  const guest = await call('POST', `/api/posts/${postId}/translate`, { body: { locale: 'de' } })
  check('Ohne Session: 401 (kein Gast kostet Geld)', guest.status === 401, `Status ${guest.status}`)
  const badLocale = await call('POST', `/api/posts/${postId}/translate`, { cookie, body: { locale: 'not a locale!' } })
  check('Unbrauchbarer Sprachcode: 400', badLocale.status === 400, `Status ${badLocale.status}`)
}
catch (error) {
  failed++
  console.error('\nAbbruch:', error)
}
finally {
  // Aufräumen — auch im Fehlerfall; ein halber Beweis darf keine Reste lassen.
  if (postId) await tablesDB.deleteRow({ databaseId, tableId: 'community_posts', rowId: postId }).catch(() => {})
  if (pollId) await tablesDB.deleteRow({ databaseId, tableId: 'community_posts', rowId: pollId }).catch(() => {})
  if (commentId) await tablesDB.deleteRow({ databaseId, tableId: 'comments', rowId: commentId }).catch(() => {})
  if (lessonId) await tablesDB.deleteRow({ databaseId, tableId: 'lessons', rowId: lessonId }).catch(() => {})
  if (courseId) await tablesDB.deleteRow({ databaseId, tableId: 'courses', rowId: courseId }).catch(() => {})
  if (eventId) await tablesDB.deleteRow({ databaseId, tableId: 'events', rowId: eventId }).catch(() => {})
  // Die Einschreibung hängt am Nutzer, nicht am Kurs — sie muss eigens weg,
  // sonst bleibt eine Zeile ohne Konto zurück.
  if (userId) {
    await tablesDB.listRows({ databaseId, tableId: 'enrollments', queries: [Query.equal('userId', userId), Query.limit(25)] })
      .then(({ rows }) => Promise.all(rows.map(row =>
        tablesDB.deleteRow({ databaseId, tableId: 'enrollments', rowId: row.$id }).catch(() => {}))))
      .catch(() => {})
  }
  if (userId) await users.delete({ userId }).catch(() => {})
}

console.log(`\n${passed} grün · ${failed} rot`)
process.exit(failed === 0 ? 0 : 1)
