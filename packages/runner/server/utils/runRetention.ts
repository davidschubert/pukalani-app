import { Query } from 'node-appwrite'
import { isTerminalRunStatus } from '../../shared/runGuards'
import {
  clearTranscriptReference,
  EVENT_RETENTION_DAYS,
  resolveRunRetentionMode,
  retentionCutoff,
  TRANSCRIPT_RETENTION_DAYS,
  transcriptExpired,
  type RunRetentionCounts,
  type RunRetentionMode,
  type RunRetentionResult,
} from '../../shared/runRetention'
import { RUN_EVENTS_TABLE, RUNNER_FILES_BUCKET, RUNS_TABLE, type RunEventRow, type RunRow, type RunStatus } from '../../shared/types/runner'

/**
 * DER STÜNDLICHE AUFRÄUM-LAUF DES AI-RUNNERS (BE-025, Entscheidung des
 * Betreibers): Protokolle 30 Tage nach dem Ende eines Laufs, Ereignisse
 * (`run_events`) nach 90 Tagen. Die Fristen und die puren Entscheidungen
 * stehen in `shared/runRetention.ts`; hier lebt nur das Blättern und Löschen.
 *
 * WAS ER LÖSCHT:
 *  - PROTOKOLLE: Dateien im Bucket `runner-files` mit dem Namen
 *    `run-<eigene Id>.jsonl` (`fileId === runs.$id`, transcript.post.ts), wenn
 *    der Lauf im Endzustand ist und vor der Frist endete — oder wenn es den
 *    Lauf nicht mehr gibt (verwaist). Danach wird im Bericht
 *    (`runs.resultJson`) die Datei-Id geleert — sonst zeigte das Board einen
 *    Download-Link ins Leere.
 *  - EREIGNISSE: Zeilen in `run_events`, die älter als die Frist sind, wenn ihr
 *    Lauf im Endzustand ist ODER es ihn nicht mehr gibt (verwaist).
 *
 * WAS ER NIE LÖSCHT:
 *  - ANHÄNGE: sie liegen im selben Bucket, aber mit ZUFÄLLIGEN Ids und dem
 *    Namen der hochgeladenen Datei (files.post.ts). Eine Datei, die nicht
 *    `run-<eigene Id>.jsonl` heisst, fasst der Lauf nicht an, egal wie alt.
 *  - alles eines Laufs, der noch nicht im Endzustand ist (`draft`, `queued`,
 *    `claimed`, `running`) — auch wenn die Datei alt ist.
 *  - die `runs`-Zeilen selbst: der Bericht (Kosten, Commit, Dauer) bleibt.
 *
 * VORSICHT, WEIL NICHT UMKEHRBAR: Probelauf (`dry-run`) mit genau derselben
 * Auswahl, der nur zählt; einzeln löschen statt per Abfrage; Deckel je Lauf
 * (`truncated`, der nächste Lauf macht weiter); EINE Log-Zeile mit Zahlen,
 * keine Ids, keine Inhalte.
 *
 * WIEDERHOLBAR: was gelöscht ist, taucht in keiner Liste mehr auf — der zweite
 * Lauf direkt danach findet nichts.
 *
 * VERDRAHTET in `server/plugins/run-retention.ts` (Takt) und
 * `server/api/runner/retention/run.post.ts` (Handlauf für Betreiber).
 */

/** Die Deckel je Lauf. Als Parameter, damit die Tests sie klein drehen können. */
export interface RunRetentionLimits {
  /** Seitengröße beim Blättern (Appwrite-Abfrage). */
  pageSize: number
  /** Höchstens so viele Protokolle löschen (im Probelauf: als Kandidat zählen). */
  maxTranscriptDeletes: number
  /** Höchstens so viele Dateien betrachten. */
  maxFilesConsidered: number
  /** Höchstens so viele Ereignis-Zeilen löschen (bzw. zählen). */
  maxEventDeletes: number
  /**
   * Höchstens so viele Ereignis-Zeilen betrachten. Hält den Lauf auch dann
   * endlich, wenn sehr viele alte Zeilen zu noch laufenden Aufträgen gehören.
   */
  maxEventsConsidered: number
}

export const RUN_RETENTION_LIMITS: RunRetentionLimits = {
  pageSize: 100,
  maxTranscriptDeletes: 100,
  maxFilesConsidered: 500,
  maxEventDeletes: 1000,
  maxEventsConsidered: 5000,
}

export interface RetentionFile {
  $id: string
  name: string
  $createdAt: string
}

