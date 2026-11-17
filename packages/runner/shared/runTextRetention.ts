import { olderThanDays } from '../../core/shared/rowRetention'
import { isTerminalRunStatus } from './runGuards'
import { RESULT_JSON_MAX_LENGTH } from './runRetention'
import type { RunRow } from './types/runner'

/**
 * TEXTE UND ANHÄNGE ALTER KI-LÄUFE FALLEN NACH 12 MONATEN, DIE ZAHLEN BLEIBEN
 * (RU1 c — Entscheidung des Betreibers 2026-11-17, „Texte nach 12 Monaten weg").
 *
 * Ein Lauf trägt drei Sorten Inhalt:
 *  - TEXT der Person oder des Agenten: der Auftrag (`promptSource`), der
 *    Fehlertext (`error`), die freien Felder des Berichts (`resultJson`:
 *    Diffstat, Test-Ausgaben) — und die ANHÄNGE im Bucket `runner-files`.
 *  - ZAHLEN: Kosten, Dauer, Züge, verweigerte Rechte, Exit-Codes.
 *  - KENNUNGEN: Commit, Branch, Modell, Zustand, Zeitpunkte, Repo, Session.
 * Nach der Frist fällt der Text, Zahlen und Kennungen bleiben — so bleibt
 * sichtbar, was die Läufe gekostet haben.
 *
 * DIE ZEILE BLEIBT: „entfernen" heisst hier SCHWÄRZEN, nicht löschen. Der Lauf
 * im Gerüst (`core/shared/rowRetention.ts`) ruft dafür `remove`; die Zeile
 * steht danach weiter in der Liste, die Regel sagt beim nächsten Lesen
 * „bleibt" (es gibt nichts mehr zu entfernen), und die Schleife zieht den
 * Cursor darüber hinweg. Im Ergebnis zählt `deleted` deshalb GESCHWÄRZTE
 * LÄUFE, nicht gelöschte Zeilen.
 *
 * Die PROTOKOLLE (Transkripte) und die Zeitleiste (`run_events`) räumt der
 * ältere Lauf nach 30 bzw. 90 Tagen (`shared/runRetention.ts`); hier geht es
 * nur um das, was er bewusst stehen lässt.
 *
 * FORTSETZUNGEN BRAUCHEN DEN TEXT IHRES VORGÄNGERS NICHT — am Code geprüft:
 *  - `runs/:id/resume.post.ts` liest vom Vorgänger nur Kennungen und
 *    Einstellungen (`buildResumeRunFields`: Subjekt, Rechner, Repo, Modell,
 *    Modus, Testbefehle, Budget, `sessionId`). Der Auftrag der Fortsetzung ist
 *    die ANTWORT, Anhänge trägt sie keine (`attachmentsJson: ''`).
 *  - Der Dienst auf dem Rechner holt Anhänge nur für den EIGENEN Lauf
 *    (`GET runs/:id/files` mit `run.$id`), und `--resume` knüpft an die
 *    Sitzungsdatei auf DIESEM Rechner an — nicht an Text in der Datenbank.
 * Ein Vorgänger mit jüngerer Fortsetzung wird deshalb ganz normal geschwärzt;
 * eine Sperre „Fortsetzung noch nicht fällig" wäre eine Regel ohne Grund.
 * Auch eine spätere Antwort auf einen geschwärzten `needs_input`-Lauf braucht
 * nur dessen `sessionId`, und die ist eine Kennung und bleibt.
 *
 * BEWUSST PUR: die Entscheidung „ist dieser Lauf fällig?" und „was bleibt vom
 * Bericht?" sind die Sicherung eines nicht umkehrbaren Schreibens — der Test
 * prüft sie mit gestellter Uhr (tests/runTextRetention.test.ts).
 */

/** Die Kennung des Laufs (Takt, Log-Zeilen, `ops/timed-jobs.conf`). */
export const RUN_TEXT_RETENTION_JOB = 'run-text-retention'

/** Die Frist: 12 Monate nach dem Ende eines Laufs. Eine Konstante, kein Regler. */
export const RUN_TEXT_RETENTION_DAYS = 365

/** Der Grund in `byReason` des Ergebnisses. */
export const RUN_TEXT_RETENTION_REASON = 'text-expired'

/** Was die Regel von einer Zeile liest. */
export type RunTextRetentionRow = Pick<
  RunRow,
  '$id' | '$createdAt' | '$updatedAt' | 'status' | 'finishedAt' | 'promptSource' | 'resultJson' | 'attachmentsJson' | 'error'
>

/**
 * DIE ERLAUBNISLISTE DES BERICHTS — was nach dem Schwärzen bleibt. Alles, was
 * hier NICHT steht, fällt: ein Feld, das der Dienst später dazubekommt, ist
 * damit von selbst Text, bis jemand es hier einträgt (nie umgekehrt).
 *
 * Die Felder des Berichts stehen in `tools/ai-runner/src/result.ts`
 * (`RunReport`) und in den Spuren des Aufräum-Laufs:
 *   branch, commit, workBranch, model, transcriptFileId  → Kennung, bleibt
 *   durationMs, costUsd, numTurns, permissionDenials      → Zahl, bleibt
 *   tests[] { cmd, exit, tail }                           → cmd + exit bleiben,
 *                                                           tail (Test-Ausgabe) fällt
 *   diffstat                                              → Text (Git-Ausgabe), fällt
 *   transcriptPurgedAt, textRemovedAt                     → Zeitpunkt, bleibt
 */
