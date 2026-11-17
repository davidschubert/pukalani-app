import type { H3Event } from 'h3'
import type Stripe from 'stripe'
import type { SubscriptionStatus } from '../../shared/types/billing'
import { CHECKOUT_PAYMENT_METHOD_TYPES } from '../../shared/paymentMethods'
import { checkoutIdempotencyKey } from './checkoutIdempotency'
import { mayFulfillCheckout } from './webhookMapping'

/**
 * Erfüllungs-Vertrag für One-time-Checkouts (mode 'payment', §5b):
 * billing kennt KEINE anderen Produkt-Layer (A14) — die APP registriert
 * hier, was nach checkout.session.completed passieren soll (z. B.
 * grantEventTicket aus dem events-Layer). Best-effort im Webhook:
 * ein werfender Fulfiller lässt den Webhook 500en → Stripe retryt
 * (die Fulfiller MÜSSEN deshalb idempotent sein).
 */
export type CheckoutFulfillment = (event: H3Event, session: Stripe.Checkout.Session) => Promise<void>

const fulfillments: CheckoutFulfillment[] = []

export function registerCheckoutFulfillment(handler: CheckoutFulfillment): void {
  fulfillments.push(handler)
}

export async function runCheckoutFulfillments(event: H3Event, session: Stripe.Checkout.Session): Promise<void> {
  for (const handler of fulfillments) {
    await handler(event, session)
  }
}

/**
 * Abo-Lifecycle-Vertrag (M8): billing verifiziert Signatur + Idempotenz und
 * reicht dann ein bereits geprüftes Subscription-Update an App-registrierte
 * Handler weiter (z. B. Community-Billing des Control Plane) — nie rohes Stripe-JSON,
 * A14 wie beim Checkout-Vertrag. Läuft NUR für nicht-stale, tatsächlich
 * angewandte Upserts. Handler MÜSSEN idempotent sein (Webhook-Retry → 500
 * lässt Stripe wiederholen).
 */
export interface VerifiedSubscriptionUpdate {
  stripeSubscriptionId: string
  stripeCustomerId: string
  /** Stripe-Statusraum 1:1 (B3) — 'canceled' kommt erst zum echten Ende
   *  (cancel_at_period_end lässt den Status bis dahin auf 'active'). */
  status: SubscriptionStatus
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  /** subscription_data.metadata aus dem Checkout (z. B. communityId, plan).
   *  ACHTUNG: seit dem Checkout EINGEFROREN — ein Plan-Wechsel im Kundenportal
   *  fasst sie nicht an. Wer den GELTENDEN Plan braucht, liest `lookupKey`. */
  metadata: Record<string, string>
  /** `lookup_key` des ersten Subscription-Items = was gerade wirklich bezahlt
   *  wird. '' wenn der Price keinen trägt. */
  lookupKey: string
  eventCreated: number
}

export type SubscriptionFulfillment = (event: H3Event, update: VerifiedSubscriptionUpdate) => Promise<void>

const subscriptionFulfillments: SubscriptionFulfillment[] = []

export function registerSubscriptionFulfillment(handler: SubscriptionFulfillment): void {
  subscriptionFulfillments.push(handler)
}

export async function runSubscriptionFulfillments(event: H3Event, update: VerifiedSubscriptionUpdate): Promise<void> {
  for (const handler of subscriptionFulfillments) {
    await handler(event, update)
  }
}

/** Kompakte Sicht auf EIN Stripe-Abo eines Customers (für Fulfillment-Checks). */
export interface CustomerSubscriptionSummary {
  id: string
  /** Stripe-Statusraum 1:1 (active/trialing/past_due/canceled/…). */
  status: string
  metadata: Record<string, string>
}

/**
 * Alle Abos eines Stripe-Customers, direkt von Stripe (#6b): Autorität für
 * Fulfillment-Entscheidungen wie „hat die Community noch ein anderes aktives
 * Abo?" — die lokale Abbild-Row kann durch out-of-order-Webhooks stale sein,
 * Stripe selbst nicht. Wirft bei API-Fehlern (Aufrufer entscheidet fail-closed).
 */
