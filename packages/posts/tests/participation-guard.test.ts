import { describeGuardedRoute } from '../../core/tests/support/participationHarness'

/**
 * SEC-030 — Beiträge, Stimmen und Reaktionen verlangen Zugehörigkeit zur
 * Community (offene Registrierung: der Schritt selbst ist der Beitritt).
 * Echte Handler, echte Core-Wachen; nachgebildet ist nur die Naht.
 */

describeGuardedRoute('POST /api/posts', () => import('../server/api/posts/index.post'), 'participant', {
  body: { type: 'post', title: 'Titel', body: 'Text' },
})

describeGuardedRoute('POST /api/posts/:id/vote (Umfrage)', () => import('../server/api/posts/[id]/vote.post'), 'participant', {
  params: { id: 'p-1' }, body: { optionIndex: 0 },
})

describeGuardedRoute('POST /api/posts/:id/score', () => import('../server/api/posts/[id]/score.post'), 'participant', {
  params: { id: 'p-1' }, body: { value: 1 },
})

describeGuardedRoute('POST /api/posts/discussions/reactions', () => import('../server/api/posts/discussions/reactions.post'), 'participant', {
  body: { targetType: 'post', targetId: 'p-1', reaction: 'heart' },
})

describeGuardedRoute('DELETE /api/posts/:id', () => import('../server/api/posts/[id].delete'), 'membership', {
  params: { id: 'p-1' },
})

