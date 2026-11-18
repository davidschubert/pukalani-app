import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { MarketReportResponse, MarketRunResponse } from '../shared/types/marketApi'
import { parseMarketReportRunDetail } from '../shared/marketReportRun'
import { RUN_LEASE_STALL_MS } from '../../core/shared/runLease'
import type { MemoryStore } from '../../core/tests/support/runLeaseMemoryStore'
import { memoryStore } from '../../core/tests/support/runLeaseMemoryStore'

/**
 * DER MARKTBERICHT IM HINTERGRUND (LL1 d, 2026-11-18) — die ECHTEN Routen
 * `POST /report`, `GET /report` und (für den gegenseitigen Ausschluss)
 * `POST /run`, der echte Bericht-Lauf (`marketReportRun.ts`) und die echte
 * Lauf-Sperre aus dem Core (`runLease.ts`) mit dem In-Memory-Store, der bei
 * gleicher Zeilen-Id einen Konflikt meldet wie Appwrite.
 *
 * Gestellt sind nur: Nitro-/h3-Globals, Zugang (die Rollen prüft
 * `route-roles-report.test.ts` an der echten Kette), Kontingent, der
 * Bericht-Stand und das Modell (ein Tor, das der Test öffnet) und das
 * Schreiben des Berichts (gezählt).
 *
 * Die Zusagen:
 *  - „antwortet sofort und rechnet im Hintergrund" ⇒ 202, während das Tor
 *    des Modells noch ZU ist;
 *  - „ein zweiter Klick startet keinen zweiten Lauf" ⇒ fünf gleichzeitige
 *    Starts: genau EIN Lauf, vier 409 `run_running`, EINE Buchung;
 *  - ein wiederverwendeter Bericht antwortet sofort mit 200, ohne Lauf-Zeile;
 *  - abgelehntes Kontingent ⇒ die Sperre fällt;
 *  - gescheiterter Lauf ⇒ kurzer Grund an der Zeile, der nächste Start geht;
 *  - der Lauf schreibt gegen den Stand von JETZT: verlorener Herzschlag,
 *    gelöschtes Branding oder ein jüngerer Bericht ⇒ nichts geschrieben;
 *  - Bericht und Vergleichs-Lauf schliessen einander aus.
 */

// ── Zustand der Fälschungen ─────────────────────────────────────────────────

let store: MemoryStore
let aiEnabled: boolean
let withProfile: number
let bookings: number
let runBookings: number
let quotaRejects: boolean
/** Liegt zu diesem Stand schon ein Bericht? (Wiederverwendung) */
let reusable: boolean
/** Erscheint der Bericht zu diesem Stand erst WÄHREND des Laufs? */
let reusableAfterCompute: boolean
/** Der jüngste Bericht (für „ist ein neuerer entstanden?"). */
let latestReportCreatedAt: string
let computeGate: Promise<void> | null
let computeCalls: number
/** Was das gestellte Modell meldet (`''` = gelungen). */
let computeFailure: string
let computeThrows: boolean
let persisted: number
let profileGone: boolean
let forceLost: boolean
/** Das Detail der Lauf-Zeile in dem Augenblick, in dem das Modell gerufen wird. */
let detailAtCompute: string

vi.mock('../server/contracts/brandContract', () => ({
  readBrandAiEnabled: vi.fn(async () => aiEnabled),
  loadOwnedProfile: vi.fn(async () => {
    if (profileGone) throw Object.assign(new Error('Not Found'), { statusCode: 404 })
    return { $id: 'p1' }
  }),
}))

vi.mock('../server/utils/marketAccess', () => ({
  requireMarketProfile: vi.fn(async () => ({
    userId: 'u-1',
    profileId: 'p1',
    betaAccount: true,
    profile: { contentLocale: 'de' },
  })),
  requireMarketUnlocked: vi.fn(async () => {}),
}))

vi.mock('../server/utils/marketQuota', () => ({
  bookMarketReport: vi.fn(async () => {
    if (quotaRejects) return { code: 'market_run_limit', retryAfterSec: 3600 }
    bookings++
    return null
  }),
  bookMarketRun: vi.fn(async () => {
    runBookings++
    return null
  }),
}))

vi.mock('../server/utils/marketStore', () => ({
  isMarketRowMissing: () => false,
  listMarketCompetitors: vi.fn(async () => [{ $id: 'c1' }]),
}))

vi.mock('../server/utils/marketRun', () => ({
  marketRunStore: () => store,
  // Der Vergleichs-Lauf selbst ist hier nicht Thema — nur, ob er STARTET.
  runMarketComparison: vi.fn(async () => {}),
}))