const REPORT_NUMBERS = ['costUsd', 'durationMs', 'numTurns', 'permissionDenials'] as const
const REPORT_IDENTIFIERS = ['branch', 'commit', 'workBranch', 'model', 'transcriptFileId', 'transcriptPurgedAt', 'textRemovedAt'] as const
const REPORT_TESTS = 'tests'

/**
 * Eine KENNUNG ist ein Wort ohne Leerzeichen (Commit-Hash, Branch, Modell,
 * Datei-Id, ISO-Zeitpunkt). Ein Wert mit Leerzeichen oder Zeilenumbruch ist
 * Text, der sich in ein Kennungsfeld verirrt hat — er fällt. Leer ist erlaubt:
 * der Aufräum-Lauf der Protokolle setzt `transcriptFileId: ''`, und das darf
 * keinen Lauf als „trägt noch Text" erscheinen lassen.
 */
const IDENTIFIER = /^[\w.:/@+-]{0,200}$/

/** Ein Testbefehl: eine Zeile aus der Liste des Rechners, kein Fliesstext. */
const TEST_COMMAND_MAX = 200
// eslint-disable-next-line no-control-regex -- genau die Steuerzeichen sind gemeint
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

interface StrippedReport {
  kept: Record<string, unknown>
  /** Wie viele Felder (oder Teile davon) gefallen sind. 0 ⇒ kein Text mehr. */
  dropped: number
}

/** Ein Test-Eintrag: `cmd` (ein Befehl der Liste) und `exit` bleiben, der Rest fällt. */
function stripTest(entry: unknown): { kept: { cmd?: string, exit?: number } | null, dropped: number } {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return { kept: null, dropped: 1 }
  const source = entry as Record<string, unknown>
  const kept: { cmd?: string, exit?: number } = {}
  let dropped = 0
  for (const [key, value] of Object.entries(source)) {
    if (key === 'cmd' && typeof value === 'string' && value.length <= TEST_COMMAND_MAX && !CONTROL_CHARS.test(value)) kept.cmd = value
    else if (key === 'exit' && isFiniteNumber(value)) kept.exit = value
    else dropped++
  }
  return { kept, dropped }
}

/** Der Bericht, reduziert auf die Erlaubnisliste, und wie viel dabei fiel. */
function stripReport(source: Record<string, unknown>): StrippedReport {
  const kept: Record<string, unknown> = {}
  let dropped = 0
  for (const [key, value] of Object.entries(source)) {
    if ((REPORT_NUMBERS as readonly string[]).includes(key) && isFiniteNumber(value)) {
      kept[key] = value
    }
    else if ((REPORT_IDENTIFIERS as readonly string[]).includes(key) && typeof value === 'string' && IDENTIFIER.test(value)) {
      kept[key] = value
    }
    else if (key === REPORT_TESTS && Array.isArray(value)) {
      const tests: Array<{ cmd?: string, exit?: number }> = []
      for (const entry of value) {
        const stripped = stripTest(entry)
        dropped += stripped.dropped
        if (stripped.kept) tests.push(stripped.kept)
      }
      kept[key] = tests
    }
    else {
      dropped++
    }
  }
  return { kept, dropped }
}

/** Den Bericht als Objekt lesen; `null` = leer. Unlesbar ⇒ `'unreadable'`. */
function readReport(resultJson: string | null | undefined): Record<string, unknown> | null | 'unreadable' {
  if (!resultJson) return null
  try {
    const value: unknown = JSON.parse(resultJson)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'unreadable'
    return value as Record<string, unknown>
  }
  catch {
    return 'unreadable'
  }
}

/**
 * Trägt der Bericht noch freien Text? Leer ⇒ nein. Unlesbar ⇒ JA: ein Bericht,
 * der kein JSON-Objekt ist, ist Rohtext (der Dienst kürzt im letzten Notfall
 * mit `.slice()`, das Board zeigt ihn dann roh) — gerade der muss weg.
 */
export function reportHasText(resultJson: string | null | undefined): boolean {
  const report = readReport(resultJson)
  if (report === null) return false
  if (report === 'unreadable') return true
  return stripReport(report).dropped > 0
}

/**
 * Der geschwärzte Bericht: nur die Erlaubnisliste plus `textRemovedAt`. Ein
 * unlesbarer oder leerer Bericht wird zu `{ textRemovedAt }` — er hatte keine
 * lesbaren Zahlen, und sein Text ist genau das, was fallen soll.
 *
 * Passt das Ergebnis nicht in die Spalte (praktisch unmöglich, es ist eine
 * Teilmenge plus ein Zeitpunkt), fällt erst die Testliste, dann bleiben nur
 * die Zahlen.
 */
