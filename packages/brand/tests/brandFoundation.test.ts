import { describe, expect, it } from 'vitest'
import {
  BRAND_FOUNDATION_CHAPTER_IDS,
  BRAND_FOUNDATION_SOURCE_STEPS,
  BRAND_FOUNDATION_VISUAL_ELEMENTS,
  type BrandFoundationBlock,
  type BrandFoundationChapterId,
  type BrandFoundationInput,
  brandFoundationPendingStep,
  buildBrandFoundation,
} from '../shared/brandFoundation'
import { BRAND_DIRECTIONS, BRAND_DIRECTIONS_VERSION } from '../shared/brandDirections'
import { formatBrandSlotList, formatBrandSlotStructured } from '../shared/brandSlotFormat'
import {
  BRAND_SLOTS,
  BRAND_STEP_KEYS,
  type BrandSlot,
  type BrandStepKey,
  isBrandDesignStep,
  isBrandKitStep,
  sessionTravels,
  slotById,
} from '../shared/slotRegistry'

/**
 * DER RENDERER DER LESEANSICHT (Konzept §2.2/§2.3, Paket G1).
 *
 * Die teuerste Zusage dieses Vorhabens ist eine NEGATIVE: „eine Rohantwort und
 * ein vertrauliches Feld erscheinen NIE" — und eine negative Zusage ist genau
 * so viel wert wie ihre Gegenprobe. Der Beweis legt deshalb einen Snapshot mit
 * ALLEN 68 Sessions vor (so, wie jeder heute bestehende Snapshot aussieht, s.
 * §2.8) und prüft beide Richtungen an derselben Eingabe: die 30 reisefähigen
 * Werte stehen im Ergebnis, die 38 übrigen nicht.
 */

/** Ein formgültiger, EINDEUTIG wiedererkennbarer Wert je Session. */
function dummyValue(slot: BrandSlot): string {
  const marker = `wert-${slot.id}`
  switch (slot.schema.kind) {
    case 'list':
      return formatBrandSlotList([`${marker}-eins`, `${marker}-zwei`])
    case 'structured':
      return formatBrandSlotStructured([{ label: `${marker}-etikett`, body: `${marker}-inhalt` }])
    default:
      return `${marker}-text`
  }
}

/** Der Snapshot, wie `share.post.ts` ihn heute einfriert: alles Bestätigte. */
function snapshotOf(slots: readonly BrandSlot[], story: string | null = null): BrandFoundationInput {
  const byStep = new Map<BrandStepKey, { slotId: string, value: string }[]>()
  for (const slot of slots) {
    const bucket = byStep.get(slot.stepId) ?? []
    bucket.push({ slotId: slot.id, value: dummyValue(slot) })
    byStep.set(slot.stepId, bucket)
  }
  return {
    title: 'Kailua Coffee Co.',
    contentLocale: 'en',
    story,
    chapters: [...byStep].map(([stepKey, slots]) => ({ stepKey, slots })),
  }
}

function payload(input: BrandFoundationInput): string {
  return JSON.stringify(buildBrandFoundation(input))
}

const ALL = snapshotOf(BRAND_SLOTS, 'Erster Absatz der Story.\n\nZweiter Absatz.')

