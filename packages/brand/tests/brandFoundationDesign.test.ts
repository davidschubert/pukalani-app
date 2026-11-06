import { describe, expect, it } from 'vitest'
import {
  BRAND_FOUNDATION_DESIGN_SECTIONS,
  type BrandFoundationInput,
  buildBrandFoundation,
} from '../shared/brandFoundation'
import { KAILUA_COFFEE_DESIGN } from '../shared/examples/kailuaCoffeeDesign'
import type { BrandShareSnapshot } from '../shared/types/brand'

/**
 * KAPITEL 10 IN BEIDEN SNAPSHOT-FASSUNGEN (Brand Design D8, §2.8).
 *
 * ── WARUM EIN v1-FIXTURE HIER STEHT ──────────────────────────────────────
 * Jeder Link, der vor D8 verschickt wurde, trägt einen Snapshot OHNE `design`
 * und mit `schemaVersion: 1`. Er muss weiter lesbar bleiben — und zwar so, wie
 * er es damals war: Richtung plus Schranke. Ein Renderer, der nach der ZAHL
 * fragte statt nach dem FELD, würde ihn beim ersten Aufruf leeren, und niemand
 * würde es merken (die Share-Seite hat keinen Besitzer, der sich beschwert).
 */

const DESIGN = KAILUA_COFFEE_DESIGN!

const BASE_INPUT: BrandFoundationInput = {
  title: 'Kailua Coffee Co.',
  contentLocale: 'de',
  story: 'Eine Rösterei auf Oʻahu.',
  chapters: [{
    stepKey: 'context',
    slots: [{ slotId: 'a.pitch', value: 'Eine Röstung pro Saison.' }],
  }],
}

/** Wörtlich die Form, die `share.post.ts` vor D8 geschrieben hat. */
const V1_SNAPSHOT: BrandShareSnapshot = {
  schemaVersion: 1,
  title: 'Kailua Coffee Co.',
  contentLocale: 'de',
  story: 'Eine Rösterei auf Oʻahu.',
  chapters: [{
    stepKey: 'context',
    slots: [{ slotId: 'a.pitch', value: 'Eine Röstung pro Saison.' }],
  }],
  presetId: 'warm-editorial',
  presetVersion: '1',
}

/** Dieselbe Marke, wie `share.post.ts` sie seit D8 schreibt. */
const V2_SNAPSHOT: BrandShareSnapshot = {
  ...V1_SNAPSHOT,
  schemaVersion: 2,
  presetId: 'design:brand-123',
  presetVersion: '1',
  design: DESIGN,
}

/** Genau das, was die Share-Seite mit einem Snapshot tut. */
function render(snapshot: BrandShareSnapshot) {
  return buildBrandFoundation({
    title: snapshot.title,
    contentLocale: snapshot.contentLocale,
    story: snapshot.story,
    chapters: snapshot.chapters,
    ...(snapshot.presetId
      ? { direction: { id: snapshot.presetId, version: snapshot.presetVersion } }
      : {}),
    ...(snapshot.design ? { design: snapshot.design } : {}),
  }).chapters
}

describe('Kapitel 10 ohne Preset — die Schranke bleibt (G4, unverändert)', () => {
  const visual = buildBrandFoundation(BASE_INPUT).chapters.find(chapter => chapter.id === 'visuell')!

  it('steht als `locked` da', () => {
    expect(visual.state).toBe('locked')
    expect(visual.blocks.filter(block => block.kind === 'locked')).toHaveLength(5)
  })

  it('trägt keinen design-Block', () => {
    expect(visual.blocks.some(block => block.kind === 'design')).toBe(false)
  })
})

