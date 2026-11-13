import type { CoursePreview, CourseRow, LessonRow, LessonSummary } from './types/course'

/**
 * DIE ÖFFENTLICHE FELDAUSWAHL (SEC-029) — pur, getestet.
 *
 * Kurs-Zeilen tragen kein Leserecht mehr; ausgeliefert wird nur über die
 * Routen, und die geben NIE die rohe Zeile heraus. Jedes Feld steht hier
 * einzeln: wer der Zeile eine Spalte hinzufügt, muss sie hier bewusst
 * nachtragen, sonst bleibt sie intern. Ein Spread wäre der umgekehrte Default.
 */
export function toCoursePreview(row: CourseRow): CoursePreview {
  return {
    $id: row.$id,
    $createdAt: row.$createdAt,
    $updatedAt: row.$updatedAt,
    title: row.title,
    slug: row.slug,
    description: row.description,
    status: row.status,
    access: row.access,
    authorName: row.authorName,
    lessonCount: row.lessonCount,
    translations: row.translations ?? '',
  }
}

/** Ein Eintrag der Gliederung — Titel und Reihenfolge, nie der Inhalt. */
export function toLessonSummary(row: LessonRow): LessonSummary {
  return { $id: row.$id, title: row.title, order: row.order, status: row.status }
}
