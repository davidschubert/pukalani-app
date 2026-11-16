import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * KI-AUSFÄLLE ALS ZÄHLBARE ZEILE (OPS-011, seit 2026-11-16).
 *
 * Ein täglicher Wächter zählt `ai.failed` (und `ai.disabled`) in den
 * pm2-Logs. Geprüft wird: je echtem Ausfall eines bezahlten Aufrufs GENAU
 * eine `ai.failed`-Zeile mit GENAU den Feldern `label`, `kind`, (`status`),
 * `model`, `run` — und KEINE bei den bewusst ausgenommenen Fällen
 * (abgewiesene Eingabe vor dem Senden, Qualitäts-Zeilen, Routing ungültig).
 * Die Textzeile aus P17 bleibt daneben stehen (aiTransportPolicy.test.ts).
 */

const MODEL = 'probe/model'
const VERTEX_EU = { only: ['google-vertex/eu'] } as const

const appConfig = {
  pukalani: {
    ai: {
      enabled: true,
      model: MODEL,
      visionModel: MODEL,
      imageModel: MODEL,
      videoModel: MODEL,
      baseUrl: 'https://openrouter.test/api/v1',
    },
  },
}
vi.stubGlobal('useAppConfig', () => appConfig)
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('readInstanceSecret', async () => '')
vi.stubGlobal('useRuntimeConfig', () => ({ aiKey: 'k-test', public: { appwriteDatabaseId: 'db' } }))
vi.stubGlobal('createAdminClient', () => ({
  tablesDB: { getRow: async () => { throw new Error('kein app_config') } },
}))
vi.stubGlobal('resolveAiKey', async () => 'k-test')
vi.stubGlobal('logEvent', () => {})

const { aiCompleteJson } = await import('../server/utils/aiComplete')
const { aiCompleteStream } = await import('../server/utils/aiCompleteStream')
const { aiImage } = await import('../server/utils/aiImage')
const { AI_VISION_MAX_IMAGES, aiVisionJson } = await import('../server/utils/aiVision')
const { aiVideoJsonDetailed } = await import('../server/utils/aiVideo')
const { clearAiKillSwitches, registerAiKillSwitch } = await import('../server/utils/aiKillSwitch')

const image = { mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) }
const video = { url: 'https://video.test/watch?v=1' }

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

type Kind = 'text' | 'stream' | 'image' | 'vision' | 'video'

/** Je Test ein eigenes Ereignis — der Abschalter merkt sich seine Antwort je Ereignis. */
const newEvent = () => ({}) as H3Event

const TRANSPORTS: ReadonlyArray<{ kind: Kind, call: (extra?: Record<string, unknown>) => Promise<unknown> }> = [
  { kind: 'text', call: extra => aiCompleteJson(newEvent(), 'p', { model: MODEL, label: 'probe', ...extra }) },
  { kind: 'stream', call: extra => aiCompleteStream(newEvent(), 'p', { model: MODEL, label: 'probe', ...extra }) },
  { kind: 'image', call: extra => aiImage(newEvent(), 'p', { model: MODEL, label: 'probe', providerRouting: VERTEX_EU, ...extra }) },
  { kind: 'vision', call: extra => aiVisionJson(newEvent(), [image], 'p', { model: MODEL, label: 'probe', providerRouting: VERTEX_EU, ...extra }) },
  { kind: 'video', call: extra => aiVideoJsonDetailed(newEvent(), [video], 'p', { model: MODEL, label: 'probe', providerRouting: VERTEX_EU, ...extra }) },
]

function response(init: { ok: boolean, status: number, text: string, json?: () => Promise<unknown>, frames?: string[], noBody?: boolean }) {
  const encoder = new TextEncoder()
  const frames = init.frames ?? [init.text]
  let index = 0
  return {
    ok: init.ok,
    status: init.status,
    text: async () => init.text,
    json: init.json ?? (async () => JSON.parse(init.text) as unknown),
    body: init.noBody
      ? null
      : {
          getReader: () => ({
            read: async () => (index < frames.length
              ? { done: false, value: encoder.encode(frames[index++]!) }
              : { done: true, value: undefined }),
          }),
        },
  }
}

