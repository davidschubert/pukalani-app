import type { H3Event } from 'h3'
import { COURSES_TABLE, ENROLLMENTS_TABLE, LESSONS_TABLE, normalizeCourseAccess, type CourseRow, type LessonRow } from '../../shared/types/course'

/**
 * Community-Export des courses-Layers (Vertrag: core/server/utils/communityExport.ts).
 *
 * Jeder Kurs mit seinen Lektionen — Titel, Reihenfolge, der volle
 * Lektions-Text und der Video-Link. Das ist die eigentliche Arbeit, die in
 * einer Kurs-Community steckt, und sie gehört vollständig in die Hand des
 * Owners.
 *
 * NICHT DRIN: `authorId` (Konto-Id statt Inhalt), die Einschreibungen und der
 * Lektions-Fortschritt. „Wer ist eingeschrieben" und „wer hat Lektion 3
 * abgeschlossen" sind Aussagen über einzelne Menschen — davon bleibt die
 * anonyme Anzahl der Einschreibungen.
 */
export async function coursesCommunityExport(event: H3Event) {
  /**
   * `as: 'operator'` ist die Bedingung dafür, dass dieses Kapitel überhaupt
   * stimmt: unveröffentlichte Kurse (`draft`, `archived`) und unveröffentlichte
   * LEKTIONEN sind für ein Mitglied nicht lesbar, und bei zugangsbeschränkten
   * Kursen hängt das Leserecht am Kauf. Mit der Mitglieder-Klinke wäre der
   * Export je nach Konto des Owners unterschiedlich groß — eine Datei, die
   * vollständig aussieht und es nicht ist, ist schlimmer als ein Abbruch. Die
   * Datentür scopet weiterhin jede Abfrage auf diese Community und ist mit dem
   * Admin-Client die einzige Grenze; genau diese Abwägung trifft die Moderation
   * ebenfalls (Präzedenz: `packages/posts/server/utils/seedWelcomePost.ts`).
   *
   * `actor: 'member'`, denn der Handelnde ist der Owner und damit ein Mitglied.
   * Gelesen wird nur — die M13-Sperre betrifft Schreibvorgänge und kommt nie
   * zum Zug; den Akteur trotzdem ehrlich zu benennen, ist genau der Punkt der
   * C1c-Trennung von Klinke und Handelndem.
   */
  const db = tenantDb(event, { as: 'operator', actor: 'member' })

  // Die Kurse sind der Inhalt dieses Layers — kein `.catch`: ein Lesefehler
  // muss den Export scheitern lassen, statt ein leeres Kapitel zu liefern.
  const courses = await collectTenantRows<CourseRow>(db, COURSES_TABLE)

  /**
   * ALLE Lektionen in EINEM Durchlauf, danach im Speicher gruppiert — nicht je
   * Kurs eine Abfrage. Bei 40 Kursen wären das 40 paginierte Läufe für Daten,
   * die eine einzige gescopte Liste ohnehin vollständig hergibt (N+1).
   *
   * EBENFALLS OHNE `.catch`, obwohl es die zweite Tabelle ist: die Lektionen
   * SIND der Kurs. Ein abgefangener Fehler lieferte lauter Kurse mit leerer
   * Lektionsliste — formal ein Bündel, inhaltlich der Verlust der ganzen
   * Arbeit, und niemand sähe es. Abgefangen wird nur, was das Bündel
   * BEGLEITET (Zahlen), nicht was es AUSMACHT.
   */
  const lessons = await collectTenantRows<LessonRow>(db, LESSONS_TABLE)
  const lessonsByCourse = new Map<string, LessonRow[]>()
  for (const lesson of lessons) {
    const bucket = lessonsByCourse.get(lesson.courseId)
    if (bucket) bucket.push(lesson)
    else lessonsByCourse.set(lesson.courseId, [lesson])
  }

  // Nur die Anzahl, und sie degradiert: eine Instanz mit ausstehender Migration
  // liefert lieber ein Bündel ohne diese Zahl als gar keins.
  const enrollments = await db.count(ENROLLMENTS_TABLE, []).catch(() => 0)

  return {
    courses: courses.map(c => ({
      id: c.$id,
      createdAt: c.$createdAt,
      title: c.title,
      slug: c.slug,
      description: c.description,
      status: c.status,
      access: normalizeCourseAccess(c.access),
      entitlementProduct: c.entitlementProduct,
      authorName: c.authorName,
      lessonCount: c.lessonCount,
      lessons: (lessonsByCourse.get(c.$id) ?? [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map(l => ({
          id: l.$id,
          title: l.title,
          order: l.order,
          content: l.content,
          videoUrl: l.videoUrl,
          status: l.status,
        })),
    })),
    counts: {
      courses: courses.length,
      lessons: lessons.length,
      enrollments,
    },
  }
}
