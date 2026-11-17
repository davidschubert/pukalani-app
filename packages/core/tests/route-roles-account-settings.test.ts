import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  describeAccountRoute,
  probeRoute,
  resetCommunityWorld,
  userIdOf,
} from './support/participationHarness'
import { appwriteFake } from './support/appwriteFake'
import { coreKit } from './support/coreRouteKit'
import { __resetConsentRecords, consentRowId } from '../server/utils/consentRecords'

/**
 * KONTO-EINSTELLUNGEN — ROLLEN-TESTS AN DER ECHTEN ROUTE (OPS-009, BT1 b).
 *
 * Diese Routen gehören dem KONTO, nicht einer Community: angemeldet genügt,
 * ein Rollen- oder Mitgliedschafts-Tor wäre falsch. Die Entscheidung, die
 * hier zählt, ist „nur das eigene Konto": geschrieben wird über den
 * SESSION-Klienten (Appwrite grenzt selbst auf das angemeldete Konto ein),
 * und wo der ADMIN-Klient nötig ist, steht die Konto-Id aus der Sitzung —
 * nie aus der Anfrage.
 *
 * Echter Handler, echte Schemas, echte Hilfen; nachgebildet sind nur die
 * Appwrite-Klienten (`support/appwriteFake.ts`) und die Laufzeit-Config.
 */

vi.mock('../server/lib/appwrite', async () => (await import('./support/appwriteFake')).appwriteLibMock)

const handles = vi.hoisted(() => ({
  ensured: [] as string[],
  audience: [] as string[],
  changed: [] as Array<{ userId: string, handle: string }>,
}))

vi.mock('../server/utils/accountHandles', () => ({
  activeAccountHandleRow: async () => null,
  ensureAccountHandle: async (_event: unknown, userId: string) => {
    handles.ensured.push(userId)
  },
  ensureAccountHandleAudience: async (_event: unknown, userId: string) => {
    handles.audience.push(userId)
  },
  changeAccountHandle: async (_event: unknown, userId: string, handle: string) => {
    handles.changed.push({ userId, handle })
    return { handle, handleLower: handle.toLowerCase(), changedAt: '' }
  },
}))

beforeEach(() => {
  appwriteFake.reset()
  __resetConsentRecords()
  handles.ensured.length = 0
  handles.audience.length = 0
  handles.changed.length = 0
})

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

const OWN_PREFS = { timezone: 'Europe/Berlin', bio: 'alt', emailNotifications: 'digest' }

// ── Wer bin ich? ────────────────────────────────────────────────────────────

describeAccountRoute('GET /api/auth/me', () => import('../server/api/auth/me.get'))

describe('GET /api/auth/me — antwortet mit dem Konto der Sitzung', () => {
  it('liefert das eigene Konto', async () => {
    const run = await probeRoute(() => import('../server/api/auth/me.get'), { who: 'stranger' })
    expect(run.status).toBe(200)
    expect(run.result).toMatchObject({ $id: userIdOf('stranger') })
  })
})

// ── Abmelden ────────────────────────────────────────────────────────────────

describe('POST /api/auth/logout — beendet nur die eigene, aktuelle Sitzung', () => {
  const load = () => import('../server/api/auth/logout.post')

  it('ohne Konto: kein Protokoll-Eintrag, nur das Cookie fällt', async () => {
    const kit = coreKit()
    const run = await probeRoute(load, { who: 'guest', globals: kit.globals })
    expect(run.status).toBe(200)
    expect(kit.record.authEvents).toEqual([])
    expect(appwriteFake.used('admin')).toBe(false)
    expect(appwriteFake.cookiesCleared()).toBe(1)
  })

  it('angemeldet: Sitzung „current" über den Session-Klienten, protokolliert mit der eigenen Id', async () => {
    const kit = coreKit()
    const run = await probeRoute(load, { who: 'member', body: { sessionId: 's-fremd' }, globals: kit.globals })
    expect(run.status).toBe(200)
    expect(appwriteFake.argsOf('session.account.deleteSession')).toEqual([{ sessionId: 'current' }])
    expect(appwriteFake.used('admin')).toBe(false)
    expect(kit.record.authEvents.map(e => e.data.userId)).toEqual([userIdOf('member')])
  })
})

// ── Profil, Passwort, Einstellungen ─────────────────────────────────────────

const PROFILE_BODY = { name: 'Neuer Name', phone: '+4915100000000', bio: 'neu' }

describeAccountRoute('PUT /api/auth/profile', () => import('../server/api/auth/profile.put'), {
  body: PROFILE_BODY,
  userFields: { prefs: OWN_PREFS },
  globals: { ...coreKit().globals, avatarFileId: () => '' },
})

