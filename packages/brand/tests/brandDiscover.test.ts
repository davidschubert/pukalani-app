import { describe, expect, it } from 'vitest'
import {
  BRAND_DISCOVER_PAGE_MAX,
  BRAND_DISCOVER_PAGE_SIZE,
  brandDiscoverOgPath,
  discoverPurposeLine,
  discoverScoreOf,
  discoverVoiceLine,
  filterDiscoverItems,
  normalizeBrandDiscoverArchetype,
  normalizeBrandDiscoverIndustry,
  normalizeBrandDiscoverPage,
  normalizeBrandDiscoverPalette,
  normalizeBrandDiscoverPathKind,
  normalizeBrandDiscoverSort,
  paginateDiscoverItems,
  pickDiscoverFeatured,
  pickDiscoverScores,
  similarDiscoverEntries,
  sortDiscoverItems,
} from '../shared/brandDiscover'
import type { BrandFoundationView } from '../shared/brandFoundation'
import type { BrandDiscoverItem } from '../shared/types/brand'

/**
 * DIE REGELN DER GALERIE (docs/plans/DISCOVER-BRANDS.md §4.1/§4.2, Davids
 * Entscheidungen 5, 6 und 8) — pur geprüft, ohne Server.
 *
 * Fünf Aussagen, die man beim Umbauen still kaputt macht:
 *  1. Der Ring zeigt den BRAND SCORE, wo es ihn gibt — die Fundament-Reife
 *     steht daneben und wandert nur dann hinein, wenn es keinen Auftritt gibt.
 *  2. Eine Marke OHNE die gefragte Zahl steht am ENDE, nicht bei null.
 *  3. Brand of the Day ist GENAU EINE: die mit dem jüngsten `featuredAt`.
 *  4. „Ähnliche Marken" nennt niemanden zweimal und nie sich selbst; der
 *     stärkere Grund (Archetyp) gewinnt.
 *  5. Jede Facette wird gegen ihren KATALOG gemessen — ein Tippfehler in einer
 *     weitergeschickten Adresse zeigt die Galerie, nicht eine leere Wand.
 */

function item(overrides: Partial<BrandDiscoverItem> = {}): BrandDiscoverItem {
  return {
    slug: 'kailua-coffee',
    title: 'Kailua Coffee Co.',
    pathKind: 'new',
    industry: 'food',
    archetype: 'sage',
    archetypeSecondary: 'creator',
    paletteId: 'bread',
    locale: 'en',
    publishedAt: '2026-09-05T10:00:00.000Z',
    example: false,
    featured: false,
    score: { kind: 'website', value: 87, band: 'strong' },
    secondary: null,
    ...overrides,
  }
}

describe('Discover: welche Zahl in den Ring kommt (Entscheidung 5)', () => {
  it('Website schlägt Dokument — die Reife wird zur Zweitzeile', () => {
    const picked = pickDiscoverScores([
      { kind: 'document', value: 78, band: 'solid' },
      { kind: 'website', value: 87, band: 'strong' },
    ])
    expect(picked.score).toEqual({ kind: 'website', value: 87, band: 'strong' })
    expect(picked.secondary).toEqual({ kind: 'document', value: 78 })
  })

  it('ohne Auftritts-Prüfung wandert die Reife SELBST in den Ring', () => {
    const picked = pickDiscoverScores([{ kind: 'document', value: 92, band: 'strong' }])
    expect(picked.score).toEqual({ kind: 'document', value: 92, band: 'strong' })
    // Keine Zweitzeile: es gibt keine zweite Messung, und dieselbe Zahl zweimal
    // zu zeigen wäre die Behauptung, es seien zwei.
    expect(picked.secondary).toBeNull()
  })

  it('ein Fehllauf ist keine Zahl — 0 heisst „nichts war bewertbar"', () => {
    expect(pickDiscoverScores([{ kind: 'website', value: 0, band: '' }])).toEqual({
      score: null,
      secondary: null,
    })
    expect(pickDiscoverScores([])).toEqual({ score: null, secondary: null })
  })

  it('liest eine Art in BEIDEN Feldern nach', () => {
    const both = item({ secondary: { kind: 'document', value: 78 } })
    expect(discoverScoreOf(both, 'website')).toBe(87)
    expect(discoverScoreOf(both, 'document')).toBe(78)

    const onlyDoc = item({ score: { kind: 'document', value: 61, band: 'fair' }, secondary: null })
    expect(discoverScoreOf(onlyDoc, 'document')).toBe(61)
    expect(discoverScoreOf(onlyDoc, 'website')).toBeNull()
  })
})

