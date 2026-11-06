import { describe, expect, it } from 'vitest'
import type { InsightsVerdict } from '../shared/insightsWatchlist'
import { INSIGHTS_RADAR_VERDICT_DEFAULT } from '../shared/insightsWatchlist'
import {
  INSIGHTS_RADAR_RANGES,
  INSIGHTS_RADAR_SORT_DEFAULT,
  INSIGHTS_RADAR_SORT_KEYS,
  insightsRadarFacets,
  insightsRadarFilterActive,
  insightsRadarFilterNone,
  insightsRadarFilterRows,
  insightsRadarFirstDesc,
  insightsRadarSort,
  insightsRadarSortValue,
} from '../shared/insightsRadarView'

/**
 * DIE REINEN REGELN DER RADAR-ANSICHT (BI2 K2).
 *
 * Sie brauchen einen Test, weil sie entscheiden, WELCHES Video oben steht —
 * die einzige Auskunft, die diese Seite gibt. Jede Zusage hat eine
 * GEGENPROBE: dass `null` absteigend am Ende steht, ist nur dann eine Aussage,
 * wenn es AUFSTEIGEND auch dort steht.
 */

interface Row {
  videoId: string
  topic: string
  verdict: InsightsVerdict
  channelTitle: string
  views: number
  likes: number
  commentCount: number
  ageDays: number
  score: number | null
}

function row(partial: Partial<Row> & { videoId: string }): Row {
  return {
    topic: 'brand-strategy',
    verdict: 'unrated',
    channelTitle: 'The Futur',
    views: 0,
    likes: 0,
    commentCount: 0,
    ageDays: 0,
    score: 0,
    ...partial,
  }
}

describe('insightsRadarSortValue', () => {
  it('liest je Spalte den richtigen Wert', () => {
    const one = row({ videoId: 'a', views: 10, likes: 20, commentCount: 30, ageDays: 40, score: 50 })
    expect(insightsRadarSortValue(one, 'views')).toBe(10)
    expect(insightsRadarSortValue(one, 'likes')).toBe(20)
    expect(insightsRadarSortValue(one, 'commentCount')).toBe(30)
    expect(insightsRadarSortValue(one, 'age')).toBe(40)
    expect(insightsRadarSortValue(one, 'opportunity')).toBe(50)
  })

  it('gibt `null` nur bei der Opportunity zurück — die Zahlen der API sind immer Zahlen', () => {
    const none = row({ videoId: 'a', score: null })
    expect(insightsRadarSortValue(none, 'opportunity')).toBeNull()
    expect(insightsRadarSortValue(none, 'views')).toBe(0)
  })
})

describe('insightsRadarSort', () => {
  const rows = [
    row({ videoId: 'a', score: 40, views: 100 }),
    row({ videoId: 'b', score: null, views: 900 }),
    row({ videoId: 'c', score: 80, views: 50 }),
  ]

  it('sortiert absteigend nach der Opportunity', () => {
    expect(insightsRadarSort(rows, 'opportunity', true).map(r => r.videoId)).toEqual(['c', 'a', 'b'])
  })

  it('lässt die Zeile OHNE Zahl auch aufsteigend am Ende — `null` ist kein kleiner Wert', () => {
    expect(insightsRadarSort(rows, 'opportunity', false).map(r => r.videoId)).toEqual(['a', 'c', 'b'])
  })

  it('sortiert nach einer anderen Spalte unabhängig von der Opportunity', () => {
    expect(insightsRadarSort(rows, 'views', true).map(r => r.videoId)).toEqual(['b', 'a', 'c'])
  })

  it('entscheidet Gleichstand über die Video-Id — zwei Läufe, eine Reihenfolge', () => {
    const tied = [
      row({ videoId: 'z', likes: 5 }),
      row({ videoId: 'm', likes: 5 }),
      row({ videoId: 'a', likes: 5 }),
    ]
    expect(insightsRadarSort(tied, 'likes', true).map(r => r.videoId)).toEqual(['a', 'm', 'z'])
    expect(insightsRadarSort(tied, 'likes', false).map(r => r.videoId)).toEqual(['a', 'm', 'z'])
  })

  it('entscheidet auch bei zwei Zeilen OHNE Zahl über die Id', () => {
    const nones = [row({ videoId: 'y', score: null }), row({ videoId: 'x', score: null })]
    expect(insightsRadarSort(nones, 'opportunity', true).map(r => r.videoId)).toEqual(['x', 'y'])
  })

  it('lässt die Vorlage unangetastet', () => {
    const before = rows.map(r => r.videoId)
    insightsRadarSort(rows, 'views', true)
    expect(rows.map(r => r.videoId)).toEqual(before)
  })
})

