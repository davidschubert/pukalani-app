import { stripAddressesInText } from '../../shared/logAddress'

/**
 * Client-Error-Reporting (pukalani.observability.clientErrors): meldet Browser-
 * Fehler (Vue-Render/Setup, unbehandelte Promise-Rejections, window.onerror)
 * an POST /api/telemetry/error — dort landen sie als strukturierte JSON-Zeile
 * im Server-Log. Dedupliziert pro Message, hart auf 10 Meldungen/Session
 * begrenzt (ein Fehler in einer Render-Schleife darf keinen Request-Sturm
 * auslösen); die Route ist zusätzlich rate-limited.
 *
 * Adressen reisen ohne Query und Fragment (SEC-013): `url` ist nur der Pfad,
 * und was in Meldung oder Stack wie eine Adresse aussieht, wird vor dem
 * Senden gekürzt — die Route kürzt noch einmal.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const gate = useAppConfig().pukalani?.observability
  if (!gate?.enabled || !gate?.clientErrors) return

  const MAX_PER_SESSION = 10
  let sent = 0
  const seen = new Set<string>()

  function report(source: string, message: string, stack?: string) {
    const key = `${source}:${message}`.slice(0, 300)
    if (sent >= MAX_PER_SESSION || seen.has(key) || !message) return
    seen.add(key)
    sent++
    void $fetch('/api/telemetry/error', {
      method: 'POST',
      body: {
        source,
        message: stripAddressesInText(message).slice(0, 2000),
        stack: stack === undefined ? undefined : stripAddressesInText(stack.split('\n').slice(0, 12).join('\n')),
        url: window.location.pathname,
      },
    }).catch(() => {}) // Reporting darf nie selbst stören
  }

  nuxtApp.hook('vue:error', (error) => {
    const err = error instanceof Error ? error : new Error(String(error))
    report('vue', err.message, err.stack)
  })
  window.addEventListener('error', (event) => {
    report('window', event.message, event.error instanceof Error ? event.error.stack : undefined)
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason))
    report('promise', reason.message, reason.stack)
  })
})
