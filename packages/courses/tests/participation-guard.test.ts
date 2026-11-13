import { describeGuardedRoute } from '../../core/tests/support/participationHarness'
import * as courseMembership from '../server/utils/courseMembership'

/**
 * SEC-030 — das Einschreiben läuft seit SEC-030 über die EINE Core-Wache
 * (`requireCourseMemberJoining` delegiert an `requireCommunityParticipant`).
 * Anders als `course-routes-membership.test.ts`, das den Beitritt nachbildet,
 * läuft hier der echte Beitritt mit — inklusive des Falls „gerade entfernt,
 * Rollen-Cache sagt noch viewer".
 */

const globals = {
  requireCourseMemberJoining: courseMembership.requireCourseMemberJoining,
  requireCourseMember: courseMembership.requireCourseMember,
}

describeGuardedRoute('POST /api/courses/:slug/enroll', () => import('../server/api/courses/[slug]/enroll.post'), 'participant', {
  params: { slug: 'wolken' }, globals,
})

describeGuardedRoute('POST /api/lessons/:id/complete', () => import('../server/api/lessons/[id]/complete.post'), 'membership', {
  params: { id: 'l-1' }, globals,
})