describe('insightsRadarFirstDesc', () => {
  it('startet bei den Zahlen mit „das Grösste zuerst"', () => {
    expect(insightsRadarFirstDesc('views')).toBe(true)
    expect(insightsRadarFirstDesc('likes')).toBe(true)
    expect(insightsRadarFirstDesc('commentCount')).toBe(true)
    expect(insightsRadarFirstDesc('opportunity')).toBe(true)
  })

  it('startet beim Alter mit „das Jüngste zuerst" — die eine Ausnahme', () => {
    expect(insightsRadarFirstDesc('age')).toBe(false)
  })
})

describe('insightsRadarFilterRows', () => {
  const rows = [
    row({ videoId: 'a', topic: 'seo-geo', channelTitle: 'Ahrefs', ageDays: 3 }),
    row({ videoId: 'b', topic: 'brand-strategy', channelTitle: 'The Futur', ageDays: 40 }),
    row({ videoId: 'c', topic: 'brand-strategy', channelTitle: 'Ahrefs', ageDays: 120 }),
  ]

  it('zeigt ohne Filter ALLES — leer heisst alle, nicht keines', () => {
    expect(insightsRadarFilterRows(rows, insightsRadarFilterNone())).toHaveLength(3)
  })

  it('filtert nach Thema', () => {
    const only = insightsRadarFilterRows(rows, { ...insightsRadarFilterNone(), topics: ['brand-strategy'] })
    expect(only.map(r => r.videoId)).toEqual(['b', 'c'])
  })

  it('nimmt mehrere Themen als ODER', () => {
    const both = insightsRadarFilterRows(rows, { ...insightsRadarFilterNone(), topics: ['seo-geo', 'brand-strategy'] })
    expect(both).toHaveLength(3)
  })

  it('filtert nach Kanal', () => {
    const only = insightsRadarFilterRows(rows, { ...insightsRadarFilterNone(), channels: ['Ahrefs'] })
    expect(only.map(r => r.videoId)).toEqual(['a', 'c'])
  })

  it('verbindet Thema UND Kanal', () => {
    const both = insightsRadarFilterRows(rows, { ...insightsRadarFilterNone(), topics: ['brand-strategy'], channels: ['Ahrefs'] })
    expect(both.map(r => r.videoId)).toEqual(['c'])
  })

  it('schneidet den Zeitraum am Alter ab, Grenze eingeschlossen', () => {
    expect(insightsRadarFilterRows(rows, { ...insightsRadarFilterNone(), range: 7 }).map(r => r.videoId)).toEqual(['a'])
    expect(insightsRadarFilterRows(rows, { ...insightsRadarFilterNone(), range: 90 }).map(r => r.videoId)).toEqual(['a', 'b'])
    const exact = [row({ videoId: 'e', ageDays: 7 })]
    expect(insightsRadarFilterRows(exact, { ...insightsRadarFilterNone(), range: 7 })).toHaveLength(1)
  })

  it('lässt `0` als Zeitraum alles durch', () => {
    expect(insightsRadarFilterRows(rows, { ...insightsRadarFilterNone(), range: 0 })).toHaveLength(3)
  })
})

describe('insightsRadarFilterNone', () => {
  it('gibt bei jedem Aufruf FRISCHE Listen — sonst schriebe ein v-model in den Modul-Zustand', () => {
    const first = insightsRadarFilterNone()
    const second = insightsRadarFilterNone()
    expect(first).not.toBe(second)
    expect(first.topics).not.toBe(second.topics)
    expect(first.channels).not.toBe(second.channels)

    // Die Gegenprobe: eine Auswahl, die ihre Liste an Ort und Stelle ändert,
    // darf den nächsten „Zurücksetzen"-Aufruf nicht vergiften.
    first.topics.push('seo-geo')
    expect(insightsRadarFilterNone().topics).toEqual([])
  })

  it('ist leer und damit unbeschränkt', () => {
    expect(insightsRadarFilterActive(insightsRadarFilterNone())).toBe(false)
  })
})