describe('Discover: sortieren', () => {
  it('„Neueste" ordnet nach dem Veröffentlichungsdatum, Slug als Tiebreak', () => {
    const sorted = sortDiscoverItems([
      item({ slug: 'b', publishedAt: '2026-09-01T00:00:00.000Z' }),
      item({ slug: 'a', publishedAt: '2026-09-07T00:00:00.000Z' }),
      item({ slug: 'c', publishedAt: '2026-09-07T00:00:00.000Z' }),
    ], 'newest')
    expect(sorted.map(entry => entry.slug)).toEqual(['a', 'c', 'b'])
  })

  it('„Brand Score" ordnet nach der WEBSITE-Zahl — ohne sie steht man hinten', () => {
    const sorted = sortDiscoverItems([
      item({ slug: 'ohne', score: null }),
      item({ slug: 'mittel', score: { kind: 'website', value: 71, band: 'solid' } }),
      // Eine hohe REIFE ist keine hohe Website-Zahl: diese Kachel hat für
      // diese Sortierung gar keinen Wert und gehört ans Ende.
      item({ slug: 'nur-reife', score: { kind: 'document', value: 99, band: 'strong' } }),
      item({ slug: 'hoch', score: { kind: 'website', value: 90, band: 'strong' } }),
    ], 'score')
    // Die beiden ohne Website-Zahl stehen GESCHLOSSEN hinten; untereinander
    // entscheidet der übliche Tiebreak (gleiches Datum ⇒ Slug alphabetisch).
    expect(sorted.map(entry => entry.slug)).toEqual(['hoch', 'mittel', 'nur-reife', 'ohne'])
  })

  it('„Fundament-Reife" findet die Zahl AUCH in der Zweitzeile', () => {
    const sorted = sortDiscoverItems([
      item({ slug: 'zweitzeile', secondary: { kind: 'document', value: 95 } }),
      item({ slug: 'im-ring', score: { kind: 'document', value: 60, band: 'fair' } }),
      item({ slug: 'ohne', score: null }),
    ], 'maturity')
    expect(sorted.map(entry => entry.slug)).toEqual(['zweitzeile', 'im-ring', 'ohne'])
  })
})

describe('Discover: blättern', () => {
  it('schneidet 1-basiert und liefert jenseits des Endes eine leere Seite', () => {
    const items = Array.from({ length: 30 }, (_, index) => item({ slug: `s${index}` }))
    expect(paginateDiscoverItems(items, 1)).toHaveLength(BRAND_DISCOVER_PAGE_SIZE)
    expect(paginateDiscoverItems(items, 2)).toHaveLength(5)
    expect(paginateDiscoverItems(items, 9)).toEqual([])
  })
})

describe('Discover: Brand of the Day (Entscheidung 6)', () => {
  it('nimmt die mit dem JÜNGSTEN featuredAt — genau eine', () => {
    const picked = pickDiscoverFeatured([
      { slug: 'alt', featuredAt: '2026-09-01T00:00:00.000Z' },
      { slug: 'neu', featuredAt: '2026-09-06T00:00:00.000Z' },
      { slug: 'keins', featuredAt: null },
    ])
    expect(picked?.slug).toBe('neu')
  })

  it('leere, fehlende und unlesbare Daten zählen NICHT', () => {
    expect(pickDiscoverFeatured([{ featuredAt: '' }, { featuredAt: null }, {}])).toBeNull()
    expect(pickDiscoverFeatured([{ featuredAt: 'demnächst' }])).toBeNull()
    expect(pickDiscoverFeatured([])).toBeNull()
  })
})

