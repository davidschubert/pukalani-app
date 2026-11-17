/**
 * DER ABSTAND DER BEWEIS-SKRIPTE ZUR MINUTEN-BREMSE (LL1 c, 2026-11-17).
 *
 * Seit `POST /api/market/profiles/<id>/run` sofort antwortet (GA1 P18), sind
 * die vier Beweis-Skripte des Marktvergleichs in wenigen Sekunden durch — und
 * hintereinander gestartet laufen sie in die Minuten-Bremse der Middleware
 * (`packages/core/server/middleware/05.rate-limit.ts`, Eimer `market:run`,
 * 5 Aufrufe je Minute und Anschluss; JEDER Aufruf zählt, auch ein
 * abgewiesener). Die Bremse antwortet 429 mit `reason: 'rate_limited'` und
 * `Retry-After` (`core/server/utils/rateLimited.ts`).
 *
 * Die Skripte halten den Abstand jetzt selbst: bei GENAU dieser 429 warten
 * sie die genannte Zeit (ohne Kopf 70 s) und versuchen es EINMAL noch.
 *
 * NICHT wiederholt wird die 429 des TAGES-Kontingents (`market_run_limit`,
 * `market_instance_limit`, `packages/market/shared/marketLimits.ts`): sie
 * geht nicht in einer Minute vorbei, und ein Skript, das dort wartet, sähe
 * aus wie ein hängendes. Die Antwort reicht unverändert an das Skript durch,
 * das sie wie bisher meldet.
 *
 * Pur bis auf `sleep` und `log`, die der Aufrufer stellen kann (Test:
 * `packages/market/tests/runStartScriptLib.test.ts`).
 */

/** Der Grund, den die Minuten-Bremse an ihre 429 hängt. */
export const MINUTE_BRAKE_REASON = 'rate_limited'

/** Ohne `Retry-After`: eine volle Minute plus Luft. */
export const MINUTE_BRAKE_FALLBACK_SEC = 70

/** Nie länger als ein paar Minuten — eine größere Zahl wäre kein Minuten-Fenster mehr. */
const MINUTE_BRAKE_MAX_SEC = 300

/** Der Wert eines Antwortkopfes, gleich ob als Objekt (node:http) oder `Headers`. */
function headerValue(headers, name) {
  if (!headers) return undefined
  if (typeof headers.get === 'function') return headers.get(name) ?? undefined
  const raw = headers[name] ?? headers[name.toLowerCase()]
  return Array.isArray(raw) ? raw[0] : raw
}

/**
 * Wie lange auf diese Antwort zu warten ist — `null`, wenn sie NICHT die
 * Minuten-Bremse ist (dann wird nicht wiederholt).
 *
 * @param {{ status?: number, json?: { reason?: unknown } | null, headers?: unknown }} response
 * @returns {number | null} Sekunden
 */
export function minuteBrakeWaitSec(response) {
  if (!response || response.status !== 429) return null
  if (response.json?.reason !== MINUTE_BRAKE_REASON) return null
  const seconds = Number.parseInt(String(headerValue(response.headers, 'retry-after') ?? ''), 10)
  if (!Number.isFinite(seconds) || seconds <= 0) return MINUTE_BRAKE_FALLBACK_SEC
  return Math.min(seconds, MINUTE_BRAKE_MAX_SEC)
}

/**
 * Startet einen Lauf und wartet bei der Minuten-Bremse EINMAL.
 *
 * @template T
 * @param {() => Promise<T & { status?: number, json?: { reason?: unknown } | null, headers?: unknown }>} send
 * @param {{ log?: (line: string) => void, sleep?: (ms: number) => Promise<void> }} [options]
 * @returns {Promise<T>}
 */
export async function startRunRespectingBrake(send, options = {}) {
  const log = options.log ?? (line => console.log(line))
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const first = await send()
  const wait = minuteBrakeWaitSec(first)
  if (wait === null) return first
  log(`  … warte ${wait} s (Minuten-Bremse)`)
  await sleep(wait * 1000)
  return send()
}