describe('buildBrandFoundation — was reist und was nicht', () => {
  it('zeigt KEINEN Wert einer Session, die nicht reist — auch wenn er im Snapshot steht', () => {
    const rendered = payload(ALL)
    const held = BRAND_SLOTS.filter(slot => !sessionTravels(slot))
    // Der Snapshot trägt sie alle — das ist die Ausgangslage, nicht der Fehler.
    expect(held.length).toBeGreaterThan(0)
    for (const slot of held) {
      expect(rendered, `${slot.id} steht in der Leseansicht`).not.toContain(`wert-${slot.id}`)
    }
  })

  it('GEGENPROBE: die reisefähigen Werte stehen sehr wohl darin', () => {
    const rendered = payload(ALL)
    // Ohne diese Zeile bestünde die Prüfung oben auch für einen Renderer, der
    // gar nichts ausgibt.
    //
    // NUR SCHICHT 1: die reisefähigen Sessions von Brand Design (D0) haben
    // noch keinen Block-Bauer — Kapitel 10 rendert bis **D8** die Schranke.
    // Sie hier zu verlangen hiesse, einen Renderer zu prüfen, den es
    // absichtlich noch nicht gibt; die Zeile darunter hält fest, dass ihre
    // Werte solange auch NICHT still irgendwo auftauchen.
    //
    // SCHICHT 3 STEHT SEIT K4 DA (§2.5) — bis auf EINEN Wert: `p.summary` ist
    // die pure VORSCHAU des Pressekits („Boilerplates, Tagline, Fakten,
    // Kontakt — nur lesen", §2.4). Das Kapitel `pressekit` ist genau diese
    // Vorschau, nur aus den QUELLEN gerechnet statt aus dem gespeicherten
    // Abzug (§2.5: „gefüllt aus `p.summary`-Quellen"). Beides zu zeigen wäre
    // derselbe Inhalt zweimal, einmal von damals und einmal von jetzt.
    const travelling = BRAND_SLOTS.filter(slot => sessionTravels(slot))
    const spaeter = (slot: BrandSlot) => isBrandDesignStep(slot.stepId) || slot.id === 'p.summary'
    for (const slot of travelling.filter(slot => !spaeter(slot))) {
      expect(rendered, `${slot.id} fehlt in der Leseansicht`).toContain(`wert-${slot.id}`)
    }
    for (const slot of travelling.filter(slot => spaeter(slot))) {
      expect(rendered, `${slot.id} steht schon in der Leseansicht — D8 baut das`)
        .not.toContain(`wert-${slot.id}`)
    }
    // Und es gibt sie wirklich, sonst prüfte die zweite Schleife nichts.
    expect(travelling.filter(slot => isBrandDesignStep(slot.stepId)).length).toBeGreaterThan(0)
    expect(travelling.filter(slot => isBrandKitStep(slot.stepId)).length).toBeGreaterThan(0)
  })

  it('GEGENPROBE am Paar: der Pitch steht da, die Gründungsgeschichte daneben nicht', () => {
    // Beide sind `sensitivity: 'public'` — den Unterschied macht allein
    // `audience` (§2.3): der Pitch ist eine Festlegung, die Herkunftsgeschichte
    // ist das Material, aus dem George ihn gebaut hat.
    expect(slotById('a.origin')!.sensitivity).toBe('public')
    const rendered = payload(snapshotOf([slotById('a.pitch')!, slotById('a.origin')!]))
    expect(rendered).toContain('wert-a.pitch')
    expect(rendered).not.toContain('wert-a.origin')
  })

  it('hält die vier vertraulichen Sessions zurück (Beschwerden, Wettbewerber)', () => {
    const heikel = ['a.competitors', 'a.complaints', 'a.challenge', 'a.facts']
    const rendered = payload(snapshotOf(heikel.map(id => slotById(id)!)))
    for (const id of heikel) expect(rendered).not.toContain(`wert-${id}`)
  })

  it('glaubt der Registry und nicht dem Kapitel, in dem ein Wert eingefroren wurde', () => {
    // Ein Snapshot könnte einen Wert unter dem falschen stepKey tragen (oder
    // ein künftiger Upcaster ihn umhängen) — entscheiden darf das die Registry.
    const rendered = payload({
      title: '', contentLocale: 'de', story: null,
      chapters: [{ stepKey: 'result', slots: [{ slotId: 'a.complaints', value: 'wert-a.complaints-text' }] }],
    })
    expect(rendered).not.toContain('wert-a.complaints')
  })

  it('FAIL-CLOSED: eine unbekannte Slot-Id erzeugt keinen Block', () => {
    const rendered = payload({
      title: '', contentLocale: 'de', story: null,
      chapters: [{ stepKey: 'context', slots: [{ slotId: 'gibt.es.nicht', value: 'geheim-xy' }] }],
    })
    expect(rendered).not.toContain('geheim-xy')
  })
})

