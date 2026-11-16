import type { ConsentKind } from '../../shared/types/consent'

/**
 * STAND DER ZUSTIMMUNG IM BROWSER (SEC-007): welche verlangten Zustimmungen
 * dem eingeloggten Konto fehlen. Gefüllt per SSR (`consent-state.server.ts`
 * aus `event.context.consentMissing`), nach einer Anmeldung im Browser oder
 * nach einem 403 `consent_required` per `GET /api/auth/consent`.
 *
 * Leer für Gäste und in jeder App, die nichts verlangt.
 */
export function useConsentState() {
  return useState<{ missing: ConsentKind[] }>('pukalani-consent-state', () => ({ missing: [] }))
}

/**
 * Bittet die Nachfrage, sich zu öffnen (Zähler statt Boolean: jede Bitte ist
 * ein neues Ereignis). Leser: `consent-prompt.client.ts`.
 */
export function useConsentPromptRequests() {
  return useState<number>('pukalani-consent-prompt-requests', () => 0)
}
