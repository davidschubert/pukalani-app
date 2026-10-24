import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppwriteException } from 'node-appwrite'
import { INSIGHTS_TOPICS_TABLE } from '../shared/insightsRows'
import { InsightsYoutubeError } from '../shared/insightsYoutube'
import type { InsightsRadarSweepDeps } from '../server/utils/insightsRadarSweep'
import { runInsightsRadarSweep } from '../server/utils/insightsRadarSweep'

/**
 * DER TÄGLICHE LAUF DES THEMENRADARS (BI1 I4, §9.6).
 *
 * ── WARUM DIESER LAUF EINEN TEST BRAUCHT, DEN MAN NICHT KLICKEN KANN ────
 * Er spricht über das Netz mit einem fremden Dienst. Die Fälle, an denen er
 * scheitern KÖNNTE, lassen sich mit einem echten Schlüssel nicht herstellen:
 * ein `quotaExceeded` bekäme man erst nach 10.000 Aufrufen, ein zwischen zwei
 * Aufrufen privat gestelltes Video gar nicht. Genau dafür sind `fetchJson` und
 * die vier Nitro-Auto-Imports über `deps` überschreibbar.
 *
 * Geprüft werden die Zusagen, die kein Typ hält:
 *  1. OHNE SCHLÜSSEL PASSIERT NICHTS — und die Meldung darüber steht einmal
 *     je Prozess, nicht einmal je Tag.
 *  2. EIN FEHLENDER KANAL KOSTET EINEN KANAL, nicht den Lauf.
 *  3. EIN `quotaExceeded` BEENDET DEN LAUF — weitermachen wäre Trotz.
 *  4. EIN PRIVATES VIDEO BEKOMMT KEINE ZEILE (statt einer voller Nullen).
 *  5. DER UPSERT TRIFFT DIESELBE ZEILE WIEDER — sonst wüchse die Tabelle
 *     täglich um ihren eigenen Inhalt.
 *  6. DAS 30-TAGE-NETZ LÖSCHT, WAS DER LAUF NICHT MEHR ERREICHT HAT.
 */

interface FakeRow {
  $id: string
  videoId: string
  fetchedAt: string | null
  [key: string]: unknown
}

let rows: FakeRow[]
let logged: { level: string, name: string, data: Record<string, unknown> }[]
let nextRowId: number

const tablesDB = {
  listRows: vi.fn(async ({ queries }: { queries?: string[] }) => {
    // Der Fake liest die ZWEI Abfrageformen, die der Sweep benutzt: „diese
    // Video-Ids" (Upsert) und „älter als" (Netz). Die Queries des Node-SDK
    // sind JSON-Zeichenketten — sie werden hier ausgepackt statt mit einer
    // Zeichenketten-Suche geraten, sonst prüfte der Test seine eigene Heuristik.
    const parsed = (queries ?? []).map(query => JSON.parse(query) as { method: string, attribute?: string, values?: unknown[] })
    const lessThan = parsed.find(query => query.method === 'lessThan')
    if (lessThan) {
      // Die zwei Netze fragen verschiedene Spalten (`fetchedAt`, `publishedAt`)
      // — der Fake liest die Spalte aus der Abfrage, statt eine zu raten.
      const attribute = String(lessThan.attribute ?? 'fetchedAt')
      const cutoff = String(lessThan.values?.[0] ?? '')
      const due = rows
        .filter(row => typeof row[attribute] === 'string' && String(row[attribute]) < cutoff)
        .sort((a, b) => String(a.fetchedAt).localeCompare(String(b.fetchedAt)))
      return { rows: due.slice(0, 200), total: due.length }
    }
    const equal = parsed.find(query => query.method === 'equal' && query.attribute === 'videoId')
    const ids = (equal?.values ?? []).map(String)
    const found = rows.filter(row => ids.includes(row.videoId))
    return { rows: found, total: found.length }
  }),
  createRow: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const videoId = String(data.videoId)
    if (rows.some(row => row.videoId === videoId)) throw new AppwriteException('Duplicate', 409)
    rows.push({ $id: `row-${++nextRowId}`, ...data, videoId, fetchedAt: (data.fetchedAt ?? null) as string | null })
  }),
  updateRow: vi.fn(async ({ rowId, data }: { rowId: string, data: Record<string, unknown> }) => {
    const row = rows.find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
    Object.assign(row, data)
  }),
  deleteRow: vi.fn(async ({ rowId }: { rowId: string }) => {
    const at = rows.findIndex(entry => entry.$id === rowId)
    if (at < 0) throw new AppwriteException('Row not found', 404)
    rows.splice(at, 1)
  }),
}

