import type { Models } from 'node-appwrite'
import { describe, expect, it } from 'vitest'
import type { InsightsBrand, InsightsPost } from '../shared/insightsPost'
import { INSIGHTS_SLUG_HISTORY_MAX, insightsSlugHistoryPush } from '../shared/insightsPost'
import type { InsightsBrandRow, InsightsCorrectionRow, InsightsPostRow, InsightsTopicRow } from '../shared/insightsRows'
import {
  INSIGHTS_BRANDS_TABLE,
  INSIGHTS_CORRECTIONS_TABLE,
  INSIGHTS_POSTS_TABLE,
  INSIGHTS_TOPICS_TABLE,
  fromInsightsBrand,
  fromInsightsPost,
  fromInsightsRadarVideo,
  toInsightsBrand,
  toInsightsCorrectionListItem,
  toInsightsPost,
  toInsightsRadarVideo,
} from '../shared/insightsRows'
import { INSIGHTS_RADAR_TOPIC_FALLBACK } from '../shared/insightsRadar'

/**
 * DIE RUNDREISE ZEILE ⇄ VERTRAG (Migrationen insights-001…003).
 *
 * Warum sie einen Test braucht: hier gehen sieben JSON-Spalten durch
 * `JSON.parse`/`JSON.stringify`, und ein stiller Verlust darin fiele erst auf
 * einer öffentlichen Seite auf — bei einem Produkt, dessen ganzer Anspruch
 * „jede Aussage mit ihrer Quelle" ist, wäre eine verlorene Quellenliste der
 * teuerste denkbare Fehler.
 *
 * Jede Fail-soft-Zusage hat eine GEGENPROBE: dass kaputtes JSON eine leere
 * Liste ergibt, ist nur dann eine Aussage, wenn gutes JSON die volle liefert.
 */

/** Die `$`-Attribute, die Appwrite an jede Zeile hängt. */
const rowMeta: Models.Row = {
  $id: 'row-1',
  $sequence: '1',
  $tableId: INSIGHTS_POSTS_TABLE,
  $databaseId: 'db',
  $createdAt: '2026-09-09T00:00:00.000Z',
  $updatedAt: '2026-09-09T00:00:00.000Z',
  $permissions: [],
}

function duelPost(): InsightsPost {
  return {
    format: 'duel',
    slug: 'island-grind-vs-kona-trading',
    slugHistory: ['kona-vs-island'],
    state: 'published',
    baseLocale: 'de',
    titleDe: 'Island Grind gegen Kona Trading',
    titleEn: 'Island Grind versus Kona Trading',
    dekDe: 'Zwei Röster, ein Feld.',
    dekEn: 'Two roasters, one field.',
    bodyDe: '## Vergleich',
    bodyEn: '## Comparison',
    translatedAt: '2026-09-08T10:00:00.000Z',
    translationModel: 'gemini-2.5-flash',
    translationPromptVersion: 'insights-t-1',
    translationReviewed: true,
    topics: ['brand-analysis'],
    sources: [{
      url: 'https://island-grind.example/about',
      publisher: 'Island Grind',
      date: '2026-08-01',
      kind: 'brand-site',
      quote: 'Wir rösten seit 1998 auf Maui.',
      license: '',
    }],
    brandRefs: [{ brandId: 'b-1', checkId: 'c-1', libraryKey: '', publicationId: '' }],
    facts: [{
      key: 'founded',
      labelDe: 'Gegründet',
      labelEn: 'Founded',
      left: '1998',
      right: '2011',
      winner: 'left',
      sourceIndex: 0,
    }],
    ranking: null,
    readingMinutes: 4,
    publishedAt: '2026-09-09T08:00:00.000Z',
    reviewedAt: '2026-09-09T07:00:00.000Z',
    reviewedBy: 'user-1',
    noteInternal: 'Zahlen am 09.09. geprüft.',
    // Der Brief und seine Herkunft (K5) — sie gehören zur Rundreise, weil
    // genau hier auffallen soll, wenn eine neue Spalte nur in EINE Richtung
    // abgebildet wird.
    brief: '## Worum es geht\nZwei Marken, eine Dimension.',
    briefModel: 'google/gemini-3.1-flash-lite',
    briefPromptVersion: 'insights-b-1',
    briefVideoId: 'jNQXAC9IVRw',
    draftModel: 'gemini-2.5-flash',
    draftPromptVersion: 'insights-d-1',
  }
}

