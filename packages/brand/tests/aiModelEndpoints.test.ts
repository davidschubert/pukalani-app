import { describe, expect, it } from 'vitest'
import {
  MODEL_FIELDS,
  MODEL_LIST_FIELDS,
  REQUIRED_ENDPOINT,
  isEuEndpoint,
  isLocationlessEndpoint,
} from '../../../scripts/ops/ai-model-endpoints.mjs'
import {
  BRAND_PROVIDER_ROUTING,
  BRAND_PROVIDER_ROUTING_VERTEX_EU,
  BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL,
} from '../server/utils/brandProviderRouting'

/**
 * DIE TABELLE DES KI-MODELL-WÄCHTERS IST AN DEN CODE GEBUNDEN (Finding
 * BE-004, 2026-11-13).
 *
 * `scripts/ops/verify-ai-models.mjs` prüft je Modell-Feld, ob das Modell den
 * Endpunkt hat, auf den der Code es festlegt. WELCHER das ist, stand bis
 * hierher in einer von Hand geführten Tabelle mit dem Satz „Das ist eine
 * Verabredung, kein Beweis". Die Verabredung riss: `imageModel` fehlte, die
 * Zeichen-Entwürfe pinnten über die Basis auf zwei Text-Endpunkte, jeder
 * Bild-Aufruf war ein 404, und der Wächter blieb grün. Dieser Test macht aus
 * der Verabredung eine Prüfung.
 */

const TEXT_FIELDS = ['model', 'reviewModel', 'extractModel', 'reportModel', 'outsideViewModels'] as const

describe('REQUIRED_ENDPOINT ⇔ brandProviderRouting.ts', () => {
  it('imageModel verlangt genau den Pin der Bild-Fassung', () => {
    expect(REQUIRED_ENDPOINT.imageModel).toEqual([...BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL.only])
  })

  it('visionModel und videoModel verlangen genau den EU-Pin der Gemini-Wege', () => {
    expect(REQUIRED_ENDPOINT.visionModel).toEqual([...BRAND_PROVIDER_ROUTING_VERTEX_EU.only])
    expect(REQUIRED_ENDPOINT.videoModel).toEqual([...BRAND_PROVIDER_ROUTING_VERTEX_EU.only])
  })

  it.each(TEXT_FIELDS)('Text-Feld %s verlangt genau die Allowlist der Basis', (field) => {
    expect(REQUIRED_ENDPOINT[field]).toEqual([...BRAND_PROVIDER_ROUTING.only])
  })

  it('kennt kein Feld, das weder Modell- noch Listen-Feld ist', () => {
    const known = new Set<string>([...MODEL_FIELDS, ...MODEL_LIST_FIELDS])
    for (const field of Object.keys(REQUIRED_ENDPOINT)) expect(known.has(field)).toBe(true)
  })

  it('deckt jedes gepinnte Modell-Feld ab (ausser der Ticket-Triage ohne Routing)', () => {
    // `ticketsAiModel` gibt bewusst kein `providerRouting` mit (Kopf des
    // Daten-Moduls) — jedes ANDERE Feld braucht einen Eintrag, sonst ist es
    // ungedeckt wie `imageModel` bis 2026-11-13.
    const pinned = [...MODEL_FIELDS, ...MODEL_LIST_FIELDS].filter(field => field !== 'ticketsAiModel')
    expect(Object.keys(REQUIRED_ENDPOINT).sort()).toEqual([...pinned].sort())
  })
})

describe('die Orts-Erkennung der Info-Zeile', () => {
  it('erkennt ortlose und EU-Endpunkte', () => {
    expect(isLocationlessEndpoint('google-vertex/global')).toBe(true)
    expect(isLocationlessEndpoint('google-vertex/eu')).toBe(false)
    expect(isEuEndpoint('google-vertex/eu')).toBe(true)
    expect(isEuEndpoint('google-vertex/europe')).toBe(true)
    expect(isEuEndpoint('amazon-bedrock/eu-west-1')).toBe(true)
  })

  it('GEGENPROBE: global und US zählen nicht als EU', () => {
    expect(isEuEndpoint('google-vertex/global')).toBe(false)
    expect(isEuEndpoint('google-vertex/us')).toBe(false)
    expect(isEuEndpoint('amazon-bedrock/us-east-1')).toBe(false)
    expect(isEuEndpoint('deepinfra/europe-ish')).toBe(false)
  })
})
