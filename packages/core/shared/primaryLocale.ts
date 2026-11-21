/**
 * DIE HAUPTSPRACHE EINER COMMUNITY (Q10, Davids Entscheidung B1 vom
 * 2026-11-21) — die EINE Regel, pur.
 *
 * ── WORUM ES GEHT ────────────────────────────────────────────────────────
 * Jede Seite hat eine englische Adresse (ohne Vorsatz) und eine deutsche
 * (`/de/…`). Für Seiten mit eigenem Text je Sprache stimmt das. Ein Beitrag
 * von Nutzern (Diskussion, Kurs, Termin) hat aber EINEN Text: unter der
 * zweiten Adresse wechseln nur Menü und Knöpfe. Suchmaschinen bekamen damit
 * zwei fast gleiche Seiten, als Übersetzungen voneinander gemeldet.
 *
 * Jede Community hat deshalb eine Hauptsprache. Die Adresse in dieser Sprache
 * ist für Nutzerinhalte die maßgebliche (`canonical`), die andere verweist
 * dorthin und meldet keine Sprachfassung mehr.
 *
 * ── DIE VORGABE FÜR COMMUNITIES OHNE WAHL ────────────────────────────────
 * Die Grundsprache der App (`en`, die Adresse OHNE Vorsatz). Das ist die
 * Adresse, die bis hierher schon als `x-default` galt und die jeder geteilte
 * Link ohne Sprach-Vorsatz trägt — für eine Community, die nichts gewählt
 * hat, ändert sich an der maßgeblichen Adresse also nichts, es fällt nur die
 * zweite weg. Raten (aus dem Inhalt, aus dem Browser des ersten Besuchers)
 * wäre von Abruf zu Abruf verschieden, und eine Adresse, die heute so und
 * morgen anders maßgeblich ist, ist schlimmer als die falsche.
 *
 * Liegt in `shared/`, weil drei Seiten dieselbe Antwort brauchen: der Kopf
 * (Browser und SSR), die Sitemap (Server) und der Resolver im Control Plane.
 */

/** Die Sprachen, die eine Community als Hauptsprache wählen kann. */
export const PRIMARY_LOCALES = ['en', 'de'] as const
export type PrimaryLocale = typeof PRIMARY_LOCALES[number]

/** Die Vorgabe ohne eigene Wahl — die Grundsprache der App (s. Kopf). */
export const DEFAULT_PRIMARY_LOCALE: PrimaryLocale = 'en'

/** Nur ein bekannter Code zählt als Wahl; alles andere ist „nicht gewählt". */
export function parsePrimaryLocale(raw: unknown): PrimaryLocale | null {
  return typeof raw === 'string' && (PRIMARY_LOCALES as readonly string[]).includes(raw)
    ? raw as PrimaryLocale
    : null
}

/** Die Hauptsprache, mit der gerechnet wird: die Wahl, sonst die Vorgabe. */
export function resolvePrimaryLocale(raw: unknown): PrimaryLocale {
  return parsePrimaryLocale(raw) ?? DEFAULT_PRIMARY_LOCALE
}

/**
 * Der Pfad EINER Seite in der Hauptsprache: `/events/x` ⇒ `/de/events/x` für
 * `de`, unverändert für die Grundsprache (Strategie `prefix_except_default`).
 * Für die Sitemap, die ohne Vue-Kontext baut.
 */
export function primaryLocalePath(path: string, locale: PrimaryLocale): string {
  if (locale === DEFAULT_PRIMARY_LOCALE) return path
  return path === '/' ? `/${locale}` : `/${locale}${path}`
}
