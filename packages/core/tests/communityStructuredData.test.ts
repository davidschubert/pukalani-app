import { describe, expect, it } from 'vitest'
import { communityStructuredDataAllowed, ldCompact, ldDate, ldPerson } from '../shared/communityStructuredData'

/**
 * Strukturierte Daten der Community-Seiten (SU1, SEO-003). Erwartungen stehen
 * AUSGESCHRIEBEN (Beweis-Regel 1); jede Seitenart hat ihre Gegenprobe.
 */
describe('Tor: wann dürfen Daten in den Kopf?', () => {
  it('öffentliche Community ohne noindex: ja', () => {
    expect(communityStructuredDataAllowed({ membersOnly: false, noindex: false })).toBe(true)
  })
  it('Gegenprobe: nur für Mitglieder oder noindex: nein', () => {
    expect(communityStructuredDataAllowed({ membersOnly: true, noindex: false })).toBe(false)
    expect(communityStructuredDataAllowed({ membersOnly: false, noindex: true })).toBe(false)
  })
})

describe('Hilfen', () => {
  it('Person nur mit Namen, leer ⇒ keine Angabe', () => {
    expect(ldPerson(' Mia ')).toEqual({ '@type': 'Person', name: 'Mia' })
    expect(ldPerson('  ')).toBeUndefined()
    expect(ldPerson(null)).toBeUndefined()
  })
  it('Datum als ISO, Unlesbares fällt weg', () => {
    expect(ldDate('2026-11-20T10:00:00.000+00:00')).toBe('2026-11-20T10:00:00.000Z')
    expect(ldDate('kaputt')).toBeUndefined()
  })
  it('leere Felder fallen weg', () => {
    expect(ldCompact({ a: 1, b: undefined, c: null, d: '' })).toEqual({ a: 1 })
  })
})
