import type { H3Event } from 'h3'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Q06 — die Mails des Control Plane laufen durch den EINEN Rahmen
 * (`core/shared/mailFrame.ts`): Anrede vorne, Schluss-Zeile mit der Marke aus
 * `resolveMailBrand` (control: `pukalani.brand.mailName`), Sprache nach
 * `resolveMailLocale` (ohne Angabe Englisch, nicht mehr Deutsch).
 */

const sent: { to: string, subject: string, text: string }[] = []
const event = { context: {}, node: { req: { headers: { host: 'control.example' } } } } as unknown as H3Event

type InviteMod = typeof import('../server/utils/inviteMail')
type CommunityInviteMod = typeof import('../server/utils/communityInviteMail')
type RequestsMod = typeof import('../server/utils/inviteRequests')
type AbuseMod = typeof import('../server/utils/abuseReports')
let inviteMail: InviteMod
let communityInviteMail: CommunityInviteMod
let requests: RequestsMod
let abuse: AbuseMod

beforeAll(async () => {
  vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: { name: 'Pukalani Control', mailName: 'Testmarke' } } }))
  vi.stubGlobal('useRuntimeConfig', () => ({ onboardingStartUrl: 'https://start.example', alertEmail: 'ops@example.test', public: { appUrl: 'https://control.example' } }))
  vi.stubGlobal('sendMail', async (_event: unknown, input: { to: string, subject: string, text: string }) => {
    sent.push(input)
    return true
  })
  vi.stubGlobal('createAdminClient', () => ({ users: { list: async () => ({ users: [] }) } }))
  vi.stubGlobal('notify', async () => ({ created: true }))
  vi.stubGlobal('logEvent', () => {})
  inviteMail = await import('../server/utils/inviteMail')
  communityInviteMail = await import('../server/utils/communityInviteMail')
  requests = await import('../server/utils/inviteRequests')
  abuse = await import('../server/utils/abuseReports')
})

beforeEach(() => {
  sent.length = 0
})

describe('Einladungs-Code (inviteMail)', () => {
  it('de: Anrede, Satz beginnt groß, Schluss mit der Marke', async () => {
    await inviteMail.sendInviteMail(event, { to: 'a@example.test', code: 'ABC', locale: 'de', reminder: false })
    expect(sent[0]!.text.startsWith('Hallo,\n\nDu bist eingeladen')).toBe(true)
    expect(sent[0]!.text).toContain('Viele Grüße\nTestmarke')
  })

  it('ohne Sprache: Englisch (Q06, früher Deutsch)', async () => {
    await inviteMail.sendInviteMail(event, { to: 'a@example.test', code: 'ABC', locale: '', reminder: true })
    expect(sent[0]!.subject).toBe('Your Pukalani invite code (new)')
    expect(sent[0]!.text.startsWith('Hi,\n\nHere is a new invite code')).toBe(true)
    expect(sent[0]!.text).toContain('Best regards\nTestmarke')
  })
})

describe('Einladung in eine Community (communityInviteMail)', () => {
  it('de: Anrede, Schluss mit der Marke', async () => {
    await communityInviteMail.sendCommunityInviteMail(event, { to: 'a@example.test', siteName: 'Morgenlicht', host: 'kunde-a.example', token: 't', role: 'viewer', locale: 'de', invitedByName: 'Lea' })
    expect(sent[0]!.text.startsWith('Hallo,\n\nLea lädt dich')).toBe(true)
    expect(sent[0]!.text).toContain('Viele Grüße\nTestmarke')
  })

  it('unbekannte Sprache: Englisch', async () => {
    await communityInviteMail.sendCommunityInviteMail(event, { to: 'a@example.test', siteName: 'Morgenlicht', host: 'kunde-a.example', token: 't', role: 'viewer', locale: 'fr', invitedByName: '' })
    expect(sent[0]!.text.startsWith('Hi,\n\nYou have been invited')).toBe(true)
    expect(sent[0]!.text).toContain('https://kunde-a.example/join?token=t')
  })
})

describe('Betreiber-Mails: deutsch, ohne Namen, im Rahmen', () => {
  it('Early-Access-Anfrage', async () => {
    await requests.notifyOperators(event, { email: 'x@example.test', note: 'Bitte' } as Parameters<RequestsMod['notifyOperators']>[1])
    expect(sent[0]!.subject).toBe('[pukalani] Early-Access-Anfrage von x@example.test')
    expect(sent[0]!.text.startsWith('Hallo,\n\nx@example.test möchte Early Access.')).toBe(true)
    expect(sent[0]!.text).toContain('Viele Grüße\nTestmarke')
  })

  it('Missbrauchsmeldung', async () => {
    await abuse.notifyOperatorsAboutAbuse(event, { host: 'kunde-a.example', communityName: null, category: 'spam', url: '', message: 'Spam hier' } as unknown as Parameters<AbuseMod['notifyOperatorsAboutAbuse']>[1])
    expect(sent[0]!.subject).toBe('[pukalani] Missbrauchsmeldung zu kunde-a.example')
    expect(sent[0]!.text.startsWith('Hallo,\n\nGemeldet: kunde-a.example')).toBe(true)
    expect(sent[0]!.text).toContain('Spam hier')
    expect(sent[0]!.text).toContain('Viele Grüße\nTestmarke')
  })
})
