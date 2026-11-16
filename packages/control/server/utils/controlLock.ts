import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import {
  acquireRunLease,
  appwriteRunLeaseStore,
  dropRunLease,
  type RunLeaseRow,
  type RunLeaseStore,
} from '../../../core/server/utils/runLease'
import { RUN_LEASE_BUSY_CODE } from '../../../core/shared/runLease'

/**
 * EINE REGEL, DIE ERST LIEST UND DANN SCHREIBT, HÄLT NUR UNTER EINER SPERRE
 * (BE-013).
 *
 * Das Control Plane setzt Regeln durch, die ein „erst zählen/lesen, dann
 * schreiben" sind: eine Community je Konto in der Testphase, das Wochen-
 * Kontingent der Einladungen, „nie der letzte Owner", die Besitz-Übergabe.
 * Zwei gleichzeitige Anfragen lesen denselben alten Stand und schreiben
 * beide — Appwrite kennt kein bedingtes Schreiben. Was bei Appwrite wirklich
 * ausschließt, ist das Anlegen einer Zeile mit FESTER Id (409 für den
 * Zweiten). Genau das ist die Lauf-Sperre des Core (`core/shared/runLease.ts`),
 * und diese Datei ist nur ihr Zuschnitt auf kurze Arbeit:
 *
 *  - TABELLE `system_runs` (system-040): der `system`-Layer läuft auf jeder
 *    Instanz, auch im Control Plane. Server-only, keine Rechte.
 *  - GEGENSTAND ALS HASH: `subject` ist eine Spalte mit 64 Zeichen, und
 *    `projekt:konto` passt nicht hinein. Der Hash passt immer, und in der
 *    Tabelle steht damit keine Konto-Id — sie bleibt ohne Personenbezug
 *    (`core/tests/support/userDataTables.ts`: `system_runs: NONE`).
 *  - WARTEN STATT ABWEISEN: die Arbeit dauert Millisekunden. Ist die Sperre
 *    belegt, wird ein paar Mal kurz gewartet (zusammen 1,8 s); erst dann 409
 *    `busy`. Ein Doppelklick bekommt so die echte Antwort der Regel (z. B.
 *    `last_owner`), nicht „bitte später".
 *  - FREIGABE IMMER: im `finally` wird die Zeile gelöscht (`dropRunLease`),
 *    damit sich keine Zeilen ansammeln. Scheitert das Löschen, beendet
 *    `dropRunLease` den Lauf — der Gegenstand ist auch dann wieder frei.
 *  - TOTER HALTER: stirbt der Prozess mitten in der Arbeit, bleibt die Zeile
 *    ohne Herzschlag stehen. Nach `CONTROL_LOCK_STALL_MS` gilt sie als
 *    abgebrochen und der Nächste legt die Nachfolger-Id an (Übernahme, ein
 *    gleichzeitiger Zweiter bekommt dort wieder 409). Einen Herzschlag
 *    braucht kurze Arbeit nicht.
 *  - NICHT PRÜFBAR HEISST NICHT FREI: kann die Sperre nicht gelesen oder
 *    angelegt werden (Netz, 5xx, fehlende Tabelle = 404), wirft
 *    `acquireRunLease` 503 `run_lease_unavailable` — und die Arbeit läuft
 *    NICHT. Ohne Sperre gäbe es die Regel nicht.
 *
 * Der Store ist einspritzbar, damit Tests das Rennen mit einer Ablage
 * nachstellen, die bei vorhandener Id 409 antwortet.
 */

export const CONTROL_LOCK_TABLE = 'system_runs'

/** Ab wann eine Sperre ohne Abschluss als verwaist gilt. */
export const CONTROL_LOCK_STALL_MS = 30_000

/** Die Pausen zwischen den Versuchen — zusammen 1,8 s. */
export const CONTROL_LOCK_PAUSES_MS: readonly number[] = [50, 100, 150, 250, 350, 400, 500]

export const CONTROL_LOCK_BUSY_CODE = 'busy'

export interface ControlLockOptions {
  /** Die Art der Regel (`onboarding`, `member-invite`, `team`). */
  scope: string
  /** Woran sie hängt — wird gehasht, bevor es gespeichert wird. */
  subject: string
  /** Nur für Tests: eine eigene Ablage statt `system_runs`. */
  store?: RunLeaseStore
  /** Nur für Tests: andere Pausen. */
  pausesMs?: readonly number[]
  /** Nur für Tests: die Uhr. */
  nowMs?: () => number
}

/** Der gespeicherte Gegenstand: sha256 in Hex (64 Zeichen = die Spaltengröße). */
export function controlLockSubject(subject: string): string {
  return createHash('sha256').update(subject, 'utf8').digest('hex')
}

/** Die Ablage `system_runs`. OHNE `event` aufrufbar: ein Zeit-Lauf hat keinen
 *  Request (Fristen-Lauf der eigenen Domain, BE-014). */
export function controlLockStore(event?: H3Event): RunLeaseStore {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  return appwriteRunLeaseStore({
    tablesDB: admin.tablesDB,
    databaseId: config.public.appwriteDatabaseId,
    tableId: CONTROL_LOCK_TABLE,
  })
}

function isBusy(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const data = (error as { data?: { code?: unknown } }).data
  return data?.code === RUN_LEASE_BUSY_CODE
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

async function acquireControlLock(
  store: RunLeaseStore,
  scope: string,
  subject: string,
  pausesMs: readonly number[],
  nowMs: () => number,
): Promise<RunLeaseRow> {
  for (let attempt = 0; ; attempt++) {
    try {
      const { lease } = await acquireRunLease(store, {
        scope,
        subject,
        stallMs: CONTROL_LOCK_STALL_MS,
        nowMs: nowMs(),
      })
      return lease
    }
    catch (error) {
      // Nur „belegt" wird abgewartet. 503 (nicht prüfbar) geht sofort hinaus —
      // fail-closed, die Arbeit läuft nicht.
      if (!isBusy(error)) throw error
      const pause = pausesMs[attempt]
      if (pause === undefined) {
        logEvent('warn', 'control.lock_busy', { scope, attempts: attempt + 1 })
        throw createError({ status: 409, statusText: 'Busy', data: { code: CONTROL_LOCK_BUSY_CODE } })
      }
      await sleep(pause)
    }
  }
}

/**
 * `work` unter der Sperre (scope, subject) ausführen — nie zwei gleichzeitig
 * für denselben Gegenstand, über Prozessgrenzen hinweg. Die Sperre fällt in
 * jedem Fall wieder, auch wenn `work` wirft.
 */
export async function withControlLock<T>(
  event: H3Event,
  options: ControlLockOptions,
  work: () => Promise<T>,
): Promise<T> {
  const store = options.store ?? controlLockStore(event)
  const lease = await acquireControlLock(
    store,
    options.scope,
    controlLockSubject(options.subject),
    options.pausesMs ?? CONTROL_LOCK_PAUSES_MS,
    options.nowMs ?? Date.now,
  )
  try {
    return await work()
  }
  finally {
    await dropRunLease(store, lease)
  }
}
