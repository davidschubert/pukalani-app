import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BRAND_CHECK_CATEGORIES } from '../shared/brandCheck'

/**
 * DIE START-SEITE DES BRAND-CHECKS RENDERT REINEN KATALOG-TEXT
 * (`packages/brand/app/pages/brand-check/index.vue`, Plan
 * docs/archiv/BRAND-CHECK-SEITE.md §2) — und vue-i18n gibt bei einem fehlenden
 * Schlüssel den SCHLÜSSEL zurück, ohne Fehler und ohne roten Build. Auf einer
 * SEO-Seite hiesse das: `brand.checkPage.faq.q3A` steht wörtlich im FAQPage-
 * JSON-LD, das an Google geht. Genau das fängt dieser Test.
 *
 * `i18nCatalog.test.ts` prüft daneben schon, dass de und en denselben
 * Schlüsselvorrat haben und dass keine Nachricht spitze Klammern oder ein
 * rohes At-Zeichen trägt; hier steht nur, was DIESE Seite braucht — inklusive
 * der ZAHL der FAQ-Einträge, damit ein still weggefallener Eintrag auffällt.
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

/** Die sechs Fragen aus Plan §2 — sechs, nicht „mindestens sechs". */
const FAQ_IDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const

describe('Brand-Check-Startseite: i18n-Katalog', () => {
  it('trägt sechs FAQ-Einträge je Sprache, Frage UND Antwort', () => {
    const gaps: string[] = []
    for (const id of FAQ_IDS) {
      for (const suffix of ['Q', 'A']) {
        const key = `brand.checkPage.faq.${id}${suffix}`
        const missing = missingIn(key)
        if (missing.length) gaps.push(`${key} fehlt in ${missing.join(', ')}`)
      }
    }
    expect(gaps).toEqual([])

    // Genau sechs: ein siebter Eintrag im Katalog ohne Zweig in der Seite
    // stünde nirgends, ein fehlender sechster fiele sonst nicht auf.
    for (const locale of LOCALES) {
      const questions = [...catalogs[locale]].filter(key => /^brand\.checkPage\.faq\.q\d+Q$/.test(key))
      expect(questions, locale).toHaveLength(FAQ_IDS.length)
    }
  })

  it('GEGENPROBE: eine siebte Frage gibt es nicht', () => {
    expect(missingIn('brand.checkPage.faq.q7Q').length).toBeGreaterThan(0)
  })

  it('trägt die Beschriftung der Seite, der Reiter und des Teasers', () => {
    // Diese Schlüssel hängen an keiner Registry: fiele einer weg, stünde er
    // wörtlich auf einer indexierbaren Seite.
    const keys = [
      'brand.checkPage.seoTitle',
      'brand.checkPage.seoDescription',
      'brand.checkPage.tabsAria',
      'brand.checkPage.tabs.start',
      'brand.checkPage.tabs.ranking',
      'brand.checkPage.tabs.compare',
      'brand.checkPage.tabs.soon',
      'brand.checkPage.hero.eyebrow',
      'brand.checkPage.hero.title',
      'brand.checkPage.hero.lead',
      'brand.checkPage.what.eyebrow',
      'brand.checkPage.what.title',
      'brand.checkPage.what.body',
      'brand.checkPage.what.honest',
      'brand.checkPage.why.eyebrow',
      'brand.checkPage.why.title',
      'brand.checkPage.why.body1',
      'brand.checkPage.why.body2',
      'brand.checkPage.value.eyebrow',
      'brand.checkPage.value.title',
      'brand.checkPage.basis.eyebrow',
      'brand.checkPage.basis.title',
      'brand.checkPage.basis.lead',
      'brand.checkPage.basis.weight',
      'brand.checkPage.basis.note',
      'brand.checkPage.basis.lockedNote',
      'brand.checkPage.features.eyebrow',
      'brand.checkPage.features.title',
      'brand.checkPage.next.eyebrow',
      'brand.checkPage.next.title',
      'brand.checkPage.next.body',
      'brand.checkPage.next.cta',
      'brand.checkPage.next.brands',
      'brand.checkPage.next.brandsHint',
      'brand.checkPage.faq.eyebrow',
      'brand.checkPage.faq.title',
      'brand.checkPage.teaser.eyebrow',
      'brand.checkPage.teaser.title',
      'brand.checkPage.teaser.body',
      'brand.checkPage.teaser.cta',
      'brand.checkPage.teaser.sampleLabel',
      'brand.checkPage.teaser.sampleNote',
      // Das Ranking-Opt-in im Formular (Plan §8.1, Default AUS).
      'brand.check.form.ranking',
      'brand.check.form.rankingHint',
    ]
    expect(keys.filter(key => missingIn(key).length)).toEqual([])
  })

  it('beschriftet die drei Vier-Karten-Blöcke vollständig', () => {
    const groups: Array<[string, readonly string[], readonly string[]]> = [
      ['what', ['f1', 'f2', 'f3'], ['Label', 'Body']],
      ['value', ['v1', 'v2', 'v3'], ['Title', 'Body']],
      ['features', ['f1', 'f2', 'f3', 'f4'], ['Label', 'Body']],
    ]
    const gaps: string[] = []
    for (const [group, ids, suffixes] of groups) {
      for (const id of ids) {
        for (const suffix of suffixes) {
          const key = `brand.checkPage.${group}.${id}${suffix}`
          const missing = missingIn(key)
          if (missing.length) gaps.push(`${key} fehlt in ${missing.join(', ')}`)
        }
      }
    }
    expect(gaps).toEqual([])
  })

  it('kennt jede der acht Kategorien mit Namen — die Seite nennt sie mit Gewicht', () => {
    // Die Seite rendert `BRAND_CHECK_CATEGORIES` und beschriftet sie mit
    // denselben Schlüsseln wie die Ergebnisseite. Eine neue Kategorie ohne
    // Namen stünde als `craft` in der Liste.
    const gaps = BRAND_CHECK_CATEGORIES
      .map(category => `brand.check.categories.${category.key}`)
      .filter(key => missingIn(key).length)
    expect(gaps).toEqual([])
    expect(BRAND_CHECK_CATEGORIES).toHaveLength(8)
  })
})
