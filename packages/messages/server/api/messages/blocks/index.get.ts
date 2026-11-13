/**
 * MEINE SPERREN in dieser Community.
 *
 * BEWUSST NUR DIE EIGENEN: wer MICH gesperrt hat, steht hier nicht. Die Sperre
 * wirkt zwar beidseitig, aber sie ist die Entscheidung des anderen — sie
 * anzuzeigen hieße, sie zu verraten (Konzept § 2.3: „Der Blockierte erfährt es
 * nicht").
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'messages')

  // SEC-030 (2026-11-13, Davids Entscheidung): wer aus der Community entfernt
  // wurde, schreibt und liest hier nichts mehr — auch nicht in einem Gespräch,
  // das schon besteht. Die Wache steht vor jedem Datenbankzugriff; im
  // Silo/Einzelbetrieb gibt sie durch.
  const user = await requireCommunityMembership(event)

  const rows = await listMyBlocks(event, user.$id)

  // SEC-036 (2026-11-13): Name und Handle nur für Konten, die HIER (noch)
  // auflösbar sind. Für alle anderen bleibt nur die Id — damit Entsperren
  // möglich bleibt, ohne dass die Liste zu einer Auskunft über fremde Konten
  // wird. Ältere Zeilen von vor dieser Regel fallen genauso darunter.
  const resolvable = await blockTargetsResolvableHere(event, user.$id, rows.map(row => row.blockedId))
  const shown = [...resolvable]
  const [names, handles] = await Promise.all([
    resolveUserNames(event, shown),
    resolveUserHandles(event, shown),
  ])

  return {
    blocks: rows.map(row => ({
      id: row.$id,
      userId: row.blockedId,
      name: resolvable.has(row.blockedId) ? (names.get(row.blockedId) ?? '') : '',
      handle: resolvable.has(row.blockedId) ? (handles.get(row.blockedId) ?? '') : '',
      everywhere: row.scope === 'everywhere',
      createdAt: row.$createdAt,
    })),
  }
})
