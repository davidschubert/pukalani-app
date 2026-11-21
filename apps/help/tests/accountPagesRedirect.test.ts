/**
 * KONTO-SEITEN DER HILFE LEITEN IN DEN KUNDENBEREICH (SEO-002, 2026-11-21).
 *
 * Die Regel selbst prüft `apps/marketing/tests/accountPagesRedirect.test.ts`
 * vollständig; hier steht, dass DIESE App sie eingeschaltet hat — die echte
 * Middleware-Datei mit gestellten Nuxt-Globals, Ziele ausgeschrieben.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const CONFIG = {
  marketingSignInUrl: 'https://konten.example.test/login',
  marketingStartUrl: 'https://konten.example.test/register',
}

interface FakeEvent { method: string, path: string }
type Handler = (event: FakeEvent) => unknown

async function loadHandler(): Promise<Handler> {
  vi.resetModules()
  return (await import('../server/middleware/01.account-pages')).default as unknown as Handler
}

beforeEach(() => {
  vi.stubGlobal('defineEventHandler', (handler: Handler) => handler)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: CONFIG }))
  vi.stubGlobal('sendRedirect', (_event: FakeEvent, to: string, status: number) => ({ to, status }))
})
afterEach(() => vi.unstubAllGlobals())

describe('help: Konto-Seiten ⇒ 301 in den Kundenbereich', () => {
  it.each([
    ['/login', 'https://konten.example.test/login'],
    ['/register', 'https://konten.example.test/register'],
    ['/forgot-password', 'https://konten.example.test/login'],
    ['/verify', 'https://konten.example.test/login'],
    ['/de/login', 'https://konten.example.test/de/login'],
    ['/de/register', 'https://konten.example.test/de/register'],
    ['/de/reset-password', 'https://konten.example.test/de/login'],
  ])('%s ⇒ %s', async (path, to) => {
    const handler = await loadHandler()
    expect(handler({ method: 'GET', path })).toEqual({ to, status: 301 })
  })

  it.each(['/', '/de', '/anleitung', '/de/anleitung/erste-schritte', '/robots.txt'])(
    'GEGENPROBE: %s wird nicht umgeleitet',
    async (path) => {
      const handler = await loadHandler()
      expect(handler({ method: 'GET', path })).toBeUndefined()
    },
  )
})
