/**
 * Spiegelt die fehlenden Zustimmungen des eingeloggten Kontos (SEC-007) in
 * den Client — gesetzt von `server/middleware/07.consent-required.ts` auf
 * `event.context.consentMissing`, nur für Seiten und nur, wenn etwas fehlt.
 * Kein zusätzlicher Aufruf: in einer App ohne Pflicht bleibt die Liste leer.
 */
export default defineNuxtPlugin(() => {
  const event = useRequestEvent()
  const state = useConsentState()
  state.value = { missing: [...(event?.context.consentMissing ?? [])] }
})
