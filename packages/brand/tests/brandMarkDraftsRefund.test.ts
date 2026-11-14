import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import {
  brandAiAccountDayKey,
  brandAiInstanceDayKey,
  brandDesignDraftsDayKey,
} from '../shared/brandAiLimits'

/**
 * KEIN ENTWURF ⇒ DER SICHTBARE LAUF ZÄHLT NICHT (Finding BE-004, 2026-11-13).
 *
 * Die Route `POST …/mark/drafts` bucht vor dem Lauf drei Zähler: den ENGEN
 * Entwurfs-Eimer der Marke („Noch X von 3 Läufen heute"), den Konto-Tag und
 * den Instanz-Deckel. Endet der Lauf ohne einen einzigen abgelegten Entwurf,
 * geht GENAU der enge Eimer zurück — Konto und Instanz bleiben gebucht, sonst
 * wäre ein provozierter Leer-Lauf ein Freilauf ohne Ende.
 *
 * Alles um die Buchung herum ist Attrappe (Zugang, Datentür, Lauf, Ablage);
 * die BUCHUNG und die RÜCKBUCHUNG (`brandAiQuota.ts`) sind echt — sonst
 * prüfte der Test seine eigene Attrappe.
 */

let runResult: Record<string, unknown> = {}
let createThrowsAt = -1
let createCalls = 0

vi.mock('../server/utils/brandMarkBrief', async () => ({
  requireBrandMarkContext: async () => ({ profile, stepRows: [] }),
}))
vi.mock('../server/utils/brandMarkDrafts', async () => ({
  brandMarkDraftTitleFor: () => 'Entwurf 1',
  brandMarkDraftsFree: () => 12,
  brandMarkDraftsStubEnabled: () => true,
  createBrandMarkDraft: async () => {
    if (createCalls++ === createThrowsAt) throw new Error('storage down')
  },
  listBrandMarkDrafts: async () => [],
  runBrandMarkDrafts: async () => runResult,
  syncBrandMarkDraftsSlot: async () => {},
}))
vi.mock('../server/utils/brandEvents', async () => ({
  recordBrandEvent: async (_event: unknown, input: { payload: Record<string, unknown> }) => {
    events.push(input.payload)
  },
}))

const profile = { $id: 'p1', contentLocale: 'de' }
const NARROW = `rl:${brandDesignDraftsDayKey('p1')}`
const ACCOUNT = `rl:${brandAiAccountDayKey('u1')}`
const INSTANCE = `rl:${brandAiInstanceDayKey()}`

let counts = new Map<string, number>()
let refunds: string[] = []
let events: Record<string, unknown>[] = []
let logs: { level: string, name: string, data: Record<string, unknown> }[] = []

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: {} } }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('logEvent', (level: string, name: string, data: Record<string, unknown>) => {
  logs.push({ level, name, data })
})
vi.stubGlobal('setHeader', () => {})
vi.stubGlobal('requireBrandAccess', async () => ({ userId: 'u1' }))

/** Ein Zähl-Store mit `refund` wie der des Core — jede Rückbuchung ein Zeuge. */
function countingStore() {
  return {
    prefix: 'rl:',
    store: {
      hit: async (key: string) => {
        const count = (counts.get(key) ?? 0) + 1
        counts.set(key, count)
        return { count, resetInMs: 3_600_000 }
      },
      refund: async (key: string) => {
        refunds.push(key)
        const count = counts.get(key) ?? 0
        if (count > 0) counts.set(key, count - 1)
      },
    },
  }
}

const generators = await import('../server/utils/brandGenerators')
const handler = (await import('../server/api/brand/profiles/[id]/mark/drafts/index.post'))
  .default as unknown as (event: H3Event) => Promise<{ created: number, quota: { remaining: number } }>

const event = { context: {} } as unknown as H3Event

function image() {
  return { mime: 'image/png', extension: 'png', bytes: Buffer.from([1]) }
}

beforeEach(() => {
  counts = new Map()
  refunds = []
  events = []
  logs = []
  createThrowsAt = -1
  createCalls = 0
  generators.clearActiveBrandGenerations()
  vi.stubGlobal('useRateLimitStore', countingStore)
})

