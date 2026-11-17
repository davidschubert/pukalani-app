import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { H3Event } from 'h3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  HSTS_MAX_AGE_SECONDS,
  TURNSTILE_SCRIPT_ORIGIN,
  baseSecurityHeaders,
  isLocalRequestHost,
  scriptCspReportOnly,
} from '../shared/securityHeaders'
import { analyticsScriptOrigins } from '../shared/analyticsScript'

/**
 * SCHUTZ-KOPFZEILEN AUS EINER STELLE (SEC-006).
 *
 * Zwei Hälften: die puren Regeln, und die Haken des Plugins an einer ECHTEN
 * h3-App mit echtem HTTP-Server. Die zweite Hälfte ist der eigentliche
 * Beweis — „genau einmal" lässt sich nur an der rohen Antwort zählen
 * (`rawHeaders`), nicht an einem Objekt, das Doppelte schon zusammenfasst.
 *
 * h3 ist keine direkte Abhängigkeit des Core (Nitro bringt es mit); der Test
 * holt sich DIESELBE Kopie, die Nuxts Server-Paket benutzt, über die
 * Abhängigkeitskette statt über ein neues Paket.
 */

type H3 = typeof import('h3')

async function loadH3(): Promise<H3> {
  const fromHere = createRequire(import.meta.url)
  const fromNuxt = createRequire(fromHere.resolve('nuxt/package.json'))
  const fromNitroServer = createRequire(fromNuxt.resolve('@nuxt/nitro-server/package.json'))
  const mod = await import(pathToFileURL(fromNitroServer.resolve('h3')).href) as H3 & { default?: H3 }
  return typeof mod.createApp === 'function' ? mod : mod.default!
}

describe('isLocalRequestHost', () => {
  it('lokale Namen — mit und ohne Port', () => {
    for (const host of [
      'localhost', 'localhost:3000', '127.0.0.1', '127.0.0.1:8080', '[::1]', '[::1]:3001',
      'kunde-a.localhost', 'kunde-a.localhost:3150', 'app.test', 'x.app.test:443', 'LOCALHOST:3000',
    ]) {
      expect(isLocalRequestHost(host), host).toBe(true)
    }
  })

  it('leer oder fehlend gilt als lokal (interner Abruf ohne Host)', () => {
    for (const host of ['', '   ', undefined, null]) expect(isLocalRequestHost(host)).toBe(true)
  })

  it('GEGENPROBE: öffentliche Namen und Fast-Treffer sind nicht lokal', () => {
    for (const host of [
      'example.org', 'branding.supply', 'kunde.pukalani.app:443', 'localhost.example.org',
      'evil-localhost', 'mytest', 'test.example', '127.0.0.2', '[::2]',
    ]) {
      expect(isLocalRequestHost(host), host).toBe(false)
    }
  })
})

describe('baseSecurityHeaders', () => {
  it('fremder Host: drei Basis-Kopfzeilen und HSTS ohne includeSubDomains/preload', () => {
    const headers = baseSecurityHeaders('example.org')
    expect(headers).toEqual({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'strict-transport-security': `max-age=${HSTS_MAX_AGE_SECONDS}`,
    })
    expect(headers['strict-transport-security']).not.toMatch(/includeSubDomains|preload/i)
  })

  it('Stufe 2 ist ein Jahr (Stufe 1 war ein Tag)', () => {
    expect(HSTS_MAX_AGE_SECONDS).toBe(31536000)
  })

  it('lokaler Host: kein HSTS, der Rest bleibt', () => {
    const headers = baseSecurityHeaders('localhost:3000')
    expect(headers['strict-transport-security']).toBeUndefined()
    expect(headers['x-content-type-options']).toBe('nosniff')
  })

  it('`null` schaltet HSTS ab', () => {
    expect(baseSecurityHeaders('example.org', null)['strict-transport-security']).toBeUndefined()
  })

  it('kein x-frame-options — frame-ancestors ist die eine Stelle', () => {
    for (const host of ['example.org', 'localhost']) {
      expect(Object.keys(baseSecurityHeaders(host))).not.toContain('x-frame-options')
    }
  })
})

describe('scriptCspReportOnly', () => {
  it('self, unsafe-inline, die Origins; object-src und base-uri fest; Berichte an die eigene Route', () => {
    expect(scriptCspReportOnly(['https://challenges.cloudflare.com'])).toBe(
      `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; report-uri /api/telemetry/csp-report`,
    )
    // Relativ: der Bericht geht an den Host der Seite, nie an einen fremden.
    expect(scriptCspReportOnly([])).toMatch(/; report-uri \/api\/telemetry\/csp-report$/)
    expect(scriptCspReportOnly([])).not.toMatch(/report-to/)
  })

  it('nur http(s)-Origins kommen durch, Doppelte fallen weg', () => {
    const value = scriptCspReportOnly([
      'https://a.example', 'https://a.example', 'http://localhost:3000',
      'javascript:alert(1)', "https://x.example; script-src *", 'https://b.example/pfad', '*', '',
    ])
    expect(value).toBe(
      `script-src 'self' 'unsafe-inline' https://a.example http://localhost:3000; object-src 'none'; base-uri 'self'; report-uri /api/telemetry/csp-report`,
    )
  })
})

