import { describe, expect, it } from 'vitest'
import {
  DEMO_BRANDS,
  DEMO_DRAFT,
  DEMO_FLAG_WORDS,
  DEMO_POSTS,
  DEMO_RADAR,
  DEMO_RELEVANCE,
  DEMO_SOURCE_TEXTS,
  demoBrand,
  demoScore,
} from '../.playground/app/utils/demoInsights'
import {
  INSIGHTS_QUOTE_MAX,
  INSIGHTS_RANKING_PLACES,
  insightsBrandSchema,
  insightsPostSchema,
  insightsOpportunity,
  insightsPopularity,
  insightsReviewIssues,
} from '../shared/insightsPost'
import { evidenceIsGrounded } from '../../core/shared/evidenceGrounding'

/**
 * DIE DEMO-DATEN GEGEN DEN VERTRAG (Plan §9.9, Paket I0).
 *
 * Der Prototyp behauptet, die Datenformen aus §9.3 zu tragen. Dieser Test ist
 * der Beweis: jede Zeile geht durch dasselbe Schema, das I1 in die Tabellen
 * schreibt. Ohne ihn wäre „echte Datenformen" eine Zusage im Kopf des
 * Dokuments und sonst nirgends.
 *
 * DAZU EIN ZWEITER BEWEIS, der dem Marktvergleich abgeschaut ist
 * (`demoEvidence.test.ts`): die Zitate der Demo-Quellen stehen WÖRTLICH in
 * den Demo-Rohtexten — bis auf das eine, das absichtlich falsch ist. Wer hier
 * einen Satz ändert, ohne den anderen mitzuziehen, baut genau die Lüge ein,
 * die das Produkt nie erzählen darf.
 *
 * GEPRÜFT WIRD MIT DEM ECHTEN RIEGEL (BI1 I1a). Bis dahin stand hier eine
 * eigene, case-INSENSITIVE Hilfsfunktion — sie war schwächer als die Regel des
 * Produkts, und ein Beweis, der milder prüft als die Wirklichkeit, ist keiner.
 */

describe('Demo-Daten', () => {
  it('validiert jeden Beitrag gegen den Vertrag', () => {
    expect(DEMO_POSTS.length).toBeGreaterThanOrEqual(8)
    for (const post of DEMO_POSTS) expect(insightsPostSchema.safeParse(post).success).toBe(true)
  })

  it('validiert jede Marken-Zeile gegen den Vertrag', () => {
    expect(DEMO_BRANDS.length).toBe(10)
    for (const brand of DEMO_BRANDS) expect(insightsBrandSchema.safeParse(brand).success).toBe(true)
  })

  it('zeigt alle vier Formate — sonst wäre der Prototyp keine Abnahme', () => {
    const formats = new Set(DEMO_POSTS.map(post => post.format))
    expect([...formats].sort()).toEqual(['article', 'duel', 'profile', 'ranking'])
  })

  it('zeigt den Zustand „zweite Fassung fehlt noch" mindestens einmal', () => {
    expect(DEMO_POSTS.some(post => !post.translationReviewed)).toBe(true)
  })

  it('hat ein Ranking mit zehn Plätzen und genau einer Lücke', () => {
    const ranking = DEMO_POSTS.find(post => post.format === 'ranking')?.ranking
    expect(ranking?.entries).toHaveLength(INSIGHTS_RANKING_PLACES)
    expect(ranking?.entries.filter(entry => entry.removed)).toHaveLength(1)
  })

  it('kennt zu jedem Ranking-Platz eine Marken-Zeile (Prüfregel 6)', () => {
    const ranking = DEMO_POSTS.find(post => post.format === 'ranking')?.ranking
    for (const entry of ranking?.entries ?? []) {
      if (entry.removed) continue
      expect(demoBrand(entry.brandId), entry.brandId).toBeDefined()
    }
  })

  it('hält jedes Zitat unter der Schranke', () => {
    for (const post of DEMO_POSTS) {
      for (const source of post.sources) expect(source.quote.length).toBeLessThanOrEqual(INSIGHTS_QUOTE_MAX)
    }
  })

  it('belegt jede Faktenzeile des Duells', () => {
    const duel = DEMO_POSTS.find(post => post.format === 'duel')
    expect(duel?.facts.length).toBeGreaterThan(0)
    for (const fact of duel?.facts ?? []) {
      expect(duel?.sources[fact.sourceIndex]).toBeDefined()
    }
  })

  it('stellt zu jeder bewerteten Marke acht Kategorien bereit', () => {
    for (const brand of DEMO_BRANDS) {
      if (!brand.checkId) continue
      const score = demoScore(brand.slug, 'de')
      expect(score?.dimensions, brand.slug).toHaveLength(8)
      expect(demoScore(brand.slug, 'en')?.score).toBe(score?.score)
    }
  })

  it('entfernt genau eine Marke auf Wunsch — mit Datum und Grund', () => {
    const removed = DEMO_BRANDS.filter(brand => brand.state === 'removed')
    expect(removed).toHaveLength(1)
    expect(removed[0]?.removalReason).not.toBe('')
    expect(removed[0]?.removedAt).not.toBe('')
  })
})

