import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * EIN ZEITDECKEL ÜBER BEIDE STUFEN (LL1 d).
 *
 * Die Kapitel-Prüfung und das Schliessen einer Sitzung rechnen in der Anfrage;
 * zwei Stufen à 60 s wären bis 120 s, der Webserver wartet 60 s. Mit
 * `budgetMs` endet Stufe 1 spätestens am Deckel, Stufe 2 bekommt nur den Rest
 * — und läuft nicht, wenn der Rest unter der Mindestfrist liegt. Die Uhr ist
 * gestellt (`Date` gefälscht): eine gestellte Stufe rückt sie um ihre Dauer
 * vor und merkt sich die Frist, die sie bekam.
 *
 * „DIE SUMME DER VERGEBENEN FRISTEN" heisst hier: die Zeit bis zum Beginn
 * eines Aufrufs plus dessen Frist liegt nie hinter dem Deckel. Die Frist der
 * Stufe 1 ist ein Höchstwert, verbraucht wird nur, was sie wirklich dauert;
 * entscheidend für den Webserver ist das Ende des letzten Aufrufs.
 */

vi.mock('../server/utils/brandAiQuota', () => ({ bookBrandAiQuota: async () => null }))

const logs: { event: string, data: Record<string, unknown> }[] = []
vi.stubGlobal('logEvent', (_level: string, event: string, data: Record<string, unknown> = {}) => {
  logs.push({ event, data })
})
vi.stubGlobal('useAppConfig', () => ({
  pukalani: { brand: { devStubGenerator: false, ai: { reviewModel: 'cheap/model' } } },
}))
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({
  tablesDB: { getRow: async () => ({ $id: 'global', brandAiEnabled: true }) },
}))
vi.stubGlobal('getEffectiveAiConfig', async () => ({ enabled: true, model: 'george/model' }))

interface StagedCall {
  model: string
  timeoutMs: number
  /** ms seit Beginn von `runBrandSessionReview`, als der Aufruf begann. */
  startedAt: number
}

const CONFLICT = { kind: 'conflict', slots: ['c.final', 'b.purpose'], why: 'reibt sich' }
const STAGE1_ANSWER = { goalReached: true, missing: [], notes: ['n'], findings: [CONFLICT], nextSession: null }
const STAGE2_ANSWER = { ...STAGE1_ANSWER, findings: [] }

let origin = 0
let durations: Record<string, number> = {}
const calls: StagedCall[] = []
vi.stubGlobal('aiCompleteJson', async (_event: H3Event, _prompt: string, options: { model: string, timeoutMs: number, maxTokens: number }) => {
  calls.push({ model: options.model, timeoutMs: options.timeoutMs, startedAt: Date.now() - origin })
  vi.setSystemTime(Date.now() + (durations[options.model] ?? 0))
  return options.model === 'george/model' ? STAGE2_ANSWER : STAGE1_ANSWER
})

const {
  BRAND_REVIEW_INLINE_BUDGET_MS,
  BRAND_REVIEW_STAGE2_MIN_MS,
  BRAND_REVIEW_TIMEOUT_MS,
  brandReviewStageTwoTimeout,
  runBrandSessionReview,
} = await import('../server/utils/brandReview')
const { BRAND_REVIEW_MAX_TOKENS } = await import('../server/utils/reviewPrompt')

function request(budgetMs?: number) {
  return {
    event: { context: {} } as unknown as H3Event,
    userId: 'u1',
    profileId: 'p1',
    mode: 'session' as const,
    stepKey: 'values' as const,
    session: { id: 'c.final', label: 'Final', goal: 'Ziel', quality: [], antiPatterns: [], form: { maxWords: null, forbidden: [] }, invariants: [] } as never,
    value: 'steht',
    history: [],
    document: [],
    chapter: [],
    notes: [],
    openSessions: [],
    ...(budgetMs === undefined ? {} : { budgetMs }),
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-18T10:00:00.000Z'))
  origin = Date.now()
  durations = {}
  calls.length = 0
  logs.length = 0
})

afterEach(() => {
  vi.useRealTimers()
})

describe('brandReviewStageTwoTimeout — wie viel Frist bekommt Stufe 2?', () => {
  it('ohne Deckel die volle Frist, wie bisher', () => {
    expect(brandReviewStageTwoTimeout(undefined, 0)).toBe(BRAND_REVIEW_TIMEOUT_MS)
    expect(brandReviewStageTwoTimeout(undefined, 59_000)).toBe(BRAND_REVIEW_TIMEOUT_MS)
  })

  it('mit Deckel den Rest, nie mehr als die volle Frist einer Stufe', () => {
    expect(brandReviewStageTwoTimeout(50_000, 3_000)).toBe(47_000)
    expect(brandReviewStageTwoTimeout(50_000, 40_000)).toBe(10_000)
    expect(brandReviewStageTwoTimeout(200_000, 0)).toBe(BRAND_REVIEW_TIMEOUT_MS)
  })

  it('unter der Mindestfrist läuft Stufe 2 nicht', () => {
    expect(brandReviewStageTwoTimeout(50_000, 40_001)).toBeNull()
    expect(brandReviewStageTwoTimeout(50_000, 50_000)).toBeNull()
    expect(brandReviewStageTwoTimeout(50_000, 90_000)).toBeNull()
  })

  it('der Deckel liegt klar unter den 60 s des Webservers und lässt Stufe 2 Platz', () => {
    expect(BRAND_REVIEW_INLINE_BUDGET_MS).toBeLessThan(60_000)
    expect(BRAND_REVIEW_STAGE2_MIN_MS).toBeLessThan(BRAND_REVIEW_INLINE_BUDGET_MS)
  })
})

