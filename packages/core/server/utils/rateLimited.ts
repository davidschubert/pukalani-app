import type { H3Event } from 'h3'

/**
 * 429 mit Retry-After und dem fachlichen Grund. Der GRUND reist als
 * `data.code` — der zentrale Handler (server/error.ts) hebt genau diesen
 * Schlüssel als `reason` ins Envelope. Ohne ihn konnten die Auth-Formulare eine
 * Sperre nicht von einem echten Fehlversuch unterscheiden und schrieben
 * „Passwort falsch" bzw. „bitte erneut versuchen" — beides falsch, und beides
 * fordert genau die Handlung, die gerade geblockt wird (Audit-Befund G7,
 * 2026-08-09). Der Status allein reicht dem Client nicht: eine 429 kann auch von
 * einem vorgelagerten Proxy kommen und trägt dann nicht unser Fenster.
 *
 * EIN Code für alle Fenster (Minute, Stunde, Notbremse, Konto-Zähler aus
 * accountAttempts.ts): der Client soll nur wissen, DASS er warten muss — wie
 * lange, sagt Retry-After. Dass die Konto-Bremse denselben Code trägt, ist
 * Absicht: die Antwort verrät so nicht, ob es das Konto gibt.
 *
 * Eigene Datei (SEC-003), weil Middleware UND Konto-Zähler sie brauchen.
 */
export function tooManyRequests(event: H3Event, resetInMs: number): never {
  setHeader(event, 'Retry-After', Math.max(1, Math.ceil(resetInMs / 1000)))
  throw createError({ status: 429, statusText: 'Too Many Requests', data: { code: 'rate_limited' } })
}
