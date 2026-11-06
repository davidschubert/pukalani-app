import { describe, expect, it } from 'vitest'
import {
  INSIGHTS_BRAND_SERVER_OWNED_FIELDS,
  INSIGHTS_OPPORTUNITY_MAX,
  INSIGHTS_OPPORTUNITY_SIGNALS,
  INSIGHTS_OPPORTUNITY_SIGNALS_PLANNED,
  INSIGHTS_QUOTE_MAX,
  INSIGHTS_RANKING_PLACES,
  INSIGHTS_STATES,
  INSIGHTS_TOPICS,
  INSIGHTS_TOPIC_KEYS,
  type InsightsPost,
  type InsightsSource,
  insightsBrandEditSchema,
  insightsBrandSchema,
  insightsDuelSlug,
  insightsIsPublic,
  insightsOpportunity,
  insightsPopularity,
  insightsPostDeletable,
  insightsPostSchema,
  insightsPublicFassung,
  insightsRankingSchema,
  insightsReadingMinutes,
  insightsReviewIssues,
  insightsSourceIsThirdParty,
  insightsSourceSchema,
  insightsTopicLabel,
} from '../shared/insightsPost'

/**
 * DER REDAKTIONS-VERTRAG (Plan §9.3/§9.4) — was der Prototyp I0 festnageln
 * kann, ohne dass es eine Tabelle, eine Route oder ein Modell gibt.
 *
 * JEDE REGEL HAT HIER EINE GEGENPROBE. Eine Prüfung, die nur den guten Fall
 * kennt, ist immer grün und beweist nichts (Beweis-Regel 2 aus CLAUDE.md) —
 * und ausgerechnet die drei Regeln, die hier hängen (Zitatschranke,
 * Belegpflicht, Zehn-Plätze-Deckel), sind die rechtlich teuren.
 */

const OWN_DATA: InsightsSource = {
  url: 'https://branding.supply/brand-check/methodik',
  publisher: '',
  date: '',
  kind: 'own-data',
  quote: '',
  license: '',
}

const PRESS: InsightsSource = {
  url: 'https://kona-herald.example/upcountry-rebrand',
  publisher: 'Kona Herald',
  date: '2026-05-12',
  kind: 'press',
  quote: 'The new wordmark drops the mountain and keeps the ridge line.',
  license: '',
}

function article(overrides: Partial<InsightsPost> = {}): unknown {
  return {
    format: 'article',
    slug: 'was-kostet-ein-rebranding',
    state: 'draft',
    baseLocale: 'de',
    titleDe: 'Was kostet ein Rebranding wirklich?',
    titleEn: 'What does a rebrand really cost?',
    dekDe: 'Mit Zahlen statt „kommt drauf an".',
    dekEn: 'With numbers instead of „it depends".',
    bodyDe: 'Ein Absatz.',
    bodyEn: 'One paragraph.',
    topics: ['rebranding'],
    sources: [OWN_DATA, PRESS],
    ...overrides,
  }
}

describe('Katalog', () => {
  it('führt acht Themencluster mit eindeutigen Schlüsseln', () => {
    expect(INSIGHTS_TOPICS).toHaveLength(8)
    expect(new Set(INSIGHTS_TOPIC_KEYS).size).toBe(8)
  })

  it('gibt einen unbekannten Schlüssel unverändert zurück, statt leer zu bleiben', () => {
    expect(insightsTopicLabel('rebranding')).toBe('Rebranding')
    expect(insightsTopicLabel('gibt-es-nicht')).toBe('gibt-es-nicht')
  })

  it('trennt Fremdquelle von Eigenaussage (§4.1 a)', () => {
    expect(insightsSourceIsThirdParty('press')).toBe(true)
    expect(insightsSourceIsThirdParty('wikipedia')).toBe(true)
    expect(insightsSourceIsThirdParty('youtube')).toBe(true)
    expect(insightsSourceIsThirdParty('brand-site')).toBe(false)
    expect(insightsSourceIsThirdParty('own-data')).toBe(false)
  })
})

