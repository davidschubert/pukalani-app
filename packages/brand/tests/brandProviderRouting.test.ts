import { describe, expect, it } from 'vitest'
import {
  BRAND_PROVIDER_ROUTING,
  BRAND_PROVIDER_ROUTING_VERTEX_EU,
  BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL,
} from '../server/utils/brandProviderRouting'
import { BRAND_MARK_DRAFTS_ENDPOINT } from '../shared/brandMarkDrafts'

/**
 * DIE ZWEI FASSUNGEN DER DATENSCHUTZ-BEDINGUNGEN — und der Unterschied, der
 * zwischen ihnen liegen DARF.
 *
 * Warum das geprüft wird, obwohl es zwei Objektliterale sind: beide entstanden
 * aus Messungen, nicht aus Annahmen (`zdr: true` sagt NICHTS über den Ort —
 * ohne `only` bediente Amazon Bedrock unseren Lauf). Die Vertex-Fassung ist
 * per Spread von der Grundfassung abgeleitet, und genau diese Ableitung ist
 * die Zusage: wer der Grundfassung ein Feld hinzufügt, bekommt es hier mit,
 * und wer eine Fassung versehentlich lockert (`zdr: false`,
 * `allowFallbacks: true`), fällt auf. Ein `allowFallbacks: true` NEBEN einem
 * `only` wäre der stille Totalverlust: OpenRouter dürfte dann wieder
 * ausweichen, und der Pin wäre nur noch ein Wunsch.
 *
 * SEIT AI1 (2026-11-09) NENNEN BEIDE EINEN ORT. Die Prüfung „die Grundfassung
 * nennt bewusst KEINEN Ort" ist deshalb ersetzt — nicht gelöscht: an ihrer
 * Stelle steht jetzt, WELCHE zwei Endpunkte der Textweg erlaubt. Das ist die
 * Zeile, die rot wird, wenn jemand die Allowlist später wieder öffnet.
 */
describe('BRAND_PROVIDER_ROUTING', () => {
  it('klemmt jeden Lauf auf ZDR, Nicht-Sammeln und kein Ausweichen', () => {
    expect(BRAND_PROVIDER_ROUTING.zdr).toBe(true)
    expect(BRAND_PROVIDER_ROUTING.dataCollection).toBe('deny')
    expect(BRAND_PROVIDER_ROUTING.allowFallbacks).toBe(false)
  })

  it('nennt für den Textweg GENAU die zwei gemessenen EU-Endpunkte', () => {
    expect(BRAND_PROVIDER_ROUTING.only).toEqual([
      'amazon-bedrock/eu-west-1',
      'google-vertex/europe',
    ])
  })

  it('erlaubt keinen Endpunkt ohne Ortsangabe — kein `*/global`, kein `/us`', () => {
    for (const tag of BRAND_PROVIDER_ROUTING.only) {
      expect(tag).not.toMatch(/\/(global|us|us-[a-z0-9-]+)$/)
    }
  })
})

describe('BRAND_PROVIDER_ROUTING_VERTEX_EU', () => {
  it('erbt die drei Bedingungen unverändert und ERSETZT nur den Ort', () => {
    const { only, ...rest } = BRAND_PROVIDER_ROUTING_VERTEX_EU
    const { only: baseOnly, ...baseRest } = BRAND_PROVIDER_ROUTING
    expect(rest).toEqual(baseRest)
    expect(only).toEqual(['google-vertex/eu'])
    // Der Ort ist der EINZIGE Unterschied, und er ist wirklich anders:
    // ohne diese Zeile wäre ein versehentlich gleichgezogenes `only`
    // (und damit ein toter Gemini-Weg) nicht zu sehen.
    expect(only).not.toEqual(baseOnly)
  })

  it('bleibt ohne Ausweichweg — sonst wäre der Pin nur ein Wunsch', () => {
    expect(BRAND_PROVIDER_ROUTING_VERTEX_EU.allowFallbacks).toBe(false)
    expect(BRAND_PROVIDER_ROUTING_VERTEX_EU.zdr).toBe(true)
  })
})

/**
 * DIE BILD-FASSUNG (Finding BE-004, Davids Entscheidung 2026-11-13).
 *
 * Bis zum 2026-11-13 gaben die Zeichen-Entwürfe die BASIS mit — und die nennt
 * seit AI1 zwei Endpunkte, die das Bildmodell nicht hat. Jeder Aufruf war ein
 * 404. Die Fassung hier erbt den Schutz und ersetzt NUR den Ort durch den
 * einen Endpunkt des Bildmodells.
 */
describe('BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL', () => {
  it('erbt ZDR, `deny` und kein Ausweichen und ERSETZT nur den Ort', () => {
    const { only, ...rest } = BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL
    const { only: baseOnly, ...baseRest } = BRAND_PROVIDER_ROUTING
    expect(rest).toEqual(baseRest)
    expect(rest).toEqual({ zdr: true, dataCollection: 'deny', allowFallbacks: false })
    expect(only).toEqual(['google-vertex/global'])
    expect(only).not.toEqual(baseOnly)
    expect(only).not.toEqual(BRAND_PROVIDER_ROUTING_VERTEX_EU.only)
  })

  it('nimmt den Endpunkt aus der EINEN Quelle in shared/', () => {
    expect(BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL.only).toEqual([BRAND_MARK_DRAFTS_ENDPOINT])
  })

  it('der Text-Weg bleibt dabei unverändert (die Basis ist nicht angefasst)', () => {
    expect(BRAND_PROVIDER_ROUTING.only).toEqual(['amazon-bedrock/eu-west-1', 'google-vertex/europe'])
    expect(BRAND_PROVIDER_ROUTING_VERTEX_EU.only).toEqual(['google-vertex/eu'])
  })
})
