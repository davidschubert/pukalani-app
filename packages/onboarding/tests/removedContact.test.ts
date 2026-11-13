import { describe, expect, it } from 'vitest'
import {
  buildRemovedContactMail,
  createRemovedContactSchema,
  customerAreaUrl,
  defangLinks,
  headerSafe,
  removedContactExcerpt,
  removedContactRecipients,
  removedContactWeekBucket,
  removedContactWeekRemainingMs,
  sanitizeRemovedContactMessage,
} from '../shared/removedContact'
import { removedContactRowId } from '../server/utils/removedContact'

/**
 * SEC-030 Teil 2 (2026-11-13): die puren Regeln des Kontakts nach dem
 * Entfernen — Empfänger, Wochen-Eimer, Bereinigung, Mail-Text.
 */

describe('Empfänger: Inhaber und Admins — nicht Moderatoren', () => {
  const team = [
    { runtimeUserId: 'u-owner', role: 'owner' },
    { runtimeUserId: 'u-admin', role: 'admin' },
    { runtimeUserId: 'u-mod', role: 'moderator' },
    { runtimeUserId: 'u-editor', role: 'editor' },
    { runtimeUserId: '', role: 'admin' },
    { runtimeUserId: 'u-admin', role: 'admin' },
  ]

  it('nimmt owner und admin, jede Person einmal, ohne leere Ids', () => {
    expect(removedContactRecipients(team, 'u-sender')).toEqual(['u-owner', 'u-admin'])
  })

  it('nie die Absenderin selbst', () => {
    expect(removedContactRecipients(team, 'u-admin')).toEqual(['u-owner'])
  })

  it('kein Team ⇒ keine Empfänger', () => {
    expect(removedContactRecipients([], 'u-sender')).toEqual([])
  })
})

describe('Kalenderwochen-Eimer', () => {
  const monday = Date.UTC(2026, 10, 9, 0, 0, 0) // Mo 9.11.2026
  const sunday = Date.UTC(2026, 10, 15, 23, 59, 59)
  const nextMonday = Date.UTC(2026, 10, 16, 0, 0, 0)

  it('Montag bis Sonntag ist EIN Eimer, der nächste Montag ein neuer', () => {
    expect(removedContactWeekBucket(monday)).toBe(removedContactWeekBucket(sunday))
    expect(removedContactWeekBucket(nextMonday)).toBe(removedContactWeekBucket(monday) + 1)
  })

  it('Sonntag vor Mitternacht ist eine andere Woche als der Montag davor minus eine Sekunde', () => {
    expect(removedContactWeekBucket(monday - 1000)).toBe(removedContactWeekBucket(monday) - 1)
  })

  it('Restlaufzeit endet am nächsten Montag', () => {
    expect(removedContactWeekRemainingMs(monday)).toBe(7 * 86_400_000)
    expect(removedContactWeekRemainingMs(sunday)).toBe(1000)
  })

  it('der Idempotenz-Schlüssel hängt an allen vier Werten und passt in 36 Zeichen', () => {
    const week = removedContactWeekBucket(monday)
    const id = removedContactRowId('c-a', 'u-sender', week, 'u-owner')
    expect(id.length).toBeLessThanOrEqual(36)
    expect(id).toMatch(/^[a-z0-9-]+$/)
    expect(removedContactRowId('c-a', 'u-sender', week, 'u-owner')).toBe(id)
    expect(removedContactRowId('c-a', 'u-sender', week + 1, 'u-owner')).not.toBe(id)
    expect(removedContactRowId('c-a', 'u-sender', week, 'u-admin')).not.toBe(id)
    expect(removedContactRowId('c-b', 'u-sender', week, 'u-owner')).not.toBe(id)
    expect(removedContactRowId('c-a', 'u-other', week, 'u-owner')).not.toBe(id)
  })
})

describe('Nutzertext', () => {
  it('Steuerzeichen raus, Zeilenumbrüche bleiben', () => {
    expect(sanitizeRemovedContactMessage('  Hallo\r\nWelt\u0000\u0007!\u202E  ')).toBe('Hallo\nWelt!')
  })

  it('zieht lange Leerzeilen-Serien zusammen', () => {
    expect(sanitizeRemovedContactMessage('a\n\n\n\n\n\nb')).toBe('a\n\n\nb')
  })

  it('Kopfzeilen-Werte ohne Zeilenumbruch (keine Kopfzeilen-Injektion)', () => {
    expect(headerSafe('Eve\r\nBcc: opfer@example.test')).toBe('Eve Bcc: opfer@example.test')
    expect(headerSafe('a'.repeat(300)).length).toBe(200)
  })

  it('Links werden entschärft', () => {
    expect(defangLinks('siehe https://evil.example/x und www.evil.example'))
      .toBe('siehe https[:]//evil.example/x und www[.]evil.example')
  })

  it('Kurzfassung für die Glocke', () => {
    expect(removedContactExcerpt('kurz')).toBe('kurz')
    const long = removedContactExcerpt('x'.repeat(500))
    expect(long.length).toBe(200)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('Formular-Schema', () => {
  const schema = createRemovedContactSchema(key => key)

  it('20 bis 1000 Zeichen', () => {
    expect(schema.safeParse({ message: 'zu kurz' }).success).toBe(false)
    expect(schema.safeParse({ message: 'x'.repeat(20) }).success).toBe(true)
    expect(schema.safeParse({ message: 'x'.repeat(1000) }).success).toBe(true)
    expect(schema.safeParse({ message: 'x'.repeat(1001) }).success).toBe(false)
  })
})

describe('Mail an die Leitung', () => {
  const input = {
    communityName: 'Morgenlicht',
    senderName: 'Eve\nBcc: x@example.test',
    senderEmail: 'eve@example.test',
    message: 'Bitte schaut nochmal drauf: https://example.test',
    membersUrl: 'https://morgenlicht.example/dashboard/members',
  }

  it('de: Community, Name, Adresse, Nachricht (entschärft), Link zur Verwaltung', () => {
    const mail = buildRemovedContactMail({ ...input, locale: 'de' })
    expect(mail.subject).not.toMatch(/[\r\n]/)
    expect(mail.subject).toContain('Morgenlicht')
    expect(mail.text).toContain('Morgenlicht')
    expect(mail.text).toContain('E-Mail: eve@example.test')
    expect(mail.text).toContain('https[:]//example.test')
    expect(mail.text).toContain('Mitglieder verwalten: https://morgenlicht.example/dashboard/members')
    expect(mail.text).not.toContain('\nBcc:')
  })

  it('en: eigene Sprache', () => {
    const mail = buildRemovedContactMail({ ...input, locale: 'en' })
    expect(mail.subject).toContain('message from')
    expect(mail.text).toContain('Email: eve@example.test')
    expect(mail.text).toContain('Manage members:')
  })
})

describe('Link in den Kundenbereich', () => {
  it('erster Kontroll-Host, https in Produktion', () => {
    expect(customerAreaUrl(['', 'account.pukalani.app'])).toBe('https://account.pukalani.app/')
  })

  it('lokal mit dem Port der Seite', () => {
    expect(customerAreaUrl(['app.localhost'], '3150')).toBe('http://app.localhost:3150/')
  })

  it('ohne Kontroll-Host kein Link', () => {
    expect(customerAreaUrl([])).toBe('')
  })
})
