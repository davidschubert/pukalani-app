import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { RUN_LEASE_STALL_MS } from '../../core/shared/runLease'
import type { MemoryStore } from '../../core/tests/support/runLeaseMemoryStore'
import { memoryStore } from '../../core/tests/support/runLeaseMemoryStore'
import { brandAiAccountDayKey, brandAiInstanceDayKey, brandDesignReadingDayKey } from '../shared/brandAiLimits'
import { BRAND_RUN_SCOPES, parseBrandRunDetail } from '../shared/brandRun'
import type { BrandInspirationListResponse, BrandInspirationReadResponse } from '../shared/types/brand'

/**
 * DIE LESUNG DER VORBILDER RECHNET IM HINTERGRUND (LL1 b, 2026-11-17).
 *
 * `POST …/inspiration/read` nimmt die Lauf-Sperre, bucht, antwortet `202`
 * und rechnet hinter der Antwort; `GET …/inspiration` liefert Liste, Fazit
 * und Lauf-Stand. Dieser Test lädt beide Routen und fährt sie mit der ECHTEN
 * Sperr-Logik des Core (Store im Speicher, echter Konflikt beim Anlegen), der
 * ECHTEN Buchung und Rückbuchung (`brandAiQuota.ts`) und dem ECHTEN
 * Burst-Zähler. Attrappe
 * ist nur, was Geld kostet oder eine Datenbank braucht: Zugang, Datentür, der
 * Vision-Lauf, die Ablage.
 */

let store: MemoryStore
let runResult: Record<string, unknown> = {}
let runThrows: unknown = null
let runGate: Promise<void> | null = null
let runCalls = 0
let entries: unknown[] = []
let stored: Record<string, unknown>[] = []
/** Mit welchen Kapitel-Zeilen der Slot geschrieben wurde, und mit welchem Wert. */
let slotWrites: { rows: unknown, value: string }[] = []
let profileExists = true
let noAccess = false
let foreignBrand = false
let counts = new Map<string, number>()
let refunds: string[] = []
let events: Record<string, unknown>[] = []
let logs: { level: string, name: string, data: Record<string, unknown> }[] = []
let status = 200
let headers: Record<string, unknown> = {}
let detached: Promise<void> = Promise.resolve()
/** Reihenfolge der Lesevorgänge der Liste — der Lauf-Stand kommt zuerst. */
let readOrder: string[] = []

const profile = { $id: 'p1', contentLocale: 'de' }
/** Die Zeilen der Zugangs-Prüfung (alt) und die von JETZT (mit dem Fazit des Laufs). */
const START_STEP_ROWS = [{ $id: 'p1_dna', stepKey: 'dna', revision: 1, slots: '{}' }]
const FRESH_STEP_ROWS = [{
  $id: 'p1_dna',
  stepKey: 'dna',
  revision: 7,
  slots: JSON.stringify({ 'g.reading': { latestDraft: 'FAZIT' } }),
}]

