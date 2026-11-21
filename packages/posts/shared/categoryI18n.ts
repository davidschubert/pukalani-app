/**
 * KATEGORIE-NAMEN JE SPRACHE (Davids Entscheidung 2026-08-17).
 *
 * ── DAS MODELL, UND WARUM DIESES ──────────────────────────────────────────
 * Es gibt drei verbreitete Wege, und sie unterscheiden sich fast immer an der
 * ADRESSE, nicht am Namen:
 *
 *  1. gar nicht übersetzen (XenForo bis heute, Flarum, NodeBB — und Discourse
 *     bis 2025: der offizielle Leitfaden empfahl je Sprache eine eigene
 *     Kategorie, Sprach-Tags oder gleich getrennte Instanzen),
 *  2. Name + Beschreibung je Sprache, EINE Adresse (Invision Community seit
 *     4.0, Discourse seit „Content Localization"),
 *  3. volle Lokalisierung samt eigener Adresse je Sprache (Zendesk Guide,
 *     WPML).
 *
 * Wir bauen (2). Grund steht im Code: `/discussions/<slug>` ist die EINZIGE
 * Kennung einer Kategorie — sie trägt keine Id, über die ein alter Link sich
 * heilen könnte, deshalb ist der Slug nach der Anlage fest. Zwei Slugs je
 * Kategorie hieße zwei Adressen für EINE Sache: geteilte Links, doppelte
 * Inhalte, ein Kanonisierungs-Thema. Discourse kann sich (3) leisten, weil
 * dort die Id die Adresse trägt (`/c/<slug>/<id>`) und der Slug Kosmetik ist.
 *
 * ── DIE GRUNDFASSUNG IST KEINE SPRACHE ────────────────────────────────────
 * `name`/`description` auf der Zeile sind der Text, den jemand eingetippt hat
 * — ohne Etikett, in welcher Sprache. Es gibt deshalb bewusst KEIN Feld
 * „Ausgangssprache": es wäre eine Angabe, die niemand pflegt und die beim
 * ersten Irrtum die Anzeige verdreht. Die Übersetzungen sind ÜBERSCHREIBUNGEN
 * je Sprachcode; fehlt eine, gilt die Grundfassung. Damit ist der heutige
 * Zustand (nichts übersetzt) exakt das Verhalten von vorher.
 *
 * ── LEER HEISST „NICHT ÜBERSETZT", NIE „LEERER NAME" ──────────────────────
 * Ein leeres Feld fällt beim Speichern heraus statt als '' zu überleben.
 * Sonst hätte eine Kategorie in einer Sprache gar keinen Namen — und der
 * Unterschied zwischen „noch nicht übersetzt" und „absichtlich namenlos" ist
 * einer, den niemand treffen will.
 *
 * Aufgelöst wird im BROWSER, nicht auf dem Server: die Sprache steht in der
 * Adresse (`prefix_except_default`), und ein Umschalten soll die Namen sofort
 * ändern statt einen zweiten Abruf auszulösen. Ein `?locale=`-Parameter an
 * jeder Leseroute wäre außerdem eine Angabe, die eine künftige Aufrufstelle
 * vergessen KANN — und dann still die falsche Sprache zeigt.
 */

import { LOCALE_CODE_PATTERN } from '../../core/shared/ugcTranslations'

export interface CategoryTranslation {
  name?: string
  description?: string
}

/** Sprachcode → Überschreibung. Sprachcodes wie in @nuxtjs/i18n ('de', 'en'). */
export type CategoryTranslations = Record<string, CategoryTranslation>

/**
 * Ein plausibler Sprachcode ('de', 'en', 'pt-BR') — keine Liste, weil neue
 * App-Sprachen hier nichts zu ändern haben sollen.
 *
 * SEIT DEN UGC-ÜBERSETZUNGEN (2026-08-17) STEHT ER IN CORE und wird hier nur
 * weitergereicht: `comments` braucht dieselbe Form und darf `posts` nicht
 * kennen (A14). Zwei gleichlautende reguläre Ausdrücke wären genau die zweite
 * Wahrheit, die beim ersten Sprachcode mit drei Buchstaben auseinanderläuft.
 * Die bestehenden Aufrufstellen (Schemas, Formulare) holen ihn weiter von hier.
 */
