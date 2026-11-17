import type { TablesDB } from 'node-appwrite'
import {
  isRetentionJobRunning,
  isRetentionRowGone,
  retentionModeOf,
  runRetentionJob,
  tableRetentionDeps,
} from '../../../core/server/utils/rowRetention'
import {
  retentionCutoffIso,
  type ActiveRowRetentionMode,
  type RowRetentionDeps,
  type RowRetentionLimits,
  type RowRetentionMode,
  type RowRetentionResult,
} from '../../../core/shared/rowRetention'
import { parseRunAttachments } from '../../shared/runAttachments'
import {
  buildRunTextRedaction,
  decideRunTextRetention,
  RUN_TEXT_RETENTION_DAYS,
  RUN_TEXT_RETENTION_JOB,
  type RunTextRedaction,
  type RunTextRetentionRow,
} from '../../shared/runTextRetention'
import { RUNNER_FILES_BUCKET, RUNS_TABLE, type RunRow } from '../../shared/types/runner'

/**
 * DER FRISTEN-LAUF FÜR TEXTE UND ANHÄNGE (RU1 c, seit 2026-11-17): 12 Monate
 * nach dem Ende eines Laufs fallen Auftrag, Fehlertext, die freien Felder des
 * Berichts und die Anhang-Dateien; Kosten, Dauer, Commit und die übrigen
 * Zahlen und Kennungen bleiben. Die Regel und die Erlaubnisliste des Berichts
 * stehen pur in `shared/runTextRetention.ts`; hier lebt nur die Anbindung.
 *
 * GEBAUT AUF DEM GERÜST (`core/server/utils/rowRetention.ts`): Schalter,
 * Schleife, Sperre und die Log-Zeile `retention.run` mit `job:
 * 'run-text-retention'`. `remove` heisst hier SCHWÄRZEN, nicht löschen — die
 * Zeile bleibt, `deleted` im Ergebnis zählt geschwärzte Läufe.
 *
 * REIHENFOLGE JE LAUF, damit nichts halb verschwindet:
 *  1. Anhang-Dateien im Bucket löschen (Ids aus `attachmentsJson`). „Gibt es
 *     nicht mehr" ist Erfolg — aber NUR, wenn Appwrite das sagt
 *     (`storage_file_not_found`), nicht bei einem 404 ohne Art (Proxy).
 *     Scheitert eine Datei anders, bleibt die ZEILE unverändert und der Lauf
 *     zählt als `failed`; der nächste Takt versucht es erneut, die schon
 *     gelöschten Dateien melden dann „gibt es nicht mehr".
 *  2. EIN Schreibvorgang auf die Zeile (`buildRunTextRedaction`).
 *
 * VORAUSWAHL der Abfrage: Zeilen, die vor mehr als 365 Tagen ANGELEGT wurden —
 * ein Lauf, der vor über 365 Tagen endete, wurde auch davor angelegt. Welche
 * davon fällig sind, entscheidet die Regel je Zeile.
 *
 * EIGENER SCHALTER `pukalani.runner.textRetention` (off | count | apply) —
 * bewusst NICHT `pukalani.runner.retention`: der steht in `apps/control` auf
 * `apply`, und ein neuer Lauf darf nie mit dem Ausliefern sofort schreiben.
 *
 * VERDRAHTET in `server/plugins/run-text-retention.ts` (Takt) und
 * `server/api/runner/retention/texts.post.ts` (Handlauf für Betreiber).
 */

/** Die Speicher-Zugriffe, die über das Lesen hinausgehen — eingereicht für den Test. */
export interface RunTextStore {
  /** Löscht EINE Anhang-Datei. Wirft bei einem Fehler. */
  deleteFile: (fileId: string) => Promise<void>
  /** Schreibt die Schwärzung in EINEM Aufruf. Wirft bei einem Fehler. */
  updateRun: (runId: string, data: RunTextRedaction) => Promise<void>
}

/** Eine Anhang-Datei liess sich nicht löschen — die Zeile bleibt deshalb unverändert. */
export class RunTextFileDeleteError extends Error {
  constructor() {
    super('Anhang-Datei liess sich nicht löschen')
    this.name = 'RunTextFileDeleteError'
  }
}

