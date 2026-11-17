/**
 * Beweis für N1 — Site-Rollen öffnen das Kunden-Dashboard (Pool-Audit
 * 2026-07-27, wichtigster offener Befund).
 *
 * Fährt den ECHTEN Kundenpfad gegen den laufenden Platform-Server
 * (PLATFORM_PORT, lokal 3006) + das laufende Control Plane (Port 3004, für den
 * Registrierungs-Schalter): zwei Communities anlegen, dann prüfen:
 *   - Owner (User OHNE Operator-Label, nur community_members-owner) → /dashboard
 *     SSR 200 mit GEFILTERTER Nav (Produkte ja, Operator-Module nein)
 *   - derselbe User auf der ANDEREN Community (keine Mitgliedschaft) → 403
 *   - User ganz ohne Rolle → 403 (wie heute)
 *   - Gast ohne Session → Redirect auf /login (wie heute)
 *   - Operator mit admin-Label: ZUGANG über die API unverändert, MENÜ und
 *     SEITE nach Ort — auf dem Mandanten-Host keine Operator-Module und die
 *     Seite 404 (Orts-Wächter), auf dem Kontroll-Host beides (E9, Abschnitt 6)
 *   - der S1-Registrierungs-Schalter ist für den Owner erreichbar
 *     (/dashboard/community SSR 200) und PATCH /api/community/registration
 *     funktioniert end-to-end (Control Plane schreibt, Wert kommt zurück)
 *
 * Räumt am Ende alles weg, was es angelegt hat.
 *
 *   POOL_KEY=… PLATFORM_PORT=3006 node --env-file=apps/control/.env \
 *     packages/onboarding/scripts/verify-dashboard-access.mjs
 *
 * ZWEI LÄUFE HINTEREINANDER laufen in den Rate-Limiter der Onboarding-Route
 * (429 „RATE_LIMITED" beim Anlegen von kunde-a) — das ist die Schutzfunktion,
 * kein Fehlschlag des Beweises. Zwischen zwei Läufen ein paar Minuten warten.
 *
 * Konten, Einladungs-Codes, Communities, Anmeldung und Aufräumen kommen aus
 * der gemeinsamen Hilfe `scripts/lib/probe-stage.mjs` (OPS-009) — der Rumpf
 * der Anlage ist derselbe, den ein Unit-Test gegen die echte Route hält.
 */
import '../../../scripts/lib/assert-target.mjs'
import {
  appwriteRest,
  createCleanup,
  createHttpCaller,
  createProbeAccount,
  createProbeCommunity,
  login,
  runStamp,
  setAccountLabels,
  waitForHost,
} from '../../../scripts/lib/probe-stage.mjs'

const PORT = Number(process.env.PLATFORM_PORT || 3141)
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

const script = 'verify-dashboard-access'
const control = appwriteRest({ endpoint, projectId: controlProject, key: controlKey, script })
const pool = appwriteRest({ endpoint, projectId: poolProject, key: poolKey, script })
const { call, page } = createHttpCaller({ port: PORT })
const cleanup = createCleanup({ pool, control, controlDatabaseId: databaseId })
const stamp = runStamp()

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

async function createPoolUser(tag) {
  const account = await createProbeAccount(pool, { tag: `n1-${tag}`, stamp, name: `N1 ${tag}` })
  cleanup.track('account', account.userId)
  return account
}

async function createCommunity(cookie, slug, name) {
  return createProbeCommunity({
    call, controlHost: CONTROL_HOST, cookie, control, databaseId, slug, name, cleanup,
    bodyOverrides: { description: 'N1-Beweis: Site-Rollen öffnen das Dashboard.', vibe: 'fresh' },
  })
}

/** Nav-Marker im SSR-HTML: Ziel-Pfade der Sidebar (localePath, en = ohne Prefix). */
function hasNav(html, path) {
  return html.includes(`"${path}"`) || html.includes(`href="${path}"`)
}

