import { describe, expect, it } from 'vitest'
import {
  INSIGHTS_METHODOLOGY_PATH,
  INSIGHTS_SERVER_OWNED_FIELDS,
  INSIGHTS_STATES,
  INSIGHTS_TRANSITIONS,
  type InsightsPost,
  type InsightsState,
  insightsMethodologyLinked,
  insightsPostEditSchema,
  insightsPostSchema,
  insightsTransitionAllowed,
} from '../shared/insightsPost'
import {
  INSIGHTS_AI_DAILY_LIMIT,
  INSIGHTS_AI_HOURLY_LIMIT,
  decideInsightsAiQuota,
  insightsAiDayKey,
  insightsAiHourKey,
} from '../shared/insightsAiLimits'
import {
  INSIGHTS_DRAFT_PROMPT_VERSION,
  INSIGHTS_TRANSLATE_PROMPT_VERSION,
  buildInsightsDraftPrompt,
  buildInsightsTranslatePrompt,
  insightsAiTextSchema,
} from '../shared/insightsPrompts'

/**
 * PAKET I2 — die puren Regeln der Redaktion, jede MIT GEGENPROBE.
 *
 * Eine Prüfung, die nur den guten Fall kennt, ist immer grün und beweist
 * nichts (Beweis-Regel 2 aus CLAUDE.md). Was hier hängt, ist genau das, was
 * ein Server-Gate und ein Prompt zusagen: welcher Weg erlaubt ist, welche
 * Felder ein Formular NICHT setzen darf, wie oft ein Modell laufen darf und
 * was ein Prompt dem Modell verbietet.
 */

const BASE: InsightsPost = insightsPostSchema.parse({
  format: 'article',
  slug: 'ein-artikel',
  state: 'draft',
  baseLocale: 'de',
  titleDe: 'Ein Artikel',
  bodyDe: 'Ein Satz.',
})

describe('insightsTransitionAllowed', () => {
  it('kennt die sechs Wege der Tabelle', () => {
    expect(insightsTransitionAllowed('draft', 'review')).toBe(true)
    expect(insightsTransitionAllowed('review', 'draft')).toBe(true)
    expect(insightsTransitionAllowed('review', 'published')).toBe(true)
    expect(insightsTransitionAllowed('published', 'updated')).toBe(true)
    expect(insightsTransitionAllowed('published', 'draft')).toBe(true)
    expect(insightsTransitionAllowed('updated', 'draft')).toBe(true)
  })

  /** GEGENPROBE: die Abkürzungen, die es NICHT gibt. */
  it('lässt keinen Sprung an der Redaktion vorbei', () => {
    expect(insightsTransitionAllowed('draft', 'published')).toBe(false)
    expect(insightsTransitionAllowed('draft', 'updated')).toBe(false)
    expect(insightsTransitionAllowed('review', 'updated')).toBe(false)
  })

  it('macht aus `updated` keinen zweiten Endzustand', () => {
    expect(insightsTransitionAllowed('updated', 'published')).toBe(false)
    expect(insightsTransitionAllowed('updated', 'updated')).toBe(false)
    expect(insightsTransitionAllowed('updated', 'review')).toBe(false)
  })

  it('kennt keinen Übergang auf sich selbst', () => {
    for (const state of INSIGHTS_STATES) {
      expect(insightsTransitionAllowed(state, state)).toBe(false)
    }
  })

  it('nennt nur bekannte Zustände als Ziel', () => {
    for (const targets of Object.values(INSIGHTS_TRANSITIONS)) {
      for (const target of targets) {
        expect(INSIGHTS_STATES).toContain(target)
      }
    }
  })

  it('führt aus jedem öffentlichen Zustand ein Weg zurück', () => {
    for (const state of ['published', 'updated'] as InsightsState[]) {
      expect(insightsTransitionAllowed(state, 'draft')).toBe(true)
    }
  })
})

