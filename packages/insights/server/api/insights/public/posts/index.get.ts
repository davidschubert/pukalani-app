import { insightsPostIsVisible } from '../../../../../shared/insightsPublic'
import { toInsightsPost } from '../../../../../shared/insightsRows'
import type { InsightsPublicListResponse } from '../../../../../shared/types/insightsApi'

/**
 * DAS JOURNAL — die öffentliche Liste über alle vier Formate (§9.5, Adresse
 * `/insights`).
 *
 * ── KEINE QUERY-PARAMETER, UND DAS IST DER PUNKT ────────────────────────
 * Format, Thema, Sprache und Sortierung stehen in der ADRESSE DER SEITE
 * (`?format=…`, teilbar) und werden im BROWSER gerechnet — mit denselben puren
 * Regeln, die auch die Redaktion benutzt (`insightsFilterPosts`,
 * `insightsSortPosts`). Diese Route kennt sie nicht.
 *
 * Der Grund ist der Microcache: EIN Eintrag deckt jede Filterkombination.
 * Mit Query-Parametern wären es 4 Formate × 9 Themen × 3 Sprachen × 2
 * Sortierungen = 216 Cache-Einträge für dieselben zweihundert Zeilen — und der
 * Cache hält insgesamt 500. Ein Filter, der einen Serverweg kostet, macht
 * ausserdem aus jedem Chip-Klick eine Ladeanzeige.
 *
 * ── OHNE FLIESSTEXT ─────────────────────────────────────────────────────
 * `InsightsPublicPostListItem` trägt Titel, Vorspann, Thema, Lesezeit, Adresse
 * und Farbwelt — nicht die zwei Artikel-Fassungen. Zweihundert Zeilen mit
 * Volltext wären ein Megabyte für eine Kachelwand.
 *
 * ── DER RIEGEL FILTERT MIT ──────────────────────────────────────────────
 * Solange `profile`, `duel` und `ranking` gesperrt sind (§11.3), zeigt das
 * Journal nur Artikel — dieselbe Regel wie an jeder Einzelseite. Eine Liste,
 * die auf 404 verlinkt, wäre die sichtbarste Art, den Riegel zu vergessen.
 *
 * ── EINTRÄGE OHNE ADRESSE FALLEN WEG ────────────────────────────────────
 * Ein Markenprofil-Beitrag, dessen Marken-Zeile gelöscht wurde, hat keinen
 * Pfad (`insightsPublicHref` gibt ''). Ein Eintrag, der ins Leere führt, ist
 * schlimmer als einer, der fehlt.
 */
const LIST_TTL_MS = 60_000
const listCache = createMicrocache<InsightsPublicListResponse>(LIST_TTL_MS)
const LIST_CACHE_KEY = 'insights-public-posts'

export default defineEventHandler(async (event): Promise<InsightsPublicListResponse> => {
  const hit = listCache.get(LIST_CACHE_KEY)
  if (hit) return hit

  const allowed = insightsPublicFormats()
  const rows = await listPublicInsightsPostRows(event)
  const visible = rows.filter(row => insightsPostIsVisible(toInsightsPost(row), allowed))
  const brands = await loadInsightsBrandRowsByIds(event, insightsListBrandIds(visible))

  const response: InsightsPublicListResponse = {
    posts: visible
      .map(row => toInsightsPublicListItem(row, brands))
      .filter(item => Boolean(item.href)),
  }

  listCache.set(LIST_CACHE_KEY, response)
  logEvent('info', 'insights.public_list', { posts: response.posts.length, formats: allowed.length })
  return response
})
