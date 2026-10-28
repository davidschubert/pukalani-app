import { describe, expect, it } from 'vitest'
import { BRAND_PROVIDER_ROUTING, BRAND_PROVIDER_ROUTING_EU } from '../server/utils/brandProviderRouting'

/**
 * DIE ZWEI FASSUNGEN DER DATENSCHUTZ-BEDINGUNGEN — und der Unterschied, der
 * zwischen ihnen liegen DARF.
 *
 * Warum das geprüft wird, obwohl es zwei Objektliterale sind: die EU-Fassung
 * entstand am 2026-10-27 aus einer Messung (`zdr: true` sagt NICHTS über den
 * Ort — ohne `only` bediente Amazon Bedrock unseren Lauf). Sie ist per Spread
 * von der Grundfassung abgeleitet, und genau diese Ableitung ist die Zusage:
 * wer der Grundfassung ein Feld hinzufügt, bekommt es hier mit, und wer die
 * EU-Fassung versehentlich lockert (`zdr: false`, `allowFallbacks: true`),
 * fällt auf. Ein `allowFallbacks: true` NEBEN einem `only` wäre der stille
 * Totalverlust: OpenRouter dürfte dann wieder ausweichen, und der Pin wäre
 * nur noch ein Wunsch.
 */
describe('BRAND_PROVIDER_ROUTING', () => {
  it('klemmt jeden Lauf auf ZDR, Nicht-Sammeln und kein Ausweichen', () => {
    expect(BRAND_PROVIDER_ROUTING).toEqual({
      zdr: true,
      dataCollection: 'deny',
      allowFallbacks: false,
    })
  })

  it('nennt in der Grundfassung bewusst KEINEN Ort', () => {
    expect('only' in BRAND_PROVIDER_ROUTING).toBe(false)
  })
})

describe('BRAND_PROVIDER_ROUTING_EU', () => {
  it('erbt die drei Bedingungen unverändert und ergänzt nur den Ort', () => {
    const { only, ...rest } = BRAND_PROVIDER_ROUTING_EU
    expect(rest).toEqual(BRAND_PROVIDER_ROUTING)
    expect(only).toEqual(['google-vertex/eu'])
  })

  it('bleibt ohne Ausweichweg — sonst wäre der Pin nur ein Wunsch', () => {
    expect(BRAND_PROVIDER_ROUTING_EU.allowFallbacks).toBe(false)
    expect(BRAND_PROVIDER_ROUTING_EU.zdr).toBe(true)
  })
})
