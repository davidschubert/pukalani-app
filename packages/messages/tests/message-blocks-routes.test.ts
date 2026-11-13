import { afterEach, describe, expect, it, vi } from 'vitest'
import { ME, runRoute } from './support/messageRouteHarness'

/**
 * SEC-036 Punkt 1 — DIE SPERRLISTE IST KEIN VERZEICHNIS (P05, 2026-11-13).
 *
 * Gesperrt werden kann nur, wer IN DIESER Community auflösbar ist: ein Handle
 * hier ODER ein gemeinsames Gespräch hier. Für alles andere dieselbe 404 —
 * „gibt es nicht" und „gehört nicht hierher" sind nicht unterscheidbar. Die
 * Liste nennt Name und Handle nur, solange diese Bedingung gilt; die Id bleibt,
 * damit Entsperren immer möglich ist.
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

const blockRoute = () => import('../server/api/messages/blocks/index.post')
const listRoute = () => import('../server/api/messages/blocks/index.get')
const unblockRoute = () => import('../server/api/messages/blocks/[userId].delete')

function blocksOf(tables: Record<string, Array<Record<string, unknown>>>, blockedId: string) {
  return (tables.message_blocks ?? []).filter(row => row.blockerId === ME && row.blockedId === blockedId)
}

describe('POST /api/messages/blocks', () => {
  it('Id ohne jeden Bezug: 404, keine Zeile', async () => {
    const run = await runRoute(blockRoute, { who: 'member', body: { userId: 'u-nobody' } })
    expect(run.status).toBe(404)
    expect(blocksOf(run.tables, 'u-nobody')).toHaveLength(0)
  })

  it('Konto mit Handle nur in einer ANDEREN Community: dieselbe 404', async () => {
    const unknown = await runRoute(blockRoute, { who: 'member', body: { userId: 'u-nobody' } })
    const elsewhere = await runRoute(blockRoute, { who: 'member', body: { userId: 'u-stranger' } })
    expect(elsewhere.status).toBe(404)
    expect(elsewhere.error).toEqual(unknown.error)
    expect(blocksOf(elsewhere.tables, 'u-stranger')).toHaveLength(0)
  })

  it('Gespräch nur in einer ANDEREN Community: 404', async () => {
    const run = await runRoute(blockRoute, { who: 'member', body: { userId: 'u-far' } })
    expect(run.status).toBe(404)
    expect(blocksOf(run.tables, 'u-far')).toHaveLength(0)
  })

  it('Handle in dieser Community: ok', async () => {
    const run = await runRoute(blockRoute, { who: 'member', body: { userId: 'u-partner' } })
    expect(run.error).toBeUndefined()
    expect(blocksOf(run.tables, 'u-partner')).toHaveLength(1)
  })

  it('kein Handle, aber gemeinsames Gespräch hier: ok', async () => {
    const run = await runRoute(blockRoute, { who: 'member', body: { userId: 'u-quiet', everywhere: true } })
    expect(run.error).toBeUndefined()
    expect(blocksOf(run.tables, 'u-quiet')[0]?.scope).toBe('everywhere')
  })

  it('Silo: jedes Konto mit Handle ist auflösbar', async () => {
    const run = await runRoute(blockRoute, { who: 'member', mode: 'silo', body: { userId: 'u-stranger' } })
    expect(run.error).toBeUndefined()
  })
})

describe('GET /api/messages/blocks', () => {
  it('Name und Handle nur bei Bezug, sonst nur die Id', async () => {
    const run = await runRoute<{ blocks: Array<{ userId: string, name: string, handle: string }> }>(listRoute, { who: 'member' })
    const byId = new Map(run.result!.blocks.map(entry => [entry.userId, entry]))
    expect(byId.get('u-handle')).toMatchObject({ name: 'Handle Person', handle: 'handle' })
    expect(byId.get('u-quiet')).toMatchObject({ name: 'Stille Person', handle: '' })
    // Bestand von vor der Regel: keine Auskunft mehr, aber die Id bleibt.
    expect(byId.get('u-gone')).toMatchObject({ name: '', handle: '' })
  })
})

describe('DELETE /api/messages/blocks/[userId]', () => {
  it('Entsperren bleibt für jede Id der eigenen Liste möglich (auch ohne Bezug)', async () => {
    const run = await runRoute(unblockRoute, { who: 'member', params: { userId: 'u-gone' } })
    expect(run.error).toBeUndefined()
    expect(blocksOf(run.tables, 'u-gone')).toHaveLength(0)
  })
})
