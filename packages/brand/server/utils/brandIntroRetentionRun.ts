import type { ActiveRowRetentionMode, RowRetentionMode, RowRetentionResult } from '../../../core/shared/rowRetention'
import { retentionCutoffIso } from '../../../core/shared/rowRetention'
import {
  BRAND_INTRO_RETENTION_DAYS,
  BRAND_INTRO_RETENTION_JOB,
  decideBrandIntroRetention,
} from '../../shared/brandIntroRetention'
import { BRAND_INTRO_REQUESTS_TABLE, type BrandIntroRequestRow } from './brandStore'

/**
 * DER FRISTEN-LAUF DER GESPRÄCHSANFRAGEN (EL1 c — Davids Entscheidung
 * 2026-11-15): Zeilen in `brand_intro_requests` 12 Monate nach dem Eingang
 * löschen. Die Regel je Zeile ist pur und steht samt Begründung in
 * `shared/brandIntroRetention.ts`; Blättern, Zählen, Sperre und Log-Zeilen
 * kommen aus dem gemeinsamen Gerüst (`core/shared/rowRetention.ts`,
 * `core/server/utils/rowRetention.ts`).
 *
 * WAS ER TUT:
 *  - jede Anfrage löschen, deren `$createdAt` mehr als 365 Tage zurückliegt —
 *    unabhängig vom Status und auch dann, wenn sie ein Konto trägt
 *    (`userId`; die Entscheidung nennt keine Ausnahme);
 *  - Vorauswahl der Abfrage: angelegt vor mehr als 365 Tagen, älteste zuerst.
 *
 * WAS ER NIE TUT:
 *  - etwas neben der Zeile anfassen. Nichts hängt an ihr, das mitfallen
 *    müsste: das Funnel-Ereignis `intro.submitted` in `brand_events` trägt
 *    keine Id der Anfrage und keinen Inhalt (nur Herkunft, Sprache, Flags)
 *    und hat seine eigene Frist (24 Monate, `brand-events-sweep`); die
 *    Vorlage der Werkstatt (`brandKitWorkshop.ts`) liest die jüngste Anfrage
 *    und fällt ohne sie still weg. Konto und Marke bleiben.
 *  - eine Zeile ändern statt löschen: kein Anonymisieren, kein Statuswechsel.
 *  - in `count` schreiben: dort zählt er mit GENAU der Auswahl, die `apply`
 *    träfe, und schreibt die Zahlen ins Log (`retention.run`,
 *    `job: brand-intro-retention`). Das ist die Stellung nach dem
 *    Ausliefern — `apply` erst mit dem Ja des Betreibers zur gezählten Zahl.
 *  - eine Zeile löschen, deren Zeitpunkt leer oder unlesbar ist.
 *  - Ids, Namen oder Adressen ins Log schreiben — nur Zahlen.
 *
 * VERDRAHTET in `server/plugins/brand-intro-retention.ts` (Takt) und
 * `server/api/brand/admin/intro-retention/run.post.ts` (Handlauf).
 */

/** Der wirksame Schalter dieser App (`pukalani.brand.introRequestRetention`). */
export function brandIntroRetentionMode(): RowRetentionMode {
  const appConfig = useAppConfig() as { pukalani?: { brand?: { introRequestRetention?: unknown } } }
  return retentionModeOf(BRAND_INTRO_RETENTION_JOB, appConfig.pukalani?.brand?.introRequestRetention)
}

/**
 * EIN LAUF. `null`, wenn gerade einer läuft (Takt und Hand-Route teilen sich
 * die Sperre). Ein Lesefehler wirft; ein einzelner Lösch-Fehler zählt als
 * `failed`, der Lauf macht weiter.
 *
 * Ohne `H3Event`, wie `brandWaitlistRetentionRun.ts`: ein Takt bedient keinen
 * Request, der Admin-Client wird ohne Event gebaut.
 */
export async function runBrandIntroRetention(
  mode: ActiveRowRetentionMode,
  opts: { now?: Date } = {},
): Promise<RowRetentionResult | null> {
  const now = opts.now ?? new Date()
  const { tablesDB } = createAdminClient()
  const databaseId = useRuntimeConfig().public.appwriteDatabaseId
  const deps = tableRetentionDeps<BrandIntroRequestRow>(tablesDB, databaseId, BRAND_INTRO_REQUESTS_TABLE, {
    createdBefore: retentionCutoffIso(now, BRAND_INTRO_RETENTION_DAYS),
    decide: decideBrandIntroRetention,
  })
  return runRetentionJob(BRAND_INTRO_RETENTION_JOB, mode, deps, { now })
}
