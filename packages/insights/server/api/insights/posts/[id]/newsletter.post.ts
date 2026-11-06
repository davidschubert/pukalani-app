import {
  createInsightsNewsletterSendSchema,
  decideInsightsSendStart,
  insightsNewsletterLocaleOf,
} from '../../../../../shared/insightsNewsletter'
import type { InsightsNewsletterSendBatchResponse } from '../../../../../shared/types/insightsApi'

/**
 * DEN NEWSLETTER ZU DIESEM BEITRAG SCHICKEN (`insights.manage`, BI1 I5b) —
 * EINEN Stapel je Aufruf.
 *
 * ── NUR VON HAND, NIE AUTOMATISCH (Davids Entscheidung 2026-10-27) ──────
 * Diese Route ist der EINZIGE Weg nach draussen. Es gibt keine Auslösung bei
 * der Freigabe, keinen Sweep und kein Intervall-Plugin, und das ist keine
 * Sparmaßnahme: §3.3 sagt wörtlich „ohne Davids Zeichen erscheint auch in
 * einer Woche nichts", und ein Versand an echte Menschen, den ein
 * Zustandswechsel auslöst, ist genau der Unfall, den man nicht zurückholt
 * (ein falsch gesetztes `published` wäre dann fünfhundert Mails). Der
 * Wochentakt aus §3.3 ist eine Zusage an die REDAKTION, kein Automatismus.
 *
 * ── DER RIEGEL GILT AUCH HIER ───────────────────────────────────────────
 * `pukalani.insights.newsletter.enabled` aus ⇒ 404. Ist das Anmelde-Formular
 * dunkel, geht auch nichts raus.
 *
 * ── DREI NEIN, DREI GRÜNDE ──────────────────────────────────────────────
 *  · `not_public` (409) — ein Entwurf hat keine öffentliche Adresse.
 *  · `no_public_address` (409) — der Beitrag ist freigegeben, hat draussen
 *    aber keine Seite: gesperrtes Format oder ein Markenprofil ohne
 *    Marken-Zeile. Eine Mail darauf wären fünfhundert Klicks in eine
 *    Fehlerseite.
 *  · `already_sent` (409) — dieser Beitrag ist durch. DAS ist die Regel „ein
 *    Beitrag, eine Mail"; ein zweiter Versand ist eine Entscheidung, die
 *    niemand getroffen hat.
 *
 * ── DIE REIHENFOLGE IST DER SCHUTZ ──────────────────────────────────────
 *  1. Recht, Riegel, Adresse — bevor irgendetwas geschrieben wird.
 *  2. Sende-Zeile lesen und entscheiden (`decideInsightsSendStart`).
 *  3. Beim START: Empfänger ZÄHLEN, dann die Zeile anlegen — VOR der ersten
 *     Mail (Begründung an `createInsightsSendRow`). Ein 409 aus dem
 *     Unique-Index ist das Rennen zweier offener Reiter: die Zeile wird neu
 *     gelesen und der Lauf FORTGESETZT, nicht ein zweiter gestartet.
 *  4. EINEN Stapel abarbeiten (höchstens 50), schreiben, antworten.
 *
 * ── DIE EINLEITUNG KOMMT NUR BEIM START AUS DEM FORMULAR ────────────────
 * Beim Fortsetzen steht sie in der Sende-Zeile, und von dort wird sie gelesen.
 * Sonst bekäme die zweite Hälfte der Liste einen anderen Text als die erste —
 * und zwar ohne dass es jemandem auffällt, weil niemand zwei Postfächer
 * vergleicht. Ein mitgeschickter `intro` beim Fortsetzen wird also bewusst
 * IGNORIERT; das Formular zeigt das Feld dann nicht mehr an.
 *
 * ── DIE SEITE RUFT, BIS `done` ──────────────────────────────────────────
 * So steht keine Route minutenlang offen (Begründung an
 * `INSIGHTS_NEWSLETTER_BATCH`), und der Mensch sieht einen Balken statt eines
 * hängenden Knopfes. `aborted` sagt der Seite, dass sie AUFHÖREN soll zu
 * rufen: dann fehlt der Mailer, und jeder weitere Aufruf scheiterte gleich.
 */
export default defineEventHandler(async (event): Promise<InsightsNewsletterSendBatchResponse> => {
  requirePermission(event, 'insights.manage')
  if (!insightsNewsletterAllowed()) throw insightsPublicMissing()

  const id = getRouterParam(event, 'id') ?? ''
  if (!id) throw insightsPostMissing()

  const body = await readValidatedBody(event, createInsightsNewsletterSendSchema().parse)

  const target = await resolveInsightsSendTarget(event, id)
  if (target.blocked === 'not_public') {
    throw createError({ status: 409, statusText: 'Post not public', data: { code: 'not_public' } })
  }
  if (target.blocked) {
    throw createError({ status: 409, statusText: 'Post without public address', data: { code: 'no_public_address' } })
  }

  let row = await loadInsightsSendRow(event, id)
  const decision = decideInsightsSendStart(row)
  if (decision === 'already_sent') throw insightsSendAlreadySent()

  if (decision === 'start') {
    const recipients = await countInsightsNewsletterRecipients(event)
    try {
      row = await createInsightsSendRow(event, {
        postId: id,
        subject: insightsSendSubjectPreview(target.post),
        intros: { introDe: body.introDe, introEn: body.introEn },
        locale: insightsNewsletterLocaleOf(target.post.baseLocale),
        recipients,
      })
    }
    catch (error) {
      // Das Rennen zweier offener Reiter. Es gibt jetzt eine Zeile; wer sie
      // angelegt hat, ist gleichgültig — gearbeitet wird auf ihr.
      if (!isInsightsRowConflict(error)) throw error
      row = await loadInsightsSendRow(event, id)
      if (!row) throw insightsStorageError(error, `newsletter send race ${id}`)
      if (decideInsightsSendStart(row) === 'already_sent') throw insightsSendAlreadySent()
    }
  }

  // Nach jedem Zweig oben steht eine Zeile. Fehlt sie trotzdem, ist das kein
  // Fall, über den man hinwegsehen darf: ohne Fortschrittsstand gibt es keinen
  // Versand (sonst schickt der nächste Druck alles erneut).
  if (!row) throw insightsStorageError(new Error('send row missing'), `newsletter send ${id}`)

  const result = await runInsightsNewsletterBatch(event, {
    postId: id,
    post: target.post,
    href: target.href,
    // Beim Fortsetzen gilt der Text der Zeile, nicht der des Formulars (s. Kopf).
    intros: { introDe: row.introDe ?? '', introEn: row.introEn ?? '' },
    row,
  })

  const remaining = result.done ? 0 : await countInsightsNewsletterRecipients(event, result.cursor)

  return {
    sent: result.sent,
    failed: result.failed,
    remaining,
    done: result.done,
    aborted: result.aborted,
    send: result.state,
  }
})