vi.mock('../server/utils/brandInspirationStore', async () => ({
  BRAND_INSPIRATION_STEP_KEY: 'dna',
  // Die Datentür des Layers: fremde oder fehlende Marke ⇒ 404 (hier gestellt).
  requireBrandInspirationContext: async () => {
    if (foreignBrand) throw Object.assign(new Error('Not Found'), { status: 404 })
    return { profile, stepRows: START_STEP_ROWS }
  },
  listBrandInspiration: async () => {
    readOrder.push('list')
    return entries
  },
}))
vi.mock('../server/utils/brandInspirationReading', async () => ({
  BRAND_READING_SLOT_ID: 'g.reading',
  brandReadingStubEnabled: () => true,
  brandReadingRunLine: (_at: string, count: number) => `gelesen: ${count}`,
  brandReadingSlotLabels: () => ({ keeps: 'Behalten', improves: 'Ändern' }),
  runBrandInspirationReading: async () => {
    runCalls++
    if (runGate) await runGate
    if (runThrows) throw runThrows
    return runResult
  },
  storeBrandReadings: async (_event: unknown, readings: Record<string, unknown>) => {
    stored.push(readings)
    return Object.keys(readings).length
  },
  writeBrandReadingSlot: async (_event: unknown, _profile: unknown, rows: unknown, value: string) => {
    slotWrites.push({ rows, value })
  },
}))
vi.mock('../server/utils/brandEvents', async () => ({
  recordBrandEvent: async (_event: unknown, input: { payload: Record<string, unknown> }) => {
    events.push(input.payload)
  },
}))
vi.mock('../server/utils/brandStore', async () => ({
  BRAND_PROFILES_TABLE: 'brand_profiles',
  brandDb: () => ({
    databaseId: 'main',
    tablesDB: {
      getRow: async () => {
        if (!profileExists) throw new Error('gone')
        return {}
      },
    },
  }),
  isAppwriteNotFound: () => false,
  loadStepRows: async () => {
    readOrder.push('steps')
    return FRESH_STEP_ROWS
  },
  parseSlotRecords: (raw: string) => JSON.parse(raw || '{}') as Record<string, unknown>,
  brandSlotStoredValue: (record: { latestDraft?: string } | undefined) => record?.latestDraft ?? '',
}))
vi.mock('../shared/brandReading', async (original) => {
  const actual = await original<typeof import('../shared/brandReading')>()
  return {
    ...actual,
    // Das Fazit der Liste: der gespeicherte Slot-Wert, als eine Zeile gelesen.
    parseBrandReadingSlotValue: (value: string) => (value ? { keeps: [value], improves: [], runLine: 'zuletzt' } : null),
    brandReadingSlotValue: () => 'NEUES FAZIT',
  }
})

const NARROW = `rl:${brandDesignReadingDayKey('p1')}`
const ACCOUNT = `rl:${brandAiAccountDayKey('u1')}`
const INSTANCE = `rl:${brandAiInstanceDayKey()}`

const lease = await import('../../core/server/utils/runLease')

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: {} } }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('logEvent', (level: string, name: string, data: Record<string, unknown>) => {
  logs.push({ level, name, data })
})
vi.stubGlobal('setHeader', (_event: unknown, name: string, value: unknown) => {
  headers[name] = value
})
vi.stubGlobal('setResponseStatus', (_event: unknown, code: number) => {
  status = code
})
vi.stubGlobal('requireBrandAccess', async () => {
  if (noAccess) throw Object.assign(new Error('Not Found'), { status: 404 })
  return { userId: 'u1' }
})
vi.stubGlobal('getEffectiveAiVisionConfig', async () => ({ enabled: true, model: 'vision-model' }))
vi.stubGlobal('isAiEndpointUnavailable', (error: unknown) =>
  (error as { data?: { code?: string } } | null)?.data?.code === 'ai_endpoint_unavailable')
// Die ECHTE Sperr-Logik — nur der Store ist im Speicher.
vi.stubGlobal('appwriteRunLeaseStore', () => ({
  ...store,
  latest: async (scope: string, subject: string) => {
    readOrder.push('run')
    return await store.latest(scope, subject)
  },
}))
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
const start = (await import('../server/api/brand/profiles/[id]/inspiration/read.post'))
  .default as unknown as (event: H3Event) => Promise<BrandInspirationReadResponse>
const read = (await import('../server/api/brand/profiles/[id]/inspiration/index.get'))
  .default as unknown as (event: H3Event) => Promise<BrandInspirationListResponse>

const event = { context: {} } as unknown as H3Event

function goodResult() {
  return {
    readings: { f1: { verdict: 'fits' }, f2: { verdict: 'tension' } },
    summary: { keeps: ['a'], improves: ['b'] },
    missing: [],
    model: 'm',
    ms: 5,
  }
}

async function latestRow() {
  return await store.latest(BRAND_RUN_SCOPES.reading, 'p1')
}

