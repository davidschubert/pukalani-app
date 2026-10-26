import { describe, expect, it } from 'vitest'
import {
  INSIGHTS_RADAR_VERDICT_DEFAULT,
  INSIGHTS_VERDICTS,
  INSIGHTS_VERDICT_FALLBACK,
  INSIGHTS_WATCHLIST_MAX,
  INSIGHTS_WATCH_NOTE_MAX,
  insightsVerdictPasses,
  insightsVideoUrl,
  insightsWatchAddSchema,
  insightsWatchFromRadar,
  insightsWatchPatchSchema,
  insightsWatchVerdictSchema,
  insightsWatchVideoId,
} from '../shared/insightsWatchlist'
import { fromInsightsWatchItem, toInsightsWatchItem } from '../shared/insightsRows'
import type { InsightsWatchRow } from '../shared/insightsRows'
import { INSIGHTS_TOPIC_KEYS } from '../shared/insightsPost'
import type { InsightsRadarVideo } from '../shared/insightsPost'

/**
 * DIE REINEN REGELN DER EIGENEN VIDEO-LISTE (BI2 K4).
 *
 * Drei Zusagen tragen dieses Paket, und alle drei hält kein Typ:
 *  1. WAS EIN MENSCH EINFÜGT, wird gelesen — jede YouTube-Adressform, und
 *     NICHTS, was kein Video ist.
 *  2. „NICHT GEPRÜFT" IST DER ERSATZWERT. Ein geratenes „interessant" schöbe
 *     ein Video in eine Vorauswahl, die niemand getroffen hat.
 *  3. DER RADAR BLENDET AUS, was als uninteressant abgehakt ist — sonst wäre
 *     das Urteil eine Geste ohne Wirkung.
 */

