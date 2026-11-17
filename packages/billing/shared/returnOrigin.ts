/**
 * WOHIN DARF STRIPE ZURÜCKSCHICKEN? (Audit 2026-08-02)
 *
 * `success_url`/`cancel_url`/`return_url` wurden aus `getRequestURL(event)
 * .origin` gebaut — also aus dem `Host`-Header. Auf einer Wildcard-Site
 * (`*.pukalani.app` → EIN nginx-Server-Block) reicht der Header ungeprüft bis
 * in den Node-Prozess: wer einen Kunden auf `/api/billing/checkout` mit
 * gefälschtem Host lotst, bekommt eine ECHTE Stripe-Checkout-URL, die nach
 * der Zahlung auf einen fremden Host zurückführt. Der Kauf ist echt, das Ziel
 * nicht — und die Adresszeile trug bis dahin Stripes Domain.
 *
 * Das Muster, das es schon richtig macht, ist `apps/control/server/utils/
 * communityCheckout.ts`: dort baut der SERVER die URL aus `tenants.host`. Die
 * billing-eigenen Routen haben keinen Mandanten (sie laufen in Silo-Apps:
 * `apps/comments`, `apps/control`), aber sie haben dieselbe Sorte Wahrheit —
 * die konfigurierte Basis-URL der App (`NUXT_PUBLIC_I18N_BASE_URL`).
 *
 * REGEL (seit 2026-11-17 mit vier Stufen, SE1 f): der Request-Host wird nicht
 * einmal angesehen, solange irgendeine feste Wahrheit da ist.
 *  1. die AKTIVE EIGENE DOMAIN der Einzel-Site (Vertrag `resolveSiteOrigin`
 *     im Core — dieselbe Abfrage wie Mails und OAuth-Rückwege seit GA1 P23),
 *  2. die konfigurierte Basis-URL (`NUXT_PUBLIC_I18N_BASE_URL`),
 *  3. die feste Adresse der App (`NUXT_PUBLIC_APP_URL`, Pflicht auf jeder
 *     Site mit Anmeldung) — vorher fiel eine Site ohne Basis-URL hier schon
 *     auf den Request-Host zurück,
 *  4. der Request-Origin — der Fall „lokale Entwicklung". Kommt er auf einem
 *     öffentlichen Host zum Zug, schreibt der Aufrufer eine Fehlerzeile
 *     (`source: 'request'`), denn dann fehlt eine Pflicht-Einstellung.
 * Das ist bewusst strenger als `core/shared/seoOrigin.ts`, das nur das SCHEMA
 * aus der Env nimmt: SEO darf pro Mandanten-Host variieren, ein
 * Zahlungs-Rücksprung nicht.
 *
 * PURE + unit-getestet, deshalb in shared/ und ohne Nuxt-Abhängigkeit.
 */
export interface BillingReturnOriginInput {
  /** Aktive eigene Domain der Site als Origin, sonst leer. */
  siteOrigin?: string | null
  /** `NUXT_PUBLIC_I18N_BASE_URL` */
  baseUrl?: string | null
  /** `NUXT_PUBLIC_APP_URL` */
  appUrl?: string | null
  /** Origin der Anfrage — nur der letzte Ausweg. */
  requestOrigin?: string | null
}

export type BillingReturnOriginSource = 'site-domain' | 'base-url' | 'app-url' | 'request' | 'none'

export interface BillingReturnOrigin {
  origin: string
  source: BillingReturnOriginSource
}

export function resolveBillingReturnOrigin(input: BillingReturnOriginInput): BillingReturnOrigin {
  const steps: [BillingReturnOriginSource, string | null | undefined][] = [
    ['site-domain', input.siteOrigin],
    ['base-url', input.baseUrl],
    ['app-url', input.appUrl],
    ['request', input.requestOrigin],
  ]
  for (const [source, value] of steps) {
    const origin = originOf(value)
    if (origin) return { origin, source }
  }
  return { origin: '', source: 'none' }
}

function originOf(value: string | undefined | null): string {
  const raw = (value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    // Nur Web-Schemata — ein `javascript:`/`data:`-Wert aus einer
    // fehlgeleiteten Env hätte hier nichts zu suchen.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.origin
  }
  catch {
    return ''
  }
}
