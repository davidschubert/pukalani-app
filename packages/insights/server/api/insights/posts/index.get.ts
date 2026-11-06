import type { InsightsPostsListResponse } from '../../../../shared/types/insightsApi'

/**
 * DIE REDAKTIONSLISTE (`insights.manage`, §9.4).
 *
 * Sie zeigt ALLE Zustände — auch die Entwürfe, gerade die Entwürfe: das ist
 * die Arbeitsliste, nicht das Journal. Was öffentlich sichtbar wird,
 * entscheidet die LESEROUTE (I3) über `state` und `translationReviewed`; hier
 * gibt es nichts zu filtern.
 *
 * OHNE FLIESSTEXT (s. `InsightsPostListItem`): zwanzig Zeilen mit je zwei
 * vollständigen Artikel-Fassungen wären ein Megabyte für eine Tabelle.
 *
 * KEINE eigene Drossel: die Route hängt an einer Session MIT `insights.manage`,
 * und der Kreis dieser Sessions ist der Betreiber selbst — dieselbe Rechnung
 * wie bei der Warteliste des brand-Layers.
 */
export default defineEventHandler(async (event): Promise<InsightsPostsListResponse> => {
  requirePermission(event, 'insights.manage')

  const rows = await listInsightsPostRows(event, INSIGHTS_POSTS_LIMIT)
  return { posts: rows.map(toInsightsPostListItem) }
})
