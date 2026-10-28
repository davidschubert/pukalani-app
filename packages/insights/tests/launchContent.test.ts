import { describe, expect, it } from 'vitest'
import { brandPublicationSlug } from '../../brand/shared/brandPublication'
import { BRAND_INDUSTRY_VALUES } from '../../brand/shared/brandIndustries'
import { BRAND_ARCHETYPES } from '../../brand/shared/brandChoiceOptions'
import { BRAND_PALETTES } from '../../brand/shared/brandPalette'
import {
  INSIGHTS_METHODOLOGY_PATH,
  INSIGHTS_QUOTE_MAX,
  insightsDuelSlug,
  insightsMethodologyLinked,
} from '../shared/insightsPost'
import { LAUNCH_BRANDS, LAUNCH_POSTS } from '../scripts/launch/index.mjs'
import {
  launchBrandFromContent,
  launchFlagText,
  launchPostFromContent,
  launchPostIssues,
} from '../scripts/launch-check.mjs'

/**
 * DER LAUNCH-INHALT (BI1 I6) OHNE DATENBANK — was der Seed vor jedem Schreiben
 * prüft, hier als Netz für jede spätere Text-Änderung.
 *
 * Ids sind die Marken-Slugs (Attrappen): die Regeln fragen nur, ob eine Id zu
 * einer Zeile gehört, nicht, wie sie aussieht. Der BELEG-Abruf fehlt bewusst —
 * er braucht das Netz und gehört dem Server-Gate (Beweis-Lauf im Bericht).
 */

interface ContentSource { url: string, kind: string, quote: string, publisher: string, date: string, license: string }
interface ContentPost {
  format: string
  slug: string
  titleDe: string
  titleEn: string
  dekDe: string
  dekEn: string
  bodyDe: string
  bodyEn: string
  sources: ContentSource[]
  brandSlugs: string[]
  facts: { sourceIndex: number }[]
  ranking: { entries: { brandSlug: string, reasonDe: string, reasonEn: string }[] } | null
}
interface ContentBrand {
  slug: string
  name: string
  homepage: string
  libraryKey: string
  industry: string
  country: string
  archetype: string
  archetypeSecondary: string
  paletteId: string
  marks: { sourceIndex: number }[]
  history: { sourceIndex: number }[]
  relationSlugs: string[]
  sources: ContentSource[]
}

const brands = LAUNCH_BRANDS as ContentBrand[]
const posts = LAUNCH_POSTS as ContentPost[]

const brandRows = brands.map(brand => ({ id: brand.slug, name: brand.name, homepage: brand.homepage, state: 'draft' }))
const brandOf = (slug: string) => {
  const brand = brands.find(entry => entry.slug === slug)
  if (!brand) throw new Error(`keine Marke ${slug}`)
  return { id: brand.slug, libraryKey: brand.libraryKey }
}

const buildPost = (content: ContentPost) => launchPostFromContent(content, { brandOf, asOf: '2026-10-28' })

/** Alle Quellen des Inhalts, mit Herkunft für eine lesbare Meldung. */
const allSources: { where: string, source: ContentSource }[] = [
  ...brands.flatMap(brand => brand.sources.map((source, index) => ({ where: `Marke ${brand.slug} #${index}`, source }))),
  ...posts.flatMap(post => post.sources.map((source, index) => ({ where: `${post.slug} #${index}`, source }))),
]

