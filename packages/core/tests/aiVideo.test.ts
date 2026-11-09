import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * DER VIDEO-TRANSPORT (`server/utils/aiVideo.ts`, BI2 K5) — geprüft wird der
 * tatsächlich ABGESCHICKTE Body, nicht der Aufruf.
 *
 * Fünf Zusagen, die keine Typ-Deklaration halten kann:
 *
 *  1. NACHRICHTEN-FORM: eine Nachricht mit einer Liste aus Text- und
 *     `video_url`-Teilen — die Form, die OpenRouter für Videos kennt, und die
 *     in der Probe vom 2026-10-27 ein echtes YouTube-Video gelesen hat.
 *  2. DIE ZDR-KLEMME: `provider.data_collection === 'deny'` steht IMMER da,
 *     auch ohne Option und auch dann, wenn der Aufrufer ausdrücklich etwas
 *     anderes übergibt. MIT GEGENPROBE.
 *  3. GATE AUS ⇒ KEIN NETZ: ohne `pukalani.ai.videoModel` fliegt eine 503,
 *     BEVOR `fetch` gerufen wird.
 *  4. KEINE BYTES: `data:`-URIs fallen durch, und zwar VOR dem Netzaufruf —
 *     ein base64-Video wären hunderte Megabyte in einem Request-Rumpf.
 *  5. KLEMMUNG: `aiVideoJson` schneidet auf das äussere Objekt zu und wirft
 *     bei Nicht-JSON eine 502.
 *  6. DIE ABRECHNUNG (2026-11-09): `aiVideoDetailed`/`aiVideoJsonDetailed`
 *     geben die Zahlen des Anbieters heraus — beide Richtungen plus die zwei
 *     video-eigenen (`video_tokens`, `cached_tokens`) —, `0` wenn er keine
 *     nennt, und die ALTEN Namen geben weiter nur Text bzw. Daten.
 */
const appConfig: { pukalani: { ai: Record<string, unknown> } } = {
  pukalani: { ai: { enabled: false, videoModel: 'test/video', baseUrl: 'https://openrouter.test/api/v1' } },
}
vi.stubGlobal('useAppConfig', () => appConfig)
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('readInstanceSecret', async () => '')
vi.stubGlobal('useRuntimeConfig', () => ({ aiKey: 'k-test', public: { appwriteDatabaseId: 'db' } }))

/** Wie im Vision-Test: der Wurf ist der Default, damit jeder Fall den Build-Stand misst. */
let appConfigRow: Record<string, unknown> | Error = new Error('kein app_config in diesem Test')
vi.stubGlobal('createAdminClient', () => ({
  tablesDB: {
    getRow: async () => {
      if (appConfigRow instanceof Error) throw appConfigRow
      return appConfigRow
    },
  },
}))

const { extractJsonObject } = await import('../server/utils/aiComplete')
vi.stubGlobal('extractJsonObject', extractJsonObject)
vi.stubGlobal('resolveAiKey', async () => 'k-test')

const {
  AI_VIDEO_MAX_VIDEOS,
  aiVideo,
  aiVideoDetailed,
  aiVideoJson,
  aiVideoJsonDetailed,
  aiVideoUrlAllowed,
  buildAiVideoRequestBody,
  getAiVideoConfig,
  getEffectiveAiVideoConfig,
  isAiVideoConfigured,
} = await import('../server/utils/aiVideo')

const event = {} as H3Event
const URL_ONE = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'

const fetchMock = vi.fn(async () => ({
  ok: true,
  status: 200,
  text: async () => '',
  json: async () => ({ choices: [{ message: { content: '{"brief":"ok"}' } }] }),
}))
vi.stubGlobal('fetch', fetchMock)

function sentBody(): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as unknown as { body: string }
  return JSON.parse(init.body) as Record<string, unknown>
}

type Part = { type: string, text?: string, video_url?: { url: string }, processing?: string }
function sentParts(): Part[] {
  const body = sentBody() as { messages: { role: string, content: Part[] }[] }
  return body.messages.at(-1)!.content
}

