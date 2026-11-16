import { describe, expect, it } from 'vitest'
import { buildCustomDomainNoticeMail, customDomainNoticeBellBody, formatNoticeDate } from '../shared/customDomainNoticeMail'

/**
 * BE-014 — die zwei Hinweis-Mails zur Frist der eigenen Domain. Jede muss
 * vier Dinge tragen: Name + Domain, das DATUM des Abschaltens, „nichts wird
 * gelöscht" samt Pukalani-Adresse, und den Weg zurück (Plan-Seite mit dem
 * richtigen Sprach-Präfix, IMMER auf der Pukalani-Adresse).
 */

const BASE = {
  name: 'Surfclub',
  host: 'surfclub.pukalani.app',
  domain: 'surfclub.de',
  graceEndsAt: '2026-11-30T12:00:00.000Z',
}

describe('formatNoticeDate', () => {
  it('schreibt den Tag aus, in UTC', () => {
    expect(formatNoticeDate(BASE.graceEndsAt, true)).toBe('30. November 2026')
    expect(formatNoticeDate(BASE.graceEndsAt, false)).toBe('November 30, 2026')
    // 23:30 UTC bleibt der 1. März, egal in welcher Zone der Server läuft.
    expect(formatNoticeDate('2027-03-01T23:30:00.000Z', true)).toBe('1. März 2027')
  })
  it('unlesbar ⇒ leer', () => {
    expect(formatNoticeDate('bald', true)).toBe('')
  })
})

describe('buildCustomDomainNoticeMail', () => {
  it('start, deutsch: Betreff, Name, Domain, Datum, Pukalani-Adresse, Plan-Link unter /de', () => {
    const mail = buildCustomDomainNoticeMail({ ...BASE, kind: 'start', locale: 'de' })
    expect(mail.subject).toBe('Deine Domain surfclub.de bleibt noch bis zum 30. November 2026 aktiv')
    expect(mail.text).toContain('Surfclub')
    expect(mail.text).toContain('14 Tage')
    expect(mail.text).toContain('Es wird nichts gelöscht')
    expect(mail.text).toContain('https://surfclub.pukalani.app')
    expect(mail.text).toContain('https://surfclub.pukalani.app/de/dashboard/community/plan')
  })

  it('start, englisch: Plan-Link ohne Präfix', () => {
    const mail = buildCustomDomainNoticeMail({ ...BASE, kind: 'start', locale: 'en' })
    expect(mail.subject).toBe('Your domain surfclub.de stays active until November 30, 2026')
    expect(mail.text).toContain('Surfclub')
    expect(mail.text).toContain('Nothing is deleted')
    expect(mail.text).toContain('https://surfclub.pukalani.app/dashboard/community/plan')
    expect(mail.text).not.toContain('/de/')
  })

  it('ending, beide Sprachen: Betreff und Datum', () => {
    const de = buildCustomDomainNoticeMail({ ...BASE, kind: 'ending', locale: 'de' })
    expect(de.subject).toBe('In drei Tagen schalten wir surfclub.de ab')
    expect(de.text).toContain('am 30. November 2026 schalten wir deine Domain surfclub.de ab')
    expect(de.text).toContain('https://surfclub.pukalani.app/de/dashboard/community/plan')
    const en = buildCustomDomainNoticeMail({ ...BASE, kind: 'ending', locale: 'en' })
    expect(en.subject).toBe('We will switch off surfclub.de in three days')
    expect(en.text).toContain('On November 30, 2026')
    expect(en.text).toContain('Surfclub')
  })

  it('verlinkt NIE die eigene Domain', () => {
    for (const kind of ['start', 'ending'] as const) {
      for (const locale of ['de', 'en']) {
        const { text } = buildCustomDomainNoticeMail({ ...BASE, kind, locale })
        expect(text).not.toMatch(/https?:\/\/(www\.)?surfclub\.de/)
      }
    }
  })

  it('ohne Namen steht der Host; keine spitzen Klammern im Text', () => {
    const mail = buildCustomDomainNoticeMail({ ...BASE, name: '', kind: 'start', locale: 'de' })
    expect(mail.text).toContain('der Pro-Plan von surfclub.pukalani.app')
    for (const kind of ['start', 'ending'] as const) {
      for (const locale of ['de', 'en']) {
        const { subject, text } = buildCustomDomainNoticeMail({ ...BASE, kind, locale })
        expect(`${subject}\n${text}`).not.toMatch(/[<>]/)
      }
    }
  })

  it('lokaler Host spricht http', () => {
    const mail = buildCustomDomainNoticeMail({ ...BASE, host: 'kunde-a.localhost', kind: 'start', locale: 'en' })
    expect(mail.text).toContain('http://kunde-a.localhost/dashboard/community/plan')
  })
})

describe('customDomainNoticeBellBody', () => {
  it('kurz, mit Domain und Datum, in der Sprache des Empfängers', () => {
    expect(customDomainNoticeBellBody({ kind: 'start', locale: 'de', domain: 'surfclub.de', graceEndsAt: BASE.graceEndsAt }))
      .toContain('bis zum 30. November 2026')
    expect(customDomainNoticeBellBody({ kind: 'ending', locale: 'en', domain: 'surfclub.de', graceEndsAt: BASE.graceEndsAt }))
      .toBe('On November 30, 2026 the domain surfclub.de will be switched off. With the Pro plan it stays active.')
  })
})
