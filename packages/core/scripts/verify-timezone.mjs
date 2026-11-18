/**
 * Beweis für die Konto-Zeitzone (U15 Teil 5).
 *
 * Geprüft wird die GANZE Kette an einem laufenden Server, nicht nur die reine
 * Rechnung (die deckt packages/core/tests/format.test.ts ab):
 *
 *   1. Gast   → PUT /api/auth/timezone  = 401
 *   2. Unsinn → PUT mit `Mars/Olympus`  = 400 (fail-closed gegen die
 *      Zonenliste der Laufzeit — ein Tippfehler in den Prefs würde sonst bei
 *      JEDER späteren Anzeige eine RangeError werfen)
 *   3. `''`   → erlaubt, denn „automatisch" ist eine Wahl und der Default
 *   4. WIRKUNG IM SSR-HTML: mit gesetzter Zone rechnet der SERVER die
 *      Datumszeile. Gemessen an `title="dd.MM.yyyy"` der Kommentar-Zeitangabe
 *      (CommentItem → useFormatDate). Zwei Zonen, die 25 Stunden auseinander
 *      liegen (Pacific/Kiritimati UTC+14 und Pacific/Niue UTC−11), haben zu
 *      JEDEM Zeitpunkt verschiedene Kalendertage — der Vergleich kann also
 *      nicht zufällig grün sein.
 *   5. Zurück auf „automatisch" ⇒ wieder die Zone der Laufzeit, also exakt
 *      das Verhalten von vor dieser Einstellung.
 *
 * Voraussetzung: `apps/comments` läuft (mit Kommentaren auf der Startseite,
 * z. B. aus dem Demo-Seed) und die lokale Appwrite ist erreichbar.
 *
 *   PORT=3021 node --env-file=apps/comments/.env packages/core/scripts/verify-timezone.mjs
 *
 * KONTO: mit Schlüssel in der Umgebung (`--env-file` oder der Läufer) legt
 * das Skript ein eigenes Wegwerf-Konto an (`…@example.test`, zufälliges
 * Passwort), meldet es über die echte Anmelde-Route an und räumt es mit
 * Nachzählen wieder ab. Ohne Schlüssel nimmt es wie früher das Demo-Konto
 * (`DEMO_EMAIL` / `DEMO_PASSWORD`).
 *
 * node:http statt fetch, weil fetch einen eigenen Host-Header verwirft, und
 * über `::1`, weil Nitro dort hört (dieselbe Begründung wie in den
 * onboarding-Skripten).
 */
// Ziel-Prüfung zuerst (OPS-002): das Skript legt ein Konto an und braucht dafür einen Schlüssel.
import '../../../scripts/lib/assert-target.mjs'
import { request } from 'node:http'
import { createEinzelCleanup, createProbeAccount } from '../../../scripts/lib/probe-stage.mjs'

// Der Läufer setzt EINZEL_PORT (die Einzel-Instanz im nächtlichen Lauf).
const PORT = Number(process.env.EINZEL_PORT || process.env.PORT || 3001)
const HOST = process.env.HOST || 'localhost'
const OWN_ACCOUNT = Boolean(process.env.NUXT_APPWRITE_KEY && !process.env.DEMO_EMAIL)
const sweep = OWN_ACCOUNT ? createEinzelCleanup({ script: 'verify-timezone' }) : null

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

function call(path, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: '::1',
      port: PORT,
      path,
      method,
      headers: {
        host: HOST,
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { cookie } : {}),
      },
    }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { text += chunk })
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        text,
      }))
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/**
 * Alle Datums-Titel einer SSR-Seite, in Reihenfolge. Beide Schreibweisen, weil
 * die Default-Locale EN ist (`07/07/2026`) und /de deutsch schreibt
 * (`07.07.2026`) — die Zeitzone ist von der Sprache unabhängig.
 */
function datesInHtml(html) {
  return [...html.matchAll(/title="(\d{2}[./]\d{2}[./]\d{4})"/g)].map(match => match[1])
}

async function setZone(cookie, timezone) {
  return call('/api/auth/timezone', { method: 'PUT', body: { timezone }, cookie })
}

