import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `sendMail()` LÄSST EINE MAIL IHREN EIGENEN ABSENDER NENNEN (RS1, 2026-11-09).
 *
 * Gebraucht wird es für genau einen Fall: der Newsletter von branding.supply
 * geht über eine eigene, eigens verifizierte Versand-Subdomain, damit eine
 * Beschwerde über die Massenmail nicht die Zustellung der Anmelde-Mail
 * beschädigt. Geprüft werden die drei Zusagen, die der Typ NICHT hält:
 *
 *  1. Ein gesetztes `from` gewinnt gegen `NUXT_SMTP_FROM` — und kommt
 *     UNVERÄNDERT an, auch in der Form `Name <adresse>`: wird der Wert
 *     irgendwo normalisiert, verliert der Anzeigename seine Klammern.
 *  2. OHNE `from` steht weiter die Einstellung im Umschlag. Das ist die
 *     Gegenprobe — ohne sie wäre Punkt 1 auch dann grün, wenn das Feld
 *     versehentlich zum neuen Default geworden wäre.
 *  3. Ein LEERER String zählt wie keiner. Sonst hinge am Aufrufer die Pflicht,
 *     `undefined` statt `''` zu übergeben, und eine nicht gesetzte Config
 *     (Layer-Default `''`) schickte die Mail ohne Absender los.
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
  smtpFrom: 'noreply@example.test',
}
vi.stubGlobal('useRuntimeConfig', () => config)
vi.stubGlobal('readInstanceSecret', async () => '')

const { __resetMailerWarnings, sendMail } = await import('../server/utils/mailer')

describe('sendMail — Absender je Mail', () => {
  beforeEach(() => {
    sentEnvelopes.length = 0
    __resetMailerWarnings()
  })

  it('nimmt den Absender der MAIL, wenn sie einen nennt — mit Anzeigename', async () => {
    expect(await sendMail(undefined, {
      to: 'leser@example.test',
      subject: 'Neues Stück',
      text: 'Text',
      from: 'Brand Insights <insights@mail.branding.supply>',
    })).toBe(true)
    expect(sentEnvelopes[0]?.from).toBe('Brand Insights <insights@mail.branding.supply>')
  })

  it('nimmt ohne eigenen Absender weiter die Einstellung — die Gegenprobe', async () => {
    expect(await sendMail(undefined, {
      to: 'leser@example.test',
      subject: 'Kontobestätigung',
      text: 'Text',
    })).toBe(true)
    expect(sentEnvelopes[0]?.from).toBe('noreply@example.test')
  })

  it('behandelt einen leeren Absender wie keinen', async () => {
    expect(await sendMail(undefined, {
      to: 'leser@example.test',
      subject: 'Kontobestätigung',
      text: 'Text',
      from: '',
    })).toBe(true)
    expect(sentEnvelopes[0]?.from).toBe('noreply@example.test')
  })
})
