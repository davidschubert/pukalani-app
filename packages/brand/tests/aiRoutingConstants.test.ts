import { describe, expect, it } from 'vitest'
import { ROUTING_CONSTANTS } from '../../../scripts/check-ai-routing.mjs'
import {
  BRAND_PROVIDER_ROUTING,
  BRAND_PROVIDER_ROUTING_VERTEX_EU,
  BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL,
} from '../server/utils/brandProviderRouting'

/**
 * DER WÄCHTER `check:ai-routing` FÜHRT DIE KONSTANTEN WÖRTLICH (nacktes
 * `node`, kein Import aus TypeScript) — dieser Test hält die drei brand-
 * Einträge an die echten Konstanten.
 */
describe('ROUTING_CONSTANTS (check:ai-routing) ⇔ brandProviderRouting.ts', () => {
  it('die drei brand-Einträge nennen genau die Orte der Konstanten', () => {
    expect(ROUTING_CONSTANTS.BRAND_PROVIDER_ROUTING.only).toEqual([...BRAND_PROVIDER_ROUTING.only])
    expect(ROUTING_CONSTANTS.BRAND_PROVIDER_ROUTING_VERTEX_EU.only).toEqual([...BRAND_PROVIDER_ROUTING_VERTEX_EU.only])
    expect(ROUTING_CONSTANTS.BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL.only).toEqual([...BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL.only])
  })

  it('nur die Bild-Fassung trägt eine Ausnahme vom Ort', () => {
    expect(ROUTING_CONSTANTS.BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL.exception?.decided).toBe('2026-11-13, David')
    expect(ROUTING_CONSTANTS.BRAND_PROVIDER_ROUTING.exception).toBeUndefined()
    expect(ROUTING_CONSTANTS.BRAND_PROVIDER_ROUTING_VERTEX_EU.exception).toBeUndefined()
  })
})
