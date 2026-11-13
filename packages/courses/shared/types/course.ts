import type { Models } from 'node-appwrite'
import { COMMUNITY_NOT_A_MEMBER_CODE } from '../../../core/shared/communityParticipation'

export const COURSES_TABLE = 'courses'
export const LESSONS_TABLE = 'lessons'
export const ENROLLMENTS_TABLE = 'enrollments'
export const LESSON_PROGRESS_TABLE = 'lesson_progress'

export type CourseStatus = 'draft' | 'published' | 'archived'
export type LessonStatus = 'draft' | 'published'

export const COURSE_ACCESS = ['free', 'members', 'paid'] as const
export type CourseAccess = (typeof COURSE_ACCESS)[number]

/**
 * DREI ABLEHNUNGEN, DREI SÄTZE (Audit-Befund 2026-08-02).
 *
 * Beim Einschreiben können drei ganz verschiedene 403 fallen, und die Seite
 * machte aus jedem denselben Satz „Dieser Kurs gehört zu Pro" mit einem Knopf
 * auf /pricing. Zwei davon waren dadurch gelogen: im Pool gibt es gar kein
 * /pricing (die platform-App bindet billing nicht ein — der Knopf führte ins
 * 404), und eine gesperrte Community (M13) bekam eine Kaufaufforderung statt
 * der Mahnung, die das globale Hinweis-Plugin ohnehin schon zeigt.
 *
 * Die Gründe reisen als `data.code` → `reason` im Envelope (core/server/error.ts).
 * Der dritte Fall trägt `community_suspended` und gehört dem Core; er steht
 * bewusst NICHT hier, damit es keine zweite Kopie desselben Schlüssels gibt.
 *
 * WARUM DER GRUND ZUGLEICH DIE ANTWORT AUF „GIBT ES HIER EIN /pricing?" IST:
 * `course_upgrade_required` kann per Konstruktion nur fallen, wenn ein
 * Access-Guard registriert ist (assertCourseAccess) — und den registriert die
 * App, die auch billing einbindet (apps/comments). Kein Guard ⇒ kein billing ⇒
 * kein /pricing ⇒ `course_paid_unavailable`. Damit braucht die Seite kein
 * zweites Flag neben `paidAvailable`, das daneben altern könnte.
 */
/** Diese Instanz kann 'paid' gar nicht freischalten (kein Guard registriert). */
export const COURSE_PAID_UNAVAILABLE_CODE = 'course_paid_unavailable'
/** Guard vorhanden, hat aber abgelehnt — hier führt ein Upgrade wirklich weiter. */
export const COURSE_UPGRADE_REQUIRED_CODE = 'course_upgrade_required'

export const MAX_COURSE_TITLE = 200
export const MAX_COURSE_DESCRIPTION = 5000
// GOALS sagte 50k — MariaDB/utf8mb4 begrenzt die Zeile auf ~65 KB (×4 Bytes
// pro Zeichen, column_limit_exceeded bei 16k neben den übrigen Spalten).
// 15k Zeichen sind für eine Lektion weiterhin sehr großzügig.
export const MAX_LESSON_CONTENT = 15_000

export interface CourseRow extends Models.Row {
  title: string
  /** URL-Slug (unique) */
  slug: string
  description: string
  status: CourseStatus
  access: CourseAccess
  /** Pflicht bei access 'paid' — Produkt-String, den der App-Guard prüft */
  entitlementProduct: string | null
  authorId: string
  authorName: string
  /** denormalisiert: Anzahl PUBLISHED Lektionen (Server-Recount) */
  lessonCount: number
  /**
   * ÜBERSETZUNGEN VON TITEL UND BESCHREIBUNG als JSON, Sprachcode → Fassung —
   * `''`/fehlend = nichts übersetzt (Migration courses-007).
   *
   * OPTIONAL im Typ: sie fehlt bei jeder Zeile aus der Zeit vor der Migration,
   * und eine Anlegestelle hat hier nichts zu entscheiden — ein frischer Kurs
   * ist nie übersetzt. Gelesen AUSSCHLIESSLICH über
   * `core/shared/ugcTranslations.ts` (pur, fail-soft), aufgelöst im Browser;
   * das JSON-Feld heißt dort `body`, nicht `description` (EINE Regel für alle
   * vier Inhaltsarten). Der Inhalt ist ein CACHE: `[slug]/index.patch.ts` leert
   * ihn, sobald sich Titel oder Beschreibung wirklich ändern.
   */
  translations?: string
}

