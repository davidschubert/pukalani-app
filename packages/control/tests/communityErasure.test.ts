import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { listAllRows } from '../../core/server/utils/listAllRows'
import { inviteCodeErasure } from '../shared/communityTeam'

/**
 * DSGVO-AUSKUNFT UND -LÖSCHUNG DES CONTROL PLANE ÜBER DIE NAHT, durchgespielt
 * (SEC-026, 2026-11-15) — gefälschte Ablage, echte Funktionen.
 *
 * Was vorher falsch war:
 *  1. Nach einer angenommenen Early-Access-Anfrage stand die Adresse nach der
 *     Kontolöschung weiter am Code — in `boundEmail` und im Etikett
 *     „Anfrage <adresse>", sichtbar in der Code-Liste des Betreibers.
 *  2. Die Auskunft verschwieg Codes, verschickte/angenommene Einladungen und
 *     die eigenen Missbrauchsmeldungen.
 *  3. Ein Lesefehler an `communities` wurde zu „Community stillgelegt" — und
 *     die Löschung entfernte dann die Zeile eines LETZTEN Owners.
 */

interface FakeRow { $id: string, $createdAt: string, $updatedAt?: string, [key: string]: unknown }
interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

const PROJECT = 'account'
const USER = 'u1'
const EMAIL = 'ada@example.com'

let tables: Record<string, FakeRow[]>
let communityReadError: unknown
let writes: { op: string, tableId: string, rowId: string }[]

function matches(row: FakeRow, filters: ParsedQuery[]): boolean {
  return filters.every(filter => filter.method !== 'equal' || (filter.values ?? []).includes(row[filter.attribute!]))
}

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    const parsed = queries.map(query => JSON.parse(query) as ParsedQuery)
    const limit = Number(parsed.find(query => query.method === 'limit')?.values?.[0] ?? 25)
    const cursor = parsed.find(query => query.method === 'cursorAfter')?.values?.[0]
    const all = (tables[tableId] ?? []).filter(row => matches(row, parsed))
    const start = cursor ? all.findIndex(row => row.$id === cursor) + 1 : 0
    return { rows: all.slice(start, start + limit), total: all.length }
  }),
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    if (tableId === 'communities' && communityReadError) throw communityReadError
    const row = (tables[tableId] ?? []).find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404, 'row_not_found')
    return row
  }),
  updateRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    writes.push({ op: 'update', tableId, rowId })
    const row = (tables[tableId] ?? []).find(entry => entry.$id === rowId)
    if (!row) throw new Error('Row not found')
    Object.assign(row, data)
    return row
  }),
  deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    writes.push({ op: 'delete', tableId, rowId })
    tables[tableId] = (tables[tableId] ?? []).filter(entry => entry.$id !== rowId)
    return {}
  }),
}

vi.mock('../server/utils/communityTeam', () => ({
  listCommunityMembers: async (_event: H3Event, communityId: string) =>
    (tables.community_members ?? []).filter(row => row.communityId === communityId),
  memberFacts: (row: FakeRow) => ({ id: row.$id, runtimeUserId: row.runtimeUserId, role: row.role, status: row.status }),
}))

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('listAllRows', listAllRows)
vi.stubGlobal('logEvent', () => {})

const { eraseCommunityUserData, exportCommunityUserData } = await import('../server/utils/communityErasure')

const event = {} as H3Event
const T = '2026-11-01T00:00:00.000Z'

/** Alle Fundstellen der Adresse in `invite_codes` (boundEmail oder Etikett). */
function addressHits(): string[] {
  return (tables.invite_codes ?? [])
    .filter(row => String(row.boundEmail ?? '').toLowerCase().includes(EMAIL) || String(row.label ?? '').toLowerCase().includes(EMAIL))
    .map(row => row.$id)
}

