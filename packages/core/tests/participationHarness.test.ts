import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import {
  describeAccountRoute,
  describeRoleGatedRoute,
  probeRoute,
  resetCommunityWorld,
  type ProbeRun,
  type RoleWho,
} from './support/participationHarness'

/**
 * SELBSTTEST DES PRÜFSTANDS (P27, OPS-009).
 *
 * Ein Prüfstand, der jede Route grün meldet, beweist nichts. Hier laufen
 * Attrappen-Routen durch dieselben Proben wie die echten: eine OHNE Wache muss
 * genau dort auffallen, wo die Proben von `describeGuardedRoute` und
 * `describeRoleGatedRoute` hinschauen (fremdes Konto ⇒ 403, Datentür zu).
 *
 * Die Attrappen rufen die Nitro-Auto-Imports so, wie eine echte Route es tut:
 * als Globals, die `probeRoute` einhängt.
 */

interface AutoImports {
  tenantDb: (event: H3Event) => unknown
  createError: (init: Record<string, unknown>) => Error
  requireCommunityMembership: (event: H3Event) => Promise<unknown>
  requireCommunityPermission: (event: H3Event, capability: string) => Promise<unknown>
  requirePermission: (event: H3Event, capability: string) => unknown
}

const nitro = () => globalThis as unknown as AutoImports

/** Liest sofort aus der Datenbank — ohne jede Wache. */
const unguarded = async () => ({
  default: async (event: H3Event) => nitro().tenantDb(event),
})

/** Wie eine Route zum eigenen Bearbeiten: erst die Mitgliedschaft, dann die Tür. */
const membershipGuarded = async () => ({
  default: async (event: H3Event) => {
    await nitro().requireCommunityMembership(event)
    return nitro().tenantDb(event)
  },
})

/** Wie eine Moderations-Route: Rollen-Tor `posts.moderate`, dann die Tür. */
const moderationGated = async () => ({
  default: async (event: H3Event) => {
    await nitro().requireCommunityPermission(event, 'posts.moderate')
    return nitro().tenantDb(event)
  },
})

/** Wie eine Instanz-Route: globales Label `users.manage`, dann die Tür. */
const instanceGated = async () => ({
  default: async (event: H3Event) => {
    nitro().requirePermission(event, 'users.manage')
    return nitro().tenantDb(event)
  },
})

/** Wie eine Konto-Route: nur „angemeldet", antwortet über das eigene Konto. */
const accountOnly = async () => ({
  default: async (event: H3Event) => {
    if (!event.context.user) throw nitro().createError({ status: 401, statusText: 'Unauthorized' })
    return nitro().tenantDb(event)
  },
})

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

/** Genau das, was die Proben „fremdes Konto" verlangen. */
function strangerRefused(run: ProbeRun): boolean {
  return run.status === 403 && !run.doorOpened && !run.guardPassed
}

describe('Prüfstand: eine Route OHNE Wache fällt auf', () => {
  it('fremdes Konto: die Tür geht auf, kein 403 — die Probe wäre rot', async () => {
    const run = await probeRoute(unguarded, { who: 'stranger', registration: 'closed' })
    expect(run.status).toBe(200)
    expect(run.doorOpened).toBe(true)
    expect(strangerRefused(run)).toBe(false)
  })

  it('entferntes Konto: ebenso', async () => {
    const run = await probeRoute(unguarded, { who: 'removed' })
    expect(run.doorOpened).toBe(true)
    expect(strangerRefused(run)).toBe(false)
  })

  it('ein Mitglied „passiert" keine Wache, die es nicht gibt', async () => {
    const run = await probeRoute(unguarded, { who: 'member' })
    expect(run.guardPassed).toBe(false)
  })
})

describe('Prüfstand: Gegenprobe mit Wache', () => {
  it('Mitgliedschaft: fremdes Konto 403 not_a_member, Tür zu', async () => {
    const run = await probeRoute(membershipGuarded, { who: 'stranger', registration: 'closed' })
    expect(strangerRefused(run)).toBe(true)
    expect(run.error?.data?.code).toBe('not_a_member')
  })

  it('Mitgliedschaft: Mitglied passiert die Wache und erreicht die Tür', async () => {
    const run = await probeRoute(membershipGuarded, { who: 'member' })
    expect(run.guardPassed).toBe(true)
    expect(run.doorOpened).toBe(true)
  })

  it('Mitgliedschaft: der Betreiber ist kein Mitglied (kein Label, keine Rolle)', async () => {
    const run = await probeRoute(membershipGuarded, { who: 'operator' })
    expect(run.status).toBe(403)
    expect(run.doorOpened).toBe(false)
  })

  it('Rollen-Tor: fremdes Konto 403, Tür zu', async () => {
    expect(strangerRefused(await probeRoute(moderationGated, { who: 'stranger' }))).toBe(true)
  })

  it('Rollen-Tor: der Betreiber kommt über den Not-Zugang durch', async () => {
    const run = await probeRoute(moderationGated, { who: 'operator' })
    expect(run.guardPassed).toBe(true)
    expect(run.doorOpened).toBe(true)
  })

  it('Instanz-Tor: die Hülle um requirePermission zählt', async () => {
    const operator = await probeRoute(instanceGated, { who: 'operator' })
    expect(operator.guardPassed).toBe(true)
    const owner = await probeRoute(instanceGated, { who: 'owner' })
    expect(owner.status).toBe(403)
    expect(owner.doorOpened).toBe(false)
  })
})

// Die beiden neuen Proben-Sätze an den Attrappen. Die Listen stehen hier
// ausgeschrieben — so, wie es jeder echte Test tun muss.

const MODERATORS: { allow: RoleWho[], deny: RoleWho[] } = {
  allow: ['owner', 'admin', 'moderator', 'operator'],
  deny: ['editor', 'member'],
}
describeRoleGatedRoute('Attrappe: Moderation (posts.moderate)', moderationGated, MODERATORS)

describeRoleGatedRoute('Attrappe: Instanz (users.manage)', instanceGated, {
  allow: ['operator'],
  deny: ['owner', 'admin', 'moderator', 'editor', 'member'],
})

describeAccountRoute('Attrappe: eigenes Konto', accountOnly)
