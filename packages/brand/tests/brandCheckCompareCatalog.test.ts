import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BRAND_CHECK_CATEGORIES } from '../shared/brandCheck'

/**
 * DIE VERGLEICHS-SEITE UND DER MARKENABDRUCK RENDERN REINEN KATALOG-TEXT
 * (docs/archiv/BRAND-CHECK-SEITE.md §4 und §10, Paket P4).
 *
 * Muster und Begründung wie `brandCheckRankingCatalog.test.ts`: vue-i18n gibt
 * bei einem fehlenden Schlüssel den SCHLÜSSEL zurück — ohne Fehler, ohne roten
 * Build. Zwei Stellen sind hier besonders empfindlich:
 *
 *  · die ACHT ACHSEN des Markenabdrucks. Ihre Schlüssel werden aus dem
 *    Kategorie-Katalog gebaut; eine neunte Kategorie stünde ohne Wort als
 *    `brand.fingerprint.axis.trust` MITTEN IM SVG — und zwar auch im
 *    `aria-label`, also in dem einen Text, der die Grafik überhaupt zugänglich
 *    macht.
 *  · die PLURALFORMEN des Fazits. Sie werden mit `t(key, named, count)`
 *    gerufen; fehlt eine Form, zeigt vue-i18n stillschweigend die falsche
 *    („1 Gleichstände"). Deshalb wird hier die ZAHL der Formen geprüft, nicht
 *    nur die Existenz des Schlüssels.
 */

const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'i18n', 'locales')
const LOCALES = ['de', 'en'] as const

function flatten(node: unknown, prefix: string, into: Map<string, string>): Map<string, string> {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return into
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, into)
    else into.set(path, String(value))
  }
  return into
}

const catalogs = Object.fromEntries(
  LOCALES.map(locale => [
    locale,
    flatten(JSON.parse(readFileSync(join(localesDir, `${locale}.json`), 'utf8')), '', new Map<string, string>()),
  ]),
) as Record<(typeof LOCALES)[number], Map<string, string>>

function missingIn(key: string): string[] {
  return LOCALES.filter(locale => !catalogs[locale].has(key))
}

function gapsFor(keys: readonly string[]): string[] {
  return keys
    .map(key => ({ key, missing: missingIn(key) }))
    .filter(entry => entry.missing.length)
    .map(entry => `${entry.key} fehlt in ${entry.missing.join(', ')}`)
}

