import { logEvent } from './logEvent'

/**
 * EIN FEHLER DARF EINE NEBENSACHE NICHT STÜRZEN — ABER ER WIRD GEZÄHLT (Q13).
 *
 * Vorher schrieb jede Stelle die kürzeste Form: `.catch(() => null)`. Die
 * unterscheidet nicht zwischen „gibt es nicht" und „konnte nicht gelesen
 * werden" und schreibt nichts ins Protokoll — eine Störung der Datenbank sah
 * für den Aufrufer aus wie ein leeres Ergebnis, und niemand zählte sie.
 *
 *   const row = await db.get(TABLE, id).catch(softFail('posts:utils/x:get', null))
 *
 * WAS GLEICH BLEIBT: der Aufrufer bekommt denselben Ersatzwert wie vorher.
 * WAS DAZUKOMMT: eine Zeile `soft_fail` (Stufe `warn`) mit der Kennung der
 * Stelle. Der tägliche Wächter zählt diese Zeilen (ops/app-watch-counts.mjs).
 *
 * WAS NICHT PROTOKOLLIERT WIRD — der erwartete Fehlgriff:
 *   · 404: die Zeile, die Datei, das Konto gibt es nicht. Ausnahme: fehlt die
 *     TABELLE, die Spalte oder der Bucket, ist das kein Fehlgriff, sondern ein
 *     Schema-Stand — das steht im Protokoll.
 *   · `ENOENT`: die Datei im Zwischenspeicher gibt es (noch) nicht.
 *   · was die Stelle in `quiet` nennt — zum Beispiel 401 beim Blick auf die
 *     Sitzung eines Gastes oder 409 bei einem Wettlauf um dieselbe Zeile.
 *
 * WAS IN DER ZEILE STEHT: Kennung, Status, Appwrite-Fehlerart, Name der
 * Fehlerklasse, Systemcode. NIE die Meldung des Fehlers: sie trägt regelmäßig
 * Kennungen von Zeilen und Konten. An den Client geht von alldem nichts.
 *
 * DIE BREMSE: je Kennung höchstens eine Zeile je Minute; was dazwischen fällt,
 * zählt die nächste Zeile in `repeated` mit. Fällt Appwrite aus, schreibt ein
 * heißer Lesepfad sonst tausende gleiche Zeilen und verdrängt alles andere.
 *
 * DIE KENNUNG ist ein festes Literal: `<layer>:<pfad unter server>:<aufruf>`.
 * Sie sagt, WO geschluckt wurde — nie, für wen.
 *
 * Neue Stellen: ESLint (`pukalani/no-silent-catch`) lässt im Server-Code kein
 * `.catch` durch, das seinen Fehler weder ansieht noch weiterwirft.
 */
export interface SoftFailOptions {
  /** Status-Werte, die an DIESER Stelle ein erwarteter Fehlgriff sind (zusätzlich zu 404). */
  quiet?: readonly number[]
}

const THROTTLE_MS = 60_000
/** Deckel für die Merkliste — Kennungen sind Literale, mehr als ein paar hundert gibt es nicht. */
const MAX_TRACKED = 2000

/**
 * 404 mit einer dieser Appwrite-Fehlerarten heißt „das Schema fehlt", nicht
 * „die Zeile fehlt" — das ist nie ein erwarteter Fehlgriff.
 */
const STRUCTURAL_NOT_FOUND = /^(database|table|collection|column|attribute|index|storage_bucket|bucket|general_route)_not_found$/

const seen = new Map<string, { at: number, suppressed: number }>()

function numberAt(error: unknown, key: string): number | undefined {
  const value = (error as Record<string, unknown> | null)?.[key]
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

function textAt(error: unknown, key: string, form: RegExp): string | undefined {
  const value = (error as Record<string, unknown> | null)?.[key]
  return typeof value === 'string' && form.test(value) ? value : undefined
}

/** Der HTTP-Status eines Fehlers: Appwrite (`code`), H3 (`statusCode`), ofetch (`status`). 0 = keiner. */
export function softFailStatus(error: unknown): number {
  if (typeof error !== 'object' || error === null) return 0
  for (const key of ['statusCode', 'status', 'code']) {
    const value = numberAt(error, key)
    if (value !== undefined && value >= 100 && value <= 599) return value
  }
  return 0
}

/** Was von einem Fehler ins Protokoll darf — pur, getestet. Nie die Meldung. */
export function shapeSoftFail(error: unknown): { status: number, type?: string, name?: string, code?: string } {
  const type = textAt(error, 'type', /^[a-z][a-z0-9_]{0,59}$/)
  const name = textAt(error, 'name', /^[A-Za-z][A-Za-z0-9]{0,39}$/)
  const code = textAt(error, 'code', /^[A-Z][A-Z0-9_]{0,29}$/)
  return {
    status: softFailStatus(error),
    ...(type ? { type } : {}),
    ...(name ? { name } : {}),
    ...(code ? { code } : {}),
  }
}

/** Erwarteter Fehlgriff (s. Kopf) — pur, getestet. */
export function isExpectedMiss(error: unknown, quiet: readonly number[] = []): boolean {
  const shaped = shapeSoftFail(error)
  if (shaped.code === 'ENOENT') return true
  if (shaped.status === 404) return !(shaped.type && STRUCTURAL_NOT_FOUND.test(shaped.type))
  return shaped.status !== 0 && quiet.includes(shaped.status)
}

function report(where: string, error: unknown, options: SoftFailOptions | undefined): void {
  if (isExpectedMiss(error, options?.quiet)) return
  const now = Date.now()
  const entry = seen.get(where)
  if (entry && now - entry.at < THROTTLE_MS) {
    entry.suppressed++
    return
  }
  if (!entry && seen.size >= MAX_TRACKED) seen.clear()
  const repeated = entry?.suppressed ?? 0
  seen.set(where, { at: now, suppressed: 0 })
  logEvent('warn', 'soft_fail', { where, ...shapeSoftFail(error), ...(repeated > 0 ? { repeated } : {}) })
}

/**
 * Für `.catch(...)`: liefert den festen Ersatzwert und protokolliert den
 * Fehler, wenn er kein erwarteter Fehlgriff ist.
 */
export function softFail<T>(where: string, fallback: T, options?: SoftFailOptions): (error: unknown) => T {
  return (error) => {
    report(where, error, options)
    return fallback
  }
}

/**
 * Wie `softFail`, aber der Ersatz wird erst im Fehlerfall BERECHNET (ein
 * zweiter Versuch, ein Rückweg, ein Wert aus dem Stand von jetzt).
 */
export function softFailWith<T>(where: string, fallback: () => T, options?: SoftFailOptions): (error: unknown) => T {
  return (error) => {
    report(where, error, options)
    return fallback()
  }
}

/** Nur für Tests: die Merkliste der Bremse leeren. */
export function resetSoftFailThrottle(): void {
  seen.clear()
}
