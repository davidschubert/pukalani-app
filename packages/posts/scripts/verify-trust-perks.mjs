#!/usr/bin/env node
/**
 * WAS EINE VERTRAUENSSTUFE EINBRINGT — der Beweis (F57-Stufen, 2026-08-14).
 *
 * Zwei Zusagen, ein Lauf, weil beide dieselbe teure Bühne brauchen (Platform +
 * Control Plane + eine echte Community):
 *
 *  A. **Die Like-Staffel.** Das Tages-Limit hängt an der Stufe: TL0/TL1 = 50,
 *     TL2 = 75, TL3+ = 100. Gemessen wird mit den ECHTEN Zahlen, ohne
 *     Config-Override — der 51. Like eines Neulings wird abgewiesen, der 76.
 *     eines Members ebenso, und dazwischen liegen 25 Likes, die es vorher
 *     nicht gab.
 *  B. **Campaigner/Champion.** „3 Eingeladene wurden Basic" / „5 wurden
 *     Member" (Katalog § 3.6) — vom Stempel bei der Annahme über den Aufstieg
 *     des Eingeladenen bis zum Abzeichen beim Einladenden.
 *
 * ── WARUM DER AUFSTIEG HIER ECHT PASSIERT UND NICHT NACHGESTELLT IST ──────
 * Die Stufe 1 verlangt zwei Tage Zugehörigkeit, und die Zugehörigkeit ist
 * `$createdAt` der `community_members`-Zeile im Control Plane. Ein Beweis, der
 * heute läuft, käme damit nie an einen Aufstieg heran — also wird die Zeile
 * mit einem ZURÜCKDATIERTEN `$createdAt` neu angelegt (Appwrite nimmt es beim
 * Anlegen entgegen, beim Ändern nicht). Alles danach ist der echte Pfad: eine
 * echte Zähl-Buchung, der echte Aufstieg, die echte Gutschrift.
 *
 * ── WAS ER NICHT PRÜFT, und das gehört ehrlich hierher ────────────────────
 *  - **Den Tageswechsel.** Er hängt an der Uhr; dass ein NEUER Tag wieder
 *    gebucht wird, nagelt `packages/core/tests/likeAllowance.test.ts` mit
 *    festen Zeitpunkten fest. Hier wird die andere Hälfte gezeigt, die man nur
 *    live widerlegen kann: derselbe Tag wird auch nach einem Aufstieg NICHT
 *    zweimal gebucht.
 *    Damit die Abschnitte 7 und 8 nicht selbst über Mitternacht UTC laufen,
 *    wartet das Skript davor, wenn der Tag in weniger als zweieinhalb Minuten
 *    endet (`waitOutUtcMidnight`).
 *  - **Die Ernennung (Stufe 4).** Sie meldet dem Einladenden bewusst nichts;
 *    die Regel dazu ist pur und getestet (`inviteeLevelCrossings`).
 *  - Den Klick selbst (Toast am Knopf) — Browser-Verhalten.
 *
 * Räumt am Ende alles weg, was es angelegt hat.
 *
 *   POOL_KEY=… PLATFORM_PORT=3016 node --env-file=apps/control/.env \
 *     packages/posts/scripts/verify-trust-perks.mjs
 */
import '../../../scripts/lib/assert-target.mjs'
import { request } from 'node:http'
import { Client, ID, Permission, Query, Role, TablesDB } from 'node-appwrite'
import {
  appwriteRest,
  createCleanup,
  createProbeAccount,
  createProbeCommunity,
  login,
  runStamp,
} from '../../../scripts/lib/probe-stage.mjs'

const PORT = Number(process.env.PLATFORM_PORT || 3016)
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'account'
const poolKey = process.env.POOL_KEY

if (!endpoint || !controlProject || !databaseId || !controlKey || !poolKey) {
  console.error('✗ Env unvollständig (POOL_KEY nötig).')
  process.exit(1)
}

/** Davids Staffel (2026-08-14) — dieselben Zahlen wie in der App-Config. */
const LIMIT_TL0 = Number(process.env.LIMIT_TL0 || 50)
const LIMIT_TL2 = Number(process.env.LIMIT_TL2 || 75)

