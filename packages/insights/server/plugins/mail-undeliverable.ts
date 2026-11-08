import { insightsNewsletterMailUndeliverable } from '../utils/insightsNewsletterUnsubscribe'

/**
 * Newsletter-Abonnenten hängen am Resend-Webhook des core (RS1 b): meldet
 * Resend eine Adresse als unzustellbar (harter Bounce, Beschwerde, gesperrt),
 * wird ihr Abonnent abgemeldet — derselbe Schreibvorgang wie beim Klick auf
 * den Abmelde-Link. Vertrag: `registerMailUndeliverableHandler`
 * (core/server/utils/mailUndeliverable.ts), Muster wie `user-data.ts`.
 *
 * Das Produkt-Gate prüft der Handler bei JEDEM Aufruf, nicht hier: Nitro lädt
 * Plugins alphabetisch, `product-manifest.ts` läuft nicht garantiert vorher.
 */
export default defineNitroPlugin(() => {
  registerMailUndeliverableHandler({
    id: 'insights',
    handle: (event, input) => insightsNewsletterMailUndeliverable(event, input),
  })
})
