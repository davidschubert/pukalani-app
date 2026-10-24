import { Query } from 'node-appwrite'
import {
  createInsightsNewsletterTokenSchema,
  insightsNewsletterTokenExpired,
} from '../../../../../shared/insightsNewsletter'
import type { InsightsSubscriberRow } from '../../../../../shared/insightsRows'
import { INSIGHTS_SUBSCRIBERS_TABLE } from '../../../../../shared/insightsRows'
import type { InsightsNewsletterConfirmResponse } from '../../../../../shared/types/insightsApi'

/**
 * DER KLICK AUS DER MAIL — die zweite Hälfte des Double-Opt-in (BI1 I5a).
 *
 * Der Token IST der Beweis; ein Konto braucht es nicht (dieselbe Ausnahme wie
 * beim Bestätigen der Warteliste, und aus demselben Grund: wer sich für einen
 * Newsletter einträgt, hat hier keines). Der Riegel steht trotzdem davor — ist
 * er zu, gibt es diesen Weg nicht, und das sagt derselbe neutrale 404 wie
 * überall im öffentlichen Teil.
 *
 * ── DIE REIHENFOLGE ─────────────────────────────────────────────────────
 * hashen → Zeile über `tokenHash` suchen → schon bestätigt? → Frist prüfen →
 * stempeln und die Token-Felder LEEREN. Es folgt bewusst KEINE Meldung an den
 * Betreiber (anders als bei der Warteliste): eine Eintragung ist kein Vorgang,
 * der jemanden aufwecken muss — die Zahl steht in §9.7 und wird gezählt, nicht
 * gemailt.
 *
 * ── DER HASH WIRD BEIM STEMPELN GELÖSCHT ────────────────────────────────
 * Zwei Wirkungen, beide gewollt: ein weitergeleiteter Link ist danach tot (er
 * findet nichts mehr), und die Zeile trägt kein Geheimnis mehr mit sich herum,
 * das sie nicht braucht. Der ABMELDE-Link überlebt das, weil er NICHT
 * gespeichert ist, sondern aus der Zeilen-Id abgeleitet wird (Kopf von
 * `server/utils/insightsNewsletter.ts`) — sonst stünde der Versand in I5b
 * ohne Abmelde-Weg da, und genau das wäre die Falle dieses Musters.
 *
 * Das leere `''` ist kein Suchtreffer-Risiko: das Schema verlangt mindestens
 * 32 Zeichen, und sha256 liefert immer 64 — der Wert `''` kann als Abfrage
 * nie entstehen.
 *
 * ── DREI ANTWORTEN ──────────────────────────────────────────────────────
 *  · 200 `confirmed` / `already_confirmed` — Letzteres ist hier KEIN Leck
 *    (wer den Token hat, hat die Mail), sondern der Unterschied zwischen zwei
 *    Sätzen auf der Landeseite.
 *  · 410 `token_expired` — die 24 Stunden sind um. Die Zeile bleibt
 *    unbestätigt stehen, damit die Seite den EINEN Satz sagen kann, der hier
 *    hilft: „trag dich noch einmal ein."
 *  · 400 `token_invalid` — unbekannt (falsch, schon benutzt, Zeile gelöscht).
 *  · 503 `storage_unavailable` — die Ablage antwortet nicht.
 *
 * ── DER TOKEN STEHT NIE IM LOG ──────────────────────────────────────────
 * Auch nicht gekürzt. Geloggt wird die Zeilen-Id und der Ausgang.
 */
export default defineEventHandler(async (event): Promise<InsightsNewsletterConfirmResponse> => {
  if (!insightsNewsletterAllowed()) throw insightsPublicMissing()

  const body = await readValidatedBody(event, createInsightsNewsletterTokenSchema().parse)
  const tokenHash = hashInsightsNewsletterToken(body.token)

  const { tablesDB, databaseId } = insightsDb(event)

  let row: InsightsSubscriberRow | undefined
  try {
    const res = await tablesDB.listRows<InsightsSubscriberRow>({
      databaseId,
      tableId: INSIGHTS_SUBSCRIBERS_TABLE,
      queries: [Query.equal('tokenHash', tokenHash), Query.limit(1)],
    })
    row = res.rows[0]
  }
  catch (error) {
    // Fehlende Tabelle ⇒ dasselbe 503 wie eine kranke Ablage: der Mensch kann
    // nichts dafür, und ein 404 hier hiesse „dein Link ist kaputt", was eine
    // falsche Auskunft wäre.
    throw insightsStorageError(error, 'insightsNewsletterConfirm')
  }

  if (!row) {
    logEvent('info', 'insights.newsletter_token_invalid', {})
    throw createError({
      status: 400,
      statusText: 'Newsletter token is invalid',
      data: { code: 'token_invalid' },
    })
  }

  // Defensiv: normalerweise unerreichbar, weil das Stempeln den Hash löscht.
  // Trägt eine Zeile trotzdem Hash UND `confirmedAt`, ist „schon bestätigt"
  // die ehrliche Auskunft — und ein zweites Stempeln eine Änderung ohne Anlass.
  if (row.confirmedAt && !row.unsubscribedAt) {
    return { ok: true, state: 'already_confirmed' }
  }

  if (insightsNewsletterTokenExpired(row.tokenExpiresAt)) {
    logEvent('info', 'insights.newsletter_token_expired', { rowId: row.$id })
    throw createError({
      status: 410,
      statusText: 'Newsletter token has expired',
      data: { code: 'token_expired' },
    })
  }

  try {
    await tablesDB.updateRow({
      databaseId,
      tableId: INSIGHTS_SUBSCRIBERS_TABLE,
      rowId: row.$id,
      data: {
        confirmedAt: new Date().toISOString(),
        // Eine Zeile, die zwischen Eintrag und Klick abgemeldet wurde, gibt es
        // nicht (das Abmelden löscht eine unbestätigte Zeile) — das Feld wird
        // trotzdem geleert, damit „bestätigt" und „abgemeldet" nie gleichzeitig
        // in einer Zeile stehen können.
        unsubscribedAt: '',
        retentionAt: null,
        tokenHash: '',
        tokenExpiresAt: '',
      },
    })
  }
  catch (error) {
    throw insightsStorageError(error, 'insightsNewsletterConfirmWrite')
  }

  logEvent('info', 'insights.newsletter_confirmed', {
    source: row.source ?? '',
    locale: row.locale ?? '',
  })
  return { ok: true, state: 'confirmed' }
})
