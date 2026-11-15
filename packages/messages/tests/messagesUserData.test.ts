import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { listAllRows, listAllRowsIfTableExists } from '../../core/server/utils/listAllRows'

/**
 * EIN LESEFEHLER IST EIN FEHLER, KEIN „NICHTS GEFUNDEN" (SEC-026, Teil 2).
 *
 * Jeder Lesevorgang dieses Contributors trug `.catch(() => [])` bzw.
 * `.catch(() => null)`, die Aufräum-Löschungen am Ende `.catch(() => {})`.
 * Ein 500 auf `messages` hiess damit „dieser Mensch hat nie geschrieben" —
 * die Löschung meldete Erfolg, das Konto verschwand, die Nachrichten blieben.
 *
 * Jetzt: Lesen ist streng. Bei den Aufräum-Löschungen ist ein 404 („schon
 * weg") Erfolg; jeder andere Fehler wird gesammelt, die restliche
 * (idempotente) Arbeit läuft zu Ende, und am Schluss wirft EIN Fehler, der nur
 * Anzahlen nennt — keine Ids, keinen Text.
 */

type Row = { $id: string, $createdAt: string, [key: string]: unknown }

let tables: Record<string, Row[]>
/** Fehler je Tabelle — oder je `tabelle:spalte` für eine einzelne Abfrage. */
let errors: Record<string, unknown>
/** Fehler je `tabelle/zeile` beim Löschen. */
let deleteErrors: Record<string, unknown>
let getErrors: Record<string, unknown>
let deleted: string[]

function equalFilters(queries: string[]): { attribute: string, values: unknown[] }[] {
  return queries
    .map(q => JSON.parse(q) as { method: string, attribute: string, values: unknown[] })
    .filter(q => q.method === 'equal')
}

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    const filters = equalFilters(queries)
    const error = errors[tableId] ?? filters.map(f => errors[`${tableId}:${f.attribute}`]).find(Boolean)
    if (error) throw error
    const rows = (tables[tableId] ?? []).filter(row => filters.every(f => f.values.includes(row[f.attribute])))
    return { total: rows.length, rows }
  }),
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    if (getErrors[rowId]) throw getErrors[rowId]
    const found = (tables[tableId] ?? []).find(row => row.$id === rowId)
    if (!found) throw new AppwriteException('Row not found', 404, 'row_not_found')
    return found
  }),
  deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    const error = deleteErrors[`${tableId}/${rowId}`]
    if (error) throw error
    const rows = tables[tableId] ?? []
    const at = rows.findIndex(row => row.$id === rowId)
    if (at < 0) throw new AppwriteException('Row not found', 404, 'row_not_found')
    rows.splice(at, 1)
    deleted.push(`${tableId}/${rowId}`)
  }),
  updateRow: vi.fn(async () => ({})),
}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('listAllRows', listAllRows)
vi.stubGlobal('listAllRowsIfTableExists', listAllRowsIfTableExists)
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('resolveUserNames', async () => new Map<string, string>())

const { messagesDeleteUserData, messagesExportUserData } = await import('../server/utils/messagesUserData')

const event = { context: {} } as unknown as H3Event
const row = (id: string, extra: Record<string, unknown>): Row =>
  ({ $id: id, $createdAt: '2026-11-01T00:00:00.000Z', ...extra })
const serverError = () => new AppwriteException('Server Error', 500, 'general_unknown')

beforeEach(() => {
  tables = {
    message_blocks: [row('b1', { blockerId: 'u1', blockedId: 'u3' }), row('b2', { blockerId: 'u4', blockedId: 'u1' })],
    messages: [
      row('m1', { authorId: 'u1', conversationId: 'c1', body: 'hallo', reportedAt: '' }),
      row('m2', { authorId: 'u2', conversationId: 'c2', body: 'servus', reportedAt: '' }),
    ],
    conversation_members: [
      row('cm1', { userId: 'u1', conversationId: 'c1' }),
      row('cm2', { userId: 'u2', conversationId: 'c1' }),
      row('cm3', { userId: 'u1', conversationId: 'c2' }),
    ],
    conversations: [
      row('c1', { participants: ['u1', 'u2'], starterId: 'u1', lastMessageAt: '' }),
      row('c2', { participants: ['u1', 'u2'], starterId: 'u2', lastMessageAt: '' }),
    ],
  }
  errors = {}
  deleteErrors = {}
  getErrors = {}
  deleted = []
})

