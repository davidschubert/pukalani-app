/**
 * EINE SPERRE AUFHEBEN.
 *
 * Adressiert über die USER-Id des Gesperrten, nicht über die Row-Id: die Zeile
 * ist ein Implementierungsdetail, und der Mensch hebt eine Sperre gegen eine
 * PERSON auf. Fremde Zeilen sind für den Aufrufer nicht vorhanden — gefunden
 * wird ausschließlich, was er selbst gesetzt hat (`blockerId`).
 *
 * 404, wenn es nichts aufzuheben gibt: eine Sperre, die es nicht gibt, ist
 * nicht dasselbe wie eine, die man nicht aufheben darf.
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'messages')

  // SEC-030 (2026-11-13, Davids Entscheidung): wer aus der Community entfernt
  // wurde, schreibt und liest hier nichts mehr — auch nicht in einem Gespräch,
  // das schon besteht. Die Wache steht vor jedem Datenbankzugriff; im
  // Silo/Einzelbetrieb gibt sie durch.
  const user = await requireCommunityMembership(event)

  const blockedId = getRouterParam(event, 'userId') ?? ''
  const removed = await unblockUser(event, user.$id, blockedId)
  if (!removed) throw createError({ status: 404, statusText: 'Block not found' })

  return { ok: true }
})
