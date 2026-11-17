/**
 * Beweis für F12 — die Kunden-Übersicht auf `account.*`.
 *
 * Fährt den ECHTEN Weg gegen den laufenden Platform-Server: zwei Communities
 * per Wizard anlegen, Mitgliedschaften setzen, und dann messen, WAS WER SIEHT
 * und WOHIN `/` führt.
 *
 *   1. Die Liste zeigt GENAU die eigenen Communities — nie die fremde.
 *   2. Die Testphase steht nur beim Owner (`community.billing`); als Viewer
 *      derselben Community ist sie null. Der Plan steht bei beiden (er steckt
 *      ohnehin im SSR-Payload jeder Community-Seite).
 *   3. Ein ENTFERNTES Mitglied (status 'removed') sieht die Community nicht.
 *   4. Der Umschlag trägt nur die sechs Felder der Ansicht — kein
 *      stripeCustomerId, kein projectId, kein tenantId.
 *   5. Kanten: Gast → 401, Mandanten-Host → 404 (Route UND Seite).
 *   6. Die Wege auf dem EINEN Kontroll-Host (seit AH-1 `account.`, lokal
 *      `app.localhost`): `/` → Account-Startseite (AH-2) · leeres Konto → weiter in den
 *      Wizard · ausgeloggt → Login mit `?redirect=` · `?code=` schlägt die
 *      Übersicht. Die Vorgänger `my.` und `start.` antworten 301 auf den
 *      Kontroll-Host, Pfad und Query unverändert — ein `?code=` aus einer
 *      alten Einladungs-Mail kommt so im Wizard an.
 *
 * Räumt am Ende alles weg, was es angelegt hat.
 *
 *   POOL_KEY=… node --experimental-strip-types --env-file=apps/control/.env \
 *     packages/onboarding/scripts/verify-my-overview.mjs
 */
import '../../../scripts/lib/assert-target.mjs'
import {
  addStageMember,
  appwriteRest,
  createCleanup,
  createHttpCaller,
  createProbeAccount,
  createProbeCommunity,
  login as loginOn,
  runStamp,
  waitForHost as waitForHostOn,
} from '../../../scripts/lib/probe-stage.mjs'

const PORT = Number(process.env.PLATFORM_PORT || 3006)
// Seit AH-1 gibt es EINEN Kontroll-Host (`account.pukalani.app`, lokal
// `app.localhost`) — er trägt Übersicht UND Wizard.
const MY_HOST = process.env.CONTROL_HOST || 'app.localhost'
// Die abgeschalteten Vorgänger (`legacyControlHosts` in
// apps/platform/app/app.config.ts) — sie leiten mit 301 auf den Kontroll-Host.
const LEGACY_MY_HOST = process.env.LEGACY_MY_HOST || 'my.pukalani.app'
const LEGACY_START_HOST = process.env.LEGACY_START_HOST || 'start.pukalani.app'

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

const script = 'verify-my-overview'
const control = appwriteRest({ endpoint, projectId: controlProject, key: controlKey, script })
const pool = appwriteRest({ endpoint, projectId: poolProject, key: poolKey, script })
const cleanup = createCleanup({ pool, control, controlDatabaseId: databaseId })
const http = createHttpCaller({ port: PORT })
const runId = runStamp()

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

/** HTTP mit Host-Kopfzeile; `location` gleich mit herausgezogen. */
async function call(host, path, options) {
  const res = await http.call(host, path, options)
  return { ...res, location: String(res.headers.location ?? '') }
}

/** Probe-Konto. Seit BE-015 verlangt das Anlegen einer Community eine BESTÄTIGTE Adresse. */
async function createPoolUser(tag) {
  const account = await createProbeAccount(pool, { tag: `f12-${tag}`, stamp: runId, name: `F12 ${tag}` })
  cleanup.track('account', account.userId)
  return account
}

const login = account => loginOn(http.call, MY_HOST, account)

async function createCommunity(cookie, name, slug) {
  // Anlage über die echte Route `POST /api/onboarding/site` — Rumpf, Code und
  // Aufräumen kommen aus der gemeinsamen Hilfe (scripts/lib/probe-stage.mjs).
  const created = await createProbeCommunity({
    call: http.call, controlHost: MY_HOST, cookie, control, databaseId, slug, name, cleanup,
    bodyOverrides: { description: 'Beweis für die Kunden-Übersicht im Kundenbereich.', vibe: 'calm' },
  })
  return { communityId: created.communityId, host: created.host }
}

