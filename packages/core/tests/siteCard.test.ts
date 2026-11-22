import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isCustomDomainHost,
  looksLikeSiteCard,
  olderAuthTime,
  parseSiteCardMode,
  siteCardCommunityOf,
  type SiteCardClaims,
} from '../shared/siteCard'
import type { TenantContext } from '../shared/types/tenant'

/**
 * EINTRITTSKARTE JE SEITE (PK1 E1a): Umschlag, Schalter, der eine Lesepunkt,
 * Anmelde-Merker und Frische-Prüfung.
 *
 * Die Schlüssel entstehen je Lauf aus Zufall — kein Testwert im Quelltext,
 * der wie ein Geheimnis aussieht.
 */

const COOKIE = 'a_session_account'
const { SESSION_CREATED, logLines } = vi.hoisted(() => ({
  SESSION_CREATED: { at: new Date().toISOString() },
  logLines: [] as Array<{ level: string, event: string, data: Record<string, unknown> }>,
}))

vi.mock('../server/lib/appwrite', () => ({
  sessionCookieName: () => 'a_session_account',
  createSessionClient: () => ({
    account: {
      getSession: async () => ({ $id: 'current', $createdAt: SESSION_CREATED.at }),
    },
  }),
}))

vi.mock('../server/utils/logEvent', () => ({
  logEvent: (level: string, event: string, data: Record<string, unknown> = {}) => {
    logLines.push({ level, event, data })
  },
}))

vi.stubGlobal('getCookie', (event: { cookies: Record<string, string> }, name: string) => event.cookies[name])
vi.stubGlobal('getHeader', (event: { headers: Record<string, string> }, name: string) => event.headers[name.toLowerCase()])
vi.stubGlobal('createError', (input: { status: number, statusText: string, data?: unknown }) =>
  Object.assign(new Error(input.statusText), input))

const { sealSiteCard, openSiteCard, configureSiteCard, parseSiteCardKey, siteCardSettings } = await import('../server/utils/siteCard')
const { readRequestSession } = await import('../server/utils/requestSession')
const { lookupSessionAccount, forgetRequestSession } = await import('../server/utils/sessionAccount')
const { requireRecentAuth } = await import('../server/utils/recentAuth')

const NOW = Date.parse('2026-11-22T12:00:00.000Z')
const HOUR = 60 * 60 * 1000

const mainKey = randomBytes(32)
const otherKey = randomBytes(32)
const asEnv = (bytes: Buffer) => bytes.toString('base64')

function claims(over: Partial<SiteCardClaims> = {}): SiteCardClaims {
  return {
    secret: 'appwrite-geheimnis-123',
    sessionId: 'sess-1',
    userId: 'u-alice',
    host: 'kunde-a.pukalani.app',
    communityId: 'c-a',
    expiresAt: NOW + 24 * HOUR,
    authAt: NOW - HOUR,
    ...over,
  }
}

const open = (value: string, over: Partial<Parameters<typeof openSiteCard>[1]> = {}) =>
  openSiteCard(value, { host: 'kunde-a.pukalani.app', communityId: 'c-a', now: NOW, keys: [mainKey], cookieName: COOKIE, ...over })

/** Ein Byte im versiegelten Teil umdrehen (nach dem letzten Punkt). */
function flipByte(card: string): string {
  const dot = card.lastIndexOf('.')
  const raw = Buffer.from(card.slice(dot + 1), 'base64url')
  raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 0x01
  return `${card.slice(0, dot + 1)}${raw.toString('base64url')}`
}