function rankingPost(): InsightsPost {
  return {
    ...duelPost(),
    format: 'ranking',
    slug: 'roester-ranking-2026',
    facts: [],
    ranking: {
      issue: 1,
      asOf: '2026-09-01',
      entries: [
        { rank: 1, brandId: 'b-1', checkId: 'c-1', score: 88, reasonDe: 'Klare Stimme.', reasonEn: 'Clear voice.', removed: false },
        { rank: 2, brandId: '', checkId: '', score: 0, reasonDe: '', reasonEn: '', removed: true },
      ],
    },
  }
}

describe('Tabellennamen', () => {
  it('stehen an EINER Stelle und heissen wie in den Migrationen', () => {
    expect(INSIGHTS_POSTS_TABLE).toBe('insights_posts')
    expect(INSIGHTS_BRANDS_TABLE).toBe('insights_brands')
    expect(INSIGHTS_CORRECTIONS_TABLE).toBe('insights_corrections')
  })
})

describe('Beitrag: Zeile ⇄ Vertrag', () => {
  it('überlebt die Rundreise als DUELL vollständig', () => {
    const post = duelPost()
    const row: InsightsPostRow = { ...rowMeta, ...fromInsightsPost(post) } as InsightsPostRow
    expect(toInsightsPost(row)).toEqual(post)
  })

  it('überlebt die Rundreise als RANKING vollständig — inklusive der Lücke', () => {
    const post = rankingPost()
    const row: InsightsPostRow = { ...rowMeta, ...fromInsightsPost(post) } as InsightsPostRow
    const back = toInsightsPost(row)
    expect(back).toEqual(post)
    expect(back.ranking?.entries[1]?.removed).toBe(true)
  })

  it('legt Duell-Zeilen und Ranking in DIESELBE Spalte, unterschieden durch die Form', () => {
    expect(fromInsightsPost(duelPost()).facts?.startsWith('[')).toBe(true)
    expect(fromInsightsPost(rankingPost()).facts?.startsWith('{')).toBe(true)
  })

  it('macht aus leeren Datums-Feldern `null` — datetime verträgt kein ""', () => {
    const row = fromInsightsPost({ ...duelPost(), publishedAt: '', reviewedAt: '', translatedAt: '' })
    expect(row.publishedAt).toBeNull()
    expect(row.reviewedAt).toBeNull()
    expect(row.translatedAt).toBeNull()
  })

  it('GEGENPROBE: kaputtes JSON ergibt leere Listen statt eines Absturzes', () => {
    const row = {
      ...rowMeta,
      format: 'article',
      slug: 'kaputt',
      state: 'draft',
      baseLocale: 'de',
      sources: '{nicht json',
      brandRefs: 'auch nicht',
      slugHistory: '',
      facts: '<<<',
      topics: 'null',
    } as InsightsPostRow
    const post = toInsightsPost(row)
    expect(post.sources).toEqual([])
    expect(post.brandRefs).toEqual([])
    expect(post.slugHistory).toEqual([])
    expect(post.facts).toEqual([])
    expect(post.ranking).toBeNull()
    expect(post.topics).toEqual([])
  })

  it('fängt unbekannte Aufzählungswerte in die SICHERE Richtung ab', () => {
    const row = {
      ...rowMeta,
      format: 'podcast',
      slug: 'x',
      state: 'live',
      baseLocale: 'fr',
    } as InsightsPostRow
    const post = toInsightsPost(row)
    // `draft` ist NICHT öffentlich — der Fallback darf nie veröffentlichen.
    expect(post.state).toBe('draft')
    expect(post.format).toBe('article')
    expect(post.baseLocale).toBe('en')
  })

  it('wirft unbekannte Themen-Schlüssel weg, statt den Typ zu brechen', () => {
    const row = { ...rowMeta, format: 'article', slug: 'x', state: 'draft', baseLocale: 'de', topics: '["rebranding","gibt-es-nicht"]' } as InsightsPostRow
    expect(toInsightsPost(row).topics).toEqual(['rebranding'])
  })
})

