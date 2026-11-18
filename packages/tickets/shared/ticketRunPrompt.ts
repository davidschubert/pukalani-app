import { parseTicketChecklist } from './ticketChecklist'
import { stripTriageBlock } from './triageBlock'
import type { TicketRow } from './types/ticket'

/**
 * AUS EINEM TICKET EINEN AUFTRAG MACHEN (RU1 b, seit 2026-11-18).
 *
 * Der Text, den ein Agent des AI-Runners als Auftrag bekommt: Titel als
 * Überschrift, dann die Beschreibung, dann die noch OFFENEN Punkte der
 * Checkliste. Die Funktion ist pur und liegt in `shared/`, weil BEIDE Seiten
 * sie brauchen: der Server baut damit den Text, der wirklich läuft, und die
 * Oberfläche zeigt mit derselben Funktion, was laufen wird. Vorher stand der
 * Zusammenbau nur in der Komponente `apps/control/…/TicketModalRunner.vue`.
 *
 * DIE BESCHREIBUNG WIRD ROH ÜBERNOMMEN: sie IST Markdown (das Modal
 * bearbeitet sie mit `UEditor`, `content-type="markdown"`), und ein Agent
 * liest Markdown besser als jede Umformung. Sie durch einen HTML-Renderer zu
 * schicken hiesse, Struktur wegzuwerfen und Tags einzuführen.
 *
 * OHNE DEN KI-TRIAGE-ABSCHNITT (`stripTriageBlock`): den hat ein Modell an die
 * Beschreibung gehängt, kein Mensch hat ihn geschrieben — er gehört nicht in
 * einen Auftrag an einen Agenten. Deshalb ändert die Triage auch die Herkunft
 * des Tickets nicht (SEC-038).
 *
 * ERLEDIGTE Punkte bleiben draussen: sie sind Vergangenheit, und im Auftrag
 * würden sie wie Arbeit aussehen. Ist die ganze Checkliste abgehakt, fehlt der
 * Abschnitt.
 *
 * TESTBEFEHLE STEHEN BEWUSST NICHT HIER: die wählt das Formular des
 * Lauf-Bereichs, und sie reisen als eigenes Feld (`testCommands`). Zweimal
 * dieselbe Angabe — einmal als Fliesstext, einmal als Liste — wäre eine
 * Einladung, dass beide auseinanderlaufen.
 *
 * WORTGLEICH: wer hier etwas ändert, ändert, was ein Agent als Auftrag liest.
 * `tests/ticketRunPrompt.test.ts` hält den Wortlaut fest.
 */
export function buildTicketRunPrompt(ticket: Pick<TicketRow, 'title' | 'description' | 'checklist'>): string {
  const lines: string[] = [`# ${ticket.title}`, '']

  const description = stripTriageBlock(ticket.description).trim()
  if (description) lines.push(description, '')

  const open = parseTicketChecklist(ticket.checklist).filter(item => !item.done)
  if (open.length) {
    lines.push('## Checkliste', '')
    for (const item of open) lines.push(`- [ ] ${item.text}`)
    lines.push('')
  }

  return lines.join('\n')
}
