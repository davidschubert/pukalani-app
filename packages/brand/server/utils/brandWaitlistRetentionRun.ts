import type { ActiveRowRetentionMode, RowRetentionMode, RowRetentionResult } from '../../../core/shared/rowRetention'
import { retentionCutoffIso } from '../../../core/shared/rowRetention'
import {
  BRAND_WAITLIST_RETENTION_JOB,
  BRAND_WAITLIST_SHORTEST_DAYS,
  decideBrandWaitlistRetention,
} from '../../shared/brandWaitlistRetention'
import { BRAND_WAITLIST_TABLE, type BrandWaitlistRow } from './brandStore'

/**
 * DER FRISTEN-LAUF DER WARTELISTE (EL1 c — Davids Entscheidung 2026-11-15):
 * Einträge in `brand_waitlist` nach ihrer Frist löschen. Die Regel je Zeile
 * ist pur und steht samt Begründung der Zeitpunkte in
 * `shared/brandWaitlistRetention.ts`; Blättern, Zählen, Sperre und Log-Zeilen
 * kommen aus dem gemeinsamen Gerüst (`core/shared/rowRetention.ts`,
 * `core/server/utils/rowRetention.ts`).
 *
 * WAS ER TUT:
 *  - nie bestätigt (`pending`) ⇒ 30 Tage nach der letzten Anforderung eines
 *    Links (`$updatedAt`) löschen;
 *  - eingeladen oder abgelehnt ⇒ 90 Tage nach dem letzten Schreiben;
 *  - alles andere (bestätigt und wartend, Altbestand `new`) ⇒ 12 Monate
 *    nach dem Eintragen.
 *  Vorauswahl der Abfrage: angelegt vor mehr als 30 Tagen (die KÜRZESTE
 *  Frist), älteste zuerst; welche Zeile fällig ist, sagt allein die Regel.
 *
 * WAS ER NIE TUT:
 *  - eine Einladung (`brand_invites`) oder ein Konto anfassen — gelöscht wird
 *    nur die Wartelisten-Zeile. Ein eingelöster Code lebt am Konto weiter.
 *  - eine Zeile ändern statt löschen: kein Anonymisieren, kein Statuswechsel.
 *  - in `count` schreiben: dort zählt er mit GENAU der Auswahl, die `apply`
 *    träfe, und schreibt die Zahlen ins Log (`retention.run`,
 *    `job: brand-waitlist-retention`). Das ist die Stellung nach dem
 *    Ausliefern — `apply` erst mit dem Ja des Betreibers zur gezählten Zahl.
 *  - eine Zeile löschen, deren Zeitpunkt leer oder unlesbar ist.
 *  - Ids oder Adressen ins Log schreiben — nur Zahlen.
 *
 * VERDRAHTET in `server/plugins/brand-waitlist-retention.ts` (Takt) und
 * `server/api/brand/admin/waitlist-retention/run.post.ts` (Handlauf).
 */

/** Der wirksame Schalter dieser App (`pukalani.brand.waitlistRetention`). */
export function brandWaitlistRetentionMode(): RowRetentionMode {
  const appConfig = useAppConfig() as { pukalani?: { brand?: { waitlistRetention?: unknown } } }
  return retentionModeOf(BRAND_WAITLIST_RETENTION_JOB, appConfig.pukalani?.brand?.waitlistRetention)
}

/**
 * EIN LAUF. `null`, wenn gerade einer läuft (Takt und Hand-Route teilen sich
 * die Sperre). Ein Lesefehler wirft; ein einzelner Lösch-Fehler zählt als
 * `failed`, der Lauf macht weiter.
 *
 * Ohne `H3Event`, wie `brandCheckErasureRun.ts`: ein Takt bedient keinen
 * Request, der Admin-Client wird ohne Event gebaut.
 */
export async function runBrandWaitlistRetention(
  mode: ActiveRowRetentionMode,
  opts: { now?: Date } = {},
): Promise<RowRetentionResult | null> {
  const now = opts.now ?? new Date()
  const { tablesDB } = createAdminClient()
  const databaseId = useRuntimeConfig().public.appwriteDatabaseId
  const deps = tableRetentionDeps<BrandWaitlistRow>(tablesDB, databaseId, BRAND_WAITLIST_TABLE, {
    createdBefore: retentionCutoffIso(now, BRAND_WAITLIST_SHORTEST_DAYS),
    decide: decideBrandWaitlistRetention,
  })
  return runRetentionJob(BRAND_WAITLIST_RETENTION_JOB, mode, deps, { now })
}
