import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * DIE KOPFZEILE LÄDT „NEUE MARKE" ERST BEI BEDARF (PERF-006, Bahn 5).
 *
 * `BwSiteNav` steht auf jeder Seite von branding.supply. Ein FESTER Import
 * des Fensters oder von `useBrandCreate()` zieht über `brandJourney` den
 * ganzen Fragen-Katalog des Wizards in jede Seite (2026-11-21 gemessen: 78 KB
 * gepackt, 20 % der Startseite). Die Gewichts-Grenze
 * (`scripts/lib/page-weight-budgets.mjs`) merkt es erst im Ausliefern; dieser
 * Wächter schon im Pull Request.
 */
const source = readFileSync(join(__dirname, '../app/components/BwSiteNav.vue'), 'utf8')

export function siteNavLoadsNewBrandEagerly(vue: string): boolean {
  return /<BwNewBrandModal\b/.test(vue) || /\buseBrandCreate\s*\(/.test(vue) || /<BwSiteNavNewBrand\b/.test(vue)
}

describe('BwSiteNav', () => {
  it('bindet „Neue Marke" nur nachgeladen ein', () => {
    expect(siteNavLoadsNewBrandEagerly(source)).toBe(false)
    expect(source).toMatch(/<LazyBwSiteNavNewBrand\b[^>]*v-if=/)
  })

  it('Gegenprobe: ein fester Einbau wird erkannt', () => {
    expect(siteNavLoadsNewBrandEagerly('<BwNewBrandModal v-model:open="x" />')).toBe(true)
    expect(siteNavLoadsNewBrandEagerly('const c = useBrandCreate()')).toBe(true)
    expect(siteNavLoadsNewBrandEagerly('<BwSiteNavNewBrand v-model:open="x" />')).toBe(true)
  })
})
