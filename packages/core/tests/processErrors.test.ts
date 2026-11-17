import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { processErrorKind, shapeProcessErrorLog } from '../server/utils/processErrors'

/**
 * WA1 e — Fehler außerhalb einer Anfrage.
 *
 * Geprüft wird (1) die pure Übersetzung und (2) das Plugin am nachgebildeten
 * Nitro-Haken: es schreibt für Prozess-Fehler GENAU EINE Zeile `server.error`,
 * für Fehler einer Anfrage keine (die schreibt `server/error.ts`), hängt am
 * Gate und hängt KEINEN Lauscher an den Prozess.
 */

describe('processErrorKind', () => {
  it('erkennt die zwei Etiketten, die Nitro für Prozess-Fehler setzt', () => {
    expect(processErrorKind(['unhandledRejection'])).toBe('unhandledRejection')
    expect(processErrorKind(['uncaughtException'])).toBe('uncaughtException')
  })

  it('Fehler einer Anfrage und fehlende Etiketten sind keine Prozess-Fehler', () => {
    expect(processErrorKind(['request'])).toBeNull()
    expect(processErrorKind(['request', 'response'])).toBeNull()
    expect(processErrorKind([])).toBeNull()
    expect(processErrorKind(undefined)).toBeNull()
    expect(processErrorKind(null)).toBeNull()
    expect(processErrorKind('unhandledRejection')).toBeNull()
  })
})

describe('shapeProcessErrorLog', () => {
  it('Fehler ⇒ Nachricht, gekürzter Stack, Status 500, Quelle und Sorte — kein Pfad', () => {
    const shaped = shapeProcessErrorLog(new Error('probe: Ablehnung im Zeit-Lauf'), 'unhandledRejection')
    expect(shaped).toMatchObject({ status: 500, source: 'process', kind: 'unhandledRejection', message: 'probe: Ablehnung im Zeit-Lauf', path: '', method: '' })
    expect(String(shaped.stack).split('\n').length).toBeLessThanOrEqual(12)
  })

  it('ein eigener Status des Fehlers zählt hier nicht — es bleibt 500', () => {
    const notFound = Object.assign(new Error('probe: nicht gefunden'), { statusCode: 404 })
    expect(shapeProcessErrorLog(notFound, 'unhandledRejection').status).toBe(500)
  })

  it('kein Error-Objekt ⇒ als Text', () => {
    expect(shapeProcessErrorLog('probe-text', 'uncaughtException')).toMatchObject({ status: 500, message: 'probe-text', kind: 'uncaughtException' })
  })
})

describe('Plugin process-errors', () => {
  type Hook = (error: unknown, context?: { tags?: string[] }) => void
  let hook: Hook | null
  let enabled: boolean
  let lines: string[]

  beforeEach(async () => {
    hook = null
    enabled = true
    lines = []
    vi.resetModules()
    vi.stubGlobal('defineNitroPlugin', (setup: (app: unknown) => void) => setup)
    vi.stubGlobal('useAppConfig', () => ({ pukalani: { observability: { enabled } } }))
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => { lines.push(String(line)) })
    const listenersBefore = process.listenerCount('unhandledRejection') + process.listenerCount('uncaughtException')
    const plugin = (await import('../server/plugins/process-errors')).default as unknown as (app: unknown) => void
    plugin({ hooks: { hook: (name: string, fn: Hook) => { if (name === 'error') hook = fn } } })
    // Am Prozess ändert sich nichts.
    expect(process.listenerCount('unhandledRejection') + process.listenerCount('uncaughtException')).toBe(listenersBefore)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('hängt sich an Nitros Haken `error`', () => {
    expect(hook).toBeTypeOf('function')
  })

  it('nicht behandelte Ablehnung ⇒ genau eine Zeile server.error mit Quelle process', () => {
    hook!(new Error('probe: Ablehnung'), { tags: ['unhandledRejection'] })
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]!)).toMatchObject({ level: 'error', event: 'server.error', status: 500, source: 'process', kind: 'unhandledRejection', message: 'probe: Ablehnung' })
  })

  it('GEGENPROBE: Fehler einer Anfrage ⇒ keine Zeile (die schreibt der zentrale Fehler-Hook)', () => {
    hook!(new Error('probe: 500 in einer Route'), { tags: ['request'] })
    hook!(new Error('probe: ohne Etikett'))
    expect(lines).toEqual([])
  })

  it('GEGENPROBE: Gate aus ⇒ keine Zeile', () => {
    enabled = false
    hook!(new Error('probe: Ablehnung'), { tags: ['uncaughtException'] })
    expect(lines).toEqual([])
  })

  it('ein Fehler beim Schreiben wirft nicht weiter', () => {
    vi.stubGlobal('useAppConfig', () => { throw new Error('probe: keine Konfiguration') })
    expect(() => hook!(new Error('probe'), { tags: ['unhandledRejection'] })).not.toThrow()
    expect(lines).toEqual([])
  })
})
