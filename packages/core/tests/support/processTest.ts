import { spawnSync } from 'node:child_process'
import type { SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from 'node:child_process'
import { vi } from 'vitest'

/**
 * TESTS, DIE EIN PROGRAMM STARTEN (DOC-013, Q20 — 2026-11-21).
 *
 * Die Standard-Frist von Vitest (5 s) passt zu Rechen-Tests, nicht zu einem
 * Prozess-Start: läuft der Rechner unter Last (mehrere Sitzungen, ein voller
 * `pnpm -r test`), braucht schon das Laden von Node länger — der Test wird rot,
 * ohne dass am Code etwas falsch ist, und `pnpm -r test` bricht danach ab.
 *
 * Eine Stelle für beides: die Frist und den Start.
 *
 *   allowProcessStart()                 // einmal oben in der Test-Datei
 *   const result = runNode([SCRIPT, '--stale'])
 *
 * Die Frist des Kind-Prozesses liegt UNTER der des Tests: hängt das Programm,
 * endet der Test mit dessen Ausgabe statt mit einem nackten „timed out".
 */
export const PROCESS_TEST_TIMEOUT_MS = 30_000
const CHILD_TIMEOUT_MS = PROCESS_TEST_TIMEOUT_MS - 5_000

/** Hebt die Frist für alle Tests DIESER Datei an. */
export function allowProcessStart(): void {
  vi.setConfig({ testTimeout: PROCESS_TEST_TIMEOUT_MS })
}

/** Startet Node mit den genannten Argumenten und liefert Ausgabe und Status als Text. */
export function runNode(
  args: readonly string[],
  options: Partial<SpawnSyncOptionsWithStringEncoding> = {},
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [...args], { timeout: CHILD_TIMEOUT_MS, ...options, encoding: 'utf8' })
}
