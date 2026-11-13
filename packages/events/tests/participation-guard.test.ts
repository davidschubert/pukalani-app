import { describeGuardedRoute } from '../../core/tests/support/participationHarness'

/**
 * SEC-030 — Zusagen und Abstimmen verlangen Zugehörigkeit zur Community
 * (offene Registrierung: die Zusage selbst ist der Beitritt). Übersetzen
 * verlangt sie, ohne beizutreten. Echte Handler, echte Core-Wachen.
 */

describeGuardedRoute('POST /api/events/:id/rsvp', () => import('../server/api/events/[id]/rsvp.post'), 'participant', {
  params: { id: 'e-1' }, body: { status: 'going' },
})

describeGuardedRoute('POST /api/events/:id/score', () => import('../server/api/events/[id]/score.post'), 'participant', {
  params: { id: 'e-1' }, body: { value: 1 },
})