/**
 * DIE DREI ANWENDUNGS-KAPITEL (§2.5) — sie hängen NICHT an Werten, sondern am
 * PRESET und an der Freischaltung. `ALL` kennt beides nicht, also stehen sie
 * dort nicht (s. `BrandFoundationInput.derivationUnlocked`).
 */
const NUR_MIT_PRESET: readonly BrandFoundationChapterId[] = [
  'zeichen-anwendung', 'farbe-anwendung', 'typografie-anwendung',
]

describe('buildBrandFoundation — die Kapitel', () => {
  it('hält die Reihenfolge aus §2.2 ein', () => {
    // Ein Kapitel ohne Blöcke wird gefiltert — geprüft wird deshalb, dass die
    // gerenderten Kapitel eine TEILMENGE der Ordnung sind und ihre Reihenfolge
    // einhalten (dasselbe Muster wie im Kailua-Beweis).
    const gerendert = buildBrandFoundation(ALL).chapters.map(chapter => chapter.id)
    expect(gerendert).toEqual(BRAND_FOUNDATION_CHAPTER_IDS.filter(id => !NUR_MIT_PRESET.includes(id)))
    expect(gerendert).toHaveLength(14)
  })

  it('lässt die drei Anwendungs-Kapitel weg, solange der Aufrufer nichts über die Ableitung sagt', () => {
    // Ohne diese Zeile wäre der Test darüber auch grün, wenn jemand die Anker
    // wieder aus der Liste nähme — die Ids sind aber ein Vertrag (§2.17).
    for (const id of NUR_MIT_PRESET) expect(BRAND_FOUNDATION_CHAPTER_IDS).toContain(id)
    expect(buildBrandFoundation(ALL).chapters.map(chapter => chapter.id))
      .not.toEqual(expect.arrayContaining([...NUR_MIT_PRESET]))
  })

  it('gibt jedem Kapitel Sprungmarke, Titel-Schlüssel und Zustand', () => {
    for (const chapter of buildBrandFoundation(ALL).chapters) {
      expect(chapter.anchor, chapter.id).toBe(chapter.id)
      // Kapitel 11 heisst nach Abnahme von `aiguide` „AI-Guidelines" — die Id
      // und damit die SPRUNGMARKE bleibt `ki-texte` (§2.20 Nr. 6).
      expect(chapter.titleKey, chapter.id).toBe(chapter.id === 'ki-texte'
        ? 'brand.foundation.chapter.aiGuidelines'
        : `brand.foundation.chapter.${chapter.id}`)
      expect(chapter.state, chapter.id).toBe(chapter.id === 'visuell' ? 'locked' : 'done')
    }
  })

  it('LEERE EINGABE: nur die visuelle Schranke bleibt stehen', () => {
    const view = buildBrandFoundation({
      title: '', contentLocale: 'de', story: null, chapters: [],
    })
    expect(view.chapters.map(chapter => chapter.id)).toEqual(['visuell'])
    expect(view.chapters[0]!.blocks).toEqual(
      BRAND_FOUNDATION_VISUAL_ELEMENTS.map(element => ({ kind: 'locked', element })),
    )
  })

  it('lässt Markenarchitektur und Name ohne ihre Sessions ENTFALLEN', () => {
    const withoutPaths = BRAND_SLOTS.filter(slot => slot.stepId !== 'architecture' && slot.stepId !== 'naming')
    const ids = buildBrandFoundation(snapshotOf(withoutPaths)).chapters.map(chapter => chapter.id)
    expect(ids).not.toContain('architektur')
    expect(ids).not.toContain('name')
    // Gegenprobe: mit ihnen sind beide da.
    expect(buildBrandFoundation(ALL).chapters.map(chapter => chapter.id)).toContain('architektur')
  })

  it('erzeugt die Story nicht beim Lesen — ohne sie entfällt Kapitel 0', () => {
    expect(buildBrandFoundation(snapshotOf(BRAND_SLOTS)).chapters.map(chapter => chapter.id))
      .not.toContain('story')
    const story = buildBrandFoundation(snapshotOf(BRAND_SLOTS, 'Eins.\n\nZwei.\n\nDrei.')).chapters[0]!
    expect(story.id).toBe('story')
    expect(story.blocks).toEqual([
      { kind: 'lead', text: 'Eins.' },
      { kind: 'text', text: 'Zwei.' },
      { kind: 'text', text: 'Drei.' },
    ])
  })

  it('zeigt Kapitel 11 nur mit mindestens einer seiner Quellen', () => {
    const source = buildBrandFoundation(snapshotOf([slotById('c.final')!]))
    expect(source.chapters.map(chapter => chapter.id)).toContain('ki-texte')
    const other = buildBrandFoundation(snapshotOf([slotById('b.purpose')!]))
    expect(other.chapters.map(chapter => chapter.id)).not.toContain('ki-texte')
  })
})

