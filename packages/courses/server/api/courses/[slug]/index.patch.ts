import { courseEditSchema } from '../../../../schemas/course'
import { COURSES_TABLE, type CourseRow } from '../../../../shared/types/course'

/**
 * Kurs bearbeiten (courses.manage; [slug]-Segment = Row-ID im Builder).
 * publish schreibt recordActivity. Die Rechte der Zeile fasst der Status NICHT
 * an: Kurs-Zeilen tragen kein Leserecht (SEC-029, courseAccess.ts), sichtbar
 * macht ein Kurs erst die Route, die `status = published` filtert. Ein
 * Alt-Leserecht aus der Zeit davor räumt Migration courses-008 ab.
 * Datentür als Operator: get/update belegen die Zugehörigkeit — ein fremder
 * Mandant bekommt 404.
 *
 * WER HANDELT (F17): Redaktion an INHALT — `actor` aus dem Gate (Rolle ⇒
 * 'member', also Inhalts-Sperre M13; Break-Glass ⇒ 'operator').
 * VERÖFFENTLICHEN ZÄHLT MIT, und das ist die bewusste Entscheidung: der Status
 * ist keine Owner-Einstellung wie Farbe oder Publikum, sondern der Moment, in
 * dem ein Inhalt in die Welt geht. Genau den soll eine Zahlungssperre anhalten
 * — sonst wäre „nur-lesend" nur für Kommentare wahr und für den Kurs, der
 * darüber steht, nicht.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Kurse sind ab Plan pro enthalten.
  requirePlanProduct(event, 'courses')
  const { user, actor } = await requireCommunityPermission(event, 'courses.manage')

  const id = getRouterParam(event, 'slug')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing course id' })
  }

  const body = await readValidatedBody(event, courseEditSchema.parse)
  const db = tenantDb(event, { as: 'operator', actor })

  const row = await db.get<CourseRow>(COURSES_TABLE, id, 'Course not found')

  // paid braucht das Entitlement-Produkt — gegen den MERGED Zustand
  const mergedAccess = body.access ?? row.access
  const mergedProduct = body.entitlementProduct === undefined ? row.entitlementProduct : body.entitlementProduct
  // Und 'paid' überhaupt anbieten können (Befund 2, 2026-08-02). Gegen den
  // MERGED Zustand, damit auch ein Bestandskurs nicht unbemerkt auf 'paid'
  // stehen bleibt, wenn jemand nur den Titel ändert.
  assertPaidAccessOffered(mergedAccess)
  if (mergedAccess === 'paid' && !mergedProduct) {
    throw createError({ status: 422, statusText: 'Paid courses need an entitlement product' })
  }

  const publishing = body.status === 'published' && row.status !== 'published'

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title
  if (body.slug !== undefined) data.slug = body.slug
  if (body.description !== undefined) data.description = body.description
  if (body.access !== undefined) data.access = body.access
  if (body.entitlementProduct !== undefined) data.entitlementProduct = mergedAccess === 'paid' ? body.entitlementProduct : null
  if (body.status !== undefined) data.status = body.status

  /**
   * Der Übersetzungs-Cache (courses-007) gilt für den ALTEN Text — eine
   * stehengelassene Fassung wäre eine stille Lüge in einer anderen Sprache.
   * Gegen die ECHTE Änderung geprüft, nicht gegen den Umfang des Formulars:
   * wer nur den Zugang umstellt, soll keine bezahlte Übersetzung verlieren.
   */
  const textChanged = (body.title !== undefined && body.title !== row.title)
    || (body.description !== undefined && body.description !== row.description)
  if (textChanged) data.translations = ''

  const updated = await db.update<CourseRow>(COURSES_TABLE, id, data, 'Course not found').catch((error) => {
    throw toH3Error(error, 'Could not update course')
  })
  if (publishing) {
    await recordActivity(event, {
      actorId: user.$id,
      actorName: user.name,
      type: 'course.published',
      objectType: 'course',
      objectId: updated.$id,
      link: `/courses/${updated.slug}`,
      metadata: { title: updated.title },
    })
  }

  return updated
})
