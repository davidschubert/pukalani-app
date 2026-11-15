import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { listAllRows, listAllRowsIfTableExists } from '../../core/server/utils/listAllRows'

/**
 * SEC-032 — die Vorschau einer Konversation ist ein KOPIE des letzten Textes.
 *
 * Nach der Kontolöschung blieb eine Konversation, in der auch das Gegenüber
 * geschrieben hatte, stehen — mit `lastMessagePreview` aus der letzten
 * Nachricht, oft genau dem Satz der gelöschten Person. Jetzt wird die
 * Vorschau aus der neuesten VERBLEIBENDEN Nachricht neu berechnet.
 */

type Row = { $id: string, $createdAt: string, [key: string]: unknown }

let tables: Record<string, Row[]>
const updates: { tableId: string, rowId: string, data: Record<string, unknown> }[] = []
let updateError: unknown

interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    const parsed = queries.map(q => JSON.parse(q) as ParsedQuery)
    let rows = (tables[tableId] ?? []).filter(row => parsed.every(q => q.method !== 'equal'
      || (q.values ?? []).includes(row[q.attribute!])))
    if (parsed.some(q => q.method === 'orderDesc' && q.attribute === '$createdAt')) {
      rows = [...rows].sort((a, b) => b.$createdAt.localeCompare(a.$createdAt))
    }
    const limit = parsed.find(q => q.method === 'limit')?.values?.[0]
    return { total: rows.length, rows: typeof limit === 'number' ? rows.slice(0, limit) : rows }
  }),
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    const found = (tables[tableId] ?? []).find(row => row.$id === rowId)
    if (!found) throw new AppwriteException('Row not found', 404, 'row_not_found')
    return { ...found }
  }),
  deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    const rows = tables[tableId] ?? []
    const index = rows.findIndex(row => row.$id === rowId)
    if (index < 0) throw new AppwriteException('Row not found', 404, 'row_not_found')
    rows.splice(index, 1)
  }),
  updateRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    if (updateError) throw updateError
    updates.push({ tableId, rowId, data })
    const row = (tables[tableId] ?? []).find(r => r.$id === rowId)
    if (row) Object.assign(row, data)
    return row
  }),
}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('listAllRows', listAllRows)
vi.stubGlobal('listAllRowsIfTableExists', listAllRowsIfTableExists)
vi.stubGlobal('logEvent', () => {})

const { messagesDeleteUserData } = await import('../server/utils/messagesUserData')

const event = { context: {} } as unknown as H3Event
const row = (id: string, createdAt: string, extra: Record<string, unknown>): Row => ({ $id: id, $createdAt: createdAt, ...extra })

beforeEach(() => {
  updates.length = 0
  updateError = undefined
  tables = {
    message_blocks: [],
    messages: [
      row('m-old', '2026-11-01T10:00:00.000Z', { authorId: 'u2', conversationId: 'c1', body: 'Antwort\nvom Gegenüber', reportedAt: '' }),
      row('m-new', '2026-11-02T10:00:00.000Z', { authorId: 'u1', conversationId: 'c1', body: 'Geheimnis der Gelöschten', reportedAt: '' }),
    ],
    conversation_members: [
      row('cm1', '2026-11-01T00:00:00.000Z', { userId: 'u1', conversationId: 'c1' }),
      row('cm2', '2026-11-01T00:00:00.000Z', { userId: 'u2', conversationId: 'c1' }),
    ],
    conversations: [
      row('c1', '2026-11-01T00:00:00.000Z', {
        participants: ['u1', 'u2'], starterId: 'u2',
        lastMessageAt: '2026-11-02T10:00:00.000Z', lastMessagePreview: 'Geheimnis der Gelöschten',
      }),
    ],
  }
})

describe('messagesDeleteUserData — die Vorschau folgt der verbleibenden Nachricht', () => {
  it('rechnet Vorschau und Zeitpunkt aus der neuesten VERBLEIBENDEN Nachricht neu', async () => {
    await messagesDeleteUserData(event, 'u1')
    const conversation = tables.conversations!.find(c => c.$id === 'c1')!
    expect(conversation.lastMessagePreview).toBe('Antwort vom Gegenüber')
    expect(conversation.lastMessageAt).toBe('2026-11-01T10:00:00.000Z')
    expect(JSON.stringify(tables.conversations)).not.toContain('Geheimnis')
  })

  it('ein geschützter Beleg (leerer Text) ist die neueste Nachricht ⇒ Vorschau leer', async () => {
    tables.messages![1]!.reportedAt = new Date().toISOString()
    await messagesDeleteUserData(event, 'u1')
    const conversation = tables.conversations!.find(c => c.$id === 'c1')!
    expect(conversation.lastMessagePreview).toBe('')
  })

  it('zweiter Lauf: nichts mehr zu ändern ⇒ kein Schreibvorgang', async () => {
    await messagesDeleteUserData(event, 'u1')
    updates.length = 0
    await messagesDeleteUserData(event, 'u1')
    expect(updates.filter(u => u.tableId === 'conversations')).toHaveLength(0)
  })

  it('bleibt keine Nachricht, verschwindet die Konversation (keine Vorschau übrig)', async () => {
    tables.messages = tables.messages!.filter(m => m.$id !== 'm-old')
    await messagesDeleteUserData(event, 'u1')
    expect(tables.conversations).toHaveLength(0)
  })

  it('ein 500 beim Nachführen der Vorschau ⇒ die Löschung meldet sich unvollständig', async () => {
    updateError = new AppwriteException('Server Error', 500, 'general_unknown')
    await expect(messagesDeleteUserData(event, 'u1')).rejects.toThrow()
  })
})
