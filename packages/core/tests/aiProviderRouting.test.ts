import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * PROVIDER-ROUTING DES TEXT-WEGES — seit P17 (SEC-005) sendet der TRANSPORT
 * die Bindung selbst: keine Speicherung (`zdr`), kein Sammeln
 * (`data_collection: 'deny'`), kein Ausweichen (`allow_fallbacks: false`) und
 * ein Rechenort in Europa (`only`). Keine Aufrufstelle muss daran denken,
 * keine kann es weglassen.
 *
 * Geprüft wird der tatsächlich abgeschickte Body, nicht der Aufruf — eine
 * Option, die unterwegs verloren geht, sähe im Code korrekt aus.
 *
 * Die EU-Liste steht hier WÖRTLICH und nicht als Import: der Test soll auch
 * dann etwas sagen, wenn die Konstante im Core verrutscht.
 */
const EU = ['amazon-bedrock/eu-west-1', 'google-vertex/europe']
const BOUND = { zdr: true, data_collection: 'deny', only: EU, allow_fallbacks: false }

const appConfig = { pukalani: { ai: { enabled: true, model: 'test/model', baseUrl: 'https://openrouter.test/api/v1' } } }
vi.stubGlobal('useAppConfig', () => appConfig)
vi.stubGlobal('createError', (init: Record<string, unknown>) => Object.assign(new Error(String(init.statusText)), init))
vi.stubGlobal('readInstanceSecret', async () => '')
vi.stubGlobal('useRuntimeConfig', () => ({ aiKey: '' }))

const { aiComplete, aiCompleteJson, buildAiRequestBody } = await import('../server/utils/aiComplete')
const { aiCompleteStream } = await import('../server/utils/aiCompleteStream')

const event = {} as H3Event

const fetchMock = vi.fn(async () => ({
  ok: true,
  status: 200,
  text: async () => '',
  json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
}))
vi.stubGlobal('fetch', fetchMock)

function sentBody(call = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[call]?.[1] as unknown as { body: string }
  return JSON.parse(init.body) as Record<string, unknown>
}

function streamResponse() {
  const encoder = new TextEncoder()
  const pieces = ['data: {"choices":[{"delta":{"content":"x"}}]}\n\n', 'data: [DONE]\n\n']
  let index = 0
  return {
    ok: true,
    status: 200,
    text: async () => '',
    body: {
      getReader: () => ({
        read: async () => (index < pieces.length
          ? { done: false, value: encoder.encode(pieces[index++]!) }
          : { done: true, value: undefined }),
      }),
    },
  }
}

