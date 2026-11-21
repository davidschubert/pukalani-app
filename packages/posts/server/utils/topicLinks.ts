import type { H3Event } from 'h3'
import { Query } from 'node-appwrite'
import { topicSlug, discussionTopicPath } from '../../shared/discussionUrl'
import {
  MAX_TOPIC_LINKS_PER_CONTENT,
  extractTopicLinkCandidates,
  topicLinkTokensFor,
} from '../../shared/topicLinks'
import {
  DISCUSSION_LINKS_TABLE,
  POSTS_TABLE,
  type CommunityPost,
  type DiscussionLink,
  type TopicBacklink,
  type TopicLink,
} from '../../shared/types/post'
import { listCategories, topicTitle } from './discussions'
import { softFail } from '../../../core/server/utils/softFail'

/**
 * DIE THEMEN-VERLINKUNG, SERVERSEITIG (F57).
 *
 * Drei Aufgaben, streng getrennt:
 *  - `topicLinksForPosts` — beim LESEN: Verweise aus dem TEXT auflösen.
 *  - `syncTopicLinks`     — beim SCHREIBEN: den Rückverweis-Index nachziehen.
 *  - `backlinksForTopic`  — beim ANZEIGEN eines Ziels: „wer zeigt auf mich?".
 *
 * ── DER TEXT IST DIE WAHRHEIT, DIE TABELLE IST DER INDEX ──────────────────
 * `topicLinksForPosts` liest `discussion_links` NICHT. Es parst den Beitrag
 * und schlägt die gefundenen Ids nach — genau wie `mentionsForPosts` es mit
 * `@handle` tut. Das ist der Grund, warum Text und Anzeige nie auseinander
 * laufen können: es gibt keinen zweiten Stand, der veralten könnte. Die
 * Tabelle beantwortet ausschließlich die Gegenrichtung, die im Text nicht
 * steht.
 *
 * ── WAS EIN GÜLTIGES ZIEL IST ─────────────────────────────────────────────
 * Vier Bedingungen, alle vier fail-closed:
 *  1. Die Zeile gehört DIESER Community — das erledigt die Datentür, nicht
 *     dieser Code. Eine Id aus einer fremden Community wird schlicht nicht
 *     gefunden.
 *  2. `status === 'published'` — Entwürfe, geplante, verborgene und gelöschte
 *     Beiträge sind keine Ziele.
 *  3. `categoryId` ist gesetzt — ein Verweis zeigt auf ein THEMA, nicht auf
 *     einen Feed-Beitrag. (Das schließt auch den Willkommens-Beitrag aus.)
 *  4. Die Kategorie existiert noch — ohne sie gäbe es keinen Pfad.
 *
 * Alles, was durchfällt, bleibt gewöhnlicher Text. Ein toter Verweis ist kein
 * Fehler und wird nirgends gemeldet.
 */

/** Deckel für die Rückverweis-Liste eines Themas — die Anzeige ist eine Zeile,
 *  keine Seite. Wer mehr hat, sieht die jüngsten. */
export const MAX_TOPIC_BACKLINKS = 20

/**
 * Wie viele Ziel-Ids in EINE Abfrage passen.
 *
 * Keine Politik, sondern Appwrite: `Query.equal` nimmt hoechstens 100 Werte.
 * Dieselbe Stapelung fahren die Reaktionen (`commentReactions.ts`) und die
 * eigenen Stimmen — und hier ist sie nicht theoretisch: eine Feed-Seite hat 25
 * Beitraege, jeder darf `MAX_TOPIC_LINKS_PER_CONTENT` Verweise tragen, das sind
 * bis zu 250 Ids in EINER Auflösung. Ohne Stapel antwortet Appwrite mit 400,
 * der fail-soft-Zweig unten macht daraus eine leere Menge — und ALLE `#`-Links
 * der Seite fallen still auf Rohtext zurück.
 */
const TOPIC_ID_CHUNK = 100