/** Bequemer Zugriff auf die Blöcke EINES Kapitels. */
function blocksOf(input: BrandFoundationInput, chapterId: string): readonly BrandFoundationBlock[] {
  return buildBrandFoundation(input).chapters.find(chapter => chapter.id === chapterId)?.blocks ?? []
}

function valuesFor(entries: Record<string, string>): BrandFoundationInput {
  return {
    title: '',
    contentLocale: 'de',
    story: null,
    chapters: [{
      stepKey: 'values',
      slots: Object.entries(entries).map(([slotId, value]) => ({ slotId, value })),
    }],
  }
}

describe('buildBrandFoundation — die Blöcke', () => {
  it('legt je Wert Definition und gelebtes Beispiel auf EINE Karte', () => {
    const blocks = blocksOf(valuesFor({
      'c.final': '- Klartext\n- Handwerk',
      'c.definitions': '- Klartext — Wir sagen Preise, bevor jemand fragt.',
      'c.livedExamples': '- Klartext — Im März stand der neue Preis eine Woche vorher an der Tafel.',
    }), 'werte')
    expect(blocks[0]).toEqual({
      kind: 'cards',
      labelKey: 'brand.foundation.label.values',
      items: [
        {
          title: 'Klartext',
          text: 'Wir sagen Preise, bevor jemand fragt.',
          note: 'Im März stand der neue Preis eine Woche vorher an der Tafel.',
        },
        { title: 'Handwerk', text: '' },
      ],
    })
  })

  it('verliert eine Definition NICHT, die sich keinem gewählten Wert zuordnen lässt', () => {
    const blocks = blocksOf(valuesFor({
      'c.final': '- Klartext',
      'c.definitions': '- Nähe — Unsere Gäste kennen den Röster beim Namen.',
    }), 'werte')
    expect(JSON.stringify(blocks)).toContain('Unsere Gäste kennen den Röster beim Namen.')
  })

  it('stellt je Ton-Wort EINE Stimmprobe darunter — und erfindet keine', () => {
    const blocks = blocksOf({
      title: '', contentLocale: 'de', story: null,
      chapters: [{
        stepKey: 'archetype',
        slots: [
          { slotId: 'd.toneWords', value: '- ruhig\n- fundiert\n- gerade heraus' },
          { slotId: 'd.voiceSamples', value: '- Die Maschine läuft seit sechs.\n- Der Preis ist gestiegen.' },
        ],
      }],
    }, 'stimme')
    expect(blocks.find(block => block.kind === 'chips')).toEqual({
      kind: 'chips',
      labelKey: 'brand.foundation.label.toneWords',
      items: [
        { word: 'ruhig', sample: 'Die Maschine läuft seit sechs.' },
        { word: 'fundiert', sample: 'Der Preis ist gestiegen.' },
        { word: 'gerade heraus', sample: '' },
      ],
    })
  })

  /**
   * DER WORT-LEITFADEN STEHT IM MESSAGING-KAPITEL (Befund 12, 2026-09-09) —
   * nicht mehr unter „Stimme": Do & Don't sind der Wortschatz, mit dem die
   * Marke schreibt, und die Stimme wartet seither nicht mehr auf `verbal`.
   */
  it('paart Do und Don’t — bei ungleicher Länge bleibt die andere Hälfte LEER', () => {
    const blocks = blocksOf({
      title: '', contentLocale: 'de', story: null,
      chapters: [{
        stepKey: 'verbal',
        slots: [{
          slotId: 'ep.vocabulary',
          value: '- benutzen: unsere Bohnen\n- benutzen: von Hand\n- meiden: Premium-Selektion',
        }],
      }],
    }, 'messaging')
    expect(blocks.find(block => block.kind === 'dodont')).toEqual({
      kind: 'dodont',
      labelKey: 'brand.foundation.label.doDont',
      pairs: [
        { doText: 'unsere Bohnen', dontText: 'Premium-Selektion' },
        { doText: 'von Hand', dontText: '' },
      ],
    })
  })

  it('GEGENPROBE: unter „Stimme" steht der Leitfaden NICHT mehr', () => {
    const view = buildBrandFoundation({
      title: '', contentLocale: 'de', story: null,
      chapters: [
        {
          stepKey: 'archetype',
          slots: [{ slotId: 'd.toneWords', value: '- ruhig' }],
        },
        {
          stepKey: 'verbal',
          slots: [
            { slotId: 'ep.keyMessages', value: '## Für Cafés\nWir liefern dienstags.' },
            { slotId: 'ep.vocabulary', value: '- benutzen: unsere Bohnen\n- meiden: Premium-Selektion' },
          ],
        },
      ],
    })
    const voice = view.chapters.find(chapter => chapter.id === 'stimme')!
    expect(voice.blocks.some(block => block.kind === 'dodont')).toBe(false)

    // Und im Messaging-Kapitel steht er NACH den Kernbotschaften.
    const messaging = view.chapters.find(chapter => chapter.id === 'messaging')!
    const kinds = messaging.blocks.map(block => block.kind)
    expect(kinds).toContain('dodont')
    expect(kinds.indexOf('dodont')).toBeGreaterThan(0)
  })

  it('füllt den KI-Rahmen aus Ton-Wörtern, Tabu-Wörtern und Werten', () => {
    const view = buildBrandFoundation({
      title: '', contentLocale: 'de', story: null,
      chapters: [{
        stepKey: 'archetype',
        slots: [
          { slotId: 'd.toneWords', value: '- ruhig\n- fundiert' },
          { slotId: 'd.vocabulary', value: '- meiden: Genuss-Erlebnis' },
          { slotId: 'c.final', value: '- Klartext\n- Nähe' },
        ],
      }],
    })
    expect(view.chapters.find(chapter => chapter.id === 'ki-texte')!.blocks).toEqual([
      { kind: 'aiRules', tone: ['ruhig', 'fundiert'], avoid: ['Genuss-Erlebnis'], stands: ['Klartext', 'Nähe'] },
    ])
  })

  it('reicht Archetyp und Architektur-Modell als IDS weiter, nie als Text', () => {
    const view = buildBrandFoundation({
      title: '', contentLocale: 'de', story: null,
      chapters: [{
        stepKey: 'archetype',
        slots: [
          { slotId: 'd.primary', value: 'sage' },
          { slotId: 'd.secondary', value: 'creator' },
        ],
      }],
    })
    expect(view.chapters.find(chapter => chapter.id === 'stimme')!.blocks[0]).toEqual({
      kind: 'choice',
      labelKey: 'brand.foundation.label.archetype',
      slotId: 'd.primary',
      optionIds: ['sage', 'creator'],
    })
  })

  it('nummeriert die Top drei — die Reihenfolge IST die Aussage', () => {
    const blocks = blocksOf({
      title: '', contentLocale: 'de', story: null,
      chapters: [{ stepKey: 'naming', slots: [{ slotId: 'f.decision', value: '- Bogen\n- Nordfeld\n- Satzbau' }] }],
    }, 'name')
    expect(blocks[0]).toEqual({
      kind: 'table',
      labelKey: 'brand.foundation.label.nameDecision',
      columnKeys: ['brand.foundation.column.rank', 'brand.foundation.column.name'],
      rows: [['1', 'Bogen'], ['2', 'Nordfeld'], ['3', 'Satzbau']],
    })
  })

  it('macht aus beschrifteten Blöcken Karten (Zielgruppen, Boilerplates)', () => {
    const blocks = blocksOf({
      title: '', contentLocale: 'de', story: null,
      chapters: [{
        stepKey: 'context',
        slots: [{ slotId: 'a.audienceSketch', value: '## Wer\nLeute aus den Büros\n\n## Was sie wollen\nEtwas Warmes' }],
      }],
    }, 'kontext')
    expect(blocks).toEqual([{
      kind: 'cards',
      labelKey: 'brand.foundation.label.audience',
      items: [
        { title: 'Wer', text: 'Leute aus den Büros' },
        { title: 'Was sie wollen', text: 'Etwas Warmes' },
      ],
    }])
  })

  it('WIRFT NICHTS WEG: ein formfremder Wert steht als Textblock da', () => {
    const blocks = blocksOf({
      title: '', contentLocale: 'de', story: null,
      chapters: [{
        stepKey: 'verbal',
        // Weder „## " noch „- ": ein Mensch hat im Textfeld nachgebessert.
        slots: [{ slotId: 'ep.boilerplates', value: 'Kailua Coffee Co. röstet eine Sorte pro Saison.' }],
      }],
    }, 'messaging')
    expect(blocks).toEqual([{
      kind: 'text',
      labelKey: 'brand.foundation.label.boilerplates',
      text: 'Kailua Coffee Co. röstet eine Sorte pro Saison.',
    }])
  })
})

