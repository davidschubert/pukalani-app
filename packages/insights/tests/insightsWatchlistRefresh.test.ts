import { beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshInsightsWatchlist } from '../server/utils/insightsWatchlistAdmin'
import { INSIGHTS_WATCHLIST_TABLE } from '../shared/insightsRows'

/**
 * DER TÄGLICHE NACHTRAG AN DIE FUNDSTÜCKE (BI2 K4).
 *
 * ── WARUM GENAU DIESER WEG EINEN TEST BRAUCHT ───────────────────────────
 * Er ist die einzige Stelle im Layer, an der ein automatischer Lauf in eine
 * Tabelle schreibt, die einem MENSCHEN gehört. Geht die Trennlinie verloren,
 * überschreibt der Lauf Urteil, Notiz oder Cluster — und das ist genau das,
 * wofür die Liste gebaut wurde. Ein Typ hält diese Zusage nicht: `data` ist
 * ein `Record<string, unknown>`.
 *
 * Dazu die zweite Zusage, die man nicht klicken kann: ein VERSCHWUNDENES
 * Video. `videos.list` liefert fehlende Ids einfach nicht mit — kein Fehler,
 * keine Zeile. Mit einem echten Schlüssel liesse sich das nicht herstellen.
 */

interface FakeRow {
  $id: string
  videoId: string
  channelId: string
  channelSubscribers: number
  available: boolean
}

let rows: FakeRow[] = []
let updates: { rowId: string, data: Record<string, unknown> }[] = []

const tablesDB = {
  listRows: vi.fn(async () => ({ rows: [...rows] as never[], total: rows.length })),
  updateRow: vi.fn(async ({ rowId, data }: { rowId: string, data: Record<string, unknown> }) => {
    updates.push({ rowId, data })
    const row = rows.find(entry => entry.$id === rowId)
    if (row && 'available' in data) row.available = data.available as boolean
    return {}
  }),
}

const NOW = new Date('2026-10-25T08:00:00.000Z')

/** Eine Antwort-Fabrik, die auf den Endpunkt in der Adresse hört. */
function fakeApi(options: { returned?: string[], subscribers?: Record<string, number> } = {}) {
  return async (url: string) => {
    if (url.includes('/videos')) {
      const ids = new URL(url).searchParams.get('id')!.split(',')
      const live = options.returned ?? ids
      return {
        items: ids.filter(id => live.includes(id)).map(id => ({
          id,
          snippet: {
            title: `Titel ${id}`,
            channelId: `UC${id}`,
            channelTitle: `Kanal ${id}`,
            publishedAt: '2026-10-01T10:00:00Z',
          },
          statistics: { viewCount: '100', likeCount: '10', commentCount: '1' },
        })),
      }
    }
    if (url.includes('/channels')) {
      const ids = new URL(url).searchParams.get('id')!.split(',')
      return {
        items: ids.map(id => ({
          id,
          snippet: { title: `Kanal ${id}` },
          statistics: { subscriberCount: String(options.subscribers?.[id] ?? 1000) },
        })),
      }
    }
    throw new Error(`unerwartete Adresse: ${url}`)
  }
}

function row(videoId: string, extra: Partial<FakeRow> = {}): FakeRow {
  return { $id: `row-${videoId}`, videoId, channelId: `UC${videoId}`, channelSubscribers: 0, available: true, ...extra }
}

beforeEach(() => {
  rows = []
  updates = []
  tablesDB.listRows.mockClear()
  tablesDB.updateRow.mockClear()
})