describe('Launch-Inhalt: Marken-Zeilen', () => {
  it('sechs Zeilen, Slug = brandPublicationSlug(Name), keine doppelt', () => {
    expect(brands.map(brand => brand.slug)).toEqual(['nike', 'adidas', 'ikea', 'apple', 'anthropic', 'the-barn'])
    for (const brand of brands) expect(brand.slug).toBe(brandPublicationSlug(brand.name))
  })

  it('parst gegen insightsBrandSchema, alle als Entwurf', () => {
    for (const brand of brands) {
      const parsed = launchBrandFromContent(brand, { relations: brand.relationSlugs })
      expect(parsed.state).toBe('draft')
    }
  })

  it('Katalogwerte nur aus dem brand-Layer', () => {
    const archetypes = new Set(['', ...BRAND_ARCHETYPES.map(option => option.id)])
    const palettes = new Set(['', ...BRAND_PALETTES.map(palette => palette.id)])
    for (const brand of brands) {
      expect(BRAND_INDUSTRY_VALUES).toContain(brand.industry)
      expect(brand.country).toMatch(/^[A-Z]{2}$/)
      expect(archetypes.has(brand.archetype)).toBe(true)
      expect(archetypes.has(brand.archetypeSecondary)).toBe(true)
      expect(palettes.has(brand.paletteId)).toBe(true)
    }
  })

  it('libraryKey genau für die vier handgeprüften Bibliotheks-Marken', () => {
    const keyed = brands.filter(brand => brand.libraryKey).map(brand => [brand.slug, brand.libraryKey])
    expect(keyed).toEqual([['nike', 'nike'], ['apple', 'apple'], ['anthropic', 'anthropic'], ['the-barn', 'the-barn']])
  })

  it('jede Zeile hat eine Quelle; Zeichen und Historie zeigen auf eine', () => {
    for (const brand of brands) {
      expect(brand.sources.length).toBeGreaterThan(0)
      for (const entry of [...brand.marks, ...brand.history]) {
        expect(entry.sourceIndex).toBeGreaterThanOrEqual(0)
        expect(entry.sourceIndex).toBeLessThan(brand.sources.length)
      }
    }
  })

  it('Nike trägt das volle Dossier (5–7 Historien-Zeilen, Beziehung zu adidas)', () => {
    const nike = brands.find(brand => brand.slug === 'nike')!
    expect(nike.history.length).toBeGreaterThanOrEqual(5)
    expect(nike.history.length).toBeLessThanOrEqual(7)
    expect(nike.marks.length).toBeGreaterThan(0)
    expect(nike.relationSlugs).toEqual(['adidas'])
  })

  it('Beziehungen zeigen nur auf Marken des Inhalts', () => {
    const slugs = new Set(brands.map(brand => brand.slug))
    for (const brand of brands) for (const slug of brand.relationSlugs) expect(slugs.has(slug)).toBe(true)
  })
})

