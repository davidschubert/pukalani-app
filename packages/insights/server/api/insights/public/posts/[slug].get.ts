import { toInsightsPublicPost } from '../../../../../shared/insightsPublic'
import { toInsightsPost } from '../../../../../shared/insightsRows'
import type { InsightsPublicPostResponse } from '../../../../../shared/types/insightsApi'

/**
 * EIN ARTIKEL — `/insights/<slug>` (§2.3, §9.5).
 *
 * ── SIE LIEST NUR `article` ─────────────────────────────────────────────
 * Nicht „das Format, das der Slug hat". Jedes Format hat seine eigene Basis
 * (§9.2) und seine eigene Route; ein Duell unter `/insights/…` wäre eine
 * zweite Adresse für dieselbe Seite — genau das, was der Duell-Kanon eine
 * Ebene tiefer verhindert.
 *
 * ── DIE 301 ENTSTEHT HIER, DER PFAD IN DER SEITE ────────────────────────
 * Ein umbenannter Beitrag antwortet `{ kind: 'redirect', slug }` (§9.2). Den
 * Locale-Präfix setzt die SEITE mit `localePath()` — ein Pfad aus dem Server
 * wäre auf `/de/…` die englische Adresse.
 *
 * ── DIE BETREIBER-VORSCHAU (`?preview=1`) ───────────────────────────────
 * Wer freigeben soll, muss den ENTWURF sehen. Das Gate ist dasselbe wie in der
 * Redaktion (`insights.manage`), und die Vorschau geht NIE durch den
 * Microcache: sie ist personengebunden, und ein zwischengespeicherter Entwurf
 * über eine fremde Marke läge sonst sechzig Sekunden für jeden Leser bereit.
 * Sie umgeht den RIEGEL bewusst — er ist die Freigabe an die Öffentlichkeit,
 * nicht an den Betreiber, und ohne Vorschau könnte niemand prüfen, was nach
 * der Anwaltsantwort live ginge.
 *
 * ── DER TEXT DER UNREDIGIERTEN ZWEITFASSUNG VERLÄSST DEN SERVER NICHT ───
 * Das erledigt `toInsightsPublicPost` (§3.2) — auch in der Vorschau: was der
 * Redakteur sehen will, sieht er im Editor, und die Vorschau soll zeigen, was
 * der LESER bekäme.
 */
const ENTRY_TTL_MS = 60_000
const entryCache = createMicrocache<InsightsPublicPostResponse>(ENTRY_TTL_MS)

export default defineEventHandler(async (event): Promise<InsightsPublicPostResponse> => {
  const slug = (getRouterParam(event, 'slug') ?? '').toLowerCase()
  const preview = getQuery(event).preview === '1'
  if (preview) requirePermission(event, 'insights.manage')

  const hit = preview ? undefined : entryCache.get(slug)
  if (hit) return hit

  if (preview) {
    const row = await findAnyInsightsPostRow(event, 'article', slug)
    if (!row) throw insightsPublicMissing()
    const post = toInsightsPost(row)
    const brands = await loadInsightsBrandRowsByIds(event, post.brandRefs.map(ref => ref.brandId))
    return {
      kind: 'post',
      post: toInsightsPublicPost(row.$id, post),
      brands: await loadInsightsBrandRefs(event, post, brands),
      preview: true,
    }
  }

  const lookup = await findPublicInsightsPost(event, 'article', slug)
  if (lookup.kind === 'missing') throw insightsPublicMissing()
  if (lookup.kind === 'redirect') {
    const redirect: InsightsPublicPostResponse = { kind: 'redirect', slug: lookup.slug }
    entryCache.set(slug, redirect)
    return redirect
  }

  const { row, post } = lookup.hit
  const brands = await loadInsightsBrandRowsByIds(event, post.brandRefs.map(ref => ref.brandId))
  const response: InsightsPublicPostResponse = {
    kind: 'post',
    post: toInsightsPublicPost(row.$id, post),
    brands: await loadInsightsBrandRefs(event, post, brands),
  }

  entryCache.set(slug, response)
  logEvent('info', 'insights.public_post', { slug, brands: response.kind === 'post' ? response.brands.length : 0 })
  return response
})