describe('Quelle', () => {
  it('nimmt eine belegte Fremdquelle an', () => {
    expect(insightsSourceSchema.safeParse(PRESS).success).toBe(true)
  })

  it('GEGENPROBE: ein Zitat über 200 Zeichen fällt durch', () => {
    const tooLong = { ...PRESS, quote: 'x'.repeat(INSIGHTS_QUOTE_MAX + 1) }
    expect(insightsSourceSchema.safeParse(tooLong).success).toBe(false)
    expect(insightsSourceSchema.safeParse({ ...PRESS, quote: 'x'.repeat(INSIGHTS_QUOTE_MAX) }).success).toBe(true)
  })

  it('GEGENPROBE: eine Fremdquelle ohne Datum fällt durch', () => {
    expect(insightsSourceSchema.safeParse({ ...PRESS, date: '' }).success).toBe(false)
    expect(insightsSourceSchema.safeParse({ ...PRESS, publisher: '' }).success).toBe(false)
    // Eigene Daten brauchen beides nicht — wir sind der Herausgeber.
    expect(insightsSourceSchema.safeParse(OWN_DATA).success).toBe(true)
  })

  it('GEGENPROBE: Wikipedia ohne Lizenz-Link fällt durch (§4.1 c)', () => {
    const wiki = { ...PRESS, kind: 'wikipedia' as const, publisher: 'Wikipedia' }
    expect(insightsSourceSchema.safeParse(wiki).success).toBe(false)
    expect(insightsSourceSchema.safeParse({ ...wiki, license: 'https://creativecommons.org/licenses/by-sa/4.0/' }).success).toBe(true)
  })

  it('GEGENPROBE: ein Datum ohne Form fällt durch', () => {
    expect(insightsSourceSchema.safeParse({ ...PRESS, date: '12.05.2026' }).success).toBe(false)
  })
})

describe('Beitrag', () => {
  it('nimmt einen Artikel mit Grundfassung an', () => {
    expect(insightsPostSchema.safeParse(article()).success).toBe(true)
  })

  it('GEGENPROBE: eine Grundfassung ohne Titel fällt durch', () => {
    expect(insightsPostSchema.safeParse(article({ titleDe: '' })).success).toBe(false)
    // Dieselbe Zeile mit englischer Grundfassung ist in Ordnung.
    expect(insightsPostSchema.safeParse(article({ titleDe: '', baseLocale: 'en' })).success).toBe(true)
  })

  it('GEGENPROBE: Faktenzeilen gehören nur ins Duell, und ein Duell braucht sie', () => {
    const fact = { key: 'founded', labelDe: 'Gegründet', labelEn: 'Founded', left: '1998', right: '2004', winner: 'tie' as const, sourceIndex: 1 }
    expect(insightsPostSchema.safeParse(article({ facts: [fact] })).success).toBe(false)
    expect(insightsPostSchema.safeParse(article({ format: 'duel', facts: [] })).success).toBe(false)
    expect(insightsPostSchema.safeParse(article({ format: 'duel', facts: [fact] })).success).toBe(true)
  })

  it('GEGENPROBE: ein Beleg-Zeiger ins Leere fällt durch', () => {
    const fact = { key: 'founded', labelDe: 'Gegründet', labelEn: 'Founded', left: '1998', right: '2004', winner: 'tie' as const, sourceIndex: 9 }
    expect(insightsPostSchema.safeParse(article({ format: 'duel', facts: [fact] })).success).toBe(false)
  })
})