export async function listCustomerSubscriptionSummaries(event: H3Event, stripeCustomerId: string): Promise<CustomerSubscriptionSummary[]> {
  const stripe = await useStripe(event)
  const { data } = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: 'all',
    limit: 100,
  }).catch(error => toStripeSafeError(error, 'subscriptions.list fehlgeschlagen'))
  return data.map(subscription => ({
    id: subscription.id,
    status: subscription.status,
    metadata: (subscription.metadata ?? {}) as Record<string, string>,
  }))
}

/**
 * Generische Abo-Checkout-Session für App-Kompositionen: wie
 * createPaymentCheckoutSession, aber mode 'subscription' und metadata AUCH auf
 * der Subscription (subscription_data) — nur so tragen spätere
 * customer.subscription.*-Events die Zuordnung (z. B. communityId).
 * BEWUSST ohne den 409-„bereits aktiv"-Check der App-Abo-Route: ein Konto
 * darf mehrere Abos halten (ein Owner mit zwei Communities hat zwei).
 */
export async function createSubscriptionCheckoutSession(event: H3Event, input: {
  lookupKey: string
  metadata: Record<string, string>
  successUrl: string
  cancelUrl: string
  /** Expliziter Stripe-Customer (#7a, z. B. der Community-Customer der App-
   *  Komposition). Ohne Angabe wie bisher: der Customer des eingeloggten
   *  Users (ensureCustomer). */
  stripeCustomerId?: string
}): Promise<string> {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  await requireBillingEnabled(event)

  const customerId = input.stripeCustomerId ?? (await ensureCustomer(event, user)).stripeCustomerId
  // HARTE Allowlist (Audit 2026-08-02): nur Preise, die ein Plan in
  // pukalani.billing.plans nennt. Vorher war `lookupKey` ein freier Parameter
  // — die Garantie hing allein am Aufrufer.
  const price = await resolvePlanPrice(event, input.lookupKey)
  const stripe = await useStripe(event)

  const metadata = { ...input.metadata, userId: user.$id }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: user.$id,
    metadata,
    subscription_data: { metadata },
    // F20: nur Karte — keine verzögert abrechnenden Methoden.
    // Begründung in shared/paymentMethods.ts.
    allowed_payment_method_types: [...CHECKOUT_PAYMENT_METHOD_TYPES],
    // §6: Stripe Tax + Pflicht-Rechnungsadresse (wie alle Checkouts)
    automatic_tax: { enabled: true },
    billing_address_collection: 'required',
    customer_update: { address: 'auto', name: 'auto' },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  }).catch(error => toStripeSafeError(error, 'checkout.sessions.create (subscription) fehlgeschlagen'))

  if (!session.url) {
    throw createError({ status: 502, statusText: 'Payment provider unavailable' })
  }
  return session.url
}

/** Fachlicher Grund (`data.code` ⇒ Envelope `reason`): dieser Kauf ist
 *  schon bezahlt, das Ausstellen läuft noch. */
export const ALREADY_PAID_REASON = 'already_paid'

/**
 * Die bezahlte Session GENAU dieses Kaufs unter den abgeschlossenen Sessions
 * eines Kunden: Metadaten stimmen in JEDEM Schlüssel überein (Kauf-Ziel wie
 * `eventId` + `userId`), und der Zahlungs-Status ist einer, den auch der
 * Webhook erfüllen würde (`mayFulfillCheckout`). PURE.
 *
 * Die Rückkehr-Adresse zählt bewusst NICHT: wer auf Deutsch bezahlt hat,
 * hat auch auf Englisch schon bezahlt.
 */
export function findPaidCheckoutSession<T extends Pick<Stripe.Checkout.Session, 'metadata' | 'payment_status'>>(
  sessions: readonly T[],
  metadata: Record<string, string>,
): T | null {
  const keys = Object.keys(metadata)
  if (keys.length === 0) return null
  return sessions.find(session =>
    mayFulfillCheckout(session.payment_status)
    && keys.every(key => session.metadata?.[key] === metadata[key]),
  ) ?? null
}

