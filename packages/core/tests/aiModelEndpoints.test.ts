import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEXT_EU_ENDPOINTS, isEuEndpoint } from '../../../scripts/ops/ai-model-endpoints.mjs'
import { AI_TEXT_EU_ENDPOINTS } from '../shared/aiProviderRouting'
import {
  AI_BROKER_BASE_URL,
  AI_BROKER_EU_BASE_URL,
  AI_MODEL_NO_EU_ENDPOINT_CODE,
  AI_MODEL_UNKNOWN_CODE,
  aiModelCheckRejection,
  aiModelEndpointsUrl,
  aiModelEuEndpointsUrl,
  interpretAiModelEndpoints,
  isKnownAiBroker,
  readEndpointTags,
} from '../shared/aiModelEndpoints'
import { checkAiModelEndpoints } from '../server/utils/aiModelCheck'

/**
 * KI1 c (2026-11-17): ein Modell wird beim SPEICHERN geprüft — mit derselben
 * Auskunft und derselben Deutung wie der tägliche Wächter
 * `scripts/ops/verify-ai-models.mjs`. Der erste Block hält beide aneinander,
 * die anderen prüfen Deutung und Netz-Teil mit gestelltem `fetch` (kein
 * echter Aufruf beim Vermittler).
 *
 * SEIT 2026-11-18 ZWEI LISTEN: der Vermittler führt die Europa-Endpunkte mit
 * Aufpreis nur noch auf seiner Europa-Adresse. Wächter und Speicher-Prüfung
 * lesen beide Listen; ein Ort zählt, sobald er in einer steht.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const WATCHER = readFileSync(join(ROOT, 'scripts/ops/verify-ai-models.mjs'), 'utf8')

const endpoints = (...tags: string[]) => ({ data: { id: 'x/y', endpoints: tags.map(tag => ({ tag, provider_name: 'P' })) } })
/** Eine gelesene Liste (Status 200) mit diesen Tags. */
const list = (...tags: string[]) => ({ status: 200, body: endpoints(...tags) })
/** Stand vom 2026-11-18, wörtlich: die weltweite Liste von `anthropic/claude-haiku-4.5`. */
const WORLD_2026_11_18 = ['azure/global', 'amazon-bedrock/global', 'google-vertex/global', 'anthropic']
/** … und die Liste desselben Modells auf der Europa-Adresse. */
const EUROPE_2026_11_18 = ['amazon-bedrock/eu-west-1', 'google-vertex/europe']

describe('Bindung an den täglichen Wächter', () => {
  it('dieselben zwei Orte wie die Wächter-Tabelle', () => {
    expect([...AI_TEXT_EU_ENDPOINTS]).toEqual([...TEXT_EU_ENDPOINTS])
    for (const tag of AI_TEXT_EU_ENDPOINTS) expect(isEuEndpoint(tag)).toBe(true)
  })

  it('dieselbe Adresse der Endpunkt-Liste wie `ENDPOINTS_URL` im Wächter', () => {
    const match = WATCHER.match(/const ENDPOINTS_URL = slug => `([^`]+)`/)
    expect(match, 'ENDPOINTS_URL im Wächter nicht gefunden').not.toBeNull()
    expect(match![1]!.replace('${slug}', 'anthropic/claude-haiku-4.5'))
      .toBe(aiModelEndpointsUrl('anthropic/claude-haiku-4.5'))
  })

  it('dieselbe Adresse der Europa-Liste wie `EU_ENDPOINTS_URL` im Wächter', () => {
    const match = WATCHER.match(/const EU_ENDPOINTS_URL = slug => `([^`]+)`/)
    expect(match, 'EU_ENDPOINTS_URL im Wächter nicht gefunden').not.toBeNull()
    expect(match![1]!.replace('${slug}', 'anthropic/claude-haiku-4.5'))
      .toBe(aiModelEuEndpointsUrl('anthropic/claude-haiku-4.5'))
    expect(aiModelEuEndpointsUrl('a/b')).toBe(`${AI_BROKER_EU_BASE_URL}/models/a/b/endpoints`)
  })

  it('der Wächter liest BEIDE Listen und vereinigt sie', () => {
    expect(WATCHER).toContain('[ENDPOINTS_URL(slug), EU_ENDPOINTS_URL(slug)]')
    expect(WATCHER).toContain('new Set([...world, ...europe])')
  })

  it('die Europa-Adresse wird nur GELESEN: kein Transport ruft dort ein Modell', () => {
    for (const file of ['aiComplete.ts', 'aiCompleteStream.ts', 'aiVision.ts', 'aiVideo.ts', 'aiImage.ts']) {
      const source = readFileSync(join(ROOT, 'packages/core/server/utils', file), 'utf8')
      expect(source, file).not.toContain('eu.openrouter.ai')
    }
  })

  it('dieselbe Form der Antwort: `data.endpoints[].tag`', () => {
    expect(WATCHER).toContain('data?.data?.endpoints')
    expect(WATCHER).toContain('endpoint.tag')
  })

  it('dieselbe Basis wie der Transport-Standard', () => {
    const transport = readFileSync(join(ROOT, 'packages/core/server/utils/aiComplete.ts'), 'utf8')
    expect(transport).toContain(`'${AI_BROKER_BASE_URL}'`)
  })
})

