import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isExpectedMiss, resetSoftFailThrottle, shapeSoftFail, softFail, softFailWith } from '../server/utils/softFail'

/** Ein Fehler in der Form der Appwrite-SDK-Ausnahme (`code` Zahl, `type` Text). */
function appwriteError(code: number, type: string, message = 'Row with the requested ID 6650aa could not be found.') {
  return Object.assign(new Error(message), { name: 'AppwriteException', code, type })
}

function lines(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown>[] {
  return spy.mock.calls.map(call => JSON.parse(String(call[0])) as Record<string, unknown>)
}

describe('softFail', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetSoftFailThrottle()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T10:00:00Z'))
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('ein Lesefehler wird protokolliert, der Ersatzwert bleibt', async () => {
    const result = await Promise.reject(appwriteError(500, 'general_unknown')).catch(softFail('posts:utils/x:listRows', []))
    expect(result).toEqual([])
    expect(lines(warn)).toEqual([expect.objectContaining({
      level: 'warn',
      event: 'soft_fail',
      where: 'posts:utils/x:listRows',
      status: 500,
      type: 'general_unknown',
      name: 'AppwriteException',
    })])
  })

  it('die Meldung des Fehlers steht nie in der Zeile', async () => {
    await Promise.reject(appwriteError(500, 'general_unknown', 'geheim user 6650aa mail@example.org')).catch(softFail('a:b:c', null))
    expect(String(warn.mock.calls[0]?.[0])).not.toContain('geheim')
    expect(String(warn.mock.calls[0]?.[0])).not.toContain('6650aa')
    expect(Object.keys(lines(warn)[0] ?? {}).sort()).toEqual(['event', 'level', 'name', 'status', 'time', 'type', 'where'])
  })

  it('404 für eine fehlende Zeile ist ein erwarteter Fehlgriff: kein Protokoll, derselbe Ersatzwert', async () => {
    const result = await Promise.reject(appwriteError(404, 'row_not_found')).catch(softFail('a:b:getRow', null))
    expect(result).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })

  it('404 der Datentür (H3-Fehler) ist ebenfalls still', async () => {
    const error = Object.assign(new Error('Not found'), { statusCode: 404 })
    await Promise.reject(error).catch(softFail('a:b:get', null))
    expect(warn).not.toHaveBeenCalled()
  })

  it('404 für eine fehlende TABELLE oder SPALTE ist kein Fehlgriff — das steht im Protokoll', async () => {
    for (const type of ['table_not_found', 'collection_not_found', 'column_not_found', 'database_not_found', 'storage_bucket_not_found']) {
      resetSoftFailThrottle()
      await Promise.reject(appwriteError(404, type)).catch(softFail('a:b:listRows', []))
    }
    expect(lines(warn).map(line => line.type)).toEqual(['table_not_found', 'collection_not_found', 'column_not_found', 'database_not_found', 'storage_bucket_not_found'])
  })

  it('eine fehlende Datei im Zwischenspeicher (ENOENT) ist still, ein anderer Systemfehler nicht', async () => {
    await Promise.reject(Object.assign(new Error('no such file'), { code: 'ENOENT' })).catch(softFail('a:b:readFile', null))
    expect(warn).not.toHaveBeenCalled()
    await Promise.reject(Object.assign(new Error('denied'), { code: 'EACCES' })).catch(softFail('a:b:readFile', null))
    expect(lines(warn)).toEqual([expect.objectContaining({ where: 'a:b:readFile', status: 0, code: 'EACCES' })])
  })

  it('`quiet` nennt, was an dieser Stelle erwartet ist — alles andere bleibt laut', async () => {
    const guest = softFail('core:api/auth/x:getSession', null, { quiet: [401] })
    expect(await Promise.reject(appwriteError(401, 'general_unauthorized_scope')).catch(guest)).toBeNull()
    expect(warn).not.toHaveBeenCalled()
    await Promise.reject(appwriteError(503, 'general_server_error')).catch(guest)
    expect(lines(warn)).toEqual([expect.objectContaining({ status: 503 })])
  })

  it('ein Wert, der kein Fehler-Objekt ist, wird ohne Inhalt protokolliert', async () => {
    await Promise.reject('user 6650aa kaputt').catch(softFail('a:b:c', 0))
    expect(lines(warn)).toEqual([expect.objectContaining({ where: 'a:b:c', status: 0 })])
    expect(String(warn.mock.calls[0]?.[0])).not.toContain('6650aa')
  })

  it('die Bremse: je Kennung eine Zeile je Minute, die nächste zählt das Verschluckte mit', async () => {
    const handler = softFail('a:b:hot', 0)
    for (let i = 0; i < 5; i++) await Promise.reject(appwriteError(500, 'general_unknown')).catch(handler)
    expect(warn).toHaveBeenCalledTimes(1)
    // eine ANDERE Kennung bremst das nicht
    await Promise.reject(appwriteError(500, 'general_unknown')).catch(softFail('a:b:other', 0))
    expect(warn).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(60_001)
    await Promise.reject(appwriteError(500, 'general_unknown')).catch(handler)
    expect(warn).toHaveBeenCalledTimes(3)
    expect(lines(warn)[2]).toMatchObject({ where: 'a:b:hot', repeated: 4 })
  })

  it('softFailWith berechnet den Ersatz erst im Fehlerfall — und auch beim stillen Fehlgriff', async () => {
    const fallback = vi.fn(() => 'zweiter Weg')
    expect(await Promise.resolve('erster Weg').catch(softFailWith('a:b:c', fallback))).toBe('erster Weg')
    expect(fallback).not.toHaveBeenCalled()
    expect(await Promise.reject(appwriteError(500, 'general_unknown')).catch(softFailWith('a:b:c', fallback))).toBe('zweiter Weg')
    expect(await Promise.reject(appwriteError(404, 'row_not_found')).catch(softFailWith('a:b:c', fallback))).toBe('zweiter Weg')
    expect(fallback).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('shapeSoftFail / isExpectedMiss', () => {
  it('liest den Status aus Appwrite (code), H3 (statusCode) und ofetch (status)', () => {
    expect(shapeSoftFail(appwriteError(429, 'general_rate_limit_exceeded')).status).toBe(429)
    expect(shapeSoftFail({ statusCode: 403 }).status).toBe(403)
    expect(shapeSoftFail({ status: 502 }).status).toBe(502)
    expect(shapeSoftFail(null).status).toBe(0)
    expect(shapeSoftFail(undefined).status).toBe(0)
  })

  it('nimmt nur Felder in fester Form an — ein vergifteter Wert kommt nicht ins Protokoll', () => {
    expect(shapeSoftFail({ code: 500, type: 'mit leerzeichen und mail@example.org', name: 'x y' })).toEqual({ status: 500 })
  })

  it('ein Status außerhalb von `quiet` ist kein Fehlgriff, 0 nie', () => {
    expect(isExpectedMiss({ statusCode: 409 }, [409])).toBe(true)
    expect(isExpectedMiss({ statusCode: 409 })).toBe(false)
    expect(isExpectedMiss(new Error('x'), [0])).toBe(false)
  })
})
