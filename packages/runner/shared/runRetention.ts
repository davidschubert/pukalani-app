import { isTerminalRunStatus } from './runGuards'
import type { RunStatus } from './types/runner'

/**
 * AUFBEWAHRUNGSFRISTEN DES AI-RUNNERS (BE-025, Entscheidung des Betreibers):
 * das Protokoll (Transkript) eines Laufs lebt 30 Tage nach seinem Ende, die
 * Zeitleisten-Zeilen (`run_events`) 90 Tage. Danach räumt der stündliche Lauf
 * in der Betreiber-Konsole auf (`server/utils/runRetention.ts`).
 *
 * BEWUSST PUR UND BEWUSST HIER: die Entscheidung „darf das weg?" ist die
 * Sicherung eines nicht umkehrbaren Löschens. Sie soll einzeln gegengeprüft
 * werden können (tests/runRetention.test.ts), ohne Appwrite und ohne Nitro.
 *
 * Die Fristen sind KONSTANTEN, keine Config: sie sind eine Entscheidung über
 * Daten, kein Regler je Deployment. Wer sie ändert, ändert diese Zeilen — und
 * das steht dann im Verlauf.
 */
export const TRANSCRIPT_RETENTION_DAYS = 30
export const EVENT_RETENTION_DAYS = 90

/** Die Spaltengröße von `runs.resultJson` (Migration runner-001). */
export const RESULT_JSON_MAX_LENGTH = 6000

const DAY_MS = 24 * 60 * 60 * 1000

export type RunRetentionMode = 'off' | 'dry-run' | 'apply'

const MODES: readonly RunRetentionMode[] = ['off', 'dry-run', 'apply']

/**
 * Der Schalter `pukalani.runner.retention`. Fehlt er ⇒ `off`; ein unbekannter
 * Wert ⇒ `off` UND `invalid` (der Aufrufer schreibt die Fehlerzeile — bei
 * einem Löschlauf erst recht nie still „irgendwas" annehmen). Dieselbe Regel
 * wie beim Label-Abgleich.
 */
export function resolveRunRetentionMode(value: unknown): { mode: RunRetentionMode, invalid: boolean } {
  if (value === undefined || value === null || value === '') return { mode: 'off', invalid: false }
  if (typeof value === 'string' && (MODES as readonly string[]).includes(value)) {
    return { mode: value as RunRetentionMode, invalid: false }
  }
  return { mode: 'off', invalid: true }
}

/** Die Frist als ISO-Zeitpunkt: alles, was VOR ihm liegt, ist abgelaufen. */
export function retentionCutoff(nowMs: number, days: number): string {
  return new Date(nowMs - days * DAY_MS).toISOString()
}

/** Liegt `iso` lesbar VOR `cutoffIso`? Unlesbar ⇒ nein (die billige Richtung des Zweifels). */
function isBefore(iso: string | null | undefined, cutoffIso: string): boolean {
  if (!iso) return false
  const at = Date.parse(iso)
  const cutoff = Date.parse(cutoffIso)
  if (!Number.isFinite(at) || !Number.isFinite(cutoff)) return false
  return at < cutoff
}

/**
 * Darf das Protokoll dieses Laufs weg?
 *
 * Nur, wenn der Lauf in einem ENDZUSTAND ist — ein Lauf auf `draft`, `queued`,
 * `claimed` oder `running` ist ein Auftrag, der noch zu jemandem gehört (auch
 * ein auf `running` hängengebliebener Lauf: den bereinigt der Abbrechen-Knopf,
 * nicht die Frist) — UND sein Ende vor der Frist liegt. Das Ende ist
 * `finishedAt`; fehlt es (der Lauf wurde z. B. abgebrochen, bevor der Runner
 * ein Ende meldete), gilt ersatzweise das Anlegedatum der Datei, denn das
 * Protokoll wird erst am Ende eines Laufs hochgeladen.
 *
 * Unlesbare Zeitstempel ⇒ NICHT löschen. Ein Datum, das man nicht lesen kann,
 * als „unendlich alt" zu nehmen, wäre die teure Richtung des Zweifels.
 */
export function transcriptExpired(
  run: { status: RunStatus, finishedAt: string | null, $createdAt: string },
  fileCreatedAt: string,
  cutoffIso: string,
): boolean {
  if (!isTerminalRunStatus(run.status)) return false
  // Gegenprobe: ein Lauf, der jünger als die Frist ANGELEGT wurde, kann nicht
  // vor ihr geendet haben — widerspricht `finishedAt` dem, stimmt etwas nicht.
  if (Number.isFinite(Date.parse(run.$createdAt)) && !isBefore(run.$createdAt, cutoffIso)) return false
  const end = run.finishedAt || fileCreatedAt
  return isBefore(end, cutoffIso)
}

/**
 * Der Bericht eines Laufs NACH dem Löschen seines Protokolls: `transcriptFileId`
 * wird `''` (der Bericht zeigt dann keinen Download-Link mehr, und
 * `transcript.get.ts` antwortet 404 statt eines Speicherfehlers), dazu
 * `transcriptPurgedAt` als Spur, WARUM es fehlt.
 *
 * `null` ⇒ die Zeile NICHT anfassen: das JSON ist leer, kaputt oder kein
 * Objekt. `resultJson` kommt von einem Programm auf einem fremden Rechner;
 * ein kaputtes Feld zu „reparieren" hieße, den Bericht zu überschreiben.
 *
 * Würde das Ergebnis die Spalte sprengen, entfällt `transcriptPurgedAt` — die
 * Spur ist eine Höflichkeit, die geleerte Datei-Id ist die Pflicht.
 */
export function clearTranscriptReference(resultJson: string, purgedAtIso: string): string | null {
  if (!resultJson) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(resultJson)
  }
  catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null

  const withTrace = JSON.stringify({ ...parsed, transcriptFileId: '', transcriptPurgedAt: purgedAtIso })
  if (withTrace.length <= RESULT_JSON_MAX_LENGTH) return withTrace
  const plain = JSON.stringify({ ...parsed, transcriptFileId: '' })
  return plain.length <= RESULT_JSON_MAX_LENGTH ? plain : null
}

/** Zahlen eines Teils (Protokolle oder Ereignisse) — nie Ids, nie Inhalte. */
export interface RunRetentionCounts {
  /** Abgelaufen und löschbar (im Probelauf: WÜRDE gelöscht). */
  candidates: number
  /** Nachweislich gelöscht (404 zählt als gelöscht). Im Probelauf immer 0. */
  deleted: number
  /** Betrachtet, aber bewusst stehen gelassen (kein Protokoll, Lauf noch aktiv, zu jung). */
  skipped: number
  /** Löschen gescheitert — oder das Blättern brach ab (dann +1, der Teil endet dort). */
  failed: number
}

export interface RunRetentionResult {
  mode: 'dry-run' | 'apply'
  transcripts: RunRetentionCounts
  events: RunRetentionCounts
  /** Ein Deckel hat gegriffen — der nächste Lauf macht weiter. */
  truncated: boolean
}