describe('Deutung (pur)', () => {
  it('ein EU-Ort genügt — gleich, in welcher der zwei Listen er steht', () => {
    expect(interpretAiModelEndpoints(list('google-vertex/europe', 'openai/default'), list())).toBe('ok')
    expect(interpretAiModelEndpoints(list('amazon-bedrock/eu-west-1'), list('amazon-bedrock/eu-west-1'))).toBe('ok')
    expect(interpretAiModelEndpoints(list('openai/default'), list('google-vertex/europe'))).toBe('ok')
  })

  it('STAND 2026-11-18: der Ort steht nur noch in der Europa-Liste ⇒ ok', () => {
    expect(interpretAiModelEndpoints(list(...WORLD_2026_11_18), list(...EUROPE_2026_11_18))).toBe('ok')
    // GEGENPROBE — so las die Prüfung bis dahin (nur die weltweite Liste):
    expect(interpretAiModelEndpoints(list(...WORLD_2026_11_18), list())).toBe('no_eu_endpoint')
  })

  it('GEGENPROBE: andere EU-artige oder ortlose Tags zählen nicht', () => {
    expect(interpretAiModelEndpoints(list('google-vertex/global', 'google-vertex/eu', 'amazon-bedrock/us-east-1'), list('google-vertex/eu', 'mistral/eu'))).toBe('no_eu_endpoint')
    expect(interpretAiModelEndpoints(list(), list())).toBe('no_eu_endpoint')
  })

  it('„kein Ort" ist nur eine Aussage, wenn BEIDE Listen lesbar waren', () => {
    expect(interpretAiModelEndpoints(list(...WORLD_2026_11_18), null)).toBe('unverified')
    expect(interpretAiModelEndpoints(list(...WORLD_2026_11_18), { status: 503, body: undefined })).toBe('unverified')
    expect(interpretAiModelEndpoints(list(...WORLD_2026_11_18), { status: 200, body: undefined })).toBe('unverified')
    expect(interpretAiModelEndpoints(null, list())).toBe('unverified')
    expect(interpretAiModelEndpoints(null, null)).toBe('unverified')
    // Eine lesbare Liste MIT Ort genügt, auch wenn die andere fehlt.
    expect(interpretAiModelEndpoints(null, list(...EUROPE_2026_11_18))).toBe('ok')
    expect(interpretAiModelEndpoints(list('google-vertex/europe'), null)).toBe('ok')
  })

  it('404 der weltweiten Liste ⇒ unbekannt, alles andere ohne Form ⇒ nicht prüfbar', () => {
    expect(interpretAiModelEndpoints({ status: 404, body: undefined }, { status: 404, body: undefined })).toBe('unknown_model')
    expect(interpretAiModelEndpoints({ status: 404, body: undefined }, null)).toBe('unknown_model')
    expect(interpretAiModelEndpoints({ status: 500, body: endpoints('google-vertex/europe') }, list())).toBe('unverified')
    expect(interpretAiModelEndpoints({ status: 429, body: undefined }, list())).toBe('unverified')
    expect(interpretAiModelEndpoints({ status: 200, body: undefined }, list())).toBe('unverified')
    expect(interpretAiModelEndpoints({ status: 200, body: { data: null } }, list())).toBe('unverified')
    expect(interpretAiModelEndpoints({ status: 200, body: { data: { endpoints: 'x' } } }, list())).toBe('unverified')
  })

  it('liest nur Tags aus Zeichenketten', () => {
    expect(readEndpointTags({ data: { endpoints: [{ tag: 'a/b' }, { tag: 3 }, null, {}] } })).toEqual(['a/b'])
  })

  it('Gründe und Basis-Adresse', () => {
    expect(aiModelCheckRejection('no_eu_endpoint')).toBe(AI_MODEL_NO_EU_ENDPOINT_CODE)
    expect(aiModelCheckRejection('unknown_model')).toBe(AI_MODEL_UNKNOWN_CODE)
    expect(aiModelCheckRejection('ok')).toBeNull()
    expect(aiModelCheckRejection('unverified')).toBeNull()
    expect(isKnownAiBroker('https://openrouter.ai/api/v1/')).toBe(true)
    expect(isKnownAiBroker('https://llm.example.test/v1')).toBe(false)
  })
})

