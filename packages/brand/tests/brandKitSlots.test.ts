import { describe, expect, it, vi } from 'vitest'
import {
  BRAND_GUARDRAIL_GROUPS,
  BRAND_KIT_PART_SEPARATOR,
  BRAND_PROMPT_TEMPLATES,
  brandFactEntries,
  brandGuardrailGroupId,
  brandGuardrailGroupLabel,
  brandPromptTemplateTitle,
  buildBrandPromptTemplates,
  checkBrandGuardrails,
  checkBrandNamePatterns,
  deriveBrandNameRules,
  formatBrandGuardrails,
  formatBrandNamePatterns,
  formatBrandNameRules,
  formatBrandPressContact,
  formatBrandPressFacts,
  formatBrandPressSummary,
  formatBrandPromptTemplates,
  parseBrandGuardrails,
  parseBrandNamePatterns,
  parseBrandPressContact,
  parseBrandPressFacts,
  parseBrandPromptTemplates,
} from '../shared/brandKitSlots'
import {
  brandGuardrailsSchema,
  brandNamePatternsSchema,
  brandPressContactSchema,
  brandPromptTemplatesSchema,
  clampBrandGuardrails,
  clampBrandNamePatterns,
} from '../schemas/brandKitSlots'
import {
  BRAND_AI_REVIEWS,
  BRAND_AI_SCOPES,
  BRAND_NAME_TYPES,
  validateBrandKitVocab,
} from '../shared/brandKitVocab'
import {
  type BrandFoundationBlock,
  type BrandFoundationChapter,
  type BrandFoundationInput,
  brandVocabularyAvoidWords,
  buildBrandFoundation,
} from '../shared/brandFoundation'
import { brandChoiceContract, brandChoiceDisplayLabel } from '../shared/brandChoiceOptions'
import { brandSlotValueMatchesFormat, formatBrandSlotList } from '../shared/brandSlotFormat'
import { slotById } from '../shared/slotRegistry'
import { slotReadiness } from '../shared/brandSlotReadiness'
import { sessionInstructionForSlot } from '../server/utils/sessionPrompt'
import {
  OTTO_PATTERN_FORM_RULES,
  OTTO_PATTERN_INVARIANTS,
  OTTO_PROMPT_VERSION,
  ottoSlotInstruction,
} from '../server/utils/ottoPrompt'
import {
  NIKA_GUARDRAIL_FORM_RULES,
  NIKA_GUARDRAIL_INVARIANTS,
  NIKA_PROMPT_VERSION,
  nikaSlotInstruction,
} from '../server/utils/nikaPrompt'
import { KAILUA_COFFEE_EXAMPLE } from '../shared/examples/kailuaCoffee'

/*
 * DIE ZWEI NACHPRÜFUNGEN WOHNEN IN NITRO-PLUGINS — dieselbe Klammer wie in
 * `advisorGenerators.test.ts`: `defineNitroPlugin` gibt es nur zur Laufzeit,
 * also wird es gestubbt und die Module danach dynamisch geladen. Die REGEL
 * selbst ist pur (`brandKitSlots.ts`); geprüft wird hier die Aufrufstelle, die
 * aus einem Verstoss eine Rückfrage macht.
 */
vi.stubGlobal('defineNitroPlugin', (fn: unknown) => fn)
const { verifyOttoDraft } = await import('../server/plugins/otto-nomenclature')
const { verifyNikaDraft } = await import('../server/plugins/nika-aiguide')

