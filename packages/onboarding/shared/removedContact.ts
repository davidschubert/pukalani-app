import { z } from 'zod'
import { communityOrigin } from '../../core/shared/notificationLinks'

/**
 * KONTAKT NACH DEM ENTFERNEN (SEC-030 Teil 2, seit 2026-11-13 — Davids Wahl
 * vom selben Tag): wer aus einer Community entfernt wurde, sieht nur noch eine
 * Hinweisseite und kann von dort EINE kurze Nachricht an die Leitung schicken.
 * Sie geht als E-Mail an Inhaber und Admins und erscheint zusätzlich in deren
 * Glocke. Die entfernte Person erfährt dabei keine Adresse und keinen Namen;
 * die Leitung sieht Name und E-Mail der Person und antwortet per Mail.
 * Höchstens eine Nachricht je Woche, Person und Community.
 *
 * Der pure Teil: Längen, Schema, Bereinigung, Wochen-Eimer, Empfänger-Auswahl,
 * Mail-Text. Route: `server/api/community/removed-contact.post.ts`, Seite:
 * `app/pages/removed.vue`.
 */

export const REMOVED_CONTACT_MIN_LENGTH = 20
export const REMOVED_CONTACT_MAX_LENGTH = 1000

/** Eine Nachricht je 7 Tage je (Community, Konto) — das Fenster der Bremse. */
export const REMOVED_CONTACT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/** Grund der 429, wenn die Wochen-Grenze erreicht ist. */
export const REMOVED_CONTACT_LIMIT_CODE = 'removed_contact_limit'

/** Wie viel der Nachricht in der Glocke steht (der volle Text kommt per Mail). */
export const REMOVED_CONTACT_BELL_EXCERPT = 200

/**
 * Formular-Schema (Oberfläche). Der Server prüft die Länge NACH der
 * Bereinigung noch einmal selbst — dieses Schema fängt nur den Tippfehler vor
 * dem Absenden.
 */
export function createRemovedContactSchema(t: (key: string, params?: Record<string, unknown>) => string) {
  return z.object({
    message: z.string().trim()
      .min(REMOVED_CONTACT_MIN_LENGTH, t('removedNotice.contact.tooShort', { min: REMOVED_CONTACT_MIN_LENGTH }))
      .max(REMOVED_CONTACT_MAX_LENGTH, t('removedNotice.contact.tooLong', { max: REMOVED_CONTACT_MAX_LENGTH })),
  })
}

export type RemovedContactForm = z.infer<ReturnType<typeof createRemovedContactSchema>>

/**
 * Nutzertext bereinigen: Zeilenenden vereinheitlichen, Steuerzeichen entfernen
 * (Zeilenumbruch und Tabulator bleiben — es ist ein Brief), mehr als zwei
 * Leerzeilen am Stück zusammenziehen, außen trimmen.
 */
export function sanitizeRemovedContactMessage(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex -- genau diese Zeichen sollen raus
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2066-\u2069]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

/**
 * Ein Wert, der in eine Kopfzeile oder Betreffzeile gelangt (Name, Adresse,
 * Community-Name): Zeilenumbrüche und Steuerzeichen raus, Länge deckeln.
 * Ohne das könnte ein Name mit Zeilenumbruch eine eigene Kopfzeile anfangen.
 */
