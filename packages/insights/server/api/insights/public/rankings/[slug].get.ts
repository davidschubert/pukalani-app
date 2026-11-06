import type { InsightsPost } from '../../../../../shared/insightsPost'
import { toInsightsPublicPost } from '../../../../../shared/insightsPublic'
import { toInsightsPost } from '../../../../../shared/insightsRows'
import type { InsightsPublicRankingResponse } from '../../../../../shared/types/insightsApi'

/**
 * EINE RANKING-AUSGABE — `/rankings/<slug>` (§2.4, §11 Frage 7).
 *
 * ── DIE LISTE IST EINGEFROREN, UND DIE ROUTE RECHNET NICHTS NACH ────────
 * Zehn Plätze, sichtbarer Stand, nummerierte Ausgabe. Sie liegt als OBJEKT in
 * der `facts`-Spalte (§9.3, `toInsightsPost` liest die Form) und wird
 * unverändert weitergereicht. Ein Nachrechnen aus heutigen Check-Zeilen wäre
 * genau die stille Neunummerierung, die Entscheidung 11 verbietet — Platz 4
 * bleibt Platz 4, auch wenn die Marke inzwischen anders abschneidet.
 *
 * ── DIE NAMEN KOMMEN DAZU, DIE ZAHLEN NICHT ─────────────────────────────
 * Die Einträge tragen Marken-IDs; der Leser will Namen. `brands` ist deshalb
 * eine KARTE Id → Name/Adresse — und sie enthält NUR öffentlich stehende
 * Marken. Wer fehlt (Entwurf, entfernt, gelöscht), erscheint in der Liste als
 * Name aus der eingefrorenen Zeile ohne Link; die Seite entscheidet das.
 *
 * ── FEHLT DIE LISTE, GIBT ES KEINE SEITE ────────────────────────────────
 * Ein Ranking-Beitrag ohne `ranking`-Objekt kann das Schema gar nicht
 * verlassen (Form-Regel: „Ranking ohne Liste"). Kommt er trotzdem aus der
 * Datenbank, ist die Zeile beschädigt — und eine beschädigte Zeile ist für den
 * Leser dasselbe wie eine fehlende (404, nie 500: ein 500 wäre nur die
 * Einladung, es noch dreimal zu versuchen).
 */
const ENTRY_TTL_MS = 60_000
const entryCache = createMicrocache<InsightsPublicRankingResponse>(ENTRY_TTL_MS)

export default defineEventHandler(async (event): Promise<InsightsPublicRankingResponse> => {
  const slug = (getRouterParam(event, 'slug') ?? '').toLowerCase()
  const preview = getQuery(event).preview === '1'
  if (preview) requirePermission(event, 'insights.manage')

  const hit = preview ? undefined : entryCache.get(slug)
  if (hit) return hit

  let id: string
  let post: InsightsPost
  if (preview) {
    const row = await findAnyInsightsPostRow(event, 'ranking', slug)
    if (!row) throw insightsPublicMissing()
    id = row.$id
    post = toInsightsPost(row)
  }
  else {
    const lookup = await findPublicInsightsPost(event, 'ranking', slug)
    if (lookup.kind === 'missing') throw insightsPublicMissing()
    if (lookup.kind === 'redirect') {
      const redirect: InsightsPublicRankingResponse = { kind: 'redirect', slug: lookup.slug }
      entryCache.set(slug, redirect)
      return redirect
    }
    id = lookup.hit.row.$id
    post = lookup.hit.post
  }

  const ranking = post.ranking
  if (!ranking) {
    logEvent('warn', 'insights.public_ranking_empty', { slug })
    throw insightsPublicMissing()
  }

  const rows = await loadInsightsBrandRowsByIds(event, ranking.entries.map(entry => entry.brandId))
  const brands: Record<string, { name: string, slug: string }> = {}
  for (const [rowId, row] of rows) {
    if (row.state !== 'published') continue
    brands[rowId] = { name: row.name, slug: row.slug }
  }

  const response: InsightsPublicRankingResponse = {
    kind: 'ranking',
    post: toInsightsPublicPost(id, post),
    ranking,
    brands,
    ...(preview ? { preview: true as const } : {}),
  }

  if (!preview) entryCache.set(slug, response)
  logEvent('info', 'insights.public_ranking', { slug, entries: ranking.entries.length })
  return response
})
