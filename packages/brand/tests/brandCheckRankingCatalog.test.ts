import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BRAND_CHECK_CATEGORIES, BRAND_SCORE_BANDS } from '../shared/brandCheck'
import { BRAND_INDUSTRY_VALUES } from '../shared/brandIndustries'
import { BRAND_CHECK_CORRECTION_FILTERS, BRAND_CHECK_CORRECTION_STATUSES } from '../shared/brandCheckCorrections'

/**
 * DAS RANKING, DAS KORREKTUR-FORMULAR UND DIE BETREIBER-WARTESCHLANGE RENDERN
 * REINEN KATALOG-TEXT (Plan docs/archiv/BRAND-CHECK-SEITE.md §3/§3b, Paket P3).
 *
 * vue-i18n gibt bei einem fehlenden Schlüssel den SCHLÜSSEL zurück — ohne
 * Fehler, ohne roten Build. Das Ranking ist eine INDEXIERBARE Seite: dort hiesse
 * das `brand.industry.craft` als Filter-Eintrag, wörtlich, für Google. Genau das
 * fängt diese Datei, und zwar an den drei Stellen, an denen ein Schlüssel aus
 * einer LISTE gebaut wird (Branchen, Bänder, Kategorien, Filter-Zustände) —
 * eine neue Branche ohne Wort fällt sonst niemandem auf.
 *
 * `i18nCatalog.test.ts` prüft daneben schon, dass de und en denselben
 * Schlüsselvorrat haben und dass keine Nachricht spitze Klammern oder ein rohes
 * At-Zeichen trägt; `brandCheckPageCatalog.test.ts` deckt die Startseite ab.
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

describe('Brand-Check-Ranking: i18n-Katalog', () => {
  it('kennt JEDE Branchen-Id des Katalogs mit Namen, in beiden Sprachen', () => {
    // `unknown` GEHÖRT dazu: es ist der Spalten-Vorgabewert und steht als
    // eigener Filter-Eintrag in der Liste (shared/brandIndustries.ts).
    expect(gapsFor(BRAND_INDUSTRY_VALUES.map(id => `brand.industry.${id}`))).toEqual([])
    expect(BRAND_INDUSTRY_VALUES).toHaveLength(17)
  })

  it('GEGENPROBE: eine erfundene Branche hat kein Wort', () => {
    expect(missingIn('brand.industry.erfunden').length).toBeGreaterThan(0)
  })

  it('beschriftet die sieben Bänder und die acht Kategorie-Bestenlisten', () => {
    // Der Band-Filter und die Sortierung bauen ihre Schlüssel aus denselben
    // Katalogen wie die Ergebnisseite — ein neues Band ohne Wort stünde roh im
    // Auswahlfeld.
    expect(gapsFor(BRAND_SCORE_BANDS.map(band => `brand.check.bands.${band}`))).toEqual([])
    expect(gapsFor(BRAND_CHECK_CATEGORIES.map(c => `brand.check.categories.${c.key}`))).toEqual([])
  })

  it('trägt die Beschriftung der Ranking-Seite vollständig', () => {
    const keys = [
      'brand.checkRanking.seoTitle',
      'brand.checkRanking.seoDescription',
      'brand.checkRanking.eyebrow',
      'brand.checkRanking.title',
      'brand.checkRanking.lead',
      'brand.checkRanking.total',
      'brand.checkRanking.compare',
      'brand.checkRanking.compareHint',
      'brand.checkRanking.pick',
      'brand.checkRanking.note',
      'brand.checkRanking.filter.industry',
      'brand.checkRanking.filter.band',
      'brand.checkRanking.filter.sort',
      'brand.checkRanking.filter.allIndustries',
      'brand.checkRanking.filter.allBands',
      'brand.checkRanking.sort.score',
      'brand.checkRanking.sort.date',
      'brand.checkRanking.sort.category',
      'brand.checkRanking.col.rank',
      'brand.checkRanking.col.host',
      'brand.checkRanking.col.score',
      'brand.checkRanking.col.industry',
      'brand.checkRanking.col.source',
      'brand.checkRanking.col.strongest',
      'brand.checkRanking.col.date',
      // Die zwei Quellen aus §5b — eine Zahl über eine Website und eine über
      // ein Fundament-Dokument sind nicht dasselbe und heissen deshalb anders.
      'brand.checkRanking.source.website',
      'brand.checkRanking.source.document',
      'brand.checkRanking.emptyTitle',
      'brand.checkRanking.empty',
      'brand.checkRanking.emptyCta',
    ]
    expect(gapsFor(keys)).toEqual([])
  })

  it('trägt das Korrektur-Formular samt seiner fünf Fehlerfälle', () => {
    const keys = [
      'brand.checkCorrection.trigger',
      'brand.checkCorrection.title',
      'brand.checkCorrection.lead',
      'brand.checkCorrection.current',
      'brand.checkCorrection.proposedLabel',
      'brand.checkCorrection.proposedPlaceholder',
      'brand.checkCorrection.reasonLabel',
      'brand.checkCorrection.reasonHint',
      'brand.checkCorrection.reasonPlaceholder',
      'brand.checkCorrection.emailLabel',
      'brand.checkCorrection.emailHint',
      'brand.checkCorrection.emailPlaceholder',
      'brand.checkCorrection.submit',
      'brand.checkCorrection.thanks',
      // Jeder Zweig von `messageKey()` in BwBrandCheckCorrectionForm.vue: ein
      // Zweig ohne Satz zeigt dem Menschen einen rohen Schlüssel statt einer
      // Auskunft.
      'brand.checkCorrection.errors.correctionOpen',
      'brand.checkCorrection.errors.rateLimited',
      'brand.checkCorrection.errors.notFound',
      'brand.checkCorrection.errors.unavailable',
      'brand.checkCorrection.errors.generic',
    ]
    expect(gapsFor(keys)).toEqual([])
  })

  it('beschriftet die Betreiber-Warteschlange, ihre Filter und ihre Zustände', () => {
    const listKeys = [
      ...BRAND_CHECK_CORRECTION_FILTERS.map(f => `brand.admin.checkCorrections.filter.${f}`),
      ...BRAND_CHECK_CORRECTION_STATUSES.map(s => `brand.admin.checkCorrections.status.${s}`),
    ]
    const keys = [
      // Der Registry-Eintrag: `labelKey` wird von einer FREMDEN Komponente
      // gerendert (die Dashboard-Nav des admin-Layers) — fehlte er, stünde
      // `brand.admin.checkCorrections.nav` im Menü.
      'brand.admin.checkCorrections.nav',
      'brand.admin.checkCorrections.title',
      'brand.admin.checkCorrections.subtitle',
      'brand.admin.checkCorrections.refresh',
      'brand.admin.checkCorrections.more',
      'brand.admin.checkCorrections.shown',
      'brand.admin.checkCorrections.actionFailed',
      'brand.admin.checkCorrections.accepted',
      'brand.admin.checkCorrections.acceptedHint',
      'brand.admin.checkCorrections.unchangedHint',
      'brand.admin.checkCorrections.declined',
      'brand.admin.checkCorrections.field.industry',
      'brand.admin.checkCorrections.col.host',
      'brand.admin.checkCorrections.col.field',
      'brand.admin.checkCorrections.col.change',
      'brand.admin.checkCorrections.col.reason',
      'brand.admin.checkCorrections.col.reporter',
      'brand.admin.checkCorrections.col.status',
      'brand.admin.checkCorrections.col.date',
      'brand.admin.checkCorrections.action.accept',
      'brand.admin.checkCorrections.action.decline',
      'brand.admin.checkCorrections.declineTitle',
      'brand.admin.checkCorrections.declineText',
      'brand.admin.checkCorrections.declineNoteLabel',
      'brand.admin.checkCorrections.declineNoteHint',
      'brand.admin.checkCorrections.declineNotePlaceholder',
      'brand.admin.checkCorrections.emptyTitle',
      'brand.admin.checkCorrections.empty',
      'brand.admin.checkCorrections.error.already_decided',
      'brand.admin.checkCorrections.error.invalid_value',
      'brand.admin.checkCorrections.error.not_found',
      'brand.admin.checkCorrections.error.check_not_found',
      'brand.admin.checkCorrections.error.corrections_unavailable',
      'brand.admin.checkCorrections.error.generic',
      'brand.admin.checkCorrections.hiddenTitle',
      'brand.admin.checkCorrections.hiddenHint',
      'brand.admin.checkCorrections.hiddenLabel',
      'brand.admin.checkCorrections.hiddenPlaceholder',
      'brand.admin.checkCorrections.hide',
      'brand.admin.checkCorrections.unhide',
      'brand.admin.checkCorrections.hiddenOn',
      'brand.admin.checkCorrections.hiddenOff',
      ...listKeys,
    ]
    expect(gapsFor(keys)).toEqual([])
  })

  it('die neuen Namensräume sind in de und en deckungsgleich', () => {
    // Schlüsselparität je Namensraum, nicht nur „ist vorhanden": ein Satz, den
    // nur eine Sprache hat, fällt in der Gegenrichtung sonst durch.
    for (const namespace of ['brand.checkRanking.', 'brand.industry.', 'brand.checkCorrection.', 'brand.admin.checkCorrections.']) {
      const de = [...catalogs.de].filter(key => key.startsWith(namespace)).sort()
      const en = [...catalogs.en].filter(key => key.startsWith(namespace)).sort()
      expect(de, namespace).toEqual(en)
      expect(de.length, namespace).toBeGreaterThan(0)
    }
  })
})
