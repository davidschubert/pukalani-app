import { describe, expect, it } from 'vitest'
import { INSIGHTS_TOPIC_KEYS } from '../shared/insightsPost'
import {
  INSIGHTS_RADAR_MAX_VIDEO_AGE_CAP,
  INSIGHTS_RADAR_MAX_VIDEO_AGE_DEFAULT,
  INSIGHTS_RADAR_MAX_VIDEOS_CAP,
  INSIGHTS_RADAR_MAX_VIDEOS_DEFAULT,
  INSIGHTS_RADAR_RELEVANCE_BASE,
  INSIGHTS_TOPIC_KEYWORDS,
  insightsRadarClassify,
  insightsUploadsPlaylistId,
  readInsightsRadarConfig,
} from '../shared/insightsRadar'

/**
 * DIE REINEN REGELN DES RADARS (BI1 I4, §9.6).
 *
 * Sie brauchen einen Test, weil sie UNSERE Zahl mitbestimmen: die Relevanz ist
 * eines von drei Signalen der Opportunity, und eine Zahl, die wir gegenüber
 * Google als eigenes Ergebnis führen (Leitplanke a), muss reproduzierbar sein.
 * Jede Zusage hat deshalb eine GEGENPROBE — dass „seo" nicht in „season"
 * trifft, ist nur dann eine Aussage, wenn „SEO:" trifft.
 */

describe('insightsUploadsPlaylistId', () => {
  it('macht aus UC… die Uploads-Playlist UU…', () => {
    expect(insightsUploadsPlaylistId('UC-b3c7kxa5vU-bnmaROgvog')).toBe('UU-b3c7kxa5vU-bnmaROgvog')
  })

  it('weist alles ab, was keine Kanal-Id ist — Handle, Playlist, zu kurz', () => {
    expect(insightsUploadsPlaylistId('@thefutur')).toBeNull()
    expect(insightsUploadsPlaylistId('UU-b3c7kxa5vU-bnmaROgvog')).toBeNull()
    expect(insightsUploadsPlaylistId('UC-zu-kurz')).toBeNull()
    expect(insightsUploadsPlaylistId('')).toBeNull()
  })
})

describe('readInsightsRadarConfig', () => {
  /*
   * SEIT BI2 K3 LIEST DIESE FUNKTION NUR NOCH ZWEI DECKEL.
   *
   * Die Kanalliste ist aus der App-Config in die Tabelle `insights_channels`
   * gezogen (Davids Entscheidung 2026-09-09) — ihre Prüfungen (keine Id,
   * unbekanntes Cluster, Doppelte) leben jetzt in `readActiveRadarChannels`
   * und werden in `insightsChannel.test.ts` geprüft. Was hier bleibt, sind
   * Betriebsgrössen des LAUFS, keine redaktionellen Entscheidungen.
   */
  it('deckelt maxVideosPerChannel und fängt Unsinn ab', () => {
    const read = (value: unknown) => readInsightsRadarConfig({
      pukalani: { insights: { radar: { maxVideosPerChannel: value } } },
    }).maxVideos
    expect(read(5)).toBe(5)
    expect(read(999)).toBe(INSIGHTS_RADAR_MAX_VIDEOS_CAP)
    expect(read(0)).toBe(INSIGHTS_RADAR_MAX_VIDEOS_DEFAULT)
    expect(read(-3)).toBe(1)
    expect(read('zwanzig')).toBe(INSIGHTS_RADAR_MAX_VIDEOS_DEFAULT)
  })

  it('der Alters-Deckel: 180 Tage Vorgabe, höchstens ein Jahr, Unsinn fällt auf die Vorgabe', () => {
    const read = (value: unknown) => readInsightsRadarConfig({
      pukalani: { insights: { radar: { maxVideoAgeDays: value } } },
    }).maxVideoAgeDays
    expect(INSIGHTS_RADAR_MAX_VIDEO_AGE_DEFAULT).toBe(180)
    expect(readInsightsRadarConfig({}).maxVideoAgeDays).toBe(INSIGHTS_RADAR_MAX_VIDEO_AGE_DEFAULT)
    expect(read(90)).toBe(90)
    expect(read(3_000)).toBe(INSIGHTS_RADAR_MAX_VIDEO_AGE_CAP)
    expect(read(0)).toBe(INSIGHTS_RADAR_MAX_VIDEO_AGE_DEFAULT)
    expect(read(-1)).toBe(1)
    expect(read('ewig')).toBe(INSIGHTS_RADAR_MAX_VIDEO_AGE_DEFAULT)
  })

  it('gibt bei fehlender Konfiguration die Vorgaben, keinen Wurf', () => {
    expect(readInsightsRadarConfig(null).maxVideos).toBe(INSIGHTS_RADAR_MAX_VIDEOS_DEFAULT)
    expect(readInsightsRadarConfig({}).maxVideos).toBe(INSIGHTS_RADAR_MAX_VIDEOS_DEFAULT)
    expect(readInsightsRadarConfig({ pukalani: { insights: { radar: 'nein' } } }).maxVideos)
      .toBe(INSIGHTS_RADAR_MAX_VIDEOS_DEFAULT)
  })
})

