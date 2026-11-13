import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CSRF_ORIGINLESS_CALLERS,
  CSRF_ORIGIN_EXEMPT_ROUTES,
  isCsrfOriginExempt,
  type CsrfOriginExemptRoute,
} from '../shared/csrfOriginExempt'

/**
 * SEC-004: Ausnahmen von der Herkunftsprüfung sind einzelne Routen mit Grund,
 * kein Schalter. Hier: der Abgleich (exakt, je Segment, fail-closed) und die
 * Middleware selbst — inklusive des Falls, an dem die SSR-Falle hängt
 * (`sec-fetch-site: cross-site` ohne Origin auf POST ⇒ 403).
 */

const ENTRY: CsrfOriginExemptRoute = {
  method: 'POST',
  path: '/api/test/:id/ping',
  reason: 'Testeintrag: fremder Browser ruft mit signiertem Token im Rumpf, ohne Cookie.',
}

describe('isCsrfOriginExempt — die echte Liste', () => {
  it('ist heute leer', () => {
    expect(CSRF_ORIGIN_EXEMPT_ROUTES).toEqual([])
  })

  it('leere Liste ⇒ nie eine Ausnahme', () => {
    for (const [method, path] of [
      ['POST', '/api/stripe/webhook'],
      ['POST', '/api/community/invites/preview'],
      ['DELETE', '/api/auth/sessions/abc'],
      ['PUT', '/api/auth/profile'],
    ] as const) {
      expect(isCsrfOriginExempt(method, path), `${method} ${path}`).toBe(false)
    }
  })
})

describe('isCsrfOriginExempt — mit Testeintrag', () => {
  const routes = [ENTRY]

  it('exakter Treffer mit Platzhalter ⇒ ja', () => {
    expect(isCsrfOriginExempt('POST', '/api/test/abc123/ping', routes)).toBe(true)
    expect(isCsrfOriginExempt('post', '/api/test/abc123/ping', routes)).toBe(true)
  })

  it('Präfix, Anhang, Schrägstrich am Ende ⇒ nein', () => {
    expect(isCsrfOriginExempt('POST', '/api/test/abc123', routes)).toBe(false)
    expect(isCsrfOriginExempt('POST', '/api/test/abc123/ping/more', routes)).toBe(false)
    expect(isCsrfOriginExempt('POST', '/api/test/abc123/ping/', routes)).toBe(false)
    expect(isCsrfOriginExempt('POST', '/api/test/abc123/pingx', routes)).toBe(false)
    expect(isCsrfOriginExempt('POST', '/api/test/a/b/ping', routes)).toBe(false)
  })

  it('andere Methode ⇒ nein (auch GET: die Prüfung fasst sichere Methoden nicht an)', () => {
    expect(isCsrfOriginExempt('PUT', '/api/test/abc123/ping', routes)).toBe(false)
    expect(isCsrfOriginExempt('DELETE', '/api/test/abc123/ping', routes)).toBe(false)
    expect(isCsrfOriginExempt('GET', '/api/test/abc123/ping', routes)).toBe(false)
  })

  it('Platzhalter steht nie für nichts oder für einen Pfad-Sprung', () => {
    expect(isCsrfOriginExempt('POST', '/api/test//ping', routes)).toBe(false)
    expect(isCsrfOriginExempt('POST', '/api/test/../ping', routes)).toBe(false)
    expect(isCsrfOriginExempt('POST', '/api/test/./ping', routes)).toBe(false)
  })

  it('Query im Pfad oder Pfad außerhalb /api/ ⇒ nein', () => {
    expect(isCsrfOriginExempt('POST', '/api/test/abc/ping?x=1', routes)).toBe(false)
    expect(isCsrfOriginExempt('POST', '/test/abc/ping', routes)).toBe(false)
  })

  it('Eintrag ohne Grund oder außerhalb /api/ stellt nichts frei (fail-closed)', () => {
    expect(isCsrfOriginExempt('POST', '/api/test/abc/ping', [{ ...ENTRY, reason: '  ' }])).toBe(false)
    expect(isCsrfOriginExempt('POST', '/x/test/abc/ping', [{ ...ENTRY, path: '/x/test/:id/ping' }])).toBe(false)
  })
})

