import type { H3Event } from 'h3'
import type { InsightsBrand } from '../../../../../shared/insightsPost'
import { insightsPostIsVisible, toInsightsPublicBrand } from '../../../../../shared/insightsPublic'
import { toInsightsBrand, toInsightsPost } from '../../../../../shared/insightsRows'
import type { InsightsPublicBrandResponse } from '../../../../../shared/types/insightsApi'

/**
 * EIN MARKENPROFIL — `/brands/<slug>` (§2.1, §9.3; die Reservierung aus
 * DISCOVER-BRANDS §9 wird hier eingelöst).
 *
 * ── DER RIEGEL IST HIER KEINE FORMSACHE ─────────────────────────────────
 * Solange `profile` nicht freigeschaltet ist (§11.3: „ohne die Antworten zu 3
 * und 4 geht KEIN Markenprofil live"), antwortet diese Route 404 — mit
 * demselben Code wie ein unbekannter Slug. Das ist die technische Seite von
 * Davids Gate, und sie sitzt in `insightsBrandIsVisible` (gelesen von
 * `findPublicInsightsBrand`), nicht in einem `if` je Route.
 *
 * ── „AUF WUNSCH ENTFERNT" IST EINE ANTWORT, KEIN 404 ────────────────────
 * Entscheidung 11 („ohne Diskussion gewährt — dokumentiert mit Datum und
 * Grund"): eine entfernte Marke behält ihre Seite, und die Seite sagt, dass sie
 * weg ist. Ein 404 sähe aus wie ein Fehler und lüde zum Nachfragen ein.
 *
 * WAS DIE ZEILE DANN NICHT MEHR TRÄGT: Zeichen, Historie, Quellen,
 * Beziehungen, Beiträge und der Score. Über eine entfernte Marke wird NICHTS
 * mehr behauptet — der Notausgang ist sonst eine Tür, die nur die Überschrift
 * mitnimmt. Den Status 410 und das `noindex` setzt die SEITE (ein Statuscode
 * gehört zur Seite, nicht zur Datenroute).
 *
 * ── DIE BEITRÄGE ZUR MARKE KOMMEN AUS DEM JOURNAL-FENSTER ───────────────
 * `brandRefs` ist eine JSON-Spalte ohne Index; eine Abfrage darauf wäre ein
 * Scan mit Nachprüfung. Gefiltert wird deshalb auf derselben Menge, die auch
 * das Journal zeigt — was dort nicht steht, gehört auch nicht auf die
 * Marken-Seite.
 */
const ENTRY_TTL_MS = 60_000
const entryCache = createMicrocache<InsightsPublicBrandResponse>(ENTRY_TTL_MS)

/** Ein Dossier, kein Archiv: mehr als zwölf Beiträge liest hier niemand. */
const BRAND_POSTS_MAX = 12

export default defineEventHandler(async (event): Promise<InsightsPublicBrandResponse> => {
  const slug = (getRouterParam(event, 'slug') ?? '').toLowerCase()
  const preview = getQuery(event).preview === '1'
  if (preview) requirePermission(event, 'insights.manage')

  const hit = preview ? undefined : entryCache.get(slug)
  if (hit) return hit

  let id: string
  let brand: InsightsBrand
  if (preview) {
    const row = await findAnyInsightsBrandRow(event, slug)
    if (!row) throw insightsPublicMissing()
    id = row.$id
    brand = toInsightsBrand(row)
  }
  else {
    const lookup = await findPublicInsightsBrand(event, slug)
    if (lookup.kind === 'missing') throw insightsPublicMissing()
    if (lookup.kind === 'redirect') {
      const redirect: InsightsPublicBrandResponse = { kind: 'redirect', slug: lookup.slug }
      entryCache.set(slug, redirect)
      return redirect
    }
    id = lookup.hit.row.$id
    brand = lookup.hit.brand
  }

  const removed = brand.state === 'removed'
  const response = removed
    ? buildRemoved(id, brand, preview)
    : await buildProfile(event, id, brand, preview)

  if (!preview) entryCache.set(slug, response)
  logEvent('info', 'insights.public_brand', { slug, removed })
  return response
})

/**
 * Die entfernte Marke: die vier Listen werden AUSGERÄUMT, bevor die Zeile den
 * Server verlässt. Sie nur nicht anzuzeigen reichte nicht — was in einer
 * Antwort steht, steht in jedem Cache und in jeder Browser-Konsole.
 *
 * Was BLEIBT: Name, Datum und Grund. Genau das ist die Dokumentation, die
 * Entscheidung 11 zusagt und nach der Anwaltsfrage 3 fragt.
 */
function buildRemoved(id: string, brand: InsightsBrand, preview: boolean): InsightsPublicBrandResponse {
  const view = toInsightsPublicBrand(id, brand)
  return {
    kind: 'brand',
    brand: { ...view, marks: [], history: [], sources: [], relations: [] },
    score: null,
    gradient: insightsGradientFor(brand.paletteId, brand.slug),
    posts: [],
    relations: [],
    ...(preview ? { preview: true as const } : {}),
  }
}

async function buildProfile(
  event: H3Event,
  id: string,
  brand: InsightsBrand,
  preview: boolean,
): Promise<InsightsPublicBrandResponse> {
  const allowed = insightsPublicFormats()
  const journal = await listPublicInsightsPostRows(event)
  const mentioning = postsMentioningBrand(journal, id)
    .filter(row => insightsPostIsVisible(toInsightsPost(row), allowed))
    .slice(0, BRAND_POSTS_MAX)

  const brandsForPosts = await loadInsightsBrandRowsByIds(event, insightsListBrandIds(mentioning))
  const relationRows = await loadInsightsBrandRowsByIds(event, brand.relations)

  return {
    kind: 'brand',
    brand: toInsightsPublicBrand(id, brand),
    score: await loadInsightsBrandScore(event, brand),
    gradient: insightsGradientFor(brand.paletteId, brand.slug),
    posts: mentioning
      .map(row => toInsightsPublicListItem(row, brandsForPosts))
      .filter(item => Boolean(item.href)),
    // Nur Wettbewerber, die selbst öffentlich stehen: ein Link auf einen
    // Entwurf wäre ein 404, und der NAME einer Marke, über die noch niemand
    // etwas geprüft hat, gehört nicht auf eine öffentliche Seite.
    relations: [...relationRows.values()]
      .filter(row => row.state === 'published')
      .map(row => ({ id: row.$id, name: row.name, slug: row.slug })),
    ...(preview ? { preview: true as const } : {}),
  }
}
