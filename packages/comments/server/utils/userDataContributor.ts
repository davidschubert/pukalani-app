import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { COMMENTS_TABLE, COMMENT_REACTIONS_TABLE, VOTES_TABLE, type Comment, type CommentReaction, type CommentVote } from '../../shared/types/comment'
import { COMMENT_TOMBSTONE_DATA, commentTombstonePermissions } from './commentTombstone'

/**
 * GDPR-Contributor des comments-Layers (Vertrag: core/server/utils/userData.ts).
 *
 * Export: alle Kommentare + Votes des Users (vollständig paginiert).
 * Löschung: Kommentare werden zum TOMBSTONE anonymisiert (Row-Erasure —
 * `authorId/authorName/content` leer, `status: 'deleted'`), NICHT hart
 * gelöscht: Hard-Delete würde Threads zerreißen (parentId/rootId fremder
 * Antworten) und die Antworten ANDERER User sind deren Daten. Der leere
 * Sentinel wird von der UI als „[gelöscht]" gerendert. Votes werden hart
 * gelöscht; die denormalisierten Zähler bleiben (Aggregate ohne
 * Personenbezug, Selbstheilung beim nächsten Vote). Plan §4.4, E1/E2.
 *
 * WAS HIER BEWUSST NICHT DRINSTEHT: `guest_authors` (Audit-Befund 2026-08-01,
 * erledigt mit F18 am 2026-08-02).
 *
 * Die Tabelle trug Name, E-Mail und IP-Hash der Gast-Kommentare — und genau die
 * waren über diesen Vertrag NICHT erreichbar: er ist auf eine `userId`
 * geschlüsselt, und ein Gast hat keine. Auch der Umweg „Kommentare des Users
 * einsammeln und die zugehörigen Kontaktzeilen mitnehmen" trug nicht:
 * Gast-Kommentare haben `authorId: ''`, sie gehören per Definition keinem
 * Konto. Bliebe die Adresse als Schlüssel — dafür hatte `guest_authors` keinen
 * Index, und „wer sich später mit derselben Adresse anmeldet, ist derselbe
 * Mensch" wäre eine Annahme, keine Tatsache.
 *
 * Die erste Antwort darauf war eine FRIST (90 Tage). Die zweite und endgültige
 * ist, die Daten gar nicht mehr zu erheben: seit F18 nimmt `guest.post.ts` von
 * einem Gast nur noch den Anzeigenamen entgegen, der ohnehin öffentlich am
 * Kommentar steht. Damit hat dieser Vertrag keine Lücke mehr zu erklären —
 * es gibt keine kontolose Kontaktspur, die er auslassen könnte. Der Sweep
 * (`guestAuthorPrune.ts`) räumt nur noch den Altbestand ab.
 */

export function commentsExportUserData(event: H3Event, userId: string) {
  return exportData(event, userId)
}

async function exportData(event: H3Event, userId: string) {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const [comments, votes, reactions] = await Promise.all([
    listAllRows<Comment>(tablesDB, databaseId, COMMENTS_TABLE, [Query.equal('authorId', userId)]),
    listAllRows<CommentVote>(tablesDB, databaseId, VOTES_TABLE, [Query.equal('userId', userId)]),
    listAllRows<CommentReaction>(tablesDB, databaseId, COMMENT_REACTIONS_TABLE, [Query.equal('userId', userId)]),
  ])

  return {
    comments: comments.map(r => ({
      id: r.$id,
      createdAt: r.$createdAt,
      content: r.content,
      targetType: r.targetType,
      targetId: r.targetId,
      status: r.status,
    })),
    votes: votes.map(r => ({
      commentId: r.commentId,
      value: r.value,
      createdAt: r.$createdAt,
    })),
    /**
     * Emoji-Reaktionen auf Antworten (F57, comments-019). Exportiert wird der
     * SCHLÜSSEL ('tada'), weil genau der gespeichert ist — ein Zeichen wäre
     * hier eine Übersetzung und keine Auskunft.
     */
    reactions: reactions.map(r => ({
      commentId: r.targetId,
      reaction: r.reaction,
      createdAt: r.$createdAt,
    })),
  }
}

