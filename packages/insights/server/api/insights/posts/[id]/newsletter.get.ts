import { decideInsightsSendStart } from '../../../../../shared/insightsNewsletter'
import type { InsightsNewsletterSendStatusResponse } from '../../../../../shared/types/insightsApi'

/**
 * WAS AM VERSAND-KNOPF STEHT (`insights.manage`, BI1 I5b).
 *
 * ── DIE ZAHL IST GEZÄHLT, NICHT GERATEN ─────────────────────────────────
 * `recipients` ist das Einzige, was der Mensch vor dem Drücken über die Folgen
 * weiss — in der Rückfrage steht wörtlich „geht an N Menschen". Eine geschätzte
 * Zahl wäre dort eine Lüge mit Nachkommastellen. Sie kommt deshalb aus
 * `countInsightsNewsletterRecipients`, das die REINE Empfänger-Regel auf jede
 * Zeile anwendet — dieselbe Regel, die der Versand gleich darauf anwendet.
 *
 * ── DER RIEGEL GILT AUCH HIER ───────────────────────────────────────────
 * `pukalani.insights.newsletter.enabled` aus heisst: der Knopf erscheint nicht
 * UND diese Route antwortet 404. Ist das Anmelde-Formular dunkel, geht auch
 * nichts raus — eine Liste, die unter einem geschlossenen Riegel entstanden
 * wäre, gibt es nicht, und eine Route, die trotzdem zählt, wäre ein zweiter
 * Weg an derselben Rechtsfrage vorbei.
 *
 * ── `blocked` IST KEIN FEHLER ───────────────────────────────────────────
 * Ein Entwurf, ein gesperrtes Format, ein Profil ohne Marken-Zeile: all das
 * ist eine AUSKUNFT und kein 4xx. Das Panel soll den Grund anzeigen können
 * („dieser Beitrag hat draussen keine Seite") statt lautlos zu verschwinden.
 * Das NEIN sprechen tut die POST-Route, und zwar mit 409.
 *
 * ── `remaining` HAT EINEN EIGENEN GRUND ─────────────────────────────────
 * Nach einem Abbruch ist die Frage nicht „wie viele stehen auf der Liste",
 * sondern „wie viele haben noch keine Mail". Gerechnet wird sie ab dem
 * `cursor` der Sende-Zeile — und der verlässt den Server nicht (Begründung am
 * Typ `InsightsNewsletterSendState`).
 */
export default defineEventHandler(async (event): Promise<InsightsNewsletterSendStatusResponse> => {
  requirePermission(event, 'insights.manage')
  if (!insightsNewsletterAllowed()) throw insightsPublicMissing()

  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw insightsPostMissing()

  const target = await resolveInsightsSendTarget(event, id)
  const send = await loadInsightsSendRow(event, id)
  const recipients = await countInsightsNewsletterRecipients(event)

  // Nur mit laufender Zeile kostet die zweite Zählung einen Aufruf; ohne sie
  // steht die ganze Liste noch aus und die Antwort ist dieselbe Zahl.
  const remaining = send
    ? await countInsightsNewsletterRecipients(event, send.cursor ?? '')
    : recipients

  const decision = decideInsightsSendStart(send)

  return {
    sendable: target.blocked === '' && decision !== 'already_sent',
    blocked: target.blocked || (decision === 'already_sent' ? 'already_sent' : ''),
    recipients,
    remaining,
    subjectPreview: insightsSendSubjectPreview(target.post),
    send: send ? toInsightsNewsletterSendState(send) : null,
  }
})
