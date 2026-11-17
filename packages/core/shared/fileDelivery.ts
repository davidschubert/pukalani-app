/**
 * AUSLIEFERN VON ABLAGE-DATEIEN: die EINE Regel für Typ und Darstellung
 * (SEC-001, `.claude/rules/appwrite.md` „RECHTE AN ABLAGEN").
 *
 * Eine Auslieferungs-Route reicht den gespeicherten Typ nie durch. Der Typ in
 * einer Zeile oder bei Appwrite ist eine Angabe, der INHALT ist die Wahrheit:
 *  - inline geht nur ein Bild aus der kleinen Erlaubnisliste (PNG, JPEG,
 *    WebP, GIF — dieselbe Tabelle wie die Profilbilder), dessen gespeicherter
 *    Typ auf der Liste steht UND dessen Inhalt per Magic Bytes ein solches
 *    Bild ist. `Content-Type` ist dann der ERKANNTE Typ.
 *  - alles andere (auch PDF, SVG, HTML, Text) geht als
 *    `application/octet-stream` mit `Content-Disposition: attachment`.
 *
 * Dazu trägt JEDE Antwort einer solchen Route `FILE_RESPONSE_HEADERS`
 * (`nosniff` und eine CSP mit `sandbox`) — auch die Fehlerantworten, deshalb
 * setzt die Route sie vor der ersten Prüfung.
 *
 * Baut auf `avatarImage.ts` auf (Erlaubnisliste, Magic Bytes, Kopfzeilen),
 * ohne die Datei umzubauen: die Profilbild-Route antwortet für Nicht-Bilder
 * 404, Anhänge dagegen sollen herunterladbar bleiben.
 *
 * PURE und ohne Node-Typen: gearbeitet wird mit `Uint8Array`, ein `Buffer` ist
 * eines.
 */
import { STORAGE_FILE_RESPONSE_HEADERS, isAvatarImageMime, sniffImageMime } from './avatarImage'

/** Schutz-Kopfzeilen für JEDE Antwort einer Datei-Auslieferung. */
export const FILE_RESPONSE_HEADERS = STORAGE_FILE_RESPONSE_HEADERS

export interface FileDelivery {
  /** Ein Bildtyp aus der Erlaubnisliste oder `application/octet-stream`. */
  contentType: string
  /** Fertiger Wert für `Content-Disposition`. */
  disposition: string
  inline: boolean
}

export interface FileDeliveryInput {
  /** Der gespeicherte Typ — nur eine Angabe, nie der Antwort-Typ. */
  storedType: string | null | undefined
  bytes: Uint8Array
  /** Der gespeicherte Dateiname (beliebiger Text). */
  name: string | null | undefined
  /** `false` ⇒ immer Download (z. B. wenn ein Programm der Empfänger ist). */
  allowInlineImages?: boolean
}

const FALLBACK_NAME = 'file'
const MAX_NAME_LENGTH = 150

/**
 * ASCII-Ersatzname für `filename="…"`: nur harmlose Zeichen, keine
 * Anführungszeichen, keine Steuerzeichen, kein Pfad.
 */
function asciiFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? ''
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/^[.\s]+/, '')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
  return cleaned || FALLBACK_NAME
}

/** Steuerzeichen (C0 und DEL) haben in einer Kopfzeile nichts verloren. */
function withoutControlChars(value: string): string {
  return [...value].filter((char) => {
    const code = char.codePointAt(0) ?? 0
    return code >= 0x20 && code !== 0x7F
  }).join('')
}

/** RFC 5987/8187: `encodeURIComponent` lässt `'()*` stehen, die gehören kodiert. */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

/**
 * `Content-Disposition` mit sicher kodiertem Namen: ein ASCII-Ersatz in
 * `filename` und der echte Name UTF-8-kodiert in `filename*`.
 */
export function contentDisposition(kind: 'inline' | 'attachment', name: string | null | undefined): string {
  const raw = withoutControlChars(name ?? '').trim().slice(0, MAX_NAME_LENGTH * 2)
  const fallback = asciiFileName(raw)
  const full = raw.split(/[/\\]/).pop() || fallback
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(full)}`
}

/** Entscheidet Typ und Darstellung einer ausgelieferten Datei (siehe oben). */
export function decideFileDelivery(input: FileDeliveryInput): FileDelivery {
  if (input.allowInlineImages !== false && isAvatarImageMime(input.storedType)) {
    const sniffed = sniffImageMime(input.bytes)
    if (sniffed) {
      return { contentType: sniffed, disposition: contentDisposition('inline', input.name), inline: true }
    }
  }
  return {
    contentType: 'application/octet-stream',
    disposition: contentDisposition('attachment', input.name),
    inline: false,
  }
}
