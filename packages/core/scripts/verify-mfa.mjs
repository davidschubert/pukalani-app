/**
 * Beweis für den Zweitfaktor (U15 Teil 4).
 *
 * Fährt den GANZEN Weg über die echten HTTP-Routen des Dev-Servers, nicht
 * gegen die Funktionen: Einrichten, Anmelden mit Code, Drossel, Wiederher-
 * stellungs-Code, Abschalten, Gast-Abwehr — und seit 2026-10-24 die
 * Anmeldung per E-MAIL-CODE mit Zweitfaktor (Abschnitt 10).
 *
 * Die TOTP-Codes rechnet das Skript selbst aus dem Geheimnis (HMAC über
 * node:crypto). Das ist BEWUSST nur hier so — im Produkt rechnet niemand
 * etwas nach, dort prüft ausschließlich Appwrite.
 *
 *   node packages/core/scripts/verify-mfa.mjs
 *   PORT=3021 node packages/core/scripts/verify-mfa.mjs
 *
 * Voraussetzung: Dev-Server der App `comments` + lokale Appwrite.
 */
import { request } from 'node:http'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Client, Account, Users, ID, AuthenticatorType } from 'node-appwrite'

const PORT = Number(process.env.PORT || 3021)
const HOST = process.env.HOST || 'localhost'
const ENV_FILE = process.env.ENV_FILE || 'apps/comments/.env'
/** Abschnitt 10 liest den E-Mail-Code aus dem lokalen Mailpit (Appwrite-Dev schickt dorthin). */
const MAILPIT_URL = process.env.MAILPIT_URL || 'http://localhost:8025'

const env = Object.fromEntries(
  readFileSync(ENV_FILE, 'utf8').split('\n')
    .filter(line => line.includes('=') && !line.trim().startsWith('#'))
    .map(line => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
)
const ENDPOINT = env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const PROJECT = env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const API_KEY = env.NUXT_APPWRITE_KEY

let pass = 0
let fail = 0
function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

/** node:http über ::1: `fetch` verwirft einen eigenen Host-Header, Nitro hört auf [::1]. */
function call(path, { method = 'GET', body, cookie, clientIp } = {}) {
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
        // trustedClientIp liest das LETZTE Segment — so bekommt jeder
        // Abschnitt sein eigenes Drossel-Budget und sie stören sich nicht.
        ...(clientIp ? { 'x-forwarded-for': clientIp } : {}),
      },
    }, (res) => {
      let raw = ''
      res.on('data', chunk => { raw += chunk })
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(raw) } catch { /* kein JSON */ }
        const setCookie = res.headers['set-cookie'] ?? []
        resolve({ status: res.statusCode, json, raw, setCookie })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/** Nimmt das Session-Cookie aus einer Antwort (Name hängt am Projekt). */
function sessionCookieFrom(response, previous) {
  const line = response.setCookie.find(entry => entry.startsWith('a_session_'))
  if (!line) return previous
  const pair = line.split(';')[0]
  // Ein LEERER Wert ist ein Löschen — dann gibt es keine Session mehr.
  return pair.endsWith('=') ? '' : pair
}

function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    const index = alphabet.indexOf(char)
    if (index >= 0) bits += index.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

function totp(secret) {
  const counter = Buffer.alloc(8)
  counter.writeBigInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)))
  const hash = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = hash[hash.length - 1] & 0xf
  const value = ((hash[offset] & 0x7f) << 24 | hash[offset + 1] << 16 | hash[offset + 2] << 8 | hash[offset + 3]) % 1_000_000
  return String(value).padStart(6, '0')
}

/**
 * Jeder Abschnitt bekommt eine EIGENE, zufällige Client-IP. Feste Adressen
 * sahen sauber aus, machten den Beweis aber unwiederholbar: das Fenster der
 * Drossel steht 60 s, ein zweiter Lauf innerhalb dieser Minute erbte das
 * verbrauchte Budget des ersten und meldete 429 schon beim ERSTEN Versuch —
 * ein Fehlschlag, der nach kaputtem Produkt aussieht und keiner ist.
 */