export interface RetentionRun {
  status: RunStatus
  finishedAt: string | null
  $createdAt: string
  resultJson: string
}

export interface RetentionEvent {
  $id: string
  runId: string
  $createdAt: string
}

/** Eine Seite: Einträge mit `$createdAt` VOR `createdBefore`, älteste zuerst, hinter `after`. */
export interface RetentionPageArgs {
  createdBefore: string
  after: string | null
  limit: number
}

/**
 * Die Abhängigkeiten des Laufs — injiziert, damit die Logik ohne Appwrite
 * prüfbar ist (tests/runRetention.test.ts). Löschen wirft bei einem Fehler;
 * ein Fehler mit `code: 404` gilt als „schon weg".
 */
export interface RunRetentionDeps {
  listFiles: (args: RetentionPageArgs) => Promise<RetentionFile[]>
  deleteFile: (fileId: string) => Promise<void>
  /** `null` = den Lauf gibt es nicht (404). Wirft bei Störung. */
  getRun: (runId: string) => Promise<RetentionRun | null>
  updateRunResult: (runId: string, resultJson: string) => Promise<void>
  listEvents: (args: RetentionPageArgs) => Promise<RetentionEvent[]>
  deleteEvent: (eventId: string) => Promise<void>
  limits?: Partial<RunRetentionLimits>
}

function isNotFound(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 404
}

function emptyCounts(): RunRetentionCounts {
  return { candidates: 0, deleted: 0, skipped: 0, failed: 0 }
}

/** `gone` = gelöscht (taucht in keiner Seite mehr auf), `kept` = steht noch, `stop` = Deckel. */
type VisitOutcome = 'gone' | 'kept' | 'stop'

/**
 * Blättert eine nach `$createdAt` aufsteigend sortierte Liste ab — so, dass im
 * Modus `apply` NICHTS übersprungen wird und nichts endlos kreist.
 *
 * DIE FALLE: gelöschte Einträge verschwinden aus der Ergebnismenge, und
 * Appwrites `cursorAfter` verlangt, dass der Cursor-Eintrag NOCH EXISTIERT.
 * Ein Zähl-Offset überspränge deshalb Einträge, und ein Cursor auf einen
 * gerade gelöschten Eintrag scheiterte.
 *
 * DIE REGEL: der Cursor zeigt immer auf den LETZTEN Eintrag der Seite, der
 * STEHEN GEBLIEBEN ist (übersprungen, Probelauf, Löschfehler). Alles davor ist
 * entweder gelöscht oder betrachtet; die nächste Abfrage beginnt dahinter.
 * Blieb auf einer Seite nichts stehen, bleibt der Cursor, wo er war — die
 * gelöschten Einträge fehlen dann in der nächsten Seite von selbst, und dahinter
 * rückt Neues nach. Endlich ist das, weil jeder betrachtete Eintrag gegen
 * `maxConsidered` zählt; ein Eintrag, der trotz „gelöscht" wieder auftauchte,
 * kann den Lauf also höchstens bis zum Deckel beschäftigen.
 *
 * Scheitert das Listen, endet dieser Teil (`listFailed`) — der Aufrufer zählt
 * das als `failed`, der andere Teil läuft trotzdem.
 */
async function walkPages<T extends { $id: string }>(
  list: (after: string | null) => Promise<T[]>,
  visit: (item: T) => Promise<VisitOutcome>,
  pageSize: number,
  maxConsidered: number,
): Promise<{ truncated: boolean, listFailed: boolean }> {
  let cursor: string | null = null
  let considered = 0
  for (;;) {
    let page: T[]
    try {
      page = await list(cursor)
    }
    catch {
      return { truncated: false, listFailed: true }
    }
    if (page.length === 0) return { truncated: false, listFailed: false }

    let lastKept: string | null = null
    for (const item of page) {
      if (considered >= maxConsidered) return { truncated: true, listFailed: false }
      considered++
      const outcome = await visit(item)
      if (outcome === 'stop') return { truncated: true, listFailed: false }
      if (outcome === 'kept') lastKept = item.$id
    }
    if (lastKept !== null) cursor = lastKept
    if (page.length < pageSize) return { truncated: false, listFailed: false }
  }
}

/** Liegt `iso` lesbar vor `cutoffIso`? (Netz hinter dem Abfrage-Filter.) */
function createdBefore(iso: string, cutoffIso: string): boolean {
  const at = Date.parse(iso)
  return Number.isFinite(at) && at < Date.parse(cutoffIso)
}

/** Reentranz-Sperre (Single-Instanz-Annahme, wie beim Label-Abgleich). */
let running = false

