#!/usr/bin/env node
/**
 * Beweis: den Auftragstext eines Runner-Laufs baut der Server (RU1 b).
 *
 * Gefahren wird der ECHTE Weg der Betreiber-App — Ticket anlegen, Lauf
 * anlegen, freigeben, vom Rechner abholen — gegen die lokale Test-Instanz.
 * Ein Agent läuft dabei NICHT: geprüft wird bis zu der Stelle, an der ein
 * Rechner den Lauf abholt (`runs/claim`); was er dort bekommt, ist der
 * Auftrag.
 *
 * WAS ER ZEIGT
 *  1. Ohne Text in der Anfrage speichert die Anlege-Route den Text, den der
 *     Server aus der Ticket-Zeile baut: Titel, Beschreibung OHNE den
 *     KI-Triage-Abschnitt, nur die OFFENEN Punkte der Checkliste.
 *  2. Ein anderer Text in der Anfrage wird nicht übernommen (409
 *     `prompt_changed`), und es entsteht kein Lauf.
 *  3. Schickt die Oberfläche genau den Text mit, den sie als Vorschau zeigt,
 *     entsteht der Lauf — mit dem Text des Servers.
 *  4. Ändert sich das Ticket, passt die alte Vorschau nicht mehr (409); ohne
 *     Vorschau läuft der NEUE Text.
 *  5. Was der Rechner beim Abholen bekommt, ist Zeichen für Zeichen dieser
 *     Text.
 *
 * DIE ERWARTUNG STEHT AUSGESCHRIEBEN HIER (`EXPECTED_*`) — sie wird nicht aus
 * einer Antwort abgeleitet und nicht mit der Funktion des Programms gebaut
 * (Beweis-Regel 1: sonst wäre die Prüfung immer grün).
 *
 * WAS ER NICHT ZEIGT: die Vorschau im Formular selbst (Browser), einen Lauf
 * mit echtem Agenten, die Anhänge.
 *
 * Aufruf (die Betreiber-App muss AUS DIESEM Arbeitsbaum laufen):
 *
 *   node --env-file=apps/control/.env apps/control/scripts/verify-run-prompt.mjs
 *   PROBE_BASE=http://localhost:3147 node --env-file=… …   # anderer Port
 *
 * Aufgeräumt wird im `finally`, auch wenn der Lauf rot ist — und nachgezählt.
 */
import '../../../scripts/lib/assert-target.mjs'
import { createHash, randomBytes } from 'node:crypto'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'
import { generatePassword, probeEmail, runStamp } from '../../../scripts/lib/probe-stage.mjs'

const BASE = process.env.PROBE_BASE ?? 'http://localhost:3004'
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Fehlende Env-Vars — mit --env-file=apps/control/.env aufrufen.')
  process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const db = new TablesDB(client)
const users = new Users(client)

const STAMP = runStamp()
const EMAIL = probeEmail('run-prompt', STAMP)
const PASSWORD = generatePassword()
const USER_ID = `runprompt${STAMP}`

const TITLE = `Auftrags-Beweis ${STAMP}`
/** Der Abschnitt, den die KI-Triage an eine Beschreibung hängt (`shared/triageBlock.ts`). */
const TRIAGE_BLOCK = '\n\n---\n\n**🤖 KI-Triage** (Probe)\n\nRelevanz 5/5 — dieser Absatz darf nie im Auftrag stehen.'
const DESCRIPTION = 'Der Knopf **Speichern** hat keine Beschriftung.\n\n- Seite: /dashboard'
const DESCRIPTION_CHANGED = 'Der Knopf **Speichern** hat jetzt eine Beschriftung, aber die falsche.'

const EXPECTED_FIRST = `# ${TITLE}\n\n${DESCRIPTION}\n\n## Checkliste\n\n- [ ] Beschriftung setzen\n- [ ] Test ergänzen\n`
const EXPECTED_CHANGED = `# ${TITLE}\n\n${DESCRIPTION_CHANGED}\n\n## Checkliste\n\n- [ ] Beschriftung setzen\n- [ ] Test ergänzen\n`

const results = []
function check(name, pass, detail) {
  results.push(pass)
  console.log(`${pass ? '✔' : '✗'} ${name}${!pass && detail ? ` — ${detail}` : ''}`)
}

const cleanup = { user: false, listId: '', ticketId: '', runnerId: '' }
let cookie = ''

/**
 * Jede Anfrage hat eine Frist. Ohne sie bliebe das Skript an einem Server
 * hängen, der gerade neu lädt — und käme nie in sein `finally` (das Konto,
 * die Liste und das Ticket der Probe blieben liegen).
 */
const TIMEOUT_MS = 30_000

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json, reason: json?.reason ?? json?.data?.reason ?? '' }
}

const runBody = (overrides = {}) => ({
  subjectType: 'ticket',
  subjectId: cleanup.ticketId,
  repoKey: 'maui',
  model: 'opus',
  permissionMode: 'plan',
  ...overrides,
})

