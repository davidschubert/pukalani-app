import { afterEach, describe, expect, it, vi } from 'vitest'
import { requireRecentAuth } from '../../core/server/utils/recentAuth'
import { userIdOf } from '../../core/tests/support/participationHarness'
import {
  type AdminExpectation,
  describeAdminRoute,
  probeAdminRoute,
  resetAdminWorld,
  throughDoor,
} from './support/adminRouteHarness'

/**
 * PERSONENDATEN IM DASHBOARD: Nutzer löschen, sperren, Sitzungen beenden,
 * Nutzer-Statistik, Lösch-Kopien, Betreiber-Protokoll (OPS-009).
 *
 * Echter Handler, echte Wache `requirePermission` aus dem Core (Prüfstand
 * `support/adminRouteHarness.ts`). `users.manage` und `audit.read` —
 * ausgeschrieben, nicht aus der Rechte-Matrix berechnet: NUR der Betreiber
 * (Instanz-Label `admin`). Die Konten der Instanz gehören keiner Community:
 * der OWNER einer Community darf hier NICHT, was nur der Betreiber darf —
 * auch nicht die Instanz-Rolle `moderator`.
 *
 * Löschen verlangt zusätzlich eine frische Anmeldung (`requireRecentAuth`,
 * echt aus dem Core; nachgebildet ist nur der Session-Client). Sperren und
 * Sitzungen beenden bleiben bewusst OHNE (sie müssen sofort gehen,
 * `core/server/utils/recentAuth.ts`).
 *
 * Dazu je eingreifender Route: der Betreiber hinterlässt einen Eintrag im
 * Betreiber-Protokoll (`recordAudit`, BE-021).
 */

vi.mock('../../core/server/lib/appwrite', () => import('./support/sessionClient'))

const OPERATOR_ONLY: AdminExpectation = {
  pool: {
    allow: ['operator'],
    deny: ['konto', 'instanzModerator', 'owner', 'admin', 'moderator', 'editor', 'member'],
  },
  silo: {
    allow: ['operator'],
    deny: ['konto', 'instanzModerator'],
  },
}

const TARGET = 'u-ziel'

describeAdminRoute('DELETE /api/admin/users/:id', () => import('../server/api/admin/users/[id]/index.delete'), OPERATOR_ONLY, {
  params: { id: TARGET },
  globals: { requireRecentAuth, assertNotLastAdmin: async () => {} },
}, { recentAuth: true })

describeAdminRoute('PATCH /api/admin/users/:id/status', () => import('../server/api/admin/users/[id]/status.patch'), OPERATOR_ONLY, {
  params: { id: TARGET },
  body: { blocked: true },
  globals: { assertNotLastAdmin: async () => {} },
})

describeAdminRoute('DELETE /api/admin/users/:id/sessions', () => import('../server/api/admin/users/[id]/sessions.delete'), OPERATOR_ONLY, {
  params: { id: TARGET },
})

describeAdminRoute('GET /api/admin/users/stats', () => import('../server/api/admin/users/stats.get'), OPERATOR_ONLY)

describeAdminRoute('GET /api/admin/gdpr-exports', () => import('../server/api/admin/gdpr-exports/index.get'), OPERATOR_ONLY, {
  globals: { cleanupExpiredGdprExports: throughDoor },
})

describeAdminRoute('DELETE /api/admin/gdpr-exports/:fileId', () => import('../server/api/admin/gdpr-exports/[fileId].delete'), OPERATOR_ONLY, {
  params: { fileId: 'export-probe' },
})

describeAdminRoute('GET /api/admin/audit', () => import('../server/api/admin/audit.get'), OPERATOR_ONLY)

// ── Nutzer löschen: die Reihenfolge der zwei Prüfungen ─────────────────────

/**
 * BEWERTET UND SO BELASSEN (BT1 e, 2026-11-18): die Prüfung „letzter Admin"
 * steht VOR der frischen Anmeldung. Das ist Absicht (ein fachliches Nein
 * braucht niemand erst nach einem neuen Login zu erfahren) und gibt nichts
 * heraus: gefragt hat der Betreiber selbst, und die Antwort betrifft die
 * Liste, die er ohnehin sieht. Festgehalten wird hier, was dabei NICHT
 * passieren darf — vor der frischen Anmeldung wird kein Konto gelesen, nichts
 * gelöscht und nichts protokolliert.
 */
