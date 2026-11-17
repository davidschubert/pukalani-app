import { expect, vi } from 'vitest'
import { requireRecentAuth } from '../../core/server/utils/recentAuth'
import { ALL_DEP_NAMES } from '../build/systemManifest'
import { type AdminExpectation, describeAdminRoute, throughDoor } from './support/adminRouteHarness'

/**
 * SYSTEM-ROUTEN DES DASHBOARDS: Einstellungen, Zugänge, Produkte, System,
 * Abhängigkeiten, Ablage (OPS-009).
 *
 * Echter Handler, echte Wache `requirePermission` aus dem Core (Prüfstand
 * `support/adminRouteHarness.ts`). `system.manage` und `storage.manage` —
 * ausgeschrieben, nicht aus der Rechte-Matrix berechnet: NUR der Betreiber
 * (Instanz-Label `admin`). Nicht die Instanz-Rolle `moderator`, nicht der
 * Owner oder Admin einer Community, kein Konto ohne Label — im Pool wie auf
 * einer Einzel-Instanz.
 *
 * Zugänge setzen verlangt zusätzlich eine frische Anmeldung
 * (`requireRecentAuth`, echt aus dem Core; nachgebildet ist nur der
 * Session-Client).
 *
 * Fremddienste laufen nie: die npm-Abfrage der Abhängigkeits-Tickets ist
 * nachgebildet, das Update startet außerhalb der Entwicklung gar nicht.
 */

vi.mock('../../core/server/lib/appwrite', () => import('./support/sessionClient'))
vi.mock('../server/utils/dependencies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/utils/dependencies')>()
  return {
    ...actual,
    latestVersion: async () => '99.0.0',
    latestAppwriteVersion: async () => '99.0.0',
  }
})

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

describeAdminRoute('GET /api/admin/config', () => import('../server/api/admin/config.get'), OPERATOR_ONLY, {
  globals: { getEffectiveAiConfig: throughDoor },
})

describeAdminRoute('GET /api/admin/integrations', () => import('../server/api/admin/integrations.get'), OPERATOR_ONLY, {
  globals: { readInstanceSecret: throughDoor },
})

describeAdminRoute('PATCH /api/admin/integrations', () => import('../server/api/admin/integrations.patch'), OPERATOR_ONLY, {
  body: { id: 'ai', value: 'probe-wert' },
  globals: { requireRecentAuth, writeInstanceSecret: throughDoor },
}, { recentAuth: true })

describeAdminRoute('GET /api/admin/products', () => import('../server/api/admin/products/index.get'), OPERATOR_ONLY, {
  globals: { getProductRegistry: () => new Map(), getEffectiveProducts: throughDoor },
})

describeAdminRoute('GET /api/admin/system', () => import('../server/api/admin/system.get'), OPERATOR_ONLY)

describeAdminRoute('POST /api/admin/system/dependency-ticket', () => import('../server/api/admin/system/dependency-ticket.post'), OPERATOR_ONLY, {
  body: { kind: 'package', name: ALL_DEP_NAMES[0] },
  globals: { hasDependencyTicketCreator: () => true, createDependencyUpdateTicket: throughDoor },
})

describeAdminRoute('POST /api/admin/system/update', () => import('../server/api/admin/system/update.post'), OPERATOR_ONLY, {
  body: { name: ALL_DEP_NAMES[0] },
}, {
  // Durch die Wache — dann lehnt die Route selbst ab: Updates gibt es nur in
  // der Entwicklung. Im Test ist `import.meta.dev` nicht gesetzt; so startet
  // auch kein `pnpm install`.
  onPass: (run) => {
    expect(run.guardPassed, 'die Wache lässt durch').toBe(true)
    expect(run.status).toBe(403)
    expect(run.error?.statusText).toBe('Dependency updates are only available in development')
    expect(run.doorOpened).toBe(false)
  },
})

describeAdminRoute('GET /api/admin/storage', () => import('../server/api/admin/storage.get'), OPERATOR_ONLY)
