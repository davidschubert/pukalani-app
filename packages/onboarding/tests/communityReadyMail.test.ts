import { describe, expect, it } from 'vitest'
import { buildCommunityReadyMail, formatMailDate } from '../shared/communityReadyMail'
import { resolveMailLocale } from '../../core/shared/mailFrame'

const BASE = {
  siteName: 'Chorverein Wetzlar',
  host: 'chor-wetzlar.pukalani.app',
  accountHost: 'account.pukalani.app',
  trialEndsAt: '2026-08-26T09:15:00.000Z',
  brand: 'Testmarke',
}

describe('formatMailDate', () => {
  it('deutsch TT.MM.JJJJ, englisch JJJJ-MM-TT', () => {
    expect(formatMailDate('2026-08-26T09:15:00.000Z', true)).toBe('26.08.2026')
    expect(formatMailDate('2026-08-26T09:15:00.000Z', false)).toBe('2026-08-26')
  })
  it('unlesbares Datum ⇒ leer (der Absatz entfällt, die Mail geht trotzdem)', () => {
    expect(formatMailDate('irgendwann', true)).toBe('')
  })
})

describe('buildCommunityReadyMail', () => {
  it('deutsch: Adresse, Dashboard mit /de-Prefix, Kundenbereich, Testphasen-Ende', () => {
    const mail = buildCommunityReadyMail({ ...BASE, locale: 'de' })
    expect(mail.subject).toBe('Deine Community steht: Chorverein Wetzlar')
    expect(mail.text).toContain('https://chor-wetzlar.pukalani.app')
    expect(mail.text).toContain('https://chor-wetzlar.pukalani.app/de/dashboard')
    expect(mail.text).toContain('https://account.pukalani.app/de')
    expect(mail.text).toContain('26.08.2026')
  })
  it('englisch: kein Sprach-Prefix (prefix_except_default)', () => {
    const mail = buildCommunityReadyMail({ ...BASE, locale: 'en' })
    expect(mail.subject).toBe('Your community is live: Chorverein Wetzlar')
    expect(mail.text).toContain('https://chor-wetzlar.pukalani.app/dashboard')
    expect(mail.text).not.toContain('/de/dashboard')
    expect(mail.text).toContain('2026-08-26')
  })
  it('Sprach-Regel (Q06): Konto, sonst Wizard, sonst Englisch — kein Rückfall auf Deutsch mehr', () => {
    expect(resolveMailLocale({ account: 'de', request: 'en' })).toBe('de')
    expect(resolveMailLocale({ account: undefined, request: 'de' })).toBe('de')
    expect(resolveMailLocale({ account: undefined, request: 'fr' })).toBe('en')
    expect(resolveMailLocale({ account: undefined, request: null })).toBe('en')
  })
  it('Rahmen (Q06): Anrede mit Namen, Schluss mit der Marke — de + en', () => {
    const de = buildCommunityReadyMail({ ...BASE, locale: 'de', name: 'Lea' })
    expect(de.text.startsWith('Hallo Lea,\n\n')).toBe(true)
    expect(de.text).toContain('Viele Grüße\nTestmarke')
    const en = buildCommunityReadyMail({ ...BASE, locale: 'en' })
    expect(en.text.startsWith('Hi,\n\n')).toBe(true)
    expect(en.text).toContain('Best regards\nTestmarke')
  })
  it('ohne Testphase entfällt der Absatz — der Rest bleibt vollständig', () => {
    const mail = buildCommunityReadyMail({ ...BASE, trialEndsAt: null, locale: 'de' })
    expect(mail.text).not.toContain('Testphase')
    expect(mail.text).toContain('https://chor-wetzlar.pukalani.app/de/dashboard')
    expect(mail.text).toContain('https://account.pukalani.app/de')
  })
  it('ohne Testphase (BE-015): kein Enddatum, dafür der Weg zum Plan — de + en', () => {
    const de = buildCommunityReadyMail({ ...BASE, trialEndsAt: null, locale: 'de' })
    expect(de.text).not.toContain('26.08.2026')
    expect(de.text).toContain('braucht die Community ein Abo')
    expect(de.text).toContain('https://chor-wetzlar.pukalani.app/de/dashboard/community/plan')
    const en = buildCommunityReadyMail({ ...BASE, trialEndsAt: null, locale: 'en' })
    expect(en.text).not.toContain('trial')
    expect(en.text).toContain('needs a subscription')
    expect(en.text).toContain('https://chor-wetzlar.pukalani.app/dashboard/community/plan')
  })
  it('mit Testphase steht der Plan-Satz NICHT drin (Gegenprobe)', () => {
    const mail = buildCommunityReadyMail({ ...BASE, locale: 'de' })
    expect(mail.text).not.toContain('braucht die Community ein Abo')
    expect(mail.text).not.toContain('/dashboard/community/plan')
  })
  it('lokale Hosts bekommen http statt https (Dev/Beweisläufe)', () => {
    const mail = buildCommunityReadyMail({
      ...BASE, host: 'kunde-a.localhost:3002', accountHost: 'app.localhost:3002', locale: 'en',
    })
    expect(mail.text).toContain('http://kunde-a.localhost:3002/dashboard')
    expect(mail.text).toContain('http://app.localhost:3002')
    expect(mail.text).not.toContain('https://')
  })
})
