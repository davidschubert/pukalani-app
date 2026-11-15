import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AI_DISABLED_CODE } from '../shared/aiProviderRouting'

/**
 * DER EINE RIEGEL VOR JEDEM BEZAHLTEN KI-AUFRUF (P17, BE-006).
 *
 * Zwei Aussagen: (1) das Register sagt nur „an", wenn ALLE angemeldeten
 * Schalter Ja sagen — ein Schalter, der wirft, zählt als AUS, und je Ereignis
 * wird nur EINMAL gelesen; (2) jeder der fünf Transporte fragt den Riegel VOR
 * dem `fetch` — bei „aus" geht nichts raus und es kommt 503 `ai_disabled`.
 */

const appConfig = {
  pukalani: {
    ai: {
      enabled: true,
      model: 'test/model',
      imageModel: 'test/image',
      visionModel: 'test/vision',
      videoModel: 'test/video',
      baseUrl: 'https://openrouter.test/api/v1',
    },
  },
}
vi.stubGlobal('useAppConfig', () => appConfig)
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('readInstanceSecret', async () => '')
vi.stubGlobal('useRuntimeConfig', () => ({ aiKey: 'test-key', public: { appwriteDatabaseId: 'db' } }))
vi.stubGlobal('resolveAiKey', async () => 'test-key')

const fetchMock = vi.fn(async () => { throw new Error('network down') })
vi.stubGlobal('fetch', fetchMock)

const {
  aiSwitchedOn,
  assertAiSwitchedOn,
  clearAiKillSwitches,
  registerAiKillSwitch,
} = await import('../server/utils/aiKillSwitch')
const { aiComplete } = await import('../server/utils/aiComplete')
const { aiCompleteStream } = await import('../server/utils/aiCompleteStream')
const { aiImage } = await import('../server/utils/aiImage')
const { aiVision } = await import('../server/utils/aiVision')
const { aiVideo } = await import('../server/utils/aiVideo')

function newEvent(): H3Event {
  return { context: {} } as unknown as H3Event
}

beforeEach(() => {
  clearAiKillSwitches()
  fetchMock.mockClear()
})

afterEach(() => {
  clearAiKillSwitches()
  vi.restoreAllMocks()
})

describe('das Register', () => {
  it('ohne angemeldeten Schalter ⇒ an', async () => {
    expect(await aiSwitchedOn(newEvent())).toBe(true)
  })

  it('alle sagen Ja ⇒ an', async () => {
    registerAiKillSwitch('a', () => true)
    registerAiKillSwitch('b', async () => true)
    expect(await aiSwitchedOn(newEvent())).toBe(true)
  })

  it('einer sagt Nein ⇒ aus', async () => {
    registerAiKillSwitch('a', () => true)
    registerAiKillSwitch('b', async () => false)
    expect(await aiSwitchedOn(newEvent())).toBe(false)
  })

  it('einer wirft ⇒ aus (fail-closed)', async () => {
    registerAiKillSwitch('a', () => true)
    registerAiKillSwitch('b', async () => { throw new Error('db down') })
    expect(await aiSwitchedOn(newEvent())).toBe(false)
  })

  it('je Ereignis wird nur EINMAL gelesen — ein neues Ereignis liest neu', async () => {
    const read = vi.fn(async () => true)
    registerAiKillSwitch('brand', read)
    const event = newEvent()
    await aiSwitchedOn(event)
    await aiSwitchedOn(event)
    await assertAiSwitchedOn(event)
    expect(read).toHaveBeenCalledTimes(1)
    await aiSwitchedOn(newEvent())
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('derselbe Name ersetzt, statt doppelt zu zählen', async () => {
    registerAiKillSwitch('brand', () => false)
    registerAiKillSwitch('brand', () => true)
    expect(await aiSwitchedOn(newEvent())).toBe(true)
  })

  it('assertAiSwitchedOn wirft 503 `ai_disabled` und loggt nur Kennungen', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    registerAiKillSwitch('brand', () => false)
    await expect(assertAiSwitchedOn(newEvent(), { label: 'brand-review', model: 'test/model', run: 'r1', started: 0 }))
      .rejects.toMatchObject({ status: 503, data: { code: 'ai_disabled' } })
    expect(AI_DISABLED_CODE).toBe('ai_disabled')
    const line = String(errors.mock.calls.at(-1)?.[0] ?? '')
    expect(line).toContain('KI abgeschaltet')
    expect(line).toContain('model=test/model')
  })
})

describe('jeder Transport fragt den Riegel VOR dem Senden', () => {
  const only = { only: ['test/eu'] }
  const image = { mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) }
  const transports: Record<string, (event: H3Event) => Promise<unknown>> = {
    aiComplete: event => aiComplete(event, 'Hallo', { apiKey: 'k' }),
    aiCompleteStream: event => aiCompleteStream(event, 'Hallo', { apiKey: 'k' }),
    aiImage: event => aiImage(event, 'Ein Bild', { apiKey: 'k', model: 'test/image', providerRouting: only }),
    aiVision: event => aiVision(event, [image], 'Was ist das?', { apiKey: 'k', model: 'test/vision', providerRouting: only }),
    aiVideo: event => aiVideo(event, [{ url: 'https://video.test/a.mp4' }], 'Was passiert?', {
      apiKey: 'k',
      model: 'test/video',
      providerRouting: only,
    }),
  }

  for (const [name, call] of Object.entries(transports)) {
    it(`${name}: Schalter aus ⇒ 503 \`ai_disabled\`, kein fetch`, async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      registerAiKillSwitch('brand', () => false)
      await expect(call(newEvent())).rejects.toMatchObject({ status: 503, data: { code: 'ai_disabled' } })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it(`${name}: Schalter an ⇒ unverändert, der Aufruf geht raus`, async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      registerAiKillSwitch('brand', () => true)
      // Der Netzfehler des Doppels wird zu 502 — entscheidend ist, DASS gesendet wurde.
      await expect(call(newEvent())).rejects.toMatchObject({ status: 502 })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  }
})
