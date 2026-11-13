import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Zwei kleine Core-Erweiterungen für die Nachricht einer entfernten Person an
 * die Leitung (SEC-030 Teil 2, 2026-11-13):
 *
 *  1. `MailInput.replyTo` — die Leitung antwortet per „Antworten" direkt der
 *     Absenderin. Rückwärtskompatibel: ohne Feld trägt der Umschlag nichts.
 *  2. `notify({ mail: 'skip' })` — die Glocken-Zeile entsteht, die Sofort-Mail
 *     des Benachrichtigungs-Zweigs aber NICHT (die Route verschickt ihre
 *     eigene, genau eine). Und `duplicate: true`, damit ein Aufrufer eine
 *     Dublette (Idempotenz-Schlüssel) von einem Fehlschlag unterscheiden kann.
 */
const sentEnvelopes: Record<string, unknown>[] = []

vi.mock('nodemailer', () => ({
  createTransport: () => ({
    sendMail: async (envelope: Record<string, unknown>) => {
      sentEnvelopes.push(envelope)
      return { messageId: 'test' }
    },
    close: () => {},
  }),
}))

const config = {
  smtpHost: 'smtp.example.test',
  smtpPort: '587',
  smtpUser: '',
  smtpPass: '',
  smtpFrom: 'pukalani@example.test',
  public: { appwriteDatabaseId: 'db' },
}
vi.stubGlobal('useRuntimeConfig', () => config)
vi.stubGlobal('readInstanceSecret', async () => '')

const { __resetMailerWarnings, sendMail } = await import('../server/utils/mailer')
const { notify } = await import('../server/utils/notify')

describe('sendMail — replyTo', () => {
  beforeEach(() => {
    sentEnvelopes.length = 0
    __resetMailerWarnings()
  })

  it('reicht replyTo an nodemailer durch', async () => {
    await sendMail(undefined, { to: 'leitung@example.test', subject: 's', text: 't', replyTo: 'person@example.test' })
    expect(sentEnvelopes[0]?.replyTo).toBe('person@example.test')
  })

  it('ohne replyTo bleibt der Umschlag unberührt (Gegenprobe)', async () => {
    await sendMail(undefined, { to: 'leitung@example.test', subject: 's', text: 't' })
    expect(sentEnvelopes[0]).not.toHaveProperty('replyTo')
  })
})

describe('notify — mail: skip und duplicate', () => {
  const instantMail = vi.fn(async () => {})
  let createRow = vi.fn(async () => ({}))

  beforeEach(() => {
    instantMail.mockClear()
    createRow = vi.fn(async () => ({}))
    vi.stubGlobal('createAdminClient', () => ({ tablesDB: { createRow } }))
    vi.stubGlobal('maybeSendInstantEmail', instantMail)
  })

  const input = {
    recipientId: 'u-owner',
    type: 'member.appeal',
    title: 'Name',
    body: 'Text',
    link: '/dashboard/members',
    scope: 'tenant' as const,
    communityId: 't-a',
  }

  it('Standard: der Mail-Zweig nach Einstellung läuft wie bisher', async () => {
    expect(await notify(undefined, input)).toEqual({ created: true })
    expect(instantMail).toHaveBeenCalledTimes(1)
  })

  it("mail: 'skip' ⇒ Zeile ja, Sofort-Mail nein", async () => {
    expect(await notify(undefined, { ...input, mail: 'skip' })).toEqual({ created: true })
    expect(createRow).toHaveBeenCalledTimes(1)
    expect(instantMail).not.toHaveBeenCalled()
  })

  it('Dublette ⇒ created: false UND duplicate: true', async () => {
    createRow = vi.fn(async () => { throw Object.assign(new Error('exists'), { code: 409 }) })
    vi.stubGlobal('createAdminClient', () => ({ tablesDB: { createRow } }))
    expect(await notify(undefined, { ...input, rowId: 'fix' })).toEqual({ created: false, duplicate: true })
    expect(instantMail).not.toHaveBeenCalled()
  })

  it('Fehlschlag ⇒ created: false OHNE duplicate', async () => {
    createRow = vi.fn(async () => { throw new Error('down') })
    vi.stubGlobal('createAdminClient', () => ({ tablesDB: { createRow } }))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await notify(undefined, input)).toEqual({ created: false })
  })
})
