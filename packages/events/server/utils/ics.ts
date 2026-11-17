import { isHttpUrl } from '../../../core/shared/safeHref'
import type { EventRow } from '../../shared/types/event'

/**
 * Text nach RFC 5545 escapen (Backslash, Semikolon, Komma, Zeilenumbruch).
 * Auch ein einzelnes CR wird zu `\n` (BE-018) — ein nacktes CR bricht die
 * Zeile in manchen Lesern genauso wie LF.
 */
export function escapeIcsText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll('\r\n', '\\n')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\n')
}

/**
 * Adresse für eine URI-Eigenschaft (`URL:`) — BE-018. URL ist nach RFC 5545
 * vom Typ URI, kein TEXT: Kommas und Semikola bleiben stehen, die
 * Text-Maskierung hätte die Adresse verfälscht. Ohne Maskierung darf dafür
 * nichts in die Zeile, das sie bricht: genommen wird nur, was `isHttpUrl`
 * besteht (kein Leerraum, keine Steuerzeichen), sonst `null` und die Zeile
 * entfällt. Weglassen statt Prozent-Kodieren: eine still umgeschriebene
 * Adresse wäre ein Link, den niemand eingetragen hat.
 */
export function icsUri(value: unknown): string | null {
  return isHttpUrl(value) ? value : null
}

/** ISO-Datum → ICS-UTC-Basic-Format (20260101T180000Z) */
export function toIcsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Kalender-Datei (EIN VEVENT) für ein Event — pure Funktion, kein externer
 * Dienst. CRLF-Zeilenenden nach RFC 5545; Zeilen-Folding bewusst weggelassen
 * (Clients akzeptieren lange Zeilen, die Felder sind ohnehin größenbegrenzt).
 */
export function buildEventIcs(row: Pick<EventRow, '$id' | '$updatedAt' | 'title' | 'description' | 'startAt' | 'endAt' | 'location' | 'url' | 'status'>): string {
  const url = icsUri(row.url)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//pukalani//events//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${row.$id}@pukalani-events`,
    `DTSTAMP:${toIcsDate(row.$updatedAt)}`,
    `DTSTART:${toIcsDate(row.startAt)}`,
    ...(row.endAt ? [`DTEND:${toIcsDate(row.endAt)}`] : []),
    `SUMMARY:${escapeIcsText(row.title)}`,
    ...(row.description ? [`DESCRIPTION:${escapeIcsText(row.description)}`] : []),
    ...(row.location ? [`LOCATION:${escapeIcsText(row.location)}`] : []),
    // Nur eine http(s)-Adresse kommt als Link in die Datei (SEC-021), als URI (BE-018).
    ...(url ? [`URL:${url}`] : []),
    `STATUS:${row.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `${lines.join('\r\n')}\r\n`
}
