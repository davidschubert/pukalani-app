import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { type BrandMarkBrief, brandMarkBriefSlotValue, brandMarkDerivedBriefFields } from '../shared/brandDesignMark'
import { BRAND_MARK_DRAFTS_PER_RUN } from '../shared/brandMarkDrafts'

/**
 * DER LAUF GIBT DEM BILDMODELL DIE BILD-FASSUNG MIT (Finding BE-004).
 *
 * Der echte `runBrandMarkDrafts` gegen einen erfundenen `aiImage`: geprüft
 * wird, was beim Transport ANKOMMT — `only: ['google-vertex/global']` mit
 * ZDR, `deny` und ohne Ausweichen. Mit der Basis kam dort die Text-Allowlist
 * an, und OpenRouter antwortete auf jeden Aufruf 404.
 */

interface CapturedImageCall {
  prompt: string
  options: { model?: string, providerRouting?: Record<string, unknown> }
}

let calls: CapturedImageCall[] = []
let aiImageImpl: () => Promise<{ mime: string, bytes: Uint8Array }[]> = async () => []

vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: {} } }))
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('aiImage', async (_event: unknown, prompt: string, options: CapturedImageCall['options']) => {
  calls.push({ prompt, options })
  return aiImageImpl()
})

const { runBrandMarkDrafts } = await import('../server/utils/brandMarkDrafts')

const BRIEF: BrandMarkBrief = {
  character: 'Ruhig, handwerklich, überprüfbar.',
  formLanguage: 'Weiche Kanten, eine Idee statt einer Szene.',
  ...brandMarkDerivedBriefFields('K', 'de'),
  noGos: 'Nicht verzerren.',
  places: 'Ladenschild, Website-Kopf.',
}

const profile = { $id: 'p1', title: 'Kailua Coffee', contentLocale: 'de' }
const stepRows = [{
  $id: 's1',
  stepKey: 'mark',
  slots: JSON.stringify({ 'j.brief': { confirmed: brandMarkBriefSlotValue(BRIEF, 'de') } }),
}]
const event = { context: {} } as unknown as H3Event

type RunArgs = Parameters<typeof runBrandMarkDrafts>

beforeEach(() => {
  calls = []
  aiImageImpl = async () => []
  delete process.env.BRAND_DEV_STUB_IMAGE
})

describe('runBrandMarkDrafts — was beim Transport ankommt', () => {
  it('reicht `only: [google-vertex/global]`, `zdr`, `deny` und kein Ausweichen an aiImage', async () => {
    aiImageImpl = async () => [{ mime: 'image/png', bytes: new Uint8Array([1, 2]) }]
    const result = await runBrandMarkDrafts(
      event, profile as unknown as RunArgs[1], stepRows as unknown as RunArgs[2], 'google/gemini-2.5-flash-image',
    )
    expect(calls).toHaveLength(BRAND_MARK_DRAFTS_PER_RUN)
    for (const call of calls) {
      expect(call.options.model).toBe('google/gemini-2.5-flash-image')
      expect(call.options.providerRouting).toEqual({
        zdr: true,
        dataCollection: 'deny',
        allowFallbacks: false,
        only: ['google-vertex/global'],
      })
    }
    expect(result.images).toHaveLength(BRAND_MARK_DRAFTS_PER_RUN)
    expect(result.failedCalls).toBe(0)
  })

  it('zählt gescheiterte Aufrufe und meldet `no_images`, wenn keiner liefert', async () => {
    aiImageImpl = async () => { throw new Error('404 No allowed providers are available') }
    const result = await runBrandMarkDrafts(
      event, profile as unknown as RunArgs[1], stepRows as unknown as RunArgs[2], 'm',
    )
    expect(result.failure).toBe('no_images')
    expect(result.failedCalls).toBe(BRAND_MARK_DRAFTS_PER_RUN)
  })

  it('GEGENPROBE: ohne Briefing kein einziger Aufruf', async () => {
    const result = await runBrandMarkDrafts(
      event, profile as unknown as RunArgs[1], [] as unknown as RunArgs[2], 'm',
    )
    expect(result.failure).toBe('no_brief')
    expect(calls).toEqual([])
  })
})
