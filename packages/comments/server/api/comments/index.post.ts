import { commentSchema } from '../../../schemas/comment'
import { COMMENTS_TABLE, MAX_COMMENT_DEPTH, type Comment } from '../../../shared/types/comment'
import { commentSnippet } from '../../../shared/commentSnippet'
import { assertReplyParent } from '../../utils/replyParent'
import { commentNotificationCommunityId, commentNotificationRowId } from '../../utils/commentNotifications'
import { commentReadPermissions, isOperatorCommentTarget } from '../../utils/commentReadPermissions'
import { softFail } from '../../../../core/server/utils/softFail'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  await assertCommentsWritable(event)
  // H3-4.3: Pool-Tenants dürfen den geteilten Server nicht erschöpfen —
  // Limits aus pukalani.tenancy.quota (Core-Default aus), Silo/Single-Tenant no-op.
  await assertPoolWriteQuota(event, { kind: 'comments', tableId: COMMENTS_TABLE })

  const body = await readValidatedBody(event, commentSchema.parse)

  // Operator-Targets (pukalani.comments.operatorTargets, z. B. 'ticket'): nur
  // Operatoren dürfen schreiben, und die Rows sind NICHT read(any), sondern
  // nur für admin/moderator lesbar — interne Diskussionen bleiben intern.
  const operatorTarget = isOperatorCommentTarget(body.targetType)
  /**
   * ZWEI FRAGEN, sauber getrennt (SEC-030, 2026-11-13):
   *  - Betreiber-Ziel ⇒ die Betreiber-Prüfung (globales Label). Hier schreibt
   *    kein Mitglied in seine Community, sondern das Team in eine interne
   *    Diskussion — Mitgliedschaft ist dafür die falsche Frage, und die
   *    Klinke `operator` tritt auch nicht bei.
   *  - Sonst ⇒ Mitmachen: ein Pool-Konto ist auf jedem Community-Host
   *    angemeldet, wer hier kommentiert, muss dazugehören. Offene
   *    Registrierung: der Kommentar IST der Beitritt (A5); geschlossen oder
   *    entzogen: 403 `not_a_member`.
   * Erst HIER und nicht ganz oben, weil das Ziel aus dem Body kommt.
   */
  if (operatorTarget) requirePermission(event, 'dashboard.access')
  else await requireCommunityParticipant(event)

  /**
   * DARF AN DIESEM ZIEL ÜBERHAUPT NOCH GESCHRIEBEN WERDEN? (F1 Stufe 3,
   * Core-Vertrag `assertContentWritable`.) Heute beantwortet das nur der
   * posts-Layer, und nur für geschlossene Discussions-Themen — dieser Layer
   * weiß davon nichts und soll es nicht wissen (A14). Für jeden Typ ohne
   * angemeldete Regel (Tickets, Kurse, fremde Andockpunkte) passiert nichts.
   *
   * VOR jedem Schreibvorgang: eine Ablehnung soll keine Zeile hinterlassen.
   * Für BEIDE Zweige, weil „geschlossen" für ALLE gilt — ein Moderator öffnet
   * das Thema mit einem Klick wieder, statt an ihm vorbeizuschreiben.
   *
   * NACH der Wache darüber (SEC-031, 2026-11-13): die Antwort hier hängt vom
   * Zustand des Ziels ab. Stünde sie vor der Frage nach der Zugehörigkeit,
   * könnte ein fremdes Konto an ihr ablesen, ob es ein Thema gibt und wie es
   * steht.
   */
  await assertContentWritable(event, body.targetType, body.targetId)

  // GELESEN wird wie bisher: ein Mitglied über die Mitglieder-Klinke (das
  // Leserecht der Zeile entscheidet, an welchen Kommentar es antworten kann),
  // das Team bei Betreiber-Zielen über die Operator-Klinke.
  const db = tenantDb(event, { as: operatorTarget ? 'operator' : 'member' })
  /**
   * GESCHRIEBEN WIRD ÜBER DEN SERVER (SEC-002, GA1 P13 — Davids Entscheidung
   * „künftig schreibt nur noch unser Server"). Die Zeile entsteht mit dem
   * Admin-Client, NACH allen Prüfungen darüber (Anmeldung, Zugehörigkeit,
   * Schreib-Schalter, Kontingent, Eingabe, Zustand des Ziels) — sie sind damit
   * die EINZIGE Grenze, ein Recht des Kontos an der Tabelle braucht es nicht.
   * `actor` sagt weiter, WER handelt: ein Mitglied (Inhalts-Sperre M13 und
   * Beitritt A5 gelten unverändert), bei Betreiber-Zielen das Team.
   */
  const writer = tenantDb(event, { as: 'operator', actor: operatorTarget ? 'operator' : 'member' })

  // Bei einer Antwort: Eltern-Kommentar vorab holen → rootId/depth ableiten,
  // maxDepth prüfen und den Parent für die Notification wiederverwenden.
  // `get` der Tür stellt zugleich sicher, dass die Antwort nicht an den
  // Kommentar eines FREMDEN Mandanten gehängt wird.
  let parent: Comment | null = null
  let rootId: string | null = null
  let depth = 0
  if (body.parentId) {
    parent = await db.get<Comment>(COMMENTS_TABLE, body.parentId, 'Parent comment not found')
    // SEC-035 (2026-11-13): nur an einen AKTIVEN Kommentar DESSELBEN Fadens —
    // dieselbe Regel wie im Gast-Weg (shared/replyParent.ts). Vorher prüfte
    // dieser Weg den Faden nicht: eine Antwort ließ sich in den Faden eines
    // anderen Ziels hängen.
    assertReplyParent(parent, body)
    rootId = parent.rootId ?? parent.$id
    depth = parent.depth + 1
    if (depth > MAX_COMMENT_DEPTH) {
      throw createError({ status: 422, statusText: 'Maximum reply depth reached' })
    }
  }

  // Die tenantId stempelt die Tür — deshalb steht sie hier nicht.
  const row = await writer.create<Comment>(COMMENTS_TABLE, {
    targetId: body.targetId,
    targetType: body.targetType,
    content: body.content,
    parentId: body.parentId ?? null,
    targetUrl: body.targetUrl ?? null,
    rootId,
    depth,
    editedAt: null,
    authorId: user.$id,
    authorName: user.name,
    upvotes: 0,
    downvotes: 0,
    score: 0,
    status: 'active',
  }, {
    // Eigene Permissions statt des Standard-Publikums: Kommentare sind
    // VERÖFFENTLICHT — der Embed-Fall zeigt Threads auf fremden Seiten, auch
    // Gästen. Ausblenden entzieht die Row-Permission (Migration 008), damit ist
    // ein hidden-Kommentar auch per Roh-REST unlesbar. Operator-Targets sehen
    // NUR admin/moderator.
    //
    // NUR LESERECHTE (SEC-002): die Zeile trägt kein `update`/`delete` für den
    // Autor mehr. Ändern und löschen laufen über die Routen, die den Autor
    // selbst prüfen ([id].patch.ts, [id].delete.ts).
    //
    // C18: was „veröffentlicht" bedeutet, entscheidet die Community —
    // `read(any)` auf einer öffentlichen, `read(label:<communityId>)` auf einer
    // geschlossenen. Deshalb hier `withPublishedRead([], event)` statt einer
    // festen read(any)-Zeile: der Schalter wirkt auf JEDEN neuen Kommentar,
    // ohne dass diese Route ihn kennt.
    //
    // BE-020: beide Fälle bildet EINE Funktion (utils/commentReadPermissions.ts),
    // die auch das Wiederherstellen benutzt — sonst öffnete es interne Kommentare.
    permissions: commentReadPermissions(event, body.targetType),
  }).catch((error) => {
    // Appwrite-4xx (z. B. abgelaufene Session) als 4xx durchreichen, nicht als 500
    throw toH3Error(error, 'Could not create comment')
  })

  /**
   * „An diesem Inhalt ist etwas passiert" (F1 Stufe 2, Core-Vertrag
   * `notifyContentActivity`). Der Konsument von heute ist die Spalte
   * „Aktivität" der Discussions — dieser Layer weiß davon nichts und soll es
   * nicht wissen (A14): er meldet nur targetType + targetId, und wer sich für
   * den Typ angemeldet hat, zieht nach. Für jeden nicht angemeldeten Typ
   * (Tickets, Kurse, fremde Andockpunkte) passiert schlicht gar nichts.
   *
   * Wirft nie — der Vertrag fängt ab. Ein Kommentar darf nicht daran scheitern,
   * dass ein Zeitstempel woanders nicht nachgezogen werden konnte.
   */
  await notifyContentActivity(event, body.targetType, body.targetId, row.$createdAt)

  /**
   * MITSCHREIBENDER ZÄHLER (F1, Core-Vertrag `recordUserCounterEvents`): eine
   * Antwort ist geschrieben. Wie beim Aktivitäts-Vertrag darüber nennt dieser
   * Layer nur eine EREIGNIS-ART und keinen Nachbarn — wer sie verbucht (heute
   * der posts-Layer, dem `member_counters` gehört), weiß er nicht und soll er
   * nicht wissen (A14). Ohne Autorität passiert schlicht nichts.
   *
   * Der Gast-Weg (`guest.post.ts`) meldet bewusst NICHTS: ohne Konto gibt es
   * niemanden, dem etwas gutzuschreiben wäre.
   */
  await recordUserCounterEvents(event, [{ userId: user.$id, kind: 'repliesCreated', delta: 1 }])

  const snippet = commentSnippet(body.content)
  // Link zur echten Seite des Kommentars: targetUrl des Replies (= Seite),
  // sonst die des Parents, sonst '/' (Bestandskommentare ohne targetUrl).
  const link = (body.targetUrl ?? parent?.targetUrl) ?? '/'

  // Antwort auf einen Kommentar → den Autor des Eltern-Kommentars benachrichtigen.
  // Core stellt den notify()-Vertrag bereit (best-effort, wirft nicht) — kein
  // direkter Cross-Layer-Zugriff auf die notifications-Tabelle (CONCEPT A14).
  // scope 'tenant' (C15): die Meldung gehört in die Community, in der der
  // Kommentar steht — ihr Link (targetUrl) gilt auch nur dort.
  //
  // FESTE ROW-ID je (Typ, Community, Kommentar, Empfänger) — SEC-032: die
  // Meldung trägt einen Auszug, und nur über diese Id findet das Löschen bzw.
  // Ausblenden des Kommentars sie wieder (utils/commentNotifications.ts).
  const notificationCommunityId = commentNotificationCommunityId(event)
  const notificationRowId = (type: 'reply' | 'mention', recipientId: string) =>
    commentNotificationRowId({ communityId: notificationCommunityId, commentId: row.$id, recipientId, type })
  if (parent && parent.authorId && parent.authorId !== user.$id) {
    await notify(event, { recipientId: parent.authorId, type: 'reply', title: user.name, body: snippet, link, senderId: user.$id, scope: 'tenant', rowId: notificationRowId('reply', parent.authorId) })
  }

  // @Name-Erwähnungen (aufgelöst gegen die Thread-Teilnehmer) benachrichtigen —
  // sich selbst nie, den Parent-Autor nicht doppelt (hat schon die reply-Notif).
  const mentions = await resolveMentions(event, {
    targetId: body.targetId,
    targetType: body.targetType,
    content: body.content,
    excludeUserIds: [user.$id, ...(parent?.authorId ? [parent.authorId] : [])],
  })
  for (const mention of mentions) {
    await notify(event, { recipientId: mention.userId, type: 'mention', title: user.name, body: snippet, link, senderId: user.$id, scope: 'tenant', rowId: notificationRowId('mention', mention.userId) })
  }

  // Activity-Feed (Core-Vertrag recordActivity, best-effort wie notify) —
  // packages/activity rendert daraus „{name} hat einen Kommentar geschrieben"
  // (feed.types.comment.created); kein Import aus feed (CONCEPT A14).
  await recordActivity(event, {
    actorId: user.$id,
    actorName: user.name,
    type: 'comment.created',
    objectType: 'comment',
    objectId: row.$id,
    link,
    metadata: { snippet },
  })
  // Meilenstein („1.000 Kommentare") — ein billiger Count (limit 1 → total),
  // best-effort über den Core-Vertrag
  // Durch die Tür zählt der Meilenstein die Kommentare DIESER Community —
  // vorher war es die Gesamtzahl über alle Mandanten, und Kunde B hätte den
  // „1.000 Kommentare"-Moment von Kunde A gefeiert.
  const commentTotal = await db.count(COMMENTS_TABLE).catch(softFail('comments:api/comments/index.post:count', 0))
  await maybeRecordMilestone(event, { type: 'milestone.comments', count: commentTotal, link })

  setResponseStatus(event, 201)
  // Avatar des Autors mitgeben (analog zur Listen-Anreicherung), damit der
  // optimistisch eingefügte Kommentar nach dem Reconcile das Bild behält
  const avatarUrl = (user.prefs as { avatarUrl?: string })?.avatarUrl
  return { ...row, authorAvatarUrl: typeof avatarUrl === 'string' ? avatarUrl : undefined }
})
