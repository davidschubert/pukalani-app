import { describe, expect, it } from 'vitest'
import { isBrandChapterShareable, isBrandSlotShareable } from '../shared/brandSharing'
import { BRAND_DESIGN_STEP_KEYS, BRAND_FOUNDATION_STEP_KEYS } from '../shared/slotRegistry'
import type { BrandDesignSnapshotPreset } from '../shared/types/brand'
import { buildBrandSnapshot } from '../server/utils/brandSnapshot'
import type { BrandProfileRow, BrandStepRow } from '../server/utils/brandStore'

/**
 * DER SNAPSHOT TRÄGT DIE SECHS DESIGN-KAPITEL NUR NOCH ALS PRESET
 * (Brand Design D9, Davids Entscheidung 2026-09-09; DECISION-LOG „Brand Design
 * nach D9", Entscheidung 2).
 *
 * ── WAS HIER BEWIESEN WIRD, UND WARUM ES NICHT TAUTOLOGISCH IST ──────────
 * „Kein `h.base` im Abbild" wäre auch dann grün, wenn der Wert nie bestätigt
 * gewesen wäre oder der Slot-Filter ihn ohnehin zurückhielte. Beides ist
 * ausdrücklich WIDERLEGT, bevor die eigentliche Zusage geprüft wird:
 * `isBrandSlotShareable('h.base')` ist `true` (der Slot ist öffentlich UND
 * Festlegung), und die Zeile trägt ihn bestätigt. Vor D9 stand er deshalb im
 * Abbild — das Kapitel ist bei gesperrter Schicht `locked`, nicht `skipped`,
 * und `locked` fiel durch keinen Filter.
 *
 * ── MIT UND OHNE PRESET ──────────────────────────────────────────────────
 * Beide Fälle stehen hier, weil sie sich GLEICH verhalten müssen. Davids Satz
 * war „sobald ein Preset dabei ist"; gebaut ist die schärfere Fassung — die
 * Begründung steht bei `isBrandChapterShareable`, die Zusage steht hier.
 */

/** Ein Preset-Doppel: geprüft wird, DASS es durchgereicht wird, nicht sein Inhalt. */
const DESIGN = {
  version: 1,
  dna: {},
  color: { base: '#b98a5e' },
  type: {},
  mark: {},
  imagery: {},
  motion: {},
} as unknown as BrandDesignSnapshotPreset

function profile(extra: Record<string, unknown> = {}): BrandProfileRow {
  return {
    $id: 'p1',
    title: 'Kailua Coffee Co.',
    contentLocale: 'de',
    pathKind: 'new',
    hasName: true,
    team: 'solo',
    storyBody: 'Ein Absatz.',
    // Die Schicht ist freigeschaltet — sonst stünden die sechs Kapitel als
    // `locked` da, und der Beweis liefe am strengeren Fall vorbei.
    designUnlockedAt: '2026-09-09T00:00:00.000Z',
    ...extra,
  } as unknown as BrandProfileRow
}

function stepRow(stepKey: string, slots: Record<string, string>): BrandStepRow {
  return {
    $id: `p1_${stepKey}`,
    stepKey,
    state: 'done',
    revision: 1,
    slots: JSON.stringify(
      Object.fromEntries(Object.entries(slots).map(([id, value]) => [id, { confirmed: value, accepted: true }])),
    ),
  } as unknown as BrandStepRow
}

const ROWS = [
  stepRow('context', { 'a.pitch': 'Eine Rösterei mit Ausschank auf Oʻahu.' }),
  stepRow('result', { 'result.direction': 'warm-editorial' }),
  stepRow('color', { 'h.base': '#b98a5e', 'h.roles': 'ROLLEN-TABELLE' }),
  stepRow('type', { 'i.pair': 'classic-geometric' }),
  stepRow('motion', { 'l.tempo': 'snappy' }),
]

describe('isBrandChapterShareable', () => {
  it('die sechs Design-Kapitel reisen NICHT', () => {
    for (const stepKey of BRAND_DESIGN_STEP_KEYS) expect(isBrandChapterShareable(stepKey), stepKey).toBe(false)
  })

  it('GEGENPROBE: jedes Foundation-Kapitel reist weiter', () => {
    for (const stepKey of BRAND_FOUNDATION_STEP_KEYS) {
      expect(isBrandChapterShareable(stepKey), stepKey).toBe(true)
    }
  })

  it('FAIL-OPEN bei unbekanntem Kapitel — das Netz sind die SLOTS', () => {
    // Ein umbenanntes oder künftiges Kapitel verliert seine Werte nicht; was
    // darin stehen darf, entscheidet weiter `isBrandSlotShareable` (fail-closed).
    expect(isBrandChapterShareable('gibt-es-nicht')).toBe(true)
    expect(isBrandSlotShareable('gibt.es.nicht')).toBe(false)
  })
})

describe('buildBrandSnapshot', () => {
  it('VORAUSSETZUNG: `h.base` ist ein reisefähiger Slot — sonst bewiese unten nichts', () => {
    expect(isBrandSlotShareable('h.base')).toBe(true)
    expect(isBrandSlotShareable('i.pair')).toBe(true)
    expect(isBrandSlotShareable('l.tempo')).toBe(true)
  })

  it('OHNE Preset: kein Design-Kapitel in `chapters`, die Foundation steht darin', () => {
    const { snapshot, payload } = buildBrandSnapshot(profile(), ROWS, { betaAccount: false })
    const keys = snapshot.chapters.map(chapter => chapter.stepKey)
    expect(keys).toContain('context')
    for (const stepKey of BRAND_DESIGN_STEP_KEYS) expect(keys).not.toContain(stepKey)
    expect(payload).not.toContain('h.base')
    expect(payload).not.toContain('ROLLEN-TABELLE')
    expect(payload).not.toContain('i.pair')
    expect(payload).not.toContain('l.tempo')
    // Die positive Hälfte: das Abbild ist nicht einfach leer.
    expect(payload).toContain('Ausschank auf Oʻahu')
    expect(snapshot.design).toBeUndefined()
  })

  it('MIT Preset: dasselbe Ergebnis — plus das Preset', () => {
    const { snapshot, payload } = buildBrandSnapshot(profile(), ROWS, { betaAccount: false, design: DESIGN })
    for (const stepKey of BRAND_DESIGN_STEP_KEYS) {
      expect(snapshot.chapters.map(chapter => chapter.stepKey)).not.toContain(stepKey)
    }
    expect(payload).not.toContain('"h.base"')
    // Der Hex-Ton steht sehr wohl darin — aber im Preset, nicht als Slot-Wert.
    expect(snapshot.design?.color.base).toBe('#b98a5e')
    expect(snapshot.presetId).toBe('design:p1')
  })

  it('die Kapitel-Liste ist mit und ohne Preset dieselbe', () => {
    // Die Zusage der schärferen Fassung in einem Satz: das Preset ENTSCHEIDET
    // nicht, was in `chapters` steht.
    const withoutPreset = buildBrandSnapshot(profile(), ROWS, { betaAccount: false }).snapshot.chapters
    const withPreset = buildBrandSnapshot(profile(), ROWS, { betaAccount: false, design: DESIGN }).snapshot.chapters
    expect(withPreset).toEqual(withoutPreset)
  })

  it('eine GESPERRTE Schicht reist ebenso wenig mit — `locked` ist nicht `skipped`', () => {
    const { payload } = buildBrandSnapshot(profile({ designUnlockedAt: null }), ROWS, { betaAccount: false })
    expect(payload).not.toContain('h.base')
    expect(payload).toContain('Ausschank auf Oʻahu')
  })
})
