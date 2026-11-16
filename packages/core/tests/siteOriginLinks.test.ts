import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalPluginOrigin } from '../shared/seoOrigin'

/**
 * EIGENE DOMAIN EINER EINZEL-SITE IN MAILS UND LINKS (seit 2026-11-16).
 *
 * Die Reset-Mail und der OAuth-Rückweg stehen in trustedOrigin.test.ts. Hier
 * die übrigen Stellen, die vorher `appUrl` direkt lasen: Verifizierungs-Mail
 * (Banner-Knopf und nach der Registrierung), Sofort-Benachrichtigung, Digest —
 * und das canonical-Plugin. Gemessen wird jeweils, was an Appwrite bzw. an
 * `sendMail` geht, nicht eine Hilfsfunktion.
 */

const SITE = 'https://pukalani.studio'
const STANDARD = 'https://portfolio.pukalani.app'

let appUrl = STANDARD
let verificationOn = true
const createVerification = vi.fn(async (_input: { url: string }) => ({}))
const sentMails: { to: string, text: string, html: string }[] = []
const unreadRows: Record<string, unknown>[] = []
const recipient = {
  $id: 'u-1',
  email: 'person@example.org',
  emailVerification: true,
  prefs: { emailNotifications: 'instant', emailLocale: 'de' } as Record<string, unknown>,
}

vi.mock('node-appwrite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node-appwrite')>()
  class FakeClient {
    setEndpoint() { return this }
    setProject() { return this }
    setSession() { return this }
    setLocale() { return this }
  }
  class FakeAccount {
    createVerification = createVerification
  }
  return { ...actual, Client: FakeClient, Account: FakeAccount }
})

vi.mock('../server/lib/appwrite', () => ({
  createSessionClient: () => ({ account: { createVerification } }),
  createAdminClient: () => adminClient(),
  requestLocale: () => null,
  setSessionCookie: () => {},
}))

function adminClient() {
  return {
    account: {
      create: async () => ({}),
      createEmailPasswordSession: async () => ({ secret: 's', expire: '', userId: 'u-new' }),
    },
    users: {
      get: async () => recipient,
      list: async () => ({ total: 1, users: [] }),
      updatePrefs: async () => ({}),
    },
    tablesDB: {
      listRows: async () => ({ total: unreadRows.length, rows: unreadRows }),
    },
  }
}

interface FakeEvent {
  host: string
  body?: unknown
  context: Record<string, unknown>
}

type Handler = (event: FakeEvent) => Promise<unknown>
let verification: Handler
let signup: Handler
let siteOrigin: typeof import('../server/utils/siteOrigin')
let instant: typeof import('../server/utils/notificationEmail')
let digest: typeof import('../server/utils/emailDigest')

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appUrl, appwriteEndpoint: 'http://aw', appwriteProjectId: 'p', appwriteDatabaseId: 'db' } }))
  vi.stubGlobal('useAppConfig', () => ({ pukalani: { auth: { verification: verificationOn } } }))
  vi.stubGlobal('createError', (input: { status: number, statusText: string }) =>
    Object.assign(new Error(input.statusText), { status: input.status }))
  vi.stubGlobal('readValidatedBody', async (event: FakeEvent, parse: (body: unknown) => unknown) => parse(event.body))
  // Registrierung: alles, was nicht die Adresse ist, lässt den Weg offen.
  vi.stubGlobal('getAppConfig', async () => ({ maintenanceMode: false, registrationEnabled: true }))
  vi.stubGlobal('hasSignupAdmissionProvider', () => false)
  vi.stubGlobal('signupAdmissionOpensRegistration', async () => true)
  vi.stubGlobal('tenantRegistrationOpen', () => true)
  vi.stubGlobal('inviteOpensRegistrationFor', async () => true)
  vi.stubGlobal('requireTurnstile', async () => {})
  vi.stubGlobal('rememberKnownDevice', () => {})
  vi.stubGlobal('logAuthEvent', async () => {})
  vi.stubGlobal('joinCommunity', async () => {})
  vi.stubGlobal('recordTermsAcceptance', async () => {})
  vi.stubGlobal('recordBusinessConfirmation', async () => {})
  vi.stubGlobal('recordActivity', async () => {})
  vi.stubGlobal('maybeRecordMilestone', async () => {})
  // Mails — beide Helfer nehmen den Admin-Client per Auto-Import
  vi.stubGlobal('createAdminClient', () => adminClient())
  vi.stubGlobal('mailerConfigured', async () => true)
  vi.stubGlobal('warnMailerMissingOnce', () => {})
  vi.stubGlobal('resolveNotificationText', (text: string) => text)
  vi.stubGlobal('notificationMailedSeparately', () => false)
  vi.stubGlobal('sendMail', async (_event: unknown, mail: { to: string, text: string, html: string }) => {
    sentMails.push(mail)
  })

  siteOrigin = await import('../server/utils/siteOrigin')
  verification = (await import('../server/api/auth/verification.post')).default as unknown as Handler
  signup = (await import('../server/api/auth/signup.post')).default as unknown as Handler
  instant = await import('../server/utils/notificationEmail')
  // Der Digest nimmt diese beiden per Auto-Import — hier die echten.
  vi.stubGlobal('resolveEmailPrefs', instant.resolveEmailPrefs)
  vi.stubGlobal('buildDigestEmail', instant.buildDigestEmail)
  digest = await import('../server/utils/emailDigest')
})

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  appUrl = STANDARD
  verificationOn = true
  createVerification.mockClear()
  sentMails.length = 0
  unreadRows.length = 0
  recipient.prefs = { emailNotifications: 'instant', emailLocale: 'de' }
  siteOrigin.__resetSiteOriginResolver()
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

