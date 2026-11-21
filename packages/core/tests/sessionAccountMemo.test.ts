import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { createSessionAccountMemo } from '../shared/sessionAccountMemo'

/**
 * Anmelde-Merker (Q12, PERF-003; Davids Entscheidung B3: eine widerrufene
 * Sitzung wirkt höchstens 5 s nach).
 *
 * Teil 1 prüft die pure Regel (`core/shared/sessionAccountMemo.ts`) mit
 * gestellter Uhr. Teil 2 fährt die ECHTE Middleware `02.auth.ts` mit einer
 * nachgebauten Appwrite: welches Konto zu welcher Sitzung gehört, entscheidet
 * NUR die Attrappe (`ACCOUNTS`), nie der Merker — so sieht der Test, wenn der
 * Merker eine Sitzung dem falschen Konto zuordnet.
 */

interface User { $id: string, name: string, labels: string[] }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('Anmelde-Merker — die pure Regel', () => {
  let clock = 0
  const make = (maxEntries = 100) => createSessionAccountMemo<User>({ ttlMs: 5_000, maxEntries, now: () => clock })
  const alice: User = { $id: 'u-alice', name: 'Alice', labels: [] }
  const bob: User = { $id: 'u-bob', name: 'Bob', labels: [] }

  beforeEach(() => { clock = 1_000_000 })

  it('gilt höchstens 5 s: innerhalb ein Abruf, danach ein neuer', async () => {
    const memo = make()
    const fetcher = vi.fn(async () => alice)
    await memo.lookup('k1', fetcher)
    clock += 4_999
    await memo.lookup('k1', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    clock += 1
    await memo.lookup('k1', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('zwei Sitzungen, zwei Einträge — nie das Konto der anderen', async () => {
    const memo = make()
    expect((await memo.lookup('k-a', async () => alice)).$id).toBe('u-alice')
    expect((await memo.lookup('k-b', async () => bob)).$id).toBe('u-bob')
    expect((await memo.lookup('k-a', async () => bob)).$id).toBe('u-alice')
    expect((await memo.lookup('k-b', async () => alice)).$id).toBe('u-bob')
  })

  it('gleichzeitige Anfragen derselben Sitzung teilen sich EINE Abfrage', async () => {
    const memo = make()
    const gate = deferred<User>()
    const fetcher = vi.fn(() => gate.promise)
    const all = Promise.all([memo.lookup('k1', fetcher), memo.lookup('k1', fetcher), memo.lookup('k1', fetcher)])
    gate.resolve(alice)
    const users = await all
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(users.map(u => u.$id)).toEqual(['u-alice', 'u-alice', 'u-alice'])
  })

  it('Fehler werden nicht gemerkt — und räumen den alten Eintrag', async () => {
    const memo = make()
    await memo.lookup('k1', async () => alice)
    await expect(memo.lookup('k1', async () => { throw new Error('401') }, { fresh: true })).rejects.toThrow('401')
    expect(memo.size()).toBe(0)
    const fetcher = vi.fn(async () => { throw new Error('503') })
    await expect(memo.lookup('k2', fetcher)).rejects.toThrow('503')
    await expect(memo.lookup('k2', fetcher)).rejects.toThrow('503')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('fresh fragt immer neu und merkt das neue Ergebnis', async () => {
    const memo = make()
    await memo.lookup('k1', async () => alice)
    const renamed = { ...alice, name: 'Alice Neu' }
    expect((await memo.lookup('k1', async () => renamed, { fresh: true })).name).toBe('Alice Neu')
    expect((await memo.lookup('k1', async () => alice)).name).toBe('Alice Neu')
  })

  it('forgetKey und forgetUser räumen sofort', async () => {
    const memo = make()
    await memo.lookup('k-a1', async () => alice)
    await memo.lookup('k-a2', async () => alice)
    await memo.lookup('k-b', async () => bob)
    memo.forgetKey('k-a1')
    expect(memo.size()).toBe(2)
    memo.forgetUser('u-alice')
    expect(memo.size()).toBe(1)
    const fetcher = vi.fn(async () => bob)
    await memo.lookup('k-b', fetcher)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('eine Abfrage, die beim Räumen unterwegs war, wird NICHT gemerkt, und niemand hängt sich mehr an', async () => {
    const memo = make()
    const old = deferred<User>()
    const first = memo.lookup('k1', () => old.promise)
    memo.forgetUser('u-alice')
    const fresh = vi.fn(async () => ({ ...alice, labels: ['neu'] }))
    const second = memo.lookup('k1', fresh)
    old.resolve(alice)
    expect((await first).labels).toEqual([])
    expect((await second).labels).toEqual(['neu'])
    expect(fresh).toHaveBeenCalledTimes(1)
    // Gemerkt ist der Stand NACH dem Räumen, nicht der von davor
    expect((await memo.lookup('k1', async () => alice)).labels).toEqual(['neu'])
  })

  it('begrenzte Größe: voll ⇒ die ältesten fliegen raus', async () => {
    const memo = make(3)
    for (const k of ['k1', 'k2', 'k3', 'k4']) await memo.lookup(k, async () => ({ ...alice, $id: `u-${k}` }))
    expect(memo.size()).toBe(3)
    const fetcher = vi.fn(async () => alice)
    await memo.lookup('k1', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('jeder Treffer ist eine Kopie', async () => {
    const memo = make()
    const first = await memo.lookup('k1', async () => alice)
    first.labels.push('verändert')
    expect((await memo.lookup('k1', async () => alice)).labels).toEqual([])
  })
})

// ─── Teil 2: die echte Middleware ────────────────────────────────────────────

/** Die nachgebaute Appwrite: Sitzungs-Geheimnis → Konto. Fehlt es, ist die Sitzung widerrufen. */
const ACCOUNTS = new Map<string, User>()
/** Ein Lesefehler (Appwrite nicht erreichbar) statt einer Antwort. */
let appwriteDown = false
const accountGets: string[] = []

vi.mock('../server/lib/appwrite', () => {
  return {
    sessionCookieName: (event: H3Event) => `a_session_${(event.context.tenant as { projectId?: string } | undefined)?.projectId ?? 'proj'}`,
    // wie das Original: räumt die Sitzung der Anfrage im Merker
    clearSessionCookie: async (event: H3Event) => (await import('../server/utils/sessionAccount')).forgetRequestSession(event),
    createSessionClient: (event: H3Event) => ({
      account: {
        async get() {
          const secret = (event as unknown as { cookies: Record<string, string> }).cookies.session ?? ''
          accountGets.push(secret)
          await Promise.resolve()
          if (appwriteDown) throw Object.assign(new Error('unavailable'), { code: 503 })
          const user = ACCOUNTS.get(secret)
          if (!user) throw Object.assign(new Error('unauthorized'), { code: 401 })
          return structuredClone(user)
        },
      },
    }),
  }
})

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('defineNitroPlugin', (fn: unknown) => fn)
vi.stubGlobal('getCookie', (event: { cookies: Record<string, string> }) => event.cookies.session)

const { default: authMiddleware } = await import('../server/middleware/02.auth') as unknown as {
  default: (event: H3Event) => Promise<void>
}
const { default: memoPlugin } = await import('../server/plugins/session-account-memo') as unknown as {
  default: (app: { hooks: { hook: (name: string, fn: (...args: unknown[]) => void) => void } }) => void
}
const { SESSION_ACCOUNT_TTL_MS, forgetAccountSessions } = await import('../server/utils/sessionAccount')
const { clearSessionCookie } = await import('../server/lib/appwrite')

const hooks = new Map<string, (...args: unknown[]) => void>()
memoPlugin({ hooks: { hook: (name, fn) => { hooks.set(name, fn) } } })

let counter = 0
function freshSecret(user: User): string {
  const secret = `secret-${user.$id}-${++counter}`
  ACCOUNTS.set(secret, user)
  return secret
}

function makeEvent(secret: string | undefined, init: { path?: string, method?: string, tenantId?: string } = {}): H3Event {
  return {
    path: init.path ?? '/de/feed',
    method: init.method ?? 'GET',
    cookies: secret ? { session: secret } : {},
    context: init.tenantId ? { tenant: { mode: 'pool', projectId: 'proj', tenantId: init.tenantId } } : {},
  } as unknown as H3Event
}

async function whoAmI(secret: string | undefined, init?: Parameters<typeof makeEvent>[1]): Promise<string | undefined> {
  const event = makeEvent(secret, init)
  await authMiddleware(event)
  return (event.context.user as User | undefined)?.$id
}

/**
 * Seitenaufbauten wie gemessen (lokal, Platform-App, Konto eines Mitglieds,
 * 2026-11-21 VOR Q12): so oft lief die Middleware je Seitenvorlage mit
 * derselben Sitzung — die Seite selbst plus die `/api`-Aufrufe, die Nuxt beim
 * Rendern intern stellt. Jeder Durchlauf fragte Appwrite nach dem Konto.
 */
const PAGE_BUILDS: Record<string, number> = {
  'Startseite der Community': 7,
  'Feed': 13,
  'Beitrag mit Kommentaren': 13,
  'Dashboard-Übersicht': 6,
}

describe('02.auth mit Anmelde-Merker — die echte Middleware', () => {
  const alice: User = { $id: 'u-alice', name: 'Alice', labels: ['a'] }
  const bob: User = { $id: 'u-bob', name: 'Bob', labels: ['b'] }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-21T10:00:00Z'))
    accountGets.length = 0
    appwriteDown = false
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  for (const [template, passes] of Object.entries(PAGE_BUILDS)) {
    it(`Zähl-Wächter „${template}": ${passes} Durchläufe, höchstens EINE Konto-Abfrage`, async () => {
      const secret = freshSecret(alice)
      // erst die Seite, dann die internen Aufrufe, teils gleichzeitig
      expect(await whoAmI(secret, { path: '/de/seite' })).toBe('u-alice')
      const internal = await Promise.all(Array.from({ length: passes - 1 }, (_, i) => whoAmI(secret, { path: `/api/intern-${i}` })))
      expect(internal.every(id => id === 'u-alice')).toBe(true)
      expect(accountGets.filter(s => s === secret)).toHaveLength(1)
    })
  }

  it('zwei Konten nacheinander: jedes bekommt sein eigenes', async () => {
    const a = freshSecret(alice)
    const b = freshSecret(bob)
    expect(await whoAmI(a)).toBe('u-alice')
    expect(await whoAmI(b)).toBe('u-bob')
    expect(await whoAmI(a)).toBe('u-alice')
    expect(await whoAmI(b)).toBe('u-bob')
    expect(accountGets).toHaveLength(2)
  })

  it('zwei Konten gleichzeitig: keine Verwechslung, je eine Abfrage', async () => {
    const a = freshSecret(alice)
    const b = freshSecret(bob)
    const order = [a, b, a, b, b, a, a, b]
    const ids = await Promise.all(order.map(s => whoAmI(s)))
    expect(ids).toEqual(order.map(s => (s === a ? 'u-alice' : 'u-bob')))
    expect(accountGets.filter(s => s === a)).toHaveLength(1)
    expect(accountGets.filter(s => s === b)).toHaveLength(1)
  })

  it('dieselbe Sitzung auf zwei Mandanten: zwei Einträge', async () => {
    const a = freshSecret(alice)
    await whoAmI(a, { tenantId: 't-1' })
    await whoAmI(a, { tenantId: 't-2' })
    await whoAmI(a, { tenantId: 't-1' })
    expect(accountGets).toHaveLength(2)
  })

  it('ohne Cookie fragt niemand', async () => {
    expect(await whoAmI(undefined)).toBeUndefined()
    expect(accountGets).toHaveLength(0)
  })

  it('Widerruf in einem anderen Prozess wirkt nach spätestens 5 s', async () => {
    const a = freshSecret(alice)
    expect(await whoAmI(a)).toBe('u-alice')
    ACCOUNTS.delete(a) // Appwrite kennt die Sitzung nicht mehr
    vi.setSystemTime(Date.now() + SESSION_ACCOUNT_TTL_MS - 1)
    expect(await whoAmI(a)).toBe('u-alice') // erlaubtes Nachwirken (B3)
    vi.setSystemTime(Date.now() + 1)
    expect(await whoAmI(a)).toBeUndefined()
    expect(SESSION_ACCOUNT_TTL_MS).toBeLessThanOrEqual(5_000)
  })

  it('/api/auth/me fragt immer frisch — die Live-Abmeldung wartet nicht auf den Merker', async () => {
    const a = freshSecret(alice)
    expect(await whoAmI(a)).toBe('u-alice')
    ACCOUNTS.delete(a)
    expect(await whoAmI(a, { path: '/api/auth/me' })).toBeUndefined()
    // …und räumt dabei den Eintrag: auch die nächste Seite ist abgemeldet
    expect(await whoAmI(a)).toBeUndefined()
  })

  it('schreibende Anfragen fragen frisch', async () => {
    const a = freshSecret(alice)
    await whoAmI(a)
    ACCOUNTS.delete(a)
    expect(await whoAmI(a, { method: 'POST', path: '/api/posts' })).toBeUndefined()
  })

  it('Abmelden im selben Prozess räumt sofort', async () => {
    const a = freshSecret(alice)
    await whoAmI(a)
    const logout = makeEvent(a, { method: 'POST', path: '/api/auth/logout' })
    await authMiddleware(logout)
    ACCOUNTS.delete(a)
    await clearSessionCookie(logout)
    expect(await whoAmI(a)).toBeUndefined()
  })

  it('Widerruf im selben Prozess (Sitzungen beenden) räumt alle Sitzungen des Kontos sofort', async () => {
    const tab1 = freshSecret(alice)
    const tab2 = freshSecret(alice)
    await whoAmI(tab1)
    await whoAmI(tab2)
    const revoke = makeEvent(tab1, { method: 'DELETE', path: '/api/auth/sessions' })
    await authMiddleware(revoke)
    ACCOUNTS.delete(tab2)
    hooks.get('beforeResponse')?.(revoke)
    expect(await whoAmI(tab2)).toBeUndefined()
  })

  it('…auch wenn die Route mit einem Fehler endet', async () => {
    const a = freshSecret(alice)
    await whoAmI(a)
    const write = makeEvent(a, { method: 'PATCH', path: '/api/auth/profile' })
    await authMiddleware(write)
    ACCOUNTS.set(a, { ...alice, name: 'Alice Neu' })
    hooks.get('error')?.(new Error('boom'), { event: write })
    const event = makeEvent(a)
    await authMiddleware(event)
    expect((event.context.user as User).name).toBe('Alice Neu')
  })

  it('Betreiber sperrt ein fremdes Konto: forgetAccountSessions räumt sofort', async () => {
    const b = freshSecret(bob)
    await whoAmI(b)
    ACCOUNTS.delete(b)
    forgetAccountSessions('u-bob')
    expect(await whoAmI(b)).toBeUndefined()
  })

  it('Lesefehler: kein Konto für diese Anfrage, nichts gemerkt, die nächste fragt neu', async () => {
    const a = freshSecret(alice)
    appwriteDown = true
    expect(await whoAmI(a)).toBeUndefined()
    appwriteDown = false
    expect(await whoAmI(a)).toBe('u-alice')
    expect(accountGets.filter(s => s === a)).toHaveLength(2)
  })
})
