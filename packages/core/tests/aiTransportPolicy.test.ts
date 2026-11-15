import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * DIE FÜNF KI-TRANSPORTE UNTER EINER REGEL (P17, SEC-005 + SEC-017).
 *
 *  1. „KEIN ENDPUNKT UNTER DER BINDUNG" SCHEITERT LAUT: antwortet der
 *     Vermittler 404 (bei OpenRouter „No allowed providers are available"),
 *     wird daraus 503 mit `data.code = 'ai_endpoint_unavailable'` — kein
 *     Ausweichen auf ein anderes Modell. Jeder andere Fehlerstatus bleibt 502
 *     ohne Code.
 *  2. IM LOG STEHT NUR EINE KENNUNG: kein Rumpf des Anbieters, kein Text der
 *     Antwort, kein rohes Fehlerobjekt, keine `message`. Geprüft wird das mit
 *     einem Marker, der in Antwort bzw. Rumpf steckt, gegen JEDES Argument
 *     jedes `console.error`/`console.warn`/`console.log`/`logEvent`-Aufrufs.
 *  3. Bild, Vision und Video: `zdr`, `data_collection: 'deny'` und
 *     `allow_fallbacks: false` sind fest; der ORT ist Pflicht des Aufrufers —
 *     ohne `only` geht nichts raus.
 */

const MARKER = 'GEHEIMER-ANTWORTTEXT-7f3a'
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

const logged: unknown[][] = []
vi.stubGlobal('logEvent', (...args: unknown[]) => { logged.push(args) })

const { aiCompleteJson } = await import('../server/utils/aiComplete')
const { aiCompleteStream } = await import('../server/utils/aiCompleteStream')
const { aiImage, buildAiImageRequestBody } = await import('../server/utils/aiImage')
const { aiVisionJson, buildAiVisionRequestBody } = await import('../server/utils/aiVision')
const { aiVideoJsonDetailed, buildAiVideoRequestBody } = await import('../server/utils/aiVideo')

const event = {} as H3Event
const image = { mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) }
const video = { url: 'https://video.test/watch?v=1' }

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

type Kind = 'text' | 'stream' | 'image' | 'vision' | 'video'

interface Transport {
  kind: Kind
  call: (extra?: Record<string, unknown>) => Promise<unknown>
}

const TRANSPORTS: readonly Transport[] = [
  { kind: 'text', call: extra => aiCompleteJson(event, 'p', { model: MODEL, label: 'probe', ...extra }) },
  { kind: 'stream', call: extra => aiCompleteStream(event, 'p', { model: MODEL, label: 'probe', ...extra }) },
  { kind: 'image', call: extra => aiImage(event, 'p', { model: MODEL, label: 'probe', providerRouting: VERTEX_EU, ...extra }) },
  { kind: 'vision', call: extra => aiVisionJson(event, [image], 'p', { model: MODEL, label: 'probe', providerRouting: VERTEX_EU, ...extra }) },
  { kind: 'video', call: extra => aiVideoJsonDetailed(event, [video], 'p', { model: MODEL, label: 'probe', providerRouting: VERTEX_EU, ...extra }) },
]

/** Ein Rumpf-Leser, der für jeden Transport passt (Stream liest `body`, die anderen `json`). */
function response(init: { ok: boolean, status: number, text: string, json?: () => Promise<unknown>, frames?: string[] }) {
  const encoder = new TextEncoder()
  const frames = init.frames ?? [init.text]
  let index = 0
  return {
    ok: init.ok,
    status: init.status,
    text: async () => init.text,
    json: init.json ?? (async () => JSON.parse(init.text) as unknown),
    body: {
      getReader: () => ({
        read: async () => (index < frames.length
          ? { done: false, value: encoder.encode(frames[index++]!) }
          : { done: true, value: undefined }),
      }),
    },
  }
}

function httpError(status: number) {
  const text = JSON.stringify({ error: { code: 'invalid_request_error', message: `Anfrage war: ${MARKER}` } })
  return response({ ok: false, status, text })
}

/** Alles, was in irgendein Log-Argument geraten ist — auch Fehlerobjekte samt `cause`. */
function serialize(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) {
    return [value.name, value.message, value.stack ?? '', serialize((value as { cause?: unknown }).cause)].join(' ')
  }
  try {
    return JSON.stringify(value) ?? String(value)
  }
  catch {
    return String(value)
  }
}

function allLogText(): string {
  return logged.flat().map(serialize).join('\n')
}

