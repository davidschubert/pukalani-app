/**
 * Beweis für F57 Mechanik 2 — EINLADUNGEN DURCH MITGLIEDER.
 *
 * Davids Zuschnitt vom 2026-08-14: 5 Einladungen pro Woche je Mitglied (ab
 * Rolle Leser/in), je Community vom Owner abschaltbar, Zahl als Config-Wert.
 *
 * Fährt den ECHTEN Kundenpfad gegen einen laufenden Platform-Server MIT echter
 * Service-Naht zum Control Plane (beide aus DIESEM Arbeitsverzeichnis — ein
 * Beweis ist nur so ehrlich wie sein entferntester Dienst):
 *
 *   1. Ein Mitglied (Rolle `viewer`) lädt ein — und die MAIL geht raus.
 *      „Mail zuerst, Row danach" wird beidseitig belegt: die Nachricht liegt in
 *      Mailpit UND die Zeile trägt `invitedBy` = das Mitglied.
 *   2. Die 6. Einladung derselben Woche → 429 mit `invite_quota_exhausted`.
 *   3. Der Owner bleibt kontingentfrei — 6 Stück am Stück, alle 200.
 *   4. Schalter aus ⇒ Mitglied 403 `member_invites_disabled`, Owner darf weiter.
 *   5. Ein Mitglied kann KEINE andere Rolle erzwingen — `role: 'admin'` im Body
 *      endet in 403 `invite_role_forbidden`, nicht in einem Admin.
 *   6. Die ANNAHME zählt das Abzeichen `promoter` — genau einmal, und der
 *      Zähler steht beim EINLADENDEN, nicht beim Angenommenen.
 *   7. Ein Mitglied einer FREMDEN Community: 403. Ein Gast: 401.
 *   8. Die Drossel greift ZUSÄTZLICH zum Kontingent (eigener Abschnitt, weil
 *      sie sonst die Kontingent-Prüfung maskieren würde — beide antworten 429).
 *
 * ── AU1 (Audit + Davids Entscheidung 2026-08-15) ────────────────────────────
 *   9. DAS MITGLIEDSCHAFTS-ORAKEL ist zu: ein Mitglied, das eine Adresse
 *      anschreibt, die längst dabei ist, bekommt dieselbe Antwort wie bei
 *      einer echten Einladung — verbraucht aber sein Kontingent, und es geht
 *      KEINE Mail raus. Mit Gegenprobe: der Owner sieht weiter den ehrlichen
 *      409, und die stille Zeile taucht in KEINER Ansicht auf.
 *  10. Unbestätigte eigene Adresse ⇒ ein Mitglied darf nicht einladen
 *      (403 `email_unverified`), Owner/Admin bleiben unberührt.
 *
 * Räumt am Ende alles weg, was es angelegt hat.
 *
 *   POOL_KEY=… PLATFORM_PORT=3016 node --env-file=apps/control/.env \
 *     packages/onboarding/scripts/verify-member-invites.mjs
 */
import '../../../scripts/lib/assert-target.mjs'
import { request } from 'node:http'
import { createHash } from 'node:crypto'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'
import { probeSiteBody } from '../../../scripts/lib/probe-stage.mjs'

const PORT = Number(process.env.PLATFORM_PORT || 3016)
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'pool'
const poolKey = process.env.POOL_KEY

if (!endpoint || !controlProject || !databaseId || !controlKey || !poolKey) {
  console.error('✗ Env unvollständig (POOL_KEY nötig).')
  process.exit(1)
}

const control = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const poolUsers = new Users(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))
const pool = new TablesDB(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))

let pass = 0
let fail = 0
const cleanup = { users: [], codes: [], tenants: [] }

function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

/**
 * JEDER Einladungs-Versuch bekommt eine EIGENE Client-IP.
 *
 * Das ist keine Bequemlichkeit, sondern die Bedingung dafür, dass dieser
 * Beweis überhaupt etwas beweist: die Drossel (`community:invite`) und das
 * Kontingent antworten BEIDE mit 429, und die Drossel läuft als Middleware
 * ZUERST. Mit einer gemeinsamen IP käme die 6. Einladung am Rate-Limit zum
 * Stehen, und die Kontingent-Prüfung wäre nie erreicht — der Test wäre grün,
 * ohne die Mechanik zu berühren. Abschnitt 8 prüft die Drossel deshalb
 * ABSICHTLICH mit EINER festen IP.
 */
