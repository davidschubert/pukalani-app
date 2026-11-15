import type { H3Event } from 'h3'
import { COMMENTS_TABLE, VOTES_TABLE, type Comment } from '../../shared/types/comment'

/**
 * Community-Export des comments-Layers (Vertrag: core/server/utils/communityExport.ts).
 *
 * Ausgegeben wird der Gesprächsverlauf dieser Community: jeder Kommentar mit
 * seinem Text, seinem Platz im Baum (`parentId`/`rootId`/`depth`), seinem Ziel
 * und dem öffentlichen Anzeigenamen des Autors — nicht mehr.
 *
 * KEIN `authorId`: eine Appwrite-Konto-Id gehört keinem Bündel, das die
 * Community als Ganzes beschreibt. UND KEIN BLICK IN `guest_authors`: die
 * Tabelle trägt (nur noch als Bestand, seit F18 schreibt niemand mehr hinein)
 * E-Mail und IP-Hash von Gast-Kommentatoren. Das sind Kontaktdaten fremder
 * Menschen, kein Community-Inhalt — der Gast steht hier mit genau dem Namen,
 * der ohnehin öffentlich an seinem Kommentar hängt (`authorKind: 'guest'`).
 * Die Stimmen aus `comment_votes` erscheinen als anonyme Anzahl: wer wie
 * gestimmt hat, ist eine Aussage über einzelne Mitglieder.
 */
export async function commentsCommunityExport(event: H3Event) {
  /**
   * Warum die Betreiber-Klinke: ausgeblendete (`hidden`) Kommentare verlieren
   * beim zweiphasigen Hide ihr `read(any)` — ein Session-Client bekäme sie
   * schlicht nicht zu sehen, und das Bündel verlöre stillschweigend genau die
   * Zeilen, um die es im Streitfall geht. Lieber die einzige Grenze bewusst auf
   * die Datentür legen (sie hängt den Mandanten-Filter an JEDE Abfrage) als ein
   * Archiv ausliefern, das vollständig aussieht und Löcher hat. Dieselbe
   * Abwägung trifft die Moderation dieses Layers ohnehin täglich (Präzedenz:
   * `packages/posts/server/utils/seedWelcomePost.ts`).
   *
   * `actor: 'member'` beschreibt den Handelnden wahrheitsgemäß — es ist der
   * Owner, also ein Mitglied. Gelesen wird nur, nie geschrieben; die M13-Sperre
   * kommt hier also gar nicht ins Spiel. Die ehrliche Angabe hält trotzdem die
   * C1c-Trennung „Klinke = Technik, actor = Fachlichkeit" ein.
   */
  const db = tenantDb(event, { as: 'operator', actor: 'member' })

  // Ohne Kommentare gibt es kein comments-Kapitel — hier wird NICHT abgefangen:
  // ein Lesefehler muss den ganzen Export zum Scheitern bringen.
  const comments = await collectTenantRows<Comment>(db, COMMENTS_TABLE)

  // Die Stimmen sind Beiwerk: steht auf einer Instanz noch eine Migration aus,
  // fehlt lieber die Zahl als das ganze Bündel.
  const votes = await db.count(VOTES_TABLE, []).catch(() => 0)

  /**
   * GELÖSCHTE KOMMENTARE ALS PLATZHALTER (SEC-032, 2026-11-15): ohne Text,
   * Namen und Bearbeitungsmarke, aber MIT Platz im Baum. Weglassen hätte die
   * Antworten darunter im Bündel zu Waisen gemacht (ihr `parentId` zeigte ins
   * Leere) — die Oberfläche zeigt denselben Platzhalter. Neu gelöschte Zeilen
   * sind ohnehin leer; das hier deckt den Bestand von davor ab, dessen Text
   * sonst im Archiv eines Betreibers wieder auftauchte.
   */
  return {
    comments: comments.map(exportedComment),
    counts: {
      comments: comments.length,
      votes,
    },
  }
}

function exportedComment(c: Comment) {
  const deleted = c.status === 'deleted'
  return {
    id: c.$id,
    createdAt: c.$createdAt,
    editedAt: deleted ? null : c.editedAt,
    content: deleted ? '' : c.content,
    authorName: deleted ? '' : c.authorName,
    authorKind: deleted ? undefined : c.authorKind,
    targetType: c.targetType,
    targetId: c.targetId,
    targetUrl: c.targetUrl,
    parentId: c.parentId,
    rootId: c.rootId,
    depth: c.depth,
    status: c.status,
    upvotes: c.upvotes,
    downvotes: c.downvotes,
    score: c.score,
  }
}
