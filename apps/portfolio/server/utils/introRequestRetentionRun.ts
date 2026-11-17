import type { Models } from 'node-appwrite'
import type { ActiveRowRetentionMode, RowRetentionMode, RowRetentionResult } from '../../../../packages/core/shared/rowRetention'
import { retentionCutoffIso } from '../../../../packages/core/shared/rowRetention'
import {
  INTRO_REQUEST_RETENTION_DAYS,
  INTRO_REQUEST_RETENTION_JOB,
  decideIntroRequestRetention,
} from '#shared/introRequestRetention'
import { INTRO_REQUESTS_TABLE } from './introRequestsUserData'

/**
 * DER FRISTEN-LAUF DER GESPRÄCHSANFRAGEN VON pukalani.studio (EL1 c — Davids
 * Entscheidung 2026-11-15): Zeilen in `intro_requests` 12 Monate nach dem
 * Eingang löschen. Die Regel je Zeile ist pur und steht in
 * `shared/introRequestRetention.ts`; Blättern, Zählen, Sperre und Log-Zeilen
 * kommen aus dem gemeinsamen Gerüst des Core (`shared/rowRetention.ts`,
 * `server/utils/rowRetention.ts`, per Auto-Import).
 *
 * Getrennt vom Lauf für `brand_intro_requests` (packages/brand): andere Site,
 * andere Instanz, andere Tabelle — dieselbe Frist.
 *
 * WAS ER TUT:
 *  - jede Anfrage löschen, deren `$createdAt` mehr als 365 Tage zurückliegt;
 *  - Vorauswahl der Abfrage: angelegt vor mehr als 365 Tagen, älteste zuerst.
 *
 * WAS ER NIE TUT:
 *  - etwas neben der Zeile anfassen: an einer Anfrage hängt nichts (keine
 *    userId, kein Ereignis, keine Datei).
 *  - eine Zeile ändern statt löschen.
 *  - in `count` schreiben: dort zählt er mit GENAU der Auswahl, die `apply`
 *    träfe, und schreibt die Zahlen ins Log (`retention.run`,
 *    `job: intro-request-retention`). Das ist die Stellung nach dem
 *    Ausliefern — `apply` erst mit dem Ja des Betreibers zur gezählten Zahl.
 *  - Ids, Namen oder Adressen ins Log schreiben — nur Zahlen.
 *
 * FEHLT DIE TABELLE (sie entsteht per ensure-Skript, nicht per Migration, und
 * kann auf einer Instanz fehlen — Kopf von `introRequestsUserData.ts`), ist
 * das „nichts zu tun" statt eines stündlichen Scheiterns; jeder andere
 * Lesefehler wirft (`retentionDepsIgnoringMissingTable`, Core).
 *
 * VERDRAHTET in `server/plugins/intro-request-retention.ts` (Takt) und
 * `server/api/admin/intro-requests/retention/run.post.ts` (Handlauf).
 */

/**
 * Der wirksame Schalter dieser App (`pukalani.portfolio.introRequestRetention`).
 * Einen Layer-Default gibt es nicht: fehlt der Wert, heisst das `off`.
 */
export function introRequestRetentionMode(): RowRetentionMode {
  const appConfig = useAppConfig() as { pukalani?: { portfolio?: { introRequestRetention?: unknown } } }
  return retentionModeOf(INTRO_REQUEST_RETENTION_JOB, appConfig.pukalani?.portfolio?.introRequestRetention)
}

/**
 * EIN LAUF. `null`, wenn gerade einer läuft (Takt und Hand-Route teilen sich
 * die Sperre). Ein Lesefehler wirft (außer der fehlenden Tabelle); ein
 * einzelner Lösch-Fehler zählt als `failed`, der Lauf macht weiter.
 *
 * Ohne `H3Event`: ein Takt bedient keinen Request, der Admin-Client wird ohne
 * Event gebaut.
 */
export async function runIntroRequestRetention(
  mode: ActiveRowRetentionMode,
  opts: { now?: Date } = {},
): Promise<RowRetentionResult | null> {
  const now = opts.now ?? new Date()
  const { tablesDB } = createAdminClient()
  const databaseId = useRuntimeConfig().public.appwriteDatabaseId
  const deps = tableRetentionDeps<Models.Row>(tablesDB, databaseId, INTRO_REQUESTS_TABLE, {
    createdBefore: retentionCutoffIso(now, INTRO_REQUEST_RETENTION_DAYS),
    decide: decideIntroRequestRetention,
  })
  return runRetentionJob(INTRO_REQUEST_RETENTION_JOB, mode, retentionDepsIgnoringMissingTable(deps), { now })
}
