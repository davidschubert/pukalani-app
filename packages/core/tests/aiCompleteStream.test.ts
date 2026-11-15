import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * DER STREAMING-TRANSPORT — zwei Behauptungen, die man nicht glauben, sondern
 * messen muss.
 *
 * 1. **Der Parser überlebt jede Zerreissung.** Ein Delta kommt in der Praxis
 *    nicht als hübsches Frame an, sondern als beliebiges Stück TCP-Nutzlast:
 *    mitten im JSON, mitten im Wort, mitten zwischen `\r` und `\n`. Ein Parser,
 *    der nur ganze Frames verträgt, sieht in der Entwicklung richtig aus und
 *    verliert in Produktion Text. Deshalb wird hier DIESELBE Nachricht
 *    byteweise durchgereicht und mit dem Ergebnis der Ein-Stück-Fassung
 *    verglichen.
 *
 * 2. **Die Datenschutz-Felder sind auf BEIDEN Pfaden identisch.** Der
 *    Brand-Wizard ist der erste Konsument des Streamings und zugleich der mit
 *    den strengsten Bedingungen (ZDR, `data_collection: 'deny'`, Allowlist,
 *    kein Fallback). Geprüft wird deshalb der WIRKLICH abgeschickte Body beider
 *    Pfade: er darf sich um genau ein Feld unterscheiden (`stream`).
 */

