import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TenantContext } from '../shared/types/tenant'

/**
 * EINTRITTSKARTE SCHREIBEN (PK1 E1b): `setSessionCookie` je Modus, das Siegel
 * für den Host-Wechsel in beiden Fassungen und der Anmelde-Merker mit
 * mehreren Sitzungen je Konto.
 *
 * `setSessionCookie` läuft hier ECHT (`server/lib/appwrite.ts`); nachgebaut
 * sind nur die h3-Hilfen (`setCookie`, `getHeader`) und die Laufzeit-Config.
 * Schlüssel entstehen je Lauf aus Zufall.
 */

const { logLines, cookieWrites } = vi.hoisted(() => ({
  logLines: [] as Array<{ level: string, event: string, data: Record<string, unknown> }>,
  cookieWrites: [] as Array<{ name: string, value: string, options: Record<string, unknown> }>,
}))

vi.mock('../server/utils/logEvent', () => ({
  logEvent: (level: string, event: string, data: Record<string, unknown> = {}) => {
    logLines.push({ level, event, data })
  },
}))

vi.stubGlobal('useRuntimeConfig', () => ({ appwriteKey: 'probe', public: { appwriteProjectId: 'account', appwriteEndpoint: 'http://appwrite.example.test/v1' } }))
vi.stubGlobal('getCookie', (event: { cookies: Record<string, string> }, name: string) => event.cookies[name])
vi.stubGlobal('getHeader', (event: { headers: Record<string, string> }, name: string) => event.headers[name.toLowerCase()])
vi.stubGlobal('setCookie', (_event: unknown, name: string, value: string, options: Record<string, unknown>) => {
  cookieWrites.push({ name, value, options })
})
vi.stubGlobal('deleteCookie', () => {})
vi.stubGlobal('createError', (input: { status: number, statusText: string }) => Object.assign(new Error(input.statusText), input))

const { setSessionCookie } = await import('../server/lib/appwrite')
const { configureSiteCard, deriveSiteCardKey, openSiteCard, sealSiteCard } = await import('../server/utils/siteCard')
const { freshSignInCard, resetSiteCardWriteLogForTests } = await import('../server/utils/requestSession')
const { HANDOFF_TTL_MS, deriveHandoffKey, openHandoff, openHandoffToken, sealHandoff, sealHandoffToken } = await import('../server/utils/embedHandoff')
const { lookupSessionAccount, forgetAccountSessions } = await import('../server/utils/sessionAccount')
const { createSessionAccountMemo } = await import('../shared/sessionAccountMemo')

const COOKIE = 'a_session_account'
const HOST = 'kunde-a.pukalani.app'
const EXPIRE = '2027-01-01T00:00:00.000Z'
const NOW = Date.parse('2026-11-22T12:00:00.000Z')
const rawKey = randomBytes(32)
const asEnv = (bytes: Buffer) => bytes.toString('base64')
const cardKey = () => deriveSiteCardKey(rawKey)

function poolTenant(): TenantContext {
  return { mode: 'pool', tenantId: 't-a', communityId: 'c-a', projectId: 'account', pukalaniHost: HOST } as unknown as TenantContext
}

function makeEvent(options: { host?: string, tenant?: TenantContext | null, cookie?: string } = {}): H3Event {
  return {
    headers: { host: options.host ?? HOST },
    cookies: options.cookie ? { [COOKIE]: options.cookie } : {},
    context: { tenant: options.tenant === undefined ? poolTenant() : options.tenant ?? undefined },
  } as unknown as H3Event
}

const CARD = { sessionId: 'sess-1', userId: 'u-alice', authAt: NOW - 1000, own: true }

beforeEach(() => {
  cookieWrites.length = 0
  logLines.length = 0
  resetSiteCardWriteLogForTests()
})

afterEach(() => {
  configureSiteCard(undefined)
})