beforeEach(() => {
  fetchMock.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('buildAiRequestBody — die Bindung ist die Voreinstellung', () => {
  it('OHNE Option trägt der Body den vollen Block mit den zwei EU-Endpunkten', () => {
    const body = buildAiRequestBody({ model: 'm', prompt: 'p' })
    expect(body).toEqual({
      model: 'm',
      messages: [{ role: 'user', content: 'p' }],
      temperature: 0.2,
      max_tokens: 700,
      provider: BOUND,
    })
  })

  it('KM1: Haiku 5.5 bekommt „Denken aus", Haiku 4.5 und andere Modelle nicht', () => {
    const neu = buildAiRequestBody({ model: 'anthropic/claude-haiku-5.5', prompt: 'p', stream: true })
    expect(neu.reasoning).toEqual({ effort: 'none' })
    expect(neu.provider).toEqual(BOUND)
    expect(neu.stream).toBe(true)
    // Gegenprobe: das heutige Modell schickt genau den bisherigen Body.
    const heute = buildAiRequestBody({ model: 'anthropic/claude-haiku-4.5', prompt: 'p' })
    expect(heute).not.toHaveProperty('reasoning')
    expect(Object.keys(heute)).toEqual(['model', 'messages', 'temperature', 'max_tokens', 'provider'])
  })

  it('Schlüsselreihenfolge wie bisher bei den brand-Aufrufen (zdr, data_collection, only, allow_fallbacks)', () => {
    const provider = buildAiRequestBody({ model: 'm', prompt: 'p' }).provider as Record<string, unknown>
    expect(Object.keys(provider)).toEqual(['zdr', 'data_collection', 'only', 'allow_fallbacks'])
  })

  it('die drei Zusagen lassen sich NICHT abschalten', () => {
    const body = buildAiRequestBody({
      model: 'm',
      prompt: 'p',
      providerRouting: { zdr: false, dataCollection: 'allow', allowFallbacks: true },
    })
    expect(body.provider).toEqual(BOUND)
  })

  it('eine eigene `only`-Liste ersetzt NUR den Ort', () => {
    const body = buildAiRequestBody({
      model: 'm',
      prompt: 'p',
      providerRouting: { zdr: false, allowFallbacks: true, only: ['google-vertex/eu'] },
    })
    expect(body.provider).toEqual({ ...BOUND, only: ['google-vertex/eu'] })
  })

  it('eine LEERE Liste ist ein Fehler vor dem Senden, kein stiller Rückfall', () => {
    expect(() => buildAiRequestBody({ model: 'm', prompt: 'p', providerRouting: { only: [] } }))
      .toThrow(expect.objectContaining({ status: 500, statusText: 'AI routing invalid' }))
  })

  it('kopiert die Allowlist, statt die Aufrufer-Liste zu verlinken', () => {
    const only = ['google-vertex/eu']
    const body = buildAiRequestBody({ model: 'm', prompt: 'p', providerRouting: { only } })
    only.push('someone-else')
    expect((body.provider as { only: string[] }).only).toEqual(['google-vertex/eu'])
  })

  it('trägt `stream` nur, wenn wahr', () => {
    expect('stream' in buildAiRequestBody({ model: 'm', prompt: 'p' })).toBe(false)
    expect('stream' in buildAiRequestBody({ model: 'm', prompt: 'p', stream: false })).toBe(false)
    expect(buildAiRequestBody({ model: 'm', prompt: 'p', stream: true }).stream).toBe(true)
  })

  it('behält System-Prompt, Temperatur und Token-Deckel', () => {
    const body = buildAiRequestBody({ model: 'm', prompt: 'p', system: 's', temperature: 0, maxTokens: 42 })
    expect(body.messages).toEqual([{ role: 'system', content: 's' }, { role: 'user', content: 'p' }])
    expect(body.temperature).toBe(0)
    expect(body.max_tokens).toBe(42)
  })
})

describe('der WIRKLICH abgeschickte Body — ohne jede Option', () => {
  it('aiComplete', async () => {
    await aiComplete(event, 'p', { apiKey: 'k' })
    expect(sentBody().provider).toEqual(BOUND)
  })

  it('aiCompleteJson', async () => {
    await aiCompleteJson(event, 'p', { apiKey: 'k' })
    expect(sentBody().provider).toEqual(BOUND)
  })

  it('aiCompleteStream', async () => {
    fetchMock.mockResolvedValueOnce(streamResponse() as never)
    await aiCompleteStream(event, 'p', { apiKey: 'k' })
    expect(sentBody().provider).toEqual(BOUND)
    expect(sentBody().stream).toBe(true)
  })

  it('eine Aufrufstelle mit der brand-Konstante sendet denselben Body wie eine ohne', async () => {
    await aiComplete(event, 'p', { apiKey: 'k' })
    await aiComplete(event, 'p', {
      apiKey: 'k',
      providerRouting: { zdr: true, dataCollection: 'deny', allowFallbacks: false, only: EU },
    })
    // Der Rumpf als ZEICHENKETTE — also auch die Reihenfolge der Schlüssel.
    const raw = (call: number) => (fetchMock.mock.calls[call]?.[1] as unknown as { body: string }).body
    expect(raw(1)).toBe(raw(0))
  })
})

describe('leere Ortsliste — kein Request', () => {
  it('aiComplete: 500 und KEIN fetch', async () => {
    await expect(aiComplete(event, 'p', { apiKey: 'k', providerRouting: { only: [] } }))
      .rejects.toMatchObject({ status: 500, statusText: 'AI routing invalid' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('aiCompleteStream: 500 und KEIN fetch', async () => {
    await expect(aiCompleteStream(event, 'p', { apiKey: 'k', providerRouting: { only: [] } }))
      .rejects.toMatchObject({ status: 500, statusText: 'AI routing invalid' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
