import { describeInstanceRoleGate } from '../../core/tests/support/instanceRoleGate'

/**
 * ROLLEN-PROBEN FÜR DIE BOARD-ROUTEN DES AI-RUNNERS (OPS-009).
 *
 * Jede Route hier fragt das INSTANZ-Recht `runner.manage`
 * (`requirePermission`): entschieden wird über das globale Label. Durch kommt
 * NUR der Betreiber — ein Lauf ist Code-Ausführung auf Davids Rechner, das
 * Karten-Mitglied (globales Label `moderator`) bedient Tickets, aber keine
 * Rechner und keine Läufe. Community-Rollen zählen nicht. Das steht je Route
 * ausgeschrieben unten.
 *
 * Die Maschinen-Routen (Bearer-Ausweis des Runners) stehen in
 * `route-roles-machine.test.ts`.
 */

const OPERATOR_ONLY = {
  allow: ['operator'],
  deny: ['owner', 'admin', 'moderator', 'editor', 'member', 'staff'],
} as const

const base = {
  globals: { useRuntimeConfig: () => ({ public: { appwriteDatabaseId: 'main' } }) },
}

const run = { ...base, params: { id: 'run-1' } }

describeInstanceRoleGate('POST /api/runner/retention/run', () => import('../server/api/runner/retention/run.post'), OPERATOR_ONLY, {
  ...base,
  body: { dryRun: true },
})

describeInstanceRoleGate('GET /api/runner/runners', () => import('../server/api/runner/runners/index.get'), OPERATOR_ONLY, base)

describeInstanceRoleGate('POST /api/runner/runners', () => import('../server/api/runner/runners/index.post'), OPERATOR_ONLY, {
  ...base,
  body: { name: 'Probe-Rechner' },
})

describeInstanceRoleGate('PATCH /api/runner/runners/:id', () => import('../server/api/runner/runners/[id].patch'), OPERATOR_ONLY, {
  ...base,
  params: { id: 'r-1' },
  body: { status: 'disabled' },
})

describeInstanceRoleGate('GET /api/runner/runs', () => import('../server/api/runner/runs/index.get'), OPERATOR_ONLY, {
  ...base,
  query: { subjectType: 'ticket', subjectId: 't-1' },
})

// Anlegen und Fortsetzen: beide enden für den Betreiber an der Ablage. Kein
// Resolver ist registriert — der Auftrag kommt hier aus der Anfrage und gilt
// als ungeprüft (was die Route daraus macht, prüft `runRoutes.test.ts`).
describeInstanceRoleGate('POST /api/runner/runs', () => import('../server/api/runner/runs/index.post'), OPERATOR_ONLY, {
  ...base,
  body: { subjectType: 'ticket', subjectId: 't-1', repoKey: 'maui', model: 'opus', permissionMode: 'plan', promptSource: '# Probe' },
})

describeInstanceRoleGate('POST /api/runner/runs/:id/resume', () => import('../server/api/runner/runs/[id]/resume.post'), OPERATOR_ONLY, {
  ...run,
  body: { answer: 'Ja.' },
})

describeInstanceRoleGate('GET /api/runner/runs/recent', () => import('../server/api/runner/runs/recent.get'), OPERATOR_ONLY, base)

describeInstanceRoleGate('POST /api/runner/runs/:id/cancel', () => import('../server/api/runner/runs/[id]/cancel.post'), OPERATOR_ONLY, run)

describeInstanceRoleGate('POST /api/runner/runs/:id/queue', () => import('../server/api/runner/runs/[id]/queue.post'), OPERATOR_ONLY, run)

describeInstanceRoleGate('GET /api/runner/runs/:id/events', () => import('../server/api/runner/runs/[id]/events.get'), OPERATOR_ONLY, run)

describeInstanceRoleGate('POST /api/runner/runs/:id/files', () => import('../server/api/runner/runs/[id]/files.post'), OPERATOR_ONLY, run)

describeInstanceRoleGate('GET /api/runner/runs/:id/transcript', () => import('../server/api/runner/runs/[id]/transcript.get'), OPERATOR_ONLY, run)
