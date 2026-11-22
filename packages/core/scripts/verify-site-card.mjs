#!/usr/bin/env node
/**
 * BEWEIS: DIE EINTRITTSKARTE JE SEITE IM MODUS `write` (PK1 E1c; Plan
 * `docs/plans/PUKALANI-KONTO-E1.md`, § 9 „Auf der Bühne").
 *
 * Läuft NUR, wenn die Platform-App auf `/api/health` `siteCard.mode === 'write'`
 * UND `siteCard.cards === true` meldet (Schalter `NUXT_SITE_CARD_MODE`, ein
 * brauchbarer `NUXT_SITE_CARD_KEY`). Sonst druckt es `○ übersprungen: <Grund>`
 * und prüft nichts — der Läufer zählt das nie als bestanden
 * (`skipReason` in `scripts/buehne/run.mjs`). Nachts startet `buehne.yml` die
 * Platform mit `write` und einem je Lauf zufälligen Schlüssel und setzt
 * `EXPECT_SITE_CARD=write`: dann ist ein fehlender Modus ROT statt
 * „übersprungen" — sonst bliebe ein still kaputter Nachtlauf grün.
 *
 * Geprüft, jeweils mit Gegenprobe:
 *   1. Anmelden schreibt eine Karte (Wert beginnt mit `c1.`); sie gilt auf
 *      ihrem Host, nicht auf dem anderen Community-Host, nicht auf dem
 *      Kontroll-Host.
 *   2. Host-Wechsel Kontroll-Host → Community legt eine NEUE Sitzung an; ein
 *      zweiter Wechsel räumt die vorige eigene weg (Zahl der Sitzungen gleich,
 *      gelesen mit dem Laufzeit-Schlüssel); dasselbe Siegel ein zweites Mal ⇒
 *      401.
 *   3. Abmelden auf Community A lässt den Kontroll-Host angemeldet.
 *   4. Gestellte eigene Domain für Community B (`customDomain` +
 *      `customDomainStatus: 'active'` an der `communities`-Zeile im Control
 *      Plane; der Name endet auf `.localhost`, sonst sperrt Vites
 *      `server.allowedHosts`): Umleitungen in beide Richtungen, Karte nur auf
 *      der Domain, Mitmachen ja (Benachrichtigungen), Kontoweites und
 *      Verwaltendes 404, Owner-Recht unter Produkt-Präfix 403.
 *   4b. Live-Verbindung über unseren Server (E1d, Plan § 13.3 Weg 3):
 *      `/api/health` meldet `liveRelay`; ein gewöhnliches GET auf
 *      `/api/live/realtime` ⇒ 404; WebSocket als Gast, mit fremder Herkunft
 *      und mit der Karte der Pukalani-Adresse ⇒ abgelehnt; mit der Karte der
 *      Domain ⇒ angenommen, `connected` ohne Konto-Daten, Ping ⇒ Pong;
 *      eine Benachrichtigung der eigenen Community kommt durch, die der
 *      anderen nicht; ein nicht erlaubter Kanal bekommt nichts; Sitzung
 *      gelöscht (Widerruf) ⇒ Konto-Ereignis ohne Inhalt, Fehler 401, zu.
 *   5. Domain abgeschaltet (`paused`) ⇒ die Karte der Domain ist wertlos,
 *      und eine OFFENE Live-Verbindung schließt die Nachprüfung (4403).
 *
 * VIER REGELN: die Zeile von B wird im `finally` auf den VORGEFUNDENEN Wert
 * zurückgestellt; Konten und Mitglieds-Zeilen räumt `createCleanup` und zählt
 * nach (mit den Konten fallen ihre Sitzungen); Hosts und Ids aus der Umgebung
 * (`pnpm buehne env`).
 *
 * Wartezeiten: der Resolver hält eine Community ~30 s — zweimal abwarten.
 *
 *   pnpm buehne run --lauf nacht --only verify-site-card --control-port <port>
 */
import '../../../scripts/lib/assert-target.mjs'
import {
  addStageMember,
  appwriteRest,
  createCleanup,
  createHttpCaller,
  createProbeAccount,
  login,
  openProbeSocket,
  runStamp,
} from '../../../scripts/lib/probe-stage.mjs'

