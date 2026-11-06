import { describe, expect, it } from 'vitest'
import {
  MARKET_AI_VIEW_FIELDS,
  consensusStatements,
  countEvidenceFrequency,
  evidenceCore,
  evidenceIsGrounded,
  normalizeEvidence,
  statementsAgree,
} from '../shared/marketExtractRules'
import type { MarketAiAnswer } from '../shared/marketExtractRules'
import {
  EVIDENCE_QUOTE_MAX,
  evidenceIsGrounded as coreEvidenceIsGrounded,
  normalizeEvidenceText,
} from '../../core/shared/evidenceGrounding'
import { MARKET_EVIDENCE_MAX } from '../shared/marketProfile'

/**
 * BELEG-RIEGEL, HÄUFIGKEIT UND KONSENS (Plan §2.2, §7.4, §7.5 b) — die drei
 * Regeln, die über eine Modell-Ausgabe entscheiden, je mit GEGENPROBE.
 */

describe('der Beleg-Riegel kommt aus core — die Hülle reicht ihn weiter', () => {
  /**
   * Die REGEL und alle ihre Gegenproben stehen seit BI1 I1a in
   * `core/tests/evidenceGrounding.test.ts` (unverändert mitgezogen). Hier
   * bleibt die andere Frage: gibt `shared/marketExtractRules.ts` sie unter den
   * MARKT-Namen wirklich weiter? Ein Tippfehler im Re-Export baut sonst
   * anstandslos und liefert einen zweiten, leeren Riegel.
   */
  it('exportiert DIESELBEN Bindungen, nicht Kopien', () => {
    expect(evidenceIsGrounded).toBe(coreEvidenceIsGrounded)
    expect(normalizeEvidence).toBe(normalizeEvidenceText)
  })

  it('beisst unter dem alten Namen — mit GEGENPROBE', () => {
    const page = 'Wir  rösten in kleinen\nMengen, direkt von der Farm.'
    expect(evidenceIsGrounded({ quote: 'Wir rösten in kleinen Mengen', pageText: page })).toBe(true)
    expect(evidenceIsGrounded({ quote: 'Wir rösten ausschliesslich biologisch', pageText: page })).toBe(false)
  })

  it('die Zitatschranke des Vertrags IST die des Fundaments', () => {
    // Zwei verschiedene Zahlen für dieselbe Rechtsfrage wären eine Einladung,
    // die kleinere zu vergessen (§ 51 UrhG, §1.7 Nr. 4).
    expect(MARKET_EVIDENCE_MAX).toBe(EVIDENCE_QUOTE_MAX)
  })
})

describe('countEvidenceFrequency — die Häufigkeit', () => {
  const pages = new Map([
    ['https://a.example/', 'Wir rösten in kleinen Mengen, direkt von der Farm.'],
    ['https://a.example/about', 'Seit 2011. Wir rösten in kleinen Mengen, nie in Chargen.'],
    ['https://a.example/faq', 'Versand am selben Tag, ohne Aufpreis und ohne Mindestbestellwert.'],
  ])

  it('zählt über die Seiten, nicht über die Treffer im Text', () => {
    expect(countEvidenceFrequency('Wir rösten in kleinen Mengen, direkt von der Farm.', pages))
      .toEqual({ pages: 2, of: 3 })
  })

  it('GEGENPROBE: eine Aussage, die nur einmal vorkommt, ist Rand', () => {
    expect(countEvidenceFrequency('Versand am selben Tag, ohne Aufpreis und ohne Mindestbestellwert.', pages))
      .toEqual({ pages: 1, of: 3 })
  })

  it('ein zu kurzer Kern wird nicht gezählt, sondern als „einmal" ausgewiesen', () => {
    expect(evidenceCore('Frisch.').length).toBeLessThan(25)
    expect(countEvidenceFrequency('Frisch.', pages)).toEqual({ pages: 1, of: 3 })
  })
})

describe('consensusStatements — der Konsens-Filter der KI-Aussensicht', () => {
  const answer = (model: string, fieldId: string, value: string): MarketAiAnswer =>
    ({ model, fieldId: fieldId as MarketAiAnswer['fieldId'], value })

  it('übernimmt, was zwei VERSCHIEDENE Modelle übereinstimmend sagen', () => {
    const statements = consensusStatements([
      answer('a', 'pitch', 'Sie rösten Kaffee in kleinen Mengen auf Maui.'),
      answer('b', 'pitch', 'Kaffee in kleinen Mengen, geröstet auf Maui.'),
    ], 2)
    expect(statements).toHaveLength(1)
    expect(statements[0]?.agree).toBe(2)
    expect(statements[0]?.asked).toBe(2)
  })

  it('GEGENPROBE: EIN Modell allein ergibt nichts', () => {
    expect(consensusStatements([answer('a', 'pitch', 'Sie rösten Kaffee.')], 2)).toHaveLength(0)
  })

  it('GEGENPROBE: dasselbe Modell zweimal ist kein Konsens', () => {
    expect(consensusStatements([
      answer('a', 'pitch', 'Sie rösten Kaffee in kleinen Mengen.'),
      answer('a', 'pitch', 'Sie rösten Kaffee in kleinen Mengen.'),
    ], 2)).toHaveLength(0)
  })

  it('GEGENPROBE: zwei Modelle, die etwas ANDERES sagen, ergeben nichts', () => {
    expect(consensusStatements([
      answer('a', 'pitch', 'Sie rösten Kaffee in kleinen Mengen auf Maui.'),
      answer('b', 'pitch', 'Eine Steuerkanzlei für mittelständische Betriebe.'),
    ], 2)).toHaveLength(0)
  })

  it('kurze, identische Werte gelten auch ohne Wort-Überschneidung als Konsens', () => {
    expect(statementsAgree('Kaffeerösterei', 'kaffeerösterei.')).toBe(true)
    // GEGENPROBE: zwei verschiedene Kurzwerte nicht.
    expect(statementsAgree('Kaffeerösterei', 'Steuerkanzlei')).toBe(false)
  })

  it('nimmt nur die fünf Aussensicht-Felder an', () => {
    const statements = consensusStatements([
      answer('a', 'tagline', 'Coffee with a story.'),
      answer('b', 'tagline', 'Coffee with a story.'),
    ], 2)
    expect(statements).toHaveLength(0)
    expect(MARKET_AI_VIEW_FIELDS).not.toContain('tagline')
  })

  it('`asked` bleibt die Zahl der BEFRAGTEN Modelle, auch wenn eines ausfiel', () => {
    const statements = consensusStatements([
      answer('a', 'audience', 'Cafés und Restaurants auf der Insel.'),
      answer('b', 'audience', 'Restaurants und Cafés auf der Insel.'),
    ], 3)
    expect(statements[0]).toMatchObject({ agree: 2, asked: 3 })
  })
})
