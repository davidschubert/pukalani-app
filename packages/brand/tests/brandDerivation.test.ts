import { describe, expect, it } from 'vitest'
import {
  BRAND_DERIVATION_VIAS,
  normalizeBrandDerivationVia,
  resolveDerivationAccess,
} from '../shared/brandDerivation'

/**
 * DIE FREISCHALTUNG DER ABLEITUNG — die pure Regel mit ihren Gegenproben
 * (Konzept docs/plans/BRAND-BOOK-KIT.md §2.8, Paket K1).
 *
 * JEDE Zusage hat hier ihre Kehrseite: „frei" ist ohne ein bewiesenes
 * „gesperrt" keine Aussage — eine Regel, die IMMER Ja sagt, bestünde jeden
 * einseitigen Test (Beweis-Regel aus CLAUDE.md).
 */
describe('resolveDerivationAccess', () => {
  it('ohne Beta und ohne Feld: gesperrt', () => {
    expect(resolveDerivationAccess({ betaAccount: false })).toEqual({ unlocked: false, grant: 'none' })
  })

  it('GEGENPROBE zur Zeile darüber: ein Beta-Konto ist frei, ganz ohne Feld', () => {
    expect(resolveDerivationAccess({ betaAccount: true })).toEqual({ unlocked: true, grant: 'beta' })
  })

  it('das Feld allein reicht — auch ohne Beta-Konto (der Weg ab Z1)', () => {
    expect(resolveDerivationAccess({
      betaAccount: false,
      unlockedAt: '2026-09-09T10:00:00.000Z',
      via: 'purchase',
    })).toEqual({ unlocked: true, grant: 'purchase' })
  })

  it('Betreiber-Freischaltung nennt sich `operator`', () => {
    expect(resolveDerivationAccess({
      betaAccount: false,
      unlockedAt: '2026-09-09T10:00:00.000Z',
      via: 'operator',
    }).grant).toBe('operator')
  })

  /**
   * Die Reihenfolge aus dem Kopf der Regel: das Feld ist die spezifischere
   * Auskunft, sonst verschwände „purchase" hinter jedem Beta-Konto.
   */
  it('Feld UND Beta: `unlocked` bleibt wahr, die Herkunft nennt das Feld', () => {
    expect(resolveDerivationAccess({
      betaAccount: true,
      unlockedAt: '2026-09-09T10:00:00.000Z',
      via: 'purchase',
    })).toEqual({ unlocked: true, grant: 'purchase' })
  })

  it('`null`, `undefined` und Leerraum im Feld sind dasselbe wie „gar nicht gesetzt"', () => {
    for (const unlockedAt of [null, undefined, '', '   ']) {
      expect(resolveDerivationAccess({ betaAccount: false, unlockedAt }).unlocked).toBe(false)
    }
  })

  it('eine unbekannte Herkunft macht aus dem Datum keine Zahlung', () => {
    expect(resolveDerivationAccess({
      betaAccount: false,
      unlockedAt: '2026-09-09T10:00:00.000Z',
      via: 'geschenkt',
    }).grant).toBe('operator')
  })
})

describe('normalizeBrandDerivationVia', () => {
  it('kennt genau die zwei Spaltenwerte', () => {
    expect([...BRAND_DERIVATION_VIAS]).toEqual(['operator', 'purchase'])
  })

  it('fällt auf die zurückhaltende Auskunft zurück', () => {
    expect(normalizeBrandDerivationVia('purchase')).toBe('purchase')
    expect(normalizeBrandDerivationVia('operator')).toBe('operator')
    for (const value of [null, undefined, '', 'beta', 42, {}]) {
      expect(normalizeBrandDerivationVia(value)).toBe('operator')
    }
  })
})