describe('Discover: ähnliche Marken (§4.2)', () => {
  const current = item({ slug: 'kailua', archetype: 'sage', paletteId: 'bread', industry: 'food' })

  it('Archetyp zuerst, dann Farbwelt, dann Branche (D4)', () => {
    const similar = similarDiscoverEntries(current, [
      item({ slug: 'branche', archetype: 'ruler', paletteId: 'moss', industry: 'food' }),
      item({ slug: 'farbe', archetype: 'ruler', paletteId: 'bread', industry: 'agency' }),
      item({ slug: 'archetyp', archetype: 'sage', paletteId: 'moss', industry: 'agency' }),
    ])
    expect(similar).toEqual([
      { slug: 'archetyp', title: 'Kailua Coffee Co.', paletteId: 'moss', reason: 'archetype' },
      { slug: 'farbe', title: 'Kailua Coffee Co.', paletteId: 'bread', reason: 'palette' },
      { slug: 'branche', title: 'Kailua Coffee Co.', paletteId: 'moss', reason: 'industry' },
    ])
  })

  it('nennt sich selbst nie und jede Marke nur einmal — mit dem stärkeren Grund', () => {
    const similar = similarDiscoverEntries(current, [
      current,
      item({ slug: 'beides', archetype: 'sage', paletteId: 'bread' }),
    ])
    expect(similar).toEqual([
      { slug: 'beides', title: 'Kailua Coffee Co.', paletteId: 'bread', reason: 'archetype' },
    ])
  })

  it('eine Marke mit gleicher Branche UND gleicher Farbwelt steht einmal da — als „palette"', () => {
    const similar = similarDiscoverEntries(current, [
      item({ slug: 'beides', archetype: 'ruler', paletteId: 'bread', industry: 'food' }),
    ])
    expect(similar).toEqual([
      { slug: 'beides', title: 'Kailua Coffee Co.', paletteId: 'bread', reason: 'palette' },
    ])
  })

  it('`unknown` ist keine Branche und damit kein gemeinsamer Nenner', () => {
    // „unknown" heisst „ging aus dem Auftritt nicht hervor" (brandIndustries.ts)
    // und ist zugleich der Vorgabewert von `toDiscoverItem` — wäre es ein
    // Nenner, wäre in einer jungen Galerie jede Marke jeder anderen ähnlich.
    const unknownCurrent = item({ slug: 'ohne-branche', archetype: '', paletteId: '', industry: 'unknown' })
    expect(similarDiscoverEntries(unknownCurrent, [
      item({ slug: 'auch-ohne', archetype: '', paletteId: '', industry: 'unknown' }),
    ])).toEqual([])
  })

  it('hält den Deckel und macht aus einem LEEREN Archetyp keinen Nenner', () => {
    const candidates = Array.from({ length: 8 }, (_, index) =>
      item({ slug: `s${index}`, archetype: 'sage', paletteId: 'moss' }))
    expect(similarDiscoverEntries(current, candidates)).toHaveLength(4)

    // Auch die Branche darf den Deckel nicht sprengen: acht Kandidaten teilen
    // NUR sie, vier kommen an.
    const onlyIndustry = Array.from({ length: 8 }, (_, index) =>
      item({ slug: `i${index}`, archetype: 'ruler', paletteId: 'moss', industry: 'food' }))
    expect(similarDiscoverEntries(current, onlyIndustry)).toHaveLength(4)

    const nameless = item({ slug: 'ohne', archetype: '', paletteId: '', industry: '' })
    expect(similarDiscoverEntries(nameless, [
      item({ slug: 'x', archetype: '', paletteId: '', industry: '' }),
    ])).toEqual([])
  })
})

describe('Discover: der Pfad des Vorschaubilds (D4)', () => {
  it('EINE Wahrheit für Seite und Route', () => {
    expect(brandDiscoverOgPath('kailua-coffee-co')).toBe('/og/discover/kailua-coffee-co.png')
    // Grossschreibung in einem weitergeschickten Link ist eine Bedienspur,
    // kein Angriff — sie führt auf denselben Pfad.
    expect(brandDiscoverOgPath('  Kailua-Coffee-Co ')).toBe('/og/discover/kailua-coffee-co.png')
  })

  it('was nicht wie ein Slug aussieht, bekommt KEINEN Pfad', () => {
    // Der Dateiname der Ablage darf nie aus roher Eingabe entstehen — deshalb
    // hört die Kette schon hier auf, nicht erst beim Escapen.
    for (const bad of ['', '   ', '../../etc/passwd', 'a/b', '-führend', 'x'.repeat(200)]) {
      expect(brandDiscoverOgPath(bad)).toBe('')
    }
  })
})

