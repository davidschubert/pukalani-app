import { Query } from 'node-appwrite'
import { toCoursePreview } from '../../../shared/coursePreview'
import { COURSES_TABLE, ENROLLMENTS_TABLE, type CourseListResponse, type CourseRow, type EnrollmentRow } from '../../../shared/types/course'

const PAGE_SIZE = 25

/**
 * Kurs-Galerie: veröffentlichte Kurse als VORSCHAU — für jeden, auch ohne
 * Konto und auch in einer Community „nur für Mitglieder" (SEC-029, Davids
 * Entscheidung 2026-11-13). Wer sich einschreiben will, sieht hier, was es gibt.
 *
 * Datentür als Operator: Kurs-Zeilen tragen kein Leserecht (courseAccess.ts),
 * die Route ist die Grenze — Filter `status = published` plus Mandanten-Scope
 * der Tür, Antwort nur über `toCoursePreview`.
 *
 * `enrolled` nur für angemeldete MITGLIEDER aus EINER Abfrage (kein N+1);
 * für Gäste und Fremde wird gar nicht erst nachgesehen.
 */
export default defineEventHandler(async (event): Promise<CourseListResponse> => {
  // Produkt-Gate (P4): Kurse sind ab Plan pro enthalten.
  requirePlanProduct(event, 'courses')

  const cursor = getQuery(event).cursor
  const db = tenantDb(event, { as: 'operator' })

  const res = await db.list<CourseRow>(COURSES_TABLE, [
    Query.equal('status', 'published'),
    Query.orderDesc('$createdAt'),
    Query.limit(PAGE_SIZE),
    ...(typeof cursor === 'string' && cursor.length > 0 ? [Query.cursorAfter(cursor)] : []),
  ]).catch((error) => {
    throw toH3Error(error, 'Could not load courses')
  })

  const user = event.context.user
  const member = user ? await resolveCommunityMembership(event).catch(() => false) : false

  const ids = res.rows.map(row => row.$id)
  const enrolled = new Set<string>()
  if (user && member && ids.length > 0) {
    const enrollments = await db.list<EnrollmentRow>(ENROLLMENTS_TABLE, [
      Query.equal('userId', user.$id), Query.equal('courseId', ids), Query.limit(ids.length),
    ]).catch(() => ({ rows: [] as EnrollmentRow[] }))
    for (const row of enrollments.rows) enrolled.add(row.courseId)
  }

  return {
    rows: res.rows.map(row => ({ ...toCoursePreview(row), enrolled: enrolled.has(row.$id) })),
    nextCursor: res.rows.length === PAGE_SIZE ? res.rows.at(-1)!.$id : null,
  }
})