/** Ein abgebrochener Vorgänger: Herzschlag älter als die Frist, kein Ende. */
function seedStalled(detail: Record<string, unknown>): string {
  const at = new Date(Date.now() - RUN_LEASE_STALL_MS - 60_000).toISOString()
  const id = lease.runLeaseRowId(BRAND_RUN_SCOPES.reading, 'p1', 1)
  store.rows.set(id, {
    $id: id,
    scope: BRAND_RUN_SCOPES.reading,
    subject: 'p1',
    seq: 1,
    startedAt: at,
    heartbeatAt: at,
    finishedAt: '',
    outcome: '',
    detail: JSON.stringify(detail),
  })
  return id
}

beforeEach(() => {
  store = memoryStore()
  runResult = goodResult()
  runThrows = null
  runGate = null
  runCalls = 0
  entries = [
    { id: 'f1', number: 1, area: 'web', note: '', filename: 'a.png', createdAt: '', reading: null },
    { id: 'f2', number: 2, area: 'web', note: '', filename: 'b.png', createdAt: '', reading: null },
  ]
  stored = []
  slotWrites = []
  profileExists = true
  noAccess = false
  foreignBrand = false
  counts = new Map()
  refunds = []
  events = []
  logs = []
  status = 200
  headers = {}
  detached = Promise.resolve()
  readOrder = []
  generators.clearActiveBrandGenerations()
  vi.stubGlobal('useRateLimitStore', countingStore)
  vi.stubGlobal('keepRunLeaseAlive', lease.keepRunLeaseAlive)
})

describe('Wer darf — Start und Liste', () => {
  it('ohne Zugang (Gast, Konto ohne Freischaltung) ⇒ 404 an beiden Routen, nichts gelesen, nichts gesperrt', async () => {
    noAccess = true
    await expect(start(event)).rejects.toMatchObject({ status: 404 })
    await expect(read(event)).rejects.toMatchObject({ status: 404 })
    expect(readOrder).toEqual([])
    expect(store.calls.create).toBe(0)
    expect(counts.size).toBe(0)
  })

  it('fremde Marke ⇒ 404 an beiden Routen — kein Lauf-Stand, keine Liste, keine Sperre', async () => {
    foreignBrand = true
    await expect(start(event)).rejects.toMatchObject({ status: 404 })
    await expect(read(event)).rejects.toMatchObject({ status: 404 })
    expect(readOrder).toEqual([])
    expect(store.calls.create).toBe(0)
  })

  it('GEGENPROBE: der Besitzer bekommt Liste, Fazit und Lauf-Stand', async () => {
    const view = await read(event)
    expect(view.items).toHaveLength(2)
    expect(view.run.state).toBe('none')
    expect(view.reading.summary.keeps).toEqual(['FAZIT'])
  })
})