describe('PUT /api/auth/profile — schreibt nur das eigene Profil', () => {
  it('Name und Prefs über den Session-Klienten, Telefon per Admin nur für die eigene Id', async () => {
    const run = await probeRoute(() => import('../server/api/auth/profile.put'), {
      who: 'stranger',
      body: { ...PROFILE_BODY, userId: userIdOf('member') },
      userFields: { prefs: OWN_PREFS },
      globals: { ...coreKit().globals, avatarFileId: () => '' },
    })
    expect(run.status).toBe(200)
    expect(appwriteFake.argsOf('session.account.updateName')).toEqual([{ name: 'Neuer Name' }])
    expect(appwriteFake.argsOf('admin.users.updatePhone')).toEqual([{ userId: userIdOf('stranger'), number: '+4915100000000' }])
    const [prefs] = appwriteFake.argsOf('session.account.updatePrefs')
    expect(prefs?.prefs).toMatchObject({ timezone: 'Europe/Berlin', bio: 'neu' })
  })
})

const PASSWORD_BODY = { currentPassword: 'altes-wort', password: 'Probe-Wort-1x' }

describeAccountRoute('PUT /api/auth/password', () => import('../server/api/auth/password.put'), {
  body: PASSWORD_BODY,
  globals: coreKit().globals,
})

describe('PUT /api/auth/password — das aktuelle Passwort entscheidet', () => {
  const load = () => import('../server/api/auth/password.put')

  it('richtiges aktuelles Passwort: ändert und beendet nur die ANDEREN eigenen Sitzungen', async () => {
    appwriteFake.reply('session.account.listSessions', () => ({
      sessions: [{ $id: 's-aktuell', current: true }, { $id: 's-alt', current: false }],
    }))
    const kit = coreKit()
    const run = await probeRoute(load, { who: 'member', body: PASSWORD_BODY, globals: kit.globals })
    expect(run.status).toBe(200)
    expect(appwriteFake.argsOf('session.account.updatePassword')).toEqual([{ password: 'Probe-Wort-1x', oldPassword: 'altes-wort' }])
    expect(appwriteFake.argsOf('session.account.deleteSession')).toEqual([{ sessionId: 's-alt' }])
    expect(appwriteFake.used('admin')).toBe(false)
    expect(kit.record.authEvents.map(e => e.data.userId)).toEqual([userIdOf('member')])
  })

  it('falsches aktuelles Passwort (Appwrite lehnt ab): 400, keine Sitzung beendet, kein Protokoll', async () => {
    appwriteFake.reply('session.account.updatePassword', () => {
      throw Object.assign(new Error('invalid credentials'), { type: 'user_invalid_credentials', code: 401 })
    })
    const kit = coreKit()
    const run = await probeRoute(load, { who: 'member', body: PASSWORD_BODY, globals: kit.globals })
    expect(run.status).toBe(400)
    expect(appwriteFake.argsOf('session.account.deleteSession')).toEqual([])
    expect(kit.record.authEvents).toEqual([])
  })
})

const PREFS_ROUTES = [
  {
    name: 'PUT /api/auth/timezone',
    load: () => import('../server/api/auth/timezone.put'),
    body: { timezone: 'Europe/Vienna' },
    expected: { ...OWN_PREFS, timezone: 'Europe/Vienna' },
  },
  {
    name: 'PUT /api/auth/notification-prefs',
    load: () => import('../server/api/auth/notification-prefs.put'),
    body: { emailNotifications: 'off', emailLocale: 'en' },
    expected: { ...OWN_PREFS, emailNotifications: 'off', emailLocale: 'en' },
  },
  {
    name: 'PUT /api/auth/dashboard-nav',
    load: () => import('../server/api/auth/dashboard-nav.put'),
    body: {},
    expected: { timezone: 'Europe/Berlin', bio: 'alt', emailNotifications: 'digest' },
  },
]

for (const route of PREFS_ROUTES) {
  describeAccountRoute(route.name, route.load, {
    body: route.body,
    userFields: { prefs: { ...OWN_PREFS, dashboardNav: { items: ['x'] } } },
    globals: coreKit().globals,
  })

  describe(`${route.name} — schreibt die eigenen Prefs über den Session-Klienten`, () => {
    it('übernimmt die EIGENEN bisherigen Prefs, nie per Admin-Klient', async () => {
      const run = await probeRoute(route.load, {
        who: 'stranger',
        body: route.body,
        userFields: { prefs: { ...OWN_PREFS, dashboardNav: { items: ['x'] } } },
        globals: coreKit().globals,
      })
      expect(run.status).toBe(200)
      const writes = appwriteFake.argsOf('session.account.updatePrefs')
      expect(writes).toHaveLength(1)
      expect(writes[0]?.prefs).toMatchObject(route.expected)
      expect(appwriteFake.used('admin')).toBe(false)
    })
  })
}

const NOTIFICATION_PREFS_GLOBALS = {
  resolveEmailPrefs: (prefs: Record<string, unknown>) => ({ emailNotifications: prefs.emailNotifications ?? 'instant' }),
  mailerConfigured: async () => true,
  mailUndeliverableEmailHash: () => '',
}

