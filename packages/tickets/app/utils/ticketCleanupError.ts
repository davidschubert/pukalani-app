/**
 * Hat die Lösch-Route abgebrochen, weil Anhänge oder Beobachtungen nicht
 * vollständig weg waren (BE-024)? Erkannt NUR am Grund aus dem Envelope
 * (`reason`, vom zentralen Fehler-Handler aus `data.code` gehoben), nie am
 * Status: 502 kann an derselben Route auch etwas anderes heißen.
 */
export function isTicketCleanupIncomplete(error: unknown): boolean {
  return (error as { data?: { reason?: unknown } } | null)?.data?.reason === 'ticket_cleanup_incomplete'
}
