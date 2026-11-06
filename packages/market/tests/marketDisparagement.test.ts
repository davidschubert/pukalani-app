import { describe, expect, it } from 'vitest'
import {
  checkGuardedTexts,
  createDisparagementGuard,
  normalizeForFilter as coreNormalizeForFilter,
  NAME_TOKEN_MIN,
} from '../../core/shared/disparagementGuard'
import {
  MARKET_NAME_TOKEN_MIN,
  checkMarketTexts,
  createMarketDisparagementGuard,
  normalizeForFilter,
} from '../shared/marketDisparagement'

/**
 * DIE HÜLLE ÜBER DEM § 6 UWG-RIEGEL (BI1 I1a).
 *
 * Die REGEL selbst wird in `core/tests/disparagementGuard.test.ts` geprüft —
 * dort stehen alle Gegenproben, unverändert mitgezogen. Hier steht die andere
 * Frage: reicht `shared/marketDisparagement.ts` sie unter den MARKT-Namen
 * wirklich weiter? Ohne diesen Beweis wäre ein Tippfehler im Re-Export eine
 * Datei, die zwar baut, aber einen zweiten (leeren) Riegel anbietet.
 *
 * Geprüft wird deshalb die IDENTITÄT der Bindungen und dass der Riegel unter
 * den alten Namen beisst — mit Gegenprobe, sonst wäre auch ein Aus-Schalter
 * grün.
 */

const KANDIDATEN = [
  { name: 'Pacific Bean Supply', url: 'https://pacificbean.example/' },
  { name: 'Upcountry Roast Co.', url: 'https://www.upcountry-roast.example/' },
]

describe('marketDisparagement reicht den core-Riegel weiter', () => {
  it('exportiert DIESELBEN Bindungen, nicht Kopien', () => {
    expect(createMarketDisparagementGuard).toBe(createDisparagementGuard)
    expect(checkMarketTexts).toBe(checkGuardedTexts)
    expect(normalizeForFilter).toBe(coreNormalizeForFilter)
    expect(MARKET_NAME_TOKEN_MIN).toBe(NAME_TOKEN_MIN)
  })

  it('beisst unter den alten Namen — Name, Domain, Herabsetzung', () => {
    const guard = createMarketDisparagementGuard(KANDIDATEN)
    expect(guard.check('Anders als Pacific klingt eure Zeile konkreter.')).toBe('competitor_name')
    expect(guard.check('Siehe pacificbean.example für den Vergleich.')).toBe('competitor_domain')
    expect(guard.check('Die anderen wirken veraltet.')).toBe('disparagement')
  })

  it('GEGENPROBE: ein sauberer Befund bleibt stehen — beide Teile', () => {
    const guard = createMarketDisparagementGuard(KANDIDATEN)
    expect(checkMarketTexts(guard, [
      'Euer Satz klingt wie zwei andere im Feld.',
      'Schärft ihn mit dem Teil, den nur ihr macht.',
    ])).toBeNull()
  })

  it('die eigenen bestätigten Foundation-Texte entschärfen die Sperre (M4)', () => {
    // Der Layer entscheidet, WELCHE Felder das sind — das Fundament kennt nur
    // Zeichenketten. Dass die Ausnahme durch die Hülle reicht, gehört hierher.
    const ohne = createMarketDisparagementGuard([{ name: 'Bergwerk Studio' }])
    expect(ohne.check('Euer Bergwerk-Vergleich trägt nicht.')).toBe('competitor_name')
    const mit = createMarketDisparagementGuard([{ name: 'Bergwerk Studio' }], {
      ownTexts: ['Wir bauen Marken für das Bergwerk von morgen.'],
    })
    expect(mit.check('Euer Bergwerk-Vergleich trägt nicht.')).toBeNull()
  })
})
