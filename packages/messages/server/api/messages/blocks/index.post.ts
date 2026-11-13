import { createBlockSchema } from '../../../../schemas/message'

/**
 * JEMANDEN SPERREN — beidseitig, ohne Auskunft (Konzept § 2.3).
 *
 * ── KEIN TL-GATE, KEIN OWNER-SCHALTER ────────────────────────────────────
 * Sich zu schützen darf an nichts hängen. Wer angeschrieben wurde, hat
 * womöglich Stufe 0 (Empfangen geht ab 0), und wenn ein Owner das Produkt
 * abschaltet, sollen bestehende Sperren trotzdem setzbar bleiben — schaltet er
 * es wieder ein, gelten sie sofort. Eine Schutzhandlung hinter einem
 * Produkt-Schalter wäre die Umkehrung des Zwecks.
 *
 * Das PRODUKT-Gate (Tarif) bleibt: ohne das Produkt gibt es keine Nachrichten
 * und damit nichts zu sperren.
 *
 * ── DAS HÄKCHEN „ÜBERALL" ────────────────────────────────────────────────
 * Davids Entscheidung 3. Es ändert die REICHWEITE der einen Zeile, nicht ihre
 * Anzahl — warum nicht N Zeilen geschrieben werden, steht im Kopf von
 * `server/utils/messageBlocks.ts` (die Liste der eigenen Communities lebt im
 * Control Plane, und eine morgen beigetretene Community bekäme ohnehin keine).
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'messages')

  // SEC-030 (2026-11-13, Davids Entscheidung): wer aus der Community entfernt
  // wurde, schreibt und liest hier nichts mehr — auch nicht in einem Gespräch,
  // das schon besteht. Die Wache steht vor jedem Datenbankzugriff; im
  // Silo/Einzelbetrieb gibt sie durch.
  const user = await requireCommunityMembership(event)

  const body = await readValidatedBody(event, createBlockSchema().parse)
  if (body.userId === user.$id) {
    throw createError({ status: 400, statusText: 'You cannot block yourself' })
  }

  // SEC-036 (2026-11-13): gesperrt wird nur, wer HIER auflösbar ist (Handle
  // hier oder gemeinsames Gespräch hier — `blockTargetResolvable`). Sonst
  // 404, und zwar dieselbe für „gibt es nicht" und „gehört nicht hierher":
  // die Route soll nicht bestätigen, dass hinter einer Id ein Konto steht.
  const resolvable = await blockTargetsResolvableHere(event, user.$id, [body.userId])
  if (!resolvable.has(body.userId)) {
    throw createError({ status: 404, statusText: 'User not found' })
  }

  await blockUser(event, user.$id, body.userId, body.everywhere)
  return { ok: true }
})
