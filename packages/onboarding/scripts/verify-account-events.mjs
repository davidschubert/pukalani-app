/**
 * Beweis für den Abschnitt „Konto und Sicherheit" auf `/profile/activity`
 * (Davids Entscheidung 2026-11-13).
 *
 * Zwei Wegwerf-Konten, ein laufender Platform-Server, eine echte Appwrite:
 *  - A ändert sein Profil ⇒ der Eintrag erscheint bei A, mit den FeldNAMEN,
 *  - B sieht ihn NICHT (und umgekehrt),
 *  - die Anmeldung steht im Protokoll, aber nicht in der Liste,
 *  - die Antwort trägt einen ORT, aber nie die IP-Adresse,
 *  - ohne Anmeldung gibt es nichts,
 *  - ein FALSCHER Zwei-Faktor-Code bei der Anmeldung steht MIT Konto im
 *    Protokoll und erscheint beim Betroffenen (KE2: bis 2026-11-13 wurde er
 *    ohne Konto geschrieben und war damit für niemanden sichtbar).
 *
 * NUR LOKAL: das Skript legt Konten an und löscht sie samt ihren
 * Protokoll-Zeilen wieder. Es weigert sich, wenn der Appwrite-Endpunkt nicht
 * auf diesem Rechner liegt.
 *
 * Aufruf — die Anfragen gehen an den KONTROLL-HOST des Platform-Servers
 * (`CONTROL_HOST`, Standard `localhost`; die Bühne nennt ihren):
 *
 *   node --env-file=apps/platform/.env \
 *     packages/onboarding/scripts/verify-account-events.mjs [--keep] [--clean]
 *   pnpm buehne run --only verify-account-events
 *
 * `--keep`  lässt Konto A stehen (für einen Blick im Browser — das Passwort
 *           wird je Lauf erzeugt und nie ausgegeben; anmelden über
 *           „Passwort vergessen", die Mail landet in Mailpit),
 * `--clean` räumt nur auf und prüft nichts.
 *
 * ERWARTUNGSWERTE kommen nie aus der geprüften Antwort (Beweis-Regel 1):
 * welche Zeilen es gibt und welche IP darin steht, liest das Skript mit dem
 * Server-Schlüssel direkt aus der Tabelle.
 */
import { createHmac } from 'node:crypto'
import { request } from 'node:http'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'
import { isLocalEndpoint } from '../../../scripts/lib/target.mjs'
import { appwriteRest, findColumns, generatePassword, PERSON_COLUMNS, sweepRows } from '../../../scripts/lib/probe-stage.mjs'

const keep = process.argv.includes('--keep')
const cleanOnly = process.argv.includes('--clean')

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
const PORT = Number(process.env.PLATFORM_PORT || 3006)
const CONTROL_HOST = process.env.CONTROL_HOST || 'localhost'
const BASE = `http://${CONTROL_HOST}:${PORT}`

if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=apps/platform/.env aufrufen.')
  process.exit(1)
}
// Strenger als die geteilte Regel: KEINE Bestätigung öffnet hier Production.
if (!isLocalEndpoint(endpoint)) {
  console.error(`✗ Nur lokal: ${endpoint} liegt nicht auf diesem Rechner.`)
  process.exit(1)
}

// Wegwerf-Konten einer lokalen Instanz — dasselbe Muster wie
// seed-local-tester.mjs. Die Adressen sind fest, damit `--clean` sie findet;
// das Passwort entsteht je Lauf (nie eines im Quelltext).
const PASSWORD = generatePassword()
const A = { email: 'account-events-a@example.test', name: 'Konto Ereignis A' }
const B = { email: 'account-events-b@example.test', name: 'Konto Ereignis B' }
// Eine öffentliche, dokumentierte Adresse (Google-DNS) — damit die lokale
// Orts-Datenbank überhaupt etwas auflösen kann; Loopback ergibt nie einen Ort.
const PROBE_IP = '8.8.8.8'

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const users = new Users(client)
const tablesDB = new TablesDB(client)

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

async function findUser(email) {
  const { users: found } = await users.list({ queries: [Query.equal('email', email), Query.limit(1)] })
  return found[0] ?? null
}

/**
 * TOTP nach RFC 6238 (SHA-1, 30 s, 6 Stellen — Appwrites Vorgabe), damit das
 * Skript den zweiten Faktor einrichten und danach bewusst FALSCH und richtig
 * antworten kann. `offset` verschiebt um ganze Zeitfenster.
 */
function totp(secretBase32, offset = 0) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of secretBase32.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0')
  }
  const key = Buffer.from(bits.match(/.{8}/g).map(byte => Number.parseInt(byte, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offset))
  const mac = createHmac('sha1', key).update(counter).digest()
  const at = mac[mac.length - 1] & 0x0f
  const number = ((mac[at] & 0x7f) << 24) | (mac[at + 1] << 16) | (mac[at + 2] << 8) | mac[at + 3]
  return String(number % 1_000_000).padStart(6, '0')
}

