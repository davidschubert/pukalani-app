/**
 * KONTO-SEITEN LEITEN IN DEN KUNDENBEREICH (SEO-002, 2026-11-21).
 *
 * Geprüft wird die ECHTE Middleware dieser App (`server/middleware/
 * 01.account-pages.ts`) mit gestellten Nuxt-Globals — nicht nur die Regel:
 * eine getestete Regel ohne eingeschaltete Middleware wäre wieder 200 mit
 * Formular. Die Ziele stehen AUSGESCHRIEBEN da (Beweis-Regel 1), die
 * Runtime-Config ist absichtlich eine andere als Production, damit ein fest
 * eingetragenes `account.pukalani.app` auffiele.
 *
 * WAS DIESER TEST NICHT BEWEIST: dass Nitro die Middleware vor dem Seiten-
 * Rendern fährt (das zeigt nur ein Abruf am laufenden Server).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_ONLY_PATHS, accountPageRedirect } from '../../../packages/marketing/shared/accountPages'

const CONFIG = {
  marketingSignInUrl: 'https://konten.example.test/login',
  marketingStartUrl: 'https://konten.example.test/register',
}

interface FakeEvent { method: string, path: string }
type Handler = (event: FakeEvent) => unknown

const sendRedirect = vi.fn((_event: FakeEvent, to: string, status: number) => ({ to, status }))

async function loadHandler(): Promise<Handler> {
  vi.resetModules()
  return (await import('../server/middleware/01.account-pages')).default as unknown as Handler
}

beforeEach(() => {
  sendRedirect.mockClear()
  vi.stubGlobal('defineEventHandler', (handler: Handler) => handler)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: CONFIG }))
  vi.stubGlobal('sendRedirect', sendRedirect)
})
afterEach(() => vi.unstubAllGlobals())

describe('marketing: Konto-Seiten ⇒ 301 in den Kundenbereich', () => {
  const CASES: [string, string][] = [
    ['/login', 'https://konten.example.test/login'],
    ['/register', 'https://konten.example.test/register'],
    ['/login/code', 'https://konten.example.test/login'],
    ['/register/code', 'https://konten.example.test/login'],
    ['/forgot-password', 'https://konten.example.test/login'],
    ['/reset-password', 'https://konten.example.test/login'],
    ['/verify', 'https://konten.example.test/login'],
    ['/de/login', 'https://konten.example.test/de/login'],
    ['/de/register', 'https://konten.example.test/de/register'],
    ['/de/register/code', 'https://konten.example.test/de/login'],
    ['/de/forgot-password', 'https://konten.example.test/de/login'],
    ['/de/reset-password', 'https://konten.example.test/de/login'],
    ['/de/verify', 'https://konten.example.test/de/login'],
    ['/login/', 'https://konten.example.test/login'],
    ['/reset-password?secret=abc&userId=u1', 'https://konten.example.test/login'],
  ]

  it.each(CASES)('%s ⇒ %s', async (path, to) => {
    const handler = await loadHandler()
    expect(handler({ method: 'GET', path })).toEqual({ to, status: 301 })
  })

  it('HEAD wird genauso umgeleitet', async () => {
    const handler = await loadHandler()
    expect(handler({ method: 'HEAD', path: '/login' })).toEqual({ to: 'https://konten.example.test/login', status: 301 })
  })

  it('die Liste deckt genau die sieben Seiten des Core-Layers', () => {
    expect([...ACCOUNT_ONLY_PATHS].sort()).toEqual([
      '/forgot-password', '/login', '/login/code', '/register', '/register/code', '/reset-password', '/verify',
    ])
  })
})

describe('marketing: GEGENPROBE — normale Seiten bleiben', () => {
  it.each(['/', '/de', '/pricing', '/de/preise', '/faq', '/products/comments', '/loginx', '/de/login-hilfe', '/api/health'])(
    '%s wird nicht umgeleitet',
    async (path) => {
      const handler = await loadHandler()
      expect(handler({ method: 'GET', path })).toBeUndefined()
      expect(sendRedirect).not.toHaveBeenCalled()
    },
  )

  it('ein POST auf /login wird nicht umgeleitet (kein stiller Methodenwechsel)', async () => {
    const handler = await loadHandler()
    expect(handler({ method: 'POST', path: '/login' })).toBeUndefined()
  })

  it('ohne brauchbares Ziel keine Umleitung ins Leere', () => {
    expect(accountPageRedirect('/login', { signInUrl: '', startUrl: '' })).toBeNull()
  })

  it('ein Ziel, das schon /de trägt, bekommt es nicht doppelt', () => {
    expect(accountPageRedirect('/de/login', { signInUrl: 'https://k.example.test/de/login', startUrl: '' }))
      .toBe('https://k.example.test/de/login')
  })
})