describe('Ranking', () => {
  const entry = (rank: number) => ({
    rank,
    brandId: `brand-${rank}`,
    checkId: `check-${rank}`,
    score: 90 - rank,
    reasonDe: 'Ein Satz.',
    reasonEn: 'One sentence.',
    removed: false,
  })

  it('nimmt zehn Plätze mit Stand und Ausgabe an', () => {
    const ranking = { issue: 1, asOf: '2026-09-08', entries: Array.from({ length: 10 }, (_, i) => entry(i + 1)) }
    expect(insightsRankingSchema.safeParse(ranking).success).toBe(true)
  })

  it('GEGENPROBE: elf Plätze fallen durch', () => {
    const entries = Array.from({ length: 11 }, (_, i) => entry(i + 1))
    expect(insightsRankingSchema.safeParse({ issue: 1, asOf: '2026-09-08', entries }).success).toBe(false)
  })

  it('GEGENPROBE: ein doppelter Platz fällt durch', () => {
    const entries = [entry(1), { ...entry(2), rank: 1 }]
    expect(insightsRankingSchema.safeParse({ issue: 1, asOf: '2026-09-08', entries }).success).toBe(false)
  })

  it('lässt die Lücke „auf Wunsch entfernt" ohne Marke zu — und sonst nichts', () => {
    const gap = { rank: 4, brandId: '', checkId: '', score: 0, reasonDe: '', reasonEn: '', removed: true }
    expect(insightsRankingSchema.safeParse({ issue: 1, asOf: '2026-09-08', entries: [gap] }).success).toBe(true)
    expect(insightsRankingSchema.safeParse({ issue: 1, asOf: '2026-09-08', entries: [{ ...gap, removed: false }] }).success).toBe(false)
  })

  it('hält den Deckel bei zehn Plätzen fest', () => {
    expect(INSIGHTS_RANKING_PLACES).toBe(10)
  })
})

describe('Öffentliche Fassung', () => {
  const post = insightsPostSchema.parse(article({ state: 'published' }))

  it('zeigt die Grundfassung, solange die Übersetzung nicht redigiert ist', () => {
    const view = insightsPublicFassung(post, 'en')
    expect(view.locale).toBe('de')
    expect(view.fallback).toBe(true)
    expect(view.title).toBe('Was kostet ein Rebranding wirklich?')
  })

  it('zeigt die zweite Fassung erst mit translationReviewed', () => {
    const view = insightsPublicFassung({ ...post, translationReviewed: true }, 'en')
    expect(view.locale).toBe('en')
    expect(view.fallback).toBe(false)
    expect(view.title).toBe('What does a rebrand really cost?')
  })

  it('gibt die Grundsprache immer ohne Rückfall aus', () => {
    expect(insightsPublicFassung(post, 'de').fallback).toBe(false)
  })
})

describe('Prüfregeln vor der Redaktion', () => {
  const post = insightsPostSchema.parse(article())

  /**
   * Der Beleg-Riegel kommt seit BI1 I1a aus dem Fundament
   * (`core/shared/evidenceGrounding.ts`) und wird nicht mehr als Funktion
   * hereingereicht — herein kommt der ROHTEXT je Quellen-Adresse. Die Prüfung
   * ist damit case-SENSITIV, wie im Marktvergleich.
   */
  const PRESS_PAGE = `Kona Herald · ${PRESS.quote} Der Rest des Artikels.`

  it('meldet nichts, wenn alles steht', () => {
    expect(insightsReviewIssues(post, {
      sourceTexts: { [PRESS.url]: PRESS_PAGE },
      knownBrandIds: [],
      methodologyLinked: true,
    })).toEqual([])
  })

  it('GEGENPROBE: ein nicht belegtes Zitat blockiert und nennt die Stelle', () => {
    const issues = insightsReviewIssues(post, {
      sourceTexts: { [PRESS.url]: 'Der Artikel sagt etwas ganz anderes.' },
    })
    expect(issues).toEqual([{ code: 'quote_not_grounded', at: { kind: 'source', index: 1 } }])
  })

  it('GEGENPROBE: eine andere SCHREIBWEISE ist kein Beleg', () => {
    // Der Prototyp prüfte case-insensitiv und hätte das durchgelassen.
    const issues = insightsReviewIssues(post, {
      sourceTexts: { [PRESS.url]: PRESS_PAGE.toLowerCase() },
    })
    expect(issues).toEqual([{ code: 'quote_not_grounded', at: { kind: 'source', index: 1 } }])
  })

  it('OHNE Rohtext prüft die Regel gar nicht — und behauptet es auch nicht', () => {
    // Kein stiller Durchlass: die Lücke ist sichtbar, weil niemand „grün" sagt.
    expect(insightsReviewIssues(post, {})).toEqual([])
  })

  it('GEGENPROBE: ein Treffer des Herabsetzungsfilters blockiert und zeigt das Wort', () => {
    const issues = insightsReviewIssues(post, { flagText: text => (text.includes('wirklich') ? ['wirklich'] : []) })
    expect(issues.some(issue => issue.code === 'disparagement' && issue.detail === 'wirklich')).toBe(true)
  })

  it('GEGENPROBE: eine genannte Marke ohne Zeile blockiert', () => {
    const withRef = insightsPostSchema.parse(article({ brandRefs: [{ brandId: 'upcountry', checkId: 'check-1' }] }))
    expect(insightsReviewIssues(withRef, { knownBrandIds: ['pacific'] }).some(issue => issue.code === 'brand_without_entity')).toBe(true)
    expect(insightsReviewIssues(withRef, { knownBrandIds: ['upcountry'], methodologyLinked: true })).toEqual([])
  })

  it('GEGENPROBE: ein gezeigter Score ohne Methodik-Link blockiert', () => {
    const withScore = insightsPostSchema.parse(article({ brandRefs: [{ brandId: 'upcountry', checkId: 'check-1' }] }))
    const issues = insightsReviewIssues(withScore, { knownBrandIds: ['upcountry'], methodologyLinked: false })
    expect(issues.some(issue => issue.code === 'score_without_methodology')).toBe(true)
  })

  it('prüft OHNE die hereingereichten Funktionen bewusst weniger — und behauptet nichts', () => {
    // Kein `quoteGrounded` ⇒ keine Beleg-Meldung. Das ist die Lücke, die man
    // sieht; eine Prüfung, die ohne Quelltext „grün" sagt, wäre eine Lüge.
    expect(insightsReviewIssues(post)).toEqual([])
  })
})

