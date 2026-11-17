import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { listAllRows } from '../server/utils/listAllRows'

/**
 * EL1 d — der EINE Core-Vertrag „Meldungen zu einem Objekt entfernen"
 * (`removeObjectNotifications`). Geprüft wird die GESPEICHERTE Glocke: jede
 * Räumung hat ihre Gegenprobe (eine Zeile, die bleiben muss), sonst wäre
 * „alles löschen" auch grün. Die Id-Formel hier ist eine Test-Formel — die
 * echten liegen in den Layern (comments, posts) und haben dort eigene Tests,
 * die diese Funktion einbinden.
 */

interface BellRow {
  $id: string
  $createdAt: string
  recipientId: string
  senderId?: string
  type: string
  body: string
}

const AUTHOR = 'u-author'
const at = '2026-11-17T00:00:00.000Z'

/** Test-Formel: Typ + Objekt + Empfänger, wie die Layer es (gehasht) tun. */
function idFor(type: string, objectId: string, recipientId: string): string {
  return `n-${type}-${objectId}-${recipientId}`.replace(/\./g, '_')
}

function row(type: string, objectId: string, recipientId: string, senderId?: string): BellRow {
  return {
    $id: idFor(type, objectId, recipientId),
    $createdAt: at,
    recipientId,
    type,
    body: 'Geheimer Auszug',
    ...(senderId ? { senderId } : {}),
  }
}

function fakeBell(initial: BellRow[], options: { failList?: boolean, failDeleteOf?: string } = {}) {
  const rows = [...initial]
  const tablesDB = {
    listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
      if (options.failList) throw new AppwriteException('Server error: Geheimer Auszug', 500, 'general_unknown')
      if (tableId !== 'notifications') return { total: 0, rows: [] }
      const filters = queries.map(q => JSON.parse(q) as { method: string, attribute?: string, values?: unknown[] })
        .filter(q => q.method === 'equal')
      const found = rows.filter(r => filters.every(f => (f.values ?? []).includes((r as unknown as Record<string, unknown>)[f.attribute!])))
      return { total: found.length, rows: found.map(r => ({ ...r })) }
    }),
    deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
      if (rowId === options.failDeleteOf) throw new AppwriteException('Server error: Geheimer Auszug', 503, 'general_unknown')
      const index = tableId === 'notifications' ? rows.findIndex(r => r.$id === rowId) : -1
      if (index < 0) throw new AppwriteException('Row not found', 404, 'row_not_found')
      rows.splice(index, 1)
    }),
  }
  return { rows, tablesDB }
}

const logEvent = vi.fn()

async function load(bell: ReturnType<typeof fakeBell>) {
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
  vi.stubGlobal('createAdminClient', () => ({ tablesDB: bell.tablesDB }))
  vi.stubGlobal('listAllRows', listAllRows)
  vi.stubGlobal('logEvent', logEvent)
  const { removeObjectNotifications } = await import('../server/utils/notificationCleanup')
  return removeObjectNotifications
}

const event = { context: {} } as unknown as H3Event

/** Die Typen `reply` und `mention` gehören zum Objekt, alles andere nicht. */
function input(objectId: string, extra: { senderId?: string, directRowIds?: string[] } = {}) {
  return {
    kind: 'comment',
    objectId,
    senderId: extra.senderId ?? AUTHOR,
    rowIdFor: (type: string, recipientId: string) =>
      (type === 'reply' || type === 'mention' ? idFor(type, objectId, recipientId) : null),
    ...(extra.directRowIds ? { directRowIds: extra.directRowIds } : {}),
  }
}

afterEach(() => {
  logEvent.mockClear()
  vi.unstubAllGlobals()
})

