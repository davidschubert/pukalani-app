import {
  createInsightsNewsletterTokenSchema,
  decideInsightsNewsletterUnsubscribe,
  insightsNewsletterRetentionAt,
} from '../../../../../shared/insightsNewsletter'
import type { InsightsSubscriberRow } from '../../../../../shared/insightsRows'
import { INSIGHTS_SUBSCRIBERS_TABLE } from '../../../../../shared/insightsRows'
import type { InsightsNewsletterUnsubscribeResponse } from '../../../../../shared/types/insightsApi'

/**
 * „SCHREIBT MIR NICHT MEHR" — der Abmelde-Weg (BI1 I5a).
 *
 * ── OHNE KONTO, NUR MIT TOKEN, UND IMMER MIT 200 ────────────────────────
 * Jede Mail dieses Produkts trägt diesen Link — die Bestätigungs-Mail
 * eingeschlossen, wo er das „ich war das nicht" ist. Ein Mensch, der sich
 * abmelden will, darf deshalb NIE eine Fehlermeldung lesen: unbekannter Token,
 * zweiter Klick aus einer alten Mail, längst gelöschte Zeile — alles antwortet
 * dieselbe 200. Ein 409 auf „schon abgemeldet" wäre eine Rüge für etwas, das
 * erledigt ist, und ein 400 auf einen alten Link sähe aus wie „die Abmeldung
 * hat nicht gewirkt".
 *
 * ── DER TOKEN IST ABGELEITET, NICHT GESPEICHERT ─────────────────────────
 * `<rowId>.<hmac>`; nachgerechnet wird er, statt ihn zu suchen (Begründung im
 * Kopf von `server/utils/insightsNewsletter.ts`). Das ist der Grund, warum
 * dieser Weg nach dem Bestätigen noch funktioniert: der Bestätigungs-Hash ist
 * dann gelöscht. Es ist AUCH der Grund, warum ein Schlüsseltausch alte
 * Abmelde-Links tötet — die Seite sagt dann, was zu tun ist, statt eine
 * Sackgasse zu zeigen.
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
    // Falsche Signatur oder ein Link aus der Zeit vor einem Schlüsseltausch.
    // Die Antwort bleibt 200 (s. Kopf); das Log sagt, dass es passiert ist —
    // häuft es sich, war es ein Tausch und nicht ein Angreifer.
    logEvent('info', 'insights.newsletter_unsub_token_invalid', {})
    return { ok: true }
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

  const action = decideInsightsNewsletterUnsubscribe({
    confirmedAt: row.confirmedAt,
    unsubscribedAt: row.unsubscribedAt,
  })

  if (action === 'noop') {
    logEvent('info', 'insights.newsletter_unsubscribed', { state: 'already' })
    return { ok: true }
  }

  try {
    if (action === 'delete') {
      await tablesDB.deleteRow({ databaseId, tableId: INSIGHTS_SUBSCRIBERS_TABLE, rowId })
    }
    else {
      const now = new Date()
      await tablesDB.updateRow({
        databaseId,
        tableId: INSIGHTS_SUBSCRIBERS_TABLE,
        rowId,
        data: {
          unsubscribedAt: now.toISOString(),
          // Ein offener Bestätigungs-Link stirbt mit — wer abgemeldet ist, soll
          // nicht über eine alte Mail wieder auf die Liste kommen.
          tokenHash: '',
          tokenExpiresAt: '',
          // Die Frist steht als DATUM in der Zeile, nicht als Rechnung: so ist
          // sie ablesbar, und ein späterer Wechsel verlängert nicht
          // rückwirkend, was schon zugesagt wurde.
          retentionAt: insightsNewsletterRetentionAt(now).toISOString(),
        },
      })
    }
  }
  catch (error) {
    // Auch hier KEINE Nachsicht ausser dem fehlenden Datensatz: ein
    // fehlgeschlagener Schreibvorgang mit 200 zu beantworten wäre die
    // Behauptung, die Abmeldung sei erfolgt.
    if (isInsightsRowMissing(error)) return { ok: true }
    throw insightsStorageError(error, 'insightsNewsletterUnsubscribeWrite')
  }

  logEvent('info', 'insights.newsletter_unsubscribed', { state: action })
  return { ok: true }
})
