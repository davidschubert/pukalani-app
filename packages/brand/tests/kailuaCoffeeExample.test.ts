import { describe, expect, it } from 'vitest'
import {
  BRAND_FOUNDATION_CHAPTER_IDS,
  type BrandFoundationChapterId,
  type BrandFoundationInput,
  buildBrandFoundation,
} from '../shared/brandFoundation'
import { BRAND_DIRECTIONS_VERSION, brandDirectionById } from '../shared/brandDirections'
import { brandSlotValueMatchesFormat } from '../shared/brandSlotFormat'
import { KAILUA_COFFEE_EXAMPLE, KAILUA_COFFEE_EXAMPLE_META } from '../shared/examples/kailuaCoffee'
import { sessionTravels, slotById } from '../shared/slotRegistry'

/**
 * DER FESTE SNAPSHOT DER BEISPIEL-MARKE (Konzept
 * docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §4/§5 G5).
 *
 * Die Seite `/beispiel/kailua-coffee` ist seit dem 2026-09-09 weg (die Marke
 * steht als echte Veröffentlichung unter `/discover/kailua-coffee-co`), der
 * Snapshot bleibt als PRÜFSTAND des Renderers — s. Kopf von
 * `shared/examples/kailuaCoffee.ts`. Geprüft wird unverändert, dass er durch
 * DIESELBEN Tore passt wie ein echtes Branding: jede Session existiert, reist
 * (`sessionTravels`) und hält die Form ihrer Art ein. Ein Beispiel, das der
 * Renderer nur zur Hälfte lesen kann, wäre die teuerste Art, das Produkt
 * falsch zu zeigen — es sähe aus wie ein Fehler des Produkts.
 *
 * Die GEGENPROBE unten ist der eigentliche Beweis: ein eingeschmuggelter
 * `internal`-Wert darf nirgends im Ergebnis auftauchen. Ohne sie wäre die
 * Filter-Zusage aus §2.3 hier nur eine Wiederholung des G1-Tests.
 */

/** Alle Slot-Ids des Beispiels, in der Reihenfolge des Snapshots. */
const SLOT_IDS = KAILUA_COFFEE_EXAMPLE.chapters.flatMap(
  chapter => chapter.slots.map(slot => slot.slotId),
)

/** Die Kapitel, die das Beispiel erzeugen MUSS — Reihenfolge inklusive. */
const EXPECTED_CHAPTERS: readonly BrandFoundationChapterId[] = [
  'story',
  'kontext',
  'purpose',
  'positionierung',
  'werte',
  'stimme',
  'manifest',
  'messaging',
  'visuell',
  'ki-texte',
]

/** Jeder Textschnipsel des Ergebnisses, gleich in welchem Block er steckt. */
function allTexts(input: BrandFoundationInput): string[] {
  const texts: string[] = []
  for (const chapter of buildBrandFoundation(input).chapters) {
    for (const block of chapter.blocks) {
      switch (block.kind) {
        case 'lead':
        case 'text':
          texts.push(block.text)
          break
        case 'list':
          texts.push(...block.items)
          break
        case 'cards':
          for (const item of block.items) texts.push(item.title, item.text, item.note ?? '')
          break
        case 'chips':
          for (const item of block.items) texts.push(item.word, item.sample)
          break
        case 'dodont':
          for (const pair of block.pairs) texts.push(pair.doText, pair.dontText)
          break
        case 'table':
          for (const row of block.rows) texts.push(...row)
          break
        case 'choice':
          texts.push(...block.optionIds)
          break
        case 'swatches':
          for (const item of block.items) texts.push(item.hex, item.roleKey)
          break
        case 'direction':
          texts.push(block.directionId, block.nameKey, block.reasonKey, block.fonts.heading, block.fonts.body)
          break
        case 'aiRules':
          texts.push(...block.tone, ...block.avoid, ...block.stands)
          break
        case 'locked':
          texts.push(block.element)
          break
      }
    }
  }
  return texts
}

