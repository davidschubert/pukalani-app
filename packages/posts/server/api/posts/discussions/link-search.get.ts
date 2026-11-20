import { Query } from 'node-appwrite'
import { z } from 'zod'
import { topicSlug } from '../../../../shared/discussionUrl'
import { topicLinkToken } from '../../../../shared/topicLinks'
import { POSTS_TABLE, type CommunityPost, type TopicLinkSuggestion } from '../../../../shared/types/post'
import { topicTitle } from '../../../utils/discussions'
import { softFail } from '../../../../../core/server/utils/softFail'

/**
 * DIE THEMEN-SUCHE FÜR DAS `#`-MENÜ DER SCHREIBFLÄCHE (F57).
 *
 * `GET /api/posts/discussions/link-search?q=…`
 *
 * Gegenstück zu `/api/handles/search`: dieselbe Bauform, dieselbe Antwortform
 * (`{ id, label }[]`, weil `UEditorMentionMenu` genau das erwartet) — nur sucht
 * dieses Menü Themen statt Menschen. Der `id`-Wert ist hier bewusst KEINE
 * Row-Id, sondern der fertige TOKEN (`#<id>-<deko>`): der Knoten-Serialisierer
 * der Schreibfläche gibt `attrs.id` unverändert in den Text, und was dort
 * landet, muss die Erkennungs-Regel wiederfinden.
 *
 * ── DAS MITGLIEDER-GATE IST NICHT OPTIONAL ────────────────────────────────
 * `requireCommunityMembership` wirft 401 ohne Sitzung und 403 für Fremde
 * (Silo und Single-Tenant lassen jeden durch). Ohne dieses Gate wäre die Route
 * eine Titelliste jeder Community für jeden Angemeldeten — genau der Fehler,
 * der bei AH-7 an der Handle-Suche aufgefallen ist. Die Datentür scopet
 * zusätzlich auf die Community des Hosts; beides zusammen, nicht eines davon.
 *
 * ── WAS GEFUNDEN WIRD ─────────────────────────────────────────────────────
 * Nur THEMEN: veröffentlicht und mit Kategorie. Ein Entwurf, ein geplanter,
 * ein verborgener oder gelöschter Beitrag und jeder kategorielose
 * Feed-Beitrag (inklusive des Willkommens-Beitrags) stehen nicht im Menü —
 * dieselben vier Bedingungen, die auch beim AUFLÖSEN gelten. Ein Menü, das
 * etwas anbietet, das der Renderer danach nicht verlinkt, wäre eine Falle.
 *
 * ── OHNE SUCHBEGRIFF DIE JÜNGSTEN ─────────────────────────────────────────
 * Das Menü öffnet sich beim Tippen von `#`, also zunächst ohne Begriff. Statt
 * einer leeren Liste kommen die zuletzt aktiven Themen — das ist fast immer
 * das, worauf jemand verweisen will.
 *
 * Gesucht wird über den Fulltext-Index `idx_title_search` (Migration
 * posts-008). Beiträge, deren Frage nur im `body` steht (Umfragen, Fragen —
 * `title` ist bewusst optional), sind darüber nicht auffindbar; sie erscheinen
 * in der Liste ohne Suchbegriff. Eine Volltextsuche über den BODY wäre ein
 * zweiter Index auf einer 10.000-Zeichen-Spalte und ist das hier nicht wert.
 */

/** Kurze Liste — das Menü zeigt ohnehin nur eine Handvoll. */
const LIMIT = 8

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
})

export default defineEventHandler(async (event): Promise<TopicLinkSuggestion[]> => {
  // Produkt-Gate wie an jedem posts-Einstieg (404 wie eine Datentür).
  requirePlanProduct(event, 'posts')

  // Das Gate: 401 ohne Sitzung, 403 für Fremde.
  await requireCommunityMembership(event)

  const { q } = await getValidatedQuery(event, querySchema.parse)
  const term = (q ?? '').trim()

  const db = tenantDb(event)

  const { rows } = await db.list<CommunityPost>(POSTS_TABLE, [
    Query.equal('status', 'published'),
    ...(term ? [Query.search('title', term)] : []),
    Query.orderDesc('lastActivityAt'),
    // Reserve für den Kategorie-Filter, der erst nach der Abfrage greift.
    Query.limit(LIMIT * 4),
  ]).catch(softFail('posts:api/posts/discussions/link-search.get:list', { rows: [] as CommunityPost[] }))

  return rows
    .filter(row => Boolean(row.categoryId))
    .slice(0, LIMIT)
    .map(row => ({
      id: topicLinkToken(row.$id, topicSlug(row.title, row.body)),
      label: topicTitle(row),
    }))
})
