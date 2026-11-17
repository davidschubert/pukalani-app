import { afterEach, describe, expect, it, vi } from 'vitest'
import { requireRecentAuth } from '../../core/server/utils/recentAuth'
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
