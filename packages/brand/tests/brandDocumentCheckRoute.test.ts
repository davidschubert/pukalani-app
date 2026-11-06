import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import type { BrandCheckStartResponse } from '../shared/types/brand'
import { BRAND_CHECK_ACCOUNT_DAILY_LIMIT } from '../shared/brandAiLimits'

/**
 * DER FUNDAMENT-CHECK AN DER ROUTE (BRAND-CHECK-SEITE §5b).
 *
 * Die REGELN stehen pur in `brandCheckDocument.test.ts` (Prompt, Zeile,
 * Material). Hier läuft, was ihnen erst Bedeutung gibt — die REIHENFOLGE, und
 * die verrutscht beim Umbauen still:
 *
 *  1. Ein Zwischenspeicher-Treffer urteilt NICHT und bucht NICHT. Sonst
 *     kostete jeder Doppelklick auf „Fundament prüfen" einen Modell-Aufruf.
 *  2. Ein LEERES Fundament ist ein 409 — VOR der Buchung. Ein Kontingent für
 *     eine Prüfung, die es gar nicht geben kann, wäre eine Strafe fürs Fragen.
 *  3. Gebucht wird der KONTO-Eimer (10/Tag), nie der Anschluss-Eimer: diese
 *     Route gibt es ohne Konto nicht.
 *  4. Fällt der Anbieter aus, wird NICHTS gespeichert — sonst läge ein halbes
 *     Ergebnis sieben Tage im Zwischenspeicher.
 *  5. Die Zeile trägt `source: 'document'`, ihre eigene `scoreVersion` und
 *     KEINEN Feldwert.
 */

interface FakeRow { $id: string, $createdAt: string, [key: string]: unknown }

const PROFILE: FakeRow = {
  $id: 'p1',
  $createdAt: '2026-09-01T00:00:00.000Z',
  createdByUserId: 'u1',
  ownerType: 'user',
  ownerId: 'u1',
  title: 'Kailua Coffee',
  contentLocale: 'de',
  pathKind: 'new',
  hasName: true,
  team: 'solo',
  subBrands: 'no',
  progressPct: 0,
  lastActivityAt: '2026-09-01T00:00:00.000Z',
}

let checks: FakeRow[]
let stepRows: FakeRow[]
let judgeBroken: boolean
let body: Record<string, unknown>
let buckets: Map<string, number>
let logs: { level: string, event: string, data: Record<string, unknown> }[]

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    if (tableId === 'brand_steps') return { rows: stepRows, total: stepRows.length }
    const wanted = /"values":\["([^"]*)"\]/.exec(queries.join(' '))?.[1] ?? ''
    const rows = checks
      .filter(row => row.urlKey === wanted)
      .sort((a, b) => b.$createdAt.localeCompare(a.$createdAt))
      .slice(0, 1)
    return { rows, total: rows.length }
  }),
  getRow: vi.fn(async ({ tableId }: { tableId: string }) => {
    if (tableId === 'brand_profiles') return PROFILE
    throw new AppwriteException('Row not found', 404)
  }),
  createRow: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const row = { $id: `c${checks.length + 1}`, $createdAt: new Date().toISOString(), ...data }
    checks.push(row)
    return row
  }),
}

vi.mock('../server/utils/brandCheckJudge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/utils/brandCheckJudge')>()
  return {
    ...actual,
    judgeBrandCheck: vi.fn(async () => {
      if (judgeBroken) throw new Error('provider down')
      const judgements: Record<string, { score: 0 | 1 | 2, evidence: string, note: string }> = {}
      for (const id of actual.BRAND_CHECK_JUDGED_IDS) {
        judgements[id] = { score: 2, evidence: 'Wir rösten in kleinen Mengen.', note: 'Klar gesagt.' }
      }
      return { judgements, industry: 'food', model: 'anthropic/claude-haiku-4.5' }
    }),
  }
})

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({
  public: { appwriteDatabaseId: 'main' },
  appwriteKey: 'test-server-secret',
}))
vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: {} } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('toH3Error', (error: unknown) => error)
vi.stubGlobal('logEvent', (level: string, event: string, data: Record<string, unknown> = {}) => {
  logs.push({ level, event, data })
})
vi.stubGlobal('requireBrandAccess', async () => ({ userId: 'u1' }))
vi.stubGlobal('assertBrandOwnerAccess', () => {})
vi.stubGlobal('getRouterParam', () => 'p1')
vi.stubGlobal('readBody', async () => body)
vi.stubGlobal('setHeader', () => {})
vi.stubGlobal('trustedClientIp', () => '203.0.113.7')
vi.stubGlobal('useRateLimitStore', () => ({
  prefix: 'rl:',
  store: {
    hit: async (key: string) => {
      const count = (buckets.get(key) ?? 0) + 1
      buckets.set(key, count)
      return { count, resetInMs: 3_600_000 }
    },
  },
}))

const handler = (await import('../server/api/brand/profiles/[id]/check.post'))
  .default as unknown as (event: H3Event) => Promise<BrandCheckStartResponse>

const event = { context: {} } as unknown as H3Event

function withSlots(slots: Record<string, unknown>): FakeRow {
  return {
    $id: 'p1_context',
    $createdAt: '2026-09-01T00:00:00.000Z',
    profileId: 'p1',
    stepKey: 'context',
    state: 'open',
    slots: JSON.stringify(slots),
    generations: '',
    revision: 0,
    activeSeconds: 0,
  }
}

function lastWrite(): Record<string, unknown> {
  const call = tablesDB.createRow.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> } | undefined
  return call?.data ?? {}
}

