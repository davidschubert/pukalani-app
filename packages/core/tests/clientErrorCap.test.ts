import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLIENT_ERROR_CAP_MAX, CLIENT_ERROR_CAP_WINDOW_MS, createClientErrorCap } from '../server/utils/clientErrorCap'

/**
 * DECKEL DER BROWSER-FEHLER-ANNAHME (OPS-011): höchstens 120 angenommene
 * Zeilen je Stunde und Prozess über alle IPs. Darüber bleibt die Antwort
 * gleich, geschrieben wird nichts, gemeldet EINMAL je Fenster.
 */

describe('createClientErrorCap', () => {
  it('nimmt bis max an, meldet dann genau einmal und verwirft danach still', () => {
    let t = 1_000_000
    const cap = createClientErrorCap({ max: 3, windowMs: 1000, now: () => t })
    expect([cap.take(), cap.take(), cap.take()]).toEqual(['accept', 'accept', 'accept'])
    expect(cap.take()).toBe('cap')
    expect([cap.take(), cap.take()]).toEqual(['drop', 'drop'])

    t += 999
    expect(cap.take()).toBe('drop')
  })

  it('ein neues Fenster setzt Zähler UND Meldung zurück', () => {
    let t = 0
    const cap = createClientErrorCap({ max: 1, windowMs: 1000, now: () => t })
    expect(cap.take()).toBe('accept')
    expect(cap.take()).toBe('cap')
    t = 1000
    expect(cap.take()).toBe('accept')
    expect(cap.take()).toBe('cap')
    expect(cap.take()).toBe('drop')
  })

  it('die festen Werte: 120 je Stunde', () => {
    expect(CLIENT_ERROR_CAP_MAX).toBe(120)
    expect(CLIENT_ERROR_CAP_WINDOW_MS).toBe(60 * 60 * 1000)
  })
})

describe('POST /api/telemetry/error mit Deckel', () => {
  const logged = vi.fn<(level: string, name: string, data: Record<string, unknown>) => void>()
  type Handler = (event: object) => Promise<{ ok: boolean }>
  let handler: Handler

  beforeEach(async () => {
    logged.mockReset()
    vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
    vi.stubGlobal('useAppConfig', () => ({ pukalani: { observability: { enabled: true, clientErrors: true } } }))
    vi.stubGlobal('createError', (input: { status: number, statusText: string }) => Object.assign(new Error(input.statusText), input))
    vi.stubGlobal('readValidatedBody', async (_event: object, parse: (value: unknown) => unknown) => parse({ source: 'vue', message: 'x' }))
    vi.stubGlobal('logEvent', logged)
    // Frischer Modul-Stand ⇒ frischer Zähler je Test.
    vi.resetModules()
    handler = (await import('../server/api/telemetry/error.post')).default as unknown as Handler
  })

  it('schreibt 120 Zeilen, dann einmal die Deckel-Zeile, danach nichts — die Antwort bleibt ok', async () => {
    for (let i = 0; i < CLIENT_ERROR_CAP_MAX + 30; i++) {
      await expect(handler({ context: {} })).resolves.toEqual({ ok: true })
    }
    const names = logged.mock.calls.map(([, name]) => name)
    expect(names.filter(name => name === 'client.error')).toHaveLength(CLIENT_ERROR_CAP_MAX)
    expect(logged.mock.calls.filter(([, name]) => name === 'telemetry.client_error_capped')).toEqual([
      ['warn', 'telemetry.client_error_capped', { max: 120 }],
    ])
    expect(names).toHaveLength(CLIENT_ERROR_CAP_MAX + 1)
  })
})