describe('Markenprofil: Zeile ⇄ Vertrag', () => {
  function brand(): InsightsBrand {
    return {
      slug: 'island-grind',
      slugHistory: ['island-grind-coffee'],
      name: 'Island Grind',
      homepage: 'https://island-grind.example',
      libraryKey: 'island-grind',
      checkId: 'c-1',
      publicationId: '',
      industry: 'gastronomy',
      country: 'us',
      foundedYear: 1998,
      archetype: 'creator',
      archetypeSecondary: '',
      paletteId: 'lagoon',
      marks: [{ kind: 'claim', text: 'Slow roast, small island.', sourceIndex: 0 }],
      history: [{ year: 1998, text: 'Erste Rösterei in Makawao.', sourceIndex: 0 }],
      relations: ['b-2'],
      sources: [{
        url: 'https://island-grind.example/about',
        publisher: 'Island Grind',
        date: '2026-08-01',
        kind: 'brand-site',
        quote: 'Slow roast, small island.',
        license: '',
      }],
      state: 'published',
      removedAt: '',
      removalReason: '',
      claimedBy: '',
    }
  }

  it('überlebt die Rundreise vollständig', () => {
    const value = brand()
    const row = { ...rowMeta, $tableId: INSIGHTS_BRANDS_TABLE, ...fromInsightsBrand(value) } as InsightsBrandRow
    expect(toInsightsBrand(row)).toEqual(value)
  })

  it('bildet ein unbekanntes Gründungsjahr auf `null` ab, nicht auf 0', () => {
    const value = { ...brand(), foundedYear: null }
    const row = { ...rowMeta, $tableId: INSIGHTS_BRANDS_TABLE, ...fromInsightsBrand(value) } as InsightsBrandRow
    expect(row.foundedYear).toBe(0)
    expect(toInsightsBrand(row).foundedYear).toBeNull()
  })

  it('fängt einen unbekannten Zustand als `draft` ab — nicht als `published`', () => {
    const row = { ...rowMeta, $tableId: INSIGHTS_BRANDS_TABLE, slug: 'x', name: 'X', state: 'live' } as InsightsBrandRow
    expect(toInsightsBrand(row).state).toBe('draft')
  })
})

describe('insightsSlugHistoryPush', () => {
  it('reiht den alten Slug VORN ein', () => {
    expect(insightsSlugHistoryPush(['b'], 'a')).toEqual(['a', 'b'])
  })

  it('entfernt Duplikate, statt einen der fünf Plätze zu verbrauchen', () => {
    expect(insightsSlugHistoryPush(['b', 'a', 'c'], 'a')).toEqual(['a', 'b', 'c'])
  })

  it('der SECHSTE Eintrag verdrängt den ältesten', () => {
    const five = ['e4', 'e3', 'e2', 'e1', 'e0']
    const six = insightsSlugHistoryPush(five, 'e5')
    expect(six).toEqual(['e5', 'e4', 'e3', 'e2', 'e1'])
    expect(six).toHaveLength(INSIGHTS_SLUG_HISTORY_MAX)
    expect(six).not.toContain('e0')
  })

  it('GEGENPROBE: ein leerer alter Slug ändert nichts', () => {
    expect(insightsSlugHistoryPush(['a'], '')).toEqual(['a'])
    expect(insightsSlugHistoryPush(['a'], '   ')).toEqual(['a'])
  })

  it('GEGENPROBE: derselbe Slug zweimal bewegt die Liste nicht', () => {
    expect(insightsSlugHistoryPush(['a', 'b'], 'a')).toEqual(['a', 'b'])
  })

  it('lässt die übergebene Liste unangetastet', () => {
    const history = ['a']
    insightsSlugHistoryPush(history, 'b')
    expect(history).toEqual(['a'])
  })
})