describe('Kapitel 10 mit Preset — voll und abgenommen (D8)', () => {
  const visual = buildBrandFoundation({ ...BASE_INPUT, design: DESIGN })
    .chapters.find(chapter => chapter.id === 'visuell')!

  it('ist `done` und trägt GENAU einen Block', () => {
    expect(visual.state).toBe('done')
    expect(visual.blocks.map(block => block.kind)).toEqual(['design'])
  })

  it('verdrängt Schranke UND Richtung', () => {
    const withBoth = buildBrandFoundation({
      ...BASE_INPUT,
      direction: { id: 'warm-editorial', version: '1' },
      design: DESIGN,
    }).chapters.find(chapter => chapter.id === 'visuell')!
    // Die Richtung war die Ansage, das Preset ist das Gebaute — zwei
    // Farbwelten nebeneinander wären eine Frage statt einer Auskunft.
    expect(withBoth.blocks.map(block => block.kind)).toEqual(['design'])
  })

  it('macht aus behaltenen Entwürfen eine ZAHL, nie eine Id', () => {
    const withDrafts = buildBrandFoundation({
      ...BASE_INPUT,
      design: { ...DESIGN, mark: { ...DESIGN.mark, keptDrafts: ['draft-a', 'draft-b'] } },
    }).chapters.find(chapter => chapter.id === 'visuell')!
    const block = withDrafts.blocks[0]!
    expect(block.kind === 'design' && block.keptDrafts).toBe(2)
    // Der Block selbst trägt die Ids NIE weiter — auch nicht privat.
    expect(JSON.stringify(block)).not.toContain('draft-a')
    expect(block.kind === 'design' && 'keptDrafts' in block.preset.mark).toBe(false)
  })

  it('gibt dem Block alles, was die Vitrine braucht', () => {
    const block = visual.blocks[0]!
    if (block.kind !== 'design') throw new Error('kein design-Block')
    expect(block.title).toBe('Kailua Coffee Co.')
    expect(block.preset.color.rampLight[500]).toMatch(/^#[0-9a-f]{6}$/i)
    expect(block.preset.mark.examples).toHaveLength(8)
    expect(block.preset.motion.transitions).toHaveLength(4)
  })
})

describe('Der Renderer liest v1 UND v2 (§2.7 des BF1-Konzepts)', () => {
  it('v1 zeigt Richtung und Schranke — unverändert', () => {
    const visual = render(V1_SNAPSHOT).find(chapter => chapter.id === 'visuell')!
    expect(visual.state).toBe('locked')
    expect(visual.blocks.map(block => block.kind))
      .toEqual(['direction', 'swatches', 'locked', 'locked', 'locked', 'locked', 'locked'])
  })

  it('v2 zeigt das volle Kapitel', () => {
    const visual = render(V2_SNAPSHOT).find(chapter => chapter.id === 'visuell')!
    expect(visual.state).toBe('done')
    expect(visual.blocks.map(block => block.kind)).toEqual(['design'])
  })

  it('gefragt wird das FELD, nicht die Zahl', () => {
    // Eine v2-Marke OHNE fertiges Brand Design gibt es wirklich — sie muss
    // dieselbe Schranke zeigen wie v1.
    const withoutDesign: BrandShareSnapshot = { ...V1_SNAPSHOT, schemaVersion: 2 }
    const visual = render(withoutDesign).find(chapter => chapter.id === 'visuell')!
    expect(visual.state).toBe('locked')

    // Und ein v1-Snapshot, dem jemand ein `design` untergeschoben hätte, würde
    // es rendern: die Zahl ist Buchhaltung, das Feld ist die Auskunft.
    const oddball: BrandShareSnapshot = { ...V1_SNAPSHOT, design: DESIGN }
    expect(render(oddball).find(chapter => chapter.id === 'visuell')!.state).toBe('done')
  })

  it('ein `design:`-presetId löst KEINE Richtung auf', () => {
    // `presetId` trägt ab v2 die Preset-Kennung. Der Richtungs-Katalog kennt
    // sie nicht — und genau das ist richtig: gerendert wird das Ergebnis.
    const visual = render(V2_SNAPSHOT).find(chapter => chapter.id === 'visuell')!
    expect(visual.blocks.some(block => block.kind === 'direction')).toBe(false)
  })

  it('die übrigen Kapitel sind in beiden Fassungen identisch', () => {
    const v1 = render(V1_SNAPSHOT).filter(chapter => chapter.id !== 'visuell')
    const v2 = render(V2_SNAPSHOT).filter(chapter => chapter.id !== 'visuell')
    expect(v2).toEqual(v1)
  })
})

describe('Die fünf Sprungmarken von Kapitel 10', () => {
  it('sind stabil und eindeutig', () => {
    expect([...BRAND_FOUNDATION_DESIGN_SECTIONS])
      .toEqual(['farbwelt', 'typografie', 'zeichen', 'bildsprache', 'bewegung'])
    expect(new Set(BRAND_FOUNDATION_DESIGN_SECTIONS).size)
      .toBe(BRAND_FOUNDATION_DESIGN_SECTIONS.length)
  })
})
