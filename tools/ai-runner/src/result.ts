/**
 * Der Abschlussbericht — docs/archiv/AI-RUNNER.md § 7.2 Schritt 9 und § 9
 * (die Oberfläche liest genau diese Felder).
 *
 * Die Spalte `runs.resultJson` fasst 6000 Zeichen (`runFinishSchema`). Das ist
 * kein theoretischer Deckel: die letzten 20 Zeilen von drei Testläufen sind
 * schnell mehr, und ein 400 auf `finish` liesse den Lauf für immer auf
 * `running` stehen — also genau den Zustand, den ein Bericht beenden soll.
 * Deshalb SCHRUMPFT dieser Bericht, statt zu scheitern, und zwar in einer
 * Reihenfolge, die das Wichtigste behält: Branch, Commit und Kosten überleben
 * jede Stufe, die Test-Ausgaben nicht.
 */

export interface TestOutcome {
  cmd: string
  exit: number
  tail: string
}

export interface RunReport {
  branch: string
  commit: string
  diffstat: string
  tests: TestOutcome[]
  durationMs: number
  costUsd: number
  numTurns: number
  /**
   * Das EFFEKTIV gefahrene Modell (nach dem Kappen, § 7.2 Schritt 3) — nicht
   * der Wunsch aus der Zeile: im ersten End-zu-End-Beweis (2026-08-18) stand
   * im Bericht „fable", gelaufen war das geklemmte „haiku". Der Bericht soll
   * sagen, was WAR.
   */
  model: string
  transcriptFileId: string
  workBranch: string
  /**
   * Wie viele Berechtigungen der Lauf verweigert bekam (`permission_denials`).
   * Steht seit der Verfeinerung 2026-08-18 IMMER im Bericht — auch (und gerade)
   * wenn der Lauf trotzdem `succeeded` ist: die Zahl darf nicht verschwinden,
   * nur weil sie nicht mehr blockiert (deriveFinalStatus in stream.ts). Die
   * Oberfläche liest `resultJson` generisch, ein Feld genügt.
   */
  permissionDenials: number
}

/** Spalten-Budget von `runs.resultJson`. */
export const MAX_RESULT_CHARS = 6000

function withTails(report: RunReport, tailChars: number): RunReport {
  return {
    ...report,
    tests: report.tests.map(test => ({
      ...test,
      tail: tailChars <= 0 ? '' : test.tail.slice(Math.max(0, test.tail.length - tailChars)),
    })),
  }
}

export function buildResultJson(report: RunReport, maxChars: number = MAX_RESULT_CHARS): string {
  // Absteigende Stufen: volle Ausgabe, gekürzt, sehr kurz, ohne Ausgabe,
  // schliesslich nur noch die Exit-Codes.
  for (const tailChars of [Number.POSITIVE_INFINITY, 800, 200, 0]) {
    const candidate = JSON.stringify(Number.isFinite(tailChars) ? withTails(report, tailChars) : report)
    if (candidate.length <= maxChars) return candidate
  }

  const stripped: RunReport = {
    ...report,
    tests: report.tests.map(test => ({ cmd: test.cmd.slice(0, 60), exit: test.exit, tail: '' })),
  }
  const candidate = JSON.stringify(stripped)
  if (candidate.length <= maxChars) return candidate

  // Letzter Halt: ohne Tests. Ein Bericht ohne Testliste ist mager, ein
  // abgelehnter `finish` ist ein hängender Lauf.
  return JSON.stringify({ ...stripped, tests: [] }).slice(0, maxChars)
}
