import { ID, Permission, Query, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { BILLING_CUSTOMERS_TABLE, type BillingCustomerRow } from '../../shared/types/billing'
import { customerIdempotencyKey } from './checkoutIdempotency'

/**
 * userId ↔ stripeCustomerId (B11): lazy beim ersten Checkout.
 *
 * ZWEI SICHERUNGEN gegen zwei gleichzeitige erste Käufe (AR1 b):
 * 1. Stripe: `customers.create` trägt einen festen Idempotenz-Schlüssel aus
 *    Projekt + Konto (`customerIdempotencyKey`) — beide Aufrufe bekommen
 *    DENSELBEN Kunden zurück (24 h lang; danach steht die Zeile längst).
 * 2. Appwrite: der Unique-Index `uq_user` lässt genau eine Zeile stehen.
 *    Verliert unser Anlegen (409), lesen wir die Gewinner-Zeile nach. Einen
 *    Stripe-Kunden löschen wir NUR, wenn er ein ANDERER ist als der des
 *    Gewinners (Schlüssel abgelaufen oder Parameter verschieden) — mit dem
 *    Schlüssel sind beide meist derselbe, und ihn zu löschen, nähme dem
 *    Gewinner seinen Kunden.
 */
export async function ensureCustomer(event: H3Event, user: Models.User<Models.Preferences>): Promise<BillingCustomerRow> {
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const existing = await admin.tablesDB.listRows<BillingCustomerRow>({
    databaseId,
    tableId: BILLING_CUSTOMERS_TABLE,
    queries: [Query.equal('userId', user.$id), Query.limit(1)],
  })
  if (existing.rows[0]) return existing.rows[0]

  const stripe = await useStripe(event)
  const email = user.email || ''
  const name = user.name || ''
  const customer = await stripe.customers.create({
    email: email || undefined,
    name: name || undefined,
    metadata: { userId: user.$id },
  }, {
    idempotencyKey: customerIdempotencyKey({
      // dasselbe Projekt, in das createAdminClient schreibt (Tenant gewinnt)
      projectId: event.context.tenant?.projectId ?? config.public.appwriteProjectId,
      userId: user.$id,
      email,
      name,
    }),
  }).catch(error => toStripeSafeError(error, 'customers.create fehlgeschlagen'))

  try {
    return await admin.tablesDB.createRow<BillingCustomerRow>({
      databaseId,
      tableId: BILLING_CUSTOMERS_TABLE,
      rowId: ID.unique(),
      data: { userId: user.$id, stripeCustomerId: customer.id, email: user.email ?? '' },
      permissions: [Permission.read(Role.user(user.$id))],
    })
  }
  catch (error) {
    // Unique-Rennen: der Gewinner steht — dessen Zeile nutzen
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 409) {
      const winner = await admin.tablesDB.listRows<BillingCustomerRow>({
        databaseId,
        tableId: BILLING_CUSTOMERS_TABLE,
        queries: [Query.equal('userId', user.$id), Query.limit(1)],
      })
      const row = winner.rows[0]
      if (row) {
        // Nur einen ECHTEN Doppel-Kunden aufräumen (best-effort), nie den
        // gemeinsamen aus dem Idempotenz-Schlüssel.
        if (row.stripeCustomerId !== customer.id) {
          await stripe.customers.del(customer.id).catch(() => {})
        }
        return row
      }
    }
    throw toH3Error(error, 'Could not prepare checkout')
  }
}
