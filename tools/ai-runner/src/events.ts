import { isPermanentApiError, type RunnerApi } from './api.ts'
import type { RunEventPayload } from './protocol.ts'
import { MAX_MESSAGE_CHARS, truncate, type StreamEventDraft } from './stream.ts'
import { log } from './log.ts'

/**
 * Die Ereignis-Bündelung — docs/archiv/AI-RUNNER.md § 7.2 Schritt 6:
 * „gebündelt als Ereignisse schicken (etwa alle 2 s oder alle 20 Zeilen —
 * nicht je Zeile)".
 *
 * Drei Eigenschaften, die man nicht wegoptimieren darf:
 *
 *  1. `seq` wird BEIM EINSTELLEN vergeben, nicht beim Senden. Sonst änderte
 *     ein Wiederholungsversuch die Nummern, und die serverseitige
 *     Retry-Dedupe (sie misst am höchsten gesehenen `seq`) liesse dieselbe
 *     Zeile ein zweites Mal durch.
 *  2. Ein Bündel wird erst aus der Warteschlange genommen, wenn es
 *     ANGEKOMMEN ist. Ein Netzabbruch verliert damit keine Zeile — und weil
 *     die Nummern schon feststehen, sortiert der Server das Doppelte aus.
 *  3. Die ANTWORT wird gelesen. Sie ist der einzige Weg, auf dem der Runner
 *     erfährt, dass das Board den Lauf abgebrochen hat (§ 9).
 */

/** Nach so vielen Einträgen wird sofort geschickt (§ 7.2: „alle 20 Zeilen"). */
export const FLUSH_AT_EVENTS = 20
/** … oder nach so vielen Millisekunden, was zuerst eintritt. */
export const FLUSH_EVERY_MS = 2000
/** Höchstens so viele je Anfrage — `runEventsSchema` lässt 50 zu. */
export const MAX_BATCH = 50
/**
 * Notbremse. Ein Agent, der in einer Schleife Werkzeuge ruft, produziert
 * Zeilen schneller, als eine Naht sie annimmt; ohne Deckel wächst die
 * Warteschlange, bis der Daemon am Speicher stirbt — und ein toter Daemon
 * lässt den Lauf für immer auf `running` stehen (README, Betriebsgrenzen).
 */
export const MAX_QUEUE = 1000

export class EventPump {
  #api: RunnerApi
  #runId: string
  #sessionId: string
  #queue: RunEventPayload[] = []
  #seq = 1
  #busy = false
  #timer: NodeJS.Timeout | null = null
  #workBranch = ''
  #dropped = 0

  /** Vom Board abgebrochen (§ 9) — der Lauf-Ablauf fragt das nach jedem Bündel ab. */
  cancelled = false

  constructor(api: RunnerApi, runId: string, sessionId: string) {
    this.#api = api
    this.#runId = runId
    this.#sessionId = sessionId
  }

  get pending(): number {
    return this.#queue.length
  }

  /** Der Branch reist als ERST-WERT mit jedem Bündel (§ 7.2 Schritt 1). */
  setWorkBranch(branch: string): void {
    this.#workBranch = branch
  }

  /**
   * Die Session-Id nachtragen. Ein `--resume`-Lauf (§ 9) kennt seine NEUE
   * Session erst aus dem Abschluss-JSON — bis dahin bleibt sie '' und reist
   * nicht mit; danach stempelt sie der Server als Erst-Wert.
   */
  setSessionId(sessionId: string): void {
    this.#sessionId = sessionId
  }

