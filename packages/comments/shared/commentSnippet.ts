/**
 * Der Auszug eines Kommentars für Feed-Eintrag und Benachrichtigung — die
 * ersten 140 Zeichen, mit Auslassungszeichen, wenn gekürzt wurde.
 *
 * EINE Regel für Schreiben UND Bearbeiten (SEC-032, 2026-11-15): seit die
 * Bearbeitung den Schnappschuss im Feed nachzieht, müssen beide Stellen
 * dieselbe Form erzeugen — sonst sähe ein bearbeiteter Kommentar im Feed
 * anders gekürzt aus als ein frischer.
 */
export const COMMENT_SNIPPET_LENGTH = 140

export function commentSnippet(content: string): string {
  return content.length > COMMENT_SNIPPET_LENGTH ? `${content.slice(0, COMMENT_SNIPPET_LENGTH)}…` : content
}
