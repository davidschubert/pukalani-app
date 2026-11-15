import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppwriteException } from 'node-appwrite'
import { pruneInviteRequests } from '../server/utils/inviteRequestPrune'

/**
 * DIE ADRESSE AM CODE FOLGT DER FRIST DER ANFRAGE (SEC-026, 2026-11-15).
 *
 * Bis hierher löschte der Lauf eine erledigte Anfrage nach 30 bzw. 90 Tagen —
 * aber `assignCode` hatte ihre Adresse vorher an den Code geschrieben
 * (`boundEmail` und, bei einem neuen Code, das Etikett „Anfrage <adresse>").
 * Dort stand sie danach für immer, in der Code-Liste des Betreibers. Gefälschte
 * Ablage, echte Funktion: geprüft wird, was am Ende in den Tabellen steht.
 */

interface FakeRow { $id: string, [key: string]: unknown }
interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

const NOW = Date.parse('2026-11-15T00:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const EMAIL = 'ada@example.com'

let tables: Record<string, FakeRow[]>
let failCodeUpdate: boolean
const logEvent = vi.fn()

function matches(row: FakeRow, queries: string[]): boolean {
  return queries.every((raw) => {
    const query = JSON.parse(raw) as ParsedQuery
    if (query.method !== 'equal' || !query.attribute) return true
    return (query.values ?? []).includes(row[query.attribute])
  })
}

const tablesDB = {
  listRows: async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    const rows = (tables[tableId] ?? []).filter(r => matches(r, queries))
    return { total: rows.length, rows: rows.map(r => ({ ...r })) }
  },
  getRow: async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    const row = (tables[tableId] ?? []).find(r => r.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404, 'row_not_found')
    return { ...row }
  },
  updateRow: async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    if (tableId === 'invite_codes' && failCodeUpdate) throw new AppwriteException('Server error', 500, 'general_unknown')
    const row = (tables[tableId] ?? []).find(r => r.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404, 'row_not_found')
    Object.assign(row, data)
    return { ...row }
  },
  deleteRow: async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    tables[tableId] = (tables[tableId] ?? []).filter(r => r.$id !== rowId)
  },
}

function request(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: 'r-1',
    $updatedAt: new Date(NOW - 91 * DAY).toISOString(),
    email: EMAIL,
    status: 'redeemed',
    redeemedAt: new Date(NOW - 91 * DAY).toISOString(),
    inviteCodeId: 'c-1',
    ...overrides,
  }
}

function code(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: 'c-1',
    codeHash: 'h1',
    label: `Anfrage ${EMAIL}`,
    boundEmail: EMAIL,
    requestId: 'r-1',
    uses: 1,
    maxUses: 1,
    status: 'active',
    ...overrides,
  }
}

beforeEach(() => {
  failCodeUpdate = false
  logEvent.mockClear()
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
  vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
  vi.stubGlobal('logEvent', logEvent)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pruneInviteRequests — die Adresse geht auch vom Code', () => {
  it('eingelöste Anfrage nach 90 Tagen: Zeile weg, Code bleibt ohne Adresse in boundEmail und Etikett', async () => {
    tables = { invite_requests: [request()], invite_codes: [code()] }

    const result = await pruneInviteRequests(NOW)

    expect(result).toMatchObject({ deleted: 1, codesCleared: 1 })
    expect(tables.invite_requests).toHaveLength(0)
    expect(tables.invite_codes).toHaveLength(1)
    expect(tables.invite_codes![0]).toMatchObject({ $id: 'c-1', boundEmail: '', label: 'Anfrage', uses: 1 })
    expect(JSON.stringify(tables.invite_codes)).not.toContain(EMAIL)
  })

  it('findet den Code auch nur über `invite_codes.requestId` (Anfrage ohne inviteCodeId)', async () => {
    tables = { invite_requests: [request({ inviteCodeId: '' })], invite_codes: [code({ $id: 'c-2' })] }

    const result = await pruneInviteRequests(NOW)

    expect(result).toMatchObject({ deleted: 1, codesCleared: 1 })
    expect(tables.invite_codes![0]).toMatchObject({ $id: 'c-2', boundEmail: '' })
  })

  it('Gegenprobe: eine Anfrage in ihrer Frist lässt Zeile und Code unberührt', async () => {
    tables = {
      invite_requests: [request({ redeemedAt: new Date(NOW - 60 * DAY).toISOString() })],
      invite_codes: [code()],
    }

    const result = await pruneInviteRequests(NOW)

    expect(result).toMatchObject({ deleted: 0, codesCleared: 0 })
    expect(tables.invite_requests).toHaveLength(1)
    expect(tables.invite_codes![0]).toMatchObject({ boundEmail: EMAIL, label: `Anfrage ${EMAIL}` })
  })

  it('Gegenprobe: ein fremder Code (andere Anfrage, andere Adresse) bleibt, wie er ist', async () => {
    const foreign = code({ $id: 'c-9', requestId: 'r-9', boundEmail: 'bob@example.com', label: 'Anfrage bob@example.com' })
    tables = { invite_requests: [request()], invite_codes: [code(), foreign] }

    await pruneInviteRequests(NOW)

    expect(tables.invite_codes!.find(r => r.$id === 'c-9')).toEqual(foreign)
  })

  it('scheitert das Leeren des Codes, bleibt die Anfrage stehen — der nächste Lauf versucht es wieder', async () => {
    tables = { invite_requests: [request()], invite_codes: [code()] }
    failCodeUpdate = true

    const result = await pruneInviteRequests(NOW)

    expect(result).toMatchObject({ deleted: 0, codesCleared: 0 })
    expect(tables.invite_requests).toHaveLength(1)
    expect(tables.invite_codes![0]).toMatchObject({ boundEmail: EMAIL })
    expect(logEvent).toHaveBeenCalledWith('warn', 'invite.prune_code_failed', expect.objectContaining({ requestId: 'r-1' }))

    // Nächster Lauf, Störung vorbei: jetzt geht beides.
    failCodeUpdate = false
    const retry = await pruneInviteRequests(NOW)
    expect(retry).toMatchObject({ deleted: 1, codesCleared: 1 })
    expect(tables.invite_codes![0]).toMatchObject({ boundEmail: '' })
  })
})