describe('Themenradar: Zeile ⇄ Vertrag (insights-004)', () => {
  const radarMeta: Models.Row = { ...rowMeta, $id: 'radar-1', $tableId: INSIGHTS_TOPICS_TABLE }

  function fullRow(extra: Partial<InsightsTopicRow> = {}): InsightsTopicRow {
    return {
      ...radarMeta,
      videoId: 'vid-1',
      channelId: 'UC-b3c7kxa5vU-bnmaROgvog',
      channelTitle: 'The Futur',
      channelSubscribers: 1_000_000,
      title: 'Brand strategy for beginners',
      views: 50_000,
      likes: 900,
      commentCount: 30,
      publishedAt: '2026-09-01T10:00:00.000Z',
      fetchedAt: '2026-09-09T00:00:00.000Z',
      topic: 'brand-strategy',
      relevance: 0.75,
      opportunity: 61,
      opportunitySignals: 3,
      ...extra,
    }
  }

  it('liest die Zahlen und schneidet die Datumswerte auf den KALENDERTAG', () => {
    const video = toInsightsRadarVideo(fullRow())
    expect(video).toEqual({
      videoId: 'vid-1',
      channelId: 'UC-b3c7kxa5vU-bnmaROgvog',
      channelTitle: 'The Futur',
      channelSubscribers: 1_000_000,
      title: 'Brand strategy for beginners',
      views: 50_000,
      likes: 900,
      commentCount: 30,
      publishedAt: '2026-09-01',
      fetchedAt: '2026-09-09',
      topic: 'brand-strategy',
      relevance: 0.75,
      opportunity: 61,
      opportunitySignals: 3,
    })
  })

  it('die Rundreise hält — der Kalendertag geht als UTC-Mitternacht zurück', () => {
    const back = fromInsightsRadarVideo(toInsightsRadarVideo(fullRow()))
    expect(back.publishedAt).toBe('2026-09-01T00:00:00.000Z')
    expect(back.fetchedAt).toBe('2026-09-09T00:00:00.000Z')
    expect(back.videoId).toBe('vid-1')
    expect(back.opportunity).toBe(61)
  })

  it('KEINE ZAHL BLEIBT KEINE ZAHL: `opportunity` fällt auf null, nicht auf 0', () => {
    expect(toInsightsRadarVideo(fullRow({ opportunity: undefined })).opportunity).toBeNull()
    expect(toInsightsRadarVideo(fullRow({ opportunity: null })).opportunity).toBeNull()
    // GEGENPROBE: eine echte 0 überlebt als 0 — sie ist eine Messung.
    expect(toInsightsRadarVideo(fullRow({ opportunity: 0 })).opportunity).toBe(0)
  })

  it('fail-soft: unbekanntes Cluster, fehlende Zahlen, leere Daten reissen nichts mit', () => {
    const video = toInsightsRadarVideo(fullRow({
      topic: 'gab-es-mal',
      channelSubscribers: undefined,
      views: undefined,
      likes: undefined,
      commentCount: undefined,
      relevance: undefined,
      opportunitySignals: undefined,
      publishedAt: null,
      fetchedAt: null,
    }))
    // Der Ersatzwert ist hier bewusst der WEITESTE (Begründung in insightsRadar.ts).
    expect(video.topic).toBe(INSIGHTS_RADAR_TOPIC_FALLBACK)
    expect(video.channelSubscribers).toBe(0)
    expect(video.views).toBe(0)
    expect(video.relevance).toBe(0)
    expect(video.publishedAt).toBe('')
    expect(video.fetchedAt).toBe('')
  })

  it('klemmt Werte, die ausserhalb ihrer Skala liegen', () => {
    const video = toInsightsRadarVideo(fullRow({ relevance: 4.2, opportunity: 999, views: -5 }))
    expect(video.relevance).toBe(1)
    expect(video.opportunity).toBe(100)
    expect(video.views).toBe(0)
  })

  it('kürzt zu lange Zeichenketten auf die Spaltenbreite', () => {
    const back = fromInsightsRadarVideo(toInsightsRadarVideo(fullRow({
      title: 'x'.repeat(400),
      channelTitle: 'y'.repeat(400),
    })))
    expect(back.title).toHaveLength(300)
    expect(back.channelTitle).toHaveLength(160)
  })
})


