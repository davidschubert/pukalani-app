import { describe, expect, it } from 'vitest'
import {
  INSIGHTS_RADAR_DAILY_QUOTA,
  INSIGHTS_RADAR_QUOTA_CEILING,
  InsightsYoutubeError,
  insightsRadarQuotaEstimate,
  insightsYoutubeBatches,
  insightsYoutubeChannelsSchema,
  insightsYoutubeChannelsUrl,
  insightsYoutubeIsFatal,
  insightsYoutubePlaylistItemsSchema,
  insightsYoutubePlaylistItemsUrl,
  insightsYoutubeReason,
  insightsYoutubeSafeMessage,
  insightsYoutubeVideoIds,
  insightsYoutubeVideosSchema,
  insightsYoutubeVideosUrl,
} from '../shared/insightsYoutube'

/**
 * DER API-TEIL DES RADARS, OHNE NETZ.
 *
 * Geprüft werden hier genau die Fälle, die man mit einem echten Schlüssel
 * nicht herstellen könnte: ein Video, das zwischen zwei Aufrufen privat wird;
 * ein Kanal, der seine Abonnentenzahl verbirgt; ein `quotaExceeded`. Und die
 * eine Zusage, die kein Typ hält — dass unser Schlüssel NIE in einer Meldung
 * landet.
 */

const BASE = 'https://youtube.test/v3'
const KEY = 'AIzaTestKeyTestKeyTestKey'

describe('Adressen', () => {
  it('playlistItems: nur contentDetails, maxResults gedeckelt bei 50', () => {
    const url = new URL(insightsYoutubePlaylistItemsUrl(BASE, KEY, 'UUabc', 999))
    expect(url.pathname).toBe('/v3/playlistItems')
    expect(url.searchParams.get('part')).toBe('contentDetails')
    expect(url.searchParams.get('playlistId')).toBe('UUabc')
    expect(url.searchParams.get('maxResults')).toBe('50')
  })

  it('videos: höchstens 50 Ids, kommagetrennt', () => {
    const ids = Array.from({ length: 60 }, (_, at) => `v${at}`)
    const url = new URL(insightsYoutubeVideosUrl(BASE, KEY, ids))
    expect(url.searchParams.get('part')).toBe('snippet,statistics')
    expect(url.searchParams.get('id')!.split(',')).toHaveLength(50)
  })

  it('channels: Name und Abonnenten in EINEM Aufruf', () => {
    const url = new URL(insightsYoutubeChannelsUrl(BASE, KEY, ['UC1', 'UC2']))
    expect(url.pathname).toBe('/v3/channels')
    expect(url.searchParams.get('id')).toBe('UC1,UC2')
  })

  it('verträgt einen Schrägstrich am Ende der Basis', () => {
    expect(insightsYoutubeChannelsUrl(`${BASE}/`, KEY, ['UC1'])).toContain('/v3/channels?')
  })

  it('kennt WEDER search.list NOCH commentThreads — Leitplanken b und c', async () => {
    // Der Riegel ist der fehlende Adress-Bauer: was man nicht bauen kann,
    // ruft man nicht versehentlich. Der Test hält die Zusage fest, damit ein
    // späterer „nur für einen Sonderfall"-Bauer hier auffällt statt in einer
    // Quota-Abrechnung (search.list: 100 Einheiten) bzw. in einer
    // Datenschutz-Frage (Kommentar-Texte, Nutzernamen).
    const module = await import('../shared/insightsYoutube')
    const names = Object.keys(module).join(' ').toLowerCase()
    expect(names).not.toContain('search')
    expect(names).not.toContain('commentthread')
  })
})

describe('insightsRadarQuotaEstimate', () => {
  it('rechnet die Formel aus §9.6', () => {
    // 12 Kanäle à 20 Videos: 1 + 12 + ceil(240/50) = 1 + 12 + 5 = 18
    expect(insightsRadarQuotaEstimate(12, 20)).toBe(18)
    // 50 Kanäle à 20: 1 + 50 + ceil(1000/50) = 71 — die Zahl aus dem Plan.
    expect(insightsRadarQuotaEstimate(50, 20)).toBe(71)
  })

  it('ist 0 ohne Kanäle', () => {
    expect(insightsRadarQuotaEstimate(0, 20)).toBe(0)
  })

  it('bleibt für jede vernünftige Liste weit unter der Schranke', () => {
    expect(insightsRadarQuotaEstimate(50, 50)).toBeLessThan(INSIGHTS_RADAR_QUOTA_CEILING)
    expect(INSIGHTS_RADAR_QUOTA_CEILING * 2).toBe(INSIGHTS_RADAR_DAILY_QUOTA)
  })
})

