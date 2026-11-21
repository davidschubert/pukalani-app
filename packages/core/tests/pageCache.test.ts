import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { H3Event } from 'h3'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  PAGE_CACHE_TTL_MS,
  findBrowserLocaleLikeI18n,
  onlyLocaleSetCookies,
  pageCacheBucket,
  pageCachePathEligible,
  pageEligibleForCache,
  parseAcceptLanguageLikeI18n,
  type PageCacheI18n,
} from '../shared/pageCache'

/**
 * SEITEN KURZ FERTIG HALTEN (Q22, R3). Zwei Hälften: die puren Regeln (mit
 * einem Vergleich gegen die ORIGINAL-Erkennung des i18n-Moduls), und der
 * Speicher an einer echten h3-App mit echtem HTTP-Server — Nachbau von
 * Middleware → Render → `afterResponse` wie in Nitro.
 */

type H3 = typeof import('h3')

const fromHere = createRequire(import.meta.url)

async function loadH3(): Promise<H3> {
  const fromNuxt = createRequire(fromHere.resolve('nuxt/package.json'))
  const fromNitroServer = createRequire(fromNuxt.resolve('@nuxt/nitro-server/package.json'))
  const mod = await import(pathToFileURL(fromNitroServer.resolve('h3')).href) as H3 & { default?: H3 }
  return typeof mod.createApp === 'function' ? mod : mod.default!
}

const I18N: PageCacheI18n = {
  locales: [{ code: 'de', language: 'de-DE' }, { code: 'en', language: 'en-US' }],
  cookieKey: 'pukalani-lang',
}

describe('Erkennung wie das i18n-Modul', () => {
  it('liefert für jede Kopfzeile dasselbe wie findBrowserLocale + parseAcceptLanguage im Original', async () => {
    const i18nDir = fromHere.resolve('@nuxtjs/i18n/package.json').replace(/package\.json$/, '')
    const original = await import(pathToFileURL(`${i18nDir}dist/runtime/kit/browser.js`).href) as {
      findBrowserLocale: (locales: Array<{ code: string, language?: string }>, browser: readonly string[]) => string
    }
    const fromI18n = createRequire(`${i18nDir}package.json`)
    const intlify = await import(pathToFileURL(fromI18n.resolve('@intlify/utils')).href) as {
      parseAcceptLanguage: (value: string) => string[]
    }
    const headers = [
      '', '*', 'de', 'en', 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7', 'en-US,en;q=0.9', 'fr-FR,fr;q=0.9',
      'fr, de;q=0.8', 'fr,de-AT;q=0.5,en;q=0.4', 'de-CH', 'EN-gb', ' de', 'de , en', 'x-klingon',
      'zh-Hant-TW,zh;q=0.9,en;q=0.1', ';q=0.5', ',,,', 'de;q=0.1,en;q=0.9', 'pt-BR,de-DE',
    ]
    for (const header of headers) {
      const expected = original.findBrowserLocale(I18N.locales, intlify.parseAcceptLanguage(header))
      expect(findBrowserLocaleLikeI18n(I18N.locales, parseAcceptLanguageLikeI18n(header)), header).toBe(expected)
    }
  })
})

describe('pageCacheBucket', () => {
  it('ohne Cookie: Eimer nach erkannter Browser-Sprache', () => {
    expect(pageCacheBucket({ acceptLanguage: 'de-DE,de;q=0.9', i18n: I18N })).toBe('header:de')
    expect(pageCacheBucket({ acceptLanguage: 'en-US', i18n: I18N })).toBe('header:en')
    expect(pageCacheBucket({ acceptLanguage: 'fr', i18n: I18N })).toBe('header:-')
    expect(pageCacheBucket({ i18n: I18N })).toBe('header:-')
  })

  it('Sprach-Cookie schlägt die Kopfzeile (wie im Modul) und bleibt ein eigener Eimer', () => {
    expect(pageCacheBucket({ cookieHeader: 'pukalani-lang=de', acceptLanguage: 'en', i18n: I18N })).toBe('cookie:de')
  })

  it('GEGENPROBE: jeder andere Cookie und ein unbekannter Sprachwert sperren den Speicher', () => {
    expect(pageCacheBucket({ cookieHeader: 'a_session_account=abc', i18n: I18N })).toBeNull()
    expect(pageCacheBucket({ cookieHeader: 'pukalani-lang=de; a_session_account=abc', i18n: I18N })).toBeNull()
    expect(pageCacheBucket({ cookieHeader: 'pk_consent=1', i18n: I18N })).toBeNull()
    expect(pageCacheBucket({ cookieHeader: 'pukalani-lang=fr', i18n: I18N })).toBeNull()
    expect(pageCacheBucket({ cookieHeader: 'pukalani-lang=de', i18n: { ...I18N, cookieKey: '' } })).toBeNull()
  })
})

