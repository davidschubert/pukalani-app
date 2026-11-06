import { describe, expect, it } from 'vitest'
import { MARKET_PII_PLACEHOLDER, filterMarketPii } from '../shared/marketPii'

/**
 * DER PII-FILTER (Plan §1.7 Nr. 3, §2.9 Nr. 3) — mit GEGENPROBE.
 *
 * Die Gegenprobe ist bei diesem Filter die schwierigere Hälfte: er darf keine
 * Personendaten durchlassen UND nicht den halben Markentext verschlucken. Ein
 * Filter, der alles Grossgeschriebene ersetzt, bestünde jede Zeile, die nur
 * nach dem ersten Fehler sucht.
 */

describe('filterMarketPii — E-Mail', () => {
  it('entfernt gewöhnliche und verschleierte Adressen', () => {
    const result = filterMarketPii('Schreiben Sie an anna.keanu@roesterei.example oder an hallo (at) roesterei (dot) example.')
    expect(result.text).not.toContain('@roesterei.example')
    expect(result.text).not.toContain('(at)')
    expect(result.removed).toBe(2)
  })
})

describe('filterMarketPii — Telefon', () => {
  it('entfernt internationale und beschriftete Nummern', () => {
    const result = filterMarketPii('Tel: 0808 123 4567 · +49 30 1234567 · Fax 030/9876543')
    expect(result.text).not.toContain('1234567')
    expect(result.text).not.toContain('4567')
    expect(result.removed).toBeGreaterThanOrEqual(3)
  })

  it('GEGENPROBE: Jahreszahlen, Preise und Mengen bleiben stehen', () => {
    const text = 'Gegründet 1998. Ab 24,90 Euro das Kilo. 100 Prozent Arabica, 6 Farmen.'
    expect(filterMarketPii(text).text).toBe(text)
  })
})

describe('filterMarketPii — Namen neben einem Amt', () => {
  it('entfernt den Namen und behält das Amt', () => {
    const result = filterMarketPii('Geschäftsführerin Anna Keanu führt die Rösterei seit 2015.')
    expect(result.text).toContain('Geschäftsführerin')
    expect(result.text).toContain(MARKET_PII_PLACEHOLDER)
    expect(result.text).not.toContain('Anna Keanu')
  })

  it('erkennt den Namen auch VOR dem Amt und mit Bindeglied', () => {
    expect(filterMarketPii('Lea van Dorn, Founder').text).not.toContain('Lea van Dorn')
    expect(filterMarketPii('Our CEO, Marcus Ashford Reeve, says:').text).not.toContain('Marcus Ashford')
  })

  it('lässt eine FIRMA neben dem Amt stehen — sie ist keine Person', () => {
    const result = filterMarketPii('Geschäftsführer der Upcountry Roast GmbH ist im Haus.')
    expect(result.text).toContain('Upcountry Roast GmbH')
  })

  it('GEGENPROBE: derselbe Name OHNE Amt in der Nähe bleibt stehen', () => {
    // Der Filter arbeitet mit einem engen Fenster (±60 Zeichen). Ein
    // Markenname im Fliesstext ist genau das, was er NICHT anfassen darf —
    // sonst verlöre das Marktprofil seine Belege.
    const text = 'Kona Trading beliefert seit 1998 Cafés auf allen Inseln. Maui Coffee Works ist Partner.'
    expect(filterMarketPii(text).text).toBe(text)
  })

  it('GEGENPROBE: ein weit entferntes Amt zieht keinen Namen mit', () => {
    const far = `Anna Keanu hat den Text geschrieben. ${'x'.repeat(200)} Unser Geschäftsführer ist selten im Haus.`
    expect(filterMarketPii(far).text).toContain('Anna Keanu')
  })
})
