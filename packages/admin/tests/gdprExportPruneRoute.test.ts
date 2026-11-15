import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * SEC-009: die Handroute neben dem stündlichen Aufräumen der
 * Sicherungskopien (`POST /api/admin/gdpr-exports/prune`). Ein Lauf, den man
 * nur durch Warten beobachten kann, wird nie bewiesen — die Route lässt ihn
 * auf Knopfdruck laufen, standardmäßig nur zählend.
 *
 * Ausgeführt wird der ECHTE Handler; `defineEventHandler` und die
 * Nitro-Auto-Imports sind zur Testzeit Globals und hier gestubbt.
 */

const ROUTE = '../server/api/admin/gdpr-exports/prune.post.ts'

interface Counts { scanned: number, expired: number, removed: number, failed: number }

async function runRoute(options: {
  body?: unknown
  denied?: boolean
  result?: Counts | null
}) {
  const runs: Array<{ dryRun?: boolean }> = []
  const permissions: string[] = []

  vi.resetModules()
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('requirePermission', (_event: unknown, permission: string) => {
    permissions.push(permission)
    if (options.denied) throw Object.assign(new Error('Forbidden'), { status: 403 })
  })
  vi.stubGlobal('readValidatedBody', async (_event: unknown, parse: (body: unknown) => unknown) => parse(options.body))
  vi.stubGlobal('createError', (init: Record<string, unknown>) =>
    Object.assign(new Error(String(init.statusText)), init))
  vi.stubGlobal('runGdprExportPrune', async (opts: { dryRun?: boolean } = {}) => {
    runs.push(opts)
    return options.result === undefined ? { scanned: 0, expired: 0, removed: 0, failed: 0 } : options.result
  })

  const module = await import(ROUTE)
  const handler = module.default as unknown as (event: unknown) => Promise<Counts>
  return { call: () => handler({}), runs, permissions }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POST /api/admin/gdpr-exports/prune', () => {
  it('verlangt users.manage wie die Nachbar-Routen — und läuft ohne nicht', async () => {
    const route = await runRoute({ denied: true })
    await expect(route.call()).rejects.toMatchObject({ status: 403 })
    expect(route.permissions).toEqual(['users.manage'])
    expect(route.runs).toEqual([])
  })

  it('ohne Body ist es ein Probelauf (dryRun: true)', async () => {
    const route = await runRoute({ body: undefined })
    await route.call()
    expect(route.runs).toEqual([{ dryRun: true }])
  })

  it('leerer Body ⇒ ebenfalls Probelauf', async () => {
    const route = await runRoute({ body: {} })
    await route.call()
    expect(route.runs).toEqual([{ dryRun: true }])
  })

  it('dryRun: false löscht wirklich und gibt die Zähler zurück', async () => {
    const counts = { scanned: 3, expired: 2, removed: 2, failed: 0 }
    const route = await runRoute({ body: { dryRun: false }, result: counts })
    await expect(route.call()).resolves.toEqual(counts)
    expect(route.runs).toEqual([{ dryRun: false }])
  })

  it('ein falscher Typ wird abgelehnt, bevor etwas läuft', async () => {
    const route = await runRoute({ body: { dryRun: 'nein' } })
    await expect(route.call()).rejects.toThrow()
    expect(route.runs).toEqual([])
  })

  it('läuft schon ein Lauf ⇒ 409 prune_busy', async () => {
    const route = await runRoute({ body: { dryRun: false }, result: null })
    await expect(route.call()).rejects.toMatchObject({ status: 409, data: { code: 'prune_busy' } })
  })

  it('das Rechte-Gate steht VOR dem Lesen des Bodys (Quelltext)', () => {
    const source = readFileSync(fileURLToPath(new URL(ROUTE, import.meta.url)), 'utf8')
    const gate = source.indexOf(`requirePermission(event, 'users.manage')`)
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(source.indexOf('readValidatedBody('))
  })
})