describe('messagesDeleteUserData — Lesen ist streng', () => {
  it('Normalfall: Sperren, eigene Nachricht, Mitglieds-Zeilen, leere Konversation', async () => {
    expect(await messagesDeleteUserData(event, 'u1')).toEqual({ deleted: 7, anonymized: 0 })
    expect(deleted).toContain('conversations/c1')
    expect(deleted).not.toContain('conversations/c2')
  })

  for (const table of ['message_blocks', 'messages', 'conversation_members']) {
    it(`ein 500 auf ${table} ⇒ die Löschung bricht ab`, async () => {
      errors[table] = serverError()
      await expect(messagesDeleteUserData(event, 'u1')).rejects.toThrow()
    })
  }

  it('ein 500 auf die Rest-Abfrage einer Konversation ⇒ Abbruch statt „überspringen"', async () => {
    errors['messages:conversationId'] = serverError()
    await expect(messagesDeleteUserData(event, 'u1')).rejects.toThrow()
  })

  it('ein 500 auf die Waisen-Abfrage ⇒ Abbruch', async () => {
    errors['conversation_members:conversationId'] = serverError()
    await expect(messagesDeleteUserData(event, 'u1')).rejects.toThrow()
  })
})

describe('messagesDeleteUserData — Aufräum-Löschungen', () => {
  it('ein 500 auf die Konversation ⇒ der Rest läuft zu Ende, dann EIN Fehler ohne Ids', async () => {
    deleteErrors['conversations/c1'] = serverError()
    const error = await messagesDeleteUserData(event, 'u1').then(() => null, (e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    const message = (error as Error).message
    expect(message).toMatch(/1/)
    expect(message).not.toMatch(/c1|cm2|u1|hallo/)
    // Die Waisen-Zeile des Gegenübers ist trotzdem weg — der Lauf hat
    // weitergemacht, er meldet sich nur nicht mehr als vollständig.
    expect(deleted).toContain('conversation_members/cm2')
  })

  it('ein 500 auf eine Waisen-Zeile ⇒ Konversation trotzdem gelöscht, dann Fehler', async () => {
    deleteErrors['conversation_members/cm2'] = serverError()
    await expect(messagesDeleteUserData(event, 'u1')).rejects.toThrow()
    expect(deleted).toContain('conversations/c1')
  })

  it('ein 404 („schon weg") auf die Konversation ist Erfolg', async () => {
    deleteErrors['conversations/c1'] = new AppwriteException('Row not found', 404, 'row_not_found')
    await expect(messagesDeleteUserData(event, 'u1')).resolves.toMatchObject({ deleted: 6 })
  })
})

describe('messagesExportUserData', () => {
  it('Normalfall: beide Konversationen, eigene Sperre', async () => {
    const result = await messagesExportUserData(event, 'u1')
    expect(result.conversations).toHaveLength(2)
    expect(result.blocks).toHaveLength(1)
  })

  for (const table of ['message_blocks', 'conversation_members', 'messages']) {
    it(`ein 500 auf ${table} ⇒ der Export bricht ab`, async () => {
      errors[table] = serverError()
      await expect(messagesExportUserData(event, 'u1')).rejects.toThrow()
    })
  }

  it('ein 500 auf eine Konversation ⇒ der Export bricht ab', async () => {
    getErrors.c2 = serverError()
    await expect(messagesExportUserData(event, 'u1')).rejects.toThrow()
  })

  it('eine Konversation, die es nicht mehr gibt (404), fehlt — ohne Abbruch', async () => {
    tables.conversations = tables.conversations!.filter(c => c.$id !== 'c2')
    const result = await messagesExportUserData(event, 'u1')
    expect(result.conversations).toHaveLength(1)
  })
})
