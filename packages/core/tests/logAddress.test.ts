import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { scrubClientErrorReport, stripAddressForLog, stripAddressesInText } from '../shared/logAddress'

/**
 * ADRESSEN IM PROTOKOLL: OHNE QUERY, OHNE FRAGMENT (SEC-013).
 *
 * Geprüft wird die Rechnung selbst und die drei Stellen, die sie benutzen
 * müssen: die Fehler-Annahme, das Browser-Plugin davor, die zentrale 5xx-Zeile.
 */
const MARK = 'nur-fuer-den-empfaenger'

describe('stripAddressForLog', () => {
  it.each([
    [`/reset?id=1&key=${MARK}`, '/reset'],
    [`/seite#${MARK}`, '/seite'],
    [`https://example.org/a/b?x=${MARK}#${MARK}`, 'https://example.org/a/b'],
    [`https://name:${MARK}@example.org/a`, 'https://example.org/a'],
    ['/nur/ein/pfad', '/nur/ein/pfad'],
    ['  /mit/leerzeichen  ', '/mit/leerzeichen'],
    ['', ''],
  ])('%s ⇒ %s', (input, expected) => {
    expect(stripAddressForLog(input)).toBe(expected)
  })

  it('klemmt die Länge', () => {
    expect(stripAddressForLog(`/${'a'.repeat(2000)}`)).toHaveLength(512)
  })
})

describe('stripAddressesInText', () => {
  it('kürzt Adressen in einer Meldung, lässt den Satz stehen', () => {
    const text = `[GET] "/api/x?key=${MARK}": 500 — und https://example.org/y?z=${MARK}#${MARK} auch`
    const out = stripAddressesInText(text)
    expect(out).not.toContain(MARK)
    expect(out).toContain('"/api/x"')
    expect(out).toContain('https://example.org/y auch')
  })

  it('kürzt Adressen in einem Stack, Zeile und Spalte bleiben', () => {
    const stack = `Error: x\n    at f (https://example.org/_nuxt/a.js?v=${MARK}:12:3)\n    at g (/_nuxt/b.js:4:1)`
    const out = stripAddressesInText(stack)
    expect(out).not.toContain(MARK)
    expect(out).toContain('/_nuxt/b.js:4:1')
  })

  it('ein Fragezeichen im Satz ist keine Adresse', () => {
    expect(stripAddressesInText('Warum? Darum.')).toBe('Warum? Darum.')
  })
})

describe('scrubClientErrorReport', () => {
  it('lässt in keinem Feld etwas hinter ? oder # stehen und klemmt die Längen', () => {
    const out = scrubClientErrorReport({
      source: 's'.repeat(100),
      message: `kaputt bei /a?key=${MARK} ${'m'.repeat(3000)}`,
      stack: `at /b?key=${MARK}\n${'s'.repeat(9000)}`,
      url: `https://example.org/c?key=${MARK}#${MARK}`,
    })
    expect(JSON.stringify(out)).not.toContain(MARK)
    expect(out.url).toBe('https://example.org/c')
    expect(out.source).toHaveLength(64)
    expect(out.message.length).toBeLessThanOrEqual(2000)
    expect(out.stack!.length).toBeLessThanOrEqual(8000)
  })

  it('fehlende Felder bleiben weg', () => {
    expect(scrubClientErrorReport({ source: 'vue', message: 'x' })).toEqual({ source: 'vue', message: 'x' })
  })
})

describe('POST /api/telemetry/error', () => {
  const logged = vi.fn<(level: string, name: string, data: Record<string, unknown>) => void>()
  type Handler = (event: object) => Promise<{ ok: boolean }>
  let handler: Handler
  let body: unknown

  beforeEach(async () => {
    logged.mockReset()
    vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
    vi.stubGlobal('useAppConfig', () => ({ pukalani: { observability: { enabled: true, clientErrors: true } } }))
    vi.stubGlobal('createError', (input: { status: number, statusText: string }) => Object.assign(new Error(input.statusText), input))
    vi.stubGlobal('readValidatedBody', async (_event: object, parse: (value: unknown) => unknown) => parse(body))
    vi.stubGlobal('logEvent', logged)
    vi.resetModules()
    handler = (await import('../server/api/telemetry/error.post')).default as unknown as Handler
  })

  it('schreibt die gemeldete Adresse ohne Query und Fragment ins Protokoll', async () => {
    body = {
      source: 'promise',
      message: `[GET] "/api/x?key=${MARK}": 500`,
      stack: `at https://example.org/_nuxt/a.js?v=${MARK}:1:1`,
      url: `/seite?id=7&key=${MARK}#${MARK}`,
    }
    await expect(handler({ context: {} })).resolves.toEqual({ ok: true })

    expect(logged).toHaveBeenCalledTimes(1)
    const [, name, data] = logged.mock.calls[0]!
    expect(name).toBe('client.error')
    expect(data.url).toBe('/seite')
    expect(JSON.stringify(data)).not.toContain(MARK)
  })
})

describe('die drei Schreiber benutzen die eine Rechnung', () => {
  const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

  it('zentrale 5xx-Zeile: der Pfad geht gekürzt ins Protokoll', () => {
    const source = read('../server/error.ts')
    expect(source).toContain('stripAddressForLog(event.path')
    expect(source).not.toMatch(/shapeErrorLog\(error, \{ path: event\.path\b/)
  })

  it('Browser-Plugin: Meldung und Stack werden vor dem Senden gekürzt, die Adresse ist nur der Pfad', () => {
    const source = read('../app/plugins/observability-errors.client.ts')
    expect(source).toContain('stripAddressesInText(message)')
    expect(source).toContain('stripAddressesInText(stack')
    expect(source).toContain('url: window.location.pathname')
  })
})
