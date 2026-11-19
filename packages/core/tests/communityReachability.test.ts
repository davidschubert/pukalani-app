import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetUnreachableCommunitiesResolver,
  getUnreachableCommunitiesResolver,
  registerUnreachableCommunitiesResolver,
  resolveUnreachableCommunities,
} from '../server/utils/communityReachability'
import { NOTIFICATION_SCOPE_ACCOUNT } from '../shared/notificationScope'

/**
 * SE1 d — der Vertrag „ist diese Community noch erreichbar?".
 *
 * Die eine Eigenschaft, um die es geht: „keine Antwort" ist NICHT „alle
 * erreichbar" und NICHT „keine erreichbar". Ohne Resolver und bei einer
 * Störung steht `answered: false` da — der Erinnerungs-Lauf erinnert dann wie
 * bisher. Genannt wird nur, was der Resolver ausdrücklich nennt.
 */

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  __resetUnreachableCommunitiesResolver()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
})

/** Die Zeilen `community.reachability_unavailable`, die logEvent über console.warn schrieb. */
function unavailableLines(): Record<string, unknown>[] {
  return warn.mock.calls
    .map(call => String(call[0]))
    .filter(line => line.startsWith('{'))
    .map(line => JSON.parse(line) as Record<string, unknown>)
    .filter(entry => entry.event === 'community.reachability_unavailable')
}

describe('resolveUnreachableCommunities', () => {
  it('kein Resolver ⇒ answered: false, nichts genannt', async () => {
    const result = await resolveUnreachableCommunities(['t-kunde-a'])
    expect(result.answered).toBe(false)
    expect([...result.unreachable]).toEqual([])
    // Ohne Resolver ist das der Normalfall (Silo, CI) — keine Log-Zeile.
    expect(unavailableLines()).toEqual([])
  })

  it('Resolver nennt eine Community ⇒ answered: true, genau sie', async () => {
    registerUnreachableCommunitiesResolver(async () => ['t-kunde-b'])
    const result = await resolveUnreachableCommunities(['t-kunde-a', 't-kunde-b'])
    expect(result.answered).toBe(true)
    expect([...result.unreachable]).toEqual(['t-kunde-b'])
    // Gegenprobe: die erreichbare ist nicht genannt.
    expect(result.unreachable.has('t-kunde-a')).toBe(false)
  })

  it('Resolver nennt keine ⇒ answered: true, leere Menge (alle erreichbar)', async () => {
    registerUnreachableCommunitiesResolver(() => [])
    const result = await resolveUnreachableCommunities(['t-kunde-a'])
    expect(result).toEqual({ answered: true, unreachable: new Set() })
  })

  it('filtert leere Werte, _account und Dubletten, bevor gefragt wird', async () => {
    const resolver = vi.fn(async (_ids: string[]) => [] as string[])
    registerUnreachableCommunitiesResolver(resolver)
    await resolveUnreachableCommunities(['t-kunde-a', '', null, undefined, NOTIFICATION_SCOPE_ACCOUNT, 't-kunde-a', 't-kunde-b'])
    expect(resolver).toHaveBeenCalledTimes(1)
    expect(resolver).toHaveBeenCalledWith(['t-kunde-a', 't-kunde-b'])
  })

  it('Resolver da, aber nichts zu fragen ⇒ answered: true, leere Menge, Resolver nicht gerufen', async () => {
    const resolver = vi.fn(async (_ids: string[]) => ['t-kunde-a'])
    registerUnreachableCommunitiesResolver(resolver)
    const result = await resolveUnreachableCommunities(['', NOTIFICATION_SCOPE_ACCOUNT, null])
    expect(result).toEqual({ answered: true, unreachable: new Set() })
    expect(resolver).not.toHaveBeenCalled()
    // Gegenprobe: ganz ohne Resolver wäre dieselbe Liste „keine Antwort".
    __resetUnreachableCommunitiesResolver()
    expect((await resolveUnreachableCommunities(['', null])).answered).toBe(false)
  })

  it('Resolver wirft ⇒ answered: false, nichts genannt, EINE Zeile nur mit Zahlen', async () => {
    registerUnreachableCommunitiesResolver(async () => {
      throw new Error('Control Plane weg — GEHEIM-MARKER')
    })
    const result = await resolveUnreachableCommunities(['t-kunde-a', 't-kunde-b', 't-kunde-a'])
    expect(result.answered).toBe(false)
    expect([...result.unreachable]).toEqual([])
    const lines = unavailableLines()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ level: 'warn', event: 'community.reachability_unavailable', asked: 2 })
    const raw = JSON.stringify(lines[0])
    for (const leak of ['t-kunde', 'GEHEIM', 'Control Plane']) expect(raw).not.toContain(leak)
  })

  it('wirft der Resolver synchron, gilt dasselbe', async () => {
    registerUnreachableCommunitiesResolver(() => {
      throw new Error('sofort')
    })
    expect((await resolveUnreachableCommunities(['t-kunde-a'])).answered).toBe(false)
    expect(unavailableLines()).toHaveLength(1)
  })

  it('Ids in der Antwort, die nicht gefragt wurden, fallen weg', async () => {
    registerUnreachableCommunitiesResolver(async () => ['t-kunde-a', 't-fremd', '', NOTIFICATION_SCOPE_ACCOUNT])
    const result = await resolveUnreachableCommunities(['t-kunde-a', 't-kunde-b'])
    expect(result.answered).toBe(true)
    expect([...result.unreachable]).toEqual(['t-kunde-a'])
  })
})

describe('Registry', () => {
  it('registrieren, lesen, zurücksetzen', () => {
    expect(getUnreachableCommunitiesResolver()).toBeNull()
    const resolver = () => []
    registerUnreachableCommunitiesResolver(resolver)
    expect(getUnreachableCommunitiesResolver()).toBe(resolver)
    __resetUnreachableCommunitiesResolver()
    expect(getUnreachableCommunitiesResolver()).toBeNull()
  })

  it('ein zweites Registrieren ersetzt und warnt — das erste nicht', () => {
    registerUnreachableCommunitiesResolver(() => [])
    expect(warn).not.toHaveBeenCalled()
    const second = () => ['t-x']
    registerUnreachableCommunitiesResolver(second)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toContain('registerUnreachableCommunitiesResolver')
    expect(getUnreachableCommunitiesResolver()).toBe(second)
  })
})