const CHANNEL = 'UC-b3c7kxa5vU-bnmaROgvog'

/**
 * Die App-Config trägt seit BI2 K3 nur noch die zwei DECKEL — die Kanäle
 * kommen aus der Tabelle und reisen über `readChannels` herein.
 */
function appConfig(extra: Record<string, unknown> = {}) {
  return { pukalani: { insights: { radar: { maxVideosPerChannel: 20, ...extra } } } }
}

/** Die kuratierten Kanäle, wie `readActiveRadarChannels` sie liefern würde. */
function channelsDep(channels: { channelId: string, topic: string }[] = [{ channelId: CHANNEL, topic: 'brand-strategy' }]) {
  return async () => channels.map(entry => ({ ...entry, title: '' })) as never
}

function runtime(key = 'test-key') {
  return { insightsYoutubeKey: key, insightsYoutubeBaseUrl: 'https://yt.test/v3', public: { appwriteDatabaseId: 'main' } }
}

/** Eine Antwort-Fabrik, die auf den Endpunkt in der Adresse hört. */
function fakeApi(options: {
  subscribers?: number
  videoIds?: string[]
  /** Welche Ids `videos.list` ZURÜCKGIBT — Fehlende sind privat/gelöscht. */
  returned?: string[]
  titles?: Record<string, string>
  fail?: (url: string) => unknown
}) {
  const videoIds = options.videoIds ?? ['vid-1']
  const returned = options.returned ?? videoIds
  return async (url: string): Promise<unknown> => {
    const failure = options.fail?.(url)
    if (failure) throw failure
    if (url.includes('/channels?')) {
      return {
        items: [{
          id: CHANNEL,
          snippet: { title: 'The Futur' },
          statistics: { subscriberCount: String(options.subscribers ?? 1_000_000) },
        }],
      }
    }
    if (url.includes('/playlistItems?')) {
      return { items: videoIds.map(id => ({ contentDetails: { videoId: id } })) }
    }
    return {
      items: returned.map(id => ({
        id,
        snippet: {
          title: options.titles?.[id] ?? 'Brand strategy for beginners',
          channelId: CHANNEL,
          channelTitle: 'The Futur',
          publishedAt: '2026-09-01T10:00:00Z',
        },
        statistics: { viewCount: '50000', likeCount: '900', commentCount: '30' },
      })),
    }
  }
}

function deps(extra: Partial<InsightsRadarSweepDeps> = {}): InsightsRadarSweepDeps {
  return {
    readAppConfig: () => appConfig(),
    readChannels: channelsDep(),
    // Der Nachtrag an die Kanalliste ist ein Nitro-Auto-Import und existiert
    // hier nicht; was er TUT, prüft `insightsChannel.test.ts` an den reinen
    // Regeln. Hier zählt nur, dass der Lauf ihn ruft und an ihm nicht hängen
    // bleibt — deshalb eine Fassung, die mitzählt (s. `touched`).
    touchChannels: async (_db, _dbId, seen) => { touched.push(new Map(seen)) },
    readRuntimeConfig: () => runtime(),
    tablesDB,
    log: (level, name, data) => { logged.push({ level, name, data }) },
    fetchJson: fakeApi({}),
    ...extra,
  }
}

/** Womit der Lauf die Kanalliste nachgezogen hat (BI2 K3). */
let touched: Map<string, { title: string, subscribers: number, handle: string }>[] = []

const NOW = new Date('2026-09-09T08:00:00.000Z')

beforeEach(() => {
  rows = []
  logged = []
  touched = []
  nextRowId = 0
  tablesDB.createRow.mockClear()
  tablesDB.updateRow.mockClear()
  tablesDB.deleteRow.mockClear()
})

