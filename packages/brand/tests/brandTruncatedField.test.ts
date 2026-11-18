import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  type BrandDraftTurnFacts,
  brandDraftSlotFromParts,
  brandDraftTurnFromStored,
  brandFieldDraftGeneration,
  brandTruncatedDraftFields,
} from '../shared/brandTruncatedField'
import type { BrandGenerationMeta, BrandSlotView } from '../shared/types/brand'

/**
 * DAS KENNZEICHEN AM FELDWERT EINES ABGESCHNITTENEN ENTWURFS (KI1 d) — die
 * pure Regel. Eine Anzeige, abgeleitet aus Verlauf und Feld-Herkunft.
 */

function stored(role: string, parts: unknown, generationId: string | null): BrandDraftTurnFacts {
  return brandDraftTurnFromStored({ role, parts, generationId })
}

const field = (value: string, generationId: string | null) => ({ value, generationId })

describe('brandTruncatedDraftFields', () => {
  it('abgeschnittener letzter Entwurfs-Zug, Feld trägt ihn ⇒ gekennzeichnet', () => {
    const turns = [stored('george', { kind: 'draft', slotId: 'a.pitch', truncated: true }, 'g1')]
    expect([...brandTruncatedDraftFields(turns, { 'a.pitch': field('Wir bauen eine', 'g1') })]).toEqual(['a.pitch'])
  })

  it('ein späterer vollständiger Entwurf zum selben Feld ⇒ nicht', () => {
    const turns = [
      stored('george', { kind: 'draft', slotId: 'a.pitch', truncated: true }, 'g1'),
      stored('george', { kind: 'draft', slotId: 'a.pitch' }, 'g2'),
    ]
    expect(brandTruncatedDraftFields(turns, { 'a.pitch': field('Ganzer Satz.', 'g2') }).size).toBe(0)
    // … auch wenn die Herkunft noch auf den alten Lauf zeigte: der letzte Zug zählt.
    expect(brandTruncatedDraftFields(turns, { 'a.pitch': field('Wir bauen eine', 'g1') }).size).toBe(0)
  })

  it('der Mensch hat den Wert geändert (Herkunft unbekannt) ⇒ nicht', () => {
    const turns = [stored('george', { kind: 'draft', slotId: 'a.pitch', truncated: true }, 'g1')]
    expect(brandTruncatedDraftFields(turns, { 'a.pitch': field('Mein eigener Satz.', null) }).size).toBe(0)
  })

  it('leeres Feld ⇒ nicht', () => {
    const turns = [stored('george', { kind: 'draft', slotId: 'a.pitch', truncated: true }, 'g1')]
    expect(brandTruncatedDraftFields(turns, { 'a.pitch': field('   ', 'g1') }).size).toBe(0)
  })

  it('eine Rückfrage (auch die der Nachprüfung) zählt nie als abgeschnittener Entwurf', () => {
    const question = [stored('george', { kind: 'question', slotId: 'a.pitch', truncated: true }, 'g1')]
    expect(brandTruncatedDraftFields(question, { 'a.pitch': field('Alter Text', 'g1') }).size).toBe(0)

    // … und nimmt das Kennzeichen eines davor abgeschnittenen Entwurfs nicht
    // weg: sie schreibt kein Feld, dort steht weiter der abgeschnittene Text.
    const afterDraft = [
      stored('george', { kind: 'draft', slotId: 'a.pitch', truncated: true }, 'g1'),
      stored('george', { kind: 'question', slotId: 'a.pitch' }, 'g2'),
    ]
    expect([...brandTruncatedDraftFields(afterDraft, { 'a.pitch': field('Wir bauen eine', 'g1') })]).toEqual(['a.pitch'])
  })

  it('kaputte oder alte parts ⇒ nicht gekennzeichnet, kein Wurf', () => {
    for (const parts of [null, undefined, 'x', 42, [], {}, { kind: 'draft' }, { kind: 'draft', slotId: '' }, { truncated: true }, { kind: 'draft', slotId: 7, truncated: true }]) {
      const turns = [stored('george', parts, 'g1')]
      expect(() => brandTruncatedDraftFields(turns, { 'a.pitch': field('x', 'g1') })).not.toThrow()
      expect(brandTruncatedDraftFields(turns, { 'a.pitch': field('x', 'g1') }).size).toBe(0)
    }
    // Ein Entwurf ohne Lauf-Kennung lässt sich keinem Feldwert zuordnen.
    const noId = [stored('george', { kind: 'draft', slotId: 'a.pitch', truncated: true }, null)]
    expect(brandTruncatedDraftFields(noId, { 'a.pitch': field('x', null) }).size).toBe(0)
  })

  it('ein Gesprächs-Zug ohne Feld — oder einer, der nicht entwirft — ⇒ nichts', () => {
    const turns = [
      stored('george', { kind: 'reply', truncated: true }, 'c1'),
      stored('george', { kind: 'reply', slotId: 'a.origin', truncated: true }, 'c2'),
      stored('george', { kind: 'closing', slotId: 'a.origin', truncated: true }, 'c3'),
      stored('user', { kind: 'answer', slotId: 'a.origin' }, null),
    ]
    expect(brandTruncatedDraftFields(turns, { 'a.origin': field('Text', 'c2') }).size).toBe(0)
  })

  it('der Zug eines MENSCHEN ist nie ein Entwurf, auch mit draft-parts', () => {
    expect(stored('user', { kind: 'draft', slotId: 'a.pitch', truncated: true }, 'g1')).toEqual({
      draftSlotId: null,
      generationId: 'g1',
      truncated: false,
    })
  })

  it('Felder werden einzeln entschieden', () => {
    const turns = [
      stored('george', { kind: 'draft', slotId: 'a.pitch', truncated: true }, 'g1'),
      stored('george', { kind: 'draft', slotId: 'a.claim' }, 'g2'),
    ]
    const flagged = brandTruncatedDraftFields(turns, {
      'a.pitch': field('Wir bauen eine', 'g1'),
      'a.claim': field('Ganz.', 'g2'),
    })
    expect([...flagged]).toEqual(['a.pitch'])
  })
})