/**
 * DIE ZUORDNUNG HANDBUCH-KAPITEL → WERKSTATT-KAPITEL (Paket G2).
 *
 * Sie ist gepflegt und nicht gerechnet (Begründung an der Tabelle), also ist
 * der Test die einzige Sicherung: ein neues Kapitel ohne Eintrag hiesse „nie
 * offen", und der Vermerk „noch nicht abgenommen" fehlte lautlos genau dort,
 * wo er gebraucht wird.
 */
describe('BRAND_FOUNDATION_SOURCE_STEPS — woher ein Kapitel kommt', () => {
  it('nennt für JEDE Kapitel-Id ihre Quell-Kapitel', () => {
    for (const id of BRAND_FOUNDATION_CHAPTER_IDS) {
      expect(BRAND_FOUNDATION_SOURCE_STEPS[id], id).toBeDefined()
    }
    expect(Object.keys(BRAND_FOUNDATION_SOURCE_STEPS).sort())
      .toEqual([...BRAND_FOUNDATION_CHAPTER_IDS].sort())
  })

  it('nennt nur ECHTE Kapitel der Registry', () => {
    for (const [id, steps] of Object.entries(BRAND_FOUNDATION_SOURCE_STEPS)) {
      for (const stepKey of steps) {
        expect(BRAND_STEP_KEYS, `${id} → ${stepKey}`).toContain(stepKey)
      }
    }
  })

  it('lässt GENAU zwei Kapitel ohne Quelle: Story und die Schranke', () => {
    const empty = BRAND_FOUNDATION_CHAPTER_IDS
      .filter(id => BRAND_FOUNDATION_SOURCE_STEPS[id].length === 0)
    expect(empty).toEqual(['story', 'visuell'])
  })
})

