import type { H3Event } from 'h3'

/**
 * Frame-Ancestors-Registry (Embed-Vorarbeit E0): Standardmäßig bekommt JEDE
 * SSR-Seite `Content-Security-Policy: frame-ancestors 'self'` (Clickjacking-
 * Schutz für Login/Dashboard). Produkt-Layer mit framebaren Routen (z. B.
 * comments `/embed`) registrieren ihre Pfade hier per Nitro-Plugin — expliziter
 * Vertrag wie registerUserDataContributor, keine core→Produkt-Kopplung.
 * `X-Frame-Options` bleibt bewusst weg (CSP reicht; XFO kann frame-ancestors
 * nicht abbilden).
 */

export interface EmbeddableRoute {
  /** Pfad-Präfix OHNE Locale-Präfix (z. B. '/embed' matcht auch '/de/embed') */
  prefix: string
  /**
   * Erlaubte Einbetter-Origins zum Request-Zeitpunkt. Rückgabe:
   * `['*']` = jede Seite darf framen · Liste = Allowlist (zusätzlich zu
   * 'self') · leer = nur 'self' (z. B. Gate deaktiviert).
   * Darf async sein (E3: Registry-gespeiste Allowlist aus einer Table —
   * der Aufrufer cached selbst, z. B. per Microcache).
   */
  origins: (event: H3Event) => string[] | Promise<string[]>
}

const routes: EmbeddableRoute[] = []

export function registerEmbeddableRoute(route: EmbeddableRoute) {
  routes.push(route)
}

/**
 * DIE GEGENRICHTUNG: Pfade, die NIEMAND einbetten darf (`frame-ancestors
 * 'none'`) — die eigene Seite eingeschlossen.
 *
 * Der Default `'self'` ist für Login und Dashboard richtig, für ein geteiltes
 * Dokument nicht: `/brand/share/:token` (Brand-Foundation-Konzept §2.8) wird
 * an Fremde verschickt, und ein iframe drumherum ist die einfachste Art, es
 * als eigene Arbeit auszugeben. Über `registerEmbeddableRoute` liesse sich das
 * NICHT sagen — dessen leere Origin-Liste bedeutet „nur 'self'", also das
 * Gegenteil von „niemand".
 *
 * WARUM HIER UND NICHT IN DER SEITE: `security-headers.ts` setzt den Kopf im
 * `render:response`-Hook und überschreibt dabei jeden Wert, den eine Route
 * oder eine Middleware vorher gesetzt hat. Eine Seite, die sich selbst enger
 * stellen wollte, verlöre also stillschweigend gegen den Default — zwei
 * Wahrheiten, von denen die falsche gewinnt. Deshalb gibt es genau EINE
 * Stelle, an der der Wert entsteht, und sie kennt beide Richtungen.
 */
const denied: string[] = []

export function registerFrameDeniedRoute(prefix: string) {
  denied.push(prefix)
}

/** Locale-Präfix (de, en-US, …) abstreifen — i18n prefix_except_default. */
function stripLocale(pathname: string): string {
  return pathname.replace(/^\/[a-z]{2}(?:-[A-Z]{2})?(?=\/)/, '')
}

/** Deckt das Präfix diesen Pfad? Gleicher Pfad, Unterpfad oder Query dahinter. */
function covers(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)
}

/** Wert für `frame-ancestors` zum Pfad — Default `'self'`. */
export async function resolveFrameAncestors(event: H3Event, pathname: string): Promise<string> {
  const path = stripLocale(pathname)
  // VERBOT ZUERST: ein Pfad, der beides trägt, bleibt zu. Die teure Richtung
  // des Zweifels ist hier die richtige — eine Erlaubnis, die man vergisst,
  // kostet einen Klick, ein Verbot, das man verliert, kostet das Dokument.
  if (denied.some(prefix => covers(path, prefix))) return `'none'`
  const match = routes.find(r => covers(path, r.prefix))
  if (!match) return `'self'`
  const origins = await match.origins(event)
  if (origins.includes('*')) return '*'
  // Nur http(s)-Origins zulassen — die Liste landet unescaped im CSP-Header.
  // ':*' als Port-Wildcard ist gültige CSP-host-source (Dev/E2E: localhost:*).
  const safe = origins.filter(o => /^https?:\/\/[\w.[\]-]+(:(\d+|\*))?$/.test(o))
  return safe.length ? `'self' ${safe.join(' ')}` : `'self'`
}
