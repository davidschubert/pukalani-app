import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemovedMembership } from '../../control/shared/labelReconcile'
import { mutateUserLabels } from '../../core/server/utils/userLabels'

/**
 * DER STÜNDLICHE ABGLEICH: LABEL OHNE ZUGANG ⇒ WEG (SEC-024, 2026-11-13).
 *
 * „Zugang entziehen" prüft seit SEC-024 nach und meldet einen Fehlschlag —
 * aber eine Meldung räumt nichts auf. Der Lauf holt nach, was hängen blieb:
 * je `community_members`-Zeile mit `status='removed'` das Konto lesen, und
 * trägt es noch das Label (oder das Moderations-Label) dieser Community, ohne
 * dass eine Zeile MIT Zugang existiert ⇒ Abweichung.
 *
 * Echt laufen: die Logik UND der eine Schreiber (`mutateUserLabels`) gegen
 * einen Konto-Speicher. Nachgebildet: der Leser des Control Plane.
 */

const logs: Array<{ level: string, name: string, data: Record<string, unknown> }> = []
const log = (level: 'info' | 'warn' | 'error', name: string, data: Record<string, unknown> = {}) => {
  logs.push({ level, name, data })
}
vi.stubGlobal('logEvent', log)

const { reconcileCommunityLabels, resolveLabelReconcileMode, __resetLabelReconcileCursor } = await import('../server/utils/labelReconcile')

const PROJECT = 'pool'

interface World {
  accounts: Record<string, string[]>
  removed: RemovedMembership[]
  /** Paare (communityId|userId) mit einer Zeile MIT Zugang. */
  access?: Set<string>
  /** Konten, deren Lesen wirft. */
  broken?: Set<string>
}

function build(world: World, options: { maxCandidates?: number } = {}) {
  const users = {
    get: vi.fn(async ({ userId }: { userId: string }) => {
      if (world.broken?.has(userId)) throw new Error('Appwrite hiccup')
      const labels = world.accounts[userId]
      if (!labels) throw Object.assign(new Error('User not found'), { code: 404 })
      return { $id: userId, labels: [...labels] }
    }),
    updateLabels: vi.fn(async ({ userId, labels }: { userId: string, labels: string[] }) => {
      world.accounts[userId] = [...labels]
      return { $id: userId, labels }
    }),
  }
  const reader = {
    listRemoved: vi.fn(async (runtimeProjectId: string, { limit, after }: { limit: number, after: string | null }) => {
      expect(runtimeProjectId).toBe(PROJECT)
      const start = after ? world.removed.findIndex(row => row.rowId === after) + 1 : 0
      const rows = world.removed.slice(start, start + limit)
      const more = start + limit < world.removed.length
      return { rows, nextCursor: more ? rows.at(-1)!.rowId : null }
    }),
    hasAccess: vi.fn(async (_project: string, communityId: string, userId: string) =>
      world.access?.has(`${communityId}|${userId}`) ?? false),
  }
  const deps = {
    reader,
    runtimeProjectId: PROJECT,
    getUserLabels: async (userId: string) => {
      const user = await users.get({ userId }).catch((error: { code?: number }) => {
        if (error.code === 404) return null
        throw error
      })
      return user ? user.labels : null
    },
    revoke: async (communityId: string, userId: string) => {
      const result = await mutateUserLabels(users, userId, { remove: [communityId, `mod${communityId}`] })
      return { revoked: result.ok }
    },
    maxCandidates: options.maxCandidates,
  }
  return { users, reader, deps }
}

function row(rowId: string, communityId: string, userId: string): RemovedMembership {
  return { rowId, communityId, userId }
}

