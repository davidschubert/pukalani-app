import { z } from 'zod'
import {
  BRAND_DISCOVER_DEFAULT_SORT,
  normalizeBrandDiscoverArchetype,
  normalizeBrandDiscoverIndustry,
  normalizeBrandDiscoverPage,
  normalizeBrandDiscoverPalette,
  normalizeBrandDiscoverPathKind,
  normalizeBrandDiscoverSort,
} from '../shared/brandDiscover'

/**
 * DIE ADRESSZEILE DER GALERIE (docs/plans/DISCOVER-BRANDS.md §4.1) — vier
 * Facetten, eine Sortierung, eine Seite.
 *
 * ── KEIN FELD WIRFT, JEDES WIRD GEZOGEN ──────────────────────────────────
 * Dieselbe Haltung wie beim Ranking-Schema: `/discover?palette=lila` ist ein
 * weitergeschickter Link mit einem Tippfehler, kein Angriff. Ein 400 auf einer
 * INDEXIERBAREN Seite wäre ausserdem ein Fehler, den ein Crawler meldet — die
 * Antwort ist die Galerie ohne diesen Filter.
 *
 * Die Prüfung selbst steht PUR in `shared/brandDiscover.ts` (dort gegen die
 * Kataloge gemessen), damit die Seite beim Lesen der Query genau dieselbe
 * Rechnung anstellt wie die Route.
 */
export function createBrandDiscoverQuerySchema() {
  return z.object({
    path: z.string().trim().max(32).default('').transform(normalizeBrandDiscoverPathKind),
    archetype: z.string().trim().max(40).default('').transform(normalizeBrandDiscoverArchetype),
    palette: z.string().trim().max(40).default('').transform(normalizeBrandDiscoverPalette),
    industry: z.string().trim().max(40).default('').transform(normalizeBrandDiscoverIndustry),
    sort: z.string().trim().max(32).default(BRAND_DISCOVER_DEFAULT_SORT).transform(normalizeBrandDiscoverSort),
    page: z.union([z.string(), z.number()]).optional().transform(normalizeBrandDiscoverPage),
  })
}

export type BrandDiscoverQuery = z.output<ReturnType<typeof createBrandDiscoverQuerySchema>>
