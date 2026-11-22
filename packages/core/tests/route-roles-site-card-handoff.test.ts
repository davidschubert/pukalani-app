import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { probeRoute, resetCommunityWorld, userIdOf } from './support/participationHarness'
import { appwriteFake } from './support/appwriteFake'
import { coreKit } from './support/coreRouteKit'
import { configureSiteCard, deriveSiteCardKey, sealSiteCard } from '../server/utils/siteCard'
import { claimHandoffOnce, establishSiteSession, resetHandoffClaimsForTests } from '../server/utils/sessionHandoff'
import { HANDOFF_TTL_MS, deriveHandoffKey, openHandoff, sealHandoff, sealHandoffToken, type HandoffGrant } from '../server/utils/embedHandoff'
import type { SessionCookieCard } from '../server/utils/requestSession'

/**
 * HOST-WECHSEL, EINBETTUNG UND LIVE-TOKEN MIT EINTRITTSKARTE (PK1 E1b) —
 * an der ECHTEN Route.
 *
 * Gefragt wird je Modus des Kartenschalters:
 *  - `GET /api/auth/site-session`: bei `write` eine EIGENE Sitzung für den
 *    Ziel-Host (anderes Geheimnis als die Quelle), Ausnahmen Zwei-Faktor und
 *    Rückfall, Aufräumen der alten eigenen Sitzung, `authAt` reist mit;
 *    bei `off` die Kopie wie vorher.
 *  - `POST /api/auth/embed-session`: dieselbe Sitzung, als Kopie markiert.
 *  - `POST /api/auth/embed-handoff`: das Siegel trägt bei `write` Konto,
 *    Sitzung und ursprüngliche Anmeldung.
 *  - `GET /api/auth/realtime-token`: mit Karte an deren Sitzung gebunden.
 * Appwrite ist nachgebaut (`support/appwriteFake.ts`), Siegel und Karten sind
 * echt.
 */

const { cookieWrites } = vi.hoisted(() => ({
  cookieWrites: [] as Array<{ secret: string, expire: string, partitioned: boolean, card: SessionCookieCard | undefined }>,
}))

vi.mock('../server/lib/appwrite', async () => {
  const fake = await import('./support/appwriteFake')
  return {
    ...fake.appwriteLibMock,
    setSessionCookie: (_event: unknown, secret: string, expire: string, options?: { partitioned?: boolean, card?: SessionCookieCard }) => {
      cookieWrites.push({ secret, expire, partitioned: options?.partitioned === true, card: options?.card })
    },
  }
})

vi.mock('node-appwrite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node-appwrite')>()
  const fake = await import('./support/appwriteFake')
  return { ...actual, Client: fake.FakeClient, Account: fake.FakeAccount }
})

const OWN_HOST = 'c-a.pukalani.app'
const OTHER_HOST = 'c-b.pukalani.app'
const SERVER_KEY = 'probe-server-key'
const COOKIE = 'a_session_probe'
const SOURCE_SECRET = 'quelle-geheimnis'
const SOURCE_EXPIRE = '2026-12-01T00:00:00.000Z'
const SOURCE_CREATED = '2026-11-20T08:00:00.000Z'
const NEW_EXPIRE = '2027-01-01T00:00:00.000Z'
const ORIGINAL_AUTH = Date.parse('2026-11-01T10:00:00.000Z')
const rawCardKey = randomBytes(32)
const cardKey = () => deriveSiteCardKey(rawCardKey)
const USER = userIdOf('member')

function writeMode() {
  configureSiteCard({ mode: 'write', key: rawCardKey.toString('base64') })
}

/** Eine Karte, wie sie dieser Host schon ausgegeben hätte. */
function existingCard(over: { userId?: string, sessionId?: string, own?: boolean } = {}): string {
  return sealSiteCard({
    secret: 'alte-seiten-sitzung',
    sessionId: over.sessionId ?? 's-old',
    userId: over.userId ?? USER,
    host: OWN_HOST,
    communityId: 'c-a',
    expiresAt: Date.now() + 60 * 60 * 1000,
    authAt: ORIGINAL_AUTH,
    ...(over.own === false ? {} : { own: true }),
  }, { key: cardKey(), cookieName: COOKIE })
}

