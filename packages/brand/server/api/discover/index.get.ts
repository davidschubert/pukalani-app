import { createBrandDiscoverQuerySchema } from '../../../schemas/brandDiscover'
import {
  BRAND_DISCOVER_PAGE_SIZE,
  BRAND_DISCOVER_SPOTLIGHT_MAX,
  filterDiscoverItems,
  paginateDiscoverItems,
  pickDiscoverFeatured,
  sortDiscoverItems,
} from '../../../shared/brandDiscover'
import type { BrandDiscoverListResponse } from '../../../shared/types/brand'
import {
  listPublishedBrandPublications,
  loadDiscoverCheckFacts,
  toDiscoverItem,
} from '../../utils/brandDiscover'

/**
 * DIE ÖFFENTLICHE GALERIE (docs/plans/DISCOVER-BRANDS.md §4.1, §6, Paket D2) —
 * ohne Konto, ohne KI, ohne einen einzigen Schreibvorgang.
 *
 * ── DREI SCHRITTE, IN DIESER REIHENFOLGE ─────────────────────────────────
 *  1. Ein FENSTER der freigegebenen Veröffentlichungen lesen (jüngste zuerst).
 *  2. Die Zahlen dazu GEBÜNDELT holen — eine Abfrage über `brand_checks`, nie
 *     eine je Kachel. Wer jenseits der 100 jüngsten liegt, zeigt keine Zahl
 *     (Begründung an `BRAND_DISCOVER_CHECK_LOOKUP_MAX`).
 *  3. Filtern, sortieren, blättern — pur, in `shared/brandDiscover.ts`.
 *
 * Der Aufmacher wird VOR dem Filtern bestimmt: „Brand of the Day" ist eine
 * Kuration über die ganze Galerie und keine Eigenschaft der gerade gewählten
 * Facette. Wer nach „Relaunch" filtert, sieht denselben Aufmacher wie alle
 * anderen — er ist die Empfehlung des Hauses, nicht das erste Suchergebnis.
 *
 * ── MICROCACHE 60 s, UND ER IST EHRLICH USER-AGNOSTISCH ──────────────────
 * Die Antwort hängt an keiner Session: dieselbe Adresse gibt jedem dasselbe.
 * Genau das ist die Bedingung aus `core/server/utils/microcache.ts`. Der
 * Schlüssel trägt ALLE sechs Eingaben — ohne sie zeigte die zweite Anfrage mit
 * anderem Filter die erste Antwort.
 *
 * ── KEIN EIGENER DROSSEL-EIMER ───────────────────────────────────────────
 * Ein GET ohne Kosten: höchstens zwei Abfragen je Minute und
 * Filterkombination, alles andere kommt aus dem Speicher. Dieselbe Begründung
 * wie beim Ranking.
 */
const DISCOVER_TTL_MS = 60_000
const discoverCache = createMicrocache<BrandDiscoverListResponse>(DISCOVER_TTL_MS)

export default defineEventHandler(async (event): Promise<BrandDiscoverListResponse> => {
  const query = await getValidatedQuery(event, createBrandDiscoverQuerySchema().parse)

  const cacheKey = [query.path, query.archetype, query.palette, query.industry, query.sort, query.page].join('|')
  const hit = discoverCache.get(cacheKey)
  if (hit) return hit

  const rows = await listPublishedBrandPublications(event)
  const checks = await loadDiscoverCheckFacts(event, rows.map(row => row.$id))
  const featuredSlug = pickDiscoverFeatured(rows)?.slug ?? ''

  const all = rows.map(row => toDiscoverItem(row, checks.get(row.$id) ?? [], featuredSlug))
  const sorted = sortDiscoverItems(
    filterDiscoverItems(all, query),
    query.sort,
  )

  const response: BrandDiscoverListResponse = {
    items: paginateDiscoverItems(sorted, query.page, BRAND_DISCOVER_PAGE_SIZE),
    total: sorted.length,
    page: query.page,
    pageSize: BRAND_DISCOVER_PAGE_SIZE,
    featured: all.find(item => item.featured) ?? null,
    // `all` ist schon nach `publishedAt` absteigend gelesen — die drei ersten
    // SIND die drei neuesten, ohne ein zweites Sortieren.
    spotlight: all.slice(0, BRAND_DISCOVER_SPOTLIGHT_MAX),
  }

  discoverCache.set(cacheKey, response)
  logEvent('info', 'brand.discover_listed', {
    total: response.total,
    page: response.page,
    sort: query.sort,
    featured: Boolean(response.featured),
  })
  return response
})
