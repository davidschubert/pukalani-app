import { Query } from 'node-appwrite'
import { brandCheckCategoryScores, brandCheckUrlKey } from '../../../../../shared/brandCheck'
import { latestBrandCheckDiff } from '../../../../../shared/brandCheckHistory'
import type {
  BrandCheckCategoryResult,
  BrandCheckHistoryItem,
  BrandCheckHistoryResponse,
} from '../../../../../shared/types/brand'
import {
  BRAND_CHECKS_TABLE,
  type BrandCheckRow,
  brandCheckRankingFacts,
  brandDb,
  isAppwriteNotFound,
  loadOwnedProfile,
  requireProfileIdParam,
} from '../../../../utils/brandStore'

/**
 * DER VERLAUF EINER BRAND (docs/archiv/BRAND-CHECK-SEITE.md §5) — alle Checks,
 * die zu dieser Marke gehören, und die Gegenüberstellung der zwei jüngsten
 * derselben Quelle.
 *
 * ── ZWEI ABFRAGEN, WEIL ES ZWEI ZUGEHÖRIGKEITEN GIBT ──────────────────────
 * Ein Check gehört zu dieser Brand, wenn er ihre `profileId` trägt (jeder
 * Dokument-Check — dessen `urlKey` ist ohnehin `doc:<profileId>` — und jedes
 * „neu ermitteln" aus dem Dashboard) ODER wenn er
 * ihre WEBSITE geprüft hat, ohne von hier gestartet worden zu sein — genau der
 * Normalfall: der Mensch hat seine Adresse auf `/brand-check` eingetippt,
 * BEVOR er ein Konto hatte. Ohne den zweiten Weg begänne der Verlauf jeder
 * Brand bei null, obwohl der erste Wert längst da ist.
 *
 * Es sind BEWUSST zwei `listRows` und kein `Query.or`: die zweite Abfrage
 * entfällt ganz, wenn keine Website hinterlegt ist, und beide Wege haben ihren
 * eigenen Index (`urlKey`, `profileId`). Zusammengeführt wird über die Zeilen-
 * Id — ein Check mit BEIDEN Merkmalen darf nicht doppelt im Verlauf stehen.
 *
 * ── AUSGEBLENDETES BLEIBT AUSGEBLENDET ───────────────────────────────────
 * `hidden` ist die Antwort des Betreibers auf einen Entfernungswunsch (§3
 * „Recht"). Sie gilt auch hier: die Ergebnis-Seite antwortet auf so eine Zeile
 * mit 404, und ein Verlauf, der auf ein 404 verlinkt, wäre eine Sackgasse mit
 * Zahl.
 *
 * ── ES KOSTET KEINE KI UND ES SCHREIBT NICHTS ────────────────────────────
 * Reine Leseansicht über bereits bezahlte Ergebnisse. Deshalb kein Deckel und
 * kein eigener Drossel-Eimer — der Zugang ist die Grenze
 * (`requireBrandAccess` + `loadOwnedProfile`, fremde Brand = 404).
 */

/** Wie viele Stände der Verlauf zeigt. Eine Liste, die man durchsieht. */
const HISTORY_LIMIT = 50

export default defineEventHandler(async (event): Promise<BrandCheckHistoryResponse> => {
  const { userId } = await requireBrandAccess(event)
  const profileId = requireProfileIdParam(event)
  const profile = await loadOwnedProfile(event, userId, profileId)

  const { tablesDB, databaseId } = brandDb(event)
  const websiteKey = brandCheckUrlKey(profile.websiteUrl ?? '')

  const rows = new Map<string, BrandCheckRow>()
  for (const queries of [
    [Query.equal('profileId', profileId)],
    ...(websiteKey ? [[Query.equal('urlKey', websiteKey)]] : []),
  ]) {
    try {
      const res = await tablesDB.listRows<BrandCheckRow>({
        databaseId,
        tableId: BRAND_CHECKS_TABLE,
        queries: [...queries, Query.orderDesc('$createdAt'), Query.limit(HISTORY_LIMIT)],
      })
      for (const row of res.rows) rows.set(row.$id, row)
    }
    catch (error) {
      // Vor brand-017 gibt es die Spalte `profileId` nicht, vor brand-016
      // nicht einmal die Tabelle. Ein LEERER Verlauf ist dann die wahre
      // Antwort — ein 503 sähe kaputt aus, wo nur noch nichts ist.
      if (!isAppwriteNotFound(error)) {
        logEvent('warn', 'brand.check_history_unavailable', {
          profileId,
          message: error instanceof Error ? error.message : 'unknown',
        })
        throw createError({
          status: 503,
          statusText: 'Check history unavailable',
          data: { code: 'history_unavailable' },
        })
      }
    }
  }

  const items = [...rows.values()]
    .filter(row => brandCheckRankingFacts(row).hidden === false)
    .sort((a, b) => b.$createdAt.localeCompare(a.$createdAt))
    .slice(0, HISTORY_LIMIT)
    .map(toHistoryItem)

  return { items, diff: latestBrandCheckDiff(items) }
})

function toHistoryItem(row: BrandCheckRow): BrandCheckHistoryItem {
  return {
    id: row.$id,
    source: brandCheckRankingFacts(row).source,
    score: row.score ?? 0,
    band: row.band ?? '',
    createdAt: row.$createdAt,
    categories: brandCheckCategoryScores(parseCategories(row.categories)),
  }
}

/** Kaputtes JSON ergibt eine LEERE Liste — eine unlesbare Nebenangabe darf
 *  den Verlauf nicht kosten (dieselbe Nachsicht wie im Ranking). */
function parseCategories(raw: string): BrandCheckCategoryResult[] {
  try {
    const parsed: unknown = JSON.parse(raw || 'null')
    return Array.isArray(parsed) ? parsed as BrandCheckCategoryResult[] : []
  }
  catch {
    return []
  }
}