function sourceSessionIsAlive() {
  appwriteFake.reply('direct.account.getSession', () => ({ $id: 's-source', userId: USER, expire: SOURCE_EXPIRE, $createdAt: SOURCE_CREATED }))
}

function plainAccount(over: Record<string, unknown> = {}) {
  appwriteFake.reply('admin.users.get', args => ({ $id: args.userId, mfa: false, emailVerification: true, phoneVerification: false, ...over }))
}

function newSessionWorks() {
  appwriteFake.reply('admin.users.createSession', args => ({ $id: 's-new', userId: args.userId, secret: 'neues-geheimnis', expire: NEW_EXPIRE }))
}

const seal = (grant: HandoffGrant, host = OWN_HOST, now = Date.now()) => sealHandoff(grant, deriveHandoffKey(SERVER_KEY), host, now)
const fullGrant = (over: Partial<HandoffGrant> = {}): HandoffGrant => ({
  secret: SOURCE_SECRET,
  userId: USER,
  sessionId: 's-source',
  authAt: ORIGINAL_AUTH,
  nonce: randomBytes(12).toString('base64url'),
  ...over,
})

beforeEach(() => {
  appwriteFake.reset()
  cookieWrites.length = 0
  resetHandoffClaimsForTests()
})

afterEach(() => {
  configureSiteCard(undefined)
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

// ── Host-Wechsel ────────────────────────────────────────────────────────────

describe('GET /api/auth/site-session — eigene Sitzung je Seite', () => {
  const load = () => import('../server/api/auth/site-session.get')

  function globals(options: { cookie?: string, host?: string } = {}) {
    return coreKit({
      cookies: options.cookie ? { [COOKIE]: options.cookie } : {},
      headers: { host: options.host ?? OWN_HOST },
      config: { appwriteKey: SERVER_KEY },
      globals: { useAppConfig: () => ({ pukalani: { tenancy: { enabled: true } } }) },
    }).globals
  }

  const run = (token: string, options: { cookie?: string, host?: string } = {}) =>
    probeRoute(load, { who: 'guest', query: { token }, globals: globals(options), tenantFields: { pukalaniHost: OWN_HOST } })

  it('off: die Kopie wie vor E1b — kein Admin-Aufruf, keine neue Sitzung', async () => {
    sourceSessionIsAlive()
    const result = await run(sealHandoffToken(SOURCE_SECRET, deriveHandoffKey(SERVER_KEY), OWN_HOST))
    expect(result.status).toBe(200)
    expect(appwriteFake.used('admin')).toBe(false)
    expect(cookieWrites.map(write => [write.secret, write.expire, write.partitioned])).toEqual([[SOURCE_SECRET, SOURCE_EXPIRE, false]])
    expect(cookieWrites[0]!.card?.own).toBe(false)
  })

  it('write: neue Sitzung mit eigenem Geheimnis, authAt der Quelle reist mit', async () => {
    writeMode()
    sourceSessionIsAlive()
    plainAccount()
    newSessionWorks()
    const result = await run(seal(fullGrant()))
    expect(result.status).toBe(200)
    expect(appwriteFake.argsOf('admin.users.createSession')).toEqual([{ userId: USER }])
    expect(cookieWrites).toEqual([{
      secret: 'neues-geheimnis',
      expire: SOURCE_EXPIRE,
      partitioned: false,
      card: { sessionId: 's-new', userId: USER, authAt: ORIGINAL_AUTH, own: true },
    }])
    expect(cookieWrites[0]!.secret).not.toBe(SOURCE_SECRET)
  })

  it('write, altes Siegel ohne Kennung (laufender 60-s-Link): nur Kopie in der Karte, KEINE neue Sitzung, authAt = Beginn der Quell-Sitzung', async () => {
    writeMode()
    sourceSessionIsAlive()
    plainAccount()
    newSessionWorks()
    const result = await run(sealHandoffToken(SOURCE_SECRET, deriveHandoffKey(SERVER_KEY), OWN_HOST))
    expect(result.status).toBe(200)
    expect(appwriteFake.argsOf('admin.users.createSession')).toEqual([])
    expect(cookieWrites).toEqual([{
      secret: SOURCE_SECRET,
      expire: SOURCE_EXPIRE,
      partitioned: false,
      card: { sessionId: 's-source', userId: USER, authAt: Date.parse(SOURCE_CREATED), own: false },
    }])
  })

  it('write: dasselbe Siegel ein zweites Mal ⇒ 401 wie abgelaufen, keine zweite Sitzung', async () => {
    writeMode()
    sourceSessionIsAlive()
    plainAccount()
    newSessionWorks()
    const token = seal(fullGrant())
    expect((await run(token)).status).toBe(200)
    expect((await run(token)).status).toBe(401)
    expect(appwriteFake.argsOf('admin.users.createSession')).toHaveLength(1)
    expect(cookieWrites).toHaveLength(1)
    // Gegenprobe: ein zweites, eigenes Siegel geht.
    expect((await run(seal(fullGrant()))).status).toBe(200)
  })

  it('write ohne Schlüssel: Kopie, keine neue Sitzung (nie eine neue Sitzung im Klartext)', async () => {
    configureSiteCard({ mode: 'write' })
    sourceSessionIsAlive()
    plainAccount()
    newSessionWorks()
    const result = await run(seal(fullGrant()))
    expect(result.status).toBe(200)
    expect(appwriteFake.argsOf('admin.users.createSession')).toEqual([])
    expect(cookieWrites[0]!.secret).toBe(SOURCE_SECRET)
  })

  it('write: die Karte der neuen Sitzung gilt nicht länger als die Quelle (Gegenprobe: kürzere neue Sitzung bleibt)', async () => {
    writeMode()
    sourceSessionIsAlive()
    plainAccount()
    newSessionWorks()
    await run(seal(fullGrant()))
    // neue Sitzung läuft 2027 ab, die Quelle schon 2026-12-01
    expect(cookieWrites[0]!.expire).toBe(SOURCE_EXPIRE)

    cookieWrites.length = 0
    appwriteFake.reply('admin.users.createSession', args => ({ $id: 's-new', userId: args.userId, secret: 'neues-geheimnis', expire: '2026-11-30T00:00:00.000Z' }))
    await run(seal(fullGrant()))
    expect(cookieWrites[0]!.expire).toBe('2026-11-30T00:00:00.000Z')
  })

  it('write, Zwei-Faktor (verifizierte E-Mail): Kopie in der Karte, keine neue Sitzung', async () => {
    writeMode()
    sourceSessionIsAlive()
    plainAccount({ mfa: true, emailVerification: true })
    newSessionWorks()
    const result = await run(seal(fullGrant()))
    expect(result.status).toBe(200)
    expect(appwriteFake.argsOf('admin.users.createSession')).toEqual([])
    expect(cookieWrites).toEqual([{
      secret: SOURCE_SECRET,
      expire: SOURCE_EXPIRE,
      partitioned: false,
      card: { sessionId: 's-source', userId: USER, authAt: ORIGINAL_AUTH, own: false },
    }])
  })

  it('write, Zwei-Faktor nur über den Authenticator: Kopie (Gegenprobe ohne Faktor: neue Sitzung)', async () => {
    writeMode()
    sourceSessionIsAlive()
    plainAccount({ mfa: true, emailVerification: false, phoneVerification: false })
    newSessionWorks()
    appwriteFake.reply('admin.users.listMfaFactors', () => ({ totp: true, email: false, phone: false, recoveryCode: true, custom: false }))
    await run(seal(fullGrant()))
    expect(cookieWrites[0]!.secret).toBe(SOURCE_SECRET)

    cookieWrites.length = 0
    appwriteFake.reply('admin.users.listMfaFactors', () => ({ totp: false, email: false, phone: false, recoveryCode: false, custom: false }))
    await run(seal(fullGrant()))
    expect(cookieWrites[0]!.secret).toBe('neues-geheimnis')
  })

  it('write, Konto nicht lesbar: im Zweifel „braucht zwei" ⇒ Kopie in der Karte', async () => {
    writeMode()
    sourceSessionIsAlive()
    appwriteFake.reply('admin.users.get', () => {
      throw Object.assign(new Error('boom'), { code: 500 })
    })
    newSessionWorks()
    const result = await run(seal(fullGrant()))
    expect(result.status).toBe(200)
    expect(appwriteFake.argsOf('admin.users.createSession')).toEqual([])
    expect(cookieWrites[0]!.secret).toBe(SOURCE_SECRET)
  })

  it('write, createSession scheitert (z. B. fehlender Schlüssel-Bereich): Kopie in der Karte, kein 500', async () => {
    writeMode()
    sourceSessionIsAlive()
    plainAccount()
    appwriteFake.reply('admin.users.createSession', () => {
      throw Object.assign(new Error('missing scope'), { code: 401, type: 'general_unauthorized_scope' })
    })
    const result = await run(seal(fullGrant()))
    expect(result.status).toBe(200)
    expect(cookieWrites).toEqual([{
      secret: SOURCE_SECRET,
      expire: SOURCE_EXPIRE,
      partitioned: false,
      card: { sessionId: 's-source', userId: USER, authAt: ORIGINAL_AUTH, own: false },
    }])
  })

  it('abgelaufenes oder fremdes Siegel: 401 wie heute, keine Sitzung, kein Cookie', async () => {
    writeMode()
    sourceSessionIsAlive()
    plainAccount()
    newSessionWorks()
    const expired = seal(fullGrant(), OWN_HOST, Date.now() - HANDOFF_TTL_MS - 1000)
    expect((await run(expired)).status).toBe(401)
    expect((await run(seal(fullGrant(), OTHER_HOST))).status).toBe(401)
    expect((await run('kein-siegel')).status).toBe(401)
    expect(appwriteFake.used('admin')).toBe(false)
    expect(cookieWrites).toEqual([])
  })

  it('Siegel passt nicht zur Sitzung seines Geheimnisses: 401, kein Cookie', async () => {
    writeMode()
    sourceSessionIsAlive()
    plainAccount()
    newSessionWorks()
    expect((await run(seal(fullGrant({ userId: 'u-fremd' })))).status).toBe(401)
    expect((await run(seal(fullGrant({ sessionId: 's-andere' })))).status).toBe(401)
    expect(appwriteFake.used('admin')).toBe(false)
    expect(cookieWrites).toEqual([])
  })

  it('Quell-Sitzung lebt nicht mehr: 401, keine neue Sitzung', async () => {
    writeMode()
    appwriteFake.reply('direct.account.getSession', () => {
      throw Object.assign(new Error('gone'), { code: 401 })
    })
    newSessionWorks()
    expect((await run(seal(fullGrant()))).status).toBe(401)
    expect(appwriteFake.argsOf('admin.users.createSession')).toEqual([])
    expect(cookieWrites).toEqual([])
  })

  describe('Aufräumen am Ziel', () => {
    beforeEach(() => {
      writeMode()
      sourceSessionIsAlive()
      plainAccount()
      newSessionWorks()
    })

    it('alte EIGENE Sitzung desselben Kontos auf diesem Host wird gelöscht', async () => {
      await run(seal(fullGrant()), { cookie: existingCard() })
      expect(appwriteFake.argsOf('admin.users.deleteSession')).toEqual([{ userId: USER, sessionId: 's-old' }])
      expect(cookieWrites[0]!.secret).toBe('neues-geheimnis')
    })

    it('eine KOPIE (Karte ohne Merkmal „eigen") wird nie gelöscht', async () => {
      await run(seal(fullGrant()), { cookie: existingCard({ own: false }) })
      expect(appwriteFake.argsOf('admin.users.deleteSession')).toEqual([])
    })

    it('die Karte eines anderen Kontos bleibt unberührt', async () => {
      await run(seal(fullGrant()), { cookie: existingCard({ userId: 'u-anders' }) })
      expect(appwriteFake.argsOf('admin.users.deleteSession')).toEqual([])
    })

    it('ist die alte Sitzung die Quelle selbst, bleibt sie stehen', async () => {
      await run(seal(fullGrant()), { cookie: existingCard({ sessionId: 's-source' }) })
      expect(appwriteFake.argsOf('admin.users.deleteSession')).toEqual([])
    })

    it('Klartext-Cookie: nichts gelöscht', async () => {
      await run(seal(fullGrant()), { cookie: 'klartext-geheimnis' })
      expect(appwriteFake.argsOf('admin.users.deleteSession')).toEqual([])
    })

    it('Löschen scheitert: eigene gezählte Zeile, die neue Karte steht trotzdem (Gegenprobe: 404 = schon weg, keine Zeile)', async () => {
      const lines = vi.spyOn(console, 'log').mockImplementation(() => {})
      const warns = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
      const cleanupLines = () => [...lines.mock.calls, ...warns.mock.calls, ...errors.mock.calls]
        .map(args => String(args[0])).filter(line => line.includes('auth.site_session_cleanup_failed'))
      appwriteFake.reply('admin.users.deleteSession', () => {
        throw Object.assign(new Error('gone'), { code: 404 })
      })
      await run(seal(fullGrant()), { cookie: existingCard() })
      expect(cleanupLines()).toEqual([])
      appwriteFake.reply('admin.users.deleteSession', () => {
        throw Object.assign(new Error('boom'), { code: 500 })
      })
      await run(seal(fullGrant()), { cookie: existingCard() })
      expect(cleanupLines()).toHaveLength(1)
      lines.mockRestore()
      warns.mockRestore()
      errors.mockRestore()
    })

    it('Löschen scheitert: die neue Karte steht trotzdem', async () => {
      appwriteFake.reply('admin.users.deleteSession', () => {
        throw Object.assign(new Error('boom'), { code: 500 })
      })
      const result = await run(seal(fullGrant()), { cookie: existingCard() })
      expect(result.status).toBe(200)
      expect(cookieWrites[0]!.secret).toBe('neues-geheimnis')
    })

    it('Zwei-Faktor-Kopie: nichts gelöscht, auch nicht die alte eigene Sitzung', async () => {
      plainAccount({ mfa: true, emailVerification: true })
      await run(seal(fullGrant()), { cookie: existingCard() })
      expect(appwriteFake.argsOf('admin.users.deleteSession')).toEqual([])
    })
  })
})

// ── Einbettung ──────────────────────────────────────────────────────────────

function embedGlobals(options: { cookie?: string } = {}) {
  return coreKit({
    cookies: options.cookie ? { [COOKIE]: options.cookie } : {},
    headers: { host: OWN_HOST },
    config: { appwriteKey: SERVER_KEY },
    globals: { useAppConfig: () => ({ pukalani: { auth: { embedSession: true } } }) },
  }).globals
}

describe('POST /api/auth/embed-session — dieselbe Sitzung in einer Karte (Kopie)', () => {
  const load = () => import('../server/api/auth/embed-session.post')

  it('write: Geheimnis der Quelle, Karte als Kopie, keine neue Sitzung', async () => {
    writeMode()
    sourceSessionIsAlive()
    const result = await probeRoute(load, { who: 'guest', body: { token: seal(fullGrant()) }, globals: embedGlobals() })
    expect(result.status).toBe(200)
    expect(appwriteFake.used('admin')).toBe(false)
    expect(cookieWrites).toEqual([{
      secret: SOURCE_SECRET,
      expire: SOURCE_EXPIRE,
      partitioned: true,
      card: { sessionId: 's-source', userId: USER, authAt: ORIGINAL_AUTH, own: false },
    }])
  })

  it('dasselbe Siegel ein zweites Mal: 401, nur ein Cookie', async () => {
    writeMode()
    sourceSessionIsAlive()
    const token = seal(fullGrant())
    expect((await probeRoute(load, { who: 'guest', body: { token }, globals: embedGlobals() })).status).toBe(200)
    expect((await probeRoute(load, { who: 'guest', body: { token }, globals: embedGlobals() })).status).toBe(401)
    expect(cookieWrites).toHaveLength(1)
  })

  it('Siegel passt nicht zur Sitzung: 401, kein Cookie', async () => {
    writeMode()
    sourceSessionIsAlive()
    const result = await probeRoute(load, { who: 'guest', body: { token: seal(fullGrant({ userId: 'u-fremd' })) }, globals: embedGlobals() })
    expect(result.status).toBe(401)
    expect(cookieWrites).toEqual([])
  })
})

describe('POST /api/auth/embed-handoff — Siegel mit Konto, Sitzung und Anmeldezeit', () => {
  const load = () => import('../server/api/auth/embed-handoff.post')
  const open = (token: string) => openHandoff(token, deriveHandoffKey(SERVER_KEY), OWN_HOST)

  it('write mit Karte: Siegel trägt die Angaben der Karte', async () => {
    writeMode()
    const result = await probeRoute(load, { who: 'member', globals: embedGlobals({ cookie: existingCard() }), tenantFields: { pukalaniHost: OWN_HOST } })
    expect(result.status).toBe(200)
    expect(open((result.result as { token: string }).token)).toEqual({ secret: 'alte-seiten-sitzung', userId: USER, sessionId: 's-old', authAt: ORIGINAL_AUTH, nonce: expect.any(String) })
  })

  it('write mit Klartext (Pukalani-Adresse): Siegel trägt nur Geheimnis und Konto', async () => {
    writeMode()
    const result = await probeRoute(load, { who: 'member', globals: embedGlobals({ cookie: 'klartext-geheimnis' }), tenantFields: { pukalaniHost: OWN_HOST } })
    expect(open((result.result as { token: string }).token)).toEqual({ secret: 'klartext-geheimnis', userId: USER, nonce: expect.any(String) })
  })

  it('off: Siegel wie vor E1b, nur das Geheimnis', async () => {
    const result = await probeRoute(load, { who: 'member', globals: embedGlobals({ cookie: 'klartext-geheimnis' }) })
    expect(open((result.result as { token: string }).token)).toEqual({ secret: 'klartext-geheimnis' })
  })
})

// ── Live-Token ──────────────────────────────────────────────────────────────

describe('GET /api/auth/realtime-token — mit Karte an deren Sitzung gebunden', () => {
  const load = () => import('../server/api/auth/realtime-token.get')
  const tokenGlobals = (cookie?: string) => coreKit({
    cookies: cookie ? { [COOKIE]: cookie } : {},
    headers: { host: OWN_HOST },
  }).globals

  it('Karte: createJWT bekommt die Sitzung der Karte', async () => {
    writeMode()
    appwriteFake.reply('admin.users.createJWT', () => ({ jwt: 'probe-jwt' }))
    const result = await probeRoute(load, { who: 'member', globals: tokenGlobals(existingCard()), tenantFields: { pukalaniHost: OWN_HOST } })
    expect(result.status).toBe(200)
    expect(appwriteFake.argsOf('admin.users.createJWT')).toEqual([{ userId: USER, sessionId: 's-old', duration: 900 }])
  })

  it('Karte eines anderen Kontos als die Sitzung: deren Sitzung zählt nicht, die der Anfrage wird erfragt', async () => {
    writeMode()
    appwriteFake.reply('admin.users.createJWT', () => ({ jwt: 'probe-jwt' }))
    appwriteFake.reply('session.account.getSession', () => ({ $id: 's-klartext', userId: USER }))
    await probeRoute(load, { who: 'member', globals: tokenGlobals(existingCard({ userId: 'u-anders' })), tenantFields: { pukalaniHost: OWN_HOST } })
    expect(appwriteFake.argsOf('admin.users.createJWT')).toEqual([{ userId: USER, sessionId: 's-klartext', duration: 900 }])
  })

  for (const mode of ['off', 'read'] as const) {
    it(`${mode}, ohne Karte: unverändert (ohne sessionId, keine Sitzungs-Frage)`, async () => {
      if (mode === 'read') configureSiteCard({ mode: 'read', key: rawCardKey.toString('base64') })
      appwriteFake.reply('admin.users.createJWT', () => ({ jwt: 'probe-jwt' }))
      await probeRoute(load, { who: 'member', globals: tokenGlobals('klartext-geheimnis'), tenantFields: { pukalaniHost: OWN_HOST } })
      expect(appwriteFake.argsOf('admin.users.createJWT')).toEqual([{ userId: USER, duration: 900 }])
      expect(appwriteFake.used('session')).toBe(false)
    })
  }

  it('write, Klartext: die Sitzung der Anfrage wird erfragt und mitgegeben', async () => {
    writeMode()
    appwriteFake.reply('admin.users.createJWT', () => ({ jwt: 'probe-jwt' }))
    appwriteFake.reply('session.account.getSession', () => ({ $id: 's-klartext', userId: USER }))
    const result = await probeRoute(load, { who: 'member', globals: tokenGlobals('klartext-geheimnis'), tenantFields: { pukalaniHost: OWN_HOST } })
    expect(result.status).toBe(200)
    expect(appwriteFake.argsOf('session.account.getSession')).toEqual([{ sessionId: 'current' }])
    expect(appwriteFake.argsOf('admin.users.createJWT')).toEqual([{ userId: USER, sessionId: 's-klartext', duration: 900 }])
  })

  it('write, Klartext, Sitzung nicht lesbar: 401, kein JWT', async () => {
    writeMode()
    appwriteFake.reply('session.account.getSession', () => {
      throw Object.assign(new Error('gone'), { code: 401 })
    })
    const result = await probeRoute(load, { who: 'member', globals: tokenGlobals('klartext-geheimnis'), tenantFields: { pukalaniHost: OWN_HOST } })
    expect(result.status).toBe(401)
    expect(appwriteFake.argsOf('admin.users.createJWT')).toEqual([])
  })
})

// ── Einmal einlösen und „Karte schreibbar?" direkt an den Hilfen ────────────

describe('claimHandoffOnce — je Kennung genau einmal, mit Ablauf', () => {
  it('erstes Mal ja, zweites Mal nein, nach Ablauf des Merkers wieder ja', () => {
    const now = Date.now()
    expect(claimHandoffOnce('k-1', now)).toBe(true)
    expect(claimHandoffOnce('k-1', now + 1000)).toBe(false)
    expect(claimHandoffOnce('k-2', now + 1000)).toBe(true)
    expect(claimHandoffOnce('k-1', now + 3 * 60_000)).toBe(true)
  })
})

describe('establishSiteSession — ohne Host keine neue Sitzung', () => {
  it('kein Host: Kopie, createSession nicht gerufen (Gegenprobe mit Host: neue Sitzung)', async () => {
    writeMode()
    plainAccount()
    newSessionWorks()
    const source = { $id: 's-source', userId: USER, expire: SOURCE_EXPIRE, $createdAt: SOURCE_CREATED } as never
    const kit = (host?: string) => coreKit({ headers: host ? { host } : {} }).globals
    for (const [name, value] of Object.entries(kit())) vi.stubGlobal(name, value)
    await establishSiteSession({ context: {} } as never, fullGrant(), source)
    expect(appwriteFake.argsOf('admin.users.createSession')).toEqual([])
    expect(cookieWrites[0]!.secret).toBe(SOURCE_SECRET)

    cookieWrites.length = 0
    for (const [name, value] of Object.entries(kit(OWN_HOST))) vi.stubGlobal(name, value)
    await establishSiteSession({ context: {} } as never, fullGrant(), source)
    expect(cookieWrites[0]!.secret).toBe('neues-geheimnis')
  })
})