describe('Kailua Coffee Co. — der feste Beispiel-Snapshot', () => {
  it('nennt Marke, Inhaltssprache und Stand', () => {
    expect(KAILUA_COFFEE_EXAMPLE.title).toBe('Kailua Coffee Co.')
    expect(KAILUA_COFFEE_EXAMPLE.contentLocale).toBe('de')
    expect(KAILUA_COFFEE_EXAMPLE_META.slug).toBe('kailua-coffee')
    // Ein Stand-Datum, das kein Datum ist, stünde später als „Invalid Date"
    // im Kopf der Seite.
    expect(Number.isFinite(Date.parse(KAILUA_COFFEE_EXAMPLE_META.standDate))).toBe(true)
  })

  it('nennt jeden Slot höchstens einmal', () => {
    expect(new Set(SLOT_IDS).size).toBe(SLOT_IDS.length)
  })

  it('kennt nur Sessions der Registry — im Kapitel, in dem sie wohnen', () => {
    for (const chapter of KAILUA_COFFEE_EXAMPLE.chapters) {
      for (const slot of chapter.slots) {
        const definition = slotById(slot.slotId)
        expect(definition, `unbekannte Session ${slot.slotId}`).toBeDefined()
        expect(definition!.stepId, `${slot.slotId} steht im falschen Kapitel`).toBe(chapter.stepKey)
      }
    }
  })

  it('trägt ausschliesslich reisefähige Festlegungen', () => {
    for (const slotId of SLOT_IDS) {
      const definition = slotById(slotId)!
      expect(sessionTravels(definition), `${slotId} reist nicht`).toBe(true)
    }
  })

  it('hält je Wert die Form seiner Art ein', () => {
    for (const chapter of KAILUA_COFFEE_EXAMPLE.chapters) {
      for (const slot of chapter.slots) {
        const kind = slotById(slot.slotId)!.schema.kind
        expect(
          brandSlotValueMatchesFormat(kind, slot.value),
          `${slot.slotId} verletzt die Form von "${kind}"`,
        ).toBe(true)
      }
    }
  })

  it('bleibt unter der Längengrenze seiner Sessions', () => {
    for (const chapter of KAILUA_COFFEE_EXAMPLE.chapters) {
      for (const slot of chapter.slots) {
        const schema = slotById(slot.slotId)!.schema
        expect(slot.value.length, `${slot.slotId} ist zu lang`).toBeLessThanOrEqual(schema.maxLength)
      }
    }
  })

  it('nennt die gewählte Richtung — mit der Fassung des heutigen Katalogs', () => {
    // Kailua steht auf „Warm & Editorial" (Roast · Crema · Milk ist wörtlich
    // die Farbwelt dieser Richtung, s. Kopf des Snapshots). Eine ALTE Fassung
    // renderte still keine Richtung mehr, und niemand sähe es der Seite an.
    expect(KAILUA_COFFEE_EXAMPLE.direction).toEqual({
      id: 'warm-editorial',
      version: String(BRAND_DIRECTIONS_VERSION),
    })
    expect(brandDirectionById(KAILUA_COFFEE_EXAMPLE.direction!.id)).not.toBeNull()
  })

  it('hat eine Story aus drei Absätzen', () => {
    const paragraphs = (KAILUA_COFFEE_EXAMPLE.story ?? '').split(/\n{2,}/).filter(part => part.trim())
    expect(paragraphs).toHaveLength(3)
  })
})