/**
 * ZWEI TÜREN, ZWEI FRAGEN — und die Trennung ist wichtig.
 *
 * Die INDEX-Zeilen laufen über die Operator-Klinke, die ZIELE über die
 * Mitglieds-Tür. Drei Gründe, jeder für sich ausreichend:
 *
 *  1. **Eine Index-Zeile gehört keinem Menschen.** Ohne `ownerUserId` vergibt
 *     `tenantDb().create` nur Leserechte — der Session-Client könnte seine
 *     eigene Zeile also nie wieder löschen, und das Ersetzen beim Bearbeiten
 *     wäre still wirkungslos (am 2026-08-14 im Beweis genau so gemessen: der
 *     alte Rückverweis blieb am Ziel stehen). Einen `ownerUserId` zu erfinden
 *     wäre die falsche Kur: die Zeile ist abgeleitete Systemdaten.
 *  2. **`actor: 'operator'`, damit eine Systemzeile niemanden beitreten
 *     lässt** (A5 hängt an `create` mit Klinke `member`) und die M13-Sperre
 *     nicht ein zweites Mal greift. Beides ist am BEITRAG bereits passiert —
 *     der ist durch die Mitglieds-Tür gegangen, bevor diese Funktion läuft.
 *  3. **Die Sichtbarkeit hängt trotzdem nicht am Operator**: welche Ziele es
 *     gibt und welche Quellen angezeigt werden, entscheidet ausschließlich
 *     `resolveTopics` — und das liest die Beiträge durch die MITGLIEDS-Tür.
 *     Wer ein Thema nicht sehen darf, kann weder darauf verweisen noch als
 *     Verweis darauf auftauchen.
 */
function linkDb(event: H3Event) {
  return tenantDb(event, { as: 'operator', actor: 'operator' })
}

/** Ein Ziel, das die Prüfung bestanden hat. */
interface ResolvedTopic {
  id: string
  title: string
  href: string
}

/**
 * Viele Ids, WENIGE Abfragen — plus EINE für die Kategorien.
 *
 * Der naheliegende Weg (je Verweis eine `get`-Abfrage) wäre bei einer
 * Feed-Seite mit 25 Beiträgen und je zwei Verweisen 50 Abfragen. Deshalb
 * derselbe Bündel-Schnitt wie bei `mentionsForPosts` — GESTAPELT zu je
 * `TOPIC_ID_CHUNK`, weil die Bündelung sonst genau dann bricht, wenn sie sich
 * lohnt (Begründung an der Konstante).
 *
 * ── DER FEHLSCHLAG BLEIBT FAIL-SOFT, ABER NICHT MEHR STUMM ────────────────
 * Ein toter Verweis ist kein Fehler; eine gescheiterte ABFRAGE schon. Vorher
 * verschluckte der `.catch` beides ununterscheidbar — die Seite sah heil aus,
 * nur ohne Links, und im Protokoll stand nichts. Jetzt wird der Stapel EINMAL
 * gemeldet (`logEvent`, wie in `applyMemberCounterEvents`) und die Auflösung
 * läuft weiter: der Leser verliert Verweise, nie den Beitrag.
 */
