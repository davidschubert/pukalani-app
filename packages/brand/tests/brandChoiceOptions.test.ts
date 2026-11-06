import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BRAND_ARCHETYPES,
  BRAND_STAGE_CHOICE_SLOTS,
  BRAND_ARCHITECTURE_MODELS,
  BRAND_DNA_SOURCES,
  brandChoiceContract,
  brandChoiceDisplayLabel,
  brandChoiceFallbackQuestion,
  brandChoicePromptRule,
  checkBrandChoiceDraft,
  swapBrandChoiceValueLine,
} from '../shared/brandChoiceOptions'
import { slotById } from '../shared/slotRegistry'

/**
 * DIE LEGALE MENGE EINER AUSWAHL (P3.1).
 *
 * Bewiesen wird hier nicht die Mechanik einer Zeichenketten-Prüfung, sondern
 * die vier Zusagen, an denen der Wert im Brand-Dokument hängt:
 *  1. Die vier Architektur-Modelle sind GESCHLOSSEN — ein fünftes gibt es
 *     nicht, und ein „Hybrid" ist kein Kompromiss, sondern ein Verstoss.
 *  2. Gelesen wird NACHSICHTIG (Id oder Name), gespeichert wird STRENG (die
 *     Id): jede unnötige Rückfrage kostet einen Zug und einen Anbieter-Lauf,
 *     ohne dass die Entscheidung des Modells falsch gewesen wäre.
 *  3. Die Kategorie ist OFFEN und trotzdem nicht beliebig: ein Etikett, kein
 *     Absatz — sonst stünde in einem Chips-Feld irgendwann ein Aufsatz.
 *  4. Die Prompt-Regel NENNT die Menge wörtlich. „Choose one of the common
 *     models" ist genau die Formulierung, die „Hybrid" zurückbringt.
 */

describe('Welche Slots einen Auswahl-Vertrag haben', () => {
  it('b2.model ist geschlossen, b.positioningCategory ist offen', () => {
    expect(brandChoiceContract('b2.model')?.kind).toBe('closed')
    expect(brandChoiceContract('b.positioningCategory')?.kind).toBe('open')
  })

  it('beide sind in der Registry wirklich `choice` — der Vertrag erfindet keinen Slot', () => {
    for (const slotId of ['b2.model', 'b.positioningCategory']) {
      expect(slotById(slotId)?.schema.kind, slotId).toBe('choice')
      expect(slotById(slotId)?.type, slotId).toBe('choice')
    }
  })

  it('d.primary und d.secondary sind geschlossen — beide, mit eigener Rückfrage', () => {
    for (const slotId of ['d.primary', 'd.secondary']) {
      const contract = brandChoiceContract(slotId)
      expect(contract?.kind, slotId).toBe('closed')
      expect(contract?.slotId, slotId).toBe(slotId)
      // Derselbe Katalog — es gibt nicht zwei Mengen von Archetypen.
      expect(contract!.kind === 'closed' && contract.options, slotId).toBe(BRAND_ARCHETYPES)
      expect(slotById(slotId)?.schema.kind, slotId).toBe('choice')
    }
    // Die Rückfrage ist eine ANDERE, weil die Frage eine andere ist.
    expect(brandChoiceFallbackQuestion(brandChoiceContract('d.primary')!, 'de'))
      .not.toBe(brandChoiceFallbackQuestion(brandChoiceContract('d.secondary')!, 'de'))
  })

  it('ein Slot ohne Vertrag bekommt keinen erfunden', () => {
    // `c.final` ist eine Auswahl AUS den Kandidaten — die Menge entsteht zur
    // Laufzeit und kann hier gar nicht stehen.
    expect(brandChoiceContract('c.final')).toBeNull()
    expect(brandChoiceContract('a.pitch')).toBeNull()
  })
})