describe('refreshInsightsWatchlist', () => {
  it('zieht die Zahlen nach und schreibt nur in die Fundstück-Tabelle', async () => {
    rows = [row('aaaaaaaaaaa')]
    const result = await refreshInsightsWatchlist(tablesDB, 'main', 'k', 'https://yt.test/v3', fakeApi(), NOW)

    expect(result).toMatchObject({ items: 1, updated: 1, gone: 0 })
    for (const call of tablesDB.updateRow.mock.calls) {
      expect((call[0] as { tableId: string }).tableId).toBe(INSIGHTS_WATCHLIST_TABLE)
    }
    const first = updates[0]!.data
    expect(first.title).toBe('Titel aaaaaaaaaaa')
    expect(first.views).toBe(100)
    expect(first.publishedAt).toBe('2026-10-01T00:00:00.000Z')
  })

  it('FASST URTEIL, NOTIZ, CLUSTER, `addedAt` UND DEN BRIEF-VERWEIS NIE AN — die tragende Zusage', async () => {
    rows = [row('aaaaaaaaaaa'), row('bbbbbbbbbbb')]
    await refreshInsightsWatchlist(tablesDB, 'main', 'k', 'https://yt.test/v3', fakeApi(), NOW)

    expect(updates.length).toBeGreaterThan(0)
    for (const update of updates) {
      expect(update.data).not.toHaveProperty('verdict')
      expect(update.data).not.toHaveProperty('note')
      expect(update.data).not.toHaveProperty('topic')
      expect(update.data).not.toHaveProperty('addedAt')
      // Seit K5 gehört `briefPostId` zur menschlichen Hälfte: ein Lauf, der
      // ihn leerte, liesse denselben Brief ein zweites Mal bezahlen.
      expect(update.data).not.toHaveProperty('briefPostId')
    }
  })

  it('ein verschwundenes Video leert die ZAHLEN und lässt die Zeile stehen', async () => {
    rows = [row('aaaaaaaaaaa'), row('bbbbbbbbbbb')]
    // `bbbbbbbbbbb` wird angefragt und NICHT geliefert — privat oder gelöscht.
    const result = await refreshInsightsWatchlist(
      tablesDB, 'main', 'k', 'https://yt.test/v3', fakeApi({ returned: ['aaaaaaaaaaa'] }), NOW,
    )

    expect(result).toMatchObject({ items: 2, updated: 1, gone: 1 })
    const gone = updates.find(update => update.rowId === 'row-bbbbbbbbbbb')!
    expect(gone.data.available).toBe(false)
    expect(gone.data.views).toBe(0)
    expect(gone.data.title).toBe('')
    // GEGENPROBE: die Zeile wurde geändert, nicht gelöscht — es gibt hier
    // keinen Lösch-Weg, und das ist der Unterschied zum Radar.
    expect(gone.data).not.toHaveProperty('verdict')
  })

  it('meldet ein schon als verschwunden bekanntes Video nicht jeden Tag erneut', async () => {
    rows = [row('bbbbbbbbbbb', { available: false })]
    const result = await refreshInsightsWatchlist(
      tablesDB, 'main', 'k', 'https://yt.test/v3', fakeApi({ returned: [] }), NOW,
    )
    expect(result).toMatchObject({ items: 1, updated: 0, gone: 0 })
    expect(updates.filter(u => 'available' in u.data)).toHaveLength(0)
  })

  it('kehrt zurück, wenn ein Video wieder auftaucht', async () => {
    rows = [row('aaaaaaaaaaa', { available: false })]
    await refreshInsightsWatchlist(tablesDB, 'main', 'k', 'https://yt.test/v3', fakeApi(), NOW)
    expect(updates[0]!.data.available).toBe(true)
  })

  it('zieht die Abonnentenzahl nach, aber nur wenn sie sich geändert hat', async () => {
    rows = [row('aaaaaaaaaaa', { channelSubscribers: 1000 })]
    await refreshInsightsWatchlist(
      tablesDB, 'main', 'k', 'https://yt.test/v3', fakeApi({ subscribers: { UCaaaaaaaaaaa: 1000 } }), NOW,
    )
    expect(updates.filter(u => 'channelSubscribers' in u.data)).toHaveLength(0)

    updates = []
    await refreshInsightsWatchlist(
      tablesDB, 'main', 'k', 'https://yt.test/v3', fakeApi({ subscribers: { UCaaaaaaaaaaa: 2000 } }), NOW,
    )
    expect(updates.find(u => 'channelSubscribers' in u.data)!.data.channelSubscribers).toBe(2000)
  })

  it('eine leere Liste kostet keinen einzigen API-Aufruf', async () => {
    const fetchJson = vi.fn(fakeApi())
    const result = await refreshInsightsWatchlist(tablesDB, 'main', 'k', 'https://yt.test/v3', fetchJson, NOW)
    expect(result).toEqual({ items: 0, updated: 0, gone: 0 })
    expect(fetchJson).not.toHaveBeenCalled()
  })

  it('eine fehlende Abonnenten-Antwort bricht den Nachtrag NICHT ab', async () => {
    rows = [row('aaaaaaaaaaa')]
    const fetchJson = async (url: string) => {
      if (url.includes('/channels')) throw new Error('weg')
      return await fakeApi()(url)
    }
    const result = await refreshInsightsWatchlist(tablesDB, 'main', 'k', 'https://yt.test/v3', fetchJson, NOW)
    expect(result).toMatchObject({ items: 1, updated: 1 })
  })
})
