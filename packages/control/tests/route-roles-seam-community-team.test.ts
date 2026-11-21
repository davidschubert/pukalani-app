import { vi } from 'vitest'
import { describeSeamTeamRoute, type TeamExpectation } from './support/controlRouteHarness'

/**
 * NAHT-ROUTEN DER COMMUNITY-VERWALTUNG: GEHEIMNIS + JWT + ROLLE
 * (OPS-009, BT1 b).
 *
 * Die Platform-App ruft diese Routen für das Dashboard einer Community. Drei
 * Beweise, alle echt (Prüfstand `support/controlRouteHarness.ts`):
 *  1. das Naht-Geheimnis (`requireOnboardingCaller`) — der Aufrufer ist unser
 *     Deployment;
 *  2. das JWT, das das Control Plane SELBST gegen das Pool-Projekt prüft
 *     (`verifyRuntimeIdentity`; nachgebildet ist nur die Antwort von Appwrite);
 *  3. die Rolle dieses Kontos in GENAU dieser Community (aktive Zeile in
 *     `community_members`, nachgebaute Ablage).
 *
 * Die Erwartungen je Rolle stehen AUSGESCHRIEBEN hier, nicht aus der
 * Rechte-Matrix (`core/shared/communityAuthz.ts`) berechnet:
 *  - `team.manage` und `branding.manage`: Owner und Admin.
 *  - `community.billing`: nur der Owner.
 *  - `members.invite`: jede Rolle mit Zugang (auch `viewer`).
 */

vi.mock('node-appwrite', async importOriginal =>
  (await import('./support/runtimeAccounts')).withFakeAccount(await importOriginal<typeof import('node-appwrite')>()))

const OWNER_AND_ADMIN: TeamExpectation = {
  allow: ['owner', 'admin'],
  deny: ['moderator', 'editor', 'viewer'],
}

const OWNER_ONLY: TeamExpectation = {
  allow: ['owner'],
  deny: ['admin', 'moderator', 'editor', 'viewer'],
}

const EVERY_MEMBER: TeamExpectation = {
  allow: ['owner', 'admin', 'moderator', 'editor', 'viewer'],
  deny: [],
}

describeSeamTeamRoute('POST /api/control/community/audience', () => import('../server/api/control/community/audience.post'),
  OWNER_AND_ADMIN, (jwt, communityId) => ({ jwt, communityId, audience: 'public' }))

describeSeamTeamRoute('POST /api/control/community/branding', () => import('../server/api/control/community/branding.post'),
  OWNER_AND_ADMIN, (jwt, communityId) => ({ jwt, communityId, theme: '', variant: '' }))

describeSeamTeamRoute('POST /api/control/community/member-invites', () => import('../server/api/control/community/member-invites.post'),
  OWNER_AND_ADMIN, (jwt, communityId) => ({ jwt, communityId, memberInvitesEnabled: false }))

describeSeamTeamRoute('POST /api/control/community/members/list', () => import('../server/api/control/community/members/list.post'),
  OWNER_AND_ADMIN, (jwt, communityId) => ({ jwt, communityId }))

describeSeamTeamRoute('POST /api/control/community/profile', () => import('../server/api/control/community/profile.post'),
  OWNER_AND_ADMIN, (jwt, communityId) => ({ jwt, communityId, name: 'Probe-Community', description: 'Kurz.' }))

// KI-Training (KC1): dieselbe Route, dieselben Rollen wie die Hauptsprache —
// ein Mitglied ohne Verwaltungs-Recht bekommt 403, geschrieben wird nichts.
describeSeamTeamRoute('POST /api/control/community/profile (KI-Training)', () => import('../server/api/control/community/profile.post'),
  OWNER_AND_ADMIN, (jwt, communityId) => ({ jwt, communityId, name: 'Probe-Community', description: '', aiTraining: true }))

describeSeamTeamRoute('POST /api/control/community/profile-signal', () => import('../server/api/control/community/profile-signal.post'),
  OWNER_AND_ADMIN, (jwt, communityId) => ({ jwt, communityId, signal: { purpose: 'new', memberRange: 'to100' } }))

describeSeamTeamRoute('POST /api/control/community/registration', () => import('../server/api/control/community/registration.post'),
  OWNER_AND_ADMIN, (jwt, communityId) => ({ jwt, communityId, openRegistration: true }))

describeSeamTeamRoute('POST /api/control/community/timezone', () => import('../server/api/control/community/timezone.post'),
  OWNER_AND_ADMIN, (jwt, communityId) => ({ jwt, communityId, timezone: 'Europe/Berlin' }))

describeSeamTeamRoute('POST /api/control/community/suspension', () => import('../server/api/control/community/suspension.post'),
  OWNER_ONLY, (jwt, communityId) => ({ jwt, communityId }))

describeSeamTeamRoute('POST /api/control/community/invites/quota', () => import('../server/api/control/community/invites/quota.post'),
  EVERY_MEMBER, (jwt, communityId) => ({ jwt, communityId }))

describeSeamTeamRoute('POST /api/control/community/members/roster', () => import('../server/api/control/community/members/roster.post'),
  EVERY_MEMBER, (jwt, communityId) => ({ jwt, communityId }))