describe('brandFoundationPendingStep — was noch nicht abgenommen ist', () => {
  const accepted = (overrides: Partial<Record<BrandStepKey, boolean>> = {}) =>
    (['context', 'pvm', 'values', 'archetype', 'manifesto', 'verbal', 'result'] as BrandStepKey[])
      .map(stepKey => ({ stepKey, accepted: overrides[stepKey] ?? true }))

  it('nennt das erste offene Quell-Kapitel', () => {
    expect(brandFoundationPendingStep('stimme', accepted({ archetype: false }))).toBe('archetype')
    expect(brandFoundationPendingStep('messaging', accepted({ verbal: false }))).toBe('verbal')
  })

  /**
   * BEFUND 12 (Davids Entscheidung 2026-09-09): „Persönlichkeit & Stimme" hing
   * an ZWEI Werkstatt-Kapiteln, weil der Wort-Leitfaden dort gerendert wurde —
   * ein abgenommener Archetyp las sich deshalb als „noch nicht abgenommen".
   */
  it('WARTET NICHT MEHR auf „Sprache & Messaging"', () => {
    expect(BRAND_FOUNDATION_SOURCE_STEPS.stimme).toEqual(['archetype'])
    expect(brandFoundationPendingStep('stimme', accepted({ verbal: false }))).toBeNull()
  })

  it('GEGENPROBE: alles abgenommen ⇒ null', () => {
    expect(brandFoundationPendingStep('stimme', accepted())).toBeNull()
    expect(brandFoundationPendingStep('werte', accepted())).toBeNull()
  })

  it('zählt ein Kapitel NICHT als offen, das gar nicht auf dem Weg liegt', () => {
    // `naming` fehlt in der Liste (übersprungen) — das Kapitel „Name" entfällt
    // dann ohnehin, es darf aber nie als „offen" erscheinen.
    expect(brandFoundationPendingStep('name', accepted())).toBeNull()
  })

  it('die Schranke und die Story kennen keine Abnahme', () => {
    const nothing = accepted({ context: false, pvm: false, values: false, archetype: false, manifesto: false, verbal: false })
    expect(brandFoundationPendingStep('visuell', nothing)).toBeNull()
    expect(brandFoundationPendingStep('story', nothing)).toBeNull()
  })
})

