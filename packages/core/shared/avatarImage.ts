/**
 * Profilbilder: die EINE Regel, was als Bild in den Bucket `avatars` darf und
 * wie es ausgeliefert wird (SEC-001).
 *
 * Gebraucht von der Upload-Route (`server/api/storage/[bucket]/index.post.ts`)
 * und der Auslieferung (`server/api/storage/[bucket]/[fileId].get.ts`). Die
 * Migration system-039 und die Bootstrap-Skripte tragen dieselben Werte als
 * Literale (Migrations-Skripte importieren nichts aus `core`) — ein Test
 * (`tests/avatarImage.test.ts`) hält Migration und Tabelle hier zusammen.
 *
 * PURE und ohne Node-Typen: gearbeitet wird mit `Uint8Array`, ein `Buffer` ist
 * eines.
 */

/** Größte erlaubte Datei: 5 MiB — dieselbe Zahl trägt der Bucket. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024

/** Die EINE Tabelle: erlaubter Bildtyp → Dateiendung des gespeicherten Namens. */
export const AVATAR_IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const

export type AvatarImageMime = keyof typeof AVATAR_IMAGE_TYPES

/**
 * Die Endungsliste, die der Bucket trägt. `jpeg` steht zusätzlich darin, damit
 * auch von Hand oder mit älterem Code abgelegte Dateien gültig bleiben; die
 * Route selbst schreibt nur Namen aus `AVATAR_IMAGE_TYPES`.
 */
export const AVATAR_BUCKET_EXTENSIONS: readonly string[] = ['png', 'jpg', 'jpeg', 'webp', 'gif']

/** Ist der Wert einer der erlaubten Bildtypen? SVG und HTML gehören nicht dazu. */
export function isAvatarImageMime(value: unknown): value is AvatarImageMime {
  return typeof value === 'string' && Object.hasOwn(AVATAR_IMAGE_TYPES, value)
}

function startsWith(data: Uint8Array, bytes: readonly number[], offset = 0): boolean {
  if (data.length < offset + bytes.length) return false
  return bytes.every((byte, index) => data[offset + index] === byte)
}

const PNG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
const JPEG = [0xFF, 0xD8, 0xFF]
const RIFF = [0x52, 0x49, 0x46, 0x46] // 'RIFF'
const WEBP = [0x57, 0x45, 0x42, 0x50] // 'WEBP'
const GIF87A = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] // 'GIF87a'
const GIF89A = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] // 'GIF89a'

/**
 * Magic-Bytes-Erkennung: der deklarierte und der gespeicherte Typ sind
 * Angaben von außen — entscheidend ist, was der INHALT ist (PNG/JPEG/WebP/GIF,
 * sonst `null`). Damit wird z. B. HTML oder SVG mit gefälschtem Typ weder
 * angenommen noch ausgeliefert.
 */
export function sniffImageMime(data: Uint8Array): AvatarImageMime | null {
  if (startsWith(data, PNG)) return 'image/png'
  if (startsWith(data, JPEG)) return 'image/jpeg'
  if (data.length >= 12 && startsWith(data, RIFF) && startsWith(data, WEBP, 8)) return 'image/webp'
  if (startsWith(data, GIF87A) || startsWith(data, GIF89A)) return 'image/gif'
  return null
}

/**
 * Der gespeicherte Dateiname kommt aus dem ERKANNTEN Typ, nicht vom Aufrufer:
 * der Bucket prüft die Endung, und ein gültiges Bild mit ungewöhnlichem oder
 * fehlendem Namen darf daran nicht scheitern.
 */
export function avatarFileName(mime: AvatarImageMime): string {
  return `avatar.${AVATAR_IMAGE_TYPES[mime]}`
}

/**
 * Schutz-Kopfzeilen für jede Antwort der Auslieferung: kein Typ-Raten im
 * Browser, und selbst falls doch etwas anderes als ein Bild durchrutscht,
 * darf es weder Skripte ausführen noch etwas nachladen.
 */
export const STORAGE_FILE_RESPONSE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': 'default-src \'none\'; sandbox',
} as const
