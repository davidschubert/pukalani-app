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

/**
 * AUF DEN LAUF WARTEN (LL1 c, 2026-11-17) — für ein Skript, das mit dem
 * ERGEBNIS weiterarbeitet (`market-library-compute.mjs`).
 *
 * Seit GA1 P18 antwortet `POST /run` mit 202 und `run.state: 'running'`; der
 * Ausgang steht danach an der Lauf-Zeile, die `GET /api/market/profiles/<id>`
 * als `run` liefert (`MarketRunView`, gegen die Server-Uhr gerechnet). Ein
 * Skript fragt deshalb im Takt nach, bis der Lauf nicht mehr läuft.
 *
 * Takt 5 s wie die Seite (`RUN_LEASE_POLL_MS`). Deckel 40 min: ein Lauf über
 * fünf Kandidaten kann nach seinen eigenen Fristen rund 25 min rechnen (GA1
 * P18, „Erst gemessen") — der Deckel liegt darüber, damit er nur einen
 * wirklich hängenden Lauf trifft. Ein abgestorbener Lauf braucht ihn nicht:
 * nach 120 s ohne Herzschlag meldet der Server `stalled`.
 */
export const RUN_POLL_INTERVAL_MS = 5_000
export const RUN_POLL_MAX_MS = 40 * 60_000

/** Der Grund an der 409, wenn schon ein Lauf unterwegs ist (`RUN_LEASE_BUSY_CODE`). */
export const RUN_BUSY_REASON = 'run_running'

/**
 * Die pure Entscheidung je Abfrage.
 *
 * - `wait`  — weiter fragen (läuft noch, oder die Übersicht zeigt noch den
 *             VORGÄNGER: `startedAt` älter als der eigene Start);
 * - `done`  — der Lauf endete mit `done`;
 * - `abort` — Ende ohne Ergebnis, mit einem Grund für den Menschen: `failed`
 *             (mit dem kurzen Code, wenn die Zeile einen trägt), `stalled`
 *             (Herzschlag verloren — Ausliefern oder Absturz), kein Lauf in
 *             der Übersicht, Deckel gerissen.
 *
 * `startedAt` ist der Beginn aus der 202 — leer, wenn das Skript nach einer
 * 409 bei einem fremden Lauf mitwartet (dann zählt der jüngste).
 *
 * @param {{ state?: string, startedAt?: string, failed?: boolean, failure?: string } | null | undefined} run
 * @param {{ startedAt?: string, elapsedMs: number, maxMs?: number }} input
 * @returns {{ action: 'wait' } | { action: 'done' } | { action: 'abort', reason: string }}
 */
export function runPollDecision(run, input) {
  const maxMs = input.maxMs ?? RUN_POLL_MAX_MS
  const overdue = input.elapsedMs >= maxMs
  if (!run || !run.state || run.state === 'none') {
    return { action: 'abort', reason: 'kein Lauf in der Übersicht' }
  }
  const older = Boolean(input.startedAt) && Boolean(run.startedAt) && run.startedAt < input.startedAt
  if (run.state === 'running' || older) {
    return overdue
      ? { action: 'abort', reason: `nach ${Math.round(maxMs / 60_000)} min noch nicht fertig (Deckel)` }
      : { action: 'wait' }
  }
  if (run.state === 'done' && run.failed !== true) return { action: 'done' }
  if (run.state === 'stalled') {
    return { action: 'abort', reason: 'abgebrochen — der Herzschlag des Laufs ist ausgeblieben (Ausliefern oder Absturz)' }
  }
  return { action: 'abort', reason: `gescheitert${run.failure ? ` (${run.failure})` : ''}` }
}

/**
 * Fragt `readRun` im Takt ab, bis `runPollDecision` nicht mehr `wait` sagt.
 *
 * @param {() => Promise<unknown>} readRun liefert den `run` der Übersicht (oder `null`)
 * @param {{ startedAt?: string, intervalMs?: number, maxMs?: number, sleep?: (ms: number) => Promise<void>, now?: () => number }} [options]
 * @returns {Promise<{ action: 'done', run: any } | { action: 'abort', reason: string, run: any }>}
 */
export async function waitForRun(readRun, options = {}) {
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const now = options.now ?? Date.now
  const intervalMs = options.intervalMs ?? RUN_POLL_INTERVAL_MS
  const startedMs = now()
  while (true) {
    await sleep(intervalMs)
    const run = await readRun()
    const decision = runPollDecision(run, {
      startedAt: options.startedAt,
      elapsedMs: now() - startedMs,
      maxMs: options.maxMs,
    })
    if (decision.action !== 'wait') return { ...decision, run }
  }
}
