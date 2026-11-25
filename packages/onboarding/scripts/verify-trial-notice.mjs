/**
 * Beweis für M13 — der Hinweis auf die ablaufende Testphase.
 *
 * Fährt den ECHTEN Weg gegen den laufenden Platform-Server: Community per
 * Wizard anlegen (das setzt `trialEndsAt` auf +14 Tage), dann auf dem
 * Community-Host prüfen, was `GET /api/community/billing/trial` herausgibt und
 * was die pure Regel daraus macht:
 *
 *   1. Frisch angelegt (14 Tage) → die Route kennt das Datum, der Hinweis
 *      SCHWEIGT (nichts zu melden ist der häufigste Fall).
 *   2. Drei Tage vor Schluss → 'ending' mit der richtigen Tageszahl.
 *   3. Zwei Tage NACH dem Ende → 'ended' (die Feststellung, nicht der
 *      Countdown).
 *   4. Lange nach dem Ende → wieder Stille. `trialEndsAt` wird beim Ablauf NICHT
 *      geräumt, ohne diese Grenze stünde der Hinweis für immer im Dashboard.
 *   5. Wer ihn NICHT sehen darf: Gast (401), Fremder (403), Moderator DIESER
 *      Community (403 — `community.billing` trägt nur der Owner), Kontroll-Host
 *      (404 — dort gibt es keine Community und damit keine Testphase).
 *
 * Zwischen den Schritten liegt der 30-s-Cache des Mandanten-Resolvers; das
 * Skript wartet auf den Wechsel, statt zu raten.
 *
 * Räumt am Ende alles weg, was es angelegt hat.
 *
 *   POOL_KEY=… node --experimental-strip-types --env-file=apps/control/.env \
 *     packages/onboarding/scripts/verify-trial-notice.mjs
 *
 * Konten, Einladungs-Code, Community, Anmeldung und Aufräumen kommen aus der
 * gemeinsamen Hilfe `scripts/lib/probe-stage.mjs` (OPS-009).
 */
import '../../../scripts/lib/assert-target.mjs'
import {
  addStageMember,
  appwriteRest,
  createCleanup,
  createHostSessions,
  createHttpCaller,
  createProbeAccount,
  createProbeCommunity,
  runStamp,
  waitForHost,
} from '../../../scripts/lib/probe-stage.mjs'
import { TRIAL_NOTICE_GRACE_DAYS, trialNotice } from '../../control/shared/onboarding.ts'

const PORT = Number(process.env.PLATFORM_PORT || 3006)
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'
const DAY = 24 * 60 * 60 * 1000

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

const script = 'verify-trial-notice'
const control = appwriteRest({ endpoint, projectId: controlProject, key: controlKey, script })
const pool = appwriteRest({ endpoint, projectId: poolProject, key: poolKey, script })
const { call: rawCall } = createHttpCaller({ port: PORT })
/**
 * ANMELDEN JE HOST (PK1 E1c): das Skript reicht je Konto einen Ausweis herum;
 * jeder Aufruf meldet das Konto auf SEINEM Host an (einmal je Host) — im
 * Modus `write` gilt eine Karte nur dort, wie im Browser.
 */
const sessions = createHostSessions(rawCall)
/** @type {typeof rawCall} */
const call = async (host, path, options = {}) => rawCall(host, path, { ...options, cookie: await sessions.cookieFor(host, options.cookie) })
/** Anmelden auf dem Kontroll-Host; zurück kommt der Ausweis des Kontos. */
async function login(account) {
  await sessions.cookieOn(CONTROL_HOST, account)
  return sessions.badge(account)
}
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

/**
 * Probe-Konto. Seit BE-015 verlangt das Anlegen einer Community eine
 * BESTÄTIGTE Adresse — nur der Gründer, die übrigen Konten bleiben, wie der
 * Beweis sie braucht.
 */
async function createPoolUser(tag, { verified = false } = {}) {
  const account = await createProbeAccount(pool, { tag: `m13-${tag}`, stamp, name: `M13 ${tag}`, verified })
  cleanup.track('account', account.userId)
  return account
}

/**
 * Datum umschreiben und warten, bis der Server es sieht. Der Resolver cacht den
 * Host 30 s — ohne dieses Warten prüfte der nächste Schritt noch den alten Wert
 * und das Skript wäre grün, ohne etwas gemessen zu haben.
 */