describe('reconcileCommunityLabels', () => {
  beforeEach(() => {
    logs.length = 0
    __resetLabelReconcileCursor()
  })

  it('dry-run zählt und schreibt NIE', async () => {
    const world: World = { accounts: { u1: ['cA'] }, removed: [row('r1', 'cA', 'u1')] }
    const { users, deps } = build(world)
    const result = await reconcileCommunityLabels('dry-run', deps)
    expect(result).toEqual({ mode: 'dry-run', candidates: 1, stale: 1, revoked: 0, failed: 0, skipped: 0, truncated: false })
    expect(users.updateLabels).not.toHaveBeenCalled()
    expect(world.accounts.u1).toEqual(['cA'])
    // Probelauf: IMMER eine Zeile mit den Anzahlen.
    expect(logs.filter(l => l.name === 'community_label.reconcile')).toHaveLength(1)
  })

  it('apply entzieht nur bei `removed` ohne Zeile mit Zugang — Betreiber-Rollen, Bestand und fremde Communities bleiben', async () => {
    const world: World = {
      accounts: {
        u1: ['admin', 'cA', 'modcA', 'cOther'],
        u2: ['cA'], // wieder eingeladen: Zeile mit Zugang
        u3: ['cLegacy'], // Bestand ohne Zeile: kein Kandidat
        u4: ['moderator'], // entfernt, Label schon weg
      },
      removed: [row('r1', 'cA', 'u1'), row('r2', 'cA', 'u2'), row('r4', 'cA', 'u4')],
      access: new Set(['cA|u2']),
    }
    const { deps } = build(world)
    const result = await reconcileCommunityLabels('apply', deps)
    expect(result).toEqual({ mode: 'apply', candidates: 3, stale: 1, revoked: 1, failed: 0, skipped: 1, truncated: false })
    expect(world.accounts).toEqual({
      u1: ['admin', 'cOther'],
      u2: ['cA'],
      u3: ['cLegacy'],
      u4: ['moderator'],
    })
    // Je Entzug eine Zeile mit Kennungen — keine Namen, keine Adressen.
    const revokedLines = logs.filter(l => l.name === 'community_label.reconcile_revoked')
    expect(revokedLines.map(l => l.data)).toEqual([{ userId: 'u1', communityId: 'cA' }])
  })

  it('auch ein hängendes Moderations-Label allein ist eine Abweichung', async () => {
    const world: World = { accounts: { u1: ['modcA'] }, removed: [row('r1', 'cA', 'u1')] }
    const { deps } = build(world)
    const result = await reconcileCommunityLabels('apply', deps)
    expect(result.revoked).toBe(1)
    expect(world.accounts.u1).toEqual([])
  })

  it('ist wiederholbar: der zweite Lauf findet nichts mehr', async () => {
    const world: World = { accounts: { u1: ['cA'], u2: ['cB'] }, removed: [row('r1', 'cA', 'u1'), row('r2', 'cB', 'u2')] }
    const { deps, users } = build(world)
    await reconcileCommunityLabels('apply', deps)
    users.updateLabels.mockClear()
    const second = await reconcileCommunityLabels('apply', deps)
    expect(second).toMatchObject({ candidates: 2, stale: 0, revoked: 0, failed: 0 })
    expect(users.updateLabels).not.toHaveBeenCalled()
  })

  it('gelöschte Konten (404) werden übersprungen', async () => {
    const world: World = { accounts: {}, removed: [row('r1', 'cA', 'u-weg')] }
    const { deps } = build(world)
    const result = await reconcileCommunityLabels('apply', deps)
    expect(result).toMatchObject({ candidates: 1, stale: 0, skipped: 1, failed: 0 })
  })

  it('der Fehler eines Kontos bricht den Lauf nicht ab und zählt als `failed`', async () => {
    const world: World = {
      accounts: { u1: ['cA'], u2: ['cA'] },
      removed: [row('r1', 'cA', 'u1'), row('r2', 'cA', 'u2')],
      broken: new Set(['u1']),
    }
    const { deps } = build(world)
    const result = await reconcileCommunityLabels('apply', deps)
    expect(result).toMatchObject({ candidates: 2, failed: 1, revoked: 1 })
    expect(world.accounts.u2).toEqual([])
  })

  it('der Deckel wird gemeldet, und der nächste Lauf macht dahinter weiter', async () => {
    const world: World = {
      accounts: { u1: ['cA'], u2: ['cA'], u3: ['cA'] },
      removed: [row('r1', 'cA', 'u1'), row('r2', 'cA', 'u2'), row('r3', 'cA', 'u3')],
    }
    const { deps } = build(world, { maxCandidates: 2 })
    const first = await reconcileCommunityLabels('apply', deps)
    expect(first).toMatchObject({ candidates: 2, revoked: 2, truncated: true })
    expect(logs.some(l => l.name === 'community_label.reconcile_truncated')).toBe(true)
    const second = await reconcileCommunityLabels('apply', deps)
    expect(second).toMatchObject({ candidates: 1, revoked: 1, truncated: false })
    expect(world.accounts).toEqual({ u1: [], u2: [], u3: [] })
  })
})

describe('resolveLabelReconcileMode', () => {
  it('kennt genau drei Werte; alles andere ist „off" plus Fehler', () => {
    expect(resolveLabelReconcileMode('off')).toEqual({ mode: 'off', invalid: false })
    expect(resolveLabelReconcileMode('dry-run')).toEqual({ mode: 'dry-run', invalid: false })
    expect(resolveLabelReconcileMode('apply')).toEqual({ mode: 'apply', invalid: false })
    expect(resolveLabelReconcileMode(undefined)).toEqual({ mode: 'off', invalid: false })
    expect(resolveLabelReconcileMode('yes')).toEqual({ mode: 'off', invalid: true })
    expect(resolveLabelReconcileMode(true)).toEqual({ mode: 'off', invalid: true })
  })
})
