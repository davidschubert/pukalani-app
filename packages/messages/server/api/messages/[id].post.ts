import { createReplySchema } from '../../../schemas/message'
import { partnerOf } from '../../utils/conversations'

/**
 * ANTWORTEN in einer bestehenden Konversation.
 *
 * KEIN TL-GATE — das ist Konzept § 2.4, Folge 1 und keine Nachlässigkeit:
 * „EMPFANGEN geht ab Stufe 0 … wer angeschrieben wurde, darf zurückschreiben.
 * Gesperrt ist nur das ERÖFFNEN." Ein Gate hier machte den Kanal zur
 * Einbahnstraße für genau die Menschen, die er schützen soll — ein frisches
 * Konto könnte angeschrieben werden und nicht einmal „lass mich in Ruhe"
 * antworten.
 *
 * Die SPERRE gilt hier sehr wohl (beidseitig): sie ist der Weg, ein begonnenes
 * Gespräch zu beenden.
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'messages')

  // SEC-030 (2026-11-13, Davids Entscheidung): wer aus der Community entfernt
  // wurde, schreibt und liest hier nichts mehr — auch nicht in einem Gespräch,
  // das schon besteht. Die Wache steht vor jedem Datenbankzugriff; im
  // Silo/Einzelbetrieb gibt sie durch.
  const user = await requireCommunityMembership(event)

  const id = getRouterParam(event, 'id') ?? ''
  const body = await readValidatedBody(event, createReplySchema().parse)

  const conversation = await requireConversation(event, id, user.$id)
  const partnerId = partnerOf(conversation, user.$id)

  await requireMayReply(event, user.$id, partnerId)
  const message = await appendMessage(event, conversation, user.$id, body.body)

  return { messageId: message.$id }
})
