import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import type { InsightsWatchItem } from '../shared/insightsWatchlist'
import type { InsightsWatchRow } from '../shared/insightsRows'
import { fromInsightsWatchItem, toInsightsWatchItem } from '../shared/insightsRows'
import { insightsDb, isInsightsRowMissing } from '../server/utils/insightsStore'
import { insightsPostMissing, insightsStorageError, loadInsightsPostRow } from '../server/utils/insightsPostsAdmin'
import {
  acquireRunLease,
  dropRunLease,
  finishRunLease,
  keepRunLeaseAlive,
  runDetached,
} from '../../core/server/utils/runLease'
import { memoryStore } from '../../core/tests/support/runLeaseMemoryStore'

/**
 * BE-012 — DER VIDEO-BRIEF STARTET NUR NEU, WENN DER ENTWURF WIRKLICH WEG IST
 * (Davids Entscheidung: „nicht bei jeder Störung").
 *
 * Echte Route, echtes `loadInsightsPostRow` (es entscheidet, was „gelöscht"
 * heisst), gefälschte Ablage. Gestellt sind nur die Nitro-Auto-Imports und
 * alles HINTER der Drossel — gezählt wird, ob die Route bis dorthin kommt.
 *
 *  1. Lesen des Entwurfs scheitert (500, Netz) ⇒ 503 `brief_lookup_failed`,
 *     Verweis bleibt, keine Drossel-Buchung, kein Stempel, kein Anbieter.
 *  2. GEGENPROBE: der Entwurf ist gelöscht (404) ⇒ Verweis geräumt, Lauf
 *     startet (202, Anbieter gerufen).
 *  3. Der Entwurf steht ⇒ 409 `brief_exists` wie bisher.
 */

vi.mock('../server/contracts/brandContract', () => ({
  BRAND_PROVIDER_ROUTING_VERTEX_EU: { order: ['google-vertex/europe'], allow_fallbacks: false },
}))

type LookupMode = 'exists' | 'missing' | 'server_error' | 'network'
let lookupMode: LookupMode
let watchRow: InsightsWatchRow

const tablesDB = {
  getRow: vi.fn(async () => {
    if (lookupMode === 'missing') throw new AppwriteException('Row not found', 404)
    if (lookupMode === 'server_error') throw new AppwriteException('Server Error', 500)
    if (lookupMode === 'network') throw new Error('fetch failed')
    return { $id: 'post-old', state: 'draft' }
  }),
}

const updateInsightsWatchRow = vi.fn(async (_event: H3Event, _rowId: string, data: Record<string, unknown>) => {
  Object.assign(watchRow, data)
  return toInsightsWatchItem(watchRow)
})
const insightsBeginAiRun = vi.fn(async () => ({}))
const aiVideoJsonDetailed = vi.fn(async () => ({ value: null }))

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('requirePermission', () => ({ $id: 'redaktion' }))
vi.stubGlobal('getRouterParam', () => 'dQw4w9WgXcQ')
vi.stubGlobal('readValidatedBody', async (_event: H3Event, parse: (input: unknown) => unknown) => parse(undefined))
vi.stubGlobal('setResponseStatus', () => {})
vi.stubGlobal('insightsWatchMissing', () => Object.assign(new Error('missing'), { status: 404 }))
vi.stubGlobal('findInsightsWatchRow', async () => watchRow)
vi.stubGlobal('updateInsightsWatchRow', updateInsightsWatchRow)
vi.stubGlobal('getEffectiveAiVideoConfig', async () => ({ enabled: true, model: 'google/gemini-2.5-flash' }))
vi.stubGlobal('insightsBeginAiRun', insightsBeginAiRun)
vi.stubGlobal('insightsLogAi', () => {})
vi.stubGlobal('insightsAiErrorCode', () => 'brief_failed')
vi.stubGlobal('aiVideoJsonDetailed', aiVideoJsonDetailed)
vi.stubGlobal('findFreeInsightsSlug', async () => 'ein-video')
vi.stubGlobal('createInsightsPostRow', async () => ({ $id: 'post-new' }))
// Die ECHTEN Helfer, als Auto-Import gestellt.
vi.stubGlobal('insightsDb', insightsDb)
vi.stubGlobal('isInsightsRowMissing', isInsightsRowMissing)
vi.stubGlobal('insightsPostMissing', insightsPostMissing)
vi.stubGlobal('insightsStorageError', insightsStorageError)
vi.stubGlobal('loadInsightsPostRow', loadInsightsPostRow)
vi.stubGlobal('runDetached', runDetached)
// Die echte Lauf-Sperre (LL1 c) über einen Speicher-Store — hier nur Beiwerk.
vi.stubGlobal('appwriteRunLeaseStore', () => memoryStore())
vi.stubGlobal('acquireRunLease', acquireRunLease)
vi.stubGlobal('dropRunLease', dropRunLease)
vi.stubGlobal('finishRunLease', finishRunLease)
vi.stubGlobal('keepRunLeaseAlive', keepRunLeaseAlive)

