import { Query, type Models } from 'node-appwrite'
import type { H3Event } from 'h3'
import { BILLING_CUSTOMERS_TABLE, BILLING_SUBSCRIPTIONS_TABLE, type BillingCustomerRow, type BillingSubscriptionRow } from '../../shared/types/billing'
import { STRIPE_SETTINGS_TABLE } from './stripeSettings'

/**
 * GDPR-Contributor des billing-Layers: die lokalen Rows sind nur eine
 * Projektion — Export liefert sie vollständig, Löschung entfernt sie hart
 * und löscht den Stripe-Customer best-effort mit (Stripe behält steuerlich
 * Pflichtiges selbst; das ist deren Compliance-Bereich).
 *
 * LESEN IST STRENG (SEC-026, Teil 2): hier stand an allen vier Lesevorgängen
 * ein `catch` auf leer. Ein 500 hiess „kein Kunde, kein Abo", die Löschung
 * meldete Erfolg, das Konto verschwand — und mit ihm die einzige Spur zum
 * Stripe-Kunden. Die Tabellen gehören zum Layer und existieren, wo er läuft;
 * ein Lesefehler ist deshalb ein Fehler.
 *
 * `stripe_settings.updatedBy` (SEC-026, 2026-11-15): wer zuletzt die Stripe-
 * Schlüssel der Instanz gesetzt hat, steht als userId an der EINEN Zeile.
 * Gelesen werden NUR `$id` und `updatedBy` (`Query.select`) — die Zeile trägt
 * die verschlüsselten Schlüssel, und die haben in einer Auskunft, einem Log
 * oder auch nur im Speicher dieses Pfads nichts verloren. Gefiltert wird im
 * Code: die Tabelle hat genau eine Zeile, und so hängt nichts daran, ob die
 * Spalte abfragbar ist. Die Tabelle fehlt auf Instanzen ohne Migration
 * billing-002 (z. B. dem Silo `apps/comments`) — das ist die eine Nachsicht
 * von `listAllRowsIfTableExists`. Die Zeile bleibt (sie IST die Konfiguration
 * der Instanz), nur der Verweis auf das Konto wird geleert.
 */
async function listStripeSettingsUpdatedBy(event: H3Event, userId: string): Promise<string[]> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  // Bewusst NICHT `StripeSettingsRow`: der Typ sagt hier, was wirklich
  // geladen wird — die Schlüssel-Spalten sind nicht da.
  const rows = await listAllRowsIfTableExists<Models.Row & { updatedBy?: string }>(
    tablesDB, config.public.appwriteDatabaseId, STRIPE_SETTINGS_TABLE, [Query.select(['$id', 'updatedBy'])],
  )
  return rows.filter(row => row.updatedBy === userId).map(row => row.$id)
}

export async function billingExportUserData(event: H3Event, userId: string) {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const customers = await listAllRowsIfTableExists<BillingCustomerRow>(tablesDB, databaseId, BILLING_CUSTOMERS_TABLE, [Query.equal('userId', userId)])
  const subscriptions = await listAllRowsIfTableExists<BillingSubscriptionRow>(tablesDB, databaseId, BILLING_SUBSCRIPTIONS_TABLE, [Query.equal('userId', userId)])

  const stripeSettingsUpdated = (await listStripeSettingsUpdatedBy(event, userId)).length

  return {
    /** Wie oft diese Person als letzte die Stripe-Einstellungen gesetzt hat (0 oder 1). */
    stripeSettingsUpdated,
    customer: customers.map(c => ({ stripeCustomerId: c.stripeCustomerId, email: c.email, createdAt: c.$createdAt })),
    subscriptions: subscriptions.map(s => ({
      planId: s.planId, status: s.status, currentPeriodEnd: s.currentPeriodEnd,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd, createdAt: s.$createdAt,
    })),
  }
}

export async function billingDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  let deleted = 0

  const subscriptions = await listAllRowsIfTableExists<BillingSubscriptionRow>(tablesDB, databaseId, BILLING_SUBSCRIPTIONS_TABLE, [Query.equal('userId', userId)])
  for (const row of subscriptions) {
    await tablesDB.deleteRow({ databaseId, tableId: BILLING_SUBSCRIPTIONS_TABLE, rowId: row.$id })
    deleted++
  }

  const customers = await listAllRowsIfTableExists<BillingCustomerRow>(tablesDB, databaseId, BILLING_CUSTOMERS_TABLE, [Query.equal('userId', userId)])
  for (const row of customers) {
    await tablesDB.deleteRow({ databaseId, tableId: BILLING_CUSTOMERS_TABLE, rowId: row.$id })
    deleted++
    // Stripe-Customer best-effort löschen (kündigt aktive Abos mit) —
    // scheitert er, bleibt Stripe die Wahrheit, unsere Pflicht ist erfüllt.
    // Best effort heisst aber nicht still: einen Rest bei Stripe muss jemand
    // von Hand nachziehen können, also eine Log-Zeile. Nur die userId — kein
    // Stripe-Fehlertext (er nennt Kunden-Id und Details des Kontos).
    try {
      const stripe = await useStripe(event)
      await stripe.customers.del(row.stripeCustomerId)
    }
    catch {
      logEvent('error', 'billing.stripe_customer_delete_failed', { userId })
    }
  }

  let anonymized = 0
  for (const rowId of await listStripeSettingsUpdatedBy(event, userId)) {
    await tablesDB.updateRow({ databaseId, tableId: STRIPE_SETTINGS_TABLE, rowId, data: { updatedBy: '' } })
    anonymized++
  }

  return { deleted, anonymized }
}