describe('der Urteils-Filter (BI2 K4)', () => {
  const rows = [
    row({ videoId: 'a', verdict: 'unrated' }),
    row({ videoId: 'b', verdict: 'uninteresting' }),
    row({ videoId: 'c', verdict: 'interesting' }),
  ]

  it('blendet in der VORGABE das Abgehakte aus — ein Urteil, das wirkt', () => {
    const shown = insightsRadarFilterRows(rows, insightsRadarFilterNone())
    expect(shown.map(r => r.videoId)).toEqual(['a', 'c'])
  })

  it('zeigt auf Wunsch nur die Vorauswahl', () => {
    const only = insightsRadarFilterRows(rows, { ...insightsRadarFilterNone(), verdict: 'interesting' })
    expect(only.map(r => r.videoId)).toEqual(['c'])
  })

  it('zeigt auf Wunsch alles — auch das eigene Nein', () => {
    expect(insightsRadarFilterRows(rows, { ...insightsRadarFilterNone(), verdict: 'all' })).toHaveLength(3)
  })

  it('verbindet sich mit den anderen Filtern als UND', () => {
    const both = insightsRadarFilterRows(
      [row({ videoId: 'a', verdict: 'interesting', topic: 'seo-geo' }), row({ videoId: 'b', verdict: 'interesting', topic: 'rebranding' })],
      { ...insightsRadarFilterNone(), verdict: 'interesting', topics: ['seo-geo'] },
    )
    expect(both.map(r => r.videoId)).toEqual(['a'])
  })

  it('die VORGABE zählt nicht als Einschränkung — sonst stünde „zurücksetzen" von Anfang an da', () => {
    expect(insightsRadarFilterActive(insightsRadarFilterNone())).toBe(false)
    expect(insightsRadarFilterNone().verdict).toBe(INSIGHTS_RADAR_VERDICT_DEFAULT)
    // GEGENPROBE: jede ANDERE Stellung ist eine.
    expect(insightsRadarFilterActive({ ...insightsRadarFilterNone(), verdict: 'all' })).toBe(true)
    expect(insightsRadarFilterActive({ ...insightsRadarFilterNone(), verdict: 'interesting' })).toBe(true)
  })
})

describe('insightsRadarFilterActive', () => {
  it('ist ohne Einschränkung falsch und mit jeder einzelnen wahr', () => {
    expect(insightsRadarFilterActive(insightsRadarFilterNone())).toBe(false)
    expect(insightsRadarFilterActive({ ...insightsRadarFilterNone(), topics: ['seo-geo'] })).toBe(true)
    expect(insightsRadarFilterActive({ ...insightsRadarFilterNone(), channels: ['Ahrefs'] })).toBe(true)
    expect(insightsRadarFilterActive({ ...insightsRadarFilterNone(), range: 30 })).toBe(true)
  })
})

describe('insightsRadarFacets', () => {
  it('bietet nur an, was in den Daten vorkommt', () => {
    const facets = insightsRadarFacets([
      row({ videoId: 'a', topic: 'seo-geo', channelTitle: 'Ahrefs' }),
      row({ videoId: 'b', topic: 'seo-geo', channelTitle: 'Semrush' }),
    ])
    expect(facets.topics).toEqual(['seo-geo'])
    expect(facets.channels).toEqual(['Ahrefs', 'Semrush'])
  })

  it('ordnet die Themen nach dem KATALOG, nicht nach dem ersten Vorkommen', () => {
    const facets = insightsRadarFacets([
      row({ videoId: 'a', topic: 'visual-identity' }),
      row({ videoId: 'b', topic: 'rebranding' }),
    ])
    // `rebranding` steht im Katalog vor `visual-identity`.
    expect(facets.topics).toEqual(['rebranding', 'visual-identity'])
  })

  it('behält ein Cluster, das der Katalog nicht kennt — sonst wäre es unfilterbar', () => {
    const facets = insightsRadarFacets([
      row({ videoId: 'a', topic: 'brand-strategy' }),
      row({ videoId: 'b', topic: 'was-auch-immer' }),
    ])
    expect(facets.topics).toEqual(['brand-strategy', 'was-auch-immer'])
  })

  it('sortiert Kanäle alphabetisch und nennt jeden einmal', () => {
    const facets = insightsRadarFacets([
      row({ videoId: 'a', channelTitle: 'Semrush' }),
      row({ videoId: 'b', channelTitle: 'Ahrefs' }),
      row({ videoId: 'c', channelTitle: 'Semrush' }),
    ])
    expect(facets.channels).toEqual(['Ahrefs', 'Semrush'])
  })

  it('nimmt leere Namen nicht in die Auswahl auf', () => {
    const facets = insightsRadarFacets([row({ videoId: 'a', topic: '', channelTitle: '' })])
    expect(facets.topics).toEqual([])
    expect(facets.channels).toEqual([])
  })
})

describe('die Kataloge selbst', () => {
  it('startet auf der Opportunity — das Bild von vor BI2 bleibt', () => {
    expect(INSIGHTS_RADAR_SORT_DEFAULT).toBe('opportunity')
    expect(INSIGHTS_RADAR_SORT_KEYS).toContain(INSIGHTS_RADAR_SORT_DEFAULT)
  })

  it('führt die `0` als „alle" an erster Stelle der Zeiträume', () => {
    expect(INSIGHTS_RADAR_RANGES[0]).toBe(0)
    expect(INSIGHTS_RADAR_RANGES).not.toContain('')
  })
})