vi.mock('../server/utils/marketReportService', () => ({
  loadMarketReportState: vi.fn(async () => ({ withProfile, revisionKey: 'rev-1' })),
  marketReportForRevision: vi.fn(async () => {
    if (reusable) return { $id: 'rep-1', $createdAt: '2026-11-01T00:00:00.000Z', revisionKey: 'rev-1' }
    if (reusableAfterCompute && computeCalls > 0) {
      return { $id: 'rep-2', $createdAt: new Date().toISOString(), revisionKey: 'rev-1' }
    }
    return null
  }),
  latestMarketReport: vi.fn(async () => (latestReportCreatedAt
    ? { $id: 'rep-x', $createdAt: latestReportCreatedAt, revisionKey: 'rev-0' }
    : undefined)),
  loadMarketFindings: vi.fn(async () => []),
  toMarketReportView: vi.fn((row: { revisionKey: string }) => ({ revisionKey: row.revisionKey })),
  computeMarketReport: vi.fn(async () => {
    computeCalls++
    detailAtCompute = latestRow()?.detail ?? ''
    if (computeGate) await computeGate
    if (computeThrows) throw new Error('Appwrite: document structure')
    return { failure: computeFailure, claims: [], findings: [], model: 'm', promptVersion: 'v' }
  }),
  persistMarketReport: vi.fn(async () => {
    persisted++
    return []
  }),
  logMarketReport: vi.fn(),
}))

// ── Nitro-/h3-Globals ───────────────────────────────────────────────────────

interface TestEvent {
  context: { user?: { $id: string } }
  status?: number
  headers: Record<string, unknown>
  query: Record<string, string>
}

interface HttpError extends Error { statusCode?: number, data?: { code?: string } }

let postReport: (event: H3Event) => Promise<MarketReportResponse>
let getReport: (event: H3Event) => Promise<MarketReportResponse>
let postRun: (event: H3Event) => Promise<MarketRunResponse>

beforeAll(async () => {
  const lease = await import('../../core/server/utils/runLease')
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('createError', (init: { status: number, statusText: string, data?: unknown }) =>
    Object.assign(new Error(init.statusText), { statusCode: init.status, data: init.data }))
  vi.stubGlobal('logEvent', () => {})
  vi.stubGlobal('getQuery', (event: TestEvent) => event.query)
  vi.stubGlobal('readBody', async () => ({}))
  vi.stubGlobal('setResponseStatus', (event: TestEvent, status: number) => {
    event.status = status
  })
  vi.stubGlobal('setResponseHeader', (event: TestEvent, name: string, value: unknown) => {
    event.headers[name] = value
  })
  // Die ECHTE Sperr-Logik, als Auto-Import gestellt — nur der Store ist der
  // In-Memory-Store. Der Herzschlag-Timer ist der echte; `forceLost` lässt ihn
  // „verloren" melden, ohne 60 s zu warten.
  vi.stubGlobal('acquireRunLease', lease.acquireRunLease)
  vi.stubGlobal('touchRunLease', lease.touchRunLease)
  vi.stubGlobal('finishRunLease', lease.finishRunLease)
  vi.stubGlobal('dropRunLease', lease.dropRunLease)
  vi.stubGlobal('keepRunLeaseAlive', (...args: Parameters<typeof lease.keepRunLeaseAlive>) => {
    const real = lease.keepRunLeaseAlive(...args)
    return { stop: real.stop, lost: () => forceLost || real.lost() }
  })
  vi.stubGlobal('runDetached', lease.runDetached)

  postReport = (await import('../server/api/market/profiles/[id]/report.post')).default as unknown as typeof postReport
  getReport = (await import('../server/api/market/profiles/[id]/report.get')).default as unknown as typeof getReport
  postRun = (await import('../server/api/market/profiles/[id]/run.post')).default as unknown as typeof postRun
})

beforeEach(() => {
  store = memoryStore()
  aiEnabled = true
  withProfile = 2
  bookings = 0
  runBookings = 0
  quotaRejects = false
  reusable = false
  reusableAfterCompute = false
  latestReportCreatedAt = ''
  computeGate = null
  computeCalls = 0
  computeFailure = ''
  computeThrows = false
  persisted = 0
  profileGone = false
  forceLost = false
  detailAtCompute = ''
})

afterEach(async () => {
  computeGate = null
  await settled()
})

// ── Helfer ──────────────────────────────────────────────────────────────────

