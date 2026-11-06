import { describe, expect, it } from 'vitest'
import de from '../i18n/locales/de.json'
import en from '../i18n/locales/en.json'
import {
  BRAND_FOUNDATION_CHAPTER_IDS,
  BRAND_FOUNDATION_USAGE_TOPICS,
  type BrandFoundationBlock,
  type BrandFoundationChapter,
  type BrandFoundationChapterId,
  type BrandFoundationInput,
  buildBrandFoundation,
} from '../shared/brandFoundation'
import { renderBrandContextMarkdown } from '../shared/brandContext'
import { formatBrandSlotList, formatBrandSlotStructured } from '../shared/brandSlotFormat'
import { KAILUA_COFFEE_EXAMPLE } from '../shared/examples/kailuaCoffee'
import { KAILUA_COFFEE_DESIGN } from '../shared/examples/kailuaCoffeeDesign'
import { BRAND_TOKEN_TYPE_STEPS, brandTokenAccentLiftFor, brandTokenRoleHex } from '../shared/brandTokens'
import { isBrandChapterShareable } from '../shared/brandSharing'
import { BRAND_KIT_STEP_KEYS } from '../shared/slotRegistry'

/**
 * DAS BOOK — DIE FÜNF KAPITEL DER DRITTEN SCHICHT (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.5, Paket K4).
 *
 * ── WAS HIER BEWIESEN WIRD ────────────────────────────────────────────────
 *  1. Jedes neue Kapitel steht MIT Werten und entfällt OHNE — ein Handbuch
 *     erfindet nichts (§2.2 „kein Erzeugen beim Lesen").
 *  2. Die drei Anwendungs-Kapitel hängen an ZWEI Tatsachen (Freischaltung,
 *     Preset) und sagen in jedem der drei Zustände die Wahrheit.
 *  3. Die Anker-Liste bleibt Zeichen für Zeichen dieselbe wie in K0 — sie ist
 *     ein Vertrag (§2.17: verschickte Tieflinks).
 *  4. Die Zahlen der Anwendungs-Kapitel sind DIE DES TOKEN-MODELLS (K2) und
 *     nicht nachgerechnet — sonst zeigten Handbuch und `tokens.json` zwei
 *     verschiedene Farben für dieselbe Rolle.
 *
 * DIE FIXTURE ist Kailua Coffee Co. mit den Kit-Werten des abgenommenen
 * Klickdummys (`.playground/app/utils/demoKit.ts`, §3 Screen 3) — WÖRTLICH,
 * damit der Beweis an derselben Marke läuft, die David gesehen hat. Sie liegt
 * hier und nicht in `shared/examples/`: `KAILUA_COFFEE_EXAMPLE` ist der
 * Prüfstand der ERSTEN Schicht und sagt dort ausdrücklich zu, dass Kailua
 * KEINE Markenarchitektur hat (`kailuaCoffeeExample.test.ts` prüft es). Für
 * Schicht 3 braucht es genau die — im Dummy steht der Satz dazu (`DK_NAME_NOTE`:
 * „Kailua ist hier auf dem Architektur-Weg gezeigt").
 */

// ── Die Kit-Werte des Prototyps als Slot-Werte ─────────────────────────────