describe('Umschlag: sealSiteCard / openSiteCard', () => {
  it('richtige Karte am richtigen Ort ⇒ gilt, mit allen Ansprüchen', () => {
    const card = sealSiteCard(claims(), { key: mainKey, cookieName: COOKIE })
    expect(card.startsWith('c1.')).toBe(true)
    expect(card).not.toContain('appwrite-geheimnis-123')
    expect(open(card)).toEqual(claims())
  })

  it('der Host wird wie beim Siegel normalisiert (Groß/klein, Port)', () => {
    const card = sealSiteCard(claims({ host: 'Kunde-A.pukalani.app:443' }), { key: mainKey, cookieName: COOKIE })
    expect(open(card, { host: 'kunde-a.PUKALANI.app:3000' })?.host).toBe('kunde-a.pukalani.app')
  })

  it('zwei Karten mit demselben Inhalt sehen verschieden aus (zufälliger IV)', () => {
    const a = sealSiteCard(claims(), { key: mainKey, cookieName: COOKIE })
    const b = sealSiteCard(claims(), { key: mainKey, cookieName: COOKIE })
    expect(a).not.toBe(b)
  })

  it('falscher Host ⇒ ungültig', () => {
    const card = sealSiteCard(claims(), { key: mainKey, cookieName: COOKIE })
    expect(open(card, { host: 'kunde-b.pukalani.app' })).toBeNull()
    expect(open(card, { host: '' })).toBeNull()
  })

  it('falsche Community (der Host gehört jetzt einer anderen) ⇒ ungültig', () => {
    const card = sealSiteCard(claims(), { key: mainKey, cookieName: COOKIE })
    expect(open(card, { communityId: 'c-b' })).toBeNull()
    expect(open(card, { communityId: '' })).toBeNull()
  })

  it('Karte ohne Community gilt nur, wo der Host kein Mandant ist', () => {
    const card = sealSiteCard(claims({ host: 'account.pukalani.app', communityId: '' }), { key: mainKey, cookieName: COOKIE })
    expect(open(card, { host: 'account.pukalani.app', communityId: '' })).not.toBeNull()
    expect(open(card, { host: 'account.pukalani.app', communityId: 'c-a' })).toBeNull()
  })

  it('abgelaufen ⇒ ungültig (Gegenprobe: eine Millisekunde vorher gilt sie)', () => {
    const card = sealSiteCard(claims({ expiresAt: NOW + 1 }), { key: mainKey, cookieName: COOKIE })
    expect(open(card)).not.toBeNull()
    expect(open(card, { now: NOW + 1 })).toBeNull()
  })

  it('ein Byte geändert ⇒ ungültig', () => {
    const card = sealSiteCard(claims(), { key: mainKey, cookieName: COOKIE })
    expect(open(flipByte(card))).toBeNull()
  })

  it('fremder Schlüssel ⇒ ungültig', () => {
    const card = sealSiteCard(claims(), { key: otherKey, cookieName: COOKIE })
    expect(open(card)).toBeNull()
  })

  it('der alte Schlüssel liest weiter (geplanter Tausch)', () => {
    const card = sealSiteCard(claims(), { key: otherKey, cookieName: COOKIE })
    expect(open(card, { keys: [mainKey, otherKey] })).toEqual(claims())
  })

  it('anderer Cookie-Name (AAD) ⇒ ungültig', () => {
    const card = sealSiteCard(claims(), { key: mainKey, cookieName: COOKIE })
    expect(open(card, { cookieName: 'a_session_admin' })).toBeNull()
  })

  it('falsches oder fehlendes Präfix ⇒ ungültig', () => {
    const card = sealSiteCard(claims(), { key: mainKey, cookieName: COOKIE })
    expect(open(card.replace(/^c1\./, 'c2.'))).toBeNull()
    expect(open(card.slice(3))).toBeNull()
    expect(open('c1.')).toBeNull()
    expect(open('c1.abcdef12')).toBeNull()
  })

  it('ohne Host oder Geheimnis entsteht keine Karte', () => {
    expect(() => sealSiteCard(claims({ host: '' }), { key: mainKey, cookieName: COOKIE })).toThrow()
    expect(() => sealSiteCard(claims({ secret: '' }), { key: mainKey, cookieName: COOKIE })).toThrow()
  })

  it('looksLikeSiteCard trennt Karte und Klartext', () => {
    expect(looksLikeSiteCard(sealSiteCard(claims(), { key: mainKey, cookieName: COOKIE }))).toBe(true)
    expect(looksLikeSiteCard('c2.irgendwas')).toBe(true)
    expect(looksLikeSiteCard('a1b2c3d4e5f6')).toBe(false)
  })
})

