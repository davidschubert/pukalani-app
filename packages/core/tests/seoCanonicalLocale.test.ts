import { describe, expect, it } from 'vitest'
import { DEFAULT_PRIMARY_LOCALE, parsePrimaryLocale, primaryLocalePath, resolvePrimaryLocale } from '../shared/primaryLocale'
import { collapseSeoToLocale, filterSeoAlternates } from '../shared/seoAlternates'

/**
 * EINE MASSGEBLICHE ADRESSE JE BEITRAG (Q10, SEO-004, Davids Entscheidung B1).
 *
 * Diese Tests halten, WAS Suchmaschinen als maßgeblich sehen — ein Fehler hier
 * zeigt keine Fehlermeldung, er verschiebt nur still, welche Adresse zählt.
 * Deshalb zu jedem Treffer die Gegenprobe.
 */

// Der Kopf, wie nuxt-i18n ihn für die ENGLISCHE Adresse einer Diskussion baut.
const LINKS_EN = [
  { rel: 'alternate', hreflang: 'x-default', href: 'https://c.example/discussions/a/1/t' },
  { rel: 'alternate', hreflang: 'de', href: 'https://c.example/de/discussions/a/1/t' },
  { rel: 'alternate', hreflang: 'de-DE', href: 'https://c.example/de/discussions/a/1/t' },
  { rel: 'alternate', hreflang: 'en', href: 'https://c.example/discussions/a/1/t' },
  { rel: 'alternate', hreflang: 'en-US', href: 'https://c.example/discussions/a/1/t' },
  { rel: 'canonical', href: 'https://c.example/discussions/a/1/t' },
]
const META_EN = [
  { property: 'og:url', content: 'https://c.example/discussions/a/1/t' },
  { property: 'og:locale', content: 'en_US' },
  { property: 'og:locale:alternate', content: 'de_DE' },
]

describe('collapseSeoToLocale', () => {
  it('englische Adresse, deutsche Hauptsprache: canonical und og:url zeigen auf /de', () => {
    const result = collapseSeoToLocale(LINKS_EN, META_EN, 'de')
    expect(result.links).toEqual([{ rel: 'canonical', href: 'https://c.example/de/discussions/a/1/t' }])
    expect(result.meta).toEqual([
      { property: 'og:url', content: 'https://c.example/de/discussions/a/1/t' },
      { property: 'og:locale', content: 'en_US' },
    ])
  })

  it('nennt KEINE Sprachfassung mehr — auch kein x-default auf die nicht maßgebliche Adresse', () => {
    const result = collapseSeoToLocale(LINKS_EN, META_EN, 'de')
    expect(result.links.some(link => 'hreflang' in link)).toBe(false)
    expect(result.meta.some(entry => entry.property === 'og:locale:alternate')).toBe(false)
  })

  it('genau EIN canonical, auch wenn die Adresse schon die maßgebliche ist', () => {
    const result = collapseSeoToLocale(LINKS_EN, META_EN, 'en')
    expect(result.links).toEqual([{ rel: 'canonical', href: 'https://c.example/discussions/a/1/t' }])
  })

  it('Gegenprobe: unbekannte Sprache ⇒ der Kopf bleibt, wie er war (fail-open)', () => {
    const result = collapseSeoToLocale(LINKS_EN, META_EN, 'fr')
    expect(result.links).toEqual(LINKS_EN)
    expect(result.meta).toEqual(META_EN)
  })

  it('Gegenprobe: leere Angabe ändert nichts', () => {
    expect(collapseSeoToLocale(LINKS_EN, META_EN, '').links).toEqual(LINKS_EN)
  })

  it('lässt fremde Einträge (Symbol, Schrift) stehen', () => {
    const icon = { rel: 'icon', href: '/favicon.svg' }
    const result = collapseSeoToLocale([icon, ...LINKS_EN], META_EN, 'de')
    expect(result.links).toContainEqual(icon)
  })

  it('Gegenprobe zum Nachbarn: filterSeoAlternates lässt canonical auf der eigenen Adresse', () => {
    const result = filterSeoAlternates(LINKS_EN, META_EN, ['en'])
    expect(result.links.find(link => link.rel === 'canonical')?.href).toBe('https://c.example/discussions/a/1/t')
  })
})

describe('Hauptsprache einer Community', () => {
  it('nimmt nur bekannte Codes als Wahl', () => {
    expect(parsePrimaryLocale('de')).toBe('de')
    expect(parsePrimaryLocale('en')).toBe('en')
    for (const raw of ['fr', '', 'DE', null, undefined, 1, {}]) expect(parsePrimaryLocale(raw)).toBeNull()
  })

  it('ohne Wahl gilt die Grundsprache der App — die Adresse ohne Vorsatz', () => {
    expect(DEFAULT_PRIMARY_LOCALE).toBe('en')
    expect(resolvePrimaryLocale(undefined)).toBe('en')
    expect(resolvePrimaryLocale('kaputt')).toBe('en')
    expect(resolvePrimaryLocale('de')).toBe('de')
  })

  it('baut den Pfad der Hauptsprache wie die Sprach-Strategie der App', () => {
    expect(primaryLocalePath('/events/x', 'de')).toBe('/de/events/x')
    expect(primaryLocalePath('/events/x', 'en')).toBe('/events/x')
    expect(primaryLocalePath('/', 'de')).toBe('/de')
  })
})
