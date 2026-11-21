import { isFetchLoading, type FetchStatus } from './fetchLoading'

/**
 * ── DIE VIER ZUSTÄNDE EINER LISTE (FE-004, Q14, 2026-11-21) ─────────────────
 *
 * Eine Liste zeigt genau EINEN von vier Zuständen: sie lädt, der Abruf ist
 * gescheitert, sie ist leer, oder es sind Daten da. Vorher lasen die meisten
 * Seiten nur `data` und `status`: ein gescheiterter Abruf lieferte den
 * Vorgabewert (eine leere Liste), und die Seite sagte „nichts vorhanden" —
 * eine falsche Auskunft statt einer Fehlermeldung.
 *
 * Reihenfolge der Fragen:
 *  1. `status === 'error'` ⇒ Fehler (auch wenn noch alte Daten da sind: die
 *     Auskunft ist nicht mehr sicher, „Noch einmal versuchen" holt sie neu).
 *  2. Lädt (`idle`/`pending`, siehe `isFetchLoading`) ⇒ ohne Daten „lädt",
 *     mit Daten bleiben die Daten stehen (die Tabelle zeigt ihren Balken).
 *     Ein Neuversuch nach einem Fehler läuft deshalb sichtbar als „lädt".
 *  3. Ein gesetzter `error` ohne Fehler-Status (selten, z. B. nach `clear()`)
 *     ⇒ Fehler.
 *  4. Sonst leer oder Daten.
 *
 * Server und Browser rechnen mit denselben Eingaben dasselbe (Q15): ein Abruf
 * nur im Browser steht auf dem Server auf `idle`, im Browser auf `pending` —
 * beides ist hier „lädt".
 */
export type ListState = 'loading' | 'error' | 'empty' | 'ready'

export interface ListStateInput {
  status: FetchStatus
  /** Das `error` aus useFetch/useAsyncData (null/undefined = kein Fehler) */
  error?: unknown
  /** Ist die Liste leer? Die Seite entscheidet, was „leer" heißt. */
  empty: boolean
}

export function listState(input: ListStateInput): ListState {
  if (input.status === 'error') return 'error'
  if (isFetchLoading(input.status)) return input.empty ? 'loading' : 'ready'
  if (input.error !== null && input.error !== undefined) return 'error'
  return input.empty ? 'empty' : 'ready'
}
