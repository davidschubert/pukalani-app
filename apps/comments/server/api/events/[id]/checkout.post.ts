import type { EventRow } from '../../../../../../packages/events/shared/types/event'

/**
 * Ticket-Checkout für paid-Events — APP-Route (A14: die App komponiert
 * events + billing, die Layer kennen sich nicht). Validiert das Event,
 * erzeugt die One-time-Checkout-Session (billing-Utility
 * createPaymentCheckoutSession) mit metadata.eventId — der Webhook-
 * Fulfiller (billing-fulfillment-Plugin) stellt danach das Ticket über
 * grantEventTicket aus. hasEventTicket/grantEventTicket kommen per
 * Auto-Import aus dem events-Layer (App darf beide kennen).
 *
 * DIESELBEN WACHEN WIE DIE TERMIN-ROUTEN DES LAYERS (NF1 a), in derselben
 * Reihenfolge wie die Zusage (`packages/events/server/api/events/[id]/rsvp.post.ts`)
 * und alle VOR dem ersten Datenbank- oder Stripe-Zugriff:
 *  1. Produkt des Plans (`requirePlanProduct`, P4) — ohne `events` gibt es
 *     auch keinen Ticket-Kauf (404 wie jede Termin-Route).
 *  2. Zugehörigkeit (SEC-030): `requireCommunityParticipant`, NICHT
 *     `requireCommunityMembership`. Ein Ticket zu kaufen ist wie Zusagen oder
 *     Einschreiben ein ERSTER eigener Schritt in der Community, kein Ändern
 *     von Eigenem — bei offener Registrierung ist er der Beitritt (A5),
 *     geschlossen oder entzogen 403 `not_a_member`. Ohne
 *     `openDuringSuspension`: anders als die Zusage hat der Kauf keinen
 *     Rücknahme-Zweig, in einer gesperrten Community bleibt er zu.
 *  3. Wartungs-Sperre (`assertEventsWritable`, utils/eventPolicy.ts) — der
 *     Kauf endet in einem Schreibvorgang (das Ticket), er friert mit ein.
 * Die Bremse davor steht in `core/server/middleware/05.rate-limit.ts`
 * (`events:checkout`, jeder Ruf legt bei Stripe an).
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'events')
  const user = await requireCommunityParticipant(event)
  await assertEventsWritable(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const row = await admin.tablesDB.getRow<EventRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'events',
    rowId: id,
  }).catch((error) => { throw toH3Error(error, 'Event not found') })

  if (row.status !== 'published' || (row.access ?? 'free') !== 'paid' || !row.priceLookupKey) {
    throw createError({ status: 409, statusText: 'Event is not purchasable' })
  }
  if (await hasEventTicket(event, id, user.$id)) {
    throw createError({ status: 409, statusText: 'Ticket already owned' })
  }

  // Rücksprung-Ziel wie bei Abo und Portal: eigene Domain bzw. konfigurierte
  // Adresse, nicht der Name der Anfrage (SE1 f, billing/shared/returnOrigin.ts).
  const origin = await billingReturnOrigin(event)
  const localePrefix = typeof getQuery(event).locale === 'string' && getQuery(event).locale === 'de' ? '/de' : ''
  const url = await createPaymentCheckoutSession(event, {
    lookupKey: row.priceLookupKey,
    metadata: { eventId: id },
    successUrl: `${origin}${localePrefix}/events/${id}?ticket=success`,
    cancelUrl: `${origin}${localePrefix}/events/${id}`,
    // BE-023: die Ticket-Prüfung oben hält zwei GLEICHZEITIGE Aufrufe (zwei
    // Tabs) nicht auf — erst der Webhook stellt das Ticket aus. Mit Bereich
    // bekommt derselbe Mensch für dasselbe Event dieselbe Stripe-Session, und
    // die lässt sich nur einmal bezahlen.
    idempotencyScope: `event-ticket:${id}`,
  })

  return { url }
})
