import { TICKETS_TABLE, type TicketRow } from '../../../../packages/tickets/shared/types/ticket'
import { isOperatorWritten, normalizeTicketOrigin } from '../../../../packages/tickets/shared/ticketOrigin'
import { buildTicketRunPrompt } from '../../../../packages/tickets/shared/ticketRunPrompt'

/**
 * „Gilt ein Auftrag aus diesem Ticket als geprüft?" — die Antwort für den
 * Vertrag `registerRunSubjectTrustResolver` des runner-Layers (SEC-038).
 *
 * WARUM HIER (A14): `runner` kennt `tickets` nicht und `tickets` kennt
 * `runner` nicht. Nur diese App komponiert beide — dieselbe Stelle, an der
 * `TicketModalRunner.vue` den Lauf-Bereich ins Ticket-Modal hängt. Die Regel
 * selbst gehört dem tickets-Layer (`shared/ticketOrigin.ts`), hier wird sie nur
 * angeschlossen.
 *
 * GEPRÜFT HEISST: die Herkunft ist exakt `operator` (Titel, Beschreibung und
 * Checkliste stammen nur von Konten mit der Betreiber-Rolle). Alles andere —
 * auch die unbekannte Herkunft des Altbestands — ist ungeprüft.
 *
 * DER AUFTRAGSTEXT KOMMT VON HIER (RU1 b, seit 2026-11-18): aus derselben,
 * frisch gelesenen Zeile baut `buildTicketRunPrompt` (tickets-Layer) den Text,
 * den der Lauf bekommt. Die Oberfläche zeigt mit derselben Funktion, was
 * laufen wird; gespeichert wird, was hier entsteht — nie ein Text aus der
 * Anfrage. Herkunft und Text stammen damit aus EINEM Lesevorgang.
 *
 * Gelesen wird mit dem Admin-Client: der Resolver läuft hinter der Anlege-
 * Route, die `runner.manage` (nur admin) schon verlangt hat, und die
 * Tickets-Tabelle ist Betreiber-Ablage ohne Mandanten (keine Datentür).
 * Fehler außer 404 wirft er weiter — der Vertrag macht daraus 503
 * `subject_trust_unavailable` (eine Prüfung, die nicht prüfen kann, lehnt ab).
 */

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 404
}

export default defineNitroPlugin(() => {
  registerRunSubjectTrustResolver('ticket', async (event, subjectId) => {
    const config = useRuntimeConfig(event)
    const { tablesDB } = createAdminClient(event)
    try {
      const ticket = await tablesDB.getRow<TicketRow>({
        databaseId: config.public.appwriteDatabaseId,
        tableId: TICKETS_TABLE,
        rowId: subjectId,
      })
      return {
        trusted: isOperatorWritten(normalizeTicketOrigin(ticket.origin)),
        promptSource: buildTicketRunPrompt(ticket),
      }
    }
    catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
  })
})
