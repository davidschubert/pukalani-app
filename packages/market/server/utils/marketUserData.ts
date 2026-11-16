import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { Query } from 'node-appwrite'
import type { MarketCompetitorRow, MarketProfileRow, MarketReportRow } from '../../shared/types/market'
import {
  MARKET_COMPETITORS_TABLE,
  MARKET_PROFILES_TABLE,
  MARKET_REPORTS_TABLE,
  MARKET_RUNS_TABLE,
} from '../../shared/types/market'
import { parseRunLeaseDetail } from '../../../core/shared/runLease'
import { MARKET_LAYER_ID, isMarketRowMissing, marketDb, removeMarketProfileData } from './marketStore'
import { listOwnedBrandProfileIds } from '../contracts/brandContract'

/**
 * GDPR-EXPORT UND -LÖSCHUNG DES market-LAYERS (Plan §2.6 „Retention",
 * CLAUDE.md: „Neue Layer mit User-Daten MÜSSEN einen Contributor registrieren").
 *
 * ── DIE ZUORDNUNG LÄUFT ÜBER DAS BRANDING, NICHT ÜBER EINE userId ─────────
 * Keine market_*-Zeile trägt eine `userId`, und das ist richtig so: ein
 * Wettbewerber gehört zu einem BRANDING, nicht zu einer Person — überträgt
 * jemand sein Branding, wandert der Vergleich mit. Die Frage „was gehört
 * diesem Konto?" ist deshalb zweistufig: erst die eigenen Brandings (der
 * brand-Layer weiss das), dann alles daran. Der Umweg IST der Vertrag; eine
 * kopierte `userId` an jeder market-Zeile wäre eine zweite Wahrheit über
 * Besitz, die beim ersten Eigentümerwechsel falsch wird.
 *
 * ── WAS IM EXPORT NICHT STEHT ────────────────────────────────────────────
 * `rawText` — der gefilterte Text FREMDER Websites. Er ist kein Datum ÜBER
 * den Exportierenden, er lebt ohnehin nur 24 Stunden (§2.9 Nr. 6), und ihn
 * auszuliefern hiesse, fremde Seiteninhalte in ein Auskunftspaket zu legen.
 * Die Auskunft bleibt trotzdem vollständig: was daraus GEWORDEN ist (das
 * Marktprofil mit seinen Zitaten), steht drin.
 *
 * Von den LÄUFEN (`market_runs`, Lauf-Sperre) gehen nur Zeitpunkte, Ausgang
 * und die ZAHLEN aus `detail` hinaus — Zählerstände eines Laufs. Was sonst in
 * `detail` stünde, ist Technik und kein Datum über den Exportierenden.
 *
 * ── IDEMPOTENT ───────────────────────────────────────────────────────────
 * Jeder Schritt verzeiht ein 404, eine FEHLENDE TABELLE ebenfalls — auf
 * Instanzen ohne market-Migration hat dieser Layer nichts, und ein GDPR-Lauf
 * darf daran nicht scheitern (dieselbe Zusage wie im brand-Contributor).
 */

export const MARKET_USER_DATA_ID = MARKET_LAYER_ID

async function safeListAll<T extends Models.Row>(
  event: H3Event,
  tableId: string,
  filters: string[],
): Promise<T[]> {
  const { tablesDB, databaseId } = marketDb(event)
  try {
    return await listAllRows<T>(tablesDB, databaseId, tableId, filters)
  }
  catch (error) {
    if (isMarketRowMissing(error)) return []
    throw error
  }
}

type MarketRunExportRow = Models.Row & {
  scope?: string | null
  seq?: number | null
  startedAt?: string | null
  heartbeatAt?: string | null
  finishedAt?: string | null
  outcome?: string | null
  detail?: string | null
}

/** Ein Lauf im Export: Zeitpunkte, Ausgang, und aus `detail` nur die Zahlen. */
function toMarketRunExport(row: MarketRunExportRow) {
  const counts: Record<string, number> = {}
  for (const [key, value] of Object.entries(parseRunLeaseDetail(row.detail))) {
    if (typeof value === 'number' && Number.isFinite(value)) counts[key] = value
  }
  return {
    scope: row.scope ?? '',
    seq: row.seq ?? 0,
    startedAt: row.startedAt ?? '',
    heartbeatAt: row.heartbeatAt ?? '',
    finishedAt: row.finishedAt ?? '',
    outcome: row.outcome ?? '',
    counts,
  }
}

export async function marketExportUserData(event: H3Event, userId: string): Promise<unknown> {
  const profileIds = await listOwnedBrandProfileIds(event, userId)
  const brandings = []

  for (const profileId of profileIds) {
    const filter = [Query.equal('profileId', profileId)]
    const competitors = await safeListAll<MarketCompetitorRow>(event, MARKET_COMPETITORS_TABLE, filter)
    brandings.push({
      profileId,
      // `rawText` fällt heraus (s. Kopf) — der Rest der Zeile bleibt.
      competitors: competitors.map(({ rawText: _rawText, ...rest }) => rest),
      profiles: await safeListAll<MarketProfileRow>(event, MARKET_PROFILES_TABLE, filter),
      reports: await safeListAll<MarketReportRow>(event, MARKET_REPORTS_TABLE, filter),
      runs: (await safeListAll<MarketRunExportRow>(event, MARKET_RUNS_TABLE, [Query.equal('subject', profileId)]))
        .map(toMarketRunExport),
    })
  }

  return { brandings }
}

export async function marketDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  let deleted = 0
  for (const profileId of await listOwnedBrandProfileIds(event, userId)) {
    deleted += await removeMarketProfileData(event, profileId)
  }
  // Nichts wird anonymisiert: es gibt keine market-Zeile, die als NACHWEIS
  // eines Vorgangs überleben müsste (anders als eine eingelöste Einladung im
  // brand-Layer). Ein Marktvergleich ohne sein Branding hat keinen Leser.
  return { deleted, anonymized: 0 }
}
