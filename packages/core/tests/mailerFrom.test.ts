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

/** Jede Anlage eines Transporters, mit den Zugangsdaten, die sie bekam. */
const builtTransports: Record<string, unknown>[] = []

vi.mock('nodemailer', () => ({
  createTransport: (options: Record<string, unknown>) => (builtTransports.push(options), {
    sendMail: async (envelope: Record<string, unknown>) => {
      sentEnvelopes.push(envelope)
      return { messageId: 'test' }
    },
    // `close()` gehört dazu, seit der Mailer mehrere Zugänge puffert: er
    // schliesst einen verdrängten Transporter, damit dessen Verbindungspool
    // nicht offen bleibt. Ein Mock ohne diese Methode wäre nicht „schlanker",
    // sondern eine Attrappe, die einen echten Aufruf nicht aushält.
    close: () => {},
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
    builtTransports.length = 0
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

/**
 * EIGENE ZUGANGSDATEN FÜR EINE MAIL (RS1 e, 2026-11-09).
 *
 * Gemessen hat es diesen Test erzwungen: ein Resend-Schlüssel, der an eine
 * Domain gebunden ist, antwortet auf einen fremden Absender mit 403. Ein
 * eigener `from` ohne eigenen Schlüssel ist also nicht die halbe Lösung,
 * sondern gar keine — deshalb muss der Zugang bis an den Transport reisen.
 *
 * Geprüft wird, was der Typ nicht hält: dass die Zugangsdaten wirklich beim
 * Transport ankommen, dass sie den HOST nicht mitverändern (sonst wäre das
 * Feld eine Hintertür an der Mailer-Konfiguration vorbei), und dass der
 * Puffer zwei Zugänge auseinanderhält statt sie sich gegenseitig verdrängen
 * zu lassen.
 */
describe('sendMail — Zugangsdaten je Mail', () => {
  beforeEach(() => {
    sentEnvelopes.length = 0
    builtTransports.length = 0
    __resetMailerWarnings()
  })

  it('meldet sich mit dem mitgegebenen Passwort an — und behält Host und Port', async () => {
    expect(await sendMail(undefined, {
      to: 'leser@example.test',
      subject: 'Ausgabe',
      text: 'Text',
      from: 'insights@mail.branding.supply',
      auth: { pass: 're_newsletter' },
    })).toBe(true)
    expect(builtTransports).toHaveLength(1)
    expect(builtTransports[0]).toMatchObject({
      host: 'smtp.example.test',
      port: 587,
      auth: { user: '', pass: 're_newsletter' },
    })
  })

  it('nimmt ohne Zugangsdaten die der Einstellung — die Gegenprobe', async () => {
    expect(await sendMail(undefined, { to: 'a@example.test', subject: 'S', text: 'T' })).toBe(true)
    expect(builtTransports).toHaveLength(1)
    // Kein `auth` im Umschlag: die Einstellung hat hier keinen Benutzer, und
    // ein leeres `auth` wäre eine Anmeldung, die niemand beschlossen hat.
    expect(builtTransports[0]?.auth).toBeUndefined()
  })

  it('hält zwei Zugänge NEBENEINANDER im Puffer — nicht abwechselnd', async () => {
    const mail = (pass?: string) => sendMail(undefined, {
      to: 'a@example.test',
      subject: 'S',
      text: 'T',
      ...(pass ? { auth: { pass } } : {}),
    })
    await mail('re_newsletter')
    await mail()
    await mail('re_newsletter')
    await mail()
    // Vier Mails, aber nur ZWEI Anlagen: hätte der Puffer weiter nur einen
    // Platz, wäre für jede Mail eine neue SMTP-Verbindung entstanden.
    expect(builtTransports).toHaveLength(2)
  })
})
