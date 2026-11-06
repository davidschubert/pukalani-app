import { describe, expect, it } from 'vitest'
import { BRAND_CHECK_CATEGORIES } from '../shared/brandCheck'
import { diffBrandChecks, latestBrandCheckDiff } from '../shared/brandCheckHistory'
import type { BrandCheckHistoryItem } from '../shared/types/brand'

/**
 * DIE GEGENÜBERSTELLUNG (BRAND-CHECK-SEITE §5).
 *
 * Zwei Aussagen tragen hier alles Übrige: sie vergleicht NIE über Quellgrenzen
 * hinweg (eine Website-78 und eine Dokument-78 messen Verschiedenes), und sie
 * verwechselt „nicht bewertbar" nie mit „null Punkte" — ein `+60` gegen ein
 * `null` wäre die überzeugendste falsche Zahl der ganzen Seite.
 */

function item(overrides: Partial<BrandCheckHistoryItem> & { id: string }): BrandCheckHistoryItem {
  return {
    source: 'website',
    score: 70,
    band: 'strong',
    createdAt: '2026-09-01T10:00:00.000Z',
    categories: BRAND_CHECK_CATEGORIES.map(category => ({ id: category.key, score: 50 })),
    ...overrides,
  }
}

function withCategory(base: BrandCheckHistoryItem, key: string, score: number | null): BrandCheckHistoryItem {
  return {
    ...base,
    categories: base.categories.map(entry => (entry.id === key ? { id: key, score } : entry)),
  }
}

describe('diffBrandChecks', () => {
  it('rechnet Gesamt-Delta und je Kategorie — besser, schlechter, gleich', () => {
    const previous = item({ id: 'p', score: 60 })
    let latest = item({ id: 'l', score: 72, createdAt: '2026-09-05T10:00:00.000Z' })
    latest = withCategory(latest, 'distinctiveness', 80)
    latest = withCategory(latest, 'craft', 30)

    const diff = diffBrandChecks(latest, previous)!

    expect(diff.delta).toBe(12)
    expect(diff.latestId).toBe('l')
    expect(diff.previousId).toBe('p')

    const byId = new Map(diff.categories.map(entry => [entry.id, entry]))
    expect(byId.get('distinctiveness')).toMatchObject({ previous: 50, latest: 80, delta: 30, trend: 'up' })
    expect(byId.get('craft')).toMatchObject({ previous: 50, latest: 30, delta: -20, trend: 'down' })
    expect(byId.get('consistency')).toMatchObject({ delta: 0, trend: 'same' })
  })

  it('gibt IMMER acht Zeilen in Katalog-Reihenfolge — auch wenn eine Zeile Kategorien vermisst', () => {
    const previous = item({ id: 'p', categories: [] })
    const diff = diffBrandChecks(item({ id: 'l' }), previous)!

    expect(diff.categories.map(entry => entry.id))
      .toEqual(BRAND_CHECK_CATEGORIES.map(category => category.key))
  })

  it('vorher nicht bewertbar, jetzt eine Zahl ⇒ `new` ohne Delta (kein erfundenes Plus)', () => {
    const previous = withCategory(item({ id: 'p' }), 'visual', null)
    const latest = withCategory(item({ id: 'l' }), 'visual', 60)

    const row = diffBrandChecks(latest, previous)!.categories.find(entry => entry.id === 'visual')!
    expect(row).toMatchObject({ previous: null, latest: 60, delta: null, trend: 'new' })
  })

  it('jetzt nicht bewertbar ⇒ KEIN Absturz: `same` ohne Delta', () => {
    const previous = item({ id: 'p' })
    const latest = withCategory(item({ id: 'l' }), 'visual', null)

    const row = diffBrandChecks(latest, previous)!.categories.find(entry => entry.id === 'visual')!
    expect(row).toMatchObject({ previous: 50, latest: null, delta: null, trend: 'same' })
  })

  it('beide nicht bewertbar ⇒ `same`, und `delta: null` ist NICHT dasselbe wie 0', () => {
    const previous = withCategory(item({ id: 'p' }), 'visual', null)
    const latest = withCategory(item({ id: 'l' }), 'visual', null)

    const row = diffBrandChecks(latest, previous)!.categories.find(entry => entry.id === 'visual')!
    expect(row.trend).toBe('same')
    expect(row.delta).toBeNull()
    // Die Gegenprobe: eine gemessene Gleichheit hat eine 0.
    const measured = diffBrandChecks(item({ id: 'l' }), item({ id: 'p' }))!
      .categories.find(entry => entry.id === 'visual')!
    expect(measured.delta).toBe(0)
  })

  it('ohne Vorgänger gibt es nichts gegenüberzustellen', () => {
    expect(diffBrandChecks(item({ id: 'l' }), null)).toBeNull()
    expect(diffBrandChecks(item({ id: 'l' }), undefined)).toBeNull()
    expect(diffBrandChecks(null, item({ id: 'p' }))).toBeNull()
  })

  it('VERWEIGERT den Vergleich über Quellgrenzen hinweg', () => {
    const website = item({ id: 'l', source: 'website', score: 72 })
    const document = item({ id: 'p', source: 'document', score: 60 })
    expect(diffBrandChecks(website, document)).toBeNull()
  })
})

describe('latestBrandCheckDiff', () => {
  it('nimmt die zwei jüngsten Einträge DER QUELLE des jüngsten Eintrags', () => {
    const items = [
      item({ id: 'd2', source: 'document', score: 40, createdAt: '2026-09-05T12:00:00.000Z' }),
      item({ id: 'w2', source: 'website', score: 80, createdAt: '2026-09-04T12:00:00.000Z' }),
      item({ id: 'd1', source: 'document', score: 30, createdAt: '2026-09-03T12:00:00.000Z' }),
      item({ id: 'w1', source: 'website', score: 70, createdAt: '2026-09-02T12:00:00.000Z' }),
    ]

    const diff = latestBrandCheckDiff(items)!
    expect(diff.source).toBe('document')
    expect([diff.latestId, diff.previousId]).toEqual(['d2', 'd1'])
    expect(diff.delta).toBe(10)
  })

  it('nur EIN Stand dieser Quelle ⇒ nichts, auch wenn die andere Quelle zwei hat', () => {
    const items = [
      item({ id: 'd1', source: 'document', createdAt: '2026-09-05T12:00:00.000Z' }),
      item({ id: 'w2', source: 'website', createdAt: '2026-09-04T12:00:00.000Z' }),
      item({ id: 'w1', source: 'website', createdAt: '2026-09-02T12:00:00.000Z' }),
    ]
    expect(latestBrandCheckDiff(items)).toBeNull()
  })

  it('leerer Verlauf ⇒ nichts', () => {
    expect(latestBrandCheckDiff([])).toBeNull()
  })
})