beforeEach(() => {
  communityReadError = undefined
  writes = []
  tables = {
    communities: [{ $id: 'c1', $createdAt: T, name: 'Club', host: 'club.pukalani.app', projectId: PROJECT, status: 'active' }],
    community_members: [
      { $id: 'm1', $createdAt: T, communityId: 'c1', runtimeProjectId: PROJECT, runtimeUserId: USER, role: 'owner', status: 'active', email: EMAIL },
    ],
    community_invites: [
      { $id: 'i1', $createdAt: T, $updatedAt: T, communityId: 'c1', email: 'bob@example.com', role: 'editor', tokenHash: 'h1', status: 'pending', expiresAt: T, invitedBy: USER, acceptedBy: '' },
      { $id: 'i2', $createdAt: T, $updatedAt: '2026-11-02T00:00:00.000Z', communityId: 'c1', email: EMAIL, role: 'viewer', tokenHash: 'h2', status: 'accepted', expiresAt: T, invitedBy: 'other', acceptedBy: USER },
    ],
    invite_requests: [
      { $id: 'r1', $createdAt: T, email: EMAIL, status: 'assigned', note: 'Verein' },
    ],
    invite_codes: [
      { $id: 'k1', $createdAt: T, codeHash: 'SECRET-HASH', label: `Anfrage ${EMAIL}`, boundEmail: EMAIL, requestId: 'r1', assignedAt: T, expiresAt: T, maxUses: 1, uses: 1, status: 'active', redeemedAt: T },
      { $id: 'k2', $createdAt: T, codeHash: 'OTHER-HASH', label: 'Anfrage bob@example.com', boundEmail: 'bob@example.com', requestId: 'r2', assignedAt: T, expiresAt: T, maxUses: 1, uses: 0, status: 'active', redeemedAt: null },
    ],
    abuse_reports: [
      { $id: 'a1', $createdAt: T, host: 'bad.pukalani.app', category: 'spam', message: 'Spam', url: 'https://bad.pukalani.app/x', reporterEmail: EMAIL, status: 'open', handledBy: 'op1', note: 'intern' },
      { $id: 'a2', $createdAt: T, host: 'bad.pukalani.app', category: 'spam', message: 'Fremd', url: null, reporterEmail: 'bob@example.com', status: 'open', handledBy: '', note: '' },
    ],
  }
})

describe('eraseCommunityUserData — Adresse am Early-Access-Code', () => {
  it('nach der Löschung findet eine Suche nach der Adresse in invite_codes nichts mehr', async () => {
    expect(addressHits()).toEqual(['k1'])
    const result = await eraseCommunityUserData(event, PROJECT, USER, EMAIL)
    expect(addressHits()).toEqual([])
    expect(result.inviteCodesAnonymized).toBe(1)
    const code = tables.invite_codes!.find(row => row.$id === 'k1')!
    expect(code).toMatchObject({ boundEmail: '', label: 'Anfrage', codeHash: 'SECRET-HASH', uses: 1 })
  })

  it('Gegenprobe: ein Code an einer anderen Adresse bleibt unberührt', async () => {
    await eraseCommunityUserData(event, PROJECT, USER, EMAIL)
    expect(tables.invite_codes!.find(row => row.$id === 'k2')).toMatchObject({
      boundEmail: 'bob@example.com', label: 'Anfrage bob@example.com',
    })
  })

  it('ein zweiter Lauf ändert nichts mehr', async () => {
    await eraseCommunityUserData(event, PROJECT, USER, EMAIL)
    writes = []
    const second = await eraseCommunityUserData(event, PROJECT, USER, EMAIL)
    expect(second.inviteCodesAnonymized).toBe(0)
    expect(writes.filter(write => write.tableId === 'invite_codes')).toEqual([])
  })

  it('ohne Adresse wird kein Code angefasst', async () => {
    const result = await eraseCommunityUserData(event, PROJECT, USER, '')
    expect(result.inviteCodesAnonymized).toBe(0)
    expect(addressHits()).toEqual(['k1'])
  })

  it('die Melder-Adresse bleibt bis zum 90-Tage-Lauf (Davids Entscheidung 2026-11-12)', async () => {
    await eraseCommunityUserData(event, PROJECT, USER, EMAIL)
    expect(tables.abuse_reports!.find(row => row.$id === 'a1')!.reporterEmail).toBe(EMAIL)
  })
})