describe('Kailua Coffee Co. — was der Renderer daraus baut', () => {
  const view = buildBrandFoundation(KAILUA_COFFEE_EXAMPLE)
  const ids = view.chapters.map(chapter => chapter.id)

  it('liefert genau die erwarteten Kapitel, in Registry-Reihenfolge', () => {
    expect(ids).toEqual([...EXPECTED_CHAPTERS])
    // Die Erwartung selbst muss eine Teilmenge der Kapitel-Ordnung sein —
    // sonst prüfte der Test eine Reihenfolge, die es gar nicht gibt.
    expect(BRAND_FOUNDATION_CHAPTER_IDS.filter(id => EXPECTED_CHAPTERS.includes(id)))
      .toEqual([...EXPECTED_CHAPTERS])
  })

  it('lässt Markenarchitektur und Name ohne Lücke entfallen', () => {
    // Kailua hat keine Untermarken und behält seinen Namen (Kopf des
    // Snapshots) — beide Kapitel dürfen nicht als leere Hülle erscheinen.
    expect(ids).not.toContain('architektur')
    expect(ids).not.toContain('name')
  })

  it('gibt jedem Kapitel Inhalt — und KEINEM mehr die Schranke (Brand Design D8)', () => {
    for (const chapter of view.chapters) {
      expect(chapter.blocks.length, `${chapter.id} ist leer`).toBeGreaterThan(0)
      const locked = chapter.blocks.filter(block => block.kind === 'locked')
      expect(locked, `${chapter.id} trägt eine Schranke`).toHaveLength(0)
      expect(chapter.state).toBe('done')
    }
  })

  it('zeigt Kapitel 10 VOLL — ein Preset statt Schranke und Richtung (D8)', () => {
    const visual = view.chapters.find(chapter => chapter.id === 'visuell')!
    // MIT PRESET GEWINNT DAS PRESET: die gewählte Richtung war die Ansage,
    // das Preset ist das Gebaute. Beides nebeneinander wären zwei Farbwelten
    // und die Frage, welche gilt.
    expect(visual.blocks.map(block => block.kind)).toEqual(['design'])
    const block = visual.blocks[0]!
    expect(block.kind === 'design' && block.title).toBe('Kailua Coffee Co.')
    // Der Block trägt NIE eine Entwurfs-Id — nur ihre Zahl (§1.11 b).
    expect(block.kind === 'design' && block.keptDrafts).toBe(0)
    expect(block.kind === 'design' && 'keptDrafts' in block.preset.mark).toBe(false)
  })

  it('rechnet die visuelle Identität aus der echten Maschine', () => {
    const visual = view.chapters.find(chapter => chapter.id === 'visuell')!
    const block = visual.blocks[0]!
    if (block.kind !== 'design') throw new Error('Kapitel 10 trägt keinen design-Block')
    const preset = block.preset
    expect(preset.color.base).toBe('#4a3123')
    expect(preset.color.accent).toBe('#2f4a3a')
    expect(preset.type.pair).toBe('editorial')
    expect(preset.motion.tempo).toBe('calm')
    // Elf Stufen je Rampe, fünf Rollen, sechs geprüfte Paare, acht Setzungen
    // — die Zahlen des Katalogs, nicht die einer Abschrift.
    expect(Object.keys(preset.color.rampLight)).toHaveLength(11)
    expect(Object.keys(preset.color.rampDark)).toHaveLength(11)
    expect(preset.color.roles).toHaveLength(5)
    expect(preset.color.contrastPairs).toHaveLength(6)
    expect(preset.mark.examples).toHaveLength(8)
    expect(preset.mark.examples.every(svg => svg.startsWith('<svg'))).toBe(true)
    // Der Markenname steht escaped in der Wortmarke (kein rohes `&`, `<`).
    expect(preset.mark.examples[0]).toContain('Kailua Coffee Co.')
    expect(preset.motion.transitions.map(token => token.durationMs)).toEqual([120, 240, 384, 60])
    expect(preset.motion.rules.length).toBeGreaterThan(0)
    expect(preset.imagery.dodont.length).toBeGreaterThan(0)
  })

  it('paart Werte, Ton-Wörter und Do & Dont so, wie die Seite es zeigt', () => {
    const values = view.chapters.find(chapter => chapter.id === 'werte')!
    const cards = values.blocks.find(block => block.kind === 'cards')
    expect(cards?.kind === 'cards' && cards.items.map(item => item.title))
      .toEqual(['Klartext', 'Handwerk', 'Nähe'])
    // Jeder Wert hat Definition UND gelebtes Beispiel — sonst ist die
    // Zuordnung „Wort — Satz" im Snapshot verrutscht.
    expect(cards?.kind === 'cards' && cards.items.every(item => item.text && item.note)).toBe(true)

    const voice = view.chapters.find(chapter => chapter.id === 'stimme')!
    const chips = voice.blocks.find(block => block.kind === 'chips')
    expect(chips?.kind === 'chips' && chips.items).toHaveLength(4)
    expect(chips?.kind === 'chips' && chips.items.every(item => item.sample.length > 0)).toBe(true)

    // Der Wort-Leitfaden wohnt seit Befund 12 (2026-09-09) im MESSAGING-Kapitel:
    // Do & Don't sind der Wortschatz, mit dem die Marke schreibt.
    const messaging = view.chapters.find(chapter => chapter.id === 'messaging')!
    const dodont = messaging.blocks.find(block => block.kind === 'dodont')
    expect(dodont?.kind === 'dodont' && dodont.pairs.length).toBeGreaterThan(0)
    expect(dodont?.kind === 'dodont' && dodont.pairs.every(pair => pair.doText && pair.dontText)).toBe(true)
    expect(voice.blocks.some(block => block.kind === 'dodont')).toBe(false)

    const archetype = voice.blocks.find(block => block.kind === 'choice')
    expect(archetype?.kind === 'choice' && archetype.optionIds).toEqual(['sage', 'creator'])
  })

  it('füllt den KI-Rahmen aus den Werten darüber', () => {
    const ai = view.chapters.find(chapter => chapter.id === 'ki-texte')!.blocks
      .find(block => block.kind === 'aiRules')
    expect(ai?.kind === 'aiRules' && ai.stands).toEqual(['Klartext', 'Handwerk', 'Nähe'])
    expect(ai?.kind === 'aiRules' && ai.tone).toHaveLength(4)
    expect(ai?.kind === 'aiRules' && ai.avoid.length).toBeGreaterThan(0)
  })

  it('zeigt die Tagline unübersetzt als Leitsatz', () => {
    const messaging = view.chapters.find(chapter => chapter.id === 'messaging')!
    const lead = messaging.blocks.find(block => block.kind === 'lead')
    expect(lead?.kind === 'lead' && lead.text).toBe('One honest, quiet moment a day.')
  })

  it('GEGENPROBE: ein eingeschmuggelter interner Wert erscheint nie', () => {
    const smuggled = 'WETTBEWERBER-GEHEIMNIS-42'
    const tainted: BrandFoundationInput = {
      ...KAILUA_COFFEE_EXAMPLE,
      chapters: KAILUA_COFFEE_EXAMPLE.chapters.map(chapter => (
        chapter.stepKey === 'context'
          ? {
              ...chapter,
              slots: [
                ...chapter.slots,
                // `a.complaints` ist eine Rohantwort, `a.competitors`
                // zusätzlich vertraulich — beide dürfen nicht reisen.
                { slotId: 'a.complaints', value: `${smuggled} Beschwerde` },
                { slotId: 'a.competitors', value: `- ${smuggled} Wettbewerber` },
              ],
            }
          : chapter
      )),
    }

    expect(sessionTravels(slotById('a.complaints')!)).toBe(false)
    expect(sessionTravels(slotById('a.competitors')!)).toBe(false)
    expect(allTexts(tainted).join('\n')).not.toContain(smuggled)
    // Und der Schmuggel ändert am Handbuch sonst nichts.
    expect(buildBrandFoundation(tainted).chapters.map(chapter => chapter.id)).toEqual([...EXPECTED_CHAPTERS])
  })
})
