import { createHash } from 'node:crypto'
import { AppwriteException, Query } from 'node-appwrite'
import type { Models, TablesDB } from 'node-appwrite'
import type { RunLeaseSnapshot, RunLeaseState } from '../../shared/runLease'
import {
  RUN_LEASE_BUSY_CODE,
  RUN_LEASE_HEARTBEAT_MS,
  RUN_LEASE_OUTCOME_MAX,
  RUN_LEASE_STALL_MS,
  clampRunLeaseDetail,
  runLeaseStartable,
  runLeaseState,
} from '../../shared/runLease'

/**
 * DIE LAUF-SPERRE — der Server-Teil (GA1 P18, Fundament für BE-008 und
 * BE-010). Warum eine Zeile je Lauf, warum eine deterministische Id und warum
 * der Zustand gerechnet wird, steht im Kopf von `core/shared/runLease.ts`.
 * Hier steht, wie das in Appwrite aussieht, und was man daran NICHT ändern
 * darf.
 *
 * ── DER ABLAUF ──────────────────────────────────────────────────────────
 *  START   `acquireRunLease`: jüngste Zeile lesen (höchste `seq`), Zustand
 *          rechnen. `running` ⇒ 409 `run_running`. Sonst `createRow` mit der
 *          Id für `seq + 1`; endet das im Konflikt, hat ein gleichzeitiger
 *          Start gewonnen ⇒ ebenfalls 409.
 *  LEBEN   `keepRunLeaseAlive`: ein Timer schreibt alle 20 s `heartbeatAt`.
 *          Bleiben drei Schläge in Folge aus, meldet `lost()` true — der
 *          Aufrufer bricht dann zwischen zwei Schritten ab, denn ein anderer
 *          Prozess darf den Lauf nach der Frist übernehmen.
 *  ENDE    `finishRunLease`: `finishedAt` + `outcome` (+ `detail`).
 *  ZURÜCK  `dropRunLease`: Start abgelehnt, BEVOR etwas lief (z. B.
 *          Kontingent voll) ⇒ Zeile weg, als hätte es den Versuch nie
 *          gegeben.
 *
 * ── „NICHT PRÜFBAR" HEISST NIE „FREI" ────────────────────────────────────
 * Ein Fehler beim LESEN des Vorgängers oder beim ANLEGEN (außer dem Konflikt)
 * wird kein 409 und erst recht kein Start: er geht als 503
 * `run_lease_unavailable` hinaus. Ein 409 sagte dem Menschen „es läuft
 * schon" — falsch, wenn niemand nachsehen konnte; ein Start wäre genau der
 * Doppellauf, den die Sperre verhindern soll. Bewusst NICHT über
 * `toH3Error`: der reicht Appwrite-4xx als 4xx durch, und ein 404 der
 * fehlenden Tabelle sähe dann aus wie „Gegenstand unbekannt".
 *
 * ── DER VORGÄNGER WIRD BEIM START NICHT GELÖSCHT ──────────────────────────
 * Naheliegend, um die Tabelle klein zu halten — und falsch: ein verspäteter
 * Starter, der den Vorgänger von VOR dessen Löschung gelesen hat, rechnet
 * eine Id, die dann wieder frei ist, und legt sie ein zweites Mal an. Die
 * stehenbleibende Zeile ist das, was den späten Starter mit 409 abweist.
 * Ein `pruneRunLeases` gibt es deshalb (noch) nicht: es bräuchte eine
 * weitere Store-Methode (Liste nach Alter), und die Zeilen sind klein —
 * höchstens eine Handvoll je Gegenstand und Tag. Ein späterer Sweep kann sie
 * nach Alter räumen, solange er die JÜNGSTE Zeile je (scope, subject) stehen
 * lässt.
 *
 * ── DER STORE IST EINE SCHNITTSTELLE ─────────────────────────────────────
 * Die Logik kennt nur `RunLeaseStore`, damit der Test das Rennen zweier
 * Starter ohne Appwrite nachstellen kann (In-Memory-Store mit echtem
 * Konflikt beim Anlegen). `appwriteRunLeaseStore` ist die einzige echte
 * Umsetzung; die Tabelle legt `scripts/migrations-lib/runLeaseTable.mts` an.
 */