const printed: Array<{ level: 'error' | 'warn' | 'log' | 'info', line: string }> = []

/** Die JSON-Zeilen eines Ereignisses, geparst. */
function jsonLines(event: string): Array<{ level: string, data: Record<string, unknown> }> {
  return printed
    .filter(entry => entry.line.startsWith('{') && entry.line.includes(`"event":"${event}"`))
    .map(entry => ({ level: entry.level, data: JSON.parse(entry.line) as Record<string, unknown> }))
}

/** Eine Zeile ohne die Zeit, deren Wert sich je Lauf ändert. */
function withoutTime(data: Record<string, unknown>): Record<string, unknown> {
  const { time, ...rest } = data
  expect(typeof time).toBe('string')
  return rest
}

function expectOneFailure(kind: 'http' | 'call' | 'stream', status?: number) {
  const lines = jsonLines('ai.failed')
  expect(lines).toHaveLength(1)
  expect(lines[0]!.level).toBe('error')
  const data = withoutTime(lines[0]!.data)
  expect(Object.keys(data).sort()).toEqual(
    ['event', 'kind', 'label', 'level', 'model', 'run', ...(status === undefined ? [] : ['status'])].sort(),
  )
  expect(data).toMatchObject({ level: 'error', event: 'ai.failed', label: 'probe', kind, model: MODEL })
  expect(data.run).toMatch(/^[0-9a-f]{8}$/)
  if (status !== undefined) expect(data.status).toBe(status)
}

beforeEach(() => {
  printed.length = 0
  fetchMock.mockReset()
  clearAiKillSwitches()
  for (const level of ['error', 'warn', 'log', 'info'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { printed.push({ level, line: String(args[0]) }) })
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  clearAiKillSwitches()
})

describe.each(TRANSPORTS)('$kind — ai.failed', ({ kind, call }) => {
  it('HTTP-Fehler des Vermittlers ⇒ genau eine Zeile kind http mit status', async () => {
    fetchMock.mockResolvedValue(response({ ok: false, status: 429, text: '{"error":{"code":"rate_limited"}}' }))
    await expect(call()).rejects.toMatchObject({ status: 502 })
    expectOneFailure('http', 429)
  })

  it('404 (kein Endpunkt unter der Bindung) zählt ebenfalls, mit status 404', async () => {
    fetchMock.mockResolvedValue(response({ ok: false, status: 404, text: '' }))
    await expect(call()).rejects.toMatchObject({ status: 503 })
    expectOneFailure('http', 404)
  })

  it('Netzfehler ⇒ genau eine Zeile kind call, ohne status', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    await expect(call()).rejects.toMatchObject({ status: 502 })
    expectOneFailure('call')
  })

  if (kind !== 'stream') {
    it('unlesbare Antwort (SyntaxError) ⇒ kind call', async () => {
      fetchMock.mockResolvedValue(response({ ok: true, status: 200, text: '', json: async () => { throw new SyntaxError('bad') } }))
      await expect(call()).rejects.toMatchObject({ status: 502 })
      expectOneFailure('call')
    })
  }

  it('Abschalter ⇒ eine ai.disabled-Zeile (warn), kein ai.failed, kein fetch', async () => {
    registerAiKillSwitch('probe', () => false)
    await expect(call()).rejects.toMatchObject({ status: 503 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(jsonLines('ai.failed')).toEqual([])
    const lines = jsonLines('ai.disabled')
    expect(lines).toHaveLength(1)
    expect(lines[0]!.level).toBe('warn')
    const data = withoutTime(lines[0]!.data)
    expect(Object.keys(data).sort()).toEqual(['event', 'label', 'level', 'model', 'run'])
    expect(data).toMatchObject({ level: 'warn', event: 'ai.disabled', label: 'probe', model: MODEL })
    expect(data.run).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('stream — ai.failed kind stream', () => {
  it('ohne Rumpf', async () => {
    fetchMock.mockResolvedValue(response({ ok: true, status: 200, text: '', noBody: true }))
    await expect(aiCompleteStream(newEvent(), 'p', { model: MODEL, label: 'probe' })).rejects.toMatchObject({ status: 502 })
    expectOneFailure('stream')
  })

  it('Fehlerframe', async () => {
    fetchMock.mockResolvedValue(response({
      ok: true,
      status: 200,
      text: '',
      frames: ['data: {"error":{"message":"x","code":"server_error"}}\n\n'],
    }))
    await expect(aiCompleteStream(newEvent(), 'p', { model: MODEL, label: 'probe' })).rejects.toMatchObject({ status: 502 })
    expectOneFailure('stream')
  })

  it('Zeitüberschreitung', async () => {
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      })
    }))
    await expect(aiCompleteStream(newEvent(), 'p', { model: MODEL, label: 'probe', timeoutMs: 5 })).rejects.toMatchObject({ status: 502 })
    expectOneFailure('stream')
  })

  it('von außen abgebrochen ist kein Ausfall', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      })
      controller.abort()
    }))
    await expect(aiCompleteStream(newEvent(), 'p', { model: MODEL, label: 'probe', signal: controller.signal })).resolves.toMatchObject({ aborted: true })
    expect(jsonLines('ai.failed')).toEqual([])
  })
})