describe('Die vier Architektur-Modelle (Content-Spec §5a)', () => {
  const contract = brandChoiceContract('b2.model')!

  it('sind genau vier, mit stabilen Ids', () => {
    expect(BRAND_ARCHITECTURE_MODELS.map(option => option.id)).toEqual([
      'branded-house', 'sub-brands', 'endorsed', 'house-of-brands',
    ])
  })

  it('DIE PROMPT-REGEL NENNT JEDE OPTION WÖRTLICH — Id, Name und Wirkung', () => {
    const rule = brandChoicePromptRule(contract).join('\n')
    for (const option of BRAND_ARCHITECTURE_MODELS) {
      expect(rule, option.id).toContain(option.id)
      expect(rule, option.id).toContain(option.label)
      expect(rule, option.id).toContain(option.hint)
    }
    expect(rule).toContain('EXACTLY ONE of these ids')
    // Die drei plausiblen Ausweichmanöver stehen ausdrücklich zu.
    expect(rule).toContain('Do not invent a fifth model, do not combine two, do not write a "hybrid"')
    // Die Begründung gehört in den ZUG, nicht ins Feld.
    expect(rule).toContain('belongs in the BASIS line of your turn, never in the field')
  })

  it('NIMMT DIE ID UND NIMMT DEN NAMEN — gespeichert wird immer die Id', () => {
    expect(checkBrandChoiceDraft(contract, 'house-of-brands')).toEqual({ ok: true, value: 'house-of-brands' })
    expect(checkBrandChoiceDraft(contract, 'House of Brands')).toEqual({ ok: true, value: 'house-of-brands' })
    // Und durch den üblichen Modell-Beifang hindurch.
    expect(checkBrandChoiceDraft(contract, '  "Branded House."  ')).toEqual({ ok: true, value: 'branded-house' })
    expect(checkBrandChoiceDraft(contract, '- endorsed')).toEqual({ ok: true, value: 'endorsed' })
  })

  it('WEIST AB, was nicht in der Menge steht', () => {
    for (const draft of ['hybrid', 'Branded House of Brands', 'Es kommt darauf an.', '']) {
      expect(checkBrandChoiceDraft(contract, draft), draft)
        .toEqual({ ok: false, violation: 'not_an_option' })
    }
  })

  it('ZWEI MODELLE SIND KEINE ENTSCHEIDUNG', () => {
    expect(checkBrandChoiceDraft(contract, 'branded-house\nsub-brands'))
      .toEqual({ ok: false, violation: 'not_an_option' })
  })

  it('EIN ABSATZ IM AUSWAHL-FELD IST EIN VERSTOSS, kein langer Wert', () => {
    expect(checkBrandChoiceDraft(contract, 'Sub-Brands\nDenn eure Produkte tragen eigene Namen.'))
      .toEqual({ ok: false, violation: 'not_an_option' })
  })
})

/**
 * DIE ZWÖLF ARCHETYPEN (Content-Spec §12.1).
 *
 * INTERIM bis zum Paarvergleich-Instrument (§12.2) — Davids Entscheidung
 * 2026-09-04: George leitet Primär und Sekundär im GESPRÄCH her statt sie zu
 * BERECHNEN. Der KATALOG hier ist davon nicht betroffen: er sagt nur, was in
 * dem Feld stehen darf, und das Instrument wird dieselben zwölf Ids benutzen.
 * Was er festhält, ist deshalb die dauerhafte Zusage — die stabilen Ids, an
 * denen später Manifest, Taglines und die Themes-Richtung hängen.
 */