describe('insightsWatchVideoId', () => {
  const ID = 'dQw4w9WgXcQ'

  it('liest die nackte Id', () => {
    expect(insightsWatchVideoId(ID)).toBe(ID)
  })

  it('liest jede Adressform, die beim Kopieren entsteht', () => {
    expect(insightsWatchVideoId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID)
    expect(insightsWatchVideoId(`https://youtu.be/${ID}`)).toBe(ID)
    expect(insightsWatchVideoId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID)
    expect(insightsWatchVideoId(`https://www.youtube.com/live/${ID}`)).toBe(ID)
    expect(insightsWatchVideoId(`https://www.youtube.com/embed/${ID}`)).toBe(ID)
    expect(insightsWatchVideoId(`youtube.com/watch?v=${ID}`)).toBe(ID)
    expect(insightsWatchVideoId(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID)
  })

  it('übersteht die Anhängsel, die beim Teilen mitkommen', () => {
    expect(insightsWatchVideoId(`https://youtu.be/${ID}?si=AbC-123&t=42`)).toBe(ID)
    expect(insightsWatchVideoId(`https://www.youtube.com/watch?v=${ID}&list=PLxyz&index=3`)).toBe(ID)
  })

  it('lehnt ab, was kein Video ist', () => {
    expect(insightsWatchVideoId('')).toBeNull()
    expect(insightsWatchVideoId('   ')).toBeNull()
    // Eine PLAYLIST ohne Video — hier etwas zu nehmen hiesse, ein Video
    // abzulegen, das niemand gemeint hat.
    expect(insightsWatchVideoId('https://www.youtube.com/playlist?list=PLxyz')).toBeNull()
    expect(insightsWatchVideoId('https://www.youtube.com/@thefutur')).toBeNull()
    expect(insightsWatchVideoId('https://vimeo.com/123456')).toBeNull()
    // Eine Id hat GENAU elf Zeichen.
    expect(insightsWatchVideoId('dQw4w9WgXc')).toBeNull()
    expect(insightsWatchVideoId('dQw4w9WgXcQQ')).toBeNull()
  })

  it('rechnet die Adresse aus der Id, statt sie zu speichern', () => {
    expect(insightsVideoUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`)
  })
})

describe('das Urteil', () => {
  it('hat drei Stellungen, und „nicht geprüft" ist eine davon', () => {
    expect(INSIGHTS_VERDICTS).toEqual(['unrated', 'uninteresting', 'interesting'])
  })

  it('fällt auf „nicht geprüft" zurück — nie auf „interessant"', () => {
    expect(INSIGHTS_VERDICT_FALLBACK).toBe('unrated')
  })
})

describe('insightsVerdictPasses — was der Radar zeigt', () => {
  it('blendet standardmässig das Abgehakte aus', () => {
    expect(INSIGHTS_RADAR_VERDICT_DEFAULT).toBe('without-uninteresting')
    expect(insightsVerdictPasses('unrated', 'without-uninteresting')).toBe(true)
    expect(insightsVerdictPasses('interesting', 'without-uninteresting')).toBe(true)
    // Der Punkt der Vorgabe: einmal abgehakt, morgen nicht wieder oben.
    expect(insightsVerdictPasses('uninteresting', 'without-uninteresting')).toBe(false)
  })

  it('zeigt bei „nur Interessante" genau die — die Vorauswahl', () => {
    expect(insightsVerdictPasses('interesting', 'interesting')).toBe(true)
    expect(insightsVerdictPasses('unrated', 'interesting')).toBe(false)
    expect(insightsVerdictPasses('uninteresting', 'interesting')).toBe(false)
  })

  it('lässt bei „alle" alles durch — auch das eigene Nein', () => {
    for (const verdict of INSIGHTS_VERDICTS) {
      expect(insightsVerdictPasses(verdict, 'all')).toBe(true)
    }
  })
})

describe('die Formulare', () => {
  it('nimmt die rohe Eingabe an und setzt „nicht geprüft" als Vorgabe', () => {
    const ok = insightsWatchAddSchema.safeParse({ input: 'https://youtu.be/dQw4w9WgXcQ' })
    expect(ok.success).toBe(true)
    expect(ok.success && ok.data.verdict).toBe('unrated')
    expect(ok.success && ok.data.note).toBe('')
    expect(ok.success && ok.data.topic).toBeUndefined()
  })

  it('deckelt die Notiz', () => {
    const tooLong = { input: 'dQw4w9WgXcQ', note: 'x'.repeat(INSIGHTS_WATCH_NOTE_MAX + 1) }
    expect(insightsWatchAddSchema.safeParse(tooLong).success).toBe(false)
  })

  it('ändert nur, was einem Menschen gehört — und verlangt mindestens eines', () => {
    expect(insightsWatchPatchSchema.safeParse({ verdict: 'interesting' }).success).toBe(true)
    expect(insightsWatchPatchSchema.safeParse({ note: 'für den Artikel' }).success).toBe(true)
    expect(insightsWatchPatchSchema.safeParse({ topic: 'seo-geo' }).success).toBe(true)
    expect(insightsWatchPatchSchema.safeParse({}).success).toBe(false)
    // Die Zahlen gehören der API, nicht dem Formular.
    const withViews = insightsWatchPatchSchema.safeParse({ verdict: 'interesting', views: 99 })
    expect(withViews.success && 'views' in withViews.data).toBe(false)
  })

  it('das Radar-Urteil verlangt eine echte Video-Id', () => {
    expect(insightsWatchVerdictSchema.safeParse({ videoId: 'dQw4w9WgXcQ', verdict: 'interesting' }).success).toBe(true)
    expect(insightsWatchVerdictSchema.safeParse({ videoId: 'zu-kurz', verdict: 'interesting' }).success).toBe(false)
    expect(insightsWatchVerdictSchema.safeParse({ videoId: 'dQw4w9WgXcQ', verdict: 'vielleicht' }).success).toBe(false)
  })
})

describe('insightsWatchFromRadar', () => {
  const video: InsightsRadarVideo = {
    videoId: 'dQw4w9WgXcQ',
    channelId: 'UC-b3c7kxa5vU-bnmaROgvog',
    channelTitle: 'The Futur',
    channelSubscribers: 1_000_000,
    title: 'Why positioning beats design',
    views: 58_400,
    likes: 3_100,
    commentCount: 214,
    publishedAt: '2026-10-01',
    fetchedAt: '2026-10-25',
    topic: 'brand-strategy',
  }

  it('übernimmt die Zahlen der Radar-Zeile, ohne die API zu fragen', () => {
    const item = insightsWatchFromRadar(video, 'interesting', '2026-10-25T08:00:00.000Z')
    expect(item).toMatchObject({
      videoId: 'dQw4w9WgXcQ',
      verdict: 'interesting',
      topic: 'brand-strategy',
      title: 'Why positioning beats design',
      views: 58_400,
      available: true,
    })
    // Die Notiz gehört dem Menschen und beginnt leer.
    expect(item.note).toBe('')
  })
})

describe('Zeile ⇄ Vertrag', () => {
  const row = (extra: Partial<InsightsWatchRow> = {}): InsightsWatchRow => ({
    $id: 'row-1',
    $sequence: 1,
    $tableId: 'insights_watchlist',
    $databaseId: 'main',
    $createdAt: '2026-10-25T08:00:00.000Z',
    $updatedAt: '2026-10-25T08:00:00.000Z',
    $permissions: [],
    videoId: 'dQw4w9WgXcQ',
    verdict: 'interesting',
    note: 'Aufhänger für den GEO-Artikel',
    topic: 'seo-geo',
    addedAt: '2026-10-25T08:00:00.000Z',
    available: true,
    refreshedAt: '2026-10-25T09:00:00.000Z',
    title: 'Do AI assistants read your site?',
    channelId: 'UCWquNQV8Y0_defMKnGKrFOQ',
    channelTitle: 'Ahrefs',
    channelSubscribers: 520_000,
    views: 44_100,
    likes: 2_600,
    commentCount: 331,
    publishedAt: '2026-10-18T00:00:00.000Z',
    ...extra,
  } as InsightsWatchRow)

  it('liest eine vollständige Zeile', () => {
    const item = toInsightsWatchItem(row())
    expect(item.verdict).toBe('interesting')
    expect(item.note).toBe('Aufhänger für den GEO-Artikel')
    expect(item.publishedAt).toBe('2026-10-18')
    expect(item.available).toBe(true)
  })

  it('ein unbekanntes Urteil wird „nicht geprüft", kein geratenes Ja', () => {
    expect(toInsightsWatchItem(row({ verdict: 'gab-es-mal' })).verdict).toBe('unrated')
  })

  it('ein unbekanntes Cluster wird zur Rubrik, nicht zur Ausnahme', () => {
    expect(INSIGHTS_TOPIC_KEYS).toContain(toInsightsWatchItem(row({ topic: 'erfunden' })).topic)
  })

  it('eine Zeile ohne `available` gilt als da — nicht als gelöschtes Video', () => {
    expect(toInsightsWatchItem(row({ available: undefined as unknown as boolean })).available).toBe(true)
    expect(toInsightsWatchItem(row({ available: false })).available).toBe(false)
  })

  it('fällt für `addedAt` auf die Anlage der Zeile zurück', () => {
    expect(toInsightsWatchItem(row({ addedAt: null })).addedAt).toBe('2026-10-25T08:00:00.000Z')
  })

  it('schreibt den Kalendertag wieder als UTC-Mitternacht, leer als `null`', () => {
    expect(fromInsightsWatchItem(toInsightsWatchItem(row())).publishedAt).toBe('2026-10-18T00:00:00.000Z')
    expect(fromInsightsWatchItem(toInsightsWatchItem(row({ publishedAt: null }))).publishedAt).toBeNull()
  })

  it('schneidet überlange Felder, statt sie abzuweisen', () => {
    const written = fromInsightsWatchItem({
      ...toInsightsWatchItem(row()),
      note: 'x'.repeat(INSIGHTS_WATCH_NOTE_MAX + 50),
      title: 'y'.repeat(600),
    })
    expect(written.note).toHaveLength(INSIGHTS_WATCH_NOTE_MAX)
    expect(written.title).toHaveLength(300)
  })
})

describe('die Deckel', () => {
  it('trägt zweihundert Fundstücke — vier Stapel à 50, also vier Einheiten je Lauf', () => {
    expect(INSIGHTS_WATCHLIST_MAX).toBe(200)
    expect(INSIGHTS_WATCHLIST_MAX % 50).toBe(0)
  })
})