describe('runInsightsRadarSweep — die Gates', () => {
  it('ohne Schlüssel passiert NICHTS, und die Meldung steht nur einmal je Prozess', async () => {
    const first = await runInsightsRadarSweep(deps({ readRuntimeConfig: () => runtime('') }), NOW)
    expect(first.skipped).toBe('not_configured')
    expect(first.videos).toBe(0)
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect(logged.filter(entry => entry.name === 'insights.radar_unconfigured')).toHaveLength(1)

    const second = await runInsightsRadarSweep(deps({ readRuntimeConfig: () => runtime('') }), NOW)
    expect(second.skipped).toBe('not_configured')
    // GEGENPROBE: der zweite Lauf schweigt — der Zustand ist kein Ereignis.
    expect(logged.filter(entry => entry.name === 'insights.radar_unconfigured')).toHaveLength(1)
  })

  it('ohne Kanäle ist es kein Fehler, sondern „diese App betreibt keinen Radar"', async () => {
    const result = await runInsightsRadarSweep(deps({ readChannels: channelsDep([]) }), NOW)
    expect(result.skipped).toBe('no_channels')
    expect(result.errors).toBe(0)
  })

  it('eine zu teure Kanalliste läuft gar nicht erst an', async () => {
    const many = Array.from({ length: 5000 }, (_, at) => ({
      channelId: `UC${String(at).padStart(22, 'x')}`,
      topic: 'seo-geo',
    }))
    const fetchJson = vi.fn(fakeApi({}))
    const result = await runInsightsRadarSweep(deps({ readChannels: channelsDep(many), fetchJson }), NOW)
    expect(result.skipped).toBe('quota_estimate')
    // Kein einziger Aufruf — das ist der ganze Punkt der Vorab-Schätzung.
    expect(fetchJson).not.toHaveBeenCalled()
    expect(logged.some(entry => entry.name === 'insights.radar_quota_estimate_exceeded')).toBe(true)
  })
})

describe('runInsightsRadarSweep — der Lauf', () => {
  it('schreibt je Video eine Zeile mit den API-Zahlen und UNSEREN Zahlen', async () => {
    const result = await runInsightsRadarSweep(deps(), NOW)
    expect(result).toMatchObject({ channels: 1, videos: 1, upserted: 1, deleted: 0, tooOld: 0, errors: 0, quotaUnits: 3 })
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.videoId).toBe('vid-1')
    expect(row.views).toBe(50000)
    expect(row.likes).toBe(900)
    expect(row.commentCount).toBe(30)
    expect(row.channelTitle).toBe('The Futur')
    expect(row.channelSubscribers).toBe(1_000_000)
    expect(row.fetchedAt).toBe('2026-09-09T00:00:00.000Z')
    expect(row.publishedAt).toBe('2026-09-01T00:00:00.000Z')
    // Titel trifft „brand strategy" ⇒ Cluster und Relevanz kommen aus der
    // Schlagwortliste, nicht aus dem Kanal-Grundwert allein.
    expect(row.topic).toBe('brand-strategy')
    expect(row.relevance).toBeGreaterThan(0.5)
    expect(row.opportunitySignals).toBe(3)
    expect(typeof row.opportunity).toBe('number')
  })

  it('KEINE Kommentar-Texte, KEINE Nutzernamen in der Zeile (Leitplanke b)', async () => {
    await runInsightsRadarSweep(deps(), NOW)
    expect(Object.keys(rows[0]!).sort()).toEqual([
      '$id', 'channelId', 'channelSubscribers', 'channelTitle', 'commentCount',
      'fetchedAt', 'likes', 'opportunity', 'opportunitySignals', 'publishedAt',
      'relevance', 'title', 'topic', 'videoId', 'views',
    ])
  })

  it('ein privat gestelltes Video bekommt KEINE Zeile — statt einer voller Nullen', async () => {
    const result = await runInsightsRadarSweep(deps({
      fetchJson: fakeApi({ videoIds: ['vid-1', 'vid-privat'], returned: ['vid-1'] }),
    }), NOW)
    expect(result.videos).toBe(1)
    expect(rows.map(row => row.videoId)).toEqual(['vid-1'])
  })

  it('ohne Abonnentenzahl rechnet die Zahl aus ZWEI Signalen, nicht mit einer 0', async () => {
    await runInsightsRadarSweep(deps({ fetchJson: fakeApi({ subscribers: 0 }) }), NOW)
    expect(rows[0]!.opportunitySignals).toBe(2)
  })

  it('ein fehlgeschlagener Kanal kostet EINEN Kanal, nicht den Lauf', async () => {
    const result = await runInsightsRadarSweep(deps({
      fetchJson: fakeApi({ fail: url => (url.includes('/playlistItems?') ? new InsightsYoutubeError(404, 'playlistNotFound') : null) }),
    }), NOW)
    expect(result.errors).toBe(1)
    expect(result.channels).toBe(0)
    expect(result.videos).toBe(0)
    // Der Lauf ist regulär zu Ende gegangen — das Netz lief mit.
    expect(logged.some(entry => entry.name === 'insights.radar_swept')).toBe(true)
    expect(logged.some(entry => entry.name === 'insights.radar_channel_failed')).toBe(true)
  })

  it('ein quotaExceeded BEENDET den Lauf', async () => {
    const fetchJson = vi.fn(fakeApi({ fail: () => new InsightsYoutubeError(403, 'quotaExceeded') }))
    const result = await runInsightsRadarSweep(deps({ fetchJson }), NOW)
    expect(result.errors).toBe(1)
    expect(result.upserted).toBe(0)
    // Genau EIN Aufruf: der erste (channels.list) — danach ist Schluss.
    expect(fetchJson).toHaveBeenCalledTimes(1)
    expect(logged.some(entry => entry.name === 'insights.radar_quota_exceeded')).toBe(true)
    // GEGENPROBE: der reguläre Abschluss-Log fehlt.
    expect(logged.some(entry => entry.name === 'insights.radar_swept')).toBe(false)
  })

  it('KEIN Log-Eintrag trägt den Schlüssel weiter', async () => {
    await runInsightsRadarSweep(deps({
      fetchJson: fakeApi({ fail: url => new Error(`request to ${url} failed`) }),
    }), NOW)
    const text = JSON.stringify(logged)
    expect(text).not.toContain('test-key')
    expect(text).not.toContain('key=')
  })
})

