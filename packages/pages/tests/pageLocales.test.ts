import { describe, expect, it } from 'vitest'
import { hasLocale, isFallbackLocale, orderedLocales, translationSourceLocale } from '../shared/pageLocales'
import { createPageTranslateSchema, MAX_PAGE_TRANSLATE_BODY } from '../schemas/page'

describe('isFallbackLocale', () => {
  it('gleiche Sprache ⇒ kein Hinweis', () => {
    expect(isFallbackLocale('de', 'de')).toBe(false)
    expect(isFallbackLocale('en', 'en')).toBe(false)
  })

  it('andere Sprache ⇒ Hinweis', () => {
    expect(isFallbackLocale('de', 'en')).toBe(true)
    expect(isFallbackLocale('en', 'de')).toBe(true)
  })

  it('Region zählt nicht — de-DE ist für den Leser dieselbe Fassung wie de', () => {
    expect(isFallbackLocale('de-DE', 'de')).toBe(false)
    expect(isFallbackLocale('de', 'de-AT')).toBe(false)
  })

  it('fehlt eine Angabe, behaupten wir nichts', () => {
    expect(isFallbackLocale('', 'de')).toBe(false)
    expect(isFallbackLocale('de', '')).toBe(false)
    expect(isFallbackLocale(null, undefined)).toBe(false)
  })
})

describe('orderedLocales', () => {
  it('stellt die Standardsprache nach vorn', () => {
    expect(orderedLocales(['de', 'en'], 'en')).toEqual(['en', 'de'])
    expect(orderedLocales(['en', 'de'], 'de')).toEqual(['de', 'en'])
  })

  it('lässt die übrige Reihenfolge der Config in Ruhe', () => {
    expect(orderedLocales(['en', 'fr', 'de'], 'de')).toEqual(['de', 'en', 'fr'])
  })

  it('unbekannte Standardsprache ⇒ Liste unverändert', () => {
    expect(orderedLocales(['en', 'de'], 'fr')).toEqual(['en', 'de'])
  })
})

describe('translationSourceLocale', () => {
  it('bevorzugt die Standardsprache als Quelle', () => {
    expect(translationSourceLocale('de', ['en', 'fr'], 'en')).toBe('en')
  })

  it('nimmt eine andere gefüllte Sprache, wenn die Standardsprache leer ist', () => {
    expect(translationSourceLocale('en', ['fr'], 'en')).toBe('fr')
  })

  it('übersetzt nie aus sich selbst', () => {
    expect(translationSourceLocale('de', ['de'], 'en')).toBeNull()
    expect(translationSourceLocale('de', ['de-DE'], 'en')).toBeNull()
  })

  it('nichts gefüllt ⇒ kein Knopf', () => {
    expect(translationSourceLocale('de', [], 'en')).toBeNull()
  })
})

describe('pageTranslateSchema', () => {
  const schema = createPageTranslateSchema()
  const valid = { locale: 'de', title: 'Imprint', body: '# Imprint' }

  it('nimmt eine gültige Anfrage an', () => {
    expect(schema.parse(valid)).toEqual(valid)
  })

  it('deckelt den Text bei 12.000 Zeichen (Davids Entscheidung d)', () => {
    expect(() => schema.parse({ ...valid, body: 'x'.repeat(MAX_PAGE_TRANSLATE_BODY + 1) })).toThrow()
    expect(() => schema.parse({ ...valid, body: 'x'.repeat(MAX_PAGE_TRANSLATE_BODY) })).not.toThrow()
  })

  it('verlangt einen Titel und einen gültigen Sprachcode', () => {
    expect(() => schema.parse({ ...valid, title: '  ' })).toThrow()
    expect(() => schema.parse({ ...valid, locale: 'deutsch' })).toThrow()
  })

  it('lässt keine zusätzlichen Felder durch (strict)', () => {
    expect(() => schema.parse({ ...valid, status: 'published' })).toThrow()
  })
})

describe('hasLocale', () => {
  it('findet die Sprache unabhängig von der Region', () => {
    expect(hasLocale(['de-DE'], 'de')).toBe(true)
    expect(hasLocale(['de'], 'de-AT')).toBe(true)
    expect(hasLocale(['en', 'de'], 'de')).toBe(true)
  })

  it('sagt Nein, wenn die Sprache fehlt — davon hängt ab, ob ein hreflang verschwindet', () => {
    expect(hasLocale(['de'], 'en')).toBe(false)
    expect(hasLocale([], 'de')).toBe(false)
    expect(hasLocale(['de'], '')).toBe(false)
  })
})