describe('Marken-Entität', () => {
  const brand = {
    slug: 'upcountry-roast',
    name: 'Upcountry Roast Co.',
    state: 'published' as const,
    sources: [PRESS],
    marks: [{ kind: 'claim' as const, text: 'Der Grat als Zeichen.', sourceIndex: 0 }],
  }

  it('nimmt eine belegte Marke an', () => {
    expect(insightsBrandSchema.safeParse(brand).success).toBe(true)
  })

  it('GEGENPROBE: ein Zeichen ohne Beleg fällt durch', () => {
    expect(insightsBrandSchema.safeParse({ ...brand, marks: [{ kind: 'claim', text: 'x', sourceIndex: 3 }] }).success).toBe(false)
  })

  it('GEGENPROBE: eine Entfernung ohne dokumentierten Grund fällt durch', () => {
    expect(insightsBrandSchema.safeParse({ ...brand, state: 'removed' }).success).toBe(false)
    expect(insightsBrandSchema.safeParse({ ...brand, state: 'removed', removalReason: 'Wunsch der Eigentümerin, 2026-09-01' }).success).toBe(true)
  })
})

/**
 * DIE REDAKTIONS-EINGABE EINER MARKE (BI1 I2-Rest).
 *
 * Sie muss ZWEIERLEI können, und beides braucht eine Gegenprobe: dieselben
 * Regeln durchsetzen wie der volle Vertrag (sonst ist das Formular die
 * mildere von zwei Wahrheiten) und die drei Server-eigenen Felder
 * ABLEHNEN — also nicht bloss ignorieren, sondern nicht durchreichen.
 */