describe('insightsPostEditSchema', () => {
  const payload = {
    format: 'article',
    slug: 'ein-artikel',
    baseLocale: 'de',
    titleDe: 'Ein Artikel',
    bodyDe: 'Ein Satz.',
    translationReviewed: true,
  }

  it('nimmt die Felder an, die ein Mensch entscheidet', () => {
    const parsed = insightsPostEditSchema.parse(payload)
    expect(parsed.slug).toBe('ein-artikel')
    expect(parsed.translationReviewed).toBe(true)
  })

  /**
   * GEGENPROBE — und die teuerste des Pakets: ein durchgereichtes
   * `state: 'published'` wäre die Freigabe an den sechs Prüfregeln vorbei.
   */
  it('lässt kein Server-eigenes Feld durch', () => {
    const parsed = insightsPostEditSchema.parse({
      ...payload,
      state: 'published',
      publishedAt: '2026-01-01T00:00:00.000Z',
      reviewedBy: 'jemand-anderes',
      readingMinutes: 99,
      slugHistory: ['alt'],
      translatedAt: '2026-01-01T00:00:00.000Z',
      draftModel: 'erfunden',
    }) as Record<string, unknown>

    for (const field of INSIGHTS_SERVER_OWNED_FIELDS) {
      expect(parsed[field]).toBeUndefined()
    }
  })

  it('setzt dieselben Form-Regeln durch wie der volle Vertrag', () => {
    // Ein Duell ohne Faktenzeilen ist keines — im Formular so wenig wie in der Zeile.
    expect(insightsPostEditSchema.safeParse({ ...payload, format: 'duel' }).success).toBe(false)
    // Faktenzeilen ausserhalb des Duells sind ein stehengelassener Rest.
    expect(insightsPostEditSchema.safeParse({
      ...payload,
      facts: [{ key: 'x', labelDe: 'a', labelEn: 'b', left: 'l', right: 'r', winner: 'tie', sourceIndex: 0 }],
    }).success).toBe(false)
    // Die Grundfassung braucht einen Titel (Entscheidung 3).
    expect(insightsPostEditSchema.safeParse({ ...payload, titleDe: '' }).success).toBe(false)
  })

  it('lässt den vollen Vertrag unangetastet', () => {
    // Der volle Vertrag kennt `state` weiterhin — sonst wäre die Zeile nicht
    // mehr abbildbar.
    expect(insightsPostSchema.parse({ ...payload, state: 'published' }).state).toBe('published')
  })
})

describe('insightsMethodologyLinked', () => {
  it('findet den Link in der Grundfassung', () => {
    expect(insightsMethodologyLinked({
      bodyDe: `Mehr dazu in der [Methodik](${INSIGHTS_METHODOLOGY_PATH}).`,
      bodyEn: '',
    })).toBe(true)
  })

  it('findet ihn auch in der zweiten Fassung', () => {
    expect(insightsMethodologyLinked({ bodyDe: '', bodyEn: `See [method](${INSIGHTS_METHODOLOGY_PATH}).` })).toBe(true)
  })

  /** GEGENPROBE: ein Text ÜBER die Methodik ist kein Link auf sie. */
  it('lässt sich von einer Erwähnung nicht täuschen', () => {
    expect(insightsMethodologyLinked({ bodyDe: 'Unsere Methodik ist offengelegt.', bodyEn: '' })).toBe(false)
    expect(insightsMethodologyLinked({ bodyDe: '', bodyEn: '' })).toBe(false)
  })
})

