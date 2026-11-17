import { describeGuardedRoute } from '../../core/tests/support/participationHarness'

/**
 * SEC-030 — Zusagen und Abstimmen verlangen Zugehörigkeit zur Community
 * (offene Registrierung: die Zusage selbst ist der Beitritt). Echte Handler,
 * echte Core-Wachen.
 *
 * Übersetzen steht NICHT hier: die Route verlangt seit MM1 (2026-11-17)
 * ebenfalls die Zugehörigkeit, tritt aber nicht bei — ihr Test liegt in
 * `route-roles-reads.test.ts` („POST /api/events/:id/translate").
 */

describeGuardedRoute('POST /api/events/:id/rsvp', () => import('../server/api/events/[id]/rsvp.post'), 'participant', {
  params: { id: 'e-1' }, body: { status: 'going' },
})

describeGuardedRoute('POST /api/events/:id/score', () => import('../server/api/events/[id]/score.post'), 'participant', {
  params: { id: 'e-1' }, body: { value: 1 },
})

