import type { H3Event } from 'h3'
import type { DependencyTicketInput } from '../../shared/dependencyTicket'

/**
 * „Leg mir dazu ein Ticket an" — die RUNTIME-Seite der Update-Prüfung.
 *
 * WARUM EINE REGISTRY (A14): der Knopf sitzt auf der Systemseite des
 * admin-Layers, das Board gehört dem tickets-Layer — zwei PRODUKT-Layer, und
 * die kennen einander nie direkt (nur blueprint darf mehrere kennen;
 * Cross-Layer-Abhängigkeiten nur als expliziter Vertrag). Also derselbe wie bei
 * registerCommunityJoinHandler und registerReportEscalationHandler: core
 * erklärt die Frage, der Produkt-Layer verdrahtet die Antwort (Nitro-Plugin).
 * Ohne registrierten Creator gibt es hier nichts — Apps ohne Ticket-Board
 * (comments, platform, portfolio) zeigen den Knopf deshalb gar nicht erst.
 *
 * UNTERSCHIED ZU communityJoin, bewusst: DIESER Vertrag reicht Fehler DURCH.
 * Ein Beitritt ist die Nebenwirkung einer anderen Handlung und darf sie nie
 * umwerfen; hier ist das Ticket der ZWECK der Handlung — jemand drückt einen
 * Knopf und will wissen, ob es geklappt hat. Ein geschlucktes 409
 * („gibt es schon") oder ein stiller Fehlschlag wäre eine Lüge im UI.
 */

export interface DependencyTicketResult {
  /** Row-Id des angelegten Tickets — die Antwort verlinkt darauf ins Board. */
  ticketId: string
}

export type DependencyTicketCreator = (
  event: H3Event,
  input: DependencyTicketInput,
) => Promise<DependencyTicketResult>

let creator: DependencyTicketCreator | null = null

/** Vom Layer (Nitro-Plugin) registriert — EINE Autorität pro Deployment. */
export function registerDependencyTicketCreator(fn: DependencyTicketCreator): void {
  if (creator) {
    console.warn('[core] registerDependencyTicketCreator: bestehender Creator wird ersetzt — pro Deployment ist EINE Autorität vorgesehen')
  }
  creator = fn
}

/**
 * Gibt es in dieser App überhaupt ein Board? Die Systemseite fragt das, um den
 * Knopf zu zeigen oder wegzulassen — und die Route, um wie eine Datentür mit
 * 404 zu antworten statt mit einem Fehler über eine Fähigkeit, die es hier
 * nicht gibt.
 */
export function hasDependencyTicketCreator(): boolean {
  return creator !== null
}

/**
 * Ticket zur Update-Prüfung anlegen. `null` heißt „diese App hat kein Board" —
 * jede andere Auskunft (auch „gibt es schon") kommt als Fehler des Creators
 * beim Aufrufer an.
 */
export async function createDependencyUpdateTicket(
  event: H3Event,
  input: DependencyTicketInput,
): Promise<DependencyTicketResult | null> {
  if (!creator) return null
  return await creator(event, input)
}