const userEvent = (host = 'evil.example'): FakeEvent => ({
  host, context: { user: { $id: 'u-1', emailVerification: false } },
})
const signupEvent = (host = 'evil.example'): FakeEvent => ({
  host,
  context: {},
  body: { email: 'neu@example.org', password: 'Gutes-Passw0rt', name: 'Neu' },
})

describe('resolveSiteOrigin / resolveSiteLinkBase', () => {
  it('ohne Resolver ⇒ null bzw. appUrl ohne Schluss-Slash', async () => {
    appUrl = `${STANDARD}/`
    expect(await siteOrigin.resolveSiteOrigin()).toBeNull()
    expect(await siteOrigin.resolveSiteLinkBase()).toBe(STANDARD)
  })

  it('nur http(s)-Origins kommen durch, ein Pfad fällt weg', async () => {
    siteOrigin.registerSiteOriginResolver(() => `${SITE}/irgendwas`)
    expect(await siteOrigin.resolveSiteOrigin()).toBe(SITE)
    siteOrigin.__resetSiteOriginResolver()
    siteOrigin.registerSiteOriginResolver(() => 'javascript:alert(1)')
    expect(await siteOrigin.resolveSiteOrigin()).toBeNull()
    expect(await siteOrigin.resolveSiteLinkBase()).toBe(STANDARD)
  })

  it('ohne beides ⇒ leer', async () => {
    appUrl = ''
    expect(await siteOrigin.resolveSiteLinkBase()).toBe('')
  })
})

describe('Verifizierungs-Mail (Banner-Knopf)', () => {
  it('aktive eigene Domain ⇒ der Link beginnt mit ihr, auch bei `Host: evil.example`', async () => {
    siteOrigin.registerSiteOriginResolver(() => SITE)
    await verification(userEvent())
    expect(createVerification.mock.calls[0]![0].url).toBe(`${SITE}/verify`)
  })

  it('ohne eigene Domain ⇒ wie bisher appUrl', async () => {
    siteOrigin.registerSiteOriginResolver(() => null)
    await verification(userEvent())
    expect(createVerification.mock.calls[0]![0].url).toBe(`${STANDARD}/verify`)
  })

  it('ohne beides ⇒ weiter 503, ohne Aufruf bei Appwrite', async () => {
    appUrl = ''
    await expect(verification(userEvent())).rejects.toMatchObject({ status: 503 })
    expect(createVerification).not.toHaveBeenCalled()
  })
})

