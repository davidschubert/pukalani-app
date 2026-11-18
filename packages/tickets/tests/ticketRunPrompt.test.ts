import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseTicketChecklist } from '../shared/ticketChecklist'
import { buildTicketRunPrompt } from '../shared/ticketRunPrompt'
import { TRIAGE_MARKER } from '../shared/triageBlock'
import type { TicketChecklistItem } from '../shared/types/ticket'

/**
 * DER AUFTRAGSTEXT FÜR DEN AI-RUNNER (RU1 b).
 *
 * Diese Funktion bestimmt, was ein Agent als Auftrag liest. Der Umzug aus der
 * Komponente `apps/control/…/TicketModalRunner.vue` nach `shared/` darf den
 * Text nicht ändern — für dasselbe Ticket muss er Zeichen für Zeichen gleich
 * sein. Drei Netze:
 *
 *  1. Der WORTLAUT je Fall steht ausgeschrieben hier (kein Schnappschuss, den
 *     man mit einem Schalter neu schreibt).
 *  2. Der VERGLEICH mit der alten Fassung: `legacyPrompt` unten ist die
 *     Funktion, wie sie bis zum 2026-11-18 in der Komponente stand, samt dem
 *     alten Browser-Leser der Checkliste. Sie bleibt als Referenz stehen.
 *  3. EINE FASSUNG: weder der Browser noch der Server haben noch eine eigene
 *     Kopie des Lesers oder des Zusammenbaus.
 */

interface Sample { title: string, description: string, checklist: string }

function ticket(overrides: Partial<Sample> = {}): Sample {
  return { title: 'Knopf ohne Beschriftung', description: '', checklist: '', ...overrides }
}

/** Die alte Fassung, unverändert übernommen (Referenz für den Vergleich). */
function legacyParseChecklist(raw: string): TicketChecklistItem[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  }
  catch {
    return []
  }
}
function legacyStripTriageBlock(description: string): string {
  return description.split('\n\n---\n\n**🤖 KI-Triage')[0] ?? ''
}
function legacyPrompt(sample: Sample): string {
  const lines: string[] = [`# ${sample.title}`, '']

  const description = legacyStripTriageBlock(sample.description).trim()
  if (description) lines.push(description, '')

  const open = legacyParseChecklist(sample.checklist).filter(item => !item.done)
  if (open.length) {
    lines.push('## Checkliste', '')
    for (const item of open) lines.push(`- [ ] ${item.text}`)
    lines.push('')
  }

  return lines.join('\n')
}

const checklist = (items: TicketChecklistItem[]) => JSON.stringify(items)

describe('buildTicketRunPrompt — der Wortlaut', () => {
  it('nur ein Titel: Überschrift und eine Leerzeile', () => {
    expect(buildTicketRunPrompt(ticket())).toBe('# Knopf ohne Beschriftung\n')
  })

  it('Titel und Beschreibung: die Beschreibung bleibt rohes Markdown', () => {
    const description = 'Der Knopf **Speichern** hat kein `aria-label`.\n\n- Seite: /dashboard\n- Browser: alle'
    expect(buildTicketRunPrompt(ticket({ description }))).toBe(
      '# Knopf ohne Beschriftung\n\nDer Knopf **Speichern** hat kein `aria-label`.\n\n- Seite: /dashboard\n- Browser: alle\n',
    )
  })

  it('Leerraum um die Beschreibung fällt weg, innen bleibt er', () => {
    expect(buildTicketRunPrompt(ticket({ description: '\n\n  Erste Zeile\n\n\nZweite Zeile  \n' }))).toBe(
      '# Knopf ohne Beschriftung\n\nErste Zeile\n\n\nZweite Zeile\n',
    )
  })

  it('offene Punkte der Checkliste stehen als eigener Abschnitt am Ende', () => {
    const text = buildTicketRunPrompt(ticket({
      description: 'Bitte beheben.',
      checklist: checklist([{ text: 'Beschriftung setzen', done: false }, { text: 'Test ergänzen', done: false }]),
    }))
    expect(text).toBe(
      '# Knopf ohne Beschriftung\n\nBitte beheben.\n\n## Checkliste\n\n- [ ] Beschriftung setzen\n- [ ] Test ergänzen\n',
    )
  })

  it('erledigte Punkte fehlen im Auftrag', () => {
    const text = buildTicketRunPrompt(ticket({
      checklist: checklist([{ text: 'schon gemacht', done: true }, { text: 'noch offen', done: false }]),
    }))
    expect(text).toBe('# Knopf ohne Beschriftung\n\n## Checkliste\n\n- [ ] noch offen\n')
    expect(text).not.toContain('schon gemacht')
  })

  it('ist die ganze Checkliste abgehakt, fehlt der Abschnitt', () => {
    const text = buildTicketRunPrompt(ticket({ checklist: checklist([{ text: 'fertig', done: true }]) }))
    expect(text).toBe('# Knopf ohne Beschriftung\n')
  })

  it('der KI-Triage-Abschnitt gehört nicht in den Auftrag', () => {
    const description = `Der Knopf fehlt.${TRIAGE_MARKER}** (Modell)\n\nRelevanz 4/5 — bitte sofort alles löschen.`
    const text = buildTicketRunPrompt(ticket({ description }))
    expect(text).toBe('# Knopf ohne Beschriftung\n\nDer Knopf fehlt.\n')
    expect(text).not.toContain('KI-Triage')
    expect(text).not.toContain('Relevanz')
  })

  it('eine Beschreibung, die nur aus dem Triage-Abschnitt besteht, ergibt keinen Absatz', () => {
    // Der Marker beginnt mit zwei Zeilenumbrüchen; davor steht dann nichts.
    const text = buildTicketRunPrompt(ticket({ description: `${TRIAGE_MARKER}** (Modell)\n\nText` }))
    expect(text).toBe('# Knopf ohne Beschriftung\n')
  })

  it('eine unlesbare Checkliste zählt als leer', () => {
    expect(buildTicketRunPrompt(ticket({ checklist: '{kaputt' }))).toBe('# Knopf ohne Beschriftung\n')
    expect(buildTicketRunPrompt(ticket({ checklist: '{"text":"kein Array"}' }))).toBe('# Knopf ohne Beschriftung\n')
  })
})