const KIT_CHAPTERS: BrandFoundationInput['chapters'] = [
  {
    stepKey: 'architecture',
    slots: [
      { slotId: 'b2.model', value: 'branded-house' },
      {
        slotId: 'b2.rule',
        value: 'Die Dachmarke trägt alles: ein zweiter Ausschank und das Abo-Programm laufen '
          + 'unter „Kailua Coffee Co.", nie unter einem eigenen Namen.',
      },
    ],
  },
  {
    stepKey: 'nomenclature',
    slots: [
      { slotId: 'm.types', value: formatBrandSlotList(['product', 'service', 'place']) },
      {
        slotId: 'm.patterns',
        // Muster und Beispiel durch ` · ` getrennt: `formatBrandSlotStructured`
        // zieht jeden Block auf EINE Zeile zusammen, ein Zeilenumbruch käme
        // hier also gar nicht an (der Renderer liest beide Schreibweisen).
        value: formatBrandSlotStructured([
          { label: 'product', body: 'Ort + Erntemonat — kein Fantasiename · Kona Februar 2026' },
          { label: 'service', body: 'Dachmarke + Tätigkeit in einem Wort · Kailua Verkostung' },
          { label: 'place', body: 'Dachmarke + Stadtteil, nie eine Nummer · Kailua Coffee Co. Kaimukī' },
        ]),
      },
      {
        slotId: 'm.rules',
        value: formatBrandSlotList([
          'Die Dachmarke steht vorn: „Kailua Coffee Co. Kaimukī", nie „Kaimukī by Kailua".',
          'Ein Name sagt, was die Sache IST — kein Erlebnis-Wort, kein Superlativ.',
          'Groß-/Kleinschreibung wie im Deutschen; in Adressen alles klein und mit Bindestrich.',
          'Röstungen tragen Ort und Erntemonat, keine Tiernamen.',
          'Nie zwei Namen für dieselbe Sache.',
        ]),
      },
    ],
  },
  {
    stepKey: 'aiguide',
    slots: [
      { slotId: 'n.scope', value: 'drafts' },
      { slotId: 'n.review', value: 'every' },
      {
        slotId: 'n.guardrails',
        // Ebenfalls ` · ` statt Zeilenumbruch (s. `m.patterns`): der Schreiber
        // zieht zusammen, `ruleEntries` trennt wieder auf.
        value: formatBrandSlotStructured([
          {
            label: 'Ton-Parameter',
            body: 'ruhig — kurze Hauptsätze, keine Ausrufezeichen. · '
              + 'fundiert — jede Behauptung mit Ort, Zahl oder Datum. · '
              + 'gerade heraus — schlechte Nachrichten stehen im ersten Satz.',
          },
          {
            label: 'Tabus',
            body: 'Genuss-Erlebnis, Auszeit, Deluxe, Premium-Arabica-Selektion. · '
              + 'Superlative ohne Beleg: „bester", „einzigartig".',
          },
          {
            label: 'Markenzeichen-Schreibweisen',
            body: 'Kailua Coffee Co. — mit Punkt, nie „KCC". · '
              + 'Oʻahu mit ʻOkina — nicht mit Apostroph, nicht ohne.',
          },
          {
            label: 'No-go-Themen',
            body: 'Gesundheitsversprechen zu Kaffee — auch nicht als Scherz. · '
              + 'Vergleiche mit namentlich genannten Wettbewerbern.',
          },
        ]),
      },
      {
        slotId: 'n.prompts',
        /*
         * DIE EINE STELLE, DIE DEN SCHREIBER NICHT BENUTZT — mit Grund:
         * `formatBrandSlotStructured` zieht jeden Block auf EINE Zeile, und
         * eine Prompt-Vorlage ohne Zeilenumbrüche ist nicht dieselbe Vorlage.
         * `n.prompts` ist `editor: 'none'`, `generator: 'none'` und wird in
         * K5 PUR gerechnet — der Erzeuger dort baut den Wert genauso selbst.
         */
        value: [
          '## System-Prompt',
          'Du schreibst als Kailua Coffee Co., eine Rösterei mit Ausschank auf Oʻahu.',
          'Ton: ruhig, fundiert, gerade heraus, warm ohne Anbiederung.',
          'Erfinde nie Zahlen, Herkünfte oder Preise.',
          '',
          '## Social-Post',
          'Schreibe einen Social-Post (maximal 60 Wörter) im Ton von Kailua Coffee Co.',
          'Nenne Ort, Höhenlage, Erntemonat und die Person, die geröstet hat.',
          '',
          '## E-Mail an Kunden',
          'Schreibe eine kurze Mail zu einer Preisänderung.',
          'Der Grund steht im ersten Satz, keine Floskel davor.',
        ].join('\n'),
      },
    ],
  },
  {
    stepKey: 'presskit',
    slots: [
      {
        slotId: 'p.facts',
        value: formatBrandSlotList([
          'Gegründet 2026 in Kailua auf Oʻahu, Hawaii.',
          'Eine Röstung pro Saison, rund 1 200 kg im Jahr.',
          'Drei Festangestellte, zwei Aushilfen — Anbau, Röstung und Ausschank aus einer Hand.',
        ]),
      },
      {
        slotId: 'p.contact',
        value: formatBrandSlotStructured([
          { label: 'Name', body: 'Leilani Kahale' },
          { label: 'Rolle', body: 'Inhaberin' },
          { label: 'E-Mail', body: 'leilani@kailuacoffee.co' },
        ]),
      },
    ],
  },
]