async function addMember(communityId, user, role, status) {
  const row = await addStageMember(control, databaseId, {
    communityId, projectId: poolProject, userId: user.userId, role, status, email: user.email,
  })
  cleanup.track('member', row.$id)
  if (status === 'removed') await control.updateRow(databaseId, 'community_members', row.$id, { removedAt: new Date().toISOString() })
  return row.$id
}

/** Der Host-Resolver cacht negativ (30 s) — nach der Anlage kurz nachfassen. */
const waitForHost = host => waitForHostOn(http.call, host)

const mine = (cookie, host = MY_HOST) => call(host, '/api/onboarding/communities', { cookie })
/** Ziel einer Weiterleitung ohne Locale-Prefix (prefix_except_default). */
const withoutLocale = path => (path.split('?')[0] || '').replace(/^\/(de|en)(?=\/|$)/, '') || '/'

try {
  console.log(`\nF12-Beweis gegen http://localhost:${PORT} (Pool ${poolProject})\n`)

  const alice = await createPoolUser('alice')
  const bob = await createPoolUser('bob')
  const stranger = await createPoolUser('stranger')
  const exiled = await createPoolUser('exiled')

  const aliceCookie = await login(alice)
  const bobCookie = await login(bob)
  const strangerCookie = await login(stranger)
  const exiledCookie = await login(exiled)

  console.log('1. Zwei Communities per Wizard anlegen')
  const a = await createCommunity(aliceCookie, 'Alice Community', `f12a-${runId}`)
  const b = await createCommunity(bobCookie, 'Bobs Verein', `f12b-${runId}`)
  check('Alice-Community steht', !!a.communityId, JSON.stringify(a))
  check('Bob-Community steht', !!b.communityId, JSON.stringify(b))
  check('Community-Host antwortet', await waitForHost(a.host), 'Host wurde nicht aufgelöst')

  // Alice ist zusätzlich MITGLIED (viewer) bei Bob — der Fall, an dem sich die
  // Testphasen-Grenze zeigt. Exiled war Mitglied bei Alice und wurde entfernt.
  await addMember(b.communityId, alice, 'viewer', 'active')
  await addMember(a.communityId, exiled, 'viewer', 'removed')

  console.log('\n2. Wer sieht was?')
  const aliceList = await mine(aliceCookie)
  check('Alice bekommt 200', aliceList.status === 200, `${aliceList.status} ${aliceList.text.slice(0, 160)}`)
  const aliceHosts = (aliceList.json?.communities ?? []).map(c => c.host)
  check('Alice sieht GENAU ihre beiden (eigene zuerst)',
    JSON.stringify(aliceHosts) === JSON.stringify([a.host, b.host]), JSON.stringify(aliceHosts))

  const bobList = await mine(bobCookie)
  const bobHosts = (bobList.json?.communities ?? []).map(c => c.host)
  check('Bob sieht NUR seine — nicht die von Alice',
    JSON.stringify(bobHosts) === JSON.stringify([b.host]), JSON.stringify(bobHosts))

  const strangerList = await mine(strangerCookie)
  check('Wer nirgends Mitglied ist, sieht nichts',
    strangerList.status === 200 && (strangerList.json?.communities ?? []).length === 0,
    `${strangerList.status} ${strangerList.text.slice(0, 160)}`)

  const exiledList = await mine(exiledCookie)
  check('Ein ENTFERNTES Mitglied sieht die Community NICHT (status removed)',
    exiledList.status === 200 && (exiledList.json?.communities ?? []).length === 0,
    JSON.stringify(exiledList.json))

  console.log('\n3. Die Testphase sieht nur, wer abrechnet')
  const aliceOwn = aliceList.json?.communities?.[0]
  const aliceGuest = aliceList.json?.communities?.[1]
  check('als OWNER: Rolle owner + Testphasen-Datum',
    aliceOwn?.role === 'owner' && typeof aliceOwn?.trialEndsAt === 'string', JSON.stringify(aliceOwn))
  check('als VIEWER derselben Zeile: Rolle viewer + trialEndsAt null',
    aliceGuest?.role === 'viewer' && aliceGuest?.trialEndsAt === null, JSON.stringify(aliceGuest))
  check('der PLAN steht bei beiden (steckt ohnehin im SSR-Payload jeder Community)',
    aliceOwn?.plan === 'pro' && aliceGuest?.plan === 'pro',
    `${aliceOwn?.plan} / ${aliceGuest?.plan}`)

  console.log('\n4. Der Umschlag trägt nur die Ansicht')
  const keys = Object.keys(aliceOwn ?? {}).sort()
  check('genau {communityId, host, name, plan, readOnly, role, suspension, trialEndsAt}',
    JSON.stringify(keys) === JSON.stringify(['communityId', 'host', 'name', 'plan', 'readOnly', 'role', 'suspension', 'trialEndsAt']),
    JSON.stringify(keys))
  // M13: `suspension` ist seit control-034 Teil der Ansicht — die Karte muss
  // sagen können, warum eine Community nicht klickbar ist. Wie `trialEndsAt`
  // trägt sie den Wert NUR für Rollen mit `community.billing`.
  check('der Sperrzustand steht beim Owner (hier: nicht gesperrt)', aliceOwn?.suspension === '', JSON.stringify(aliceOwn?.suspension))
  check('… und beim Mitleser IMMER leer', aliceGuest?.suspension === '', JSON.stringify(aliceGuest?.suspension))
  check('ungesperrt heißt bei beiden readOnly false',
    aliceOwn?.readOnly === false && aliceGuest?.readOnly === false,
    `${aliceOwn?.readOnly} / ${aliceGuest?.readOnly}`)

  // ── Befund 2 des Wechselwirkungs-Audits ───────────────────────────────────
  // Vorher blankte die Projektion BEIDES für Rollen ohne `community.billing`:
  // ein Viewer sah eine völlig normale Karte in eine Community, in der jeder
  // Schreibversuch abgewiesen wird. Jetzt trennt sie DASS (jede Karte) von
  // WARUM (nur der Abrechnende).
  //
  // GENAU EIN zusätzlicher Abruf, und das ist keine Sparsamkeit um ihrer
  // selbst willen: `GET /api/onboarding/communities` ist auf 10 pro Minute und
  // IP gedrosselt (05.rate-limit.ts), und dieser Beweis liegt schon dicht
  // darunter — die SSR-Abrufe der Seiten in Abschnitt 6/7 zählen mit. Zwei
  // Abrufe mehr, und der Beweis meldet 429 statt der Sache, um die es geht.
  // Alice reicht dafür: sie ist Viewer in Bobs Community UND Owner ihrer
  // eigenen, also stehen beide Blickwinkel in EINER Antwort. Die Owner-Sicht
  // auf die gesperrte Zeile beweist verify-community-suspension (Abschnitt 7).
  console.log('\n4b. Nur-lesend: DASS sieht jede Rolle, WARUM nur der Abrechnende')
  await control.updateRow(databaseId, 'communities', b.communityId,
    { suspension: 'billing', suspensionReason: 'Beweis: Rechnung offen.', suspendedAt: new Date().toISOString() })
  const suspendedList = (await mine(aliceCookie)).json?.communities ?? []
  const asViewer = suspendedList.find(c => c.communityId === b.communityId)
  const asOwner = suspendedList.find(c => c.communityId === a.communityId)
  check('Viewer der gesperrten Community: Karte steht, readOnly true — aber OHNE Grund',
    asViewer?.readOnly === true && asViewer?.suspension === '', JSON.stringify(asViewer))
  check('… die eigene, gesunde Community daneben bleibt readOnly false',
    asOwner?.readOnly === false && asOwner?.suspension === '', JSON.stringify(asOwner))
  await control.updateRow(databaseId, 'communities', b.communityId,
    { suspension: '', suspensionReason: '', suspendedAt: null })

  console.log('\n5. Kanten der Route')
  const guest = await mine(null)
  check('Gast ohne Session → 401', guest.status === 401, `Status ${guest.status}`)
  const onTenant = await mine(aliceCookie, a.host)
  check('auf einem Mandanten-Host → 404 (Betreiber-Inhalt gehört dort nicht hin)',
    onTenant.status === 404, `Status ${onTenant.status}`)
  const pageOnTenant = await call(a.host, '/communities', { cookie: aliceCookie })
  check('… und die SEITE dort ebenso → 404', pageOnTenant.status === 404, `Status ${pageOnTenant.status}`)

  console.log('\n6. Wohin führt `/`?')
  // Seit AH-2 (2026-08-11) ist `/` auf dem Kontroll-Host eine SEITE, keine
  // Weiterleitung mehr: die Account-Startseite mit den Wegen in die Bereiche
  // (packages/onboarding/app/middleware/control-center.global.ts, Kopf).
  const myRoot = await call(MY_HOST, '/', { cookie: aliceCookie, accept: 'text/html' })
  check('Kontroll-Host / (eingeloggt) → Account-Startseite mit dem Weg zur Übersicht',
    myRoot.status === 200 && myRoot.text.includes('data-account-home') && myRoot.text.includes('data-account-card="communities"'),
    `${myRoot.status} → ${myRoot.location || 'ohne Weiterleitung'}`)

  const emptyRoot = await call(MY_HOST, '/communities', { cookie: strangerCookie })
  check('Kontroll-Host /communities mit 0 Communities → weiter in den Wizard',
    emptyRoot.status === 302 && withoutLocale(emptyRoot.location) === '/start',
    `${emptyRoot.status} → ${emptyRoot.location}`)

  // Der Auth-Guard hängt das Ziel als `?redirect=` an (safeRedirectTarget) —
  // nach der Anmeldung geht es also auf die Übersicht zurück, nicht auf `/`.
  const loggedOut = await call(MY_HOST, '/communities')
  const redirectsToCommunities = raw =>
    withoutLocale(raw) === '/login' && /redirect=(%2F|\/)(de(%2F|\/)|en(%2F|\/))?communities/.test(raw)
  check('Kontroll-Host /communities ausgeloggt → Login mit `?redirect=` auf die Übersicht',
    loggedOut.status === 302 && redirectsToCommunities(loggedOut.location),
    `${loggedOut.status} → ${loggedOut.location}`)

  // Die Startseite selbst verlangt die Anmeldung — Rückziel ist dann `/`.
  const rootLoggedOut = await call(MY_HOST, '/')
  check('Kontroll-Host / ausgeloggt → Login mit `?redirect=` zurück auf die Startseite',
    rootLoggedOut.status === 302 && withoutLocale(rootLoggedOut.location) === '/login'
    && /redirect=(%2F|\/)(de(%2F|\/)?|en(%2F|\/)?)?(&|$)/.test(rootLoggedOut.location),
    `${rootLoggedOut.status} → ${rootLoggedOut.location}`)

  // Seit AH-1 gibt es keinen eigenen Wizard-Host mehr: `start.` und `my.`
  // antworten 301 auf den Kontroll-Host, Pfad und Query unverändert
  // (.claude/rules/hosts-ops.md, „account.pukalani.app"). Geprüft wird das
  // Ziel als Host + Pfad + Query — nicht nur „irgendeine Weiterleitung".
  const legacyTarget = (raw) => {
    try {
      const url = new URL(raw)
      return { host: url.host, path: url.pathname, search: url.search }
    }
    catch { return null }
  }
  const startCode = await call(LEGACY_START_HOST, '/?code=PUKA-DEMO-1234', { cookie: aliceCookie })
  const startTarget = legacyTarget(startCode.location)
  check('alter Name start./?code=… → 301 auf den Kontroll-Host, Code bleibt',
    startCode.status === 301 && startTarget?.host === MY_HOST && startTarget.path === '/' && startTarget.search === '?code=PUKA-DEMO-1234',
    `${startCode.status} → ${startCode.location}`)

  const myLegacy = await call(LEGACY_MY_HOST, '/communities')
  const myTarget = legacyTarget(myLegacy.location)
  check('alter Name my./communities → 301 auf dieselbe Seite des Kontroll-Hosts',
    myLegacy.status === 301 && myTarget?.host === MY_HOST && myTarget.path === '/communities',
    `${myLegacy.status} → ${myLegacy.location}`)

  const myCode = await call(MY_HOST, '/?code=PUKA-DEMO-1234', { cookie: aliceCookie })
  check('Kontroll-Host /?code=… → der Code schlägt die Übersicht (weitergeleitete Mail)',
    myCode.status === 302
    && withoutLocale(myCode.location) === '/start'
    && myCode.location.includes('code=PUKA-DEMO-1234'),
    `${myCode.status} → ${myCode.location}`)

  console.log('\n7. Die Seite rendert die Karten')
  const page = await call(MY_HOST, '/communities', { cookie: aliceCookie })
  check('Übersicht liefert 200', page.status === 200, `Status ${page.status}`)
  check('… mit einer Karte je Community',
    page.text.includes(`data-community-host="${a.host}"`) && page.text.includes(`data-community-host="${b.host}"`),
    page.text.slice(0, 200))
  check('… und ohne die fremde Community',
    !page.text.includes('f12b-fremd'), 'fremder Host im HTML')
}
catch (error) {
  fail++
  console.error(`\n✗ Abbruch: ${error instanceof Error ? error.message : String(error)}`)
}
finally {
  console.log('\n8. Aufräumen')
  const { deleted, leftovers } = await cleanup.run()
  const total = Object.values(deleted).reduce((sum, n) => sum + n, 0)
  console.log(`  gelöscht: ${total} Einträge (Konten, Communities, Mitglieds-Zeilen, Codes, Zeilen der Communities)`)
  check('aufgeräumt — nachgezählt, nichts übrig', leftovers.length === 0, leftovers.join(', '))
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