describe('Die zwölf Archetypen (Content-Spec §12.1)', () => {
  const contract = brandChoiceContract('d.primary')!

  it('sind genau zwölf, mit stabilen Ids in der Reihenfolge der Spec-Tabelle', () => {
    expect(BRAND_ARCHETYPES.map(option => option.id)).toEqual([
      'sage', 'explorer', 'creator', 'caregiver', 'ruler', 'innocent',
      'citizen', 'jester', 'lover', 'hero', 'magician', 'rebel',
    ])
  })

  it('DIE IDS SIND SPRACHNEUTRAL — kein Artikel, kein deutscher Name', () => {
    for (const option of BRAND_ARCHETYPES) {
      expect(option.id, option.id).toMatch(/^[a-z]+$/)
      expect(option.id, option.id).not.toContain('der')
    }
  })

  it('tragen beide Sprachen — deutscher Name gegen englischen', () => {
    expect(BRAND_ARCHETYPES.map(option => option.display.de)).toEqual([
      'Der Weise', 'Der Entdecker', 'Der Schöpfer', 'Der Fürsorgliche', 'Der Herrscher',
      'Der Unschuldige', 'Der Jedermann', 'Der Narr', 'Die Liebende', 'Der Held',
      'Der Magier', 'Der Rebell',
    ])
    for (const option of BRAND_ARCHETYPES) {
      expect(option.display.en, option.id).toBe(option.label)
      expect(option.display.de, option.id).not.toBe(option.display.en)
      // Der Halbsatz im Prompt ist die STIMMUNG, an der man unterscheidet.
      expect(option.hint.length, option.id).toBeGreaterThan(20)
    }
  })

  it('DIE PROMPT-REGEL NENNT JEDEN ARCHETYP WÖRTLICH — und die Ausweichmanöver', () => {
    const rule = brandChoicePromptRule(contract).join('\n')
    for (const option of BRAND_ARCHETYPES) {
      expect(rule, option.id).toContain(option.id)
      expect(rule, option.id).toContain(option.label)
      expect(rule, option.id).toContain(option.hint)
    }
    expect(rule).toContain('EXACTLY ONE of these ids')
    // Die Menge ist zwölf, nicht vier — der Satz aus b2 wäre hier schlicht falsch.
    expect(rule).toContain('Do not invent a thirteenth archetype')
    expect(rule).not.toContain('fifth model')
    expect(rule).toContain('belongs in the BASIS line of your turn, never in the field')
  })

  it('DER SEKUNDÄRE BEKOMMT SEINEN EIGENEN VERBOTSSATZ — nie derselbe wie der primäre', () => {
    const secondary = brandChoicePromptRule(brandChoiceContract('d.secondary')!).join('\n')
    expect(secondary).toContain('do not repeat the primary archetype')
    // GEGENPROBE: dieser Satz steht NICHT im primären — dort gibt es nichts zu
    // wiederholen, und das Feld danach ist ausdrücklich das zweite.
    expect(brandChoicePromptRule(contract).join('\n')).not.toContain('do not repeat the primary')
  })

  it('NIMMT DIE ID UND NIMMT DEN NAMEN — gespeichert wird immer die Id', () => {
    expect(checkBrandChoiceDraft(contract, 'sage')).toEqual({ ok: true, value: 'sage' })
    expect(checkBrandChoiceDraft(contract, 'The Sage')).toEqual({ ok: true, value: 'sage' })
    expect(checkBrandChoiceDraft(contract, '- "The Magician."')).toEqual({ ok: true, value: 'magician' })
  })

  it('WEIST AB, was nicht in der Menge steht', () => {
    // Der deutsche Name ist bewusst KEIN gültiger Entwurf: das Feld ist
    // Dokument-Inhalt in der stabilen Id, und die Instruktion verlangt sie.
    for (const draft of ['Der Weise', 'The Wise One', 'Sage und Creator', 'Es kommt darauf an.', '']) {
      expect(checkBrandChoiceDraft(contract, draft), draft)
        .toEqual({ ok: false, violation: 'not_an_option' })
    }
  })

  it('ZWEI ARCHETYPEN SIND KEINE ENTSCHEIDUNG', () => {
    expect(checkBrandChoiceDraft(contract, 'sage\ncreator'))
      .toEqual({ ok: false, violation: 'not_an_option' })
  })

  it('DIE RÜCKFRAGE IST EINE FRAGE, in der Sprache der Oberfläche', () => {
    for (const slotId of ['d.primary', 'd.secondary']) {
      const each = brandChoiceContract(slotId)!
      expect(brandChoiceFallbackQuestion(each, 'de'), slotId).toContain('?')
      expect(brandChoiceFallbackQuestion(each, 'en'), slotId).toContain('?')
      expect(brandChoiceFallbackQuestion(each, 'fr'), slotId).toBe(brandChoiceFallbackQuestion(each, 'en'))
    }
    expect(brandChoiceFallbackQuestion(contract, 'de')).toContain('Archetyp')
    expect(brandChoiceFallbackQuestion(contract, 'en')).toContain('archetype')
  })

  it('DIE ANZEIGE LÖST BEIDE SLOTS AUF — eine rohe Id sieht aus wie ein Leck', () => {
    for (const slotId of ['d.primary', 'd.secondary']) {
      expect(brandChoiceDisplayLabel(slotId, 'sage', 'de'), slotId).toBe('Der Weise')
      expect(brandChoiceDisplayLabel(slotId, 'sage', 'en'), slotId).toBe('The Sage')
    }
    // GEGENPROBE: ein unbekannter Wert geht unverändert durch (Alt-Bestand,
    // ein von Hand korrigierter Slot) — verschwinden wäre der schlimmere Fehler.
    expect(brandChoiceDisplayLabel('d.primary', 'wanderer', 'de')).toBe('wanderer')
  })

  /**
   * DER WÄCHTER FÜR DIE FEHLENDE KARTEN-COPY.
   *
   * Die zwölf `copyKey`s zeigen heute bewusst ins Leere: gerendert wird
   * Karten-Copy nur für einen Slot mit `editor: 'cards'`, und die Karten dieses
   * Bausteins gehören dem Paarvergleich-Instrument (§12.1), das eine ANDERE
   * Dreiheit zeigt (Motto · Stimmung · „wie …"). Copy zu erfinden, bevor die
   * Form entschieden ist, legte die Form fest.
   *
   * Damit das eine Entscheidung bleibt und kein Loch: kippt einer der beiden
   * Slots je auf `cards`, wird dieser Test rot — und die Werkstatt hätte sonst
   * wörtlich `brand.choice.archetype.sage.label` auf die Karte geschrieben.
   */
  it('KEINE KARTEN-COPY, SOLANGE ES KEINE KARTEN GIBT', () => {
    for (const slotId of ['d.primary', 'd.secondary']) {
      expect(slotById(slotId)?.editor, slotId).toBe('none')
    }
    for (const option of BRAND_ARCHETYPES) {
      expect(option.copyKey, option.id).toBe(`brand.choice.archetype.${option.id}`)
    }
  })
})

