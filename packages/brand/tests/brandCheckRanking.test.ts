import { describe, expect, it } from 'vitest'
import { BRAND_CHECK_CATEGORIES, BRAND_SCORE_BANDS, brandScoreBand } from '../shared/brandCheck'
import {
  BRAND_CHECK_RANKING_DEFAULT_SORT,
  BRAND_CHECK_RANKING_PAGE_MAX,
  BRAND_CHECK_RANKING_PAGE_SIZE,
  BRAND_CHECK_RANKING_SORTS,
  filterBrandCheckRankingItems,
  isBrandCheckRankingSort,
  normalizeBrandCheckRankingPage,
  normalizeBrandCheckRankingSort,
  paginateBrandCheckRankingItems,
  pickLatestPerUrlKey,
  sortBrandCheckRankingItems,
} from '../shared/brandCheckRanking'
import {
  BRAND_INDUSTRIES,
  BRAND_INDUSTRY_UNKNOWN,
  BRAND_INDUSTRY_VALUES,
  brandIndustryPromptList,
  isBrandIndustryValue,
  normalizeBrandIndustry,
} from '../shared/brandIndustries'
import type { BrandCheckRankingItem } from '../shared/types/brand'

/**
 * DIE AUSWAHL-REGELN DES ÖFFENTLICHEN RANKINGS.
 *
 * Sie sind die einzigen Stellen, an denen eine Rangliste über FREMDE
 * Auftritte falsch werden kann — und sie hängen an keiner Ablage, also lassen
 * sie sich hier vollständig nageln:
 *
 *  1. Je Adresse gilt der JÜNGSTE Check. Ein veralteter Wert über eine fremde
 *     Marke wäre der eigentliche Schaden (§3 „Recht").
 *  2. „Nicht bewertbar" ist keine schwache Kategorie: bei einer
 *     Kategorie-Bestenliste stehen solche Zeilen HINTEN, nicht bei den Nullen.
 *  3. Die Reihenfolge ist deterministisch — sonst zeigte Seite 2 Zeilen, die
 *     auf Seite 1 schon standen.
 *  4. Alles aus der Adresszeile wird auf einen gültigen Wert GEZOGEN, nie mit
 *     einem 400 beantwortet.
 */

function item(overrides: Partial<BrandCheckRankingItem> = {}): BrandCheckRankingItem {
  return {
    id: 'c1',
    host: 'kailua.coffee',
    score: 70,
    band: 'strong',
    industry: 'food',
    source: 'website',
    createdAt: '2026-09-01T10:00:00.000Z',
    categories: [{ id: 'consistency', score: 50 }],
    ...overrides,
  }
}

describe('pickLatestPerUrlKey', () => {
  it('behält je Adresse den jüngsten Check', () => {
    const rows = [
      { urlKey: 'a.de', createdAt: '2026-09-03T00:00:00.000Z', id: 'neu' },
      { urlKey: 'a.de', createdAt: '2026-08-01T00:00:00.000Z', id: 'alt' },
      { urlKey: 'b.de', createdAt: '2026-08-15T00:00:00.000Z', id: 'b' },
    ]
    expect(pickLatestPerUrlKey(rows).map(row => row.id)).toEqual(['neu', 'b'])
  })

  it('gilt auch, wenn der ältere ZUERST kommt — die Regel liest nicht die Reihenfolge', () => {
    const rows = [
      { urlKey: 'a.de', createdAt: '2026-08-01T00:00:00.000Z', id: 'alt' },
      { urlKey: 'a.de', createdAt: '2026-09-03T00:00:00.000Z', id: 'neu' },
    ]
    expect(pickLatestPerUrlKey(rows).map(row => row.id)).toEqual(['neu'])
  })

  it('bei gleichem Zeitstempel gewinnt der zuerst gelesene', () => {
    const rows = [
      { urlKey: 'a.de', createdAt: '2026-09-03T00:00:00.000Z', id: 'erster' },
      { urlKey: 'a.de', createdAt: '2026-09-03T00:00:00.000Z', id: 'zweiter' },
    ]
    expect(pickLatestPerUrlKey(rows).map(row => row.id)).toEqual(['erster'])
  })

  it('leere Eingabe ⇒ leere Ausgabe, ohne Wurf', () => {
    expect(pickLatestPerUrlKey([])).toEqual([])
  })
})

