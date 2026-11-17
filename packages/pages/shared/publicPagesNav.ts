import { guidelinesFallbackNavItem } from './guidelinesFallback'
import { DEFAULT_PUBLIC_PAGE_LOCALE } from './pageLocales'
import type { PublicPageNavItem } from './types/page'

/**
 * DIE ÖFFENTLICHE SEITEN-LISTE, SPRACHUNABHÄNGIG (BE-019).
 *
 * Was ein Mandant veröffentlicht hat, hängt nicht an der Sprache der Anfrage —
 * nur die AUSWAHL der Fassung tut es. Der Zwischenspeicher hält deshalb
 * diesen Stand (je Mandant EINMAL), und die Liste für eine Sprache wird je
 * Anfrage daraus gerechnet. Eine erfundene Sprache kostet so weder eine
 * Abfrage noch einen Eintrag.
 */

/** Eine veröffentlichte Fassung, nur mit dem, was die Navigation braucht. */
export interface PublicPageVersion {
  slug: string
  locale: string
  title: string
  sortOrder: number
}

export interface PublicPagesSnapshot {
  /**
   * Je slug die veröffentlichten Fassungen, Schlüssel = Sprache. Eine `Map`,
   * kein Objekt: die Sprache kommt aus der Anfrage, und ein Objekt antwortet
   * auf `toString` mit einer geerbten Funktion. Die Einfügereihenfolge ist
   * die Reihenfolge nach `sortOrder` — „sonst die erste" nimmt also wie
   * bisher die Fassung mit der kleinsten Reihenfolge.
   */
  groups: ReadonlyArray<ReadonlyMap<string, PublicPageVersion>>
  /**
   * Erscheinen die Regeln als Rückfall (F1)? Je Mandant konstant: gefragt
   * wird nur, ob es überhaupt eine Regeln-Zeile gibt — die Sprache spielt
   * erst bei Titel und Text des Rückfalls eine Rolle.
   */
  guidelinesFallback: boolean
}

/**
 * Fassungen nach slug gruppieren. `versions` kommen in beliebiger Reihenfolge
 * (die Route blättert nach Kennung); sortiert wird hier, stabil nach
 * `sortOrder` — bei Gleichstand bleibt die Lesereihenfolge.
 */
export function groupPublicPageVersions(versions: readonly PublicPageVersion[]): Array<Map<string, PublicPageVersion>> {
  const sorted = [...versions].sort((a, b) => a.sortOrder - b.sortOrder)
  const bySlug = new Map<string, Map<string, PublicPageVersion>>()
  for (const version of sorted) {
    const group = bySlug.get(version.slug) ?? new Map<string, PublicPageVersion>()
    // slug+locale ist je Mandant eindeutig (uq_slug_locale_tenant) — sollte es
    // doch zweimal vorkommen, gewinnt die erste, wie früher bei `find`.
    if (!group.has(version.locale)) group.set(version.locale, version)
    bySlug.set(version.slug, group)
  }
  return [...bySlug.values()]
}

/**
 * Die Navigation für EINE Sprache: gewünschte Fassung, sonst `en`, sonst die
 * erste. `requested` ist bereits geprüft (`requestedPageLocale`).
 */
export function publicNavItems(snapshot: PublicPagesSnapshot, requested: string): PublicPageNavItem[] {
  const items: PublicPageNavItem[] = []
  for (const group of snapshot.groups) {
    const version = group.get(requested)
      ?? group.get(DEFAULT_PUBLIC_PAGE_LOCALE)
      ?? group.values().next().value
    if (version) items.push({ slug: version.slug, title: version.title, sortOrder: version.sortOrder })
  }
  if (snapshot.guidelinesFallback) items.push(guidelinesFallbackNavItem(requested))
  return items.sort((a, b) => a.sortOrder - b.sortOrder)
}
