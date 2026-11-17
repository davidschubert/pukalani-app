import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  describeAccountRoute,
  describeRoleGateToDoor,
  probeRoute,
  resetCommunityWorld,
} from '../../core/tests/support/participationHarness'
import { createMicrocache } from '../../core/server/utils/microcache'
import { countingEffect, describeControlGate, describeRoleGateToAnswer, describeRoleGateToEffect } from './support/controlSeam'

/**
 * EINSTELLUNGEN DER COMMUNITY — ROLLEN-TESTS AN DER ECHTEN ROUTE (OPS-009, BT1 b).
 *
 * Echter Handler, echte Core-Wachen (Prüfstand
 * `core/tests/support/participationHarness.ts`); nachgebildet sind nur die
 * Naht zum Control Plane (`support/controlSeam.ts`) und, was hinter ihr liegt.
 *
 * Die Erwartungen sind AUSGESCHRIEBEN aus der Rechte-Matrix
 * (`core/shared/communityAuthz.ts`), nicht berechnet:
 *  - `team.manage`, `branding.manage`: Owner und Admin; der Betreiber im
 *    protokollierten Not-Zugang. Moderator, Editor, Mitglied NICHT.
 *  - `community.export`: NUR der Owner (und der Betreiber).
 */

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

const TEAM_MANAGE = {
  allow: ['owner', 'admin', 'operator'],
  deny: ['moderator', 'editor', 'member'],
} as const

const OWNER_ONLY = {
  allow: ['owner', 'operator'],
  deny: ['admin', 'moderator', 'editor', 'member'],
} as const

// ── Über das Control Plane ──────────────────────────────────────────────────

describeControlGate(
  'PATCH /api/community/audience',
  () => import('../server/api/community/audience.patch'),
  TEAM_MANAGE,
  '/api/control/community/audience',
  {
    body: { audience: 'members' },
    reply: () => ({ communityId: 'c-a', audience: 'members' }),
    globals: { repermissionCommunityRows: async () => ({ updated: 0, failed: 0 }) },
  },
)

describeControlGate(
  'PATCH /api/community/branding',
  () => import('../server/api/community/branding.patch'),
  TEAM_MANAGE,
  '/api/control/community/branding',
  {
    body: { theme: '', variant: '' },
    reply: () => ({ communityId: 'c-a', theme: '', variant: '', neutral: '' }),
    globals: { mirrorCommunityBranding: async () => {} },
  },
)

describeControlGate(
  'PATCH /api/community/member-invites',
  () => import('../server/api/community/member-invites.patch'),
  TEAM_MANAGE,
  '/api/control/community/member-invites',
  { body: { memberInvitesEnabled: false } },
)

describeControlGate(
  'PATCH /api/community/profile',
  () => import('../server/api/community/profile.patch'),
  TEAM_MANAGE,
  '/api/control/community/profile',
  { body: { name: 'Probe-Community' } },
)

describeControlGate(
  'PATCH /api/community/registration',
  () => import('../server/api/community/registration.patch'),
  TEAM_MANAGE,
  '/api/control/community/registration',
  { body: { openRegistration: true } },
)

describeControlGate(
  'PATCH /api/community/timezone',
  () => import('../server/api/community/timezone.patch'),
  TEAM_MANAGE,
  '/api/control/community/timezone',
  { body: { timezone: 'Europe/Berlin' } },
)

describeControlGate(
  'POST /api/community/profile-signal',
  () => import('../server/api/community/profile-signal.post'),
  TEAM_MANAGE,
  '/api/control/community/profile-signal',
  { body: { purpose: 'new' } },
)

// ── Ohne Control Plane: Antwort aus dem Kontext oder eigene Wirkung ─────────

describeRoleGateToAnswer(
  'GET /api/community/profile',
  () => import('../server/api/community/profile.get'),
  TEAM_MANAGE,
  { tenantFields: { name: 'Probe-Community', description: '' } },
)

describeRoleGateToEffect(
  'GET /api/community/profile-signal',
  () => import('../server/api/community/profile-signal.get'),
  TEAM_MANAGE,
  () => countingEffect('communityHasAuthoredContent', false),
)

