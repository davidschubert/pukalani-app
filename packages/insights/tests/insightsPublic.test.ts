import { describe, expect, it } from 'vitest'
import type { InsightsBrand, InsightsPost } from '../shared/insightsPost'
import { insightsBrandSchema, insightsPostSchema, insightsPublicKopf } from '../shared/insightsPost'
import {
  INSIGHTS_POST_INTERNAL_FIELDS,
  insightsBrandIsVisible,
  insightsDuelCanonical,
  insightsDuelParts,
  insightsFormatIsPublic,
  insightsOgPath,
  insightsPostIsVisible,
  insightsPublicHref,
  insightsSlugResolution,
  readInsightsPublicFormats,
  toInsightsPublicBrand,
  toInsightsPublicPost,
} from '../shared/insightsPublic'

/**
 * WAS ÖFFENTLICH WIRD (BI1 I3, Plan BRAND-INSIGHTS §9.2/§9.5).
 *
 * Zu JEDER Regel gehört hier eine Gegenprobe. Der Grund ist derselbe wie bei
 * den Mail-Links im Core: ein fail-closed-Riegel, der ALLES sperrt, macht
 * jeden Sichtbarkeits-Test grün und das Produkt unsichtbar — und ein
 * fail-open-Riegel macht jede Gegenprobe grün und das Gate wertlos.
 */

function post(overrides: Partial<InsightsPost> = {}): InsightsPost {
  return insightsPostSchema.parse({
    format: 'article',
    slug: 'was-kostet-ein-rebranding',
    state: 'published',
    baseLocale: 'de',
    titleDe: 'Was kostet ein Rebranding?',
    titleEn: 'What does a rebrand cost?',
    dekDe: 'Vier Posten, ein Rahmen.',
    dekEn: 'Four items, one frame.',
    bodyDe: '## Der Rahmen\n\nText auf Deutsch.',
    bodyEn: '## The frame\n\nText in English.',
    publishedAt: '2026-09-01T10:00:00.000Z',
    reviewedAt: '2026-09-01T09:00:00.000Z',
    reviewedBy: 'user-1',
    noteInternal: 'Noch einmal gegenlesen.',
    draftModel: 'anthropic/claude',
    draftPromptVersion: 'v3',
    translationModel: 'google/gemini',
    translationPromptVersion: 'v2',
    readingMinutes: 6,
    ...overrides,
  })
}

function brand(overrides: Partial<InsightsBrand> = {}): InsightsBrand {
  return insightsBrandSchema.parse({
    slug: 'upcountry-roast',
    name: 'Upcountry Roast Co.',
    state: 'published',
    checkId: 'check-1',
    publicationId: 'pub-1',
    claimedBy: 'user-9',
    ...overrides,
  })
}

// ── Der Riegel ─────────────────────────────────────────────────────────────

describe('readInsightsPublicFormats — fail-closed', () => {
  it('liest eine Liste gültiger Schlüssel', () => {
    expect(readInsightsPublicFormats(['article', 'ranking'])).toEqual(['article', 'ranking'])
  })

  it('wirft Unsinn heraus und entdoppelt', () => {
    expect(readInsightsPublicFormats(['article', 'article', 'quatsch', 7, null])).toEqual(['article'])
  })

  it('ein einzelner STRING ist keine Erlaubnis', () => {
    expect(readInsightsPublicFormats('article')).toEqual([])
  })

  it('ein OBJEKT ist keine Erlaubnis', () => {
    expect(readInsightsPublicFormats({ article: true })).toEqual([])
    expect(readInsightsPublicFormats(undefined)).toEqual([])
    expect(readInsightsPublicFormats(null)).toEqual([])
  })

  it('insightsFormatIsPublic fragt genau die Liste', () => {
    expect(insightsFormatIsPublic('article', ['article'])).toBe(true)
    expect(insightsFormatIsPublic('profile', ['article'])).toBe(false)
  })
})

// ── Sichtbarkeit ───────────────────────────────────────────────────────────

