import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEXT_EU_ENDPOINTS, isEuEndpoint } from '../../../scripts/ops/ai-model-endpoints.mjs'
import { AI_TEXT_EU_ENDPOINTS } from '../shared/aiProviderRouting'
import {
  AI_BROKER_BASE_URL,
  AI_MODEL_NO_EU_ENDPOINT_CODE,
  AI_MODEL_UNKNOWN_CODE,
  aiModelCheckRejection,
  aiModelEndpointsUrl,
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
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const WATCHER = readFileSync(join(ROOT, 'scripts/ops/verify-ai-models.mjs'), 'utf8')

const endpoints = (...tags: string[]) => ({ data: { id: 'x/y', endpoints: tags.map(tag => ({ tag, provider_name: 'P' })) } })

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
  it('ein EU-Ort genügt', () => {
    expect(interpretAiModelEndpoints(200, endpoints('google-vertex/europe', 'openai/default'))).toBe('ok')
    expect(interpretAiModelEndpoints(200, endpoints('amazon-bedrock/eu-west-1'))).toBe('ok')
  })

  it('GEGENPROBE: andere EU-artige oder ortlose Tags zählen nicht', () => {
    expect(interpretAiModelEndpoints(200, endpoints('google-vertex/global', 'google-vertex/eu', 'amazon-bedrock/us-east-1'))).toBe('no_eu_endpoint')
    expect(interpretAiModelEndpoints(200, endpoints())).toBe('no_eu_endpoint')
  })

  it('404 ⇒ unbekannt, alles andere ohne Form ⇒ nicht prüfbar', () => {
    expect(interpretAiModelEndpoints(404, undefined)).toBe('unknown_model')
    expect(interpretAiModelEndpoints(500, endpoints('google-vertex/europe'))).toBe('unverified')
    expect(interpretAiModelEndpoints(429, undefined)).toBe('unverified')
    expect(interpretAiModelEndpoints(200, undefined)).toBe('unverified')
    expect(interpretAiModelEndpoints(200, { data: null })).toBe('unverified')
    expect(interpretAiModelEndpoints(200, { data: { endpoints: 'x' } })).toBe('unverified')
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

  it('ok: ruft genau die Endpunkt-Liste, ohne Schlüssel', async () => {
    fetchMock.mockResolvedValue(json(200, endpoints('google-vertex/europe')))
    await expect(checkAiModelEndpoints('anthropic/claude-haiku-4.5', base)).resolves.toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${AI_BROKER_BASE_URL}/models/anthropic/claude-haiku-4.5/endpoints`)
    expect(JSON.stringify(init?.headers ?? {})).not.toMatch(/authorization/i)
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('kein EU-Ort ⇒ no_eu_endpoint', async () => {
    fetchMock.mockResolvedValue(json(200, endpoints('openai/default', 'google-vertex/global')))
    await expect(checkAiModelEndpoints('openai/gpt-4o', base)).resolves.toBe('no_eu_endpoint')
  })

  it('404 ⇒ unknown_model', async () => {
    fetchMock.mockResolvedValue(json(404, { error: { message: 'geheimer Rumpf' } }))
    await expect(checkAiModelEndpoints('nope/model', base)).resolves.toBe('unknown_model')
  })

  it('500 und 429 ⇒ unverified', async () => {
    fetchMock.mockResolvedValueOnce(json(500, {}))
    await expect(checkAiModelEndpoints('a/b', base)).resolves.toBe('unverified')
    fetchMock.mockResolvedValueOnce(json(429, {}))
    await expect(checkAiModelEndpoints('a/b', base)).resolves.toBe('unverified')
  })

  it('kaputtes JSON ⇒ unverified, und der Rumpf steht nicht im Protokoll', async () => {
    fetchMock.mockResolvedValue(new Response('{"data": geheimer-rumpf', { status: 200 }))
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
