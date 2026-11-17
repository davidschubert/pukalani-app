import { createHash } from 'node:crypto'

/**
 * Idempotenz-Schlüssel für eine Einmal-Checkout-Session (BE-023).
 *
 * DAS PROBLEM: die Ticket-Route prüft vorab, ob schon ein Ticket da ist —
 * aber zwei schnelle Aufrufe (zwei Tabs, Doppelklick) kommen beide an dieser
 * Prüfung vorbei, BEVOR der Webhook das erste Ticket ausstellt. Ohne Schlüssel
 * legt Stripe zwei offene Sessions an, und beide lassen sich bezahlen.
 *
 * MIT Schlüssel gibt Stripe für denselben Schlüssel dieselbe Session zurück
 * (24 h lang), und eine Session lässt sich nur EINMAL bezahlen.
 *
 * WARUM EIN HASH ÜBER ALLES, WAS SICH UNTERSCHEIDEN KANN: Stripe lehnt einen
 * wiederverwendeten Schlüssel mit ANDEREN Parametern ab (400
 * `idempotency_error`). Ginge nur der Bereich ein, würde eine Preisänderung
 * im Dashboard oder ein Wechsel der Sprache (andere Rückkehr-Adresse) für
 * 24 h zu einem Fehler statt zu einem neuen Kauf. So entsteht dafür ein NEUER
 * Schlüssel, und nur der wirklich gleiche Kauf trifft dieselbe Session.
 *
 * WARUM IN server/utils UND NICHT IN shared/: `node:crypto` gehört nicht in
 * Code, den der Browser-Build erreichen kann — `shared/` ist im Layer für
 * beide Seiten da, und jede Hash-Funktion im Repo liegt deshalb serverseitig.
 * Die Funktion bleibt trotzdem PUR (unit-getestet).
 */
export interface CheckoutIdempotencyInput {
  /** Fachlicher Bereich des Kaufs, z. B. `event-ticket:<eventId>`. */
  scope: string
  /** Appwrite-Konto, das kauft. */
  userId: string
  /** Stripe-Kunde der Session — beim allerersten Kauf entsteht er erst. */
  customerId: string
  /** Aufgelöster Stripe-Price (nicht der lookup_key: der zeigt nach einer
   *  Preisänderung auf einen anderen Price). */
  priceId: string
  successUrl: string
  cancelUrl: string
  /** Metadaten der Session — gehen mit in die Parameter, also auch hierher. */
  metadata: Record<string, string>
}

/** Präfix macht den Schlüssel im Stripe-Log als unseren lesbar. */
const PREFIX = 'pk-checkout-'

/** Stripe erlaubt bis 255 Zeichen; 64 Hex-Zeichen (volles sha256) genügen. */
export const CHECKOUT_IDEMPOTENCY_KEY_LENGTH = PREFIX.length + 64

export function checkoutIdempotencyKey(input: CheckoutIdempotencyInput): string {
  // Feste Reihenfolge und sortierte Metadaten: dieselbe Eingabe ergibt
  // byte-genau denselben Text, egal in welcher Reihenfolge ein Aufrufer die
  // Metadaten-Schlüssel schreibt.
  const metadata = Object.keys(input.metadata).sort().map(key => [key, input.metadata[key]])
  const material = JSON.stringify([
    input.scope,
    input.userId,
    input.customerId,
    input.priceId,
    input.successUrl,
    input.cancelUrl,
    metadata,
  ])
  return PREFIX + createHash('sha256').update(material).digest('hex')
}

/**
 * Idempotenz-Schlüssel für das ANLEGEN des Stripe-Kunden eines Kontos (AR1 b).
 *
 * DAS PROBLEM: `ensureCustomer` sieht nach, ob das Konto schon einen Kunden
 * hat, und legt sonst einen an. Zwei GLEICHZEITIGE erste Käufe (zwei Tabs,
 * Doppelklick) sehen beide „keiner da" und legten bei Stripe ZWEI Kunden an.
 * Der Unique-Index `uq_user` ließ zwar nur eine Zeile stehen, aber bis zum
 * Aufräumen hingen zwei Sessions an zwei Kunden — und die Session-Idempotenz
 * oben (der Kunde geht in ihren Schlüssel ein) griff dann nicht.
 *
 * MIT diesem Schlüssel gibt Stripe beiden Aufrufen DENSELBEN Kunden zurück,
 * beide schreiben dieselbe Kunden-Id, der Unique-Index lässt eine Zeile
 * stehen, und der Verlierer liest genau diese Id nach. Der Schlüssel hält bei
 * Stripe 24 h — danach gilt allein die gespeicherte Zeile (sie steht dann
 * längst; das Lesen davor bleibt deshalb der Normalweg).
 *
 * WAS EINGEHT: das Appwrite-Projekt (dieselbe Konto-Id ist nur JE PROJEKT
 * eindeutig, ein Stripe-Konto kann mehrere Deployments bedienen), die
 * Konto-Id und die Parameter des Aufrufs (E-Mail, Name). Letzteres, weil
 * Stripe einen wiederverwendeten Schlüssel mit ANDEREN Parametern ablehnt
 * (400 `idempotency_error`): wer nach einem gescheiterten Speichern seinen
 * Namen ändert, bekommt so einen neuen Kunden statt eines Fehlers.
 * Gleichzeitige Aufrufe desselben Kontos tragen immer dieselben Werte.
 */
export interface CustomerIdempotencyInput {
  projectId: string
  userId: string
  email: string
  name: string
}

const CUSTOMER_PREFIX = 'pk-customer-'

export const CUSTOMER_IDEMPOTENCY_KEY_LENGTH = CUSTOMER_PREFIX.length + 64

export function customerIdempotencyKey(input: CustomerIdempotencyInput): string {
  const material = JSON.stringify([input.projectId, input.userId, input.email, input.name])
  return CUSTOMER_PREFIX + createHash('sha256').update(material).digest('hex')
}