/**
 * EIN Lauf. Wirft nicht: jeder Einzelfehler zählt als `failed`, ein
 * gescheitertes Blättern beendet nur seinen Teil.
 */
export async function sweepRunRetention(
  mode: 'dry-run' | 'apply',
  deps: RunRetentionDeps,
  nowMs: number = Date.now(),
): Promise<RunRetentionResult> {
  const result: RunRetentionResult = { mode, transcripts: emptyCounts(), events: emptyCounts(), truncated: false }
  if (running) {
    logEvent('warn', 'runner.retention_busy', { mode })
    return result
  }
  running = true
  try {
    const limits: RunRetentionLimits = { ...RUN_RETENTION_LIMITS, ...deps.limits }
    const apply = mode === 'apply'
    const nowIso = new Date(nowMs).toISOString()

    // ── Protokolle ────────────────────────────────────────────────────────
    const transcriptCutoff = retentionCutoff(nowMs, TRANSCRIPT_RETENTION_DAYS)
    const t = result.transcripts
    let referenceFailed = 0
    const files = await walkPages<RetentionFile>(
      after => deps.listFiles({ createdBefore: transcriptCutoff, after, limit: limits.pageSize }),
      async (file) => {
        if (!createdBefore(file.$createdAt, transcriptCutoff)) {
          t.skipped++
          return 'kept'
        }
        // EIN PROTOKOLL ERKENNT MAN AM NAMEN: `run-<eigene Id>.jsonl` vergibt nur
        // transcript.post.ts (fileId = Lauf-Id). Ein Anhang kann so nicht
        // heissen — seine Id würfelt der Server erst beim Hochladen. Alles
        // andere bleibt liegen, ohne dass ein Lauf nachgeschlagen wird.
        if (file.name !== `run-${file.$id}.jsonl`) {
          t.skipped++
          return 'kept'
        }
        let run: RetentionRun | null
        try {
          run = await deps.getRun(file.$id)
        }
        catch {
          t.failed++
          return 'kept'
        }
        // Den Lauf gibt es nicht mehr ⇒ VERWAISTES Protokoll: es gehört zu
        // keinem laufenden Auftrag und ist älter als die Frist (Abfrage-Filter
        // und Prüfung oben) ⇒ Kandidat. Im Spiegel lag genau so eine Datei.
        if (run && !transcriptExpired(run, file.$createdAt, transcriptCutoff)) {
          t.skipped++
          return 'kept'
        }
        if (t.candidates >= limits.maxTranscriptDeletes) return 'stop'
        t.candidates++
        if (!apply) return 'kept'

        try {
          await deps.deleteFile(file.$id)
        }
        catch (error) {
          if (!isNotFound(error)) {
            t.failed++
            return 'kept'
          }
        }
        t.deleted++
        // Die Datei ist weg; der Bericht zieht nach. Scheitert das, bleibt die
        // Löschung gültig — der Download-Link liefert dann 404 statt der Datei.
        const cleared = run ? clearTranscriptReference(run.resultJson, nowIso) : null
        if (cleared !== null) {
          try {
            await deps.updateRunResult(file.$id, cleared)
          }
          catch {
            referenceFailed++
          }
        }
        return 'gone'
      },
      limits.pageSize,
      limits.maxFilesConsidered,
    )
    if (files.listFailed) t.failed++
    if (files.truncated) result.truncated = true
    if (referenceFailed > 0) {
      logEvent('warn', 'runner.retention_reference_failed', { count: referenceFailed })
    }

    // ── Ereignisse ────────────────────────────────────────────────────────
    const eventCutoff = retentionCutoff(nowMs, EVENT_RETENTION_DAYS)
    const e = result.events
    // Status je Lauf, einmal je Durchgang gefragt (`null` = Lauf gibt es nicht).
    const statusByRun = new Map<string, RunStatus | null>()
    const events = await walkPages<RetentionEvent>(
      after => deps.listEvents({ createdBefore: eventCutoff, after, limit: limits.pageSize }),
      async (row) => {
        if (!createdBefore(row.$createdAt, eventCutoff)) {
          e.skipped++
          return 'kept'
        }
        let status: RunStatus | null
        if (statusByRun.has(row.runId)) {
          status = statusByRun.get(row.runId) ?? null
        }
        else {
          try {
            status = (await deps.getRun(row.runId))?.status ?? null
          }
          catch {
            e.failed++
            return 'kept'
          }
          statusByRun.set(row.runId, status)
        }
        // Lauf fehlt ⇒ verwaist ⇒ Kandidat. Lauf noch aktiv ⇒ stehen lassen.
        if (status !== null && !isTerminalRunStatus(status)) {
          e.skipped++
          return 'kept'
        }
        if (e.candidates >= limits.maxEventDeletes) return 'stop'
        e.candidates++
        if (!apply) return 'kept'

        try {
          await deps.deleteEvent(row.$id)
        }
        catch (error) {
          if (!isNotFound(error)) {
            e.failed++
            return 'kept'
          }
        }
        e.deleted++
        return 'gone'
      },
      limits.pageSize,
      limits.maxEventsConsidered,
    )
    if (events.listFailed) e.failed++
    if (events.truncated) result.truncated = true

    // EINE Zusammenfassung je Lauf, nur Zahlen.
    const deviation = t.failed > 0 || e.failed > 0 || result.truncated
    logEvent(deviation ? 'warn' : 'info', 'runner.retention', {
      mode,
      truncated: result.truncated,
      transcriptCandidates: t.candidates,
      transcriptsDeleted: t.deleted,
      transcriptsSkipped: t.skipped,
      transcriptsFailed: t.failed,
      eventCandidates: e.candidates,
      eventsDeleted: e.deleted,
      eventsSkipped: e.skipped,
      eventsFailed: e.failed,
    })
    return result
  }
  finally {
    running = false
  }
}

