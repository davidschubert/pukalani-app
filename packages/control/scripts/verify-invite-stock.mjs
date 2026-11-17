/**
 * Beweis für Vorrat + Zuweisung MIT echter Betreiber-Session (control-017).
 *
 * Der Schwester-Beweis (verify-invite-requests.mjs) muss die Zuweisung über
 * die Datenschicht nachstellen, weil er keine Betreiber-Sitzung hat. Hier
 * wird genau diese Lücke geschlossen: ein Wegwerf-Betreiber (Label `admin`)
 * bekommt serverseitig eine Sitzung und fährt die ECHTEN Dashboard-Routen —
 * Vorrat auffüllen, zuweisen, erinnern, Statistik lesen.
 *
 * Geprüft wird dabei auch das Versprechen der Vorrats-Idee: ein freier Platz
 * ist NICHT einlösbar (sein Hash ist ein nie ausgegebener Zufallswert), und
 * der Betreiber bekommt den Klartext nie zu sehen — nur der Eingeladene per
 * Mail.
 *
 *   POOL_KEY=… node --env-file=apps/control/.env \
 *     packages/control/scripts/verify-invite-stock.mjs
 */
import '../../../scripts/lib/assert-target.mjs'
import { request as httpRequest } from 'node:http'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'
import { PERSON_COLUMNS, appwriteRest, findColumns, generatePassword, runStamp, sweepRows } from '../../../scripts/lib/probe-stage.mjs'

const PLATFORM_PORT = Number(process.env.PLATFORM_PORT || 3006)
const STUDIO_URL = process.env.STUDIO_URL || 'http://localhost:3004'
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025'
const CONTROL_HOST = process.env.CONTROL_HOST || 'app.localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
// Der Beweis bleibt im Kontroll-Projekt (Betreiber-Sitzung + Register); der
// Pool-Key wird nur als Anwesenheits-Signal geprüft, damit das Skript nicht
// halb durchläuft, wenn die Umgebung unvollständig ist.
const poolKey = process.env.POOL_KEY

if (!endpoint || !controlProject || !databaseId || !controlKey || !poolKey) {
  console.error('✗ Env unvollständig (POOL_KEY nötig).')
  process.exit(1)
}

const control = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
// Der Wegwerf-Betreiber ist ein Konto im Projekt des Control Plane — dafür
// braucht es `users.write`. Der Laufzeit-Schlüssel der Betreiber-App hat das,
// der Migrations-Schlüssel lokal nicht (in der CI hat EIN Schlüssel alle Rechte).
const controlUsers = new Users(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(process.env.NUXT_APPWRITE_KEY || controlKey))
const controlRest = appwriteRest({ endpoint, projectId: controlProject, key: controlKey, script: 'verify-invite-stock' })

let pass = 0
let fail = 0
const cleanup = { operators: [], requests: [], codes: [] }
/** Freie Plätze, die nicht von diesem Lauf stammen — Id → Zeile vor der Zuweisung. */
const foreignSlots = new Map()
/** Die Spalten eines Platzes, die Zuweisung und Erinnerung ändern. */
const SLOT_COLUMNS = ['codeHash', 'label', 'boundEmail', 'requestId', 'assignedAt', 'expiresAt', 'maxUses', 'uses', 'status']

function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

