import { describeRoleGateToDoor } from '../../core/tests/support/participationHarness'
import { assertPaidAccessOffered, isCourseAccessConfigured } from '../server/utils/courseAccess'

/**
 * ROLLEN-PROBEN FÜR DIE KURS-VERWALTUNG (P27, OPS-009).
 *
 * Die Zusage aus `.claude/rules/tenant-isolation.md` („KURSE: VORSCHAU FÜR
 * ALLE, INHALT FÜR MITGLIEDER"): Kurs-Zeilen tragen kein Leserecht, die
 * Routen lesen und schreiben über die Operator-Klinke und sind selbst die
 * Grenze. Vorschau und Inhalt belegt `course-routes-membership.test.ts`; hier
 * steht der dritte Teil — VERWALTUNG nur mit `courses.manage`, und wer sie
 * nicht hat, kommt nicht bis an die Datentür.
 *
 * `courses.manage` (abgelesen aus `core/shared/communityAuthz.ts`, nicht
 * berechnet): Redakteur (Kurse sind Inhalt), Admin und Owner über EDITOR,
 * dazu der Betreiber im Not-Zugang. Der Moderator ausdrücklich NICHT (Editor
 * und Moderator sind Geschwister), das Mitglied nicht.
 */

const MANAGE = {
  allow: ['owner', 'admin', 'editor', 'operator'],
  deny: ['moderator', 'member'],
} as const

/** Echte Layer-Helfer, die die Routen vor der Datentür als Auto-Import rufen. */
const LAYER_HELPERS = { assertPaidAccessOffered, isCourseAccessConfigured }

describeRoleGateToDoor(
  'GET /api/courses/manage',
  () => import('../server/api/courses/manage.get'),
  MANAGE,
  { globals: LAYER_HELPERS },
)

describeRoleGateToDoor(
  'POST /api/courses',
  () => import('../server/api/courses/index.post'),
  MANAGE,
  {
    body: { title: 'Wolken lesen', slug: 'wolken-lesen', description: 'Ein Kurs über Wolken.', access: 'free' },
    globals: LAYER_HELPERS,
  },
)

describeRoleGateToDoor(
  'GET /api/courses/:id/manage',
  () => import('../server/api/courses/[slug]/manage.get'),
  MANAGE,
  { params: { slug: 'c-pub' }, globals: LAYER_HELPERS },
)

describeRoleGateToDoor(
  'PATCH /api/courses/:id',
  () => import('../server/api/courses/[slug]/index.patch'),
  MANAGE,
  { params: { slug: 'c-pub' }, body: { title: 'Neuer Titel' }, globals: LAYER_HELPERS },
)

describeRoleGateToDoor(
  'POST /api/courses/:id/lessons',
  () => import('../server/api/courses/[slug]/lessons.post'),
  MANAGE,
  { params: { slug: 'c-pub' }, body: { title: 'Cumulus', content: 'Lektionsinhalt' }, globals: LAYER_HELPERS },
)

describeRoleGateToDoor(
  'POST /api/courses/:id/reorder',
  () => import('../server/api/courses/[slug]/reorder.post'),
  MANAGE,
  { params: { slug: 'c-pub' }, body: { lessonIds: ['l-1', 'l-2'] }, globals: LAYER_HELPERS },
)

describeRoleGateToDoor(
  'PATCH /api/lessons/:id',
  () => import('../server/api/lessons/[id].patch'),
  MANAGE,
  { params: { id: 'l-1' }, body: { title: 'Stratus' }, globals: LAYER_HELPERS },
)

describeRoleGateToDoor(
  'DELETE /api/lessons/:id',
  () => import('../server/api/lessons/[id].delete'),
  MANAGE,
  { params: { id: 'l-1' }, globals: LAYER_HELPERS },
)
