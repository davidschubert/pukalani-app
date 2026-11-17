import { throughDoor, type AdminExpectation, describeAdminRoute } from './support/adminRouteHarness'

/**
 * INSTANZ-INHALTE DES DASHBOARDS: Changelog, Schriften, Farbwelten (OPS-009).
 *
 * Echter Handler, echte Wache `requirePermission` aus dem Core (Prüfstand
 * `support/adminRouteHarness.ts`). Die Datentür endet beim ersten
 * `createAdminClient`.
 *
 * `changelog.manage` und `system.manage` — ausgeschrieben, nicht aus der
 * Rechte-Matrix berechnet: NUR der Betreiber (Instanz-Label `admin`). Der
 * Changelog und die Schriften/Farbwelten gehören der INSTANZ, nicht einer
 * Community: der Owner einer Community darf sie nicht ändern, die
 * Instanz-Rolle `moderator` auch nicht.
 */

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

// ── Changelog ──────────────────────────────────────────────────────────────

describeAdminRoute('GET /api/admin/changelog', () => import('../server/api/admin/changelog/index.get'), OPERATOR_ONLY, {
  globals: { listAllChangelogRows: throughDoor },
})

describeAdminRoute('POST /api/admin/changelog', () => import('../server/api/admin/changelog/index.post'), OPERATOR_ONLY, {
  body: { titleEn: 'Probe', bodyEn: 'Probe-Text' },
})

describeAdminRoute('PATCH /api/admin/changelog/:id', () => import('../server/api/admin/changelog/[id].patch'), OPERATOR_ONLY, {
  params: { id: 'cl-probe' },
  body: { titleEn: 'Probe' },
})

describeAdminRoute('DELETE /api/admin/changelog/:id', () => import('../server/api/admin/changelog/[id].delete'), OPERATOR_ONLY, {
  params: { id: 'cl-probe' },
})

// ── Schriften ──────────────────────────────────────────────────────────────

describeAdminRoute('POST /api/admin/fonts', () => import('../server/api/admin/fonts/index.post'), OPERATOR_ONLY, {
  body: { name: 'Probe', files: [{ weight: 400, fileId: 'probe-datei' }] },
})

describeAdminRoute('PATCH /api/admin/fonts/:id', () => import('../server/api/admin/fonts/[id].patch'), OPERATOR_ONLY, {
  params: { id: 'font-probe' },
  body: { name: 'Probe' },
})

describeAdminRoute('DELETE /api/admin/fonts/:id', () => import('../server/api/admin/fonts/[id].delete'), OPERATOR_ONLY, {
  params: { id: 'font-probe' },
})

describeAdminRoute('POST /api/admin/fonts/upload', () => import('../server/api/admin/fonts/upload.post'), OPERATOR_ONLY, {
  globals: {
    // Eine gültige WOFF2-Kennung, damit der Betreiber bis zur Ablage kommt.
    readMultipartFormData: async () => [{ name: 'file', filename: 'probe.woff2', data: Buffer.from('wOF2probe') }],
  },
})

// ── Farbwelten ─────────────────────────────────────────────────────────────

describeAdminRoute('POST /api/admin/themes', () => import('../server/api/admin/themes/index.post'), OPERATOR_ONLY, {
  body: { name: 'Probe', primary: '#336699' },
})

describeAdminRoute('PATCH /api/admin/themes/:id', () => import('../server/api/admin/themes/[id].patch'), OPERATOR_ONLY, {
  params: { id: 'theme-probe' },
  body: { name: 'Probe' },
})

describeAdminRoute('DELETE /api/admin/themes/:id', () => import('../server/api/admin/themes/[id].delete'), OPERATOR_ONLY, {
  params: { id: 'theme-probe' },
})