describe('Die Positionierungs-Kategorie ist offen — aber ein Etikett', () => {
  const contract = brandChoiceContract('b.positioningCategory')!

  it('DIE PROMPT-REGEL VERLANGT EIN ETIKETT, keinen Satz', () => {
    const rule = brandChoicePromptRule(contract).join('\n')
    expect(rule).toContain('CATEGORY LABEL, not a sentence')
    expect(rule).toContain('at most 6 words')
    expect(rule).toContain('no full stop')
    // Es gibt bewusst KEINE Liste: die Kategorie gehört dieser Marke.
    expect(rule).not.toContain('EXACTLY ONE of these ids')
  })

  it('nimmt eine Kategorie und lässt den Schlusspunkt fallen', () => {
    expect(checkBrandChoiceDraft(contract, 'Spezialitätenkaffee für Cafés.'))
      .toEqual({ ok: true, value: 'Spezialitätenkaffee für Cafés' })
  })

  it('WEIST EINEN SATZ AB — sechs Wörter sind die Grenze', () => {
    expect(checkBrandChoiceDraft(contract, 'Wir sind die erste Adresse für Spezialitätenkaffee auf Maui'))
      .toEqual({ ok: false, violation: 'not_a_label' })
    expect(checkBrandChoiceDraft(contract, '')).toEqual({ ok: false, violation: 'not_a_label' })
  })

  it('sechs Wörter gehen noch, sieben nicht — die Grenze liegt, wo sie steht', () => {
    expect(checkBrandChoiceDraft(contract, 'eins zwei drei vier fünf sechs').ok).toBe(true)
    expect(checkBrandChoiceDraft(contract, 'eins zwei drei vier fünf sechs sieben').ok).toBe(false)
  })
})

describe('Die Rückfrage bei einem Verstoss', () => {
  it('spricht die Sprache der OBERFLÄCHE, nicht die der Marke', () => {
    const contract = brandChoiceContract('b2.model')!
    expect(brandChoiceFallbackQuestion(contract, 'de')).toContain('Architektur-Modell')
    expect(brandChoiceFallbackQuestion(contract, 'en')).toContain('architecture model')
    // Alles, was nicht mit `de` beginnt, bekommt Englisch (Konvention wie
    // `advisorOpenersFor`).
    expect(brandChoiceFallbackQuestion(contract, 'fr')).toBe(brandChoiceFallbackQuestion(contract, 'en'))
  })

  it('IST EINE FRAGE, keine Fehlermeldung', () => {
    for (const slotId of ['b2.model', 'b.positioningCategory']) {
      const contract = brandChoiceContract(slotId)!
      for (const locale of ['de', 'en']) {
        expect(brandChoiceFallbackQuestion(contract, locale), `${slotId}/${locale}`).toContain('?')
      }
    }
  })
})

/**
 * DIE ANZEIGE EINER GESPEICHERTEN AUSWAHL (P4).
 *
 * Gespeichert bleibt die stabile Id — sie ist die Zusage an Prompt, Dokument
 * und jede spätere Ableitung. Angezeigt wird sie nie: `branded-house` in einer
 * Log-Karte sieht aus wie ein Datenbank-Leck, und geklickt hat der Mensch auf
 * einer Karte „Branded House".
 *
 * Bewiesen wird deshalb BEIDES: dass der Name kommt, wo einer existiert — und
 * dass der WERT UNVERÄNDERT durchgeht, wo keiner existiert. Der zweite Teil
 * ist der wichtigere: ein Rückfall auf „—" oder auf eine leere Zeile würde
 * einen vorhandenen Wert verschwinden lassen, und niemand würde es merken.
 */
