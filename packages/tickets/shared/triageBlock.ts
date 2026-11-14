/**
 * Der „🤖 KI-Triage"-Abschnitt am Ende einer Ticket-Beschreibung
 * (server/utils/ticketTriage.ts schreibt ihn).
 *
 * HIER UND NICHT IM SERVER-UTIL, weil zwei Seiten ihn abschneiden müssen: die
 * Triage selbst (ihr eigener Prompt soll die alte Einschätzung nicht noch
 * einmal lesen, und eine neue ersetzt die alte) und der Auftrag an den
 * AI-Runner (`apps/control`, TicketModalRunner): der Abschnitt ist Text eines
 * KI-Modells, den niemand geschrieben hat, und gehört nicht in einen Auftrag
 * an einen Agenten. Dieselbe Regel steht deshalb genau EINMAL.
 */
export const TRIAGE_MARKER = '\n\n---\n\n**🤖 KI-Triage'

/**
 * Die Beschreibung OHNE den Triage-Abschnitt — alles ab dem ersten Marker fällt
 * weg. Der Abschnitt steht immer als letzter Block (die Triage ersetzt ihn
 * statt anzuhängen), es gibt also nichts dahinter, das verloren ginge.
 */
export function stripTriageBlock(description: string): string {
  return description.split(TRIAGE_MARKER)[0] ?? ''
}
