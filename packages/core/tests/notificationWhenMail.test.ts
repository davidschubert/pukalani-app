import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * BE-018 — die Uhrzeit einer Erinnerung in der MAIL (Davids Entscheidung
 * 2026-11-17): eigene Zone des Empfängers, sonst die des Termins, sonst UTC —
 * immer mit Zonen-Kürzel, in der Sprache des Empfängers. Dazu liest die
 * Erinnerungs-Mail als Satz („Erinnerung: … beginnt bald"), und die Uhrzeit
 * steht NICHT in Zitat-Anführungszeichen.
 *
 * Gegenprobe je Fall: eine alte Zeile mit fertigem Text bleibt unverändert,
 * und andere Typen behalten Zitat und Überschrift.
 */

// 2026-11-18 23:00 UTC = 18:00 in New York (EST) = 00:00 am 19. in Berlin (MEZ)
const AT = '2026-11-18T23:00:00.000Z'
const TOKEN_NY = `@when:${AT};America/New_York`
const OLD_TEXT = 'Mi., 18.11.2026, 23:00'

const sentMails: { to: string, subject: string, text: string, html: string }[] = []
const unreadRows: Record<string, unknown>[] = []
const recipient = {
  $id: 'u-1',
  email: 'person@example.org',
  emailVerification: true,
  prefs: {} as Record<string, unknown>,
}
const prefsUpdates: unknown[] = []

type Mod = typeof import('../server/utils/notificationEmail')
let mail: Mod
let digest: typeof import('../server/utils/emailDigest')

beforeAll(async () => {
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appUrl: 'https://app.example', appwriteDatabaseId: 'db' } }))
  vi.stubGlobal('useAppConfig', () => ({}))
  vi.stubGlobal('mailerConfigured', async () => true)
  vi.stubGlobal('warnMailerMissingOnce', () => {})
  vi.stubGlobal('resolveNotificationText', (text: string) => text)
  vi.stubGlobal('createAdminClient', () => ({
    users: {
      get: async () => recipient,
      updatePrefs: async (input: unknown) => { prefsUpdates.push(input) },
    },
    tablesDB: {
      listRows: async () => ({ total: unreadRows.length, rows: unreadRows }),
    },
  }))
  vi.stubGlobal('sendMail', async (_event: unknown, input: { to: string, subject: string, text: string, html: string }) => {
    sentMails.push(input)
  })
  mail = await import('../server/utils/notificationEmail')
  vi.stubGlobal('resolveEmailPrefs', mail.resolveEmailPrefs)
  vi.stubGlobal('buildDigestEmail', mail.buildDigestEmail)
  digest = await import('../server/utils/emailDigest')
})

beforeEach(() => {
  sentMails.length = 0
  unreadRows.length = 0
  prefsUpdates.length = 0
})

const links = { appBase: 'https://app.example' }
const reminder = (body: string) => ({ type: 'reminder', title: 'Sommerfest', body, link: '/events/ev-1' })

