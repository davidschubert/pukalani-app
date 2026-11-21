/**
 * SEITEN KURZ FERTIG HALTEN — die reinen Regeln (Q22, PERF-009, Davids
 * Entscheidung R3 vom 2026-11-21, DECISION-LOG).
 *
 * Die Projektregel heißt „kein SSR-Seiten-SWR: Session-State steckt im HTML"
 * (`.claude/rules/mail-embed-moderation.md`, Microcache). Die AUSNAHME gilt
 * nur für Sites ohne Konten (Landing, Hilfe, öffentliche Studio-Seiten) und
 * ist im Core AUS (`pukalani.pageCache.enabled`). Was eine Antwort teilen
 * darf, entscheidet allein, was die ANFRAGE mitbringt — deshalb ist hier
 * alles streng:
 *
 *  - NUR Anfragen ohne Cookie, oder mit GENAU dem Sprach-Cookie der App.
 *    Jeder andere Cookie (Sitzung, Zustimmung, Erscheinungsbild …) heißt:
 *    vorbei am Speicher, frisch gerechnet. Kein Raten, welcher Cookie
 *    „harmlos" ist.
 *  - Der Schlüssel trägt Host, Pfad und die SPRACHE, die das i18n-Modul für
 *    diese Anfrage erkennen würde. Mit `redirectOn: 'all'` leitet das Modul
 *    nach Cookie oder Browser-Sprache um (302, hängt am einzelnen Besucher):
 *    zwei Besucher mit demselben Erkennungs-Ergebnis bekommen dieselbe
 *    Antwort, zwei mit verschiedenem nie dieselbe. Die Erkennung ist eine
 *    wörtliche Kopie von `findBrowserLocale` (@nuxtjs/i18n 10) und
 *    `parseAcceptLanguage` (@intlify/utils); ein Test vergleicht sie mit dem
 *    Original, damit ein Update die Kopie nicht still auseinanderlaufen lässt.
 *  - Gehalten wird nur eine Antwort, deren `Set-Cookie` höchstens den
 *    Sprach-Cookie setzt (das tut jede erste Seite — er ist eine Funktion
 *    von Pfad und Erkennung, also für alle im selben Eimer gleich).
 */

/** 60 Sekunden — Davids Zahl (R3). */
export const PAGE_CACHE_TTL_MS = 60_000

/** Obergrenze der Einträge je Prozess. Eine Landing-Seite wiegt ~210 KB. */
export const PAGE_CACHE_MAX_ENTRIES = 200

/** Kopfzeile, an der man von außen sieht, ob der Speicher geantwortet hat. */
export const PAGE_CACHE_HEADER = 'x-page-cache'

export interface PageCacheLocale {
  code: string
  language?: string
}

export interface PageCacheI18n {
  locales: PageCacheLocale[]
  /** Leer, wenn die App keinen Sprach-Cookie benutzt. */
  cookieKey: string
}

/** Wörtlich wie `parseAcceptLanguage` aus @intlify/utils 0.14 (kein Trimmen, keine q-Sortierung). */
export function parseAcceptLanguageLikeI18n(value: string): string[] {
  return value
    .split(',')
    .map(tag => tag.split(';')[0] ?? '')
    .filter(tag => !(tag === '*' || tag === ''))
}

/** Wörtlich wie `findBrowserLocale` aus @nuxtjs/i18n 10 (`runtime/kit/browser.js`). */
export function findBrowserLocaleLikeI18n(locales: PageCacheLocale[], browserLocales: readonly string[]): string {
  const normalized = locales.map(l => ({ code: l.code, language: l.language || l.code }))
  const matched: Array<{ code: string, score: number }> = []
  for (const [index, browserCode] of browserLocales.entries()) {
    const hit = normalized.find(l => l.language.toLowerCase() === browserCode.toLowerCase())
    if (hit) {
      matched.push({ code: hit.code, score: 1 - index / browserLocales.length })
      break
    }
  }
  for (const [index, browserCode] of browserLocales.entries()) {
    const languageCode = (browserCode.split('-')[0] ?? '').toLowerCase()
    const hit = normalized.find(l => (l.language.split('-')[0] ?? '').toLowerCase() === languageCode)
    if (hit) {
      matched.push({ code: hit.code, score: 0.999 - index / browserLocales.length })
      break
    }
  }
  matched.sort((a, b) => (a.score === b.score ? b.code.length - a.code.length : b.score - a.score))
  return matched[0]?.code ?? ''
}

