/**
 * DIE HERKUNFT EINES TICKETS (`tickets.origin`, Migration tickets-004, SEC-038).
 *
 * Wozu: ein Ticket kann zum AUFTRAG für einen Agenten werden (AI-Runner, in
 * `apps/control` verdrahtet). Ob dieser Auftrag als „geprüft" gilt und damit
 * die weitreichenden Arbeitsweisen bekommen darf, entscheidet der SERVER aus
 * genau diesem Feld. Vorher rechnete der Browser es aus `feedbackId === ''`
 * aus — und beim Kopieren eines Tickets wurde `feedbackId` geleert, die Kopie
 * eines Tickets aus einer Rückmeldung galt damit als geprüft.
 *
 * Darum zwei Regeln, die diese Datei festhält:
 *  1. Die Herkunft wird NUR serverseitig gesetzt, nie aus einem Body gelesen.
 *  2. Sie wird NIE besser: eine Kopie erbt sie, eine Bearbeitung durch ein
 *     Konto ohne Betreiber-Rolle stuft `operator` auf `staff` ab, eine
 *     Bearbeitung durch den Betreiber hebt nichts an (er liest beim Speichern
 *     nicht jede fremde Zeile nach).
 *
 * BEWUSST PUR (ohne node-appwrite): die Regeln laufen im Server, im Browser
 * (nur zur Anzeige) und in den Tests (tests/ticketOrigin.test.ts).
 */

/**
 * - `operator`   Titel, Beschreibung und Checkliste stammen ausschließlich von
 *                Konten mit der Betreiber-Rolle `admin`.
 * - `staff`      ein Konsolen-Konto OHNE diese Rolle (heute: `moderator`, trägt
 *                `tickets.manage`) hat das Ticket angelegt oder seinen Text
 *                bearbeitet.
 * - `feedback`   aus einer Rückmeldung übernommen (`createTicketFromFeedback`)
 *                — Rückmeldungen nimmt die Plattform auch von Gästen an.
 * - `dependency` maschinell erzeugtes Update-Ticket (`createTicketFromDependency`).
 */
export const TICKET_ORIGINS = ['operator', 'staff', 'feedback', 'dependency'] as const
export type TicketOrigin = (typeof TICKET_ORIGINS)[number]

/**
 * `''` = Herkunft unbekannt. Das ist der Altbestand vor tickets-004 (die
 * Migration füllt bewusst nichts nach) und gilt wie jede andere Herkunft außer
 * `operator` als NICHT geprüft: wer nicht weiß, woher ein Text kommt, behandelt
 * ihn wie fremden.
 */
export type TicketOriginValue = TicketOrigin | ''

/** Alles, was keine bekannte Herkunft ist (auch ein Tippfehler), ist `''`. */
export function normalizeTicketOrigin(value: unknown): TicketOriginValue {
  return typeof value === 'string' && (TICKET_ORIGINS as readonly string[]).includes(value)
    ? value as TicketOrigin
    : ''
}

/**
 * Trägt ein Konto die Betreiber-Rolle `admin`?
 *
 * EIGENE KLEINE FUNKTION statt eines Core-Helfers: `core/shared/authz.ts`
 * kennt nur Capabilities, und keine davon bedeutet „ist Betreiber" ohne
 * Kopplung an ein fremdes Produkt — `runner.manage` wäre zwar heute
 * admin-only, aber `tickets` kennt `runner` nicht (A14), und eine Capability
 * kann morgen in ein weiteres Rollen-Bündel wandern. Die Frage hier ist die
 * nach der ROLLE, also wird die Rolle gefragt.
 */
export function hasOperatorRole(labels: readonly string[] | null | undefined): boolean {
  return (labels ?? []).includes('admin')
}

/** Ein frisch angelegtes Ticket: Betreiber ⇒ `operator`, sonst `staff`. */
export function originForNewTicket(authorIsOperator: boolean): TicketOrigin {
  return authorIsOperator ? 'operator' : 'staff'
}

/**
 * Herkunft nach einer Bearbeitung von Titel, Beschreibung oder Checkliste.
 *
 * NUR EINE RICHTUNG: `operator` + Nicht-Betreiber ⇒ `staff`. Alles andere
 * bleibt, wie es war — insbesondere hebt eine Bearbeitung durch den Betreiber
 * `feedback`, `staff` oder `''` NICHT auf `operator`: der fremde Text steht ja
 * noch drin, nur ein Satz kam dazu.
 */
export function originAfterTextEdit(current: unknown, editorIsOperator: boolean): TicketOriginValue {
  const origin = normalizeTicketOrigin(current)
  if (origin === 'operator' && !editorIsOperator) return 'staff'
  return origin
}

/**
 * Herkunft einer KOPIE = die Herkunft der Quelle, normalisiert. Nie besser:
 * eine Kopie trägt denselben Text, also dieselbe Frage nach seinem Ursprung.
 * (`feedbackId` wird beim Kopieren weiterhin geleert — das ist der
 * Dedup-Schlüssel der Übernahme, nicht mehr die Herkunft.)
 */
export function originForCopy(source: unknown): TicketOriginValue {
  return normalizeTicketOrigin(source)
}

/** Gilt der Text als vom Betreiber geschrieben? Nur exakt `'operator'`. */
export function isOperatorWritten(origin: unknown): boolean {
  return origin === 'operator'
}
