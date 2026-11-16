import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { operatorTermsHref, resolveOperatorTerms, splitOperatorTerms } from '../shared/operatorTerms'

/** Die puren Regeln der Betreiber-Bedingungen (shared/operatorTerms.ts). */
describe('resolveOperatorTerms', () => {
  it('ist aus ohne Adresse — der Layer-Default', () => {
    expect(resolveOperatorTerms(undefined)).toBeNull()
    expect(resolveOperatorTerms({ url: { de: '', en: '  ' }, version: 'v1', draft: true })).toBeNull()
  })

  it('ist an mit einer Adresse; die fehlende Sprache zeigt auf dieselbe', () => {
    expect(resolveOperatorTerms({ url: { de: 'https://example.test/de/x' }, version: ' v1 ' })).toEqual({
      url: { de: 'https://example.test/de/x', en: 'https://example.test/de/x' },
      version: 'v1',
      draft: false,
    })
  })

  it('wählt die Adresse nach der Sprache, unbekannt ⇒ Englisch', () => {
    const terms = resolveOperatorTerms({ url: { de: 'https://example.test/de/x', en: 'https://example.test/x' }, version: 'v1', draft: true })!
    expect(operatorTermsHref(terms, 'de')).toBe('https://example.test/de/x')
    expect(operatorTermsHref(terms, 'en')).toBe('https://example.test/x')
    expect(operatorTermsHref(terms, 'fr')).toBe('https://example.test/x')
  })
})

describe('splitOperatorTerms', () => {
  it('nimmt das Feld immer ab und ist nur bei genau true bestätigt', () => {
    expect(splitOperatorTerms({ name: 'A', operatorTerms: true })).toEqual({ accepted: true, rest: { name: 'A' } })
    expect(splitOperatorTerms({ name: 'A', operatorTerms: 'true' })).toEqual({ accepted: false, rest: { name: 'A' } })
    expect(splitOperatorTerms({ name: 'A' })).toEqual({ accepted: false, rest: { name: 'A' } })
  })

  it('lässt Nicht-Objekte unverändert (das Schema lehnt sie danach ab)', () => {
    expect(splitOperatorTerms(null)).toEqual({ accepted: false, rest: null })
    expect(splitOperatorTerms([true])).toEqual({ accepted: false, rest: [true] })
    expect(splitOperatorTerms(undefined)).toEqual({ accepted: false, rest: undefined })
  })
})

describe('Fassung der Platform-App', () => {
  it('passt in consent_records.version (höchstens 64 Zeichen) und ist eingeschaltet', () => {
    const source = readFileSync(new URL('../../../apps/platform/app/app.config.ts', import.meta.url), 'utf8')
    const block = source.slice(source.indexOf('operatorTerms:'))
    const version = block.match(/version:\s*'([^']+)'/)?.[1] ?? ''
    expect(version).toBe('2026-11-entwurf-1')
    expect(version.length).toBeLessThanOrEqual(64)
    expect(block).toMatch(/de:\s*'https:\/\/pukalani\.app\/de\/betreiber-bedingungen'/)
    expect(block).toMatch(/en:\s*'https:\/\/pukalani\.app\/community-operator-terms'/)
  })
})
