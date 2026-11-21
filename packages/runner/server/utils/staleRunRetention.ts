import { Query, type TablesDB } from 'node-appwrite'
import {
  isRetentionRowGone,
  retentionModeOf,
  runRetentionJob,
} from '../../../core/server/utils/rowRetention'
import {
  retentionCutoffIso,
  type ActiveRowRetentionMode,
  type RowRetentionDeps,
  type RowRetentionLimits,
  type RowRetentionMode,
  type RowRetentionResult,
} from '../../../core/shared/rowRetention'
import {
  buildStaleRunClosure,
  decideStaleRun,
  STALE_RUN_DAYS,
  STALE_RUN_RETENTION_JOB,
  STALE_RUN_STATUSES,
  staleRunUnchanged,
  type StaleRunClosure,
  type StaleRunRow,
} from '../../shared/staleRunRetention'
import { RUN_EVENTS_TABLE, RUNS_TABLE, type RunEventRow, type RunRow } from '../../shared/types/runner'

/**
 * DER FRISTEN-LAUF FÜR LÄUFE, DIE NIE BEENDET WURDEN (RU1 c, seit 2026-11-17):
 * ein Entwurf oder ein Lauf auf `queued`/`claimed`/`running`, der seit 7
 * Tagen kein Lebenszeichen gab, wird abgebrochen (`cancelled`, Grund
 * `abandoned`) — danach greifen die Fristen für beendete Läufe. Die Regel und
 * das Warum stehen pur in `shared/staleRunRetention.ts`; hier lebt nur die
 * Anbindung.
 *
 * GEBAUT AUF DEM GERÜST (`core/server/utils/rowRetention.ts`): Schalter,
 * Schleife, Sperre und die Log-Zeile `retention.run` mit `job:
 * 'stale-run-retention'`. `remove` heisst hier BEENDEN, nicht löschen — die
 * Zeile bleibt, `deleted` im Ergebnis zählt beendete Läufe.
 *
 * VORAUSWAHL der Abfrage: nur die NICHT terminalen Zustände, angelegt vor mehr
 * als 7 Tagen (ein Lauf, der 7 Tage schweigt, ist mindestens so alt). Die
 * Tabelle hat sonst überwiegend beendete Läufe — die braucht der Lauf gar
 * nicht erst zu lesen.
 *
 * JE KANDIDAT ZWEI BLICKE:
 *  1. `decide`: erst die Regel nur mit der Zeile (billig — sagt sie „bleibt",
 *     ändert ein Ereignis daran nichts), dann das JÜNGSTE Ereignis des Laufs
 *     in `run_events` (Server-Zeitpunkt `$createdAt`; dieselbe Abfrage wie in
 *     `events.post.ts`). Ein Lesefehler wirft ⇒ `failed`, die Zeile bleibt.
 *  2. `remove` (nur `apply`): die Zeile DIREKT VOR DEM SCHREIBEN noch einmal
 *     lesen. Haben sich Zustand oder `$updatedAt` bewegt (Board hat
 *     abgebrochen, Dienst hat geclaimt), bleibt sie (`'kept'`).
 *
 * EIGENER SCHALTER `pukalani.runner.staleRunRetention` (off | count | apply)
 * — bewusst NICHT `retention` oder `textRetention`: beide stehen in
 * `apps/control` auf `apply`, und ein neuer Lauf darf nie mit dem Ausliefern
 * sofort schreiben (COMPLETE „N04", Gelernt 1).
 *
 * VERDRAHTET in `server/plugins/stale-run-retention.ts` (Takt) und
 * `server/api/runner/retention/stale.post.ts` (Handlauf für Betreiber).
 */

/** Die Speicher-Zugriffe eines Laufs — eingereicht für den Test. */
export interface StaleRunStore {
  /** Eine Seite Kandidaten hinter `after` (`null` = von vorn). Wirft bei einem Lesefehler. */
  listPage: (args: { after: string | null, limit: number, createdBefore: string }) => Promise<StaleRunRow[]>
  /** Server-Zeitpunkt des jüngsten Ereignisses dieses Laufs, `null` = keins. Wirft bei einem Lesefehler. */
  latestEventAt: (runId: string) => Promise<string | null>
  /** Die Zeile frisch lesen. Wirft bei einem Fehler (404 `row_not_found` ⇒ gibt es nicht mehr). */
  getRun: (runId: string) => Promise<StaleRunRow>
  /** Schreibt das Beenden in EINEM Aufruf. Wirft bei einem Fehler. */
  updateRun: (runId: string, data: StaleRunClosure) => Promise<void>
}

