import { createInsightsNewsletterTokenSchema } from '../../../../../shared/insightsNewsletter'
import type { InsightsSubscriberRow } from '../../../../../shared/insightsRows'
import { INSIGHTS_SUBSCRIBERS_TABLE } from '../../../../../shared/insightsRows'
import type { InsightsNewsletterUnsubscribeResponse } from '../../../../../shared/types/insightsApi'

/**
 * „SCHREIBT MIR NICHT MEHR" — der Abmelde-Weg (BI1 I5a).
 *
 * ── OHNE KONTO, NUR MIT TOKEN — UND 200 NUR, WENN DER LINK ECHT IST ─────
 * Jede Mail dieses Produkts trägt diesen Link — die Bestätigungs-Mail
 * eingeschlossen, wo er das „ich war das nicht" ist. Ist der Link ECHT (eine
 * Signatur passt), antwortet die Route immer 200: zweiter Klick aus einer
 * alten Mail, schon abgemeldet, längst gelöschte Zeile. Ein 409 auf „schon
 * abgemeldet" wäre eine Rüge für etwas, das erledigt ist.
 *
 * Passt die Signatur zu KEINEM Schlüssel, ist es KEIN Erfolg (SEC-020, seit
 * 2026-11-15): 400 mit `reason: unsubscribe_link_invalid`. Bis dahin stand
 * hier auch dafür eine 200, und die Seite zeigte „Abgemeldet", während die
 * Adresse weiter auf der Liste stand. Ein entwerteter Link darf nicht wie eine
 * Abmeldung aussehen — die Seite sagt jetzt, dass er NICHT abgemeldet hat und
 * wie es trotzdem geht. Ohne jeden Schlüssel auf dem Server: 503
 * `newsletter_unconfigured` (aus `insightsNewsletterRowIdFromToken`).
 *
 * ── DER TOKEN IST ABGELEITET, NICHT GESPEICHERT ─────────────────────────
 * `<rowId>.<hmac>`; nachgerechnet wird er, statt ihn zu suchen (Begründung im
 * Kopf von `server/utils/insightsNewsletter.ts`). Das ist der Grund, warum
 * dieser Weg nach dem Bestätigen noch funktioniert: der Bestätigungs-Hash ist
 * dann gelöscht. Geprüft wird gegen das eigene Geheimnis, das vorherige und
 * (Übergang) den bisherigen API-Schlüssel — ein Wechsel tötet so keine Links.
 *
 * ── KEIN ONE-CLICK, ALSO KEIN AUFRUF OHNE MENSCH ────────────────────────
 * `List-Unsubscribe` trägt nur die SEITE (kein `List-Unsubscribe-Post`). Ein
 * Mail-Programm, das den Link vorab abruft, lädt nur das HTML; abgemeldet
 * wird erst im Browser per POST. Der 400-Weg ändert dabei nichts: er
 * schreibt nichts und meldet niemanden ab — er sagt nur ehrlich, dass nichts
 * geschah.
 *
 * ── DREI AUSGÄNGE, EINE REGEL ───────────────────────────────────────────
 * `decideInsightsNewsletterUnsubscribe` entscheidet, nicht diese Route:
 *  · `noop`   — schon abgemeldet. Nichts schreiben.
 *  · `delete` — war NIE bestätigt ⇒ die ganze Zeile geht. Für diese Adresse
 *    gab es keine Einwilligung, es gibt also nichts aufzubewahren (dieselbe
 *    Begründung wie Regel 1 des Sweeps). Eine stehen gelassene Zeile wäre eine
 *    Adresse ohne Rechtsgrund.
 *  · `mark`   — war bestätigt ⇒ `unsubscribedAt`, Token-Felder leer,
 *    `retentionAt` auf 12 Monate. Die Zeile bleibt als Nachweis „hat
 *    eingewilligt und sich abgemeldet".
 *
 * ── KEINE DROSSEL IM RUMPF, UND DAS IST ABSICHT ─────────────────────────
 * Der Minuten-Eimer der Middleware (`insights:newsletter`) deckelt auch diese
 * Adresse. Einen Stunden- oder Tages-Eimer bekommt sie NICHT: sie verschickt
 * keine Mail, legt nichts an und kostet eine Abfrage — und ein Deckel auf dem
 * Abmelden ist ein Deckel auf einem Recht. Geraten wird die Signatur ohnehin
 * nicht.
 */
export default defineEventHandler(async (event): Promise<InsightsNewsletterUnsubscribeResponse> => {
  if (!insightsNewsletterAllowed()) throw insightsPublicMissing()

  const body = await readValidatedBody(event, createInsightsNewsletterTokenSchema().parse)
  const rowId = insightsNewsletterRowIdFromToken(event, body.token)
  if (!rowId) {
    // Keine Signatur passt — gefälscht oder entwertet. KEIN Erfolg (s. Kopf);
    // das Log sagt, dass es passiert ist (ohne Token) — häuft es sich, fehlt
    // ein Schlüssel in der Prüf-Liste und nicht ein Angreifer ist schuld.
    logEvent('info', 'insights.newsletter_unsub_token_invalid', {})
    throw createError({
      status: 400,
      statusText: 'Unsubscribe link is not valid',
      data: { code: 'unsubscribe_link_invalid' },
    })
  }

  const { tablesDB, databaseId } = insightsDb(event)

  let row: InsightsSubscriberRow | null = null
  try {
    row = await tablesDB.getRow<InsightsSubscriberRow>({
      databaseId,
      tableId: INSIGHTS_SUBSCRIBERS_TABLE,
      rowId,
    })
  }
  catch (error) {
    // Zeile (oder Tabelle) gibt es nicht ⇒ es gibt nichts abzumelden, und das
    // ist für den Menschen davor dasselbe wie Erfolg. NUR dieser Fall ist
    // nachsichtig; eine kranke Ablage antwortet 503, sonst sagten wir „ist
    // abgemeldet", während die Adresse weiter auf der Liste steht.
    if (isInsightsRowMissing(error)) {
      logEvent('info', 'insights.newsletter_unsubscribed', { state: 'gone' })
      return { ok: true }
    }
    throw insightsStorageError(error, 'insightsNewsletterUnsubscribe')
  }

  let action: 'delete' | 'mark' | 'noop'
  try {
    // Der Schreibvorgang ist mit dem Resend-Webhook GETEILT (RS1 b) —
    // `server/utils/insightsNewsletterUnsubscribe.ts`.
    action = await applyInsightsNewsletterUnsubscribe(tablesDB, databaseId, row, new Date())
  }
  catch (error) {
    // Auch hier KEINE Nachsicht ausser dem fehlenden Datensatz: ein
    // fehlgeschlagener Schreibvorgang mit 200 zu beantworten wäre die
    // Behauptung, die Abmeldung sei erfolgt.
    if (isInsightsRowMissing(error)) return { ok: true }
    throw insightsStorageError(error, 'insightsNewsletterUnsubscribeWrite')
  }

  if (action === 'noop') {
    logEvent('info', 'insights.newsletter_unsubscribed', { state: 'already' })
    return { ok: true }
  }

  logEvent('info', 'insights.newsletter_unsubscribed', { state: action })
  return { ok: true }
})