describe('runBrandSessionReview mit Deckel', () => {
  function assertWithinBudget(budget: number): void {
    for (const call of calls) {
      expect(call.startedAt + call.timeoutMs, `Aufruf ${call.model} endet hinter dem Deckel`).toBeLessThanOrEqual(budget)
    }
  }

  it('schnell ⇒ beide Stufen wie bisher, Stufe 2 schreibt die Befunde', async () => {
    durations = { 'cheap/model': 3_000, 'george/model': 4_000 }
    const outcome = await runBrandSessionReview(request(BRAND_REVIEW_INLINE_BUDGET_MS))
    expect(calls.map(call => call.model)).toEqual(['cheap/model', 'george/model'])
    expect(calls[0]!.timeoutMs).toBe(BRAND_REVIEW_INLINE_BUDGET_MS)
    expect(calls[1]!.timeoutMs).toBe(BRAND_REVIEW_INLINE_BUDGET_MS - 3_000)
    expect(outcome).toMatchObject({ reviewed: true, reviewedBy: 'stage2' })
    expect(outcome.review.findings).toEqual([])
    assertWithinBudget(BRAND_REVIEW_INLINE_BUDGET_MS)
    expect(logs.some(log => log.event === 'brand.review_stage2_skipped')).toBe(false)
  })

  it('Stufe 1 langsam ⇒ Stufe 2 läuft mit dem Rest', async () => {
    durations = { 'cheap/model': 35_000, 'george/model': 2_000 }
    const outcome = await runBrandSessionReview(request(BRAND_REVIEW_INLINE_BUDGET_MS))
    expect(calls.map(call => call.model)).toEqual(['cheap/model', 'george/model'])
    expect(calls[1]!.timeoutMs).toBe(BRAND_REVIEW_INLINE_BUDGET_MS - 35_000)
    expect(outcome.reviewedBy).toBe('stage2')
    assertWithinBudget(BRAND_REVIEW_INLINE_BUDGET_MS)
  })

  it('Stufe 1 sehr langsam ⇒ Stufe 2 läuft nicht, Stufe 1 gilt (`stage1`), eine Log-Zeile mit Zahlen', async () => {
    durations = { 'cheap/model': 45_000 }
    const outcome = await runBrandSessionReview(request(BRAND_REVIEW_INLINE_BUDGET_MS))
    expect(calls.map(call => call.model)).toEqual(['cheap/model'])
    expect(outcome).toMatchObject({ reviewed: true, reviewedBy: 'stage1' })
    // Die Befunde der Stufe 1 bleiben — ein ehrliches Teil-Ergebnis.
    expect(outcome.review.findings).toEqual([CONFLICT])
    const skipped = logs.find(log => log.event === 'brand.review_stage2_skipped')
    expect(skipped?.data).toEqual({
      mode: 'session',
      stepKey: 'values',
      slotId: 'c.final',
      ms: 45_000,
      budgetMs: BRAND_REVIEW_INLINE_BUDGET_MS,
    })
    assertWithinBudget(BRAND_REVIEW_INLINE_BUDGET_MS)
  })

  it('die Token-Decke bleibt unter dem Deckel unverändert', async () => {
    const seen: number[] = []
    const original = globalThis.aiCompleteJson as (...args: unknown[]) => Promise<unknown>
    vi.stubGlobal('aiCompleteJson', async (...args: unknown[]) => {
      seen.push((args[2] as { maxTokens: number }).maxTokens)
      return original(...args)
    })
    try {
      await runBrandSessionReview(request(BRAND_REVIEW_INLINE_BUDGET_MS))
    }
    finally {
      vi.stubGlobal('aiCompleteJson', original)
    }
    expect(seen).toEqual([BRAND_REVIEW_MAX_TOKENS, BRAND_REVIEW_MAX_TOKENS])
  })
})

describe('runBrandSessionReview ohne Deckel (Dokument-Prüfung, alle anderen)', () => {
  it('jede Stufe behält die volle Frist, auch wenn Stufe 1 lange braucht', async () => {
    durations = { 'cheap/model': 45_000 }
    const outcome = await runBrandSessionReview(request())
    expect(calls.map(call => [call.model, call.timeoutMs])).toEqual([
      ['cheap/model', BRAND_REVIEW_TIMEOUT_MS],
      ['george/model', BRAND_REVIEW_TIMEOUT_MS],
    ])
    expect(outcome.reviewedBy).toBe('stage2')
  })
})
