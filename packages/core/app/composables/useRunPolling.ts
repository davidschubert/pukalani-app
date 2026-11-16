import { getCurrentScope, onScopeDispose, toValue, watch } from 'vue'
import type { MaybeRefOrGetter } from 'vue'

/**
 * EINEN LAUF IM HINTERGRUND NACHFRAGEN (GA1 P18, BE-008) — das gemeinsame
 * Stück für jede Seite, deren Knopf mit 202 antwortet und deren Ergebnis
 * später an einer Zeile steht (Marktvergleich; gedacht auch für die
 * Merkliste von insights, deren Brief-Lauf dasselbe Muster hat).
 *
 * ── WAS ES TUT ───────────────────────────────────────────────────────────
 * Solange `active` wahr ist UND der Tab sichtbar ist, ruft es `tick` im Takt
 * `intervalMs`. Wird der Tab wieder sichtbar, fragt es SOFORT einmal nach —
 * wer nach zwei Minuten zurückkommt, soll nicht noch fünf Sekunden auf einen
 * Stand warten, den der Server längst hat.
 *
 * ── WAS ES BEWUSST NICHT TUT ─────────────────────────────────────────────
 *  - KEIN ÜBERLAPPEN: läuft ein Tick noch (langsame Antwort), fällt der
 *    nächste Takt aus. Zwei gleichzeitige `refresh()` derselben Daten
 *    überschrieben einander in beliebiger Reihenfolge.
 *  - KEIN FEHLER NACH AUSSEN: ein gescheiterter Tick wird geschluckt, der
 *    nächste versucht es wieder. Ein kurzer Netz-Aussetzer soll keinen Toast
 *    werfen; den AUSGANG eines Laufs liest die Seite aus den Daten, nicht aus
 *    dem Abfragen.
 *  - KEIN ABFRAGEN IM VERSTECKTEN TAB: ein Hintergrund-Tab, der alle fünf
 *    Sekunden fragt, kostet Server und Akku für einen Stand, den niemand
 *    sieht.
 *  - NUR IM BROWSER: auf dem Server gibt es keinen Takt und kein `document`;
 *    dort ist das Composable ein No-op.
 *  - KEIN SOFORT-TICK BEIM AKTIVWERDEN: wer `active` auf wahr setzt, hat den
 *    Stand gerade erst bekommen (Antwort des Starts oder SSR-Daten).
 *
 * Aufgeräumt wird mit dem Gültigkeitsbereich (`onScopeDispose`) — beim
 * Verlassen der Seite steht kein Timer mehr.
 *
 * VueUse ist im Monorepo nicht eingebunden; Sichtbarkeit kommt deshalb
 * direkt aus `document.visibilityState` und `visibilitychange`.
 */

export interface RunPollingOptions {
  /** Soll gerade abgefragt werden (läuft ein Lauf)? */
  active: MaybeRefOrGetter<boolean>
  /** Takt in Millisekunden (z. B. `RUN_LEASE_POLL_MS`). */
  intervalMs: number
  /** Eine Nachfrage — meist ein `refresh()` der Daten, die den Lauf tragen. */
  tick: () => Promise<unknown>
}

/** Die pure Entscheidung: jetzt nachfragen? */
export function runPollingShouldTick(input: { active: boolean, visible: boolean, busy: boolean }): boolean {
  return input.active && input.visible && !input.busy
}

export function useRunPolling(options: RunPollingOptions): { tickNow: () => Promise<void> } {
  let busy = false
  let timer: ReturnType<typeof setInterval> | null = null

  const hasDocument = typeof document !== 'undefined'
  const visible = (): boolean => !hasDocument || document.visibilityState !== 'hidden'

  const tickNow = async (): Promise<void> => {
    if (!runPollingShouldTick({ active: toValue(options.active), visible: visible(), busy })) return
    busy = true
    try {
      await options.tick()
    }
    catch {
      // Geschluckt (s. Kopf) — der nächste Takt versucht es wieder.
    }
    finally {
      busy = false
    }
  }

  if (!hasDocument) return { tickNow }

  const stop = (): void => {
    if (timer !== null) clearInterval(timer)
    timer = null
  }
  const start = (): void => {
    if (timer !== null) return
    timer = setInterval(() => {
      void tickNow()
    }, options.intervalMs)
  }

  const onVisibility = (): void => {
    if (document.visibilityState !== 'hidden') void tickNow()
  }
  document.addEventListener('visibilitychange', onVisibility)

  const stopWatch = watch(
    () => toValue(options.active),
    (active) => {
      if (active) start()
      else stop()
    },
    { immediate: true },
  )

  if (getCurrentScope()) {
    onScopeDispose(() => {
      stopWatch()
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    })
  }

  return { tickNow }
}