describe('insightsYoutubeBatches', () => {
  it('zerlegt in Stapel zu je 50', () => {
    const items = Array.from({ length: 120 }, (_, at) => at)
    expect(insightsYoutubeBatches(items).map(batch => batch.length)).toEqual([50, 50, 20])
  })

  it('gibt für eine leere Liste keine Stapel — kein Aufruf für nichts', () => {
    expect(insightsYoutubeBatches([])).toEqual([])
  })
})

describe('Antworten', () => {
  it('playlistItems: Einträge ohne Video fallen heraus, Doppelte auch', () => {
    const parsed = insightsYoutubePlaylistItemsSchema.parse({
      items: [
        { contentDetails: { videoId: 'a' } },
        { }, // gelöschtes/privat gestelltes Video hinterlässt einen leeren Eintrag
        { contentDetails: { videoId: 'a' } },
        { contentDetails: { videoId: 'b' } },
      ],
    })
    expect(insightsYoutubeVideoIds(parsed)).toEqual(['a', 'b'])
  })

  it('videos: Zahlen kommen als ZEICHENKETTEN und werden zu Zahlen', () => {
    const parsed = insightsYoutubeVideosSchema.parse({
      items: [{
        id: 'a',
        snippet: { title: 'T', channelId: 'UC1', channelTitle: 'C', publishedAt: '2026-09-01T10:00:00Z' },
        statistics: { viewCount: '12345', likeCount: '67', commentCount: '8' },
      }],
    })
    expect(parsed.items[0]!.statistics).toEqual({ viewCount: 12345, likeCount: 67, commentCount: 8 })
  })

  it('videos: abgeschaltete Likes/Kommentare sind 0, kein Fehler', () => {
    const parsed = insightsYoutubeVideosSchema.parse({
      items: [{
        id: 'a',
        snippet: { title: 'T', channelId: 'UC1', channelTitle: 'C', publishedAt: '2026-09-01T10:00:00Z' },
        statistics: { viewCount: '9' },
      }],
    })
    expect(parsed.items[0]!.statistics).toEqual({ viewCount: 9, likeCount: 0, commentCount: 0 })
  })

  it('videos: ein privates Video FEHLT in der Antwort — die Liste ist kürzer als der Stapel', () => {
    // Genau der Fall aus dem Kopf des Sweeps: wir laufen über die ANTWORT,
    // nicht über den angefragten Stapel, sonst entstünde eine Zeile mit Nullen.
    const parsed = insightsYoutubeVideosSchema.parse({ items: [] })
    expect(parsed.items).toEqual([])
  })

  it('channels: ein verborgener Abonnenten-Zähler ist 0', () => {
    const parsed = insightsYoutubeChannelsSchema.parse({
      items: [{ id: 'UC1', snippet: { title: 'Kanal' }, statistics: {} }],
    })
    expect(parsed.items[0]!.statistics.subscriberCount).toBe(0)
    expect(parsed.items[0]!.snippet.title).toBe('Kanal')
  })
})

describe('Fehler', () => {
  it('liest Googles Grund aus dem Fehlerkörper', () => {
    expect(insightsYoutubeReason({ error: { errors: [{ reason: 'quotaExceeded' }] } })).toBe('quotaExceeded')
    expect(insightsYoutubeReason({ error: { status: 'PERMISSION_DENIED', errors: [] } })).toBe('PERMISSION_DENIED')
    expect(insightsYoutubeReason(null)).toBe('')
    expect(insightsYoutubeReason('kaputt')).toBe('')
  })

  it('unterscheidet „ein Kanal fehlt" von „das Budget ist alle"', () => {
    expect(insightsYoutubeIsFatal(new InsightsYoutubeError(404, 'playlistNotFound'))).toBe(false)
    expect(insightsYoutubeIsFatal(new InsightsYoutubeError(403, 'quotaExceeded'))).toBe(true)
    expect(insightsYoutubeIsFatal(new InsightsYoutubeError(401, 'unauthorized'))).toBe(true)
    expect(insightsYoutubeIsFatal(new Error('irgendwas'))).toBe(false)
  })

  it('DER SCHLÜSSEL LANDET NIE IN EINER MELDUNG', () => {
    const url = insightsYoutubeChannelsUrl(BASE, KEY, ['UC1'])
    const safe = insightsYoutubeSafeMessage(new Error(`request to ${url} failed`))
    expect(safe).not.toContain(KEY)
    expect(safe).not.toContain('key=')
    // GEGENPROBE: der Endpunkt bleibt erhalten, sonst wäre die Meldung wertlos.
    expect(safe).toContain('/v3/channels')
  })

  it('macht auch einen frei stehenden Schlüssel unkenntlich', () => {
    expect(insightsYoutubeSafeMessage(new Error(`bad key ${KEY}`))).not.toContain(KEY)
  })
})