describe('removeObjectNotifications — nur die Zeile mit exakt passender Id fällt', () => {
  it('räumt Antwort und Erwähnung des Objekts; anderes Objekt, fremder Typ, Bestand und fremder Absender bleiben', async () => {
    const otherObject = row('reply', 'k-2', 'u-a', AUTHOR)
    const foreignType = row('post.mention', 'k-1', 'u-a', AUTHOR)
    const legacy: BellRow = { $id: 'legacy-random', $createdAt: at, recipientId: 'u-a', senderId: AUTHOR, type: 'reply', body: 'Alt' }
    const otherSender = row('reply', 'k-1', 'u-a', 'u-other')
    // Gleicher Typ und Objekt, aber die Id passt nicht zum EMPFÄNGER der Zeile.
    const wrongRecipient: BellRow = { ...row('reply', 'k-1', 'u-a', AUTHOR), recipientId: 'u-b' }
    const bell = fakeBell([
      row('reply', 'k-1', 'u-a', AUTHOR),
      row('mention', 'k-1', 'u-b', AUTHOR),
      otherObject,
      foreignType,
      legacy,
      otherSender,
    ])
    const remove = await load(bell)

    expect(await remove(event, input('k-1'))).toBe(2)
    expect(bell.rows.map(r => r.$id).sort()).toEqual([otherObject.$id, foreignType.$id, legacy.$id, otherSender.$id].sort())
    expect(logEvent).not.toHaveBeenCalled()

    // Gegenprobe zur Empfänger-Bindung (eigene Glocke, damit die Ids nicht kollidieren).
    const bell2 = fakeBell([wrongRecipient])
    const remove2 = await load(bell2)
    expect(await remove2(event, input('k-1'))).toBe(0)
    expect(bell2.rows).toHaveLength(1)
  })

  it('`rowIdFor` gibt null ⇒ die Zeile bleibt, auch wenn ihre Id zufällig passt', async () => {
    const own = row('reply', 'k-1', 'u-a', AUTHOR)
    const bell = fakeBell([own])
    const remove = await load(bell)

    expect(await remove(event, { ...input('k-1'), rowIdFor: () => null })).toBe(0)
    expect(bell.rows).toEqual([own])
  })

  it('ohne Absender entfällt die Suche; nur die direkten Ids fallen', async () => {
    const guestReply = row('reply.guest', 'k-g', 'u-parent')
    const otherGuest = row('reply.guest', 'k-g2', 'u-parent')
    const bell = fakeBell([guestReply, otherGuest, row('reply', 'k-g', 'u-a', AUTHOR)])
    const remove = await load(bell)

    expect(await remove(event, input('k-g', { senderId: '', directRowIds: [guestReply.$id] }))).toBe(1)
    expect(bell.tablesDB.listRows).not.toHaveBeenCalled()
    expect(bell.rows.map(r => r.$id)).toEqual([otherGuest.$id, idFor('reply', 'k-g', 'u-a')])
  })

  it('`directRowIds` mit 404 zählt nicht und wirft nicht', async () => {
    const bell = fakeBell([])
    const remove = await load(bell)

    expect(await remove(event, input('k-g', { senderId: '', directRowIds: ['gibt-es-nicht'] }))).toBe(0)
    expect(logEvent).not.toHaveBeenCalled()
  })
})

describe('removeObjectNotifications — best effort, eine Log-Zeile ohne Inhalt', () => {
  it('ein Lesefehler wirft nicht und loggt Kennungen, Zahl und Statuscode', async () => {
    const bell = fakeBell([row('reply', 'k-1', 'u-a', AUTHOR)], { failList: true })
    const remove = await load(bell)

    expect(await remove(event, input('k-1'))).toBe(0)
    expect(bell.rows).toHaveLength(1)
    expect(logEvent).toHaveBeenCalledTimes(1)
    expect(logEvent).toHaveBeenCalledWith('warn', 'notifications.cleanup_failed', { kind: 'comment', objectId: 'k-1', removed: 0, code: 500 })
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain('Geheimer Auszug')
  })

  it('ein Löschfehler mitten in der Liste wirft nicht; die Zahl nennt, was schon fiel', async () => {
    const first = row('reply', 'k-1', 'u-a', AUTHOR)
    const broken = row('mention', 'k-1', 'u-b', AUTHOR)
    const after = row('mention', 'k-1', 'u-c', AUTHOR)
    const bell = fakeBell([first, broken, after], { failDeleteOf: broken.$id })
    const remove = await load(bell)

    expect(await remove(event, input('k-1'))).toBe(1)
    expect(bell.rows.map(r => r.$id)).toEqual([broken.$id, after.$id])
    expect(logEvent).toHaveBeenCalledTimes(1)
    expect(logEvent).toHaveBeenCalledWith('warn', 'notifications.cleanup_failed', { kind: 'comment', objectId: 'k-1', removed: 1, code: 503 })
    expect(JSON.stringify(logEvent.mock.calls)).not.toContain('Geheimer Auszug')
  })

  it('ein anderer Fehler als 404 bei einer direkten Id wird geloggt, nicht geworfen', async () => {
    const bell = fakeBell([], { failDeleteOf: 'kaputt' })
    const remove = await load(bell)

    expect(await remove(event, input('k-g', { senderId: '', directRowIds: ['kaputt'] }))).toBe(0)
    expect(logEvent).toHaveBeenCalledWith('warn', 'notifications.cleanup_failed', { kind: 'comment', objectId: 'k-g', removed: 0, code: 503 })
  })
})
