import { describe, expect, it } from 'vitest'
import {
  AI_ENDPOINT_UNAVAILABLE_CODE,
  AI_TEXT_EU_ENDPOINTS,
  AI_TEXT_PROVIDER_ROUTING,
  aiEndpointNoticeApplies,
} from '../shared/aiProviderRouting'
import { isAiEndpointUnavailable } from '../app/utils/fetchError'

/**
 * „KEIN MODELL UNTER DER BINDUNG" ERREICHT DEN MENSCHEN (P17).
 *
 * Der Server antwortet 503 mit `reason: ai_endpoint_unavailable`; der EINE
 * Leser (`community-suspended-notice.client.ts`) zeigt dazu einen Hinweis, und
 * die lokalen „fehlgeschlagen"-Meldungen schweigen in genau diesem Fall —
 * sonst stünden zwei Meldungen übereinander.
 */
describe('die Konstanten der Bindung', () => {
  it('Text: kein Speichern, kein Sammeln, kein Ausweichen, zwei EU-Endpunkte', () => {
    expect(AI_TEXT_PROVIDER_ROUTING).toEqual({
      zdr: true,
      dataCollection: 'deny',
      allowFallbacks: false,
      only: ['amazon-bedrock/eu-west-1', 'google-vertex/europe'],
    })
    expect(AI_TEXT_PROVIDER_ROUTING.only).toBe(AI_TEXT_EU_ENDPOINTS)
    expect(AI_ENDPOINT_UNAVAILABLE_CODE).toBe('ai_endpoint_unavailable')
  })
})

describe('aiEndpointNoticeApplies', () => {
  it('503 mit dem Grund ⇒ Hinweis', () => {
    expect(aiEndpointNoticeApplies({ status: 503, reason: 'ai_endpoint_unavailable' })).toBe(true)
  })

  it('GEGENPROBE: anderer Grund oder anderer Status ⇒ kein Hinweis', () => {
    expect(aiEndpointNoticeApplies({ status: 503, reason: '' })).toBe(false)
    expect(aiEndpointNoticeApplies({ status: 502, reason: 'ai_truncated' })).toBe(false)
    expect(aiEndpointNoticeApplies({ status: 403, reason: 'ai_endpoint_unavailable' })).toBe(false)
  })
})

describe('isAiEndpointUnavailable (Client)', () => {
  it('liest `data.reason` aus dem Envelope', () => {
    expect(isAiEndpointUnavailable({ statusCode: 503, data: { reason: 'ai_endpoint_unavailable' } })).toBe(true)
  })

  it('GEGENPROBE', () => {
    expect(isAiEndpointUnavailable({ statusCode: 503, data: { reason: 'rate_limited' } })).toBe(false)
    expect(isAiEndpointUnavailable({ statusCode: 503 })).toBe(false)
    expect(isAiEndpointUnavailable(null)).toBe(false)
  })
})
