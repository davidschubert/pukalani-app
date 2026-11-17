import { olderThanDays } from '../../core/shared/rowRetention'
import { isTerminalRunStatus } from './runGuards'
import type { RunRow, RunStatus } from './types/runner'

/**
 * LÄUFE, DIE NIE BEENDET WURDEN, WERDEN NACH 7 TAGEN STILLE BEENDET
 * (RU1 c, zweiter Teil — seit 2026-11-17).
 *
 * Die Fristen des Runners hängen alle am ENDE eines Laufs: Protokolle 30 Tage,
 * Ereignisse 90 Tage, Texte und Anhänge 12 Monate (`shared/runRetention.ts`,
 * `shared/runTextRetention.ts`). Ein Lauf, der nie endet, fällt durch alle
 * drei — und trägt Auftragstext und Anhänge ohne Ende. Das sind:
 *  - ein ENTWURF (`draft`), dessen Hochladen abbrach (Fenster geschlossen,
 *    Netz weg) — das Board legt ihn an, lädt hoch und gibt frei; scheitert
 *    der Browser dazwischen, wirft niemand ihn mehr weg;
 *  - ein Lauf auf `queued`, `claimed` oder `running`, dessen Dienst abstürzte
 *    oder dessen Rechner aus ist („Stirbt der Daemon mitten im Lauf, bleibt
 *    der Lauf auf `running`").
 *
 * WAS PASSIERT: der Lauf wird ABGEBROCHEN (`cancelled`, `finishedAt` = jetzt,
 * `error` = `abandoned`) — dieselbe Wirkung wie der Abbrechen-Knopf im Board
 * (`runs/:id/cancel.post.ts`), der für genau diese Fälle bisher die einzige
 * Kur war. Danach greifen die vorhandenen Fristen von selbst. Bewusst NICHT:
 *  - LÖSCHEN: die Zeile trägt Kosten und Kennungen, und für Entwürfe gibt es
 *    im Modell schon „wegwerfen" — das ist `draft → cancelled`, kein Löschen;
 *  - `failed`: der Dienst auf dem Rechner reagiert in der Ereignis-Antwort nur
 *    auf `cancelled` und hört dann selbst auf (`tools/ai-runner/src/events.ts`).
 *    Lebte er wider Erwarten doch noch, hielte ihn `failed` nicht an — er liefe
 *    bis zum Ende und bekäme erst beim `finish` ein 409. `cancelled` hält ihn
 *    beim nächsten Bündel an; sein `finish` danach bekommt dasselbe 409
 *    (`not_finishable`), das der Dienst schon heute nur protokolliert.
 *    Und `failed` löste Benachrichtigungen aus, als wäre ein Agent gescheitert.
 *  Der Grund `abandoned` steht in `error`, damit das Board ehrlich sagt, dass
 *  niemand geklickt hat (`runAbandoned`).
 *
 * DIE FRIST: 7 Tage ohne jedes Lebenszeichen. Ein Lauf dauert Minuten bis
 * Stunden — der Dienst kappt jeden Lauf an `maxRunMinutes`, einen interaktiven
 * nach 8 Stunden (`tools/ai-runner/src/run.ts`). Ein Entwurf lebt Sekunden
 * (die Zeit des Hochladens), nichts im Board setzt einen alten Entwurf fort.
 * EINE Frist für alle vier Zustände: eine längere für Entwürfe hätte keinen
 * Grund, ein hängender Entwurf zeigt im Lauf-Bereich des Tickets dagegen
 * weiter „läuft".
 *
 * LEBENSZEICHEN sind ALLE Zeitpunkte, die ein lebender Lauf bewegt: die
 * letzte Änderung der Zeile (`$updatedAt` — Anlegen, Freigeben, Claim, Start,
 * Stempel), `claimedAt`, `startedAt` UND das jüngste Ereignis in `run_events`.
 * Das Ereignis ist der Grund, warum die Regel es mitnimmt: ein laufender Lauf
 * meldet sich über Ereignisse, die Zeile selbst ändert er dabei NICHT
 * (`events.post.ts` schreibt nur beim Start und beim ersten Stempel). Ohne
 * das Ereignis wäre `$updatedAt` eines lebenden Laufs der Moment seines
 * Starts.
 *
 * `needs_input` ist ein ENDZUSTAND (`TERMINAL_RUN_STATUSES`) und wird nie
 * angefasst — eine Rückfrage darf beliebig lange auf ihre Antwort warten.
 *
 * BEWUSST PUR: „ist dieser Lauf fällig?" ist die Sicherung eines Schreibens,
 * das einen fremden Prozess anhält — der Test prüft sie mit gestellter Uhr
 * (tests/staleRunRetention.test.ts).
 */

/** Die Kennung des Laufs (Takt, Log-Zeilen, `ops/timed-jobs.conf`). */
export const STALE_RUN_RETENTION_JOB = 'stale-run-retention'

