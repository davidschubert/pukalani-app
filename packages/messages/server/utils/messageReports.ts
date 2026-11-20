import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { moderatorVisibleBody, shouldFreezeSnapshot } from '../../shared/messageReport'
import { NOT_REPORTED_CODE } from '../../shared/messageErrors'
import { isParticipant, otherParticipant } from '../../shared/conversations'
import {
  CONVERSATIONS_TABLE,
  MESSAGES_TABLE,
  MESSAGE_REPORT_TARGET,
  type Conversation,
  type PrivateMessage,
  type ReportedMessageView,
} from '../../shared/types/message'
import { softFail } from '../../../core/server/utils/softFail'

/**
 * DIE MODERATIONS-SEITE (Konzept § 2.2, Davids Entscheidung 2).
 *
 * ═══ DER GRUNDSATZ ═══════════════════════════════════════════════════════
 * Niemand vom Stab liest proaktiv private Nachrichten. Es gibt keine Ansicht
 * „alle Konversationen dieser Community". Lesbar wird GENAU die Nachricht, die
 * jemand gemeldet hat — und zwar als eingefrorene Kopie aus dem Moment der
 * Meldung.
 *
 * ═══ WARUM DAS EINE ROUTE-GRENZE IST UND KEIN PERMISSION-WALL ════════════
 * Das gehört ausgesprochen, weil es nach weniger klingt, als es ist: die
 * Moderations-Ansichten lesen über die Operator-Klinke der Datentür, und die
 * benutzt den Admin-Client, der Row-Permissions ABSICHTLICH umgeht. Eine
 * Permission, die den Moderator aussperrt, wäre für ihn also gar keine.
 *
 * Der Schutz besteht deshalb aus drei Dingen, die zusammen halten:
 *  1. ZWEI Routen geben einem Moderator Text heraus — die Warteschlange
 *     (`/api/messages/moderation`) und die Einzel-Ansicht
 *     (`/api/messages/moderation/[id]`) —, und beide hängen an dieser Datei.
 *  2. EINE REGEL für beide (SEC-033, Davids Entscheidung 2026-11-12): Text
 *     gibt es nur, solange eine Meldung OFFEN ist. Entschieden wird das in
 *     EINER Funktion, `moderatorVisibleBody` (shared/messageReport.ts), mit
 *     der echten Zahl offener Meldungen — in der Liste gebündelt geholt
 *     (`openReportCountsForTargets`), in der Einzel-Ansicht über
 *     `openReportsForTarget`, dort ohne offene Meldung 404 `not_reported`.
 *  3. Herausgegeben wird nur `reportedBody`, NIE `body`. Auch nicht
 *     ersatzweise: genau dieser Ersatz wäre die Hintertür, durch die eine
 *     ungemeldete Nachricht herauskäme (`moderatorVisibleBody` gibt `null`).
 *
 * Jede herausgegebene Einsicht steht im Betreiber-Protokoll
 * (`message_report.viewed` / `message_report.queue_viewed`, entprellt, nie
 * strikt — die Moderation muss auch bei einem Ausfall arbeiten können).
 *
 * Wer eine dritte Lese-Route baut, kann das aufweichen, ohne dass etwas rot
 * wird. Das Netz dagegen ist `packages/messages/scripts/verify-messages.mjs`,
 * das gegen eine laufende Instanz prüft, dass weder eine ungemeldete noch eine
 * erledigte Nachricht über eine Moderations-Route Text herausgibt.
 */

/** Moderation liest als Betreiber — und handelt auch als solcher (M13). */
function moderationDb(event: H3Event) {
  return tenantDb(event, { as: 'operator', actor: 'operator' })
}

/* ── Der Beleg (Eskalations-Handler) ─────────────────────────────────────── */

