/**
 * Beweis für den Abschnitt „Konto und Sicherheit" auf `/profile/activity`
 * (Davids Entscheidung 2026-11-13).
 *
 * Zwei Wegwerf-Konten, ein laufender Platform-Server, eine echte Appwrite:
 *  - A ändert sein Profil ⇒ der Eintrag erscheint bei A, mit den FeldNAMEN,
 *  - B sieht ihn NICHT (und umgekehrt),
 *  - die Anmeldung steht im Protokoll, aber nicht in der Liste,
 *  - die Antwort trägt einen ORT, aber nie die IP-Adresse,
 *  - ohne Anmeldung gibt es nichts.
 *
 * NUR LOKAL: das Skript legt Konten an und löscht sie samt ihren
 * Protokoll-Zeilen wieder. Es weigert sich, wenn der Appwrite-Endpunkt nicht
 * auf diesem Rechner liegt.
 *
 * Aufruf — der Platform-Server muss mit `localhost` als Kontroll-Host laufen
 * (Launch-Config `platform-kundenbereich`, oder
 * `NUXT_PUBLIC_TENANCY_CONTROL_HOSTS=localhost pnpm --filter platform dev`):
 *
 *   node --env-file=apps/platform/.env \
 *     packages/onboarding/scripts/verify-account-events.mjs [--keep] [--clean]
 *
 * `--keep`  lässt Konto A stehen (für einen Blick im Browser),
 * `--clean` räumt nur auf und prüft nichts.
 *
 * ERWARTUNGSWERTE kommen nie aus der geprüften Antwort (Beweis-Regel 1):
 * welche Zeilen es gibt und welche IP darin steht, liest das Skript mit dem
 * Server-Schlüssel direkt aus der Tabelle.
 */
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const keep = process.argv.includes('--keep')
const cleanOnly = process.argv.includes('--clean')

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
const PORT = Number(process.env.PLATFORM_PORT || 3006)
const BASE = `http://localhost:${PORT}`

if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=apps/platform/.env aufrufen.')
  process.exit(1)
}
if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(endpoint)) {
  console.error(`✗ Nur lokal: ${endpoint} liegt nicht auf diesem Rechner.`)
  process.exit(1)
}

// Wegwerf-Konten einer lokalen Instanz — dasselbe Muster wie
// seed-local-tester.mjs. Die Adressen sind fest, damit `--clean` sie findet.
const PASSWORD = 'AccountEvents-2026!'
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

/** Ein Aufruf gegen den Platform-Server, mit Cookie-Dose und Herkunft. */
async function call(jar, method, path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'origin': BASE,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(jar.cookie ? { cookie: jar.cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  const set = res.headers.getSetCookie?.() ?? []
  if (set.length) jar.cookie = set.map(line => line.split(';')[0]).join('; ')
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  }
  catch {
    // keine JSON-Antwort
  }
  return { status: res.status, json, text }
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

const userA = await createAccount(A)
await createAccount(B)

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
}
finally {
  await removeAccount(B.email)
  if (keep) {
    console.log(`\n(--keep: Konto ${A.email} bleibt stehen — danach mit --clean entfernen)`)
  }
  else {
    await removeAccount(A.email)
  }
}

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`)
process.exit(fail === 0 ? 0 : 1)
