import { describe, expect, it } from 'vitest'
import { routeRobots, ROBOTS_NOINDEX_FOLLOW, stripLocalePrefix } from '../shared/seoRobots'

/**
 * SEITEN, DIE NICHT IN EINE SUCHE GEHÖREN (Q10, SEO-007). Die Gegenproben sind
 * der Kern: eine Regel, die ALLES auf `noindex` stellt, bestünde jeden Treffer
 * und nähme jede Community aus der Suche.
 */
const open = { controlHost: false, path: '/' }

describe('routeRobots', () => {
  it('Konto-Seiten (Layout auth) tragen noindex, follow', () => {
    expect(routeRobots({ ...open, layout: 'auth', path: '/login' })).toBe(ROBOTS_NOINDEX_FOLLOW)
  })

  it('eine Seite kann es ausdrücklich sagen (seoNoindex)', () => {
    expect(routeRobots({ ...open, seoNoindex: true, path: '/verify' })).toBe(ROBOTS_NOINDEX_FOLLOW)
    expect(routeRobots({ ...open, seoNoindex: 'true', path: '/verify' })).toBeNull()
  })

  it('auf einem Kontroll-Host trägt es JEDE Seite', () => {
    expect(routeRobots({ controlHost: true, path: '/' })).toBe(ROBOTS_NOINDEX_FOLLOW)
    expect(routeRobots({ controlHost: true, path: '/start' })).toBe(ROBOTS_NOINDEX_FOLLOW)
  })

  it('Gegenprobe: eine gewöhnliche Seite einer Community bekommt NICHTS gestempelt', () => {
    expect(routeRobots({ ...open, layout: 'default', path: '/discussions' })).toBeNull()
    expect(routeRobots({ ...open, path: '/' })).toBeNull()
    expect(routeRobots({ ...open, path: '/', indexOnly: [] })).toBeNull()
    expect(routeRobots({ ...open, path: '/', indexOnly: null })).toBeNull()
  })

  it('indexOnly: nur die genannten Pfade dürfen in die Suche', () => {
    const only = { controlHost: false, indexOnly: ['/changelog'] }
    expect(routeRobots({ ...only, path: '/changelog' })).toBeNull()
    expect(routeRobots({ ...only, path: '/changelog/' })).toBeNull()
    expect(routeRobots({ ...only, path: '/changelog/2026' })).toBeNull()
    expect(routeRobots({ ...only, path: '/' })).toBe(ROBOTS_NOINDEX_FOLLOW)
    expect(routeRobots({ ...only, path: '/changelogs' })).toBe(ROBOTS_NOINDEX_FOLLOW)
    expect(routeRobots({ ...only, path: '/docs/x' })).toBe(ROBOTS_NOINDEX_FOLLOW)
  })

  it('eine kaputte Liste schränkt nichts ein (kein Eintrag mit Schrägstrich)', () => {
    expect(routeRobots({ controlHost: false, path: '/', indexOnly: ['changelog', ''] })).toBeNull()
  })
})

describe('stripLocalePrefix', () => {
  it('nimmt den Sprach-Vorsatz, und nur ihn', () => {
    expect(stripLocalePrefix('/de/changelog', ['en', 'de'])).toBe('/changelog')
    expect(stripLocalePrefix('/de', ['en', 'de'])).toBe('/')
    expect(stripLocalePrefix('/changelog', ['en', 'de'])).toBe('/changelog')
    expect(stripLocalePrefix('/demo/x', ['en', 'de'])).toBe('/demo/x')
  })
})