const handler = (await import('../server/api/insights/watchlist/[videoId]/brief.post'))
  .default as unknown as (event: H3Event) => Promise<{ item: InsightsWatchItem }>

const event = { context: {} } as unknown as H3Event

function item(overrides: Partial<InsightsWatchItem> = {}): InsightsWatchItem {
  return {
    videoId: 'dQw4w9WgXcQ',
    verdict: 'interesting',
    note: '',
    topic: 'brand-strategy',
    addedAt: '2026-11-01T00:00:00.000Z',
    briefPostId: 'post-old',
    briefRunAt: '',
    briefError: '',
    available: true,
    refreshedAt: '',
    title: 'Ein Video',
    channelId: 'UC123',
    channelTitle: 'Ein Kanal',
    channelSubscribers: 1000,
    views: 100,
    likes: 10,
    commentCount: 1,
    publishedAt: '2026-10-01',
    ...overrides,
  }
}

/** Arbeit hinter der Antwort (`runDetached`) einmal laufen lassen. */
async function flushDetached(): Promise<void> {
  for (let round = 0; round < 10; round++) await Promise.resolve()
}

beforeEach(() => {
  watchRow = { $id: 'w1', $createdAt: '2026-11-01T00:00:00.000Z', ...fromInsightsWatchItem(item()) } as unknown as InsightsWatchRow
  updateInsightsWatchRow.mockClear()
  insightsBeginAiRun.mockClear()
  aiVideoJsonDetailed.mockClear()
  tablesDB.getRow.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('BE-012 · eine Störung beim Lesen des Entwurfs ist kein „gelöscht"', () => {
  for (const mode of ['server_error', 'network'] as const) {
    it(`${mode} ⇒ 503 brief_lookup_failed, Verweis bleibt, nichts gebucht, kein Lauf`, async () => {
      lookupMode = mode
      await expect(handler(event)).rejects.toMatchObject({ status: 503, data: { code: 'brief_lookup_failed' } })
      await flushDetached()

      expect(tablesDB.getRow).toHaveBeenCalledTimes(1)
      expect(watchRow.briefPostId).toBe('post-old')
      expect(updateInsightsWatchRow).not.toHaveBeenCalled()
      expect(insightsBeginAiRun).not.toHaveBeenCalled()
      expect(aiVideoJsonDetailed).not.toHaveBeenCalled()
    })
  }

  it('GEGENPROBE: der Entwurf ist gelöscht (404) ⇒ Verweis geräumt, der Lauf startet', async () => {
    lookupMode = 'missing'
    const result = await handler(event)
    await flushDetached()

    expect(updateInsightsWatchRow.mock.calls[0]?.[2]).toEqual({ briefPostId: '' })
    expect(result.item.briefRunAt).not.toBe('')
    expect(insightsBeginAiRun).toHaveBeenCalledTimes(1)
    expect(aiVideoJsonDetailed).toHaveBeenCalledTimes(1)
  })

  it('der Entwurf steht ⇒ 409 brief_exists wie bisher, nichts gebucht', async () => {
    lookupMode = 'exists'
    await expect(handler(event)).rejects.toMatchObject({ status: 409, data: { code: 'brief_exists' } })
    expect(updateInsightsWatchRow).not.toHaveBeenCalled()
    expect(insightsBeginAiRun).not.toHaveBeenCalled()
  })
})
