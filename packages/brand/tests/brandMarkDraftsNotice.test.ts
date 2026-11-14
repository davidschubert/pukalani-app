import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { brandStepAcceptance, brandStepCompletion, transitionBrandStep } from '../shared/brandJourney'
import { BRAND_MARK_DRAFTS_SLOT_ID, brandImageModelLabel } from '../shared/brandMarkDrafts'
import { BRAND_SLOTS, confirmableRequiredSlotsForStep, slotsForStep } from '../shared/slotRegistry'

/**
 * DER HINWEIS VOR DEM AUSLÖSEN (Davids Entscheidung 2026-11-13, BE-004) —
 * und die Zusage, die er macht: „Diese Stufe ist freiwillig … das Kapitel
 * lässt sich ohne KI-Entwürfe abschliessen". Ein Satz auf dem Bildschirm, der
 * nicht stimmt, wäre schlimmer als keiner — deshalb steht die Zusage hier als
 * Rechnung, nicht nur als Text.
 */

const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'i18n', 'locales')
const locales = {
  de: JSON.parse(readFileSync(join(localesDir, 'de.json'), 'utf8')) as Record<string, unknown>,
  en: JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf8')) as Record<string, unknown>,
}

function lookup(root: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined),
    root,
  )
}

const NOTICE_KEYS = ['title', 'model', 'location', 'optional', 'link'] as const

describe('brand.mark.drafts.notice — beide Sprachen', () => {
  it.each(Object.entries(locales))('%s trägt jeden Schlüssel als Text', (_lang, root) => {
    for (const key of NOTICE_KEYS) {
      const value = lookup(root, `brand.mark.drafts.notice.${key}`)
      expect(typeof value, key).toBe('string')
      expect((value as string).trim().length, key).toBeGreaterThan(0)
    }
  })

  it.each(Object.entries(locales))('%s: `model` trägt den Platzhalter {model}', (_lang, root) => {
    expect(lookup(root, 'brand.mark.drafts.notice.model')).toContain('{model}')
  })

  it.each(Object.entries(locales))('%s: keine Zeichen, an denen der Nachrichten-Compiler scheitert', (_lang, root) => {
    for (const key of NOTICE_KEYS) {
      const value = lookup(root, `brand.mark.drafts.notice.${key}`) as string
      // Spitze Klammern, `@`, `|` und Klammern ausser dem einen Platzhalter.
      expect(value.replace('{model}', ''), key).not.toMatch(/[<>@|{}]/)
    }
  })

  it.each(Object.entries(locales))('%s: der Fehlertext sagt, dass der Lauf nicht zählt', (lang, root) => {
    const failed = lookup(root, 'brand.mark.drafts.error.failed') as string
    expect(failed).toMatch(lang === 'de' ? /nicht auf das Tageskontingent/ : /does not count/)
  })
})

describe('brandImageModelLabel', () => {
  it('kennt den Namen des heutigen Bildmodells', () => {
    expect(brandImageModelLabel('google/gemini-2.5-flash-image')).toBe('Gemini 2.5 Flash Image')
  })

  it('GEGENPROBE: ein unbekannter Slug erscheint wörtlich, nie leer', () => {
    expect(brandImageModelLabel('acme/painter-9')).toBe('acme/painter-9')
  })
})

describe('Stufe 3 ist freiwillig — das Kapitel `mark` schliesst ohne `j.drafts`', () => {
  it('`j.drafts` ist im Kapitel und nicht Pflicht', () => {
    const drafts = BRAND_SLOTS.find(slot => slot.id === BRAND_MARK_DRAFTS_SLOT_ID)
    expect(drafts?.stepId).toBe('mark')
    expect(drafts?.required).toBe(false)
    expect(slotsForStep('mark').map(slot => slot.id)).toContain(BRAND_MARK_DRAFTS_SLOT_ID)
  })

  it('alle bestätigbaren Pflicht-Slots bestätigt und abgenommen, KEIN Entwurf ⇒ abschliessbar', () => {
    const required = confirmableRequiredSlotsForStep('mark')
    // Ein ehrlicher Fall, kein leerer: das Kapitel HAT Pflicht-Slots.
    expect(required.length).toBeGreaterThan(0)
    expect(required.map(slot => slot.id)).not.toContain(BRAND_MARK_DRAFTS_SLOT_ID)

    const slots = Object.fromEntries(
      required.map(slot => [slot.id, { hasValue: true, confirmed: true, accepted: true }]),
    )
    expect(slots[BRAND_MARK_DRAFTS_SLOT_ID]).toBeUndefined()

    expect(brandStepCompletion('mark', slots).slotsReady).toBe(true)
    expect(brandStepAcceptance('mark', slots).ready).toBe(true)
    expect(transitionBrandStep(
      { stepKey: 'mark', state: 'active', confidence: 'fits', slots },
      { kind: 'complete' },
    ).ok).toBe(true)
  })

  it('GEGENPROBE: fehlt ein Pflicht-Slot, schliesst es nicht — der Test kann rot werden', () => {
    const [first, ...rest] = confirmableRequiredSlotsForStep('mark')
    const slots = Object.fromEntries(
      rest.map(slot => [slot.id, { hasValue: true, confirmed: true, accepted: true }]),
    )
    expect(brandStepCompletion('mark', slots).missingRequired).toEqual([first!.id])
    expect(transitionBrandStep(
      { stepKey: 'mark', state: 'active', confidence: 'fits', slots },
      { kind: 'complete' },
    ).ok).toBe(false)
  })
})