describeRoleGateToEffect(
  'GET /api/community/products',
  () => import('../server/api/community/products.get'),
  TEAM_MANAGE,
  () => {
    const effect = countingEffect('getEffectiveProducts', {})
    return { ...effect, globals: { ...effect.globals, getProductRegistry: () => new Map() } }
  },
)

describeRoleGateToEffect(
  'DELETE /api/community/branding/favicon',
  () => import('../server/api/community/branding/favicon.delete'),
  TEAM_MANAGE,
  () => countingEffect('removeCommunityFavicon'),
)

describeRoleGateToEffect(
  'GET /api/community/export',
  () => import('../server/api/community/export.get'),
  OWNER_ONLY,
  () => countingEffect('exportCommunityCompletely', { tables: {} }),
)

// ── Über die Datentür (Operator-Klinke mit dem Handelnden) ──────────────────

describeRoleGateToDoor(
  'GET /api/community/usage',
  () => import('../server/api/community/usage.get'),
  TEAM_MANAGE,
)

// Der Team-Schnappschuss legt beim Laden einen Kurzzeit-Cache an (echter Helfer).
const MICROCACHE = { createMicrocache }

describeRoleGateToDoor(
  'GET /api/community/getting-started',
  () => import('../server/api/community/getting-started.get'),
  TEAM_MANAGE,
  { globals: MICROCACHE },
)

describe('Datentür von usage und getting-started: die Klinke nennt den Handelnden', () => {
  const routes = {
    usage: () => import('../server/api/community/usage.get'),
    gettingStarted: () => import('../server/api/community/getting-started.get'),
  }
  for (const [label, load] of Object.entries(routes)) {
    it(`${label}: Owner ⇒ actor member, Betreiber ⇒ actor operator`, async () => {
      const seen: Array<{ as?: string, actor?: string }> = []
      const door = (_e: unknown, options?: { as?: 'member' | 'operator', actor?: string }) => {
        seen.push({ as: options?.as, actor: options?.actor })
        throw new Error('stop')
      }
      await probeRoute(load, { who: 'owner', door, globals: MICROCACHE })
      await probeRoute(load, { who: 'operator', door, globals: MICROCACHE })
      expect(seen).toEqual([
        { as: 'operator', actor: 'member' },
        { as: 'operator', actor: 'operator' },
      ])
    })
  }
})

// ── Eigenes Konto: nur die eigenen Einstellungen (prefs) ────────────────────

describeAccountRoute(
  'POST /api/community/getting-started/dismiss',
  () => import('../server/api/community/getting-started/dismiss.post'),
)

describeAccountRoute(
  'POST /api/community/profile-signal/postpone',
  () => import('../server/api/community/profile-signal/postpone.post'),
  { body: { mode: 'later' } },
)

describe('Konto-Routen auf dem Mandanten-Host: schreiben nur über den Session-Client', () => {
  const routes = {
    dismiss: { load: () => import('../server/api/community/getting-started/dismiss.post'), body: {} },
    postpone: { load: () => import('../server/api/community/profile-signal/postpone.post'), body: { mode: 'never' } },
  }
  for (const [label, { load, body }] of Object.entries(routes)) {
    it(`${label}: Mitglied schreibt in die eigenen prefs, nie über den Admin-Client`, async () => {
      const writes: unknown[] = []
      const run = await probeRoute(load, {
        who: 'member',
        body,
        userFields: { prefs: { other: 1 } },
        globals: {
          createSessionClient: () => ({ account: { updatePrefs: async (input: unknown) => { writes.push(input) } } }),
          createAdminClient: () => { throw new Error('Admin-Client verboten') },
        },
      })
      expect(run.status).toBe(200)
      expect(writes).toHaveLength(1)
      expect((writes[0] as { prefs: Record<string, unknown> }).prefs.other).toBe(1)
    })

    it(`${label}: ohne Pool-Mandanten 404`, async () => {
      const run = await probeRoute(load, { who: 'member', body, mode: 'silo' })
      expect(run.status).toBe(404)
      expect(run.doorOpened).toBe(false)
    })
  }
})
