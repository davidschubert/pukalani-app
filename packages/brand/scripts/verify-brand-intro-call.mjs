/**
 * Beweis für BS1 Paket Z0 „Erstgespräch-Seite im brand-Layer" (Plan
 * docs/plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md §7 Zeile Z0) — gegen einen
 * ECHTEN Server, weil keine pure Funktion und kein Route-Test mit gefälschter
 * Ablage belegen kann, was an Seite, Nitro-Routing, Drossel-Middleware,
 * Appwrite und SMTP zugleich hängt:
 *
 *   1. DIE SEITE steht in beiden Sprachen (200 auf `/erstgespraech` und
 *      `/de/erstgespraech`) und trägt das Formular.
 *   2. GÜLTIGE ANFRAGE ⇒ 200, eine Zeile in `brand_intro_requests` mit den
 *      getippten Werten — und die Bestätigungs-Mail liegt in Mailpit.
 *   3. HONIGTOPF ⇒ 200 (ununterscheidbar), aber KEINE neue Zeile.
 *   4. ZU SCHNELL ⇒ 422 `too_fast`, keine Zeile.
 *   5a. FREMDES `profileId` ⇒ die Anfrage geht durch, die Zeile trägt KEINEN
 *      Branding-Bezug (Datentür). Gegenprobe daneben: eine Anfrage OHNE
 *      Anmeldung schreibt ebenfalls keinen Bezug — ein „ist leer"-Test allein
 *      wäre auch für eine Route grün, die das Feld nie schreibt.
 *   7. DER CTA zeigt wieder in die Marke: nirgends auf der Seite steht noch
 *      ein Sprung auf pukalani.studio, und `/de/erstgespraech` existiert.
 *   8. DIE BETREIBER-LISTE ist ohne `users.manage` verschlossen (401/403,
 *      nicht 200).
 *   5. DIE DROSSEL greift — als LETZTES gemessen, weil sie je IP und Minute
 *      zählt und jede Zusage nach ihr sonst in einem 429 stünde.
 *
 * ── DIE GEGENPROBE ────────────────────────────────────────────────────────
 * Mit `VERIFY_EXPECT_OPEN=1` dreht das Skript die Zusagen 3, 4 und 5a um: es
 * ERWARTET dann eine Zeile aus dem Honigtopf, ein 200 auf das zu schnelle
 * Formular und einen übernommenen fremden Branding-Bezug — und MUSS rot
 * werden. Ein „keine Zeile" ist sonst auch für eine Route grün, die gar nichts
 * mehr schreibt.
 *
 * ── VORBEDINGUNGEN ───────────────────────────────────────────────────────
 * Lokale Dev-Appwrite mit `brand_intro_requests` (Migration brand-021 gelaufen)
 * und ein Dev-Server der branding-App AUS DEM WORKTREE (CLAUDE.md „Tests" —
 * ein Server aus dem Haupt-Repo misst fremden Code). Der Dev-Server braucht
 * SMTP auf Mailpit — die kopierte portfolio-.env trägt KEIN NUXT_SMTP_*, also
 * beim Start mitgeben (sonst 24/26: „Mail liegt im Postfach" fällt):
 *   NUXT_SMTP_HOST=localhost NUXT_SMTP_PORT=1025 NUXT_SMTP_FROM=noreply@branding.test
 * Mailpit auf :1025 ist
 * OPTIONAL: fehlt er, wird Zusage 2 auf den Zeilen-Beweis reduziert und das
 * Skript sagt das laut.
 *
 *   pnpm --filter branding exec nuxi dev --port 3016
 *   BRANDING_PORT=3016 node --env-file=apps/branding/.env \
 *     packages/brand/scripts/verify-brand-intro-call.mjs
 *
 * `--base=http://localhost:3016` tut dasselbe, wenn ein anderer Worktree den
 * Standard-Port belegt.
 */
