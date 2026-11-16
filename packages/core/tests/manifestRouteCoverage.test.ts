import { describe, expect, it } from 'vitest'
import { routeCoverageProblems, routePathOf } from '../../../scripts/lib/manifest-routes.mjs'

/**
 * BE-005 (GA1 P20): jede Route eines abschaltbaren Layers liegt unter einem
 * `apiPrefixes`-Eintrag seines Manifests — sonst erreicht der Not-Aus des
 * Produkts sie nicht.
 *
 * Der Lauf über das echte Repo steckt in `pnpm check:manifests` (Prüfung 7).
 * Hier stehen die GEGENPROBEN: der Wächter muss die Lücke finden, die es am
 * 2026-11-16 wirklich gab, und er darf dort schweigen, wo nichts fehlt.
 */
const route = (layer: string, file: string) => ({
  file: `packages/${layer}/server/api/${file}`,
  route: routePathOf(file),
})

const brand = (apiPrefixes: string[]) => ({
  key: 'brand',
  tier: 'optional' as const,
  apiPrefixes,
  api: [
    route('brand', 'brand/profiles/index.get.ts'),
    route('brand', 'discover/index.get.ts'),
    route('brand', 'discover/[slug].get.ts'),
    route('brand', 'discover/[slug]/report.post.ts'),
  ],
  other: [],
})

describe('routePathOf', () => {
  it.each([
    ['discover/index.get.ts', '/api/discover'],
    ['discover/[slug].get.ts', '/api/discover/[slug]'],
    ['discover/[slug]/report.post.ts', '/api/discover/[slug]/report'],
    ['health.ts', '/api/health'],
    ['stats-script.js.get.ts', '/api/stats-script.js'],
  ])('%s ⇒ %s', (file, expected) => {
    expect(routePathOf(file)).toBe(expected)
  })
})

describe('jede Route eines abschaltbaren Layers liegt unter seinem Not-Aus', () => {
  it('die Lücke von BE-005: die Galerie neben dem Präfix wird gemeldet, mit dem Eintrag, der fehlt', () => {
    const problems = routeCoverageProblems([brand(['/api/brand'])], [])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('packages/brand/product.manifest.ts')
    expect(problems[0]).toContain('\'/api/discover\' in apiPrefixes aufnehmen')
    expect(problems[0]).toContain('packages/brand/server/api/discover/[slug]/report.post.ts')
  })

  it('mit dem Präfix ist nichts zu melden', () => {
    expect(routeCoverageProblems([brand(['/api/brand', '/api/discover'])], [])).toEqual([])
  })

  it('ein Präfix gilt an der Segmentgrenze: /api/brand deckt /api/branding nicht', () => {
    const layer = { key: 'brand', tier: 'optional' as const, apiPrefixes: ['/api/brand'], api: [route('brand', 'brand/index.get.ts'), route('brand', 'branding/index.get.ts')], other: [] }
    const problems = routeCoverageProblems([layer], [])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('/api/branding')
  })

  it('Stufe foundation ist nicht abschaltbar und deshalb ausgenommen', () => {
    const billing = { key: 'billing', tier: 'foundation' as const, api: [route('billing', 'stripe/webhook.post.ts')], other: [] }
    expect(routeCoverageProblems([billing], [])).toEqual([])
  })

  it('ein Präfix, das Routen eines ANDEREN Layers deckt, wird gemeldet', () => {
    const control = { key: 'control', tier: 'optional' as const, apiPrefixes: ['/api/control', '/api/platform/entitlements'], api: [route('control', 'control/sites.get.ts'), route('control', 'platform/entitlements/[projectId].get.ts')], other: [] }
    const core = { key: 'core', tier: 'foundation' as const, api: [route('core', 'platform/entitlements/refresh.post.ts')], other: [] }
    const problems = routeCoverageProblems([control, core], [])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('deckt auch packages/core/server/api/platform/entitlements/refresh.post.ts')
  })

  it('ein Präfix ohne eine einzige Route wird gemeldet', () => {
    const problems = routeCoverageProblems([brand(['/api/brand', '/api/discover', '/api/galerie'])], [])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('/api/galerie deckt keine einzige Route')
  })

  it('eine Route unter server/routes/ eines abschaltbaren Layers wird gemeldet', () => {
    const layer = { ...brand(['/api/brand', '/api/discover']), other: ['packages/brand/server/routes/feed.xml.get.ts'] }
    const problems = routeCoverageProblems([layer], [])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('außerhalb von server/api/')
  })

  describe('Ausnahmen', () => {
    const reason = 'Öffentlicher Abruf, den andere Sites brauchen — bleibt auch bei abgeschaltetem Produkt erreichbar.'

    it('eine begründete Ausnahme nimmt die Route aus', () => {
      expect(routeCoverageProblems([brand(['/api/brand'])], [{ layer: 'brand', path: '/api/discover', reason }])).toEqual([])
    })

    it('eine Ausnahme ohne Grund ist rot', () => {
      const problems = routeCoverageProblems([brand(['/api/brand'])], [{ layer: 'brand', path: '/api/discover', reason: 'so halt' }])
      expect(problems).toHaveLength(1)
      expect(problems[0]).toContain('ohne tragfähigen Grund')
    })

    it('eine tote Ausnahme ist rot: die Route liegt inzwischen unter einem Präfix', () => {
      const problems = routeCoverageProblems([brand(['/api/brand', '/api/discover'])], [{ layer: 'brand', path: '/api/discover', reason }])
      expect(problems).toHaveLength(1)
      expect(problems[0]).toContain('nimmt keine Route mehr aus')
    })

    it('eine Ausnahme gilt nur für ihren Layer', () => {
      const problems = routeCoverageProblems([brand(['/api/brand'])], [{ layer: 'market', path: '/api/discover', reason }])
      expect(problems).toHaveLength(2)
    })
  })
})