describe('Belege der Demo-Quellen', () => {
  it('findet jedes Zitat wörtlich in seinem Rohtext', () => {
    for (const post of DEMO_POSTS) {
      for (const source of post.sources) {
        if (!source.quote) continue
        const text = DEMO_SOURCE_TEXTS[source.url]
        if (!text) continue
        expect(evidenceIsGrounded({ quote: source.quote, pageText: text }), `${post.slug} · ${source.url}`).toBe(true)
      }
    }
  })

  it('GEGENPROBE: der Entwurf trägt bewusst ein Zitat, das nicht in der Quelle steht', () => {
    const source = DEMO_DRAFT.sources[0]
    expect(source).toBeDefined()
    expect(evidenceIsGrounded({ quote: source!.quote, pageText: DEMO_SOURCE_TEXTS[source!.url] ?? '' })).toBe(false)
  })
})

describe('Der Entwurf des Redaktions-Screens', () => {
  const issues = insightsReviewIssues(DEMO_DRAFT, {
    sourceTexts: DEMO_SOURCE_TEXTS,
    flagText: text => DEMO_FLAG_WORDS.filter(word => text.toLowerCase().includes(word)),
    knownBrandIds: DEMO_BRANDS.map(brand => brand.slug),
    methodologyLinked: true,
  })

  it('blockiert den Übergang in die Redaktion — und zwar aus drei verschiedenen Gründen', () => {
    const codes = new Set(issues.map(issue => issue.code))
    expect(codes.has('quote_not_grounded')).toBe(true)
    expect(codes.has('brand_without_entity')).toBe(true)
    expect(codes.has('disparagement')).toBe(true)
  })

  it('nennt zu jedem Befund die Stelle, nicht nur die Regel', () => {
    for (const issue of issues) {
      if (issue.code === 'score_without_methodology') continue
      expect(issue.at, issue.code).toBeDefined()
    }
  })
})

describe('Themenradar', () => {
  it('zeigt beide Belastbarkeiten — drei Signale UND zwei (Fussnote „aus n von 5")', () => {
    // Eine Fussnote, in der `n` nie schwankt, beweist nichts. Genau eine
    // Demo-Zeile hat deshalb kein Relevanz-Signal (DEMO_RELEVANCE), und die
    // Zahl wird dort aus zwei statt drei Signalen gerechnet — auf DERSELBEN
    // 100er-Skala, weil sonst zwei Zeilen unvergleichbar wären.
    const signale = DEMO_RADAR.map(video => insightsOpportunity({
      popularity: insightsPopularity(video.views, video.channelSubscribers),
      ageDays: 30,
      relevance: DEMO_RELEVANCE[video.videoId],
    }))
    expect(new Set(signale.map(s => s.signals))).toEqual(new Set([2, 3]))
    for (const s of signale) {
      expect(s.of).toBe(5)
      expect(s.score).not.toBeNull()
      expect(s.score!).toBeLessThanOrEqual(100)
    }
  })

  it('speichert je Video nur die erlaubten Zahlen (§9.6 a)', () => {
    expect(DEMO_RADAR.length).toBeGreaterThan(0)
    for (const video of DEMO_RADAR) {
      // Weder Kommentar-Texte noch Nutzernamen — die FORM lässt sie nicht zu.
      expect(Object.keys(video).sort()).toEqual([
        'channelId', 'channelSubscribers', 'channelTitle', 'commentCount',
        'fetchedAt', 'likes', 'publishedAt', 'title', 'topic', 'videoId', 'views',
      ])
    }
  })
})
