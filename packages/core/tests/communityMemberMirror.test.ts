import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { resetCommunityWorld, wireCommunityWorld, type CommunityWorld } from './support/participationHarness'

/**
 * „GEHÖRT DIESES KONTO HIERHER?" ALS SPIEGEL FÜR DEN BROWSER (MM1, 2026-11-17).
 *
 * Der Übersetzen-Knopf erscheint nur noch für Mitglieder. Der Browser kennt
 * dafür nur, was der Server ihm sagt — an zwei Stellen: die Middleware beim
 * Seitenaufruf (`event.context.communityMember`, von tenant-brand.server.ts
 * gespiegelt) und die Route, die der Auth-Store nach einer Anmeldung im
 * Browser fragt. Beide müssen dieselbe Antwort geben wie die Wache der
 * Übersetzungs-Routen (`requireCommunityMembership`), sonst steht ein Knopf
 * da, der nur 403 kann — oder er fehlt jemandem, der dürfte.
 *
 * Die erwarteten Antworten stehen ausgeschrieben, nicht aus der Regel
 * berechnet (Beweis-Regel 1).
 */

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)

const { default: middleware } = await import('../server/middleware/07.community-role') as unknown as {
  default: (event: H3Event) => Promise<void>
}

async function mirror(init: CommunityWorld & { path?: string }): Promise<boolean | undefined> {
  const { event } = wireCommunityWorld(init)
  ;(event as unknown as { path: string }).path = init.path ?? '/discussions'
  await middleware(event)
  return event.context.communityMember
}

afterEach(() => {
  resetCommunityWorld()
})

describe('07.community-role — Spiegel beim Seitenaufruf', () => {
  it('Mitglied: ja', async () => {
    expect(await mirror({ who: 'member' })).toBe(true)
  })

  it('Bestands-Mitglied (Label ohne Zeile): ja — die Rolle allein hätte „nein" gesagt', async () => {
    expect(await mirror({ who: 'legacy' })).toBe(true)
  })

  it('Owner: ja', async () => {
    expect(await mirror({ who: 'owner' })).toBe(true)
  })

  it('fremdes Konto: nein — auch bei offener Registrierung, ein Seitenaufruf ist kein Beitritt', async () => {
    expect(await mirror({ who: 'stranger', registration: 'closed' })).toBe(false)
    const open = wireCommunityWorld({ who: 'stranger', registration: 'open' })
    ;(open.event as unknown as { path: string }).path = '/discussions'
    await middleware(open.event)
    expect(open.event.context.communityMember).toBe(false)
    expect(open.joinHandlerCalls()).toBe(0)
  })

  it('entferntes Konto: nein', async () => {
    expect(await mirror({ who: 'removed' })).toBe(false)
  })

  it('Betreiber ohne Community-Rolle: nein', async () => {
    expect(await mirror({ who: 'operator' })).toBe(false)
  })

  it('Einzel-Instanz ohne Mandant: jedes angemeldete Konto ist Mitglied', async () => {
    expect(await mirror({ who: 'stranger', mode: 'silo' })).toBe(true)
  })

  it('Gast: nicht aufgelöst', async () => {
    expect(await mirror({ who: 'guest' })).toBeUndefined()
    expect(await mirror({ who: 'guest', mode: 'silo' })).toBeUndefined()
  })

  it('API-Pfad: nicht aufgelöst (die Routen fragen selbst)', async () => {
    expect(await mirror({ who: 'member', path: '/api/posts' })).toBeUndefined()
  })
})

describe('GET /api/community/role — derselbe Wert nach einer Anmeldung im Browser', () => {
  const load = () => import('../server/api/community/role.get')
  const member = async (init: CommunityWorld) => {
    const { event } = wireCommunityWorld(init)
    const { default: handler } = await load() as unknown as { default: (e: H3Event) => Promise<{ member?: boolean }> }
    return (await handler(event)).member
  }

  it('Mitglied und Bestands-Mitglied: ja', async () => {
    expect(await member({ who: 'member' })).toBe(true)
    expect(await member({ who: 'legacy' })).toBe(true)
  })

  it('fremdes und entferntes Konto, Gast: nein', async () => {
    expect(await member({ who: 'stranger' })).toBe(false)
    expect(await member({ who: 'removed' })).toBe(false)
    expect(await member({ who: 'guest' })).toBe(false)
  })

  it('Einzel-Instanz: angemeldet genügt', async () => {
    expect(await member({ who: 'stranger', mode: 'silo' })).toBe(true)
  })
})
