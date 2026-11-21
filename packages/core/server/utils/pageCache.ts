import type { H3Event } from 'h3'
import { createMicrocache } from './microcache'
import {
  PAGE_CACHE_HEADER,
  PAGE_CACHE_MAX_ENTRIES,
  PAGE_CACHE_TTL_MS,
  onlyLocaleSetCookies,
  pageCacheBucket,
  pageCacheKey,
  pageCachePathEligible,
  storableHeaders,
  type PageCacheI18n,
  type PageCacheLocale,
  type StoredHeaders,
} from '../../shared/pageCache'

/**
 * SEITEN KURZ FERTIG HALTEN — der Speicher (Q22, R3). Regeln und Begründung:
 * `shared/pageCache.ts`. Drei Stellen greifen zusammen:
 *  1. `server/middleware/11.page-cache.ts` bestimmt den Schlüssel und liefert
 *     einen Treffer aus (läuft NACH allen Weiterleitungen der Middleware);
 *  2. `app/plugins/page-cache.server.ts` sagt nach dem Rendern, ob die SEITE
 *     gehalten werden darf (Layout, `definePageMeta({ pageCache: false })`),
 *     die Bot-Prüfung (`AuthTurnstileWidget`) sperrt jede Seite, auf der sie
 *     im SSR steht;
 *  3. `server/plugins/page-cache.ts` legt die fertige Antwort ab — erst
 *     NACH dem Senden, wenn alle Kopfzeilen (Schutz-Kopfzeilen,
 *     `cache-control`, `Set-Cookie`) feststehen.
 * Der Speicher ist je Prozess (pm2 fährt je App eine Instanz); nach einem
 * Neustart ist er leer — harmlos.
 */
interface CachedPage {
  body: string
  headers: StoredHeaders
}

const pages = createMicrocache<CachedPage>(PAGE_CACHE_TTL_MS, PAGE_CACHE_MAX_ENTRIES)

/** Nur für Tests: Speicher leeren. */
export function clearPageCache(): void {
  pages.clear()
}

interface RuntimeI18n {
  locales?: PageCacheLocale[]
  detectBrowserLanguage?: false | { useCookie?: boolean, cookieKey?: string }
}

/** Sprachen und Sprach-Cookie der App, wie das i18n-Modul sie zur Laufzeit kennt. */
export function pageCacheI18nFromConfig(i18n: RuntimeI18n | undefined): PageCacheI18n {
  const detect = i18n?.detectBrowserLanguage
  const cookieKey = detect && detect.useCookie !== false ? (detect.cookieKey ?? 'i18n_redirected') : ''
  return { locales: (i18n?.locales ?? []).map(l => ({ code: l.code, language: l.language })), cookieKey }
}

/**
 * Middleware-Teil: gibt den gehaltenen HTML-Text zurück (Treffer) oder
 * `undefined` (dann rendert Nuxt, und `event.context.pageCacheKey` merkt
 * sich, wohin das Ergebnis darf).
 */
export function pageCacheLookup(event: H3Event, i18n: PageCacheI18n): string | undefined {
  if (event.method !== 'GET') return undefined
  const path = event.path
  if (!pageCachePathEligible(path)) return undefined
  const bucket = pageCacheBucket({
    cookieHeader: getRequestHeader(event, 'cookie'),
    acceptLanguage: getRequestHeader(event, 'accept-language'),
    i18n,
  })
  if (bucket === null) return undefined
  const origin = `${getRequestProtocol(event)}://${getRequestHost(event, { xForwardedHost: false })}`
  const key = pageCacheKey(origin, path, bucket)
  const hit = pages.get(key)
  if (!hit) {
    event.context.pageCacheKey = key
    event.context.pageCacheCookieKey = i18n.cookieKey
    return undefined
  }
  for (const [name, value] of Object.entries(hit.headers)) setResponseHeader(event, name, value)
  setResponseHeader(event, PAGE_CACHE_HEADER, 'HIT')
  return hit.body
}

/** Darf die gerade gerenderte Antwort gehalten werden? (vor dem Senden) */
export function pageCacheWillStore(event: H3Event, statusCode: number | undefined): boolean {
  return Boolean(event.context.pageCacheKey)
    && event.context.pageCacheEligible === true
    && event.context.pageCacheBlocked !== true
    && (statusCode ?? 200) === 200
}

/** Nach dem Senden: fertige Antwort ablegen, wenn sie alle Bedingungen erfüllt. */
export function pageCacheRemember(event: H3Event, body: unknown): boolean {
  const key = event.context.pageCacheKey
  if (!key || typeof body !== 'string') return false
  const res = event.node.res
  if (!pageCacheWillStore(event, res.statusCode)) return false
  if (!String(res.getHeader('content-type') ?? '').includes('text/html')) return false
  const raw = res.getHeader('set-cookie')
  const setCookies = raw === undefined ? [] : Array.isArray(raw) ? raw : [String(raw)]
  if (!onlyLocaleSetCookies(setCookies, event.context.pageCacheCookieKey ?? '')) return false
  pages.set(key, { body, headers: storableHeaders(res.getHeaders()) })
  return true
}