// ── Typen ───────────────────────────────────────────────────────────────────

export interface RunLeaseRow extends RunLeaseSnapshot {
  $id: string
  scope: string
  subject: string
}

/** Was beim Anlegen geschrieben wird — `finishedAt`/`outcome` fehlen bewusst. */
export interface RunLeaseCreateData {
  scope: string
  subject: string
  seq: number
  startedAt: string
  heartbeatAt: string
  detail: string
}

/** Was danach geändert werden darf. */
export type RunLeaseUpdateData = Partial<Pick<RunLeaseSnapshot, 'heartbeatAt' | 'finishedAt' | 'outcome' | 'detail'>>

export interface RunLeaseStore {
  /** Die jüngste Zeile (höchste `seq`) je (scope, subject) — oder `null`. */
  latest(scope: string, subject: string): Promise<RunLeaseRow | null>
  /** Legt die Zeile mit GENAU dieser Id an; wirft bei vorhandener Id einen Fehler, den `isConflict` erkennt. */
  create(id: string, data: RunLeaseCreateData): Promise<RunLeaseRow>
  update(id: string, data: RunLeaseUpdateData): Promise<RunLeaseRow>
  remove(id: string): Promise<void>
  isConflict(error: unknown): boolean
}

// ── Appwrite ────────────────────────────────────────────────────────────────

type RunLeaseAppwriteRow = Models.Row & {
  scope?: string | null
  subject?: string | null
  seq?: number | null
  startedAt?: string | null
  heartbeatAt?: string | null
  finishedAt?: string | null
  outcome?: string | null
  detail?: string | null
}

function toRunLeaseRow(row: RunLeaseAppwriteRow): RunLeaseRow {
  return {
    $id: row.$id,
    scope: row.scope ?? '',
    subject: row.subject ?? '',
    seq: typeof row.seq === 'number' ? row.seq : 0,
    startedAt: row.startedAt ?? '',
    heartbeatAt: row.heartbeatAt ?? '',
    finishedAt: row.finishedAt ?? '',
    outcome: row.outcome ?? '',
    detail: row.detail ?? '',
  }
}

/**
 * Der Store über eine Lauf-Tabelle (`market_runs`, `insights_runs`, …).
 * Server-only: die Tabelle hat keine Rechte, die Zeilen auch nicht.
 */
export function appwriteRunLeaseStore(input: {
  tablesDB: TablesDB
  databaseId: string
  tableId: string
}): RunLeaseStore {
  const { tablesDB, databaseId, tableId } = input
  return {
    async latest(scope, subject) {
      const { rows } = await tablesDB.listRows<RunLeaseAppwriteRow>({
        databaseId,
        tableId,
        queries: [
          Query.equal('scope', scope),
          Query.equal('subject', subject),
          Query.orderDesc('seq'),
          Query.limit(1),
        ],
      })
      return rows[0] ? toRunLeaseRow(rows[0]) : null
    },
    async create(id, data) {
      const row = await tablesDB.createRow<RunLeaseAppwriteRow>({
        databaseId,
        tableId,
        rowId: id,
        data,
        permissions: [],
      })
      return toRunLeaseRow(row)
    },
    async update(id, data) {
      const row = await tablesDB.updateRow<RunLeaseAppwriteRow>({ databaseId, tableId, rowId: id, data })
      return toRunLeaseRow(row)
    },
    async remove(id) {
      await tablesDB.deleteRow({ databaseId, tableId, rowId: id })
    },
    isConflict(error) {
      return error instanceof AppwriteException && error.code === 409
    },
  }
}

// ── Id ──────────────────────────────────────────────────────────────────────

