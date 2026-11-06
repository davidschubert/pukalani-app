import { Query } from 'node-appwrite'
import { createBrandCheckRankingQuerySchema } from '../../../../schemas/brandCheck'
import { brandCheckCategoryScores } from '../../../../shared/brandCheck'
import {
  BRAND_CHECK_RANKING_PAGE_SIZE,
  BRAND_CHECK_RANKING_SCAN_LIMIT,
  filterBrandCheckRankingItems,
  paginateBrandCheckRankingItems,
  pickLatestPerUrlKey,
  sortBrandCheckRankingItems,
} from '../../../../shared/brandCheckRanking'
import type {
  BrandCheckCategoryResult,
  BrandCheckRankingItem,
  BrandCheckRankingResponse,
} from '../../../../shared/types/brand'
import {
  BRAND_CHECKS_TABLE,
  type BrandCheckRow,
  brandCheckRankingFacts,
  brandDb,
  isAppwriteNotFound,
} from '../../../utils/brandStore'

/**
 * DAS RANKING (docs/archiv/BRAND-CHECK-SEITE.md §3) — öffentlich, ohne Konto,
 * ohne KI, ohne einen einzigen Schreibvorgang.
 *
 * ── WAS HIER DRINSTEHT, IST EINE AUSSAGE ÜBER FREMDE MARKEN ───────────────
 * Deshalb sind vier Grenzen in der ABFRAGE und nicht in der Anzeige:
 *  · `rankingOptIn: true` — nur Checks, bei denen jemand das Häkchen gesetzt
 *    hat (Davids Entscheidung 1). Ohne Häkchen bleibt ein Check privat.
 *  · `hidden: false` — der Betreiber hat einem Entfernungswunsch nicht
 *    stattgegeben (§3 „Recht").
 *  · `score > 0` — Fehlläufe gehören nicht in eine Bestenliste (§6). Eine 0
 *    heisst hier „nichts war bewertbar", nicht „schlecht".
 *  · je `urlKey` der JÜNGSTE Check — ältere sind Verlauf (§3). Ein veralteter
 *    Wert über eine fremde Marke wäre der eigentliche Schaden.
 * Eine Grenze in der Anzeige wäre keine: die Antwort ist JSON, und wer sie
 * abruft, sieht alles, was drin ist.
 *
 * ── DIE SORTIERUNG PASSIERT IM SERVER, UND ZWAR MIT ABSICHT ───────────────
 * „Die Besten in Konsistenz" sortiert nach einem Wert INNERHALB der
 * JSON-Spalte `categories`; TablesDB kennt kein JSON-Feld und kann darüber
 * weder sortieren noch filtern. Die vier Regeln stehen deshalb pur in
 * `shared/brandCheckRanking.ts` — der Preis (ein Lesefenster von 500 Zeilen)
 * ist dort begründet, und er wird hier BEZAHLT und nicht versteckt: `total`
 * zählt die Auftritte im Fenster, nicht die der ganzen Tabelle.
 *
 * ── MICROCACHE 60 s, UND ER IST EHRLICH USER-AGNOSTISCH ───────────────────
 * Die Antwort hängt an keiner Session: dieselbe Abfrage gibt jedem dasselbe.
 * Genau das ist die Bedingung aus `core/server/utils/microcache.ts`, und sie
 * gilt hier — anders als bei den Kommentar-Zählern gibt es keine
 * Publikums-Achse, die die Zahl je Leser ändern könnte. Der Schlüssel trägt
 * alle vier Eingaben; ohne sie zeigte die zweite Anfrage mit anderem Filter
 * die erste Antwort.
 *
 * ── KEIN EIGENER DROSSEL-EIMER ────────────────────────────────────────────
 * Ein GET ohne Kosten: eine Abfrage je Minute und Filterkombination, alles
 * andere kommt aus dem Speicher. Dieselbe Begründung wie beim Ergebnis-GET —
 * ein geteilter Link soll auch dann aufgehen, wenn ihn zehn Menschen
 * gleichzeitig öffnen.
 */
const RANKING_TTL_MS = 60_000
const rankingCache = createMicrocache<BrandCheckRankingResponse>(RANKING_TTL_MS)

