/**
 * Beweis für die Einladungs-Warteschlange (control-017).
 *
 * Fährt den GANZEN Weg gegen die laufenden Dev-Server:
 *   anfragen (öffentlich, ohne Konto) → Betreiber-Mail landet in Mailpit →
 *   Zuweisung → Kunde löst im Wizard ein → Warteschlange steht auf
 *   „eingelöst → host".
 *
 * EHRLICH ZUR REICHWEITE: die Zuweisung selbst wird ohne Betreiber-Session
 * über die Datenschicht nachgestellt (die Route lehnt anonym korrekt ab —
 * das wird geprüft). Der Klartext-Code kommt daher aus dem Skript, nicht aus
 * der Kunden-Mail; alles danach ist der echte Weg.
 *
 * Prüft außerdem, was NICHT gehen darf: derselbe Code bei einer anderen
 * Adresse, doppelte Anfragen, Erinnerung vor Ablauf der Sperrfrist, Honeypot.
 *
 *   POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/control/scripts/verify-invite-requests.mjs
 */
import '../../../scripts/lib/assert-target.mjs'
import { request as httpRequest } from 'node:http'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'
import {
  appwriteRest,
  createCleanup,
  createProbeAccount,
  generatePassword,
  login,
  probeSiteBody,
  runStamp,
} from '../../../scripts/lib/probe-stage.mjs'

const PLATFORM_PORT = Number(process.env.PLATFORM_PORT || 3006)
const STUDIO_URL = process.env.STUDIO_URL || 'http://localhost:3004'
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025'
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

const control = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const script = 'verify-invite-requests'
const controlRest = appwriteRest({ endpoint, projectId: controlProject, key: controlKey, script })
const pool = appwriteRest({ endpoint, projectId: poolProject, key: poolKey, script })
const cleanup = createCleanup({ pool, control: controlRest, poolDatabaseId: process.env.POOL_DATABASE_ID || 'main', controlDatabaseId: databaseId })
/** Zeilen der Warteschlange — die kennt das Aufräum-Register nicht, sie fallen hier einzeln. */
const requestRows = []
// Der Betreiber, dessen Glocke geprüft wird, ist ein Konto im Projekt des
// Control Plane — dafür braucht es `users.write`. Der Laufzeit-Schlüssel der
// Betreiber-App hat das, der Migrations-Schlüssel lokal nicht.
const controlUsers = new Users(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(process.env.NUXT_APPWRITE_KEY || controlKey))
/** Betreiber-Konten und ihre Glocken-Zeilen — räumt dieses Skript selbst. */
const operators = []
const bellRows = []
/**
 * Die Betreiber-MAIL geht nur raus, wenn die Betreiber-App eine Adresse dafür
 * hat (`NUXT_ALERT_EMAIL`) — die ist heute auf keiner Site gesetzt, die
 * Anfrage erreicht den Betreiber über die Glocke (.claude/rules/hosts-ops.md).
 * Läuft die Betreiber-App MIT Adresse, setzt der Aufrufer OPERATOR_MAIL=1, und
 * die Mail wird zusätzlich verlangt.
 */
const EXPECT_OPERATOR_MAIL = process.env.OPERATOR_MAIL === '1'

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