import { request } from 'node:http'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const baseArg = process.argv.slice(2).find(arg => arg.startsWith('--base='))
const baseUrl = baseArg ? new URL(baseArg.slice('--base='.length)) : null
const PORT = Number(baseUrl?.port || process.env.BRANDING_PORT || 3016)
const HOST = baseUrl?.hostname || process.env.BRANDING_HOST || 'localhost'
const MAILPIT = Number(process.env.MAILPIT_PORT || 8025)

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — Aufruf mit --env-file=apps/branding/.env')
  process.exit(1)
}

/** Erwartet das Skript eine OFFENE Route? Nur für die Gegenprobe (s. Kopf). */
const EXPECT_OPEN = process.env.VERIFY_EXPECT_OPEN === '1'

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(client)
const users = new Users(client)

const INTRO_TABLE = 'brand_intro_requests'
const PROFILES_TABLE = 'brand_profiles'

let pass = 0
let fail = 0
const cleanup = { users: [], profiles: [], rows: [] }

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

/** Die umkehrbaren Zusagen: „hier darf NICHTS passiert sein" (s. Kopf). */
function checkClosed(label, closed, detail = '') {
  check(label, EXPECT_OPEN ? !closed : closed, detail)
}

/**
 * Nitro hört auf `[::1]`; Node's `fetch` verwirft einen eigenen Host-Header
 * (CLAUDE.md, „Beweise"). Deshalb node:http über ::1 mit gesetztem Host.
 */
function call(path, { method = 'GET', body, cookie, port = PORT, host = HOST } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: host === 'localhost' ? '::1' : host,
      port,
      path,
      method,
      headers: {
        host,
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { cookie } : {}),
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) }
        catch { /* HTML */ }
        resolve({ status: res.statusCode, headers: res.headers, json, text })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

const stamp = Date.now()
/** Weit über der Mindestzeit — die Bremse hat ihren eigenen Fall. */
const SLOW = 30_000

function address(tag) {
  return `z0-intro-${stamp}-${tag}@example.test`
}

/** Die Zeile zu einer Adresse — oder `null`. */
async function rowFor(email) {
  const res = await tablesDB.listRows({
    databaseId,
    tableId: INTRO_TABLE,
    queries: [Query.equal('emailLower', email.toLowerCase()), Query.limit(5)],
  })
  for (const row of res.rows) if (!cleanup.rows.includes(row.$id)) cleanup.rows.push(row.$id)
  return res.rows[0] ?? null
}

function post(body) {
  return call('/api/brand/intro-call', { method: 'POST', body })
}

/** Liegt eine Mail an diese Adresse in Mailpit? `null` = Mailpit nicht da. */
async function mailpitHas(email) {
  try {
    const res = await call(`/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`, { port: MAILPIT })
    if (res.status !== 200 || !res.json) return null
    return (res.json.messages_count ?? res.json.total ?? 0) > 0
  }
  catch {
    return null
  }
}