describe('Schalter: configureSiteCard', () => {
  beforeEach(() => {
    logLines.length = 0
  })
  afterEach(() => {
    configureSiteCard(undefined)
  })

  it('nicht gesetzt ⇒ off, kein Log', () => {
    expect(configureSiteCard(undefined).mode).toBe('off')
    expect(configureSiteCard({ mode: '', key: '' }).mode).toBe('off')
    expect(logLines).toEqual([])
  })

  it('read mit gültigem Schlüssel ⇒ read, kein Log', () => {
    const settings = configureSiteCard({ mode: 'read', key: asEnv(mainKey) })
    expect(settings.mode).toBe('read')
    expect(settings.keys).toHaveLength(1)
    expect(logLines).toEqual([])
  })

  it('base64url-Schreibweise des Schlüssels wird angenommen', () => {
    expect(configureSiteCard({ mode: 'read', key: mainKey.toString('base64url') }).mode).toBe('read')
  })

  it('alter Schlüssel kommt als zweiter dazu', () => {
    const settings = configureSiteCard({ mode: 'write', key: asEnv(mainKey), previousKey: asEnv(otherKey) })
    expect(settings.mode).toBe('write')
    expect(settings.keys.map(key => key.toString('hex'))).toEqual([mainKey.toString('hex'), otherKey.toString('hex')])
  })

  it('Schlüssel fehlt ⇒ off und GENAU eine Log-Zeile ohne Wert', () => {
    expect(configureSiteCard({ mode: 'read', key: '' }).mode).toBe('off')
    expect(logLines).toHaveLength(1)
    expect(logLines[0]).toMatchObject({ level: 'error', event: 'site_card.config_invalid', data: { reason: 'key_missing' } })
  })

  it('Schlüssel kaputt (zu kurz, kein base64, keine Zeichenkette) ⇒ off, eine Log-Zeile je Versuch', () => {
    for (const bad of [randomBytes(16).toString('base64'), 'kein base64!', 12345]) {
      logLines.length = 0
      expect(configureSiteCard({ mode: 'write', key: bad }).mode).toBe('off')
      expect(logLines).toHaveLength(1)
      expect(logLines[0]?.data.reason).toBe('key_invalid')
      expect(JSON.stringify(logLines[0])).not.toContain(String(bad))
    }
  })

  it('kaputter alter Schlüssel ⇒ off', () => {
    expect(configureSiteCard({ mode: 'read', key: asEnv(mainKey), previousKey: 'xx' }).mode).toBe('off')
    expect(logLines[0]?.data.reason).toBe('previous_key_invalid')
  })

  it('unbekannter Modus ⇒ off mit Log', () => {
    expect(configureSiteCard({ mode: 'on', key: asEnv(mainKey) }).mode).toBe('off')
    expect(logLines[0]?.data.reason).toBe('mode_unknown')
  })

  it('parseSiteCardKey / parseSiteCardMode', () => {
    expect(parseSiteCardKey('')).toBeNull()
    expect(parseSiteCardKey(undefined)).toBeNull()
    expect(parseSiteCardKey(asEnv(mainKey))).toBeInstanceOf(Buffer)
    expect(parseSiteCardKey('abc')).toBe('invalid')
    expect(parseSiteCardMode(' WRITE ')).toBe('write')
    expect(parseSiteCardMode(null)).toBe('off')
    expect(parseSiteCardMode(1)).toBeNull()
  })
})

// ─── Die puren Fragen ────────────────────────────────────────────────────────

const poolTenant = (over: Partial<Extract<TenantContext, { mode: 'pool' }>> = {}): TenantContext => ({
  mode: 'pool',
  projectId: 'account',
  tenantId: 't-a',
  communityId: 'c-a',
  canonicalHost: 'kunde-a.pukalani.app',
  pukalaniHost: 'kunde-a.pukalani.app',
  ...over,
})