  /**
   * Den Ereigniszähler hinter eine SEQUENZ heben, die der Server bereits
   * vergeben hat (§ 7.3): der SessionEnd-Hook schreibt seine Ende-Markierung
   * direkt in `run_events` und bewegt damit den serverseitigen Höchststand.
   * Ohne diese Angleichung fiele die ERSTE Zeile, die der Runner danach meldet
   * („Committet …"), der Retry-Dedupe zum Opfer (seq ≤ Höchststand). Nur nach
   * oben — ein bereits höherer Zähler bleibt.
   */
  resumeAfter(seq: number): void {
    if (this.#seq <= seq) this.#seq = seq + 1
  }

  push(draft: StreamEventDraft): void {
    if (this.#queue.length >= MAX_QUEUE) {
      this.#dropped++
      return
    }
    this.#queue.push({
      seq: this.#seq++,
      kind: draft.kind,
      // Letztes Netz vor dem 400: die Spalte fasst 4000 Zeichen.
      message: truncate(draft.message, MAX_MESSAGE_CHARS) || '—',
      at: new Date().toISOString(),
    })
  }

  status(message: string): void {
    this.push({ kind: 'status', message })
  }

  error(message: string): void {
    this.push({ kind: 'error', message })
  }

  /** Der Takt läuft nur während eines Laufs. */
  start(): void {
    if (this.#timer) return
    this.#timer = setInterval(() => { void this.flush() }, FLUSH_EVERY_MS)
    // Der Takt darf den Prozess nicht am Leben halten, wenn sonst nichts mehr läuft.
    this.#timer.unref?.()
  }

  stop(): void {
    if (!this.#timer) return
    clearInterval(this.#timer)
    this.#timer = null
  }

  /**
   * Ein Bündel losschicken. Läuft schon eines, kehrt der Aufruf zurück — der
   * Takt holt es gleich wieder ab. Zwei gleichzeitige Anfragen brächten die
   * Reihenfolge durcheinander, und die Reihenfolge IST die Zeitleiste.
   */
  async flush(): Promise<void> {
    if (this.#busy || !this.#queue.length) return
    this.#busy = true
    try {
      while (this.#queue.length) {
        const batch = this.#queue.slice(0, MAX_BATCH)
        try {
          const ack = await this.#api.postEvents(this.#runId, {
            events: batch,
            // Idempotent: der Server stempelt nur den ERSTEN Wert (§ 7.2
            // Schritt 1), Wiederholen kostet nichts und schützt gegen ein
            // verlorenes erstes Bündel. Bei einer Fortsetzung ist sie anfangs
            // '' (die neue Session kennt erst das Abschluss-JSON, § 9) und
            // reist dann NICHT mit — ein leerer Wert fiele durch die
            // uuid-Prüfung des Servers.
            ...(this.#sessionId ? { sessionId: this.#sessionId } : {}),
            ...(this.#workBranch ? { workBranch: this.#workBranch } : {}),
          })
          this.#queue.splice(0, batch.length)
          if (ack.status === 'cancelled') this.cancelled = true
        }
        catch (error) {
          if (isPermanentApiError(error)) {
            // 4xx heisst: dieses Bündel wird NIE angenommen (verstümmelte
            // Zeile, Lauf gehört uns nicht mehr). Wegwerfen ist richtig —
            // sonst blockiert es alle folgenden Zeilen für immer.
            this.#queue.splice(0, batch.length)
            log.warn(`Ereignis-Bündel abgelehnt, verworfen: ${(error as Error).message}`)
            continue
          }
          // Netzfehler: liegen lassen, der nächste Takt versucht es erneut.
          log.warn(`Ereignisse konnten nicht gesendet werden (${this.#queue.length} offen): ${(error as Error).message}`)
          return
        }
      }
    }
    finally {
      this.#busy = false
    }
  }

  /**
   * Alles rausschicken, bevor der Lauf abgeschlossen wird. Wartet auf ein
   * gerade laufendes Bündel, statt es zu überholen.
   */
  async drain(attempts = 3): Promise<void> {
    if (this.#dropped) {
      this.push({ kind: 'status', message: `${this.#dropped} Ereignisse verworfen (Warteschlange voll)` })
      this.#dropped = 0
    }
    for (let attempt = 0; attempt < attempts; attempt++) {
      while (this.#busy) await new Promise(resolve => setTimeout(resolve, 100))
      await this.flush()
      if (!this.#queue.length) return
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }
}
