/**
 * Beweis: die RUNNER-NAHT des AI-Runners hält — docs/archiv/AI-RUNNER.md § 5.
 *
 * ── WAS HIER GEMESSEN WIRD, UND WARUM GERADE DAS ───────────────────────────
 * Die Naht hat zwei Publikums-Klassen. Die eine (Board) hängt an Session +
 * `runner.manage` — dieselbe Wache wie überall, geprüft über Unit-Tests und
 * Review. Die andere ist NEU im Haus: ein Bearer-Secret ohne Session, das
 * einem Programm auf einem fremden Rechner erlaubt, Zustände zu bewegen. Sie
 * ist der Teil, den man nicht durch Lesen glauben sollte:
 *
 *   1. Ohne Authorization-Header  ⇒ 401
 *   2. Erfundenes Token           ⇒ 401 — DIESELBE Antwort (kein Orakel)
 *   3. Echtes Token, leere Schlange ⇒ { run: null }
 *   4. Ein wartender Lauf         ⇒ genau der, Zustand 'claimed'
 *   5. Sofort noch einmal claimen ⇒ null (kein Doppel-Claim)
 *   6. Fremdes Token auf denselben Lauf ⇒ 403 `not_your_run`
 *   7. sessionId wird GESTEMPELT, nie überschrieben (§ 7.2 Schritt 1)
 *   8. Ein wiederholtes Bündel schreibt KEINE zweite Zeile (Retry-Dedupe)
 *   9. Nach „Abbrechen" trägt die Ereignis-Antwort 'cancelled' (§ 9)
 *  10. `finish: succeeded` auf einen abgebrochenen Lauf ⇒ 409 (er bleibt)
 *  11. Ein stillgelegter Runner ⇒ 401
 *
 * ── WAS HIER (NOCH) NICHT GEMESSEN WIRD ────────────────────────────────────
 * § 10 Punkt 6 nennt für diesen Beweis auch die BOARD-Seite: ein erfundener
 * `repoKey`, ein gesperrter Modus und ein `promptTrusted:false`-Lauf mit
 * `bypassPermissions` sollen einzeln rot werden. Zwei davon leben hier nicht:
 *  - Die Modus-Sperre (§ 8.2) hängt an `POST /api/runner/runs` und damit an
 *    einer SESSION mit `runner.manage` — dieses Skript hat keine. Gemessen
 *    wird sie als pure Regel in `tests/runGuards.test.ts` (inkl. der Zeile
 *    „ungeprüft ⇒ bypassPermissions GESPERRT") und im Handler durchgesetzt.
 *  - Ein erfundener `repoKey` ist per Entwurf KEIN Serverfehler (§ 8.1: der
 *    Server kennt die Allowlist nicht) — er lässt den Lauf beim RUNNER
 *    scheitern und gehört deshalb in den Beweis von Paket 4.
 *
 * ── DIE GEGENPROBE GEHÖRT DAZU ─────────────────────────────────────────────
 * Muster `verify-handle-search-boundary.mjs`: erst wenn das ENTFERNEN einer
 * Sicherung diesen Lauf rot macht, hat er etwas gezeigt. Zu fahren, sobald
 * einer der Riegel angefasst wird:
 *   (a) `requireOwnRun` in `events.post.ts` entfernen  ⇒ Prüfung 6 fällt.
 *   (b) In `events.post.ts` `stamps.sessionId` bedingungslos setzen
 *       (Erst-Wert-Regel weg)                          ⇒ Prüfung 7 fällt.
 *   (c) Den `entry.seq <= highest`-Filter entfernen     ⇒ Prüfung 8 fällt.
 *   (d) In `finish.post.ts` `runTransitionAllowed` entfernen ⇒ 10 fällt.
 *   (e) In `runnerAuth.ts` die `status !== 'active'`-Zeile entfernen ⇒ 11 fällt.
 *
 * ── SO WIRD ER GEFAHREN ────────────────────────────────────────────────────
 * Der control-Dev-Server muss laufen, und zwar AUS DIESEM Arbeitsbaum
 * (CLAUDE.md „Worktree-Beweise": ein Server aus dem Haupt-Repo misst fremden
 * Code):
 *
 *   pnpm --filter control exec nuxi dev --port 3004
 *   node --env-file=apps/control/.env packages/runner/scripts/verify-runner-boundary.mjs
 *
 * Anderer Port: `RUNNER_VERIFY_BASE=http://localhost:3014 node …`
 *
 * ZWEI FALLEN, beide aus den bestehenden Beweis-Skripten geerbt: Nodes `fetch`
 * verwirft einen selbst gesetzten Host-Header, und Nitro hört auf `[::1]`
 * (Vites HMR-Server auf IPv4 — über 127.0.0.1 kommt 426 „Upgrade Required"
 * zurück). Deshalb node:http über ::1.
 *
 * Aufgeräumt wird im `finally` — auch wenn der Lauf rot ist.
 */
import '../../../scripts/lib/assert-target.mjs'
import { request } from 'node:http'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Client, ID, Query, TablesDB } from 'node-appwrite'