describe('Brand-Vergleich und Markenabdruck: i18n-Katalog', () => {
  it('kennt für JEDE Kategorie des Katalogs einen kurzen Achsen-Namen', () => {
    expect(gapsFor(BRAND_CHECK_CATEGORIES.map(c => `brand.fingerprint.axis.${c.key}`))).toEqual([])
    expect(BRAND_CHECK_CATEGORIES).toHaveLength(8)
  })

  it('GEGENPROBE: eine erfundene Achse hat kein Wort', () => {
    expect(missingIn('brand.fingerprint.axis.erfunden').length).toBeGreaterThan(0)
  })

  it('beschriftet den Markenabdruck samt seiner Zugänglichkeits-Texte', () => {
    expect(gapsFor([
      'brand.fingerprint.title',
      'brand.fingerprint.lead',
      'brand.fingerprint.notAssessable',
      'brand.fingerprint.aria',
      'brand.fingerprint.ariaSeries',
    ])).toEqual([])
  })

  it('trägt die Beschriftung der Vergleichs-Seite vollständig', () => {
    const keys = [
      'brand.checkCompare.seoTitle',
      'brand.checkCompare.seoTitleEmpty',
      'brand.checkCompare.eyebrow',
      'brand.checkCompare.title',
      'brand.checkCompare.lead',
      'brand.checkCompare.sideA',
      'brand.checkCompare.sideB',
      'brand.checkCompare.stand',
      'brand.checkCompare.open',
      'brand.checkCompare.pick',
      'brand.checkCompare.pickHint',
      'brand.checkCompare.pickTitle',
      'brand.checkCompare.pickLead',
      'brand.checkCompare.pickSearch',
      'brand.checkCompare.pickLoading',
      'brand.checkCompare.pickFailed',
      'brand.checkCompare.pickEmpty',
      'brand.checkCompare.pickCount',
      'brand.checkCompare.slotEmpty',
      'brand.checkCompare.swap',
      'brand.checkCompare.rowsTitle',
      'brand.checkCompare.rowsLead',
      'brand.checkCompare.notAssessable',
      'brand.checkCompare.notAssessableHint',
      'brand.checkCompare.missingTitle',
      'brand.checkCompare.missingText',
      'brand.checkCompare.missingCta',
      'brand.checkCompare.chooseTitle',
      'brand.checkCompare.chooseText',
      'brand.checkCompare.chooseA',
      'brand.checkCompare.chooseB',
      // Der Einstieg von der Ergebnisseite — er wird DORT gerendert, nicht hier.
      'brand.checkCompare.fromResult',
      'brand.checkCompare.summary.eyebrow',
      'brand.checkCompare.summary.leader',
      'brand.checkCompare.summary.tie',
      'brand.checkCompare.summary.wins',
      'brand.checkCompare.summary.ties',
      'brand.checkCompare.summary.notAssessable',
      'brand.checkCompare.summary.basis',
    ]
    expect(gapsFor(keys)).toEqual([])
  })

  it('trägt die Beschriftung der Erkenntnis-Kacheln vollständig (P6b)', () => {
    // Jede Kachel-Sorte aus `compareBrandCheckInsights` braucht ihren Text —
    // fehlt einer, steht der SCHLÜSSEL im Bento, ohne dass etwas rot wird.
    const keys = [
      'brand.checkCompare.insights.eyebrow',
      'brand.checkCompare.insights.title',
      'brand.checkCompare.insights.lead',
      'brand.checkCompare.insights.pointsGap',
      'brand.checkCompare.insights.overall.title',
      'brand.checkCompare.insights.overall.close',
      'brand.checkCompare.insights.overall.clear',
      'brand.checkCompare.insights.overall.wide',
      'brand.checkCompare.insights.overall.tie',
      'brand.checkCompare.insights.overall.note',
      'brand.checkCompare.insights.wins.title',
      'brand.checkCompare.insights.wins.count',
      'brand.checkCompare.insights.wins.tieLabel',
      'brand.checkCompare.insights.wins.none',
      'brand.checkCompare.insights.gap.titleTop',
      'brand.checkCompare.insights.gap.title',
      'brand.checkCompare.insights.gap.line',
      'brand.checkCompare.insights.gap.why',
      'brand.checkCompare.insights.gap.noReasons',
      'brand.checkCompare.insights.gap.noEvidence',
      'brand.checkCompare.insights.ties.title',
      'brand.checkCompare.insights.ties.lead',
      'brand.checkCompare.insights.ties.value',
      'brand.checkCompare.insights.strengths.title',
      'brand.checkCompare.insights.strengths.lead',
      'brand.checkCompare.insights.strengths.best',
      'brand.checkCompare.insights.strengths.worst',
      'brand.checkCompare.insights.strengths.none',
      'brand.checkCompare.insights.notAssessable.title',
      'brand.checkCompare.insights.notAssessable.lead',
      'brand.checkCompare.insights.notAssessable.line',
      'brand.checkCompare.insights.notAssessable.categories',
      'brand.checkCompare.insights.notAssessable.criteria',
    ]
    expect(gapsFor(keys)).toEqual([])
  })

  it('JEDE Nähe-Stufe und JEDE Kachel-Sorte hat ihren Schlüssel — auch eine künftige', () => {
    // Die Sorten kommen aus dem TYP, nicht aus einer zweiten Liste: eine neue
    // Erkenntnis fällt hier auf, statt in der Bento-Kachel als Schlüssel zu
    // erscheinen. `gap` trägt zwei Überschriften und steht deshalb schon oben.
    const kinds = ['overall', 'wins', 'ties', 'strengths', 'notAssessable']
    expect(gapsFor(kinds.map(kind => `brand.checkCompare.insights.${kind}.title`))).toEqual([])
    const closeness = ['close', 'clear', 'wide']
    expect(gapsFor(closeness.map(step => `brand.checkCompare.insights.overall.${step}`))).toEqual([])
  })

  it('die Pluralformen der Erkenntnisse sind vollständig', () => {
    const shapes: Record<string, number> = {
      // Zwei Formen: einen Punkt gibt es, null Punkte Abstand heisst Gleichstand.
      'brand.checkCompare.insights.pointsGap': 2,
      // Drei Formen: „keine von 8" ist ein echter Fall.
      'brand.checkCompare.insights.wins.count': 3,
      'brand.checkCompare.insights.notAssessable.categories': 3,
      'brand.checkCompare.insights.notAssessable.criteria': 3,
    }
    for (const [key, forms] of Object.entries(shapes)) {
      for (const locale of LOCALES) {
        const message = catalogs[locale].get(key) ?? ''
        expect(message.split('|').length, `${key} (${locale})`).toBe(forms)
      }
    }
  })

  it('die Pluralformen des Fazits sind vollständig', () => {
    // Drei Formen, wo die Null vorkommen kann (keine gewonnene Kategorie, kein
    // Gleichstand) — zwei, wo die Zeile nur ab eins gerendert wird.
    const shapes: Record<string, number> = {
      'brand.checkCompare.summary.wins': 3,
      'brand.checkCompare.summary.ties': 3,
      'brand.checkCompare.summary.notAssessable': 2,
      'brand.checkCompare.pickCount': 2,
    }
    for (const [key, forms] of Object.entries(shapes)) {
      for (const locale of LOCALES) {
        const message = catalogs[locale].get(key) ?? ''
        expect(message.split('|').length, `${key} (${locale})`).toBe(forms)
      }
    }
  })

  it('die neuen Namensräume sind in de und en deckungsgleich', () => {
    for (const namespace of ['brand.checkCompare.', 'brand.fingerprint.']) {
      const de = [...catalogs.de.keys()].filter(key => key.startsWith(namespace)).sort()
      const en = [...catalogs.en.keys()].filter(key => key.startsWith(namespace)).sort()
      expect(de, namespace).toEqual(en)
      expect(de.length, namespace).toBeGreaterThan(0)
    }
  })
})
