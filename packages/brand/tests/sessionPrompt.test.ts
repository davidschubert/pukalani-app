import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { BrandSlotInstructionOptions } from '../server/utils/georgePrompt'
import { sessionInstruction, sessionInstructionForSlot } from '../server/utils/sessionPrompt'
import {
  BRAND_SLOTS,
  type BrandPathKind,
  dependencyClosure,
  slotById,
} from '../shared/slotRegistry'

/**
 * DER BAUER LIEFERT DENSELBEN TEXT WIE DIE VIER VORGÄNGER (BW2 Paket 1).
 *
 * ── WARUM EIN FIXTURE UND KEIN NACHGEBAUTER ERWARTUNGSWERT ────────────────
 * `tests/fixtures/slotInstructions.before.json` wurde VOR dem Umbau erzeugt —
 * mit `contextSlotInstruction`, `veraSlotInstruction`, `miloSlotInstruction`
 * und `archetypeSlotInstruction`, die es jetzt nicht mehr gibt. Ein
 * Erwartungswert, den man aus derselben Quelle ableitet, die man prüft, ist
 * eine Tautologie und immer grün (Beweis-Regel, CLAUDE.md); dieses Fixture ist
 * die einzige Fassung des alten Verhaltens, die noch existiert.
 *
 * 21 Sessions × 2 Fassungen: einmal Gründer-Pfad ohne Zusatzmaterial, einmal
 * Relaunch MIT Quell-Werten, Wunsch, Website-Text und Gesprächs-Verlauf —
 * damit jeder bedingte Zweig des Fundaments (`brandSlotInstructionTail`)
 * einmal in beiden Richtungen gelaufen ist.
 *
 * ── WAS PAKET 2 AN DIESEM BEWEIS GEÄNDERT HAT ────────────────────────────
 * Bis Paket 1 prüfte diese Datei ZWEIERLEI: die Zeilen-Deckung („jede
 * nicht-leere Zeile von damals kommt heute vor") UND die ZEICHENGLEICHHEIT.
 * Die zweite ist mit Paket 2 gefallen, und zwar absichtlich: die
 * Session-Inhalte (Qualitätsmerkmale, Anti-Muster, Beispiele, Leiter, Form)
 * kommen als eigene Abschnitte HINZU, der Prompt ist also länger als der von
 * damals. Genau deshalb sind in Paket 2 alle vier Prompt-Fassungen gestiegen
 * (`george-a-12`, `vera-b-3`, `milo-c-3`, `george-archetype-3`) — die
 * Zeichengleichheit war die Begründung dafür, dass sie es in Paket 1 NICHT
 * mussten, und mit ihrem Wegfall übernimmt die Fassung diese Aufgabe.
 *
 * Die Zeilen-Deckung BLEIBT und ist die eigentliche Zusage des Plans: keine
 * Verarbeitungsregel darf beim Inhalts-Paket verlorengehen. Ausgenommen ist
 * die `TASK:`-Zeile — die Ziele durften geschärft werden (Plan §15, Paket 2:
 * „Platzhalter-Ziele … Paket 2 tauscht sie gegen die abgenommenen").
 *
 * Das Fixture bleibt als Beweis liegen; dazu prüft `Der Bauer selbst`, dass
 * jede Session mit Entwurfs-Auftrag ihre neuen Abschnitte auch WIRKLICH trägt
 * — sonst wäre eine leere `quality`-Liste hier grün.
 */

const HERE = dirname(fileURLToPath(import.meta.url))

const BEFORE: Record<string, string> = JSON.parse(
  readFileSync(resolve(HERE, 'fixtures/slotInstructions.before.json'), 'utf8'),
) as Record<string, string>

/** Exakt die Optionen, mit denen das Fixture erzeugt wurde. */
function optionsFor(slotId: string, pathKind: BrandPathKind, full: boolean): BrandSlotInstructionOptions {
  const slot = slotById(slotId)!
  return {
    dependencies: full
      ? dependencyClosure(slotId).map(id => ({ slotId: id, value: `value of ${id}`, label: `Label ${id}` }))
      : [],
    hint: full ? 'wärmer' : '',
    pathKind,
    maxLength: slot.maxLength,
    kind: slot.schema.kind,
    hasSiteAnalysis: full,
    hasConversation: full,
  }
}

function rebuild(key: string): string {
  const [slotId, pathKind, variant] = key.split('|') as [string, BrandPathKind, string]
  return sessionInstructionForSlot(slotId, optionsFor(slotId, pathKind, variant === 'full'))
}

/** Die eine Zeile, die eine LISTE von Feld-Ids aufzählt (`georgePrompt.ts`). */
const INPUT_FIELDS_LINE = 'Your inputs are the fields: '

