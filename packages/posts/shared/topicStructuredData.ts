import { ldCompact, ldDate, ldPerson } from '../../core/shared/communityStructuredData'
import { markdownExcerpt } from '../../core/shared/markdownExcerpt'

/**
 * JSON-LD einer Diskussion (SU1, SEO-003): `DiscussionForumPosting`.
 *
 * Nur, was die Seite öffentlich zeigt: Titel, Text, angezeigter Autorname,
 * Datum, Kategorie. KEINE Konto-Id, kein Handle, keine
 * Stimmen. Die Topic-Route liefert nur veröffentlichte Beiträge (sonst 404);
 * ein Beitrag ohne Text (geschwärzt, reine Umfrage) bekommt keine Daten —
 * eine Diskussion ohne Inhalt ist keine Aussage wert.
 */
export interface TopicStructuredDataInput {
  url: string
  title: string | null | undefined
  body: string | null | undefined
  authorName: string | null | undefined
  publishedAt: string | null | undefined
  createdAt: string | null | undefined
  lastActivityAt: string | null | undefined
  categoryName: string | null | undefined
  inLanguage: string
}

/** Länge des Textes in den Daten — die Seite zeigt den ganzen Beitrag. */
export const TOPIC_LD_TEXT_MAX = 1000

export function topicStructuredData(input: TopicStructuredDataInput): Record<string, unknown> | null {
  const text = markdownExcerpt(input.body, TOPIC_LD_TEXT_MAX)
  if (!text) return null
  return ldCompact({
    '@type': 'DiscussionForumPosting',
    'url': input.url,
    'mainEntityOfPage': input.url,
    'headline': input.title?.trim() || undefined,
    'text': text,
    'author': ldPerson(input.authorName),
    'datePublished': ldDate(input.publishedAt) ?? ldDate(input.createdAt),
    'dateModified': ldDate(input.lastActivityAt),
    'articleSection': input.categoryName?.trim() || undefined,
    'inLanguage': input.inLanguage,
  })
}