export function redactRunResult(resultJson: string | null | undefined, removedAtIso: string): string {
  const report = readReport(resultJson)
  const kept = report && report !== 'unreadable' ? stripReport(report).kept : {}
  const full = JSON.stringify({ ...kept, textRemovedAt: removedAtIso })
  if (full.length <= RESULT_JSON_MAX_LENGTH) return full
  const withoutTests = Object.fromEntries(Object.entries(kept).filter(([key]) => key !== REPORT_TESTS))
  const lean = JSON.stringify({ ...withoutTests, textRemovedAt: removedAtIso })
  if (lean.length <= RESULT_JSON_MAX_LENGTH) return lean
  const numbers: Record<string, unknown> = {}
  for (const key of REPORT_NUMBERS) if (key in kept) numbers[key] = kept[key]
  return JSON.stringify({ ...numbers, textRemovedAt: removedAtIso })
}

/** Wann wurden Texte und Anhänge dieses Laufs entfernt? `null` = nie (Oberfläche). */
export function runTextRemovedAt(resultJson: string | null | undefined): string | null {
  const report = readReport(resultJson)
  if (report === null || report === 'unreadable') return null
  const value = report.textRemovedAt
  return typeof value === 'string' && value ? value : null
}

/** Trägt der Lauf noch etwas, das die Frist entfernen würde? */
export function runHasRemovableText(run: Pick<RunTextRetentionRow, 'promptSource' | 'resultJson' | 'attachmentsJson' | 'error'>): boolean {
  return Boolean(run.promptSource)
    || Boolean(run.attachmentsJson)
    || Boolean(run.error)
    || reportHasText(run.resultJson)
}

/**
 * Das ENDE eines Laufs für die Frist: `finishedAt`, ersatzweise `$updatedAt`.
 *
 * Beide Wege in einen Endzustand setzen `finishedAt` (finish.post.ts,
 * cancel.post.ts) — ein Endzustand ohne `finishedAt` ist also Alt- oder
 * Handarbeit. `$updatedAt` liegt dann nie VOR dem echten Ende (die letzte
 * Änderung kommt frühestens mit dem Ende) und höchstens danach (der
 * Protokoll-Aufräumer oder die Kontolöschung schreiben später in die Zeile):
 * die Frist beginnt so allenfalls zu SPÄT, nie zu früh. `$createdAt` wäre die
 * Gegenrichtung — ein langer Lauf verlöre seinen Text vor der Zeit.
 */
export function runTextRetentionEnd(run: Pick<RunTextRetentionRow, 'finishedAt' | '$updatedAt'>): string | null {
  return run.finishedAt || run.$updatedAt || null
}

/**
 * DIE REGEL: fällig ist ein Lauf, wenn ALLES gilt —
 *  1. er ist im ENDZUSTAND (`isTerminalRunStatus`): ein Lauf auf `draft`,
 *     `queued`, `claimed` oder `running` wird nie angefasst, egal wie alt;
 *  2. sein Ende liegt MEHR als 365 Tage zurück (genau 365 Tage ⇒ bleibt;
 *     unlesbares Datum ⇒ bleibt — `olderThanDays`), und angelegt wurde er
 *     ebenso früher (Gegenprobe: ein Lauf kann nicht vor seinem Anlegen enden);
 *  3. er trägt noch etwas zum Entfernen — sonst wäre der Lauf nie fertig und
 *     zählte jede Stunde dieselben Zeilen.
 */
export function runTextDue(run: RunTextRetentionRow, now: Date): boolean {
  if (!isTerminalRunStatus(run.status)) return false
  if (!olderThanDays(run.$createdAt, RUN_TEXT_RETENTION_DAYS, now)) return false
  if (!olderThanDays(runTextRetentionEnd(run), RUN_TEXT_RETENTION_DAYS, now)) return false
  return runHasRemovableText(run)
}

/** `decide` für das Gerüst: der Grund, wenn fällig, sonst `null`. */
export function decideRunTextRetention(run: RunTextRetentionRow, now: Date): string | null {
  return runTextDue(run, now) ? RUN_TEXT_RETENTION_REASON : null
}

/** Die Spalten, die das Schwärzen in EINEM Schreibvorgang setzt. */
export interface RunTextRedaction {
  promptSource: string
  attachmentsJson: string
  error: string
  resultJson: string
}

/**
 * EIN Schreibvorgang auf die Zeile: Auftrag, Anhänge-Liste und Fehlertext
 * leer, der Bericht auf die Erlaubnisliste reduziert und mit `textRemovedAt`
 * markiert. Keine dieser Spalten ist `required` (Migrationen runner-001/-002),
 * leer ist für jede ein gültiger Wert.
 */
export function buildRunTextRedaction(run: Pick<RunTextRetentionRow, 'resultJson'>, removedAtIso: string): RunTextRedaction {
  return {
    promptSource: '',
    attachmentsJson: '',
    error: '',
    resultJson: redactRunResult(run.resultJson, removedAtIso),
  }
}