/**
 * DIE EINE ZEILE, DEREN REIHENFOLGE NICHTS BEDEUTET.
 *
 * `Your inputs are the fields: a, b, c.` zählt die Abhängigkeits-Hülle auf, und
 * die kommt in KATALOG-Reihenfolge (`dependencyClosure`). Davids Gruppen-Umbau
 * vom 2026-09-09 hat genau diese Reihenfolge geändert — die Fragen eines
 * Kapitels stehen jetzt vor seinen Ableitungen —, an der MENGE aber nichts.
 * Verglichen wird deshalb die Menge: eine fehlende Quelle fällt weiter auf,
 * eine getauschte Position nicht mehr. Alle anderen Zeilen bleiben
 * zeichengleich, sie tragen Regeln und keine Aufzählung.
 */
function normalize(line: string): string {
  const trimmed = line.trim()
  if (!trimmed.startsWith(INPUT_FIELDS_LINE)) return trimmed
  const fields = trimmed.slice(INPUT_FIELDS_LINE.length).replace(/\.$/, '').split(', ')
  return `${INPUT_FIELDS_LINE}${[...fields].sort().join(', ')}.`
}

describe('Inhaltsgleichheit mit den vier Vorgänger-Tabellen', () => {
  it('das Fixture deckt genau die 21 Sessions mit Entwurfs-Auftrag ab', () => {
    const ids = [...new Set(Object.keys(BEFORE).map(key => key.split('|')[0]!))]
    // Ohne diese Zeile wäre der Test grün, sobald jemand das Fixture leert.
    expect(ids).toEqual([
      'a.pitch', 'a.category', 'a.competitors', 'a.audienceSketch', 'a.toneAnalysis',
      'b.whyStarted', 'b.purpose', 'b.vision', 'b.mission', 'b.positioningCategory',
      'b2.model', 'b2.rule',
      'c.candidates', 'c.definitions',
      'd.hypothesis', 'd.primary', 'd.secondary', 'd.gapReveal',
      'd.voiceSamples', 'd.toneWords', 'd.vocabulary',
    ])
    expect(Object.keys(BEFORE).length).toBe(42)
  })

  it.each(Object.keys(BEFORE))('%s: jede alte Zeile ausser TASK steht auch im neuen Prompt', (key) => {
    const after = rebuild(key)
    const lines = new Set(after.split('\n').map(normalize))
    for (const line of BEFORE[key]!.split('\n')) {
      if (!line.trim()) continue
      // Die TASK-Zeile trägt das ZIEL, und das durfte Paket 2 schärfen.
      if (line.startsWith('TASK: ')) continue
      expect(lines, line).toContain(normalize(line))
    }
  })

  it.each(Object.keys(BEFORE))('%s: und der Prompt ist gewachsen, nicht geschrumpft', (key) => {
    // Die Gegenrichtung der Deckung: Paket 2 legt Abschnitte DAZU. Ein Prompt,
    // der kürzer geworden ist, hat etwas verloren — auch wenn jede geprüfte
    // Zeile noch vorkommt (eine Regel kann in eine andere gerutscht sein).
    expect(rebuild(key).length).toBeGreaterThan(BEFORE[key]!.length)
  })

  /**
   * DIE GEGENPROBE: ohne sie prüfte der Vergleich oben nur, dass zwei
   * Zeichenketten gleich sind — auch dann, wenn beide leer wären.
   */
  it('eine veränderte Verarbeitungsregel WÜRDE auffallen', () => {
    const config = slotById('a.pitch')!
    const mutated = {
      ...config,
      processing: { ...config.processing, rules: ['Do something else entirely.'] },
    }
    const text = sessionInstruction(mutated, optionsFor('a.pitch', 'new', false))
    const lines = new Set(text.split('\n').map(line => line.trim()))
    // Die echte Regel ist WEG — genau das soll die Deckungsprüfung sehen.
    expect(lines).not.toContain(config.processing.rules[0]!.trim())
    expect(text).toContain('Do something else entirely.')
  })
})

