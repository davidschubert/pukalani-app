import { beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * SEC-035 — eine Antwort von einem GAST ist in der Mail als Gast erkennbar.
 *
 * Der Titel einer Antwort-Benachrichtigung ist der Absendername, und den wählt
 * ein Gast frei. Ohne Kennzeichen stünde in der Mail „<beliebiger Name> hat auf
 * deinen Kommentar geantwortet" — ununterscheidbar von einem Konto mit diesem
 * Namen. Der eigene Typ `reply.guest` trägt das Kennzeichen im Satz, in beiden
 * Mail-Sprachen (die Glocke prüft notificationBellTexts.test.ts).
 */

type Build = typeof import('../server/utils/notificationEmail').buildInstantEmail
let buildInstantEmail: Build

beforeAll(async () => {
  vi.stubGlobal('resolveNotificationText', (text: string) => text)
  buildInstantEmail = (await import('../server/utils/notificationEmail')).buildInstantEmail
})

const links = { appBase: 'https://app.example' }
const opts = { brand: 'Testmarke' }
const item = (type: string) => ({ type, title: 'Wunschname', body: 'Hallo', link: '/feed' })

describe('Mail-Betreff einer Gast-Antwort', () => {
  it('de: trägt das Gast-Kennzeichen', () => {
    expect(buildInstantEmail(links, 'de', item('reply.guest'), opts).subject).toBe('Wunschname (Gast) hat auf deinen Kommentar geantwortet')
  })

  it('en: trägt das Gast-Kennzeichen', () => {
    expect(buildInstantEmail(links, 'en', item('reply.guest'), opts).subject).toBe('Wunschname (guest) replied to your comment')
  })

  it('Gegenprobe: eine Konto-Antwort bleibt ohne Kennzeichen', () => {
    expect(buildInstantEmail(links, 'de', item('reply'), opts).subject).toBe('Wunschname hat auf deinen Kommentar geantwortet')
  })
})

describe('Rahmen der Sofort-Mail (Q06)', () => {
  it('de: Anrede mit Namen, Schluss mit der Marke, Fußzeile darunter', () => {
    const mail = buildInstantEmail(links, 'de', item('reply'), { brand: 'Testmarke', name: 'Lea' })
    expect(mail.text.startsWith('Hallo Lea,\n\n')).toBe(true)
    expect(mail.text).toContain('Viele Grüße\nTestmarke')
    expect(mail.text.indexOf('Testmarke')).toBeLessThan(mail.text.indexOf('E-Mail-Benachrichtigungen'))
    expect(mail.html).not.toContain('#888')
  })

  it('en ohne Namen: „Hi," und die Marke', () => {
    const mail = buildInstantEmail(links, 'en', item('reply'), opts)
    expect(mail.text.startsWith('Hi,\n\n')).toBe(true)
    expect(mail.text).toContain('Best regards\nTestmarke')
  })

  it.each(['invite.request', 'abuse.report', 'message.received'])('%s fällt nicht auf „Neue Benachrichtigung"', (type) => {
    expect(buildInstantEmail(links, 'de', item(type), opts).subject).not.toContain('Neue Benachrichtigung')
    expect(buildInstantEmail(links, 'en', item(type), opts).subject).not.toContain('New notification')
  })
})