/**
 * DER ARBEITSLISTEN-EINTRAG EINES KORREKTURVORSCHLAGS (BI1 I2-Rest).
 *
 * Er gibt EIN Versprechen ab, und genau darum steht er in einer puren Datei:
 * die Kontakt-Adresse — das einzige personenbezogene Feld dieses Layers
 * (§9.3) — verlässt den Server NICHT, nur ihr Vorhandensein tut es. Eine
 * Prüfung, die nur `hasContact === true` kennt, wäre auch dann grün, wenn die
 * Adresse gleich daneben im Objekt stünde; deshalb prüft der Test BEIDES: das
 * Häkchen und die Abwesenheit des Feldes.
 */
const correctionMeta: Models.Row = {
  ...rowMeta,
  $id: 'corr-1',
  $tableId: INSIGHTS_CORRECTIONS_TABLE,
  $createdAt: '2026-09-01T08:00:00.000Z',
}

function correctionRow(extra: Partial<InsightsCorrectionRow> = {}): InsightsCorrectionRow {
  return {
    ...correctionMeta,
    targetKind: 'brand',
    targetId: 'brand-1',
    kind: 'correction',
    field: 'foundedYear',
    proposed: '1994',
    reason: 'Die Rösterei gibt es seit 1994, nicht seit 1999.',
    status: 'open',
    decisionNote: '',
    ...extra,
  }
}

describe('toInsightsCorrectionListItem', () => {
  it('sagt, DASS ein Kontakt hinterlegt ist — und schickt die Adresse NICHT mit', () => {
    const item = toInsightsCorrectionListItem(correctionRow({ contactEmail: 'max@example.com' }))
    expect(item.hasContact).toBe(true)
    // Das eigentliche Versprechen: kein Feld, nicht nur kein Wert.
    expect(Object.keys(item)).not.toContain('contactEmail')
    expect(JSON.stringify(item)).not.toContain('example.com')
  })

  it('GEGENPROBE: ohne Adresse ist `hasContact` falsch', () => {
    expect(toInsightsCorrectionListItem(correctionRow()).hasContact).toBe(false)
    expect(toInsightsCorrectionListItem(correctionRow({ contactEmail: '' })).hasContact).toBe(false)
  })

  it('GEGENPROBE: eine GELEERTE Adresse (Retention-Sweep) zählt als kein Kontakt', () => {
    const swept = correctionRow({ contactEmail: '', ipHash: '', retentionAt: null })
    expect(toInsightsCorrectionListItem(swept).hasContact).toBe(false)
  })

  it('trägt Id, Eingangsdatum und den Ziel-Namen', () => {
    const item = toInsightsCorrectionListItem(correctionRow(), 'Upcountry Roasters')
    expect(item.id).toBe('corr-1')
    expect(item.createdAt).toBe('2026-09-01T08:00:00.000Z')
    expect(item.targetLabel).toBe('Upcountry Roasters')
    expect(item.decidedAt).toBe('')
  })

  it('GEGENPROBE: ohne auflösbares Ziel bleibt das Etikett LEER (die Seite zeigt dann die Id)', () => {
    expect(toInsightsCorrectionListItem(correctionRow()).targetLabel).toBe('')
  })

  it('reicht die Entscheidung samt Zeitpunkt durch', () => {
    const item = toInsightsCorrectionListItem(correctionRow({
      status: 'declined',
      decisionNote: 'Der Beleg nennt 1999.',
      decidedAt: '2026-09-05T10:00:00.000Z',
    }))
    expect(item.status).toBe('declined')
    expect(item.decisionNote).toBe('Der Beleg nennt 1999.')
    expect(item.decidedAt).toBe('2026-09-05T10:00:00.000Z')
  })

  it('GEGENPROBE: ein unbekannter Status fällt auf `open` — nicht ins Nichts', () => {
    expect(toInsightsCorrectionListItem(correctionRow({ status: 'erledigt' })).status).toBe('open')
  })
})