function newEvent(): TestEvent {
  return { context: { user: { $id: 'u-1' } }, headers: {}, query: {} }
}

function reportRows() {
  return [...store.rows.values()].filter(row => row.scope === 'report').sort((a, b) => b.seq - a.seq)
}

function latestRow() {
  return reportRows()[0] ?? null
}

/** Ein Tor, das erst der Test öffnet. */
function closeGate(): () => void {
  let open!: () => void
  computeGate = new Promise<void>((resolve) => {
    open = resolve
  })
  return () => {
    computeGate = null
    open()
  }
}

/** Wartet, bis kein Bericht-Lauf mehr offen ist. */
async function settled(): Promise<void> {
  await vi.waitFor(() => {
    for (const row of reportRows()) {
      if (!row.finishedAt && Date.parse(row.heartbeatAt) > Date.now() - RUN_LEASE_STALL_MS) {
        throw new Error('Lauf offen')
      }
    }
  }, { timeout: 2000, interval: 5 })
}

async function rejectionOf(promise: Promise<unknown>): Promise<HttpError> {
  try {
    await promise
  }
  catch (error) {
    return error as HttpError
  }
  throw new Error('kein Fehler')
}

/** Eine laufende Lauf-Zeile anderer Art, wie sie ein anderer Prozess hielte. */
function seedRunning(scope: string): void {
  const at = new Date().toISOString()
  store.rows.set(`seed-${scope}`, {
    $id: `seed-${scope}`,
    scope,
    subject: 'p1',
    seq: 1,
    startedAt: at,
    heartbeatAt: at,
    finishedAt: '',
    outcome: '',
    detail: '',
  })
}

// ── Antwort sofort, zweiter Klick ───────────────────────────────────────────

describe('POST /report — antwortet sofort, sperrt den zweiten Klick', () => {
  it('antwortet 202, BEVOR das Modell fertig ist; das Ende steht danach als `done` an der Zeile', async () => {
    const open = closeGate()
    const event = newEvent()
    const response = await postReport(event as unknown as H3Event)

    expect(event.status).toBe(202)
    expect(response.reportRun.state).toBe('running')
    expect(response.report).toBeNull()
    expect(bookings).toBe(1)
    expect(persisted).toBe(0)
    expect(latestRow()?.scope).toBe('report')
    expect(latestRow()?.subject).toBe('p1')

    open()
    await settled()
    expect(latestRow()?.outcome).toBe('done')
    expect(persisted).toBe(1)
    expect(computeCalls).toBe(1)
  })

  it('fünf gleichzeitige Starts ⇒ genau EIN Lauf, vier 409 `run_running`, EINE Buchung', async () => {
    const open = closeGate()
    let release!: () => void
    store.gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const events = Array.from({ length: 5 }, () => newEvent())
    const pending = events.map(event => postReport(event as unknown as H3Event).then(
      () => 'ok' as const,
      (error: HttpError) => error,
    ))
    // Alle fünf haben denselben Vorgänger (keinen) gelesen — jetzt erst legen sie an.
    await vi.waitFor(() => expect(store.calls.create).toBe(0))
    release()
    store.gate = null
    const outcomes = await Promise.all(pending)

    const accepted = outcomes.filter(outcome => outcome === 'ok')
    const refused = outcomes.filter((outcome): outcome is HttpError => outcome !== 'ok')
    expect(accepted).toHaveLength(1)
    expect(refused).toHaveLength(4)
    for (const error of refused) {
      expect(error.statusCode).toBe(409)
      expect(error.data?.code).toBe('run_running')
    }
    expect(events.filter(event => event.status === 202)).toHaveLength(1)
    expect(bookings).toBe(1)
    expect(reportRows()).toHaveLength(1)

    open()
    await settled()
    expect(computeCalls).toBe(1)
    expect(persisted).toBe(1)
  })

  it('der `paid`-Vermerk steht an der Zeile, BEVOR das Modell gerufen wird', async () => {
    await postReport(newEvent() as unknown as H3Event)
    await settled()
    expect(parseMarketReportRunDetail(detailAtCompute)).toMatchObject({ booked: true, paid: true, withProfile: 2 })
  })
})

// ── Was nichts kostet, sperrt nichts ────────────────────────────────────────