describe('buildBrandFoundation — Markdown reist markiert', () => {
  it('markiert NUR die Absätze des Manifests (der einzige richtext-Slot)', () => {
    const view = buildBrandFoundation({
      title: '', contentLocale: 'de', story: 'Eine Story mit *Sternchen*.',
      chapters: [{
        stepKey: 'manifesto',
        slots: [
          { slotId: 'e.manifesto', value: 'Wir **rösten** eine Sorte.\n\nJede Saison.' },
          { slotId: 'e.anchorLine', value: 'Eine Sorte. Eine Saison.' },
        ],
      }],
    })
    const manifest = view.chapters.find(chapter => chapter.id === 'manifest')!
    expect(manifest.blocks.filter(block => block.kind === 'text' && block.markdown === true)).toHaveLength(2)
    // Die Story ist Georges Prosa, kein `richtext`-Slot — sie bleibt wörtlich.
    const story = view.chapters.find(chapter => chapter.id === 'story')!
    expect(story.blocks.every(block => block.kind !== 'text' || block.markdown === undefined)).toBe(true)
  })
})

/**
 * KAPITEL 10 MIT UND OHNE RICHTUNG (Paket G4, Konzept §2.5/§11 d).
 *
 * Die Richtung ist die EINZIGE Eingabe, die nicht durch das Tor
 * `travellingValues` läuft: `result.direction` ist `audience: 'internal'` und
 * wird gesondert gerendert (Farbwelt und Schriftpaar statt einer Textzeile).
 * Genau deshalb braucht sie ihre eigene Gegenprobe — eine unbekannte oder eine
 * ALTE Id darf nicht heissen „irgendeine Welt", sondern „keine".
 */