describe('Marken-Eingabe (insightsBrandEditSchema)', () => {
  const input = {
    slug: 'upcountry-roast',
    name: 'Upcountry Roast Co.',
    state: 'published' as const,
    sources: [PRESS],
    marks: [{ kind: 'claim' as const, text: 'Der Grat als Zeichen.', sourceIndex: 0 }],
    history: [{ year: 1994, text: 'Erste Röstung in Makawao.', sourceIndex: 0 }],
  }

  it('nimmt eine belegte Marke an', () => {
    const parsed = insightsBrandEditSchema.parse(input)
    expect(parsed.name).toBe('Upcountry Roast Co.')
    expect(parsed.foundedYear).toBeNull()
    expect(parsed.relations).toEqual([])
  })

  it('lässt die drei Server-eigenen Felder GAR NICHT herein', () => {
    const parsed = insightsBrandEditSchema.parse({
      ...input,
      slugHistory: ['alte-adresse'],
      removedAt: '2020-01-01T00:00:00.000Z',
      claimedBy: 'user-fremd',
    })
    for (const field of INSIGHTS_BRAND_SERVER_OWNED_FIELDS) {
      expect(Object.keys(parsed)).not.toContain(field)
    }
  })

  it('GEGENPROBE: die drei Felder stehen genau so im vollen Vertrag', () => {
    // Sonst wäre die Auslassung oben keine Aussage, sondern ein Zufall.
    const full = insightsBrandSchema.parse({ ...input, slugHistory: ['alte-adresse'] })
    expect(full.slugHistory).toEqual(['alte-adresse'])
    expect(Object.keys(full)).toEqual(expect.arrayContaining([...INSIGHTS_BRAND_SERVER_OWNED_FIELDS]))
  })

  it('GEGENPROBE: `removed` OHNE Grund fällt — dieselbe Regel wie im vollen Vertrag', () => {
    expect(insightsBrandEditSchema.safeParse({ ...input, state: 'removed' }).success).toBe(false)
    expect(insightsBrandEditSchema.safeParse({
      ...input,
      state: 'removed',
      removalReason: 'Wunsch der Eigentümerin, 2026-09-01',
    }).success).toBe(true)
  })

  it('GEGENPROBE: ein `sourceIndex` ausserhalb der Quellenliste fällt — bei Zeichen UND Historie', () => {
    expect(insightsBrandEditSchema.safeParse({
      ...input,
      marks: [{ kind: 'claim', text: 'x', sourceIndex: 1 }],
    }).success).toBe(false)
    expect(insightsBrandEditSchema.safeParse({
      ...input,
      history: [{ year: 1994, text: 'x', sourceIndex: 9 }],
    }).success).toBe(false)
    // Und mit Beleg geht es: sonst prüfte der Test nur, dass irgendetwas fällt.
    expect(insightsBrandEditSchema.safeParse({
      ...input,
      marks: [{ kind: 'claim', text: 'x', sourceIndex: 0 }],
      history: [{ year: 1994, text: 'x', sourceIndex: 0 }],
    }).success).toBe(true)
  })

  it('GEGENPROBE: ein Zeiger auf eine ENTFERNTE Quelle (-1) fällt ebenfalls', () => {
    // Die Oberfläche setzt `-1`, wenn jemand die belegte Quelle löscht — das
    // soll das Speichern verhindern, nicht stillschweigend durchgehen.
    expect(insightsBrandEditSchema.safeParse({
      ...input,
      marks: [{ kind: 'claim', text: 'x', sourceIndex: -1 }],
    }).success).toBe(false)
  })

  it('GEGENPROBE: ohne Namen und ohne Adresse gibt es keine Marke', () => {
    expect(insightsBrandEditSchema.safeParse({ ...input, name: '' }).success).toBe(false)
    expect(insightsBrandEditSchema.safeParse({ ...input, slug: '' }).success).toBe(false)
  })
})

/**
 * WAS GELÖSCHT WERDEN DARF (BI1 I2-Rest) — vier Zustände, zwei Antworten.
 * Ohne die Gegenprobe wäre „ja" eine Regel, die immer ja sagt.
 */
describe('insightsPostDeletable', () => {
  it('Entwurf und Redaktion: ja — sie waren nie öffentlich', () => {
    expect(insightsPostDeletable('draft')).toBe(true)
    expect(insightsPostDeletable('review')).toBe(true)
  })

  it('GEGENPROBE: freigegeben und aktualisiert: nein — erst zurückziehen', () => {
    expect(insightsPostDeletable('published')).toBe(false)
    expect(insightsPostDeletable('updated')).toBe(false)
  })

  it('deckt sich mit den öffentlichen Zuständen: was öffentlich ist, ist nicht löschbar', () => {
    // Die eigentliche Aussage der Regel — geprüft gegen die andere Liste
    // statt gegen eine zweite Aufzählung derselben vier Wörter.
    for (const state of INSIGHTS_STATES) {
      expect(insightsPostDeletable(state)).toBe(!insightsIsPublic({ state }))
    }
  })
})