/** Die Frist: 7 Tage ohne Lebenszeichen. Eine Konstante, kein Regler. */
export const STALE_RUN_DAYS = 7

/**
 * Der Grund in `runs.error` — ein festes, kurzes Wort statt Fliesstext (wie
 * `interactive_timeout` des Dienstes). Das Board übersetzt es.
 */
export const STALE_RUN_ERROR = 'abandoned'

/** Die Gründe in `byReason` des Ergebnisses — getrennt, damit die Zahl sagt, WAS hing. */
export const STALE_RUN_REASONS = {
  draft: 'stale-draft',
  active: 'stale-active',
} as const

/** Die Zustände, die die Regel überhaupt ansieht — genau die NICHT terminalen. */
export const STALE_RUN_STATUSES = ['draft', 'queued', 'claimed', 'running'] as const satisfies readonly RunStatus[]

/** Was die Regel von einer Zeile liest. */
export type StaleRunRow = Pick<RunRow, '$id' | '$createdAt' | '$updatedAt' | 'status' | 'claimedAt' | 'startedAt'>

/**
 * Das JÜNGSTE Lebenszeichen eines Laufs, oder `null`, wenn keiner der
 * Zeitpunkte lesbar ist. Unlesbare Werte zählen nicht — aber ein einziger
 * lesbarer genügt.
 */
export function staleRunLastActivity(run: Pick<StaleRunRow, '$updatedAt' | 'claimedAt' | 'startedAt'>, lastEventAt: string | null): string | null {
  let latest: number | null = null
  for (const value of [run.$updatedAt, run.claimedAt, run.startedAt, lastEventAt]) {
    if (!value) continue
    const at = Date.parse(value)
    if (!Number.isFinite(at)) continue
    if (latest === null || at > latest) latest = at
  }
  return latest === null ? null : new Date(latest).toISOString()
}

/**
 * DIE REGEL: fällig ist ein Lauf, wenn ALLES gilt —
 *  1. er ist NICHT im Endzustand (`draft`, `queued`, `claimed`, `running`);
 *  2. er wurde vor MEHR als 7 Tagen angelegt (Gegenprobe; unlesbar ⇒ bleibt);
 *  3. sein jüngstes Lebenszeichen liegt MEHR als 7 Tage zurück — genau 7 Tage
 *     ⇒ bleibt; kein lesbares Lebenszeichen ⇒ bleibt (`olderThanDays`).
 *
 * `lastEventAt` = Zeitpunkt des jüngsten Ereignisses (`null` = keins). Wer
 * ihn noch nicht kennt, ruft mit `null`: das Ergebnis kann dadurch nur
 * „fällig" statt „bleibt" werden, nie umgekehrt — die Anbindung nutzt das
 * als billige Vorprüfung, bevor sie das Ereignis nachschlägt.
 */
export function staleRunDue(run: StaleRunRow, lastEventAt: string | null, now: Date): boolean {
  if (isTerminalRunStatus(run.status)) return false
  if (!(STALE_RUN_STATUSES as readonly string[]).includes(run.status)) return false
  if (!olderThanDays(run.$createdAt, STALE_RUN_DAYS, now)) return false
  return olderThanDays(staleRunLastActivity(run, lastEventAt), STALE_RUN_DAYS, now)
}

/** Der Grund, wenn fällig, sonst `null`. */
export function decideStaleRun(run: StaleRunRow, lastEventAt: string | null, now: Date): string | null {
  if (!staleRunDue(run, lastEventAt, now)) return null
  return run.status === 'draft' ? STALE_RUN_REASONS.draft : STALE_RUN_REASONS.active
}

/** Die Spalten, die das Beenden in EINEM Schreibvorgang setzt. */
export interface StaleRunClosure {
  status: 'cancelled'
  finishedAt: string
  error: string
}

/** Wie der Abbrechen-Knopf: `cancelled` mit Endzeit — dazu der Grund. */
export function buildStaleRunClosure(nowIso: string): StaleRunClosure {
  return { status: 'cancelled', finishedAt: nowIso, error: STALE_RUN_ERROR }
}

/**
 * DER LETZTE BLICK vor dem Schreiben: ist die Zeile noch dieselbe, die die
 * Regel für fällig hielt? Hat sich Zustand oder `$updatedAt` bewegt, hat
 * jemand (Board, Dienst) inzwischen gehandelt — dann bleibt sie, und der
 * nächste Takt entscheidet neu.
 */
export function staleRunUnchanged(before: Pick<StaleRunRow, 'status' | '$updatedAt'>, fresh: Pick<StaleRunRow, 'status' | '$updatedAt'>): boolean {
  return fresh.status === before.status && fresh.$updatedAt === before.$updatedAt
}

/** Wurde dieser Lauf von der Frist beendet (statt von einem Menschen oder dem Dienst)? (Oberfläche) */
export function runAbandoned(run: Pick<RunRow, 'status' | 'error'>): boolean {
  return run.status === 'cancelled' && run.error === STALE_RUN_ERROR
}