/**
 * Die echten Abhängigkeiten — ein Admin-Client OHNE Request
 * (`createAdminClient()` ohne `H3Event`, wie die Sweeps im control-Layer):
 * der Takt hat keinen Request, und die Tabellen des Runners sind nicht
 * mandantenfähig (`rowSecurity: false`, nur Server-Routen schreiben).
 */
export function createRunRetentionDeps(): RunRetentionDeps {
  const config = useRuntimeConfig()
  const admin = createAdminClient()
  const databaseId = config.public.appwriteDatabaseId

  const pageQueries = ({ createdBefore: before, after, limit }: RetentionPageArgs): string[] => [
    Query.lessThan('$createdAt', before),
    Query.orderAsc('$createdAt'),
    Query.limit(limit),
    ...(after ? [Query.cursorAfter(after)] : []),
  ]

  return {
    listFiles: async (args) => {
      const { files } = await admin.storage.listFiles({ bucketId: RUNNER_FILES_BUCKET, queries: pageQueries(args) })
      return files.map(file => ({ $id: file.$id, name: file.name, $createdAt: file.$createdAt }))
    },
    deleteFile: async (fileId) => {
      await admin.storage.deleteFile({ bucketId: RUNNER_FILES_BUCKET, fileId })
    },
    getRun: async (runId) => {
      try {
        const run = await admin.tablesDB.getRow<RunRow>({ databaseId, tableId: RUNS_TABLE, rowId: runId })
        return { status: run.status, finishedAt: run.finishedAt, $createdAt: run.$createdAt, resultJson: run.resultJson }
      }
      catch (error) {
        if (isNotFound(error)) return null
        throw error
      }
    },
    updateRunResult: async (runId, resultJson) => {
      await admin.tablesDB.updateRow<RunRow>({ databaseId, tableId: RUNS_TABLE, rowId: runId, data: { resultJson } })
    },
    listEvents: async (args) => {
      const { rows } = await admin.tablesDB.listRows<RunEventRow>({
        databaseId,
        tableId: RUN_EVENTS_TABLE,
        queries: [...pageQueries(args), Query.select(['$id', 'runId', '$createdAt'])],
      })
      return rows.map(row => ({ $id: row.$id, runId: row.runId, $createdAt: row.$createdAt }))
    },
    deleteEvent: async (eventId) => {
      await admin.tablesDB.deleteRow({ databaseId, tableId: RUN_EVENTS_TABLE, rowId: eventId })
    },
  }
}

/** Der wirksame Schalter dieser App — ein ungültiger Wert schreibt eine Fehlerzeile. */
export function runRetentionMode(): RunRetentionMode {
  const appConfig = useAppConfig() as { pukalani?: { runner?: { retention?: unknown } } }
  const raw = appConfig.pukalani?.runner?.retention
  const { mode, invalid } = resolveRunRetentionMode(raw)
  if (invalid) logEvent('error', 'runner.retention_invalid_mode', { value: String(raw) })
  return mode
}

/** Ein Lauf mit den echten Abhängigkeiten (Plugin und Ops-Route). */
export async function runRunRetention(mode: 'dry-run' | 'apply'): Promise<RunRetentionResult> {
  return await sweepRunRetention(mode, createRunRetentionDeps())
}
