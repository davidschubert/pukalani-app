import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * /api/health HÄLT DAS APPWRITE-ERGEBNIS 5 SEKUNDEN (BE-002).
 *
 * Die Route ist ohne Anmeldung erreichbar und darf keine 429 kennen
 * (Wächter, Deploy-Beweis, UptimeRobot) — die Bremse ist deshalb ein
 * Zwischenspeicher je Prozess. Gezählt wird hier, wie oft die Route Appwrite
 * wirklich fragt.
 */
const healthGet = vi.fn<() => Promise<{ status: string }>>()

vi.mock('../server/lib/appwrite', () => ({
  createAdminClient: () => ({ health: { get: healthGet } }),
}))

type Handler = (event: object) => Promise<{ ok: boolean, build: string | null }>
let handler: Handler

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-13T10:00:00Z'))
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { buildSha: 'abc1234' } }))
  healthGet.mockReset()
  healthGet.mockResolvedValue({ status: 'pass' })
  // Frisches Modul je Test: der Zwischenspeicher ist Modul-Zustand.
  vi.resetModules()
  handler = (await import('../server/api/health')).default as unknown as Handler
})

afterEach(() => {
  vi.useRealTimers()
})

describe('/api/health', () => {
  it('zwei Aufrufe innerhalb einer Sekunde ⇒ eine Abfrage', async () => {
    await handler({})
    vi.advanceTimersByTime(900)
    await handler({})
    expect(healthGet).toHaveBeenCalledTimes(1)
  })

  it('nach 5 Sekunden fragt sie neu', async () => {
    await handler({})
    vi.advanceTimersByTime(5_001)
    await handler({})
    expect(healthGet).toHaveBeenCalledTimes(2)
  })

  it('10 gleichzeitige Aufrufe teilen sich EINE laufende Abfrage', async () => {
    let resolve: (value: { status: string }) => void = () => {}
    healthGet.mockReturnValueOnce(new Promise(r => (resolve = r)))
    const calls = Array.from({ length: 10 }, () => handler({}))
    resolve({ status: 'pass' })
    const results = await Promise.all(calls)
    expect(healthGet).toHaveBeenCalledTimes(1)
    expect(results.every(r => r.ok)).toBe(true)
  })

  it('eine Abfrage, die nie endet, blockiert spätere Aufrufe nicht für immer', async () => {
    healthGet.mockReturnValueOnce(new Promise(() => {}))
    void handler({})
    vi.advanceTimersByTime(9_000)
    void handler({})
    // Innerhalb der Frist teilen sich beide die hängende Abfrage.
    expect(healthGet).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1_001)
    expect((await handler({})).ok).toBe(true)
    expect(healthGet).toHaveBeenCalledTimes(2)
  })

  it('antwortet ohne `user`, mit `ok` und `build`', async () => {
    const body = await handler({ context: { user: { $id: 'u1' } } })
    expect(body).toEqual({ ok: true, build: 'abc1234' })
    expect(body).not.toHaveProperty('user')
  })

  it('`build` wird nicht zwischengespeichert', async () => {
    await handler({})
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { buildSha: 'def5678' } }))
    expect((await handler({})).build).toBe('def5678')
    expect(healthGet).toHaveBeenCalledTimes(1)
  })

  it('meldet einen nicht gesunden Status als ok:false', async () => {
    healthGet.mockResolvedValueOnce({ status: 'fail' })
    expect((await handler({})).ok).toBe(false)
  })

  it('ein Fehlschlag wird gehalten und weitergegeben — Appwrite wird nicht bei jedem Aufruf neu getroffen', async () => {
    healthGet.mockRejectedValueOnce(new Error('502'))
    await expect(handler({})).rejects.toThrow('502')
    vi.advanceTimersByTime(1_000)
    await expect(handler({})).rejects.toThrow('502')
    expect(healthGet).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5_001)
    expect((await handler({})).ok).toBe(true)
    expect(healthGet).toHaveBeenCalledTimes(2)
  })
})
