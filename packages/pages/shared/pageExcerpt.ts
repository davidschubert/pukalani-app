/**
 * Kurzfassung einer CMS-Seite für meta description/og:description (S5).
 *
 * Die Regel selbst liegt seit Q10 (2026-11-21) im Core
 * (`core/shared/markdownExcerpt.ts`), weil Diskussionen, Kurse und Termine
 * dieselbe brauchen. Diese Datei reicht sie unter dem alten Namen weiter —
 * die Aufrufer im pages-Layer und in den Apps bleiben, wie sie sind.
 */
export {
  MARKDOWN_EXCERPT_MAX_LENGTH as PAGE_EXCERPT_MAX_LENGTH,
  markdownExcerpt as pageExcerpt,
} from '../../core/shared/markdownExcerpt'
