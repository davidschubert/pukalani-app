import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BRAND_ARCHETYPES } from '../shared/brandChoiceOptions'
import { BRAND_DISCOVER_PATH_KINDS, BRAND_DISCOVER_SORTS } from '../shared/brandDiscover'
import { BRAND_INDUSTRY_VALUES } from '../shared/brandIndustries'
import { BRAND_PALETTES } from '../shared/brandPalette'

/**
 * DISCOVER RENDERT REINEN KATALOG-TEXT (docs/plans/DISCOVER-BRANDS.md §4.1/
 * §4.2, Paket D2) — und die Galerie ist eine INDEXIERBARE Seite.
 *
 * vue-i18n gibt bei einem fehlenden Schlüssel den SCHLÜSSEL zurück, ohne
 * Fehler und ohne roten Build. Hier hiesse das `brand.discover.sort.maturity`
 * als Eintrag im Sortier-Feld — wörtlich, für Google. Genau das fängt diese
 * Datei, an den Stellen, an denen ein Schlüssel aus einer LISTE gebaut wird
 * (Weiche, Sortierung, Zahl-Arten, Ähnlichkeits-Gründe) und für die feste
 * Beschriftung beider Seiten.
 *
 * ── ZWEI KATALOGE SIND HIER BEWUSST NICHT DABEI ──────────────────────────
 * Die ARCHETYPEN kommen über `brandChoiceDisplayLabel` aus dem Katalog
 * (`display.de`/`display.en`) und die FARBWELTEN aus `BRAND_PALETTES.name` —
 * beide sind Eigennamen und stehen absichtlich NICHT in den Locale-Dateien
 * (Kopf von `shared/brandPalette.ts`). Geprüft wird deshalb, dass sie dort
 * vollständig sind, nicht dass es Schlüssel gäbe.
 *
 * `i18nCatalog.test.ts` prüft daneben schon, dass de und en denselben
 * Schlüsselvorrat haben und dass keine Nachricht spitze Klammern oder ein
 * rohes At-Zeichen trägt.
 */

const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'i18n', 'locales')
const LOCALES = ['de', 'en'] as const

function flatten(node: unknown, prefix: string, into: Set<string>): Set<string> {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return into
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, into)
    else into.add(path)
  }
  return into
}

const catalogs = Object.fromEntries(
  LOCALES.map(locale => [
    locale,
    flatten(JSON.parse(readFileSync(join(localesDir, `${locale}.json`), 'utf8')), '', new Set<string>()),
  ]),
) as Record<(typeof LOCALES)[number], Set<string>>

function missingIn(key: string): string[] {
  return LOCALES.filter(locale => !catalogs[locale].has(key))
}

function gapsFor(keys: readonly string[]): string[] {
  return keys
    .map(key => ({ key, missing: missingIn(key) }))
    .filter(entry => entry.missing.length)
    .map(entry => `${entry.key} fehlt in ${entry.missing.join(', ')}`)
}

describe('Discover: i18n-Katalog der Listen', () => {
  it('beschriftet jede Weiche und jede Sortierung', () => {
    expect(gapsFor(BRAND_DISCOVER_PATH_KINDS.map(id => `brand.discover.path.${id}`))).toEqual([])
    expect(gapsFor(BRAND_DISCOVER_SORTS.map(id => `brand.discover.sort.${id}`))).toEqual([])
  })

  it('beschriftet BEIDE Zahl-Arten — eine unbenannte Zahl behauptet zu viel', () => {
    expect(gapsFor(['website', 'document'].map(id => `brand.discover.score.${id}`))).toEqual([])
  })

  it('beschriftet beide Ähnlichkeits-Gründe (feste Regel-Beschriftung, Entsch. 8)', () => {
    expect(gapsFor([
      'brand.discover.entry.similar.archetype',
      'brand.discover.entry.similar.palette',
    ])).toEqual([])
  })

  it('kennt jede Branchen-Id des Facetten-Katalogs', () => {
    expect(gapsFor(BRAND_INDUSTRY_VALUES.map(id => `brand.industry.${id}`))).toEqual([])
  })

  it('GEGENPROBE: eine erfundene Sortierung hat kein Wort', () => {
    expect(missingIn('brand.discover.sort.trending').length).toBeGreaterThan(0)
  })
})