describe('checkAiModelEndpoints (gestelltes fetch)', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const logs: string[] = []
  const base = { baseUrl: AI_BROKER_BASE_URL }

  beforeEach(() => {
    fetchMock.mockReset()
    logs.length = 0
    vi.stubGlobal('fetch', fetchMock)
    for (const level of ['log', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((line: unknown) => { logs.push(String(line)) })
    }
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  /** Beide Listen, je Aufruf eine frische Antwort. */
  const lists = (world: string[], europe: string[] = []) => async (url: RequestInfo | URL) =>
    json(200, endpoints(...(String(url).startsWith(AI_BROKER_EU_BASE_URL) ? europe : world)))

  it('ok: ruft genau die zwei Endpunkt-Listen, ohne Schlüssel', async () => {
    fetchMock.mockImplementation(lists(WORLD_2026_11_18, EUROPE_2026_11_18))
    await expect(checkAiModelEndpoints('anthropic/claude-haiku-4.5', base)).resolves.toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([
      `${AI_BROKER_EU_BASE_URL}/models/anthropic/claude-haiku-4.5/endpoints`,
      `${AI_BROKER_BASE_URL}/models/anthropic/claude-haiku-4.5/endpoints`,
    ])
    for (const [, init] of fetchMock.mock.calls) {
      expect(JSON.stringify(init?.headers ?? {})).not.toMatch(/authorization/i)
      expect(init?.signal).toBeInstanceOf(AbortSignal)
    }
    expect(logs.some(line => line.includes('"check":"ok"') && line.includes('"euStatus":200'))).toBe(true)
  })

  it('kein EU-Ort in beiden Listen ⇒ no_eu_endpoint', async () => {
    fetchMock.mockImplementation(lists(['openai/default', 'google-vertex/global']))
    await expect(checkAiModelEndpoints('openai/gpt-4o', base)).resolves.toBe('no_eu_endpoint')
  })

  it('Europa-Liste gestört, weltweite ohne EU-Ort ⇒ unverified statt Ablehnung', async () => {
    fetchMock.mockImplementation(async url =>
      String(url).startsWith(AI_BROKER_EU_BASE_URL) ? json(503, {}) : json(200, endpoints(...WORLD_2026_11_18)))
    await expect(checkAiModelEndpoints('anthropic/claude-haiku-4.5', base)).resolves.toBe('unverified')
  })

  it('Europa-Liste antwortet nicht (Netz), weltweite trägt den Ort ⇒ ok', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).startsWith(AI_BROKER_EU_BASE_URL)) throw new TypeError('fetch failed: geheimer-host')
      return json(200, endpoints('amazon-bedrock/eu-west-1'))
    })
    await expect(checkAiModelEndpoints('amazon/nova-micro-v1', base)).resolves.toBe('ok')
    expect(logs.join('\n')).not.toContain('geheimer')
  })

  it('beide Listen unter EINER Frist, nicht nacheinander', async () => {
    // MG1 (2026-11-23): früher maß der Test die Wanduhr (< 75 ms bei zwei
    // Abrufen à 40 ms) und war unter Last rot (78–156 ms), obwohl beide
    // Abrufe gleichzeitig liefen. Jetzt entscheidet ein EREIGNIS: jeder Abruf
    // wartet, bis auch der zweite begonnen hat. Laufen sie nacheinander,
    // beginnt der zweite nie, solange der erste wartet — der erste sieht nach
    // der Notbremse nur sich selbst, und der Test ist rot.
    const started: string[] = []
    const seenByEach: number[] = []
    let release!: () => void
    const bothStarted = new Promise<void>((resolve) => { release = resolve })
    fetchMock.mockImplementation(async (url) => {
      started.push(String(url))
      if (started.length === 2) release()
      await Promise.race([bothStarted, new Promise(resolve => setTimeout(resolve, 1000))])
      seenByEach.push(started.length)
      return json(200, endpoints(...(String(url).startsWith(AI_BROKER_EU_BASE_URL) ? EUROPE_2026_11_18 : WORLD_2026_11_18)))
    })
    await expect(checkAiModelEndpoints('anthropic/claude-haiku-4.5', base)).resolves.toBe('ok')
    expect(started).toHaveLength(2)
    expect(seenByEach).toEqual([2, 2])
  })

  it('404 ⇒ unknown_model', async () => {
    fetchMock.mockResolvedValue(json(404, { error: { message: 'geheimer Rumpf' } }))
    await expect(checkAiModelEndpoints('nope/model', base)).resolves.toBe('unknown_model')
  })

  it('500 und 429 ⇒ unverified', async () => {
    fetchMock.mockImplementation(async () => json(500, {}))
    await expect(checkAiModelEndpoints('a/b', base)).resolves.toBe('unverified')
    fetchMock.mockImplementation(async () => json(429, {}))
    await expect(checkAiModelEndpoints('a/b', base)).resolves.toBe('unverified')
  })

  it('kaputtes JSON ⇒ unverified, und der Rumpf steht nicht im Protokoll', async () => {
    fetchMock.mockImplementation(async () => new Response('{"data": geheimer-rumpf', { status: 200 }))
    await expect(checkAiModelEndpoints('a/b', base)).resolves.toBe('unverified')
    expect(logs.join('\n')).not.toContain('geheimer')
  })

  it('Frist ⇒ unverified (why: timeout)', async () => {
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
    }))
    await expect(checkAiModelEndpoints('a/b', { ...base, timeoutMs: 20 })).resolves.toBe('unverified')
    expect(logs.some(line => line.includes('"why":"timeout"'))).toBe(true)
  })

  it('Netzfehler ⇒ unverified, ohne Fehlertext im Protokoll', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed: geheimer-host'))
    await expect(checkAiModelEndpoints('a/b', base)).resolves.toBe('unverified')
    expect(logs.join('\n')).not.toContain('geheimer')
  })

  it('fremde Basis-Adresse ⇒ unverified, KEIN Aufruf', async () => {
    await expect(checkAiModelEndpoints('a/b', { baseUrl: 'https://llm.example.test/v1' })).resolves.toBe('unverified')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