async function reject(): Promise<{ status?: number, data?: { code?: string } }> {
  try {
    await handler(event)
  }
  catch (error) {
    return error as { status?: number, data?: { code?: string } }
  }
  throw new Error('Die Route hat NICHT abgelehnt')
}

beforeEach(() => {
  checks = []
  stepRows = [withSlots({ 'a.origin': { confirmed: 'Weil niemand frisch geröstet hat.' } })]
  judgeBroken = false
  body = {}
  buckets = new Map()
  logs = []
  tablesDB.listRows.mockClear()
  tablesDB.createRow.mockClear()
  tablesDB.getRow.mockClear()
})

describe('POST /api/brand/profiles/:id/check · Zwischenspeicher und Deckel', () => {
  it('ein frischer Stand derselben Brand ⇒ die alte Zeile, ohne Modell und ohne Buchung', async () => {
    checks = [{
      $id: 'c9',
      $createdAt: new Date(Date.now() - 60_000).toISOString(),
      urlKey: 'doc:p1',
      score: 61,
    }]

    const result = await handler(event)

    expect(result).toEqual({ ok: true, id: 'c9', cached: true })
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect(buckets.size).toBe(0)
  })

  it('`force` umgeht den Zwischenspeicher und prüft neu', async () => {
    checks = [{
      $id: 'c9',
      $createdAt: new Date(Date.now() - 60_000).toISOString(),
      urlKey: 'doc:p1',
      score: 61,
    }]
    body = { force: true }

    const result = await handler(event)

    expect(result.cached).toBe(false)
    expect(result.id).not.toBe('c9')
    expect(tablesDB.createRow).toHaveBeenCalledTimes(1)
  })

  it('bucht den KONTO-Eimer, nie den Anschluss-Eimer', async () => {
    await handler(event)

    const keys = [...buckets.keys()]
    expect(keys.some(key => key.includes('brand-check-account-day:u1'))).toBe(true)
    expect(keys.some(key => key.includes('brand-check-ip-day'))).toBe(false)
    expect(keys.some(key => key.includes('brand-check-instance-day'))).toBe(true)
  })

  it('der elfte Lauf des Tages wird abgewiesen — und schreibt nichts', async () => {
    buckets.set('rl:brand-check-account-day:u1', BRAND_CHECK_ACCOUNT_DAILY_LIMIT)
    body = { force: true }

    const error = await reject()

    expect(error.status).toBe(429)
    expect(error.data?.code).toBe('brand_check_account_limit')
    expect(tablesDB.createRow).not.toHaveBeenCalled()
  })
})

describe('POST /api/brand/profiles/:id/check · ein leeres Fundament', () => {
  it('nichts bestätigt ⇒ 409 `document_empty`', async () => {
    stepRows = [withSlots({ 'a.origin': { latestDraft: 'Nur ein Entwurf.' } })]

    const error = await reject()

    expect(error.status).toBe(409)
    expect(error.data?.code).toBe('document_empty')
  })

  it('und zwar OHNE zu buchen — Fragen darf nichts kosten', async () => {
    stepRows = []
    await reject()
    expect(buckets.size).toBe(0)
    expect(tablesDB.createRow).not.toHaveBeenCalled()
  })
})

describe('POST /api/brand/profiles/:id/check · was gespeichert wird', () => {
  it('Quelle, Schlüssel, eigene Fassung, Brand und Konto', async () => {
    body = { rankingOptIn: true }
    await handler(event)

    expect(lastWrite()).toMatchObject({
      source: 'document',
      urlKey: 'doc:p1',
      url: '',
      host: 'Kailua Coffee',
      scoreVersion: 'doc-score-1',
      profileId: 'p1',
      userId: 'u1',
      rankingOptIn: true,
      hidden: false,
      industry: 'food',
    })
  })

  it('die sechzehn gerechneten Kriterien sind `null`, nicht 0', async () => {
    await handler(event)

    const criteria = JSON.parse(String(lastWrite().criteria)) as { id: string, kind: string, score: number | null }[]
    expect(criteria).toHaveLength(40)
    expect(criteria.filter(entry => entry.kind === 'measured').every(entry => entry.score === null)).toBe(true)
    expect(criteria.filter(entry => entry.kind === 'judged').every(entry => entry.score === 2)).toBe(true)
    // Und die Zahl ist trotzdem eine echte: die gesperrten Kategorien fallen
    // aus BEIDEN Seiten des Bruchs (`computeBrandCheck`).
    expect(lastWrite().score).toBe(100)
  })

  it('speichert KEINEN Feldwert — nur seinen Hash', async () => {
    await handler(event)

    const raw = JSON.stringify(lastWrite())
    expect(raw).not.toContain('Weil niemand frisch geröstet hat.')
    expect(String(lastWrite().textHash)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('protokolliert Brand, Feldzahl und Score — nie einen Feldwert', async () => {
    await handler(event)

    const done = logs.find(entry => entry.event === 'brand.doc_check_completed')!
    expect(done.data).toMatchObject({ profileId: 'p1', fields: 1, cached: false })
    expect(JSON.stringify(logs)).not.toContain('Weil niemand frisch geröstet hat.')
  })
})

describe('POST /api/brand/profiles/:id/check · Ausfälle', () => {
  it('Anbieter kaputt ⇒ 503 UND keine Zeile', async () => {
    judgeBroken = true

    const error = await reject()

    expect(error.status).toBe(503)
    expect(error.data?.code).toBe('check_unavailable')
    expect(tablesDB.createRow).not.toHaveBeenCalled()
  })
})
