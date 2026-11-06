import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BRAND_CHECK_CATEGORIES } from '../shared/brandCheck'

/**
 * DIE SCHLÜSSEL DER SCORE-SEITE (BRAND-CHECK-SEITE §5/§5b).
 *
 * vue-i18n gibt bei fehlender Übersetzung den SCHLÜSSEL aus — kein Fehler,
 * keine Warnung, kein roter Build (vier Tage `legal.imprint` im Fuss von
 * comments.pukalani.app). `i18nCatalog.test.ts` vergleicht bereits den GESAMTEN
 * Vorrat beider Sprachen; dieser Test nennt die Schlüssel dieser Seite
 * NAMENTLICH und fängt damit den anderen Fehler: einen, den jemand in BEIDEN
 * Sprachen entfernt, ohne die Seite anzufassen.
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

function keysUnder(prefix: string): string[] {
  return [...catalogs.de].filter(key => key.startsWith(`${prefix}.`)).sort()
}

const REQUIRED = [
  'brand.myScores.title',
  'brand.myScores.subtitle',
  'brand.myScores.back',
  'brand.myScores.loading',
  'brand.myScores.missingTitle',
  'brand.myScores.missingText',
  'brand.myScores.sources.website',
  'brand.myScores.sources.document',
  'brand.myScores.website.title',
  'brand.myScores.website.lead',
  'brand.myScores.website.stand',
  'brand.myScores.website.open',
  'brand.myScores.website.recheck',
  'brand.myScores.website.start',
  'brand.myScores.website.running',
  'brand.myScores.website.none',
  'brand.myScores.website.noUrl',
  'brand.myScores.website.addUrl',
  'brand.myScores.website.urlLabel',
  'brand.myScores.website.urlPlaceholder',
  'brand.myScores.website.saved',
  'brand.myScores.document.title',
  'brand.myScores.document.lead',
  'brand.myScores.document.stand',
  'brand.myScores.document.open',
  'brand.myScores.document.recheck',
  'brand.myScores.document.start',
  'brand.myScores.document.running',
  'brand.myScores.document.none',
  'brand.myScores.diff.title',
  'brand.myScores.diff.lead',
  'brand.myScores.diff.dates',
  'brand.myScores.diff.category',
  'brand.myScores.diff.previous',
  'brand.myScores.diff.latest',
  'brand.myScores.diff.change',
  'brand.myScores.diff.total',
  'brand.myScores.diff.notAssessable',
  'brand.myScores.diff.isNew',
  'brand.myScores.todos.title',
  'brand.myScores.todos.lead',
  'brand.myScores.todos.empty',
  'brand.myScores.todos.points',
  'brand.myScores.todos.chapter',
  'brand.myScores.history.title',
  'brand.myScores.history.lead',
  'brand.myScores.history.date',
  'brand.myScores.history.source',
  'brand.myScores.history.score',
  'brand.myScores.history.open',
  'brand.myScores.history.empty',
  'brand.myScores.card.score',
  'brand.myScores.card.empty',
  'brand.myScores.card.addUrl',
  // Die LISTE `/dashboard/brand-scores` (P6c) — inkl. ihres Menüpunkts im
  // Konto-Menü (`brand.myScores.list.nav`): ein `labelKey` ohne Deckung stünde
  // dort wörtlich als Schlüssel, und genau das sieht kein Test im Markup.
  'brand.myScores.list.nav',
  'brand.myScores.list.all',
  'brand.myScores.list.title',
  'brand.myScores.list.subtitle',
  'brand.myScores.list.summary',
  'brand.myScores.list.summaryEmpty',
  'brand.myScores.list.col.brand',
  'brand.myScores.list.col.website',
  'brand.myScores.list.col.websiteScore',
  'brand.myScores.list.col.documentScore',
  'brand.myScores.list.col.lastCheck',
  'brand.myScores.list.sortBy',
  'brand.myScores.list.addUrl',
  'brand.myScores.list.never',
  'brand.myScores.list.runWebsite',
  'brand.myScores.list.runDocument',
  'brand.myScores.list.done',
  'brand.myScores.list.failed',
  'brand.myScores.list.emptyTitle',
  'brand.myScores.list.empty',
  'brand.myScores.list.emptyCta',
  // Der Leerzustand der Liste borgt sich den Zugangs-Text der Karten-Übersicht
  // — dieselbe 404 der Datentür, also derselbe Satz statt eines zweiten.
  'brand.workspace.noAccess.title',
  'brand.workspace.noAccess.description',
  'brand.workspace.noAccess.action',
  'brand.brands.card.untitled',
  'brand.check.document.source',
  'brand.check.document.sourceUnnamed',
  'brand.check.document.hint',
]

/** Die Gründe, die die Seite aus `data.reason` in einen Satz übersetzt. */
const ERROR_KEYS = [
  'accountLimit',
  'documentEmpty',
  'notFound',
  'invalidUrl',
  'blockedTarget',
  'fetchFailed',
  'unavailable',
  'generic',
]

describe('brand.myScores · Katalog', () => {
  it('führt jeden Schlüssel der Score-Seite — in de UND en', () => {
    const gaps = REQUIRED.filter(key => missingIn(key).length)
    expect(gaps).toEqual([])
  })

  it('hat für JEDEN Ablehnungsgrund einen eigenen Satz', () => {
    const gaps = ERROR_KEYS.filter(key => missingIn(`brand.myScores.errors.${key}`).length)
    expect(gaps).toEqual([])
    // Der Konto-Deckel MUSS etwas anderes sagen als „gerade nicht erreichbar" —
    // nur der eine Satz sagt, dass morgen etwas anderes gilt.
    const messages = JSON.parse(readFileSync(join(localesDir, 'de.json'), 'utf8')) as {
      brand: { myScores: { errors: Record<string, string> } }
    }
    expect(messages.brand.myScores.errors.accountLimit)
      .not.toBe(messages.brand.myScores.errors.unavailable)
  })

  it('die zwei Namensräume sind in beiden Sprachen deckungsgleich', () => {
    for (const prefix of ['brand.myScores', 'brand.check.document']) {
      const de = keysUnder(prefix)
      const en = [...catalogs.en].filter(key => key.startsWith(`${prefix}.`)).sort()
      expect(de, prefix).toEqual(en)
      expect(de.length, prefix).toBeGreaterThan(0)
    }
  })

  it('die Gegenüberstellung kann jede Kategorie beschriften', () => {
    // Sie rendert `brand.check.categories.<key>` — dieselben acht wie die
    // Ergebnis-Seite. Fehlte einer, stünde in der Tabelle der rohe Schlüssel.
    const gaps = BRAND_CHECK_CATEGORIES
      .filter(category => missingIn(`brand.check.categories.${category.key}`).length)
      .map(category => category.key)
    expect(gaps).toEqual([])
  })

  it('GEGENPROBE: ein erfundener Schlüssel fällt durch', () => {
    expect(missingIn('brand.myScores.erfunden').length).toBeGreaterThan(0)
  })
})