export { LOCALE_CODE_PATTERN }

/**
 * JSON von der Zeile lesen. FAIL-SOFT: was sich nicht lesen lässt, gilt als
 * „nichts übersetzt" — eine kaputte Spalte darf keine Kategorie unsichtbar
 * machen. Unbekannte Formen (Zahlen, Arrays, fremde Felder) fallen still
 * heraus, statt sich später als `[object Object]` in einer Überschrift zu
 * zeigen.
 */
export function parseCategoryTranslations(raw: string | null | undefined): CategoryTranslations {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    return {}
  }
  return normalizeCategoryTranslations(parsed)
}

/** Beliebige Eingabe (JSON-Wert oder Formular-Objekt) → saubere Karte. */
export function normalizeCategoryTranslations(input: unknown): CategoryTranslations {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const out: CategoryTranslations = {}
  for (const [locale, value] of Object.entries(input as Record<string, unknown>)) {
    if (!LOCALE_CODE_PATTERN.test(locale)) continue
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const entry: CategoryTranslation = {}
    const { name, description } = value as { name?: unknown, description?: unknown }
    if (typeof name === 'string' && name.trim()) entry.name = name.trim()
    if (typeof description === 'string' && description.trim()) entry.description = description.trim()
    // Ein Eintrag ohne Inhalt ist kein Eintrag — siehe Kopf („leer heißt nicht
    // übersetzt"). So verschwindet eine geleerte Übersetzung beim Speichern
    // wirklich, statt als '' liegen zu bleiben.
    if (entry.name || entry.description) out[locale] = entry
  }
  return out
}

/** Karte → Spaltenwert. Leere Karte ⇒ '' (nicht '{}'), damit „nichts
 *  übersetzt" auch in der Datenbank leer aussieht. */
export function serializeCategoryTranslations(input: unknown): string {
  const clean = normalizeCategoryTranslations(input)
  return Object.keys(clean).length ? JSON.stringify(clean) : ''
}

export interface CategoryTextSource {
  name: string
  description: string
  /** JSON-Spalte; fehlt bei Zeilen aus der Zeit vor der Migration. */
  translations?: string
}

/**
 * Was in DIESER Sprache angezeigt wird. Feld für Feld: ein übersetzter Name
 * ohne übersetzte Beschreibung nimmt die Beschreibung der Grundfassung — sonst
 * wäre eine halb gepflegte Kategorie in einer Sprache stumm.
 */
export function categoryTextFor(category: CategoryTextSource, locale: string): { name: string, description: string } {
  const entry = parseCategoryTranslations(category.translations)[locale]
  return {
    name: entry?.name || category.name,
    description: entry?.description || category.description,
  }
}

/** Nur die Namen, je Sprache — das reicht Listen, die keine Beschreibung
 *  zeigen (Themen-Tabelle), und hält deren Antwort klein. */
export function categoryNamesByLocale(category: CategoryTextSource): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [locale, entry] of Object.entries(parseCategoryTranslations(category.translations))) {
    if (entry.name) out[locale] = entry.name
  }
  return out
}

/** Ein Name aus einer solchen Karte, mit der Grundfassung als Rückfall. */
export function localizedNameFrom(names: Record<string, string> | undefined, base: string, locale: string): string {
  return names?.[locale] || base
}

/**
 * Sucht der Mensch in der Verwaltung nach „General", soll er die Kategorie
 * auch finden, wenn sie „Allgemein" heißt. Deshalb sucht die Liste über ALLE
 * Sprachfassungen, nicht nur über die angezeigte.
 */
export function categorySearchHaystack(category: CategoryTextSource): string {
  const parts = [category.name, category.description]
  for (const entry of Object.values(parseCategoryTranslations(category.translations))) {
    if (entry.name) parts.push(entry.name)
    if (entry.description) parts.push(entry.description)
  }
  return parts.join(' ').toLowerCase()
}
