import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BRAND_CHECK_CATEGORIES, BRAND_CHECK_CRITERIA } from '../shared/brandCheck'

/**
 * DIE ERGEBNISSEITE V2 RENDERT REINEN KATALOG-TEXT
 * (`packages/brand/app/pages/brand-check/[id].vue` und
 * `BwBrandCheckMatrix.vue`, docs/archiv/BRAND-CHECK-SEITE.md §10) — und
 * vue-i18n gibt bei einem fehlenden Schlüssel den SCHLÜSSEL zurück, ohne
 * Fehler und ohne roten Build. Auf einer geteilten Ergebnisseite stünde dann
 * wörtlich `brand.checkResult.planTotal` neben dem Score.
 *
 * `i18nCatalog.test.ts` prüft daneben schon, dass de und en denselben
 * Schlüsselvorrat haben und dass keine Nachricht spitze Klammern oder ein
 * rohes At-Zeichen trägt; hier steht, was DIESE Seite braucht — inklusive der
 * Fremd-Schlüssel, die sie aus anderen Namensräumen mitbenutzt (Bänder,
 * Kategorien, Kapitel), denn genau die fallen bei einem Umbau still weg.
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

/** Jeder Schlüssel, den die Seite oder die Matrix aufruft — von Hand gepflegt. */
const RESULT_KEYS = [
  'deltaUp',
  'deltaDown',
  'deltaSame',
  'rank',
  'verdictTitle',
  'verdictLead',
  'strengthTitle',
  'opportunityTitle',
  'nextStepTitle',
  'nextStepChapter',
  'nextStepPlain',
  'nextStepCta',
  'strongestTitle',
  'weakestTitle',
  'categoryValue',
  'categoryWeight',
  'categoriesLead',
  'coverageTitle',
  'coverageValue',
  'coverageLocked',
  'coverageComplete',
  'coverageGrades',
  'industryTitle',
  'sourceTitle',
  'sourceWebsite',
  'sourceDocument',
  'matrixTitle',
  'matrixLead',
  'matrixCell',
  'matrixLegend.full',
  'matrixLegend.partial',
  'matrixLegend.none',
  'matrixLegend.locked',
  'planTitle',
  'planLead',
  'planTotal',
  'planEmpty',
  'planChapter',
  'planShowAll',
  'planShowLess',
  'gain',
  'gainNone',
] as const

/** Aus anderen Namensräumen mitbenutzt — dieselbe Wirkung, wenn sie fehlen. */
const BORROWED_KEYS = [
  'brand.check.result.seoTitle',
  'brand.check.result.seoTitleEmpty',
  'brand.check.result.eyebrow',
  'brand.check.result.maturity',
  'brand.check.result.copy',
  'brand.check.result.categoriesTitle',
  'brand.check.result.locked',
  'brand.check.result.criterionPoints',
  'brand.check.result.notAssessable',
  'brand.check.result.criterionFallback',
  'brand.check.result.nextFallback',
  'brand.check.result.relaunchEyebrow',
  'brand.check.result.relaunchTitle',
  'brand.check.result.relaunchBody',
  'brand.check.result.relaunchCta',
  'brand.check.result.reportEyebrow',
  'brand.check.result.reportTitle',
  'brand.check.result.reportBody',
  'brand.check.document.eyebrow',
  'brand.checkCompare.fromResult',
  'brand.fingerprint.title',
  'brand.fingerprint.lead',
  'brand.industry.unknown',
] as const

describe('Ergebnisseite v2: i18n-Katalog', () => {
  it('trägt jeden eigenen Schlüssel in beiden Sprachen', () => {
    const gaps: string[] = []
    for (const key of RESULT_KEYS) {
      const full = `brand.checkResult.${key}`
      const missing = missingIn(full)
      if (missing.length) gaps.push(`${full} fehlt in ${missing.join(', ')}`)
    }
    expect(gaps).toEqual([])
  })

  it('trägt jeden mitbenutzten Fremd-Schlüssel in beiden Sprachen', () => {
    const gaps = BORROWED_KEYS
      .map(key => ({ key, missing: missingIn(key) }))
      .filter(entry => entry.missing.length)
      .map(entry => `${entry.key} fehlt in ${entry.missing.join(', ')}`)
    expect(gaps).toEqual([])
  })

  it('GEGENPROBE: ein erfundener Schlüssel fehlt in beiden', () => {
    expect(missingIn('brand.checkResult.gibtEsNicht')).toEqual(['de', 'en'])
  })

  it('die acht Kategorien und die sieben Bänder haben ihre Wörter', () => {
    const gaps: string[] = []
    for (const category of BRAND_CHECK_CATEGORIES) {
      for (const key of [`brand.check.categories.${category.key}`, `brand.fingerprint.axis.${category.key}`]) {
        const missing = missingIn(key)
        if (missing.length) gaps.push(`${key} fehlt in ${missing.join(', ')}`)
      }
    }
    // Die Kategorie-Karten zeigen das Band-WORT zu ihrem 0–100-Wert; ohne
    // eines der sieben stünde dort ein roher Schlüssel.
    for (const band of ['exceptional', 'outstanding', 'excellent', 'strong', 'average', 'weak', 'poor']) {
      const key = `brand.check.bands.${band}`
      const missing = missingIn(key)
      if (missing.length) gaps.push(`${key} fehlt in ${missing.join(', ')}`)
    }
    expect(gaps).toEqual([])
  })

  it('jedes der 40 Kriterien hat Titel und nächsten Schritt', () => {
    // Die Matrix nennt JEDES Kriterium (Titel im `title`-Attribut), der Plan
    // dazu den nächsten Schritt — beides ohne Deckel, anders als die alten
    // drei Befunde. Ein Loch im Katalog wäre damit direkt sichtbar.
    const gaps: string[] = []
    for (const criterion of BRAND_CHECK_CRITERIA) {
      for (const suffix of ['title', 'next']) {
        const key = `brand.check.criteria.${criterion.id}.${suffix}`
        const missing = missingIn(key)
        if (missing.length) gaps.push(`${key} fehlt in ${missing.join(', ')}`)
      }
    }
    expect(gaps).toEqual([])
  })

  it('der Namensraum ist in beiden Sprachen deckungsgleich', () => {
    const keysOf = (locale: (typeof LOCALES)[number]) =>
      [...catalogs[locale]].filter(key => key.startsWith('brand.checkResult.')).sort()
    expect(keysOf('de')).toEqual(keysOf('en'))
    expect(keysOf('de').length).toBe(RESULT_KEYS.length)
  })
})
