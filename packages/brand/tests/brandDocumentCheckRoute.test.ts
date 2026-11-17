import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import type { MemoryStore } from '../../core/tests/support/runLeaseMemoryStore'
import { memoryStore } from '../../core/tests/support/runLeaseMemoryStore'
import type { BrandCheckHistoryResponse, BrandCheckStartResponse } from '../shared/types/brand'
import { BRAND_CHECK_ACCOUNT_DAILY_LIMIT } from '../shared/brandAiLimits'
import { BRAND_RUN_SCOPES, parseBrandRunDetail } from '../shared/brandRun'

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
/** Der KI-Riegel des Cores (`aiSwitchedOn`, P17 BE-006) — Standard: an. */
let aiOn: boolean
/** Die Lauf-Sperre (LL1 b) — die ECHTE Logik des Core, Store im Speicher. */
let store: MemoryStore
/** Der Lauf hinter der Antwort — Tests warten darauf. */
let detached: Promise<void> = Promise.resolve()
/** Hält das Urteil auf, solange es gesetzt ist. */
let judgeGate: Promise<void> | null
let status: number
/** Wer fragt: ohne Zugang (Gast, Konto ohne Freischaltung) oder mit fremder Marke. */
let noAccess: boolean
let profileGone: boolean

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    if (tableId === 'brand_steps') return { rows: stepRows, total: stepRows.length }
    const wanted = /"values":\["([^"]*)"\]/.exec(queries.join(' '))?.[1] ?? ''
    // Der Zwischenspeicher fragt nach `urlKey` (und will die jüngste Zeile),
    // der Verlauf nach `profileId` (und will alle).
    const byProfile = queries.some(query => query.includes('"attribute":"profileId"'))
    const rows = checks
      .filter(row => (byProfile ? row.profileId : row.urlKey) === wanted)
      .sort((a, b) => b.$createdAt.localeCompare(a.$createdAt))
      .slice(0, byProfile ? 50 : 1)
    return { rows, total: rows.length }
  }),
  getRow: vi.fn(async ({ tableId }: { tableId: string }) => {
    if (tableId === 'brand_profiles' && !profileGone) return PROFILE
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
      if (judgeGate) await judgeGate
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
vi.stubGlobal('requireBrandAccess', async () => {
  if (noAccess) throw Object.assign(new Error('Not Found'), { status: 404 })
  return { userId: 'u1' }
})
vi.stubGlobal('assertBrandOwnerAccess', () => {})
vi.stubGlobal('setResponseStatus', (_event: unknown, code: number) => {
  status = code
})
vi.stubGlobal('isAiEndpointUnavailable', (error: unknown) =>
  (error as { data?: { code?: string } } | null)?.data?.code === 'ai_endpoint_unavailable')
// Die ECHTE Sperr-Logik — nur der Store ist im Speicher.
const lease = await import('../../core/server/utils/runLease')
vi.stubGlobal('appwriteRunLeaseStore', () => store)
vi.stubGlobal('acquireRunLease', lease.acquireRunLease)
vi.stubGlobal('dropRunLease', lease.dropRunLease)
vi.stubGlobal('touchRunLease', lease.touchRunLease)
vi.stubGlobal('finishRunLease', lease.finishRunLease)
vi.stubGlobal('keepRunLeaseAlive', lease.keepRunLeaseAlive)
vi.stubGlobal('runDetached', (label: string, work: () => Promise<void>) => {
  detached = new Promise<void>((resolve) => {
    lease.runDetached(label, async () => {
      try {
        await work()
      }
      finally {
        resolve()
      }
    })
  })
})
vi.stubGlobal('getRouterParam', () => 'p1')
vi.stubGlobal('readBody', async () => body)
vi.stubGlobal('setHeader', () => {})
vi.stubGlobal('trustedClientIp', () => '203.0.113.7')
vi.stubGlobal('aiSwitchedOn', async () => aiOn)
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
const history = (await import('../server/api/brand/profiles/[id]/checks.get'))
  .default as unknown as (event: H3Event) => Promise<BrandCheckHistoryResponse>
const { judgeBrandCheck } = await import('../server/utils/brandCheckJudge')

/** Starten UND das Ende des Laufs abwarten. */
async function run(): Promise<BrandCheckStartResponse> {
  const result = await handler(event)
  await detached
  return result
}

/** Die jüngste Lauf-Zeile der Marke. */
async function latestRun() {
  return await store.latest(BRAND_RUN_SCOPES.documentCheck, 'p1')
}

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
  aiOn = true
  store = memoryStore()
  detached = Promise.resolve()
  judgeGate = null
  status = 200
  noAccess = false
  profileGone = false
  vi.mocked(judgeBrandCheck).mockClear()
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

    const result = await run()

    expect(result.cached).toBe(false)
    // Kein Treffer ⇒ ein Lauf: die Antwort trägt noch keine Id, der Lauf schon.
    expect(result.id).toBe('')
    expect(tablesDB.createRow).toHaveBeenCalledTimes(1)
    expect(parseBrandRunDetail((await latestRun())?.detail).ref).toBe('c2')
  })

  it('bucht den KONTO-Eimer, nie den Anschluss-Eimer', async () => {
    await run()

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
    // Die Sperre fällt wieder — der Knopf hängt nicht zwei Minuten auf „läuft".
    expect(store.rows.size).toBe(0)
    expect(judgeBrandCheck).not.toHaveBeenCalled()
  })
})