/** Kailua mit Schicht 3, Preset und Freischaltung — die volle Leseansicht. */
const KAILUA_K4: BrandFoundationInput = {
  ...KAILUA_COFFEE_EXAMPLE,
  chapters: [...KAILUA_COFFEE_EXAMPLE.chapters, ...KIT_CHAPTERS],
  derivationUnlocked: true,
}

/** Dieselbe Marke ohne die Werte der dritten Schicht. */
const KAILUA_OHNE_KIT: BrandFoundationInput = {
  ...KAILUA_COFFEE_EXAMPLE,
  derivationUnlocked: true,
}

function chapterOf(input: BrandFoundationInput, id: BrandFoundationChapterId): BrandFoundationChapter | undefined {
  return buildBrandFoundation(input).chapters.find(chapter => chapter.id === id)
}

function blockKinds(chapter: BrandFoundationChapter | undefined): string[] {
  return (chapter?.blocks ?? []).map(block => block.kind)
}

function tableOf(chapter: BrandFoundationChapter | undefined, labelKey: string) {
  const block = (chapter?.blocks ?? []).find(
    (entry): entry is Extract<BrandFoundationBlock, { kind: 'table' }> =>
      entry.kind === 'table' && entry.labelKey === labelKey,
  )
  return block
}

// ── 1. Die Anker sind ein Vertrag ──────────────────────────────────────────

describe('K4 — die Anker bleiben, wie K0 sie festgelegt hat', () => {
  it('listet siebzehn Anker in unveränderter Reihenfolge', () => {
    expect([...BRAND_FOUNDATION_CHAPTER_IDS]).toEqual([
      'story', 'kontext', 'purpose', 'positionierung', 'architektur', 'nomenklatur',
      'werte', 'stimme', 'manifest', 'messaging', 'name', 'visuell',
      'zeichen-anwendung', 'farbe-anwendung', 'typografie-anwendung', 'pressekit', 'ki-texte',
    ])
  })

  it('gibt jedem gerenderten Kapitel seine Id als Sprungmarke — auch den neuen', () => {
    for (const chapter of buildBrandFoundation(KAILUA_K4).chapters) {
      expect(chapter.anchor, chapter.id).toBe(chapter.id)
    }
  })

  it('behält den Anker `ki-texte`, obwohl das Kapitel „AI-Guidelines" heisst (§2.20 Nr. 6)', () => {
    const chapter = chapterOf(KAILUA_K4, 'ki-texte')
    expect(chapter?.anchor).toBe('ki-texte')
    expect(chapter?.titleKey).toBe('brand.foundation.chapter.aiGuidelines')
    // Ohne abgenommene Guidelines bleibt der alte Titel — er ist dann wahr.
    expect(chapterOf(KAILUA_OHNE_KIT, 'ki-texte')?.titleKey).toBe('brand.foundation.chapter.ki-texte')
  })
})

// ── 2. Die volle Leseansicht ───────────────────────────────────────────────