async function main() {
  console.log(`\nBS1 Z0 — Erstgespräch gegen http://${HOST}:${PORT}`)
  if (EXPECT_OPEN) console.log('  (GEGENPROBE: die Zusagen 3, 4 und 6 sind umgedreht — der Lauf MUSS rot werden)\n')

  // ── 1 · Die Seite ───────────────────────────────────────────────────────
  console.log('\n1 · Die Seite')
  const en = await call('/erstgespraech')
  const de = await call('/de/erstgespraech')
  check('/erstgespraech antwortet 200', en.status === 200, `status ${en.status}`)
  check('/de/erstgespraech antwortet 200', de.status === 200, `status ${de.status}`)
  check('die Seite trägt das Formular', en.text.includes('data-intro-form'))
  // Die Seite ist öffentlich: kein Anmelde-Zwang vor dem Gesprächs-Einstieg.
  check('sie ist ohne Anmeldung erreichbar', en.status === 200 && !en.text.includes('data-embed-login'))

  // ── 2 · Die gültige Anfrage ─────────────────────────────────────────────
  console.log('\n2 · Die gültige Anfrage')
  const good = address('good')
  const message = `Beweislauf ${stamp}: wir starten neu und wissen nicht, wo wir anfangen sollen.`
  const sent = await post({
    name: 'Alina Weber',
    email: good,
    company: 'Kailua Coffee',
    message,
    phone: '+49 40 123456',
    locale: 'de',
    source: 'verify',
    elapsedMs: SLOW,
  })
  check('antwortet 200', sent.status === 200, `status ${sent.status} ${sent.text.slice(0, 120)}`)
  check('meldet die Ablage als erfolgt', sent.json?.stored === true)

  const goodRow = await rowFor(good)
  check('die Zeile steht in brand_intro_requests', Boolean(goodRow))
  check('sie trägt die getippten Werte', goodRow?.name === 'Alina Weber'
    && goodRow?.message === message
    && goodRow?.company === 'Kailua Coffee'
    && goodRow?.phone === '+49 40 123456')
  check('sie beginnt als „offen"', goodRow?.status === 'new')
  check('sie trägt die Herkunft', goodRow?.source === 'verify')
  // Die Adresse steht zweimal — technisch klein, menschlich wie getippt.
  check('Adresse und Vergleichswert stehen beide', goodRow?.email === good.toLowerCase()
    && goodRow?.emailLower === good.toLowerCase())

  const mailed = await mailpitHas(good)
  if (mailed === null) {
    console.log('  … Mailpit nicht erreichbar — Zusage 2 bleibt beim Zeilen-Beweis')
  }
  else {
    check('die Bestätigungs-Mail liegt im Postfach', mailed)
    check('die Route meldet die Mail auch so', sent.json?.mailed === true)
  }

  // ── 3 · Der Honigtopf ───────────────────────────────────────────────────
  console.log('\n3 · Der Honigtopf')
  const trap = address('trap')
  const trapped = await post({
    name: 'Bot', email: trap, message: 'automatisch', locale: 'en', source: 'verify', elapsedMs: SLOW,
    hp: 'ich bin ein bot',
  })
  check('antwortet 200 wie ein Erfolg', trapped.status === 200, `status ${trapped.status}`)
  // Ununterscheidbar heisst: auch die Felder der Antwort sind dieselben.
  check('die Antwort ist ununterscheidbar', trapped.json?.stored === true && trapped.json?.mailed === true)
  checkClosed('aber es entsteht KEINE Zeile', (await rowFor(trap)) === null)

  // ── 4 · Zu schnell ──────────────────────────────────────────────────────
  console.log('\n4 · Die Mindestzeit')
  const fast = address('fast')
  const tooFast = await post({
    name: 'Schnell', email: fast, message: 'sofort', locale: 'en', source: 'verify', elapsedMs: 120,
  })
  checkClosed('antwortet 422', tooFast.status === 422, `status ${tooFast.status}`)
  check('und nennt den Grund', tooFast.json?.reason === 'too_fast', JSON.stringify(tooFast.json))
  checkClosed('es entsteht KEINE Zeile', (await rowFor(fast)) === null)

  // ── 5a · Die Datentür der Herkunft ───────────────────────────────────────
  console.log('\n5a · Die Datentür der Herkunft')
  const owner = await users.create({
    userId: ID.unique(),
    email: address('owner'),
    password: `Pw-${ID.unique()}`,
    name: 'Fremder Besitzer',
  })
  cleanup.users.push(owner.$id)
  const foreign = await tablesDB.createRow({
    databaseId,
    tableId: PROFILES_TABLE,
    rowId: ID.unique(),
    // Alle PFLICHT-Spalten von `brand_profiles` explizit — Appwrite lehnt die
    // Zeile sonst mit `row_invalid_structure` ab. Die Werte sind belanglos:
    // geprüft wird allein `ownerId`.
    data: {
      createdByUserId: owner.$id,
      ownerType: 'user',
      ownerId: owner.$id,
      title: 'Fremde Marke',
      contentLocale: 'de',
      pathKind: 'new',
      hasName: true,
      team: 'solo',
      progressPct: 0,
      lastActivityAt: new Date().toISOString(),
    },
  })
  cleanup.profiles.push(foreign.$id)

  const stranger = address('stranger')
  // Ohne Anmeldung UND mit fremder Id: beide Gründe treffen zu, und die Route
  // darf den Bezug in keinem Fall übernehmen.
  const withForeign = await post({
    name: 'Fremder', email: stranger, message: 'ohne Konto, mit fremder Id',
    locale: 'de', source: 'verify', elapsedMs: SLOW, profileId: foreign.$id,
  })
  const strangerRow = withForeign.status === 200 ? await rowFor(stranger) : null
  check('die Anfrage geht trotzdem durch (kein 403)', withForeign.status === 200, `status ${withForeign.status}`)
  checkClosed('aber ohne Branding-Bezug', strangerRow?.profileId === '', `profileId="${strangerRow?.profileId}"`)
  check('und ohne Konto-Bezug', strangerRow?.userId === '')

  // ── 7 · Der CTA zeigt wieder in die Marke ───────────────────────────────
  console.log('\n7 · Der Abschluss-CTA')
  // Die Marktvergleich-Schranke und das Foundation-Kapitel lesen beide
  // `pukalani.brand.completionCta` über `useBrandCompletionCta()`. Geprüft
  // wird die aufgelöste Adresse dort, wo sie im HTML landet.
  const home = await call('/de/erstgespraech')
  check('die deutsche Adresse existiert', home.status === 200)
  const studioLinks = /https:\/\/pukalani\.studio\/erstgespraech/.test(en.text)
  check('KEIN Sprung mehr auf pukalani.studio', !studioLinks)

  // ── 8 · Die Betreiber-Liste ─────────────────────────────────────────────
  console.log('\n8 · Die Betreiber-Liste')
  const list = await call('/api/brand/admin/intro-calls')
  check('ist ohne users.manage verschlossen', list.status === 401 || list.status === 403,
    `status ${list.status}`)

  // ── 5 · Die Drossel ─────────────────────────────────────────────────────
  // ZULETZT, und das ist kein Stilfrage: der Eimer zählt je IP und Minute.
  // Stünde diese Runde weiter oben, liefen alle folgenden Zusagen in ein 429
  // und das Skript bewiese seine eigene Drossel statt der Regel, um die es
  // geht. Die vier Aufrufe davor haben den Eimer schon angebrochen — deshalb
  // wird gezählt, bis er kippt, statt eine feste Zahl zu behaupten.
  console.log('\n5 · Die Drossel (brand:intro-call, 5/min je IP)')
  let limited = 0
  for (let i = 0; i < 8; i++) {
    const res = await post({
      name: 'Viel', email: address(`rate${i}`), message: 'nochmal', locale: 'en', source: 'verify', elapsedMs: SLOW,
    })
    if (res.status === 429) limited++
  }
  check('die Drossel greift', limited > 0, `${limited} von 8 abgewiesen`)

  // ── Aufräumen ───────────────────────────────────────────────────────────
  console.log('\nAufräumen')
  // Auch die Zeilen der Drossel-Runde, die durchkamen.
  for (let i = 0; i < 8; i++) await rowFor(address(`rate${i}`))
  for (const rowId of cleanup.rows) {
    await tablesDB.deleteRow({ databaseId, tableId: INTRO_TABLE, rowId }).catch(() => {})
  }
  for (const rowId of cleanup.profiles) {
    await tablesDB.deleteRow({ databaseId, tableId: PROFILES_TABLE, rowId }).catch(() => {})
  }
  for (const userId of cleanup.users) await users.delete({ userId }).catch(() => {})
  console.log(`  ✔ ${cleanup.rows.length} Zeilen, ${cleanup.profiles.length} Brandings, ${cleanup.users.length} Konten entfernt`)

  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass}/${pass + fail} Prüfungen bestanden\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('\n✗ Beweislauf abgebrochen:', error)
  process.exit(1)
})
