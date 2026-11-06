import { describe, expect, it } from 'vitest'
import {
  BRAND_MARK_DRAFTS_MAX,
  BRAND_MARK_DRAFTS_PER_RUN,
  BRAND_MARK_DRAFTS_SLOT_ID,
  BRAND_MARK_DRAFT_TITLE_MAX,
  type BrandMarkDraftEntry,
  brandMarkDraftTitle,
  brandMarkDraftsSlotValue,
  brandMarkPromptHash,
  clampBrandMarkDraftTitle,
} from '../shared/brandMarkDrafts'
import { BRAND_SLOTS } from '../shared/slotRegistry'

/**
 * DIE REGELN DER KI-ENTWÜRFE (`shared/brandMarkDrafts.ts`, Brand Design D5c,
 * §2.5 Stufe 3).
 *
 * Geprüft wird, was ein Typ nicht halten kann:
 *
 *  1. DER SLOT-WERT TRÄGT KEIN BILD. Er nennt Name, Modell, Prompt-Hash und
 *     die Zeilen-Id — nie eine Adresse, nie Base64, nie einen Bucket-Namen.
 *     Das ist Leitplanke §1.11 b an der Stelle, an der sie brechen würde.
 *  2. NUR BEHALTENE stehen darin, und ohne einen behaltenen ist er LEER (der
 *     Slot verschwindet dann ganz, s. `syncBrandMarkDraftsSlot`).
 *  3. DER HASH IST DETERMINISTISCH und unterscheidet zwei Prompts.
 *  4. DIE SESSION IST UND BLEIBT INTERN — `sensitivity: 'internal'`,
 *     `type: 'special'`, also nicht bestätigbar. Ein Beweis am REGISTER, weil
 *     genau diese zwei Angaben die Reise verhindern.
 */
function entry(overrides: Partial<BrandMarkDraftEntry> = {}): BrandMarkDraftEntry {
  return {
    id: 'row-1',
    title: 'Entwurf 1',
    model: 'google/gemini-2.5-flash-image-preview',
    promptHash: 'a1b2c3d4e5f60718',
    kept: false,
    createdAt: '2026-09-08T10:00:00.000Z',
    ...overrides,
  }
}

const LABELS = { kept: 'Behalten', model: 'Modell', prompt: 'Prompt' }

describe('Die Zahlen des Vertrags (§2.5 Stufe 3)', () => {
  it('vier Entwürfe je Lauf, zwölf je Marke', () => {
    expect(BRAND_MARK_DRAFTS_PER_RUN).toBe(4)
    expect(BRAND_MARK_DRAFTS_MAX).toBe(12)
  })
})

describe('brandMarkDraftsSlotValue', () => {
  it('nennt nur BEHALTENE Entwürfe, mit Name und Herkunft', () => {
    const value = brandMarkDraftsSlotValue([
      entry({ id: 'a', title: 'Bogen', kept: true }),
      entry({ id: 'b', title: 'Ring', kept: false }),
    ], LABELS)
    expect(value).toContain('## Behalten 1 · Bogen')
    expect(value).toContain('Modell: google/gemini-2.5-flash-image-preview')
    expect(value).toContain('Prompt: a1b2c3d4e5f60718')
    expect(value).toContain('Id: a')
    expect(value).not.toContain('Ring')
  })

  it('ohne einen behaltenen Entwurf ist er LEER — der Slot verschwindet dann', () => {
    expect(brandMarkDraftsSlotValue([entry(), entry({ id: 'b' })], LABELS)).toBe('')
    expect(brandMarkDraftsSlotValue([], LABELS)).toBe('')
  })

  it('LEITPLANKE: kein Bild, keine Adresse, kein Bucket-Name im Wert', () => {
    const value = brandMarkDraftsSlotValue([entry({ kept: true })], LABELS)
    expect(value).not.toContain('data:')
    expect(value).not.toContain('http')
    expect(value).not.toContain('brand-drafts')
    expect(value).not.toContain('/image')
    expect(value).not.toContain('base64')
  })

  it('nummeriert die behaltenen fortlaufend, nicht nach ihrer Position in der Liste', () => {
    const value = brandMarkDraftsSlotValue([
      entry({ id: 'a', kept: false }),
      entry({ id: 'b', title: 'Zwei', kept: true }),
      entry({ id: 'c', title: 'Drei', kept: true }),
    ], LABELS)
    expect(value).toContain('## Behalten 1 · Zwei')
    expect(value).toContain('## Behalten 2 · Drei')
  })

  it('eine fehlende Herkunft wird als Strich gesetzt, nicht als leere Zeile', () => {
    const value = brandMarkDraftsSlotValue([
      entry({ kept: true, model: '', promptHash: '' }),
    ], LABELS)
    expect(value).toContain('Modell: —')
    expect(value).toContain('Prompt: —')
  })
})

describe('brandMarkPromptHash', () => {
  it('ist deterministisch und 16 Hex-Zeichen lang', () => {
    const hash = brandMarkPromptHash('ruhig, handwerklich, ein Bogen')
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
    expect(brandMarkPromptHash('ruhig, handwerklich, ein Bogen')).toBe(hash)
  })

  it('GEGENPROBE: ein anderer Prompt ergibt einen anderen Hash', () => {
    expect(brandMarkPromptHash('a')).not.toBe(brandMarkPromptHash('b'))
    expect(brandMarkPromptHash('Kailua Coffee')).not.toBe(brandMarkPromptHash('Kailua Coffe'))
  })

  it('ein leerer Prompt ergibt trotzdem einen Wert der richtigen Form', () => {
    expect(brandMarkPromptHash('')).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('Namen', () => {
  it('zählt in der Inhaltssprache', () => {
    expect(brandMarkDraftTitle(3, 'de')).toBe('Entwurf 3')
    expect(brandMarkDraftTitle(3, 'en')).toBe('Draft 3')
  })

  it('klemmt auf EINE Zeile und auf die Länge', () => {
    expect(clampBrandMarkDraftTitle('  Bogen \n über  Grundlinie  ')).toBe('Bogen über Grundlinie')
    expect(clampBrandMarkDraftTitle('x'.repeat(400))).toHaveLength(BRAND_MARK_DRAFT_TITLE_MAX)
    expect(clampBrandMarkDraftTitle(42)).toBe('')
    expect(clampBrandMarkDraftTitle(undefined)).toBe('')
  })
})

describe('Die Session im Register', () => {
  it('ist intern und nicht bestätigbar — daran hängt, dass sie nie reist', () => {
    const session = BRAND_SLOTS.find(entry => entry.id === BRAND_MARK_DRAFTS_SLOT_ID)
    expect(session).toBeDefined()
    expect(session!.sensitivity).toBe('internal')
    expect(session!.audience).toBe('internal')
    expect(session!.type).toBe('special')
    expect(session!.required).toBe(false)
    expect(session!.editor).toBe('drafts')
  })
})
