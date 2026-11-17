import { z } from 'zod'
import { HTTP_URL_PROTOCOL } from '../../core/shared/safeHref'
import { LOCALE_CODE_PATTERN } from '../../core/shared/ugcTranslations'
import { COURSE_ACCESS, LEGACY_COURSE_ACCESS_FREE, MAX_COURSE_DESCRIPTION, MAX_COURSE_TITLE, MAX_LESSON_CONTENT, normalizeCourseAccess } from '../shared/types/course'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

/** slug: url-sicher, stabil (a-z0-9-), 3–100 Zeichen */
const slugSchema = (t: TranslateFn) => z.string().trim().toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, t('courses.validation.slugInvalid'))
  .min(3, t('courses.validation.slugInvalid'))
  .max(100, t('courses.validation.slugInvalid'))

const courseFields = (t: TranslateFn) => ({
  title: z.string().trim().min(1, t('courses.validation.titleRequired')).max(MAX_COURSE_TITLE, t('courses.validation.titleMax')),
  slug: slugSchema(t),
  description: z.string().trim().min(1, t('courses.validation.descriptionRequired')).max(MAX_COURSE_DESCRIPTION, t('courses.validation.descriptionMax')),
  /**
   * Zwei Zugangsarten (KU1). Der alte Wert `'free'` wird weiter ANGENOMMEN und
   * als `'members'` gespeichert: ein Formular, das beim Ausliefern noch offen
   * war, soll nicht an einer Auswahl scheitern, die dasselbe bedeutet.
   */
  access: z.enum([...COURSE_ACCESS, LEGACY_COURSE_ACCESS_FREE]).transform(normalizeCourseAccess),
  entitlementProduct: z.string().trim().max(64).nullish(),
})

/** access 'paid' verlangt das Entitlement-Produkt (Guard-Ziel) */
function paidNeedsProduct(data: { access?: string, entitlementProduct?: string | null }): boolean {
  return data.access !== 'paid' || !!data.entitlementProduct
}

export function createCourseSchema(t: TranslateFn = identity) {
  return z.object({
    ...courseFields(t),
    status: z.enum(['draft', 'published']).optional(),
  }).refine(paidNeedsProduct, { message: t('courses.validation.paidNeedsProduct'), path: ['entitlementProduct'] })
}

export function createCourseEditSchema(t: TranslateFn = identity) {
  const f = courseFields(t)
  return z.object({
    title: f.title.optional(),
    slug: f.slug.optional(),
    description: f.description.optional(),
    access: f.access.optional(),
    entitlementProduct: f.entitlementProduct,
    status: z.enum(['draft', 'published', 'archived']).optional(),
    // paid-braucht-Produkt prüft die Route gegen den MERGED Zustand
  })
}

export function createLessonSchema(t: TranslateFn = identity) {
  return z.object({
    title: z.string().trim().min(1, t('courses.validation.titleRequired')).max(MAX_COURSE_TITLE, t('courses.validation.titleMax')),
    content: z.string().trim().min(1, t('courses.validation.contentRequired')).max(MAX_LESSON_CONTENT, t('courses.validation.contentMax')),
    videoUrl: z.url({ protocol: HTTP_URL_PROTOCOL, error: t('courses.validation.urlInvalid') }).max(500).nullish(),
    status: z.enum(['draft', 'published']).optional(),
  })
}

export function createLessonEditSchema(t: TranslateFn = identity) {
  const base = createLessonSchema(t)
  return z.object({
    title: base.shape.title.optional(),
    content: base.shape.content.optional(),
    videoUrl: base.shape.videoUrl,
    status: base.shape.status,
  })
}

export function createReorderSchema(t: TranslateFn = identity) {
  return z.object({
    lessonIds: z.array(z.string().min(1)).min(1, t('courses.validation.orderRequired')).max(500),
  })
}

/**
 * „Übersetze DAS HIER in DIESE Sprache" — der ganze Rumpf ist EIN Sprachcode.
 *
 * EIN Schema für Kurs UND Lektion, und das ist keine Sparsamkeit: beide Routen
 * fragen dasselbe, nämlich die Zielsprache. Der zu übersetzende Text steht auf
 * der Zeile, das Ziel im Pfad — zwei gleichlautende Schemas nebeneinander wären
 * zwei Orte, an denen dieselbe Regel altern kann.
 *
 * Kein Text im Rumpf: käme er vom Aufrufer, wäre die Route ein bezahlter
 * Übersetzungsdienst für beliebigen Fremdtext, und der Cache auf der Zeile
 * trüge etwas, das dort nie stand.
 */
export function createCourseTranslateSchema(t: TranslateFn = identity) {
  return z.object({
    locale: z.string().trim().regex(LOCALE_CODE_PATTERN, t('courses.validation.translateLocaleInvalid')),
  })
}

// Server-seitige Instanzen (Fehlertexte = Keys; die UI validiert mit t())
export const courseSchema = createCourseSchema()
export const courseEditSchema = createCourseEditSchema()
export const lessonSchema = createLessonSchema()
export const lessonEditSchema = createLessonEditSchema()
export const reorderSchema = createReorderSchema()
export const courseTranslateSchema = createCourseTranslateSchema()
