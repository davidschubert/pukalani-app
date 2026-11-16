/**
 * DIE STRIPE-API-VERSION, MIT DER DIESE PLATTFORM SPRICHT (BE-016).
 *
 * EINE Konstante für alle Stellen, an denen eine Version gewählt wird: beide
 * Clients in `server/utils/stripe.ts` und das Anlegen des Webhook-Endpunkts
 * (`apps/control/server/api/control/stripe/webhook.post.ts`). Ohne Angabe
 * spräche der Client die Version, die das installierte SDK mitbringt, und der
 * Endpunkt sendete in der Standard-Version des Stripe-KONTOS — zwei
 * verschiedene Formen desselben Objekts, je nachdem, über welchen Weg es kam.
 *
 * Der Wert ist GENAU die Version des installierten SDK (stripe 23.1.0 ⇒
 * `2026-10-28.endive`). Ein Test (`tests/stripe-api-version.test.ts`) wird
 * rot, sobald ein SDK-Wechsel eine andere Version mitbringt — der Wechsel ist
 * dann eine bewusste Entscheidung (Typen, Webhook-Formen, Endpunkt neu
 * anlegen), kein Nebeneffekt von `pnpm update`.
 *
 * Ein BESTEHENDER Endpunkt bekommt die Version nur durch Neuanlage; die
 * Statuskarte unter /dashboard/stripe sagt, ob er abweicht.
 */
export const STRIPE_API_VERSION = '2026-10-28.endive' as const

export type StripeApiVersion = typeof STRIPE_API_VERSION

/** Sendet ein Endpunkt in der Version, die diese Plattform erwartet? */
export function stripeApiVersionMatches(apiVersion: string | null | undefined): boolean {
  return apiVersion === STRIPE_API_VERSION
}
