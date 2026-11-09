import { describe, expect, it } from 'vitest'
import { AI_JSON_QUOTE_RULE, AI_JSON_QUOTE_RULE_EN, parseModelJson } from '../shared/aiJson'

/**
 * DIE REGEL, DIE IN JEDEN JSON-PROMPT GEHÖRT (AI2, 2026-11-09).
 *
 * Geprüft wird hier nur eines, und es ist genau das, was am 2026-11-08
 * schiefging: die Regel darf den Fehler NICHT VORMACHEN, den sie verbietet.
 * Ihre erste Fassung schrieb ihre eigenen Beispiele mit einem geraden `"` —
 * ein Modell lernt die Form seiner Antwort aus den Beispielen im Auftrag,
 * nicht aus dem Verbot daneben.
 *
 * Den Rest des Monorepos hält `scripts/check-prompt-quotes.mjs` offen; dieser
 * Test hält die Quelle selbst.
 */

/** Deutsches Anführungszeichen auf, GERADES zu — der Fehler in einem Muster. */
const DEMONSTRATES_THE_BUG = /\u201e[^\u201c"\n]{0,120}"/

describe('AI_JSON_QUOTE_RULE', () => {
  it('nennt das gerade Zeichen NUR in der Verbots-Zeile', () => {
    const [examples, ban] = AI_JSON_QUOTE_RULE.split('\n')
    expect(examples).not.toContain('"')
    // Das Verbot MUSS sein Zeichen nennen — sonst ist es keines.
    expect(ban).toContain('"')
  })

  it('macht den Fehler nicht vor', () => {
    expect(AI_JSON_QUOTE_RULE).not.toMatch(DEMONSTRATES_THE_BUG)
  })

  it('zeigt beide Schreibweisen mit den richtigen Zeichen', () => {
    expect(AI_JSON_QUOTE_RULE).toContain('\u201e\u2026\u201c')
    expect(AI_JSON_QUOTE_RULE).toContain('\u201c\u2026\u201d')
  })
})

describe('AI_JSON_QUOTE_RULE_EN', () => {
  it('nennt das gerade Zeichen NUR in der Verbots-Zeile', () => {
    const [examples, ban] = AI_JSON_QUOTE_RULE_EN.split('\n')
    expect(examples).not.toContain('"')
    expect(ban).toContain('"')
  })

  it('macht den Fehler nicht vor', () => {
    expect(AI_JSON_QUOTE_RULE_EN).not.toMatch(DEMONSTRATES_THE_BUG)
  })

  it('ist englisch — eine deutsche Zeile wäre in einem englischen Auftrag Material', () => {
    expect(AI_JSON_QUOTE_RULE_EN).toContain('QUOTATION MARKS IN TEXT')
    expect(AI_JSON_QUOTE_RULE_EN).not.toContain('ANF\u00dcHRUNGSZEICHEN IM TEXT')
  })
})

describe('die Regel und die Reparatur sind zwei Hälften', () => {
  it('die Bitte verhindert den Fall nicht — die Reparatur holt ihn zurück', () => {
    // Eine Antwort, die trotz der Bitte ein gerades `"` setzt: genau der
    // gemessene Fall. Die Regel allein hätte ihn nicht gerettet.
    const broken = '{"body": "die Wortmarke \u201eAdidas" steht im Abspann"}'
    expect(() => JSON.parse(broken)).toThrow()
    const parsed = parseModelJson<{ body: string }>(broken)
    expect(parsed?.repaired).toBe(true)
    expect(parsed?.value.body).toContain('\u201eAdidas"')
  })
})