function probeLines(): string[] {
  return logged.map(args => args.map(serialize).join(' ')).filter(line => line.includes('[probe]'))
}

beforeEach(() => {
  logged.length = 0
  fetchMock.mockReset()
  for (const method of ['error', 'warn', 'log', 'info'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { logged.push(args) })
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

function expectCleanLine(opts: { status?: number } = {}) {
  expect(allLogText()).not.toContain(MARKER)
  const lines = probeLines()
  expect(lines.length).toBeGreaterThan(0)
  const line = lines.find(entry => entry.includes('run=')) ?? lines[0]!
  expect(line).toMatch(/ run=[0-9a-f]{8}\b/)
  expect(line).toContain(`model=${MODEL}`)
  expect(line).toMatch(/ ms=\d+/)
  if (opts.status !== undefined) expect(line).toContain(`status=${opts.status}`)
}

describe.each(TRANSPORTS)('$kind — Fehlerstatus', ({ call }) => {
  it('404 des Vermittlers ⇒ 503 mit data.code ai_endpoint_unavailable', async () => {
    const text = JSON.stringify({ error: { message: `No allowed providers are available for the selected model. ${MARKER}`, code: 404 } })
    fetchMock.mockResolvedValue(response({ ok: false, status: 404, text }))
    await expect(call()).rejects.toMatchObject({ status: 503, data: { code: 'ai_endpoint_unavailable' } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expectCleanLine({ status: 404 })
  })

  it('500 des Anbieters bleibt 502 OHNE Code', async () => {
    fetchMock.mockResolvedValue(httpError(500))
    const error = await call().catch((thrown: unknown) => thrown) as { status?: number, data?: unknown }
    expect(error.status).toBe(502)
    expect(error.data).toBeUndefined()
  })

  it('HTTP-Fehler mit Rumpf: im Log Status, Kennung, Modell, Dauer, Lauf — nie der Rumpf', async () => {
    fetchMock.mockResolvedValue(httpError(400))
    await expect(call()).rejects.toMatchObject({ status: 502 })
    expectCleanLine({ status: 400 })
    expect(probeLines().join('\n')).toContain('tag=invalid_request_error')
  })

  it('Netzfehler: nur `err=` und `cause=`, nie die message', async () => {
    fetchMock.mockRejectedValue(new TypeError(`fetch failed ${MARKER}`, { cause: { code: 'ECONNRESET', message: MARKER } }))
    await expect(call()).rejects.toMatchObject({ status: 502 })
    expectCleanLine()
    const line = probeLines().join('\n')
    expect(line).toContain('err=TypeError')
    expect(line).toContain('cause=ECONNRESET')
  })
})

describe.each(TRANSPORTS.filter(t => t.kind !== 'stream'))('$kind — kaputte JSON-Hülle', ({ call }) => {
  it('SyntaxError aus res.json(): nur der Name, nie der Ausschnitt der Antwort', async () => {
    fetchMock.mockResolvedValue(response({
      ok: true,
      status: 200,
      text: '',
      json: async () => { throw new SyntaxError(`Unexpected token in JSON at position 3: "${MARKER}"`) },
    }))
    await expect(call()).rejects.toMatchObject({ status: 502 })
    expectCleanLine()
    expect(probeLines().join('\n')).toContain('err=SyntaxError')
  })
})

describe.each(TRANSPORTS.filter(t => t.kind === 'text' || t.kind === 'vision' || t.kind === 'video'))('$kind — Antwort ohne JSON', ({ call }) => {
  it('kein Text der Antwort im Log, aber Länge und Lauf', async () => {
    const text = JSON.stringify({ id: 'gen-1', choices: [{ message: { content: `Gerne! ${MARKER} ohne Objekt` }, finish_reason: 'stop' }] })
    fetchMock.mockResolvedValue(response({ ok: true, status: 200, text }))
    await expect(call()).rejects.toMatchObject({ status: 502 })
    expectCleanLine({ status: 200 })
    expect(probeLines().join('\n')).toMatch(/ chars=\d+/)
  })
})

describe('text — abgeschnittene Antwort', () => {
  it('ai_truncated, ohne Text der Antwort', async () => {
    const text = JSON.stringify({
      id: 'gen-abc123',
      choices: [{ message: { content: `{"a":"${MARKER}` }, finish_reason: 'length' }],
      usage: { prompt_tokens: 10, completion_tokens: 700 },
    })
    fetchMock.mockResolvedValue(response({ ok: true, status: 200, text }))
    await expect(aiCompleteJson(event, 'p', { model: MODEL, label: 'probe' }))
      .rejects.toMatchObject({ status: 502, data: { code: 'ai_truncated' } })
    expectCleanLine({ status: 200 })
    const line = probeLines().join('\n')
    expect(line).toContain('finish=length')
    expect(line).toContain('gen=gen-abc123')
  })

  it('reparierte Antwort: Warnzeile mit Lauf, ohne Text', async () => {
    const text = JSON.stringify({ choices: [{ message: { content: `{"a":"Marke „${MARKER}" gut"}` }, finish_reason: 'stop' }] })
    fetchMock.mockResolvedValue(response({ ok: true, status: 200, text }))
    await aiCompleteJson(event, 'p', { model: MODEL, label: 'probe' })
    expect(allLogText()).not.toContain(MARKER)
    expect(probeLines().join('\n')).toMatch(/run=[0-9a-f]{8}/)
  })
})

describe('stream — Fehlerframe', () => {
  it('502, die Kennung statt des Textes', async () => {
    fetchMock.mockResolvedValue(response({
      ok: true,
      status: 200,
      text: '',
      frames: [
        'data: {"choices":[{"delta":{"content":"Anfang"}}]}\n\n',
        `data: {"error":{"message":"${MARKER}","code":"server_error"}}\n\n`,
      ],
    }))
    await expect(aiCompleteStream(event, 'p', { model: MODEL, label: 'probe' })).rejects.toMatchObject({ status: 502 })
    expectCleanLine({ status: 200 })
    expect(probeLines().join('\n')).toContain('tag=server_error')
  })

  it('Lesefehler mitten im Strom: nur der Name', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
      body: { getReader: () => ({ read: async () => { throw new TypeError(`terminated ${MARKER}`) } }) },
    })
    await expect(aiCompleteStream(event, 'p', { model: MODEL, label: 'probe' })).rejects.toMatchObject({ status: 502 })
    expectCleanLine()
    expect(probeLines().join('\n')).toContain('err=TypeError')
  })
})

describe('Bild, Vision, Video — die Bindung ist fest, der Ort Pflicht', () => {
  const loose = { zdr: false, dataCollection: 'allow' as const, allowFallbacks: true, only: ['google-vertex/eu'] }
  const builders = [
    ['image', () => buildAiImageRequestBody({ model: 'm', prompt: 'p', providerRouting: loose })],
    ['vision', () => buildAiVisionRequestBody({ model: 'm', prompt: 'p', images: [image], providerRouting: loose })],
    ['video', () => buildAiVideoRequestBody({ model: 'm', prompt: 'p', videos: [video], providerRouting: loose })],
  ] as const

  it.each(builders)('%s: zdr, deny und kein Ausweichen lassen sich nicht abschalten', (_kind, build) => {
    expect(build().provider).toEqual({
      zdr: true,
      only: ['google-vertex/eu'],
      allow_fallbacks: false,
      data_collection: 'deny',
    })
  })

  const unbound = [
    ['image', () => buildAiImageRequestBody({ model: 'm', prompt: 'p' })],
    ['vision', () => buildAiVisionRequestBody({ model: 'm', prompt: 'p', images: [image] })],
    ['video', () => buildAiVideoRequestBody({ model: 'm', prompt: 'p', videos: [video] })],
  ] as const

  it.each(unbound)('%s: ohne Ort baut der Transport keinen Body', (_kind, build) => {
    expect(build).toThrow(expect.objectContaining({ status: 500, statusText: 'AI routing invalid' }))
  })

  it.each(TRANSPORTS.filter(t => t.kind === 'image' || t.kind === 'vision' || t.kind === 'video'))(
    '$kind: ohne providerRouting oder mit leerer Liste KEIN fetch',
    async ({ call }) => {
      await expect(call({ providerRouting: undefined })).rejects.toMatchObject({ status: 500, statusText: 'AI routing invalid' })
      await expect(call({ providerRouting: { only: [] } })).rejects.toMatchObject({ status: 500 })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(probeLines().join('\n')).toMatch(/run=[0-9a-f]{8}/)
    },
  )
})

describe('Video — eine abgewiesene Adresse steht nicht im Log', () => {
  it('kein Teil der Adresse', async () => {
    await expect(aiVideoJsonDetailed(event, [{ url: `ftp://${MARKER}.test/x` }], 'p', { model: MODEL, label: 'probe', providerRouting: VERTEX_EU }))
      .rejects.toMatchObject({ status: 400 })
    expect(allLogText()).not.toContain(MARKER)
  })
})