/** Ein sechsstelliger Code, der in KEINEM der umliegenden Zeitfenster gilt. */
function wrongTotp(secretBase32) {
  const valid = new Set([-2, -1, 0, 1, 2].map(offset => totp(secretBase32, offset)))
  let candidate = 111111
  while (valid.has(String(candidate))) candidate++
  return String(candidate)
}

/** Fehlversuche OHNE Verursacher seit `since` — die Spur des alten Fehlers. */
async function orphanMfaFailuresSince(since) {
  const { rows } = await tablesDB.listRows({
    databaseId,
    tableId: 'audit_logs',
    queries: [
      Query.equal('action', 'user.mfa_challenge_failed'),
      Query.equal('actorId', ''),
      Query.greaterThanEqual('$createdAt', since),
      Query.limit(25),
    ],
  })
  return rows
}

async function auditRowsOf(userId) {
  const { rows } = await tablesDB.listRows({
    databaseId,
    tableId: 'audit_logs',
    queries: [Query.equal('actorId', userId), Query.orderDesc('$createdAt'), Query.limit(100)],
  })
  return rows
}

async function removeAccount(email) {
  const user = await findUser(email)
  if (!user) return
  for (const row of await auditRowsOf(user.$id)) {
    await tablesDB.deleteRow({ databaseId, tableId: 'audit_logs', rowId: row.$id }).catch(() => {})
  }
  await users.delete({ userId: user.$id })
}

async function createAccount({ email, name }) {
  await removeAccount(email)
  return users.create({ userId: ID.unique(), email, password: PASSWORD, name })
}

/**
 * Ein Aufruf gegen den Platform-Server, mit Cookie-Dose und Herkunft.
 * `node:http` über `::1` statt `fetch`: `fetch` verwirft eine eigene
 * Host-Kopfzeile, und nur über sie erreicht man einen Kontroll-Host wie
 * `app.localhost`; Nitro hört im Dev auf IPv6.
 */
