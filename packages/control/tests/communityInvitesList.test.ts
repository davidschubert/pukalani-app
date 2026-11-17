import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMMUNITY_INVITE_LIST_MAX } from '../shared/communityTeam'

/**
 * LISTE DER OFFENEN EINLADUNGEN (SR1 d): sie endet bei einer festen Grenze —
 * und sagt es, wenn es mehr gibt. Gegen den echten Helfer; gestubbt sind nur
 * Appwrite und die Nitro-Globals.
 */

let answer: { rows: { $id: string }[], total: number }
const listRows = vi.fn(async (_input: { queries: string[] }) => answer)
let mod: typeof import('../server/utils/communityTeam')

beforeAll(async () => {
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'db' } }))
  vi.stubGlobal('createAdminClient', () => ({ tablesDB: { listRows } }))
  vi.stubGlobal('toH3Error', (error: unknown) => error)
  mod = await import('../server/utils/communityTeam')
})

beforeEach(() => listRows.mockClear())

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ $id: `inv-${i}` }))

describe('listCommunityInvites', () => {
  it('fragt höchstens die Grenze ab (100)', async () => {
    answer = { rows: rows(3), total: 3 }
    await mod.listCommunityInvites({} as never, 'c-1')
    expect(COMMUNITY_INVITE_LIST_MAX).toBe(100)
    expect(listRows.mock.calls[0]![0].queries.some(q => q.includes('"limit"') && q.includes('100'))).toBe(true)
  })

  it('meldet nichts, solange alle offenen Einladungen in der Liste stehen', async () => {
    answer = { rows: rows(3), total: 3 }
    expect((await mod.listCommunityInvites({} as never, 'c-1')).truncated).toBe(false)
    answer = { rows: rows(100), total: 100 }
    expect((await mod.listCommunityInvites({} as never, 'c-1')).truncated).toBe(false)
  })

  it('meldet, wenn es mehr gibt, als die Liste trägt', async () => {
    answer = { rows: rows(100), total: 101 }
    const listed = await mod.listCommunityInvites({} as never, 'c-1')
    expect(listed.truncated).toBe(true)
    expect(listed.rows).toHaveLength(100)
  })
})
