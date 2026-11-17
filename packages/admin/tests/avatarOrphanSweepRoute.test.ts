import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * KE3: die Hand-Route neben dem Aufräum-Lauf der Profilbilder ohne Profil
 * (`POST /api/admin/avatars/orphan-sweep`). Ohne Angabe zählt sie nur;
 * löschen darf sie nur, wenn der Schalter der App selbst auf `apply` steht.
 *
 * Ausgeführt wird der ECHTE Handler; `defineEventHandler` und die
 * Nitro-Auto-Imports sind zur Testzeit Globals und hier gestubbt.
 */

const ROUTE = '../server/api/admin/avatars/orphan-sweep.post.ts'

interface Counts {
  mode: 'count' | 'apply'
  considered: number
  expired: number
  deleted: number
  failed: number
  truncated: boolean
  byReason: Record<string, number>
  unowned: number
  keptAtDelete: number
}

function counts(mode: 'count' | 'apply', extra: Partial<Counts> = {}): Counts {
  return {
    mode, considered: 0, expired: 0, deleted: 0, failed: 0, truncated: false, byReason: {},
    unowned: 0, keptAtDelete: 0, ...extra,
  }
}

async function runRoute(options: {
  body?: unknown
  denied?: boolean
  switchMode?: 'off' | 'count' | 'apply'
  busy?: boolean
  result?: Counts
}) {
  const runs: string[] = []
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
  vi.stubGlobal('avatarOrphanSweepMode', () => options.switchMode ?? 'count')
  vi.stubGlobal('runAvatarOrphanSweep', async (mode: 'count' | 'apply') => {
    runs.push(mode)
    if (options.busy) return null
    return options.result ?? counts(mode)
  })

  const module = await import(ROUTE)
  const handler = module.default as unknown as (event: unknown) => Promise<Counts>
  return { call: () => handler({}), runs, permissions }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POST /api/admin/avatars/orphan-sweep', () => {
  it('verlangt storage.manage wie das Löschen im Storage-Browser — und läuft ohne nicht', async () => {
    const route = await runRoute({ denied: true })
    await expect(route.call()).rejects.toMatchObject({ status: 403 })
    expect(route.permissions).toEqual(['storage.manage'])
    expect(route.runs).toEqual([])
  })

  it('ohne Body wird nur gezählt — auch wenn der Schalter auf apply steht', async () => {
    const route = await runRoute({ body: undefined, switchMode: 'apply' })
    await route.call()
    expect(route.runs).toEqual(['count'])
  })

  it('apply: false ⇒ ebenfalls nur zählen', async () => {
    const route = await runRoute({ body: { apply: false } })
    await route.call()
    expect(route.runs).toEqual(['count'])
  })

  it('apply: true bei Schalter count ⇒ 409 sweep_not_enabled, kein Lauf', async () => {
    const route = await runRoute({ body: { apply: true }, switchMode: 'count' })
    await expect(route.call()).rejects.toMatchObject({ status: 409, data: { code: 'sweep_not_enabled' } })
    expect(route.runs).toEqual([])
  })

  it('apply: true bei Schalter off ⇒ ebenfalls 409', async () => {
    const route = await runRoute({ body: { apply: true }, switchMode: 'off' })
    await expect(route.call()).rejects.toMatchObject({ status: 409, data: { code: 'sweep_not_enabled' } })
    expect(route.runs).toEqual([])
  })

  it('apply: true bei Schalter apply ⇒ löscht und gibt nur Zahlen zurück', async () => {
    const result = counts('apply', { considered: 4, expired: 2, deleted: 2, byReason: { unreferenced: 1, owner_gone: 1 }, unowned: 1 })
    const route = await runRoute({ body: { apply: true }, switchMode: 'apply', result })
    await expect(route.call()).resolves.toEqual(result)
    expect(route.runs).toEqual(['apply'])
  })

  it('ein falscher Typ wird abgelehnt, bevor etwas läuft', async () => {
    const route = await runRoute({ body: { apply: 'ja' }, switchMode: 'apply' })
    await expect(route.call()).rejects.toThrow()
    expect(route.runs).toEqual([])
  })

  it('läuft schon ein Lauf ⇒ 409 sweep_busy', async () => {
    const route = await runRoute({ body: undefined, busy: true })
    await expect(route.call()).rejects.toMatchObject({ status: 409, data: { code: 'sweep_busy' } })
  })

  it('das Rechte-Gate steht VOR dem Lesen des Bodys (Quelltext)', () => {
    const source = readFileSync(fileURLToPath(new URL(ROUTE, import.meta.url)), 'utf8')
    const gate = source.indexOf(`requirePermission(event, 'storage.manage')`)
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(source.indexOf('readValidatedBody('))
  })
})