describe('Rechnungen', () => {
  it('rechnet die Lesezeit aus Wörtern, nicht aus Zeichen', () => {
    expect(insightsReadingMinutes('')).toBe(0)
    expect(insightsReadingMinutes('ein kurzer Satz')).toBe(1)
    expect(insightsReadingMinutes(Array.from({ length: 401 }, () => 'wort').join(' '))).toBe(3)
  })

  it('sortiert den Duell-Slug alphabetisch — beide Richtungen ergeben dieselbe Adresse', () => {
    expect(insightsDuelSlug('upcountry-roast', 'pacific-bean')).toBe('pacific-bean-vs-upcountry-roast')
    expect(insightsDuelSlug('pacific-bean', 'upcountry-roast')).toBe('pacific-bean-vs-upcountry-roast')
  })

  it('normalisiert die Popularität an der Kanalgröße', () => {
    // 50k Aufrufe auf 20k Abonnenten schlagen 200k auf 5 Mio (§9.6).
    expect(insightsPopularity(50_000, 20_000)).toBeGreaterThan(insightsPopularity(200_000, 5_000_000))
    expect(insightsPopularity(1, 0)).toBe(0)
  })

  /**
   * DIE ZAHL IST AUF 100 GENORMT, DIE FUSSNOTE TRÄGT DIE WAHRHEIT (Davids
   * Entscheidung 2026-09-08 gegen „44 von 60").
   */
  it('normiert auf 100 statt auf die Zahl der Signale', () => {
    const fresh = insightsOpportunity({ popularity: 2, ageDays: 0, relevance: 1 })
    // GEGENPROBE zum alten Verhalten: drei volle Signale sind 100, nicht 60.
    expect(fresh.score).toBe(INSIGHTS_OPPORTUNITY_MAX)
    expect(INSIGHTS_OPPORTUNITY_MAX).toBe(100)
    expect(fresh.score).not.toBe(60)
    // Und sie sagt IMMER, aus wie vielen von fünf sie kommt.
    expect(fresh.signals).toBe(3)
    expect(fresh.of).toBe(5)
    expect(INSIGHTS_OPPORTUNITY_SIGNALS_PLANNED).toHaveLength(5)
    expect(INSIGHTS_OPPORTUNITY_SIGNALS).toHaveLength(3)
  })

  it('rechnet aus den VORHANDENEN Signalen — ein fehlendes schrumpft den Nenner nicht', () => {
    // Zwei volle Signale sind ebenfalls 100: der Durchschnitt entscheidet,
    // nicht die Summe. Was die Zahl wert ist, sagt `signals`.
    const zwei = insightsOpportunity({ popularity: 2, ageDays: 0 })
    expect(zwei.score).toBe(100)
    expect(zwei.signals).toBe(2)
    expect(zwei.relevance).toBeNull()
    // Halbes Alter, volle Performance, keine Relevanz ⇒ (20 + 10) / 40.
    const halb = insightsOpportunity({ popularity: 2, ageDays: 90 })
    expect(halb.score).toBe(75)
  })

  it('GEGENPROBE: KEIN Signal ergibt keine Zahl — nicht die 0', () => {
    const leer = insightsOpportunity({})
    expect(leer.score).toBeNull()
    expect(leer.signals).toBe(0)
    // Eine 0 wäre eine Bewertung, wo gar nicht gemessen wurde.
    expect(leer.score).not.toBe(0)
  })

  it('behält die Signal-Kurven — Halbwertszeit 90 Tage, Boden bei 0', () => {
    expect(insightsOpportunity({ popularity: 0, ageDays: 90, relevance: 0 }).age).toBe(10)
    expect(insightsOpportunity({ popularity: 0, ageDays: 10_000, relevance: 0 }).score).toBe(0)
  })
})
