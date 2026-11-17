import { test, expect, type APIResponse } from '@playwright/test'

/**
 * SCHUTZ-KOPFZEILEN AN ECHTEN ANTWORTEN (SEC-006).
 *
 * Der Unit-Test (`packages/core/tests/securityHeaders.test.ts`) prüft die
 * Haken an einer nachgebauten h3-App; hier zählt, was die ECHTE App
 * ausliefert — mit Nuxts Renderer, Nitros Datei-Auslieferung und allen
 * Middlewares davor. Gezählt wird über `headersArray()`: `headers()` fasst
 * doppelte Kopfzeilen zu einer zusammen und sähe einen Doppelten nie.
 *
 * HSTS fehlt hier mit Absicht: die Suite fährt gegen `localhost`, und dort
 * bleibt HSTS aus (`isLocalRequestHost`).
 *
 * DEV ODER BUILD: die Suite läuft gegen den Dev-Server (auch in der CI,
 * `.claude/rules/tests.md`); die beobachtende Skript-CSP sendet aber nur ein
 * Build. Der Test liest deshalb aus dem HTML, wogegen er läuft (Vites
 * Client-Skript steht nur im Dev-HTML), und prüft für BEIDE Fälle eine
 * Aussage — fehlt sie im Dev, ist das ebenso eine Zusage wie ihr Dasein im
 * Build.
 */

const BASE = ['x-content-type-options', 'referrer-policy', 'permissions-policy'] as const
const EMBED = '/embed?targetId=e2e-embed-smoke&targetType=blog'

function values(res: APIResponse, name: string): string[] {
  return res.headersArray().filter(h => h.name.toLowerCase() === name).map(h => h.value)
}

function expectBaseOnce(res: APIResponse, label: string) {
  for (const name of BASE) expect(values(res, name), `${label}: ${name}`).toHaveLength(1)
  expect(values(res, 'x-content-type-options')[0]).toBe('nosniff')
  expect(values(res, 'referrer-policy')[0]).toBe('strict-origin-when-cross-origin')
  expect(values(res, 'permissions-policy')[0]).toBe('camera=(), microphone=(), geolocation=()')
  expect(values(res, 'x-powered-by'), `${label}: x-powered-by`).toEqual([])
  expect(values(res, 'strict-transport-security'), `${label}: HSTS auf localhost`).toEqual([])
}

test.describe('Schutz-Kopfzeilen (SEC-006)', () => {
  test('Startseite: Basis je einmal, frame-ancestors self, kein XFO, Skript-CSP nur im Build', async ({ request }) => {
    const res = await request.get('/')
    expect(res.status()).toBe(200)
    expectBaseOnce(res, '/')
    expect(values(res, 'x-frame-options')).toEqual([])
    expect(values(res, 'content-security-policy')).toEqual([`frame-ancestors 'self'`])

    const html = await res.text()
    const reportOnly = values(res, 'content-security-policy-report-only')
    if (html.includes('/@vite/client')) {
      expect(reportOnly, 'Dev-Server: keine Skript-CSP').toEqual([])
    }
    else {
      expect(reportOnly).toHaveLength(1)
      expect(reportOnly[0]).toMatch(/^script-src 'self' 'unsafe-inline'/)
      expect(reportOnly[0]).toContain('https://challenges.cloudflare.com')
      // Seit SE1 a nennt die Regel ihre eigene Annahme-Route (relativ).
      expect(reportOnly[0]).toMatch(/; report-uri \/api\/telemetry\/csp-report$/)
    }
  })

  test('API (/api/health): Basis je einmal, kein frame-ancestors', async ({ request }) => {
    const res = await request.get('/api/health')
    expectBaseOnce(res, '/api/health')
    expect(values(res, 'content-security-policy')).toEqual([])
    expect(values(res, 'x-frame-options')).toEqual([])
  })

  /**
   * DATEIEN LIEFERT IM DEV-SERVER NICHT NITRO AUS (gemessen 2026-11-16): die
   * public-Dateien und `/_nuxt/*` beantwortet dort der Dev-Server davor, der
   * `request`-Haken läuft für sie gar nicht. Im Build ist es Nitro selbst —
   * dort tragen sie die Kopfzeilen. Der Dev-Zweig hält deshalb nur fest, dass
   * die Dateien kommen und nichts doppelt ist; die Zusage für den Build prüft
   * dieser Test, sobald er gegen einen Build läuft, und täglich der Blick des
   * Produktions-Wächters an den echten Hosts.
   */
  test('Dateien: public-Datei und ein Skript aus /_nuxt/', async ({ request }) => {
    const html = await (await request.get('/')).text()
    const dev = html.includes('/@vite/client')
    const asset = /(?:src|href)="(\/_nuxt\/[^"]+)"/.exec(html)?.[1]
    expect(asset, 'ein /_nuxt/-Verweis im HTML').toBeTruthy()

    for (const path of ['/embed.js', asset!]) {
      const file = await request.get(path)
      expect(file.status(), path).toBe(200)
      expect(values(file, 'x-frame-options'), path).toEqual([])
      if (dev) {
        for (const name of BASE) expect(values(file, name).length, `${path}: ${name} höchstens einmal`).toBeLessThanOrEqual(1)
      }
      else {
        expectBaseOnce(file, path)
      }
    }
  })

  test('Embed erlaubt: /embed ist für die Einbetter framebar, ohne XFO', async ({ request }) => {
    const res = await request.get(EMBED)
    expect(res.status()).toBe(200)
    expectBaseOnce(res, '/embed')
    expect(values(res, 'x-frame-options')).toEqual([])
    const csp = values(res, 'content-security-policy')
    expect(csp).toHaveLength(1)
    // Dieselbe Erlaubnis wie in embed.spec.ts (statische Dev-Liste localhost:*).
    expect(csp[0]).toContain('http://localhost:*')
  })

  test('Embed nicht erlaubt: fremde Einbetter und alle anderen Seiten bleiben draußen', async ({ request }) => {
    const embed = values(await request.get(EMBED), 'content-security-policy')[0] ?? ''
    expect(embed).not.toMatch(/frame-ancestors \*(\s|;|$)/)
    expect(embed).not.toContain('evil.example')

    const login = await request.get('/login')
    expectBaseOnce(login, '/login')
    expect(values(login, 'content-security-policy')).toEqual([`frame-ancestors 'self'`])
  })
})
