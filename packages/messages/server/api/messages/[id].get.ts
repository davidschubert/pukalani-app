import { z } from 'zod'
import { counterValue } from '../../../shared/conversations'
import { findMember, partnerOf } from '../../utils/conversations'
import type { ConversationThread } from '../../../shared/types/message'

/** Eine Seite des Verlaufs. 50 ist die Bildschirmhöhe, nicht die Grenze. */
const MAX_LIMIT = 100

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

/**
 * DER VERLAUF EINER KONVERSATION — für die BETEILIGTEN.
 *
 * ── ZWEI GRENZEN, BEIDE NÖTIG ────────────────────────────────────────────
 *  1. Die Datentür belegt, dass die Konversation zu DIESEM Mandanten gehört.
 *  2. `requireConversation` belegt, dass der Anfragende dazugehört.
 * Die erste allein reichte nicht: eine fremde Konversation DERSELBEN Community
 * ist ein gültiger Mandanten-Treffer.
 *
 * 404 statt 403, wie überall in diesem Repo: ein 403 bestätigte die Existenz
 * und machte fremde Ids verifizierbar.
 *
 * ── DAS ÖFFNEN MARKIERT ALS GELESEN ──────────────────────────────────────
 * Bewusst hier und nicht in einer zweiten Route, die der Client rufen müsste:
 * eine Markierung, an die sich die Oberfläche erinnern muss, bleibt irgendwann
 * aus. `POST /api/messages/[id]/read` gibt es trotzdem — für den Fall, dass
 * eine offene Seite live eine Nachricht bekommt und der Mensch sie liest, ohne
 * neu zu laden.
 */
export default defineEventHandler(async (event): Promise<ConversationThread> => {
  requirePlanProduct(event, 'messages')

  // SEC-030 (2026-11-13, Davids Entscheidung): wer aus der Community entfernt
  // wurde, schreibt und liest hier nichts mehr — auch nicht in einem Gespräch,
  // das schon besteht. Die Wache steht vor jedem Datenbankzugriff; im
  // Silo/Einzelbetrieb gibt sie durch.
  const user = await requireCommunityMembership(event)
  await requireMessagesEnabled(event)

  const id = getRouterParam(event, 'id') ?? ''
  const { limit, offset } = await getValidatedQuery(event, querySchema.parse)

  const conversation = await requireConversation(event, id, user.$id)
  const partnerId = partnerOf(conversation, user.$id)

  const [{ rows, total }, cards, handles, blocked] = await Promise.all([
    listMessages(event, conversation.$id, limit, offset),
    // Name und Bild aus EINER Abfrage (`resolveUserCards`); der Handle hat
    // eine andere Quelle (account_handles).
    resolveUserCards(event, [partnerId].filter(Boolean)),
    resolveUserHandles(event, [partnerId].filter(Boolean)),
    // Die Sperre wird hier NUR ANGEZEIGT (der Antwort-Bereich verschwindet) —
    // durchgesetzt wird sie beim Senden. Eine Oberfläche, die nur versteckt,
    // wäre keine Grenze; eine Grenze, die nichts anzeigt, wäre eine Falle.
    pairBlocked(event, user.$id, partnerId),
  ])

  // Nur wenn es etwas zu markieren gibt — sonst wäre jedes Blättern ein
  // Schreibvorgang.
  const member = await findMember(event, conversation.$id, user.$id)
  if (counterValue(member?.unread) > 0) {
    await markConversationRead(event, conversation, user.$id)
  }

  return {
    id: conversation.$id,
    partnerId,
    partnerName: cards.get(partnerId)?.name ?? '',
    partnerHandle: handles.get(partnerId) ?? '',
    partnerAvatarUrl: cards.get(partnerId)?.avatarUrl ?? '',
    blocked,
    total,
    messages: rows.map(row => ({
      id: row.$id,
      authorId: row.authorId,
      body: row.body ?? '',
      createdAt: row.$createdAt,
      readAt: row.readAt ?? '',
      mine: row.authorId === user.$id,
    })),
  }
})
