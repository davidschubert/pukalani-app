import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  encodeNotificationWhen,
  formatNotificationWhen,
  notificationWhenMailZone,
  parseNotificationWhen,
} from '../shared/notificationWhen'

/**
 * BE-018 — ZEITPUNKT IN EINER BENACHRICHTIGUNG als Rohwert.
 *
 * Der Fehler: die Erinnerung schrieb „Mi., 18.11.2026, 23:00" fertig in die
 * Zeile — deutsch, in der Zone des SERVERS, ohne Kürzel. Ein englischer
 * Empfänger in New York las eine fremde Uhrzeit, die nicht sagte, dass sie
 * fremd ist. Alle Erwartungen hier nennen ihre Zone ausdrücklich; die Zone der
 * Maschine darf das Ergebnis nicht ändern (Gegenprobe unten).
 */

// 2026-11-18 23:00 UTC = 18:00 New York (EST) = 00:00 am 19. Berlin (MEZ)
const AT = '2026-11-18T23:00:00.000Z'

describe('encode/parse', () => {
  it('Token mit Zone des Termins, Rundreise unverändert', () => {
    const token = encodeNotificationWhen(AT, 'America/New_York')
    expect(token).toBe(`@when:${AT};America/New_York`)
    expect(parseNotificationWhen(token)).toEqual({ at: AT, zone: 'America/New_York' })
  })

  it('Zone leer/null ⇒ leere Zone; ein anderes ISO-Format wird kanonisch', () => {
    expect(encodeNotificationWhen(AT, null)).toBe(`@when:${AT};`)
    expect(encodeNotificationWhen('2026-11-18T23:00:00+00:00', '')).toBe(`@when:${AT};`)
    expect(parseNotificationWhen(`@when:${AT};`)).toEqual({ at: AT, zone: '' })
  })

  it('unbekannte Zone wird beim Schreiben weggelassen und beim Lesen zu leer', () => {
    expect(encodeNotificationWhen(AT, 'Mars/Olympus')).toBe(`@when:${AT};`)
    expect(parseNotificationWhen(`@when:${AT};Mars/Olympus`)).toEqual({ at: AT, zone: '' })
  })

  it('unlesbarer Zeitpunkt wird nicht geraten: der Eingabewert bleibt (Rohtext)', () => {
    expect(encodeNotificationWhen('morgen', 'Europe/Berlin')).toBe('morgen')
  })

  it('Rohtext und kaputte Token ⇒ null (bleibt Text)', () => {
    for (const value of [
      '',
      'Mi., 18.11.2026, 23:00',
      'notifications.reminder',
      `Hallo @when:${AT};Europe/Berlin`,
      `@when:${AT};Europe/Berlin danach`,
      `@when:${AT}`,
      '@when:2026-02-30T10:00:00.000Z;',
      '@when:2026-11-18T23:00:00Z;',
      '@when:2026-11-18;Europe/Berlin',
      `@when:${AT};Europe/Berlin;x`,
      `@when:${AT};<script>`,
      `@WHEN:${AT};`,
    ]) {
      expect(parseNotificationWhen(value), value).toBeNull()
    }
  })
})

describe('formatNotificationWhen', () => {
  it('Verifikation des Findings: Termin New York, Empfänger englisch ohne eigene Zone ⇒ Ortszeit des Termins mit Kürzel', () => {
    const when = parseNotificationWhen(`@when:${AT};America/New_York`)!
    const zone = notificationWhenMailZone('', when.zone)
    expect(zone).toBe('America/New_York')
    const text = formatNotificationWhen(when, { language: 'en-US', zone })
    expect(text).toBe('Wed, Nov 18, 2026, 06:00 PM EST')
  })

  it('derselbe Termin, Empfänger deutsch mit Europe/Berlin ⇒ deutsche Schreibweise, Berliner Zeit, MEZ', () => {
    const when = parseNotificationWhen(`@when:${AT};America/New_York`)!
    const text = formatNotificationWhen(when, { language: 'de-DE', zone: notificationWhenMailZone('Europe/Berlin', when.zone) })
    expect(text).toBe('Do., 19. Nov. 2026, 00:00 MEZ')
  })

  it('Sommerzeit in Berlin ⇒ MESZ', () => {
    const text = formatNotificationWhen({ at: '2026-07-01T10:00:00.000Z', zone: '' }, { language: 'de-DE', zone: 'Europe/Berlin' })
    expect(text).toBe('Mi., 1. Juli 2026, 12:00 MESZ')
  })

  it('leere Zonen überall ⇒ UTC mit Kürzel', () => {
    const zone = notificationWhenMailZone('', '')
    expect(zone).toBe('UTC')
    expect(formatNotificationWhen({ at: AT, zone: '' }, { language: 'en-US', zone })).toBe('Wed, Nov 18, 2026, 11:00 PM UTC')
  })

  it('ungültige Zone oder Sprache wirft nie — Rückfall auf UTC mit Kürzel', () => {
    expect(formatNotificationWhen({ at: AT, zone: '' }, { language: 'en-US', zone: 'Mars/Olympus' })).toBe('Wed, Nov 18, 2026, 11:00 PM UTC')
    expect(formatNotificationWhen({ at: AT, zone: '' }, { language: '!!kaputt', zone: 'Europe/Berlin' })).toMatch(/UTC$/)
  })

  it('Monat als Wort, nie 11/18', () => {
    expect(formatNotificationWhen({ at: AT, zone: '' }, { language: 'en-US', zone: 'UTC' })).not.toMatch(/\d+\/\d+/)
  })
})

describe('notificationWhenMailZone — die eine Regel der Mail', () => {
  it('Empfänger vor Termin vor UTC; ungültige Werte zählen nicht', () => {
    expect(notificationWhenMailZone('Europe/Berlin', 'America/New_York')).toBe('Europe/Berlin')
    expect(notificationWhenMailZone('', 'America/New_York')).toBe('America/New_York')
    expect(notificationWhenMailZone(undefined, null)).toBe('UTC')
    expect(notificationWhenMailZone('Mars/Olympus', 'America/New_York')).toBe('America/New_York')
  })
})

describe('Gegenprobe: die Zone der Maschine ändert nichts', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('TZ=Pacific/Auckland: explizite Zonen liefern denselben Text', () => {
    vi.stubEnv('TZ', 'Pacific/Auckland')
    // Wirkt die Umstellung in dieser Laufzeit überhaupt? Sonst wäre die
    // Gegenprobe immer grün (Beweis-Regel 1) — dann prüfen wir sie nicht.
    const local = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).format(new Date(AT))
    expect(local).toMatch(/GMT\+13|NZDT/)
    const when = parseNotificationWhen(`@when:${AT};America/New_York`)!
    expect(formatNotificationWhen(when, { language: 'en-US', zone: notificationWhenMailZone('', when.zone) })).toBe('Wed, Nov 18, 2026, 06:00 PM EST')
    expect(formatNotificationWhen(when, { language: 'en-US', zone: notificationWhenMailZone('', '') })).toBe('Wed, Nov 18, 2026, 11:00 PM UTC')
  })

  it('ohne Zone (Glocke, Gerät) folgt der Text der Laufzeit-Zone — mit Kürzel', () => {
    vi.stubEnv('TZ', 'Pacific/Auckland')
    const text = formatNotificationWhen({ at: AT, zone: 'America/New_York' }, { language: 'en-US' })
    expect(text).toMatch(/^Thu, Nov 19, 2026, 12:00 PM (GMT\+13|NZDT)$/)
  })
})