describe('POST /report — die kostenlosen Antworten bleiben sofort', () => {
  it('ein WIEDERVERWENDETER Bericht antwortet 200 mit dem Bericht — ohne Lauf-Zeile, ohne Buchung, ohne Modell', async () => {
    reusable = true
    const event = newEvent()
    const response = await postReport(event as unknown as H3Event)

    expect(event.status).toBeUndefined()
    expect(response.reused).toBe(true)
    expect(response.report).toMatchObject({ revisionKey: 'rev-1' })
    expect(response.reportRun.state).toBe('none')
    expect(store.rows.size).toBe(0)
    expect(bookings).toBe(0)
    expect(computeCalls).toBe(0)
  })

  it('ohne Marktprofil ⇒ 409 `market_no_profiles`, ohne Lauf-Zeile', async () => {
    withProfile = 0
    const error = await rejectionOf(postReport(newEvent() as unknown as H3Event))
    expect(error.statusCode).toBe(409)
    expect(error.data?.code).toBe('market_no_profiles')
    expect(store.rows.size).toBe(0)
  })

  it('KI aus ⇒ 409 `ai_disabled`, ohne Lauf-Zeile und ohne Buchung', async () => {
    aiEnabled = false
    const error = await rejectionOf(postReport(newEvent() as unknown as H3Event))
    expect(error.statusCode).toBe(409)
    expect(error.data?.code).toBe('ai_disabled')
    expect(store.rows.size).toBe(0)
    expect(bookings).toBe(0)
  })
})

// ── Kontingent ──────────────────────────────────────────────────────────────

describe('POST /report — erst Sperre, dann Kontingent', () => {
  it('lehnt das Kontingent ab ⇒ 429, die Sperre FÄLLT, der nächste Start geht', async () => {
    quotaRejects = true
    const event = newEvent()
    const error = await rejectionOf(postReport(event as unknown as H3Event))
    expect(error.statusCode).toBe(429)
    expect(error.data?.code).toBe('market_run_limit')
    expect(event.headers['Retry-After']).toBe(3600)
    expect(store.calls.remove).toBe(1)
    expect(reportRows()).toHaveLength(0)

    quotaRejects = false
    const next = newEvent()
    await postReport(next as unknown as H3Event)
    expect(next.status).toBe(202)
    await settled()
  })

  it('ein abgebrochener Vorgänger, gebucht und NICHT bezahlt, vererbt seine Buchung', async () => {
    const old = new Date(Date.now() - RUN_LEASE_STALL_MS - 1000).toISOString()
    store.rows.set('old', {
      $id: 'old', scope: 'report', subject: 'p1', seq: 1, startedAt: old, heartbeatAt: old,
      finishedAt: '', outcome: '', detail: JSON.stringify({ booked: true, paid: false, withProfile: 2 }),
    })
    await postReport(newEvent() as unknown as H3Event)
    expect(bookings).toBe(0)
    await settled()
    expect(latestRow()?.seq).toBe(2)
  })

  it('… ein abgebrochener Vorgänger MIT `paid` bleibt gebucht — der neue Start bucht', async () => {
    const old = new Date(Date.now() - RUN_LEASE_STALL_MS - 1000).toISOString()
    store.rows.set('old', {
      $id: 'old', scope: 'report', subject: 'p1', seq: 1, startedAt: old, heartbeatAt: old,
      finishedAt: '', outcome: '', detail: JSON.stringify({ booked: true, paid: true, withProfile: 2 }),
    })
    await postReport(newEvent() as unknown as H3Event)
    expect(bookings).toBe(1)
    await settled()
  })
})

// ── Ausgänge ────────────────────────────────────────────────────────────────

describe('der Lauf — jeder Ausgang steht an der Zeile', () => {
  it.each([
    ['provider_error'],
    ['schema_error'],
    ['ai_endpoint_unavailable'],
  ])('das Modell meldet `%s` ⇒ dieser kurze Grund an der Zeile, nichts geschrieben, der nächste Start geht', async (failure) => {
    computeFailure = failure
    await postReport(newEvent() as unknown as H3Event)
    await settled()
    expect(latestRow()?.outcome).toBe(failure)
    expect(latestRow()?.outcome.length).toBeLessThanOrEqual(32)
    expect(persisted).toBe(0)

    computeFailure = ''
    const next = newEvent()
    await postReport(next as unknown as H3Event)
    expect(next.status).toBe(202)
    await settled()
    expect(latestRow()?.outcome).toBe('done')
  })

  it('wirft etwas Unerwartetes ⇒ `failed`, keine Meldung an der Zeile', async () => {
    computeThrows = true
    await postReport(newEvent() as unknown as H3Event)
    await settled()
    expect(latestRow()?.outcome).toBe('failed')
    expect(latestRow()?.detail).not.toContain('Appwrite')
  })

  it('GET /report liefert den Lauf-Stand mit — gescheitert mit seinem Grund', async () => {
    computeFailure = 'provider_error'
    await postReport(newEvent() as unknown as H3Event)
    await settled()
    reusable = false
    const response = await getReport(newEvent() as unknown as H3Event)
    expect(response.reportRun).toMatchObject({ state: 'failed', failed: true, failure: 'provider_error' })
  })

  it('GET /report während des Laufs ⇒ `running`; nicht lesbare Lauf-Tabelle ⇒ „kein Lauf" (fail-soft)', async () => {
    const open = closeGate()
    await postReport(newEvent() as unknown as H3Event)
    expect((await getReport(newEvent() as unknown as H3Event)).reportRun.state).toBe('running')

    store.failLatest = true
    const blind = await getReport(newEvent() as unknown as H3Event)
    expect(blind.reportRun.state).toBe('none')
    store.failLatest = false
    open()
  })
})

