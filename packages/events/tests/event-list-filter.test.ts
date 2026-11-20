import { describe, expect, it } from 'vitest'
import {
  INITIAL_EVENT_LIST_FILTER,
  dayRange,
  eventListQuery,
  selectEventListView,
  toggleEventListGoing,
  weekendRange,
  type EventListFilterState,
} from '../shared/eventListFilter'

/**
 * DIE FILTER DER TERMINLISTE (Issue 417): „Wochenende" und „Zugesagt" zusammen.
 *
 * Das Projekt hat keinen Aufbau für Komponenten-Tests; die Klick-Regel der
 * Liste steht deshalb pur in `shared/eventListFilter.ts`, und die Komponente
 * ruft nur diese Funktionen. Ein Klick ist hier ein Funktionsaufruf.
 *
 * Alle Zeitpunkte sind LOKAL gebaut (`new Date(jahr, monat, tag, …)`): die
 * Regel rechnet in der Zone des Browsers, der Test läuft so in jeder Zone.
 */

const start = INITIAL_EVENT_LIST_FILTER
const clickWeekend = (s: EventListFilterState) => selectEventListView(s, 'weekend')
const clickUpcoming = (s: EventListFilterState) => selectEventListView(s, 'upcoming')
const clickGoing = toggleEventListGoing

/** Freitag, 20. November 2026, 10:00 lokal */
const FRIDAY = new Date(2026, 10, 20, 10, 0)
/** Sonntag, 22. November 2026, 15:00 lokal */
const SUNDAY = new Date(2026, 10, 22, 15, 0)

describe('Terminliste: Ansicht und Schalter „Zugesagt"', () => {
  it('beide Klickreihenfolgen führen zum selben Zustand und zur selben Abfrage', () => {
    const weekendFirst = clickGoing(clickWeekend(start))
    const goingFirst = clickWeekend(clickGoing(start))
    expect(weekendFirst).toEqual({ view: 'weekend', going: true })
    expect(goingFirst).toEqual(weekendFirst)
    expect(eventListQuery(goingFirst, '', FRIDAY)).toEqual(eventListQuery(weekendFirst, '', FRIDAY))
    expect(eventListQuery(weekendFirst, '', FRIDAY)).toEqual({ ...weekendRange(FRIDAY), mine: 'going' })
  })

  it('„Zugesagt" ausschalten: wieder das ganze Wochenende', () => {
    const off = clickGoing(clickGoing(clickWeekend(start)))
    expect(off).toEqual({ view: 'weekend', going: false })
    expect(eventListQuery(off, '', FRIDAY)).toEqual(weekendRange(FRIDAY))
  })

  it('„Zugesagt" bleibt beim Wechsel zwischen „Kommende" und „Wochenende" an', () => {
    const there = clickWeekend(clickGoing(start))
    const back = clickUpcoming(there)
    expect(back).toEqual({ view: 'upcoming', going: true })
    expect(eventListQuery(back, '', FRIDAY)).toEqual({ mine: 'going' })
    expect(clickWeekend(back)).toEqual({ view: 'weekend', going: true })
  })

  it('jede andere Ansicht schaltet „Zugesagt" aus — und es kommt nicht von selbst zurück', () => {
    for (const view of ['today', 'tomorrow', 'archive', 'liked', 'attended'] as const) {
      const state = selectEventListView(clickGoing(clickWeekend(start)), view)
      expect(state).toEqual({ view, going: false })
      expect(eventListQuery(state, '', FRIDAY)).not.toHaveProperty('mine', 'going')
      expect(clickWeekend(state)).toEqual({ view: 'weekend', going: false })
    }
  })

  it('„Zugesagt" aus einer Ansicht ohne Schalter: wie bisher „Kommende" mit Zusagen', () => {
    expect(clickGoing(selectEventListView(start, 'archive'))).toEqual({ view: 'upcoming', going: true })
    expect(clickGoing(selectEventListView(start, 'liked'))).toEqual({ view: 'upcoming', going: true })
  })

  it('die übrigen Abfragen sind unverändert', () => {
    expect(eventListQuery(start, '', FRIDAY)).toEqual({})
    expect(eventListQuery(selectEventListView(start, 'archive'), '', FRIDAY)).toEqual({ past: 'true' })
    expect(eventListQuery(selectEventListView(start, 'today'), '', FRIDAY)).toEqual(dayRange(FRIDAY, 0))
    expect(eventListQuery(selectEventListView(start, 'tomorrow'), '', FRIDAY)).toEqual(dayRange(FRIDAY, 1))
    expect(eventListQuery(selectEventListView(start, 'liked'), '', FRIDAY)).toEqual({ mine: 'liked' })
    expect(eventListQuery(selectEventListView(start, 'attended'), '', FRIDAY)).toEqual({ mine: 'attended' })
  })

  it('die Titelsuche reist mit beiden Filtern mit', () => {
    const query = eventListQuery(clickGoing(clickWeekend(start)), 'brunch', FRIDAY)
    expect(query).toEqual({ q: 'brunch', ...weekendRange(FRIDAY), mine: 'going' })
  })
})

describe('Wochenend-Fenster in der lokalen Zone', () => {
  it('unter der Woche: Samstag 00:00 bis Montag 00:00', () => {
    const { from, to } = weekendRange(FRIDAY)
    expect(new Date(from)).toEqual(new Date(2026, 10, 21, 0, 0))
    expect(new Date(to)).toEqual(new Date(2026, 10, 23, 0, 0))
  })

  it('am Samstag: derselbe Samstag zählt mit', () => {
    const { from, to } = weekendRange(new Date(2026, 10, 21, 18, 30))
    expect(new Date(from)).toEqual(new Date(2026, 10, 21, 0, 0))
    expect(new Date(to)).toEqual(new Date(2026, 10, 23, 0, 0))
  })

  it('am Sonntag: nur noch dieser Sonntag, nicht das nächste Wochenende', () => {
    const { from, to } = weekendRange(SUNDAY)
    expect(new Date(from)).toEqual(new Date(2026, 10, 22, 0, 0))
    expect(new Date(to)).toEqual(new Date(2026, 10, 23, 0, 0))
  })
})
