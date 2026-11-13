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
const item = (type: string) => ({ type, title: 'Wunschname', body: 'Hallo', link: '/feed' })

describe('Mail-Betreff einer Gast-Antwort', () => {
  it('de: trägt das Gast-Kennzeichen', () => {
    expect(buildInstantEmail(links, 'de', item('reply.guest')).subject).toBe('Wunschname (Gast) hat auf deinen Kommentar geantwortet')
  })

  it('en: trägt das Gast-Kennzeichen', () => {
    expect(buildInstantEmail(links, 'en', item('reply.guest')).subject).toBe('Wunschname (guest) replied to your comment')
  })

  it('Gegenprobe: eine Konto-Antwort bleibt ohne Kennzeichen', () => {
    expect(buildInstantEmail(links, 'de', item('reply')).subject).toBe('Wunschname hat auf deinen Kommentar geantwortet')
  })
})
