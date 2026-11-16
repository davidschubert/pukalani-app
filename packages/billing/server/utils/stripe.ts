import Stripe from 'stripe'
import type { H3Event } from 'h3'
import type { PukalaniBillingConfig } from '../../shared/types/billing'
import { rejectOneTimeLookupKey, rejectSubscriptionLookupKey } from '../../shared/lookupKeys'
import { resolveBillingReturnOrigin } from '../../shared/returnOrigin'
// Die Version steht fest (BE-016) — Begründung in shared/stripeApiVersion.ts.
import { STRIPE_API_VERSION } from '../../shared/stripeApiVersion'

/**
 * „Fehlt dauerhaft" nur EINMAL pro Prozess melden.
 *
 * Warum das nötig ist: die betroffenen Meldungen hängen an ÖFFENTLICHEN,
 * unauthentifizierten Routen (`/api/billing/prices`, `/api/stripe/webhook`).
 * Eine fehlende Konfiguration ändert sich innerhalb eines Prozesses nicht —
 * jede weitere Zeile trägt also null Information, aber jeder Fremde im Netz
 * kann sie auslösen. Am 2026-07-30 auf `comments` gemessen: 16 Zeilen im
 * laufenden Log. Kein Vorfall, aber ein Hebel, den man nicht liegen lässt.
 * Beim Neustart ist der Merker wieder leer — eine echte Fehlkonfiguration
 * bleibt also nach jedem Deploy sichtbar.
 */
const warned = new Set<string>()
export function warnMisconfiguredOnce(key: string, message: string): void {
  if (warned.has(key)) return
  warned.add(key)
  console.error(message)
}

/** Nur für Tests: Merker leeren. */
export function __resetMisconfigurationWarnings(): void {
  warned.clear()
}

/**
 * Stripe-Server-Fundament (B8/B10): Key aus der Auflösung DB-vor-Env
 * (`resolveStripeSecretKey`, F55). Fehlender Key → generischer 500 +
 * Server-Log (kein Boot-Crash, keine Details an Clients).
 *
 * ASYNC SEIT F55, und das ist keine Kosmetik: der Key kann seit der
 * Dashboard-Verwaltung in einer Appwrite-Zeile liegen, und die liest man
 * nicht synchron. Alle Aufrufer wurden mitgezogen (`await useStripe(event)`);
 * der Typ erzwingt das bei jedem neuen dazu.
 *
 * DER CLIENT WIRD AM KEY GECACHT, nicht als nacktes Singleton. Ein Singleton
 * überlebte einen Key-Wechsel über die Oberfläche: der Betreiber trägt einen
 * neuen Key ein, die Karte meldet Erfolg — und der laufende Prozess spricht
 * bis zum nächsten Deploy mit dem alten. Auf einem Wechsel test → live wäre
 * das genau der Fehler, den F55 verhindern soll.
 */
let stripeClient: { key: string, client: Stripe } | null = null

export async function useStripe(event: H3Event): Promise<Stripe> {
  const { value: key } = await resolveStripeSecretKey(event)
  if (!key) {
    warnMisconfiguredOnce('secretKey', '[billing] Kein Stripe-Secret-Key — weder in stripe_settings noch als NUXT_STRIPE_SECRET_KEY. Billing ist enabled, aber nicht funktionsfähig.')
    throw createError({ status: 500, statusText: 'Payment provider not configured' })
  }
  if (stripeClient?.key === key) return stripeClient.client
  // Der Preis-Cache gehört zum ALTEN Key: Test-Price-Ids an einem frischen
  // Live-Client wären im Go-Live-Fenster bis zu 5 Minuten lang ein 502 auf
  // jedem Checkout — genau dann, wenn jemand zuschaut (Audit F55, MEDIUM 4).
  priceCache.clear()
  stripeClient = { key, client: new Stripe(key, { apiVersion: STRIPE_API_VERSION }) }
  return stripeClient.client
}

/**
 * Stripe-Client zu einem MITGEGEBENEN Key — für die Prüfung eines gerade
 * eingetippten Schlüssels, BEVOR er gespeichert wird (F55). Bewusst ohne
 * Cache und ohne Auflösung: dieser Client soll ausdrücklich nicht der der
 * Instanz sein.
 */
export function stripeClientForKey(key: string): Stripe {
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION })
}

/** Stripe-Fehler → generische h3-Fehler (keine Provider-Details leaken) */
export function toStripeSafeError(error: unknown, log: string): never {
  console.error(`[billing] ${log}:`, error)
  throw createError({ status: 502, statusText: 'Payment provider unavailable' })
}

/** Config-Gate: pukalani.billing (deep-merged) — 404 solange nicht aktiviert */
export async function requireBillingEnabled(event: H3Event): Promise<PukalaniBillingConfig> {
  const config = await getBillingConfig(event)
  if (!config.enabled) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  return config
}

export async function getBillingConfig(_event: H3Event): Promise<PukalaniBillingConfig> {
  // app.config ist build-time gemergt — im Nitro-Kontext ohne Event abrufbar
  const appConfig = useAppConfig() as { pukalani?: { billing?: Partial<PukalaniBillingConfig> } }
  const billing = appConfig.pukalani?.billing
  return {
    enabled: billing?.enabled ?? false,
    currency: billing?.currency ?? 'eur',
    trialDays: billing?.trialDays ?? 0,
    plans: billing?.plans ?? [],
    oneTimeLookupKeys: billing?.oneTimeLookupKeys,
  }
}