/**
 * DIE WERKSTATT-KAPITEL DER DRITTEN SCHICHT (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.2–§2.4, Paket K5).
 *
 * ── WAS HIER BEWIESEN WIRD ────────────────────────────────────────────────
 *  1. SCHREIBER ↔ LESER: was `format…` erzeugt, liest `parse…` zurück UND der
 *     K4-Renderer (`buildBrandFoundation`) macht daraus die erwarteten Blöcke.
 *     Das ist der eigentliche Punkt des Pakets — bis K4 gab es den Leser ohne
 *     seinen Schreiber.
 *  2. INVARIANTEN: ein Typ ohne Muster, ein doppeltes Muster, ein Tabu-Wort im
 *     Ton werden zur RÜCKFRAGE, nicht zu einem stillen Entwurf.
 *  3. FORMVERTRÄGE: die Zod-Schemas nehmen an, was gültig ist, und klemmen den
 *     Rest weg, statt alles zu verwerfen.
 *  4. DIE REISE-REGEL: `a.facts` steht in KEINER gerenderten Ansicht — nur die
 *     Auswahl aus `p.facts` (Gegenprobe wie §2.12 Nr. 2).
 *  5. DAS BEREITSCHAFTS-GATE nennt den BEDARF beim Namen, statt „geht nicht"
 *     zu sagen.
 *  6. DIE PROMPT-DATEIEN tragen Formvertrag, Invarianten und Vokabular — ohne
 *     Snapshot, damit eine Umformulierung nicht rot wird, eine WEGGEFALLENE
 *     Regel aber schon.
 */

const PATTERNS = [
  {
    type: 'product',
    pattern: 'Ort + Erntemonat — kein Fantasiename',
    example: 'Kona Februar 2026',
    source: 'aus dem Architektur-Modell „eine Marke"',
  },
  {
    type: 'place',
    pattern: 'Dachmarke + Stadtteil, nie eine Nummer',
    example: 'Kailua Coffee Co. Kaimukī',
    source: 'aus dem Wert „Nähe"',
  },
]

const GUARDRAILS = [
  {
    id: 'tone',
    label: 'Ton-Parameter',
    lines: ['ruhig — kurze Hauptsätze, keine Ausrufezeichen', 'fundiert — jede Behauptung mit Beleg'],
  },
  { id: 'taboo', label: 'Tabus', lines: ['Genuss-Erlebnis', 'Premium'] },
  { id: 'spelling', label: 'Markenzeichen-Schreibweisen', lines: ['Kailua Coffee Co. — mit Punkt'] },
  { id: 'nogo', label: 'No-go-Themen', lines: ['Gesundheitsversprechen zu Kaffee'] },
]

// ── 1. Namensmuster: Schreiber ↔ Leser ─────────────────────────────────────

describe('K5 — `m.patterns`: Schreiber und Leser meinen dieselbe Form', () => {
  it('schreibt drei Teile je Block und liest sie zurück', () => {
    const value = formatBrandNamePatterns(PATTERNS)
    expect(brandSlotValueMatchesFormat('structured', value)).toBe(true)
    expect(value).toContain(BRAND_KIT_PART_SEPARATOR)
    expect(parseBrandNamePatterns(value)).toEqual(PATTERNS)
  })

  it('liest auch die Hand-Fassung mit Zeilen statt Mittelpunkten', () => {
    const value = '## product\nOrt + Erntemonat\nKona Februar 2026\naus der Mission'
    expect(parseBrandNamePatterns(value)).toEqual([
      { type: 'product', pattern: 'Ort + Erntemonat', example: 'Kona Februar 2026', source: 'aus der Mission' },
    ])
  })

  it('lässt einen Bestandswert OHNE Herkunft gültig — die Zelle bleibt leer', () => {
    const value = formatBrandNamePatterns([{ ...PATTERNS[0]!, source: '' }])
    expect(parseBrandNamePatterns(value)[0]?.source).toBe('')
  })

  it('verwirft einen Block ohne Muster, statt eine leere Behauptung zu tragen', () => {
    expect(parseBrandNamePatterns('## product\n')).toEqual([])
  })
})

// ── 2. Leitplanken, Vorlagen, Fakten, Kontakt: Schreiber ↔ Leser ───────────