describe('POST …/mark/drafts — Rückbuchung ohne Ergebnis', () => {
  it('null Bilder ⇒ 502 `drafts_failed` UND genau eine Rückbuchung auf den engen Eimer', async () => {
    runResult = { failure: 'no_images', model: 'google/gemini-2.5-flash-image', failedCalls: 4 }
    await expect(handler(event)).rejects.toMatchObject({ status: 502, data: { code: 'drafts_failed' } })

    expect(refunds).toEqual([NARROW])
    // Der Mensch sieht wieder „3 von 3" — Konto und Instanz bleiben gebucht.
    expect(counts.get(NARROW)).toBe(0)
    expect(counts.get(ACCOUNT)).toBe(1)
    expect(counts.get(INSTANCE)).toBe(1)

    expect(events).toEqual([expect.objectContaining({ images: 0, failure: 'no_images', refunded: true })])
    const failed = logs.filter(entry => entry.name === 'brand.mark_drafts_failed')
    expect(failed).toHaveLength(1)
    expect(failed[0]!.level).toBe('error')
    expect(failed[0]!.data).toEqual({ profileId: 'p1', model: 'dev-stub', failure: 'no_images', failedCalls: 4 })
  })

  it('kein Briefing ⇒ 409 `drafts_no_brief`, ebenfalls zurückgebucht', async () => {
    runResult = { failure: 'no_brief' }
    await expect(handler(event)).rejects.toMatchObject({ status: 409, data: { code: 'drafts_no_brief' } })
    expect(refunds).toEqual([NARROW])
    // Dem Menschen fehlt ein Schritt — das ist kein Fehler der Instanz und
    // darf im Protokoll nicht wie ein Ausfall aussehen.
    const failed = logs.filter(entry => entry.name === 'brand.mark_drafts_failed')
    expect(failed.map(entry => entry.level)).toEqual(['info'])
  })

  it('leeres Ergebnis ohne Grund (`empty_result`) ⇒ zurückgebucht', async () => {
    runResult = { images: [] }
    await expect(handler(event)).rejects.toMatchObject({ status: 502 })
    expect(refunds).toEqual([NARROW])
    expect(events[0]).toMatchObject({ failure: 'empty_result', refunded: true })
  })

  it('Wurf beim Ablegen VOR dem ersten Bild ⇒ zurückgebucht', async () => {
    runResult = { images: [image(), image()], model: 'm', promptHash: 'h' }
    createThrowsAt = 0
    await expect(handler(event)).rejects.toThrow('storage down')
    expect(refunds).toEqual([NARROW])
  })

  it('GEGENPROBE: Teil-Erfolg (1 von 4) ⇒ KEINE Rückbuchung', async () => {
    runResult = { images: [image()], model: 'm', promptHash: 'h' }
    const res = await handler(event)
    expect(res.created).toBe(1)
    expect(refunds).toEqual([])
    expect(counts.get(NARROW)).toBe(1)
  })

  it('GEGENPROBE: Wurf beim Ablegen NACH dem ersten Bild ⇒ keine Rückbuchung', async () => {
    runResult = { images: [image(), image()], model: 'm', promptHash: 'h' }
    createThrowsAt = 1
    await expect(handler(event)).rejects.toThrow('storage down')
    expect(refunds).toEqual([])
  })

  it('GEGENPROBE: voller Erfolg ⇒ keine Rückbuchung', async () => {
    runResult = { images: [image(), image(), image(), image()], model: 'm', promptHash: 'h' }
    const res = await handler(event)
    expect(res.created).toBe(4)
    expect(res.quota.remaining).toBe(2)
    expect(refunds).toEqual([])
  })

  it('GEGENPROBE: 429 der Drossel ⇒ keine Rückbuchung (es gab nichts Eigenes)', async () => {
    counts.set(NARROW, 3)
    runResult = { failure: 'no_images' }
    await expect(handler(event)).rejects.toMatchObject({ status: 429 })
    expect(refunds).toEqual([])
    expect(counts.get(NARROW)).toBe(4)
  })

  it('eine gestörte Rückbuchung ändert die Antwort nicht (fail-soft)', async () => {
    runResult = { failure: 'no_images' }
    vi.stubGlobal('useRateLimitStore', () => ({
      prefix: 'rl:',
      store: {
        hit: async () => ({ count: 1, resetInMs: 1000 }),
        refund: async () => { throw new Error('redis down') },
      },
    }))
    await expect(handler(event)).rejects.toMatchObject({ status: 502, data: { code: 'drafts_failed' } })
    expect(logs.some(entry => entry.name === 'brand.ai_quota_refund_failed')).toBe(true)
  })
})
