import { Query, type Models, type TablesDB } from 'node-appwrite'
import {
  resolveRowRetentionMode,
  runRowRetention,
  type ActiveRowRetentionMode,
  type RowRetentionDeps,
  type RowRetentionLimits,
  type RowRetentionMode,
  type RowRetentionResult,
} from '../../shared/rowRetention'
import { logEvent } from './logEvent'

/**
 * DIE SERVER-SEITE DER FRISTEN-LÄUFE (EL1 c, KE3, RU1 c): Anbindung an
 * Appwrite, Sperre gegen den Doppelstart, Log-Zeilen. Die Schleife und der
 * Schalter sind pur und stehen in `shared/rowRetention.ts` — dort steht auch,
 * warum es dieses Gerüst gibt.
 *
 * WIE EIN NEUER LAUF ENTSTEHT (Muster: `brand/server/plugins/…-retention.ts`):
 *  1. Die REGEL je Zeile als pure Funktion im Layer, der die Tabelle besitzt
 *     (`decide`), mit Test und gestellter Uhr.
 *  2. Ein Schalter in der `app.config.ts` des Layers (Vorgabe `off`), gelesen
 *     über `retentionModeOf(kennung, wert)`.
 *  3. Ein Plugin, das bei `off` nichts anmeldet und sonst
 *     `defineTimedJob({ …, run: retentionTick(() => runRetentionJob(…)) })`
 *     ruft — und eine Zeile je App in `ops/timed-jobs.conf`.
 *  4. Eine Hand-Route für Betreiber, die ohne Angabe nur zählt.
 *  5. Die Frist in docs/referenz/EXPORT-UND-LOESCHUNG.md.
 *
 * DIE LOG-ZEILEN SIND FÜR ALLE LÄUFE DIESELBEN, unterschieden durch `job`:
 *   retention.run          — die Zahlen eines Laufs (in `count` IMMER, auch
 *                            bei null: genau diese Zahl liest der Betreiber,
 *                            bevor jemand auf `apply` stellt; in `apply` nur,
 *                            wenn etwas geschah). Keine Ids, keine Inhalte.
 *   retention.incomplete   — einzelne Schritte scheiterten (Fehler-Log).
 *   retention.failed       — der Lauf brach ab, meist ein Lesefehler.
 *   retention.invalid_mode — der Schalter trägt einen unbekannten Wert.
 * Dass ein Lauf ÜBERFÄLLIG ist oder scheitert, sieht der tägliche Wächter an
 * `job.run` (`defineTimedJob`); `retentionTick` übersetzt dafür das Ergebnis.
 */

const invalidReported = new Set<string>()

/**
 * Der wirksame Schalter eines Laufs. Ein unbekannter Wert heisst `off` und
 * schreibt EINMAL je Prozess eine Fehlerzeile.
 */
export function retentionModeOf(job: string, raw: unknown): RowRetentionMode {
  const { mode, invalid } = resolveRowRetentionMode(raw)
  if (invalid && !invalidReported.has(job)) {
    invalidReported.add(job)
    logEvent('error', 'retention.invalid_mode', { job, value: String(raw) })
  }
  return mode
}

/**
 * „Diese Zeile gibt es nicht mehr" — NUR, wenn Appwrite das sagt. Ein 404
 * ohne diese Art kommt vom Proxy davor, wenn der Dienst dahinter fehlt; das
 * als „schon gelöscht" zu zählen, hiesse eine Zahl melden, die nicht stimmt.
 */
export function isRetentionRowGone(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, type } = error as { code?: unknown, type?: unknown }
  return code === 404 && (type === 'row_not_found' || type === 'document_not_found')
}

/**
 * Die Abhängigkeiten für EINE TABELLE: Kandidaten sind alle Zeilen, die vor
 * `createdBefore` ANGELEGT wurden, älteste zuerst. Welche davon fällig sind,
 * entscheidet `decide` — die Abfrage ist nur die Vorauswahl („jünger als die
 * kürzeste Frist kann nichts fällig sein") und muss deshalb mit der KÜRZESTEN
 * Frist der Regel gebaut werden.
 *
 * `$createdAt` und `$id` sind Systemspalten mit eigenem Index; die Abfrage
 * braucht keine Migration.
 */
export function tableRetentionDeps<T extends Models.Row>(
  tablesDB: TablesDB,
  databaseId: string,
  tableId: string,
  opts: { createdBefore: string, decide: RowRetentionDeps<T>['decide'] },
): RowRetentionDeps<T> {
  return {
    listPage: async ({ after, limit }) => {
      const page = await tablesDB.listRows<T>({
        databaseId,
        tableId,
        queries: [
          Query.lessThan('$createdAt', opts.createdBefore),
          Query.orderAsc('$createdAt'),
          Query.orderAsc('$id'),
          Query.limit(limit),
          ...(after ? [Query.cursorAfter(after)] : []),
        ],
        total: false,
      })
      return page.rows
    },
    decide: opts.decide,
    remove: async (row) => {
      await tablesDB.deleteRow({ databaseId, tableId, rowId: row.$id })
    },
    isGone: isRetentionRowGone,
  }
}

/** Reentranz-Sperre je Lauf (Single-Instanz-Annahme, wie bei allen Sweeps). */
const running = new Set<string>()

export function isRetentionJobRunning(job: string): boolean {
  return running.has(job)
}

/**
 * EIN LAUF MIT SPERRE UND LOG. `null`, wenn unter dieser Kennung gerade einer
 * läuft (Takt und Hand-Route teilen sich die Sperre). Ein Lesefehler wirft und
 * wird gemeldet; ein einzelner Fehlschlag zählt als `failed`, der Lauf macht
 * weiter.
 */
export async function runRetentionJob<T extends { $id: string }>(
  job: string,
  mode: ActiveRowRetentionMode,
  deps: RowRetentionDeps<T>,
  opts: { now?: Date, limits?: Partial<RowRetentionLimits> } = {},
): Promise<RowRetentionResult | null> {
  if (running.has(job)) {
    logEvent('warn', 'retention.busy', { job })
    return null
  }
  running.add(job)
  try {
    const result = await runRowRetention(mode, deps, opts)
    if (mode === 'count' || result.expired > 0 || result.failed > 0 || result.truncated) {
      logEvent('info', 'retention.run', { job, ...result })
    }
    if (result.failed > 0) {
      logEvent('error', 'retention.incomplete', { job, failed: result.failed })
    }
    return result
  }
  catch (error) {
    logEvent('error', 'retention.failed', {
      job,
      message: (error instanceof Error ? error.message : String(error)).slice(0, 300),
    })
    throw error
  }
  finally {
    running.delete(job)
  }
}

/**
 * Übersetzt einen Lauf für `defineTimedJob`: `null` (Sperre hält) ⇒
 * `'skipped'`, gescheiterte Schritte ⇒ Wurf (der Takt meldet `failed`).
 */
export function retentionTick(
  run: () => Promise<RowRetentionResult | null>,
): () => Promise<'skipped' | undefined> {
  return async () => {
    const result = await run()
    if (!result) return 'skipped'
    if (result.failed > 0) throw new Error(`unvollständig: ${result.failed} Schritte gescheitert`)
    return undefined
  }
}

/** Nur für Tests: Sperren und gemerkte Fehlermeldungen vergessen. */
export function __resetRetentionJobsForTests(): void {
  running.clear()
  invalidReported.clear()
}