describe('fremde Skript-Quellen', () => {
  it('die Turnstile-Origin passt zur echten Skript-Adresse im Widget', () => {
    const source = readFileSync(new URL('../app/components/auth/TurnstileWidget.vue', import.meta.url), 'utf8')
    const scriptUrl = /const SCRIPT_URL = '([^']+)'/.exec(source)?.[1]
    expect(scriptUrl && new URL(scriptUrl).origin).toBe(TURNSTILE_SCRIPT_ORIGIN)
  })

  it('Analytics: Gate aus ⇒ nichts; sonst src, instance oder die Voreinstellung', () => {
    expect(analyticsScriptOrigins({ enabled: false, src: 'https://stats.example/js/pa-x.js' })).toEqual([])
    expect(analyticsScriptOrigins(undefined)).toEqual([])
    expect(analyticsScriptOrigins({ enabled: true, src: 'https://stats.example/js/pa-abcdefgh.js' }))
      .toEqual(['https://stats.example'])
    expect(analyticsScriptOrigins({ enabled: true, provider: 'plausible', src: '', instance: 'https://plausible.example/' }))
      .toEqual(['https://plausible.example', 'https://plausible.io'])
    expect(analyticsScriptOrigins({ enabled: true, provider: 'umami' })).toEqual(['https://cloud.umami.is'])
    expect(analyticsScriptOrigins({ enabled: true, src: '/api/stats-script.js?id=pa-x' }))
      .toEqual([])
  })
})