describe('setSessionCookie je Modus', () => {
  for (const mode of ['off', 'read'] as const) {
    it(`${mode}: im Cookie steht genau das Geheimnis, mit denselben Schaltern wie vor E1`, () => {
      configureSiteCard(mode === 'off' ? undefined : { mode, key: asEnv(rawKey) })
      setSessionCookie(makeEvent(), 'geheimnis-klartext', EXPIRE, { card: CARD })
      setSessionCookie(makeEvent(), 'geheimnis-klartext', EXPIRE, { partitioned: true, card: CARD })
      expect(cookieWrites).toEqual([
        { name: COOKIE, value: 'geheimnis-klartext', options: { expires: new Date(EXPIRE), path: '/', httpOnly: true, secure: true, sameSite: 'lax', partitioned: false } },
        { name: COOKIE, value: 'geheimnis-klartext', options: { expires: new Date(EXPIRE), path: '/', httpOnly: true, secure: true, sameSite: 'none', partitioned: true } },
      ])
      expect(logLines).toEqual([])
    })
  }

  it('write: eine Karte für Host und Community der Anfrage, mit Sitzung, Konto, Ablauf und authAt', () => {
    configureSiteCard({ mode: 'write', key: asEnv(rawKey) })
    setSessionCookie(makeEvent({ host: 'Kunde-A.pukalani.app:3000' }), 'geheimnis-karte', EXPIRE, { card: CARD })
    expect(cookieWrites).toHaveLength(1)
    const { value, options } = cookieWrites[0]!
    expect(value.startsWith('c1.')).toBe(true)
    expect(value).not.toContain('geheimnis-karte')
    expect(options).toMatchObject({ expires: new Date(EXPIRE), httpOnly: true, sameSite: 'lax' })
    expect(openSiteCard(value, { host: HOST, communityId: 'c-a', now: NOW, keys: [cardKey()], cookieName: COOKIE })).toEqual({
      secret: 'geheimnis-karte',
      sessionId: 'sess-1',
      userId: 'u-alice',
      host: HOST,
      communityId: 'c-a',
      expiresAt: Date.parse(EXPIRE),
      authAt: NOW - 1000,
      own: true,
    })
    // Gegenprobe: an einem anderen Host oder für eine andere Community gilt sie nicht.
    expect(openSiteCard(value, { host: 'kunde-b.pukalani.app', communityId: 'c-a', now: NOW, keys: [cardKey()], cookieName: COOKIE })).toBeNull()
    expect(openSiteCard(value, { host: HOST, communityId: 'c-b', now: NOW, keys: [cardKey()], cookieName: COOKIE })).toBeNull()
  })

  it('write auf dem Kontroll-Host (kein Mandant): Karte mit leerer Community', () => {
    configureSiteCard({ mode: 'write', key: asEnv(rawKey) })
    setSessionCookie(makeEvent({ host: 'account.pukalani.app', tenant: null }), 'g', EXPIRE, { card: CARD })
    const claims = openSiteCard(cookieWrites[0]!.value, { host: 'account.pukalani.app', communityId: '', now: NOW, keys: [cardKey()], cookieName: COOKIE })
    expect(claims?.communityId).toBe('')
  })

  it('write: eine Kopie (own: false) trägt kein Merkmal „eigen"', () => {
    configureSiteCard({ mode: 'write', key: asEnv(rawKey) })
    setSessionCookie(makeEvent(), 'g', EXPIRE, { card: { ...CARD, own: false } })
    const claims = openSiteCard(cookieWrites[0]!.value, { host: HOST, communityId: 'c-a', now: NOW, keys: [cardKey()], cookieName: COOKIE })
    expect(claims).not.toBeNull()
    expect(claims?.own).toBeUndefined()
  })

  it('write ohne brauchbaren Schlüssel: Klartext und GENAU eine Log-Zeile je Prozess', () => {
    configureSiteCard({ mode: 'write' })
    logLines.length = 0
    setSessionCookie(makeEvent(), 'g-1', EXPIRE, { card: CARD })
    setSessionCookie(makeEvent(), 'g-2', EXPIRE, { card: CARD })
    expect(cookieWrites.map(write => write.value)).toEqual(['g-1', 'g-2'])
    expect(logLines.map(line => line.event)).toEqual(['site_card.write_without_key'])
    expect(JSON.stringify(logLines)).not.toContain('g-1')
  })

  it('write mit unlesbarem Ablauf: Klartext mit Log-Zeile statt einer Karte ohne Ablauf', () => {
    configureSiteCard({ mode: 'write', key: asEnv(rawKey) })
    setSessionCookie(makeEvent(), 'g', 'kein-datum', { card: CARD })
    expect(cookieWrites[0]!.value).toBe('g')
    expect(logLines.map(line => [line.event, line.data.reason])).toEqual([['site_card.write_skipped', 'expire_invalid']])
  })

  it('freshSignInCard: eigene Sitzung, Anmeldung jetzt', () => {
    expect(freshSignInCard({ $id: 's-9', userId: 'u-9' }, NOW)).toEqual({ sessionId: 's-9', userId: 'u-9', authAt: NOW, own: true })
  })

  it('alte Karte ohne Merkmal öffnet sich weiter (gilt als Kopie)', () => {
    const card = sealSiteCard({ secret: 's', sessionId: 'x', userId: 'u', host: HOST, communityId: 'c-a', expiresAt: NOW + 1000, authAt: NOW }, { key: cardKey(), cookieName: COOKIE })
    const claims = openSiteCard(card, { host: HOST, communityId: 'c-a', now: NOW, keys: [cardKey()], cookieName: COOKIE })
    expect(claims).not.toBeNull()
    expect(claims?.own).toBeUndefined()
  })
})