describe('brandDraftSlotFromParts', () => {
  it('nur kind draft mit Feld', () => {
    expect(brandDraftSlotFromParts({ kind: 'draft', slotId: 'a.pitch' })).toBe('a.pitch')
    expect(brandDraftSlotFromParts({ kind: 'question', slotId: 'a.pitch' })).toBeNull()
    expect(brandDraftSlotFromParts(null)).toBeNull()
  })
})

describe('brandFieldDraftGeneration — wessen Entwurf steht im Feld?', () => {
  const meta = (generationId: string, slotId: string, createdAt: string, outcome?: 'question'): BrandGenerationMeta => ({
    generationId,
    slotId,
    schemaVersion: 1,
    promptVersion: 'p1',
    model: 'm',
    provider: 'x',
    locale: 'de',
    inputHash: 'h',
    createdAt,
    ...(outcome ? { outcome } : {}),
  })
  const slot = (updatedAt: string | null): BrandSlotView => ({
    firstDraft: 'a', latestDraft: 'a', confirmed: null, confidence: null, updatedAt,
  })
  const T1 = '2026-11-18T10:00:00.000Z'
  const T2 = '2026-11-18T10:05:00.000Z'

  it('im laufenden Besuch: die Markierung des Stores gewinnt', () => {
    expect(brandFieldDraftGeneration({
      slotId: 'a.pitch', slot: slot(T2), generations: [], liveDraftGenerationId: 'g9', locallyEdited: true,
    })).toBe('g9')
  })

  it('nach dem Neuladen: das letzte Schreiben ist der Lauf (gleiche Zeit) ⇒ dessen Kennung', () => {
    expect(brandFieldDraftGeneration({
      slotId: 'a.pitch', slot: slot(T1), generations: [meta('g1', 'a.pitch', T1)], liveDraftGenerationId: null, locallyEdited: false,
    })).toBe('g1')
  })

  it('später gespeichert oder bestätigt (Zeit bewegt) ⇒ unbekannt', () => {
    expect(brandFieldDraftGeneration({
      slotId: 'a.pitch', slot: slot(T2), generations: [meta('g1', 'a.pitch', T1)], liveDraftGenerationId: null, locallyEdited: false,
    })).toBeNull()
  })

  it('offene eigene Eingabe ⇒ unbekannt', () => {
    expect(brandFieldDraftGeneration({
      slotId: 'a.pitch', slot: slot(T1), generations: [meta('g1', 'a.pitch', T1)], liveDraftGenerationId: null, locallyEdited: true,
    })).toBeNull()
  })

  it('fremdes Feld, Rückfrage oder fehlende Zeit ⇒ unbekannt', () => {
    const base = { slotId: 'a.pitch', liveDraftGenerationId: null, locallyEdited: false }
    expect(brandFieldDraftGeneration({ ...base, slot: slot(T1), generations: [meta('g1', 'a.claim', T1)] })).toBeNull()
    expect(brandFieldDraftGeneration({ ...base, slot: slot(T1), generations: [meta('g1', 'a.pitch', T1, 'question')] })).toBeNull()
    expect(brandFieldDraftGeneration({ ...base, slot: slot(null), generations: [meta('g1', 'a.pitch', T1)] })).toBeNull()
    expect(brandFieldDraftGeneration({ ...base, slot: undefined, generations: [meta('g1', 'a.pitch', T1)] })).toBeNull()
  })
})

describe('die Gegenprobe zur Route: Slot und Historien-Eintrag tragen DIESELBE Zeit', () => {
  it('generate.post.ts schreibt `updatedAt: now` und `createdAt: now` im selben Zug', () => {
    const route = readFileSync(join(
      dirname(fileURLToPath(import.meta.url)),
      '..', 'server', 'api', 'brand', 'profiles', '[id]', 'steps', '[stepKey]', 'generate.post.ts',
    ), 'utf8')
    expect(route).toMatch(/latestDraft: input\.draft,\s*updatedAt: now,/)
    expect(route).toMatch(/inputHash: input\.inputHash,\s*createdAt: now,/)
  })
})

const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'i18n', 'locales')

describe('die Feld-Sätze stehen in BEIDEN Sprachen', () => {
  for (const key of ['fieldBadge', 'fieldHint']) {
    it(key, () => {
      for (const locale of ['de', 'en'] as const) {
        const messages = JSON.parse(readFileSync(join(localesDir, `${locale}.json`), 'utf8')) as {
          brand: { workspace: { truncated: Record<string, unknown> } }
        }
        const value = messages.brand.workspace.truncated[key]
        expect(typeof value, `${locale}: ${key}`).toBe('string')
        expect(String(value)).not.toMatch(/[<>@]/)
      }
    })
  }
})
