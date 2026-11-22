import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { probeRoute, resetCommunityWorld, userIdOf, type RouteProbe } from './support/participationHarness'
import { appwriteFake } from './support/appwriteFake'
import { coreKit } from './support/coreRouteKit'
import { configureSiteCard, deriveSiteCardKey, sealSiteCard, setWebsocketBuiltForTests } from '../server/utils/siteCard'
import { LIVE_JWT_DURATION_S, liveTicketHeaderForTests } from '../server/utils/liveRelay'

/**
 * `GET /api/live/realtime` — die Fahrkarte der Live-Verbindung unter einer
 * eigenen Domain (PK1 E1d), an der ECHTEN Route. Gefragt wird:
 *  - Schalter aus, ohne Prozess-Geheimnis, nicht auf der eigenen Domain ⇒ 404
 *    wie eine unbekannte Route (kein JWT, kein Appwrite-Aufruf);
 *  - Gast, Klartext-Cookie, fremde Karte, Karte einer anderen Community,
 *    abgelaufene Karte ⇒ 401; entfernt ⇒ 403;
 *  - Mitglied mit Karte ⇒ JWT an die Sitzung DER KARTE gebunden, Seite =
 *    Konto + Community des Hosts.
 */

vi.mock('../server/lib/appwrite', async () => (await import('./support/appwriteFake')).appwriteLibMock)
vi.mock('node-appwrite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node-appwrite')>()
  const fake = await import('./support/appwriteFake')
  return { ...actual, Client: fake.FakeClient, Account: fake.FakeAccount }
})

const OWN_DOMAIN = 'forum.beispiel.test'
const COOKIE = 'a_session_probe'
const rawKey = randomBytes(32)
const USER = userIdOf('member')

function writeMode() {
  configureSiteCard({ mode: 'write', key: rawKey.toString('base64') })
  setWebsocketBuiltForTests(true)
}

function card(over: { userId?: string, communityId?: string, host?: string, expiresAt?: number } = {}): string {
  return sealSiteCard({
    secret: 'seiten-geheimnis',
    sessionId: 's-karte',
    userId: over.userId ?? USER,
    host: over.host ?? OWN_DOMAIN,
    communityId: over.communityId ?? 'c-a',
    expiresAt: over.expiresAt ?? Date.now() + 60 * 60 * 1000,
    authAt: Date.now() - 1000,
    own: true,
  }, { key: deriveSiteCardKey(rawKey), cookieName: COOKIE })
}

function sessionAlive() {
  appwriteFake.reply('session.account.getSession', () => ({ $id: 's-karte', userId: USER }))
}

const load = () => import('../server/api/live/realtime')

function probe(cookie: string | undefined, over: Partial<RouteProbe> & { ticket?: boolean } = {}) {
  const header = liveTicketHeaderForTests()
  const headers: Record<string, string> = { host: OWN_DOMAIN }
  if (over.ticket !== false) headers[header.name] = header.value
  const kit = coreKit({ cookies: cookie ? { [COOKIE]: cookie } : {}, headers })
  return probeRoute(load, {
    who: 'member',
    tenantFields: { pukalaniHost: 'c-a.pukalani.app' },
    context: { customDomainScope: true },
    ...over,
    globals: {
      ...kit.globals,
      // Die Route ist ein Objekt (HTTP + WebSocket); geprüft wird ihr HTTP-Gesicht.
      defineEventHandler: (definition: { handler: unknown }) => definition.handler,
    },
  })
}

beforeEach(() => {
  appwriteFake.reset()
})