describe('K4 — Kailua mit Preset und Freischaltung', () => {
  it('rendert 16 Kapitel (alle ausser dem Namens-Kapitel, das Kailua nicht braucht)', () => {
    const ids = buildBrandFoundation(KAILUA_K4).chapters.map(chapter => chapter.id)
    expect(ids).toEqual(BRAND_FOUNDATION_CHAPTER_IDS.filter(id => id !== 'name'))
    expect(ids).toHaveLength(16)
  })

  it('gibt jedem Kapitel mindestens einen Block und keinem eine Schranke', () => {
    for (const chapter of buildBrandFoundation(KAILUA_K4).chapters) {
      expect(chapter.blocks.length, chapter.id).toBeGreaterThan(0)
      expect(chapter.state, chapter.id).toBe('done')
      expect(chapter.lockReason, chapter.id).toBeUndefined()
    }
  })
})

// ── 3. Nomenklatur ─────────────────────────────────────────────────────────

describe('K4 — Kapitel „Nomenklatur"', () => {
  it('zeigt Typen, Muster je Typ und die Regeln', () => {
    const chapter = chapterOf(KAILUA_K4, 'nomenklatur')
    expect(blockKinds(chapter)).toEqual(['chips', 'table', 'rules'])

    const patterns = tableOf(chapter, 'brand.foundation.label.namePatterns')
    expect(patterns?.columnKeys).toEqual([
      'brand.foundation.column.nameType',
      'brand.foundation.column.pattern',
      'brand.foundation.column.example',
      // SEIT K5: die Herkunft hat eine eigene Spalte. Die Werte des Dummys
      // tragen sie nicht — die Zelle bleibt dann leer, statt die Begründung
      // hinter das Beispiel zu schieben.
      'brand.foundation.column.source',
    ])
    // Die Typ-Id wird zur Lesefassung des Katalogs, das Beispiel steht in der
    // dritten Spalte — beides in der INHALTSSPRACHE der Marke.
    expect(patterns?.rows[0]).toEqual(['Produkt', 'Ort + Erntemonat — kein Fantasiename', 'Kona Februar 2026', ''])
    expect(patterns?.rows).toHaveLength(3)

    const rules = chapter?.blocks.find(block => block.kind === 'rules')
    expect(rules?.kind === 'rules' && rules.items).toHaveLength(5)
  })

  it('entfällt OHNE LÜCKE, wenn die Marke nicht auf dem B2-Weg liegt (§2.20 Nr. 4)', () => {
    expect(chapterOf(KAILUA_OHNE_KIT, 'nomenklatur')).toBeUndefined()
  })
})

// ── 4. Die drei Anwendungs-Kapitel ─────────────────────────────────────────

describe('K4 — Kapitel „Zeichen-Anwendung"', () => {
  const chapter = chapterOf(KAILUA_K4, 'zeichen-anwendung')

  it('zeigt Zeichenart, Briefing, Schutzraum, Mindestgrössen, Varianten und Don\'ts', () => {
    expect(blockKinds(chapter)).toEqual(['text', 'list', 'text', 'table', 'text', 'rules'])
  })

  it('rechnet den Schutzraum aus dem Markennamen, nicht aus einem gespeicherten Satz', () => {
    const clearSpace = chapter?.blocks.find(
      block => block.kind === 'text' && block.labelKey === 'brand.foundation.label.markClearSpace',
    )
    // „Höhe des Versal-K" ist prüfbar, „genug Platz" wäre es nicht.
    expect(clearSpace?.kind === 'text' && clearSpace.text).toContain('Versal-K')
    expect(clearSpace?.kind === 'text' && clearSpace.text).toContain('96 px')
  })

  it('nennt die drei Mindestgrössen als Tabelle zum Abschreiben', () => {
    const sizes = tableOf(chapter, 'brand.foundation.label.markMinSizes')
    expect(sizes?.rows.map(row => row[1])).toEqual(['96 px', '24 mm', '24 px'])
  })
})

