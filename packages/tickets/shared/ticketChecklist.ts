import type { TicketChecklistItem } from './types/ticket'

/**
 * DER EINE CHECKLISTEN-LESER (RU1 b, seit 2026-11-18).
 *
 * Die Spalte `tickets.checklist` ist ein JSON-Array als Text ('' = keine).
 * Gelesen wird sie auf BEIDEN Seiten: im Browser (Karte, Modal, Markdown-
 * Export) und auf dem Server (KI-Triage, Auftragstext für den AI-Runner).
 * Vorher gab es dafür zwei Fassungen — eine in `app/utils/ticketMarkdown.ts`
 * und eine „defensive Kopie" in `server/utils/ticketTriage.ts`, weil der
 * Server nicht aus `app/` importiert. Zwei Fassungen laufen auseinander;
 * deshalb liegt die eine hier in `shared/`.
 *
 * DEFENSIV: '' und kaputte Werte ergeben eine leere Liste — eine Karte mit
 * unlesbarer Checkliste soll sich öffnen lassen, statt das Board zu werfen.
 */
export function parseTicketChecklist(raw: string): TicketChecklistItem[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  }
  catch {
    return []
  }
}
