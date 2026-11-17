import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { requirePermission } from '../../core/server/utils/requirePermission'
import { checkAiModelEndpoints } from '../../core/server/utils/aiModelCheck'
import { AI_BROKER_BASE_URL } from '../../core/shared/aiModelEndpoints'

/**
 * PATCH /api/tickets/settings — der zweite Speicherweg für ein KI-Modell aus
 * der Konsole (`app_config.ticketsAiModel`), dieselbe Prüfung wie
 * `admin/config.patch.ts` (KI1 c, 2026-11-17).
 *
 * Echt: Handler, Rechte-Prüfung, Prüf-Hilfe. Gestellt: Ablage, `fetch`, die
 * effektive Konfiguration. Wer durch darf, steht AUSGESCHRIEBEN: nur `admin`
 * (`system.manage`) — ein Moderator hält `tickets.manage`, das reicht hier nicht.
 */

let stored: { ticketsAiModel?: string }
let user: { $id: string, name: string, labels: string[] } | null
let body: Record<string, unknown>

const tablesDB = {
  getRow: vi.fn(async () => ({ $id: 'global', ...stored })),
  updateRow: vi.fn(async ({ data }: { data: { ticketsAiModel: string } }) => {
    stored = { ...stored, ...data }
    return stored
  }),
}
const fetchMock = vi.fn<typeof fetch>()

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('toH3Error', (error: unknown) => error)
vi.stubGlobal('readValidatedBody', async (_event: H3Event, run: (input: unknown) => unknown) => run(body))
vi.stubGlobal('getTicketsAiConfig', () => ({ enabled: true, model: 'anthropic/claude-haiku-4.5', defaultModel: 'anthropic/claude-haiku-4.5', baseUrl: AI_BROKER_BASE_URL }))
vi.stubGlobal('getEffectiveTicketsAiConfig', async () => ({ model: stored.ticketsAiModel || 'anthropic/claude-haiku-4.5', defaultModel: 'anthropic/claude-haiku-4.5' }))
vi.stubGlobal('requirePermission', requirePermission)
vi.stubGlobal('checkAiModelEndpoints', checkAiModelEndpoints)
vi.stubGlobal('fetch', fetchMock)

const handler = (await import('../server/api/tickets/settings.patch'))
  .default as unknown as (event: H3Event) => Promise<Record<string, unknown>>
const call = () => handler({ context: { user } } as unknown as H3Event)

const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status })
const withTags = (...tags: string[]) => json(200, { data: { endpoints: tags.map(tag => ({ tag })) } })

beforeEach(() => {
  stored = { ticketsAiModel: 'anthropic/claude-haiku-4.5' }
  user = { $id: 'u-admin', name: 'Ada', labels: ['admin'] }
  body = { model: 'openai/gpt-4o' }
  fetchMock.mockReset()
  tablesDB.getRow.mockClear()
  tablesDB.updateRow.mockClear()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('PATCH /api/tickets/settings — Rollen', () => {
  it.each([
    ['Gast', null, 401],
    ['Konto ohne Rolle', { $id: 'u-1', name: 'Udo', labels: [] }, 403],
    ['Moderator (hält tickets.manage)', { $id: 'u-2', name: 'Mo', labels: ['moderator'] }, 403],
  ] as const)('%s ⇒ %s, ohne Lesen und ohne Netz', async (_label, who, status) => {
    user = who === null ? null : { ...who, labels: [...who.labels] }
    await expect(call()).rejects.toMatchObject({ status })
    expect(tablesDB.getRow).not.toHaveBeenCalled()
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/tickets/settings — Modell-Prüfung beim Speichern', () => {
  it('neues Modell ohne EU-Ort ⇒ 422, nichts geschrieben', async () => {
    fetchMock.mockResolvedValue(withTags('openai/default'))
    await expect(call()).rejects.toMatchObject({ status: 422, data: { code: 'ai_model_no_eu_endpoint' } })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(stored.ticketsAiModel).toBe('anthropic/claude-haiku-4.5')
  })

  it('unbekanntes Modell ⇒ 422 `ai_model_unknown`', async () => {
    fetchMock.mockResolvedValue(json(404, {}))
    await expect(call()).rejects.toMatchObject({ status: 422, data: { code: 'ai_model_unknown' } })
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('unverändertes Modell und Zurücksetzen (leer) ⇒ kein Netz', async () => {
    body = { model: 'anthropic/claude-haiku-4.5' }
    await call()
    body = { model: '' }
    await call()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(stored.ticketsAiModel).toBe('')
  })

  it('Vermittler gestört ⇒ gespeichert mit `aiModelCheck: unverified`', async () => {
    fetchMock.mockResolvedValue(json(503, {}))
    await expect(call()).resolves.toMatchObject({ model: 'openai/gpt-4o', aiModelCheck: 'unverified' })
    expect(stored.ticketsAiModel).toBe('openai/gpt-4o')
  })

  it('EU-Ort vorhanden ⇒ gespeichert mit `aiModelCheck: ok`', async () => {
    fetchMock.mockResolvedValue(withTags('google-vertex/europe'))
    body = { model: 'google/gemini-2.5-flash' }
    await expect(call()).resolves.toMatchObject({ model: 'google/gemini-2.5-flash', aiModelCheck: 'ok' })
  })
})