async function main() {
  console.log(`\nKonto-Zeitzone — Beweis gegen http://${HOST}:${PORT}\n`)

  let EMAIL = process.env.DEMO_EMAIL || 'uma@demo.local'
  let PASSWORD = process.env.DEMO_PASSWORD || 'Demo-Passw0rd!'
  if (sweep) {
    const account = await createProbeAccount(sweep.pool, { tag: 'timezone', name: 'Zeitzone Beweis' })
    sweep.track('account', account.userId)
    EMAIL = account.email
    PASSWORD = account.password
  }

  console.log('1) Ohne Session')
  const guest = await setZone(undefined, 'Europe/Berlin')
  check('PUT /api/auth/timezone ohne Session = 401', guest.status === 401, `status ${guest.status}`)

  console.log('\n2) Anmelden')
  const login = await call('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })
  const setCookie = login.headers['set-cookie'] || []
  const cookie = setCookie.map(entry => entry.split(';')[0]).join('; ')
  check('Login liefert eine Session', login.status === 200 && cookie.length > 0, `status ${login.status}`)
  if (!cookie) {
    console.log('\n  Ohne Session ist der Rest nicht messbar — Abbruch.\n')
    await finish()
  }

  console.log('\n3) Was die Route ablehnt')
  const bogus = await setZone(cookie, 'Mars/Olympus')
  check('unbekannte Zone = 400', bogus.status === 400, `status ${bogus.status}`)
  const alias = await setZone(cookie, 'UTC')
  check('nicht-kanonischer Name („UTC") = 400', alias.status === 400, `status ${alias.status}`)
  const lower = await setZone(cookie, 'europe/berlin')
  check('falsche Schreibweise = 400', lower.status === 400, `status ${lower.status}`)

  console.log('\n4) Was die Route annimmt')
  const berlin = await setZone(cookie, 'Europe/Berlin')
  check('echte Zone = 200', berlin.status === 200, `status ${berlin.status}`)
  const auto = await setZone(cookie, '')
  check('„automatisch" (Leerstring) = 200', auto.status === 200, `status ${auto.status}`)

  console.log('\n5) Wirkung im SSR-HTML (Kommentar-Datum, useFormatDate)')
  const automatic = await call('/', { cookie })
  const automaticDates = datesInHtml(automatic.text)
  check('Startseite rendert Datumsangaben serverseitig', automaticDates.length > 0, `${automaticDates.length} gefunden`)

  await setZone(cookie, 'Pacific/Kiritimati')
  const east = datesInHtml((await call('/', { cookie })).text)
  await setZone(cookie, 'Pacific/Niue')
  const west = datesInHtml((await call('/', { cookie })).text)

  check('gesetzte Zone erreicht das SSR-HTML (Kiritimati)', east.length > 0 && east.length === automaticDates.length,
    `${east.length} vs ${automaticDates.length}`)
  check('25 Stunden Abstand ⇒ anderer Kalendertag (Kiritimati ≠ Niue)',
    east.length > 0 && west.length === east.length && east.every((value, i) => value !== west[i]),
    `${east[0]} vs ${west[0]}`)

  console.log('\n6) Zurück auf „automatisch"')
  await setZone(cookie, '')
  const back = datesInHtml((await call('/', { cookie })).text)
  check('ohne Wahl wieder wie vorher (Zone der Laufzeit)',
    back.length === automaticDates.length && back.every((value, i) => value === automaticDates[i]),
    `${back[0]} vs ${automaticDates[0]}`)

  await finish()
}

/** Aufräumen MIT Nachzählen (Bühnen-Regel 2), dann die Schlusszeile. */
async function finish() {
  if (sweep) {
    const { leftovers } = await sweep.run().catch(error => ({ leftovers: [`Nachzählen gescheitert: ${error.message}`] }))
    check('Wegwerf-Konto aufgeräumt und nachgezählt: nichts übrig', leftovers.length === 0, leftovers.join(', '))
  }
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass}/${pass + fail} Prüfungen bestanden\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error(error)
  fail++
  await finish()
})
