import { describe, expect, it } from 'vitest'
import { filterSeoAlternates } from '../shared/seoAlternates'

/**
 * hreflang NUR AUF VORHANDENE FASSUNGEN (BI1 I3, Plan BRAND-INSIGHTS §9.5).
 *
 * Die Gegenprobe ist hier wichtiger als der Treffer: ein Filter, der ALLES
 * wegnimmt, macht jede Seite „richtig" und jede Sprachverknüpfung kaputt.
 */

const LINKS = [
  { rel: 'canonical', href: 'https://branding.supply/insights/x' },
  { rel: 'alternate', hreflang: 'en', href: 'https://branding.supply/insights/x' },
  { rel: 'alternate', hreflang: 'de-DE', href: 'https://branding.supply/de/insights/x' },
  { rel: 'alternate', hreflang: 'x-default', href: 'https://branding.supply/insights/x' },
]

const META = [
  { property: 'og:url', content: 'https://branding.supply/insights/x' },
  { property: 'og:locale', content: 'en_US' },
  { property: 'og:locale:alternate', content: 'de_DE' },
]

describe('filterSeoAlternates', () => {
  it('nimmt die versteckte Sprache aus links UND meta', () => {
    const result = filterSeoAlternates(LINKS, META, ['de'])
    expect(result.links.map(link => link.hreflang ?? link.rel)).toEqual(['canonical', 'en', 'x-default'])
    expect(result.meta.map(entry => entry.property)).toEqual(['og:url', 'og:locale'])
  })

  it('trifft auch die Regionsform (de-DE) — verglichen wird der Sprachcode', () => {
    const result = filterSeoAlternates(
      [{ rel: 'alternate', hreflang: 'de-AT', href: '/de' }],
      [],
      ['de-DE'],
    )
    expect(result.links).toEqual([])
  })

  it('lässt x-default immer stehen — es ist keine Sprachfassung', () => {
    const result = filterSeoAlternates(LINKS, META, ['en', 'de'])
    expect(result.links.map(link => link.hreflang ?? link.rel)).toEqual(['canonical', 'x-default'])
  })

  it('GEGENPROBE: ohne versteckte Sprache bleibt alles, wie es war', () => {
    const result = filterSeoAlternates(LINKS, META, [])
    expect(result.links).toEqual(LINKS)
    expect(result.meta).toEqual(META)
  })

  it('GEGENPROBE: eine andere Sprache nimmt die deutsche nicht mit', () => {
    const result = filterSeoAlternates(LINKS, META, ['fr'])
    expect(result.links).toHaveLength(LINKS.length)
    expect(result.meta).toHaveLength(META.length)
  })

  it('lässt fremde meta-Einträge unberührt, auch wenn ihr Inhalt passt', () => {
    const result = filterSeoAlternates([], [{ property: 'og:locale', content: 'de_DE' }], ['de'])
    expect(result.meta).toHaveLength(1)
  })
})