async function resolveTopics(
  event: H3Event,
  ids: string[],
  options: { strict?: boolean } = {},
): Promise<Map<string, ResolvedTopic>> {
  const resolved = new Map<string, ResolvedTopic>()
  if (ids.length === 0) return resolved

  const db = tenantDb(event)

  const rows: CommunityPost[] = []
  for (let i = 0; i < ids.length; i += TOPIC_ID_CHUNK) {
    const batch = ids.slice(i, i + TOPIC_ID_CHUNK)
    const page = await db.list<CommunityPost>(POSTS_TABLE, [
      Query.equal('$id', batch),
      Query.equal('status', 'published'),
      Query.limit(batch.length),
    ]).catch((error: unknown) => {
      if (options.strict) throw error
      logEvent('warn', 'posts.topic_links_resolve_failed', {
        ids: batch.length,
        message: error instanceof Error ? error.message : String(error),
      })
      return { rows: [] as CommunityPost[] }
    })
    rows.push(...page.rows)
  }

  const topics = rows.filter(row => Boolean(row.categoryId))
  if (topics.length === 0) return resolved

  const categories = await listCategories(db).catch((error: unknown) => {
    if (options.strict) throw error
    return softFail('posts:utils/topicLinks:listCategories', [] as Awaited<ReturnType<typeof listCategories>>)(error)
  })
  const slugById = new Map(categories.map(category => [category.$id, category.slug]))

  for (const row of topics) {
    const categorySlug = slugById.get(row.categoryId)
    if (!categorySlug) continue
    const slug = topicSlug(row.title, row.body)
    resolved.set(row.$id, {
      id: row.$id,
      title: topicTitle(row),
      href: discussionTopicPath(categorySlug, row.$id, slug),
    })
  }

  return resolved
}

/**
 * Die Verweise MEHRERER Beiträge in einem Rutsch — Map von Beitrags-Id auf
 * die fertigen Link-Stücke für `MarkdownContent`.
 *
 * Der `token` ist WÖRTLICH die Schreibweise aus dem Text; der Renderer sucht
 * exakt diese Zeichenkette (`core/shared/contentLinks.ts`). Steht dieselbe Id
 * zweimal mit unterschiedlicher Deko im Text, entstehen zwei Einträge mit
 * demselben Ziel — sonst bliebe der zweite als Rohtext stehen.
 */
export async function topicLinksForPosts(
  event: H3Event,
  posts: Array<{ $id: string, body: string }>,
): Promise<Map<string, TopicLink[]>> {
  const result = new Map<string, TopicLink[]>()

  const tokensByPost = new Map<string, Map<string, string[]>>()
  const wanted = new Set<string>()

  for (const post of posts) {
    const tokens = topicLinkTokensFor(post.body)
    if (tokens.size === 0) continue
    tokensByPost.set(post.$id, tokens)
    for (const id of tokens.keys()) wanted.add(id)
  }

  if (wanted.size === 0) return result

  const topics = await resolveTopics(event, [...wanted])

  for (const [postId, tokens] of tokensByPost) {
    const links: TopicLink[] = []
    for (const [id, written] of tokens) {
      const topic = topics.get(id)
      if (!topic) continue
      for (const token of written) {
        links.push({ token, href: topic.href, label: topic.title })
      }
    }
    if (links.length > 0) result.set(postId, links)
  }

  return result
}

/** Bequemlichkeit für die Einzel-Ansicht eines Themas. */
export async function topicLinksForPost(
  event: H3Event,
  post: { $id: string, body: string },
): Promise<TopicLink[]> {
  const map = await topicLinksForPosts(event, [post])
  return map.get(post.$id) ?? []
}

/**
 * Den Rückverweis-Index einer QUELLE auf den Stand ihres Textes bringen.
 *
 * ERSETZEN, nicht anhängen: entfernt jemand einen Verweis beim Bearbeiten,
 * muss der Rückverweis am Ziel verschwinden. Das ist der ganze Grund, warum
 * hier ein Diff steht und kein schlichtes Anlegen.
 *
 * FAIL-SOFT als Ganzes (der Aufrufer fängt), aber die Rückgabe ist ehrlich:
 * `added` zählt die WIRKLICH neu angelegten Zeilen und ist die Grundlage für
 * den Zähler `linksMade` — ein misslungener Schreibvorgang verleiht also kein
 * Abzeichen.
 *
 * EIN SELBSTVERWEIS WIRD VERWORFEN: ein Thema, das seine eigene Id nennt,
 * stünde sonst in seiner eigenen „Verlinkt von"-Zeile.
 */