const appConfig = { pukalani: { ai: { enabled: true, model: 'test/model', baseUrl: 'https://openrouter.test/api/v1' } } }
vi.stubGlobal('useAppConfig', () => appConfig)
vi.stubGlobal('createError', (init: Record<string, unknown>) => Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('readInstanceSecret', async () => '')
vi.stubGlobal('useRuntimeConfig', () => ({ aiKey: 'test-key' }))

const {
  aiCompleteStream,
  decodeSseChunk,
  decodeSseFrame,
  decodeSseTail,
} = await import('../server/utils/aiCompleteStream')
const { aiComplete } = await import('../server/utils/aiComplete')

const event = {} as H3Event

/** Alle Ereignisse eines Stroms, der in `pieces` zerlegt ankommt. */
function decodeAll(pieces: readonly string[]) {
  let buffer = ''
  const events = []
  for (const piece of pieces) {
    const step = decodeSseChunk(buffer, piece)
    buffer = step.buffer
    events.push(...step.events)
  }
  events.push(...decodeSseTail(buffer))
  return events
}

/** Jeden einzelnen Buchstaben als eigenen Chunk — die härteste Zerreissung. */
function letterwise(text: string): string[] {
  return [...text]
}

const STREAM = [
  ': OPENROUTER PROCESSING\n\n',
  'data: {"model":"anthropic/claude-haiku-4.5","provider":"Anthropic","choices":[{"delta":{"content":"Hallo "}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"Welt"}}]}\n\n',
  'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":12,"completion_tokens":3,"total_tokens":15}}\n\n',
  'data: [DONE]\n\n',
].join('')

describe('decodeSseChunk — chunk-grenzen-fest', () => {
  it('liest einen ganzen Strom in EINEM Stück', () => {
    expect(decodeAll([STREAM])).toEqual([
      { kind: 'meta', model: 'anthropic/claude-haiku-4.5', provider: 'Anthropic' },
      { kind: 'delta', text: 'Hallo ' },
      { kind: 'delta', text: 'Welt' },
      { kind: 'usage', usage: { promptTokens: 12, completionTokens: 3, totalTokens: 15 } },
      { kind: 'done' },
    ])
  })

  it('liefert BUCHSTABENWEISE zerrissen exakt dasselbe', () => {
    expect(decodeAll(letterwise(STREAM))).toEqual(decodeAll([STREAM]))
  })

  it('überlebt eine Trennung mitten im JSON eines Deltas', () => {
    const raw = 'data: {"choices":[{"delta":{"content":"zerrissen"}}]}\n\n'
    const cut = raw.indexOf('zerr') + 2
    expect(decodeAll([raw.slice(0, cut), raw.slice(cut)]))
      .toEqual([{ kind: 'delta', text: 'zerrissen' }])
  })

  it('überlebt eine Trennung zwischen \\r und \\n', () => {
    const raw = 'data: {"choices":[{"delta":{"content":"crlf"}}]}\r\n\r\n'
    const cut = raw.length - 1
    expect(decodeAll([raw.slice(0, cut), raw.slice(cut)]))
      .toEqual([{ kind: 'delta', text: 'crlf' }])
  })

  it('gibt ein noch unvollständiges Frame NICHT heraus', () => {
    const step = decodeSseChunk('', 'data: {"choices":[{"delta":{"content":"halb"')
    expect(step.events).toEqual([])
    expect(step.buffer).toContain('halb')
  })

  it('holt ein letztes Frame OHNE abschliessende Leerzeile aus dem Puffer', () => {
    const step = decodeSseChunk('', 'data: {"choices":[{"delta":{"content":"letztes"}}]}')
    expect(step.events).toEqual([])
    expect(decodeSseTail(step.buffer)).toEqual([{ kind: 'delta', text: 'letztes' }])
  })

  it('GEGENPROBE: ohne Tail-Auswertung ginge genau dieses Delta verloren', () => {
    let buffer = ''
    const events = []
    for (const piece of ['data: {"choices":[{"delta":{"content":"letztes"}}]}']) {
      const step = decodeSseChunk(buffer, piece)
      buffer = step.buffer
      events.push(...step.events)
    }
    expect(events).toEqual([])
  })
})

describe('decodeSseFrame — was ignoriert und was gemeldet wird', () => {
  it('überspringt Keepalive-Kommentare und Nicht-data-Felder', () => {
    expect(decodeSseFrame(': ping')).toEqual([])
    expect(decodeSseFrame('event: message\nid: 42\nretry: 1000')).toEqual([])
  })

  it('überspringt unlesbares JSON, statt den Lauf abzubrechen', () => {
    expect(decodeAll(['data: {kaputt\n\n', 'data: {"choices":[{"delta":{"content":"weiter"}}]}\n\n']))
      .toEqual([{ kind: 'delta', text: 'weiter' }])
  })

  it('meldet ein Anbieter-FEHLERFRAME als Fehler — mit Kennung, OHNE seinen Text (P17)', () => {
    expect(decodeSseFrame('data: {"error":{"message":"rate limited","code":"rate_limit_exceeded"}}'))
      .toEqual([{ kind: 'error', tag: 'rate_limit_exceeded' }])
    // Eine Zahl ist auch eine Kennung, Fliesstext in `code` ist keine.
    expect(decodeSseFrame('data: {"error":{"message":"x","code":429}}'))
      .toEqual([{ kind: 'error', tag: '429' }])
    expect(decodeSseFrame('data: {"error":{"message":"x","code":"mein geheimer Text"}}'))
      .toEqual([{ kind: 'error', tag: 'stream_error' }])
  })

  it('verbindet mehrzeilige data-Felder mit Zeilenumbruch (SSE-Regel)', () => {
    expect(decodeSseFrame('data: {"choices":[{"delta":\ndata: {"content":"mehrzeilig"}}]}'))
      .toEqual([{ kind: 'delta', text: 'mehrzeilig' }])
  })

  it('lässt leere Deltas weg — sie sind kein Text', () => {
    expect(decodeSseFrame('data: {"choices":[{"delta":{"content":""}}]}')).toEqual([])
  })
})

// ── aiCompleteStream: Transport ─────────────────────────────────────────────

function streamingResponse(pieces: readonly string[], init: { ok?: boolean, status?: number } = {}) {
  const encoder = new TextEncoder()
  let index = 0
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: async () => pieces.join(''),
    body: {
      getReader: () => ({
        read: async () => (index < pieces.length
          ? { done: false, value: encoder.encode(pieces[index++]!) }
          : { done: true, value: undefined }),
      }),
    },
  }
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function sentBody(call = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[call]?.[1] as unknown as { body: string }
  return JSON.parse(init.body) as Record<string, unknown>
}

const ROUTING = {
  zdr: true,
  dataCollection: 'deny' as const,
  only: ['anthropic'],
  allowFallbacks: false,
}

describe('aiCompleteStream', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('sammelt Text, Modell, Anbieter und Usage', async () => {
    fetchMock.mockResolvedValue(streamingResponse([STREAM]))
    const deltas: string[] = []
    const result = await aiCompleteStream(event, 'Frage', { onDelta: text => void deltas.push(text) })

    expect(result.text).toBe('Hallo Welt')
    expect(result.model).toBe('anthropic/claude-haiku-4.5')
    expect(result.provider).toBe('Anthropic')
    expect(result.usage).toEqual({ promptTokens: 12, completionTokens: 3, totalTokens: 15 })
    expect(result.aborted).toBe(false)
    expect(deltas).toEqual(['Hallo ', 'Welt'])
  })

  it('reicht jedes Delta EINZELN durch, auch wenn ein Chunk mehrere trägt', async () => {
    fetchMock.mockResolvedValue(streamingResponse([
      'data: {"choices":[{"delta":{"content":"a"}}]}\n\ndata: {"choices":[{"delta":{"content":"b"}}]}\n\n',
    ]))
    const deltas: string[] = []
    await aiCompleteStream(event, 'Frage', { onDelta: text => void deltas.push(text) })
    expect(deltas).toEqual(['a', 'b'])
  })

  it('BAUT DEN BODY DURCH DIESELBE FUNKTION wie der Nicht-Streaming-Pfad', async () => {
    fetchMock.mockResolvedValue(streamingResponse([STREAM]))
    await aiCompleteStream(event, 'Frage', { system: 'Sys', providerRouting: ROUTING, maxTokens: 500 })

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({ choices: [{ message: { content: 'x' } }] }),
    })
    await aiComplete(event, 'Frage', { system: 'Sys', providerRouting: ROUTING, maxTokens: 500 })

    const streamed = sentBody(0)
    const plain = sentBody(1)
    // Die Datenschutz-Felder sind BUCHSTÄBLICH dieselben.
    expect(streamed.provider).toEqual({
      zdr: true,
      data_collection: 'deny',
      only: ['anthropic'],
      allow_fallbacks: false,
    })
    expect(streamed.provider).toEqual(plain.provider)
    // Und der Body unterscheidet sich um GENAU ein Feld.
    expect(streamed.stream).toBe(true)
    const { stream: _stream, ...rest } = streamed
    expect(rest).toEqual(plain)
  })

  it('ohne Routing sendet auch der Streaming-Body die volle Bindung (P17)', async () => {
    fetchMock.mockResolvedValue(streamingResponse([STREAM]))
    await aiCompleteStream(event, 'Frage')
    expect(sentBody(0).provider).toEqual({
      zdr: true,
      data_collection: 'deny',
      only: ['amazon-bedrock/eu-west-1', 'google-vertex/europe'],
      allow_fallbacks: false,
    })
  })

  it('ABBRUCH ist ein Ergebnis, kein Fehler — der Teiltext bleibt erhalten', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(async (_url: string, init: { signal: AbortSignal }) => {
      const encoder = new TextEncoder()
      let index = 0
      const pieces = ['data: {"choices":[{"delta":{"content":"Teil"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"Rest"}}]}\n\n']
      return {
        ok: true,
        status: 200,
        text: async () => '',
        body: {
          getReader: () => ({
            read: async () => {
              if (init.signal.aborted) {
                throw Object.assign(new Error('aborted'), { name: 'AbortError' })
              }
              return index < pieces.length
                ? { done: false, value: encoder.encode(pieces[index++]!) }
                : { done: true, value: undefined }
            },
          }),
        },
      }
    })

    const result = await aiCompleteStream(event, 'Frage', {
      signal: controller.signal,
      onDelta: () => { controller.abort() },
    })
    expect(result.aborted).toBe(true)
    expect(result.text).toBe('Teil')
  })

  it('ein Anbieter-Fehlerframe wird zum 502', async () => {
    fetchMock.mockResolvedValue(streamingResponse(['data: {"error":{"message":"nope"}}\n\n']))
    await expect(aiCompleteStream(event, 'Frage')).rejects.toMatchObject({ status: 502 })
  })

  it('ein HTTP-Fehler wird zum 502', async () => {
    fetchMock.mockResolvedValue(streamingResponse(['boom'], { ok: false, status: 500 }))
    await expect(aiCompleteStream(event, 'Frage')).rejects.toMatchObject({ status: 502 })
  })

  it('ohne Schlüssel gibt es 503 und KEINEN Request', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ aiKey: '' }))
    await expect(aiCompleteStream(event, 'Frage')).rejects.toMatchObject({ status: 503 })
    expect(fetchMock).not.toHaveBeenCalled()
    vi.stubGlobal('useRuntimeConfig', () => ({ aiKey: 'test-key' }))
  })
})
