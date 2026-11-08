import type { H3Event } from 'h3'
import { Query } from 'node-appwrite'
import {
  decideInsightsNewsletterUnsubscribe,
  insightsNewsletterRetentionAt,
  type InsightsNewsletterUnsubscribeAction,
} from '../../shared/insightsNewsletter'
import { INSIGHTS_SUBSCRIBERS_TABLE, type InsightsSubscriberRow } from '../../shared/insightsRows'
import { insightsDb, isInsightsRowMissing } from './insightsStore'

/**
 * DAS ABMELDEN SELBST — einmal, für ZWEI Auslöser.
 *
 *  1. Der Mensch klickt den Abmelde-Link (`public/newsletter/unsubscribe`).
 *  2. Resend meldet die Adresse als unzustellbar (RS1 b, Webhook im core,
 *     angedockt über `registerMailUndeliverableHandler` in
 *     `server/plugins/mail-undeliverable.ts`).
 *
 * Beide Wege MÜSSEN dasselbe schreiben: eine bounce-abgemeldete Zeile ist
 * rechtlich dieselbe Zeile wie eine selbst abgemeldete (Nachweis der
 * Einwilligung, 12-Monats-Frist), und der Sweep räumt sie auf demselben Weg.
 * Darum steht der Schreibvorgang hier und nicht zweimal.
 *
 * `decideInsightsNewsletterUnsubscribe` entscheidet (noop · delete · mark);
 * Begründung der drei Ausgänge im Kopf der Abmelde-Route.
 *
 * Wirft bei jedem Schreibfehler — die Aufrufer entscheiden, was ein
 * fehlender Datensatz bedeutet (beide: „erledigt").
 */
export async function applyInsightsNewsletterUnsubscribe(
  tablesDB: ReturnType<typeof insightsDb>['tablesDB'],
  databaseId: string,
  row: Pick<InsightsSubscriberRow, '$id' | 'confirmedAt' | 'unsubscribedAt'>,
  now: Date,
): Promise<InsightsNewsletterUnsubscribeAction> {
  const action = decideInsightsNewsletterUnsubscribe({
    confirmedAt: row.confirmedAt,
    unsubscribedAt: row.unsubscribedAt,
  })
  if (action === 'delete') {
    await tablesDB.deleteRow({ databaseId, tableId: INSIGHTS_SUBSCRIBERS_TABLE, rowId: row.$id })
  }
  else if (action === 'mark') {
    await tablesDB.updateRow({
      databaseId,
      tableId: INSIGHTS_SUBSCRIBERS_TABLE,
      rowId: row.$id,
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
  return action
}

/**
 * Der Andockpunkt für den Resend-Webhook: Abonnent zur Adresse suchen und
 * abmelden. Idempotent — eine schon abgemeldete Zeile ist `unchanged`, und
 * eine gelöschte (nie bestätigte) ist bei der Wiederholung `none`.
 *
 * Eine BESCHWERDE meldet genauso ab wie ein harter Bounce: Resend sperrt die
 * Adresse in beiden Fällen teamweit, jede weitere Ausgabe wäre also nur ein
 * Fehlschlag mehr in der Statistik — und wer „Spam" drückt, hat damit gesagt,
 * dass er nichts mehr will.
 *
 * Ohne Tabelle (eine App, die den Layer im Baum hat, aber nicht migriert ist)
 * ⇒ `none`: hier kann kein Abonnent stehen.
 */
export async function insightsNewsletterMailUndeliverable(
  event: H3Event,
  input: { emailLower: string },
): Promise<'changed' | 'unchanged' | 'none'> {
  if (!getProductRegistry().has('insights')) return 'none'
  const { tablesDB, databaseId } = insightsDb(event)

  let row: InsightsSubscriberRow | undefined
  try {
    const found = await tablesDB.listRows<InsightsSubscriberRow>({
      databaseId,
      tableId: INSIGHTS_SUBSCRIBERS_TABLE,
      queries: [Query.equal('emailLower', input.emailLower), Query.limit(1)],
    })
    row = found.rows[0]
  }
  catch (error) {
    if (isInsightsRowMissing(error)) return 'none'
    throw error
  }
  if (!row) return 'none'

  try {
    const action = await applyInsightsNewsletterUnsubscribe(tablesDB, databaseId, row, new Date())
    return action === 'noop' ? 'unchanged' : 'changed'
  }
  catch (error) {
    // Zwischen Lesen und Schreiben verschwunden (Sweep, zweiter Webhook) ⇒
    // es gibt nichts mehr abzumelden.
    if (isInsightsRowMissing(error)) return 'none'
    throw error
  }
}