async function callStudio(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(`${STUDIO_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) }
  catch { /* HTML */ }
  return { status: res.status, json, text }
}

/**
 * Der Kunde stellt die Anfrage — öffentlich, über die Platform.
 * node:http statt fetch: fetch verwirft einen eigenen Host-Header, und genau
 * der entscheidet hier, ob die Route den Kontroll-Host sieht.
 */
async function requestAccess(email) {
  // Die öffentliche Route hat eine Missbrauchs-Bremse (3/min pro IP). Läuft
  // dieser Beweis kurz nach dem Schwester-Beweis, ist sie schon warm — das ist
  // richtig so, also wartet das Skript ab, statt die Bremse zu lockern.
  for (let attempt = 0; attempt < 4; attempt++) {
    const status = await postRequest(email)
    if (status !== 429) return status
    await new Promise(resolve => setTimeout(resolve, 21_000))
  }
  return 429
}

function postRequest(email) {
  const payload = JSON.stringify({ email, note: 'Vorrats-Beweis', locale: 'de' })
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host: '::1',
      port: PLATFORM_PORT,
      path: '/api/onboarding/request',
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), 'host': CONTROL_HOST },
    }, (res) => {
      res.resume()
      res.on('end', () => resolve(res.statusCode))
    })
    req.on('error', reject)
    req.end(payload)
  })
}

async function mailTo(email, attempts = 12) {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=5`).catch(() => null)
    if (!res) return { available: false }
    if (res.ok) {
      const { messages = [] } = await res.json()
      if (messages.length) {
        const detail = await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`).then(r => r.json())
        return { available: true, text: detail.Text || '' }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  return { available: true, text: null }
}

try {
  console.log(`\nBeweis Vorrat + Betreiber-Session — Studio ${STUDIO_URL}, Platform :${PLATFORM_PORT}\n`)
  const stamp = runStamp()

  console.log('1. Wegwerf-Betreiber mit echter Sitzung')
  const operator = await controlUsers.create({
    userId: ID.unique(),
    email: `betreiber-${stamp}@example.test`,
    password: generatePassword(),
    name: 'Vorrats-Beweis',
  })
  cleanup.operators.push(operator.$id)
  await controlUsers.updateLabels({ userId: operator.$id, labels: ['admin'] })
  const session = await controlUsers.createSession({ userId: operator.$id })
  const cookie = `a_session_${controlProject}=${session.secret}`
  const me = await callStudio('/api/control/invites', { cookie })
  check('Betreiber sieht die Einladungs-Liste', me.status === 200, `${me.status} ${me.text.slice(0, 120)}`)
  const anon = await callStudio('/api/control/invites')
  check('ohne Sitzung: kein Zugriff', anon.status === 401 || anon.status === 403, `Status ${anon.status}`)

  const before = me.json?.stock
  check('Statistik kommt mit (frei/zugewiesen/eingelöst/abgelaufen)',
    before && ['free', 'assigned', 'redeemed', 'expired', 'revoked', 'total'].every(k => typeof before[k] === 'number'),
    JSON.stringify(before))

  console.log('\n2. Vorrat auffüllen')
  const bulk = await callStudio('/api/control/invites/bulk', {
    method: 'POST', cookie, body: { count: 3, label: `Beweis-${stamp}`, expiresInDays: 90 },
  })
  check('3 Plätze angelegt', bulk.status === 200 && bulk.json?.created === 3, `${bulk.status} ${bulk.text.slice(0, 160)}`)

  const afterFill = await callStudio('/api/control/invites', { cookie })
  // Leere Plätze gehören in die ZAHL, nicht in die Liste: 50 gleiche Zeilen
  // ohne Adresse sagen nichts.
  check('leere Plätze tauchen NICHT als Zeilen auf',
    !(afterFill.json?.codes ?? []).some(c => c.state === 'free'))
  check('freie Plätze in der Statistik gestiegen', afterFill.json?.stock?.free === (before?.free ?? 0) + 3,
    `${before?.free} → ${afterFill.json?.stock?.free}`)
  check('kein Klartext in der Antwort', !/PUKA-[A-Z0-9]{4}-[A-Z0-9]{4}/.test(afterFill.text) && !/codeHash/.test(afterFill.text))

  console.log('\n3. Ein freier Platz ist NICHT einlösbar')
  // Der Hash eines Vorrats-Platzes ist ein Zufallswert, den niemand kennt —
  // es gibt also gar keinen Code, der ihn treffen könnte. Belegt wird das
  // negativ: die Zeile trägt keine Adresse und keinen Klartext-Ursprung.
  const rawStock = await control.listRows({
    databaseId, tableId: 'invite_codes',
    queries: [Query.equal('label', [`Beweis-${stamp}`]), Query.limit(5)],
  })
  cleanup.codes.push(...rawStock.rows.map(r => r.$id))
  check('Platz ohne Adressbindung und ohne Verbrauch',
    rawStock.rows.length === 3 && rawStock.rows.every(r => !r.boundEmail && r.uses === 0 && r.codeHash.length === 64))

  console.log('\n4. Zuweisung über die ECHTE Route')
  // Die Zuweisung nimmt den ÄLTESTEN freien Platz — das muss nicht einer der
  // drei eigenen sein (eine geteilte Datenbank hat oft schon Vorrat). Deshalb
  // der Stand aller freien Plätze direkt davor: ein fremder Platz, den Zuweisung
  // oder Erinnerung verbrauchen, wird im Aufräumen wiederhergestellt statt gelöscht.
  const nowIso = new Date().toISOString()
  const freeBefore = await control.listRows({
    databaseId, tableId: 'invite_codes',
    queries: [
      Query.equal('status', ['active']), Query.equal('boundEmail', ['']), Query.equal('uses', [0]),
      Query.or([Query.isNull('expiresAt'), Query.greaterThan('expiresAt', nowIso)]),
      Query.limit(100),
    ],
  })
  for (const row of freeBefore.rows) {
    if (!rawStock.rows.some(own => own.$id === row.$id)) foreignSlots.set(row.$id, row)
  }
  const applicant = `vorrat-${stamp}@example.test`
  check('Anfrage angenommen', await requestAccess(applicant) === 200)
  const reqRows = await control.listRows({
    databaseId, tableId: 'invite_requests', queries: [Query.equal('email', [applicant]), Query.limit(1)],
  })
  const requestId = reqRows.rows[0]?.$id
  cleanup.requests.push(...reqRows.rows.map(r => r.$id))
  check('Anfrage liegt in der Warteschlange', !!requestId)

  const assign = await callStudio(`/api/control/invite-requests/${requestId}/assign`, { method: 'POST', cookie })
  check('Zuweisung erfolgreich', assign.status === 200, `${assign.status} ${assign.text.slice(0, 200)}`)
  check('Betreiber bekommt den Klartext NICHT zu sehen', !/PUKA-[A-Z0-9]{4}-[A-Z0-9]{4}/.test(assign.text), assign.text.slice(0, 120))

  const mail = await mailTo(applicant)
  if (!mail.available) console.log('   ⊘ Mailpit nicht erreichbar — Kunden-Mail ungeprüft')
  else check('Kunde hat den Code per Mail', !!mail.text && /PUKA-[A-Z0-9]{4}-[A-Z0-9]{4}/.test(mail.text))

  const afterAssign = await callStudio('/api/control/invites', { cookie })
  const usedSlot = (afterAssign.json?.codes ?? []).find(c => c.boundEmail === applicant)
  if (usedSlot) cleanup.codes.push(usedSlot.id)
  check('der Code steht jetzt auf „zugewiesen"', usedSlot?.state === 'assigned', usedSlot?.state)
  // Die Zuweisung nimmt einen Platz AUS DEM VORRAT (takeFromStock, ältester
  // freier zuerst) — sie legt keinen neuen Code daneben an. Gemessen am Stand
  // direkt davor: der gebundene Code war ein freier Platz, und zwar der älteste.
  const oldestFree = [...freeBefore.rows].sort((a, b) => a.$createdAt.localeCompare(b.$createdAt))[0]
  check('die Zuweisung kam aus dem Vorrat (der älteste freie Platz ist jetzt gebunden)',
    !!usedSlot && usedSlot.id === oldestFree?.$id,
    `zugewiesener Code ${usedSlot?.id ?? '—'} ${freeBefore.rows.some(r => r.$id === usedSlot?.id) ? 'aus dem Vorrat' : 'NEU angelegt'}, ältester freier ${oldestFree?.$id ?? '—'}`)
  check('ein Platz weniger frei', afterAssign.json?.stock?.free === (afterFill.json?.stock?.free ?? 0) - 1,
    `${afterFill.json?.stock?.free} → ${afterAssign.json?.stock?.free}`)

  console.log('\n5. Erinnern')
  const remind = await callStudio(`/api/control/invite-requests/${requestId}/assign`, { method: 'POST', cookie })
  check('erste Erinnerung geht raus', remind.status === 200, `${remind.status} ${remind.text.slice(0, 160)}`)
  const again = await callStudio(`/api/control/invite-requests/${requestId}/assign`, { method: 'POST', cookie })
  check('zweite Erinnerung sofort danach: abgelehnt (Sperrfrist)', again.status === 429 || again.status === 409,
    `Status ${again.status}`)

  const reqAfter = requestId
    ? await control.getRow({ databaseId, tableId: 'invite_requests', rowId: requestId })
    : {}
  check('Erinnerung ist gezählt', reqAfter.reminders === 1, `${reqAfter.reminders}`)
  // Die Erinnerung ersetzt den Code — der alte darf nicht weiterleben.
  const codesForRequest = requestId
    ? await control.listRows({
        databaseId, tableId: 'invite_codes', queries: [Query.equal('requestId', [requestId]), Query.limit(10)],
      })
    : { rows: [] }
  cleanup.codes.push(...codesForRequest.rows.map(r => r.$id))
  const active = codesForRequest.rows.filter(r => (r.status || 'active') === 'active')
  check('genau EIN gültiger Code je Anfrage (alter widerrufen)', active.length === 1,
    `${active.length} von ${codesForRequest.rows.length}`)
}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error?.message || error)
}
finally {
  console.log('\n6. Aufräumen')
  // Eigene Codes löschen; einen FREMDEN Platz, den der Lauf verbraucht hat,
  // in den Zustand von vorher zurückstellen — er gehört nicht diesem Lauf.
  for (const id of new Set(cleanup.codes)) {
    const original = foreignSlots.get(id)
    if (original) {
      const data = Object.fromEntries(SLOT_COLUMNS.map(column => [column, original[column] ?? null]))
      await control.updateRow({ databaseId, tableId: 'invite_codes', rowId: id, data }).catch(() => {})
    }
    else {
      await control.deleteRow({ databaseId, tableId: 'invite_codes', rowId: id }).catch(() => {})
    }
  }
  for (const id of new Set(cleanup.requests)) {
    await control.deleteRow({ databaseId, tableId: 'invite_requests', rowId: id }).catch(() => {})
  }
  // Was am Betreiber hängt (Glocke zur Anfrage, Protokoll der Zuweisung) —
  // über die Personen-Spalten des Control Plane, wie die gemeinsame Hilfe es tut.
  const operatorIds = [...new Set(cleanup.operators)]
  const personTargets = await findColumns(controlRest, databaseId, PERSON_COLUMNS)
    ?? [{ tableId: 'notifications', column: 'recipientId' }]
  await sweepRows(controlRest, databaseId, personTargets, operatorIds, { remove: true })
  for (const id of operatorIds) {
    await controlUsers.delete({ userId: id }).catch(() => {})
  }
  // NACHZÄHLEN — nicht dem eigenen Löschen glauben.
  const leftovers = []
  const gone = (table, id) => control.getRow({ databaseId, tableId: table, rowId: id }).then(() => false, error => error?.code === 404)
  const restored = id => control.getRow({ databaseId, tableId: 'invite_codes', rowId: id })
    .then(row => SLOT_COLUMNS.every(column => (row[column] ?? null) === (foreignSlots.get(id)[column] ?? null)), () => false)
  for (const id of new Set(cleanup.codes)) {
    if (foreignSlots.has(id)) { if (!await restored(id)) leftovers.push(`invite_codes:${id} (fremder Platz nicht zurückgestellt)`) }
    else if (!await gone('invite_codes', id)) leftovers.push(`invite_codes:${id}`)
  }
  for (const id of new Set(cleanup.requests)) if (!await gone('invite_requests', id)) leftovers.push(`invite_requests:${id}`)
  for (const [key, n] of Object.entries(await sweepRows(controlRest, databaseId, personTargets, operatorIds))) leftovers.push(`${key}=${n}`)
  for (const id of operatorIds) {
    if (await controlUsers.get({ userId: id }).then(() => true, error => error?.code !== 404)) leftovers.push(`Betreiber-Konto:${id}`)
  }
  check('aufgeräumt — nachgezählt, nichts übrig', leftovers.length === 0, leftovers.join(', '))
  console.log(`\n${fail ? '✗' : '✔'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail ? 1 : 0)
}
