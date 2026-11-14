/**
 * Testbefehle eines Laufs — die Konsolen-Seite von SEC-037.
 *
 * DIE GRENZE LIEGT AUF DEM RECHNER: der Dienst auf dem Mac führt nur Befehle
 * aus, die in SEINER lokalen Liste stehen (`~/.config/pukalani-runner/
 * config.json`). Er meldet diese Liste im Heartbeat als
 * `capabilities.testCommands: Record<repoKey, string[]>` — das ist eine
 * ANZEIGE-KOPIE (§ 8.1), keine Erlaubnis. Diese Datei tut zweierlei damit:
 *  1. Das Formular bietet nur an, was der gewählte Rechner für das gewählte
 *     Repo meldet (`offeredTestCommands`) — es gibt keinen Freitext mehr.
 *  2. Die Anlege- und Fortsetzungs-Route sagen früh und verständlich nein
 *     (`checkRequestedTestCommands`), statt den Lauf erst auf dem Rechner
 *     scheitern zu lassen. Das ist die ZWEITE Sicherung, nicht die erste.
 *
 * Bewusst pur: Server, Formular und Tests (tests/testCommands.test.ts) nutzen
 * dieselben Regeln.
 */

/** Höchstens so viele Befehle je Repo werden aus der Meldung übernommen. */
export const MAX_OFFERED_TEST_COMMANDS = 50

/**
 * Die Befehle, die ein Rechner für dieses Repo freigegeben hat.
 *
 * DEFENSIV: kaputtes JSON, falsche Typen, ein fehlendes Feld oder ein ALTER
 * Dienst, der `testCommands` noch nicht meldet, ergeben `[]` — und `[]` heißt
 * „nichts wählbar", nie „alles erlaubt". Nur nicht-leere Strings zählen; sie
 * werden NICHT getrimmt (verglichen wird später exakt).
 */
export function offeredTestCommands(capabilitiesJson: string, repoKey: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(capabilitiesJson || '{}')
  }
  catch {
    return []
  }
  if (!isPlainObject(parsed)) return []
  const byRepo = parsed.testCommands
  if (!isPlainObject(byRepo)) return []
  if (!Object.prototype.hasOwnProperty.call(byRepo, repoKey)) return []
  const list = byRepo[repoKey]
  if (!Array.isArray(list)) return []
  return list
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    .slice(0, MAX_OFFERED_TEST_COMMANDS)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Die Testbefehle aus `runs.testCommands` (JSON `string[]`, '' = keine).
 *
 * `null` = der Wert ist KAPUTT (kein JSON, kein Array, ein Nicht-String
 * darin). Die Fortsetzungs-Route lehnt das ab wie einen nicht gelisteten
 * Befehl — ein verstümmelter Wert ist keine leere Liste.
 */
export function parseStoredTestCommands(raw: string): string[] | null {
  if (raw === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  if (!parsed.every(entry => typeof entry === 'string')) return null
  return parsed as string[]
}

export type TestCommandsCheck =
  | { ok: true }
  | { ok: false, code: 'tests_need_runner' | 'tests_not_allowed_untrusted' | 'test_command_not_listed' }

/**
 * Dürfen diese Testbefehle mit diesem Lauf mit?
 *
 * Reihenfolge = die verständlichste Absage zuerst:
 *  - nichts verlangt ⇒ ok (ein Lauf ohne Tests braucht nichts davon)
 *  - ungeprüfter Auftrag ⇒ `tests_not_allowed_untrusted` (ein Testbefehl ist
 *    Code-Ausführung außerhalb der Modus-Sperre)
 *  - kein bestimmter Rechner ⇒ `tests_need_runner` (die Liste gehört einem
 *    Rechner; „irgendeiner" hat keine)
 *  - jeder Befehl muss EXAKT (`===`) in der Liste stehen — kein Trimmen, kein
 *    Präfix, keine Groß-/Kleinschreibung: `pnpm test && x` ist ein anderer
 *    Befehl als `pnpm test`.
 */
export function checkRequestedTestCommands(input: {
  requested: readonly string[]
  offered: readonly string[]
  promptTrusted: boolean
  runnerSelected: boolean
}): TestCommandsCheck {
  if (input.requested.length === 0) return { ok: true }
  if (!input.promptTrusted) return { ok: false, code: 'tests_not_allowed_untrusted' }
  if (!input.runnerSelected) return { ok: false, code: 'tests_need_runner' }
  for (const command of input.requested) {
    if (!input.offered.some(entry => entry === command)) return { ok: false, code: 'test_command_not_listed' }
  }
  return { ok: true }
}