describe('insightsPostIsVisible — Zustand UND Riegel', () => {
  const allowed = ['article'] as const

  it('published und updated sind öffentlich', () => {
    expect(insightsPostIsVisible(post({ state: 'published' }), allowed)).toBe(true)
    expect(insightsPostIsVisible(post({ state: 'updated' }), allowed)).toBe(true)
  })

  it('draft und review sind es NICHT', () => {
    expect(insightsPostIsVisible(post({ state: 'draft' }), allowed)).toBe(false)
    expect(insightsPostIsVisible(post({ state: 'review' }), allowed)).toBe(false)
  })

  it('ein freigegebener Beitrag mit gesperrtem FORMAT bleibt unsichtbar', () => {
    const duel = { state: 'published' as const, format: 'duel' as const }
    expect(insightsPostIsVisible(duel, allowed)).toBe(false)
    // Gegenprobe: mit Riegel ist derselbe Beitrag sichtbar.
    expect(insightsPostIsVisible(duel, ['article', 'duel'])).toBe(true)
  })
})

describe('insightsBrandIsVisible', () => {
  it('published und removed zeigen eine Seite, draft nicht', () => {
    expect(insightsBrandIsVisible({ state: 'published' }, ['profile'])).toBe(true)
    expect(insightsBrandIsVisible({ state: 'removed' }, ['profile'])).toBe(true)
    expect(insightsBrandIsVisible({ state: 'draft' }, ['profile'])).toBe(false)
  })

  it('ohne Riegel gibt es gar keine Marken-Seite', () => {
    expect(insightsBrandIsVisible({ state: 'published' }, ['article'])).toBe(false)
  })
})

// ── Was hinausgeht ─────────────────────────────────────────────────────────

describe('toInsightsPublicPost', () => {
  it('streicht JEDES interne Feld — geprüft über Object.keys', () => {
    const keys = Object.keys(toInsightsPublicPost('row-1', post({ translationReviewed: true })))
    for (const field of INSIGHTS_POST_INTERNAL_FIELDS) {
      expect(keys).not.toContain(field)
    }
    expect(keys).toContain('id')
    expect(keys).toContain('titleDe')
  })

  it('leert die UNREDIGIERTE Zweitfassung (§3.2)', () => {
    const view = toInsightsPublicPost('row-1', post({ baseLocale: 'de', translationReviewed: false }))
    expect(view.titleEn).toBe('')
    expect(view.dekEn).toBe('')
    expect(view.bodyEn).toBe('')
    // Die Grundfassung bleibt vollständig.
    expect(view.titleDe).toBe('Was kostet ein Rebranding?')
    expect(view.bodyDe).toContain('Text auf Deutsch.')
  })

  it('leert die andere Seite, wenn EN die Grundsprache ist', () => {
    const view = toInsightsPublicPost('row-1', post({ baseLocale: 'en', translationReviewed: false }))
    expect(view.titleDe).toBe('')
    expect(view.titleEn).toBe('What does a rebrand cost?')
  })

  it('GEGENPROBE: eine REDIGIERTE Zweitfassung bleibt stehen', () => {
    const view = toInsightsPublicPost('row-1', post({ translationReviewed: true }))
    expect(view.titleEn).toBe('What does a rebrand cost?')
    expect(view.bodyEn).toContain('Text in English.')
  })

  it('die Anzeige-Regel bleibt daneben bestehen (Rückfall mit Hinweis)', () => {
    const view = toInsightsPublicPost('row-1', post({ translationReviewed: false }))
    const shown = insightsPublicKopf(view, 'en')
    expect(shown.fallback).toBe(true)
    expect(shown.locale).toBe('de')
    expect(shown.title).toBe('Was kostet ein Rebranding?')
  })
})

describe('toInsightsPublicBrand', () => {
  it('streicht die drei internen Felder', () => {
    const keys = Object.keys(toInsightsPublicBrand('row-2', brand()))
    expect(keys).not.toContain('claimedBy')
    expect(keys).not.toContain('checkId')
    expect(keys).not.toContain('publicationId')
    expect(keys).toContain('id')
    expect(keys).toContain('name')
  })
})

