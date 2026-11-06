import { beforeAll, describe, expect, it } from 'vitest'
import {
  BRAND_COMPLETION_CTA_FALLBACK,
  resolveBrandCompletionCta,
} from '../shared/brandCompletionCta'
import { resolveBrandLegalLinks } from '../shared/brandLegalLinks'

/**
 * DER LAYER-DEFAULT WIRD AUS DER ECHTEN DATEI GELESEN, nicht abgeschrieben —
 * sonst prüfte der Test seine eigene Kopie. `defineAppConfig` ist ein
 * Auto-Import von Nuxt und existiert hier nicht; der Stub gibt die Config
 * unverändert zurück, was genau ihre Laufzeit-Bedeutung ist.
 */
let layerBrandConfig: Record<string, unknown> = {}

beforeAll(async () => {
  ;(globalThis as Record<string, unknown>).defineAppConfig = (config: unknown) => config
  const mod = await import('../app/app.config') as {
    default: { pukalani: { brand: Record<string, unknown> } }
  }
  layerBrandConfig = mod.default.pukalani.brand
})

/**
 * BS1 R0 — die zwei Regeln, die auf branding.supply zwei 404 abgestellt haben.
 *
 * Jede Regel mit GEGENPROBE: ein Test, der nur den guten Fall kennt, ist bei
 * einer aufgeweichten Regel weiterhin grün.
 */
describe('resolveBrandCompletionCta', () => {
  it('nimmt eine Route als Route — und meldet sie als NICHT extern', () => {
    const cta = resolveBrandCompletionCta({ type: 'route', to: '/erstgespraech', labelKey: 'brand.cta.book' })
    expect(cta).toEqual({ to: '/erstgespraech', external: false, labelKey: 'brand.cta.book' })
  })

  it('nimmt eine absolute Adresse als extern — samt Query', () => {
    const cta = resolveBrandCompletionCta({
      type: 'url',
      href: 'https://pukalani.studio/erstgespraech?source=branding-supply',
      labelKey: 'brand.cta.book',
    })
    expect(cta.external).toBe(true)
    expect(cta.to).toBe('https://pukalani.studio/erstgespraech?source=branding-supply')
    // Ohne `target` bleibt es derselbe Tab — und dann gibt es auch kein `rel`.
    expect(cta.target).toBeUndefined()
    expect(cta.rel).toBeUndefined()
  })

  it('legt `noopener noreferrer` bei `_blank` selbst nach', () => {
    const cta = resolveBrandCompletionCta({
      type: 'url', href: 'https://pukalani.studio/erstgespraech', labelKey: 'x', target: '_blank',
    })
    expect(cta.rel).toBe('noopener noreferrer')
  })

  it('lässt ein ausdrücklich gesetztes `rel` stehen', () => {
    const cta = resolveBrandCompletionCta({
      type: 'url', href: 'https://pukalani.studio/x', labelKey: 'x', target: '_blank', rel: 'noopener',
    })
    expect(cta.rel).toBe('noopener')
  })

  // ── Gegenproben: alles Halbe fällt auf den Default, nie auf ein leeres Ziel
  it.each([
    ['fehlende Config', undefined],
    ['leere Config', {}],
    ['url ohne href', { type: 'url', labelKey: 'brand.cta.book' }],
    ['url mit relativem href', { type: 'url', href: '/erstgespraech', labelKey: 'brand.cta.book' }],
    ['url mit fremdem Schema', { type: 'url', href: 'javascript:alert(1)', labelKey: 'brand.cta.book' }],
    ['route ohne führenden Schrägstrich', { type: 'route', to: 'erstgespraech', labelKey: 'brand.cta.book' }],
    ['route mit leerem to', { type: 'route', to: '   ', labelKey: 'brand.cta.book' }],
  ])('fällt bei %s auf die Default-Route zurück', (_name, raw) => {
    expect(resolveBrandCompletionCta(raw)).toEqual(BRAND_COMPLETION_CTA_FALLBACK)
  })

  it('behält den konfigurierten Text auch im Rückfall', () => {
    const cta = resolveBrandCompletionCta({ type: 'url', href: '', labelKey: 'brand.cta.other' })
    expect(cta.to).toBe(BRAND_COMPLETION_CTA_FALLBACK.to)
    expect(cta.labelKey).toBe('brand.cta.other')
  })

  it('der Layer-Default ist die Route — die Site überschreibt sie', () => {
    const cta = resolveBrandCompletionCta(layerBrandConfig.completionCta)
    expect(cta).toEqual(BRAND_COMPLETION_CTA_FALLBACK)
  })
})

describe('resolveBrandLegalLinks', () => {
  it('macht aus gesetzten Pfaden Links — in fester Reihenfolge', () => {
    expect(resolveBrandLegalLinks({ terms: '/terms', imprint: '/imprint', privacy: '/privacy' })).toEqual([
      { id: 'imprint', to: '/imprint', labelKey: 'brand.legal.imprint' },
      { id: 'privacy', to: '/privacy', labelKey: 'brand.legal.privacy' },
      { id: 'terms', to: '/terms', labelKey: 'brand.legal.terms' },
    ])
  })

  it('lässt einzelne fehlende Einträge weg statt sie zu erfinden', () => {
    expect(resolveBrandLegalLinks({ imprint: '/imprint', privacy: '', terms: undefined })).toEqual([
      { id: 'imprint', to: '/imprint', labelKey: 'brand.legal.imprint' },
    ])
  })

  // ── Gegenproben
  it.each([
    ['fehlende Config', undefined],
    ['leere Config', {}],
    ['nur leere Zeichenketten', { imprint: '', privacy: '  ', terms: '' }],
    ['absolute Adressen', { imprint: 'https://example.test/imprint' }],
    ['relative Pfade ohne Schrägstrich', { imprint: 'imprint' }],
    ['falsche Typen', { imprint: 42 }],
  ])('gibt bei %s NICHTS zurück — die Zeile fällt weg', (_name, raw) => {
    expect(resolveBrandLegalLinks(raw)).toEqual([])
  })

  it('der Layer-Default ist leer — kein Wort ohne Ziel', () => {
    expect(resolveBrandLegalLinks(layerBrandConfig.legalLinks)).toEqual([])
  })
})