describe('Discover: die feste Beschriftung beider Seiten', () => {
  it('trägt die Galerie vollständig', () => {
    expect(gapsFor([
      'brand.discover.seoTitle',
      'brand.discover.seoDescription',
      'brand.discover.eyebrow',
      'brand.discover.title',
      'brand.discover.lead',
      'brand.discover.featured.label',
      'brand.discover.featured.cta',
      'brand.discover.featured.prev',
      'brand.discover.featured.next',
      'brand.discover.filter.path',
      'brand.discover.filter.allPaths',
      'brand.discover.filter.archetype',
      'brand.discover.filter.palette',
      'brand.discover.filter.industry',
      'brand.discover.filter.allIndustries',
      'brand.discover.filter.sort',
      'brand.discover.filter.reset',
      'brand.discover.score.secondary',
      'brand.discover.badge.example',
      'brand.discover.badge.relaunch',
      'brand.discover.total',
      'brand.discover.emptyTitle',
      'brand.discover.emptyCta',
      'brand.discover.note',
    ])).toEqual([])
  })

  it('trägt die Anatomie vollständig', () => {
    expect(gapsFor([
      'brand.discover.entry.seoTitle',
      'brand.discover.entry.seoDescription',
      'brand.discover.entry.eyebrow',
      'brand.discover.entry.back',
      'brand.discover.entry.profile',
      'brand.discover.entry.field.industry',
      'brand.discover.entry.field.path',
      'brand.discover.entry.field.archetype',
      'brand.discover.entry.field.voice',
      'brand.discover.entry.field.language',
      'brand.discover.entry.field.published',
      'brand.discover.entry.archetypePair',
      'brand.discover.entry.language.de',
      'brand.discover.entry.language.en',
      'brand.discover.entry.fingerprint.title',
      'brand.discover.entry.fingerprint.lead',
      'brand.discover.entry.fingerprint.link',
      'brand.discover.entry.similar.title',
      'brand.discover.entry.similar.all',
      'brand.discover.entry.cta.body',
      'brand.discover.entry.cta.button',
      'brand.discover.entry.share',
      'brand.discover.entry.copy',
      'brand.discover.entry.copied',
      'brand.discover.entry.notFoundTitle',
      'brand.discover.entry.notFoundBody',
      'brand.discover.entry.notFoundCta',
    ])).toEqual([])
  })

  it('trägt den Teaser der Startseite und den Nav-Punkt', () => {
    expect(gapsFor([
      'brand.discover.teaser.eyebrow',
      'brand.discover.teaser.title',
      'brand.discover.teaser.body',
      'brand.discover.teaser.cta',
      // Der Nav-Punkt gab es schon vor D2 — er ist seit dem 404-Audit wieder
      // verlinkt und darf deshalb nicht still verschwinden.
      'brand.nav.discover',
    ])).toEqual([])
  })
})

describe('Discover: Eigennamen stehen im KATALOG, nicht in den Locale-Dateien', () => {
  it('jeder Archetyp hat beide Anzeigenamen', () => {
    for (const option of BRAND_ARCHETYPES) {
      expect(option.display.de.trim(), option.id).not.toBe('')
      expect(option.display.en.trim(), option.id).not.toBe('')
    }
    expect(BRAND_ARCHETYPES).toHaveLength(12)
  })

  it('jede Farbwelt hat beide Namen und einen Dreiklang', () => {
    for (const palette of BRAND_PALETTES) {
      expect(palette.name.de.trim(), palette.id).not.toBe('')
      expect(palette.name.en.trim(), palette.id).not.toBe('')
      expect(palette.gradient, palette.id).toHaveLength(3)
    }
    expect(BRAND_PALETTES).toHaveLength(12)
  })
})