afterEach(() => {
  configureSiteCard({ mode: 'off' })
  setWebsocketBuiltForTests(null)
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

describe('GET /api/live/realtime — wie eine unbekannte Route', () => {
  it('Schalter aus ⇒ 404, kein JWT', async () => {
    setWebsocketBuiltForTests(true)
    const run = await probe(card())
    expect(run.status).toBe(404)
    expect(appwriteFake.used('admin')).toBe(false)
  })

  it('read ⇒ 404', async () => {
    configureSiteCard({ mode: 'read', key: rawKey.toString('base64') })
    setWebsocketBuiltForTests(true)
    expect((await probe(card())).status).toBe(404)
  })

  it('write, aber ohne WebSocket im Build ⇒ 404', async () => {
    configureSiteCard({ mode: 'write', key: rawKey.toString('base64') })
    setWebsocketBuiltForTests(false)
    expect((await probe(card())).status).toBe(404)
  })

  it('ohne Prozess-Geheimnis (jeder Aufruf von außen) ⇒ 404', async () => {
    writeMode()
    const run = await probe(card(), { ticket: false })
    expect(run.status).toBe(404)
    expect(appwriteFake.used('admin')).toBe(false)
  })

  it('nicht auf der eigenen Domain (Pukalani-Adresse) ⇒ 404', async () => {
    writeMode()
    expect((await probe(card(), { context: {} })).status).toBe(404)
  })

  it('Silo/Kontroll-Host ⇒ 404', async () => {
    writeMode()
    expect((await probe(card(), { mode: 'control' })).status).toBe(404)
  })
})

describe('GET /api/live/realtime — wer eine Fahrkarte bekommt', () => {
  it('Gast ⇒ 401', async () => {
    writeMode()
    const run = await probe(undefined, { who: 'guest' })
    expect(run.status).toBe(401)
    expect(appwriteFake.used('admin')).toBe(false)
  })

  it('Klartext-Cookie auf der eigenen Domain ⇒ 401', async () => {
    writeMode()
    expect((await probe('klartext-geheimnis')).status).toBe(401)
  })

  it('Karte eines anderen Kontos als die Anmeldung ⇒ 401', async () => {
    writeMode()
    expect((await probe(card({ userId: 'u-fremd' }))).status).toBe(401)
  })

  it('Karte einer anderen Community ⇒ 401', async () => {
    writeMode()
    expect((await probe(card({ communityId: 'c-b' }))).status).toBe(401)
  })

  it('Karte eines anderen Hosts ⇒ 401', async () => {
    writeMode()
    expect((await probe(card({ host: 'c-a.pukalani.app' }))).status).toBe(401)
  })

  it('abgelaufene Karte ⇒ 401', async () => {
    writeMode()
    expect((await probe(card({ expiresAt: Date.now() - 1000 }))).status).toBe(401)
  })

  it('Karte, deren Sitzung in weniger als einer Minute endet ⇒ 401', async () => {
    writeMode()
    expect((await probe(card({ expiresAt: Date.now() + 30_000 }))).status).toBe(401)
    expect(appwriteFake.used('admin')).toBe(false)
  })

  it('aus der Community entfernt ⇒ 403', async () => {
    writeMode()
    expect((await probe(card(), { context: { customDomainScope: true, communityRemoved: true } })).status).toBe(403)
  })

  it('Sitzung bei Appwrite beendet (Widerruf; der Anmelde-Merker weiß es noch nicht) ⇒ 401, kein JWT', async () => {
    writeMode()
    appwriteFake.reply('session.account.getSession', () => { throw Object.assign(new Error('session'), { code: 401 }) })
    appwriteFake.reply('admin.users.createJWT', () => ({ jwt: 'probe-jwt' }))
    expect((await probe(card())).status).toBe(401)
    expect(appwriteFake.used('admin')).toBe(false)
  })

  it('Sitzung der Anfrage ist eine andere als die der Karte ⇒ 401', async () => {
    writeMode()
    appwriteFake.reply('session.account.getSession', () => ({ $id: 's-andere', userId: USER }))
    expect((await probe(card())).status).toBe(401)
  })

  it('Appwrite lehnt das JWT ab ⇒ 401', async () => {
    writeMode()
    sessionAlive()
    appwriteFake.reply('admin.users.createJWT', () => { throw Object.assign(new Error('session'), { code: 401 }) })
    expect((await probe(card())).status).toBe(401)
  })

  it('Mitglied mit Karte ⇒ JWT an die Sitzung der Karte, Seite = Konto + Community', async () => {
    writeMode()
    sessionAlive()
    appwriteFake.reply('admin.users.createJWT', () => ({ jwt: 'probe-jwt' }))
    const run = await probe(card())
    expect(run.status).toBe(200)
    expect(appwriteFake.argsOf('admin.users.createJWT')).toEqual([{ userId: USER, sessionId: 's-karte', duration: LIVE_JWT_DURATION_S }])
    expect(run.result).toMatchObject({
      scope: { userId: USER, communityId: 'c-a', tenantId: 't-a' },
      projectId: 'pool',
      jwt: 'probe-jwt',
    })
  })

  it('kurze Restlaufzeit der Sitzung kürzt das JWT', async () => {
    writeMode()
    sessionAlive()
    appwriteFake.reply('admin.users.createJWT', () => ({ jwt: 'probe-jwt' }))
    await probe(card({ expiresAt: Date.now() + 120_000 }))
    const [args] = appwriteFake.argsOf('admin.users.createJWT') as Array<{ duration: number }>
    expect(args!.duration).toBeLessThanOrEqual(120)
    expect(args!.duration).toBeGreaterThanOrEqual(60)
  })
})