export async function syncTopicLinks(
  event: H3Event,
  source: { $id: string, body: string },
): Promise<{ added: number, removed: number }> {
  const db = linkDb(event)

  const candidates = extractTopicLinkCandidates(source.body, MAX_TOPIC_LINKS_PER_CONTENT)
  const wanted = candidates.map(candidate => candidate.id).filter(id => id !== source.$id)

  /**
   * STRENG LESEN, WEIL HIER GELÖSCHT WIRD (Bahn 2, Q13-Stelle 2). Beim
   * ANZEIGEN darf ein Lesefehler Verweise kosten, nie den Beitrag. Hier aber
   * wird der Index ERSETZT: ein leeres Ergebnis aus einem Lesefehler (Beiträge
   * oder Kategorien) hieß „kein Ziel mehr gültig" — und JEDER vorhandene
   * Rückverweis der Quelle wurde entfernt. Jetzt wirft die Auflösung, der
   * Aufrufer fängt (fail-soft als Ganzes) und der alte Index bleibt stehen.
   * Dasselbe für die Liste der vorhandenen Zeilen: ohne sie wüsste der Abgleich
   * nicht, was schon steht.
   */
  const topics = wanted.length > 0 ? await resolveTopics(event, wanted, { strict: true }) : new Map<string, ResolvedTopic>()
  const targets = new Set([...topics.keys()])

  const { rows: existing } = await db.list<DiscussionLink>(DISCUSSION_LINKS_TABLE, [
    Query.equal('sourceId', source.$id),
    Query.limit(MAX_TOPIC_LINKS_PER_CONTENT * 2),
  ])

  const had = new Set(existing.map(row => row.targetId))

  let removed = 0
  for (const row of existing) {
    if (targets.has(row.targetId)) continue
    await db.remove(DISCUSSION_LINKS_TABLE, row.$id).then(() => { removed++ }).catch(softFail('posts:utils/topicLinks:remove', undefined))
  }

  let added = 0
  for (const targetId of targets) {
    if (had.has(targetId)) continue
    // Das Publikum ist dasselbe wie das des Beitrags: wer die Community lesen
    // darf, darf auch den Rückverweis sehen. Die Tür setzt es.
    const created = await db.create<DiscussionLink>(DISCUSSION_LINKS_TABLE, {
      sourceId: source.$id,
      targetId,
    }).then(() => true).catch(softFail('posts:utils/topicLinks:create', false, { quiet: [409] }))
    if (created) added++
  }

  return { added, removed }
}

/**
 * „Verlinkt von …" — die Themen, die auf DIESES Thema zeigen.
 *
 * Zwei Abfragen, nie mehr: die Index-Zeilen, dann die Quell-Beiträge gebündelt.
 * Gefiltert wird beim ZWEITEN Schritt — eine Index-Zeile, deren Quelle
 * inzwischen gelöscht, verborgen oder aus ihrer Kategorie gefallen ist,
 * verschwindet damit von selbst aus der Anzeige (Begründung im Kopf von
 * Migration posts-020: es gibt bewusst keinen Aufräum-Pfad).
 */
export async function backlinksForTopic(event: H3Event, targetId: string): Promise<TopicBacklink[]> {
  const db = linkDb(event)

  const { rows } = await db.list<DiscussionLink>(DISCUSSION_LINKS_TABLE, [
    Query.equal('targetId', targetId),
    Query.orderDesc('$createdAt'),
    Query.limit(MAX_TOPIC_BACKLINKS),
  ]).catch(softFail('posts:utils/topicLinks:list#2', { rows: [] as DiscussionLink[] }))

  const sourceIds = [...new Set(rows.map(row => row.sourceId))].filter(id => id !== targetId)
  if (sourceIds.length === 0) return []

  const sources = await resolveTopics(event, sourceIds)

  // Reihenfolge des Index (jüngster Verweis zuerst), nicht die der Auflösung.
  const seen = new Set<string>()
  const backlinks: TopicBacklink[] = []
  for (const row of rows) {
    const topic = sources.get(row.sourceId)
    if (!topic || seen.has(topic.id)) continue
    seen.add(topic.id)
    backlinks.push({ $id: topic.id, title: topic.title, path: topic.href })
  }

  return backlinks
}
