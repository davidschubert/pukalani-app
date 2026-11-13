/**
 * ALS GELESEN MARKIEREN — für die offene Seite.
 *
 * Der Normalfall ist das Öffnen selbst (`GET /api/messages/[id]` markiert
 * mit). Diese Route gibt es für den Fall, dass eine BEREITS offene Seite live
 * eine Nachricht bekommt (useRealtimeRows) und der Mensch sie liest, ohne neu
 * zu laden — ohne sie bliebe der fettgedruckte Punkt stehen, bis jemand die
 * Seite wechselt.
 *
 * KEIN Owner-Schalter-Gate: wird das Produkt abgeschaltet, während jemand
 * liest, soll er seinen Posteingang trotzdem noch aufräumen können. Der
 * Schalter verhindert neue Gespräche, nicht das Wegklicken alter.
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'messages')

  // SEC-030 (2026-11-13, Davids Entscheidung): wer aus der Community entfernt
  // wurde, schreibt und liest hier nichts mehr — auch nicht in einem Gespräch,
  // das schon besteht. Die Wache steht vor jedem Datenbankzugriff; im
  // Silo/Einzelbetrieb gibt sie durch.
  const user = await requireCommunityMembership(event)

  const id = getRouterParam(event, 'id') ?? ''
  const conversation = await requireConversation(event, id, user.$id)

  await markConversationRead(event, conversation, user.$id)
  return { ok: true }
})