/** node:http über ::1 (fetch verwirft den Host-Header, Nitro hört auf IPv6). */
function callPlatform(host, path, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = httpRequest({
      host: '::1', port: PLATFORM_PORT, path, method,
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
        resolve({ status: res.statusCode, json, text, setCookie: res.headers['set-cookie'] ?? [] })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/** Die Betreiber-Routen laufen im Control — hier genügt normales fetch. */
async function callStudio(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${STUDIO_URL}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) }
  catch { /* HTML */ }
  return { status: res.status, json, text }
}

/**
 * Nach einer Mail mit diesem Betreff suchen. Mailpit ist optional (lokaler
 * SMTP-Fänger) — ist es nicht da, meldet der Beweis das ehrlich als
 * übersprungen, statt grün zu tun.
 */
async function mailWithSubject(fragment, attempts = 10) {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`subject:"${fragment}"`)}&limit=5`)
      .catch(() => null)
    if (!res) return { available: false }
    if (res.ok) {
      const { messages = [] } = await res.json()
      if (messages.length) return { available: true, message: messages[0] }
    }
    // Der Versand läuft nebenläufig zur Antwort — kurz nachfassen.
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  return { available: true, message: null }
}

try {
  console.log(`\nBeweis Einladungs-Warteschlange — Platform :${PLATFORM_PORT}, Studio ${STUDIO_URL}, Mailpit ${MAILPIT}\n`)

  const stamp = runStamp()
  const email = `anfrage-${stamp}@example.test`

  // Ein Wegwerf-Betreiber (Label admin), damit die Glocke einen Empfänger hat,
  // den dieser Lauf kennt — fremde Glocken liest das Skript nicht.
  const operator = await controlUsers.create({
    userId: ID.unique(), email: `anfrage-betreiber-${stamp}@example.test`, password: generatePassword(), name: 'Beweis Warteschlange',
  })
  operators.push(operator.$id)
  await controlUsers.updateLabels({ userId: operator.$id, labels: ['admin'] })

  console.log('1. Anfragen (öffentlich, ohne Konto)')
  const first = await callPlatform(CONTROL_HOST, '/api/onboarding/request', {
    method: 'POST', body: { email, note: 'Wir sind ein Kegelverein.', locale: 'de' },
  })
  check('Anfrage angenommen', first.status === 200 && first.json?.ok === true, `${first.status} ${first.text.slice(0, 120)}`)

  const honeypot = await callPlatform(CONTROL_HOST, '/api/onboarding/request', {
    method: 'POST', body: { email: `bot-${stamp}@example.test`, website: 'http://spam.example', locale: 'de' },
  })
  check('Honeypot antwortet freundlich, schreibt aber nichts', honeypot.status === 200)

  const again = await callPlatform(CONTROL_HOST, '/api/onboarding/request', {
    method: 'POST', body: { email, note: 'Nachtrag', locale: 'de' },
  })
  check('zweite Anfrage derselben Adresse ist wieder ok (keine Auskunft)', again.status === 200)

  // Nur die eigenen zwei Adressen lesen — nie die Warteschlange anderer.
  const rows = await control.listRows({
    databaseId, tableId: 'invite_requests', queries: [Query.equal('email', [email, `bot-${stamp}@example.test`]), Query.limit(25)],
  })
  const mine = rows.rows.filter(row => row.email === email)
  const botRow = rows.rows.find(row => row.email === `bot-${stamp}@example.test`)
  requestRows.push(...mine.map(row => row.$id))
  check('genau EINE Zeile trotz zweier Anfragen', mine.length === 1, `${mine.length}`)
  check('Bot-Anfrage wurde NICHT gespeichert', !botRow)
  const requestId = mine[0]?.$id

  // Der Betreiber soll die Anfrage nicht erst im Dashboard entdecken müssen:
  // die Glocke trägt sie für JEDEN Betreiber (notifyOperators, inviteRequests.ts).
  let bell = []
  for (let i = 0; i < 20 && !bell.length; i++) {
    const res = await control.listRows({
      databaseId, tableId: 'notifications',
      queries: [Query.equal('recipientId', operator.$id), Query.equal('type', 'invite.request'), Query.limit(10)],
    })
    bell = res.rows
    if (!bell.length) await new Promise(resolve => setTimeout(resolve, 300))
  }
  bellRows.push(...bell.map(row => row.$id))
  check('die Glocke des Betreibers trägt die Anfrage (genau einmal, mit der Adresse)',
    bell.length === 1 && bell[0].title === email, `${bell.length} Zeile(n) ${bell.map(row => row.title).join(', ')}`)
  if (EXPECT_OPERATOR_MAIL) {
    const operatorMail = await mailWithSubject(`Early-Access-Anfrage von ${email}`)
    if (!operatorMail.available) check('Betreiber-Mail zur neuen Anfrage liegt in Mailpit', false, 'Mailpit nicht erreichbar')
    else check('Betreiber-Mail zur neuen Anfrage liegt in Mailpit', !!operatorMail.message)
  }

  console.log('\n2. Betreiber weist zu (Mail geht raus)')
  const assign = await callStudio(`/api/control/invite-requests/${requestId}/assign`, { method: 'POST' })
  check('Zuweisung ohne Betreiber-Session abgelehnt', assign.status === 401 || assign.status === 403, `Status ${assign.status}`)

  // Für den Rest ohne Studio-Login: dieselben Utilities direkt fahren wäre
  // eine andere Codebahn — stattdessen die Zuweisung über die Datenschicht
  // nachstellen, wie es die Route tut, und danach den ECHTEN Einlöseweg prüfen.
  const { createHash, randomInt } = await import('node:crypto')
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const block = n => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  const code = `PUKA-${block(4)}-${block(4)}`
  const codeRow = await control.createRow({
    databaseId, tableId: 'invite_codes', rowId: ID.unique(),
    data: {
      codeHash: createHash('sha256').update(code, 'utf8').digest('hex'),
      label: 'Beweis', maxUses: 1, uses: 0, status: 'active',
      expiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      boundEmail: email, requestId, assignedAt: new Date().toISOString(),
    },
  })
  cleanup.track('inviteCode', codeRow.$id)
  await control.updateRow({
    databaseId, tableId: 'invite_requests', rowId: requestId,
    data: { status: 'assigned', inviteCodeId: codeRow.$id, assignedAt: new Date().toISOString() },
  })
  check('Code an die Adresse gebunden', true)

  console.log('\n3. Der Code gilt NUR für den Eingeladenen')
  // Ein gebundener Code gilt nur für eine BESTÄTIGTE Adresse, und seit BE-015
  // verlangt auch das Anlegen selbst eine. Die Adresse des Eingeladenen ist die
  // der Anfrage (`anfrage-<stamp>@example.test`).
  const invited = await createProbeAccount(pool, { tag: 'anfrage', stamp, name: 'Beweis' })
  const stranger = await createProbeAccount(pool, { tag: 'fremd', stamp, name: 'Beweis' })
  if (invited.email !== email) throw new Error(`Adresse des Kontos (${invited.email}) ist nicht die der Anfrage`)
  for (const account of [invited, stranger]) {
    cleanup.track('account', account.userId)
    account.cookie = await login(callPlatform, CONTROL_HOST, account)
  }

  const strangerCheck = await callPlatform(CONTROL_HOST, '/api/onboarding/precheck', {
    method: 'POST', cookie: stranger.cookie, body: { code },
  })
  check('Fremder: Code gilt nicht', strangerCheck.json?.codeValid === false, JSON.stringify(strangerCheck.json))

  const invitedCheck = await callPlatform(CONTROL_HOST, '/api/onboarding/precheck', {
    method: 'POST', cookie: invited.cookie, body: { code },
  })
  check('Eingeladener: Code gilt', invitedCheck.json?.codeValid === true, JSON.stringify(invitedCheck.json))

  console.log('\n4. Einlösen schreibt zurück')
  const slug = `anfrage-${stamp}`
  const created = await callPlatform(CONTROL_HOST, '/api/onboarding/site', {
    method: 'POST', cookie: invited.cookie,
    body: probeSiteBody({
      name: 'Kegelverein',
      slug,
      goal: 'relationships',
      vibe: 'warm',
      inviteCode: code,
      description: undefined,
    }),
  })
  check('Community angelegt', created.status === 200 && !!created.json?.communityId, `${created.status} ${created.text.slice(0, 160)}`)
  if (created.json?.communityId) cleanup.track('community', created.json.communityId)
  if (created.json?.tenantId) cleanup.track('tenant', created.json.tenantId)

  const afterRequest = await control.getRow({ databaseId, tableId: 'invite_requests', rowId: requestId })
  check('Anfrage steht auf „eingelöst"', afterRequest.status === 'redeemed', afterRequest.status)
  check('Einlöse-Zeitpunkt vermerkt', !!afterRequest.redeemedAt)
  check('Community verknüpft', afterRequest.communityId === created.json?.communityId, afterRequest.communityId)

  const afterCode = await control.getRow({ databaseId, tableId: 'invite_codes', rowId: codeRow.$id })
  check('Code als eingelöst markiert', !!afterCode.redeemedAt && afterCode.redeemedSiteId === created.json?.communityId)
  check('Code verbraucht (uses 1)', afterCode.uses === 1, `uses=${afterCode.uses}`)

  const reuse = await callPlatform(CONTROL_HOST, '/api/onboarding/precheck', {
    method: 'POST', cookie: invited.cookie, body: { code },
  })
  check('derselbe Code ein zweites Mal: ungültig', reuse.json?.codeValid === false)

  const members = await control.listRows({
    databaseId, tableId: 'community_members', queries: [Query.equal('communityId', created.json?.communityId ?? 'x'), Query.limit(5)],
  })
  for (const row of members.rows) cleanup.track('member', row.$id)
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n5. Aufräumen')
  for (const id of requestRows) await control.deleteRow({ databaseId, tableId: 'invite_requests', rowId: id }).catch(() => {})
  for (const id of bellRows) await control.deleteRow({ databaseId, tableId: 'notifications', rowId: id }).catch(() => {})
  for (const id of operators) await controlUsers.delete({ userId: id }).catch(() => {})
  const { deleted, leftovers } = await cleanup.run()
  const total = Object.values(deleted).reduce((sum, n) => sum + n, 0)
  console.log(`  gelöscht: ${total} Einträge (Konten, Community, Mitglieds-Zeilen, Code, Zeilen der Community)`)
  // Auch die Anfrage muss weg sein (nachgezählt über die Adresse, nicht geglaubt).
  const gone = (table, id) => control.getRow({ databaseId, tableId: table, rowId: id }).then(() => false, error => error?.code === 404)
  for (const id of requestRows) if (!await gone('invite_requests', id)) leftovers.push(`invite_requests:${id}`)
  for (const id of bellRows) if (!await gone('notifications', id)) leftovers.push(`notifications:${id}`)
  for (const id of operators) {
    if (await controlUsers.get({ userId: id }).then(() => true, error => error?.code !== 404)) leftovers.push(`Betreiber-Konto:${id}`)
  }
  check('aufgeräumt — nachgezählt, nichts übrig', leftovers.length === 0, leftovers.join(', '))
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}