describe('POST /api/brand/profiles/:id/check · der Lauf rechnet hinter der Antwort (LL1 b)', () => {
  it('antwortet 202 mit „läuft", BEVOR das Urteil da ist — der fertige Check steht danach am Lauf und im Verlauf', async () => {
    let open: () => void = () => {}
    judgeGate = new Promise<void>((resolve) => {
      open = resolve
    })

    const result = await handler(event)

    expect(status).toBe(202)
    expect(result).toMatchObject({ ok: true, id: '', cached: false, run: { state: 'running' } })
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect((await history(event)).documentRun.state).toBe('running')

    open()
    await detached
    const row = await latestRun()
    expect(row).toMatchObject({ outcome: 'done' })
    expect(parseBrandRunDetail(row?.detail)).toMatchObject({ booked: true, created: 1, ref: 'c1' })

    const view = await history(event)
    expect(view.documentRun).toMatchObject({ state: 'done', ref: 'c1', failure: '' })
    expect(view.items.map(item => item.id)).toEqual(['c1'])
  })

  it('ZEHN GLEICHZEITIGE STARTS ⇒ genau ein Urteil, eine Buchung, ein Check, neun 409 `run_running`', async () => {
    let open: () => void = () => {}
    store.gate = new Promise<void>((resolve) => {
      open = resolve
    })
    const attempts = Array.from({ length: 10 }, () => handler(event).then(() => 'started', error => (error as { data?: { code?: string } }).data?.code))
    open()
    const results = await Promise.all(attempts)
    await detached

    expect(results.filter(result => result === 'started')).toHaveLength(1)
    expect(results.filter(result => result === 'run_running')).toHaveLength(9)
    expect(judgeBrandCheck).toHaveBeenCalledTimes(1)
    expect(buckets.get('rl:brand-check-account-day:u1')).toBe(1)
    expect(tablesDB.createRow).toHaveBeenCalledTimes(1)
  })

  it('ein zweiter Start WÄHREND des Laufs ⇒ 409, nichts gebucht; danach wieder frei', async () => {
    let open: () => void = () => {}
    judgeGate = new Promise<void>((resolve) => {
      open = resolve
    })
    body = { force: true }
    await handler(event)
    const error = await reject()
    expect(error.status).toBe(409)
    expect(error.data?.code).toBe('run_running')
    expect(buckets.get('rl:brand-check-account-day:u1')).toBe(1)
    open()
    await detached

    judgeGate = null
    await run()
    expect(judgeBrandCheck).toHaveBeenCalledTimes(2)
  })

  it('die Marke ist während des Laufs gelöscht ⇒ kein Check ohne Besitzer, `profile_gone`', async () => {
    let open: () => void = () => {}
    judgeGate = new Promise<void>((resolve) => {
      open = resolve
    })
    await handler(event)
    profileGone = true
    open()
    await detached
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect((await latestRun())?.outcome).toBe('profile_gone')
  })

  it('das Speichern scheitert ⇒ Ausgang `check_unavailable`, der Lauf endet nie still', async () => {
    tablesDB.createRow.mockRejectedValueOnce(new Error('db down'))
    await run()
    const row = await latestRun()
    expect(row?.outcome).toBe('check_unavailable')
    expect(row?.finishedAt).not.toBe('')
  })
})