/** „Die Datei gibt es nicht mehr" — nur, wenn Appwrite es sagt. */
export function isRunnerFileGone(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, type } = error as { code?: unknown, type?: unknown }
  return code === 404 && type === 'storage_file_not_found'
}

/**
 * `remove` des Gerüsts: erst die Dateien, dann die Zeile. Ein Datei-Fehler
 * wird als `RunTextFileDeleteError` geworfen — so kann ihn `isRetentionRowGone`
 * nie als „Zeile gibt es nicht mehr" missverstehen.
 */
export function removeRunText(store: RunTextStore, now: () => Date) {
  return async (row: RunTextRetentionRow): Promise<void> => {
    for (const attachment of parseRunAttachments(row.attachmentsJson)) {
      try {
        await store.deleteFile(attachment.fileId)
      }
      catch (error) {
        if (!isRunnerFileGone(error)) throw new RunTextFileDeleteError()
      }
    }
    await store.updateRun(row.$id, buildRunTextRedaction(row, now().toISOString()))
  }
}

/** Die Abhängigkeiten für das Gerüst: Liste der Tabelle, Regel, Schwärzen. */
export function runTextRetentionDeps(
  tablesDB: TablesDB,
  databaseId: string,
  store: RunTextStore,
  now: Date,
): RowRetentionDeps<RunTextRetentionRow> {
  const table = tableRetentionDeps<RunRow>(tablesDB, databaseId, RUNS_TABLE, {
    createdBefore: retentionCutoffIso(now, RUN_TEXT_RETENTION_DAYS),
    decide: decideRunTextRetention,
  })
  return {
    listPage: table.listPage,
    decide: decideRunTextRetention,
    remove: removeRunText(store, () => now),
    // Die Zeile verschwand zwischen Lesen und Schreiben ⇒ es gibt nichts mehr
    // zu schwärzen. Nur, wenn Appwrite es sagt (`row_not_found`).
    isGone: isRetentionRowGone,
  }
}

/** Der wirksame Schalter dieser App — ein ungültiger Wert heisst `off` und wird gemeldet. */
export function runTextRetentionMode(): RowRetentionMode {
  const appConfig = useAppConfig() as { pukalani?: { runner?: { textRetention?: unknown } } }
  return retentionModeOf(RUN_TEXT_RETENTION_JOB, appConfig.pukalani?.runner?.textRetention)
}

/** Läuft gerade einer? (Takt und Hand-Route teilen sich die Sperre.) */
export function isRunTextRetentionRunning(): boolean {
  return isRetentionJobRunning(RUN_TEXT_RETENTION_JOB)
}

/**
 * EIN Lauf mit den echten Abhängigkeiten — ein Admin-Client OHNE Request
 * (`createAdminClient()` ohne `H3Event`, wie im Aufräum-Lauf daneben): der
 * Takt hat keinen Request, und die Tabellen des Runners sind nicht
 * mandantenfähig (`rowSecurity: false`, nur Server-Routen schreiben).
 * `null` = es läuft schon einer.
 */
export async function runRunTextRetention(
  mode: ActiveRowRetentionMode,
  opts: { now?: Date, limits?: Partial<RowRetentionLimits> } = {},
): Promise<RowRetentionResult | null> {
  const now = opts.now ?? new Date()
  const databaseId = useRuntimeConfig().public.appwriteDatabaseId
  const admin = createAdminClient()
  const store: RunTextStore = {
    deleteFile: async (fileId) => {
      await admin.storage.deleteFile({ bucketId: RUNNER_FILES_BUCKET, fileId })
    },
    updateRun: async (runId, data) => {
      await admin.tablesDB.updateRow<RunRow>({ databaseId, tableId: RUNS_TABLE, rowId: runId, data })
    },
  }
  return await runRetentionJob(
    RUN_TEXT_RETENTION_JOB,
    mode,
    runTextRetentionDeps(admin.tablesDB, databaseId, store, now),
    { now, limits: opts.limits },
  )
}