describe('K4 — Kapitel „Farb-Anwendung"', () => {
  const chapter = chapterOf(KAILUA_K4, 'farbe-anwendung')

  it('zeigt beide Rollen-Tabellen, den gehobenen Akzent und die Kontrast-Paare', () => {
    // VIER Tabellen und KEINE Regel: Kailua fällt in keinem Paar durch (alle
    // AAA/AA). Eine Verbots-Liste ohne Anlass wäre eine erfundene Regel — s.
    // die Gegenprobe unten.
    expect(blockKinds(chapter)).toEqual(['table', 'table', 'table', 'table'])
  })

  it('nimmt die dunklen Hex-Werte aus K2 — dieselbe Spiegelung wie `tokens.json`', () => {
    const dark = tableOf(chapter, 'brand.foundation.label.colorRolesDark')
    const colors = {
      rampLight: KAILUA_COFFEE_DESIGN.color.rampLight,
      rampDark: KAILUA_COFFEE_DESIGN.color.rampDark,
      neutral: KAILUA_COFFEE_DESIGN.color.neutral,
      accent: KAILUA_COFFEE_DESIGN.color.accent,
    }
    // Die Gegenprobe ist die Behauptung wert: die hellen und die dunklen
    // Werte dürfen NICHT dieselben sein, sonst wäre die Spiegelung tot.
    const light = tableOf(chapter, 'brand.foundation.label.colorRolesLight')
    expect(dark?.rows.map(row => row[1])).not.toEqual(light?.rows.map(row => row[1]))
    for (const [index, role] of KAILUA_COFFEE_DESIGN.color.roles.entries()) {
      expect(dark?.rows[index]?.[1], role.id).toBe(brandTokenRoleHex(role.source, 'dark', colors))
    }
  })

  it('belegt den gehobenen Dunkelmodus-Akzent mit gemessenem und gehobenem Urteil (§2.20 Nr. 7)', () => {
    const lift = brandTokenAccentLiftFor(KAILUA_COFFEE_DESIGN)
    expect(lift, 'Kailuas Akzent muss gehoben werden — sonst prüft der Test nichts').not.toBeNull()
    const table = tableOf(chapter, 'brand.foundation.label.accentLift')
    expect(table?.rows).toHaveLength(2)
    expect(table?.rows[0]?.[0]).toBe(KAILUA_COFFEE_DESIGN.color.accent)
    expect(table?.rows[0]?.[1]).toBe(lift!.ground)
    expect(table?.rows[1]?.[0]).toContain(String(lift!.lifted.shade))
  })

  it('macht aus jedem durchgefallenen Paar eine Regel — und ohne Durchfaller keine', () => {
    // Kailua hat keinen Durchfaller (s. oben) — die Regel entsteht deshalb an
    // einer MUTIERTEN Fassung. Ohne diese Gegenprobe wäre die Zusage „aus den
    // Durchfallern" durch nichts belegt: ein Renderer, der gar keine Regel
    // baut, wäre oben genauso grün.
    const [erstes, ...rest] = KAILUA_COFFEE_DESIGN.color.contrastPairs
    const kaputt = buildBrandFoundation({
      ...KAILUA_K4,
      design: {
        ...KAILUA_COFFEE_DESIGN,
        color: {
          ...KAILUA_COFFEE_DESIGN.color,
          contrastPairs: [{ ...erstes!, level: 'fail' as const, ratio: 1.9 }, ...rest],
        },
      },
    }).chapters.find(entry => entry.id === 'farbe-anwendung')

    const rules = kaputt?.blocks.find(block => block.kind === 'rules')
    expect(rules?.kind === 'rules' && rules.items).toHaveLength(1)
    expect(rules?.kind === 'rules' && rules.items[0]?.text).toContain('Nie Text auf')
    expect(rules?.kind === 'rules' && rules.items[0]?.text).toContain(erstes!.background)
    // Das Gegenbeispiel nennt das Paar, nicht nur die Fläche.
    expect(rules?.kind === 'rules' && rules.items[0]?.dont).toContain(erstes!.foreground)
  })
})