describe('filterBrandCheckRankingItems', () => {
  const items = [
    item({ id: 'a', industry: 'food', band: 'strong' }),
    item({ id: 'b', industry: 'agency', band: 'strong' }),
    item({ id: 'c', industry: 'agency', band: 'weak' }),
  ]

  it('leerer Filter lässt alles durch', () => {
    expect(filterBrandCheckRankingItems(items, {})).toHaveLength(3)
    expect(filterBrandCheckRankingItems(items, { industry: '', band: '' })).toHaveLength(3)
  })

  it('filtert Branche und Band, und beides zusammen', () => {
    expect(filterBrandCheckRankingItems(items, { industry: 'agency' }).map(x => x.id)).toEqual(['b', 'c'])
    expect(filterBrandCheckRankingItems(items, { band: 'weak' }).map(x => x.id)).toEqual(['c'])
    expect(filterBrandCheckRankingItems(items, { industry: 'agency', band: 'strong' }).map(x => x.id))
      .toEqual(['b'])
  })

  it('vergleicht EXAKT — ein Teilstring holt nicht die halbe Liste', () => {
    expect(filterBrandCheckRankingItems(items, { band: 'w' })).toEqual([])
    expect(filterBrandCheckRankingItems(items, { industry: 'agenc' })).toEqual([])
  })
})

describe('sortBrandCheckRankingItems', () => {
  it('nach Punkten, absteigend', () => {
    const items = [item({ id: 'a', score: 40 }), item({ id: 'b', score: 90 })]
    expect(sortBrandCheckRankingItems(items, 'score').map(x => x.id)).toEqual(['b', 'a'])
  })

  it('nach Datum, jüngster zuerst', () => {
    const items = [
      item({ id: 'alt', createdAt: '2026-01-01T00:00:00.000Z' }),
      item({ id: 'neu', createdAt: '2026-09-01T00:00:00.000Z' }),
    ]
    expect(sortBrandCheckRankingItems(items, 'date').map(x => x.id)).toEqual(['neu', 'alt'])
  })

  it('nach EINER Kategorie — „die Besten in Konsistenz"', () => {
    const items = [
      item({ id: 'mittel', categories: [{ id: 'consistency', score: 50 }] }),
      item({ id: 'best', categories: [{ id: 'consistency', score: 100 }] }),
      item({ id: 'schwach', categories: [{ id: 'consistency', score: 10 }] }),
    ]
    expect(sortBrandCheckRankingItems(items, 'consistency').map(x => x.id))
      .toEqual(['best', 'mittel', 'schwach'])
  })

  it('NICHT BEWERTBAR steht hinten — nicht bei den Nullen', () => {
    const items = [
      item({ id: 'null', categories: [{ id: 'consistency', score: null }] }),
      item({ id: 'nullpunkte', categories: [{ id: 'consistency', score: 0 }] }),
      item({ id: 'gut', categories: [{ id: 'consistency', score: 80 }] }),
    ]
    // Die Zeile OHNE Messung landet hinter der Zeile mit null PUNKTEN: eine
    // Kategorie, die wir nicht ansehen konnten, ist keine schwache Kategorie.
    expect(sortBrandCheckRankingItems(items, 'consistency').map(x => x.id))
      .toEqual(['gut', 'nullpunkte', 'null'])
  })

  it('eine Zeile ohne diese Kategorie zählt wie „nicht bewertbar"', () => {
    const items = [
      item({ id: 'ohne', categories: [] }),
      item({ id: 'mit', categories: [{ id: 'consistency', score: 20 }] }),
    ]
    expect(sortBrandCheckRankingItems(items, 'consistency').map(x => x.id)).toEqual(['mit', 'ohne'])
  })

  it('gleiche Werte ⇒ jüngerer zuerst, dann Host — deterministisch', () => {
    const items = [
      item({ id: 'z', host: 'zebra.de', score: 70, createdAt: '2026-01-01T00:00:00.000Z' }),
      item({ id: 'a', host: 'apfel.de', score: 70, createdAt: '2026-01-01T00:00:00.000Z' }),
      item({ id: 'n', host: 'neu.de', score: 70, createdAt: '2026-09-01T00:00:00.000Z' }),
    ]
    expect(sortBrandCheckRankingItems(items, 'score').map(x => x.id)).toEqual(['n', 'a', 'z'])
    // Zweimal dieselbe Eingabe ⇒ zweimal dieselbe Ausgabe.
    expect(sortBrandCheckRankingItems(items, 'score').map(x => x.id))
      .toEqual(sortBrandCheckRankingItems([...items].reverse(), 'score').map(x => x.id))
  })

  it('rührt die Eingabe nicht an', () => {
    const items = [item({ id: 'a', score: 10 }), item({ id: 'b', score: 90 })]
    sortBrandCheckRankingItems(items, 'score')
    expect(items.map(x => x.id)).toEqual(['a', 'b'])
  })
})

describe('paginateBrandCheckRankingItems', () => {
  const items = Array.from({ length: 60 }, (_, index) => item({ id: `c${index}` }))

  it('schneidet 1-basiert', () => {
    expect(paginateBrandCheckRankingItems(items, 1)[0]?.id).toBe('c0')
    expect(paginateBrandCheckRankingItems(items, 2)[0]?.id).toBe(`c${BRAND_CHECK_RANKING_PAGE_SIZE}`)
    expect(paginateBrandCheckRankingItems(items, 1)).toHaveLength(BRAND_CHECK_RANKING_PAGE_SIZE)
  })

  it('eine Seite hinter dem Ende ist LEER und kein Fehler', () => {
    expect(paginateBrandCheckRankingItems(items, 99)).toEqual([])
  })
})

