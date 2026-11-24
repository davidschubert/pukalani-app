import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeRoleGatedRoute, probeRoute, resetCommunityWorld, userIdOf } from '../../core/tests/support/participationHarness'
import { controlSeam } from './support/controlSeam'

/**
 * VERWAISTER INHABER-PLATZ, PLATFORM-SEITE (LA2, 2026-11-24, OPS-009).
 *
 * Beide Routen sind BETREIBER-Sache (`sites.manage`) und leben auf dem
 * Kontroll-Host; auf einem Mandanten-Host antworten sie 404 (N7). Die
 * Schreib-Route verlangt dazu eine frische Anmeldung.
 *
 * Danach die Logik: ein Owner-Konto, das noch lebt ⇒ 409 `owner_present`;
 * eine Störung bei der Konto-Prüfung ⇒ 503 (nie „gelöscht" raten); eine
 * unbekannte Adresse ⇒ 404 `account_not_found`; Erfolg ⇒ Vergabe im Control
 * Plane mit genau den als gelöscht geprüften Konten und ein Protokoll-Eintrag.
 */

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

const getRoute = () => import('../server/api/onboarding/operator/community-owner.get')
const postRoute = () => import('../server/api/onboarding/operator/community-owner.post')

/** Wer durch darf — AUSGESCHRIEBEN, nicht aus der Rechte-Matrix berechnet. */
const OPERATOR_ONLY = {
  allow: ['operator'],
  deny: ['owner', 'admin', 'moderator', 'editor', 'member'],
} as const

const COMMUNITY = 'c-verwaist'
const GONE = 'ru-geloescht'
const ALIVE = 'ru-lebt'
const NEW_OWNER = 'ru-neu'

const RUNTIME_CONFIG = { public: { appwriteProjectId: 'pool-probe' } }

function notFound() {
  return Object.assign(new Error('User not found'), { code: 404, type: 'user_not_found' })
}

interface World {
  owners?: Array<{ memberId: string, runtimeUserId: string, hasEmail: boolean }>
  communityStatus?: string
  /** Konten, die es bei Appwrite gibt (alles andere: 404). */
  alive?: string[]
  /** users.get antwortet mit einer Störung. */
  usersDown?: boolean
  /** Konten, die users.list zur Adresse findet. */
  accounts?: Array<{ $id: string, email: string, status?: boolean }>
}

function world(options: World = {}) {
  const audits: Array<Record<string, unknown>> = []
  const seam = controlSeam((path, body) => {
    if (path.endsWith('/owner-status')) {
      return {
        communityName: 'Verwaist',
        communityStatus: options.communityStatus ?? 'active',
        owners: options.owners ?? [{ memberId: 'm-1', runtimeUserId: GONE, hasEmail: false }],
      }
    }
    if (path.endsWith('/owner-reassign')) {
      return { ok: true, communityName: 'Verwaist', ownerMemberId: 'm-neu', removedOrphans: (body.orphanedOwnerIds as string[]).length }
    }
    throw new Error(`unerwarteter Ruf ${path}`)
  })
  const alive = new Set(options.alive ?? [])
  const admin = {
    users: {
      get: async ({ userId }: { userId: string }) => {
        if (options.usersDown) throw Object.assign(new Error('down'), { code: 500 })
        if (!alive.has(userId)) throw notFound()
        return { $id: userId }
      },
      list: async () => {
        const users = options.accounts ?? [{ $id: NEW_OWNER, email: 'neu@example.test' }]
        return { total: users.length, users }
      },
    },
  }
  return {
    seam,
    audits,
    globals: {
      ...seam.globals,
      createAdminClient: () => admin,
      useRuntimeConfig: () => RUNTIME_CONFIG,
      requireRecentAuth: async () => {},
      writeAuditLog: async (_event: unknown, row: Record<string, unknown>) => {
        audits.push(row)
        return true
      },
    },
  }
}

// ── Rollen-Tore ─────────────────────────────────────────────────────────────

describeRoleGatedRoute('GET /api/onboarding/operator/community-owner', getRoute, OPERATOR_ONLY, {
  mode: 'control',
  query: { communityId: COMMUNITY },
})

describeRoleGatedRoute('POST /api/onboarding/operator/community-owner', postRoute, OPERATOR_ONLY, {
  mode: 'control',
  body: { communityId: COMMUNITY, email: 'neu@example.test' },
  globals: { requireRecentAuth: async () => {} },
})

describe('Betreiber-Routen auf einem Mandanten-Host (N7)', () => {
  for (const [name, load] of [['GET', getRoute], ['POST', postRoute]] as const) {
    it(`${name}: 404 auch für den Betreiber, kein Ruf ins Control Plane`, async () => {
      const w = world()
      const run = await probeRoute(load, {
        who: 'operator',
        mode: 'pool',
        query: { communityId: COMMUNITY },
        body: { communityId: COMMUNITY, email: 'neu@example.test' },
        globals: w.globals,
      })
      expect(run.status).toBe(404)
      expect(w.seam.calls).toEqual([])
    })
  }
})

describe('POST /api/onboarding/operator/community-owner — frische Anmeldung', () => {
  it('Betreiber ohne frische Anmeldung: abgelehnt, kein Ruf ins Control Plane', async () => {
    const w = world()
    const run = await probeRoute(postRoute, {
      who: 'operator',
      mode: 'control',
      body: { communityId: COMMUNITY, email: 'neu@example.test' },
      globals: {
        ...w.globals,
        requireRecentAuth: async () => {
          throw Object.assign(new Error('recent'), { status: 403, data: { code: 'recent_auth_required' } })
        },
      },
    })
    expect(run.status).toBe(403)
    expect(w.seam.calls).toEqual([])
    expect(w.audits).toEqual([])
  })

  it('Owner einer Community: 403 VOR der Frage nach der Anmeldung', async () => {
    let asked = 0
    const run = await probeRoute(postRoute, {
      who: 'owner',
      mode: 'control',
      body: { communityId: COMMUNITY, email: 'neu@example.test' },
      globals: { ...world().globals, requireRecentAuth: async () => { asked += 1 } },
    })
    expect(run.status).toBe(403)
    expect(asked).toBe(0)
  })
})