describe('Launch-Inhalt: Quellen', () => {
  it('jedes Zitat da, ≤ 200 Zeichen; Fremdquellen mit Herausgeber und Datum', () => {
    for (const { where, source } of allSources) {
      expect(source.quote.trim(), where).not.toBe('')
      expect(source.quote.length, where).toBeLessThanOrEqual(INSIGHTS_QUOTE_MAX)
      expect(source.publisher, where).not.toBe('')
      expect(source.date, where).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('Wikipedia immer mit CC-BY-SA-Lizenz', () => {
    for (const { where, source } of allSources.filter(entry => entry.source.kind === 'wikipedia')) {
      expect(source.license, where).toContain('creativecommons.org/licenses/by-sa')
    }
  })

  it('keine Quelle von den Seiten, die der Prüfer nicht lesen darf (robots/Timeout)', () => {
    for (const { where, source } of allSources) {
      expect(new URL(source.url).hostname, where).not.toMatch(/adidas|about\.ikea\.com/)
    }
  })
})

describe('Launch-Inhalt: Beiträge', () => {
  it('ein Beitrag je Format', () => {
    expect(posts.map(post => post.format).sort()).toEqual(['article', 'duel', 'profile', 'ranking'])
  })

  it('parst gegen insightsPostSchema — Entwurf, deutsche Grundfassung, Übersetzung unredigiert', () => {
    for (const content of posts) {
      const post = buildPost(content)
      expect(post.state).toBe('draft')
      expect(post.baseLocale).toBe('de')
      expect(post.translationReviewed).toBe(false)
      expect(post.translatedAt).toBe('')
      expect(post.readingMinutes).toBeGreaterThan(0)
    }
  })

  it('beide Sprachen gefüllt: Titel, Vorspann, Text', () => {
    for (const post of posts) {
      for (const field of ['titleDe', 'titleEn', 'dekDe', 'dekEn', 'bodyDe', 'bodyEn'] as const) {
        expect(post[field].trim(), `${post.slug}.${field}`).not.toBe('')
      }
    }
  })

  it('die sechs Prüfregeln ohne Quelltexte: keine Treffer', () => {
    for (const content of posts) {
      expect(launchPostIssues(buildPost(content), brandRows), content.slug).toEqual([])
    }
  })

  it('Gegenprobe: der Namensfilter greift, sobald eine NICHT verwiesene Marke im Text steht', () => {
    const ikea = buildPost(posts.find(post => post.format === 'article')!)
    const flag = launchFlagText(ikea, brandRows)
    // Domain vor Name: `nike` ist zugleich ein Label von nike.com, das Gate
    // meldet dann `competitor_domain` — beides blockiert.
    expect(flag('Ähnlich wie bei Nike.')).toHaveLength(1)
    // Die Falle, um die der Artikel herumgeschrieben ist: ohne Leerzeichen
    // wird „von IKEA" zu `vonikea` — und darin steckt `nike`.
    expect(flag('ein Katalog von IKEA')).toHaveLength(1)
    expect(flag('ein Katalog, den IKEA druckte')).toHaveLength(1)
    expect(flag('der Katalog des Hauses')).toEqual([])
    expect(flag('Eine Liste, die billig wirkt.')).toEqual(['disparagement'])
  })

  it('kein Autorenname, keine Ich-Stimme (Wir-Stimme ohne Autor)', () => {
    for (const post of posts) {
      for (const text of [post.bodyDe, post.dekDe, post.titleDe]) {
        expect(text, post.slug).not.toMatch(/(?<!\p{L})(ich|mich|mir|mein|meine|meiner)(?!\p{L})/iu)
        expect(text, post.slug).not.toMatch(/\bDavid\b|Schubert/)
      }
      for (const text of [post.bodyEn, post.dekEn, post.titleEn]) {
        expect(text, post.slug).not.toMatch(/(?<!\p{L})(I|me|my|mine)(?!\p{L})/u)
      }
    }
  })

  it('jeder Beleg-Zeiger einer Faktenzeile zeigt auf eine Quelle', () => {
    for (const post of posts) {
      for (const fact of post.facts) {
        expect(fact.sourceIndex).toBeGreaterThanOrEqual(0)
        expect(fact.sourceIndex).toBeLessThan(post.sources.length)
      }
    }
  })

  it('jeder Beitrag verlinkt die Methodik — beim Ranking ist es Pflicht (Prüfregel 5)', () => {
    for (const post of posts) {
      expect(insightsMethodologyLinked(post), post.slug).toBe(true)
      expect(post.bodyDe).toContain(`](${INSIGHTS_METHODOLOGY_PATH})`)
      expect(post.bodyEn).toContain(`](${INSIGHTS_METHODOLOGY_PATH})`)
    }
  })

  it('Profil: Slug nike, verweist die Nike-Zeile mit libraryKey', () => {
    const profile = buildPost(posts.find(post => post.format === 'profile')!)
    expect(profile.slug).toBe('nike')
    expect(profile.brandRefs).toEqual([{ brandId: 'nike', checkId: '', libraryKey: 'nike', publicationId: '' }])
  })

  it('Duell: Slug alphabetisch, links steht die Marke, die im Slug vorne steht', () => {
    const duel = posts.find(post => post.format === 'duel')!
    expect(duel.slug).toBe(insightsDuelSlug('nike', 'adidas'))
    expect(duel.slug).toBe('adidas-vs-nike')
    expect(duel.brandSlugs).toEqual(['adidas', 'nike'])
    expect(duel.facts.length).toBeGreaterThanOrEqual(5)
    expect(duel.facts.length).toBeLessThanOrEqual(7)
    // Gegenprobe: ein falscher Slug wird gar nicht erst gebaut.
    expect(() => buildPost({ ...duel, slug: 'nike-vs-adidas' })).toThrow(/adidas-vs-nike/)
  })

  it('Artikel: 900–1400 Wörter in der Grundfassung, Kapitel als ##', () => {
    const article = posts.find(post => post.format === 'article')!
    const words = article.bodyDe.trim().split(/\s+/).length
    expect(words).toBeGreaterThanOrEqual(900)
    expect(words).toBeLessThanOrEqual(1400)
    expect(article.bodyDe.match(/^## /gm)?.length).toBeGreaterThanOrEqual(4)
    expect(article.brandSlugs).toEqual(['ikea'])
  })

  it('Ranking: die vier geprüften Marken, Begründung in beiden Sprachen, Hinweis auf Stufe 2', () => {
    const content = posts.find(post => post.format === 'ranking')!
    expect(content.ranking!.entries.map(entry => entry.brandSlug)).toEqual(['nike', 'apple', 'anthropic', 'the-barn'])
    const ranking = buildPost(content)
    expect(ranking.ranking!.entries.map(entry => entry.rank)).toEqual([1, 2, 3, 4])
    expect(ranking.noteInternal).toMatch(/Stufe 1/)
    for (const entry of ranking.ranking!.entries) {
      expect(entry.reasonDe).not.toBe('')
      expect(entry.reasonEn).not.toBe('')
    }
  })
})