/**
 * Die gemeldete Nachricht EINFRIEREN.
 *
 * Gerufen vom Eskalations-Handler nach JEDER neuen Meldung — geschrieben wird
 * nur bei der ERSTEN. Würde jede Meldung überschreiben, wäre der Beleg genau
 * das nicht: eine zweite Meldung Stunden später, Text inzwischen geändert,
 * machte die erste wertlos.
 *
 * FAIL-SOFT: der Eskalations-Vertrag ist ausdrücklich best-effort, ein
 * Handler-Fehler darf die Meldung selbst nie scheitern lassen. Bleibt der
 * Beleg aus, sieht der Moderator eine Meldung ohne Text — unangenehm, aber
 * ehrlich; eine verworfene Meldung wäre schlimmer.
 */
export async function freezeReportedMessage(event: H3Event, messageId: string): Promise<void> {
  const db = moderationDb(event)
  const message = await db.get<PrivateMessage>(MESSAGES_TABLE, messageId, 'Message not found').catch(softFail('messages:utils/messageReports:get', null))
  if (!message) return

  if (!shouldFreezeSnapshot({ reportedBody: message.reportedBody ?? '', reportedAt: message.reportedAt ?? '' })) return

  await db.update(MESSAGES_TABLE, messageId, {
    reportedBody: message.body ?? '',
    reportedAt: new Date().toISOString(),
  }, 'Message not found').catch((error: unknown) => {
    logEvent('warn', 'messages.freeze_failed', {
      messageId,
      message: error instanceof Error ? error.message : String(error),
    })
  })
}

/**
 * Darf das meldende Konto diese Nachricht melden? (Melde-Registry, fail-closed)
 *
 * NUR WER AM GESPRÄCH TEILNIMMT (SEC-031, 2026-11-13). Die Probe liest über
 * die Moderations-Klinke, weil die Zeile kein Leserecht für die Community
 * trägt — „gibt es die Zeile?" wäre damit für JEDE Id der Community wahr, und
 * die erste Meldung friert den Text in die Moderations-Ansicht ein. Melden
 * kann man deshalb nur, was man selbst lesen kann: eine Nachricht aus einem
 * eigenen Gespräch. Für alle anderen ist die Antwort dieselbe wie für eine Id,
 * die es nicht gibt.
 */
export async function messageExists(event: H3Event, messageId: string): Promise<boolean> {
  const userId = event.context.user?.$id
  if (!userId) return false
  const db = moderationDb(event)
  const row = await db
    .get<PrivateMessage>(MESSAGES_TABLE, messageId, 'Message not found')
    .catch(softFail('messages:utils/messageReports:get#2', null))
  if (!row) return false
  const conversation = await db
    .get<Conversation>(CONVERSATIONS_TABLE, row.conversationId, 'Conversation not found')
    .catch(softFail('messages:utils/messageReports:get#3', null))
  return !!conversation && isParticipant(conversation.participants ?? [], userId)
}

/* ── Die Warteschlange ───────────────────────────────────────────────────── */

/**
 * Die gemeldeten Nachrichten dieser Community.
 *
 * Gelistet wird ausschließlich, was EINGEFROREN ist (`reportedAt` gesetzt) —
 * das ist dieselbe Menge wie „wurde gemeldet". Eine Liste über alle
 * Nachrichten mit nachträglichem Filter wäre der Anfang der Ansicht, die
 * dieses Konzept ausschließt.
 *
 * Erledigte Meldungen bleiben in der Liste stehen (mit Beteiligten und
 * Zeitpunkt), aber OHNE Text (`textAvailable: false`). Die offenen Zahlen
 * kommen für die ganze Seite in EINER gebündelten Abfrage.
 */