/**
 * Holt den sechsstelligen Code aus der ECHTEN Mail (Mailpit-API, bis zu 15 s
 * Geduld): Abschnitt 10 soll denselben Weg gehen wie ein Mensch — Code
 * anfordern über /api/auth/otp, Code aus dem Postfach, Code einlösen. Ein
 * Server-Token (`users.createToken`) wäre die Abkürzung, aber der ist HEX und
 * kein sechsstelliger Zahlencode: unsere Route lehnt ihn zu Recht mit 400 ab.
 */
async function otpCodeFromMail(to) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
      .then(r => r.json()).catch(() => null)
    const id = search?.messages?.[0]?.ID
    if (id) {
      const message = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`).then(r => r.json()).catch(() => null)
      const match = String(message?.Text ?? '').match(/\b(\d{6})\b/)
      if (match) return match[1]
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return null
}

function freshIp() {
  return `203.0.113.${1 + Math.floor(Math.random() * 250)}`
}

const admin = () => {
  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY)
  return { account: new Account(client), users: new Users(client) }
}

const email = `mfa-verify-${Date.now()}@example.com`
const password = 'Beweis-Passwort-2026!'
const a = admin()
let userId
const extraUserIds = []

/**
 * Legt ein Konto MIT eingeschaltetem Zweitfaktor an — über dieselben HTTP-
 * Routen, die auch ein Mensch benutzt.
 *
 * Warum überhaupt mehrere Konten: Appwrite deckelt das Anlegen von Challenges
 * pro userId (`abuse-limit 10`). Ein Beweis, der alle Abschnitte auf EIN Konto
 * legt, läuft irgendwann in DIESE Grenze und meldet einen Fehler, den das
 * Produkt nicht hat — beim Bau gleich zweimal passiert (Abschnitt 6 und 7).
 */
async function createUserWithMfa(label) {
  const mail = `mfa-verify-${label}-${Date.now()}@example.com`
  const id = (await a.users.create({ userId: ID.unique(), email: mail, password, name: `MFA ${label}` })).$id
  extraUserIds.push(id)
  const ip = freshIp()
  const login = await call('/api/auth/login', { method: 'POST', body: { email: mail, password }, clientIp: ip })
  const cookie = sessionCookieFrom(login)
  const setup = await call('/api/auth/mfa/setup', { method: 'POST', cookie, clientIp: ip })
  const verified = await call('/api/auth/mfa/verify', {
    method: 'POST', body: { code: totp(setup.json.secret) }, cookie, clientIp: ip,
  })
  return { email: mail, secret: setup.json.secret, recoveryCodes: verified.json.recoveryCodes }
}

try {
  console.log(`\nZwei-Faktor-Beweis gegen http://${HOST}:${PORT}\n`)
  userId = (await a.users.create({ userId: ID.unique(), email, password, name: 'MFA Beweis' })).$id

  // ---------------------------------------------------------------- 1
  console.log('1. Anmeldung OHNE Zweitfaktor (Gegenprobe: darf sich nicht ändern)')
  let ip = freshIp()
  let login = await call('/api/auth/login', { method: 'POST', body: { email, password }, clientIp: ip })
  let cookie = sessionCookieFrom(login)
  check('Login 200', login.status === 200, `status ${login.status}`)
  check('meldet mfaRequired: false', login.json?.mfaRequired === false, JSON.stringify(login.json))
  const me = await call('/api/auth/me', { cookie, clientIp: ip })
  check('/api/auth/me liefert den User', me.status === 200 && me.json?.email === email, `status ${me.status}`)

  // ---------------------------------------------------------------- 2
  console.log('\n2. Einrichten')
  const setup = await call('/api/auth/mfa/setup', { method: 'POST', cookie, clientIp: ip })
  check('setup 200', setup.status === 200, `status ${setup.status}`)
  const secret = setup.json?.secret ?? ''
  check('liefert ein Geheimnis', secret.length > 0)
  check('liefert eine otpauth-URL', String(setup.json?.uri).startsWith('otpauth://totp/'))
  check('liefert ein QR-Bild als data:-URI', String(setup.json?.qr).startsWith('data:image/png;base64,'))

  const verify = await call('/api/auth/mfa/verify', { method: 'POST', body: { code: totp(secret) }, cookie, clientIp: ip })
  check('verify 200', verify.status === 200, `status ${verify.status} ${verify.raw.slice(0, 120)}`)
  const recoveryCodes = verify.json?.recoveryCodes ?? []
  check('liefert 6 Wiederherstellungs-Codes', recoveryCodes.length === 6, `${recoveryCodes.length}`)

  const status = await call('/api/auth/mfa/status', { cookie, clientIp: ip })
  check('status meldet enabled: true', status.json?.enabled === true, JSON.stringify(status.json))
  check('status gibt die Codes NICHT heraus', !status.raw.includes(recoveryCodes[0]))

  // ---------------------------------------------------------------- 3
  console.log('\n3. Anmeldung MIT Zweitfaktor')
  await call('/api/auth/logout', { method: 'POST', cookie, clientIp: ip })
  ip = freshIp()
  login = await call('/api/auth/login', { method: 'POST', body: { email, password }, clientIp: ip })
  cookie = sessionCookieFrom(login)
  check('Login 200 und mfaRequired: true', login.status === 200 && login.json?.mfaRequired === true, JSON.stringify(login.json))
  check('Login setzt trotzdem ein Session-Cookie', Boolean(cookie))
  const halfMe = await call('/api/auth/me', { cookie, clientIp: ip })
  check('halbe Session ist überall ausgeloggt (/me 401)', halfMe.status === 401, `status ${halfMe.status}`)

  // ---------------------------------------------------------------- 4
  console.log('\n4. Falsche Codes und die Drossel')
  const statuses = []
  let firstReason = null
  let throttleReason = null
  for (let attempt = 0; attempt < 7; attempt++) {
    const wrong = await call('/api/auth/mfa/challenge', {
      method: 'POST', body: { mode: 'totp', code: '000000' }, cookie, clientIp: ip,
    })
    statuses.push(wrong.status)
    if (firstReason === null && wrong.status === 401) firstReason = wrong.json?.reason ?? ''
    if (throttleReason === null && wrong.status === 429) throttleReason = wrong.json?.reason ?? ''
  }
  check('erste Fehlversuche antworten 401', statuses.slice(0, 5).every(s => s === 401), statuses.join(','))
  check('danach greift die Drossel (429)', statuses.includes(429), statuses.join(','))
  // Der GRUND muss mitreisen: sonst kann das Formular „Code falsch" nicht von
  // „du bist gesperrt" unterscheiden und fordert genau die Handlung, die
  // gerade geblockt wird (Audit-Befund G7).
  check('der falsche Code meldet den Grund mfa_invalid_code', firstReason === 'mfa_invalid_code', `reason=${firstReason}`)
  check('die Sperre meldet den Grund rate_limited', throttleReason === 'rate_limited', `reason=${throttleReason}`)

  // Frisches Budget: die Drossel zählt je IP.
  ip = freshIp()
  const right = await call('/api/auth/mfa/challenge', {
    method: 'POST', body: { mode: 'totp', code: totp(secret) }, cookie, clientIp: ip,
  })
  check('richtiger Code 200', right.status === 200, `status ${right.status} ${right.raw.slice(0, 120)}`)
  check('challenge setzt das Cookie NICHT neu (leeres secret)', sessionCookieFrom(right, null) === null)
  const fullMe = await call('/api/auth/me', { cookie, clientIp: ip })
  check('jetzt drin — /api/auth/me liefert den User', fullMe.status === 200 && fullMe.json?.email === email, `status ${fullMe.status}`)

  // ---------------------------------------------------------------- 5
  console.log('\n5. Wiederherstellungs-Code — genau einmal')
  await call('/api/auth/logout', { method: 'POST', cookie, clientIp: ip })
  ip = freshIp()
  login = await call('/api/auth/login', { method: 'POST', body: { email, password }, clientIp: ip })
  cookie = sessionCookieFrom(login)
  const usedCode = recoveryCodes[0]
  const rescue = await call('/api/auth/mfa/challenge', {
    method: 'POST', body: { mode: 'recovery', code: usedCode }, cookie, clientIp: ip,
  })
  check('Wiederherstellungs-Code lässt herein', rescue.status === 200, `status ${rescue.status} ${rescue.raw.slice(0, 120)}`)

  await call('/api/auth/logout', { method: 'POST', cookie, clientIp: ip })
  ip = freshIp()
  login = await call('/api/auth/login', { method: 'POST', body: { email, password }, clientIp: ip })
  cookie = sessionCookieFrom(login)
  const reuse = await call('/api/auth/mfa/challenge', {
    method: 'POST', body: { mode: 'recovery', code: usedCode }, cookie, clientIp: ip,
  })
  check('derselbe Code ein zweites Mal: abgelehnt', reuse.status === 401, `status ${reuse.status}`)
  const second = await call('/api/auth/mfa/challenge', {
    method: 'POST', body: { mode: 'recovery', code: recoveryCodes[1] }, cookie, clientIp: ip,
  })
  check('ein anderer, frischer Code geht', second.status === 200, `status ${second.status}`)

  // ---------------------------------------------------------------- 6
  console.log('\n6. Die Appwrite-Falle (fällt, sobald Appwrite sie repariert)')
  // EIGENER Nutzer: Appwrite deckelt das Anlegen von Challenges pro userId
  // (abuse-limit 10). Nach den Drossel- und Wiederherstellungs-Abschnitten
  // oben ist das Budget des Haupt-Kontos aufgebraucht, und der Beweis wäre
  // nicht am Befund gescheitert, sondern an seinem eigenen Vorlauf.
  const probeEmail = `mfa-verify-casing-${Date.now()}@example.com`
  let probeUserId
  try {
    probeUserId = (await a.users.create({
      userId: ID.unique(), email: probeEmail, password, name: 'MFA Schreibweise',
    })).$id
    const sessionOf = secretValue => new Account(
      new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setSession(secretValue),
    )
    const first = await a.account.createEmailPasswordSession({ email: probeEmail, password })
    const setupAcc = sessionOf(first.secret)
    const probeAuth = await setupAcc.createMFAAuthenticator({ type: AuthenticatorType.Totp })
    await setupAcc.updateMFAAuthenticator({ type: AuthenticatorType.Totp, otp: totp(probeAuth.secret) })
    const probeCodes = (await setupAcc.createMFARecoveryCodes()).recoveryCodes
    await setupAcc.updateMFA({ mfa: true })

    const fresh = await a.account.createEmailPasswordSession({ email: probeEmail, password })
    const acc = sessionOf(fresh.secret)

    const lower = await acc.createMFAChallenge({ factor: 'recoverycode' })
    let lowerWorks = false
    try { await acc.updateMFAChallenge({ challengeId: lower.$id, otp: probeCodes[0] }); lowerWorks = true }
    catch { lowerWorks = false }
    check("Appwrite lehnt die SDK-Schreibweise 'recoverycode' weiterhin ab", !lowerWorks,
      'ACHTUNG: repariert — die Sonderbehandlung in shared/mfa.ts kann weg')

    // DERSELBE Code, nur andere Schreibweise des Faktors: das ist der A/B.
    const camel = await acc.createMFAChallenge({ factor: 'recoveryCode' })
    let camelWorks = false
    try { await acc.updateMFAChallenge({ challengeId: camel.$id, otp: probeCodes[0] }); camelWorks = true }
    catch { camelWorks = false }
    check("derselbe Code mit 'recoveryCode' wird akzeptiert", camelWorks)
  }
  finally {
    if (probeUserId) await a.users.delete({ userId: probeUserId }).catch(() => {})
  }

  // ---------------------------------------------------------------- 7
  console.log('\n7. Abschalten')
  // Eigenes Konto, damit Appwrites Challenge-Deckel (10 je userId) nicht die
  // Aussage dieses Abschnitts überschreibt.
  const off = await createUserWithMfa('abschalten')
  ip = freshIp()
  login = await call('/api/auth/login', { method: 'POST', body: { email: off.email, password }, clientIp: ip })
  cookie = sessionCookieFrom(login)
  await call('/api/auth/mfa/challenge', { method: 'POST', body: { mode: 'totp', code: totp(off.secret) }, cookie, clientIp: ip })

  const badDisable = await call('/api/auth/mfa/disable', {
    method: 'POST', body: { mode: 'totp', code: '000000' }, cookie, clientIp: ip,
  })
  check('Abschalten mit falschem Code: abgelehnt', badDisable.status === 400, `status ${badDisable.status}`)

  const stillOn = await call('/api/auth/mfa/status', { cookie, clientIp: ip })
  check('… und der Schutz steht noch', stillOn.json?.enabled === true, JSON.stringify(stillOn.json))

  ip = freshIp()
  const disable = await call('/api/auth/mfa/disable', {
    method: 'POST', body: { mode: 'totp', code: totp(off.secret) }, cookie, clientIp: ip,
  })
  check('Abschalten mit richtigem Code: 200', disable.status === 200, `status ${disable.status} ${disable.raw.slice(0, 120)}`)

  await call('/api/auth/logout', { method: 'POST', cookie, clientIp: ip })
  ip = freshIp()
  login = await call('/api/auth/login', { method: 'POST', body: { email: off.email, password }, clientIp: ip })
  cookie = sessionCookieFrom(login)
  check('Anmeldung wieder ohne Code', login.json?.mfaRequired === false, JSON.stringify(login.json))
  const backIn = await call('/api/auth/me', { cookie, clientIp: ip })
  check('… und man ist sofort drin', backIn.status === 200, `status ${backIn.status}`)

  // ---------------------------------------------------------------- 8
  console.log('\n8. Gäste')
  ip = freshIp()
  for (const [path, method] of [
    ['/api/auth/mfa/setup', 'POST'],
    ['/api/auth/mfa/verify', 'POST'],
    ['/api/auth/mfa/disable', 'POST'],
    ['/api/auth/mfa/status', 'GET'],
    ['/api/auth/mfa/challenge', 'POST'],
  ]) {
    const guest = await call(path, {
      method,
      body: method === 'POST' ? { mode: 'totp', code: '123456' } : undefined,
      clientIp: ip,
    })
    check(`${method} ${path} ohne Session: 401`, guest.status === 401, `status ${guest.status}`)
  }

  // ---------------------------------------------------------------- 9
  console.log('\n9. Was NICHT in Antworten stehen darf')
  ip = freshIp()
  login = await call('/api/auth/login', { method: 'POST', body: { email, password }, clientIp: ip })
  cookie = sessionCookieFrom(login)
  const meBody = await call('/api/auth/me', { cookie, clientIp: ip })
  check('/api/auth/me trägt kein TOTP-Geheimnis', !meBody.raw.includes(secret))
  check('/api/auth/me trägt keinen Wiederherstellungs-Code', !recoveryCodes.some(code => meBody.raw.includes(code)))
  const statusBody = await call('/api/auth/mfa/status', { cookie, clientIp: ip })
  check('status trägt weder Geheimnis noch Codes',
    !statusBody.raw.includes(secret) && !recoveryCodes.some(code => statusBody.raw.includes(code)))

  // ---------------------------------------------------------------- 10
  console.log('\n10. Anmeldung per E-MAIL-CODE mit Zweitfaktor (Befund 2026-10-24, prod)')
  // Derselbe Weg wie ein Mensch: Code anfordern (/api/auth/otp), Code aus der
  // Mail (Mailpit), Code einlösen (/api/auth/otp/verify) — auf einem Konto MIT
  // eingeschaltetem Zweitfaktor. Vor dem Fix endete das in einer Session mit
  // `factors: ['email']`, auf die /api/auth/me 401 sagt, und ohne ein Wort
  // an den Nutzer.
  const otpUser = await createUserWithMfa('otp')
  await call('/api/auth/logout', { method: 'POST', cookie, clientIp: ip })
  ip = freshIp()
  const otpRequest = await call('/api/auth/otp', { method: 'POST', body: { email: otpUser.email }, clientIp: ip })
  check('otp anfordern 200', otpRequest.status === 200, `status ${otpRequest.status} ${otpRequest.raw.slice(0, 120)}`)
  const otpCode = await otpCodeFromMail(otpUser.email)
  check('Code steht in der Mail (Mailpit)', Boolean(otpCode), `kein Code unter ${MAILPIT_URL}`)
  const otpLogin = await call('/api/auth/otp/verify', {
    method: 'POST', body: { userId: otpRequest.json?.userId, code: otpCode ?? '000000' }, clientIp: ip,
  })
  cookie = sessionCookieFrom(otpLogin)
  check('otp/verify 200 und mfaRequired: true',
    otpLogin.status === 200 && otpLogin.json?.mfaRequired === true, `status ${otpLogin.status} ${otpLogin.raw.slice(0, 120)}`)
  check('otp/verify setzt trotzdem ein Session-Cookie', Boolean(cookie))
  const otpHalf = await call('/api/auth/me', { cookie, clientIp: ip })
  check('halbe Session ist überall ausgeloggt (/me 401)', otpHalf.status === 401, `status ${otpHalf.status}`)
  const otpChallenge = await call('/api/auth/mfa/challenge', {
    method: 'POST', body: { mode: 'totp', code: totp(otpUser.secret) }, cookie, clientIp: ip,
  })
  check('Challenge mit App-Code 200', otpChallenge.status === 200, `status ${otpChallenge.status} ${otpChallenge.raw.slice(0, 120)}`)
  const otpFull = await call('/api/auth/me', { cookie, clientIp: ip })
  check('jetzt drin — /api/auth/me liefert den Code-Nutzer',
    otpFull.status === 200 && otpFull.json?.email === otpUser.email, `status ${otpFull.status}`)

  // Gegenprobe: ein Konto OHNE Zweitfaktor darf sich durch die Weiche nicht ändern.
  await call('/api/auth/logout', { method: 'POST', cookie, clientIp: ip })
  ip = freshIp()
  const plainEmail = `mfa-verify-otp-plain-${Date.now()}@example.com`
  extraUserIds.push((await a.users.create({ userId: ID.unique(), email: plainEmail, password, name: 'OTP ohne MFA' })).$id)
  const plainRequest = await call('/api/auth/otp', { method: 'POST', body: { email: plainEmail }, clientIp: ip })
  const plainCode = await otpCodeFromMail(plainEmail)
  const plainLogin = await call('/api/auth/otp/verify', {
    method: 'POST', body: { userId: plainRequest.json?.userId, code: plainCode ?? '000000' }, clientIp: ip,
  })
  cookie = sessionCookieFrom(plainLogin)
  check('ohne Zweitfaktor: otp/verify meldet mfaRequired: false',
    plainLogin.status === 200 && plainLogin.json?.mfaRequired === false, `status ${plainLogin.status} ${plainLogin.raw.slice(0, 120)}`)
  const plainMe = await call('/api/auth/me', { cookie, clientIp: ip })
  check('… und man ist sofort drin', plainMe.status === 200 && plainMe.json?.email === plainEmail, `status ${plainMe.status}`)
}
catch (error) {
  fail++
  console.error('\nABBRUCH:', error?.type ?? '', error?.message ?? error)
}
finally {
  if (userId) await a.users.delete({ userId }).catch(() => {})
  for (const id of extraUserIds) await a.users.delete({ userId: id }).catch(() => {})
}

console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass}/${pass + fail} Prüfungen bestanden\n`)
process.exit(fail === 0 ? 0 : 1)
