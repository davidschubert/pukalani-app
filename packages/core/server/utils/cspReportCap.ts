/**
 * MENGEN-DECKEL FÜR BERICHTE DER SKRIPT-REGEL (SE1 a, 2026-11-17).
 *
 * `POST /api/telemetry/csp-report` ist öffentlich: jeder Browser schreibt,
 * und derselbe Verstoß kommt mit JEDEM Seitenaufruf wieder. Ungebremst wäre
 * das Fehler-Log nach einem Tag voll mit derselben Zeile — und der eine
 * neue Verstoß ginge darin unter.
 *
 * Darum zählt hier nicht der Aufruf, sondern der VERSTOSS:
 *  - derselbe Verstoß (Anweisung, Quelle, Datei-Quelle, Seitenbereich) wird
 *    je Fenster EINMAL geschrieben, Wiederholungen fallen still weg;
 *  - je Fenster höchstens `max` VERSCHIEDENE Verstöße; der erste darüber
 *    meldet einmal `csp.report_capped`, danach ist bis zum Fensterende Ruhe.
 *
 * Die Zahl im täglichen Blick heißt damit „verschiedene Verstöße je Stunde",
 * nicht „Seitenaufrufe" — das ist die Frage vor dem Scharfstellen.
 *
 * Je PROZESS, wie `clientErrorCap.ts` (pm2 fährt je App `instances: 1`). Die
 * Bremse je Anschluss steht daneben in `05.rate-limit.ts`.
 */

export const CSP_REPORT_CAP_MAX = 40
export const CSP_REPORT_CAP_WINDOW_MS = 60 * 60 * 1000

export type CspReportCapDecision = 'accept' | 'repeat' | 'cap' | 'drop'

export interface CspReportCap {
  take: (key: string) => CspReportCapDecision
}

export function createCspReportCap(options: { max: number, windowMs: number, now?: () => number }): CspReportCap {
  const now = options.now ?? Date.now
  let windowStart = Number.NEGATIVE_INFINITY
  let seen = new Set<string>()
  let reported = false
  return {
    take: (key) => {
      const t = now()
      if (t - windowStart >= options.windowMs) {
        windowStart = t
        seen = new Set()
        reported = false
      }
      if (seen.has(key)) return 'repeat'
      if (seen.size < options.max) {
        seen.add(key)
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

const processCap = createCspReportCap({ max: CSP_REPORT_CAP_MAX, windowMs: CSP_REPORT_CAP_WINDOW_MS })

export function takeCspReportSlot(key: string): CspReportCapDecision {
  return processCap.take(key)
}