describe('Verifizierungs-Mail nach der Registrierung', () => {
  it('aktive eigene Domain ⇒ der Link beginnt mit ihr', async () => {
    siteOrigin.registerSiteOriginResolver(() => SITE)
    expect(await signup(signupEvent())).toEqual({ ok: true })
    expect(createVerification.mock.calls[0]![0].url).toBe(`${SITE}/verify`)
  })

  it('ohne eigene Domain ⇒ appUrl', async () => {
    await signup(signupEvent())
    expect(createVerification.mock.calls[0]![0].url).toBe(`${STANDARD}/verify`)
  })

  it('ohne eigene Domain UND ohne appUrl ⇒ der Zweig wird übersprungen, die Registrierung gelingt', async () => {
    appUrl = ''
    expect(await signup(signupEvent())).toEqual({ ok: true })
    expect(createVerification).not.toHaveBeenCalled()
  })

  it('Verifizierung aus ⇒ kein Aufruf, auch mit eigener Domain', async () => {
    verificationOn = false
    siteOrigin.registerSiteOriginResolver(() => SITE)
    await signup(signupEvent())
    expect(createVerification).not.toHaveBeenCalled()
  })
})

describe('Benachrichtigungs-Mails einer Einzel-Site', () => {
  const input = { recipientId: 'u-1', type: 'reply', title: 'Jemand', body: 'Hallo', link: '/beitrag/1', scope: 'tenant' as const }

  it('Sofort-Mail verlinkt die eigene Domain', async () => {
    siteOrigin.registerSiteOriginResolver(() => SITE)
    await instant.maybeSendInstantEmail(undefined, input, '')
    expect(sentMails).toHaveLength(1)
    expect(sentMails[0]!.text).toContain(`${SITE}/beitrag/1`)
    expect(sentMails[0]!.text).not.toContain(STANDARD)
  })

  it('Sofort-Mail ohne eigene Domain ⇒ appUrl wie bisher', async () => {
    await instant.maybeSendInstantEmail(undefined, input, '')
    expect(sentMails[0]!.text).toContain(`${STANDARD}/beitrag/1`)
  })

  it('Digest — ein Lauf OHNE Anfrage — verlinkt die eigene Domain; der Resolver bekommt kein Event', async () => {
    const events: unknown[] = []
    siteOrigin.registerSiteOriginResolver((event) => {
      events.push(event)
      return SITE
    })
    recipient.prefs = { emailNotifications: 'digest', emailLocale: 'de' }
    unreadRows.push({
      $id: 'n-1', $createdAt: new Date().toISOString(), recipientId: 'u-1', type: 'reply',
      title: 'Jemand', body: 'Hallo', link: '/beitrag/2', read: false, communityId: '',
    })
    const result = await digest.runEmailDigestSweep()
    expect(result.sent).toBe(1)
    expect(sentMails[0]!.text).toContain(`${SITE}/beitrag/2`)
    expect(events).toEqual([undefined])
  })
})

describe('canonicalPluginOrigin', () => {
  const base = { requestOrigin: 'http://pukalani.studio', appUrl: STANDARD, i18nBaseUrl: STANDARD }

  it('Gate an (Einzel-Site mit eigener Domain, nach dem 301): Host der Anfrage, Schema aus der Env', () => {
    expect(canonicalPluginOrigin({ ...base, originFromRequest: true })).toBe(SITE)
  })

  it('Gate an: dieselbe Basis wie useLocaleSeoHead — beide canonical-Einträge sind gleich', () => {
    // Ohne eigene Domain ist der Host der Anfrage die Standard-Adresse.
    expect(canonicalPluginOrigin({ ...base, requestOrigin: 'http://portfolio.pukalani.app', originFromRequest: true })).toBe(STANDARD)
  })

  it('Gate aus: unverändert appUrl, im Dev ohne appUrl die Anfrage', () => {
    expect(canonicalPluginOrigin({ ...base, originFromRequest: false })).toBe(STANDARD)
    expect(canonicalPluginOrigin({ ...base, appUrl: '', originFromRequest: false })).toBe('http://pukalani.studio')
  })
})
