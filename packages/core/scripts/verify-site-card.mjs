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
 *   5. Domain abgeschaltet (`paused`) ⇒ die Karte der Domain ist wertlos.
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

  const cardDomain = await login(call, DOMAIN, person)
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

  // ── 5. Domain abgeschaltet ⇒ Karte wertlos ───────────────────────────────
  console.log('\n5. Domain abgeschaltet')
  await control.updateRow(databaseId, 'communities', COMMUNITY_B, { customDomainStatus: 'paused' })
  console.log(`  … ${RESOLVER_SETTLE_MS / 1000} s Resolver-Zwischenspeicher abwarten`)
  await sleep(RESOLVER_SETTLE_MS)
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