describe('Kundendomain und Community des Hosts', () => {
  it('Pukalani-Adresse der Community ⇒ keine eigene Domain', () => {
    expect(isCustomDomainHost('kunde-a.pukalani.app', poolTenant())).toBe(false)
  })

  it('eigene Domain (und ihre www-Form) ⇒ eigene Domain', () => {
    const tenant = poolTenant({ canonicalHost: 'www.kunde.de' })
    expect(isCustomDomainHost('www.kunde.de', tenant)).toBe(true)
    expect(isCustomDomainHost('kunde.de', tenant)).toBe(true)
  })

  it('kein Mandant (Kontroll-Host, Einzel-Instanz) ⇒ keine eigene Domain', () => {
    expect(isCustomDomainHost('account.pukalani.app', undefined)).toBe(false)
  })

  it('fail-closed: Mandant ohne Pukalani-Adresse gilt als eigene Domain', () => {
    expect(isCustomDomainHost('kunde-a.pukalani.app', poolTenant({ pukalaniHost: undefined }))).toBe(true)
  })

  it('Community des Hosts: communityId, sonst tenantId im Pool, sonst leer', () => {
    expect(siteCardCommunityOf(poolTenant())).toBe('c-a')
    expect(siteCardCommunityOf(poolTenant({ communityId: undefined }))).toBe('t-a')
    expect(siteCardCommunityOf({ mode: 'silo', projectId: 'p' })).toBe('')
    expect(siteCardCommunityOf(undefined)).toBe('')
  })

  it('olderAuthTime nimmt den älteren Zeitpunkt, unlesbar ⇒ null', () => {
    const created = new Date(NOW).toISOString()
    expect(olderAuthTime(created, NOW - HOUR)).toBe(new Date(NOW - HOUR).toISOString())
    expect(olderAuthTime(new Date(NOW - 2 * HOUR).toISOString(), NOW - HOUR)).toBe(new Date(NOW - 2 * HOUR).toISOString())
    expect(olderAuthTime(undefined, NOW)).toBeNull()
    expect(olderAuthTime('kein-datum', NOW)).toBeNull()
  })
})

// ─── Der Lesepunkt ───────────────────────────────────────────────────────────

function makeEvent(cookie: string | undefined, host: string, tenant?: TenantContext, method = 'GET'): H3Event {
  return {
    method,
    path: '/api/x',
    cookies: cookie === undefined ? {} : { [COOKIE]: cookie },
    headers: { host },
    context: tenant ? { tenant } : {},
  } as unknown as H3Event
}

function cardFor(over: Partial<SiteCardClaims> = {}, key: Buffer = mainKey): string {
  return sealSiteCard(claims({ expiresAt: Date.now() + HOUR, ...over }), { key, cookieName: COOKIE })
}

