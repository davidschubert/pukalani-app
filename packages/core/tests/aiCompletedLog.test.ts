import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * KI1 (d) — JEDER ERFOLGREICHE TEXT-LAUF EINE ZEILE `ai.completed`.
 *
 * Anbieter, Tokens und die Kosten, die der Vermittler in `usage.cost` meldet.
 * Geprüft wird die genaue Feldliste (kein Prompt, kein Antworttext), dass ein
 * fehlender Betrag NICHT geschätzt wird und dass ein Ausfall keine
 * `ai.completed`-Zeile schreibt.
 */

const MODEL = 'probe/model'
const SECRET_TEXT = 'Geheimer Kundeninhalt'

vi.stubGlobal('useAppConfig', () => ({ pukalani: { ai: { enabled: true, model: MODEL, baseUrl: 'https://openrouter.test/api/v1' } } }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('readInstanceSecret', async () => '')
vi.stubGlobal('useRuntimeConfig', () => ({ aiKey: 'k-test', public: { appwriteDatabaseId: 'db' } }))
vi.stubGlobal('createAdminClient', () => ({
  tablesDB: { getRow: async () => { throw new Error('kein app_config') } },
}))
vi.stubGlobal('resolveAiKey', async () => 'k-test')

const { aiComplete } = await import('../server/utils/aiComplete')
const { aiCompleteStream } = await import('../server/utils/aiCompleteStream')
const { aiProviderSlug, aiUsageCost } = await import('../server/utils/aiLog')
const { clearAiKillSwitches } = await import('../server/utils/aiKillSwitch')

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const printed: string[] = []

function completedLines(): Record<string, unknown>[] {
  return printed
    .filter(line => line.startsWith('{') && line.includes('"event":"ai.completed"'))
    .map(line => JSON.parse(line) as Record<string, unknown>)
}

function jsonResponse(payload: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(payload), json: async () => payload, body: null }
}

function streamResponse(frames: string[]) {
  const encoder = new TextEncoder()
  let index = 0
  return {
    ok: true,
    status: 200,
    text: async () => '',
    body: {
      getReader: () => ({
        read: async () => (index < frames.length
          ? { done: false, value: encoder.encode(frames[index++]!) }
          : { done: true, value: undefined }),
      }),
    },
  }
}

beforeEach(() => {
  printed.length = 0
  fetchMock.mockReset()
  clearAiKillSwitches()
  for (const level of ['error', 'warn', 'log', 'info'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { printed.push(String(args[0])) })
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('aiComplete — ai.completed', () => {
  it('schreibt Anbieter, Tokens und Kosten, aber keinen Text', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      id: 'gen-1',
      provider: 'Amazon Bedrock',
      choices: [{ message: { content: SECRET_TEXT }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 120, completion_tokens: 30, cost: 0.0004512345 },
    }))
    await expect(aiComplete({} as H3Event, SECRET_TEXT, { model: MODEL, label: 'probe' })).resolves.toBe(SECRET_TEXT)

    const lines = completedLines()
    expect(lines).toHaveLength(1)
    const { time, ms, run, ...rest } = lines[0]!
    expect(typeof time).toBe('string')
    expect(typeof ms).toBe('number')
    expect(run).toMatch(/^[0-9a-f]{8}$/)
    expect(rest).toEqual({
      level: 'info',
      event: 'ai.completed',
      label: 'probe',
      model: MODEL,
      provider: 'amazon-bedrock',
      tokensIn: 120,
      tokensOut: 30,
      costUsd: 0.000451,
    })
    expect(printed.join('\n')).not.toContain(SECRET_TEXT)
  })

  it('ohne `usage.cost` fehlt das Feld — es wird nichts geschätzt', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 5, completion_tokens: 1 },
    }))
    await aiComplete({} as H3Event, 'p', { model: MODEL, label: 'probe' })
    const line = completedLines()[0]!
    expect(line).not.toHaveProperty('costUsd')
    expect(line).not.toHaveProperty('provider')
    expect(line).toMatchObject({ tokensIn: 5, tokensOut: 1 })
  })

  it('ein Ausfall schreibt keine ai.completed-Zeile', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => '', json: async () => ({}) })
    await expect(aiComplete({} as H3Event, 'p', { model: MODEL, label: 'probe' })).rejects.toMatchObject({ status: 502 })
    expect(completedLines()).toHaveLength(0)
  })
})

describe('aiCompleteStream — ai.completed', () => {
  it('der fertige Strom schreibt Anbieter, Tokens und Kosten aus dem letzten Frame', async () => {
    fetchMock.mockResolvedValue(streamResponse([
      `data: ${JSON.stringify({ id: 'gen-2', model: MODEL, provider: 'Google', choices: [{ delta: { content: SECRET_TEXT } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 40, completion_tokens: 8, total_tokens: 48, cost: 0.0012 } })}\n\n`,
      'data: [DONE]\n\n',
    ]))
    const result = await aiCompleteStream({} as H3Event, 'p', { model: MODEL, label: 'probe' })
    expect(result.usage).toEqual({ promptTokens: 40, completionTokens: 8, totalTokens: 48, cost: 0.0012 })

    const lines = completedLines()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ label: 'probe', provider: 'google', tokensIn: 40, tokensOut: 8, costUsd: 0.0012 })
    expect(printed.join('\n')).not.toContain(SECRET_TEXT)
  })
})

describe('Hilfen', () => {
  it.each([
    ['Amazon Bedrock', 'amazon-bedrock'],
    ['Google Vertex (Europe)', 'google-vertex-europe'],
    ['', undefined],
    [42, undefined],
  ])('aiProviderSlug(%j) ⇒ %j', (input, expected) => {
    expect(aiProviderSlug(input)).toBe(expected)
  })

  it.each([
    [{ cost: 0.01 }, 0.01],
    [{ cost: 0 }, 0],
    [{ cost: -1 }, null],
    [{ cost: '0.01' }, null],
    [{ cost: Number.NaN }, null],
    [null, null],
  ])('aiUsageCost(%j) ⇒ %j', (input, expected) => {
    expect(aiUsageCost(input)).toBe(expected)
  })
})
