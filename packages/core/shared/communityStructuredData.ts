/**
 * Strukturierte Daten (JSON-LD) für Seiten mit Nutzerinhalt einer Community —
 * die REGELN, die für jede Seitenart gleich sind (SU1, SEO-003 zweiter Schritt).
 *
 * Was eine Diskussion, ein Kurs oder ein Termin AUSSAGT, baut der jeweilige
 * Produkt-Layer selbst (posts, courses, events: je eine pure Funktion). Hier
 * steht nur, WANN überhaupt Daten in den Kopf dürfen und wie Text und Datum
 * aussehen — damit drei Seitenarten nicht dreimal verschieden entscheiden.
 *
 * WANN: nur, wenn die Seite in eine Suche gehört. Eine geschlossene Community
 * (`audience: 'members'`) und eine Community, die sich selbst aus der Suche
 * genommen hat (`noindex`), tragen KEINE Daten — dieselben zwei Gründe, aus
 * denen der Kopf `noindex` setzt (`useLocaleSeoHead`). Nicht veröffentlichte
 * Inhalte (Entwurf, ausgeblendet, gelöscht) erreichen die Seite gar nicht:
 * ihre Routen antworten 404.
 *
 * WAS: nur, was die Seite selbst öffentlich zeigt. Keine Mail-Adresse, keine
 * Konto-Kennung; der Autor nur mit dem angezeigten Namen; die Adresse ist die
 * maßgebliche (Hauptsprache, Q10).
 */

export interface CommunityStructuredDataGate {
  /** Community nur für Mitglieder (C18) */
  membersOnly: boolean
  /** Community hat sich aus der Suche genommen (Einstellung des Owners) */
  noindex: boolean
}

/** Dürfen auf dieser Seite strukturierte Daten stehen? */
export function communityStructuredDataAllowed(gate: CommunityStructuredDataGate): boolean {
  return !gate.membersOnly && !gate.noindex
}

/** Ein angezeigter Name als `Person` — leer ⇒ keine Angabe statt eines Platzhalters. */
export function ldPerson(name: string | null | undefined): { '@type': 'Person', name: string } | undefined {
  const trimmed = name?.trim()
  return trimmed ? { '@type': 'Person', name: trimmed } : undefined
}

/** Ein gespeichertes Datum als ISO-Zeitpunkt — Unlesbares fällt weg. */
export function ldDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined
}

/**
 * Entfernt leere Angaben (undefined, null, '') auf oberster Ebene: ein Feld,
 * das fehlt, ist für Suchmaschinen besser als ein leeres.
 */
export function ldCompact<T extends Record<string, unknown>>(graph: T): T {
  return Object.fromEntries(
    Object.entries(graph).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  ) as T
}