describe('K5 — die übrigen sechs Werte gehen durch dieselben Helfer', () => {
  it('`n.guardrails`: vier Gruppen, Zeilen durch Mittelpunkt getrennt', () => {
    const value = formatBrandGuardrails(GUARDRAILS)
    expect(brandSlotValueMatchesFormat('structured', value)).toBe(true)
    expect(parseBrandGuardrails(value)).toEqual(GUARDRAILS)
  })

  it('`n.guardrails`: die Gruppen-Id wird in beiden Sprachen und an der Id erkannt', () => {
    for (const group of BRAND_GUARDRAIL_GROUPS) {
      expect(brandGuardrailGroupId(group.de)).toBe(group.id)
      expect(brandGuardrailGroupId(group.en)).toBe(group.id)
      expect(brandGuardrailGroupId(group.id)).toBe(group.id)
      expect(brandGuardrailGroupLabel(group.id, 'de')).toBe(group.de)
      expect(brandGuardrailGroupLabel(group.id, 'en')).toBe(group.en)
    }
    expect(brandGuardrailGroupId('Sprachliches')).toBe('')
  })

  it('`n.prompts`: der eigene Schreiber BEHÄLT die Zeilenumbrüche', () => {
    const templates = [
      { id: 'system', title: 'System-Prompt', body: 'Zeile eins\nZeile zwei' },
      { id: 'social', title: 'Social-Post', body: 'Ein Satz.\nNoch einer.' },
      { id: 'email', title: 'E-Mail an Kunden', body: 'Grund zuerst.\nDann der Rest.' },
    ]
    const value = formatBrandPromptTemplates(templates)
    expect(value).toContain('Zeile eins\nZeile zwei')
    expect(brandSlotValueMatchesFormat('structured', value)).toBe(true)
    expect(parseBrandPromptTemplates(value)).toEqual(templates)
  })

  it('`n.prompts`: eine LEERZEILE im Rumpf wird geschlossen, nicht zum zweiten Block', () => {
    const value = formatBrandPromptTemplates([
      { id: 'system', title: 'System-Prompt', body: 'oben\n\nunten' },
    ])
    expect(parseBrandPromptTemplates(value)).toEqual([
      { id: 'system', title: 'System-Prompt', body: 'oben\nunten' },
    ])
  })

  it('`p.facts`: gespeichert wird der TEXT, nicht der Index', () => {
    const facts = ['Gegründet 2026 in Kailua.', 'Drei Festangestellte.']
    const value = formatBrandPressFacts(facts)
    expect(value).not.toMatch(/^\d/)
    expect(parseBrandPressFacts(value)).toEqual(facts)
  })

  it('`p.contact`: drei beschriftete Blöcke, tolerant gelesen', () => {
    const contact = { name: 'Leilani Kahale', role: 'Inhaberin', email: 'leilani@kailuacoffee.co' }
    expect(parseBrandPressContact(formatBrandPressContact(contact, 'de'))).toEqual(contact)
    // Von Hand getippt: drei Zeilen, die E-Mail erkennt sich am @.
    expect(parseBrandPressContact('Leilani Kahale\nInhaberin\nleilani@kailuacoffee.co')).toEqual(contact)
    expect(parseBrandPressContact('')).toBeNull()
  })

  it('`p.summary`: benennt, was fehlt, statt es zu füllen', () => {
    const value = formatBrandPressSummary([
      { label: 'Tagline', body: 'Kaffee von hier.' },
      { label: 'Freigegebene Fakten', body: 'Fehlt noch — kommt aus dem Kapitel darüber.' },
    ])
    expect(value).toContain('Fehlt noch')
  })
})

// ── 3. Schreiber ↔ K4-LESER: die Blöcke des Handbuchs ─────────────────────

function chapterOf(input: BrandFoundationInput, id: string): BrandFoundationChapter | undefined {
  return buildBrandFoundation(input).chapters.find(chapter => chapter.id === id)
}

function tableOf(chapter: BrandFoundationChapter | undefined, labelKey: string) {
  return (chapter?.blocks ?? []).find(
    (entry): entry is Extract<BrandFoundationBlock, { kind: 'table' }> =>
      entry.kind === 'table' && entry.labelKey === labelKey,
  )
}