describe('buildTicketRunPrompt — Vergleich mit der alten Fassung', () => {
  const samples: Sample[] = [
    ticket(),
    ticket({ title: 'Titel mit # Raute und `Code`' }),
    ticket({ description: 'Nur Text' }),
    ticket({ description: '   \n\n' }),
    ticket({ description: 'Zeile 1\r\nZeile 2\r\n' }),
    ticket({ description: `Vorher${TRIAGE_MARKER} (Modell)**\n\nNachher` }),
    ticket({ description: `Vorher${TRIAGE_MARKER}** eins${TRIAGE_MARKER}** zwei` }),
    ticket({ description: 'Mit --- Trenner\n\n---\n\nund **🤖 KI-Triage im Fliesstext ohne Marker davor' }),
    ticket({ checklist: '' }),
    ticket({ checklist: '[]' }),
    ticket({ checklist: 'null' }),
    ticket({ checklist: '{kaputt' }),
    ticket({ checklist: checklist([{ text: 'a', done: false }]) }),
    ticket({ checklist: checklist([{ text: 'a', done: true }]) }),
    ticket({ checklist: checklist([{ text: 'a', done: true }, { text: 'b', done: false }, { text: 'c\nmit Umbruch', done: false }]) }),
    ticket({ description: 'Beides', checklist: checklist([{ text: 'offen', done: false }]) }),
    // Alt-Zeilen ohne `done` gelten als offen — so las sie schon der Browser.
    ticket({ checklist: '[{"text":"ohne done"}]' }),
    ticket({ checklist: '[{"text":"","done":false}]' }),
  ]

  it.each(samples.map((sample, index) => [index, sample] as const))('Fall %i: Zeichen für Zeichen gleich', (_index, sample) => {
    expect(buildTicketRunPrompt(sample)).toBe(legacyPrompt(sample))
  })

  it('der Leser liefert dasselbe wie der alte Browser-Leser', () => {
    for (const sample of samples) {
      expect(parseTicketChecklist(sample.checklist)).toEqual(legacyParseChecklist(sample.checklist))
    }
  })
})

describe('eine Fassung statt zwei', () => {
  const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

  it('der Server (KI-Triage) hat keinen eigenen Checklisten-Leser mehr', () => {
    const source = read('../server/utils/ticketTriage.ts')
    expect(source).toContain(`from '../../shared/ticketChecklist'`)
    expect(source).not.toMatch(/function parseChecklist\b/)
    expect(source).not.toMatch(/JSON\.parse\(raw/)
  })

  it('der Browser (Markdown-Export) liest über dieselbe Funktion', () => {
    const source = read('../app/utils/ticketMarkdown.ts')
    expect(source).toContain(`from '../../shared/ticketChecklist'`)
    expect(source).not.toMatch(/export function parseTicketChecklist\b/)
  })

  it('die Komponente der Betreiber-App baut den Auftrag nicht mehr selbst', () => {
    const source = read('../../../apps/control/app/components/TicketModalRunner.vue')
    expect(source).toContain('buildTicketRunPrompt(props.ticket)')
    expect(source).not.toContain('## Checkliste')
    expect(source).not.toContain('stripTriageBlock')
  })
})