export default defineEventHandler(async (event): Promise<BrandCheckRankingResponse> => {
  const query = await getValidatedQuery(event, createBrandCheckRankingQuerySchema().parse)

  const cacheKey = `${query.industry}|${query.band}|${query.sort}|${query.page}`
  const hit = rankingCache.get(cacheKey)
  if (hit) return hit

  const { tablesDB, databaseId } = brandDb(event)

  let rows: BrandCheckRow[] = []
  try {
    const res = await tablesDB.listRows<BrandCheckRow>({
      databaseId,
      tableId: BRAND_CHECKS_TABLE,
      queries: [
        Query.equal('rankingOptIn', true),
        Query.equal('hidden', false),
        Query.greaterThan('score', 0),
        // Nach ZEIT, nicht nach Punkten: nur so ist „je Adresse der jüngste"
        // innerhalb des Fensters exakt — ein älterer Stand kann einen neueren
        // dann nie verdecken. Die Reihenfolge des Rankings entsteht danach.
        Query.orderDesc('$createdAt'),
        Query.limit(BRAND_CHECK_RANKING_SCAN_LIMIT),
      ],
    })
    rows = res.rows
  }
  catch (error) {
    // Vor der brand-017-Migration gibt es die Spalten nicht, vor brand-016
    // nicht einmal die Tabelle. Eine LEERE Liste ist dann die wahre Antwort —
    // ein 503 auf einer öffentlichen, indexierbaren Seite wäre die
    // schlechtere: sie sähe kaputt aus, statt leer zu sein.
    if (!isAppwriteNotFound(error)) {
      logEvent('warn', 'brand.check_ranking_unavailable', {
        message: error instanceof Error ? error.message : 'unknown',
      })
      throw createError({
        status: 503,
        statusText: 'Ranking unavailable',
        data: { code: 'ranking_unavailable' },
      })
    }
  }

  const latest = pickLatestPerUrlKey(rows.map(toRankingRow))
  const filtered = filterBrandCheckRankingItems(
    latest.map(entry => entry.item),
    { industry: query.industry, band: query.band },
  )
  const sorted = sortBrandCheckRankingItems(filtered, query.sort)

  const response: BrandCheckRankingResponse = {
    items: paginateBrandCheckRankingItems(sorted, query.page, BRAND_CHECK_RANKING_PAGE_SIZE),
    total: sorted.length,
    page: query.page,
    pageSize: BRAND_CHECK_RANKING_PAGE_SIZE,
  }
  rankingCache.set(cacheKey, response)
  return response
})

/**
 * EINE ZEILE IN DIE SICHT ÜBERSETZEN — und der `urlKey` reist als
 * SCHWESTERFELD mit, nicht in der Sicht.
 *
 * Er ist der Gruppier-Schlüssel („je Adresse der jüngste") und gehört genau
 * deshalb nicht in die Antwort: er ist Host PLUS Pfad und damit eine Angabe
 * mehr über einen fremden Auftritt, als eine Rangliste braucht. Die
 * Ergebnis-Seite zeigt die vollständige Adresse — dort steht auch der Weg,
 * den Eintrag entfernen zu lassen.
 */
function toRankingRow(row: BrandCheckRow): { urlKey: string, createdAt: string, item: BrandCheckRankingItem } {
  const facts = brandCheckRankingFacts(row)
  return {
    urlKey: row.urlKey,
    createdAt: row.$createdAt,
    item: {
      id: row.$id,
      host: row.host ?? '',
      score: row.score ?? 0,
      band: row.band ?? '',
      industry: facts.industry,
      source: facts.source,
      createdAt: row.$createdAt,
      categories: toCategoryScores(row.categories),
    },
  }
}

/**
 * DIE ACHT KATEGORIE-WERTE, AUF 0–100 NORMIERT.
 *
 * Die RECHNUNG steht pur in `shared/brandCheck.ts`
 * (`brandCheckCategoryScores`) — sie hat seit dem Verlauf einer Brand einen
 * zweiten Leser, und dieselbe Zahl zweimal gerechnet wäre zweimal eine
 * Gelegenheit, verschieden zu runden. Hier bleibt nur das LESEN der Spalte.
 *
 * Kaputtes JSON ergibt eine LEERE Liste statt eines Wurfs: eine unlesbare
 * Nebenangabe darf die ganze Seite nicht kosten.
 */
function toCategoryScores(raw: string): { id: string, score: number | null }[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw || 'null')
  }
  catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return brandCheckCategoryScores(parsed as BrandCheckCategoryResult[])
}