let ipCounter = 0
function freshIp() {
  ipCounter++
  return `198.51.100.${1 + (ipCounter % 250)}`
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

/** Einladen — immer mit frischer IP (Begründung bei `freshIp`). */
function invite(host, cookie, email, role = 'viewer') {
  return call(host, '/api/community/members', {
    method: 'POST', cookie, clientIp: freshIp(), body: { email, role },
  })
}

/**
 * Das eigene Kontingent lesen — EBENFALLS mit frischer IP, seit AU1
 * (2026-08-15) auch diese Route gedrosselt ist (`community:invite-quota`,
 * 10/min und IP).
 *
 * Ohne diese Zeile misst der Beweis seine eigene Drossel statt der Mechanik:
 * `waitForMembership` pollt die Route bis zu 45-mal im Sekundentakt, und
 * schon der elfte Aufruf käme als 429 zurück — der Poller liefe in seine
 * Zeitgrenze und meldete „die Rolle kommt nicht an". Dieselbe Falle wie bei
 * den Einladungen selbst (siehe `freshIp`), nur eine Route weiter.
 */
function quotaOf(host, cookie) {
  return call(host, '/api/community/invites/quota', { cookie, clientIp: freshIp() })
}

async function createPoolUser(tag, { verified = false } = {}) {
  const email = `f57-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`
  const password = `Pw-${ID.unique()}`
  const user = await poolUsers.create({ userId: ID.unique(), email, password, name: `F57 ${tag}` })
  cleanup.users.push(user.$id)
  // Die Annahme verlangt eine BESTÄTIGTE Adresse (accept.post.ts, 403
  // `email_unverified`) — ohne diese Zeile scheitert Abschnitt 6 an der
  // Testumgebung statt an der Sache.
  if (verified) await poolUsers.updateEmailVerification({ userId: user.$id, emailVerification: true })
  return { userId: user.$id, email, password }
}

async function login(account) {
  const res = await call(CONTROL_HOST, '/api/auth/login', {
    method: 'POST', body: { email: account.email, password: account.password },
  })
  if (res.status !== 200) throw new Error(`Login fehlgeschlagen (${res.status}): ${res.text.slice(0, 160)}`)
  const raw = res.setCookie.find(c => c.startsWith('a_session_'))
  if (!raw) throw new Error('Kein Session-Cookie erhalten')
  return raw.split(';')[0]
}

async function issueCode() {
  const code = `PUKA-F57-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const row = await control.createRow({
    databaseId, tableId: 'invite_codes', rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code.toUpperCase(), 'utf8').digest('hex'),
      label: 'F57-Beweis', maxUses: 0, uses: 0, expiresAt: null, status: 'active',
    },
  })
  cleanup.codes.push(row.$id)
  return code
}

async function createCommunity(cookie, slug, name) {
  const code = await issueCode()
  const res = await call(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST', cookie,
    body: probeSiteBody({
      name,
      slug,
      description: 'Beweis für Einladungen durch Mitglieder.',
      vibe: 'elegant',
      inviteCode: code,
    }),
  })
  if (res.status !== 200 || !res.json?.communityId) {
    throw new Error(`Community-Anlage fehlgeschlagen (${res.status}): ${res.text.slice(0, 200)}`)
  }
  cleanup.tenants.push(res.json.communityId)
  /**
   * ZWEI IDs, UND SIE SIND NICHT DIESELBE — die Falle, an der dieser Beweis
   * beim ersten Lauf hing (38/40, beide Abzeichen-Prüfungen rot).
   *
   * Im CONTROL PLANE heißt der Schlüssel einer Community `communities.$id`;
   * danach fragen `community_invites` und `community_members`. In den
   * RUNTIME-Tabellen stempelt die Datentür aber `communityId = tenant.tenantId`
   * (der `t-…`-Wert, `scopeRowFor` in core/server/utils/tenant.ts) — mit der
   * `$id` gesucht, liefert `member_counters` und `user_badges` still eine leere
   * Menge. Dieselbe Verwechslung, vor der CLAUDE.md bei `notify()` warnt.
   */
  const row = await control.getRow({ databaseId, tableId: 'communities', rowId: res.json.communityId })
  return { communityId: res.json.communityId, tenantId: row.tenantId, host: res.json.host }
}

/**
 * Warten, bis die frische Mitgliedschaft in der Rollen-Auflösung ankommt.
 *
 * DIE 30 SEKUNDEN SIND KEIN FEHLER DIESER MECHANIK, sondern der bestehende
 * Rollen-Cache: direkt nach der Annahme antwortet `/api/community/role` noch
 * `role: null` (live nachgemessen — bei t=0…25 s `null`, bei t=30 s `viewer`),
 * und damit gibt JEDE capability-geschützte Route 403. Das gilt für ein neues
 * Mitglied überall gleich, nicht nur beim Einladen.
 *
 * Ohne dieses Warten misst der Beweis den Cache statt der Mechanik — und der
 * generische 403 (ohne `reason`) sieht dabei aus wie ein kaputtes Gate.
 * Gepollt wird die Kontingent-Route selbst: sie ist genau so weit offen wie
 * das Einladen.
 */
async function waitForMembership(host, cookie) {
  for (let i = 0; i < 45; i++) {
    const res = await quotaOf(host, cookie)
    if (res.status === 200) return true
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

/** Der Host-Resolver cacht negativ (30 s) — nach der Anlage kurz nachfassen. */
async function waitForHost(host) {
  for (let i = 0; i < 40; i++) {
    const res = await call(host, '/api/themes')
    if (res.status === 200) return true
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

async function mailpitCount(toAddress) {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${toAddress}`)}`)
  if (!res.ok) return -1
  const data = await res.json()
  return data.messages_count ?? (data.messages?.length ?? 0)
}

async function countInviteRows(communityId, invitedBy) {
  const { total } = await control.listRows({
    databaseId, tableId: 'community_invites',
    queries: [Query.equal('communityId', communityId), Query.equal('invitedBy', invitedBy), Query.limit(1)],
  })
  return total
}

const reasonOf = res => res.json?.reason ?? res.json?.data?.reason ?? ''

try {
  console.log(`\nF57-Beweis (Einladungen durch Mitglieder) gegen http://localhost:${PORT}, Pool ${poolProject}\n`)

  // ── Aufbau ───────────────────────────────────────────────────────────────
  // Seit BE-015 verlangt das Anlegen einer Community eine BESTÄTIGTE Adresse —
  // beide Gründer werden bestätigt; für GEGENPROBE 1 unten nimmt der Beweis die
  // Bestätigung des Owners danach wieder zurück.
  const owner = await createPoolUser('owner', { verified: true })
  // Die Testphase lässt EINE Community je Konto zu — Community B braucht
  // deshalb einen eigenen Gründer. (Ohne diesen Satz sieht der 403 beim
  // zweiten Anlegen wie ein Fehler der neuen Arbeit aus.)
  const ownerB = await createPoolUser('ownerB', { verified: true })
  const memberAcc = await createPoolUser('member', { verified: true })
  const outsider = await createPoolUser('outsider', { verified: true })
  const invitee = await createPoolUser('invitee', { verified: true })

  const ownerCookie = await login(owner)
  const ownerBCookie = await login(ownerB)
  const memberCookie = await login(memberAcc)
  const outsiderCookie = await login(outsider)
  const inviteeCookie = await login(invitee)

  console.log('0. Aufbau: zwei Communities, ein Mitglied mit Rolle „viewer"')
  const a = await createCommunity(ownerCookie, `f57a-${Date.now().toString(36)}`, 'F57 Heimat')
  const b = await createCommunity(ownerBCookie, `f57b-${Date.now().toString(36)}`, 'F57 Fremde')
  check('Community A steht', await waitForHost(a.host), a.host)
  check('Community B steht', await waitForHost(b.host), b.host)

  // Das Mitglied kommt per Owner-Einladung herein — mit der Rolle, um die es
  // geht: `viewer`. Danach ist es ein gewöhnliches Mitglied ohne jedes
  // Verwaltungsrecht.
  const joinInvite = await invite(a.host, ownerCookie, memberAcc.email, 'viewer')
  check('Owner lädt das künftige Mitglied ein', joinInvite.status === 200, `${joinInvite.status} ${joinInvite.text.slice(0, 160)}`)
  const mine = await call(a.host, '/api/community/invites/mine', { cookie: memberCookie })
  const openInvite = mine.json?.invites?.[0]
  const accepted = await call(a.host, '/api/community/members/accept', {
    method: 'POST', cookie: memberCookie, body: { inviteId: openInvite?.id },
  })
  check('Mitglied nimmt an und ist „viewer"', accepted.status === 200 && accepted.json?.role === 'viewer',
    `${accepted.status} ${accepted.text.slice(0, 160)}`)
  check('die Rolle ist nach dem Cache-Fenster da', await waitForMembership(a.host, memberCookie))

  // ── 1. Das Mitglied lädt ein — und die Mail geht raus ────────────────────
  console.log('\n1. Ein Mitglied lädt ein (Mail zuerst, Row danach)')
  const firstGuest = `f57-guest1-${Date.now()}@example.test`
  const before = await mailpitCount(firstGuest)
  const first = await invite(a.host, memberCookie, firstGuest)
  check('Mitglied darf einladen → 200', first.status === 200, `${first.status} ${first.text.slice(0, 200)}`)
  check('die eingeladene Rolle ist „viewer"', first.json?.role === 'viewer', String(first.json?.role))
  check('das Kontingent reist mit (noch 4 von 5)',
    first.json?.quota?.remaining === 4 && first.json?.quota?.limit === 5 && first.json?.quota?.unlimited === false,
    JSON.stringify(first.json?.quota))
  const afterMail = await mailpitCount(firstGuest)
  check('die MAIL liegt in Mailpit', afterMail === before + 1, `vorher ${before}, nachher ${afterMail}`)
  check('die Zeile trägt das MITGLIED als Einlader',
    (await countInviteRows(a.communityId, memberAcc.userId)) === 1,
    String(await countInviteRows(a.communityId, memberAcc.userId)))

  // ── 2. Die Rolle lässt sich nicht erzwingen ──────────────────────────────
  // VOR dem Kontingent-Abschnitt, weil eine abgelehnte Einladung keine Zeile
  // erzeugt und das Kontingent deshalb unberührt lässt.
  console.log('\n2. Ein Mitglied kann keine Rolle ≠ viewer erzwingen')
  for (const role of ['admin', 'moderator', 'editor']) {
    const res = await invite(a.host, memberCookie, `f57-role-${role}-${Date.now()}@example.test`, role)
    check(`role: '${role}' → 403 invite_role_forbidden`,
      res.status === 403 && reasonOf(res) === 'invite_role_forbidden',
      `${res.status} ${reasonOf(res) || res.text.slice(0, 120)}`)
  }
  check('kein Verbrauch durch abgelehnte Versuche (weiter 1 Zeile)',
    (await countInviteRows(a.communityId, memberAcc.userId)) === 1,
    String(await countInviteRows(a.communityId, memberAcc.userId)))

  // ── 3. Das Kontingent ────────────────────────────────────────────────────
  console.log('\n3. Fünf pro Woche — die sechste wird abgewiesen')
  for (let i = 2; i <= 5; i++) {
    const res = await invite(a.host, memberCookie, `f57-quota-${i}-${Date.now()}@example.test`)
    check(`Einladung ${i}/5 → 200 (noch ${5 - i} übrig)`,
      res.status === 200 && res.json?.quota?.remaining === 5 - i,
      `${res.status} ${JSON.stringify(res.json?.quota)}`)
  }
  const sixth = await invite(a.host, memberCookie, `f57-quota-6-${Date.now()}@example.test`)
  check('die SECHSTE → 429 invite_quota_exhausted',
    sixth.status === 429 && reasonOf(sixth) === 'invite_quota_exhausted',
    `${sixth.status} ${reasonOf(sixth) || sixth.text.slice(0, 160)}`)
  const quotaView = await quotaOf(a.host, memberCookie)
  check('die Kontingent-Route sagt dasselbe (0 übrig, gesperrt)',
    quotaView.json?.remaining === 0 && quotaView.json?.used === 5 && quotaView.json?.enabled === false,
    JSON.stringify(quotaView.json))

  // ── 4. Der Owner bleibt kontingentfrei ───────────────────────────────────
  console.log('\n4. Der Owner kennt kein Kontingent (sechs am Stück)')
  let ownerOk = 0
  for (let i = 1; i <= 6; i++) {
    const res = await invite(a.host, ownerCookie, `f57-owner-${i}-${Date.now()}@example.test`)
    if (res.status === 200) ownerOk++
    else console.log(`      (Owner-Einladung ${i}: ${res.status} ${res.text.slice(0, 120)})`)
  }
  check('alle sechs Owner-Einladungen → 200', ownerOk === 6, `${ownerOk}/6`)
  const ownerQuota = await quotaOf(a.host, ownerCookie)
  check('der Owner sieht „unbegrenzt"',
    ownerQuota.json?.unlimited === true && ownerQuota.json?.enabled === true,
    JSON.stringify(ownerQuota.json))

  // ── 5. Der Schalter des Owners ───────────────────────────────────────────
  console.log('\n5. Schalter aus ⇒ Mitglied gesperrt, Owner unberührt')
  const off = await call(a.host, '/api/community/member-invites', {
    method: 'PATCH', cookie: ownerCookie, body: { memberInvitesEnabled: false },
  })
  check('Owner schaltet ab → 200', off.status === 200 && off.json?.memberInvitesEnabled === false,
    `${off.status} ${off.text.slice(0, 160)}`)
  // Ein zweites Mitglied mit FRISCHEM Kontingent — sonst bewiese ein 403 nur,
  // dass das erste sein Kontingent aufgebraucht hat.
  const second = await createPoolUser('member2', { verified: true })
  const secondCookie = await login(second)
  const secondInvite = await invite(a.host, ownerCookie, second.email, 'viewer')
  const secondMine = await call(a.host, '/api/community/invites/mine', { cookie: secondCookie })
  await call(a.host, '/api/community/members/accept', {
    method: 'POST', cookie: secondCookie, body: { inviteId: secondMine.json?.invites?.[0]?.id },
  })
  check('zweites Mitglied ist drin', secondInvite.status === 200, String(secondInvite.status))
  // Auch hier erst den Rollen-Cache abwarten — sonst bewiese der folgende 403
  // nur, dass die Mitgliedschaft noch nicht sichtbar ist, statt dass der
  // Schalter greift. Der Schalter ist AUS, die Kontingent-Route antwortet
  // deshalb 200 mit `enabled: false` (nicht 403); genau darauf wird gewartet.
  check('auch seine Rolle ist da', await waitForMembership(a.host, secondCookie))
  const blocked = await invite(a.host, secondCookie, `f57-blocked-${Date.now()}@example.test`)
  check('frisches Mitglied → 403 member_invites_disabled',
    blocked.status === 403 && reasonOf(blocked) === 'member_invites_disabled',
    `${blocked.status} ${reasonOf(blocked) || blocked.text.slice(0, 160)}`)
  const ownerStill = await invite(a.host, ownerCookie, `f57-owner-still-${Date.now()}@example.test`)
  check('der Owner darf weiterhin → 200', ownerStill.status === 200, `${ownerStill.status} ${ownerStill.text.slice(0, 160)}`)
  const blockedQuota = await quotaOf(a.host, secondCookie)
  check('die Oberfläche würde den Knopf verstecken (enabled=false)',
    blockedQuota.json?.enabled === false, JSON.stringify(blockedQuota.json))
  const on = await call(a.host, '/api/community/member-invites', {
    method: 'PATCH', cookie: ownerCookie, body: { memberInvitesEnabled: true },
  })
  check('wieder an → 200', on.status === 200 && on.json?.memberInvitesEnabled === true, String(on.status))

  // ── 6. Das Abzeichen ─────────────────────────────────────────────────────
  console.log('\n6. Die ANNAHME zählt „promoter" — beim Einladenden, genau einmal')
  const badgeInvite = await invite(a.host, secondCookie, invitee.email, 'viewer')
  check('das zweite Mitglied lädt den Gast ein', badgeInvite.status === 200,
    `${badgeInvite.status} ${badgeInvite.text.slice(0, 160)}`)
  const inviteeMine = await call(a.host, '/api/community/invites/mine', { cookie: inviteeCookie })
  const inviteeAccept = await call(a.host, '/api/community/members/accept', {
    method: 'POST', cookie: inviteeCookie, body: { inviteId: inviteeMine.json?.invites?.[0]?.id },
  })
  check('der Gast nimmt an → 200', inviteeAccept.status === 200,
    `${inviteeAccept.status} ${inviteeAccept.text.slice(0, 160)}`)

  const counters = await pool.listRows({
    databaseId, tableId: 'member_counters',
    queries: [Query.equal('communityId', a.tenantId), Query.equal('userId', second.userId), Query.limit(1)],
  })
  check('der Zähler steht beim EINLADENDEN (invitesAccepted = 1)',
    counters.rows[0]?.invitesAccepted === 1, JSON.stringify(counters.rows[0]?.invitesAccepted))

  const inviteeCounters = await pool.listRows({
    databaseId, tableId: 'member_counters',
    queries: [Query.equal('communityId', a.tenantId), Query.equal('userId', invitee.userId), Query.limit(1)],
  })
  check('der ANGENOMMENE bekommt nichts gutgeschrieben',
    (inviteeCounters.rows[0]?.invitesAccepted ?? 0) === 0,
    JSON.stringify(inviteeCounters.rows[0]?.invitesAccepted))

  const badges = await pool.listRows({
    databaseId, tableId: 'user_badges',
    queries: [Query.equal('communityId', a.tenantId), Query.equal('userId', second.userId), Query.equal('badgeKey', 'promoter'), Query.limit(5)],
  })
  check('das Abzeichen „promoter" ist GENAU EINMAL verliehen', badges.total === 1, `total ${badges.total}`)

  /**
   * F57-Stufen: dieselbe Annahme hinterlegt zusätzlich den EINLADENDEN an der
   * Zeile des Angenommenen (`invitedBy`). Er ist die Voraussetzung dafür, dass
   * ein Aufstieg WOCHEN später noch weiß, wem er gutgeschrieben gehört —
   * geprüft wird er hier, weil hier die Annahme stattfindet; was daraus folgt
   * (Campaigner/Champion), beweist `packages/posts/scripts/verify-trust-perks.mjs`.
   */
  check('der Angenommene trägt `invitedBy` = den Einladenden (F57-Stufen)',
    inviteeCounters.rows[0]?.invitedBy === second.userId,
    `invitedBy=${inviteeCounters.rows[0]?.invitedBy} erwartet=${second.userId}`)
  /**
   * Und die Kette stimmt je PERSON: das zweite Mitglied wurde selbst vom Owner
   * geholt, trägt also DESSEN Id — nicht seine eigene und nicht die des
   * Gastes, den es gerade eingeladen hat. Der erste Anlauf dieser Zeile prüfte
   * auf LEER und lag falsch: `second` ist im Beweis selbst ein Eingeladener.
   */
  check('und die Kette stimmt: der Einladende trägt seinerseits den Owner',
    counters.rows[0]?.invitedBy === owner.userId,
    `invitedBy=${counters.rows[0]?.invitedBy} erwartet=${owner.userId}`)

  // ── 7. Fremde und Gäste ──────────────────────────────────────────────────
  console.log('\n7. Fremde Community, fremdes Konto, kein Konto')
  const foreign = await invite(b.host, memberCookie, `f57-foreign-${Date.now()}@example.test`)
  check('Mitglied von A auf dem Host von B → 403', foreign.status === 403,
    `${foreign.status} ${foreign.text.slice(0, 160)}`)
  const nobody = await invite(a.host, outsiderCookie, `f57-nobody-${Date.now()}@example.test`)
  check('eingeloggtes Konto ohne Mitgliedschaft → 403', nobody.status === 403,
    `${nobody.status} ${nobody.text.slice(0, 160)}`)
  const guest = await invite(a.host, undefined, `f57-guest-${Date.now()}@example.test`)
  check('Gast (ohne Session) → 401', guest.status === 401, `${guest.status} ${guest.text.slice(0, 160)}`)
  const guestQuota = await call(a.host, '/api/community/invites/quota', { clientIp: freshIp() })
  check('auch das Kontingent verrät einem Gast nichts → 401', guestQuota.status === 401, String(guestQuota.status))

  // ── 8. Die Drossel — ZUSÄTZLICH zum Kontingent ───────────────────────────
  console.log('\n8. Die Drossel greift neben dem Kontingent (eine feste IP)')
  // Der OWNER, weil er kontingentfrei ist: was hier bremst, kann nur die
  // Drossel sein. Genau deshalb hat jeder andere Aufruf dieses Beweises eine
  // eigene IP — sonst hätte sie Abschnitt 3 maskiert.
  const burstIp = '203.0.113.77'
  let burst429 = 0
  let burstReason = ''
  for (let i = 1; i <= 14; i++) {
    const res = await call(a.host, '/api/community/members', {
      method: 'POST', cookie: ownerCookie, clientIp: burstIp,
      body: { email: `f57-burst-${i}-${Date.now()}@example.test`, role: 'viewer' },
    })
    if (res.status === 429) { burst429++; burstReason = reasonOf(res) }
  }
  check('ein Ansturm läuft in 429', burst429 > 0, `${burst429} von 14`)
  check('und zwar NICHT über das Kontingent (der Owner hat keines)',
    burstReason !== 'invite_quota_exhausted', `reason: ${burstReason || '(leer)'}`)

  // ── 9. AU1: das Mitgliedschafts-Orakel ───────────────────────────────────
  /**
   * Gemessen wird an `second`: es ist ein gewöhnliches Mitglied mit
   * Kontingent (eine Einladung in Abschnitt 6 verbraucht, vier übrig). Der
   * OWNER taugt hier nicht — er hält `team.manage` und bekommt genau deshalb
   * die andere Antwort.
   */
  console.log('\n9. AU1 — „schon Mitglied?" ist für ein Mitglied nicht mehr ablesbar')
  const probeTarget = memberAcc.email
  const quotaBefore = await quotaOf(a.host, secondCookie)
  const mailBefore = await mailpitCount(probeTarget)
  const rowsBefore = await countInviteRows(a.communityId, second.userId)

  // Eine ECHTE Einladung desselben Mitglieds als Vergleichsmass — erst danach
  // die Sondierung, damit beide Antworten aus demselben Zustand kommen.
  const realOne = await invite(a.host, secondCookie, `f57-au1-real-${Date.now()}@example.test`)
  const silent = await invite(a.host, secondCookie, probeTarget)

  check('die Sondierung antwortet 200 wie eine echte Einladung',
    silent.status === 200 && realOne.status === 200,
    `still ${silent.status}, echt ${realOne.status}`)
  check('KEIN Ablehnungsgrund reist mit', reasonOf(silent) === '', reasonOf(silent))
  check('dieselben Felder in derselben Antwort',
    JSON.stringify(Object.keys(silent.json ?? {}).sort()) === JSON.stringify(Object.keys(realOne.json ?? {}).sort()),
    `${Object.keys(silent.json ?? {}).sort().join(',')} vs ${Object.keys(realOne.json ?? {}).sort().join(',')}`)
  // Beide Bedingungen, damit die Zeile nicht VERSEHENTLICH grün wird: eine
  // 409-Fehlerantwort trägt naturgemäß auch kein `delivered`. Sie muss also
  // erst eine Erfolgs-Antwort SEIN und dann das Feld nicht haben.
  check('`delivered` steht NICHT in der Antwort an den Browser',
    silent.status === 200 && !('delivered' in (silent.json ?? {})) && !('delivered' in (realOne.json ?? {})),
    JSON.stringify(Object.keys(silent.json ?? {})))
  check('eine Einladungs-Id kommt zurück (nicht leer)',
    typeof silent.json?.inviteId === 'string' && silent.json.inviteId.length > 0,
    String(silent.json?.inviteId))
  // SEC-028: ob die Adresse ein Konto hat, steht gar nicht mehr in der
  // Antwort — beide Erfolgs-Antworten ohne das Feld (Bedingung wie oben bei
  // `delivered`: erst Erfolg, dann Abwesenheit).
  check('`existingAccount` steht NICHT in der Antwort an den Browser',
    silent.status === 200 && realOne.status === 200
      && !('existingAccount' in (silent.json ?? {})) && !('existingAccount' in (realOne.json ?? {})),
    `${Object.keys(silent.json ?? {}).sort().join(',')} / ${Object.keys(realOne.json ?? {}).sort().join(',')}`)

  // DER PREIS: das Kontingent zählt beide Wege. Eine gleich aussehende, aber
  // gratis wiederholbare Antwort wäre ein langsameres Orakel, kein
  // geschlossenes.
  check('das Kontingent ist um ZWEI gefallen (echte + stille Einladung)',
    silent.json?.quota?.remaining === (quotaBefore.json?.remaining ?? 0) - 2,
    `vorher ${quotaBefore.json?.remaining}, nachher ${silent.json?.quota?.remaining}`)
  const quotaAfter = await quotaOf(a.host, secondCookie)
  check('und die Kontingent-Route bestätigt es (kein Rechnen nur in der Antwort)',
    quotaAfter.json?.used === (quotaBefore.json?.used ?? 0) + 2,
    `${quotaBefore.json?.used} → ${quotaAfter.json?.used}`)
  check('zwei Zeilen mehr auf dem Konto des Einladenden',
    (await countInviteRows(a.communityId, second.userId)) === rowsBefore + 2,
    `${rowsBefore} → ${await countInviteRows(a.communityId, second.userId)}`)

  // KEINE MAIL an ein Mitglied, das längst dabei ist.
  check('an die sondierte Adresse geht KEINE Mail',
    (await mailpitCount(probeTarget)) === mailBefore,
    `vorher ${mailBefore}, nachher ${await mailpitCount(probeTarget)}`)

  // Die stille Zeile ist überall tot: sie entsteht `revoked`, taucht also in
  // den offenen Einladungen des Teams nicht auf.
  // Ohne Id GAR NICHT erst fragen: `getRow` wirft bei `undefined` einen
  // Parameter-Fehler, und der riss beim Gegenprobe-Lauf (Regel absichtlich
  // ausgehängt) den ganzen Rest des Beweises mit — Abschnitt 10 lief nie. Ein
  // Beweis soll bei einer Regression BERICHTEN, nicht abbrechen.
  const silentRow = silent.json?.inviteId
    ? await control.getRow({
        databaseId, tableId: 'community_invites', rowId: silent.json.inviteId,
      }).catch(() => null)
    : null
  check('die stille Zeile ist sofort „revoked"', silentRow?.status === 'revoked', String(silentRow?.status))
  const teamView = await call(a.host, '/api/community/members', { cookie: ownerCookie })
  const openEmails = (teamView.json?.invites ?? []).map(row => String(row.email).toLowerCase())
  check('sie steht in KEINER Liste offener Einladungen',
    !openEmails.includes(probeTarget.toLowerCase()), openEmails.join(','))

  /**
   * DIE GEGENPROBE — ohne sie bewiese der Abschnitt nur, dass die Route
   * irgendetwas mit 200 beantwortet. Wer die Mitgliederliste LESEN darf,
   * bekommt weiterhin die Wahrheit; für ihn wäre eine Beschwichtigung nur ein
   * verschwiegener Hinweis („die Rolle änderst du direkt in der Liste").
   */
  const ownerProbe = await invite(a.host, ownerCookie, probeTarget)
  check('GEGENPROBE: der Owner sieht weiter 409 already_member',
    ownerProbe.status === 409 && reasonOf(ownerProbe) === 'already_member',
    `${ownerProbe.status} ${reasonOf(ownerProbe) || ownerProbe.text.slice(0, 160)}`)

  /**
   * Und die zweite Gegenprobe: eine Adresse, die NICHT Mitglied ist, verhält
   * sich für dasselbe Mitglied genauso — nur dass diesmal wirklich eine Mail
   * fliegt. Ohne diese Zeile könnte die Sondierung an einer ganz anderen
   * Ursache 200 geben (etwa weil die Regel gar nicht mehr greift).
   */
  check('GEGENPROBE: die echte Einladung hat auch wirklich gemailt',
    (await mailpitCount(realOne.json?.email)) >= 1, String(realOne.json?.email))

  // ── 10. AU1: unbestätigte eigene Adresse ─────────────────────────────────
  console.log('\n10. AU1 — wer seine eigene Adresse nicht bestätigt hat, lädt nicht ein')
  await poolUsers.updateEmailVerification({ userId: second.userId, emailVerification: false })
  const unverified = await invite(a.host, secondCookie, `f57-au1-unverified-${Date.now()}@example.test`)
  check('Mitglied ohne bestätigte Adresse → 403 email_unverified',
    unverified.status === 403 && reasonOf(unverified) === 'email_unverified',
    `${unverified.status} ${reasonOf(unverified) || unverified.text.slice(0, 160)}`)
  const unverifiedQuota = await quotaOf(a.host, secondCookie)
  check('die Oberfläche versteckt den Knopf UND kennt den Grund',
    unverifiedQuota.json?.enabled === false && unverifiedQuota.json?.reason === 'email_unverified',
    JSON.stringify(unverifiedQuota.json))
  check('der abgelehnte Versuch verbraucht nichts',
    (await countInviteRows(a.communityId, second.userId)) === rowsBefore + 2,
    String(await countInviteRows(a.communityId, second.userId)))

  /**
   * GEGENPROBE 1: der OWNER dieses Beweises hat jetzt KEINE bestätigte Adresse
   * (zum Anlegen bestätigt, hier wieder zurückgenommen) — und lädt trotzdem ein. Genau
   * das ist Davids Zuschnitt: die Regel fügt für MITGLIEDER etwas hinzu und
   * nimmt dem Owner nichts.
   */
  await poolUsers.updateEmailVerification({ userId: owner.userId, emailVerification: false })
  const ownerUnverified = await invite(a.host, ownerCookie, `f57-au1-owner-${Date.now()}@example.test`)
  check('GEGENPROBE: der Owner darf auch unbestätigt einladen → 200',
    ownerUnverified.status === 200, `${ownerUnverified.status} ${ownerUnverified.text.slice(0, 160)}`)

  /** GEGENPROBE 2: bestätigt man die Adresse, geht es sofort wieder. */
  await poolUsers.updateEmailVerification({ userId: second.userId, emailVerification: true })
  const backAgain = await invite(a.host, secondCookie, `f57-au1-back-${Date.now()}@example.test`)
  check('GEGENPROBE: nach der Bestätigung wieder 200',
    backAgain.status === 200, `${backAgain.status} ${backAgain.text.slice(0, 160)}`)
}
catch (error) {
  fail++
  console.log(`\n✗ Abbruch: ${error.message}`)
}
finally {
  console.log('\nAufräumen …')
  for (const communityId of cleanup.tenants) {
    try {
      // Die Runtime-Tabellen tragen den `t-…`-Stempel, nicht die `$id`
      // (Begründung bei `createCommunity`) — mit der falschen Id räumt die
      // Schleife nichts weg und lässt Zeilen liegen.
      const tenantRow = await control.getRow({ databaseId, tableId: 'communities', rowId: communityId }).catch(() => null)
      const runtimeId = tenantRow?.tenantId ?? communityId
      const { rows } = await control.listRows({
        databaseId, tableId: 'community_invites',
        queries: [Query.equal('communityId', communityId), Query.limit(200)],
      })
      for (const row of rows) await control.deleteRow({ databaseId, tableId: 'community_invites', rowId: row.$id }).catch(() => {})
      const members = await control.listRows({
        databaseId, tableId: 'community_members',
        queries: [Query.equal('communityId', communityId), Query.limit(200)],
      })
      for (const row of members.rows) await control.deleteRow({ databaseId, tableId: 'community_members', rowId: row.$id }).catch(() => {})
      const counters = await pool.listRows({
        databaseId, tableId: 'member_counters',
        queries: [Query.equal('communityId', runtimeId), Query.limit(200)],
      })
      for (const row of counters.rows) await pool.deleteRow({ databaseId, tableId: 'member_counters', rowId: row.$id }).catch(() => {})
      const badges = await pool.listRows({
        databaseId, tableId: 'user_badges',
        queries: [Query.equal('communityId', runtimeId), Query.limit(200)],
      })
      for (const row of badges.rows) await pool.deleteRow({ databaseId, tableId: 'user_badges', rowId: row.$id }).catch(() => {})
      await control.deleteRow({ databaseId, tableId: 'communities', rowId: communityId }).catch(() => {})
    }
    catch { /* best effort */ }
  }
  for (const id of cleanup.codes) await control.deleteRow({ databaseId, tableId: 'invite_codes', rowId: id }).catch(() => {})
  for (const id of cleanup.users) await poolUsers.delete({ userId: id }).catch(() => {})

  console.log(`\n${fail === 0 ? '✔' : '✗'} F57 Einladungen durch Mitglieder: ${pass}/${pass + fail}\n`)
  process.exit(fail === 0 ? 0 : 1)
}
