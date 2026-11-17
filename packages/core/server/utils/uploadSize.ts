import type { H3Event } from 'h3'

/**
 * UPLOAD-GRÖSSE FRÜH PRÜFEN — vor `readMultipartFormData`.
 *
 * `readMultipartFormData` liest den ganzen Request in den Speicher; erst danach
 * kennt eine Route die echte Dateigröße. Diese Prüfung liest vorher die
 * angegebene Länge (`content-length`) und weist zu große Uploads mit 413 ab,
 * bevor der Körper gelesen wird. Muster: der Medien-Upload
 * (`media/server/api/media/index.post.ts`).
 *
 * Die Angabe kommt vom Client und ERSETZT die Prüfung der echten Größe nach
 * dem Lesen NICHT — die bleibt in jeder Route stehen und ist die Wahrheit.
 * Fehlt die Angabe oder ist sie keine Zahl, lehnt diese Prüfung nicht ab.
 */

/**
 * Zuschlag für den Multipart-Rahmen (Grenzmarken, Kopfzeilen, Textfelder) —
 * derselbe Wert wie im Medien-Upload. Ohne ihn scheiterte eine Datei genau an
 * der Grenze schon hier.
 */
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024

/** Ist die angegebene Länge größer als Grenze + Rahmen? Pure Funktion. */
export function declaredBodyTooLarge(contentLength: string | undefined | null, maxBytes: number): boolean {
  if (contentLength == null) return false
  const trimmed = contentLength.trim()
  if (!/^\d+$/.test(trimmed)) return false
  return Number(trimmed) > maxBytes + MULTIPART_OVERHEAD_BYTES
}

/** Wirft 413, wenn die angegebene Länge die Grenze (mit Rahmen) übersteigt. */
export function rejectOversizedUpload(event: H3Event, maxBytes: number): void {
  if (declaredBodyTooLarge(getRequestHeader(event, 'content-length'), maxBytes)) {
    throw createError({ status: 413, statusText: 'File too large' })
  }
}
