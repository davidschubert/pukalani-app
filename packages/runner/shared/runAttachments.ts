import { MAX_RUN_ATTACHMENTS, type RunAttachment } from './types/runner'

/**
 * `runs.attachmentsJson` lesen und schreiben — die EINE Stelle
 * (docs/archiv/AI-RUNNER.md § 6).
 *
 * Bewusst PUR und bewusst geteilt: gelesen wird die Spalte an vier Stellen
 * (Upload-Route, Liste für den Runner, Auslieferung einer einzelnen Datei,
 * Oberfläche), und drei davon treffen daran eine Sicherheits-Entscheidung —
 * `runs/:id/files/:fileId` liefert NUR aus, was in dieser Liste steht. Eine
 * Parse-Zeile, die man an vier Stellen einzeln schreibt, wird an einer davon
 * nachlässig.
 *
 * DEFENSIV: '' und kaputtes JSON ergeben eine leere Liste, nie einen Fehler.
 * Ein verstümmelter Wert darf einen Lauf nicht unlesbar machen — er soll ihn
 * ohne Anhänge zeigen (dasselbe Muster wie `parseTicketChecklist`).
 */
export function parseRunAttachments(raw: string): RunAttachment[] {
  try {
    const parsed: unknown = JSON.parse(raw || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry) => {
      if (typeof entry !== 'object' || entry === null) return []
      const value = entry as Partial<RunAttachment>
      if (typeof value.fileId !== 'string' || !value.fileId) return []
      return [{
        fileId: value.fileId,
        name: typeof value.name === 'string' ? value.name : value.fileId,
        mimeType: typeof value.mimeType === 'string' ? value.mimeType : 'application/octet-stream',
        size: typeof value.size === 'number' ? value.size : 0,
      }]
    })
  }
  catch {
    return []
  }
}

/** Serialisiert zurück in die Spalte; leere Liste ⇒ '' (Spalten-Default). */
export function serializeRunAttachments(attachments: RunAttachment[]): string {
  return attachments.length ? JSON.stringify(attachments) : ''
}

/**
 * Ist noch Platz? Der Deckel ist kein Geschmack: die Spalte fasst 4000 Zeichen
 * (`runner-002`), und ein Auftrag mit zwanzig Bildern ist kein Auftrag mehr.
 */
export function runAttachmentsFull(attachments: RunAttachment[]): boolean {
  return attachments.length >= MAX_RUN_ATTACHMENTS
}