describe('normalizeBrandCheckRankingSort', () => {
  it('kennt Punkte, Datum und JEDE Kategorie des Katalogs', () => {
    expect(BRAND_CHECK_RANKING_SORTS).toContain('score')
    expect(BRAND_CHECK_RANKING_SORTS).toContain('date')
    for (const category of BRAND_CHECK_CATEGORIES) {
      expect(isBrandCheckRankingSort(category.key), category.key).toBe(true)
    }
    expect(BRAND_CHECK_RANKING_SORTS).toHaveLength(BRAND_CHECK_CATEGORIES.length + 2)
  })

  it('zieht Unbekanntes auf den Standard, statt zu werfen', () => {
    for (const value of ['quatsch', '', null, undefined, 7]) {
      expect(normalizeBrandCheckRankingSort(value)).toBe(BRAND_CHECK_RANKING_DEFAULT_SORT)
    }
  })
})

describe('normalizeBrandCheckRankingPage', () => {
  it('nimmt Zahlen und Zeichenketten', () => {
    expect(normalizeBrandCheckRankingPage(3)).toBe(3)
    expect(normalizeBrandCheckRankingPage('3')).toBe(3)
  })

  it('zieht alles Unlesbare auf 1 — ein leeres Feld ist kein Fehler', () => {
    for (const value of ['', undefined, null, 'abc', 0, -5, Number.NaN]) {
      expect(normalizeBrandCheckRankingPage(value), String(value)).toBe(1)
    }
  })

  it('deckelt auf das Lesefenster', () => {
    expect(normalizeBrandCheckRankingPage(99_999)).toBe(BRAND_CHECK_RANKING_PAGE_MAX)
    expect(BRAND_CHECK_RANKING_PAGE_MAX).toBeGreaterThan(1)
  })
})

/**
 * DIE BÄNDER-LISTE MUSS ZUR RECHNUNG PASSEN — sie ist der Filter des Rankings,
 * und ein Band, das `brandScoreBand()` vergibt, aber die Liste nicht kennt,
 * wäre ein Filter, der einen ganzen Reifegrad unsichtbar macht.
 */
describe('BRAND_SCORE_BANDS', () => {
  it('deckt jedes Band ab, das die Rechnung vergeben kann', () => {
    const vergeben = new Set(Array.from({ length: 101 }, (_, score) => brandScoreBand(score)))
    expect([...vergeben].sort()).toEqual([...BRAND_SCORE_BANDS].sort())
  })
})

/**
 * DER BRANCHEN-KATALOG. Die Ids stehen in gespeicherten Zeilen UND in
 * Adresszeilen — sie sind ein Vertrag, kein Geschmack.
 */
describe('brandIndustries', () => {
  it('hat sechzehn Branchen plus `unknown`, alle eindeutig und kleingeschrieben', () => {
    expect(BRAND_INDUSTRIES).toHaveLength(16)
    expect(BRAND_INDUSTRY_VALUES).toHaveLength(17)
    expect(new Set(BRAND_INDUSTRY_VALUES).size).toBe(BRAND_INDUSTRY_VALUES.length)
    for (const id of BRAND_INDUSTRY_VALUES) expect(id, id).toMatch(/^[a-z]+$/)
  })

  it('`other` und `unknown` sind ZWEI Aussagen und werden nicht zusammengelegt', () => {
    expect(BRAND_INDUSTRIES).toContain('other')
    expect(BRAND_INDUSTRIES as readonly string[]).not.toContain(BRAND_INDUSTRY_UNKNOWN)
    expect(BRAND_INDUSTRY_VALUES).toContain(BRAND_INDUSTRY_UNKNOWN)
  })

  it('normalisiert Schreibweisen und macht aus allem Fremden `unknown`', () => {
    expect(normalizeBrandIndustry(' Agency ')).toBe('agency')
    expect(normalizeBrandIndustry('AGENCY')).toBe('agency')
    for (const value of ['agentur', '', null, undefined, 3, ['agency']]) {
      expect(normalizeBrandIndustry(value), String(value)).toBe(BRAND_INDUSTRY_UNKNOWN)
    }
  })

  it('`isBrandIndustryValue` ist die Prüfung, die Schema und Annahme teilen', () => {
    expect(isBrandIndustryValue('craft')).toBe(true)
    expect(isBrandIndustryValue(BRAND_INDUSTRY_UNKNOWN)).toBe(true)
    expect(isBrandIndustryValue('Craft')).toBe(false)
    expect(isBrandIndustryValue(7)).toBe(false)
  })

  it('die Prompt-Liste wird AUS dem Katalog gebaut — keine zweite Liste', () => {
    const list = brandIndustryPromptList()
    for (const id of BRAND_INDUSTRY_VALUES) expect(list, id).toContain(`- ${id}`)
    expect(list.split('\n')).toHaveLength(BRAND_INDUSTRY_VALUES.length)
  })
})