describe('insightsAiLimits', () => {
  it('hält die Zahlen aus Entscheidung 4 fest', () => {
    expect(INSIGHTS_AI_HOURLY_LIMIT).toBe(10)
    expect(INSIGHTS_AI_DAILY_LIMIT).toBe(50)
  })

  it('trennt Konto UND Art im Schlüssel', () => {
    expect(insightsAiHourKey('u1', 'draft')).toContain('u1')
    expect(insightsAiHourKey('u1', 'draft')).toContain('draft')
    expect(insightsAiHourKey('u1', 'draft')).not.toBe(insightsAiHourKey('u1', 'translate'))
    expect(insightsAiHourKey('u1', 'draft')).not.toBe(insightsAiHourKey('u2', 'draft'))
  })

  it('trennt Stunde und Tag', () => {
    expect(insightsAiHourKey('u1', 'draft')).not.toBe(insightsAiDayKey('u1', 'draft'))
  })

  it('lehnt erst NACH dem Deckel ab — der zehnte Lauf zählt noch', () => {
    expect(decideInsightsAiQuota({ hour: INSIGHTS_AI_HOURLY_LIMIT, day: 1 })).toBeNull()
    expect(decideInsightsAiQuota({ hour: INSIGHTS_AI_HOURLY_LIMIT + 1, day: 1 })).toBe('ai_hourly_limit')
    expect(decideInsightsAiQuota({ hour: 1, day: INSIGHTS_AI_DAILY_LIMIT })).toBeNull()
    expect(decideInsightsAiQuota({ hour: 1, day: INSIGHTS_AI_DAILY_LIMIT + 1 })).toBe('ai_daily_limit')
  })

  it('nennt den engeren Grund zuerst', () => {
    expect(decideInsightsAiQuota({
      hour: INSIGHTS_AI_HOURLY_LIMIT + 1,
      day: INSIGHTS_AI_DAILY_LIMIT + 1,
    })).toBe('ai_hourly_limit')
  })
})