beforeEach(() => {
  fetchMock.mockClear()
  appConfig.pukalani.ai = { enabled: false, videoModel: 'test/video', baseUrl: 'https://openrouter.test/api/v1' }
  appConfigRow = new Error('kein app_config in diesem Test')
})

describe('buildAiVideoRequestBody', () => {
  it('schickt den Prompt zuerst und danach das Video als video_url-Teil', () => {
    const body = buildAiVideoRequestBody({
      model: 'm',
      prompt: 'Worum geht es?',
      videos: [{ url: URL_ONE }],
    }) as { messages: { content: Part[] }[] }
    const parts = body.messages[0]!.content
    expect(parts[0]).toEqual({ type: 'text', text: 'Worum geht es?' })
    expect(parts[1]).toEqual({ type: 'video_url', video_url: { url: URL_ONE } })
  })

  it('schreibt `processing` NUR, wenn es gesetzt ist', () => {
    const without = buildAiVideoRequestBody({ model: 'm', prompt: 'p', videos: [{ url: URL_ONE }] }) as { messages: { content: Part[] }[] }
    expect('processing' in without.messages[0]!.content[1]!).toBe(false)

    const withStatic = buildAiVideoRequestBody({
      model: 'm', prompt: 'p', videos: [{ url: URL_ONE, processing: 'static' }],
    }) as { messages: { content: Part[] }[] }
    expect(withStatic.messages[0]!.content[1]!.processing).toBe('static')
  })

  it('setzt die Beschriftung als eigenen Text-Teil VOR das Video', () => {
    const body = buildAiVideoRequestBody({
      model: 'm', prompt: 'p', videos: [{ url: URL_ONE, label: 'Video 1' }],
    }) as { messages: { content: Part[] }[] }
    expect(body.messages[0]!.content.map(part => part.type)).toEqual(['text', 'text', 'video_url'])
  })

  /**
   * DIE KLEMME UND IHRE GEGENPROBE — die eine Zusage, die das Produkt trägt.
   * Ein Aufrufer, der `allow` übergibt, bekommt trotzdem `deny` geschickt.
   */
  it('klemmt data_collection immer auf deny, auch ohne Routing-Option', () => {
    const body = buildAiVideoRequestBody({ model: 'm', prompt: 'p', videos: [{ url: URL_ONE }] })
    expect((body.provider as Record<string, unknown>).data_collection).toBe('deny')
  })

  it('überschreibt ein übergebenes dataCollection: allow', () => {
    const body = buildAiVideoRequestBody({
      model: 'm', prompt: 'p', videos: [{ url: URL_ONE }],
      providerRouting: { dataCollection: 'allow', zdr: true },
    })
    const provider = body.provider as Record<string, unknown>
    expect(provider.data_collection).toBe('deny')
    expect(provider.zdr).toBe(true)
  })

  it('reicht zdr, only und allowFallbacks wörtlich durch — und kopiert die Allowlist', () => {
    const only = ['google-vertex/eu']
    const body = buildAiVideoRequestBody({
      model: 'm', prompt: 'p', videos: [{ url: URL_ONE }],
      providerRouting: { zdr: true, only, allowFallbacks: false },
    })
    const provider = body.provider as Record<string, unknown>
    expect(provider.zdr).toBe(true)
    expect(provider.only).toEqual(['google-vertex/eu'])
    expect(provider.allow_fallbacks).toBe(false)
    // Eine Kopie, kein geteiltes Array: sonst änderte ein Aufrufer den Vertrag.
    expect(provider.only).not.toBe(only)
  })
})