describe('Pfad, Set-Cookie, Seite', () => {
  it('nur Seiten-Pfade ohne Abfrage', () => {
    expect(pageCachePathEligible('/de')).toBe(true)
    expect(pageCachePathEligible('/de/faq')).toBe(true)
    for (const p of ['/de?x=1', '/api/health', '/_nuxt/a.js', '/__nuxt_error', '/_i18n/x/de/messages.json', 'de']) {
      expect(pageCachePathEligible(p), p).toBe(false)
    }
  })

  it('nur der Sprach-Cookie darf gesetzt werden', () => {
    expect(onlyLocaleSetCookies([], 'pukalani-lang')).toBe(true)
    expect(onlyLocaleSetCookies(['pukalani-lang=de; Path=/'], 'pukalani-lang')).toBe(true)
    expect(onlyLocaleSetCookies(['pukalani-lang=de; Path=/', 'pk_known_device=x'], 'pukalani-lang')).toBe(false)
    expect(onlyLocaleSetCookies(['a_session_account=x'], 'pukalani-lang')).toBe(false)
    expect(onlyLocaleSetCookies(['pukalani-lang-evil=x'], 'pukalani-lang')).toBe(false)
  })

  it('Layout und Seiten-Meta; Core-Default aus', () => {
    expect(pageEligibleForCache(undefined, {})).toBe(false)
    expect(pageEligibleForCache({ enabled: false }, {})).toBe(false)
    expect(pageEligibleForCache({ enabled: true }, {})).toBe(true)
    expect(pageEligibleForCache({ enabled: true }, { pageCache: false })).toBe(false)
    expect(pageEligibleForCache({ enabled: true, layouts: ['site'] }, { layout: 'site' })).toBe(true)
    expect(pageEligibleForCache({ enabled: true, layouts: ['site'] }, {})).toBe(false)
    expect(pageEligibleForCache({ enabled: true, layouts: ['site'] }, { layout: 'dashboard' })).toBe(false)
  })
})