const BASE = new URL(process.env.RUNNER_VERIFY_BASE || 'http://localhost:3004')
const PORT = Number(BASE.port || 80)

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — mit --env-file=apps/control/.env starten.')
  process.exit(1)
}

const db = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const RUNNERS_TABLE = 'runners'
const RUNS_TABLE = 'runs'
const RUN_EVENTS_TABLE = 'run_events'

let pass = 0
let fail = 0
const cleanup = { runners: [], runs: [] }

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

/** node:http über ::1 (Begründung im Kopf). */
function call(path, { method = 'POST', body, token } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body)
    const req = request({
      host: '::1',
      port: PORT,
      path,
      method,
      headers: {
        host: BASE.host,
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) }
        catch { /* HTML-Fehlerseite */ }
        resolve({ status: res.statusCode, json, text })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

const sha256 = value => createHash('sha256').update(value).digest('hex')

/** Ein Runner samt Klartext-Secret — angelegt per Admin-Client, wie es die
 *  Registrierungs-Route auch täte (nur ohne Session). */
async function makeRunner(name) {
  const secret = randomBytes(16).toString('hex')
  const row = await db.createRow({
    databaseId, tableId: RUNNERS_TABLE, rowId: ID.unique(),
    data: {
      name, kind: 'local', secretHash: sha256(secret),
      capabilitiesJson: '', lastSeenAt: null, status: 'active',
    },
  })
  cleanup.runners.push(row.$id)
  return { id: row.$id, token: `${row.$id}.${secret}` }
}

async function makeQueuedRun(subjectId) {
  const row = await db.createRow({
    databaseId, tableId: RUNS_TABLE, rowId: ID.unique(),
    data: {
      subjectType: 'ticket', subjectId, runnerId: '', executor: 'claude-code',
      status: 'queued', repoKey: 'maui-monorepo', baseBranch: 'main', workBranch: '',
      model: 'sonnet', permissionMode: 'plan', interactive: false,
      promptSource: 'Beweislauf — wird nie ausgeführt.', promptTrusted: true,
      testCommands: '', attachmentsJson: '', maxBudgetUsd: 0, sessionId: '',
      claimedAt: null, startedAt: null, finishedAt: null,
      resultJson: '', error: '', createdBy: 'verify-script',
    },
  })
  cleanup.runs.push(row.$id)
  return row.$id
}

const getRun = id => db.getRow({ databaseId, tableId: RUNS_TABLE, rowId: id })
async function countEvents(runId) {
  const list = await db.listRows({
    databaseId, tableId: RUN_EVENTS_TABLE,
    queries: [Query.equal('runId', runId), Query.limit(100)],
  })
  return list.rows.length
}

const now = () => new Date().toISOString()

console.log(`\nAI-Runner — Beweis der Runner-Naht gegen ${BASE.origin}\n`)

try {
  console.log('1./2. Ohne und mit erfundenem Token')
  const anonymous = await call('/api/runner/runs/claim', { body: {} })
  check('claim ohne Authorization → 401', anonymous.status === 401, `Status ${anonymous.status}`)
  const bogusId = 'a'.repeat(20)
  const bogus = await call('/api/runner/runs/claim', { body: {}, token: `${bogusId}.${randomBytes(16).toString('hex')}` })
  check('claim mit erfundenem Token → 401', bogus.status === 401, `Status ${bogus.status}`)
  // KEIN ORAKEL: beide Wege müssen sich bis auf den Statuscode gleichen —
  // sonst verrät die Antwort, welche Row-Ids echt sind.
  check('beide Fehlwege antworten identisch (kein Orakel)',
    anonymous.status === bogus.status && anonymous.text === bogus.text,
    `„${anonymous.text}" vs. „${bogus.text}"`)

  console.log('\n3. Echtes Token, leere Schlange')
  const runnerA = await makeRunner('verify-runner-a')
  const runnerB = await makeRunner('verify-runner-b')
  const empty = await call('/api/runner/runs/claim', { body: {}, token: runnerA.token })
  check('claim → 200', empty.status === 200, `Status ${empty.status}`)
  check('claim → { run: null }', empty.json?.run === null, JSON.stringify(empty.json))

  console.log('\n4./5. Ein wartender Lauf')
  const runId = await makeQueuedRun(`verify-${Date.now()}`)
  const claimed = await call('/api/runner/runs/claim', { body: {}, token: runnerA.token })
  check('claim liefert genau diesen Lauf', claimed.json?.run?.$id === runId, JSON.stringify(claimed.json?.run?.$id))
  check('Zustand ist „claimed"', claimed.json?.run?.status === 'claimed', claimed.json?.run?.status)
  check('der Lauf gehört jetzt dem Aufrufer', claimed.json?.run?.runnerId === runnerA.id, claimed.json?.run?.runnerId)
  const second = await call('/api/runner/runs/claim', { body: {}, token: runnerA.token })
  check('zweiter claim → null (kein Doppel-Claim)', second.json?.run === null, JSON.stringify(second.json))

  console.log('\n6. Fremder Runner auf fremdem Lauf')
  const foreign = await call(`/api/runner/runs/${runId}/events`, {
    token: runnerB.token,
    body: { events: [{ seq: 0, kind: 'status', message: 'fremd', at: now() }] },
  })
  check('events mit fremdem Token → 403', foreign.status === 403, `Status ${foreign.status}`)
  check('403 nennt den Grund `not_your_run`', foreign.json?.reason === 'not_your_run', JSON.stringify(foreign.json))

  console.log('\n7. Erst-Wert-Regel für sessionId (§ 7.2 Schritt 1)')
  const sessionOne = randomUUID()
  const sessionTwo = randomUUID()
  const firstEvents = await call(`/api/runner/runs/${runId}/events`, {
    token: runnerA.token,
    body: { sessionId: sessionOne, events: [{ seq: 0, kind: 'status', message: 'gestartet', at: now() }] },
  })
  check('events → 200', firstEvents.status === 200, `Status ${firstEvents.status}`)
  check('Antwort trägt „running"', firstEvents.json?.status === 'running', JSON.stringify(firstEvents.json))
  let row = await getRun(runId)
  check('sessionId ist gestempelt', row.sessionId === sessionOne, row.sessionId)
  check('startedAt ist gesetzt', !!row.startedAt, String(row.startedAt))
  await call(`/api/runner/runs/${runId}/events`, {
    token: runnerA.token,
    body: { sessionId: sessionTwo, events: [{ seq: 1, kind: 'text', message: 'weiter', at: now() }] },
  })
  row = await getRun(runId)
  check('zweite sessionId überschreibt NICHT', row.sessionId === sessionOne, row.sessionId)

  console.log('\n8. Retry-Dedupe über `seq`')
  const before = await countEvents(runId)
  const repeat = await call(`/api/runner/runs/${runId}/events`, {
    token: runnerA.token,
    body: { events: [{ seq: 1, kind: 'text', message: 'weiter (Wiederholung)', at: now() }] },
  })
  check('Wiederholung → 200 (kein Fehler für den Runner)', repeat.status === 200, `Status ${repeat.status}`)
  check('Wiederholung wird verworfen (accepted = 0)', repeat.json?.accepted === 0, JSON.stringify(repeat.json))
  const after = await countEvents(runId)
  check('keine zweite Zeile in run_events', after === before, `${before} → ${after}`)

  console.log('\n9./10. Abbrechen schlägt den Nachlauf')
  // Was der Board-Knopf tut, hier direkt gesetzt — geprüft wird die WIRKUNG
  // auf die Runner-Seite, nicht die Board-Route (die hängt an einer Session).
  await db.updateRow({
    databaseId, tableId: RUNS_TABLE, rowId: runId,
    data: { status: 'cancelled', finishedAt: now() },
  })
  const afterCancel = await call(`/api/runner/runs/${runId}/events`, {
    token: runnerA.token,
    body: { events: [{ seq: 2, kind: 'text', message: 'läuft noch', at: now() }] },
  })
  check('events-Antwort trägt „cancelled" (so erfährt es der Runner)',
    afterCancel.json?.status === 'cancelled', JSON.stringify(afterCancel.json))
  const lateFinish = await call(`/api/runner/runs/${runId}/finish`, {
    token: runnerA.token,
    body: { status: 'succeeded', resultJson: '{}' },
  })
  check('finish succeeded → 409', lateFinish.status === 409, `Status ${lateFinish.status}`)
  check('409 nennt den Grund `not_finishable`', lateFinish.json?.reason === 'not_finishable', JSON.stringify(lateFinish.json))
  row = await getRun(runId)
  check('der Lauf bleibt „cancelled"', row.status === 'cancelled', row.status)

  console.log('\n11. Stillgelegter Runner')
  await db.updateRow({ databaseId, tableId: RUNNERS_TABLE, rowId: runnerA.id, data: { status: 'disabled' } })
  const disabled = await call('/api/runner/runs/claim', { body: {}, token: runnerA.token })
  check('claim mit stillgelegtem Runner → 401', disabled.status === 401, `Status ${disabled.status}`)
}
finally {
  // Auch bei Rot aufräumen — ein halber Beweis darf keine Zeilen hinterlassen,
  // die den nächsten Lauf verwirren (der claim nimmt den ÄLTESTEN Lauf).
  for (const runId of cleanup.runs) {
    const events = await db.listRows({
      databaseId, tableId: RUN_EVENTS_TABLE,
      queries: [Query.equal('runId', runId), Query.limit(100)],
    }).catch(() => ({ rows: [] }))
    for (const row of events.rows) {
      await db.deleteRow({ databaseId, tableId: RUN_EVENTS_TABLE, rowId: row.$id }).catch(() => {})
    }
    await db.deleteRow({ databaseId, tableId: RUNS_TABLE, rowId: runId }).catch(() => {})
  }
  for (const runnerId of cleanup.runners) {
    await db.deleteRow({ databaseId, tableId: RUNNERS_TABLE, rowId: runnerId }).catch(() => {})
  }
}

console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
process.exit(fail === 0 ? 0 : 1)
