import { describeGuardedRoute } from '../../core/tests/support/participationHarness'

/**
 * SEC-030 — Melden verlangt Zugehörigkeit zur Community, bleibt aber in einer
 * gesperrten Community für Mitglieder OFFEN: Melden ist Moderation, kein
 * Inhalt (M13). Ein Fremder wird dort nicht durch den Versuch Mitglied.
 */

describeGuardedRoute('POST /api/reports', () => import('../server/api/reports/index.post'), 'report', {
  body: { targetType: 'comment', targetId: 'k-1', reason: 'spam' },
})

describeGuardedRoute('DELETE /api/reports (eigene Meldung zurückziehen)', () => import('../server/api/reports/index.delete'), 'membership', {
  query: { targetType: 'comment', targetId: 'k-1' },
})
