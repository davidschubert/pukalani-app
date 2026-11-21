import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { FeedbackActor } from '../shared/customerFeedback'
import { distinctFeedbackCommunities, toggleFeedbackVote } from '../server/utils/customerFeedback'

/**
 * EINE GESCHEITERTE STICHPROBE SCHREIBT KEINE FALSCHE ZAHL (Bahn 2).
 *
 * Nach jeder Stimme bestimmt `toggleFeedbackVote` die Breite („aus N
 * Communities") aus den Stimmen neu und schreibt sie in den Eintrag. Vorher
 * wurde aus einer gescheiterten Abfrage „nur die Community des Eintrags" — und
 * diese zu kleine Zahl GESPEICHERT. Jetzt bleibt der gespeicherte Wert.
 */

const feedbackRow = { $id: 'f-1', communityId: 'c-a', voteCount: 4, communityCount: 3, status: 'visible' }
let sampleFails = false
const updates: Array<Record<string, unknown>> = []

const tablesDB = {
  getRow: vi.fn(async () => feedbackRow),
  listRows: vi.fn(async ({ queries }: { queries: string[] }) => {
    const limit = queries.map(q => JSON.parse(q) as { method: string, values?: number[] }).find(q => q.method === 'limit')?.values?.[0]
    if (limit === 1000 && sampleFails) throw Object.assign(new Error('down'), { code: 500 })
    if (limit === 1000) return { total: 5, rows: [{ communityId: 'c-a' }, { communityId: 'c-b' }, { communityId: 'c-c' }, { communityId: 'c-d' }] }
    // Eigene Stimme: keine ⇒ der Klick legt eine an. Zählung: 5.
    return { total: queries.some(q => q.includes('voterKey')) ? 0 : 5, rows: [] }
  }),
  createRow: vi.fn(async () => ({})),
  deleteRow: vi.fn(async () => ({})),
  updateRow: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return {} }),
}

vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'db' } }))
vi.stubGlobal('createError', (input: { status: number, statusText: string }) => Object.assign(new Error(input.statusText), input))
vi.stubGlobal('toH3Error', (error: unknown) => error)
vi.stubGlobal('logEvent', vi.fn())
vi.spyOn(console, 'warn').mockImplementation(() => {})

const actor = { projectId: 'account', userId: 'u-1', name: 'P', email: '', communityId: 'c-d', communityName: 'D', isOperator: false } as FeedbackActor
const event = { context: {} } as unknown as H3Event

beforeEach(() => {
  sampleFails = false
  updates.length = 0
})

describe('toggleFeedbackVote — die Breite', () => {
  it('Lesefehler der Stichprobe ⇒ der gespeicherte Wert bleibt (keine zu kleine Zahl)', async () => {
    sampleFails = true
    const result = await toggleFeedbackVote(event, actor, 'f-1')
    expect(result.communityCount).toBe(3)
    expect(updates[0]).toMatchObject({ communityCount: 3, voteCount: 5 })
  })

  it('Gegenprobe: mit Stichprobe wird die Breite neu bestimmt', async () => {
    const result = await toggleFeedbackVote(event, actor, 'f-1')
    expect(result.communityCount).toBe(4)
    expect(updates[0]).toMatchObject({ communityCount: 4 })
  })

  it('distinctFeedbackCommunities zählt jede Community einmal', () => {
    expect(distinctFeedbackCommunities('c-a', [{ communityId: 'c-a' }, { communityId: 'c-b' }, {}])).toBe(2)
    expect(distinctFeedbackCommunities('', [])).toBe(0)
  })
})