/**
 * Rücksprung-Ziel für Checkout/Portal — NICHT aus dem `Host`-Header, sondern
 * aus der konfigurierten Basis-URL der App (Begründung: shared/returnOrigin.ts).
 * Ohne Konfiguration (lokale Entwicklung) bleibt der Request-Origin.
 */
export function billingReturnOrigin(event: H3Event): string {
  const publicConfig = useRuntimeConfig(event).public as { i18n?: { baseUrl?: unknown } }
  const configured = typeof publicConfig.i18n?.baseUrl === 'string' ? publicConfig.i18n.baseUrl : ''
  return resolveBillingReturnOrigin(getRequestURL(event).origin, configured)
}

/**
 * DARF DIESER PREIS ÜBER EINEN EINMAL-CHECKOUT VERKAUFT WERDEN?
 *
 * Zwei Prüfungen, die zusammengehören (s. shared/lookupKeys.ts):
 *  1. der lookup_key gegen die Allowlist (Plan-Keys sind hier verboten;
 *     `oneTimeLookupKeys` verengt weiter, wenn gesetzt),
 *  2. die SORTE des aufgelösten Stripe-Price: `one_time`. Das ist die Kante,
 *     die auch ohne konfigurierte Liste hält — ein durchgereichter Fremd-Key
 *     kann so nie ein Abo starten.
 *
 * 400 statt 404: der Aufrufer hat etwas Falsches GESCHICKT. Der Grund reist
 * als `data.code` (→ `reason` im Envelope), damit eine Oberfläche „diesen
 * Preis gibt es hier nicht" von „Provider kaputt" unterscheiden kann.
 */
export async function resolveOneTimePrice(event: H3Event, lookupKey: string): Promise<Stripe.Price> {
  const config = await getBillingConfig(event)
  const rejection = rejectOneTimeLookupKey(lookupKey, config.plans, config.oneTimeLookupKeys)
  if (rejection) {
    console.error(`[billing] Einmal-Checkout abgelehnt (${rejection}) für lookup_key '${lookupKey}'.`)
    throw createError({ status: 400, statusText: 'Price is not purchasable here', data: { code: rejection } })
  }

  const price = await resolvePriceByLookupKey(event, lookupKey)
  if (price.type !== 'one_time') {
    console.error(`[billing] Einmal-Checkout abgelehnt: lookup_key '${lookupKey}' zeigt auf einen ${price.type}-Price.`)
    throw createError({ status: 400, statusText: 'Price is not purchasable here', data: { code: 'not_a_one_time_price' } })
  }
  return price
}

/** Abo-Checkout: nur deklarierte Plan-Keys (harte Allowlist). */
export async function resolvePlanPrice(event: H3Event, lookupKey: string): Promise<Stripe.Price> {
  const config = await getBillingConfig(event)
  const rejection = rejectSubscriptionLookupKey(lookupKey, config.plans)
  if (rejection) {
    console.error(`[billing] Abo-Checkout abgelehnt (${rejection}) für lookup_key '${lookupKey}' — kein Plan in pukalani.billing.plans nennt ihn.`)
    throw createError({ status: 400, statusText: 'Unknown plan price', data: { code: rejection } })
  }
  return resolvePriceByLookupKey(event, lookupKey)
}

/**
 * lookup_key → Stripe-Price, in-memory gecacht (TTL 5 min) — B2: Prices leben
 * im Stripe-Dashboard, der Layer referenziert nur stabile lookup_keys.
 */
const PRICE_TTL_MS = 5 * 60_000
const priceCache = new Map<string, { at: number, price: Stripe.Price }>()

/**
 * Preis-Cache von außen leeren — für die EINE Stelle, die Preise UMBAUT
 * (Betrags-Drift im Dashboard: neuer Price, lookup_key umgezogen, alter
 * archiviert). Ohne die Leerung lösten Checkouts bis zu 5 Minuten auf die
 * ARCHIVIERTE Price-Id auf (Session-Audit 2026-08-09, HIGH 2).
 */
export function invalidateStripePriceCache(): void {
  priceCache.clear()
}

export async function resolvePriceByLookupKey(event: H3Event, lookupKey: string): Promise<Stripe.Price> {
  // ERST der Client, DANN der Cache — und das ist die halbe Sicherung: die
  // Key-Wechsel-Leerung wohnt in useStripe(), und ein Cache-Treffer VOR dem
  // Client-Aufruf liefe an ihr vorbei (Test-Price-Ids am frischen Live-Client,
  // 502 im Go-Live-Fenster — Session-Audit 2026-08-09, HIGH 1: genau der
  // Checkout-Pfad traf den Cache zuerst, weil ensureCommunityCustomer bei
  // bestehendem Customer früh zurückkehrt).
  const stripe = await useStripe(event)

  const cached = priceCache.get(lookupKey)
  if (cached && Date.now() - cached.at < PRICE_TTL_MS) return cached.price
  const res = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 })
    .catch(error => toStripeSafeError(error, `prices.list für lookup_key '${lookupKey}' fehlgeschlagen`))
  const price = res.data[0]
  if (!price) {
    console.error(`[billing] Kein aktiver Stripe-Price mit lookup_key '${lookupKey}' — im Dashboard anlegen.`)
    throw createError({ status: 500, statusText: 'Payment provider not configured' })
  }
  priceCache.set(lookupKey, { at: Date.now(), price })
  return price
}