// ── Adressen ───────────────────────────────────────────────────────────────

describe('insightsDuelParts / insightsDuelCanonical', () => {
  it('trennt am ERSTEN -vs-', () => {
    expect(insightsDuelParts('adidas-vs-nike')).toEqual({ a: 'adidas', b: 'nike' })
    expect(insightsDuelParts('a-vs-b-vs-c')).toEqual({ a: 'a', b: 'b-vs-c' })
  })

  it('ist kein Duell ohne beide Teile', () => {
    expect(insightsDuelParts('nur-ein-name')).toBeNull()
    expect(insightsDuelParts('-vs-nike')).toBeNull()
    expect(insightsDuelParts('nike-vs-')).toBeNull()
    expect(insightsDuelParts('Nike-vs-Adidas')).toBeNull()
  })

  it('kanonisch ist ALPHABETISCH — adidas vor nike', () => {
    expect(insightsDuelCanonical('adidas-vs-nike')).toBe('adidas-vs-nike')
    // Die Gegenrichtung zeigt auf dieselbe Adresse ⇒ 301.
    expect(insightsDuelCanonical('nike-vs-adidas')).toBe('adidas-vs-nike')
  })

  it('kein Duell-Slug ⇒ null', () => {
    expect(insightsDuelCanonical('was-kostet-ein-rebranding')).toBeNull()
  })
})

describe('insightsSlugResolution', () => {
  it('DIREKT schlägt alles', () => {
    expect(insightsSlugResolution('a', { direct: true, canonical: 'b', historyHit: 'c' }))
      .toEqual({ kind: 'direct' })
  })

  it('der Duell-Kanon kommt VOR der Historie', () => {
    expect(insightsSlugResolution('nike-vs-adidas', { canonical: 'adidas-vs-nike', historyHit: 'alt' }))
      .toEqual({ kind: 'redirect', slug: 'adidas-vs-nike' })
  })

  it('die Historie zuletzt', () => {
    expect(insightsSlugResolution('alter-name', { historyHit: 'neuer-name' }))
      .toEqual({ kind: 'redirect', slug: 'neuer-name' })
  })

  it('nie eine Weiterleitung auf sich selbst', () => {
    expect(insightsSlugResolution('a', { canonical: 'a' })).toEqual({ kind: 'missing' })
    expect(insightsSlugResolution('a', { historyHit: 'a' })).toEqual({ kind: 'missing' })
  })

  it('ohne Befund: nichts gefunden', () => {
    expect(insightsSlugResolution('a', {})).toEqual({ kind: 'missing' })
  })
})

describe('insightsPublicHref', () => {
  it('jedes Format bekommt seine Basis (§9.2)', () => {
    expect(insightsPublicHref('article', 'x', '')).toBe('/insights/x')
    expect(insightsPublicHref('duel', 'a-vs-b', '')).toBe('/duels/a-vs-b')
    expect(insightsPublicHref('ranking', 'kaffee-2026', '')).toBe('/rankings/kaffee-2026')
    expect(insightsPublicHref('profile', 'irgendwas', 'upcountry-roast')).toBe('/brands/upcountry-roast')
  })

  it('ein Markenprofil OHNE Marken-Adresse hat keinen Pfad', () => {
    expect(insightsPublicHref('profile', 'irgendwas', '')).toBe('')
  })
})

describe('insightsOgPath', () => {
  it('baut den Pfad zum Vorschaubild', () => {
    expect(insightsOgPath('was-kostet-ein-rebranding')).toBe('/og/insights/was-kostet-ein-rebranding.png')
  })

  it('ein unmöglicher Slug bekommt KEIN Bild', () => {
    expect(insightsOgPath('Gross UND Leer')).toBe('')
    expect(insightsOgPath('')).toBe('')
  })
})
