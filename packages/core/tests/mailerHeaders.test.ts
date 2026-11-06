import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `sendMail()` REICHT KOPFZEILEN DURCH (BI1 I5b, 2026-10-27).
 *
 * Gebraucht wird genau eine: `List-Unsubscribe`, je Empfänger mit dessen
 * eigenem Token. Geprüft wird deshalb nicht „ein Feld existiert" (das sagt der
 * Typ), sondern die drei Zusagen, die der Typ NICHT hält:
 *
 *  1. Der Wert kommt UNVERÄNDERT bei nodemailer an — wird er irgendwo
 *     normalisiert, verliert der spitze-Klammer-Rahmen des Headers seine Form
 *     (`<https://…>` ist bei `List-Unsubscribe` Pflicht, nicht Schmuck).
 *  2. OHNE Kopfzeilen trägt der Umschlag KEIN `headers` — eine Benachrichtigungs-
 *     Mail soll sich durch diese Änderung in nichts unterscheiden. Das ist die
 *     Gegenprobe; ohne sie wäre Punkt 1 auch mit einem festen `headers: {}`
 *     grün.
 *  3. Ein LEERES Objekt zählt wie keines — sonst hinge am Aufrufer die Pflicht,
 *     `undefined` statt `{}` zu übergeben.
 *
 * nodemailer ist gemockt: geprüft wird UNSER Umschlag, nicht SMTP.
 */
const sentEnvelopes: Record<string, unknown>[] = []

vi.mock('nodemailer', () => ({
  createTransport: () => ({
    sendMail: async (envelope: Record<string, unknown>) => {
      sentEnvelopes.push(envelope)
      return { messageId: 'test' }
    },
  }),
}))

const config = {
  smtpHost: 'smtp.example.test',
  smtpPort: '587',
  smtpUser: '',
  smtpPass: '',
  smtpFrom: 'redaktion@example.test',
}
vi.stubGlobal('useRuntimeConfig', () => config)
vi.stubGlobal('readInstanceSecret', async () => '')

const { __resetMailerWarnings, sendMail } = await import('../server/utils/mailer')

const UNSUB = '<https://branding.supply/newsletter/unsubscribe?token=row.sig>'

describe('sendMail — Kopfzeilen', () => {
  beforeEach(() => {
    sentEnvelopes.length = 0
    __resetMailerWarnings()
  })

  it('reicht `List-Unsubscribe` unverändert an nodemailer durch', async () => {
    expect(await sendMail(undefined, {
      to: 'leser@example.test',
      subject: 'Neues Stück',
      text: 'Text',
      headers: { 'List-Unsubscribe': UNSUB },
    })).toBe(true)
    expect(sentEnvelopes).toHaveLength(1)
    expect(sentEnvelopes[0]?.headers).toEqual({ 'List-Unsubscribe': UNSUB })
  })

  it('lässt den Umschlag OHNE Kopfzeilen unberührt (Gegenprobe)', async () => {
    await sendMail(undefined, { to: 'leser@example.test', subject: 's', text: 't' })
    expect(sentEnvelopes[0]).not.toHaveProperty('headers')
  })

  it('behandelt ein leeres Objekt wie keines', async () => {
    await sendMail(undefined, { to: 'leser@example.test', subject: 's', text: 't', headers: {} })
    expect(sentEnvelopes[0]).not.toHaveProperty('headers')
  })

  it('setzt KEIN `List-Unsubscribe-Post` von sich aus (RFC 8058 braucht einen eigenen Endpunkt)', async () => {
    await sendMail(undefined, {
      to: 'leser@example.test',
      subject: 's',
      text: 't',
      headers: { 'List-Unsubscribe': UNSUB },
    })
    expect(sentEnvelopes[0]?.headers).not.toHaveProperty('List-Unsubscribe-Post')
  })
})
