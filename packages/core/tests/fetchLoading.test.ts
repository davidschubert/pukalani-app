import { describe, expect, it } from 'vitest'
import { isFetchLoading } from '../app/utils/fetchLoading'

/**
 * „Lädt" heißt: es gibt noch kein Ergebnis (FE-003, Q15). Der Punkt ist
 * `idle`: so steht ein Abruf mit `server: false` auf dem Server, während der
 * Browser beim Übernehmen schon `pending` sieht — beide müssen denselben
 * Zweig der Vorlage zeichnen.
 */
describe('isFetchLoading', () => {
  it('Server (`idle`) und Browser beim Übernehmen (`pending`) sagen dasselbe', () => {
    expect(isFetchLoading('idle')).toBe(true)
    expect(isFetchLoading('pending')).toBe(true)
  })

  it('mit Ergebnis oder Fehler lädt nichts mehr', () => {
    expect(isFetchLoading('success')).toBe(false)
    expect(isFetchLoading('error')).toBe(false)
  })
})