const KAILUA_K5: BrandFoundationInput = {
  ...KAILUA_COFFEE_EXAMPLE,
  derivationUnlocked: true,
  chapters: [
    ...KAILUA_COFFEE_EXAMPLE.chapters,
    {
      stepKey: 'nomenclature',
      slots: [
        { slotId: 'm.types', value: formatBrandSlotList(['product', 'place']) },
        { slotId: 'm.patterns', value: formatBrandNamePatterns(PATTERNS) },
        { slotId: 'm.rules', value: formatBrandNameRules(['Die Dachmarke steht vorn.']) },
      ],
    },
    {
      stepKey: 'aiguide',
      slots: [
        { slotId: 'n.scope', value: 'drafts' },
        { slotId: 'n.review', value: 'every' },
        { slotId: 'n.guardrails', value: formatBrandGuardrails(GUARDRAILS) },
        {
          slotId: 'n.prompts',
          value: formatBrandPromptTemplates([
            { id: 'system', title: 'System-Prompt', body: 'Du schreibst für Kailua.\nTon: ruhig.' },
          ]),
        },
      ],
    },
    {
      stepKey: 'presskit',
      slots: [
        { slotId: 'p.facts', value: formatBrandPressFacts(['Gegründet 2026 in Kailua.']) },
        {
          slotId: 'p.contact',
          value: formatBrandPressContact(
            { name: 'Leilani Kahale', role: 'Inhaberin', email: 'leilani@kailuacoffee.co' },
            'de',
          ),
        },
      ],
    },
  ],
}

describe('K5 — was die Werkstatt schreibt, liest das Handbuch (K4)', () => {
  it('macht aus den Mustern eine Tabelle mit VIER Spalten, Herkunft eigen', () => {
    const table = tableOf(chapterOf(KAILUA_K5, 'nomenklatur'), 'brand.foundation.label.namePatterns')
    expect(table?.columnKeys).toEqual([
      'brand.foundation.column.nameType',
      'brand.foundation.column.pattern',
      'brand.foundation.column.example',
      'brand.foundation.column.source',
    ])
    expect(table?.rows[0]).toEqual([
      'Produkt',
      PATTERNS[0]!.pattern,
      PATTERNS[0]!.example,
      PATTERNS[0]!.source,
    ])
  })

  it('macht aus den vier Gruppen vier Regel-Blöcke und aus der Vorlage einen `prompt`', () => {
    const chapter = chapterOf(KAILUA_K5, 'ki-texte')
    const rules = (chapter?.blocks ?? []).filter(block => block.kind === 'rules')
    expect(rules).toHaveLength(BRAND_GUARDRAIL_GROUPS.length)
    const prompt = (chapter?.blocks ?? []).find(block => block.kind === 'prompt')
    expect(prompt?.kind === 'prompt' && prompt.title).toBe('System-Prompt')
    // Zeilenumbrüche bleiben — die Vorlage wird kopiert, nicht gelesen.
    expect(prompt?.kind === 'prompt' && prompt.text).toContain('\n')
  })

  it('macht aus dem Kontakt-Wert einen `contact`-Block', () => {
    const contact = (chapterOf(KAILUA_K5, 'pressekit')?.blocks ?? [])
      .find(block => block.kind === 'contact')
    expect(contact?.kind === 'contact' && contact).toMatchObject({
      name: 'Leilani Kahale',
      role: 'Inhaberin',
      email: 'leilani@kailuacoffee.co',
    })
  })

  /**
   * DIE REISE-REGEL, MIT GEGENPROBE (§2.12 Nr. 2). Ohne den zweiten
   * `expect` wäre der Test auch grün, wenn `p.facts` ebenfalls fehlte.
   */
  it('`a.facts` steht in KEINER Ansicht — nur die Auswahl aus `p.facts`', () => {
    const rendered = JSON.stringify(buildBrandFoundation({
      ...KAILUA_K5,
      chapters: [
        ...KAILUA_K5.chapters,
        {
          stepKey: 'context',
          slots: [{ slotId: 'a.facts', value: formatBrandPressFacts(['GEHEIM-UMSATZ-310000']) }],
        },
      ],
    }))
    expect(rendered).not.toContain('GEHEIM-UMSATZ-310000')
    expect(rendered).toContain('Gegründet 2026 in Kailua.')
  })
})

// ── 4. Kataloge und Auswahl-Verträge ──────────────────────────────────────

