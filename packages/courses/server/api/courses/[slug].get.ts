import { Query } from 'node-appwrite'
import { toCoursePreview, toLessonSummary } from '../../../shared/coursePreview'
import { COURSES_TABLE, LESSON_PROGRESS_TABLE, LESSONS_TABLE, type CourseDetailResponse, type CourseRow, type EnrollmentRow, type LessonProgressRow, type LessonRow } from '../../../shared/types/course'

/**
 * Kurs-VORSCHAU (per Slug): Beschreibung + Gliederung (Lektions-TITEL der
 * veröffentlichten Lektionen) für jeden, auch ohne Konto (SEC-029, Davids
 * Entscheidung 2026-11-13). Lektions-INHALT liefert erst GET /api/lessons/:id
 * für Mitglieder nach Einschreibung.
 *
 * Datentür als Operator: Kurs- und Lektions-Zeilen tragen kein Leserecht
 * (courseAccess.ts), die Route ist die Grenze — Mandanten-Scope der Tür, ein
 * Entwurf antwortet 404 wie ein unbekannter Slug, und die Antwort ist eine
 * Feldauswahl (`toCoursePreview`/`toLessonSummary`), nie die rohe Zeile.
 *
 * Einschreibung und Fortschritt nur für angemeldete MITGLIEDER; für Gäste und
 * Fremde wird nicht einmal nachgesehen.
 */
export default defineEventHandler(async (event): Promise<CourseDetailResponse> => {
  // Produkt-Gate (P4): Kurse sind ab Plan pro enthalten.
  requirePlanProduct(event, 'courses')

  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ status: 400, statusText: 'Missing slug' })
  }

  const db = tenantDb(event, { as: 'operator' })
  const course = await db.find<CourseRow>(COURSES_TABLE, [Query.equal('slug', slug)])
    .catch((error) => { throw toH3Error(error, 'Course not found') })
  if (!course || course.status !== 'published') {
    throw createError({ status: 404, statusText: 'Course not found' })
  }

  const user = event.context.user
  const member = user ? await resolveCommunityMembership(event).catch(() => false) : false

  const [lessons, enrollment, progress] = await Promise.all([
    db.list<LessonRow>(LESSONS_TABLE, [
      Query.equal('courseId', course.$id), Query.equal('status', 'published'), Query.orderAsc('order'), Query.limit(500),
    ]),
    user && member ? enrollmentFor(event, course.$id, user.$id) : Promise.resolve<EnrollmentRow | null>(null),
    user && member
      ? db.list<LessonProgressRow>(LESSON_PROGRESS_TABLE, [
          Query.equal('courseId', course.$id), Query.equal('userId', user.$id), Query.limit(500),
        ]).catch(() => ({ rows: [] as LessonProgressRow[] }))
      : Promise.resolve({ rows: [] as LessonProgressRow[] }),
  ])

  return {
    ...toCoursePreview(course),
    lessons: lessons.rows.map(toLessonSummary),
    enrolled: enrollment !== null,
    completedLessonIds: progress.rows.map(p => p.lessonId),
    completedAt: enrollment?.completedAt ?? null,
  }
})
