import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  brandTurnTruncated,
  truncatedFromParts,
  truncatedRetrySlotFromParts,
} from '../shared/brandGeneration'

/**
 * DIE ABGESCHNITTENE ANTWORT IM BROWSER (P17, BE-007) und die zwei neuen
 * Sätze des Abschalters (BE-006). Die Regel „abgeschnitten" ist EINE
 * (`brandTurnTruncated`) — Server und Test lesen dieselbe.
 */

describe('brandTurnTruncated', () => {
  it('nur `length` heisst abgeschnitten', () => {
    expect(brandTurnTruncated('length')).toBe(true)
    for (const reason of ['stop', '', 'content_filter', 'tool_calls']) expect(brandTurnTruncated(reason)).toBe(false)
  })
})

describe('truncatedFromParts', () => {
  it('liest das additive Kennzeichen', () => {
    expect(truncatedFromParts({ kind: 'reply', truncated: true })).toBe(true)
  })

  it('alles andere ist nicht abgeschnitten', () => {
    for (const parts of [null, undefined, 'x', 42, {}, { truncated: 'true' }, { truncated: 1 }, { kind: 'reply' }]) {
      expect(truncatedFromParts(parts)).toBe(false)
    }
  })
})

describe('truncatedRetrySlotFromParts — nur ein abgeschnittener ENTWURFS-Zug lässt sich neu erzeugen', () => {
  it('Entwurf oder Rückfrage der Generierung ⇒ das Feld', () => {
    expect(truncatedRetrySlotFromParts({ kind: 'draft', slotId: 'a.pitch', truncated: true })).toBe('a.pitch')
    expect(truncatedRetrySlotFromParts({ kind: 'question', slotId: 'a.pitch', truncated: true })).toBe('a.pitch')
  })

  it('ein Gesprächszug, ein vollständiger Zug oder ein Zug ohne Feld ⇒ nichts', () => {
    expect(truncatedRetrySlotFromParts({ kind: 'reply', slotId: 'a.origin', truncated: true })).toBeNull()
    expect(truncatedRetrySlotFromParts({ kind: 'closing', slotId: 'a.origin', truncated: true })).toBeNull()
    expect(truncatedRetrySlotFromParts({ kind: 'draft', slotId: 'a.pitch' })).toBeNull()
    expect(truncatedRetrySlotFromParts({ kind: 'draft', truncated: true })).toBeNull()
    expect(truncatedRetrySlotFromParts(null)).toBeNull()
  })
})

const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'i18n', 'locales')

function lookup(locale: 'de' | 'en', key: string): unknown {
  const messages = JSON.parse(readFileSync(join(localesDir, `${locale}.json`), 'utf8')) as Record<string, unknown>
  return key.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
    messages,
  )
}

describe('die neuen Sätze stehen in BEIDEN Sprachen', () => {
  const keys = [
    'brand.workspace.truncated.hint',
    'brand.workspace.truncated.retry',
    'brand.workspace.truncated.writeAgain',
    'brand.check.form.errors.paused',
    'brand.check.document.errors.paused',
    'brand.myScores.errors.paused',
  ]

  for (const key of keys) {
    it(key, () => {
      for (const locale of ['de', 'en'] as const) {
        const value = lookup(locale, key)
        expect(typeof value, `${locale}: ${key}`).toBe('string')
        expect(String(value).length).toBeGreaterThan(0)
        expect(String(value)).not.toMatch(/[<>]/)
      }
    })
  }

  it('„pausiert" sagt etwas anderes als „gerade nicht erreichbar"', () => {
    expect(lookup('de', 'brand.check.form.errors.paused')).not.toBe(lookup('de', 'brand.check.form.errors.unavailable'))
    expect(String(lookup('de', 'brand.check.form.errors.paused'))).not.toContain('Minuten')
  })

  it('der Gesprächs-Satz nennt die Stimme', () => {
    expect(String(lookup('de', 'brand.workspace.truncated.writeAgain'))).toContain('{voice}')
    expect(String(lookup('en', 'brand.workspace.truncated.writeAgain'))).toContain('{voice}')
  })
})