async function setTrialEndsAt(communityId, host, cookie, iso) {
  await control.updateRow(databaseId, 'communities', communityId, { trialEndsAt: iso })
  // Verglichen wird der ZEITPUNKT, nicht die Zeichenkette: Appwrite gibt
  // Datetimes als `…+00:00` zurück, `toISOString()` schreibt `…Z` — derselbe
  // Moment, zwei Schreibweisen. Ein String-Vergleich wäre hier ewig falsch.
  const want = Date.parse(iso)
  for (let i = 0; i < 45; i++) {
    const res = await call(host, '/api/community/billing/trial', { cookie })
    const got = res.json?.trialEndsAt ? Date.parse(res.json.trialEndsAt) : NaN
    if (res.status === 200 && Math.abs(got - want) < 1000) return res
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return null
}

try {
  console.log(`\nM13-Beweis gegen http://localhost:${PORT} (Pool ${poolProject})\n`)

  const owner = await createPoolUser('owner', { verified: true })
  const stranger = await createPoolUser('stranger')
  const ownerCookie = await login(owner)
  const strangerCookie = await login(stranger)

  console.log('1. Community anlegen (echter Wizard-Abschluss → Testphase läuft)')
  const created = await createProbeCommunity({
    call, controlHost: CONTROL_HOST, cookie: ownerCookie, control, databaseId, cleanup,
    slug: `m13-${stamp}`, name: 'M13 Testphase',
    bodyOverrides: { description: 'Wir prüfen, ob der Hinweis auf die Testphase ehrlich ist.', vibe: 'calm' },
  }).catch((error) => {
    check('angelegt', false, error instanceof Error ? error.message : String(error))
    return null
  })
  if (created) check('angelegt', true)
  const communityId = created?.communityId
  const host = created?.host
  if (!communityId || !host) throw new Error('Ohne Community kein Beweis')

  check('Community-Host antwortet', await waitForHost(call, host), 'Host wurde nicht aufgelöst')

  console.log('\n2. Frisch angelegt: die Route kennt das Datum, der Hinweis schweigt')
  const fresh = await call(host, '/api/community/billing/trial', { cookie: ownerCookie })
  check('Owner bekommt 200', fresh.status === 200, `Status ${fresh.status} ${fresh.text.slice(0, 160)}`)
  const freshEnd = fresh.json?.trialEndsAt ?? null
  const daysAway = freshEnd ? Math.round((Date.parse(freshEnd) - Date.now()) / DAY) : -1
  check('trialEndsAt liegt 14 Tage voraus', daysAway === 14, `${freshEnd} (${daysAway} Tage)`)
  check('… und daraus wird KEIN Hinweis', trialNotice(freshEnd, Date.now()) === null, JSON.stringify(trialNotice(freshEnd, Date.now())))

  console.log('\n3. Wer den Vertragszustand NICHT sehen darf')
  const guest = await call(host, '/api/community/billing/trial')
  check('Gast ohne Session → 401', guest.status === 401, `Status ${guest.status}`)
  const strangerRes = await call(host, '/api/community/billing/trial', { cookie: strangerCookie })
  check('Fremder (eingeloggt, kein Mitglied) → 403', strangerRes.status === 403, `Status ${strangerRes.status}`)

  // Ein Moderator DIESER Community — der plausibelste Fehlgriff: er sieht das
  // Dashboard, aber `community.billing` trägt nur der Owner.
  const mod = await createPoolUser('moderator')
  const modRow = await addStageMember(control, databaseId, {
    communityId, projectId: poolProject, userId: mod.userId, role: 'moderator', status: 'active', email: mod.email,
  })
  cleanup.track('member', modRow.$id)
  const modCookie = await login(mod)
  const modRes = await call(host, '/api/community/billing/trial', { cookie: modCookie })
  check('Moderator dieser Community → 403 (nur der Owner zahlt)', modRes.status === 403, `Status ${modRes.status}`)

  const onControl = await call(CONTROL_HOST, '/api/community/billing/trial', { cookie: ownerCookie })
  check('Kontroll-Host → 404 (dort gibt es keine Community)', onControl.status === 404, `Status ${onControl.status}`)

  console.log('\n4. Drei Tage vor Schluss: der Countdown')
  const soon = new Date(Date.now() + 3 * DAY - 60_000).toISOString()
  const soonRes = await setTrialEndsAt(communityId, host, ownerCookie, soon)
  check('Route gibt das neue Datum heraus', !!soonRes, 'Cache-Wechsel blieb aus')
  const soonNotice = trialNotice(soonRes?.json?.trialEndsAt, Date.now())
  check('Hinweis: „endet in 3 Tagen"',
    soonNotice?.kind === 'ending' && soonNotice.daysLeft === 3, JSON.stringify(soonNotice))

  console.log('\n5. Zwei Tage nach dem Ende: die Feststellung')
  const over = new Date(Date.now() - 2 * DAY).toISOString()
  const overRes = await setTrialEndsAt(communityId, host, ownerCookie, over)
  check('Route gibt das abgelaufene Datum heraus', !!overRes, 'Cache-Wechsel blieb aus')
  const overNotice = trialNotice(overRes?.json?.trialEndsAt, Date.now())
  check('Hinweis: „beendet", ohne weiter zu zählen',
    overNotice?.kind === 'ended' && overNotice.daysLeft === 0, JSON.stringify(overNotice))

  console.log('\n6. Lange danach: wieder Stille (kein Dauer-Verkaufsbanner)')
  const longGone = new Date(Date.now() - (TRIAL_NOTICE_GRACE_DAYS + 1) * DAY).toISOString()
  const longRes = await setTrialEndsAt(communityId, host, ownerCookie, longGone)
  check('Route gibt das alte Datum weiter heraus (nichts wird geräumt)', !!longRes, 'Cache-Wechsel blieb aus')
  // `!!longRes` gehört in die Bedingung: ohne die Route wäre der Wert
  // `undefined`, und „schweigt" wäre trivial wahr — ein Haken ohne Messung.
  check('… und der Hinweis schweigt',
    !!longRes && trialNotice(longRes.json?.trialEndsAt, Date.now()) === null,
    JSON.stringify(trialNotice(longRes?.json?.trialEndsAt, Date.now())))
}
catch (error) {
  fail++
  console.error(`\n✗ Abbruch: ${error instanceof Error ? error.message : String(error)}`)
}
finally {
  console.log('\n7. Aufräumen')
  const { deleted, leftovers } = await cleanup.run()
  const total = Object.values(deleted).reduce((sum, n) => sum + n, 0)
  console.log(`  gelöscht: ${total} Einträge (Konten, Community, Mitglieds-Zeilen, Code, Zeilen der Community)`)
  check('aufgeräumt — nachgezählt, nichts übrig', leftovers.length === 0, leftovers.join(', '))
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