describe('K4 — Kapitel „Typografie-Anwendung"', () => {
  const chapter = chapterOf(KAILUA_K4, 'typografie-anwendung')

  it('zeigt Paar, Grössen-Tabelle, Regeln und die Lizenz-Zeile', () => {
    expect(blockKinds(chapter)).toEqual(['text', 'table', 'rules', 'text'])
  })

  it('fährt die Grössen-Leiter von K2 und nicht die sechs Zahlen des Prototyps', () => {
    const scale = tableOf(chapter, 'brand.foundation.label.typeScale')
    expect(scale?.rows.map(row => row[0])).toEqual(BRAND_TOKEN_TYPE_STEPS.map(step => step.id))
    // Kailua steht auf der Skala „calm" (Faktor 1): H1 = 2,6 rem, Fliesstext 1 rem.
    expect(scale?.rows[0]?.[1]).toBe('2,6 rem')
    expect(scale?.rows.find(row => row[0] === 'body')?.[1]).toBe('1 rem')
  })

  it('nennt Familie, Lizenz und Quelle in einer Zeile', () => {
    const license = chapter?.blocks.find(
      block => block.kind === 'text' && block.labelKey === 'brand.foundation.label.typeLicense',
    )
    expect(license?.kind === 'text' && license.text).toContain('OFL-1.1')
    expect(license?.kind === 'text' && license.text).toContain('fonts.google.com')
  })
})

// ── 5. Die drei Zustände der Anwendungs-Kapitel (§2.5) ─────────────────────

describe('K4 — die Schranke der Anwendungs-Kapitel', () => {
  const ANWENDUNG: readonly BrandFoundationChapterId[] = [
    'zeichen-anwendung', 'farbe-anwendung', 'typografie-anwendung',
  ]

  it('OHNE FREISCHALTUNG: gesperrt mit dem Grund `derivation`', () => {
    const view = buildBrandFoundation({ ...KAILUA_K4, derivationUnlocked: false })
    for (const id of ANWENDUNG) {
      const chapter = view.chapters.find(entry => entry.id === id)
      expect(chapter?.state, id).toBe('locked')
      expect(chapter?.lockReason, id).toBe('derivation')
      expect(blockKinds(chapter).every(kind => kind === 'lockedUsage'), id).toBe(true)
    }
  })

  it('OHNE PRESET, ABER FREIGESCHALTET: gesperrt mit dem Grund `design`', () => {
    const { design: _design, ...ohnePreset } = KAILUA_K4
    const view = buildBrandFoundation(ohnePreset)
    for (const id of ANWENDUNG) {
      const chapter = view.chapters.find(entry => entry.id === id)
      expect(chapter?.state, id).toBe('locked')
      expect(chapter?.lockReason, id).toBe('design')
    }
    // Kapitel 10 bleibt unverändert die Schranke von Brand Design — es hat
    // seinen eigenen Grund im Block und bekommt KEINEN `lockReason`.
    const visuell = view.chapters.find(entry => entry.id === 'visuell')
    expect(visuell?.state).toBe('locked')
    expect(visuell?.lockReason).toBeUndefined()
  })

  it('FREMDLESER (Snapshot): der Aufrufer sagt nichts, die Kapitel stehen gar nicht', () => {
    // Die Share-Seite reicht `derivationUnlocked` NUR mit eingefrorenem Preset
    // herein. Ohne Preset gibt es hier keine Schranke — ein Snapshot weiss
    // nichts über den heutigen Freischalt-Zustand des Kontos.
    const { design: _design, derivationUnlocked: _unlocked, ...snapshot } = KAILUA_K4
    const ids = buildBrandFoundation(snapshot).chapters.map(chapter => chapter.id)
    for (const id of ANWENDUNG) expect(ids, id).not.toContain(id)
    // Was er sehr wohl sieht: Nomenklatur, Pressekit und die Guidelines —
    // sie reisen als bestätigte WERTE über `sessionTravels`.
    expect(ids).toEqual(expect.arrayContaining(['nomenklatur', 'pressekit', 'ki-texte']))
  })

  it('nennt jedes Schranken-Thema im Katalog — beide Sprachen', () => {
    const catalogue = (source: typeof de): Record<string, { title: string, text: string }> =>
      (source as unknown as {
        brand: { foundation: { usage: Record<string, { title: string, text: string }> } }
      }).brand.foundation.usage
    for (const topic of BRAND_FOUNDATION_USAGE_TOPICS) {
      expect(catalogue(de)[topic]?.title, topic).toBeTruthy()
      expect(catalogue(de)[topic]?.text, topic).toBeTruthy()
      expect(catalogue(en as unknown as typeof de)[topic]?.title, topic).toBeTruthy()
      expect(catalogue(en as unknown as typeof de)[topic]?.text, topic).toBeTruthy()
    }
  })
})

