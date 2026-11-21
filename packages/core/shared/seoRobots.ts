/**
 * SEITEN, DIE NICHT IN EINE SUCHE GEHÖREN (Q10, SEO-007) — die EINE Regel, pur.
 *
 * Bis hierher vergab jede Seite ihr `noindex` selbst, wo jemand daran dachte
 * (Entwürfe, Token-Seiten). Die Konto-Seiten des Fundaments, der Kundenbereich
 * und die Betreiber-Konsole hatten keines: Anmeldeformulare standen als
 * Treffer in der Suche, je Community vier dünne Seiten.
 *
 * Drei Gründe, eine Antwort (`noindex, follow`):
 *   1. die Seite ist eine KONTO-Seite — Layout `auth` (Anmelden, Registrieren,
 *      Code, Passwort) oder ausdrücklich `seoNoindex` in ihrer `definePageMeta`
 *      (Seiten ohne dieses Layout, etwa die Bestätigung per Mail-Link);
 *   2. der Host ist ein KONTROLL-Host (Kundenbereich): dort liegt nichts, was
 *      gefunden werden soll;
 *   3. die App nennt eine Liste `pukalani.seo.indexOnly` — dann darf NUR in
 *      die Suche, was dort steht (Betreiber-Oberfläche: nur das Changelog).
 *
 * `follow` und nicht `nofollow`: die Seiten verlinken auf Startseite und
 * Rechtstexte, und diese Verweise sollen zählen. Das strengere
 * `noindex, nofollow` einer geschlossenen Community (C18, U15) gewinnt im
 * Kopf vor dieser Regel.
 *
 * WICHTIG, sonst wirkungslos: die `robots.txt` des Hosts darf diese Seiten
 * nicht sperren — eine gesperrte Seite liest kein Crawler, ihr `noindex`
 * sieht er nie (Q04, `apps/control/server/routes/robots.txt.get.ts`).
 */
export const ROBOTS_NOINDEX_FOLLOW = 'noindex, follow'

export interface RouteRobotsInput {
  /** `route.meta.layout` */
  layout?: unknown
  /** `route.meta.seoNoindex` */
  seoNoindex?: unknown
  /** Antwortet hier ein Kontroll-Host (Kundenbereich)? */
  controlHost: boolean
  /** Pfad der Seite OHNE Sprach-Vorsatz (`/changelog`, nie `/de/changelog`). */
  path: string
  /** `pukalani.seo.indexOnly` — fehlt oder leer = keine Einschränkung. */
  indexOnly?: readonly string[] | null
}

/** Den Sprach-Vorsatz von einem Pfad nehmen: `/de/login` ⇒ `/login`, `/de` ⇒ `/`. */
export function stripLocalePrefix(path: string, localeCodes: readonly string[]): string {
  for (const code of localeCodes) {
    if (path === `/${code}`) return '/'
    if (path.startsWith(`/${code}/`)) return path.slice(code.length + 1)
  }
  return path
}

function matchesIndexOnly(path: string, allowed: readonly string[]): boolean {
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path
  return allowed.some(entry => clean === entry || clean.startsWith(`${entry}/`))
}

/** Das robots-Signal dieser Seite — `null` heißt „nichts stempeln". */
export function routeRobots(input: RouteRobotsInput): string | null {
  if (input.layout === 'auth' || input.seoNoindex === true) return ROBOTS_NOINDEX_FOLLOW
  if (input.controlHost) return ROBOTS_NOINDEX_FOLLOW
  const allowed = Array.isArray(input.indexOnly) ? input.indexOnly.filter(entry => typeof entry === 'string' && entry.startsWith('/')) : []
  if (allowed.length > 0 && !matchesIndexOnly(input.path, allowed)) return ROBOTS_NOINDEX_FOLLOW
  return null
}
