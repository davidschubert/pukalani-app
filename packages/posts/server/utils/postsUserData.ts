import { Permission, Query, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import { communityModeratorLabel } from '../../../core/shared/communityModeratorLabel'
import { DISCUSSION_REACTIONS_TABLE, MEMBER_COUNTERS_TABLE, POLL_VOTES_TABLE, POSTS_TABLE, POST_VOTES_TABLE, USER_BADGES_TABLE, type CommunityPost, type DiscussionReaction, type MemberCounters, type PollVote, type PostVote, type UserBadge } from '../../shared/types/post'

/**
 * GDPR-Contributor des posts-Layers (Vertrag: core/server/utils/userData.ts).
 *
 * Posts → TOMBSTONE statt Hard-Delete (wie comments): eine Poll mit fremden
 * Stimmen oder eine Frage mit Antworten ist Gesprächskontext anderer — Inhalt,
 * Titel und Autor werden geblankt, status 'deleted', Leserecht entzogen.
 * poll_votes → Hard-Delete (reine Verhaltens-Daten des Users).
 *
 * BEWUSST AUSSERHALB der Datentür (tenantDb): GDPR ist user-zentriert und
 * per Definition mandantenübergreifend — die Daten eines Users müssen über
 * ALLE Communities exportiert/gelöscht werden (CLAUDE.md, Ausnahmenliste).
 */

/**
 * Leserecht eines GRABSTEINS — je Zeile aus IHRER Community abgeleitet.
 *
 * Genau dieselbe Rechnung wie `tenantReadRolesFor(tenant, 'moderators')`, aber
 * eben NICHT über `useTenant(event)`: dieser Lauf geht über alle Communities
 * des Users, also gibt es keinen „Mandanten dieses Requests", dem man folgen
 * dürfte. Der aktuelle Host würde sonst sein Moderations-Label auf die
 * Grabsteine FREMDER Communities stempeln.
 *
 * Fällt eine Zeile ohne `communityId` an (Silo, Bestand vor der Migration),
 * gelten die globalen Betreiber-Rollen — dort IST das Projekt die Grenze.
 */
function tombstonePermissions(post: CommunityPost): string[] {
  const communityId = (post as { communityId?: unknown }).communityId
  const label = typeof communityId === 'string' ? communityModeratorLabel(communityId) : null
  if (label) return [Permission.read(Role.label(label))]
  return [Permission.read(Role.label('admin')), Permission.read(Role.label('moderator'))]
}
export async function postsExportUserData(event: H3Event, userId: string) {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const posts = await listAllRows<CommunityPost>(tablesDB, databaseId, POSTS_TABLE, [Query.equal('authorId', userId)])
  const votes = await listAllRows<PollVote>(tablesDB, databaseId, POLL_VOTES_TABLE, [Query.equal('userId', userId)])
  // Degradiert auf leer, solange Migration 003 auf einer Instanz aussteht —
  // und NUR dann (SEC-026, Teil 2): „degradiert" heisst überall in dieser
  // Datei „die Tabelle fehlt" (`listAllRowsIfTableExists`). Vorher schluckte
  // ein `catch` auf leer auch jeden 500, und Export wie Löschung meldeten
  // „vollständig", obwohl sie nichts gelesen hatten.
  const postVotes = await listAllRowsIfTableExists<PostVote>(tablesDB, databaseId, POST_VOTES_TABLE, [Query.equal('userId', userId)])
  // Degradiert auf leer, solange posts-013 auf einer Instanz aussteht.
  const counters = await listAllRowsIfTableExists<MemberCounters>(tablesDB, databaseId, MEMBER_COUNTERS_TABLE, [Query.equal('userId', userId)])
  // Abzeichen fehlten seit Stufe 4 in der Auskunft (Nebenbefund beim
  // Zähler-Bau, 2026-08-04) — sie sind Aussagen ÜBER diesen Menschen und
  // gehören hinein. Degradiert auf leer, solange posts-012 aussteht.
  const badges = await listAllRowsIfTableExists<UserBadge>(tablesDB, databaseId, USER_BADGES_TABLE, [Query.equal('userId', userId)])
  // F57: abgegebene Emoji-Reaktionen sind Verhaltens-Daten dieses Menschen —
  // dieselbe Sorte wie eine Stimme. Degradiert auf leer, solange posts-017
  // auf einer Instanz aussteht.
  const reactions = await listAllRowsIfTableExists<DiscussionReaction>(tablesDB, databaseId, DISCUSSION_REACTIONS_TABLE, [Query.equal('userId', userId)])

  return {
    posts: posts.map(p => ({
      type: p.type, title: p.title, body: p.body, status: p.status,
      scheduledAt: p.scheduledAt, publishedAt: p.publishedAt,
      pollOptions: p.pollOptions, createdAt: p.$createdAt,
    })),
    pollVotes: votes.map(v => ({ postId: v.postId, optionIndex: v.optionIndex, createdAt: v.$createdAt })),
    postVotes: postVotes.map(v => ({ postId: v.postId, value: v.value, createdAt: v.$createdAt })),
    // F1: die mitschreibenden Zähler sind Zahlen ÜBER einen Menschen und
    // gehören deshalb in seine Auskunft — je Community eine Zeile.
    counters: counters.map(c => ({
      topicsCreated: c.topicsCreated, repliesCreated: c.repliesCreated,
      upvotesGiven: c.upvotesGiven, upvotesReceived: c.upvotesReceived,
      edits: c.edits, createdAt: c.$createdAt,
      // F1 Teilpaket 3: die Vertrauensstufe steht in DERSELBEN Zeile und ist
      // erst recht eine Aussage über diesen Menschen — sie entscheidet, was er
      // hier darf. Beide Hälften getrennt, weil die Auskunft sonst nicht sagen
      // könnte, was erarbeitet und was ernannt ist. Gelöscht wird ohnehin die
      // ganze Zeile (s. unten), die Löschseite braucht nichts.
      trustLevel: c.trustLevel, trustLevelLeader: c.trustLevelLeader,
    })),
    badges: badges.map(b => ({
      badgeKey: b.badgeKey, qualifier: b.qualifier, awardedAt: b.$createdAt,
    })),
    reactions: reactions.map(r => ({
      targetType: r.targetType, targetId: r.targetId,
      reaction: r.reaction, createdAt: r.$createdAt,
    })),
  }
}

export async function postsDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  let deleted = 0
  let anonymized = 0

  // Eigene Poll-Stimmen: Hard-Delete. STRIKT — deleteUserCompletely gated
  // users.delete auf Voll-Erfolg, ein geschluckter Fehler wäre eine Lücke.
  const votes = await listAllRows<PollVote>(tablesDB, databaseId, POLL_VOTES_TABLE, [Query.equal('userId', userId)])
  for (const vote of votes) {
    await tablesDB.deleteRow({ databaseId, tableId: POLL_VOTES_TABLE, rowId: vote.$id })
    deleted++
  }

  // Up-/Downvotes ebenso Hard-Delete (Zähler-Drift bis zum nächsten Vote
  // akzeptiert — Präzedenzfall comments). List degradiert vor Migration 003
  // (fehlende Tabelle) — jeder andere Lesefehler hält die Löschung an.
  const scoreVotes = await listAllRowsIfTableExists<PostVote>(tablesDB, databaseId, POST_VOTES_TABLE, [Query.equal('userId', userId)])
  for (const vote of scoreVotes) {
    await tablesDB.deleteRow({ databaseId, tableId: POST_VOTES_TABLE, rowId: vote.$id })
    deleted++
  }

  /**
   * F1: die mitschreibenden Zähler sind Hard-Delete.
   *
   * Anders als ein Beitrag sind sie kein Gesprächskontext anderer — es sind
   * Zahlen ÜBER genau diesen Menschen, und ohne ihn haben sie keinen
   * Gegenstand mehr. Ein Grabstein wäre hier sinnlos.
   *
   * Die Liste degradiert auf leer, solange posts-013 auf einer Instanz
   * aussteht (fehlende Tabelle, sonst nichts); die Löschungen selbst sind
   * STRIKT (Muster der Stimmen darüber), weil `deleteUserCompletely` das
   * Konto nur bei Voll-Erfolg entfernt.
   */
  const counters = await listAllRowsIfTableExists<MemberCounters>(tablesDB, databaseId, MEMBER_COUNTERS_TABLE, [Query.equal('userId', userId)])
  for (const row of counters) {
    await tablesDB.deleteRow({ databaseId, tableId: MEMBER_COUNTERS_TABLE, rowId: row.$id })
    deleted++
  }

  // Abzeichen: Hard-Delete aus demselben Grund wie die Zähler — Aussagen über
  // genau diesen Menschen, ohne ihn gegenstandslos. Fehlten seit Stufe 4
  // (Nebenbefund 2026-08-04). Liste degradiert vor posts-012, Löschung strikt.
  const badges = await listAllRowsIfTableExists<UserBadge>(tablesDB, databaseId, USER_BADGES_TABLE, [Query.equal('userId', userId)])
  for (const row of badges) {
    await tablesDB.deleteRow({ databaseId, tableId: USER_BADGES_TABLE, rowId: row.$id })
    deleted++
  }

  /**
   * F57: abgegebene Reaktionen sind Hard-Delete.
   *
   * Wie die Stimmen und aus demselben Grund: kein Gesprächskontext anderer,
   * sondern eine Handlung DIESES Menschen. Die Anzeige zählt danach eins
   * weniger — das ist richtig so, die Reaktion gibt es nicht mehr. Ein
   * Grabstein wäre hier ein Chip ohne Absender.
   *
   * Liste degradiert vor posts-017, Löschung strikt (Muster der Stimmen).
   */
  const reactions = await listAllRowsIfTableExists<DiscussionReaction>(tablesDB, databaseId, DISCUSSION_REACTIONS_TABLE, [Query.equal('userId', userId)])
  for (const row of reactions) {
    await tablesDB.deleteRow({ databaseId, tableId: DISCUSSION_REACTIONS_TABLE, rowId: row.$id })
    deleted++
  }

  /**
   * `invitedBy` in FREMDEN Zähler-Zeilen (SEC-032, 2026-11-15): die eigene
   * Zeile fällt oben ganz, aber wen dieser Mensch eingeladen hat, steht in
   * DEREN Zeilen als seine Konto-Id. Geleert auf `''` (Spalten-Default,
   * posts-021) — für die Eingeladenen heißt das „ohne Einlader", genau wie
   * für jemanden, der selbst kam; ihre eigenen Zähler bleiben.
   *
   * Liste degradiert vor posts-013 (fehlende Tabelle), jeder andere
   * Lesefehler hält an; Schreiben strikt. Idempotent: ein zweiter Lauf findet
   * keine Zeile mehr mit dieser Id.
   */
  const invited = await listAllRowsIfTableExists<MemberCounters>(tablesDB, databaseId, MEMBER_COUNTERS_TABLE, [Query.equal('invitedBy', userId)])
  for (const row of invited) {
    await tablesDB.updateRow({ databaseId, tableId: MEMBER_COUNTERS_TABLE, rowId: row.$id, data: { invitedBy: '' } })
    anonymized++
  }

  /**
   * Eigene Posts: Tombstone.
   *
   * WIRKLICH LEER (SEC-032, 2026-11-15 — „… Übersetzungen und Vorschauen
   * werden wirklich geleert"): bis hierher blieben `authorId`, die
   * Umfrage-Optionen (vom Autor geschriebener Text) und der Übersetzungs-
   * Cache (Titel und Text in bis zu sechs Sprachen) auf dem Grabstein. Die
   * Umfrage-STIMMEN anderer bleiben in `poll_votes` (deren Daten), sie hängen
   * am Index und verlieren mit den Optionen nur ihre Beschriftung.
   *
   * IDEMPOTENT ÜBER DIE SUCHE, nicht über einen Überspring-Test: gefunden
   * wird über `authorId`, und genau das wird geleert — ein zweiter Lauf findet
   * nichts mehr. Der frühere Test „schon geblankt ⇒ weiter" fällt deshalb weg;
   * er hätte die Grabsteine aus der Zeit davor (Konto-Id, Optionen,
   * Übersetzung noch da) für immer übersprungen.
   *
   * Wer brauchte `authorId` auf einem Grabstein? Die Moderations-Sicht zeigt
   * gelöschte Beiträge nicht als handelbar (Ausblenden verlangt `published`),
   * Bearbeiten/Löschen fragen nach dem Autor — der ist hier gelöscht. Niemand.
   */
  const posts = await listAllRows<CommunityPost>(tablesDB, databaseId, POSTS_TABLE, [Query.equal('authorId', userId)])
  for (const post of posts) {
    await tablesDB.updateRow({
      databaseId,
      tableId: POSTS_TABLE,
      rowId: post.$id,
      data: { status: 'deleted', title: null, body: '', authorName: '', authorId: '', pollOptions: null, translations: '' },
      // Niemand liest mehr; keine User-Rechte übrig (der Account verschwindet).
      // WER BLEIBT ÜBRIG: die Moderation DIESER Community — nicht das globale
      // Betreiber-Label (Audit-Befund 2026-08-02). `read(label('admin'))` ist
      // instanz-weit; im Pool hätte damit jede fremde Community Leserecht auf
      // einen Grabstein, der von einem Menschen handelt. Der Inhalt ist zwar
      // geleert, die Metadaten (wann, in welchem Thread, welcher Typ) bleiben —
      // und für Zeilen, die über Menschen sprechen, ist die Projektregel
      // `read: 'moderators'` (core/server/utils/tenantRowPermissions.ts).
      permissions: tombstonePermissions(post),
    })
    // Der Feed-Eintrag mit dem Titel-Schnappschuss. Best-effort (Core-Vertrag,
    // wirft nie); die Feed-Einträge dieses Menschen räumt zusätzlich der
    // system-Contributor über `actorId` STRIKT ab.
    await removeActivitiesForObject(event, { objectType: 'post', objectId: post.$id })
    anonymized++
  }

  return { deleted, anonymized }
}