export async function commentsDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  // Kommentare → Tombstone (Row-Erasure). Nach dem Update matcht die Row den
  // authorId-Filter nicht mehr → Re-Run findet leere Seiten (idempotent).
  const comments = await listAllRows<Comment>(tablesDB, databaseId, COMMENTS_TABLE, [Query.equal('authorId', userId)])
  for (const row of comments) {
    await tablesDB.updateRow({
      databaseId,
      tableId: COMMENTS_TABLE,
      rowId: row.$id,
      // DERSELBE Grabstein wie beim eigenen Löschen (SEC-032,
      // `commentTombstone.ts`) — seit 2026-11-15 mit leerem
      // Übersetzungs-Cache: vorher blieb hier der Text in anderen Sprachen
      // stehen, nachdem das Original geleert war.
      data: { ...COMMENT_TOMBSTONE_DATA },
      // Owner-Permissions (update/delete des Ex-Users) abräumen; das
      // LESERECHT der Zeile bleibt unangetastet — der Tombstone ist so sichtbar
      // wie der Kommentar vorher war, enthält aber keine PII.
      //
      // C18: bewusst FILTERN statt read(any) zu setzen. Diese Löschung läuft
      // mandantenübergreifend (GDPR-Orchestrierung, außerhalb der Datentür) und
      // fasst Zeilen aus MEHREREN Communities an — ein festes read(any) hätte
      // die Tombstones einer geschlossenen Community öffentlich gemacht, und
      // ausgeblendete Kommentare (ohne Leserecht) wieder lesbar.
      permissions: commentTombstonePermissions(row.$permissions, userId),
    })
    // Der Feed-Eintrag mit dem Text-Schnappschuss. Best-effort (Core-Vertrag,
    // wirft nie): die Feed-Einträge dieses Menschen räumt zusätzlich der
    // system-Contributor über `actorId` STRIKT ab — hier geht es nur darum,
    // dass der Schnappschuss nicht vom Ausgang jenes Laufs abhängt.
    await removeActivitiesForObject(event, { objectType: 'comment', objectId: row.$id })
  }

  // Votes → Hard-Delete
  const votes = await listAllRows<CommentVote>(tablesDB, databaseId, VOTES_TABLE, [Query.equal('userId', userId)])
  for (const row of votes) {
    await tablesDB.deleteRow({ databaseId, tableId: VOTES_TABLE, rowId: row.$id })
  }

  /**
   * Reaktionen → Hard-Delete, wie die Stimmen und aus demselben Grund: die
   * Zeile IST der Personenbezug (wer hat worauf reagiert), sie trägt nichts,
   * was ohne die Person noch einen Sinn hätte. Ein Tombstone wie beim
   * Kommentar wäre hier sinnlos — er zerrisse keinen Thread, er stünde nur als
   * anonymer Chip herum.
   *
   * Die Anzeige heilt sich von selbst: die Leiste zählt bei jedem Aufbau neu
   * aus den vorhandenen Zeilen (es gibt keine denormalisierte Zähler-Spalte),
   * also verschwindet der Chip mit der letzten Zeile. `reactionsGiven` in
   * `member_counters` gehört dem posts-Layer und wird dort mit derselben
   * Löschung abgeräumt.
   */
  const reactions = await listAllRows<CommentReaction>(tablesDB, databaseId, COMMENT_REACTIONS_TABLE, [Query.equal('userId', userId)])
  for (const row of reactions) {
    await tablesDB.deleteRow({ databaseId, tableId: COMMENT_REACTIONS_TABLE, rowId: row.$id })
  }

  return { deleted: votes.length + reactions.length, anonymized: comments.length }
}