export interface LessonRow extends Models.Row {
  courseId: string
  title: string
  order: number
  /** Markdown (Core-Sink MarkdownContent) — niemals Raw-HTML */
  content: string
  videoUrl: string | null
  status: LessonStatus
  /**
   * ÜBERSETZUNGEN VON TITEL UND INHALT als JSON, Sprachcode → Fassung —
   * `''`/fehlend = nichts übersetzt (Migration courses-007). Optional aus
   * demselben Grund wie bei `CourseRow`; das JSON-Feld heißt `body`, nicht
   * `content`. Der Inhalt ist ein CACHE: `lessons/[id].patch.ts` leert ihn,
   * sobald sich Titel oder Inhalt wirklich ändern.
   */
  translations?: string
}

export interface EnrollmentRow extends Models.Row {
  courseId: string
  userId: string
  completedAt: string | null
}

export interface LessonProgressRow extends Models.Row {
  lessonId: string
  courseId: string
  userId: string
  completedAt: string
}

/** Gliederung der Vorschau: Titel öffentlich, Inhalt/Video/Übersetzungen nicht */
export interface LessonSummary {
  $id: string
  title: string
  order: number
  status: LessonStatus
}

/**
 * VORSCHAU EINES VERÖFFENTLICHTEN KURSES (SEC-029) — das, was jeder sehen darf,
 * auch ohne Konto. Eine AUSWAHL, keine Teilmenge per Weglassen: ein neues Feld
 * an der Zeile wird so nie von selbst öffentlich. Gebaut ausschließlich von
 * `toCoursePreview` (shared/coursePreview.ts).
 *
 * `translations` gehört dazu: es ist der Cache der Übersetzungen von Titel und
 * Beschreibung, also selbst Vorschau. NICHT dabei: Autor-Id, Mandant,
 * Bezahl-Produkt und die Appwrite-Metadaten der Zeile.
 */
export interface CoursePreview {
  $id: string
  $createdAt: string
  $updatedAt: string
  title: string
  slug: string
  description: string
  status: CourseStatus
  access: CourseAccess
  authorName: string
  lessonCount: number
  translations?: string
}

/**
 * Der Grund, mit dem eine Mitglieder-Route einen Fremden abweist — DERSELBE
 * Schlüssel, den die Core-Wachen setzen (`requireCommunityMembership`,
 * `requireCommunityParticipant`). Seit SEC-030 ist er dort eine Konstante und
 * wird hier nur unter dem Kurs-Namen weitergereicht, damit beide nie
 * auseinanderlaufen. Die Oberfläche liest ihn als `reason`.
 */
export const COURSE_NOT_A_MEMBER_CODE = COMMUNITY_NOT_A_MEMBER_CODE

export interface CourseDetailResponse extends CoursePreview {
  lessons: LessonSummary[]
  enrolled: boolean
  completedLessonIds: string[]
  completedAt: string | null
}

/**
 * Antwort von `POST /api/courses/:slug/translate` bzw.
 * `POST /api/lessons/:id/translate` (Davids Entscheidung 2026-08-18) — die
 * Fassung EINES Kurses bzw. EINER Lektion in EINER Sprache.
 *
 * ZWEI NAMEN FÜR DIESELBE FORM, und das ist Absicht: die Aufrufstellen sind
 * verschiedene Routen mit verschiedenen Zukünften (eine Lektion könnte einmal
 * Kapitel-Überschriften mitliefern, ein Kurs nie). Ein gemeinsamer Typ wäre
 * heute kürzer und beim ersten zusätzlichen Feld die falsche Verwandtschaft —
 * dieselbe Überlegung, aus der `CommentTranslateResponse` neben
 * `PostTranslateResponse` steht.
 *
 * `body` ist die übersetzte BESCHREIBUNG bzw. der übersetzte INHALT; der Name
 * folgt der geteilten Regel (`core/shared/ugcTranslations.ts`), nicht dem
 * Spaltennamen. `cached: true` heißt: die Fassung lag schon auf der Zeile,
 * es wurde kein KI-Aufruf bezahlt.
 */
export interface CourseTranslateResponse {
  locale: string
  title: string | null
  body: string
  cached: boolean
}

/** Dasselbe für eine Lektion (`title` + `content`). */
export interface LessonTranslateResponse {
  locale: string
  title: string | null
  body: string
  cached: boolean
}

export interface CourseListResponse {
  rows: Array<CoursePreview & { enrolled: boolean }>
  nextCursor: string | null
}

/** Builder-Liste (/api/courses/manage) */
export interface CourseManageResponse {
  rows: CourseRow[]
  /**
   * Ist ein Access-Guard registriert, kann diese Instanz also 'paid'-Kurse
   * freischalten? (F13-Muster, isCourseAccessConfigured) — false im Pool, wo
   * paid fail-closed ist. Das Formular blendet die Option dann aus, statt
   * einen unbuchbaren Kurs anlegen zu lassen.
   */
  paidAvailable: boolean
}