const PORT = Number(process.env.PLATFORM_PORT || 3006)
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'
const HOST_A = process.env.TENANT_A_HOST
const HOST_B = process.env.TENANT_B_HOST
const COMMUNITY_A = process.env.BUEHNE_COMMUNITY_A
const COMMUNITY_B = process.env.BUEHNE_COMMUNITY_B

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT || 'account'
const poolKey = process.env.POOL_KEY

if (!endpoint || !controlProject || !databaseId || !controlKey || !poolKey || !HOST_A || !HOST_B || !COMMUNITY_A || !COMMUNITY_B) {
  console.error('✗ Env unvollständig — über `pnpm buehne run` starten (POOL_KEY, Hosts und Ids der Bühne).')
  process.exit(1)
}

/** Der Resolver hält eine Community ~30 s (Kopf von `00.tenant.ts`). */
const RESOLVER_SETTLE_MS = 33_000
const script = 'verify-site-card'
const { call, page } = createHttpCaller({ port: PORT })

let pass = 0
let fail = 0
function check(label, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`  ✔ ${label}`)
  }
  else {
    fail++
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const cookieOf = res => (res.setCookie.find(c => c.startsWith('a_session_')) ?? '').split(';')[0]
const valueOf = cookie => cookie.slice(cookie.indexOf('=') + 1)
const origin = host => ({ origin: `http://${host}` })

// ── Sonde: läuft die Platform im Modus `write` mit Karten? ─────────────────
// Eine Sonde legt nichts an (Regel 3) — erst danach entstehen Konten.
const health = await call(CONTROL_HOST, '/api/health').catch(() => null)
const siteCard = health?.json?.siteCard
if (siteCard?.mode !== 'write' || siteCard?.cards !== true) {
  const why = !health
    ? 'Platform antwortet nicht'
    : !siteCard ? 'Platform meldet kein Feld siteCard (Stand vor PK1 E1c)'
        : `Platform meldet siteCard.mode=${siteCard.mode}, cards=${siteCard.cards} — der Beweis braucht write mit Schlüssel`
  if (process.env.EXPECT_SITE_CARD === 'write') {
    console.log(`  ✗ der Lauf verlangt den Modus write (EXPECT_SITE_CARD=write): ${why}`)
    process.exit(1)
  }
  console.log(`○ übersprungen: ${why}`)
  process.exit(0)
}

const control = appwriteRest({ endpoint, projectId: controlProject, key: controlKey, script })
const pool = appwriteRest({ endpoint, projectId: poolProject, key: poolKey, script })
const poolDatabaseId = process.env.POOL_DATABASE_ID || 'main'
const cleanup = createCleanup({ pool, control, poolDatabaseId, controlDatabaseId: databaseId })
const stamp = runStamp()
const DOMAIN = `www.karte-${stamp}.localhost`

/** Sitzungen des Kontos, gelesen mit dem Laufzeit-Schlüssel (an unserem Code vorbei). */
async function sessionsOf(userId) {
  const res = await pool.get(`/users/${userId}/sessions`)
  return (res?.sessions ?? []).map(session => session.$id)
}

/** Siegel im Kundenbereich, Einlösen auf dem Ziel — der Knopf „Öffnen". */
async function enterCommunity(controlCookie, communityId, host, cookieOnTarget) {
  const seal = await call(CONTROL_HOST, '/api/onboarding/handoff', { method: 'POST', cookie: controlCookie, body: { communityId }, headers: origin(CONTROL_HOST) })
  const token = seal.json?.token ?? ''
  const redeem = await call(host, `/api/auth/site-session?token=${encodeURIComponent(token)}&to=%2F`, { cookie: cookieOnTarget })
  return { seal, token, redeem, cookie: cookieOf(redeem) }
}

let rowBefore = null

try {
  console.log(`\nEintrittskarte im Modus write gegen http://localhost:${PORT} (A ${HOST_A}, B ${HOST_B}, Kontroll-Host ${CONTROL_HOST})\n`)

  // ── Aufbau: ein Konto, Mitglied in A, Owner in B ─────────────────────────
  const person = await createProbeAccount(pool, { tag: 'karte', stamp, name: 'Karte Probe' })
  cleanup.track('account', person.userId)
  for (const [communityId, role] of [[COMMUNITY_A, 'viewer'], [COMMUNITY_B, 'owner']]) {
    const row = await addStageMember(control, databaseId, { communityId, projectId: poolProject, userId: person.userId, role, email: person.email })
    cleanup.track('member', row.$id)
  }

  // ── 1. Anmelden schreibt eine Karte, die nur auf ihrem Host gilt ─────────
  console.log('1. Anmelden auf A schreibt eine Karte')
  const cardA = await login(call, HOST_A, person)
  check('der Cookie-Wert ist eine Karte (beginnt mit c1.)', valueOf(cardA).startsWith('c1.'), valueOf(cardA).slice(0, 6))
  const meA = await call(HOST_A, '/api/auth/me', { cookie: cardA })
  check('auf A angemeldet (/api/auth/me → 200)', meA.status === 200 && meA.json?.email === person.email, `Status ${meA.status}`)
  const onB = await call(HOST_B, '/api/auth/me', { cookie: cardA })
  check('dieselbe Karte auf Community B → 401', onB.status === 401, `Status ${onB.status}`)
  const onControl = await call(CONTROL_HOST, '/api/auth/me', { cookie: cardA })
  check('dieselbe Karte auf dem Kontroll-Host → 401', onControl.status === 401, `Status ${onControl.status}`)

  // ── 2. Host-Wechsel: neue Sitzung, die vorige eigene geht ────────────────
  console.log('\n2. Host-Wechsel Kontroll-Host → A')
  const controlCookie = await login(call, CONTROL_HOST, person)
  check('Kontroll-Host schreibt ebenfalls eine Karte', valueOf(controlCookie).startsWith('c1.'))
  const beforeFirst = await sessionsOf(person.userId)
  const first = await enterCommunity(controlCookie, COMMUNITY_A, HOST_A)
  check('erstes Einlösen → 302 mit Karte', first.redeem.status === 302 && valueOf(first.cookie).startsWith('c1.'), `Status ${first.redeem.status}`)
  const afterFirst = await sessionsOf(person.userId)
  check('der Wechsel legt eine NEUE Sitzung an (eine mehr)', afterFirst.length === beforeFirst.length + 1, `${beforeFirst.length} → ${afterFirst.length}`)
  const firstSession = afterFirst.find(id => !beforeFirst.includes(id)) ?? ''

  const second = await enterCommunity(controlCookie, COMMUNITY_A, HOST_A, first.cookie)
  check('zweiter Wechsel (mit der Karte des ersten) → 302 mit Karte', second.redeem.status === 302 && valueOf(second.cookie).startsWith('c1.'), `Status ${second.redeem.status}`)
  const afterSecond = await sessionsOf(person.userId)
  check('die vorige eigene Sitzung ist weg, die Zahl bleibt gleich', afterSecond.length === afterFirst.length && !!firstSession && !afterSecond.includes(firstSession),
    `${afterFirst.length} → ${afterSecond.length}, vorige noch da: ${afterSecond.includes(firstSession)}`)
  const meSecond = await call(HOST_A, '/api/auth/me', { cookie: second.cookie })
  check('mit der neuen Karte auf A angemeldet', meSecond.status === 200, `Status ${meSecond.status}`)
  const meFirst = await call(HOST_A, '/api/auth/me', { cookie: first.cookie })
  check('die Karte der weggeräumten Sitzung gilt nicht mehr → 401', meFirst.status === 401, `Status ${meFirst.status}`)

  const replay = await call(HOST_A, `/api/auth/site-session?token=${encodeURIComponent(second.token)}&to=%2F`)
  check('dasselbe Siegel ein zweites Mal → 401 (einmal einlösbar)', replay.status === 401, `Status ${replay.status}`)

  // ── 3. Abmelden auf A lässt den Kontroll-Host angemeldet ─────────────────
  console.log('\n3. Abmelden wirkt je Seite')
  const beforeLogout = await sessionsOf(person.userId)
  const logout = await call(HOST_A, '/api/auth/logout', { method: 'POST', cookie: second.cookie, headers: origin(HOST_A) })
  check('Abmelden auf A → 200', logout.status === 200, `Status ${logout.status}`)
  const afterLogout = await sessionsOf(person.userId)
  check('genau die Sitzung von A ist beendet', afterLogout.length === beforeLogout.length - 1, `${beforeLogout.length} → ${afterLogout.length}`)
  const meControl = await call(CONTROL_HOST, '/api/auth/me', { cookie: controlCookie })
  check('der Kontroll-Host bleibt angemeldet (/api/auth/me → 200)', meControl.status === 200, `Status ${meControl.status}`)
  const meA2 = await call(HOST_A, '/api/auth/me', { cookie: second.cookie })
  check('…und A ist abgemeldet → 401', meA2.status === 401, `Status ${meA2.status}`)

  // ── 4. Gestellte eigene Domain für Community B ───────────────────────────
  console.log(`\n4. Eigene Domain für B (gestellt, ${DOMAIN})`)
  const cardBHost = await login(call, HOST_B, person)
  const trustOnPukalani = await call(HOST_B, '/api/posts/trust-levels', { cookie: cardBHost })
  check('Gegenprobe: Owner-Recht unter der Pukalani-Adresse → 200', trustOnPukalani.status === 200, `Status ${trustOnPukalani.status}`)

  const row = await control.getRow(databaseId, 'communities', COMMUNITY_B)
  rowBefore = { customDomain: row.customDomain ?? null, customDomainStatus: row.customDomainStatus ?? null }
  await control.updateRow(databaseId, 'communities', COMMUNITY_B, { customDomain: DOMAIN, customDomainStatus: 'active' })
  console.log(`  … ${RESOLVER_SETTLE_MS / 1000} s Resolver-Zwischenspeicher abwarten`)
  await sleep(RESOLVER_SETTLE_MS)

  const home = await page(HOST_B, '/')
  check('Pukalani-Adresse leitet / auf die Domain', home.status >= 300 && home.status < 400 && String(home.headers.location ?? '').includes(DOMAIN),
    `${home.status} → ${home.headers.location ?? ''}`)
  const dashStays = await page(HOST_B, '/dashboard')
  check('/dashboard unter der Pukalani-Adresse bleibt dort', !String(dashStays.headers.location ?? '').includes(DOMAIN),
    `${dashStays.status} → ${dashStays.headers.location ?? ''}`)
  const dashOnDomain = await page(DOMAIN, '/dashboard')
  check('/dashboard auf der Domain → 302 zur Pukalani-Adresse', dashOnDomain.status === 302 && String(dashOnDomain.headers.location ?? '').includes(HOST_B),
    `${dashOnDomain.status} → ${dashOnDomain.headers.location ?? ''}`)

  const sessionsBeforeDomain = await sessionsOf(person.userId)
  let cardDomain = await login(call, DOMAIN, person)
  const domainSession = (await sessionsOf(person.userId)).find(id => !sessionsBeforeDomain.includes(id)) ?? ''
  check('Anmelden auf der Domain schreibt eine Karte', valueOf(cardDomain).startsWith('c1.'))
  const meDomain = await call(DOMAIN, '/api/auth/me', { cookie: cardDomain })
  check('auf der Domain angemeldet', meDomain.status === 200, `Status ${meDomain.status}`)
  const domainCardOnPukalani = await call(HOST_B, '/api/auth/me', { cookie: cardDomain })
  check('die Karte der Domain gilt unter der Pukalani-Adresse nicht → 401', domainCardOnPukalani.status === 401, `Status ${domainCardOnPukalani.status}`)

  const bell = await call(DOMAIN, '/api/notifications', { cookie: cardDomain })
  check('Mitmachen: Benachrichtigungen auf der Domain → 200', bell.status === 200, `Status ${bell.status}`)
  const blocked = [
    ['Sitzungen', await call(DOMAIN, '/api/auth/sessions', { cookie: cardDomain })],
    ['Export', await call(DOMAIN, '/api/auth/export', { cookie: cardDomain })],
    ['Live-Token', await call(DOMAIN, '/api/auth/realtime-token', { cookie: cardDomain })],
    ['Community-Wechsel', await call(DOMAIN, '/api/community/switch', { method: 'POST', cookie: cardDomain, body: { communityId: COMMUNITY_A }, headers: origin(DOMAIN) })],
    ['Sprung zum Kontroll-Host', await call(DOMAIN, '/api/community/control-handoff', { method: 'POST', cookie: cardDomain, body: { target: 'manage' }, headers: origin(DOMAIN) })],
    ['Betreiber-Bereich', await call(DOMAIN, '/api/admin/comments', { cookie: cardDomain })],
  ]
  for (const [label, res] of blocked) check(`${label} auf der Domain → 404`, res.status === 404, `Status ${res.status}`)
  const trustOnDomain = await call(DOMAIN, '/api/posts/trust-levels', { cookie: cardDomain })
  check('Owner: Verwaltungs-Route unter Produkt-Präfix auf der Domain → 403', trustOnDomain.status === 403, `Status ${trustOnDomain.status}`)

  // ── 4b. Live-Verbindung über unseren Server (E1d) ────────────────────────
  console.log('\n4b. Live-Verbindung über unseren Server')
  check('/api/health meldet liveRelay: true', siteCard.liveRelay === true, `liveRelay=${siteCard.liveRelay}`)
  const plainGet = await call(DOMAIN, '/api/live/realtime', { cookie: cardDomain })
  check('gewöhnliches GET auf /api/live/realtime → 404 (wie unbekannt)', plainGet.status === 404, `Status ${plainGet.status}`)
  const livePath = `/api/live/realtime?project=${encodeURIComponent(poolProject)}`
  const socket = options => openProbeSocket({ port: PORT, host: DOMAIN, path: livePath, origin: `http://${DOMAIN}`, ...options })
  const asGuest = await socket({})
  check('WebSocket als Gast → abgelehnt (401)', asGuest.status === 401, `Status ${asGuest.status}`)
  if (asGuest.close) asGuest.close()
  const foreignOrigin = await socket({ cookie: cardDomain, origin: `http://${HOST_A}` })
  check('WebSocket mit fremder Herkunft → abgelehnt (403)', foreignOrigin.status === 403, `Status ${foreignOrigin.status}`)
  if (foreignOrigin.close) foreignOrigin.close()
  const otherCard = await socket({ cookie: cardBHost })
  check('WebSocket mit der Karte der Pukalani-Adresse → abgelehnt (401)', otherCard.status === 401, `Status ${otherCard.status}`)
  if (otherCard.close) otherCard.close()

  const live = await socket({ cookie: cardDomain })
  check('WebSocket mit der Karte der Domain → angenommen (101)', live.status === 101, `Status ${live.status}`)
  if (live.status === 101) {
    const connected = await live.next(m => m.type === 'connected', 15_000)
    check('connected mit Konto-Id, ohne Konto-Daten', connected?.data?.user?.$id === person.userId && !JSON.stringify(connected).includes(person.email),
      JSON.stringify(connected ?? null).slice(0, 120))
    live.send({ type: 'ping' })
    check('Ping → Pong', !!(await live.next(m => m.type === 'pong', 5000)))

    const notifications = `tablesdb.${poolDatabaseId}.tables.notifications.rows`
    live.send({ type: 'subscribe', data: [
      { subscriptionId: 'live-n', channels: [notifications], queries: [] },
      { subscriptionId: 'live-k', channels: ['account'], queries: [] },
      { subscriptionId: 'live-f', channels: ['files'], queries: [] },
    ] })
    await sleep(1500)
    const tenantOf = async id => (await control.getRow(databaseId, 'communities', id)).tenantId
    const [tenantA, tenantB] = [await tenantOf(COMMUNITY_A), await tenantOf(COMMUNITY_B)]
    const notify = async (tag, tenantId) => {
      const rowId = `live${tag}${stamp}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 36)
      await pool.post(`/tablesdb/${poolDatabaseId}/tables/notifications/rows`, {
        rowId,
        data: { recipientId: person.userId, type: 'replied', title: `Live ${tag}`, body: '', link: '/', read: false, communityId: tenantId },
        permissions: [`read("user:${person.userId}")`],
      })
      cleanup.track('poolRow', `notifications/${rowId}`)
      return rowId
    }
    const rowOther = await notify('a', tenantA)
    const rowOwn = await notify('b', tenantB)
    const own = await live.next(m => m.type === 'event' && m.data?.payload?.$id === rowOwn, 10_000)
    check('Benachrichtigung der eigenen Community kommt live an', !!own && own.data.subscriptions?.join() === 'live-n', JSON.stringify(own?.data?.subscriptions ?? null))
    await sleep(2000)
    check('Benachrichtigung der anderen Community kommt NICHT durch', !live.messages.some(m => m.type === 'event' && JSON.stringify(m).includes(rowOther)))
    check('nicht erlaubter Kanal (files) bekommt nichts', !live.messages.some(m => Array.isArray(m.data?.subscriptions) && m.data.subscriptions.includes('live-f')))

    // Widerruf: die Sitzung der Karte endet (an unserem Code vorbei).
    check('Sitzung der Domain-Karte gefunden', !!domainSession)
    if (domainSession) await pool.delete(`/users/${person.userId}/sessions/${domainSession}`)
    const accountEvent = await live.next(m => m.type === 'event' && (m.data?.events ?? []).some(e => /sessions\.[^.]+\.delete$/.test(e)), 10_000)
    check('Widerruf: Konto-Ereignis kommt, ohne Inhalt', !!accountEvent && JSON.stringify(accountEvent.data.payload) === '{}', JSON.stringify(accountEvent?.data?.payload ?? null).slice(0, 80))
    const denied = await live.next(m => m.type === 'error' && m.data?.code === 401, 10_000)
    check('Widerruf: Fehler 401 wird durchgereicht', !!denied)
    const ended = await Promise.race([live.closed, sleep(10_000).then(() => null)])
    check('Widerruf: unser Server schließt die Verbindung', !!ended, 'nach 10 s noch offen')
    if (!ended) live.close()
    const again = await socket({ cookie: cardDomain })
    check('neuer Aufbau mit der widerrufenen Karte → abgelehnt (401)', again.status === 401, `Status ${again.status}`)
    if (again.close) again.close()
  }
  // Für Schritt 5 eine frische Karte der Domain (die vorige ist widerrufen).
  cardDomain = await login(call, DOMAIN, person)

  // ── 5. Domain abgeschaltet ⇒ Karte wertlos ───────────────────────────────
  console.log('\n5. Domain abgeschaltet')
  const openLive = await openProbeSocket({ port: PORT, host: DOMAIN, path: `/api/live/realtime?project=${encodeURIComponent(poolProject)}`, origin: `http://${DOMAIN}`, cookie: cardDomain })
  check('vor dem Abschalten: Live-Verbindung offen (101)', openLive.status === 101, `Status ${openLive.status}`)
  await control.updateRow(databaseId, 'communities', COMMUNITY_B, { customDomainStatus: 'paused' })
  console.log(`  … ${RESOLVER_SETTLE_MS / 1000} s Resolver-Zwischenspeicher abwarten`)
  await sleep(RESOLVER_SETTLE_MS)
  if (openLive.status === 101) {
    // Die Nachprüfung läuft je Minute; dazu der Zwischenspeicher des Resolvers.
    const closedBy = await Promise.race([openLive.closed, sleep(75_000).then(() => null)])
    check('die offene Live-Verbindung wird geschlossen (Nachprüfung, 4403)', closedBy?.code === 4403, closedBy ? `Code ${closedBy.code}` : 'nach 75 s noch offen')
    if (!closedBy) openLive.close()
  }
  const meAfterPause = await call(DOMAIN, '/api/auth/me', { cookie: cardDomain })
  check('die Karte der Domain ist wertlos (kein Konto mehr dahinter)', meAfterPause.status !== 200 && meAfterPause.json?.email !== person.email,
    `Status ${meAfterPause.status}`)
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message ?? error)
}
finally {
  console.log('\nAufräumen …')
  if (rowBefore) {
    await control.updateRow(databaseId, 'communities', COMMUNITY_B, rowBefore)
      .then(() => check('Zeile von B auf den vorgefundenen Stand zurückgestellt', true))
      .catch(error => check('Zeile von B auf den vorgefundenen Stand zurückgestellt', false, String(error?.message ?? error)))
  }
  const { deleted, leftovers } = await cleanup.run()
  const total = Object.values(deleted).reduce((sum, n) => sum + n, 0)
  console.log(`  gelöscht: ${total} Einträge (Konto samt Sitzungen, Mitglieds-Zeilen, Zeilen des Kontos)`)
  check('aufgeräumt — nachgezählt, nichts übrig', leftovers.length === 0, leftovers.join(', '))
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