describe('Was der Mensch statt der rohen Id liest', () => {
  it('löst jede der vier Ids in ihren Namen auf, in beiden Sprachen', () => {
    for (const option of BRAND_ARCHITECTURE_MODELS) {
      expect(brandChoiceDisplayLabel('b2.model', option.id, 'de'), option.id).toBe(option.display.de)
      expect(brandChoiceDisplayLabel('b2.model', option.id, 'en'), option.id).toBe(option.display.en)
    }
    expect(brandChoiceDisplayLabel('b2.model', 'branded-house', 'de')).toBe('Branded House')
  })

  it('folgt derselben Sprach-Konvention wie die Rückfrage', () => {
    expect(brandChoiceDisplayLabel('b2.model', 'endorsed', 'de-DE')).toBe('Endorsed Brands')
    expect(brandChoiceDisplayLabel('b2.model', 'endorsed', 'fr'))
      .toBe(brandChoiceDisplayLabel('b2.model', 'endorsed', 'en'))
    // Ohne Angabe gilt Englisch — dieselbe Voreinstellung wie sonst.
    expect(brandChoiceDisplayLabel('b2.model', 'endorsed')).toBe('Endorsed Brands')
  })

  it('GEGENPROBE 1: eine UNBEKANNTE Id geht unverändert durch', () => {
    // Alt-Bestand aus der Zeit des Textfelds, ein von Hand korrigierter Slot,
    // ein „Hybrid", der es doch einmal hineingeschafft hat: der Wert bleibt
    // sichtbar. Verschwinden wäre der schlimmere Fehler.
    expect(brandChoiceDisplayLabel('b2.model', 'hybrid', 'de')).toBe('hybrid')
    expect(brandChoiceDisplayLabel('b2.model', 'Branded House', 'de')).toBe('Branded House')
    expect(brandChoiceDisplayLabel('b2.model', '', 'de')).toBe('')
  })

  it('GEGENPROBE 2: ein OFFENER Slot und ein Slot ohne Vertrag bleiben unangetastet', () => {
    // `b.positioningCategory` ist eine Auswahl OHNE Menge — dort IST der Text
    // die Antwort, und ein Nachschlagen hätte gar nichts nachzuschlagen.
    expect(brandChoiceDisplayLabel('b.positioningCategory', 'branded-house', 'de')).toBe('branded-house')
    expect(brandChoiceDisplayLabel('a.pitch', 'branded-house', 'de')).toBe('branded-house')
    expect(brandChoiceDisplayLabel('c.final', 'Mut, Klarheit', 'en')).toBe('Mut, Klarheit')
  })

  it('DIE KARTEN-COPY HÄNGT AM VERTRAG — Katalog und Vertrag nennen denselben Namen', () => {
    // Die Karten rendern Titel, Wirkung und Beispiel aus dem i18n-Katalog, die
    // Log-Karte den Namen aus dem Vertrag. Laufen die beiden Namen
    // auseinander, klickt der Mensch auf „X" und liest hinterher „Y" — genau
    // die Sorte Bruch, die kein Typecheck sieht.
    const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'i18n', 'locales')
    for (const locale of ['de', 'en'] as const) {
      const catalog = JSON.parse(readFileSync(join(localesDir, `${locale}.json`), 'utf8')) as Record<string, unknown>
      // BEIDE Karten-Verträge: die vier Architektur-Modelle und die zwei Wege
      // der Weiche `g.source` (Brand Design D2a). Sie stehen zusammen hier,
      // weil beide `editor: 'cards'` tragen und dieselbe Copy-Dreiheit
      // rendern — ein zweiter Test daneben wäre dieselbe Prüfung zweimal.
      for (const option of [...BRAND_ARCHITECTURE_MODELS, ...BRAND_DNA_SOURCES]) {
        const copy = option.copyKey.split('.').reduce<unknown>(
          (node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined),
          catalog,
        ) as { label?: string, hint?: string, example?: string } | undefined
        expect(copy, `${locale}/${option.copyKey}`).toBeTruthy()
        expect(copy!.label, `${locale}/${option.id}`).toBe(option.display[locale])
        expect(copy!.hint?.length, `${locale}/${option.id}`).toBeGreaterThan(0)
        expect(copy!.example?.length, `${locale}/${option.id}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('swapBrandChoiceValueLine — die Wert-Zeile spricht die Sprache der Seite', () => {
  it('tauscht die rohe Id einer Standalone-Zeile gegen die Anzeige', () => {
    const message = 'BASIS-Satz bleibt.\n\nsage\n\nPasst das?'
    expect(swapBrandChoiceValueLine('d.primary', message, 'de'))
      .toBe('BASIS-Satz bleibt.\n\nDer Weise\n\nPasst das?')
  })

  it('tauscht auch das Label — dieselbe Prüfung wie beim Feldwert', () => {
    expect(swapBrandChoiceValueLine('d.primary', 'The Sage', 'de')).toBe('Der Weise')
  })

  it('lässt Prosa-Sätze unangetastet — nur ganze Zeilen sind Werte', () => {
    const message = 'Ihr klingt wie der sage Kern eurer Branche.'
    expect(swapBrandChoiceValueLine('d.primary', message, 'de')).toBe(message)
  })

  it('ohne Vertrag ist der Aufruf ein No-op', () => {
    expect(swapBrandChoiceValueLine('a.pitch', 'sage', 'de')).toBe('sage')
  })
})

describe('Die Auswahl-Sessions von Brand Design (D8)', () => {
  /**
   * DER NEBENBEFUND AUS D7: „rohe Katalog-Ids (`snappy`, `yes`) als
   * Antworttext im Gespräch". Ohne Vertrag ist die Anzeige eines Wertes der
   * Wert selbst — dieser Block ist die Gegenprobe dazu.
   */
  const CASES: readonly [string, string, string][] = [
    ['i.pair', 'editorial', 'Redaktionell'],
    ['i.scale', 'loud', 'Plakativ'],
    ['j.kind', 'word', 'Wortmarke'],
    ['j.pick', 'monogram', 'Monogramm'],
    ['k.illustration', 'line', 'Linie'],
    ['k.icons', 'bold', 'Kräftig'],
    ['l.tempo', 'snappy', 'Knapp'],
    ['l.logo', 'yes', 'Ja — kinetisches Zeichen'],
  ]

  it('löst jede gespeicherte Id in eine Lesefassung auf', () => {
    for (const [slotId, stored, display] of CASES) {
      expect(brandChoiceDisplayLabel(slotId, stored, 'de'), slotId).toBe(display)
      // Englisch muss ETWAS anderes als die Id sein — welcher Text, sagt der
      // Katalog; hier zählt nur, dass keine Id durchrutscht.
      expect(brandChoiceDisplayLabel(slotId, stored, 'en'), slotId).not.toBe(stored)
    }
  })

  it('kennt die Menge und weist alles andere ab', () => {
    for (const [slotId] of CASES) {
      const contract = brandChoiceContract(slotId)
      expect(contract?.kind, slotId).toBe('closed')
      expect(checkBrandChoiceDraft(contract!, 'irgendwas Erfundenes').ok, slotId).toBe(false)
    }
  })

  it('tauscht die Id auch in einer Sprechblase', () => {
    expect(swapBrandChoiceValueLine('l.tempo', 'BASIS-Satz.\n\nsnappy', 'de'))
      .toBe('BASIS-Satz.\n\nKnapp')
  })

  it('lässt einen unbekannten Alt-Wert stehen, statt ihn zu verschlucken', () => {
    expect(brandChoiceDisplayLabel('l.tempo', 'zügig', 'de')).toBe('zügig')
  })

  it('steht in der Liste der Slots mit eigener Bühne — sonst gäbe es doppelte Karten', () => {
    for (const [slotId] of CASES) {
      expect(BRAND_STAGE_CHOICE_SLOTS, slotId).toContain(slotId)
    }
    // Die zwei Vorgänger stehen weiterhin darin (G4 und D2c).
    expect(BRAND_STAGE_CHOICE_SLOTS).toContain('result.direction')
    expect(BRAND_STAGE_CHOICE_SLOTS).toContain('g.board')
  })

  it('nennt für jede Session eine Rückfrage in beiden Sprachen', () => {
    for (const [slotId] of CASES) {
      const contract = brandChoiceContract(slotId)!
      expect(brandChoiceFallbackQuestion(contract, 'de').length, slotId).toBeGreaterThan(10)
      expect(brandChoiceFallbackQuestion(contract, 'en').length, slotId).toBeGreaterThan(10)
      // Die Prompt-Regel zählt die Ids auf — sonst rät ein Modell.
      expect(brandChoicePromptRule(contract).join(' '), slotId).toContain('EXACTLY ONE')
    }
  })
})