/**
 * Die Zeilen-Id eines Laufs — dieselbe Eingabe, dieselbe Id, in jedem
 * Prozess. `r` + 31 Hex-Zeichen = 32 Zeichen, beginnt mit einem Buchstaben:
 * eine gültige Appwrite-Id (höchstens 36, `[a-zA-Z0-9._-]`, kein
 * Sonderzeichen vorn).
 */
export function runLeaseRowId(scope: string, subject: string, seq: number): string {
  return `r${createHash('sha256').update(`${scope}|${subject}|${seq}`).digest('hex').slice(0, 31)}`
}

// ── Fehler ──────────────────────────────────────────────────────────────────

function runLeaseBusy() {
  return createError({ status: 409, statusText: 'Run in flight', data: { code: RUN_LEASE_BUSY_CODE } })
}

/**
 * „Nicht prüfbar" (s. Kopf). Ins Log nur die Meldung, nie das rohe Objekt;
 * nach außen ein fester Text ohne Appwrite-Details.
 */
function runLeaseUnavailable(error: unknown) {
  console.error('[runLease] Sperre nicht prüfbar:', error instanceof Error ? error.message : error)
  return createError({ status: 503, statusText: 'Run lease unavailable', data: { code: 'run_lease_unavailable' } })
}

// ── Start, Herzschlag, Ende ─────────────────────────────────────────────────

/**
 * Einen Lauf beginnen — oder 409 `run_running`, wenn einer läuft bzw. ein
 * gleichzeitiger Start gewonnen hat. `previousState` sagt dem Aufrufer, ob er
 * einen abgestorbenen Lauf übernommen hat (`stalled`) — dort ist womöglich
 * schon ein Teil erledigt.
 */
export async function acquireRunLease(
  store: RunLeaseStore,
  input: { scope: string, subject: string, stallMs?: number, detail?: unknown, nowMs?: number },
): Promise<{ lease: RunLeaseRow, previous: RunLeaseRow | null, previousState: RunLeaseState }> {
  const nowMs = input.nowMs ?? Date.now()

  let previous: RunLeaseRow | null
  try {
    previous = await store.latest(input.scope, input.subject)
  }
  catch (error) {
    throw runLeaseUnavailable(error)
  }

  const previousState = runLeaseState(previous, nowMs, input.stallMs ?? RUN_LEASE_STALL_MS)
  if (!runLeaseStartable(previousState)) throw runLeaseBusy()

  const seq = (previous?.seq ?? 0) + 1
  const at = new Date(nowMs).toISOString()
  try {
    const lease = await store.create(runLeaseRowId(input.scope, input.subject, seq), {
      scope: input.scope,
      subject: input.subject,
      seq,
      startedAt: at,
      heartbeatAt: at,
      detail: clampRunLeaseDetail(input.detail),
    })
    return { lease, previous, previousState }
  }
  catch (error) {
    if (store.isConflict(error)) throw runLeaseBusy()
    throw runLeaseUnavailable(error)
  }
}

/** Den Herzschlag (und optional das Detail) neu schreiben. */
export async function touchRunLease(
  store: RunLeaseStore,
  lease: Pick<RunLeaseRow, '$id'>,
  input: { detail?: unknown, nowMs?: number } = {},
): Promise<RunLeaseRow> {
  const data: RunLeaseUpdateData = { heartbeatAt: new Date(input.nowMs ?? Date.now()).toISOString() }
  if (input.detail !== undefined) data.detail = clampRunLeaseDetail(input.detail)
  return await store.update(lease.$id, data)
}

/**
 * Den Lauf beenden. `outcome` ist `done` oder ein KURZER Fehler-Code (wird
 * auf die Spaltengröße gekürzt) — die Diagnose gehört ins Log, nicht hierher.
 */