async function runsOfTicket() {
  const res = await db.listRows({
    databaseId, tableId: 'runs',
    queries: [Query.equal('subjectId', cleanup.ticketId), Query.limit(100)],
  })
  return res.rows
}

async function removeRows(tableId, queries) {
  let removed = 0
  for (;;) {
    const res = await db.listRows({ databaseId, tableId, queries: [...queries, Query.limit(100)] })
    if (!res.rows.length) return removed
    for (const row of res.rows) {
      await db.deleteRow({ databaseId, tableId, rowId: row.$id })
      removed++
    }
  }
}

const count = async (tableId, queries) =>
  (await db.listRows({ databaseId, tableId, queries: [...queries, Query.limit(1)] })).total

try {
  // ── Wegwerf-Betreiber ───────────────────────────────────────────────────
  await users.create({ userId: USER_ID, email: EMAIL, password: PASSWORD, name: 'Run Prompt Verify' })
  cleanup.user = true
  await users.updateLabels({ userId: USER_ID, labels: ['admin'] })

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  cookie = (login.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).find(c => c.startsWith('a_session_')) ?? ''
  check('Betreiber: Anmeldung über /api/auth/login', login.status === 200 && !!cookie, `status ${login.status}`)
  if (!cookie) throw new Error('ohne Sitzung geht es nicht weiter')

  // ── Ein Ticket über die echte Route ─────────────────────────────────────
  const list = await api('/api/tickets/lists', { method: 'POST', body: { title: `Beweis ${STAMP}` } })
  cleanup.listId = list.json?.$id ?? ''
  const ticket = await api('/api/tickets', {
    method: 'POST',
    body: {
      listId: cleanup.listId,
      title: TITLE,
      description: `${DESCRIPTION}${TRIAGE_BLOCK}`,
      checklist: [
        { text: 'Beschriftung setzen', done: false },
        { text: 'schon erledigt', done: true },
        { text: 'Test ergänzen', done: false },
      ],
    },
  })
  cleanup.ticketId = ticket.json?.$id ?? ''
  check('Ticket über POST /api/tickets angelegt (Herkunft: Betreiber)',
    ticket.status < 300 && ticket.json?.origin === 'operator', `status ${ticket.status}, origin ${ticket.json?.origin}`)
  if (!cleanup.ticketId) throw new Error('ohne Ticket geht es nicht weiter')

  // ── 1. Ohne Text in der Anfrage ─────────────────────────────────────────
  const first = await api('/api/runner/runs', { method: 'POST', body: runBody() })
  check('1. Lauf ohne Text in der Anfrage wird angelegt (201)', first.status === 201, `status ${first.status} ${first.reason}`)
  check('1. gespeichert ist der Text aus der Ticket-Zeile, Zeichen für Zeichen',
    first.json?.promptSource === EXPECTED_FIRST, JSON.stringify(first.json?.promptSource))
  check('1. der KI-Triage-Abschnitt steht nicht im Auftrag', !String(first.json?.promptSource).includes('KI-Triage'))
  check('1. der erledigte Punkt steht nicht im Auftrag', !String(first.json?.promptSource).includes('schon erledigt'))
  check('1. der Lauf gilt als geprüft (Ticket vom Betreiber, Text vom Server)', first.json?.promptTrusted === true)

  // ── 2. Ein fremder Text ─────────────────────────────────────────────────
  const before = (await runsOfTicket()).length
  const foreign = await api('/api/runner/runs', {
    method: 'POST',
    body: runBody({ promptSource: '# Ein anderer Auftrag\n\nMach etwas ganz anderes.' }),
  })
  check('2. ein anderer Text in der Anfrage ⇒ 409 prompt_changed',
    foreign.status === 409 && foreign.reason === 'prompt_changed', `status ${foreign.status} ${foreign.reason}`)
  check('2. dabei ist kein Lauf entstanden', (await runsOfTicket()).length === before, `${(await runsOfTicket()).length} statt ${before}`)

  // ── 3. Die Vorschau stimmt ──────────────────────────────────────────────
  const same = await api('/api/runner/runs', { method: 'POST', body: runBody({ promptSource: EXPECTED_FIRST }) })
  check('3. derselbe Text wie die Vorschau ⇒ angelegt, mit dem Text des Servers',
    same.status === 201 && same.json?.promptSource === EXPECTED_FIRST, `status ${same.status} ${same.reason}`)

  // ── 4. Das Ticket ändert sich ───────────────────────────────────────────
  const patched = await api(`/api/tickets/${cleanup.ticketId}`, { method: 'PATCH', body: { description: DESCRIPTION_CHANGED } })
  check('4. Ticket geändert (PATCH)', patched.status < 300, `status ${patched.status}`)
  const stale = await api('/api/runner/runs', { method: 'POST', body: runBody({ promptSource: EXPECTED_FIRST }) })
  check('4. die alte Vorschau passt nicht mehr ⇒ 409 prompt_changed',
    stale.status === 409 && stale.reason === 'prompt_changed', `status ${stale.status} ${stale.reason}`)

  // ── 5. Was der Rechner abholt ───────────────────────────────────────────
  // Ein Probe-Rechner, angelegt wie es die Registrierung täte (Muster
  // `verify-runner-boundary.mjs`). Der Lauf ist AN IHN gerichtet.
  const secret = randomBytes(16).toString('hex')
  const runner = await db.createRow({
    databaseId, tableId: 'runners', rowId: ID.unique(),
    data: {
      name: `Beweis ${STAMP}`, kind: 'local',
      secretHash: createHash('sha256').update(secret).digest('hex'),
      capabilitiesJson: '', lastSeenAt: null, status: 'active',
    },
  })
  cleanup.runnerId = runner.$id

  const fresh = await api('/api/runner/runs', { method: 'POST', body: runBody({ runnerId: runner.$id }) })
  check('5. nach der Änderung läuft ohne Vorschau der NEUE Text',
    fresh.status === 201 && fresh.json?.promptSource === EXPECTED_CHANGED, JSON.stringify(fresh.json?.promptSource))

  const queued = await api(`/api/runner/runs/${fresh.json?.$id}/queue`, { method: 'POST' })
  check('5. Lauf freigegeben (queue)', queued.status < 300 && queued.json?.status === 'queued', `status ${queued.status}`)

  // Abholen nimmt den ÄLTESTEN wartenden Lauf, der an diesen Rechner oder an
  // „beliebig" gerichtet ist. Wartet in der Datenbank ein fremder Lauf an
  // „beliebig", würde die Probe IHN abholen — dann wird nicht abgeholt.
  const waiting = await db.listRows({
    databaseId, tableId: 'runs',
    queries: [Query.equal('status', 'queued'), Query.equal('runnerId', ['', runner.$id]), Query.limit(10)],
  })
  const foreignWaiting = waiting.rows.filter(row => row.$id !== fresh.json?.$id)
  if (foreignWaiting.length) {
    check(`5. Abholen NICHT geprüft: ${foreignWaiting.length} fremde(r) Lauf/Läufe warten in dieser Datenbank`, false,
      'auf einer Datenbank ohne wartende Läufe fahren')
  }
  else {
    const res = await fetch(`${BASE}/api/runner/runs/claim`, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json', 'authorization': `Bearer ${runner.$id}.${secret}` },
      body: '{}',
    })
    const claimed = await res.json().catch(() => null)
    check('5. der Rechner holt genau diesen Lauf ab', res.status === 200 && claimed?.run?.$id === fresh.json?.$id, `status ${res.status}`)
    check('5. was er bekommt, ist der Text des Servers, Zeichen für Zeichen',
      claimed?.run?.promptSource === EXPECTED_CHANGED, JSON.stringify(claimed?.run?.promptSource))
  }
}
catch (error) {
  check(`Abbruch: ${error instanceof Error ? error.message : String(error)}`, false)
}
finally {
  // ── Aufräumen, dann NACHZÄHLEN ──────────────────────────────────────────
  if (!process.argv.includes('--keep')) {
    const left = []
    try {
      if (cleanup.ticketId) {
        const runs = await runsOfTicket()
        for (const run of runs) await removeRows('run_events', [Query.equal('runId', run.$id)])
        await removeRows('runs', [Query.equal('subjectId', cleanup.ticketId)])
        await db.deleteRow({ databaseId, tableId: 'tickets', rowId: cleanup.ticketId }).catch(() => {})
        if (await count('runs', [Query.equal('subjectId', cleanup.ticketId)])) left.push('Läufe')
        if (await count('tickets', [Query.equal('$id', cleanup.ticketId)])) left.push('Ticket')
      }
      if (cleanup.listId) {
        await db.deleteRow({ databaseId, tableId: 'ticket_lists', rowId: cleanup.listId }).catch(() => {})
        if (await count('ticket_lists', [Query.equal('$id', cleanup.listId)])) left.push('Liste')
      }
      if (cleanup.runnerId) {
        await db.deleteRow({ databaseId, tableId: 'runners', rowId: cleanup.runnerId }).catch(() => {})
        if (await count('runners', [Query.equal('$id', cleanup.runnerId)])) left.push('Rechner')
      }
      if (cleanup.user) {
        // Die Protokoll-Zeilen der Probe gehören mit weg (Anmeldung, Anlegen).
        await removeRows('audit_logs', [Query.equal('actorId', USER_ID)]).catch(() => {})
        await users.delete({ userId: USER_ID }).catch(() => {})
        const gone = await users.get({ userId: USER_ID }).then(() => false, error => error?.code === 404)
        if (!gone) left.push('Konto')
      }
    }
    catch (error) {
      left.push(`Aufräumen gescheitert: ${error instanceof Error ? error.message : String(error)}`)
    }
    check('aufgeräumt — nachgezählt: Läufe, Ticket, Liste, Rechner und Konto sind weg', left.length === 0, left.join(', '))
  }
}

const failed = results.filter(ok => !ok).length
console.log(`\n${results.length - failed}/${results.length} Prüfungen grün`)
process.exit(failed ? 1 : 0)