describe('Siegel für den Host-Wechsel: neue und alte Fassung', () => {
  const key = deriveHandoffKey('probe-server-key')

  it('neue Fassung trägt Konto, Sitzung und ursprüngliche Anmeldung', () => {
    const token = sealHandoff({ secret: 's', userId: 'u-a', sessionId: 'sess-a', authAt: NOW - 5000 }, key, HOST, NOW)
    expect(openHandoff(token, key, HOST, NOW)).toEqual({ secret: 's', userId: 'u-a', sessionId: 'sess-a', authAt: NOW - 5000 })
    // Die Kurzform liest auch die neue Fassung.
    expect(openHandoffToken(token, key, HOST, NOW)).toBe('s')
  })

  it('alte Fassung (nur Geheimnis) öffnet sich weiter, ohne Zusatzfelder', () => {
    const token = sealHandoffToken('s', key, HOST, NOW)
    expect(openHandoff(token, key, HOST, NOW)).toEqual({ secret: 's' })
  })

  it('Ablauf, fremder Host und fremder Schlüssel gelten weiter', () => {
    const token = sealHandoff({ secret: 's', userId: 'u-a' }, key, HOST, NOW)
    expect(openHandoff(token, key, HOST, NOW + HANDOFF_TTL_MS + 1)).toBeNull()
    expect(openHandoff(token, key, 'kunde-b.pukalani.app', NOW)).toBeNull()
    expect(openHandoff(token, deriveHandoffKey('anderer-schluessel'), HOST, NOW)).toBeNull()
  })
})

describe('Anmelde-Merker: mehrere eigene Sitzungen eines Kontos', () => {
  interface User { $id: string, name: string }

  it('die pure Regel: forgetUser räumt ALLE Sitzungen des Kontos, ein fremdes bleibt', async () => {
    const memo = createSessionAccountMemo<User>({ ttlMs: 5_000, maxEntries: 100, now: () => 0 })
    const calls = { n: 0 }
    const alice = async () => {
      calls.n += 1
      return { $id: 'u-alice', name: 'Alice' }
    }
    const bob = async () => {
      calls.n += 1
      return { $id: 'u-bob', name: 'Bob' }
    }
    // drei Sitzungen derselben Person (drei Seiten) und eine fremde
    for (const key of ['seite-a', 'seite-b', 'kunde-domain']) await memo.lookup(key, alice)
    await memo.lookup('bob', bob)
    expect(memo.size()).toBe(4)
    memo.forgetUser('u-alice')
    expect(memo.size()).toBe(1)
    calls.n = 0
    for (const key of ['seite-a', 'seite-b', 'kunde-domain']) await memo.lookup(key, alice)
    await memo.lookup('bob', bob)
    expect(calls.n).toBe(3)
  })

  it('am Server: forgetAccountSessions räumt die Sitzungen aller Hosts eines Kontos', async () => {
    configureSiteCard({ mode: 'write', key: asEnv(rawKey) })
    const user = { $id: `u-${randomBytes(4).toString('hex')}` } as Models.User<Models.Preferences>
    const counter = { n: 0 }
    const fetcher = async () => {
      counter.n += 1
      return structuredClone(user)
    }
    const eventA = makeEvent({ host: HOST })
    const eventB = makeEvent({ host: 'kunde-b.pukalani.app', tenant: { ...poolTenant(), tenantId: 't-b', communityId: 'c-b' } as TenantContext })
    await lookupSessionAccount(eventA, 'sitzung-seite-a', fetcher)
    await lookupSessionAccount(eventB, 'sitzung-seite-b', fetcher)
    await lookupSessionAccount(eventA, 'sitzung-seite-a', fetcher)
    expect(counter.n).toBe(2)
    forgetAccountSessions(user.$id)
    await lookupSessionAccount(eventA, 'sitzung-seite-a', fetcher)
    await lookupSessionAccount(eventB, 'sitzung-seite-b', fetcher)
    expect(counter.n).toBe(4)
  })
})
