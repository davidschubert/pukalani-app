/**
 * DIE FILTER DER TERMINLISTE — pure Regel, ohne Vue.
 *
 * Die Liste hat EINE Ansicht (Kommende, Heute, Morgen, Wochenende, Archiv,
 * Geliked, Teilgenommen) und dazu den Schalter „Zugesagt". Der Schalter wirkt
 * in den Ansichten „Kommende" und „Wochenende" und bleibt beim Wechsel
 * zwischen diesen beiden an (Issue 417). Vorher war „Zugesagt" selbst eine
 * Ansicht und hat „Wochenende" ersetzt — beide zusammen gingen nicht.
 *
 * Die Regel steht hier und nicht in der Komponente, damit ein Test beide
 * Klickreihenfolgen prüfen kann: das Projekt hat keinen Aufbau für
 * Komponenten-Tests.
 *
 * Zeitfenster rechnet der BROWSER in seiner lokalen Zone (`Date`-Methoden ohne
 * UTC) und schickt sie als ISO-Zeitpunkte an die Liste.
 */

export const EVENT_LIST_VIEWS = ['upcoming', 'today', 'tomorrow', 'weekend', 'archive', 'liked', 'attended'] as const
export type EventListView = (typeof EVENT_LIST_VIEWS)[number]

/** Ansichten, die jeder sieht — auch Gäste. */
export const EVENT_TIME_VIEWS = ['upcoming', 'today', 'tomorrow', 'weekend', 'archive'] as const satisfies readonly EventListView[]
/** Ansichten nur mit Anmeldung („meine"). */
export const EVENT_MINE_VIEWS = ['liked', 'attended'] as const satisfies readonly EventListView[]

/** In diesen Ansichten lässt sich „Zugesagt" zuschalten. */
const GOING_VIEWS: readonly EventListView[] = ['upcoming', 'weekend']

export interface EventListFilterState {
  view: EventListView
  /** Schalter „Zugesagt" — nur in `GOING_VIEWS` an. */
  going: boolean
}

export const INITIAL_EVENT_LIST_FILTER: EventListFilterState = { view: 'upcoming', going: false }

export function supportsGoing(view: EventListView): boolean {
  return GOING_VIEWS.includes(view)
}

/** Ansicht wählen: „Zugesagt" bleibt nur zwischen „Kommende" und „Wochenende" an. */
export function selectEventListView(state: EventListFilterState, view: EventListView): EventListFilterState {
  return { view, going: state.going && supportsGoing(view) }
}

/**
 * „Zugesagt" umschalten. In einer Ansicht, die den Schalter nicht kennt
 * (Heute, Archiv, …), führt der Klick wie bisher zu „Kommende" mit Zusagen.
 */
export function toggleEventListGoing(state: EventListFilterState): EventListFilterState {
  if (!supportsGoing(state.view)) return { view: 'upcoming', going: true }
  return { view: state.view, going: !state.going }
}

export interface EventTimeRange { from: string, to: string }

/** lokaler Kalendertag (+offset) als [from, to)-Fenster */
export function dayRange(now: Date, offsetDays: number): EventTimeRange {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() + offsetDays)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { from: start.toISOString(), to: end.toISOString() }
}

/** kommendes Wochenende (Sa+So) — am Sonntag zählt nur noch dieser Sonntag */
export function weekendRange(now: Date): EventTimeRange {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const day = start.getDay()
  if (day === 0) {
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return { from: start.toISOString(), to: end.toISOString() }
  }
  start.setDate(start.getDate() + (6 - day))
  const end = new Date(start)
  end.setDate(end.getDate() + 2)
  return { from: start.toISOString(), to: end.toISOString() }
}

/** Die Abfrage an `GET /api/events` zu Filter und Suche. */
export function eventListQuery(state: EventListFilterState, search: string, now: Date): Record<string, string> {
  const query: Record<string, string> = search ? { q: search } : {}
  switch (state.view) {
    case 'archive': return { ...query, past: 'true' }
    case 'today': return { ...query, ...dayRange(now, 0) }
    case 'tomorrow': return { ...query, ...dayRange(now, 1) }
    case 'liked':
    case 'attended': return { ...query, mine: state.view }
    case 'weekend': return { ...query, ...weekendRange(now), ...(state.going ? { mine: 'going' } : {}) }
    default: return state.going ? { ...query, mine: 'going' } : query
  }
}