describe('Plugin-Haken an echten Antworten', () => {
  let server: Server
  let port: number
  let reportOnly = true

  beforeAll(async () => {
    const h3 = await loadH3()
    vi.stubGlobal('defineNitroPlugin', (fn: unknown) => fn)
    vi.stubGlobal('getHeader', h3.getHeader)
    vi.stubGlobal('setResponseHeaders', h3.setResponseHeaders)
    vi.stubGlobal('removeResponseHeader', h3.removeResponseHeader)
    vi.stubGlobal('getRequestURL', h3.getRequestURL)
    vi.stubGlobal('useAppConfig', () => ({ pukalani: { analytics: { enabled: false } } }))
    const plugin = await import('../server/plugins/security-headers')

    const app = h3.createApp({
      onRequest: event => plugin.applyBaseSecurityHeaders(event),
      // Wie core/server/error.ts für /api (JSON) und Nitros HTML-Fehlerseite
      // sonst — die setzt selbst nosniff, referrer-policy und x-frame-options.
      onError: async (error, event) => {
        const status = h3.isError(error) ? error.statusCode : 500
        h3.setResponseStatus(event, status)
        if (event.path.startsWith('/api/')) {
          h3.setResponseHeader(event, 'content-type', 'application/json; charset=utf-8')
          await h3.send(event, JSON.stringify({ ok: false }))
          return
        }
        h3.setResponseHeaders(event, {
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'DENY',
          'referrer-policy': 'no-referrer',
        })
        await h3.send(event, '<h1>Fehler</h1>', 'text/html')
      },
    })
    const router = h3.createRouter()
    router.get('/api/ping', h3.eventHandler(() => ({ ok: true })))
    router.get('/api/kaputt', h3.eventHandler(() => {
      throw h3.createError({ status: 500, statusText: 'Boom' })
    }))
    router.get('/seite-kaputt', h3.eventHandler(() => {
      throw h3.createError({ status: 404, statusText: 'Not found' })
    }))
    router.get('/streng', h3.eventHandler((event) => {
      h3.setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
      return 'streng'
    }))
    // Nachbau von Nitros `defineRenderHandler` + Nuxts Renderer: der Renderer
    // setzt seine Kopfzeilen AM EVENT, `response.headers` ist ein Abbild davon,
    // danach `render:response` und `setResponseHeaders(event, response.headers)`.
    const render = (event: H3Event) => {
      h3.setResponseHeader(event, 'content-type', 'text/html;charset=utf-8')
      h3.setResponseHeader(event, 'x-powered-by', 'Nuxt')
      const headers: Record<string, string> = {}
      for (const name of event.node.res.getHeaderNames()) headers[name] = String(event.node.res.getHeader(name))
      return { body: '<html></html>', headers }
    }
    const renderRoute = h3.eventHandler(async (event) => {
      const response = render(event)
      await plugin.applyDocumentSecurityHeaders(response, event, {
        reportOnly,
        extraScriptOrigins: [TURNSTILE_SCRIPT_ORIGIN],
      })
      h3.setResponseHeaders(event, response.headers)
      return response.body
    })
    router.get('/', renderRoute)
    router.get('/streng-seite', h3.eventHandler(async (event) => {
      // Eine Middleware hat VOR dem Render strenger gestellt (Newsletter-Token).
      h3.setResponseHeader(event, 'referrer-policy', 'no-referrer')
      return renderRoute(event)
    }))
    app.use(router)

    server = createServer(h3.toNodeListener(app))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })

  afterAll(async () => {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    vi.unstubAllGlobals()
  })

  /** Rohe Kopfzeilen — Name klein, je Zeile ein Eintrag, Doppelte bleiben doppelt. */
  function get(path: string, host: string): Promise<{ status: number, raw: Array<[string, string]> }> {
    return new Promise((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, path, headers: { host } }, (res: IncomingMessage) => {
        const raw: Array<[string, string]> = []
        for (let i = 0; i < res.rawHeaders.length; i += 2) raw.push([res.rawHeaders[i]!.toLowerCase(), res.rawHeaders[i + 1]!])
        res.resume()
        res.on('end', () => resolve({ status: res.statusCode ?? 0, raw }))
      })
      req.on('error', reject)
      req.end()
    })
  }

  function values(raw: Array<[string, string]>, name: string): string[] {
    return raw.filter(([n]) => n === name).map(([, v]) => v)
  }

  function expectEachOnce(raw: Array<[string, string]>, names: string[]) {
    for (const name of names) expect(values(raw, name), name).toHaveLength(1)
  }

  const BASE = ['x-content-type-options', 'referrer-policy', 'permissions-policy']

  it('API-Route, fremder Host: Basis + HSTS je genau einmal', async () => {
    const { status, raw } = await get('/api/ping', 'example.org')
    expect(status).toBe(200)
    expectEachOnce(raw, [...BASE, 'strict-transport-security'])
    expect(values(raw, 'strict-transport-security')).toEqual(['max-age=31536000'])
    expect(values(raw, 'x-frame-options')).toEqual([])
    // frame-ancestors gilt nur für Dokumente
    expect(values(raw, 'content-security-policy')).toEqual([])
  })

  it('lokaler Host: kein HSTS', async () => {
    const { raw } = await get('/api/ping', 'localhost:3000')
    expectEachOnce(raw, BASE)
    expect(values(raw, 'strict-transport-security')).toEqual([])
  })

  it('eine Route, die strenger sein will, gewinnt — einmal', async () => {
    const { raw } = await get('/streng', 'example.org')
    expect(values(raw, 'referrer-policy')).toEqual(['no-referrer'])
  })

  it('API-Fehler: Basis-Kopfzeilen bleiben, je einmal', async () => {
    const { status, raw } = await get('/api/kaputt', 'example.org')
    expect(status).toBe(500)
    expectEachOnce(raw, [...BASE, 'strict-transport-security'])
  })

  it('HTML-Fehlerseite: Nitros eigene Werte ersetzen, verdoppeln nicht', async () => {
    const { status, raw } = await get('/seite-kaputt', 'example.org')
    expect(status).toBe(404)
    expectEachOnce(raw, [...BASE, 'strict-transport-security'])
    expect(values(raw, 'referrer-policy')).toEqual(['no-referrer'])
  })

  it('SSR-Seite: frame-ancestors, Skript-CSP, kein x-powered-by, Basis je einmal', async () => {
    reportOnly = true
    const { raw } = await get('/', 'example.org')
    expectEachOnce(raw, [...BASE, 'strict-transport-security', 'content-security-policy', 'content-security-policy-report-only'])
    expect(values(raw, 'content-security-policy')).toEqual([`frame-ancestors 'self'`])
    expect(values(raw, 'content-security-policy-report-only')[0]).toContain(TURNSTILE_SCRIPT_ORIGIN)
    expect(values(raw, 'x-powered-by')).toEqual([])
    expect(values(raw, 'x-frame-options')).toEqual([])
  })

  it('SSR-Seite: was eine Middleware am Event strenger gesetzt hat, überlebt den Render-Haken', async () => {
    const { raw } = await get('/streng-seite', 'example.org')
    expect(values(raw, 'referrer-policy')).toEqual(['no-referrer'])
  })

  it('Dev-Server: keine Skript-CSP, frame-ancestors bleibt', async () => {
    reportOnly = false
    const { raw } = await get('/', 'localhost:3001')
    expect(values(raw, 'content-security-policy-report-only')).toEqual([])
    expect(values(raw, 'content-security-policy')).toEqual([`frame-ancestors 'self'`])
    expect(values(raw, 'strict-transport-security')).toEqual([])
    reportOnly = true
  })
})
