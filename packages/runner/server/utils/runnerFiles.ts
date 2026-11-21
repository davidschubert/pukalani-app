/**
 * Anhang-Prüfung des AI-Runners — docs/archiv/AI-RUNNER.md § 6.
 *
 * EIGENE Datei, obwohl `tickets` mit `detectTicketFileType` fast dasselbe tut:
 * `runner` kennt `tickets` NICHT (A14), und ein Auto-Import über die
 * Layer-Grenze wäre genau die implizite Kopplung, die die Matrix ausschliesst.
 * Der Preis sind vierzig Zeilen Doppelung; der Gegenwert ist ein Layer, der
 * ohne das Board läuft (der spätere Auslöser soll ein Roadmap-Eintrag oder ein
 * GitHub-Issue sein, § 3.1).
 *
 * BEWUSST SCHLANKER als das Ticket-Pendant: hier gibt es kein `.csv`, kein
 * `.json` und kein `.log` als eigene Endung — der Runner legt die Dateien
 * einem Agenten in den Ordner, und was er lesen soll, ist Bild, PDF oder Text.
 *
 * WARUM MAGIC BYTES: die Mime-Angabe des Clients ist Angreifer-Eingabe. Sie
 * entscheidet hier gar nichts — der Typ wird aus dem Inhalt gelesen, und nur
 * die Endung darf bei Text-Formaten mitreden (Text hat keine Magic Bytes).
 */
const MAX_RUN_FILE_BYTES = 10 * 1024 * 1024

interface DetectedRunFileType {
  mimeType: string
}

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  return bytes.every((b, i) => buffer[offset + i] === b)
}

/** Erkannter Typ oder `null` — `null` heisst „nicht erlaubt", nicht „unbekannt". */
export function detectRunFileType(buffer: Buffer, filename: string): DetectedRunFileType | null {
  if (buffer.length === 0 || buffer.length > MAX_RUN_FILE_BYTES) return null

  if (startsWith(buffer, [0x89, 0x50, 0x4E, 0x47])) return { mimeType: 'image/png' }
  if (startsWith(buffer, [0xFF, 0xD8, 0xFF])) return { mimeType: 'image/jpeg' }
  if (startsWith(buffer, [0x47, 0x49, 0x46, 0x38])) return { mimeType: 'image/gif' }
  // WebP ist ein RIFF-Container: die Kennung steht erst ab Byte 8.
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) return { mimeType: 'image/webp' }
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46])) return { mimeType: 'application/pdf' }

  /**
   * Text hat keine Magic Bytes — hier entscheidet die Endung PLUS die
   * Heuristik „keine Nullbytes im Anfangsfenster". Das ist keine Sicherheits-
   * grenze, sondern eine Anstands-Prüfung: sie hält eine umbenannte Binärdatei
   * heraus, nicht einen bösartigen Text. Die Grenze gegen bösartigen TEXT
   * liegt woanders — der Auftrag ist `promptTrusted: false`, wenn Fremdmaterial
   * darin steckt (§ 8.2).
   */
  const extension = filename.toLowerCase().split('.').pop() ?? ''
  const TEXT_EXTENSIONS: Record<string, string> = {
    md: 'text/markdown',
    txt: 'text/plain',
    log: 'text/plain',
  }
  if (extension in TEXT_EXTENSIONS) {
    const window = buffer.subarray(0, Math.min(buffer.length, 4096))
    if (!window.includes(0)) return { mimeType: TEXT_EXTENSIONS[extension]! }
  }

  return null
}

export { MAX_RUN_FILE_BYTES }