describe('Der Bauer selbst', () => {
  it('setzt das Ziel als TASK-Zeile an den Anfang', () => {
    const config = slotById('b.purpose')!
    const text = sessionInstruction(config, optionsFor('b.purpose', 'new', false))
    expect(text.split('\n')[0]).toBe(`TASK: ${config.goal}`)
  })

  it('nimmt NUR die Pfad-Regeln des angefragten Pfades', () => {
    const neu = sessionInstructionForSlot('d.gapReveal', optionsFor('d.gapReveal', 'new', false))
    const relaunch = sessionInstructionForSlot('d.gapReveal', optionsFor('d.gapReveal', 'relaunch', false))
    expect(neu).toContain('there may be almost no outside image yet')
    expect(neu).not.toContain('years of accumulated decisions')
    expect(relaunch).toContain('years of accumulated decisions')
    expect(relaunch).not.toContain('there may be almost no outside image yet')
  })

  it('wählt die primäre Quelle mechanisch: Startkarte nur ohne Slot-Eingaben', () => {
    expect(sessionInstructionForSlot('a.pitch', optionsFor('a.pitch', 'new', false)))
      .toContain('Your primary source is the start card')
    expect(sessionInstructionForSlot('b.purpose', optionsFor('b.purpose', 'new', false)))
      .toContain('Your primary source are the answers')
  })

  it('trägt die legale Menge einer Auswahl in den Prompt', () => {
    // `b2.model` hat einen geschlossenen Vertrag, `b2.rule` nicht.
    expect(sessionInstructionForSlot('b2.model', optionsFor('b2.model', 'new', false)))
      .toContain('house-of-brands')
    expect(sessionInstructionForSlot('b2.rule', optionsFor('b2.rule', 'new', false)))
      .not.toContain('house-of-brands')
  })

  it('lässt leere Abschnitte weg — bei einem Entwurf ist das die Leiter', () => {
    // `a.pitch` ist eine ABLEITUNG: dort fragt niemand, also hat sie keine
    // Leiter (Registry-Regel seit Paket 2) und der Abschnitt fehlt ganz.
    const text = sessionInstructionForSlot('a.pitch', optionsFor('a.pitch', 'new', false))
    expect(text).not.toContain('How to lead this session:')
    expect(text).toContain('Marks of a good value:')
  })

  it('gibt JEDER Session mit Entwurfs-Auftrag Qualität und ein Beispiel', () => {
    // Ohne diese Prüfung wäre die Zeilen-Deckung oben auch dann grün, wenn
    // Paket 2 die Inhalte nie in den Prompt gebracht hätte.
    const drafting = BRAND_SLOTS.filter(session =>
      session.generator !== 'none' && session.processing.rules.length > 0)
    expect(drafting).toHaveLength(23)
    for (const session of drafting) {
      const text = sessionInstructionForSlot(session.id, optionsFor(session.id, 'new', false))
      expect(text, session.id).toContain('Marks of a good value:')
      expect(text, session.id).toContain('Never accept:')
      expect(text, session.id).toContain('Examples of the FORM only')
    }
  })

  it('nimmt die Beispiele der INHALTSSPRACHE — und ohne Angabe die englischen', () => {
    const german = sessionInstructionForSlot('b.purpose', {
      ...optionsFor('b.purpose', 'new', false),
      contentLocale: 'de',
    })
    const english = sessionInstructionForSlot('b.purpose', {
      ...optionsFor('b.purpose', 'new', false),
      contentLocale: 'en',
    })
    const withoutLocale = sessionInstructionForSlot('b.purpose', optionsFor('b.purpose', 'new', false))
    const purpose = slotById('b.purpose')!
    expect(german).toContain(purpose.examples.new.de[0]!)
    expect(german).not.toContain(purpose.examples.new.en[0]!)
    expect(english).toContain(purpose.examples.new.en[0]!)
    expect(withoutLocale).toBe(english)
  })

  it('schreibt Qualität, Anti-Muster, Beispiele, Leiter und Form, sobald es sie gibt', () => {
    const config = slotById('a.pitch')!
    const text = sessionInstruction({
      ...config,
      quality: ['one sentence'],
      antiPatterns: ['a feature list'],
      examples: {
        new: { de: ['Nur auf Deutsch'], en: ['A pitch from another industry'] },
        relaunch: { de: ['Nie auf diesem Pfad'], en: ['Never shown on this path'] },
      },
      ladder: { opening: 'their own words', probes: ['what changed?'], reframes: ['ask for the moment'] },
      form: { person: 'we', tense: 'present', maxWords: 20, forbidden: ['the brand name'] },
    }, optionsFor('a.pitch', 'new', false))

    expect(text).toContain('Marks of a good value:\n- one sentence')
    expect(text).toContain('Never accept:\n- a feature list')
    expect(text).toContain('- A pitch from another industry')
    expect(text).not.toContain('Never shown on this path')
    expect(text).not.toContain('Nur auf Deutsch')
    expect(text).toContain('Open with: their own words')
    expect(text).toContain('If the answer is thin, ask: what changed?')
    expect(text).toContain('If it falls into a known trap: ask for the moment')
    expect(text).toContain('Write it in the first person plural ("we").')
    expect(text).toContain('At most 20 words.')
    expect(text).toContain('Never in this value: the brand name.')
  })

  it('wirft für jede Session ohne Entwurfs-Auftrag — und für keine mit', () => {
    for (const session of BRAND_SLOTS) {
      const hasTask = session.generator !== 'none' && session.processing.rules.length > 0
      const call = () => sessionInstructionForSlot(session.id, optionsFor(session.id, 'new', false))
      if (hasTask) expect(call, session.id).not.toThrow()
      else expect(call, session.id).toThrow(new RegExp(session.id.replace('.', '\\.')))
    }
  })
})