/**
 * Generische One-time-Checkout-Session (mode 'payment') für App-Kompositionen
 * — z. B. Event-Tickets: die APP-Route validiert das Zielobjekt (events-Layer)
 * und ruft dann diese Billing-Utility (kein Cross-Layer-Import nötig).
 *
 * `idempotencyScope` (BE-023): fachlicher Bereich eines Kaufs, den es je
 * Konto nur EINMAL geben darf (z. B. `event-ticket:<eventId>`). Daraus wird
 * ein Stripe-Idempotenz-Schlüssel — zwei schnelle Aufrufe bekommen dieselbe
 * Session statt zwei bezahlbarer. Ohne Bereich wie bisher (kein Schlüssel).
 * Begründung und Zusammensetzung: checkoutIdempotency.ts.
 */
export async function createPaymentCheckoutSession(event: H3Event, input: {
  lookupKey: string
  metadata: Record<string, string>
  successUrl: string
  cancelUrl: string
  idempotencyScope?: string
}): Promise<string> {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  await requireBillingEnabled(event)

  const customer = await ensureCustomer(event, user)
  // Allowlist + Preis-SORTE (Audit 2026-08-02): nie ein Plan-Key, nie ein
  // wiederkehrender Price, und — falls konfiguriert — nur was
  // pukalani.billing.oneTimeLookupKeys nennt. Begründung: shared/lookupKeys.ts.
  const price = await resolveOneTimePrice(event, input.lookupKey)
  const stripe = await useStripe(event)

  const metadata = { ...input.metadata, userId: user.$id }

  // AR1 b: zwischen Bezahlen und Ausstellen (der Webhook stellt aus) sieht
  // die Route des Aufrufers noch „nichts gekauft". Ein erneuter Klick traf
  // dann denselben Idempotenz-Schlüssel, Stripe spielte die schon BEZAHLTE
  // Session noch einmal zurück, und der Mensch landete auf einer
  // abgeschlossenen Bezahlseite (bei anderer Sprache sogar auf einer NEUEN,
  // zweiten). Darum fragen wir Stripe vorher: gibt es für genau diesen Kauf
  // eine bezahlte Session? ⇒ 409 `already_paid`. Nur mit Bereich — der sagt,
  // dass es den Kauf je Konto nur einmal gibt. Kann Stripe nicht antworten,
  // lehnen wir ab (toStripeSafeError), statt ungeprüft zu verkaufen.
  if (input.idempotencyScope) {
    const { data: completed } = await stripe.checkout.sessions.list({
      customer: customer.stripeCustomerId,
      status: 'complete',
      limit: 100,
    }).catch(error => toStripeSafeError(error, 'checkout.sessions.list (payment) fehlgeschlagen'))
    if (findPaidCheckoutSession(completed, metadata)) {
      throw createError({
        status: 409,
        statusText: 'Already paid',
        data: { code: ALREADY_PAID_REASON },
      })
    }
  }

  const requestOptions = input.idempotencyScope
    ? {
        idempotencyKey: checkoutIdempotencyKey({
          scope: input.idempotencyScope,
          userId: user.$id,
          customerId: customer.stripeCustomerId,
          priceId: price.id,
          successUrl: input.successUrl,
          cancelUrl: input.cancelUrl,
          metadata,
        }),
      }
    : undefined

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customer.stripeCustomerId,
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: user.$id,
    metadata,
    // F20: nur Karte — keine verzögert abrechnenden Methoden.
    // Begründung in shared/paymentMethods.ts.
    allowed_payment_method_types: [...CHECKOUT_PAYMENT_METHOD_TYPES],
    // §6: Stripe Tax an (B2C) + Pflicht-Rechnungsadresse
    automatic_tax: { enabled: true },
    billing_address_collection: 'required',
    customer_update: { address: 'auto', name: 'auto' },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  }, requestOptions).catch(error => toStripeSafeError(error, 'checkout.sessions.create (payment) fehlgeschlagen'))

  if (!session.url) {
    throw createError({ status: 502, statusText: 'Payment provider unavailable' })
  }
  return session.url
}
