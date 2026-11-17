import { isSupportedTimezone } from './timezone'

/**
 * ZEITPUNKT IN EINER BENACHRICHTIGUNG (BE-018) — der ROHWERT statt fertigem Text.
 *
 * Bis dahin schrieb die Termin-Erinnerung den Beginn als fertigen Text in
 * `notifications.body`: deutsch und in der Zone des SERVERS. Glocke, Sofort-
 * und Sammel-Mail zeigten damit für jeden Leser dieselbe Uhrzeit — ohne
 * Zonen-Angabe und ohne zu wissen, wo er wohnt. Der Markt ist weltweit.
 *
 * Jetzt steht in der Zeile ein TOKEN mit Zeitpunkt (UTC) und der Zone des
 * Termins; geschrieben wird der Text erst beim LESEN — dasselbe Muster wie der
 * i18n-Schlüssel eines Abzeichens (`notificationText.ts`, `displayText()` in
 * der Glocke). Wer liest, entscheidet Zone und Sprache (Davids Entscheidung
 * 2026-11-17):
 *  - Glocke: Zone des Lesers (Konto-Einstellung, sonst Gerät), Sprache der
 *    Oberfläche.
 *  - Mail: eigene Zone des Empfängers, sonst die des Termins, sonst UTC
 *    (`notificationWhenMailZone`), Sprache der Mail.
 *  - IMMER mit Zonen-Kürzel — eine Uhrzeit ohne erkennbare Zone gibt es nicht.
 *
 * Alte Zeilen mit fertigem Text erkennt `parseNotificationWhen` nicht; sie
 * bleiben unverändert sichtbar. Export und Löschung (GDPR) sehen den Rohwert.
 */

/** Der Rohwert in der Zeile. `zone` darf leer sein (Termin ohne Zone). */
export interface NotificationWhen {
  /** Zeitpunkt als ISO-8601 in UTC (`…Z`). */
  at: string
  /** IANA-Zone des Gegenstands (Termin-Ort) oder `''`. */
  zone: string
}

/**
 * `@when:` beginnt mit einem Zeichen, das kein i18n-Schlüssel und kein
 * Absendername in der Glocke trägt; der reguläre Ausdruck prüft das GANZE
 * Token (Anker an beiden Enden) — ein Zitat, das das Token nur enthält, bleibt
 * Text.
 */
const PREFIX = '@when:'
const TOKEN_RE = /^@when:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z);([A-Za-z0-9_+\-/]{0,64})$/

/** Nur ein Zeitpunkt, den `Date` versteht UND unverändert zurückschreibt (kein 30. Februar). */
function canonicalInstant(at: string): string | null {
  const ms = Date.parse(at)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString()
}

/** UTC ist keine IANA-Region und fehlt in `Intl.supportedValuesOf` — hier trotzdem gültig. */
function usableZone(zone: string | null | undefined): string {
  if (!zone) return ''
  return zone === 'UTC' || isSupportedTimezone(zone) ? zone : ''
}

/**
 * Das Token für die Zeile. Ein unlesbarer Zeitpunkt wird nicht geraten: dann
 * bleibt der Eingabewert stehen (Rohtext, wie vor BE-018) — werfen hieße, eine
 * Erinnerung an einem Formatfehler scheitern zu lassen.
 */
export function encodeNotificationWhen(at: string, zone: string | null | undefined): string {
  const instant = canonicalInstant(at)
  if (!instant) return at
  return `${PREFIX}${instant};${usableZone(zone)}`
}

/** Streng: nur ein vollständiges, gültiges Token; alles andere ⇒ `null` (bleibt Text). */
export function parseNotificationWhen(value: string): NotificationWhen | null {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return null
  const match = TOKEN_RE.exec(value)
  if (!match) return null
  const at = match[1]!
  if (canonicalInstant(at) !== at) return null
  return { at, zone: usableZone(match[2]) }
}

/**
 * DIE EINE REGEL FÜR DIE MAIL: eigene Zone des Empfängers, sonst die Zone des
 * Termins, sonst UTC. Die Mail hat kein Gerät, dessen Zone sie fragen könnte —
 * ohne diese Kette stünde dort wieder die Zone des Servers.
 */
export function notificationWhenMailZone(recipientZone: string | null | undefined, subjectZone: string | null | undefined): string {
  return usableZone(recipientZone) || usableZone(subjectZone) || 'UTC'
}

/**
 * Der lesbare Text. Monat als Wort (`11/12` wäre je Leser ein anderer Tag),
 * Zonen-Kürzel IMMER (auch in der Glocke — falls sie einmal auf dem Server
 * gerendert wird, stimmt die Angabe trotzdem).
 *
 * `zone` leer/fehlend ⇒ Zone der Laufzeit (Glocke: das Gerät). Eine Zone, die
 * diese Laufzeit nicht kennt, und jeder andere Fehler ⇒ UTC — nie werfen, eine
 * Glocke oder Mail darf an einer Uhrzeit nicht scheitern.
 */
export function formatNotificationWhen(when: NotificationWhen, options: { language: string, zone?: string | null }): string {
  const date = new Date(when.at)
  const requested = options.zone ?? ''
  const zone = requested ? (usableZone(requested) || 'UTC') : undefined
  const parts: Intl.DateTimeFormatOptions = {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  }
  try {
    return new Intl.DateTimeFormat(options.language, { ...parts, timeZone: zone }).format(date)
  }
  catch {
    // Rückfall: UTC, und bei unbekanntem Sprach-Tag englisch — besser als nichts.
    try {
      return new Intl.DateTimeFormat(options.language, { ...parts, timeZone: 'UTC' }).format(date)
    }
    catch {
      return new Intl.DateTimeFormat('en-US', { ...parts, timeZone: 'UTC' }).format(date)
    }
  }
}
