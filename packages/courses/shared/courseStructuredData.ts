import { ldCompact, ldDate, ldPerson } from '../../core/shared/communityStructuredData'
import { markdownExcerpt } from '../../core/shared/markdownExcerpt'

/**
 * JSON-LD eines Kurses (SU1, SEO-003): `Course`.
 *
 * Nur, was die öffentliche Vorschau zeigt (SEC-029): Titel, Beschreibung,
 * angezeigter Autorname, Name der Community als Anbieter. KEINE Lektionen
 * (deren Inhalt ist nur für Mitglieder), kein Preis (den nennt die Seite
 * nicht), keine Konto-Id. Die Route liefert nur veröffentlichte Kurse.
 */
export interface CourseStructuredDataInput {
  url: string
  title: string | null | undefined
  description: string | null | undefined
  authorName: string | null | undefined
  providerName: string | null | undefined
  createdAt: string | null | undefined
  updatedAt: string | null | undefined
  inLanguage: string
}

export function courseStructuredData(input: CourseStructuredDataInput): Record<string, unknown> | null {
  const name = input.title?.trim()
  if (!name) return null
  const providerName = input.providerName?.trim()
  return ldCompact({
    '@type': 'Course',
    'url': input.url,
    'name': name,
    // schema.org verlangt für `Course` eine Beschreibung; ohne eigene bleibt
    // der Titel — dasselbe, was die Seite dann zeigt.
    'description': markdownExcerpt(input.description) || name,
    'author': ldPerson(input.authorName),
    'provider': providerName ? { '@type': 'Organization', 'name': providerName, 'url': new URL(input.url).origin } : undefined,
    'dateCreated': ldDate(input.createdAt),
    'dateModified': ldDate(input.updatedAt),
    'inLanguage': input.inLanguage,
  })
}