describe('CSRF_ORIGINLESS_CALLERS — Form der Bestandsliste', () => {
  it('jede Klasse hat Id, Aufrufer, Ausweis, Merkmale und Grund', () => {
    expect(CSRF_ORIGINLESS_CALLERS.length).toBeGreaterThan(0)
    const ids = new Set<string>()
    for (const c of CSRF_ORIGINLESS_CALLERS) {
      expect(ids.has(c.id), c.id).toBe(false)
      ids.add(c.id)
      expect(c.caller.length, c.id).toBeGreaterThan(5)
      expect(c.credential.length, c.id).toBeGreaterThan(5)
      expect(c.reason.length, c.id).toBeGreaterThan(5)
      expect(c.markers.length, c.id).toBeGreaterThan(0)
    }
  })
})

// ── Die Middleware selbst ───────────────────────────────────────────────────

interface FakeEvent {
  method: string
  url: string
  headers: Record<string, string>
}
type Thrown = { statusCode?: number }

let middleware: (event: FakeEvent) => unknown

beforeEach(async () => {
  // Bewusst KEIN `useAppConfig`-Stub: die Prüfung hat seit Stufe 2 keinen
  // Schalter mehr. Läse die Middleware die App-Config, schlüge der Aufruf
  // hier mit „useAppConfig is not defined" fehl.
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('getRequestURL', (event: FakeEvent) => new URL(event.url))
  vi.stubGlobal('getHeader', (event: FakeEvent, name: string) => event.headers[name])
  vi.stubGlobal('createError', (init: { status: number, statusText: string }) =>
    Object.assign(new Error(init.statusText), { statusCode: init.status }))
  vi.resetModules()
  middleware = (await import('../server/middleware/03.csrf-origin')).default as unknown as typeof middleware
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function run(event: FakeEvent): Thrown | null {
  try {
    middleware(event)
    return null
  }
  catch (error) {
    return error as Thrown
  }
}

const HOST = 'https://kunde-a.pukalani.app'

describe('03.csrf-origin — die SSR-Falle', () => {
  it('interner POST beim Rendern einer Seite, die über einen Link aus Webmail kam ⇒ 403', () => {
    // Nuxt reicht beim SSR die Kopfzeilen der Navigation durch: sec-fetch-site
    // der SEITE, aber kein Origin (eine GET-Navigation hat keinen).
    const thrown = run({
      method: 'POST',
      url: `${HOST}/api/community/invites/preview`,
      headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' },
    })
    expect(thrown?.statusCode).toBe(403)
  })

  it('…ebenso über einen Link von einer anderen Subdomain (same-site ohne Origin) ⇒ 403', () => {
    const thrown = run({
      method: 'POST',
      url: `${HOST}/api/brand/invite/check`,
      headers: { 'sec-fetch-site': 'same-site' },
    })
    expect(thrown?.statusCode).toBe(403)
  })

  it('Gegenprobe: derselbe Aufruf aus dem Browser (same-origin) ⇒ durch', () => {
    expect(run({
      method: 'POST',
      url: `${HOST}/api/community/invites/preview`,
      headers: { 'sec-fetch-site': 'same-origin', 'origin': HOST },
    })).toBeNull()
  })

  it('Gegenprobe: Server-zu-Server ohne Browser-Kopfzeilen ⇒ durch', () => {
    expect(run({ method: 'POST', url: `${HOST}/api/stripe/webhook`, headers: {} })).toBeNull()
  })

  it('GET wird nie geprüft, Pfade außerhalb /api/ auch nicht', () => {
    expect(run({ method: 'GET', url: `${HOST}/api/x`, headers: { 'sec-fetch-site': 'cross-site' } })).toBeNull()
    expect(run({ method: 'POST', url: `${HOST}/join`, headers: { 'sec-fetch-site': 'cross-site' } })).toBeNull()
  })

})

describe('03.csrf-origin — überall an, kein Schalter (Stufe 2)', () => {
  it('lehnt OHNE jede App-Config ab: cross-site ⇒ 403', () => {
    const thrown = run({
      method: 'POST',
      url: `${HOST}/api/x`,
      headers: { 'sec-fetch-site': 'cross-site', 'origin': 'https://fremd.example' },
    })
    expect(thrown?.statusCode).toBe(403)
  })
})