/** `decide` für das Gerüst: Zeile allein, dann mit dem jüngsten Ereignis. */
export function decideStaleRunWithEvents(store: Pick<StaleRunStore, 'latestEventAt'>) {
  return async (row: StaleRunRow, now: Date): Promise<string | null> => {
    if (decideStaleRun(row, null, now) === null) return null
    return decideStaleRun(row, await store.latestEventAt(row.$id), now)
  }
}

/**
 * `remove` für das Gerüst: frisch lesen, unverändert und weiter fällig ⇒
 * beenden, sonst `'kept'`. Das Ereignis wird dabei NICHT erneut gefragt — ein
 * lebender Dienst, der seit `decide` ein Ereignis schickte, änderte die
 * Zeile nicht; er bekommt in der Ereignis-Antwort `cancelled` und hört auf
 * (`shared/staleRunRetention.ts`).
 */
export function closeStaleRun(store: Pick<StaleRunStore, 'getRun' | 'updateRun'>, now: () => Date) {
  return async (row: StaleRunRow): Promise<'kept' | undefined> => {
    const fresh = await store.getRun(row.$id)
    if (!staleRunUnchanged(row, fresh)) return 'kept'
    if (decideStaleRun(fresh, null, now()) === null) return 'kept'
    await store.updateRun(row.$id, buildStaleRunClosure(now().toISOString()))
    return undefined
  }
}

/** Die Abhängigkeiten für das Gerüst. */
export function staleRunRetentionDeps(store: StaleRunStore, now: Date): RowRetentionDeps<StaleRunRow> {
  const createdBefore = retentionCutoffIso(now, STALE_RUN_DAYS)
  return {
    listPage: ({ after, limit }) => store.listPage({ after, limit, createdBefore }),
    decide: decideStaleRunWithEvents(store),
    remove: closeStaleRun(store, () => now),
    // Die Zeile verschwand zwischen Lesen und Schreiben (Kontolöschung) ⇒
    // nichts mehr zu beenden. Nur, wenn Appwrite es sagt (`row_not_found`).
    isGone: isRetentionRowGone,
  }
}

/** Der Speicher über Appwrite (Admin-Client, Tabellen des Runners). */
export function appwriteStaleRunStore(tablesDB: TablesDB, databaseId: string): StaleRunStore {
  return {
    listPage: async ({ after, limit, createdBefore }) => {
      const page = await tablesDB.listRows<RunRow>({
        databaseId,
        tableId: RUNS_TABLE,
        queries: [
          Query.equal('status', [...STALE_RUN_STATUSES]),
          Query.lessThan('$createdAt', createdBefore),
          Query.orderAsc('$createdAt'),
          Query.orderAsc('$id'),
          Query.limit(limit),
          ...(after ? [Query.cursorAfter(after)] : []),
        ],
        total: false,
      })
      return page.rows
    },
    latestEventAt: async (runId) => {
      const page = await tablesDB.listRows<RunEventRow>({
        databaseId,
        tableId: RUN_EVENTS_TABLE,
        queries: [Query.equal('runId', runId), Query.orderDesc('seq'), Query.limit(1)],
        total: false,
      })
      return page.rows[0]?.$createdAt ?? null
    },
    getRun: async runId => await tablesDB.getRow<RunRow>({ databaseId, tableId: RUNS_TABLE, rowId: runId }),
    updateRun: async (runId, data) => {
      await tablesDB.updateRow<RunRow>({ databaseId, tableId: RUNS_TABLE, rowId: runId, data })
    },
  }
}

/** Der wirksame Schalter dieser App — ein ungültiger Wert heisst `off` und wird gemeldet. */
export function staleRunRetentionMode(): RowRetentionMode {
  const appConfig = useAppConfig() as { pukalani?: { runner?: { staleRunRetention?: unknown } } }
  return retentionModeOf(STALE_RUN_RETENTION_JOB, appConfig.pukalani?.runner?.staleRunRetention)
}

/**
 * EIN Lauf mit den echten Abhängigkeiten — ein Admin-Client OHNE Request
 * (wie die beiden Fristen-Läufe daneben): der Takt hat keinen Request, und die
 * Tabellen des Runners sind nicht mandantenfähig (`rowSecurity: false`, nur
 * Server-Routen schreiben). `null` = es läuft schon einer.
 */
export async function runStaleRunRetention(
  mode: ActiveRowRetentionMode,
  opts: { now?: Date, limits?: Partial<RowRetentionLimits> } = {},
): Promise<RowRetentionResult | null> {
  const now = opts.now ?? new Date()
  const databaseId = useRuntimeConfig().public.appwriteDatabaseId
  const admin = createAdminClient()
  return await runRetentionJob(
    STALE_RUN_RETENTION_JOB,
    mode,
    staleRunRetentionDeps(appwriteStaleRunStore(admin.tablesDB, databaseId), now),
    { now, limits: opts.limits },
  )
}
