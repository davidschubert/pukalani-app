/**
 * DECKEL FÜR DIE BROWSER-FEHLER-ANNAHME (OPS-011, seit 2026-11-16).
 *
 * `POST /api/telemetry/error` ist öffentlich: jeder Browser darf schreiben,
 * bis ~11 KB je Zeile, gebremst nur je IP (30/min, `05.rate-limit.ts`). Mit
 * vielen Adressen füllt das die PLATTE — die pm2-Logs liegen auf demselben
 * Server wie die App. Ein Zähler von außen (der tägliche Wächter) soll die
 * Zahl der Fehler SEHEN, nicht die Platte füllen. Deshalb je PROZESS
 * höchstens `max` angenommene Zeilen je Fenster über alle IPs; darüber
 * antwortet die Route unverändert erfolgreich, schreibt aber nichts, und
 * meldet EINMAL je Fenster `telemetry.client_error_capped`.
 *
 * Festes Fenster, im Speicher (Single-Instanz-Annahme wie bei den Bremsen
 * ohne Redis): ein Neustart setzt den Zähler zurück — das kostet höchstens
 * ein weiteres Fenster voll, nie eine Dauersperre.
 */

export const CLIENT_ERROR_CAP_MAX = 120
export const CLIENT_ERROR_CAP_WINDOW_MS = 60 * 60 * 1000

/** `accept` = schreiben · `cap` = erste Ablehnung im Fenster (melden) · `drop` = still verwerfen */
export type ClientErrorCapDecision = 'accept' | 'cap' | 'drop'

export interface ClientErrorCap {
  take: () => ClientErrorCapDecision
}

export function createClientErrorCap(options: { max: number, windowMs: number, now?: () => number }): ClientErrorCap {
  const now = options.now ?? Date.now
  let windowStart = Number.NEGATIVE_INFINITY
  let count = 0
  let reported = false
  return {
    take: () => {
      const t = now()
      if (t - windowStart >= options.windowMs) {
        windowStart = t
        count = 0
        reported = false
      }
      if (count < options.max) {
        count++
        return 'accept'
      }
      if (!reported) {
        reported = true
        return 'cap'
      }
      return 'drop'
    },
  }
}

/** Der eine Zähler dieses Prozesses. */
const processCap = createClientErrorCap({ max: CLIENT_ERROR_CAP_MAX, windowMs: CLIENT_ERROR_CAP_WINDOW_MS })

export function takeClientErrorSlot(): ClientErrorCapDecision {
  return processCap.take()
}