describe('buildInstantEmail — Erinnerung', () => {
  it('en, ohne eigene Zone, Termin in New York ⇒ Ortszeit des Termins mit Kürzel, kein Zitat', () => {
    const built = mail.buildInstantEmail(links, 'en', reminder(TOKEN_NY), { brand: 'Testmarke' })
    expect(built.subject).toBe('Reminder: Sommerfest starts soon')
    expect(built.text).toContain('Wed, Nov 18, 2026, 06:00 PM EST')
    expect(built.text).not.toContain('@when:')
    expect(built.text).not.toMatch(/[„"]Wed/)
    expect(built.html).toContain('Wed, Nov 18, 2026, 06:00 PM EST')
    expect(built.html).not.toContain('<em>')
  })

  it('de, eigene Zone Berlin ⇒ deutsche Schreibweise, Berliner Zeit, MEZ', () => {
    const built = mail.buildInstantEmail(links, 'de', reminder(TOKEN_NY), { timezone: 'Europe/Berlin', brand: 'Testmarke' })
    expect(built.subject).toBe('Erinnerung: Sommerfest beginnt bald')
    expect(built.text).toContain('Do., 19. Nov. 2026, 00:00 MEZ')
    expect(built.text).not.toContain('„Do.')
  })

  it('Termin ohne Zone und Empfänger ohne Zone ⇒ UTC mit Kürzel', () => {
    const built = mail.buildInstantEmail(links, 'en', reminder(`@when:${AT};`), { brand: 'Testmarke' })
    expect(built.text).toContain('Wed, Nov 18, 2026, 11:00 PM UTC')
  })

  it('eine ungültige eigene Zone zählt nicht — dann die Zone des Termins', () => {
    const built = mail.buildInstantEmail(links, 'en', reminder(TOKEN_NY), { timezone: 'Mars/Olympus', brand: 'Testmarke' })
    expect(built.text).toContain('06:00 PM EST')
  })

  it('alte Zeile mit fertigem Text bleibt unverändert (als Zitat wie bisher)', () => {
    const built = mail.buildInstantEmail(links, 'de', reminder(OLD_TEXT), { timezone: 'Europe/Berlin', brand: 'Testmarke' })
    expect(built.subject).toBe('Erinnerung: Sommerfest beginnt bald')
    expect(built.text).toContain(`„${OLD_TEXT}"`)
  })

  it('Gegenprobe: andere Typen unverändert (Überschrift + Zitat)', () => {
    const built = mail.buildInstantEmail(links, 'de', { type: 'reply', title: 'Max', body: 'Hallo', link: '/feed' }, { timezone: 'Europe/Berlin', brand: 'Testmarke' })
    expect(built.subject).toBe('Max hat auf deinen Kommentar geantwortet')
    expect(built.text).toContain('„Hallo"')
    expect(built.html).toContain('„Hallo&quot;')
  })

  it('ein Kommentar, der wörtlich wie ein Zeitpunkt aussieht, bleibt ein Zitat (KK1)', () => {
    const built = mail.buildInstantEmail(links, 'de', { type: 'reply', title: 'Max', body: TOKEN_NY, link: '/feed' }, { timezone: 'Europe/Berlin', brand: 'Testmarke' })
    expect(built.text).toContain(`„${TOKEN_NY}"`)
    expect(built.text).not.toContain('MEZ')
  })
})

describe('buildDigestEmail — Erinnerung', () => {
  it('en ohne eigene Zone: Ortszeit des Termins; de mit Berlin: Berliner Zeit; alter Text bleibt', () => {
    const items = [reminder(TOKEN_NY), reminder(OLD_TEXT)]
    const en = mail.buildDigestEmail(links, 'en', items, { brand: 'Testmarke' })
    expect(en.text).toContain('Reminder: Sommerfest starts soon\nWed, Nov 18, 2026, 06:00 PM EST\n')
    expect(en.text).toContain(`„${OLD_TEXT}"`)

    const de = mail.buildDigestEmail(links, 'de', items, { timezone: 'Europe/Berlin', brand: 'Testmarke' })
    expect(de.text).toContain('Erinnerung: Sommerfest beginnt bald\nDo., 19. Nov. 2026, 00:00 MEZ\n')
    expect(de.text).toContain(`„${OLD_TEXT}"`)
  })
})

describe('die Aufrufer lesen die Zone aus den Prefs des Empfängers', () => {
  it('Sofort-Mail: prefs.timezone Berlin, Sprache de', async () => {
    recipient.prefs = { emailNotifications: 'instant', emailLocale: 'de', timezone: 'Europe/Berlin' }
    await mail.maybeSendInstantEmail(undefined, { recipientId: 'u-1', type: 'reminder', title: 'Sommerfest', body: TOKEN_NY, link: '/events/ev-1', scope: 'tenant' }, '')
    expect(sentMails).toHaveLength(1)
    expect(sentMails[0]!.text).toContain('00:00 MEZ')
  })

  it('Sofort-Mail: ohne eigene Zone (automatisch) ⇒ Zone des Termins', async () => {
    recipient.prefs = { emailNotifications: 'instant', emailLocale: 'en', timezone: '' }
    await mail.maybeSendInstantEmail(undefined, { recipientId: 'u-1', type: 'reminder', title: 'Sommerfest', body: TOKEN_NY, link: '/events/ev-1', scope: 'tenant' }, '')
    expect(sentMails[0]!.text).toContain('06:00 PM EST')
  })

  it('Sammel-Mail: prefs.timezone Berlin vs. ohne Zone', async () => {
    unreadRows.push({ $id: 'n1', $createdAt: new Date().toISOString(), recipientId: 'u-1', type: 'reminder', title: 'Sommerfest', body: TOKEN_NY, link: '/events/ev-1', read: false, communityId: '' })
    recipient.prefs = { emailNotifications: 'digest', emailLocale: 'de', timezone: 'Europe/Berlin' }
    expect((await digest.runEmailDigestSweep()).sent).toBe(1)
    expect(sentMails[0]!.text).toContain('Do., 19. Nov. 2026, 00:00 MEZ')

    recipient.prefs = { emailNotifications: 'digest', emailLocale: 'en' }
    expect((await digest.runEmailDigestSweep()).sent).toBe(1)
    expect(sentMails[1]!.text).toContain('Wed, Nov 18, 2026, 06:00 PM EST')
  })
})