describe('eraseCommunityUserData — Lesefehler an communities', () => {
  it('ein 500 beim Lesen der Community lässt die Löschung scheitern, die Owner-Zeile bleibt', async () => {
    communityReadError = new AppwriteException('Server Error', 500, 'general_unknown')
    await expect(eraseCommunityUserData(event, PROJECT, USER, EMAIL)).rejects.toThrow('Server Error')
    expect(tables.community_members!.map(row => row.$id)).toEqual(['m1'])
  })

  it('Gegenprobe: eine wirklich gelöschte Community (404 row_not_found) gibt die Zeile frei', async () => {
    tables.communities = []
    const result = await eraseCommunityUserData(event, PROJECT, USER, EMAIL)
    expect(result.deleted).toBe(1)
    expect(result.retained).toEqual([])
  })

  it('Gegenprobe: lesbare aktive Community hält den letzten Owner zurück', async () => {
    const result = await eraseCommunityUserData(event, PROJECT, USER, EMAIL)
    expect(result.retained).toHaveLength(1)
    expect(tables.community_members!.find(row => row.$id === 'm1')!.email).toBe('')
  })
})

describe('exportCommunityUserData', () => {
  it('zeigt den Code der Person ohne seinen Wert', async () => {
    const result = await exportCommunityUserData(event, PROJECT, USER, EMAIL)
    expect(result.inviteCodes).toEqual([{
      boundEmail: EMAIL, label: `Anfrage ${EMAIL}`, status: 'active', createdAt: T,
      assignedAt: T, expiresAt: T, redeemed: true, redeemedAt: T,
    }])
    expect(JSON.stringify(result)).not.toContain('SECRET-HASH')
    expect(JSON.stringify(result)).not.toContain('OTHER-HASH')
  })

  it('zeigt verschickte Einladungen ohne die Adresse der Eingeladenen, und angenommene', async () => {
    const result = await exportCommunityUserData(event, PROJECT, USER, EMAIL)
    expect(result.invitesSent).toEqual([{
      communityId: 'c1', communityName: 'Club', role: 'editor', status: 'pending', createdAt: T, lastChangedAt: T,
    }])
    expect(result.invitesAccepted).toEqual([expect.objectContaining({ communityId: 'c1', role: 'viewer', status: 'accepted' })])
    expect(JSON.stringify(result)).not.toContain('bob@example.com')
    expect(JSON.stringify(result)).not.toMatch(/"h[12]"/)
  })

  it('zeigt die eigenen Missbrauchsmeldungen, ohne Betreiber-Notiz', async () => {
    const result = await exportCommunityUserData(event, PROJECT, USER, EMAIL)
    expect(result.abuseReports).toEqual([{
      host: 'bad.pukalani.app', category: 'spam', url: 'https://bad.pukalani.app/x', message: 'Spam', status: 'open', createdAt: T,
    }])
    expect(JSON.stringify(result)).not.toContain('intern')
  })

  it('ein 500 beim Lesen der Community wirft, statt still einen Namen zu raten', async () => {
    communityReadError = new AppwriteException('Server Error', 500, 'general_unknown')
    await expect(exportCommunityUserData(event, PROJECT, USER, EMAIL)).rejects.toThrow('Server Error')
  })
})

describe('inviteCodeErasure (pur)', () => {
  it('nimmt die Adresse unabhängig von der Schreibweise aus Etikett und Bindung', () => {
    expect(inviteCodeErasure({ boundEmail: 'Ada@Example.com', label: 'Für <ADA@example.com>' }, EMAIL))
      .toEqual({ boundEmail: '', label: 'Für' })
  })

  it('ein Etikett, das nur aus der Adresse bestand, wird leer', () => {
    expect(inviteCodeErasure({ boundEmail: '', label: EMAIL }, EMAIL)).toEqual({ label: '' })
  })

  it('leere Adresse ⇒ nie ein Treffer', () => {
    expect(inviteCodeErasure({ boundEmail: '', label: '' }, '')).toBeNull()
  })
})