export async function finishRunLease(
  store: RunLeaseStore,
  lease: Pick<RunLeaseRow, '$id'>,
  input: { outcome: string, detail?: unknown, nowMs?: number },
): Promise<RunLeaseRow> {
  const at = new Date(input.nowMs ?? Date.now()).toISOString()
  const data: RunLeaseUpdateData = {
    finishedAt: at,
    heartbeatAt: at,
    outcome: input.outcome.slice(0, RUN_LEASE_OUTCOME_MAX),
  }
  if (input.detail !== undefined) data.detail = clampRunLeaseDetail(input.detail)
  return await store.update(lease.$id, data)
}

/**
 * Einen Start zurücknehmen, bevor etwas lief. Schlägt das Löschen fehl, wird
 * der Lauf als `rejected` beendet — auch dann ist der Gegenstand wieder frei.
 * Wirft NIE: der Aufrufer ist meist schon dabei, eine andere Ablehnung zu
 * melden, und die soll ankommen.
 */
export async function dropRunLease(store: RunLeaseStore, lease: Pick<RunLeaseRow, '$id'>): Promise<void> {
  try {
    await store.remove(lease.$id)
    return
  }
  catch {
    // weiter unten: als `rejected` beenden
  }
  try {
    await finishRunLease(store, lease, { outcome: 'rejected' })
  }
  catch (error) {
    console.error('[runLease] Start nicht zurückgenommen:', error instanceof Error ? error.message : error)
  }
}

/**
 * Der Herzschlag-Timer. Ein Fehlschlag zählt, ein Erfolg setzt den Zähler
 * zurück; ab `maxMisses` Fehlschlägen IN FOLGE ist `lost()` wahr. Der Timer
 * wirft nie und überlappt nicht: solange ein Schreibvorgang läuft, fällt der
 * nächste Takt aus. `unref`, damit er einen Prozess nicht am Beenden hindert.
 */
export function keepRunLeaseAlive(
  store: RunLeaseStore,
  lease: Pick<RunLeaseRow, '$id'>,
  options: { intervalMs?: number, maxMisses?: number } = {},
): { stop(): void, lost(): boolean } {
  const maxMisses = options.maxMisses ?? 3
  let misses = 0
  let writing = false
  let stopped = false

  const beat = async () => {
    writing = true
    try {
      await touchRunLease(store, lease)
      misses = 0
    }
    catch {
      misses++
    }
    finally {
      writing = false
    }
  }

  const timer = setInterval(() => {
    if (stopped || writing) return
    void beat()
  }, options.intervalMs ?? RUN_LEASE_HEARTBEAT_MS)
  timer.unref?.()

  return {
    stop() {
      stopped = true
      clearInterval(timer)
    },
    lost() {
      return misses >= maxMisses
    },
  }
}

// ── Arbeit hinter der Antwort ───────────────────────────────────────────────

/**
 * ARBEIT HINTER DER ANTWORT — MIT EINEM BESITZER.
 *
 * `h3` kennt im Node-Preset kein `event.waitUntil`; ein nacktes schwebendes
 * Promise nach der Antwort ist Arbeit ohne Besitzer: eine unbehandelte
 * Ablehnung nimmt unter pm2 den Prozess mit (so begründet auch in
 * `market/server/utils/marketBrandCheck.ts` und in der Brief-Route von
 * insights). Hier bekommt sie EINEN Fänger, der ins Log schreibt. Was der
 * Lauf selbst an Fehlern festhalten will (`finishRunLease` mit Fehler-Code),
 * erledigt er vorher — dieser Fänger ist das letzte Netz, kein Ablauf.
 */
export function runDetached(label: string, work: () => Promise<void>): void {
  // Über `Promise.resolve().then`, damit auch ein SYNCHRON geworfener Fehler
  // (Arbeit, die vor ihrem ersten `await` scheitert) im Fänger landet.
  void Promise.resolve().then(work).catch((error: unknown) => {
    console.error(`[${label}] Lauf ohne Besitzer gescheitert:`, error)
  })
}
