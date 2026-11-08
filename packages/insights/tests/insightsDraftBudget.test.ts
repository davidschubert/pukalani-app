import { describe, expect, it } from 'vitest'
import {
  INSIGHTS_DRAFT_TOKENS_PER_WORD,
  INSIGHTS_DRAFT_TOKEN_HEADROOM,
  insightsDraftMaxTokens,
} from '../shared/insightsDraftBudget'
import {
  INSIGHTS_DRAFT_WORDS_DEFAULT,
  INSIGHTS_DRAFT_WORDS_MAX,
  INSIGHTS_DRAFT_WORDS_MIN,
} from '../shared/insightsPrompts'

/**
 * DIE GEMESSENEN WERTE VOM 2026-11-08 (BI4, 52 echte Läufe gegen
 * `anthropic/claude-haiku-4.5`) — die Regel wird GEGEN sie geprüft, nicht
 * gegen sich selbst.
 *
 * `maxCompletionTokens` ist der HÖCHSTE beobachtete Wert je bestelltem
 * Umfang. Die Decke muss darüber liegen, und zwar deutlich: jedes Reissen
 * kostet einen bezahlten Lauf.
 */
const MEASURED = [
  { targetWords: 200, maxCompletionTokens: 510 },
  { targetWords: 700, maxCompletionTokens: 1469 },
  { targetWords: 2000, maxCompletionTokens: 3621 },
] as const

describe('insightsDraftMaxTokens — gegen die Messung', () => {
  for (const { targetWords, maxCompletionTokens } of MEASURED) {
    it(`trägt den höchsten gemessenen Lauf bei ${targetWords} Wörtern mit Abstand`, () => {
      const cap = insightsDraftMaxTokens(targetWords)
      expect(cap).toBeGreaterThan(maxCompletionTokens * 2)
    })
  }

  it('trägt auch eine LIEFERUNG in voller bestellter Länge', () => {
    // Die Modelle liefern gemessen nur 50–80 % des Bestellten. Liefert eines
    // einmal wirklich 2.000 Wörter, kostet das rund 2.000 × 2,5 Tokens — und
    // genau dafür war bei der alten festen Decke von 8.000 kaum Luft.
    const fullDelivery = INSIGHTS_DRAFT_WORDS_MAX * INSIGHTS_DRAFT_TOKENS_PER_WORD
    expect(insightsDraftMaxTokens(INSIGHTS_DRAFT_WORDS_MAX)).toBeGreaterThan(fullDelivery * 2)
  })

  it('liegt am oberen Rand ÜBER der alten festen Decke von 8.000', () => {
    // Die Gegenprobe zur verworfenen Option „den Bereich senken": der obere
    // Rand bleibt bestellbar und bekommt MEHR Luft, nicht weniger.
    expect(insightsDraftMaxTokens(INSIGHTS_DRAFT_WORDS_MAX)).toBeGreaterThan(8000)
  })
})

describe('insightsDraftMaxTokens — die Form der Regel', () => {
  it('wächst streng monoton mit dem bestellten Umfang', () => {
    for (let words = INSIGHTS_DRAFT_WORDS_MIN; words < INSIGHTS_DRAFT_WORDS_MAX; words += 50) {
      expect(insightsDraftMaxTokens(words + 50)).toBeGreaterThan(insightsDraftMaxTokens(words))
    }
  })

  it('deckelt ein durchgegangenes Modell am unteren Rand', () => {
    // Bei 200 Wörtern stand die alte Decke bei 8.000 Tokens — das Vierzigfache
    // des Bestellten. Die Notbremse greift jetzt viel früher, aber immer noch
    // erst beim Dreifachen des Nötigen.
    const cap = insightsDraftMaxTokens(INSIGHTS_DRAFT_WORDS_MIN)
    expect(cap).toBeLessThan(8000)
    expect(cap).toBeGreaterThan(INSIGHTS_DRAFT_WORDS_MIN * INSIGHTS_DRAFT_TOKENS_PER_WORD * 2)
  })

  it('klemmt Werte ausserhalb des erlaubten Bereichs statt Unsinn zu rechnen', () => {
    expect(insightsDraftMaxTokens(0)).toBe(insightsDraftMaxTokens(INSIGHTS_DRAFT_WORDS_MIN))
    expect(insightsDraftMaxTokens(-5)).toBe(insightsDraftMaxTokens(INSIGHTS_DRAFT_WORDS_MIN))
    expect(insightsDraftMaxTokens(1_000_000)).toBe(insightsDraftMaxTokens(INSIGHTS_DRAFT_WORDS_MAX))
    expect(insightsDraftMaxTokens(Number.NaN)).toBe(insightsDraftMaxTokens(INSIGHTS_DRAFT_WORDS_MIN))
  })

  it('gibt immer eine ganze Zahl', () => {
    for (const words of [INSIGHTS_DRAFT_WORDS_MIN, 333, INSIGHTS_DRAFT_WORDS_DEFAULT, 1111, INSIGHTS_DRAFT_WORDS_MAX]) {
      expect(Number.isInteger(insightsDraftMaxTokens(words))).toBe(true)
    }
  })

  it('hält den Aufschlag, der die Begründung trägt', () => {
    // Ändert jemand die Konstanten, soll dieser Test ihn an die Messung im
    // Kopf der Datei erinnern — der dreifache Abstand ist eine Entscheidung,
    // kein Zufallswert.
    expect(INSIGHTS_DRAFT_TOKEN_HEADROOM).toBeGreaterThanOrEqual(3)
    expect(INSIGHTS_DRAFT_TOKENS_PER_WORD).toBeGreaterThanOrEqual(2.5)
  })
})