/** Cookie-Kopfzeile in Namen → Wert. Ein Cookie ohne `=` zählt als Name ohne Wert. */
export function parseCookieHeader(header: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    const name = eq === -1 ? trimmed : trimmed.slice(0, eq).trim()
    const value = eq === -1 ? '' : trimmed.slice(eq + 1).trim()
    out.set(name, value)
  }
  return out
}

/**
 * Der Sprach-Eimer einer Anfrage — oder `null`, wenn sie den Speicher NICHT
 * benutzen darf (fremder Cookie, Sprach-Cookie mit unbekanntem Wert).
 * `cookie:de` und `header:de` bleiben getrennt: der eine Besucher bekommt
 * den Sprach-Cookie gesetzt, der andere hat ihn schon.
 */
export function pageCacheBucket(input: {
  cookieHeader?: string | null
  acceptLanguage?: string | null
  i18n: PageCacheI18n
}): string | null {
  const cookies = parseCookieHeader(input.cookieHeader ?? '')
  const { cookieKey, locales } = input.i18n
  for (const name of cookies.keys()) {
    if (!cookieKey || name !== cookieKey) return null
  }
  if (cookieKey && cookies.has(cookieKey)) {
    const value = cookies.get(cookieKey) ?? ''
    return locales.some(l => l.code === value) ? `cookie:${value}` : null
  }
  const header = findBrowserLocaleLikeI18n(locales, parseAcceptLanguageLikeI18n(input.acceptLanguage ?? ''))
  return `header:${header || '-'}`
}

/**
 * Darf dieser Pfad überhaupt in den Speicher? Keine Abfrage-Parameter (sonst
 * ließe sich der Speicher mit `?x=1…` füllen und leeren), keine API- und
 * keine Build-Pfade.
 */
export function pageCachePathEligible(pathWithSearch: string): boolean {
  if (!pathWithSearch.startsWith('/')) return false
  if (pathWithSearch.includes('?') || pathWithSearch.includes('#')) return false
  if (pathWithSearch.startsWith('/api/') || pathWithSearch === '/api') return false
  if (pathWithSearch.startsWith('/_')) return false
  return true
}

export function pageCacheKey(origin: string, path: string, bucket: string): string {
  return `${origin}${path}#${bucket}`
}

/** Setzt die Antwort NUR den Sprach-Cookie (oder gar keinen)? */
export function onlyLocaleSetCookies(setCookies: readonly string[], cookieKey: string): boolean {
  return setCookies.every(c => cookieKey !== '' && c.trimStart().startsWith(`${cookieKey}=`))
}

/** Kopfzeilen, die je Antwort neu entstehen und nie aus dem Speicher kommen. */
const VOLATILE_HEADERS = new Set([
  'date',
  'content-length',
  'content-encoding',
  'transfer-encoding',
  'connection',
  'keep-alive',
  PAGE_CACHE_HEADER,
])

export type StoredHeaders = Record<string, string | string[]>

export function storableHeaders(headers: Record<string, number | string | string[] | undefined>): StoredHeaders {
  const out: StoredHeaders = {}
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase()
    if (value === undefined || VOLATILE_HEADERS.has(lower)) continue
    out[lower] = Array.isArray(value) ? [...value] : String(value)
  }
  return out
}

export interface PageCacheGate {
  enabled?: boolean
  /** Leer = jede Seite der App; sonst nur Seiten mit einem dieser Layouts. */
  layouts?: readonly string[]
}

/**
 * Darf die gerade gerenderte Seite gehalten werden? Läuft im Nuxt-Teil
 * (`app:rendered`), weil nur der Router Layout und Seiten-Meta kennt.
 */
export function pageEligibleForCache(gate: PageCacheGate | undefined, meta: { layout?: unknown, pageCache?: unknown }): boolean {
  if (!gate?.enabled) return false
  if (meta.pageCache === false) return false
  const layout = typeof meta.layout === 'string' ? meta.layout : 'default'
  if (gate.layouts && gate.layouts.length > 0 && !gate.layouts.includes(layout)) return false
  return true
}