// ── 6. Pressekit ───────────────────────────────────────────────────────────

describe('K4 — Kapitel „Pressekit"', () => {
  it('zeigt Tagline, Boilerplates, freigegebene Fakten, Kontakt und den Zeichen-Hinweis', () => {
    const chapter = chapterOf(KAILUA_K4, 'pressekit')
    expect(blockKinds(chapter)).toEqual(['lead', 'cards', 'list', 'contact', 'text'])
    const contact = chapter?.blocks.find(block => block.kind === 'contact')
    expect(contact?.kind === 'contact' && contact).toMatchObject({
      name: 'Leilani Kahale',
      role: 'Inhaberin',
      email: 'leilani@kailuacoffee.co',
    })
  })

  it('nimmt die Fakten NUR aus `p.facts` — `a.facts` bleibt intern (§2.4)', () => {
    // Kailuas `a.facts` gibt es im Beispiel gar nicht; der Beweis legt sie
    // deshalb mit einem unverwechselbaren String dazu und prüft die ganze
    // Ansicht. Ohne die Gegenprobe wäre der Test auch grün, wenn `p.facts`
    // ebenfalls fehlte.
    const rendered = JSON.stringify(buildBrandFoundation({
      ...KAILUA_K4,
      chapters: [
        ...KAILUA_K4.chapters,
        { stepKey: 'context', slots: [{ slotId: 'a.facts', value: formatBrandSlotList(['GEHEIM-UMSATZ-310000']) }] },
      ],
    }))
    expect(rendered).not.toContain('GEHEIM-UMSATZ-310000')
    expect(rendered).toContain('Gegründet 2026 in Kailua')
  })

  it('entfällt, solange kein Mensch Fakten freigegeben oder einen Kontakt genannt hat', () => {
    expect(chapterOf(KAILUA_OHNE_KIT, 'pressekit')).toBeUndefined()
  })
})

// ── 7. AI-Guidelines ───────────────────────────────────────────────────────

describe('K4 — Kapitel 11 wird zu den AI-Guidelines', () => {
  it('behält den festen Rahmen und stellt Umfang, Freigabe, Leitplanken und Vorlagen darunter', () => {
    const chapter = chapterOf(KAILUA_K4, 'ki-texte')
    expect(blockKinds(chapter)).toEqual([
      'aiRules', 'text', 'text',
      'rules', 'rules', 'rules', 'rules',
      'prompt', 'prompt', 'prompt',
    ])
    const scope = chapter?.blocks.find(
      block => block.kind === 'text' && block.labelKey === 'brand.foundation.label.aiScope',
    )
    // Die Id wird zur Lesefassung des Katalogs samt ihrer Hinweiszeile.
    expect(scope?.kind === 'text' && scope.text).toContain('Entwürfe für alles')

    const prompt = chapter?.blocks.find(block => block.kind === 'prompt')
    expect(prompt?.kind === 'prompt' && prompt.title).toBe('System-Prompt')
    expect(prompt?.kind === 'prompt' && prompt.labelKey).toBe('brand.foundation.label.aiPrompt')
    // Zeilenumbrüche bleiben — die Vorlage wird kopiert, nicht gelesen.
    expect(prompt?.kind === 'prompt' && prompt.text).toContain('\n')
  })

  it('bleibt der blosse Rahmen, solange `aiguide` nicht abgenommen ist', () => {
    expect(blockKinds(chapterOf(KAILUA_OHNE_KIT, 'ki-texte'))).toEqual(['aiRules'])
  })
})

