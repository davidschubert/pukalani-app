import { shapeErrorLog } from './logEvent'

/**
 * FEHLER AUSSERHALB EINER ANFRAGE (WA1 e, 2026-11-17).
 *
 * Eine nicht behandelte Ablehnung in einem Zeit-Lauf, einem `void`-Aufruf nach
 * der Antwort oder einem Timer hat keine Anfrage — der zentrale Fehler-Hook
 * (`server/error.ts`) sieht sie nie. Nitro fängt sie für den Prozess ab
 * (`trapUnhandledNodeErrors`: der Prozess läuft weiter) und schreibt eine
 * freie Zeile `[unhandledRejection] …`, die kein Zähler lesen kann.
 *
 * Diese Hilfe macht daraus dieselbe strukturierte Zeile wie für einen 5xx
 * (`server.error`), mit `source: 'process'` — der tägliche Blick in die App
 * zählt sie damit ohne Umbau als Server-Fehler mit. Am Prozess ändert sich
 * NICHTS: es kommt kein eigener `process.on(...)` dazu (ein solcher Lauscher
 * entschiede mit, ob Node den Prozess beendet); gelesen wird Nitros eigener
 * Haken `error`, den es für genau diese Fälle mit einem Etikett ruft.
 */
export const PROCESS_ERROR_KINDS = ['unhandledRejection', 'uncaughtException'] as const
export type ProcessErrorKind = typeof PROCESS_ERROR_KINDS[number]

/**
 * Welche Sorte Prozess-Fehler tragen diese Etiketten — oder keine (Fehler
 * einer Anfrage)? Nimmt `unknown`: Nitros Haken typisiert den Kontext offen.
 */
export function processErrorKind(tags: unknown): ProcessErrorKind | null {
  if (!Array.isArray(tags)) return null
  return PROCESS_ERROR_KINDS.find(kind => tags.includes(kind)) ?? null
}

/**
 * Log-Zeile für einen Fehler ohne Anfrage (pur). Status ist immer 500: auch
 * ein Fehler, der einen eigenen Status trägt (ein `createError` 404 in einem
 * Aufruf, auf den niemand wartet), ist an dieser Stelle ein Fehler des Servers.
 */
export function shapeProcessErrorLog(error: unknown, kind: ProcessErrorKind): Record<string, unknown> {
  return { ...shapeErrorLog(error), status: 500, source: 'process', kind }
}
