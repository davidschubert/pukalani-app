import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * SEC-002 (GA1 P13, Etappe 4): „als gelesen markieren" schreibt der Server.
 * Eine Meldung trägt kein Änderungsrecht des Empfängers mehr; wessen Meldungen
 * markiert werden, entscheidet allein die Abfrage auf das angemeldete Konto.
 */

type Row = { $id: string, recipientId: string, read: boolean, communityId?: string }

function setup(rows: Row[], options: { leak?: boolean } = {}) {
  const updates: { rowId: string, data: Record<string, unknown> }[] = []
  const listQueries: string[][] = []
  const tablesDB = {
    listRows: vi.fn(async ({ queries }: { queries: string[] }) => {
      listQueries.push(queries)
      const parsed = queries.map(q => JSON.parse(q) as { method: string, attribute?: string, values?: unknown[] })
      const recipient = parsed.find(q => q.method === 'equal' && q.attribute === 'recipientId')?.values?.[0]
      // `leak` stellt eine Abfrage nach, die mehr liefert, als sie soll.
      const found = rows.filter(r => !r.read && (options.leak || r.recipientId === recipient))
      return { rows: found.map(r => ({ ...r })), total: found.length }
    }),
    updateRow: vi.fn(async ({ rowId, data }: { rowId: string, data: Record<string, unknown> }) => {
      updates.push({ rowId, data })
      const row = rows.find(r => r.$id === rowId)
      if (row) Object.assign(row, data)
      return {}
    }),
  }
  const adminClient = vi.fn(() => ({ tablesDB }))
  const sessionClient = vi.fn(() => { throw new Error('Session-Client darf hier nicht benutzt werden') })
  vi.doMock('../server/lib/appwrite', () => ({ createAdminClient: adminClient, createSessionClient: sessionClient }))
  vi.doMock('../server/utils/notificationScope', () => ({
    runScopedNotificationQuery: async (_event: H3Event, run: (scope: string[]) => Promise<unknown>) => run([]),
  }))
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
  vi.stubGlobal('createError', (init: { status: number, statusText: string }) => Object.assign(new Error(init.statusText), init))
  return { updates, listQueries, adminClient, sessionClient }
}

async function run(userId: string | null) {
  const handler = (await import('../server/api/notifications/read.post')).default as unknown as (e: H3Event) => Promise<{ ok: boolean, marked: number }>
  const event = { context: userId ? { user: { $id: userId } } : {} } as unknown as H3Event
  return handler(event)
}

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('../server/lib/appwrite')
  vi.doUnmock('../server/utils/notificationScope')
  vi.unstubAllGlobals()
})

describe('POST /api/notifications/read — der Server markiert, nur die eigenen', () => {
  it('markiert die ungelesenen Meldungen des Kontos über den Admin-Client', async () => {
    const rows: Row[] = [
      { $id: 'n1', recipientId: 'u1', read: false },
      { $id: 'n2', recipientId: 'u1', read: false },
      { $id: 'n3', recipientId: 'u2', read: false },
    ]
    const world = setup(rows)
    const result = await run('u1')
    expect(result).toEqual({ ok: true, marked: 2 })
    expect(world.updates).toEqual([{ rowId: 'n1', data: { read: true } }, { rowId: 'n2', data: { read: true } }])
    expect(world.adminClient).toHaveBeenCalled()
    expect(world.sessionClient).not.toHaveBeenCalled()
    // Die fremde Meldung bleibt ungelesen.
    expect(rows.find(r => r.$id === 'n3')!.read).toBe(false)
    // Die Abfrage trägt den Filter auf das angemeldete Konto.
    expect(world.listQueries[0]!.some(q => q.includes('"recipientId"') && q.includes('"u1"'))).toBe(true)
  })

  it('geschrieben wird nur das Feld `read`', async () => {
    const world = setup([{ $id: 'n1', recipientId: 'u1', read: false }])
    await run('u1')
    expect(world.updates.every(u => Object.keys(u.data).join(',') === 'read')).toBe(true)
  })

  it('Netz: liefert die Abfrage einmal fremde Zeilen mit, werden sie nicht angefasst', async () => {
    const rows: Row[] = [{ $id: 'n1', recipientId: 'u1', read: false }, { $id: 'n9', recipientId: 'u9', read: false }]
    const world = setup(rows, { leak: true })
    await run('u1')
    expect(world.updates.map(u => u.rowId)).toEqual(['n1'])
    expect(rows.find(r => r.$id === 'n9')!.read).toBe(false)
  })

  it('ohne Anmeldung 401, nichts gelesen, nichts geschrieben', async () => {
    const world = setup([{ $id: 'n1', recipientId: 'u1', read: false }])
    await expect(run(null)).rejects.toMatchObject({ status: 401 })
    expect(world.adminClient).not.toHaveBeenCalled()
    expect(world.updates).toEqual([])
  })
})