describe('DELETE /api/admin/users/:id — die Reihenfolge der zwei Prüfungen', () => {
  afterEach(resetAdminWorld)

  const load = () => import('../server/api/admin/users/[id]/index.delete')

  function world(overrides: Record<string, unknown> = {}) {
    const touched: string[] = []
    return {
      touched,
      globals: {
        assertNotLastAdmin: async () => { touched.push('letzter-admin') },
        requireRecentAuth: async () => { touched.push('frische-anmeldung') },
        createAdminClient: () => ({ users: { get: async () => { touched.push('konto-lesen'); return { $id: TARGET } } } }),
        deleteUserCompletely: async () => { touched.push('löschen'); return { ok: true, results: [], exportFileId: '' } },
        recordAudit: async () => { touched.push('protokoll') },
        ...overrides,
      },
    }
  }

  it('Gegenprobe: alles in Ordnung ⇒ erst die zwei Prüfungen, dann lesen, löschen, protokollieren', async () => {
    const { touched, globals } = world()
    const run = await probeAdminRoute(load, 'operator', { params: { id: TARGET }, globals })
    expect(run.status, run.error?.statusText).toBe(200)
    expect(touched).toEqual(['letzter-admin', 'frische-anmeldung', 'konto-lesen', 'löschen', 'protokoll'])
  })

  it('letzter Admin: abgelehnt, bevor nach der Anmeldung gefragt wird — nichts gelesen, nichts gelöscht', async () => {
    const { touched, globals } = world({
      assertNotLastAdmin: async () => {
        throw Object.assign(new Error('At least one admin must remain'), { status: 400, data: { code: 'last_admin' } })
      },
    })
    const run = await probeAdminRoute(load, 'operator', { params: { id: TARGET }, globals })
    expect(run.status).toBe(400)
    expect(run.error?.data).toEqual({ code: 'last_admin' })
    expect(touched).toEqual([])
  })

  it('Anmeldung nicht frisch: abgelehnt, bevor das Ziel-Konto gelesen, gelöscht oder protokolliert wird', async () => {
    const { touched, globals } = world({
      requireRecentAuth: async () => {
        throw Object.assign(new Error('Recent authentication required'), { status: 403, data: { code: 'recent_auth_required' } })
      },
    })
    const run = await probeAdminRoute(load, 'operator', { params: { id: TARGET }, globals })
    expect(run.status).toBe(403)
    expect(touched).toEqual(['letzter-admin'])
  })

  it('das eigene Konto: abgelehnt vor beiden Prüfungen', async () => {
    const { touched, globals } = world()
    const run = await probeAdminRoute(load, 'operator', { params: { id: userIdOf('operator') }, globals })
    expect(run.status).toBe(400)
    expect(touched).toEqual([])
  })
})

// ── Der Betreiber hinterlässt einen Eintrag ────────────────────────────────

interface AuditEntry { action: string, targetType: string, targetId: string }

describe('Personendaten: der Eingriff des Betreibers steht im Protokoll', () => {
  afterEach(resetAdminWorld)

  const recorder = () => {
    const entries: AuditEntry[] = []
    return { entries, recordAudit: async (_e: unknown, entry: AuditEntry) => { entries.push(entry) } }
  }

  it('Nutzer löschen: Eintrag `user.deleted` mit dem Ziel', async () => {
    const audit = recorder()
    const run = await probeAdminRoute(() => import('../server/api/admin/users/[id]/index.delete'), 'operator', {
      params: { id: TARGET },
      globals: {
        requireRecentAuth,
        assertNotLastAdmin: async () => {},
        createAdminClient: () => ({ users: { get: async () => ({ $id: TARGET }) } }),
        deleteUserCompletely: async () => ({ ok: true, results: [], exportFileId: '' }),
        recordAudit: audit.recordAudit,
      },
    })
    expect(run.status, run.error?.statusText).toBe(200)
    expect(audit.entries).toEqual([expect.objectContaining({ action: 'user.deleted', targetType: 'user', targetId: TARGET })])
  })

  it('Nutzer sperren: Eintrag `user.block` mit dem Ziel', async () => {
    const audit = recorder()
    const run = await probeAdminRoute(() => import('../server/api/admin/users/[id]/status.patch'), 'operator', {
      params: { id: TARGET },
      body: { blocked: true },
      globals: {
        assertNotLastAdmin: async () => {},
        createAdminClient: () => ({ users: { updateStatus: async () => ({ $id: TARGET, name: 'Ziel', status: false }) } }),
        recordAudit: audit.recordAudit,
      },
    })
    expect(run.status, run.error?.statusText).toBe(200)
    expect(audit.entries).toEqual([expect.objectContaining({ action: 'user.block', targetType: 'user', targetId: TARGET })])
  })

  it('Sitzungen beenden: Eintrag `user.sessions_cleared` mit dem Ziel', async () => {
    const audit = recorder()
    const run = await probeAdminRoute(() => import('../server/api/admin/users/[id]/sessions.delete'), 'operator', {
      params: { id: TARGET },
      globals: {
        createAdminClient: () => ({ users: { deleteSessions: async () => ({}) } }),
        clearSessionCookie: () => {},
        recordAudit: audit.recordAudit,
      },
    })
    expect(run.status, run.error?.statusText).toBe(200)
    expect(audit.entries).toEqual([expect.objectContaining({ action: 'user.sessions_cleared', targetType: 'user', targetId: TARGET })])
  })

  it('Lösch-Kopie entfernen: Eintrag `gdpr_export.deleted` mit der Datei', async () => {
    const audit = recorder()
    const run = await probeAdminRoute(() => import('../server/api/admin/gdpr-exports/[fileId].delete'), 'operator', {
      params: { fileId: 'export-probe' },
      globals: {
        createAdminClient: () => ({ storage: { deleteFile: async () => ({}) } }),
        recordAudit: audit.recordAudit,
      },
    })
    expect(run.status, run.error?.statusText).toBe(200)
    expect(audit.entries).toEqual([expect.objectContaining({ action: 'gdpr_export.deleted', targetId: 'export-probe' })])
  })
})
