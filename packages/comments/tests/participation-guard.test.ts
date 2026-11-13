import { describeGuardedRoute } from '../../core/tests/support/participationHarness'

/**
 * SEC-030 — wer in einer Community kommentiert, abstimmt oder reagiert, muss
 * dazugehören (oder bei offener Registrierung durch genau diesen Schritt
 * dazukommen). Gefahren werden die ECHTEN Handler mit den ECHTEN Core-Wachen;
 * nachgebildet ist nur die Naht zum Control Plane (Prüfstand im Core).
 */

describeGuardedRoute('POST /api/comments', () => import('../server/api/comments/index.post'), 'participant', {
  body: { targetId: 'p-1', targetType: 'post', content: 'Hallo' },
})

describeGuardedRoute('POST /api/comments/:id/vote', () => import('../server/api/comments/[id]/vote.post'), 'participant', {
  params: { id: 'k-1' }, body: { value: 1 },
})

describeGuardedRoute('POST /api/comments/:id/reactions', () => import('../server/api/comments/[id]/reactions.post'), 'participant', {
  params: { id: 'k-1' }, body: { reaction: 'heart' },
})

describeGuardedRoute('PATCH /api/comments/:id', () => import('../server/api/comments/[id].patch'), 'membership', {
  params: { id: 'k-1' }, body: { content: 'Neu' },
})

describeGuardedRoute('DELETE /api/comments/:id', () => import('../server/api/comments/[id].delete'), 'membership', {
  params: { id: 'k-1' },
})