const control = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const pool = new TablesDB(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
// Die Datenbank des Pools — lokal heißen beide `main`, auf der Bühne sagt es der Läufer.
const poolDatabaseId = process.env.POOL_DATABASE_ID || databaseId
const script = 'verify-trust-perks'
const controlRest = appwriteRest({ endpoint, projectId: controlProject, key: controlKey, script })
const poolRest = appwriteRest({ endpoint, projectId: poolProject, key: poolKey, script })
const cleanup = createCleanup({ pool: poolRest, control: controlRest, poolDatabaseId, controlDatabaseId: databaseId })
const runId = runStamp()

const MEMBERS = 'community_members'
const COUNTERS = 'member_counters'
const BADGES = 'user_badges'
const POSTS = 'community_posts'

let pass = 0
let fail = 0

function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

/** node:http, weil fetch den Host-Header verwirft; ::1, weil Nitro dort hört. */
function call(host, path, { method = 'GET', body, cookie, clientIp } = {}) {
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
        ...(clientIp ? { 'x-forwarded-for': clientIp } : {}),
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

/** Jeder Einladungs-Versuch mit eigener IP — sonst misst man die Drossel. */
let ipCounter = 0
function freshIp() {
  ipCounter++
  return `198.51.100.${1 + (ipCounter % 250)}`
}

function reasonOf(res) {
  return res.json?.reason ?? res.json?.data?.reason ?? null
}

/** Probe-Konto. Die Annahme verlangt eine BESTÄTIGTE Adresse (accept.post.ts). */
async function createPoolUser(tag) {
  const account = await createProbeAccount(poolRest, { tag: `f57s-${tag}`, stamp: runId, name: `F57 ${tag}` })
  cleanup.track('account', account.userId)
  return { ...account, tag }
}

/** Der Login gibt seine Cookies über die Header zurück — hier vollständig. */
function loginWithCookies(account) {
  return login(call, CONTROL_HOST, account)
}


/**
 * Stempel → Lese-Label: im Pool trägt die Spalte `communityId` die tenantId
 * (`t-…`), das Label am Konto aber die Kennung der Community-Zeile im
 * Control Plane (`TenantContext.communityId`, tenantsResolver.ts).
 */
const labelOfTenant = new Map()

async function createCommunity(cookie, slug, name) {
  // Anlage über die echte Route `POST /api/onboarding/site` — Rumpf, Code und
  // Aufräumen kommen aus der gemeinsamen Hilfe (scripts/lib/probe-stage.mjs).
  const created = await createProbeCommunity({
    call, controlHost: CONTROL_HOST, cookie, control: controlRest, databaseId, slug, name, cleanup,
    bodyOverrides: { description: 'Beweis für die Stufen-Vorteile.', vibe: 'elegant' },
  })
  // ZWEI IDs: die Runtime-Tabellen tragen `communities.tenantId` (`t-…`), nicht
  // die `$id` — mit der falschen Id sucht man in einer leeren Menge.
  const row = await control.getRow({ databaseId, tableId: 'communities', rowId: created.communityId })
  cleanup.track('tenant', row.tenantId)
  labelOfTenant.set(row.tenantId, created.communityId)
  return { communityId: created.communityId, tenantId: row.tenantId, host: created.host }
}

/**
 * Warten, bis die frische Mitgliedschaft durch den 30-s-Rollen-Cache ist.
 * Jede Nachfrage mit eigener IP: die Route ist auf 10 je Minute und Adresse
 * gedrosselt (`community:invite-quota`) — mit einer festen Adresse antwortete
 * sie nach zehn Nachfragen 429, und das Warten hätte die Drossel gemessen.
 */
async function waitForMembership(host, cookie) {
  for (let i = 0; i < 45; i++) {
    const res = await call(host, '/api/community/invites/quota', { cookie, clientIp: freshIp() })
    if (res.status === 200) return true
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

function counterRow(tenantId, userId) {
  return pool.listRows({
    databaseId: poolDatabaseId, tableId: COUNTERS,
    queries: [Query.equal('communityId', tenantId), Query.equal('userId', userId), Query.limit(1)],
  }).then(res => res.rows[0] ?? null)
}

function badgeCount(tenantId, userId, badgeKey) {
  return pool.listRows({
    databaseId: poolDatabaseId, tableId: BADGES,
    queries: [Query.equal('communityId', tenantId), Query.equal('userId', userId), Query.equal('badgeKey', badgeKey), Query.limit(10)],
  }).then(res => res.total)
}

/**
 * Die Mitgliedschaft ZURÜCKDATIEREN — neu anlegen statt ändern.
 *
 * `$createdAt` nimmt Appwrite beim ANLEGEN entgegen, beim Ändern nicht. Und
 * genau dieses Feld ist die Zugehörigkeit (`communityJoinDatesResolver` liest
 * es); ohne diesen Griff käme kein Beweis, der heute läuft, je an einen
 * Aufstieg heran.
 */
async function backdateMembership(communityId, runtimeUserId, days) {
  const { rows } = await control.listRows({
    databaseId, tableId: MEMBERS,
    queries: [Query.equal('communityId', communityId), Query.equal('runtimeUserId', runtimeUserId), Query.limit(1)],
  })
  const existing = rows[0]
  const data = existing
    ? {
        communityId, runtimeProjectId: existing.runtimeProjectId, runtimeUserId,
        role: existing.role, status: existing.status, email: existing.email ?? '', removedAt: null,
      }
    : {
        communityId, runtimeProjectId: poolProject, runtimeUserId,
        role: 'viewer', status: 'active', email: '', removedAt: null,
      }
  if (existing) await control.deleteRow({ databaseId, tableId: MEMBERS, rowId: existing.$id })
  await control.createRow({
    databaseId, tableId: MEMBERS, rowId: ID.unique(),
    data: { ...data, $createdAt: new Date(Date.now() - days * 86_400_000).toISOString() },
  })
}

/** Die Zähler eines Menschen auf einen Stand setzen, der eine Stufe trägt. */
async function seedCounters(tenantId, userId, values) {
  const row = await counterRow(tenantId, userId)
  if (row) {
    await pool.updateRow({ databaseId: poolDatabaseId, tableId: COUNTERS, rowId: row.$id, data: values })
    return row.$id
  }
  const created = await pool.createRow({
    databaseId: poolDatabaseId, tableId: COUNTERS, rowId: ID.unique(),
    data: { communityId: tenantId, userId, seeded: true, ...values },
    permissions: [],
  })
  return created.$id
}

/**
 * DIE ABSCHNITTE 7 UND 8 BRAUCHEN EINEN GANZEN UTC-TAG AM STÜCK.
 *
 * Das Tages-Kontingent zählt je Kalendertag in UTC (`utcDayKey`,
 * `core/shared/likeAllowance.ts`). Wechselt der Tag, während Anna ihre
 * Aufstimmen vergibt, beginnt ihr Zähler neu und der Abzeichen-Tag wird ein
 * zweites Mal gebucht — beides ist richtig, macht die Prüfungen „genau
 * einmal" und „am selben Tag" aber rot. So endete ein von Hand gestarteter
 * Nacht-Lauf am 2026-11-18 um 00:00 UTC mit 55 von 56.
 *
 * Die Uhr des Servers lässt sich von hier nicht stellen. Deshalb das
 * FENSTER: endet der Tag in weniger als `DAY_WINDOW_MS`, wartet das Skript
 * bis kurz nach Mitternacht und beginnt die Abschnitte im neuen Tag. Die
 * beiden Abschnitte brauchen zusammen deutlich weniger als das Fenster
 * (der ganze Lauf dauert rund zwei Minuten). Danach hält eine eigene
 * Prüfung fest, DASS sie in einem Tag lagen — wird sie je rot, steht die
 * Ursache da und nicht eine verrutschte Zahl.
 */
const DAY_WINDOW_MS = 150_000
const utcDay = (at = Date.now()) => new Date(at).toISOString().slice(0, 10)

async function waitOutUtcMidnight() {
  const now = new Date()
  const nextMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  const left = nextMidnight - now.getTime()
  if (left > DAY_WINDOW_MS) return
  console.log(`   … der UTC-Tag endet in ${Math.ceil(left / 1000)} s — warte bis nach Mitternacht, damit die Tages-Prüfungen in EINEM Tag liegen`)
  await new Promise(resolve => setTimeout(resolve, left + 3000))
}

let postCounter = 0
async function seedPost(tenantId, authorId, authorName) {
  postCounter++
  const now = new Date().toISOString()
  return pool.createRow({
    databaseId: poolDatabaseId, tableId: POSTS, rowId: ID.unique(),
    data: {
      type: 'post', title: `Stufen-Beweis Ziel ${postCounter}`, body: 'Ziel für den Stufen-Beweis.',
      authorId, authorName, status: 'published', scheduledAt: null, publishedAt: now,
      pollOptions: null, pollEndsAt: null, categoryId: '',
      upvotes: 0, downvotes: 0, score: 0, communityId: tenantId,
    },
    // Dasselbe Leserecht, das die App einem Mitglieder-Beitrag gibt
    // (`tenantRowPermissionsFor`, Pool: das Label der Community). Seit SEC-031
    // (2026-11-13) liest die Stimm-Route den Beitrag mit dem Session-Client —
    // eine Zeile ohne Leserecht ist für sie „nicht da" (404).
    permissions: [Permission.read(Role.label(labelOfTenant.get(tenantId)))],
  })
}

/**
 * Eine Aufstimme — IMMER mit frischer Client-IP.
 *
 * Dieselbe Lehre wie beim Einladungs-Beweis, hier noch schärfer: die Drossel
 * (`posts:vote`, IP-gebunden) und das Tages-Limit antworten BEIDE mit 429, und
 * die Drossel läuft als Middleware ZUERST. Mit einer gemeinsamen IP kam der
 * Lauf bei der 58. Aufstimme am Rate-Limit zum Stehen (live gemessen) — das
 * Kontingent von 75 wäre nie erreicht worden, und der Beweis hätte seine
 * eigene Testumgebung gemessen statt die Staffel.
 */
function upvote(host, postId, cookie) {
  return call(host, `/api/posts/${postId}/score`, {
    method: 'POST', cookie, clientIp: freshIp(), body: { value: 1 },
  })
}

/** Stand, der für Stufe 1 reicht (2 Tage, 1 Inhalt, 1 vergeben). */
const TL1_COUNTERS = { topicsCreated: 1, repliesCreated: 0, upvotesGiven: 1, upvotesReceived: 0 }
/** Stand für Stufe 2 (15 Tage, 5 Inhalte, 10 vergeben, 5 erhalten). */
const TL2_COUNTERS = { topicsCreated: 5, repliesCreated: 0, upvotesGiven: 10, upvotesReceived: 5 }

try {
  console.log(`Stufen-Vorteile gegen http://localhost:${PORT} · Control ${controlProject} · Pool ${poolProject}`)
  console.log(`Erwartete Staffel: TL0/TL1 = ${LIMIT_TL0} · TL2 = ${LIMIT_TL2}\n`)

  const owner = await createPoolUser('owner')
  const ownerCookie = await loginWithCookies(owner)
  const a = await createCommunity(ownerCookie, `f57s-a-${runId}`, 'Stufen A')
  const author = await createPoolUser('autor')

  /* ── 1. Die Annahme hinterlegt den Einladenden ──────────────────────────── */
  console.log('1. Die ANNAHME hinterlegt den Einladenden an der Zeile des Eingeladenen')

  const invitees = []
  for (let i = 1; i <= 5; i++) {
    const person = await createPoolUser(`m${i}`)
    const cookie = await loginWithCookies(person)
    const invited = await call(a.host, '/api/community/members', {
      method: 'POST', cookie: ownerCookie, clientIp: freshIp(), body: { email: person.email, role: 'viewer' },
    })
    if (invited.status !== 200) throw new Error(`Einladung ${i} fehlgeschlagen (${invited.status}): ${invited.text.slice(0, 160)}`)
    const mine = await call(a.host, '/api/community/invites/mine', { cookie })
    const accepted = await call(a.host, '/api/community/members/accept', {
      method: 'POST', cookie, body: { inviteId: mine.json?.invites?.[0]?.id },
    })
    if (accepted.status !== 200) throw new Error(`Annahme ${i} fehlgeschlagen (${accepted.status}): ${accepted.text.slice(0, 160)}`)
    invitees.push({ ...person, cookie })
  }

  const stamped = await counterRow(a.tenantId, invitees[0].userId)
  check('der Eingeladene trägt `invitedBy` = den Einladenden',
    stamped?.invitedBy === owner.userId, `invitedBy=${stamped?.invitedBy} erwartet=${owner.userId}`)
  check('und er trägt ihn in DIESER Community (Zeile ist gescopt)',
    stamped?.communityId === a.tenantId, `communityId=${stamped?.communityId}`)
  const ownerRow0 = await counterRow(a.tenantId, owner.userId)
  check('der EINLADENDE selbst trägt keinen Einlader (er kam von allein)',
    (ownerRow0?.invitedBy ?? '') === '', `invitedBy=${ownerRow0?.invitedBy}`)
  check('alle fünf Eingeladenen sind gestempelt',
    (await Promise.all(invitees.map(p => counterRow(a.tenantId, p.userId))))
      .every(row => row?.invitedBy === owner.userId))
  check('und keiner von ihnen hat schon eine Stufe',
    (await Promise.all(invitees.map(p => counterRow(a.tenantId, p.userId))))
      .every(row => (row?.trustLevel ?? 0) === 0))

  /* ── 2. Der Aufstieg schreibt dem Einladenden gut ───────────────────────── */
  console.log('\n2. Der AUFSTIEG des Eingeladenen zählt beim Einladenden hoch')

  const m1 = invitees[0]
  await backdateMembership(a.communityId, m1.userId, 90)
  await seedCounters(a.tenantId, m1.userId, TL1_COUNTERS)
  const m1Post = await seedPost(a.tenantId, m1.userId, 'M1')
  const trigger1 = await upvote(a.host, m1Post.$id, ownerCookie)
  check('der Auslöser ist eine gewöhnliche Zähl-Buchung (200)', trigger1.status === 200, String(trigger1.status))

  const m1After = await counterRow(a.tenantId, m1.userId)
  check('der Eingeladene steht auf Stufe 1', m1After?.trustLevel === 1, `trustLevel=${m1After?.trustLevel}`)
  const ownerAfter1 = await counterRow(a.tenantId, owner.userId)
  check('beim Einladenden steht `inviteesBasic` = 1', ownerAfter1?.inviteesBasic === 1, `${ownerAfter1?.inviteesBasic}`)
  check('und `inviteesMember` steht NOCH auf 0', (ownerAfter1?.inviteesMember ?? 0) === 0, `${ownerAfter1?.inviteesMember}`)

  /* ── 3. Ein zweiter Aufstieg desselben Menschen zählt NICHT doppelt ─────── */
  console.log('\n3. Derselbe Eingeladene steigt weiter — die erste Grenze zählt NICHT erneut')

  await seedCounters(a.tenantId, m1.userId, TL2_COUNTERS)
  const m1Post2 = await seedPost(a.tenantId, m1.userId, 'M1')
  const trigger2 = await upvote(a.host, m1Post2.$id, ownerCookie)
  check('zweite Buchung (200)', trigger2.status === 200, String(trigger2.status))

  const m1After2 = await counterRow(a.tenantId, m1.userId)
  check('der Eingeladene steht jetzt auf Stufe 2', m1After2?.trustLevel === 2, `trustLevel=${m1After2?.trustLevel}`)
  const ownerAfter2 = await counterRow(a.tenantId, owner.userId)
  check('`inviteesBasic` steht UNVERÄNDERT auf 1 — die Grenze war schon überschritten',
    ownerAfter2?.inviteesBasic === 1, `${ownerAfter2?.inviteesBasic}`)
  check('`inviteesMember` steht jetzt auf 1', ownerAfter2?.inviteesMember === 1, `${ownerAfter2?.inviteesMember}`)

  /* ── 4. Die Schwellen verleihen die Abzeichen ───────────────────────────── */
  console.log('\n4. Die Schwellen des Katalogs: 3 ⇒ Campaigner, 5 ⇒ Champion')

  for (let i = 1; i < invitees.length; i++) {
    const person = invitees[i]
    await backdateMembership(a.communityId, person.userId, 90)
    await seedCounters(a.tenantId, person.userId, TL2_COUNTERS)
    const target = await seedPost(a.tenantId, person.userId, `M${i + 1}`)
    await upvote(a.host, target.$id, ownerCookie)

    const row = await counterRow(a.tenantId, owner.userId)
    if (i === 2) {
      check('nach dem DRITTEN Eingeladenen auf Stufe 1: `inviteesBasic` = 3',
        row?.inviteesBasic === 3, `${row?.inviteesBasic}`)
      check('das Abzeichen „Campaigner" ist GENAU EINMAL verliehen',
        await badgeCount(a.tenantId, owner.userId, 'campaigner') === 1,
        String(await badgeCount(a.tenantId, owner.userId, 'campaigner')))
      check('„Champion" ist noch NICHT verliehen (3 < 5)',
        await badgeCount(a.tenantId, owner.userId, 'champion') === 0)
    }
  }

  const ownerFinal = await counterRow(a.tenantId, owner.userId)
  check('nach allen fünf: `inviteesBasic` = 5', ownerFinal?.inviteesBasic === 5, `${ownerFinal?.inviteesBasic}`)
  check('und `inviteesMember` = 5', ownerFinal?.inviteesMember === 5, `${ownerFinal?.inviteesMember}`)
  check('das Abzeichen „Champion" ist GENAU EINMAL verliehen',
    await badgeCount(a.tenantId, owner.userId, 'champion') === 1,
    String(await badgeCount(a.tenantId, owner.userId, 'champion')))
  check('„Campaigner" ist NICHT ein zweites Mal dazugekommen',
    await badgeCount(a.tenantId, owner.userId, 'campaigner') === 1)
  check('der Eingeladene selbst bekommt NICHTS von beidem',
    await badgeCount(a.tenantId, m1.userId, 'campaigner') === 0
    && await badgeCount(a.tenantId, m1.userId, 'champion') === 0)

  /* ── 5. Wer ohne Einladung kam, löst nichts aus ─────────────────────────── */
  console.log('\n5. Ein Aufstieg OHNE Einlader löst gar nichts aus')

  const walkIn = await createPoolUser('selbstgekommen')
  await backdateMembership(a.communityId, walkIn.userId, 90)
  await seedCounters(a.tenantId, walkIn.userId, { ...TL2_COUNTERS, invitedBy: '' })
  const walkInPost = await seedPost(a.tenantId, walkIn.userId, 'Selbst gekommen')
  await upvote(a.host, walkInPost.$id, ownerCookie)

  const walkInRow = await counterRow(a.tenantId, walkIn.userId)
  check('auch er steigt auf Stufe 2', walkInRow?.trustLevel === 2, `trustLevel=${walkInRow?.trustLevel}`)
  check('er trägt keinen Einlader', (walkInRow?.invitedBy ?? '') === '', `invitedBy=${walkInRow?.invitedBy}`)
  const ownerUnchanged = await counterRow(a.tenantId, owner.userId)
  check('die Zähler des Einladenden bewegen sich NICHT (5/5)',
    ownerUnchanged?.inviteesBasic === 5 && ownerUnchanged?.inviteesMember === 5,
    `${ownerUnchanged?.inviteesBasic}/${ownerUnchanged?.inviteesMember}`)

  /* ── 6. Die Mandanten-Grenze ────────────────────────────────────────────── */
  console.log('\n6. Die Gutschrift bleibt in IHRER Community')

  /**
   * DIE ZWEITE COMMUNITY GEHÖRT EINEM ANDEREN KONTO, und das ist keine
   * Umgehung, sondern das Produkt: in der Testphase darf ein Konto GENAU EINE
   * Community haben (403 `One community per account during the trial`). Der
   * Beweis braucht aber DENSELBEN Einladenden in beiden — sonst zeigte er nur,
   * dass zwei verschiedene Menschen verschiedene Zeilen haben.
   *
   * Also wird der Einladende aus A hier MITGLIED in B und lädt dort selbst ein
   * (Mitglieder-Einladungen, F57 Mechanik 2). Eine Person, zwei Communities,
   * zwei Zähler-Zeilen — genau die Frage, um die es geht.
   */
  const owner2 = await createPoolUser('owner-b')
  const owner2Cookie = await loginWithCookies(owner2)
  const b = await createCommunity(owner2Cookie, `f57s-b-${runId}`, 'Stufen B')

  await call(b.host, '/api/community/members', {
    method: 'POST', cookie: owner2Cookie, clientIp: freshIp(), body: { email: owner.email, role: 'viewer' },
  })
  const ownerMineB = await call(b.host, '/api/community/invites/mine', { cookie: ownerCookie })
  const ownerJoinB = await call(b.host, '/api/community/members/accept', {
    method: 'POST', cookie: ownerCookie, body: { inviteId: ownerMineB.json?.invites?.[0]?.id },
  })
  check('derselbe Mensch ist auch in der zweiten Community (200)', ownerJoinB.status === 200,
    `${ownerJoinB.status} ${ownerJoinB.text.slice(0, 160)}`)
  check('seine Rolle dort ist da (Rollen-Cache abgewartet)', await waitForMembership(b.host, ownerCookie))

  const m6 = await createPoolUser('m6')
  const m6Cookie = await loginWithCookies(m6)
  const m6Invite = await call(b.host, '/api/community/members', {
    method: 'POST', cookie: ownerCookie, clientIp: freshIp(), body: { email: m6.email, role: 'viewer' },
  })
  check('er lädt dort selbst jemanden ein (200)', m6Invite.status === 200,
    `${m6Invite.status} ${m6Invite.text.slice(0, 160)}`)
  const m6Mine = await call(b.host, '/api/community/invites/mine', { cookie: m6Cookie })
  const m6Accept = await call(b.host, '/api/community/members/accept', {
    method: 'POST', cookie: m6Cookie, body: { inviteId: m6Mine.json?.invites?.[0]?.id },
  })
  check('die Einladung in der zweiten Community wird angenommen (200)', m6Accept.status === 200,
    `${m6Accept.status} ${m6Accept.text.slice(0, 160)}`)

  await backdateMembership(b.communityId, m6.userId, 90)
  await seedCounters(b.tenantId, m6.userId, TL2_COUNTERS)
  const m6Post = await seedPost(b.tenantId, m6.userId, 'M6')
  await upvote(b.host, m6Post.$id, owner2Cookie)

  const ownerInB = await counterRow(b.tenantId, owner.userId)
  check('in der zweiten Community zählt derselbe Mensch bei 1/1',
    ownerInB?.inviteesBasic === 1 && ownerInB?.inviteesMember === 1,
    `${ownerInB?.inviteesBasic}/${ownerInB?.inviteesMember}`)
  const ownerInA = await counterRow(a.tenantId, owner.userId)
  check('in der ersten Community steht er UNVERÄNDERT bei 5/5',
    ownerInA?.inviteesBasic === 5 && ownerInA?.inviteesMember === 5,
    `${ownerInA?.inviteesBasic}/${ownerInA?.inviteesMember}`)
  check('das Abzeichen aus der ersten Community gilt NICHT in der zweiten',
    await badgeCount(b.tenantId, owner.userId, 'campaigner') === 0)

  /* ── 7. Die Staffel: was ein Neuling am Tag darf ────────────────────────── */
  console.log(`\n7. Die Staffel — Stufe 0 bekommt ${LIMIT_TL0} Likes am Tag`)

  // Ab hier zählt der Kalendertag (Kopf von `waitOutUtcMidnight`).
  await waitOutUtcMidnight()
  const dayAtStart = utcDay()

  const anna = await createPoolUser('anna')
  const annaCookie = await loginWithCookies(anna)
  await call(a.host, '/api/community/members', {
    method: 'POST', cookie: ownerCookie, clientIp: freshIp(), body: { email: anna.email, role: 'viewer' },
  })
  const annaMine = await call(a.host, '/api/community/invites/mine', { cookie: annaCookie })
  await call(a.host, '/api/community/members/accept', {
    method: 'POST', cookie: annaCookie, body: { inviteId: annaMine.json?.invites?.[0]?.id },
  })
  check('Anna ist Mitglied (Rollen-Cache abgewartet)', await waitForMembership(a.host, annaCookie))

  // Ziele: so viele wie das GRÖSSERE Kontingent. Ihr Autor ist bewusst KEIN
  // Mitglied — seine Zähler bewegen sich, aber ohne Zugehörigkeit steigt er
  // nie auf und stört die Messung nicht.
  const targets = []
  for (let i = 0; i < LIMIT_TL2 + 1; i++) targets.push(await seedPost(a.tenantId, author.userId, 'Autor'))

  let denied = null
  let okCount = 0
  for (let i = 0; i < LIMIT_TL0; i++) {
    const res = await upvote(a.host, targets[i].$id, annaCookie)
    if (res.status === 200) okCount++
    else { denied = res; break }
  }
  check(`die ersten ${LIMIT_TL0} Aufstimmen gehen durch`, okCount === LIMIT_TL0,
    `${okCount} von ${LIMIT_TL0}${denied ? ` — abgewiesen mit ${denied.status}` : ''}`)

  const overTl0 = await upvote(a.host, targets[LIMIT_TL0].$id, annaCookie)
  check(`die ${LIMIT_TL0 + 1}. wird abgewiesen (429 like_limit_reached)`,
    overTl0.status === 429 && reasonOf(overTl0) === 'like_limit_reached',
    `${overTl0.status} ${reasonOf(overTl0) || overTl0.text.slice(0, 120)}`)

  const annaRow = await counterRow(a.tenantId, anna.userId)
  // Der Tag von VOR den Stimmen — nicht „jetzt": zwischen der letzten Stimme
  // und dieser Zeile darf die Uhr nicht über die Erwartung entscheiden.
  check('der Abzeichen-Tag ist gebucht (likeLimitDays = 1)', annaRow?.likeLimitDays === 1, `${annaRow?.likeLimitDays}`)
  check('und der gebuchte Tag steht in der Zeile', annaRow?.likeLimitDay === dayAtStart, `${annaRow?.likeLimitDay} statt ${dayAtStart}`)
  check('„Out of Love" ist GENAU EINMAL verliehen',
    await badgeCount(a.tenantId, anna.userId, 'out-of-love') === 1,
    String(await badgeCount(a.tenantId, anna.userId, 'out-of-love')))

  /* ── 8. Die Stufe hebt das Kontingent — noch am selben Tag ──────────────── */
  console.log(`\n8. Stufe 2 hebt das Kontingent auf ${LIMIT_TL2} — mitten am Tag`)

  const annaCounterId = await seedCounters(a.tenantId, anna.userId, { trustLevel: 2 })
  check('Annas Stufe steht auf 2', Boolean(annaCounterId))

  let secondOk = 0
  for (let i = LIMIT_TL0; i < LIMIT_TL2; i++) {
    const res = await upvote(a.host, targets[i].$id, annaCookie)
    if (res.status === 200) secondOk++
  }
  check(`sie darf ${LIMIT_TL2 - LIMIT_TL0} weitere Aufstimmen vergeben`, secondOk === LIMIT_TL2 - LIMIT_TL0,
    `${secondOk} von ${LIMIT_TL2 - LIMIT_TL0}`)

  const overTl2 = await upvote(a.host, targets[LIMIT_TL2].$id, annaCookie)
  check(`die ${LIMIT_TL2 + 1}. wird abgewiesen (429 like_limit_reached)`,
    overTl2.status === 429 && reasonOf(overTl2) === 'like_limit_reached',
    `${overTl2.status} ${reasonOf(overTl2) || overTl2.text.slice(0, 120)}`)

  const annaRow2 = await counterRow(a.tenantId, anna.userId)
  check('der Tag ist trotz zweitem Erreichen NUR EINMAL gebucht (likeLimitDays = 1)',
    annaRow2?.likeLimitDays === 1, `${annaRow2?.likeLimitDays}`)
  check('„Higher Love" (5 Tage) ist folgerichtig NICHT verliehen',
    await badgeCount(a.tenantId, anna.userId, 'higher-love') === 0)
  check('und ihr Verbrauch steht auf dem neuen Limit', annaRow2?.likesToday === LIMIT_TL2, `${annaRow2?.likesToday}`)
  // Die Voraussetzung der Abschnitte 7 und 8, als eigene Zeile: rot heißt
  // „der Lauf ging über Mitternacht UTC", nicht „das Kontingent ist falsch".
  check('die Abschnitte 7 und 8 lagen in EINEM UTC-Tag (sonst sind die Tages-Prüfungen oben nicht aussagekräftig)',
    utcDay() === dayAtStart, `${dayAtStart} → ${utcDay()}`)

  /* ── 9. Die Galerie sagt die Zahl, nicht das Versprechen ────────────────── */
  console.log('\n9. Die Abzeichen-Galerie nennt das Kontingent — und was die nächste Stufe bringt')

  const gallery = await call(a.host, '/api/posts/discussions/badges', { cookie: annaCookie })
  check('die Galerie antwortet (200)', gallery.status === 200, String(gallery.status))
  check(`sie nennt Annas Kontingent (${LIMIT_TL2})`, gallery.json?.likeLimit?.current === LIMIT_TL2,
    JSON.stringify(gallery.json?.likeLimit))
  check('und sie nennt die nächste Stufe mit ihrer eigenen Zahl',
    gallery.json?.likeLimit?.next?.level === 3 && gallery.json?.likeLimit?.next?.limit > LIMIT_TL2,
    JSON.stringify(gallery.json?.likeLimit?.next))
  check('der Katalog trägt beide neuen Abzeichen',
    Array.isArray(gallery.json?.rows)
    && gallery.json.rows.some(row => row.key === 'campaigner')
    && gallery.json.rows.some(row => row.key === 'champion'))
}
catch (error) {
  fail++
  console.log(`\n✗ Abbruch: ${error.message}`)
}
finally {
  console.log('\nAufräumen …')
  const { deleted, leftovers } = await cleanup.run()
  const total = Object.values(deleted).reduce((sum, n) => sum + n, 0)
  console.log(`  gelöscht: ${total} Einträge (Konten, Communities, Mitglieds-Zeilen, Einladungen, Codes, Zähler, Abzeichen, Beiträge, Stimmen)`)
  check('aufgeräumt — nachgezählt, nichts übrig', leftovers.length === 0, leftovers.join(', '))

  console.log(`\n${fail === 0 ? '✔' : '✗'} F57-Stufen (Staffel + Campaigner/Champion): ${pass}/${pass + fail}\n`)
  process.exit(fail === 0 ? 0 : 1)
}
