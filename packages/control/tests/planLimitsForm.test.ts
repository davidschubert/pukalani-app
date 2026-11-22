import { describe, expect, it } from 'vitest'
import { planLimitKinds, planLimitsEditFrom, planLimitsPatch } from '../app/utils/planLimitsForm'

/**
 * Kasten „Pläne & Limits" (KK1 c): je Art Katalog oder Vorgabe, gespeichert
 * werden nur Änderungen. Der wichtigste Fall ist der alte Fehler: eine Art
 * ohne Katalog-Zahl zeigte 0, und Speichern schrieb 0 = UNBEGRENZT.
 */
describe('planLimitsForm', () => {
  const stored = { comments: { perDay: 200, total: 5_000 } }

  it('zeigt die vier festen Arten und jede weitere aus dem Katalog', () => {
    expect(planLimitKinds(stored)).toEqual(['comments', 'pages', 'events', 'media'])
    expect(planLimitKinds({ ...stored, posts: { perDay: 1 } })).toEqual(['comments', 'pages', 'events', 'media', 'posts'])
  })

  it('eine Art ohne Katalog-Zahl ist „Vorgabe" (null), nicht 0', () => {
    expect(planLimitsEditFrom(stored)).toEqual({ comments: { perDay: 200, total: 5_000 }, pages: null, events: null, media: null })
  })

  it('unverändert ⇒ leerer Körper (Gegenprobe zum alten 0-Fehler)', () => {
    expect(planLimitsPatch(stored, planLimitsEditFrom(stored))).toEqual({})
  })

  it('schickt nur die geänderte Art', () => {
    const edit = planLimitsEditFrom(stored)
    edit.pages = { perDay: 10, total: 20 }
    expect(planLimitsPatch(stored, edit)).toEqual({ pages: { perDay: 10, total: 20 } })
  })

  it('„auf Vorgabe zurück" schickt null — aber nur für eine Art, die im Katalog steht', () => {
    const edit = planLimitsEditFrom(stored)
    edit.comments = null
    expect(planLimitsPatch(stored, edit)).toEqual({ comments: null })
    expect(planLimitsPatch({}, { pages: null })).toEqual({})
  })

  it('leere oder kaputte Felder werden zu ganzen Zahlen ab 0', () => {
    expect(planLimitsPatch({}, { pages: { perDay: Number.NaN, total: -3.7 } })).toEqual({ pages: { perDay: 0, total: 0 } })
  })
})