describe('insightsPrompts', () => {
  it('trägt die Fassungen aus dem Plan', () => {
    expect(INSIGHTS_DRAFT_PROMPT_VERSION).toBe('insights-d-1')
    expect(INSIGHTS_TRANSLATE_PROMPT_VERSION).toBe('insights-t-1')
  })

  describe('buildInsightsDraftPrompt', () => {
    const input = {
      format: 'article' as const,
      baseLocale: 'de' as const,
      brief: 'Warum Handwerksmarken unsichtbar bleiben.',
      targetWords: 700,
      brandNames: ['Pacific Bean Supply'],
    }

    it('verlangt JSON mit den drei Feldern', () => {
      const prompt = buildInsightsDraftPrompt(input)
      expect(prompt).toContain('"title"')
      expect(prompt).toContain('"dek"')
      expect(prompt).toContain('"body"')
    })

    it('verbietet erfundene Zitate und Zahlen ohne Quelle', () => {
      const prompt = buildInsightsDraftPrompt(input)
      expect(prompt).toContain('ERFINDE KEIN ZITAT')
      expect(prompt).toContain('ERFINDE KEINE ZAHL')
      expect(prompt).toContain('[Quelle]')
      expect(prompt).toContain('SETZE NIEMANDEN HERAB')
    })

    it('nennt Brief, Umfang und Marken', () => {
      const prompt = buildInsightsDraftPrompt(input)
      expect(prompt).toContain(input.brief)
      expect(prompt).toContain('700')
      expect(prompt).toContain('Pacific Bean Supply')
    })

    it('schneidet auf das Format zu', () => {
      expect(buildInsightsDraftPrompt({ ...input, format: 'profile' })).toContain('FORMAT MARKENPROFIL')
      expect(buildInsightsDraftPrompt({ ...input, format: 'duel' })).toContain('FORMAT BRAND-DUELL')
      expect(buildInsightsDraftPrompt({ ...input, format: 'article' })).toContain('FORMAT ARTIKEL')
      expect(buildInsightsDraftPrompt({ ...input, format: 'ranking' })).toContain('FORMAT RANKING')
    })

    /** Prüfregel 5 im Prompt: ein Ranking zeigt einen Score und muss ihn erklären. */
    it('verlangt den Methodik-Link nur beim Ranking', () => {
      expect(buildInsightsDraftPrompt({ ...input, format: 'ranking' })).toContain(INSIGHTS_METHODOLOGY_PATH)
      expect(buildInsightsDraftPrompt({ ...input, format: 'profile' })).not.toContain(INSIGHTS_METHODOLOGY_PATH)
    })

    /** GEGENPROBE: der Vorrat des Parsers, nicht der von Markdown. */
    it('verbietet, was `core/shared/markdown.ts` nicht lesen kann', () => {
      const prompt = buildInsightsDraftPrompt(input)
      expect(prompt).toContain('KEINE Tabellen')
      expect(prompt).toContain('~~')
    })

    it('sagt die Sprache der Grundfassung an', () => {
      expect(buildInsightsDraftPrompt({ ...input, baseLocale: 'de' })).toContain('Deutsch')
      expect(buildInsightsDraftPrompt({ ...input, baseLocale: 'en' })).toContain('Englisch')
    })
  })

  describe('buildInsightsTranslatePrompt', () => {
    const post = {
      ...BASE,
      baseLocale: 'de' as const,
      titleDe: 'Der deutsche Titel',
      dekDe: 'Der deutsche Vorspann',
      bodyDe: 'Der deutsche Text.',
      titleEn: 'AN OLD ENGLISH TITLE',
      dekEn: 'AN OLD ENGLISH DEK',
      bodyEn: 'AN OLD ENGLISH BODY.',
    }

    it('reicht die Grundfassung herein', () => {
      const prompt = buildInsightsTranslatePrompt(post, 'en')
      expect(prompt).toContain('Der deutsche Titel')
      expect(prompt).toContain('Der deutsche Vorspann')
      expect(prompt).toContain('Der deutsche Text.')
    })

    /**
     * GEGENPROBE — der Grund, warum diese Prüfung existiert: käme die alte
     * zweite Fassung mit, „verbesserte" jeder Lauf die Redaktion des vorigen.
     */
    it('reicht die ANDERE Fassung NICHT herein', () => {
      const prompt = buildInsightsTranslatePrompt(post, 'en')
      expect(prompt).not.toContain('AN OLD ENGLISH TITLE')
      expect(prompt).not.toContain('AN OLD ENGLISH BODY.')
    })

    it('nennt Ausgangs- und Zielsprache', () => {
      expect(buildInsightsTranslatePrompt(post, 'en')).toContain('Englisch')
      expect(buildInsightsTranslatePrompt({ ...post, baseLocale: 'en' }, 'de')).toContain('Deutsch')
    })

    /** Die Zitatschranke überlebt die Übersetzung — sonst ist ein Beleg keiner. */
    it('lässt wörtliche Zitate unangetastet', () => {
      const prompt = buildInsightsTranslatePrompt(post, 'en')
      expect(prompt).toContain('WÖRTLICHE ZITATE IN ANFÜHRUNGSZEICHEN BLEIBEN UNVERÄNDERT')
    })

    it('verlangt JSON mit den drei Feldern', () => {
      const prompt = buildInsightsTranslatePrompt(post, 'en')
      expect(prompt).toContain('"title"')
      expect(prompt).toContain('"dek"')
      expect(prompt).toContain('"body"')
    })
  })

  describe('insightsAiTextSchema', () => {
    it('macht aus einer Modell-Antwort erst Daten', () => {
      expect(insightsAiTextSchema.parse({ title: 'A', dek: 'B', body: 'C' })).toEqual({ title: 'A', dek: 'B', body: 'C' })
      // Fehlende Felder sind leer, nicht `undefined` — die Spalten vertragen
      // keinen fehlenden Wert.
      expect(insightsAiTextSchema.parse({})).toEqual({ title: '', dek: '', body: '' })
    })

    /** GEGENPROBE: die Deckel des Vertrags gelten auch für ein Modell. */
    it('lehnt überlange Felder ab', () => {
      expect(insightsAiTextSchema.safeParse({ title: 'x'.repeat(201) }).success).toBe(false)
      expect(insightsAiTextSchema.safeParse({ dek: 'x'.repeat(401) }).success).toBe(false)
    })
  })
})
