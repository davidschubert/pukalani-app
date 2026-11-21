import { sniffImageMime, type AvatarImageMime } from '../../shared/avatarImage'

/** Die Bildtypen, die Titelbilder und Mediathek annehmen (kein GIF). */
const UPLOAD_IMAGE_MIMES: readonly AvatarImageMime[] = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Ist der INHALT ein JPEG, PNG oder WebP? Der deklarierte Typ ist Eingabe von
 * außen; entschieden wird an den ersten Bytes (`sniffImageMime`). Unter
 * 12 Bytes ist es nie ein Bild.
 *
 * EINE Stelle für Event-Cover und Mediathek (Q26): ein neues Format gilt
 * hier für beide.
 */
export function isUploadImage(data: Uint8Array): boolean {
  if (data.length < 12) return false
  const mime = sniffImageMime(data)
  return mime !== null && UPLOAD_IMAGE_MIMES.includes(mime)
}