// ── Gegen den Stand von JETZT ───────────────────────────────────────────────

describe('der Lauf schreibt gegen den Stand von JETZT', () => {
  it('verlorener Herzschlag ⇒ nichts mehr geschrieben, Ausgang `lease_lost`', async () => {
    const open = closeGate()
    await postReport(newEvent() as unknown as H3Event)
    await vi.waitFor(() => expect(computeCalls).toBe(1))
    forceLost = true
    open()
    await settled()
    expect(persisted).toBe(0)
    expect(latestRow()?.outcome).toBe('lease_lost')
  })

  it('das Branding wurde während des Laufs gelöscht ⇒ nichts geschrieben, `profile_gone`', async () => {
    const open = closeGate()
    await postReport(newEvent() as unknown as H3Event)
    profileGone = true
    open()
    await settled()
    expect(persisted).toBe(0)
    expect(latestRow()?.outcome).toBe('profile_gone')
  })

  it('ein JÜNGERER Bericht ist seit dem Start entstanden ⇒ der eigene tritt zurück', async () => {
    const open = closeGate()
    await postReport(newEvent() as unknown as H3Event)
    latestReportCreatedAt = new Date(Date.now() + 1000).toISOString()
    open()
    await settled()
    expect(persisted).toBe(0)
    expect(latestRow()?.outcome).toBe('done')
  })

  it('zu GENAU diesem Stand liegt inzwischen ein Bericht ⇒ keine Kopie', async () => {
    reusableAfterCompute = true
    await postReport(newEvent() as unknown as H3Event)
    await settled()
    expect(computeCalls).toBe(1)
    expect(persisted).toBe(0)
  })

  it('GEGENPROBE: ein ÄLTERER Bericht hält das Schreiben nicht auf', async () => {
    latestReportCreatedAt = '2026-01-01T00:00:00.000Z'
    await postReport(newEvent() as unknown as H3Event)
    await settled()
    expect(persisted).toBe(1)
  })
})

// ── Gegenseitiger Ausschluss ────────────────────────────────────────────────

describe('Bericht und Vergleichs-Lauf schliessen einander aus', () => {
  it('läuft der Vergleich ⇒ POST /report 409 `comparison_running`, keine Bericht-Zeile, keine Buchung', async () => {
    seedRunning('run')
    const error = await rejectionOf(postReport(newEvent() as unknown as H3Event))
    expect(error.statusCode).toBe(409)
    expect(error.data?.code).toBe('comparison_running')
    expect(reportRows()).toHaveLength(0)
    expect(bookings).toBe(0)
  })

  it('läuft ein Bericht ⇒ POST /run 409 `report_running`, keine Lauf-Zeile, keine Buchung', async () => {
    seedRunning('report')
    const error = await rejectionOf(postRun(newEvent() as unknown as H3Event))
    expect(error.statusCode).toBe(409)
    expect(error.data?.code).toBe('report_running')
    expect([...store.rows.values()].filter(row => row.scope === 'run')).toHaveLength(0)
    expect(runBookings).toBe(0)
    // Die geimpfte Zeile ist nie zu Ende — sie soll den Abbau nicht aufhalten.
    store.rows.delete('seed-report')
  })

  it('GEGENPROBE: ein BEENDETER Vergleich hält den Bericht nicht auf', async () => {
    seedRunning('run')
    const seeded = store.rows.get('seed-run')!
    seeded.finishedAt = new Date().toISOString()
    seeded.outcome = 'done'
    const event = newEvent()
    await postReport(event as unknown as H3Event)
    expect(event.status).toBe(202)
    await settled()
  })
})