describe('K5 — die drei Kataloge und ihre Verträge', () => {
  it('hält die Ids stabil und je Liste höchstens eine Empfehlung', () => {
    expect(validateBrandKitVocab()).toEqual([])
    expect(BRAND_NAME_TYPES.map(term => term.id))
      .toEqual(['product', 'service', 'program', 'place', 'digital'])
    expect(BRAND_AI_SCOPES.map(term => term.id)).toEqual(['drafts', 'text-only', 'internal', 'none'])
    expect(BRAND_AI_REVIEWS.map(term => term.id)).toEqual(['every', 'sample', 'channel'])
  })

  it('gibt `n.scope` und `n.review` einen GESCHLOSSENEN Vertrag aus demselben Katalog', () => {
    for (const [slotId, terms] of [
      ['n.scope', BRAND_AI_SCOPES],
      ['n.review', BRAND_AI_REVIEWS],
    ] as const) {
      const contract = brandChoiceContract(slotId)
      expect(contract?.kind, slotId).toBe('closed')
      expect(contract?.kind === 'closed' && contract.options.map(option => option.id))
        .toEqual(terms.map(term => term.id))
      // Ohne Vertrag stünde in Log-Karte und Handbuch die rohe Id.
      expect(brandChoiceDisplayLabel(slotId, terms[0]!.id, 'de')).toBe(terms[0]!.de)
      expect(brandChoiceDisplayLabel(slotId, terms[0]!.id, 'en')).toBe(terms[0]!.en)
    }
  })

  it('gibt `m.types` KEINEN Auswahl-Vertrag — eine Mehrfachwahl ist keine Wahl', () => {
    // Der Vertrag hält genau EINE Id (`checkBrandChoiceDraft` verwirft
    // mehrzeilige Werte); `m.types` ist `kind: 'list'` und trüge damit einen
    // Vertrag, den sein eigener Wert immer verletzt.
    expect(brandChoiceContract('m.types')).toBeNull()
    expect(slotById('m.types')?.schema.kind).toBe('list')
  })
})

// ── 5. Die Invarianten werden zur RÜCKFRAGE ───────────────────────────────

/**
 * DIE PUREN INVARIANTEN ZUERST — sie sind die Regel; die Plugins darunter sind
 * nur die Stelle, die aus einem Verstoss eine Rückfrage macht. Ohne diesen
 * Block prüfte der Beweis nur den Boten.
 */
describe('K5 — die Invarianten als pure Regel', () => {
  it('nennt Typ und Verstoss beim Namen', () => {
    expect(checkBrandNamePatterns(['product', 'place'], formatBrandNamePatterns(PATTERNS)))
      .toEqual({ ok: true })
    expect(checkBrandNamePatterns(['product', 'place'], formatBrandNamePatterns([PATTERNS[0]!])))
      .toEqual({ ok: false, violation: 'pattern_missing', detail: 'place' })
    expect(checkBrandNamePatterns(['product'], formatBrandNamePatterns(PATTERNS)))
      .toEqual({ ok: false, violation: 'pattern_stray_type', detail: 'place' })
  })

  it('erkennt die fehlende Gruppe und das Tabu im Ton', () => {
    expect(checkBrandGuardrails(['Premium'], formatBrandGuardrails(GUARDRAILS))).toEqual({ ok: true })
    const missing = checkBrandGuardrails([], formatBrandGuardrails(GUARDRAILS.slice(0, 2)))
    expect(!missing.ok && missing.violation).toBe('guardrail_groups_missing')
    const clash = checkBrandGuardrails(['ruhig'], formatBrandGuardrails(GUARDRAILS))
    expect(!clash.ok && clash.violation).toBe('guardrail_taboo_in_tone')
  })
})

const OTTO_SLOT = { id: 'm.patterns' } as never

function ottoVerdict(draft: string, types: readonly string[]) {
  return verifyOttoDraft({
    slot: OTTO_SLOT,
    draft,
    uiLocale: 'de',
    dependencies: [{ slotId: 'm.types', value: formatBrandSlotList([...types]) }],
  })
}