describe('POST …/inspiration/read — Start und Lauf', () => {
  it('antwortet 202 mit „läuft" und dem Rest-Kontingent, BEVOR etwas gelesen ist', async () => {
    let open: () => void = () => {}
    runGate = new Promise<void>((resolve) => {
      open = resolve
    })
    const res = await start(event)

    expect(status).toBe(202)
    expect(res).toMatchObject({ ok: true, run: { state: 'running' }, quota: { used: 1, limit: 3, remaining: 2 } })
    expect(stored).toEqual([])
    expect(slotWrites).toEqual([])
    expect(generators.countActiveBrandGenerations('u1')).toBe(1)

    open()
    await detached
    const row = await latestRow()
    expect(row).toMatchObject({ outcome: 'done' })
    expect(parseBrandRunDetail(row?.detail)).toMatchObject({ booked: true, created: 2, model: 'm' })
    expect(stored).toHaveLength(1)
    expect(generators.countActiveBrandGenerations('u1')).toBe(0)
    expect(events).toEqual([expect.objectContaining({ images: 2, read: 2, fits: 0, model: 'm' })])
  })

  it('der Slot wird gegen die Kapitel-Zeile von JETZT geschrieben, nicht gegen den Stand vom Start', async () => {
    await start(event)
    await detached
    // Während des Laufs hat der Mensch im Kapitel gespeichert (Revision 7).
    // Ein Schreiben mit den Zeilen vom Start (Revision 1) überschriebe das.
    expect(slotWrites).toEqual([{ rows: FRESH_STEP_ROWS, value: 'NEUES FAZIT' }])
  })

  it('ZEHN GLEICHZEITIGE STARTS ⇒ genau ein Lauf, eine Buchung, neun 409 `run_running`', async () => {
    let open: () => void = () => {}
    store.gate = new Promise<void>((resolve) => {
      open = resolve
    })
    const attempts = Array.from({ length: 10 }, () => start(event).then(() => 'started', error => (error as { data?: { code?: string } }).data?.code))
    open()
    const results = await Promise.all(attempts)
    await detached

    expect(results.filter(result => result === 'started')).toHaveLength(1)
    expect(results.filter(result => result === 'run_running')).toHaveLength(9)
    expect(runCalls).toBe(1)
    expect(counts.get(NARROW)).toBe(1)
    expect(counts.get(ACCOUNT)).toBe(1)
  })

  it('ein zweiter Start WÄHREND des Laufs ⇒ 409, kein Zähler berührt; danach wieder frei', async () => {
    let open: () => void = () => {}
    runGate = new Promise<void>((resolve) => {
      open = resolve
    })
    await start(event)
    await expect(start(event)).rejects.toMatchObject({ status: 409, data: { code: 'run_running' } })
    expect(counts.get(NARROW)).toBe(1)
    open()
    await detached

    runGate = null
    await start(event)
    await detached
    expect(runCalls).toBe(2)
    expect(counts.get(NARROW)).toBe(2)
  })
})

describe('POST …/inspiration/read — Vorprüfungen kosten nichts', () => {
  it('kein Vorbild ⇒ 409 `reading_no_images`, keine Sperre, keine Buchung', async () => {
    entries = []
    await expect(start(event)).rejects.toMatchObject({ status: 409, data: { code: 'reading_no_images' } })
    expect(store.calls.create).toBe(0)
    expect(counts.size).toBe(0)
  })

  it('429 der Drossel ⇒ `Retry-After`, die Sperre fällt wieder, kein Lauf, nichts zurückgebucht', async () => {
    counts.set(NARROW, 3)
    await expect(start(event)).rejects.toMatchObject({ status: 429 })
    expect(headers['Retry-After']).toBeGreaterThan(0)
    expect(store.rows.size).toBe(0)
    expect(runCalls).toBe(0)
    expect(refunds).toEqual([])
    // Die Absage hat den engen Eimer gezählt (4) — und das bleibt so.
    expect(counts.get(NARROW)).toBe(4)
    expect(generators.countActiveBrandGenerations('u1')).toBe(0)
    // GEGENPROBE: der Knopf hängt nicht — der nächste Start erreicht wieder die Drossel.
    await expect(start(event)).rejects.toMatchObject({ status: 429 })
  })

  it('ZWEI LÄUFE DES KONTOS LAUFEN SCHON ⇒ 429 `brand_ai_busy`, kein Eimer angefasst, Sperre und Platz zurück', async () => {
    generators.retainBrandGeneration('u1')
    generators.retainBrandGeneration('u1')
    await expect(start(event)).rejects.toMatchObject({ status: 429, data: { code: 'brand_ai_busy' } })
    expect(counts.size).toBe(0)
    expect(store.rows.size).toBe(0)
    expect(generators.countActiveBrandGenerations('u1')).toBe(2)
  })
})