describe('aiVideoUrlAllowed', () => {
  it('nimmt http und https', () => {
    expect(aiVideoUrlAllowed(URL_ONE)).toBe(true)
    expect(aiVideoUrlAllowed('http://example.test/clip.mp4')).toBe(true)
  })

  it('weist data:, file: und blob: ab — ein Video reist als Adresse, nicht als Bytes', () => {
    expect(aiVideoUrlAllowed('data:video/mp4;base64,AAAA')).toBe(false)
    expect(aiVideoUrlAllowed('file:///tmp/clip.mp4')).toBe(false)
    expect(aiVideoUrlAllowed('blob:https://example.test/abc')).toBe(false)
  })

  it('weist Leeres und Unsinn ab', () => {
    expect(aiVideoUrlAllowed('')).toBe(false)
    expect(aiVideoUrlAllowed('   ')).toBe(false)
    expect(aiVideoUrlAllowed('nicht mal eine adresse')).toBe(false)
  })

  it('weist eine absurd lange Adresse ab', () => {
    expect(aiVideoUrlAllowed(`https://example.test/${'x'.repeat(3000)}`)).toBe(false)
  })
})

describe('das Gate', () => {
  it('ist AUS, wenn kein Modell konfiguriert ist', () => {
    appConfig.pukalani.ai = { videoModel: '', baseUrl: 'https://openrouter.test/api/v1' }
    expect(getAiVideoConfig().enabled).toBe(false)
    expect(getAiVideoConfig().model).toBe('')
  })

  it('zählt `pukalani.ai.enabled` bewusst NICHT mit', () => {
    appConfig.pukalani.ai = { enabled: false, videoModel: 'test/video' }
    expect(getAiVideoConfig().enabled).toBe(true)
  })

  it('wirft 503 OHNE Netzaufruf, wenn kein Modell steht', async () => {
    appConfig.pukalani.ai = { videoModel: '' }
    await expect(aiVideo(event, [{ url: URL_ONE }], 'p')).rejects.toMatchObject({ statusCode: 503 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('wirft 400 OHNE Netzaufruf, wenn kein Video dabei ist', async () => {
    await expect(aiVideo(event, [], 'p')).rejects.toMatchObject({ statusCode: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('weist eine data:-Adresse VOR dem Netzaufruf ab', async () => {
    await expect(aiVideo(event, [{ url: 'data:video/mp4;base64,AAAA' }], 'p'))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('weist zu viele Videos VOR dem Netzaufruf ab', async () => {
    const many = Array.from({ length: AI_VIDEO_MAX_VIDEOS + 1 }, () => ({ url: URL_ONE }))
    await expect(aiVideo(event, many, 'p')).rejects.toMatchObject({ statusCode: 413 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('liest den Laufzeit-Override `app_config.aiVideoModel`', async () => {
    appConfigRow = { aiVideoModel: 'runtime/video' }
    const config = await getEffectiveAiVideoConfig(event)
    expect(config.model).toBe('runtime/video')
    // Der Build-Default bleibt sichtbar — die Oberfläche zeigt ihn als Platzhalter.
    expect(config.defaultModel).toBe('test/video')
  })

  it('nimmt einen Lesefehler als Build-Default, nicht als Fehler', async () => {
    appConfigRow = new Error('Tabelle fehlt')
    const config = await getEffectiveAiVideoConfig(event)
    expect(config.model).toBe('test/video')
    expect(config.enabled).toBe(true)
  })

  it('ist nutzbar, wenn Modell UND Schlüssel da sind', async () => {
    expect(await isAiVideoConfigured(event)).toBe(true)
  })
})

describe('aiVideo', () => {
  it('ruft chat/completions mit dem konfigurierten Modell', async () => {
    await aiVideo(event, [{ url: URL_ONE }], 'Worum geht es?')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://openrouter.test/api/v1/chat/completions')
    expect(sentBody().model).toBe('test/video')
    expect(sentParts()[1]!.video_url).toEqual({ url: URL_ONE })
  })

  it('schneidet aiVideoJson auf das äussere Objekt zu', async () => {
    const result = await aiVideoJson<{ brief: string }>(event, [{ url: URL_ONE }], 'p')
    expect(result.brief).toBe('ok')
  })

  it('wirft 502, wenn die Antwort kein JSON ist', async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: true, status: 200, text: async () => '',
      json: async () => ({ choices: [{ message: { content: 'kein json' } }] }),
    }))
    await expect(aiVideoJson(event, [{ url: URL_ONE }], 'p')).rejects.toMatchObject({ statusCode: 502 })
  })

  it('wirft 502, wenn der Anbieter nicht ok antwortet', async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: false, status: 404, text: async () => '{"error":{"code":404}}',
      json: async () => ({}),
    }))
    await expect(aiVideo(event, [{ url: URL_ONE }], 'p')).rejects.toMatchObject({ statusCode: 502 })
  })
})

/**
 * WAS DER LAUF GEKOSTET HAT (2026-11-09).
 *
 * Der Video-Weg war der letzte bezahlte Weg des Monorepos, der seine
 * `usage` wegwarf — und mit ~5 Cent je Lauf der teuerste. Geprüft wird am
 * ERFOLGREICHEN Lauf, denn genau dort gingen die Zahlen verloren: ein
 * gescheiterter Lauf kostet einmal, ein erfolgreicher läuft im Betrieb
 * hundertmal.
 */
describe('aiVideoDetailed — die Zahlen der Abrechnung', () => {
  /** Eine Antwort mit der Abrechnungs-Form, die die Probe vom 2026-10-27 gezeigt hat. */
  function withUsage(): void {
    fetchMock.mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({
        choices: [{ message: { content: '{"brief":"ok"}' }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 135_000,
          completion_tokens: 1200,
          prompt_tokens_details: { video_tokens: 132_400, cached_tokens: 2000 },
        },
      }),
    }))
  }

  it('gibt beide Richtungen UND die zwei video-eigenen Zahlen heraus', async () => {
    withUsage()
    const completion = await aiVideoDetailed(event, [{ url: URL_ONE }], 'p')
    expect(completion).toMatchObject({
      content: '{"brief":"ok"}',
      finishReason: 'stop',
      promptTokens: 135_000,
      completionTokens: 1200,
      // Der Beweis der Abrechnung: das Modell hat das Video gelesen, nicht
      // nur seinen Titel paraphrasiert (Kopf von `aiVideo.ts`).
      videoTokens: 132_400,
      cachedTokens: 2000,
    })
  })

  it('nennt 0, wenn der Anbieter keine `usage` mitschickt — nie `undefined`', async () => {
    // Die Standard-Attrappe antwortet ohne `usage`. `0` heisst „nicht gesagt",
    // nie „nichts verbraucht" — aber es ist eine ZAHL, über die man rechnen kann.
    const completion = await aiVideoDetailed(event, [{ url: URL_ONE }], 'p')
    expect(completion).toMatchObject({
      finishReason: '',
      promptTokens: 0,
      completionTokens: 0,
      videoTokens: 0,
      cachedTokens: 0,
    })
  })

  it('trägt die Zahlen auch durch den JSON-Weg', async () => {
    withUsage()
    const completion = await aiVideoJsonDetailed<{ brief: string }>(event, [{ url: URL_ONE }], 'p')
    expect(completion.value.brief).toBe('ok')
    expect(completion.promptTokens).toBe(135_000)
    expect(completion.videoTokens).toBe(132_400)
    expect(completion.cachedTokens).toBe(2000)
    expect(completion.finishReason).toBe('stop')
  })

  /**
   * GEGENPROBE: die alten Namen dürfen von der Erweiterung NICHTS merken.
   * `aiVision`/`aiVisionJson` und jeder andere Konsument hängen daran.
   */
  it('GEGENPROBE: aiVideo gibt weiter nur den Text, aiVideoJson nur die Daten', async () => {
    withUsage()
    const text = await aiVideo(event, [{ url: URL_ONE }], 'p')
    expect(text).toBe('{"brief":"ok"}')

    withUsage()
    const value = await aiVideoJson<{ brief: string }>(event, [{ url: URL_ONE }], 'p')
    expect(value).toEqual({ brief: 'ok' })
    expect(Object.keys(value)).not.toContain('promptTokens')
    expect(Object.keys(value)).not.toContain('videoTokens')
  })
})