describe('Wer darf — Start und Verlauf', () => {
  it('ohne Zugang (Gast, Konto ohne Freischaltung) ⇒ 404 an beiden Routen, nichts gesperrt, nichts gebucht', async () => {
    noAccess = true
    await expect(handler(event)).rejects.toMatchObject({ status: 404 })
    await expect(history(event)).rejects.toMatchObject({ status: 404 })
    expect(store.calls.create).toBe(0)
    expect(buckets.size).toBe(0)
  })

  it('fremde oder fehlende Marke ⇒ 404 an beiden Routen — kein Lauf-Stand, keine Sperre', async () => {
    profileGone = true
    await expect(handler(event)).rejects.toMatchObject({ status: 404 })
    await expect(history(event)).rejects.toMatchObject({ status: 404 })
    expect(store.calls.create).toBe(0)
  })

  it('GEGENPROBE: der Besitzer bekommt Verlauf und Lauf-Stand', async () => {
    const view = await history(event)
    expect(view).toMatchObject({ items: [], diff: null, documentRun: { state: 'none' } })
  })
})

describe('POST /api/brand/profiles/:id/check · KI abgeschaltet (P17, BE-006)', () => {
  it('⇒ 503 `check_paused`, KEIN Modell, KEINE Buchung, keine Zeile', async () => {
    aiOn = false

    const error = await reject()

    expect(error.status).toBe(503)
    expect(error.data?.code).toBe('check_paused')
    expect(judgeBrandCheck).not.toHaveBeenCalled()
    expect(buckets.size).toBe(0)
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect(logs.find(entry => entry.event === 'brand.doc_check_paused')?.data).toEqual({ profileId: 'p1' })
  })

  it('ein frischer Stand wird trotzdem ausgeliefert — er kostet nichts', async () => {
    aiOn = false
    checks = [{ $id: 'c9', $createdAt: new Date(Date.now() - 60_000).toISOString(), urlKey: 'doc:p1', score: 61 }]

    expect(await handler(event)).toEqual({ ok: true, id: 'c9', cached: true })
    expect(buckets.size).toBe(0)
  })

  it('GEGENPROBE: an ⇒ das Modell wird gefragt', async () => {
    await run()
    expect(judgeBrandCheck).toHaveBeenCalledTimes(1)
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
    // … und ohne eine Sperre zu nehmen.
    expect(store.calls.create).toBe(0)
  })
})

describe('POST /api/brand/profiles/:id/check · was gespeichert wird', () => {
  it('Quelle, Schlüssel, eigene Fassung, Brand und Konto', async () => {
    body = { rankingOptIn: true }
    await run()

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
    await run()

    const criteria = JSON.parse(String(lastWrite().criteria)) as { id: string, kind: string, score: number | null }[]
    expect(criteria).toHaveLength(40)
    expect(criteria.filter(entry => entry.kind === 'measured').every(entry => entry.score === null)).toBe(true)
    expect(criteria.filter(entry => entry.kind === 'judged').every(entry => entry.score === 2)).toBe(true)
    // Und die Zahl ist trotzdem eine echte: die gesperrten Kategorien fallen
    // aus BEIDEN Seiten des Bruchs (`computeBrandCheck`).
    expect(lastWrite().score).toBe(100)
  })

  it('speichert KEINEN Feldwert — nur seinen Hash', async () => {
    await run()

    const raw = JSON.stringify(lastWrite())
    expect(raw).not.toContain('Weil niemand frisch geröstet hat.')
    expect(String(lastWrite().textHash)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('protokolliert Brand, Feldzahl und Score — nie einen Feldwert', async () => {
    await run()

    const done = logs.find(entry => entry.event === 'brand.doc_check_completed')!
    expect(done.data).toMatchObject({ profileId: 'p1', fields: 1, cached: false })
    expect(JSON.stringify(logs)).not.toContain('Weil niemand frisch geröstet hat.')
  })
})

describe('POST /api/brand/profiles/:id/check · Ausfälle', () => {
  it('Anbieter kaputt ⇒ Ausgang `check_unavailable` am Lauf UND keine Zeile', async () => {
    judgeBroken = true

    const result = await run()

    // Der Start war angenommen; das Scheitern steht am Lauf — mit demselben
    // Wort, das früher der Fehler-Code der Anfrage war.
    expect(result.run?.state).toBe('running')
    expect((await latestRun())?.outcome).toBe('check_unavailable')
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect((await history(event)).documentRun).toMatchObject({ state: 'failed', failure: 'check_unavailable' })
  })

  it('kein Endpunkt unter der Bindung ⇒ nur der kurze Code steht an der Zeile', async () => {
    vi.mocked(judgeBrandCheck).mockRejectedValueOnce(
      Object.assign(new Error('AI endpoint unavailable'), { data: { code: 'ai_endpoint_unavailable' } }),
    )
    await run()
    expect((await latestRun())?.outcome).toBe('ai_endpoint_unavailable')
    expect(tablesDB.createRow).not.toHaveBeenCalled()
  })
})