export function headerSafe(value: string, max = 200): string {
  return value
    // eslint-disable-next-line no-control-regex -- Steuerzeichen inkl. CR/LF
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/**
 * Links in Nutzertext ENTSCHÄRFEN, bevor er in eine Mail geht: Mail-Programme
 * machen Adressen in reinem Text von sich aus klickbar. `https://x` wird zu
 * `https[:]//x`, `www.x` zu `www[.]x` — lesbar, aber kein Link.
 */
export function defangLinks(text: string): string {
  return text
    .replace(/\b([a-z][a-z0-9+.-]*):\/\//gi, '$1[:]//')
    .replace(/\bwww\./gi, 'www[.]')
}

/** Kurzfassung für die Glocke (der Rest steht in der Mail). */
export function removedContactExcerpt(message: string, max = REMOVED_CONTACT_BELL_EXCERPT): string {
  const flat = message.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
/** 1970-01-01 war ein Donnerstag; vier Tage später beginnt die erste Montags-Woche. */
const MONDAY_OFFSET_MS = 4 * 24 * 60 * 60 * 1000

/**
 * Kalenderwochen-Eimer (Montag 00:00 UTC bis Sonntag 24:00 UTC) — Teil des
 * Idempotenz-Schlüssels der Glocken-Zeile, der ZWEITEN, dauerhaften Sicherung
 * hinter dem 7-Tage-Fenster der Bremse: auch wenn der Zähler verloren geht
 * (Neustart ohne Redis), schreibt `notify()` je Woche höchstens eine Zeile je
 * Empfänger.
 */
export function removedContactWeekBucket(nowMs: number): number {
  return Math.floor((nowMs - MONDAY_OFFSET_MS) / WEEK_MS)
}

/** Wie lange die laufende Kalenderwoche noch dauert (für `Retry-After`). */
export function removedContactWeekRemainingMs(nowMs: number): number {
  const bucket = removedContactWeekBucket(nowMs)
  return (bucket + 1) * WEEK_MS + MONDAY_OFFSET_MS - nowMs
}

/**
 * EMPFÄNGER: Inhaber und Admins dieser Community — NICHT Moderatoren (sie
 * entscheiden nicht über Mitgliedschaften). Leere Ids fallen heraus, jede
 * Person nur einmal, und die Absenderin nie (falls ein Datenfehler sie noch
 * führt).
 */
export function removedContactRecipients(
  members: readonly { runtimeUserId: string, role: string }[],
  senderId: string,
): string[] {
  const ids = members
    .filter(member => member.role === 'owner' || member.role === 'admin')
    .map(member => member.runtimeUserId)
    .filter(id => id !== '' && id !== senderId)
  return [...new Set(ids)]
}

/**
 * Link in den Kundenbereich (Kontroll-Host): der erste konfigurierte
 * Kontroll-Host. Lokal (`*.localhost`) trägt der Link den Port der laufenden
 * Seite, sonst führte er auf Port 80.
 */
export function customerAreaUrl(controlHosts: readonly string[], currentPort = ''): string {
  const host = controlHosts.map(entry => entry.trim()).find(entry => entry !== '')
  if (!host) return ''
  const origin = communityOrigin(host)
  if (!origin) return ''
  const local = origin.startsWith('http://')
  return local && currentPort && !host.includes(':') ? `${origin}:${currentPort}/` : `${origin}/`
}

export interface RemovedContactMailInput {
  locale: 'de' | 'en'
  communityName: string
  senderName: string
  senderEmail: string
  message: string
  membersUrl: string
}

/**
 * Die Mail an EINE Person der Leitung, in deren Sprache. Reiner Text — die
 * Nachricht ist Nutzertext und bekommt kein HTML; Links darin sind entschärft.
 */
export function buildRemovedContactMail(input: RemovedContactMailInput): { subject: string, text: string } {
  const community = headerSafe(input.communityName) || '—'
  const name = headerSafe(input.senderName) || headerSafe(input.senderEmail)
  const email = headerSafe(input.senderEmail)
  const message = defangLinks(input.message)
  if (input.locale === 'de') {
    return {
      subject: headerSafe(`${community}: Nachricht von ${name} (entfernt)`),
      text: [
        `${name} wurde aus der Community „${community}" entfernt und hat euch über die Hinweisseite geschrieben:`,
        '',
        '----',
        message,
        '----',
        '',
        `Name: ${name}`,
        `E-Mail: ${email}`,
        '',
        'Antworte einfach auf diese Mail, um der Person zu schreiben.',
        `Mitglieder verwalten: ${input.membersUrl}`,
        '',
        '—',
        'Du erhältst diese Mail, weil du Inhaber oder Admin dieser Community bist. Eine Person kann höchstens eine Nachricht pro Woche schicken.',
      ].join('\n'),
    }
  }
  return {
    subject: headerSafe(`${community}: message from ${name} (removed)`),
    text: [
      `${name} was removed from the community "${community}" and wrote to you from the notice page:`,
      '',
      '----',
      message,
      '----',
      '',
      `Name: ${name}`,
      `Email: ${email}`,
      '',
      'Simply reply to this email to write back to this person.',
      `Manage members: ${input.membersUrl}`,
      '',
      '—',
      'You receive this email because you are an owner or admin of this community. A person can send at most one message per week.',
    ].join('\n'),
  }
}