describe('readRequestSession je Modus', () => {
  afterEach(() => {
    configureSiteCard(undefined)
  })

  describe('off (Core-Default)', () => {
    it('liefert exakt den Cookie-Wert wie vor E1 — auch eine Karte bleibt roh', () => {
      expect(siteCardSettings().mode).toBe('off')
      expect(readRequestSession(makeEvent('klartext-geheimnis', 'kunde-a.pukalani.app', poolTenant()))).toEqual({ secret: 'klartext-geheimnis', format: 'plain' })
      const card = cardFor()
      expect(readRequestSession(makeEvent(card, 'kunde-a.pukalani.app', poolTenant()))).toEqual({ secret: card, format: 'plain' })
    })

    it('kein Cookie oder leer ⇒ nichts', () => {
      expect(readRequestSession(makeEvent(undefined, 'kunde-a.pukalani.app'))).toBeNull()
      expect(readRequestSession(makeEvent('', 'kunde-a.pukalani.app'))).toBeNull()
    })

    it('auf einer eigenen Domain gilt Klartext weiter (nichts ändert sich)', () => {
      expect(readRequestSession(makeEvent('klartext', 'www.kunde.de', poolTenant()))?.secret).toBe('klartext')
    })

    it('fehlender oder kaputter Schlüssel verhält sich wie off', () => {
      configureSiteCard({ mode: 'write', key: '' })
      const card = cardFor()
      expect(readRequestSession(makeEvent(card, 'kunde-a.pukalani.app', poolTenant()))).toEqual({ secret: card, format: 'plain' })
      expect(readRequestSession(makeEvent('klartext', 'www.kunde.de', poolTenant()))?.secret).toBe('klartext')
      configureSiteCard({ mode: 'read', key: 'kaputt' })
      expect(readRequestSession(makeEvent(card, 'kunde-a.pukalani.app', poolTenant()))).toEqual({ secret: card, format: 'plain' })
    })
  })

  describe('read', () => {
    beforeEach(() => {
      configureSiteCard({ mode: 'read', key: asEnv(mainKey) })
    })

    it('eine gültige Karte wird geöffnet', () => {
      const session = readRequestSession(makeEvent(cardFor(), 'kunde-a.pukalani.app', poolTenant()))
      expect(session?.format).toBe('card')
      expect(session?.secret).toBe('appwrite-geheimnis-123')
    })

    it('Klartext geht weiter — auch auf einer eigenen Domain', () => {
      expect(readRequestSession(makeEvent('klartext', 'kunde-a.pukalani.app', poolTenant()))).toEqual({ secret: 'klartext', format: 'plain' })
      expect(readRequestSession(makeEvent('klartext', 'www.kunde.de', poolTenant()))).toEqual({ secret: 'klartext', format: 'plain' })
    })

    it('Karte auf einem anderen Host oder einer anderen Community ⇒ nichts', () => {
      const card = cardFor()
      expect(readRequestSession(makeEvent(card, 'kunde-b.pukalani.app', poolTenant({ pukalaniHost: 'kunde-b.pukalani.app' })))).toBeNull()
      expect(readRequestSession(makeEvent(card, 'kunde-a.pukalani.app', poolTenant({ communityId: 'c-andere' })))).toBeNull()
    })

    it('Kontroll-Host ohne Mandant: Karte mit leerer Community gilt', () => {
      const card = cardFor({ host: 'account.pukalani.app', communityId: '' })
      expect(readRequestSession(makeEvent(card, 'account.pukalani.app'))?.format).toBe('card')
    })

    it('rechnet je Anfrage nur einmal', () => {
      const event = makeEvent(cardFor(), 'kunde-a.pukalani.app', poolTenant())
      const first = readRequestSession(event)
      ;(event as unknown as { cookies: Record<string, string> }).cookies[COOKIE] = 'geändert'
      expect(readRequestSession(event)).toBe(first)
    })
  })

  describe('write', () => {
    beforeEach(() => {
      configureSiteCard({ mode: 'write', key: asEnv(mainKey) })
    })

    it('auf einer eigenen Domain gilt NUR die Karte — Klartext wird ignoriert', () => {
      const tenant = poolTenant({ canonicalHost: 'www.kunde.de' })
      expect(readRequestSession(makeEvent('klartext', 'www.kunde.de', tenant))).toBeNull()
      const card = cardFor({ host: 'www.kunde.de' })
      expect(readRequestSession(makeEvent(card, 'www.kunde.de', tenant))?.format).toBe('card')
    })

    it('auf der Pukalani-Adresse und dem Kontroll-Host gilt Klartext weiter (Gegenprobe)', () => {
      expect(readRequestSession(makeEvent('klartext', 'kunde-a.pukalani.app', poolTenant()))?.format).toBe('plain')
      expect(readRequestSession(makeEvent('klartext', 'account.pukalani.app'))?.format).toBe('plain')
    })
  })
})

// ─── Anmelde-Merker ──────────────────────────────────────────────────────────

