import { logEvent } from './logEvent'

/**
 * DIE EINE HILFE FÜR ALLE ZEIT-LÄUFE (OPS-011, seit 2026-11-16).
 *
 * Bis dahin startete jedes Plugin seinen Takt von Hand (`setTimeout` +
 * `setInterval`). Ein Fehlschlag war eine freie `console.error`-Zeile ohne
 * Zeitstempel, ein Lauf (der Digest) fing seine Fehler gar nicht ab, und
 * keiner hielt fest, wann er zuletzt gelaufen war. Ob ein Lauf seit Tagen
 * stillsteht oder jede Stunde scheitert, sah niemand.
 *
 * WARUM ES DAS GIBT: ein täglicher Wächter auf dem Server zählt die
 * pm2-Logs. Er sucht genau zwei Zeilen — `job.registered` (einmal je Start)
 * und `job.run` (einmal je Takt). „Überfällig" (letzte `job.run`-Zeile älter
 * als zwei Takte) und „zuletzt gescheitert" werden AUSSEN gerechnet, aus
 * diesen Zeilen; hier gibt es dafür weder Uhr noch Alarm.
 *
 * WARUM JEDER LAUF EINE ZEILE SCHREIBT, obwohl die Plugins bei „0
 * Änderungen" bisher bewusst still waren: ohne Zeile ist ein erfolgreicher
 * leerer Lauf nicht von einem stehengebliebenen Takt zu unterscheiden. Die
 * FACHLICHEN Meldungen der Läufe bleiben still wie bisher; dazu kommt nur
 * die eine `job.run`-Zeile — bei Erfolg auf stdout (Level `info`), nicht ins
 * Fehler-Log. Ins Fehler-Log (stderr) geht sie nur bei `failed`.
 *
 * `run` liefert `'skipped'`, wenn der Lauf dran war, aber bewusst nichts zu
 * tun hatte (Tor je Takt geschlossen, schon ein Lauf im Gange). Wirft `run`,
 * ist das Ergebnis `failed`. Läuft der vorige Takt noch, wenn der nächste
 * kommt, startet der neue NICHT (`skipped`, `reason: 'overlap'`). Der
 * nächste Takt kommt immer, egal wie der vorige endete — und nichts endet
 * als unbehandelte Ablehnung.
 *
 * Tore, die für die ganze App gelten (Mailer fehlt, Env fehlt, Schalter
 * `off`), bleiben VOR dem Anmelden im Plugin: ein Lauf, der in dieser App gar
 * nicht fährt, meldet sich nicht an — sonst hielte ihn der Wächter für
 * überfällig.
 *
 * REGEL: ein neuer Zeit-Lauf wird NUR noch über `defineTimedJob` angemeldet.
 * Der Wächter `packages/core/tests/timedJobGuard.test.ts` wird rot bei jedem
 * `setInterval(` in einem Plugin und bei jeder neuen oder umbenannten
 * Kennung (dann auch `ops/timed-jobs.conf` nachziehen).
 *
 * Single-Instanz-Annahme wie bei allen Sweeps: der Stand lebt im Prozess.
 */

export type TimedJobResult = 'ok' | 'failed' | 'skipped'

export interface TimedJobOptions {
  /** Feste Kennung, `/^[a-z][a-z0-9-]{1,39}$/`, im Prozess eindeutig. */
  name: string
  /** Takt in Millisekunden. */
  everyMs: number
  /** Erster Lauf nach so vielen Millisekunden; fehlt ⇒ erst nach `everyMs`. */
  firstRunMs?: number
  /** Timer nicht am Leben halten lassen (sauberer Exit von CLI/Tests). */
  unref?: boolean
  /** `'skipped'` = dran, aber bewusst nichts zu tun; sonst nichts zurückgeben. */
  run: () => Promise<'skipped' | undefined>
}

export interface TimedJobState {
  name: string
  everyMs: number
  /** ISO-Zeit der letzten `job.run`-Zeile, `null` vor dem ersten Takt. */
  lastRunAt: string | null
  lastResult: TimedJobResult | null
  lastOkAt: string | null
  runs: number
  failures: number
}

export const TIMED_JOB_NAME_PATTERN = /^[a-z][a-z0-9-]{1,39}$/

/** So lang darf `message` in einer `failed`-Zeile höchstens werden. */
const MESSAGE_MAX = 300

interface TimedJobEntry {
  state: TimedJobState
  running: boolean
  timers: Array<ReturnType<typeof setTimeout>>
}

const jobs = new Map<string, TimedJobEntry>()

function everyMinOf(everyMs: number): number {
  return Math.round(everyMs / 60000)
}

