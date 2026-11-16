/**
 * DIE EINZEL-ANSICHT EINER GEMELDETEN NACHRICHT FÜR DIE MODERATION.
 *
 * ═══ WER HIER ETWAS ÄNDERT, ÄNDERT DIE ZUSAGE DES PRODUKTS ═══════════════
 * Das Konzept sagt zu: „niemand vom Stab liest proaktiv private Nachrichten."
 * Diese Zusage ruht auf drei Dingen, und keines davon ist ein
 * Permission-Wall — die Moderation liest über den Admin-Client, der
 * Row-Permissions absichtlich umgeht:
 *
 *  1. ZWEI Routen geben Text heraus — diese und die Warteschlange
 *     (`index.get.ts`) —, und für beide gilt EINE Regel aus EINER Funktion
 *     (`moderatorVisibleBody`, shared/messageReport.ts). Eine dritte Lese-Route
 *     weichte das auf, ohne dass etwas rot würde.
 *  2. Text nur bei OFFENER Meldung (`openReportsForTarget`; SEC-033, Davids
 *     Entscheidung 2026-11-12). Ohne sie — nie gemeldet ODER erledigt —:
 *     404 `not_reported`, nicht 403, denn für den Moderator ist die
 *     Nachricht dann schlicht nicht vorhanden.
 *  3. Sie liefert `reportedBody`, NIE `body`, und auch nicht ersatzweise.
 *
 * Wer den Text sieht, steht im Betreiber-Protokoll (`message_report.viewed`,
 * ohne Text, entprellt je Konto und Nachricht).
 *
 * Das Netz darunter ist `packages/messages/scripts/verify-messages.mjs` — der
 * eine Beweis dieses Konzepts, den man nicht durch Lesen des Codes führen
 * kann, sondern nur durch einen Lauf gegen eine echte Instanz.
 *
 * ── UMFANG DER EINSICHT: DIE GEMELDETE NACHRICHT, SONST NICHTS ───────────
 * Kein Verlauf, kein Kontext — auch nicht „die drei davor" (Davids
 * Entscheidung 2). Ein Moderator, der Kontext braucht, fragt den Melder; was
 * der freiwillig beilegt, steht im `note`-Feld seiner Meldung.
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'messages')

  await requireCommunityPermission(event, 'reports.moderate')
  const id = getRouterParam(event, 'id') ?? ''

  return getReportedMessage(event, id)
})
