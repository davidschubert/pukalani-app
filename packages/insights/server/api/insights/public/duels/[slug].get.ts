import type { H3Event } from 'h3'
import type { InsightsPost } from '../../../../../shared/insightsPost'
import type { InsightsPublicDuelSide } from '../../../../../shared/insightsPublic'
import { insightsDuelParts, toInsightsPublicPost } from '../../../../../shared/insightsPublic'
import type { InsightsBrandRow } from '../../../../../shared/insightsRows'
import { toInsightsBrand, toInsightsPost } from '../../../../../shared/insightsRows'
import type { InsightsPublicDuelResponse } from '../../../../../shared/types/insightsApi'

/**
 * EIN BRAND-DUELL — `/duels/<a>-vs-<b>` (§2.2, §9.2).
 *
 * ── DIE ADRESSE IST ALPHABETISCH, DIE GEGENRICHTUNG EINE 301 ────────────
 * `nike-vs-adidas` und `adidas-vs-nike` wären sonst zwei Seiten mit demselben
 * Inhalt (§11 Frage 2). Die Regel steht in `insightsDuelCanonical`, die
 * Reihenfolge der Auflösung in `insightsSlugResolution` — beide pur, beide
 * mit Gegenprobe.
 *
 * ── LINKS IST, WER IM SLUG VORNE STEHT ──────────────────────────────────
 * Nicht „die erste Marke in `brandRefs`". Der Leser hat eine Adresse
 * angeklickt; stünde die Tafel anders herum, läse er eine andere Aufstellung,
 * als er gewählt hat. Die Zuordnung läuft über den SLUG der Marke, nicht über
 * ihre Position — die Reihenfolge in `brandRefs` ist eine Redaktions-Sache und
 * keine Zusage.
 *
 * ── OHNE ZWEI SCORES GIBT ES KEIN DUELL ─────────────────────────────────
 * `InDuel` vergleicht acht Dimensionen nebeneinander. Fehlt eine Marke oder
 * ihr Check, wäre die halbe Tafel leer — und eine leere Spalte liest sich wie
 * „schlecht" statt wie „nicht gemessen". Die Route antwortet dann 404: die
 * Redaktion sieht es im Prüflauf, der Leser sieht keine halbe Aussage.
 */
const ENTRY_TTL_MS = 60_000
const entryCache = createMicrocache<InsightsPublicDuelResponse>(ENTRY_TTL_MS)

export default defineEventHandler(async (event): Promise<InsightsPublicDuelResponse> => {
  const slug = (getRouterParam(event, 'slug') ?? '').toLowerCase()
  const preview = getQuery(event).preview === '1'
  if (preview) requirePermission(event, 'insights.manage')

  const hit = preview ? undefined : entryCache.get(slug)
  if (hit) return hit

  let id: string
  let post: InsightsPost
  if (preview) {
    const row = await findAnyInsightsPostRow(event, 'duel', slug)
    if (!row) throw insightsPublicMissing()
    id = row.$id
    post = toInsightsPost(row)
  }
  else {
    const lookup = await findPublicInsightsPost(event, 'duel', slug)
    if (lookup.kind === 'missing') throw insightsPublicMissing()
    if (lookup.kind === 'redirect') {
      const redirect: InsightsPublicDuelResponse = { kind: 'redirect', slug: lookup.slug }
      entryCache.set(slug, redirect)
      return redirect
    }
    id = lookup.hit.row.$id
    post = lookup.hit.post
  }

  const sides = await loadSides(event, post, slug)
  if (!sides) throw insightsPublicMissing()

  const response: InsightsPublicDuelResponse = {
    kind: 'duel',
    post: toInsightsPublicPost(id, post),
    left: sides.left,
    right: sides.right,
    facts: post.facts,
    ...(preview ? { preview: true as const } : {}),
  }

  if (!preview) entryCache.set(slug, response)
  logEvent('info', 'insights.public_duel', { slug })
  return response
})

/**
 * Die zwei Seiten in der Reihenfolge der ADRESSE.
 *
 * Kann der Slug nicht in zwei Teile zerlegt werden (kein `-vs-`), fällt die
 * Zuordnung auf die Reihenfolge in `brandRefs` zurück — das ist der Fall eines
 * von Hand gesetzten Duell-Slugs, und dort ist die Redaktionsreihenfolge die
 * einzige Aussage, die es gibt.
 */
async function loadSides(
  event: H3Event,
  post: InsightsPost,
  slug: string,
): Promise<{ left: InsightsPublicDuelSide, right: InsightsPublicDuelSide } | null> {
  const rows = await loadInsightsBrandRowsByIds(event, post.brandRefs.map(ref => ref.brandId))
  const published = post.brandRefs
    .map(ref => rows.get(ref.brandId))
    .filter((row): row is InsightsBrandRow => row !== undefined && row.state === 'published')
    .slice(0, 2)
  if (published.length < 2) return null

  const parts = insightsDuelParts(slug)
  const first = published[0]!
  const second = published[1]!
  const leftRow = parts && second.slug === parts.a ? second : first
  const rightRow = leftRow === first ? second : first

  // OHNE SCORE IST DAS DUELL KÜRZER, NICHT WEG (Klick-Beweis 2026-09-10).
  // Hier stand `if (!left.score || !right.score) return null` — also 404. Das
  // widersprach dem Rest des Systems: die Prüfregeln vor `review` verlangen
  // für ein Duell KEINEN Brand-Check, ein freigegebenes Duell ohne geprüfte
  // Websites war damit in der Sitemap, auf der Journal-Karte und am Ziel der
  // 301 der Gegenrichtung — und antwortete an all diesen Stellen 404. Die
  // Statistik-Tafel entfällt jetzt in `InDuel` (dieselbe Lösung wie beim
  // Profil, wo `score` seit dem Prototyp optional ist); Fakten-Zeilen,
  // Einordnung und Quellen trägt der Beitrag ohnehin selbst.
  return { left: await toSide(event, leftRow), right: await toSide(event, rightRow) }
}

async function toSide(event: H3Event, row: InsightsBrandRow): Promise<InsightsPublicDuelSide> {
  const brand = toInsightsBrand(row)
  return {
    id: row.$id,
    name: brand.name,
    slug: brand.slug,
    state: brand.state,
    archetype: brand.archetype,
    score: await loadInsightsBrandScore(event, brand),
  }
}