describe('K5 — Ottos Nachprüfung: Verstoss heisst Rückfrage, nie stiller Entwurf', () => {
  it('nimmt einen Entwurf an, der jedem gewählten Typ genau ein Muster gibt', () => {
    const verdict = ottoVerdict(formatBrandNamePatterns(PATTERNS), ['product', 'place'])
    expect('draft' in verdict).toBe(true)
  })

  it('fragt zurück, wenn ein gewählter Typ ohne Muster bleibt', () => {
    const verdict = ottoVerdict(formatBrandNamePatterns([PATTERNS[0]!]), ['product', 'place'])
    expect('question' in verdict && verdict.question).toContain('Ort / Filiale')
  })

  it('fragt zurück bei einem doppelten Muster für denselben Typ', () => {
    const verdict = ottoVerdict(
      formatBrandNamePatterns([PATTERNS[0]!, { ...PATTERNS[0]!, example: 'Kona März 2026' }]),
      ['product'],
    )
    expect('question' in verdict).toBe(true)
  })

  it('fragt zurück bei einem Typ ausserhalb der Wahl und bei fehlendem Beispiel', () => {
    expect('question' in ottoVerdict(formatBrandNamePatterns(PATTERNS), ['product'])).toBe(true)
    // Nur EIN Teil im Rumpf: das Muster steht, das Beispiel fehlt. (Über den
    // Schreiber ist dieser Wert nicht herstellbar — er lässt leere Teile weg,
    // und dann rückt die Herkunft auf. Genau deshalb steht hier der rohe Wert.)
    expect('question' in ottoVerdict('## product\nOrt + Erntemonat', ['product'])).toBe(true)
  })

  it('prüft NICHT ohne gewählte Typen — dann hat das Gate den Lauf gar nicht zugelassen', () => {
    expect('draft' in ottoVerdict(formatBrandNamePatterns(PATTERNS), [])).toBe(true)
  })
})

const NIKA_SLOT = { id: 'n.guardrails' } as never

function nikaVerdict(draft: string, avoid: readonly string[]) {
  return verifyNikaDraft({
    slot: NIKA_SLOT,
    draft,
    uiLocale: 'de',
    dependencies: [{
      slotId: 'd.vocabulary',
      value: formatBrandSlotList(avoid.map(word => `avoid: ${word}`)),
    }],
  })
}

describe('K5 — Nikas Nachprüfung: vier Gruppen und kein Tabu im Ton', () => {
  it('nimmt vier vollständige Gruppen an', () => {
    expect('draft' in nikaVerdict(formatBrandGuardrails(GUARDRAILS), ['Premium'])).toBe(true)
  })

  it('fragt zurück, wenn eine Gruppe fehlt', () => {
    const verdict = nikaVerdict(formatBrandGuardrails(GUARDRAILS.slice(0, 3)), [])
    expect('question' in verdict).toBe(true)
  })

  it('fragt zurück, wenn ein Tabu-Wort in den Ton-Parametern steht', () => {
    const groups = GUARDRAILS.map(group => (group.id === 'tone'
      ? { ...group, lines: ['erlebnisreich — jede Zeile ein Erlebnis'] }
      : group))
    const verdict = nikaVerdict(formatBrandGuardrails(groups), ['Erlebnis'])
    expect('question' in verdict && verdict.question).toContain('Erlebnis')
  })

  it('prüft auf WORTGRENZE — ein Teilstring ist kein Verstoss', () => {
    const groups = GUARDRAILS.map(group => (group.id === 'tone'
      ? { ...group, lines: ['auszeichnend — wir zeichnen Herkunft aus'] }
      : group))
    expect('draft' in nikaVerdict(formatBrandGuardrails(groups), ['Auszeit'])).toBe(true)
  })

  it('liest die Meiden-Liste über den EINEN Leser des Wort-Leitfadens', () => {
    expect(brandVocabularyAvoidWords(formatBrandSlotList(['use: Herkunft', 'meiden: Premium'])))
      .toEqual(['Premium'])
  })
})

// ── 6. Die Zod-Formverträge ───────────────────────────────────────────────

