import type { H3Event } from 'h3'
import { POLL_VOTES_TABLE, POSTS_TABLE, POST_CATEGORIES_TABLE, POST_VOTES_TABLE, type CommunityPost, type PostCategory } from '../../shared/types/post'
import { softFail } from '../../../core/server/utils/softFail'

/**
 * Community-Export des posts-Layers (Vertrag: core/server/utils/communityExport.ts).
 *
 * Ausgegeben werden die INHALTE dieser Community — Beiträge und die vom Admin
 * gepflegte Kategorien-Struktur. Personenbezug trägt jede Zeile nur als
 * öffentlichen Anzeigenamen (`authorName`), so wie er auch am Beitrag steht.
 *
 * WAS BEWUSST FEHLT: `authorId` (eine Appwrite-Konto-Id ist kein Inhalt, sondern
 * ein Schlüssel auf einen Menschen), die Stimm-Zeilen aus `post_votes`/
 * `poll_votes` und die Aufruf-Zähler. Wer wie gestimmt hat, ist eine Aussage
 * über EINZELNE Mitglieder und nicht über die Community; deshalb bleibt davon
 * genau die anonyme Anzahl übrig. Auch `member_counters` und `user_badges`
 * stehen nicht drin — sie sind Zahlen über Menschen, nicht Inhalt.
 */
export async function postsCommunityExport(event: H3Event) {
  /**
   * `as: 'operator'` ist hier PFLICHT und keine Bequemlichkeit: geplante
   * (`scheduled`), von der Moderation ausgeblendete (`hidden`) und
   * soft-gelöschte Beiträge tragen Row-Permissions, die ein Session-Client
   * nicht sieht. Mit der Mitglieder-Klinke fehlte im Bündel genau das, was
   * niemand vermisst, weil es unsichtbar ist — und ein Archiv, das vollständig
   * AUSSIEHT und es nicht ist, ist schlimmer als ein Fehler. Die Datentür
   * scopet jede Abfrage weiterhin auf DIESE Community; mit dem Admin-Client ist
   * sie die einzige Grenze — dieselbe bewusste Abwägung, die auch die
   * Moderation trifft (Präzedenz: `seedWelcomePost.ts`,
   * `communityHasAuthoredPost`).
   *
   * `actor: 'member'` sagt, WER handelt: der Owner, also ein Mitglied dieser
   * Community. Der Export SCHREIBT nichts, die M13-Sperre kann damit gar nicht
   * greifen — den Handelnden trotzdem ehrlich zu benennen, hält die C1c-Regel
   * intakt (die Klinke ist Technik, `actor` ist Fachlichkeit).
   */
  const db = tenantDb(event, { as: 'operator', actor: 'member' })

  // Die HAUPT-Tabelle wird NICHT abgefangen: lassen sich die Beiträge nicht
  // lesen, muss der Export scheitern statt ein leeres Kapitel auszuliefern.
  const posts = await collectTenantRows<CommunityPost>(db, POSTS_TABLE)

  // Alles Weitere degradiert, statt den ganzen Lauf zu töten — eine Instanz,
  // auf der eine Migration noch aussteht, liefert dann eben ein Bündel ohne
  // Kategorien (Muster der GDPR-Contributors).
  const categories = await collectTenantRows<PostCategory>(db, POST_CATEGORIES_TABLE)
    .catch(softFail('posts:utils/postsCommunityExport:collectTenantRows', [] as PostCategory[]))
  const votes = await db.count(POST_VOTES_TABLE, []).catch(softFail('posts:utils/postsCommunityExport:count', 0))
  const pollVotes = await db.count(POLL_VOTES_TABLE, []).catch(softFail('posts:utils/postsCommunityExport:count#2', 0))

  /**
   * GELÖSCHTE BEITRÄGE ALS PLATZHALTER (SEC-032, 2026-11-15): Zeile mit Id,
   * Zeitpunkten, Typ, Status und Zählern — ohne Titel, Text, Namen und
   * Umfrage-Optionen. Platzhalter statt Weglassen, weil Kommentare im
   * comments-Kapitel per `targetId` auf den Beitrag zeigen können; ein
   * fehlender Eintrag sähe dort wie ein Lesefehler aus. Gelöscht hat der
   * Autor — er behält im Produkt die eigene Historie, ein Archiv des
   * BETREIBERS bekommt den Text deshalb nicht.
   */
  return {
    posts: posts.map(p => {
      const deleted = p.status === 'deleted'
      return {
        id: p.$id,
        createdAt: p.$createdAt,
        type: p.type,
        title: deleted ? null : p.title,
        body: deleted ? '' : p.body,
        status: p.status,
        authorName: deleted ? '' : p.authorName,
        publishedAt: p.publishedAt,
        scheduledAt: p.scheduledAt,
        editedAt: deleted ? null : p.editedAt,
        categoryId: p.categoryId,
        pinned: p.pinned,
        closed: p.closed,
        solved: p.solved,
        upvotes: p.upvotes,
        downvotes: p.downvotes,
        score: p.score,
        pollOptions: deleted ? null : p.pollOptions,
        pollEndsAt: p.pollEndsAt,
      }
    }),
    categories: categories.map(c => ({
      id: c.$id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      sortOrder: c.sortOrder,
      active: c.active,
    })),
    counts: {
      posts: posts.length,
      categories: categories.length,
      votes,
      pollVotes,
    },
  }
}
