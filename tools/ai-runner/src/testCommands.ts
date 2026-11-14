import { splitCommand } from './exec.ts'

/**
 * Welche Testbefehle ein Lauf ausführen darf — SEC-037.
 *
 * DIESELBE REGEL WIE BEI REPOS, MODI UND BUDGET (§ 8.1): die Datenbank darf
 * AUSWÄHLEN, was die lokale Config ERLAUBT — nie umgekehrt. Ein Testbefehl
 * ist Code-Ausführung auf diesem Rechner, ohne Agent und ohne dessen
 * Berechtigungs-Modus dazwischen. Läge die Liste in der Datenbank, wäre jede
 * Lücke in der Konsole ein frei wählbarer Befehl auf dem Laptop. Deshalb ist
 * `runs.testCommands` nur noch eine AUSWAHL aus `repos.<key>.testCommands`.
 *
 * Die Regeln sind bewusst hart und alle fail-closed:
 *
 *  - Vergleich WORTGLEICH. Kein trim, keine Normalisierung, kein Präfix, kein
 *    Muster: jede „Ähnlichkeit" wäre eine Stelle, an der ein angehängtes
 *    Argument oder ein vorangestelltes Wort durchrutscht. Die lokale Liste
 *    wird deshalb beim Laden streng geprüft (config.ts), damit ein Tippfehler
 *    dort auffällt statt still nie zu passen.
 *  - Ein einziger nicht gelisteter Befehl lehnt den GANZEN Auftrag ab. Still
 *    überspringen hiesse: der Bericht zeigt grüne Tests, die nicht die
 *    bestellten waren.
 *  - Ein Auftrag mit ungeprüftem Text (§ 8.2) führt keine Testbefehle aus:
 *    sie liefen auf dem Stand, den der Agent gerade nach diesem Text
 *    geschrieben hat — ein Skript im Repo ist dann kein bekannter Code mehr.
 *  - Ausgeführt wird der Eintrag der LOKALEN Liste, nie der Text aus der
 *    Naht. Bei wortgleichem Vergleich ist das derselbe Text; der Punkt ist,
 *    dass der Ausführungs-Pfad nur Werte aus der lokalen Datei kennt.
 *
 * PUR, damit jede Regel einzeln prüfbar ist (scripts/smoke.mjs).
 */

export interface AllowedTestCommand {
  /** der Eintrag aus der LOKALEN Liste, wortgleich */
  command: string
  argv: string[]
}

export type TestCommandDecision =
  | { ok: true, commands: AllowedTestCommand[] }
  | {
    ok: false
    code: 'test_command_not_allowed' | 'tests_not_allowed_untrusted' | 'test_commands_malformed'
    message: string
    rejected: string[]
  }

/** Dieselbe Grenze wie `createRunSchema` serverseitig (max 10). */
export const MAX_REQUESTED_TEST_COMMANDS = 10
/** Ein abgelehnter Befehl erscheint gekürzt in Zeitleiste und Log. */
const MAX_REJECTED_CHARS = 200

function shorten(value: string): string {
  return value.length > MAX_REJECTED_CHARS ? value.slice(0, MAX_REJECTED_CHARS) : value
}

/**
 * `runs.testCommands` lesen. '' und '[]' heissen „nichts verlangt"; alles
 * andere muss ein JSON-Array nicht-leerer Zeichenketten sein. Früher fuhr ein
 * verstümmelter Wert still ohne Tests — jetzt ist er ein Fehlschlag, weil
 * „nichts verlangt" und „Verlangtes unlesbar" verschiedene Aufträge sind.
 */
function readRequested(raw: unknown): string[] | null {
  if (typeof raw !== 'string') return null
  if (raw === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_REQUESTED_TEST_COMMANDS) return null
  const list: string[] = []
  for (const entry of parsed as unknown[]) {
    if (typeof entry !== 'string' || !entry.length) return null
    list.push(entry)
  }
  return list
}

export function decideTestCommands(input: {
  raw: unknown
  promptTrusted: boolean
  allowed: readonly string[] | undefined | null
  repoKey: string
}): TestCommandDecision {
  const requested = readRequested(input.raw)
  if (requested === null) {
    return {
      ok: false,
      code: 'test_commands_malformed',
      message: `Die verlangten Testbefehle sind unlesbar (erwartet: JSON-Liste mit höchstens ${MAX_REQUESTED_TEST_COMMANDS} nicht-leeren Befehlen) — der Lauf startet nicht`,
      rejected: [],
    }
  }

  // Doppelt Verlangtes läuft einmal; die Reihenfolge bleibt die verlangte.
  const unique = [...new Set(requested)]
  if (!unique.length) return { ok: true, commands: [] }

  if (input.promptTrusted !== true) {
    return {
      ok: false,
      code: 'tests_not_allowed_untrusted',
      message: 'Ein Auftrag mit ungeprüftem Text führt keine Testbefehle aus (§ 8.2) — der Lauf startet nicht',
      rejected: unique.map(shorten),
    }
  }

  const allowed = Array.isArray(input.allowed)
    ? input.allowed.filter((entry): entry is string => typeof entry === 'string')
    : []

  const commands: AllowedTestCommand[] = []
  const rejected: string[] = []
  for (const wanted of unique) {
    // Gefunden wird der LISTENEINTRAG; ausgeführt wird nur er.
    const entry = allowed.find(candidate => candidate === wanted)
    if (entry === undefined) rejected.push(shorten(wanted))
    else commands.push({ command: entry, argv: splitCommand(entry) })
  }

  if (rejected.length) {
    const where = `config.json → repos.${input.repoKey}.testCommands`
    return {
      ok: false,
      code: 'test_command_not_allowed',
      message: `Nicht freigegebene Testbefehle: ${rejected.map(entry => JSON.stringify(entry)).join(', ')} — erlaubt ist nur, was wortgleich in ${where} steht. Der Lauf startet nicht.`,
      rejected,
    }
  }

  return { ok: true, commands }
}