try {
  console.log(`\nN1-Beweis gegen http://localhost:${PORT} (Pool ${poolProject})\n`)

  const owner = await createPoolUser('owner')
  const nobody = await createPoolUser('nobody')
  const neighbor = await createPoolUser('neighbor')
  const operator = await createPoolUser('operator')
  await setAccountLabels(pool, operator.userId, ['admin'])

  const ownerControlCookie = await login(call, CONTROL_HOST, owner)
  const neighborControlCookie = await login(call, CONTROL_HOST, neighbor)

  console.log('1. Zwei Communities anlegen (kunde-a: Owner-Mitglied, kunde-b: fremd)')
  const siteA = await createCommunity(ownerControlCookie, `n1-kunde-a-${stamp}`, 'N1 Kunde A')
  const siteB = await createCommunity(neighborControlCookie, `n1-kunde-b-${stamp}`, 'N1 Kunde B')
  check('kunde-a angelegt', !!siteA.host, JSON.stringify(siteA))
  check('kunde-b angelegt', !!siteB.host, JSON.stringify(siteB))
  check('kunde-a antwortet', await waitForHost(call, siteA.host))
  check('kunde-b antwortet', await waitForHost(call, siteB.host))

  console.log('\n2. Owner (OHNE Operator-Label) erreicht SEIN Dashboard — SSR')
  const ownerCookieA = await login(call, siteA.host, owner)
  const dashA = await page(siteA.host, '/dashboard', ownerCookieA)
  check('/dashboard → 200', dashA.status === 200, `Status ${dashA.status}`)
  check('Payload spiegelt die Rolle (pukalani-community-role → owner)', dashA.text.includes('pukalani-community-role') && dashA.text.includes('owner'))
  // Nav-Filterung auf einer Seite OHNE Operator-Links im Body (die Overview-
  // Karten verlinken selbst /dashboard/users) — die Sidebar rendert im Layout.
  const settingsA = await page(siteA.host, '/dashboard/settings', ownerCookieA)
  check('/dashboard/settings → 200', settingsA.status === 200, `Status ${settingsA.status}`)
  check('Nav zeigt Produkte: Seiten (/dashboard/pages)', hasNav(settingsA.text, '/dashboard/pages'))
  check('Nav zeigt Produkte: Kommentare (/dashboard/comments)', hasNav(settingsA.text, '/dashboard/comments'))
  check('Nav OHNE Operator-Modul System (/dashboard/system)', !hasNav(settingsA.text, '/dashboard/system'))
  check('Nav OHNE Operator-Modul Admin (/dashboard/admin)', !hasNav(settingsA.text, '/dashboard/admin'))
  check('Nav OHNE People (/dashboard/users)', !hasNav(settingsA.text, '/dashboard/users'))
  check('Nav OHNE Storage (/dashboard/storage)', !hasNav(settingsA.text, '/dashboard/storage'))

  console.log('\n3. Derselbe User auf kunde-b (KEINE Mitgliedschaft) → wie ein Fremder')
  const ownerCookieB = await login(call, siteB.host, owner)
  const dashB = await page(siteB.host, '/dashboard', ownerCookieB)
  check('/dashboard auf kunde-b → 403', dashB.status === 403, `Status ${dashB.status}`)

  console.log('\n4. User ganz ohne Rolle → wie heute abgewiesen')
  const nobodyCookieA = await login(call, siteA.host, nobody)
  const dashNobody = await page(siteA.host, '/dashboard', nobodyCookieA)
  check('/dashboard → 403', dashNobody.status === 403, `Status ${dashNobody.status}`)

  console.log('\n5. Gast ohne Session → Redirect zum Login (wie heute)')
  const dashGuest = await page(siteA.host, '/dashboard')
  check('302 → /login', dashGuest.status === 302 && String(dashGuest.headers.location || '').includes('/login'),
    `Status ${dashGuest.status} → ${dashGuest.headers.location}`)

  console.log('\n6. Operator mit admin-Label → Zugang unverändert, Menü nach ORT (E9)')
  // Bis E9 erwartete dieser Abschnitt die Operator-Module IM MENÜ eines
  // Mandanten-Hosts. Das war der Zustand, den E9 abgeschafft hat („das Menü
  // hört auf zu lügen", 81ac8a93): `scopeVisibleAt` zeigt am Ort einer fremden
  // Community NUR community-Module — auch dem Betreiber. Die Erwartung war
  // überholt, nicht der Code (Paritäts-Audit 2026-08-02).
  //
  // Geprüft wird deshalb jetzt beides getrennt, weil es zwei Dinge sind:
  // das MENÜ (Ort) und der ZUGANG (Capability auf der Route).
  const operatorCookieA = await login(call, siteA.host, operator)
  const dashOperator = await page(siteA.host, '/dashboard', operatorCookieA)
  check('/dashboard → 200', dashOperator.status === 200, `Status ${dashOperator.status}`)
  check('Menü OHNE System (/dashboard/system) — fremder Ort', !hasNav(dashOperator.text, '/dashboard/system'))
  check('Menü OHNE People (/dashboard/users) — fremder Ort', !hasNav(dashOperator.text, '/dashboard/users'))
  // Die SEITE folgt seit dem Orts-Wächter (Davids Entscheidung 2026-08-18,
  // packages/admin/app/middleware/dashboard-scope.global.ts) derselben Regel
  // wie das Menü: eine Betreiber-Seite gibt es auf einem Mandanten-Host nicht
  // (404, nicht 403 — sonst verriete die Antwort, dass es dort etwas gäbe).
  const operatorUsersPage = await page(siteA.host, '/dashboard/users', operatorCookieA)
  check('Seite /dashboard/users auf dem Mandanten-Host → 404 (Orts-Wächter)', operatorUsersPage.status === 404, `Status ${operatorUsersPage.status}`)
  // Break-Glass: die Autorität liegt auf der ROUTE — die bleibt für den Betreiber offen.
  const operatorUsersApi = await call(siteA.host, '/api/admin/users', { cookie: operatorCookieA })
  check('Zugang bleibt: /api/admin/users → 200', operatorUsersApi.status === 200, `Status ${operatorUsersApi.status}`)
  // Gegenprobe zum Ort: auf dem KONTROLL-Host stehen dieselben Module sehr wohl
  // im Menü — sonst wäre der Befund oben nur „Modul verschwunden".
  const operatorControlCookie = await login(call, CONTROL_HOST, operator)
  const dashControl = await page(CONTROL_HOST, '/dashboard', operatorControlCookie)
  check('Kontroll-Host: /dashboard → 200', dashControl.status === 200, `Status ${dashControl.status}`)
  check('Kontroll-Host: Menü MIT System (/dashboard/system)', hasNav(dashControl.text, '/dashboard/system'))
  check('Kontroll-Host: Menü MIT People (/dashboard/users)', hasNav(dashControl.text, '/dashboard/users'))
  // Gegenprobe zum Orts-Wächter: dieselbe Seite steht am richtigen Ort offen —
  // sonst hieße die 404 oben nur „Seite kaputt".
  const controlUsersPage = await page(CONTROL_HOST, '/dashboard/users', operatorControlCookie)
  check('Kontroll-Host: /dashboard/users direkt → 200', controlUsersPage.status === 200, `Status ${controlUsersPage.status}`)

  console.log('\n7. S1-Registrierungs-Schalter: für den Owner erreichbar + PATCH end-to-end')
  const communityPage = await page(siteA.host, '/dashboard/community', ownerCookieA)
  check('Settings → Community SSR 200', communityPage.status === 200, `Status ${communityPage.status}`)
  check('Schalter im Markup (data-community-registration)', communityPage.text.includes('data-community-registration'))

  const closeIt = await call(siteA.host, '/api/community/registration', {
    method: 'PATCH', cookie: ownerCookieA, body: { openRegistration: false },
  })
  check('PATCH openRegistration=false → 200', closeIt.status === 200 && closeIt.json?.openRegistration === false,
    `Status ${closeIt.status} ${closeIt.text.slice(0, 160)}`)
  const tenantAfter = await control.getRow(databaseId, 'communities', siteA.communityId)
  check('Control Plane trägt den Wert (communities.openRegistration=false)', tenantAfter.openRegistration === false,
    JSON.stringify(tenantAfter.openRegistration))
  const reopen = await call(siteA.host, '/api/community/registration', {
    method: 'PATCH', cookie: ownerCookieA, body: { openRegistration: true },
  })
  check('PATCH zurück auf true → 200', reopen.status === 200 && reopen.json?.openRegistration === true, `Status ${reopen.status}`)

  const nobodyPatch = await call(siteA.host, '/api/community/registration', {
    method: 'PATCH', cookie: nobodyCookieA, body: { openRegistration: false },
  })
  check('User ohne Rolle darf NICHT schalten → 403', nobodyPatch.status === 403, `Status ${nobodyPatch.status}`)

  console.log('\n8. Server-Autorität unverändert: Operator-Daten-Routen bleiben für den Owner zu')
  for (const path of ['/api/admin/config', '/api/admin/users', '/api/admin/audit']) {
    const res = await call(siteA.host, path, { cookie: ownerCookieA })
    check(`${path} → 403 für den Site-Owner`, res.status === 403, `Status ${res.status}`)
  }

  console.log('\n9. Eigene Rolle per API (Client-Refresh-Pfad nach Login)')
  const roleRes = await call(siteA.host, '/api/community/role', { cookie: ownerCookieA })
  check('GET /api/community/role → owner', roleRes.status === 200 && roleRes.json?.role === 'owner', JSON.stringify(roleRes.json))
  const roleNobody = await call(siteA.host, '/api/community/role', { cookie: nobodyCookieA })
  check('GET /api/community/role ohne Mitgliedschaft → null', roleNobody.status === 200 && roleNobody.json?.role === null, JSON.stringify(roleNobody.json))
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n10. Aufräumen')
  const { deleted, leftovers } = await cleanup.run()
  const total = Object.values(deleted).reduce((sum, n) => sum + n, 0)
  console.log(`  gelöscht: ${total} Einträge (Konten, Communities, Mitglieds-Zeilen, Codes, Zeilen der Communities)`)
  check('aufgeräumt — nachgezählt, nichts übrig', leftovers.length === 0, leftovers.join(', '))
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
