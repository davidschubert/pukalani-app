import { describeInstanceRoleGate } from '../../core/tests/support/instanceRoleGate'

/**
 * ROLLEN AM BETREIBER-HANDGRIFF `POST /api/market/ops/sweep` (OPS-009, BT1 b)
 * — der ECHTE Handler hinter dem ECHTEN Instanz-Recht `system.manage`
 * (Prüfstand `core/tests/support/instanceRoleGate.ts`).
 *
 * Der Rohtext-Sweep läuft über ALLE Brandings; kein Branding-Besitz beweist
 * hier etwas, deshalb fragt die Route das Instanz-Recht.
 *
 * WER DURCH DARF, AUSGESCHRIEBEN: nur der Betreiber. Keine Community-Rolle
 * und kein Karten-Mitglied (`staff`, globales Label `moderator`).
 * Ohne Konto ⇒ 401, alle anderen ⇒ 403, jeweils mit geschlossener Datentür
 * (`createAdminClient` nicht geöffnet).
 */

describeInstanceRoleGate(
  'POST /api/market/ops/sweep',
  () => import('../server/api/market/ops/sweep.post'),
  {
    allow: ['operator'],
    deny: ['owner', 'admin', 'moderator', 'editor', 'member', 'staff'],
  },
)
