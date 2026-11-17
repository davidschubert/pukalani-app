import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aiLogLine } from '../../core/server/utils/aiLog'
import { isCompleteTriage, triageTicket } from '../server/utils/ticketTriage'

/**
 * KI-EINORDNUNG UND DIE TOKEN-DECKE (EL1).
 *
 * Der Transport ist eine Attrappe (`aiCompleteJsonDetailed`): sie liefert das
 * gelesene JSON und den `finishReason`, so wie der echte Transport es tut,
 * wenn das JSON trotz Abschneiden lesbar war. Geprüft wird, was danach in
 * die Beschreibung geschrieben wird — und was nicht.
 */

const COMPLETE = {
  relevance: 4,
  priority: 'high',
  effort: 'medium',
  assessment: 'Sinnvoll, zuerst den Fehlerfall abdecken.',
  questions: [],
}

interface Thrown { status?: number, data?: { code?: string } }

let updates: Array<{ description: string }>
let warn: ReturnType<typeof vi.spyOn>
let error: ReturnType<typeof vi.spyOn>

function wire(completion: { value: unknown, finishReason: string }) {
  updates = []
  const tablesDB = {
    getRow: async () => ({ $id: 't-1', title: 'Titel', description: 'Text', checklist: '[]', label: '', priority: '', effort: '' }),
    updateRow: async ({ data }: { data: { description: string } }) => {
      updates.push(data)
      return { $id: 't-1', ...data }
    },
  }
  vi.stubGlobal('requirePermission', () => {})
  vi.stubGlobal('useAppConfig', () => ({}))
  vi.stubGlobal('getAiConfig', () => ({ enabled: true, model: 'test/model', baseUrl: 'https://ai.invalid/v1' }))
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'db' }, ticketsAiKey: 'k' }))
  vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
  vi.stubGlobal('readInstanceSecret', async () => '')
  vi.stubGlobal('resolveAiKey', async () => '')
  vi.stubGlobal('toH3Error', (e: unknown) => e)
  vi.stubGlobal('createError', (init: Record<string, unknown>) => Object.assign(new Error(String(init.statusText)), init))
  vi.stubGlobal('aiLogLine', aiLogLine)
  vi.stubGlobal('AI_TRUNCATED_CODE', 'ai_truncated')
  vi.stubGlobal('aiCompleteJsonDetailed', async () => ({ ...completion, promptTokens: 100, completionTokens: 700 }))
}

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const event = {} as Parameters<typeof triageTicket>[0]

describe('triageTicket — abgeschnittene Antwort', () => {
  it('fertige Antwort (stop) wird übernommen, kein Kennzeichen im Log', async () => {
    wire({ value: COMPLETE, finishReason: 'stop' })
    await triageTicket(event, 't-1')
    expect(updates).toHaveLength(1)
    expect(updates[0]!.description).toContain('Sinnvoll, zuerst den Fehlerfall abdecken.')
    expect(warn).not.toHaveBeenCalled()
  })

  it('abgeschnitten (length), aber vollständige Form ⇒ übernommen und im Log gekennzeichnet', async () => {
    wire({ value: COMPLETE, finishReason: 'length' })
    await triageTicket(event, 't-1')
    expect(updates).toHaveLength(1)
    expect(warn).toHaveBeenCalledTimes(1)
    const line = String(warn.mock.calls[0]![0])
    expect(line).toContain('[tickets] KI-Antwort abgeschnitten')
    expect(line).toContain('finish=length')
    expect(line).toContain('kept=1')
    expect(line).not.toContain('Sinnvoll')
  })

  it('abgeschnitten (length) mit unvollständiger Form ⇒ 502 ai_truncated, nichts geschrieben', async () => {
    wire({ value: { relevance: 4, priority: 'high' }, finishReason: 'length' })
    const thrown = await triageTicket(event, 't-1').then(() => null, (e: Thrown) => e)
    expect(thrown?.status).toBe(502)
    expect(thrown?.data?.code).toBe('ai_truncated')
    expect(updates).toHaveLength(0)
    expect(String(error.mock.calls[0]![0])).toContain('kept=0')
  })

  it('ohne Abschneiden bleibt die alte Klemmung: Lücken werden aufgefüllt', async () => {
    wire({ value: { relevance: 9 }, finishReason: 'stop' })
    await triageTicket(event, 't-1')
    expect(updates).toHaveLength(1)
    expect(updates[0]!.description).toContain('★★★★★')
  })
})

describe('isCompleteTriage', () => {
  it('verlangt alle fünf Felder in gültiger Form', () => {
    expect(isCompleteTriage(COMPLETE)).toBe(true)
    expect(isCompleteTriage({ ...COMPLETE, relevance: 6 })).toBe(false)
    expect(isCompleteTriage({ ...COMPLETE, priority: 'urgent' })).toBe(false)
    expect(isCompleteTriage({ ...COMPLETE, assessment: ' ' })).toBe(false)
    expect(isCompleteTriage({ ...COMPLETE, questions: undefined })).toBe(false)
    expect(isCompleteTriage({ ...COMPLETE, questions: [1] })).toBe(false)
    expect(isCompleteTriage(null)).toBe(false)
  })
})