describe('insightsRadarClassify', () => {
  it('ohne Treffer bleibt es beim Cluster des Kanals — mit dem Grundwert', () => {
    expect(insightsRadarClassify('Ein Gespräch über gar nichts', 'brand-strategy')).toEqual({
      topic: 'brand-strategy',
      relevance: INSIGHTS_RADAR_RELEVANCE_BASE,
    })
  })

  it('ein Treffer hebt die Relevanz und kann das Cluster umstellen', () => {
    const result = insightsRadarClassify('How to do keyword research in 2026', 'visual-identity')
    expect(result.topic).toBe('seo-geo')
    expect(result.relevance).toBeCloseTo(0.75)
  })

  it('mehr Treffer heben weiter — gedeckelt bei 1.0', () => {
    const result = insightsRadarClassify(
      'Logo, Typography, Color and Brand Identity: a style guide walkthrough',
      'brand-strategy',
    )
    expect(result.topic).toBe('visual-identity')
    expect(result.relevance).toBe(1)
  })

  it('GEGENPROBE Wortgrenzen: „seo" trifft nicht in „season", wohl aber als Wort', () => {
    expect(insightsRadarClassify('Season two of our podcast', 'brand-strategy').topic).toBe('brand-strategy')
    expect(insightsRadarClassify('SEO: what changed', 'brand-strategy').topic).toBe('seo-geo')
    // Ein Bindestrich beendet ein Wort, ein Buchstabe nicht — „SEO-Grundlagen"
    // trifft, „season" nicht. (Ein deutsches Kompositum OHNE Trennzeichen
    // trifft folgerichtig auch nicht: „Markenstrategie" steht deshalb als
    // eigenes Schlagwort in der Liste.)
    expect(insightsRadarClassify('SEO-Grundlagen erklärt', 'brand-strategy').topic).toBe('seo-geo')
    expect(insightsRadarClassify('Markenstrategie in zehn Minuten', 'visual-identity').topic).toBe('brand-strategy')
  })

  it('bei Gleichstand gewinnt das Cluster des KANALS', () => {
    // „new logo" (rebranding) und „logo" (visual-identity) — je ein Treffer.
    expect(insightsRadarClassify('A new logo', 'rebranding').topic).toBe('rebranding')
    expect(insightsRadarClassify('A new logo', 'visual-identity').topic).toBe('visual-identity')
  })

  it('bei Gleichstand OHNE das Kanal-Cluster entscheidet die Katalog-Reihenfolge — deterministisch', () => {
    const first = insightsRadarClassify('A new logo', 'seo-geo')
    const second = insightsRadarClassify('A new logo', 'seo-geo')
    expect(first).toEqual(second)
    // `rebranding` steht im Katalog vor `visual-identity`.
    expect(first.topic).toBe('rebranding')
  })

  it('zählt jedes Schlagwort höchstens einmal — Wiederholung ist keine Breite', () => {
    const once = insightsRadarClassify('Logo talk', 'brand-strategy')
    const thrice = insightsRadarClassify('Logo logo logo', 'brand-strategy')
    expect(thrice.relevance).toBe(once.relevance)
  })
})

describe('INSIGHTS_TOPIC_KEYWORDS', () => {
  it('deckt jedes der acht Cluster ab — ein leeres Cluster wäre ein totes Signal', () => {
    for (const key of INSIGHTS_TOPIC_KEYS) {
      expect(INSIGHTS_TOPIC_KEYWORDS[key]!.length).toBeGreaterThan(0)
    }
  })

  it('ist durchgehend kleingeschrieben — der Vergleich läuft auf Kleinschreibung', () => {
    for (const key of INSIGHTS_TOPIC_KEYS) {
      for (const word of INSIGHTS_TOPIC_KEYWORDS[key]!) {
        expect(word).toBe(word.toLowerCase())
      }
    }
  })
})