describe('buildBrandFoundation — die gewählte Richtung', () => {
  const empty: BrandFoundationInput = { title: '', contentLocale: 'de', story: null, chapters: [] }

  function visual(input: BrandFoundationInput): BrandFoundationBlock[] {
    const chapter = buildBrandFoundation(input).chapters.find(entry => entry.id === 'visuell')!
    return [...chapter.blocks]
  }

  it('OHNE Richtung: nur die fünf gesperrten Elemente', () => {
    expect(visual(empty).map(block => block.kind))
      .toEqual(BRAND_FOUNDATION_VISUAL_ELEMENTS.map(() => 'locked'))
  })

  it('MIT Richtung: Richtung, Farben, dann dieselbe Schranke — und `locked` bleibt', () => {
    const direction = BRAND_DIRECTIONS[0]!
    const view = buildBrandFoundation({
      ...empty,
      direction: { id: direction.id, version: String(BRAND_DIRECTIONS_VERSION) },
    })
    const chapter = view.chapters.find(entry => entry.id === 'visuell')!
    // Die Schranke steht, nur die Richtung ist gewählt (§11 d).
    expect(chapter.state).toBe('locked')
    expect(chapter.blocks.map(block => block.kind))
      .toEqual(['direction', 'swatches', 'locked', 'locked', 'locked', 'locked', 'locked'])

    const first = chapter.blocks[0]!
    expect(first.kind === 'direction' && first.directionId).toBe(direction.id)
    expect(first.kind === 'direction' && first.nameKey).toBe(direction.nameKey)
    expect(first.kind === 'direction' && first.fonts).toEqual({
      heading: direction.fonts.heading.family,
      body: direction.fonts.body.family,
    })
  })

  it('DIE FARBEN LAUFEN VON TIEF NACH HELL — der Grund zuerst', () => {
    const direction = BRAND_DIRECTIONS[0]!
    const [light, mid, deep] = direction.gradient
    const swatches = visual({
      ...empty,
      direction: { id: direction.id, version: String(BRAND_DIRECTIONS_VERSION) },
    }).find(block => block.kind === 'swatches')!
    expect(swatches.kind === 'swatches' && swatches.items).toEqual([
      { hex: deep, roleKey: direction.roles[0] },
      { hex: mid, roleKey: direction.roles[1] },
      { hex: light, roleKey: direction.roles[2] },
    ])
  })

  it('UNBEKANNTE ID: rendert wie ohne Richtung', () => {
    expect(visual({ ...empty, direction: { id: 'gibt-es-nicht', version: '1' } }).map(block => block.kind))
      .toEqual(BRAND_FOUNDATION_VISUAL_ELEMENTS.map(() => 'locked'))
  })

  it('FREMDE FASSUNG: rendert wie ohne Richtung — ein alter Link färbt nicht um', () => {
    const direction = BRAND_DIRECTIONS[0]!
    for (const version of ['0', '2', '', 'eins']) {
      expect(visual({ ...empty, direction: { id: direction.id, version } }).map(block => block.kind), version)
        .toEqual(BRAND_FOUNDATION_VISUAL_ELEMENTS.map(() => 'locked'))
    }
  })

  it('DIE ROHE ID REIST NIE ALS WERT MIT — auch nicht, wenn sie bestätigt in der Zeile steht', () => {
    // `result.direction` ist `audience: 'internal'`: der bestätigte Wert im
    // Kapitel `result` darf in KEINEM Block als Text auftauchen. Gezeigt wird
    // er nur über den Umweg `direction` — und dann als Schlüssel, nicht als Id
    // in einer Liste.
    const rendered = JSON.stringify(buildBrandFoundation({
      ...empty,
      chapters: [{ stepKey: 'result', slots: [{ slotId: 'result.direction', value: 'wert-result.direction' }] }],
    }))
    expect(rendered).not.toContain('wert-result.direction')
  })
})
