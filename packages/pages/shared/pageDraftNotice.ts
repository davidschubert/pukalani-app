/**
 * „ENTWURF, IN ANWALTLICHER PRÜFUNG" AUF EINER CMS-SEITE (BS1 R1, Davids
 * Entscheidung 7 vom 2026-09-07 — docs/plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md).
 *
 * ── DAS PROBLEM, DAS ES OHNE DIESE ZEILEN NICHT GÄBE ─────────────────────
 * Dieser Layer kennt genau zwei Zustände: `draft` (die Seite ist nicht
 * öffentlich, die Route antwortet 404) und `published` (sie ist da). Für die
 * Rechtsseiten von branding.supply reicht das nicht: das AGB-Häkchen im
 * Registrierformular VERLINKT die Seite — sie muss erreichbar sein —, und
 * gleichzeitig ist ihr Text ein Entwurf, der noch keinem Anwalt vorlag.
 * Ein 404 hinter dem Häkchen wäre schlechter als ein ehrlicher Entwurf.
 *
 * Der dritte Zustand ist deshalb bewusst KEINE neue Spalte und keine
 * Migration, sondern eine ANSAGE der App über ihre eigenen Seiten:
 * `pukalani.pages.draftNotice: ['imprint', 'privacy', 'terms']`. Sie kostet
 * kein Schema, sie ist im Review sichtbar, und sie verschwindet in R3 mit
 * EINER Zeile — genau dann, wenn der geprüfte Text eingesetzt ist.
 *
 * ── WAS DER HINWEIS AUSLÖST ──────────────────────────────────────────────
 *  1. Ein Kasten als ERSTER Block der Seite, nicht als Kleingedrucktes
 *     (Muster: `apps/marketing/app/components/LegalPage.vue`).
 *  2. `robots: noindex, follow` — ein Impressums-Platzhalter im Suchindex
 *     wäre schlimmer als keiner. `follow`, damit die Links der Seite weiter
 *     zählen; sie zeigen auf echte Inhalte.
 *
 * ── FAIL-CLOSED IN DIE SICHTBARE RICHTUNG ────────────────────────────────
 * Bei einer kaputten oder fehlenden Config passiert NICHTS (leere Liste = kein
 * Hinweis) — das ist der Core-Default und der Zustand jeder App, die diesen
 * Layer heute schon fährt (portfolio, control, platform). Sie sollen von
 * dieser Änderung nichts sehen. Wer den Hinweis WILL, sagt es ausdrücklich.
 */

/** Ist für diesen Slug der Entwurfs-Hinweis angesagt? Pur — ohne Nuxt prüfbar. */
export function pageHasDraftNotice(raw: unknown, slug: string): boolean {
  if (!Array.isArray(raw) || !slug) return false
  return raw.some(entry => typeof entry === 'string' && entry.trim() === slug)
}

/** Der robots-Wert einer Entwurfs-Seite — dieselbe Ansage wie in `apps/marketing`. */
export const PAGE_DRAFT_ROBOTS = 'noindex, follow'