// ── 8. Der Snapshot bleibt v2, die Kit-Kapitel reisen ──────────────────────

describe('K4 — was der geteilte Link trägt', () => {
  it('lässt die drei Werkstatt-Kapitel der Schicht 3 als Kapitel reisen', () => {
    // Anders als Brand Design, dessen Ergebnis als PRESET reist: Nomenklatur,
    // Guidelines und Pressekit sind TEXT (`isBrandChapterShareable`).
    for (const stepKey of BRAND_KIT_STEP_KEYS) expect(isBrandChapterShareable(stepKey), stepKey).toBe(true)
  })

  it('rechnet die Anwendungs-Kapitel beim LESEN aus dem eingefrorenen Preset', () => {
    // Die FORM des Snapshots ändert sich nicht (v2): er trägt `chapters` und
    // `design`, mehr braucht es nicht. Der Beweis fährt deshalb genau die
    // Eingabe, die `/brand/share/:token` baut.
    const view = buildBrandFoundation({
      title: KAILUA_COFFEE_EXAMPLE.title,
      contentLocale: KAILUA_COFFEE_EXAMPLE.contentLocale,
      story: KAILUA_COFFEE_EXAMPLE.story,
      chapters: KAILUA_K4.chapters,
      design: KAILUA_COFFEE_DESIGN,
      derivationUnlocked: true,
    })
    const ids = view.chapters.map(chapter => chapter.id)
    expect(ids).toEqual(expect.arrayContaining([
      'zeichen-anwendung', 'farbe-anwendung', 'typografie-anwendung', 'pressekit', 'nomenklatur',
    ]))
    for (const chapter of view.chapters) expect(chapter.state, chapter.id).toBe('done')
  })
})

// ── 9. `brand.md` löst die K3-Abweichung 4 ein ─────────────────────────────

describe('K4 — `brand.md` zeigt Nomenklatur und AI-Guidelines', () => {
  const markdown = renderBrandContextMarkdown(
    buildBrandFoundation(KAILUA_K4),
    { title: 'Kailua Coffee Co.', locale: 'de', stand: '2026-09-09T10:00:00.000Z' },
    KAILUA_COFFEE_DESIGN,
  )

  it('trägt den Abschnitt „Nomenklatur" mit Mustern und Regeln', () => {
    expect(markdown).toContain('## Nomenklatur')
    expect(markdown).toContain('Kona Februar 2026')
    expect(markdown).toContain('**Namens-Regeln:**')
  })

  it('trägt unter „Regeln für KI" die Guidelines statt des Drei-Zeilen-Rahmens', () => {
    expect(markdown).toContain('## Regeln für KI')
    expect(markdown).toContain('**Was KI erzeugen darf:**')
    expect(markdown).toContain('**Leitplanken · Tabus:**')
    // Die Vorlagen stehen als Code-Block: sie werden kopiert, nicht gelesen.
    expect(markdown).toContain('**Vorlage · System-Prompt:**')
    expect(markdown).toContain('```text')
    // Der Rahmen tritt zurück, sobald es die Ausarbeitung gibt (§2.6 Nr. 7).
    expect(markdown).not.toContain('**Schreibt in diesem Ton:**')
  })

  it('lässt die Anwendungs-Kapitel WEG — sie stehen als Preset in `tokens.json`', () => {
    // Sonst stünden dieselben Hex-Werte zweimal in derselben Datei (§2.6 Nr. 8).
    expect(markdown).not.toContain('## Zeichen-Anwendung')
    expect(markdown).not.toContain('Rollen im hellen Modus')
  })
})