describeAccountRoute('GET /api/auth/notification-prefs', () => import('../server/api/auth/notification-prefs.get'), {
  userFields: { prefs: OWN_PREFS, email: 'person@example.test' },
  globals: NOTIFICATION_PREFS_GLOBALS,
})

describe('GET /api/auth/notification-prefs — liest die Prefs der Sitzung', () => {
  it('antwortet mit der eigenen Wahl', async () => {
    const run = await probeRoute(() => import('../server/api/auth/notification-prefs.get'), {
      who: 'member',
      userFields: { prefs: OWN_PREFS },
      globals: NOTIFICATION_PREFS_GLOBALS,
    })
    expect(run.status).toBe(200)
    expect(run.result).toMatchObject({ emailNotifications: 'digest' })
  })
})

// ── Zustimmung ──────────────────────────────────────────────────────────────

const TERMS_CONFIG = { useAppConfig: () => ({ pukalani: { auth: { termsUrl: 'https://example.test/agb' } } }) }

describeAccountRoute('GET /api/auth/consent', () => import('../server/api/auth/consent.get'), {
  globals: { ...coreKit().globals, ...TERMS_CONFIG },
})

describe('GET /api/auth/consent — fragt nur nach dem eigenen Konto', () => {
  const load = () => import('../server/api/auth/consent.get')

  it('sucht den Zustimmungs-Vermerk mit der Konto-Id der Sitzung', async () => {
    const run = await probeRoute(load, {
      who: 'stranger',
      query: { userId: userIdOf('member') },
      globals: { ...coreKit().globals, ...TERMS_CONFIG },
    })
    expect(run.status).toBe(200)
    expect(appwriteFake.argsOf('admin.tablesDB.getRow').map(args => args.rowId))
      .toEqual([consentRowId(userIdOf('stranger'), 'terms', '')])
  })

  it('Betreiber: wird nie gefragt, keine Abfrage', async () => {
    const run = await probeRoute(load, { who: 'operator', globals: { ...coreKit().globals, ...TERMS_CONFIG } })
    expect(run.status).toBe(200)
    expect(appwriteFake.argsOf('admin.tablesDB.getRow')).toEqual([])
  })
})

// ── Orte (Profil-Standort) ──────────────────────────────────────────────────

describeAccountRoute('GET /api/geo/cities', () => import('../server/api/geo/cities.get'), {
  query: { q: 'Berlin' },
  globals: coreKit().globals,
})

describeAccountRoute('GET /api/geo/countries', () => import('../server/api/geo/countries.get'), {
  globals: coreKit().globals,
})

// ── Der eigene @name ────────────────────────────────────────────────────────

describeAccountRoute('GET /api/account/handle', () => import('../server/api/account/handle.get'))

describe('GET /api/account/handle — vergibt für das eigene Konto, sichtbar nur für Mitglieder', () => {
  const load = () => import('../server/api/account/handle.get')

  it('Mitglied: Name für die eigene Id, Lese-Rolle der Community nachgetragen', async () => {
    const run = await probeRoute(load, { who: 'member' })
    expect(run.status).toBe(200)
    expect(handles.ensured).toEqual([userIdOf('member')])
    expect(handles.audience).toEqual([userIdOf('member')])
  })

  it('fremdes Konto: Name für die eigene Id, aber KEINE Lese-Rolle in dieser Community', async () => {
    const run = await probeRoute(load, { who: 'stranger', registration: 'open' })
    expect(run.status).toBe(200)
    expect(handles.ensured).toEqual([userIdOf('stranger')])
    expect(handles.audience).toEqual([])
    expect(run.joinHandlerCalls, 'Hinsehen ist kein Beitritt').toBe(0)
  })

  it('entferntes Konto: KEINE Lese-Rolle', async () => {
    await probeRoute(load, { who: 'removed' })
    expect(handles.audience).toEqual([])
  })
})

describeAccountRoute('PATCH /api/account/handle', () => import('../server/api/account/handle.patch'), {
  body: { handle: 'probename' },
})

describe('PATCH /api/account/handle — ändert nur den eigenen Namen', () => {
  const load = () => import('../server/api/account/handle.patch')

  it('Mitglied: Umbenennung für die eigene Id, Lese-Rolle nachgetragen', async () => {
    const run = await probeRoute(load, { who: 'member', body: { handle: 'probename', userId: userIdOf('stranger') } })
    expect(run.status).toBe(200)
    expect(handles.changed).toEqual([{ userId: userIdOf('member'), handle: 'probename' }])
    expect(handles.audience).toEqual([userIdOf('member')])
  })

  it('fremdes Konto: Umbenennung für die eigene Id, KEINE Lese-Rolle in dieser Community', async () => {
    const run = await probeRoute(load, { who: 'stranger', registration: 'open', body: { handle: 'probename' } })
    expect(run.status).toBe(200)
    expect(handles.changed).toEqual([{ userId: userIdOf('stranger'), handle: 'probename' }])
    expect(handles.audience).toEqual([])
    expect(run.joinHandlerCalls).toBe(0)
  })
})