function call(jar, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: '::1',
      port: PORT,
      path,
      method,
      headers: {
        'host': `${CONTROL_HOST}:${PORT}`,
        'origin': BASE,
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(jar.cookie ? { cookie: jar.cookie } : {}),
        ...headers,
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        // Wie ein Browser: neue Cookies ersetzen gleichnamige, die übrigen
        // bleiben (die Antwort auf den zweiten Faktor setzt nicht alle neu).
        const set = res.headers['set-cookie'] ?? []
        if (set.length) {
          const cookies = new Map(jar.cookie ? jar.cookie.split('; ').map(pair => [pair.split('=')[0], pair]) : [])
          for (const line of set) {
            const pair = line.split(';')[0]
            const name = pair.split('=')[0]
            if (/max-age=0|expires=thu, 01 jan 1970/i.test(line) || pair === `${name}=`) cookies.delete(name)
            else cookies.set(name, pair)
          }
          jar.cookie = [...cookies.values()].join('; ')
        }
        let json = null
        try {
          json = JSON.parse(text)
        }
        catch {
          // keine JSON-Antwort
        }
        resolve({ status: res.statusCode ?? 0, json, text })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function login(account) {
  const jar = { cookie: '' }
  const res = await call(jar, 'POST', '/api/auth/login', { email: account.email, password: PASSWORD })
  if (res.status !== 200 || !jar.cookie) throw new Error(`Anmeldung ${account.email} fehlgeschlagen (${res.status})`)
  return jar
}

if (cleanOnly) {
  await removeAccount(A.email)
  await removeAccount(B.email)
  console.log('✔ Wegwerf-Konten und ihre Protokoll-Zeilen entfernt')
  process.exit(0)
}

console.log(`Konto-Ereignisse gegen ${BASE} / Appwrite ${endpoint} (${projectId})\n`)

const startedAt = new Date().toISOString()
const userA = await createAccount(A)
const userB = await createAccount(B)

try {
  console.log('Ohne Anmeldung')
  const anonymous = await call({ cookie: '' }, 'GET', '/api/account/activity')
  check('die Route antwortet 401', anonymous.status === 401, `Status ${anonymous.status}`)

  const jarA = await login(A)
  const jarB = await login(B)

  console.log('\nVor der Änderung')
  const before = await call(jarA, 'GET', '/api/account/activity')
  check('A: Route antwortet 200 mit einem Konto-Abschnitt', before.status === 200 && Array.isArray(before.json?.account?.events), `Status ${before.status}`)
  check('A: Konto-Abschnitt ist nicht als ausgefallen gemeldet', !(before.json?.unavailable ?? []).includes('account-events'))
  const loginRows = (await auditRowsOf(userA.$id)).filter(row => row.action === 'user.login')
  check('A: die Anmeldung STEHT im Protokoll …', loginRows.length === 1, `${loginRows.length} Zeilen`)
  check('… erscheint aber nicht in der Liste (Davids Entscheidung)', before.json?.account?.events?.length === 0, JSON.stringify(before.json?.account?.events))

  console.log('\nA ändert sein Profil')
  const put = await call(jarA, 'PUT', '/api/auth/profile', { name: 'Konto Ereignis A2', bio: 'Neu geschrieben' }, { 'x-forwarded-for': PROBE_IP })
  check('Profil gespeichert', put.status === 200, `Status ${put.status} ${put.text.slice(0, 120)}`)

  const written = (await auditRowsOf(userA.$id)).filter(row => row.action === 'user.profile_updated')
  check('im Protokoll steht GENAU eine Profil-Zeile von A', written.length === 1, `${written.length} Zeilen`)
  const auditRow = written[0]
  check('die Zeile trägt die Test-IP (sonst prüft die Orts-Probe nichts)', auditRow?.ip === PROBE_IP, `ip=${auditRow?.ip}`)

  const afterA = await call(jarA, 'GET', '/api/account/activity')
  const eventsA = afterA.json?.account?.events ?? []
  check('A sieht genau EIN Konto-Ereignis', eventsA.length === 1, `${eventsA.length}`)
  check('es ist die Zeile aus dem Protokoll', eventsA[0]?.id === auditRow?.$id)
  check('Art: Profil geändert', eventsA[0]?.kind === 'profile_updated', eventsA[0]?.kind)
  check('Felder: Name und Bio — nur die NAMEN', JSON.stringify(eventsA[0]?.fields) === JSON.stringify(['name', 'bio']), JSON.stringify(eventsA[0]?.fields))
  check('kein WERT reist mit', !afterA.text.includes('Neu geschrieben'))
  check('die IP-Adresse steht NIRGENDS in der Antwort', !afterA.text.includes(PROBE_IP) && !('ip' in (eventsA[0] ?? {})))
  if (process.env.NUXT_GEO_CITY_DB_PATH) {
    check('stattdessen steht dort ein Ort', typeof eventsA[0]?.place === 'string' && eventsA[0].place.length > 0, `place=${JSON.stringify(eventsA[0]?.place)}`)
    console.log(`    (Ort: ${eventsA[0]?.place})`)
  }
  else {
    console.log('  – Orts-Probe übersprungen (NUXT_GEO_CITY_DB_PATH nicht gesetzt)')
  }

  console.log('\nDer zweite Nutzer')
  const afterB = await call(jarB, 'GET', '/api/account/activity')
  check('B: Route antwortet 200', afterB.status === 200, `Status ${afterB.status}`)
  check('B sieht KEIN Konto-Ereignis', afterB.json?.account?.events?.length === 0, JSON.stringify(afterB.json?.account?.events))
  check('B: die Zeile von A taucht nirgends in der Antwort auf', !afterB.text.includes(auditRow?.$id ?? '—'))

  console.log('\nGegenprobe: B ändert, A bleibt bei einem')
  const putB = await call(jarB, 'PUT', '/api/auth/profile', { name: B.name, bio: 'Auch neu' })
  check('B: Profil gespeichert', putB.status === 200, `Status ${putB.status}`)
  const finalB = await call(jarB, 'GET', '/api/account/activity')
  check('B sieht jetzt sein eigenes', finalB.json?.account?.events?.length === 1 && JSON.stringify(finalB.json.account.events[0].fields) === JSON.stringify(['bio']), JSON.stringify(finalB.json?.account?.events))
  const finalA = await call(jarA, 'GET', '/api/account/activity')
  check('A sieht weiterhin nur seines', finalA.json?.account?.events?.length === 1 && finalA.json.account.events[0].id === auditRow?.$id)

  console.log('\nDer Aufrufer kann keinen anderen benennen')
  const spoof = await call(jarB, 'GET', `/api/account/activity?userId=${userA.$id}&actorId=${userA.$id}`)
  check('ein userId-Parameter ändert nichts', spoof.json?.account?.events?.length === 1 && !spoof.text.includes(auditRow?.$id ?? '—'))

  console.log('\nZwei-Faktor: falscher Code bei der Anmeldung (KE2)')
  const setup = await call(jarA, 'POST', '/api/auth/mfa/setup')
  check('A: Einrichtung begonnen', setup.status === 200 && typeof setup.json?.secret === 'string', `Status ${setup.status}`)
  const secret = setup.json?.secret ?? ''
  const enabled = await call(jarA, 'POST', '/api/auth/mfa/verify', { code: totp(secret) })
  check('A: Zwei-Faktor eingeschaltet', enabled.status === 200, `Status ${enabled.status} ${enabled.text.slice(0, 120)}`)

  // Neue Anmeldung: jetzt verlangt Appwrite den zweiten Faktor, die Session
  // ist nur halb — genau der Zustand, in dem `account.get()` 401 antwortet.
  const half = { cookie: '' }
  const relogin = await call(half, 'POST', '/api/auth/login', { email: A.email, password: PASSWORD })
  check('A: neue Anmeldung verlangt den zweiten Faktor', relogin.status === 200 && relogin.json?.mfaRequired === true, JSON.stringify(relogin.json))

  const wrong = await call(half, 'POST', '/api/auth/mfa/challenge', { mode: 'totp', code: wrongTotp(secret) })
  check('falscher Code wird abgelehnt (401)', wrong.status === 401, `Status ${wrong.status} ${wrong.text.slice(0, 120)}`)

  const failures = (await auditRowsOf(userA.$id)).filter(row => row.action === 'user.mfa_challenge_failed')
  check('der Fehlversuch steht MIT dem Konto von A im Protokoll', failures.length === 1, `${failures.length} Zeilen mit actorId von A`)
  const orphans = await orphanMfaFailuresSince(startedAt)
  check('und es entsteht KEINE Zeile ohne Verursacher', orphans.length === 0, `${orphans.length} Zeilen mit leerer actorId`)
  check('die Zeile trägt den Namen des Kontos (für die Betreiber-Ansicht)', failures[0]?.actorName === 'Konto Ereignis A2', `actorName=${JSON.stringify(failures[0]?.actorName)}`)

  // Appwrite nimmt denselben Code kein zweites Mal an — der aktuelle wurde
  // eben beim Einschalten verbraucht. Also das nächste Zeitfenster abwarten.
  await new Promise(resolve => setTimeout(resolve, 30_000 - (Date.now() % 30_000) + 1_000))
  const right = await call(half, 'POST', '/api/auth/mfa/challenge', { mode: 'totp', code: totp(secret) })
  check('richtiger Code meldet an', right.status === 200, `Status ${right.status} ${right.text.slice(0, 120)}`)

  const withMfa = await call(half, 'GET', '/api/account/activity')
  const kinds = (withMfa.json?.account?.events ?? []).map(entry => entry.kind)
  check('A: die Liste antwortet nach der Anmeldung mit zweitem Faktor (200)', withMfa.status === 200, `Status ${withMfa.status} ${withMfa.text.slice(0, 120)}`)
  check('A sieht den Fehlversuch unter „Konto und Sicherheit"', kinds.includes('mfa_challenge_failed') && (withMfa.json.account.events.find(entry => entry.kind === 'mfa_challenge_failed')?.id === failures[0]?.$id), JSON.stringify(kinds))
  check('A sieht auch „Zwei-Faktor eingeschaltet"', kinds.includes('mfa_enabled'), JSON.stringify(kinds))
  const bystander = await call(jarB, 'GET', '/api/account/activity')
  check('B sieht davon nichts', !(bystander.json?.account?.events ?? []).some(entry => entry.kind.startsWith('mfa_')), JSON.stringify(bystander.json?.account?.events))
}
finally {
  // Zeilen ohne Verursacher gehören zu keinem Konto und blieben sonst liegen.
  for (const row of await orphanMfaFailuresSince(startedAt).catch(() => [])) {
    await tablesDB.deleteRow({ databaseId, tableId: 'audit_logs', rowId: row.$id }).catch(() => {})
  }
  await removeAccount(B.email)
  if (keep) {
    console.log(`\n(--keep: Konto ${A.email} bleibt stehen — danach mit --clean entfernen)`)
  }
  else {
    await removeAccount(A.email)
    // NACHZÄHLEN: weder die Konten noch Zeilen, die über eine Personen-Spalte
    // an ihnen hängen (Protokoll, Zustimmung, …), dürfen übrig sein.
    const pool = appwriteRest({ endpoint, projectId, key: apiKey, script: 'verify-account-events' })
    const ids = [userA.$id, userB.$id]
    const targets = await findColumns(pool, databaseId, PERSON_COLUMNS) ?? []
    await sweepRows(pool, databaseId, targets, ids, { remove: true })
    const rest = await sweepRows(pool, databaseId, targets, ids)
    const accounts = (await Promise.all([findUser(A.email), findUser(B.email)])).filter(Boolean)
    const left = [...accounts.map(user => `Konto ${user.$id}`), ...Object.entries(rest).map(([key, n]) => `${key}=${n}`)]
    check('nachgezählt: keine Konten und keine Zeilen der Konten übrig', left.length === 0, left.join(', '))
  }
}

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`)
process.exit(fail === 0 ? 0 : 1)