describe('Der Lauf scheitert — der Grund steht an der Zeile, nichts wird geschrieben', () => {
  it('der Anbieter liefert nichts ⇒ `reading_unavailable`, keine Lesung, kein Slot', async () => {
    runResult = { failure: 'provider_error' }
    await start(event)
    await detached
    expect((await latestRow())?.outcome).toBe('reading_unavailable')
    expect(stored).toEqual([])
    expect(slotWrites).toEqual([])
    expect(events).toEqual([expect.objectContaining({ read: 0, failure: 'provider_error', refunded: true })])
    expect(generators.countActiveBrandGenerations('u1')).toBe(0)
  })

  it('zu gross für einen Zug ⇒ eigener Grund `reading_too_large`', async () => {
    runResult = { failure: 'too_large' }
    await start(event)
    await detached
    expect((await latestRow())?.outcome).toBe('reading_too_large')
  })

  it('der Vision-Lauf WIRFT ⇒ Ausgang `failed`, Platz frei — der Lauf endet nie still', async () => {
    runThrows = new Error('boom')
    await start(event)
    await detached
    const row = await latestRow()
    expect(row?.outcome).toBe('failed')
    expect(row?.finishedAt).not.toBe('')
    expect(generators.countActiveBrandGenerations('u1')).toBe(0)
  })

  it('kein Endpunkt unter der Bindung ⇒ nur der kurze Code steht an der Zeile', async () => {
    runThrows = Object.assign(new Error('AI endpoint unavailable'), { data: { code: 'ai_endpoint_unavailable' } })
    await start(event)
    await detached
    expect((await latestRow())?.outcome).toBe('ai_endpoint_unavailable')
  })

  it('die Marke ist während des Laufs gelöscht ⇒ nichts geschrieben, `profile_gone`', async () => {
    profileExists = false
    await start(event)
    await detached
    expect(stored).toEqual([])
    expect(slotWrites).toEqual([])
    expect((await latestRow())?.outcome).toBe('profile_gone')
  })
})

describe('Lauf ohne Lesung — der sichtbare Zähler geht zurück (LL1 c, wie BE-004)', () => {
  it('der Anbieter liefert nichts ⇒ genau EINE Rückbuchung auf den engen Eimer, `refunded` an der Zeile', async () => {
    runResult = { failure: 'provider_error' }
    await start(event)
    await detached

    const row = await latestRow()
    expect(row?.outcome).toBe('reading_unavailable')
    expect(parseBrandRunDetail(row?.detail)).toMatchObject({ booked: true, created: 0, refunded: true, used: 1, limit: 3 })
    expect(refunds).toEqual([NARROW])
    // Der Mensch sieht wieder „3 von 3" — Konto und Instanz bleiben gebucht.
    expect(counts.get(NARROW)).toBe(0)
    expect(counts.get(ACCOUNT)).toBe(1)
    expect(counts.get(INSTANCE)).toBe(1)

    // Die Liste zeigt den Grund UND den zurückgebuchten Zähler.
    const view = await read(event)
    expect(view.run).toMatchObject({
      state: 'failed',
      failure: 'reading_unavailable',
      refunded: true,
      quota: { used: 0, limit: 3, remaining: 3 },
    })
  })

  it('zu gross für einen Zug ⇒ `reading_too_large`, zurückgebucht', async () => {
    runResult = { failure: 'too_large' }
    await start(event)
    await detached
    expect((await latestRow())?.outcome).toBe('reading_too_large')
    expect(refunds).toEqual([NARROW])
    expect(events).toEqual([expect.objectContaining({ read: 0, failure: 'too_large', refunded: true })])
  })

  it('der Vision-Lauf WIRFT ⇒ `failed`, zurückgebucht', async () => {
    runThrows = new Error('boom')
    await start(event)
    await detached
    const row = await latestRow()
    expect(row?.outcome).toBe('failed')
    expect(parseBrandRunDetail(row?.detail).refunded).toBe(true)
    expect(refunds).toEqual([NARROW])
  })

  it('die Marke ist während des Laufs gelöscht ⇒ `profile_gone`, zurückgebucht (wie bei den Entwürfen)', async () => {
    profileExists = false
    await start(event)
    await detached
    const row = await latestRow()
    expect(row?.outcome).toBe('profile_gone')
    expect(parseBrandRunDetail(row?.detail)).toMatchObject({ created: 0, refunded: true })
    expect(refunds).toEqual([NARROW])
    expect(counts.get(ACCOUNT)).toBe(1)
  })

  it('keine Zeile ließ sich schreiben ⇒ `done`, aber zurückgebucht, das Ereignis sagt `refunded`', async () => {
    runResult = { ...goodResult(), readings: {} }
    await start(event)
    await detached
    const row = await latestRow()
    expect(row?.outcome).toBe('done')
    expect(parseBrandRunDetail(row?.detail)).toMatchObject({ created: 0, refunded: true })
    expect(refunds).toEqual([NARROW])
    expect(events).toEqual([expect.objectContaining({ read: 0, refunded: true })])
  })

  it('eine gestörte Rückbuchung ändert den Ausgang nicht (fail-soft)', async () => {
    runResult = { failure: 'provider_error' }
    vi.stubGlobal('useRateLimitStore', () => ({
      prefix: 'rl:',
      store: {
        hit: async () => ({ count: 1, resetInMs: 1000 }),
        refund: async () => {
          throw new Error('redis down')
        },
      },
    }))
    await start(event)
    await detached
    expect((await latestRow())?.outcome).toBe('reading_unavailable')
    expect(logs.some(entry => entry.name === 'brand.ai_quota_refund_failed')).toBe(true)
  })
})