describe('keine ai.failed-Zeile bei den ausgenommenen Fällen', () => {
  it('Vision: zu viele Bilder, vor dem Senden abgewiesen', async () => {
    const images = Array.from({ length: AI_VISION_MAX_IMAGES + 1 }, () => image)
    await expect(aiVisionJson(newEvent(), images, 'p', { model: MODEL, label: 'probe', providerRouting: VERTEX_EU })).rejects.toMatchObject({ status: 413 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(jsonLines('ai.failed')).toEqual([])
  })

  it('Video: ungültige Adresse, vor dem Senden abgewiesen', async () => {
    await expect(aiVideoJsonDetailed(newEvent(), [{ url: 'ftp://x.test/a' }], 'p', { model: MODEL, label: 'probe', providerRouting: VERTEX_EU }))
      .rejects.toMatchObject({ status: 400 })
    expect(jsonLines('ai.failed')).toEqual([])
  })

  it('Routing ungültig (Programmierfehler, eigener Fall)', async () => {
    await expect(aiImage(newEvent(), 'p', { model: MODEL, label: 'probe', providerRouting: { only: [] } })).rejects.toMatchObject({ status: 500 })
    expect(jsonLines('ai.failed')).toEqual([])
  })

  it.each(TRANSPORTS.filter(t => t.kind === 'text' || t.kind === 'vision' || t.kind === 'video'))('$kind: Antwort ohne JSON', async ({ call }) => {
    const text = JSON.stringify({ choices: [{ message: { content: 'kein Objekt' }, finish_reason: 'stop' }] })
    fetchMock.mockResolvedValue(response({ ok: true, status: 200, text }))
    await expect(call()).rejects.toMatchObject({ status: 502 })
    expect(jsonLines('ai.failed')).toEqual([])
  })

  it('text: abgeschnittene Antwort', async () => {
    const text = JSON.stringify({ choices: [{ message: { content: '{"a":"x' }, finish_reason: 'length' }] })
    fetchMock.mockResolvedValue(response({ ok: true, status: 200, text }))
    await expect(aiCompleteJson(newEvent(), 'p', { model: MODEL, label: 'probe' })).rejects.toMatchObject({ data: { code: 'ai_truncated' } })
    expect(jsonLines('ai.failed')).toEqual([])
  })

  it('text: erst nach Reparatur JSON — Erfolg, keine Zeile', async () => {
    const text = JSON.stringify({ choices: [{ message: { content: '{"a":"Marke „x" gut"}' }, finish_reason: 'stop' }] })
    fetchMock.mockResolvedValue(response({ ok: true, status: 200, text }))
    await aiCompleteJson(newEvent(), 'p', { model: MODEL, label: 'probe' })
    expect(jsonLines('ai.failed')).toEqual([])
  })
})

describe('Filterung wie in aiLogLine', () => {
  it('ein Modell mit unsicheren Zeichen wird zu ?', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    await expect(aiCompleteJson(newEvent(), 'p', { model: 'böses modell <x>', label: 'probe' })).rejects.toMatchObject({ status: 502 })
    const [line] = jsonLines('ai.failed')
    expect(line!.data.model).toBe('?')
  })
})
