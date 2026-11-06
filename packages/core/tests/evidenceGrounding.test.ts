import { describe, expect, it } from 'vitest'
import {
  EVIDENCE_QUOTE_MAX,
  evidenceIsGrounded,
  normalizeEvidenceText,
} from '../shared/evidenceGrounding'

/**
 * DER BELEG-RIEGEL — mit GEGENPROBE an jeder Stelle.
 *
 * Die Prüfungen sind aus `market/tests/marketExtractRules.test.ts` MITGEZOGEN
 * (BI1 I1a) und nicht neu geschrieben: ein Umzug, dessen Tests neu formuliert
 * werden, beweist nur die neue Formulierung. Ein Riegel, der nur zeigt, dass
 * er etwas durchlässt, sagt nichts — er könnte ALLES durchlassen. Jede Prüfung
 * hat deshalb ein Paar.
 */

describe('evidenceIsGrounded — der Beleg-Riegel', () => {
  const page = 'Wir  rösten in kleinen\nMengen, direkt von der Farm. Jede Woche frisch.'

  it('findet ein wörtliches Zitat trotz anderem Weissraum', () => {
    expect(evidenceIsGrounded({ quote: 'Wir rösten in kleinen Mengen', pageText: page })).toBe(true)
  })

  it('verzeiht typografische Anführungszeichen und Gedankenstriche', () => {
    const typographic = 'Sie sagt „frisch“ – jede Woche.'
    expect(evidenceIsGrounded({ quote: 'Sie sagt "frisch" - jede Woche.', pageText: typographic })).toBe(true)
  })

  it('GEGENPROBE: ein erfundenes Zitat fällt durch', () => {
    expect(evidenceIsGrounded({ quote: 'Wir rösten ausschliesslich biologisch', pageText: page })).toBe(false)
  })

  it('GEGENPROBE: eine andere SCHREIBWEISE ist kein Zitat', () => {
    // Gross-/Kleinschreibung wird bewusst NICHT normalisiert (s. Kopf der
    // Regel) — sonst wäre die Zitatschranke eine Erzählung.
    expect(evidenceIsGrounded({ quote: 'wir rösten in kleinen mengen', pageText: page })).toBe(false)
  })

  it('GEGENPROBE: ein leeres oder zu langes Zitat fällt durch', () => {
    expect(evidenceIsGrounded({ quote: '   ', pageText: page })).toBe(false)
    const tooLong = 'x'.repeat(EVIDENCE_QUOTE_MAX + 1)
    expect(evidenceIsGrounded({ quote: tooLong, pageText: `x${'x'.repeat(400)}` })).toBe(false)
  })

  it('die Zitatschranke ist EINE Zahl — 200 (§ 51 UrhG)', () => {
    // `MARKET_EVIDENCE_MAX` und `INSIGHTS_QUOTE_MAX` leiten sich daraus ab.
    // Zwei verschiedene Zahlen für dieselbe Rechtsfrage wären eine Einladung,
    // die kleinere zu vergessen.
    expect(EVIDENCE_QUOTE_MAX).toBe(200)
    expect(evidenceIsGrounded({
      quote: 'y'.repeat(EVIDENCE_QUOTE_MAX),
      pageText: 'y'.repeat(EVIDENCE_QUOTE_MAX),
    })).toBe(true)
  })

  it('normalizeEvidenceText zieht Weissraum zusammen, ohne die Schreibweise zu ändern', () => {
    expect(normalizeEvidenceText('  Frisch\n  geröstet  ')).toBe('Frisch geröstet')
  })
})
