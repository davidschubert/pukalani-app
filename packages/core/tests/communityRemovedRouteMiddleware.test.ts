import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * SEC-030 Teil 2 (2026-11-13): die globale Routen-Middleware führt eine
 * entfernte, angemeldete Person von JEDER Seite auf die Hinweisseite — außer
 * von der Hinweisseite selbst. Nach dem Abmelden gilt der Zustand nicht mehr.
 *
 * Nuxt-Globals sind hier nachgebildet: geprüft wird die Entscheidung der
 * Middleware, nicht der Router.
 */

const state = { removed: false, loggedIn: true, noticePath: '/removed' as string | undefined, locale: '' }
const navigateTo = vi.fn((target: string, options?: unknown) => ({ redirect: target, options }))

vi.stubGlobal('defineNuxtRouteMiddleware', (fn: unknown) => fn)
vi.stubGlobal('useCommunityRemoved', () => ({ value: state.removed }))
vi.stubGlobal('useAuthStore', () => ({ isLoggedIn: state.loggedIn }))
vi.stubGlobal('useAppConfig', () => ({ pukalani: { community: state.noticePath === undefined ? {} : { removedNoticePath: state.noticePath } } }))
vi.stubGlobal('useLocalePath', () => (path: string) => `${state.locale}${path}`)
vi.stubGlobal('navigateTo', navigateTo)

const { default: middleware } = await import('../app/middleware/community-removed.global') as unknown as {
  default: (to: { path: string }) => unknown
}

beforeEach(() => {
  state.removed = true
  state.loggedIn = true
  state.noticePath = '/removed'
  state.locale = ''
  navigateTo.mockClear()
})

describe('community-removed.global — Routen-Middleware', () => {
  it('Zustand gesetzt ⇒ Ziel ist die Hinweisseite', () => {
    middleware({ path: '/' })
    expect(navigateTo).toHaveBeenCalledWith('/removed', { replace: true })
    navigateTo.mockClear()
    middleware({ path: '/dashboard/members' })
    expect(navigateTo).toHaveBeenCalledWith('/removed', { replace: true })
  })

  it('…in der Sprache der Seite (localePath)', () => {
    state.locale = '/de'
    middleware({ path: '/de/discussions' })
    expect(navigateTo).toHaveBeenCalledWith('/de/removed', { replace: true })
  })

  it('die Hinweisseite selbst bleibt erreichbar', () => {
    expect(middleware({ path: '/removed' })).toBeUndefined()
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('nach dem Abmelden: Login und Startseite bleiben erreichbar', () => {
    state.loggedIn = false
    expect(middleware({ path: '/login' })).toBeUndefined()
    expect(middleware({ path: '/' })).toBeUndefined()
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('ohne removedNoticePath passiert nichts', () => {
    state.noticePath = undefined
    expect(middleware({ path: '/' })).toBeUndefined()
    state.noticePath = ''
    expect(middleware({ path: '/' })).toBeUndefined()
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('nicht entfernt ⇒ nichts', () => {
    state.removed = false
    expect(middleware({ path: '/' })).toBeUndefined()
    expect(navigateTo).not.toHaveBeenCalled()
  })
})
