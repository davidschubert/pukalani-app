import type { H3Event } from 'h3'
import {
  APP_URL_MISSING_LOG_LINE,
  decideTrustedOrigin,
  shouldReportAppUrlMissing,
  type TrustedOrigin,
} from '../../shared/trustedOrigin'

/**
 * Die Adresse für Mail-Links und OAuth-Rückwege (SEC-010) — Regel und
 * Begründung in `shared/trustedOrigin.ts`.
 *
 * „Host geprüft" heißt: `00.tenant.ts` hat einen Mandanten gesetzt
 * (`event.context.tenant`) oder einen Kontroll-Host erkannt
 * (`event.context.controlCenter`). Beides steht nur, wenn die
 * Mandanten-Auflösung an ist — ein Silo kommt nie in diesen Zweig.
 *
 * Billing hat eine eigene Regel (`resolveBillingReturnOrigin`) und bleibt
 * davon unberührt.
 */

/** Einmal je Prozess — sonst schriebe jede Reset-Anfrage eine Zeile. */
let appUrlMissingReported = false

export function resolveTrustedOrigin(event: H3Event): TrustedOrigin {
  const appConfig = useAppConfig() as { pukalani?: { tenancy?: { enabled?: boolean } } }
  const config = useRuntimeConfig(event)
  const dev = Boolean(import.meta.dev)
  const result = decideTrustedOrigin({
    tenancyEnabled: appConfig.pukalani?.tenancy?.enabled === true,
    hostVerified: Boolean(event.context.tenant) || event.context.controlCenter === true,
    requestOrigin: getRequestURL(event).origin,
    appUrl: config.public.appUrl,
    dev,
  })
  if (!appUrlMissingReported && shouldReportAppUrlMissing(result, dev)) {
    appUrlMissingReported = true
    console.error(APP_URL_MISSING_LOG_LINE)
  }
  return result
}

/** Nur für Tests: die Einmal-Sperre der Fehlerzeile zurücksetzen. */
export function __resetTrustedOriginReport(): void {
  appUrlMissingReported = false
}