describe('Ein Lauf mit Lesung bleibt gebucht', () => {
  it('GEGENPROBE: zwei Lesungen ⇒ `done`, keine Rückbuchung, kein `refunded`', async () => {
    await start(event)
    await detached
    const row = await latestRow()
    expect(row?.outcome).toBe('done')
    expect(parseBrandRunDetail(row?.detail)).toMatchObject({ created: 2, refunded: false })
    expect(refunds).toEqual([])
    expect(counts.get(NARROW)).toBe(1)
    expect(events).toHaveLength(1)
    expect(events[0]).not.toHaveProperty('refunded')
    expect((await read(event)).run.quota).toEqual({ used: 1, limit: 3, remaining: 2 })
  })

  it('GEGENPROBE: Teil-Erfolg (eine Lesung von zwei) ⇒ `done`, keine Rückbuchung', async () => {
    runResult = { ...goodResult(), readings: { f1: { verdict: 'fits' } } }
    await start(event)
    await detached
    expect((await latestRow())?.outcome).toBe('done')
    expect(parseBrandRunDetail((await latestRow())?.detail).created).toBe(1)
    expect(refunds).toEqual([])
    expect(counts.get(NARROW)).toBe(1)
  })

  it('verlorener Herzschlag ⇒ `lease_lost`, nichts geschrieben, KEINE Rückbuchung im Abschluss', async () => {
    vi.stubGlobal('keepRunLeaseAlive', () => ({ stop: () => {}, lost: () => true }))
    await start(event)
    await detached
    const row = await latestRow()
    expect(row?.outcome).toBe('lease_lost')
    expect(parseBrandRunDetail(row?.detail)).toMatchObject({ created: 0, refunded: false })
    expect(stored).toEqual([])
    expect(refunds).toEqual([])
    expect(counts.get(NARROW)).toBe(1)
  })

  it('Fehler VOR der Buchung (Zähler nicht erreichbar) ⇒ kein Lauf, nichts zurückgebucht, Sperre zurück', async () => {
    vi.stubGlobal('useRateLimitStore', () => ({
      prefix: 'rl:',
      store: {
        hit: async () => {
          throw new Error('redis down')
        },
        refund: async (key: string) => {
          refunds.push(key)
        },
      },
    }))
    await expect(start(event)).rejects.toThrow('redis down')
    expect(runCalls).toBe(0)
    expect(refunds).toEqual([])
    expect(store.rows.size).toBe(0)
    expect(generators.countActiveBrandGenerations('u1')).toBe(0)
  })
})