describe('K5 — die Formverträge nehmen an, was gültig ist, und klemmen den Rest', () => {
  it('nimmt gültige Muster, Leitplanken, Vorlagen und Kontakte an', () => {
    expect(brandNamePatternsSchema.safeParse(PATTERNS).success).toBe(true)
    expect(brandGuardrailsSchema.safeParse(GUARDRAILS).success).toBe(true)
    expect(brandPromptTemplatesSchema.safeParse(BRAND_PROMPT_TEMPLATES.map(template => ({
      id: template.id,
      title: template.de,
      body: 'Eine Vorlage.',
    }))).success).toBe(true)
    expect(brandPressContactSchema.safeParse({
      name: 'Leilani Kahale',
      role: 'Inhaberin',
      email: 'leilani@kailuacoffee.co',
    }).success).toBe(true)
  })

  it('weist einen erfundenen Typ, eine erfundene Gruppe und ein fehlendes Beispiel ab', () => {
    expect(brandNamePatternsSchema.safeParse([{ ...PATTERNS[0]!, type: 'spaceship' }]).success).toBe(false)
    expect(brandNamePatternsSchema.safeParse([{ ...PATTERNS[0]!, example: '' }]).success).toBe(false)
    expect(brandGuardrailsSchema.safeParse([{ id: 'vibes', label: 'Vibes', lines: ['x'] }]).success).toBe(false)
    expect(brandPressContactSchema.safeParse({ name: 'X', role: '', email: 'keine-mail' }).success).toBe(false)
  })

  it('klemmt statt zu verwerfen — neun gute Zeilen bleiben neun', () => {
    expect(clampBrandNamePatterns([PATTERNS[0]!, { type: 'spaceship' }])).toHaveLength(1)
    expect(clampBrandGuardrails([GUARDRAILS[0]!, { id: 'vibes' }])).toHaveLength(1)
  })
})

// ── 7. Die pure Ableitung: Regeln und Vorlagen ────────────────────────────

describe('K5 — was PUR gerechnet wird (§2.11: null KI-Aufrufe)', () => {
  it('leitet `m.rules` aus Mustern und Architektur-Regel ab, mit „nie"-Zeile', () => {
    const rules = deriveBrandNameRules({
      patterns: PATTERNS,
      architectureRule: 'Die Dachmarke trägt alles.',
      locale: 'de',
    })
    expect(rules[0]).toContain('Die Dachmarke trägt alles.')
    expect(rules.some(rule => rule.startsWith('Nie:'))).toBe(true)
    expect(brandSlotValueMatchesFormat('list', formatBrandNameRules(rules))).toBe(true)
  })

  it('baut drei Vorlagen, die die Leitplanken WÖRTLICH tragen', () => {
    const templates = buildBrandPromptTemplates({
      systemPrompt: 'Du schreibst für Kailua.\nTon: ruhig.',
      guardrails: GUARDRAILS,
      title: 'Kailua Coffee Co.',
      locale: 'de',
    })
    expect(templates.map(entry => entry.id)).toEqual(['system', 'social', 'email'])
    expect(templates[0]?.body).toBe('Du schreibst für Kailua.\nTon: ruhig.')
    // Nicht die Zusammenfassung der Tabus, sondern die Tabus.
    expect(templates[1]?.body).toContain('Genuss-Erlebnis')
    expect(templates[2]?.body).toContain('Kailua Coffee Co.')
    for (const template of BRAND_PROMPT_TEMPLATES) {
      expect(brandPromptTemplateTitle(template.id, 'en')).toBe(template.en)
    }
  })

  it('liest die Fakten-Einträge tolerant — Liste oder getippte Zeilen', () => {
    expect(brandFactEntries(formatBrandPressFacts(['Eins', 'Zwei']))).toEqual(['Eins', 'Zwei'])
    expect(brandFactEntries('Eins\nZwei')).toEqual(['Eins', 'Zwei'])
  })
})

// ── 8. Das Bereitschafts-Gate nennt den Bedarf ────────────────────────────