describe('runInsightsRadarSweep — Upsert und 30-Tage-Netz', () => {
  it('der zweite Lauf trifft DIESELBE Zeile', async () => {
    await runInsightsRadarSweep(deps(), NOW)
    expect(rows).toHaveLength(1)
    const firstId = rows[0]!.$id

    const later = new Date('2026-09-10T08:00:00.000Z')
    const result = await runInsightsRadarSweep(deps(), later)
    expect(result.upserted).toBe(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.$id).toBe(firstId)
    expect(rows[0]!.fetchedAt).toBe('2026-09-10T00:00:00.000Z')
    expect(tablesDB.updateRow).toHaveBeenCalledTimes(1)
  })

  it('ein 409 zwischen Lesen und Anlegen wird zum Update, nicht zum Fehler', async () => {
    // Die Zeile entsteht ERST beim ersten `createRow` — der Lesevorgang davor
    // hat sie nicht gesehen. Genau der Wettlauf, den `uq_video_id` abfängt.
    let planted = false
    tablesDB.createRow.mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => {
      planted = true
      rows.push({ $id: 'row-fremd', ...data, videoId: String(data.videoId), fetchedAt: (data.fetchedAt ?? null) as string | null })
      throw new AppwriteException('Duplicate', 409)
    })
    const result = await runInsightsRadarSweep(deps(), NOW)
    expect(planted).toBe(true)
    expect(result.errors).toBe(0)
    expect(result.upserted).toBe(1)
    expect(rows).toHaveLength(1)
  })

  it('löscht, was älter als 30 Tage ist — und lässt frische Zeilen stehen', async () => {
    rows.push(
      { $id: 'alt', videoId: 'weg', fetchedAt: '2026-07-01T00:00:00.000Z' },
      { $id: 'frisch', videoId: 'bleibt', fetchedAt: '2026-09-08T00:00:00.000Z' },
    )
    const result = await runInsightsRadarSweep(deps(), NOW)
    expect(result.deleted).toBe(1)
    expect(rows.map(row => row.videoId).sort()).toEqual(['bleibt', 'vid-1'])
  })

  it('der Alters-Deckel: ein Jahre altes Video bekommt KEINE Zeile, und es wird gezählt', async () => {
    // Uploads-Playlist eines Kanals, der seit 2012 nichts hochlädt — die API
    // liefert brav sein „jüngstes" Video. Ohne Datum (leerer String) bleibt
    // ein Video drin: der Deckel schliesst aus, was nachweislich alt ist.
    const fetchJson = async (url: string): Promise<unknown> => {
      const base = await fakeApi({ videoIds: ['alt', 'frisch', 'undatiert'] })(url)
      if (!url.includes('/videos?')) return base
      const items = (base as { items: { id: string, snippet: Record<string, unknown> }[] }).items
      for (const item of items) {
        if (item.id === 'alt') item.snippet.publishedAt = '2012-05-01T10:00:00Z'
        if (item.id === 'undatiert') item.snippet.publishedAt = ''
      }
      return { items }
    }
    const result = await runInsightsRadarSweep(deps({ fetchJson }), NOW)
    expect(result).toMatchObject({ videos: 2, upserted: 2, tooOld: 1, errors: 0 })
    expect(rows.map(row => row.videoId).sort()).toEqual(['frisch', 'undatiert'])
  })

  it('der Alters-Deckel räumt auch Zeilen, die ein früherer Lauf noch gespeichert hat', async () => {
    rows.push(
      // Heute geholt (das 30-Tage-Netz lässt sie stehen), aber 2020 veröffentlicht.
      { $id: 'alt', videoId: 'von-2020', fetchedAt: '2026-09-08T00:00:00.000Z', publishedAt: '2020-03-01T00:00:00.000Z' },
      { $id: 'frisch', videoId: 'bleibt', fetchedAt: '2026-09-08T00:00:00.000Z', publishedAt: '2026-08-20T00:00:00.000Z' },
    )
    const result = await runInsightsRadarSweep(deps(), NOW)
    expect(result.deleted).toBe(1)
    expect(rows.map(row => row.videoId).sort()).toEqual(['bleibt', 'vid-1'])
    // Der Deckel ist eine App-Vorgabe: mit 3.000 Tagen bliebe die Zeile von 2020.
    rows.push({ $id: 'alt2', videoId: 'von-2020', fetchedAt: '2026-09-08T00:00:00.000Z', publishedAt: '2020-03-01T00:00:00.000Z' })
    const lenient = await runInsightsRadarSweep(deps({
      readAppConfig: () => appConfig({ maxVideoAgeDays: 3_000 }),
    }), NOW)
    // 3.000 liegt über dem Deckel von 365 Tagen — die Zeile fällt trotzdem.
    expect(lenient.deleted).toBe(1)
  })

  it('fehlt die Tabelle, ist der Lauf still — der Layer kann ohne Migration im Bau sein', async () => {
    tablesDB.listRows.mockImplementationOnce(async () => { throw new AppwriteException('Table not found', 404) })
    const result = await runInsightsRadarSweep(deps(), NOW)
    expect(result.upserted).toBe(0)
    expect(result.errors).toBe(0)
    expect(rows).toHaveLength(0)
    expect(logged.some(entry => entry.name.includes('failed'))).toBe(false)
  })

  it('LEGT Zeilen nur in der Radar-Tabelle an — die Kanalliste wird nur nachgezogen', async () => {
    await runInsightsRadarSweep(deps(), NOW)
    // Angelegt wird ausschliesslich in `insights_topics`. Die Kanalliste
    // bekommt seit BI2 K3 einen Nachtrag, aber nur ÄNDERND und nur auf den
    // API-Feldern — ein Lauf, der dort Zeilen anlegte, erfände Kanäle.
    for (const call of tablesDB.createRow.mock.calls) {
      expect((call[0] as { tableId: string }).tableId).toBe(INSIGHTS_TOPICS_TABLE)
    }
  })

  it('zieht die Kanalliste mit dem nach, was die API gerade gesagt hat', async () => {
    await runInsightsRadarSweep(deps(), NOW)
    expect(touched).toHaveLength(1)
    expect(touched[0]!.get(CHANNEL)).toEqual({ title: 'The Futur', subscribers: 1_000_000, handle: '' })
  })
})