// ── Lesen ───────────────────────────────────────────────────────────────────

describe('GET /api/onboarding/operator/community-owner', () => {
  const read = (options: World) => {
    const w = world(options)
    return probeRoute(getRoute, { who: 'operator', mode: 'control', query: { communityId: COMMUNITY }, globals: w.globals })
      .then(run => ({ run, w }))
  }

  it('alle Owner gelöscht: verwaist, ohne Kennungen in der Antwort', async () => {
    const { run, w } = await read({})
    expect(run.status, run.error?.statusText).toBe(200)
    expect(run.result).toEqual({
      communityId: COMMUNITY,
      communityName: 'Verwaist',
      disabled: false,
      owners: [{ memberId: 'm-1', deleted: true, hasEmail: false }],
      orphaned: true,
    })
    expect(w.seam.calls).toEqual([{ path: '/api/control/community/members/owner-status', body: { runtimeProjectId: 'pool-probe', communityId: COMMUNITY } }])
  })

  it('ein Owner lebt: nicht verwaist', async () => {
    const { run } = await read({ owners: [{ memberId: 'm-2', runtimeUserId: ALIVE, hasEmail: true }], alive: [ALIVE] })
    expect(run.result).toMatchObject({ orphaned: false, owners: [{ memberId: 'm-2', deleted: false }] })
  })

  it('Störung bei der Konto-Prüfung: 503, nie „gelöscht" geraten', async () => {
    const { run } = await read({ usersDown: true })
    expect(run.status).toBe(503)
    expect(run.error?.data?.code).toBe('owner_check_unavailable')
  })
})

// ── Vergeben ────────────────────────────────────────────────────────────────

describe('POST /api/onboarding/operator/community-owner', () => {
  const assign = (options: World, email = 'Neu@Example.test') => {
    const w = world(options)
    return probeRoute(postRoute, { who: 'operator', mode: 'control', body: { communityId: COMMUNITY, email }, globals: w.globals })
      .then(run => ({ run, w }))
  }

  it('verwaist: Vergabe mit genau den gelöschten Konten, Protokoll-Eintrag mit dem Betreiber', async () => {
    const { run, w } = await assign({})
    expect(run.status, run.error?.statusText).toBe(200)
    expect(run.result).toEqual({ ok: true, communityName: 'Verwaist' })
    expect(w.seam.calls.map(call => call.path)).toEqual([
      '/api/control/community/members/owner-status',
      '/api/control/community/members/owner-reassign',
    ])
    expect(w.seam.calls[1]!.body).toEqual({
      runtimeProjectId: 'pool-probe',
      communityId: COMMUNITY,
      orphanedOwnerIds: [GONE],
      newRuntimeUserId: NEW_OWNER,
      newEmail: 'neu@example.test',
    })
    expect(w.audits).toEqual([expect.objectContaining({
      actorId: userIdOf('operator'),
      action: 'community.owner_reassigned',
      targetType: 'community',
      targetId: COMMUNITY,
      targetName: 'Verwaist',
    })])
  })

  it('ein Owner lebt noch: 409 owner_present, keine Vergabe, kein Eintrag', async () => {
    const { run, w } = await assign({
      owners: [{ memberId: 'm-1', runtimeUserId: GONE, hasEmail: false }, { memberId: 'm-2', runtimeUserId: ALIVE, hasEmail: true }],
      alive: [ALIVE],
    })
    expect(run.status).toBe(409)
    expect(run.error?.data?.code).toBe('owner_present')
    expect(w.seam.calls.map(call => call.path)).toEqual(['/api/control/community/members/owner-status'])
    expect(w.audits).toEqual([])
  })

  it('Konto-Prüfung gestört: 503, keine Vergabe', async () => {
    const { run, w } = await assign({ usersDown: true })
    expect(run.status).toBe(503)
    expect(w.seam.calls.map(call => call.path)).not.toContain('/api/control/community/members/owner-reassign')
  })

  it('unbekannte Adresse: 404 account_not_found, kein Ruf ins Control Plane', async () => {
    const { run, w } = await assign({ accounts: [] })
    expect(run.status).toBe(404)
    expect(run.error?.data?.code).toBe('account_not_found')
    expect(w.seam.calls).toEqual([])
  })

  it('gesperrtes Konto: 409 account_blocked, kein Ruf ins Control Plane', async () => {
    const { run, w } = await assign({ accounts: [{ $id: 'ru-gesperrt', email: 'neu@example.test', status: false }] })
    expect(run.status).toBe(409)
    expect(run.error?.data?.code).toBe('account_blocked')
    expect(w.seam.calls.map(call => call.path)).not.toContain('/api/control/community/members/owner-reassign')
  })

  it('ungenauer Treffer der Abfrage (andere Adresse): 404', async () => {
    const { run } = await assign({ accounts: [{ $id: 'ru-falsch', email: 'anders@example.test' }] })
    expect(run.status).toBe(404)
  })

  it('stillgelegte Community: 409 community_disabled', async () => {
    const { run, w } = await assign({ communityStatus: 'disabled' })
    expect(run.status).toBe(409)
    expect(run.error?.data?.code).toBe('community_disabled')
    expect(w.seam.calls.map(call => call.path)).not.toContain('/api/control/community/members/owner-reassign')
  })
})