describe('Speicher an einer echten h3-App', () => {
  let server: Server
  let base: string
  let renders = 0
  let clock = 1_000_000

  beforeAll(async () => {
    const h3 = await loadH3()
    vi.stubGlobal('getRequestHeader', h3.getRequestHeader)
    vi.stubGlobal('getRequestProtocol', h3.getRequestProtocol)
    vi.stubGlobal('getRequestHost', h3.getRequestHost)
    vi.stubGlobal('setResponseHeader', h3.setResponseHeader)
    vi.spyOn(Date, 'now').mockImplementation(() => clock)
    const { pageCacheLookup, pageCacheRemember, pageCacheWillStore } = await import('../server/utils/pageCache')

    const app = h3.createApp({
      onAfterResponse: (event, response) => {
        pageCacheRemember(event, response?.body)
      },
    })
    // Middleware 11.page-cache.ts
    app.use(h3.eventHandler(event => pageCacheLookup(event, I18N)))
    // Nachbau des Renderers: Nuxt-Plugin (app:rendered) setzt `pageCacheEligible`,
    // die Bot-Prüfung `pageCacheBlocked`; der Renderer setzt Kopfzeilen am Event.
    app.use(h3.eventHandler((event: H3Event) => {
      renders += 1
      const path = event.path
      const locale = path.startsWith('/de') ? 'de' : 'en'
      if (!path.startsWith('/dashboard')) event.context.pageCacheEligible = true
      if (path.startsWith('/bot')) event.context.pageCacheBlocked = true
      const status = path.startsWith('/fehlt') ? 404 : 200
      h3.setResponseStatus(event, status)
      h3.setResponseHeader(event, 'content-type', 'text/html;charset=utf-8')
      h3.setResponseHeader(event, 'cache-control', 'no-cache')
      const cookies = [`pukalani-lang=${locale}; Path=/; SameSite=Lax`]
      if (path.startsWith('/merkt')) cookies.push('pk_known_device=x; Path=/; HttpOnly')
      h3.setResponseHeader(event, 'set-cookie', cookies)
      if (pageCacheWillStore(event, status)) h3.setResponseHeader(event, 'x-page-cache', 'MISS')
      return `<html lang="${locale}">render ${renders}</html>`
    }))

    server = createServer(h3.toNodeListener(app))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterEach(async () => {
    const { clearPageCache } = await import('../server/utils/pageCache')
    clearPageCache()
    renders = 0
    clock += 10 * PAGE_CACHE_TTL_MS
  })

  afterAll(async () => {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /** Roher HTTP-Abruf: `fetch` lässt die Host-Kopfzeile nicht setzen. */
  async function get(path: string, headers: Record<string, string> = {}, method = 'GET') {
    const url = new URL(base)
    const result = await new Promise<{ status: number, body: string, cache: string | null, setCookie: string[] }>((resolve, reject) => {
      const req = httpRequest({
        host: url.hostname,
        port: url.port,
        path,
        method,
        headers: { 'accept-language': 'de-DE,de;q=0.9', ...headers },
      }, (res: IncomingMessage) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => { body += chunk })
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          body,
          cache: (res.headers['x-page-cache'] as string | undefined) ?? null,
          setCookie: res.headers['set-cookie'] ?? [],
        }))
      })
      req.on('error', reject)
      req.end()
    })
    // Nach dem Senden legt `onAfterResponse` ab — einen Takt warten.
    await new Promise(resolve => setTimeout(resolve, 5))
    return result
  }

  it('zweiter Abruf kommt aus dem Speicher — gleicher Inhalt, Sprach-Cookie wieder gesetzt', async () => {
    const first = await get('/de')
    const second = await get('/de')
    expect(first.cache).toBe('MISS')
    expect(second.cache).toBe('HIT')
    expect(second.body).toBe(first.body)
    expect(second.setCookie).toEqual(['pukalani-lang=de; Path=/; SameSite=Lax'])
    expect(renders).toBe(1)
  })

  it('GEGENPROBE: mit Sitzungs-Cookie wird nie aus dem Speicher bedient und nie abgelegt', async () => {
    await get('/de')
    const withSession = await get('/de', { cookie: 'a_session_account=geheim' })
    expect(withSession.cache).toBeNull()
    expect(renders).toBe(2)
    // … und was ein angemeldeter Abruf rendert, landet nicht im Speicher:
    clock += 2 * PAGE_CACHE_TTL_MS
    await get('/de/faq', { cookie: 'a_session_account=geheim' })
    const guest = await get('/de/faq')
    expect(guest.cache).toBe('MISS')
    expect(renders).toBe(4)
  })

  it('GEGENPROBE: eine Antwort, die einen anderen Cookie setzt, wird nicht gehalten', async () => {
    await get('/merkt')
    const again = await get('/merkt')
    expect(again.cache).not.toBe('HIT')
    expect(renders).toBe(2)
  })

  it('nach 60 Sekunden wird frisch gerechnet', async () => {
    await get('/de')
    // Feste Zahl, nicht die Konstante (Beweis-Regel 1): 60 s sind Davids Wert (R3).
    clock += 60_000 - 1
    expect((await get('/de')).cache).toBe('HIT')
    clock += 2
    expect((await get('/de')).cache).toBe('MISS')
    expect(renders).toBe(2)
  })

  it('getrennt je Sprache, je Sprach-Cookie und je Host', async () => {
    const de = await get('/de', { 'accept-language': 'de' })
    const en = await get('/de', { 'accept-language': 'en-US' })
    const cookie = await get('/de', { cookie: 'pukalani-lang=de' })
    const otherHost = await get('/de', { 'accept-language': 'de', 'host': 'help.example.test' })
    expect([de.cache, en.cache, cookie.cache, otherHost.cache]).toEqual(['MISS', 'MISS', 'MISS', 'MISS'])
    expect(renders).toBe(4)
    expect((await get('/de', { 'accept-language': 'en-US' })).cache).toBe('HIT')
    expect((await get('/de', { cookie: 'pukalani-lang=de' })).cache).toBe('HIT')
    expect(renders).toBe(4)
  })

  it('GEGENPROBE: Fehlerseite, Bot-Prüfung, nicht freigegebene Seite, Abfrage und POST bleiben frisch', async () => {
    for (const [path, method] of [['/fehlt', 'GET'], ['/bot', 'GET'], ['/dashboard', 'GET'], ['/de?x=1', 'GET'], ['/de', 'POST']] as const) {
      await get(path, {}, method)
      const again = await get(path, {}, method)
      expect(again.cache, `${method} ${path}`).not.toBe('HIT')
    }
    expect(renders).toBe(10)
  })
})