export async function listReportedMessages(event: H3Event, limit: number): Promise<ReportedMessageView[]> {
  const { rows } = await moderationDb(event).list<PrivateMessage>(MESSAGES_TABLE, [
    Query.notEqual('reportedAt', ''),
    Query.orderDesc('reportedAt'),
    Query.limit(limit),
  ])
  const open = await openReportCountsForTargets(event, MESSAGE_REPORT_TARGET, rows.map(row => row.$id))
  const views = await Promise.all(rows.map(row => toReportedView(event, row, open.get(row.$id) ?? 0)))

  // Einsicht festhalten — nur die ZAHL der herausgegebenen Texte, keine Id,
  // kein Text. Entprellt je Konto (15 min), nie strikt.
  const withText = views.filter(view => view.textAvailable).length
  if (withText > 0) {
    await recordAuditView(event, `message-report-queue:${event.context.user?.$id ?? ''}`, {
      action: 'message_report.queue_viewed',
      metadata: { withText },
    })
  }
  return views
}

/**
 * EINE gemeldete Nachricht — die Einzel-Ansicht.
 *
 * Ohne offene Meldung: 404 mit `not_reported` — das gilt für eine nie
 * gemeldete und ebenso für eine ERLEDIGTE (SEC-033). Nicht 403 — für den
 * Moderator ist die Nachricht schlicht nicht vorhanden, und ein 403 würde
 * bestätigen, dass es sie gibt.
 */
export async function getReportedMessage(event: H3Event, messageId: string): Promise<ReportedMessageView> {
  const open = await openReportsForTarget(event, MESSAGE_REPORT_TARGET, messageId)
  if (open.length === 0) {
    throw createError({
      status: 404,
      statusText: 'No open report for this message',
      data: { code: NOT_REPORTED_CODE },
    })
  }

  const message = await moderationDb(event).get<PrivateMessage>(MESSAGES_TABLE, messageId, 'Message not found')
  const view = await toReportedView(event, message, open.length)
  if (view.textAvailable) {
    // Kein Text, kein Name im Eintrag — Art, Ziel-Id, wer, wann.
    await recordAuditView(event, `message-report:${event.context.user?.$id ?? ''}:${messageId}`, {
      action: 'message_report.viewed',
      targetType: MESSAGE_REPORT_TARGET,
      targetId: messageId,
    })
  }
  return view
}

/**
 * Zeile → das, was ein Moderator sieht.
 *
 * `body` kommt aus `moderatorVisibleBody` und ist NIE der lebende Text —
 * und leer, wenn keine Meldung offen ist (`textAvailable: false`). Die
 * Beteiligten stehen dabei, weil eine Meldung ohne sie nicht bearbeitbar wäre
 * — mehr Kontext gibt es in v1 ausdrücklich nicht: kein Verlauf, auch nicht
 * „die drei davor". Wer Kontext braucht, fragt den Melder; was der freiwillig
 * beilegt, steht im `note`-Feld der Meldung.
 */
async function toReportedView(
  event: H3Event,
  message: PrivateMessage,
  openReports: number,
): Promise<ReportedMessageView> {
  const conversation = await moderationDb(event)
    .get<Conversation>(CONVERSATIONS_TABLE, message.conversationId, 'Conversation not found')
    .catch(softFail('messages:utils/messageReports:get#4', null))

  const participants = conversation?.participants ?? []
  const recipientId = otherParticipant(participants, message.authorId)
  // Name UND Bild aus EINER Abfrage: `resolveUserNames` + `resolveAvatars`
  // nebeneinander wären zwei identische `users.list` über dieselben zwei Ids.
  const cards = await resolveUserCards(event, [message.authorId, recipientId].filter(Boolean))
  const visible = moderatorVisibleBody({
    reportedBody: message.reportedBody ?? '',
    reportedAt: message.reportedAt ?? '',
    openReports,
  })

  return {
    id: message.$id,
    conversationId: message.conversationId,
    authorId: message.authorId,
    authorName: cards.get(message.authorId)?.name ?? '',
    authorAvatarUrl: cards.get(message.authorId)?.avatarUrl ?? '',
    recipientId,
    recipientName: cards.get(recipientId)?.name ?? '',
    recipientAvatarUrl: cards.get(recipientId)?.avatarUrl ?? '',
    body: visible ?? '',
    textAvailable: visible !== null,
    reportedAt: message.reportedAt ?? '',
    sentAt: message.$createdAt,
    openReports,
  }
}