function record(entry: TimedJobEntry, result: TimedJobResult, ms: number, extra: Record<string, unknown> = {}): void {
  const state = entry.state
  const now = new Date().toISOString()
  state.runs++
  state.lastRunAt = now
  state.lastResult = result
  if (result === 'ok') state.lastOkAt = now
  if (result === 'failed') state.failures++
  logEvent(result === 'failed' ? 'error' : 'info', 'job.run', {
    job: state.name,
    result,
    ms,
    everyMin: everyMinOf(state.everyMs),
    ...extra,
  })
}

function failureFields(error: unknown): { error: string, message: string } {
  const name = error instanceof Error ? error.name : typeof error
  const message = error instanceof Error ? error.message : String(error)
  return { error: name, message: message.slice(0, MESSAGE_MAX) }
}

function tick(entry: TimedJobEntry, run: TimedJobOptions['run']): void {
  if (entry.running) {
    record(entry, 'skipped', 0, { reason: 'overlap' })
    return
  }
  entry.running = true
  const started = Date.now()
  const once = async (): Promise<void> => {
    let outcome: TimedJobResult
    let extra: Record<string, unknown> = {}
    try {
      outcome = (await run()) === 'skipped' ? 'skipped' : 'ok'
    }
    catch (error) {
      outcome = 'failed'
      extra = failureFields(error)
    }
    finally {
      entry.running = false
    }
    record(entry, outcome, Date.now() - started, extra)
  }
  // Das Netz unter dem Netz: selbst eine werfende Log-Zeile darf den Takt
  // nicht als unbehandelte Ablehnung beenden.
  // eslint-disable-next-line pukalani/no-silent-catch -- Netz unter dem Netz: der Takt protokolliert sich selbst (job.run), hier darf nur keine unbehandelte Ablehnung entstehen
  void once().catch(() => {})
}

/**
 * Doppelte Kennung: unter vitest ein Wurf (der Fehler soll im Test sofort
 * auffallen), sonst — dev UND Produktion — wird die zweite Anmeldung
 * ignoriert und eine `job.duplicate`-Zeile geschrieben. Das ist das
 * Robustere: echte Doppel im Code fängt schon der Wächter-Test statisch,
 * ein Wurf zur Laufzeit fügte nur ein Risiko hinzu — ein Plugin, das beim
 * Start wirft, nimmt die App mit, und ein HMR-Neuladen, das Plugins erneut
 * ausführt, während der Modul-Stand stehen bleibt, ließe den Dev-Server
 * krachen. Der erste Takt läuft weiter.
 */
function throwsOnDuplicate(): boolean {
  return Boolean(process.env.VITEST)
}

export function defineTimedJob(options: TimedJobOptions): void {
  const { name, everyMs, firstRunMs, unref, run } = options
  if (!TIMED_JOB_NAME_PATTERN.test(name)) {
    throw new Error(`defineTimedJob: ungültige Kennung „${name}" (erwartet ${TIMED_JOB_NAME_PATTERN})`)
  }
  if (!Number.isFinite(everyMs) || everyMs <= 0) {
    throw new Error(`defineTimedJob: everyMs muss positiv sein (${name})`)
  }
  if (jobs.has(name)) {
    if (throwsOnDuplicate()) throw new Error(`defineTimedJob: Kennung „${name}" ist schon angemeldet`)
    logEvent('error', 'job.duplicate', { job: name })
    return
  }

  const entry: TimedJobEntry = {
    state: { name, everyMs, lastRunAt: null, lastResult: null, lastOkAt: null, runs: 0, failures: 0 },
    running: false,
    timers: [],
  }
  jobs.set(name, entry)

  if (firstRunMs !== undefined) entry.timers.push(setTimeout(() => tick(entry, run), firstRunMs))
  entry.timers.push(setInterval(() => tick(entry, run), everyMs))
  if (unref) {
    for (const timer of entry.timers) timer.unref?.()
  }

  logEvent('info', 'job.registered', { job: name, everyMin: everyMinOf(everyMs) })
}

/** Der Stand aller angemeldeten Läufe in diesem Prozess (Kopien). */
export function listTimedJobs(): TimedJobState[] {
  return [...jobs.values()].map(entry => ({ ...entry.state }))
}

/** Nur für Tests: alle Timer stoppen und die Anmeldungen vergessen. */
export function __resetTimedJobsForTests(): void {
  for (const entry of jobs.values()) {
    for (const timer of entry.timers) {
      clearTimeout(timer)
      clearInterval(timer)
    }
  }
  jobs.clear()
}