describe('Der abgebrochene Vorgänger — die Rückbuchung holt der nächste Start nach', () => {
  it('abgebrochen, gebucht, nichts gelesen ⇒ GENAU EINE Rückbuchung, am Vorgänger vermerkt; ein zweiter Start bucht nicht noch einmal', async () => {
    counts.set(NARROW, 1)
    const previousId = seedStalled({ booked: true, created: 0, used: 1, limit: 3 })

    // Die Seite nennt ihn „unterbrochen".
    expect((await read(event)).run.state).toBe('stalled')

    const res = await start(event)
    await detached
    expect(refunds).toEqual([NARROW])
    expect(parseBrandRunDetail(store.rows.get(previousId)?.detail).refunded).toBe(true)
    expect(logs.filter(entry => entry.name === 'brand.reading_stalled_refunded').map(entry => entry.data))
      .toEqual([{ profileId: 'p1', previousSeq: 1 }])
    // Der Zähler des Vorgängers ist zurück, der neue Lauf zählt als der erste.
    expect(res.quota).toEqual({ used: 1, limit: 3, remaining: 2 })

    // GEGENPROBE: der nächste Start bucht für niemanden zurück.
    const again = await start(event)
    await detached
    expect(refunds).toEqual([NARROW])
    expect(again.quota).toEqual({ used: 2, limit: 3, remaining: 1 })
  })

  it('lehnt die Drossel NACH der Rückbuchung ab, bucht der übernächste Start nicht noch einmal zurück', async () => {
    counts.set(NARROW, 1)
    seedStalled({ booked: true, created: 0, used: 1, limit: 3 })
    counts.set(ACCOUNT, 1000)

    await expect(start(event)).rejects.toMatchObject({ status: 429 })
    expect(refunds).toEqual([NARROW])
    await expect(start(event)).rejects.toMatchObject({ status: 429 })
    // GEGENPROBE zum Schlupfloch: weiter genau EINE Rückbuchung.
    expect(refunds).toEqual([NARROW])
  })

  it('GEGENPROBE: der abgebrochene Vorgänger hatte schon gelesen ⇒ keine Rückbuchung', async () => {
    seedStalled({ booked: true, created: 2, used: 1, limit: 3 })
    await start(event)
    await detached
    expect(refunds).toEqual([])
  })

  it('GEGENPROBE: der abgebrochene Vorgänger hatte nie gebucht ⇒ keine Rückbuchung', async () => {
    seedStalled({ booked: false, created: 0, used: 0, limit: 3 })
    await start(event)
    await detached
    expect(refunds).toEqual([])
  })

  it('GEGENPROBE: lässt sich der Vermerk nicht schreiben, wird NICHT zurückgebucht', async () => {
    seedStalled({ booked: true, created: 0, used: 1, limit: 3 })
    const update = store.update.bind(store)
    let first = true
    store.update = async (id, data) => {
      if (first) {
        first = false
        throw new Error('update failed')
      }
      return await update(id, data)
    }
    await start(event)
    await detached
    expect(refunds).toEqual([])
    expect(logs.filter(entry => entry.name === 'brand.reading_stalled_refund_failed').map(entry => entry.data))
      .toEqual([{ profileId: 'p1', message: 'update failed' }])
  })
})

describe('GET …/inspiration — Lauf-Stand und Fazit passen zusammen', () => {
  it('liest den Lauf-Stand ZUERST und die Kapitel-Zeilen danach', async () => {
    await read(event)
    // Die Zeilen der Zugangs-Prüfung zählen hier nicht (Attrappe); danach
    // kommt der Lauf-Stand VOR Liste und Kapitel-Zeilen.
    expect(readOrder[0]).toBe('run')
    expect(readOrder.slice(1).sort()).toEqual(['list', 'steps'])
  })

  it('ohne Lauf ⇒ `none`; mit laufendem Lauf ⇒ `running`; danach ⇒ `done`', async () => {
    expect((await read(event)).run.state).toBe('none')
    let open: () => void = () => {}
    runGate = new Promise<void>((resolve) => {
      open = resolve
    })
    await start(event)
    expect((await read(event)).run).toMatchObject({ state: 'running', quota: { remaining: 2 } })
    open()
    await detached
    expect((await read(event)).run).toMatchObject({ state: 'done', created: 2, failure: '' })
  })

  it('ist die Lauf-Tabelle nicht lesbar, antwortet die Liste trotzdem — mit „kein Lauf"', async () => {
    store.failLatest = true
    const view = await read(event)
    expect(view.run.state).toBe('none')
    expect(view.items).toHaveLength(2)
  })
})