describe('K5 — das Bereitschafts-Gate', () => {
  const base = {
    startCard: { about: 'Rösterei', audience: 'Cafés', industry: 'Kaffee', url: '' } as never,
    hasSiteAnalysis: false,
    coveredSteps: [
      'context', 'pvm', 'architecture', 'values', 'archetype', 'manifesto', 'verbal',
      'naming', 'messaging', 'nomenclature', 'aiguide', 'presskit',
    ] as never,
  }

  it('sperrt `m.patterns` ohne `m.types` — mit sprechendem Bedarf', () => {
    const readiness = slotReadiness('m.patterns', { ...base, records: { 'b2.model': 'branded-house' } })
    expect(readiness.ready).toBe(false)
    expect(!readiness.ready && readiness.missing).toContain('name_types')
  })

  it('sperrt `n.guardrails` ohne `d.toneWords`', () => {
    const readiness = slotReadiness('n.guardrails', { ...base, records: { 'c.final': 'Ruhe' } })
    expect(readiness.ready).toBe(false)
    expect(!readiness.ready && readiness.missing).toContain('tone_words')
  })

  it('lässt beide durch, sobald die Struktur-Quelle steht', () => {
    expect(slotReadiness('m.patterns', {
      ...base,
      records: { 'm.types': formatBrandSlotList(['product']) },
    }).ready).toBe(true)
    expect(slotReadiness('n.guardrails', {
      ...base,
      records: { 'd.toneWords': formatBrandSlotList(['ruhig']) },
    }).ready).toBe(true)
  })

  it('urteilt NICHT über einen Baustein, den der Aufrufer gar nicht sieht', () => {
    // Die Werkstatt reicht nur den offenen Baustein herein — sie darf
    // `d.toneWords` (Baustein „Stimme") nicht für leer erklären.
    expect(slotReadiness('n.guardrails', {
      ...base,
      coveredSteps: ['aiguide'] as never,
      records: { 'n.scope': 'drafts' },
    }).ready).toBe(true)
  })
})

// ── 9. Die Prompt-Dateien ─────────────────────────────────────────────────

describe('K5 — die zwei Prompt-Dateien', () => {
  const options = {
    dependencies: [],
    hint: '',
    pathKind: 'new' as const,
    maxLength: 2000,
    kind: 'structured' as const,
    hasSiteAnalysis: false,
    hasConversation: false,
    contentLocale: 'de',
  }

  it('ERGÄNZT die Session-Anweisung, statt sie zu ersetzen', () => {
    const base = sessionInstructionForSlot('m.patterns', options)
    const full = ottoSlotInstruction('m.patterns', options)
    expect(full.startsWith(base)).toBe(true)
    expect(full.length).toBeGreaterThan(base.length)
  })

  it('trägt bei Otto Formvertrag, Invarianten und die Typ-Ids', () => {
    const text = ottoSlotInstruction('m.patterns', options)
    for (const rule of [...OTTO_PATTERN_FORM_RULES, ...OTTO_PATTERN_INVARIANTS]) {
      expect(text).toContain(rule)
    }
    for (const term of BRAND_NAME_TYPES) expect(text).toContain(term.id)
    expect(text).toContain(BRAND_KIT_PART_SEPARATOR.trim())
  })

  it('trägt bei Nika Formvertrag, Invarianten und die vier Überschriften', () => {
    const text = nikaSlotInstruction('n.guardrails', options)
    for (const rule of [...NIKA_GUARDRAIL_FORM_RULES, ...NIKA_GUARDRAIL_INVARIANTS]) {
      expect(text).toContain(rule)
    }
    // Inhaltssprache: die Überschriften stehen so im WERT, also auch im Prompt.
    for (const group of BRAND_GUARDRAIL_GROUPS) expect(text).toContain(group.de)
    expect(nikaSlotInstruction('n.guardrails', { ...options, contentLocale: 'en' }))
      .toContain(BRAND_GUARDRAIL_GROUPS[0]!.en)
  })

  it('hat je eine eigene, benannte Prompt-Fassung', () => {
    expect(OTTO_PROMPT_VERSION).toMatch(/^otto-/)
    expect(NIKA_PROMPT_VERSION).toMatch(/^nika-/)
  })

  /**
   * `generator: 'none'` DARF KEINEN LAUF AUSLÖSEN — die Route weist ihn mit
   * `slot_not_generated` ab (400), und der Prompt-Bauer wirft ohnehin. Beide
   * Sicherungen stehen hier, weil die eine ohne die andere still werden
   * könnte.
   */
  it('gibt einer Katalog-Wahl gar keine Anweisung', () => {
    for (const slotId of ['n.scope', 'n.review', 'n.prompts', 'm.types', 'm.rules', 'p.facts']) {
      expect(slotById(slotId)?.generator, slotId).toBe('none')
      expect(() => ottoSlotInstruction(slotId, options), slotId).toThrow()
      expect(() => nikaSlotInstruction(slotId, options), slotId).toThrow()
    }
  })
})