describe('Anmelde-Merker räumt mit Karte und mit Klartext', () => {
  afterEach(() => {
    configureSiteCard(undefined)
  })

  const alice = { $id: 'u-alice', name: 'Alice', labels: [] } as unknown as Models.User<Models.Preferences>

  async function lookups(event: H3Event, counter: { n: number }) {
    await lookupSessionAccount(event, readRequestSession(event)?.secret ?? '', async () => {
      counter.n += 1
      return structuredClone(alice)
    })
  }

  it('Klartext: nachschlagen, vergessen, frisch fragen', async () => {
    configureSiteCard({ mode: 'read', key: asEnv(mainKey) })
    const counter = { n: 0 }
    const secret = `klartext-${randomBytes(4).toString('hex')}`
    await lookups(makeEvent(secret, 'kunde-a.pukalani.app', poolTenant()), counter)
    await lookups(makeEvent(secret, 'kunde-a.pukalani.app', poolTenant()), counter)
    expect(counter.n).toBe(1)
    forgetRequestSession(makeEvent(secret, 'kunde-a.pukalani.app', poolTenant()))
    await lookups(makeEvent(secret, 'kunde-a.pukalani.app', poolTenant()), counter)
    expect(counter.n).toBe(2)
  })

  it('Karte: der Merker hängt am INNEREN Geheimnis — Vergessen über die Karte räumt', async () => {
    configureSiteCard({ mode: 'read', key: asEnv(mainKey) })
    const counter = { n: 0 }
    const inner = `innen-${randomBytes(4).toString('hex')}`
    const card = cardFor({ secret: inner })
    await lookups(makeEvent(card, 'kunde-a.pukalani.app', poolTenant()), counter)
    // derselbe innere Wert als Klartext trifft denselben Eintrag
    await lookups(makeEvent(inner, 'kunde-a.pukalani.app', poolTenant()), counter)
    expect(counter.n).toBe(1)
    forgetRequestSession(makeEvent(card, 'kunde-a.pukalani.app', poolTenant()))
    await lookups(makeEvent(inner, 'kunde-a.pukalani.app', poolTenant()), counter)
    expect(counter.n).toBe(2)
  })
})

// ─── Frische ─────────────────────────────────────────────────────────────────

describe('requireRecentAuth mit Karte', () => {
  beforeEach(() => {
    SESSION_CREATED.at = new Date().toISOString()
  })
  afterEach(() => {
    configureSiteCard(undefined)
  })

  const reauth = (event: H3Event) => requireRecentAuth(event).then(() => 'ok', (error: { status?: number }) => error.status)

  it('ohne Karte zählt allein die frische Sitzung (wie vor E1)', async () => {
    configureSiteCard({ mode: 'read', key: asEnv(mainKey) })
    expect(await reauth(makeEvent('klartext', 'kunde-a.pukalani.app', poolTenant()))).toBe('ok')
  })

  it('Karte mit alter ursprünglicher Anmeldung ⇒ 403, obwohl die Sitzung frisch ist', async () => {
    configureSiteCard({ mode: 'read', key: asEnv(mainKey) })
    const card = cardFor({ authAt: Date.now() - HOUR })
    expect(await reauth(makeEvent(card, 'kunde-a.pukalani.app', poolTenant()))).toBe(403)
  })

  it('Karte mit frischer Anmeldung ⇒ durch (Gegenprobe)', async () => {
    configureSiteCard({ mode: 'read', key: asEnv(mainKey) })
    const card = cardFor({ authAt: Date.now() - 60_000 })
    expect(await reauth(makeEvent(card, 'kunde-a.pukalani.app', poolTenant()))).toBe('ok')
  })

  it('frische Karte rettet keine alte Sitzung (der ältere gilt)', async () => {
    configureSiteCard({ mode: 'read', key: asEnv(mainKey) })
    SESSION_CREATED.at = new Date(Date.now() - HOUR).toISOString()
    const card = cardFor({ authAt: Date.now() })
    expect(await reauth(makeEvent(card, 'kunde-a.pukalani.app', poolTenant()))).toBe(403)
  })
})