describe('Discover: filtern', () => {
  const items = [
    item({ slug: 'a', pathKind: 'new', archetype: 'sage', paletteId: 'bread', industry: 'food' }),
    item({ slug: 'b', pathKind: 'relaunch', archetype: 'creator', paletteId: 'moss', industry: 'agency' }),
  ]

  it('leere Facetten schränken nicht ein', () => {
    expect(filterDiscoverItems(items, {}).map(entry => entry.slug)).toEqual(['a', 'b'])
  })

  it('filtert je Achse exakt und kombiniert mit UND', () => {
    expect(filterDiscoverItems(items, { path: 'relaunch' }).map(entry => entry.slug)).toEqual(['b'])
    expect(filterDiscoverItems(items, { palette: 'bread' }).map(entry => entry.slug)).toEqual(['a'])
    expect(filterDiscoverItems(items, { path: 'new', industry: 'agency' })).toEqual([])
  })

  it('der ZWEITE Archetyp ist keine Facette', () => {
    // `a` trägt `creator` als Rest — gesucht sind Marken, die es SIND.
    expect(filterDiscoverItems(items, { archetype: 'creator' }).map(entry => entry.slug)).toEqual(['b'])
  })
})

describe('Discover: die Adresszeile ist Eingabe, kein Vertrag', () => {
  it('misst jede Facette gegen ihren Katalog', () => {
    expect(normalizeBrandDiscoverPathKind('Relaunch')).toBe('relaunch')
    expect(normalizeBrandDiscoverPathKind('rebrand')).toBe('')
    expect(normalizeBrandDiscoverArchetype('SAGE')).toBe('sage')
    expect(normalizeBrandDiscoverArchetype('der-weise')).toBe('')
    expect(normalizeBrandDiscoverPalette('bread')).toBe('bread')
    expect(normalizeBrandDiscoverPalette('lila')).toBe('')
    expect(normalizeBrandDiscoverIndustry('food')).toBe('food')
    expect(normalizeBrandDiscoverIndustry('kaffee')).toBe('')
    // `unknown` IST ein Spaltenwert und damit eine gültige Facette.
    expect(normalizeBrandDiscoverIndustry('unknown')).toBe('unknown')
  })

  it('zieht Sortierung und Seite auf gültige Werte', () => {
    expect(normalizeBrandDiscoverSort('maturity')).toBe('maturity')
    expect(normalizeBrandDiscoverSort('beliebteste')).toBe('newest')
    expect(normalizeBrandDiscoverPage('3')).toBe(3)
    expect(normalizeBrandDiscoverPage('-2')).toBe(1)
    expect(normalizeBrandDiscoverPage('nein')).toBe(1)
    expect(normalizeBrandDiscoverPage(99999)).toBe(BRAND_DISCOVER_PAGE_MAX)
  })
})

describe('Discover: zwei Zeilen aus dem Fundament', () => {
  const foundation = {
    chapters: [
      {
        id: 'story',
        anchor: 'story',
        titleKey: 'x',
        state: 'done',
        blocks: [{ kind: 'lead', text: 'Die Herkunft.' }],
      },
      {
        id: 'purpose',
        anchor: 'purpose',
        titleKey: 'x',
        state: 'done',
        blocks: [{ kind: 'lead', text: 'Damit Menschen einen ruhigen Moment bekommen.' }],
      },
      {
        id: 'stimme',
        anchor: 'stimme',
        titleKey: 'x',
        state: 'done',
        blocks: [{
          kind: 'chips',
          items: [
            { word: 'ruhig', sample: '' },
            { word: 'fundiert', sample: '' },
            { word: 'gerade heraus', sample: '' },
            { word: 'nah', sample: '' },
            { word: 'zu viel', sample: '' },
          ],
        }],
      },
    ],
  } as unknown as BrandFoundationView

  it('nimmt den Leitsatz des Purpose-Kapitels, nicht den ersten überhaupt', () => {
    expect(discoverPurposeLine(foundation)).toBe('Damit Menschen einen ruhigen Moment bekommen.')
  })

  it('nennt höchstens vier Ton-Wörter', () => {
    expect(discoverVoiceLine(foundation)).toBe('ruhig, fundiert, gerade heraus, nah')
  })

  it('erfindet nichts: ohne Kapitel bleiben beide Zeilen leer', () => {
    expect(discoverPurposeLine(null)).toBe('')
    expect(discoverVoiceLine(null)).toBe('')
    expect(discoverVoiceLine({ chapters: [] } as unknown as BrandFoundationView)).toBe('')
  })
})
