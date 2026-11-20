import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { RUN_LEASE_STALL_MS } from '../../core/shared/runLease'
import type { MemoryStore } from '../../core/tests/support/runLeaseMemoryStore'
import { memoryStore } from '../../core/tests/support/runLeaseMemoryStore'
import {
  brandAiAccountDayKey,
  brandAiInstanceDayKey,
  brandDesignDraftsDayKey,
} from '../shared/brandAiLimits'
import { BRAND_RUN_SCOPES, parseBrandRunDetail } from '../shared/brandRun'
import type { BrandMarkDraftsIndexResponse, BrandMarkDraftsRunResponse } from '../shared/types/brand'

/**
 * DIE ZEICHEN-ENTWÜRFE RECHNEN IM HINTERGRUND (LL1 b, 2026-11-17).
 *
 * `POST …/mark/drafts` nimmt die Lauf-Sperre, bucht, antwortet `202` und
 * rechnet hinter der Antwort; `GET …/mark/drafts` liefert Liste und
 * Lauf-Stand. Dieser Test lädt beide Routen und fährt sie mit der ECHTEN
 * Sperr-Logik des Core (Store im Speicher, echter Konflikt beim Anlegen), der
 * ECHTEN Buchung und Rückbuchung (`brandAiQuota.ts`) und dem ECHTEN
 * Burst-Zähler. Attrappe ist nur, was Geld kostet oder eine Datenbank
 * braucht: Zugang, Datentür, der Bild-Lauf, die Ablage.
 *
 * Was hier steht, hielt bis LL1 b der Test `brandMarkDraftsRefund` für die
 * Anfrage fest (BE-004: kein Entwurf ⇒ der sichtbare Lauf zählt nicht) — die
 * Zusage ist dieselbe, nur steht der Ausgang jetzt an der Lauf-Zeile.
 */

let store: MemoryStore
let runResult: Record<string, unknown> = {}
let runThrows: unknown = null
/** Hält den Bild-Lauf auf, solange es gesetzt ist. */
let runGate: Promise<void> | null = null
let runCalls = 0
let hasBrief = true
let createThrowsAt = -1
let createCalls = 0
/** Hält das Ablegen VOR dem Entwurf mit dieser Nummer auf (0 = vor dem ersten). */
let createGateAt = -1
let createGate: Promise<void> | null = null
let created: { title: string }[] = []
/** Was `listBrandMarkDrafts` je Aufruf liefert (letzter Eintrag bleibt). */
let listings: unknown[][] = [[]]
let listCalls = 0
let profileExists = true
/** Mit welchen Kapitel-Zeilen der Slot-Sync gerufen wurde. */
let syncedWith: unknown[] = []
/** Wer fragt: ohne Zugang (Gast, Konto ohne Freischaltung) oder mit fremder Marke. */
let noAccess = false
let foreignBrand = false
let counts = new Map<string, number>()
let refunds: string[] = []
let events: Record<string, unknown>[] = []
let logs: { level: string, name: string, data: Record<string, unknown> }[] = []
let status = 200
let headers: Record<string, unknown> = {}
/** Der Lauf hinter der Antwort — Tests warten darauf. */
let detached: Promise<void> = Promise.resolve()

vi.mock('../server/utils/brandMarkBrief', async () => ({
  // Die Datentür des Layers: fremde oder fehlende Marke ⇒ 404 (hier gestellt).
  requireBrandMarkContext: async () => {
    if (foreignBrand) throw Object.assign(new Error('Not Found'), { status: 404 })
    return { profile, stepRows: [] }
  },
}))
vi.mock('../server/utils/brandMarkDrafts', async () => ({
  brandMarkDraftSources: () => (hasBrief ? { locale: 'de' } : null),
  brandMarkDraftTitleFor: (entries: unknown[], offset: number) => `Entwurf ${entries.length + offset + 1}`,
  brandMarkDraftsFree: (entries: unknown[]) => Math.max(0, 12 - entries.length),
  brandMarkDraftsStubEnabled: () => true,
  createBrandMarkDraft: async (_event: unknown, input: { title: string }) => {
    if (createGate && createCalls === createGateAt) await createGate
    if (createCalls++ === createThrowsAt) throw new Error('storage down')
    created.push({ title: input.title })
  },
  listBrandMarkDrafts: async () => listings[Math.min(listCalls++, listings.length - 1)],
  runBrandMarkDrafts: async () => {
    runCalls++
    if (runGate) await runGate
    if (runThrows) throw runThrows
    return runResult
  },
  syncBrandMarkDraftsSlot: async (_event: unknown, _profile: unknown, rows: unknown) => {
    syncedWith.push(rows)
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
  // Der Stand der Kapitel-Zeilen IM AUGENBLICK des Schreibens.
  loadStepRows: async () => FRESH_STEP_ROWS,
}))

const profile = { $id: 'p1', contentLocale: 'de' }
const FRESH_STEP_ROWS = [{ $id: 'p1_mark', stepKey: 'mark', revision: 7 }]
const NARROW = `rl:${brandDesignDraftsDayKey('p1')}`
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
vi.stubGlobal('getEffectiveAiImageConfig', async () => ({ enabled: true, model: 'image-model' }))
vi.stubGlobal('isAiEndpointUnavailable', (error: unknown) =>
  (error as { data?: { code?: string } } | null)?.data?.code === 'ai_endpoint_unavailable')
// Die ECHTE Sperr-Logik — nur der Store ist im Speicher.
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
const start = (await import('../server/api/brand/profiles/[id]/mark/drafts/index.post'))
  .default as unknown as (event: H3Event) => Promise<BrandMarkDraftsRunResponse>
const read = (await import('../server/api/brand/profiles/[id]/mark/drafts/index.get'))
  .default as unknown as (event: H3Event) => Promise<BrandMarkDraftsIndexResponse>

const event = { context: {} } as unknown as H3Event

function image() {
  return { mime: 'image/png', extension: 'png', bytes: Buffer.from([1]) }
}
function fourImages() {
  return { images: [image(), image(), image(), image()], model: 'm', promptHash: 'h' }
}

/** Die jüngste Lauf-Zeile der Marke. */
async function latestRow() {
  return await store.latest(BRAND_RUN_SCOPES.drafts, 'p1')
}

/** Ein abgebrochener Vorgänger: Herzschlag älter als die Frist, kein Ende. */
function seedStalled(detail: Record<string, unknown>): string {
  const at = new Date(Date.now() - RUN_LEASE_STALL_MS - 60_000).toISOString()
  const id = lease.runLeaseRowId(BRAND_RUN_SCOPES.drafts, 'p1', 1)
  store.rows.set(id, {
    $id: id,
    scope: BRAND_RUN_SCOPES.drafts,
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
  runResult = fourImages()
  runThrows = null
  runGate = null
  runCalls = 0
  hasBrief = true
  createThrowsAt = -1
  createCalls = 0
  createGateAt = -1
  createGate = null
  created = []
  listings = [[]]
  listCalls = 0
  profileExists = true
  syncedWith = []
  noAccess = false
  foreignBrand = false
  counts = new Map()
  refunds = []
  events = []
  logs = []
  status = 200
  headers = {}
  detached = Promise.resolve()
  generators.clearActiveBrandGenerations()
  vi.stubGlobal('useRateLimitStore', countingStore)
  vi.stubGlobal('keepRunLeaseAlive', lease.keepRunLeaseAlive)
})

describe('Wer darf — Start und Liste', () => {
  it('ohne Zugang (Gast, Konto ohne Freischaltung) ⇒ 404 an beiden Routen, nichts gelesen, nichts gesperrt', async () => {
    noAccess = true
    await expect(start(event)).rejects.toMatchObject({ status: 404 })
    await expect(read(event)).rejects.toMatchObject({ status: 404 })
    expect(listCalls).toBe(0)
    expect(store.calls.create).toBe(0)
    expect(counts.size).toBe(0)
  })

  it('fremde Marke ⇒ 404 an beiden Routen — kein Lauf-Stand, keine Liste, keine Sperre', async () => {
    // Ein fremder Lauf liegt an der Marke; das fremde Konto erfährt nichts davon.
    seedStalled({ booked: true, created: 0, used: 1, limit: 3 })
    foreignBrand = true
    await expect(start(event)).rejects.toMatchObject({ status: 404 })
    await expect(read(event)).rejects.toMatchObject({ status: 404 })
    expect(listCalls).toBe(0)
    expect(store.calls.create).toBe(0)
    expect(refunds).toEqual([])
  })

  it('GEGENPROBE: der Besitzer bekommt Liste und Lauf-Stand', async () => {
    const view = await read(event)
    expect(view).toMatchObject({ items: [], run: { state: 'none' }, imageModel: 'image-model' })
  })
})

describe('POST …/mark/drafts — Start und Lauf', () => {
  it('antwortet 202 mit „läuft" und dem Rest-Kontingent, BEVOR ein Bild entstanden ist', async () => {
    let open: () => void = () => {}
    runGate = new Promise<void>((resolve) => {
      open = resolve
    })
    const res = await start(event)

    expect(status).toBe(202)
    expect(res).toMatchObject({ ok: true, run: { state: 'running' }, quota: { used: 1, limit: 3, remaining: 2 } })
    // Der Lauf wartet noch am Tor: nichts abgelegt, aber gebucht und gesperrt.
    expect(created).toEqual([])
    expect(counts.get(NARROW)).toBe(1)
    expect(parseBrandRunDetail((await latestRow())?.detail)).toMatchObject({ booked: true, created: 0 })
    expect(generators.countActiveBrandGenerations('u1')).toBe(1)

    open()
    await detached
    const row = await latestRow()
    expect(row).toMatchObject({ outcome: 'done' })
    expect(row?.finishedAt).not.toBe('')
    expect(parseBrandRunDetail(row?.detail)).toMatchObject({ created: 4, refunded: false, model: 'm' })
    expect(created.map(entry => entry.title)).toEqual(['Entwurf 1', 'Entwurf 2', 'Entwurf 3', 'Entwurf 4'])
    expect(refunds).toEqual([])
    // Der Burst-Platz gehört dem Lauf und ist mit ihm zurück.
    expect(generators.countActiveBrandGenerations('u1')).toBe(0)
    expect(events).toEqual([expect.objectContaining({ images: 4, promptHash: 'h', model: 'm' })])
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
    expect(created).toHaveLength(4)
  })

  it('ein zweiter Start WÄHREND des Laufs ⇒ 409, kein Zähler berührt, kein zweiter Lauf', async () => {
    let open: () => void = () => {}
    runGate = new Promise<void>((resolve) => {
      open = resolve
    })
    await start(event)
    await expect(start(event)).rejects.toMatchObject({ status: 409, data: { code: 'run_running' } })
    expect(counts.get(NARROW)).toBe(1)
    open()
    await detached
    expect(runCalls).toBe(1)

    // GEGENPROBE: nach dem Ende ist der nächste Start wieder frei.
    await start(event)
    await detached
    expect(runCalls).toBe(2)
    expect(counts.get(NARROW)).toBe(2)
  })
})

describe('POST …/mark/drafts — Vorprüfungen kosten nichts', () => {
  it('kein Briefing ⇒ 409 `drafts_no_brief`, keine Sperre, keine Buchung', async () => {
    hasBrief = false
    await expect(start(event)).rejects.toMatchObject({ status: 409, data: { code: 'drafts_no_brief' } })
    expect(store.calls.create).toBe(0)
    expect(counts.size).toBe(0)
    // Dem Menschen fehlt ein Schritt — im Protokoll kein Ausfall.
    expect(logs.filter(entry => entry.name === 'brand.mark_drafts_failed').map(entry => entry.level)).toEqual(['info'])
  })

  it('kein Platz ⇒ 409 `drafts_limit_reached`, keine Sperre', async () => {
    listings = [Array.from({ length: 10 }, () => ({}))]
    await expect(start(event)).rejects.toMatchObject({ status: 409, data: { code: 'drafts_limit_reached' } })
    expect(store.calls.create).toBe(0)
  })

  it('429 der Drossel ⇒ `Retry-After`, die Sperre fällt wieder, kein Lauf, nichts zurückgebucht', async () => {
    counts.set(NARROW, 3)
    await expect(start(event)).rejects.toMatchObject({ status: 429 })
    expect(headers['Retry-After']).toBeGreaterThan(0)
    expect(store.rows.size).toBe(0)
    expect(runCalls).toBe(0)
    expect(refunds).toEqual([])
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

describe('Lauf ohne Ergebnis — der sichtbare Zähler geht zurück (BE-004)', () => {
  it('null Bilder ⇒ Ausgang `drafts_failed`, genau eine Rückbuchung auf den engen Eimer', async () => {
    runResult = { failure: 'no_images', model: 'image-model', failedCalls: 4 }
    await start(event)
    await detached

    const row = await latestRow()
    expect(row?.outcome).toBe('drafts_failed')
    expect(parseBrandRunDetail(row?.detail)).toMatchObject({ created: 0, refunded: true })
    expect(refunds).toEqual([NARROW])
    // Der Mensch sieht wieder „3 von 3" — Konto und Instanz bleiben gebucht.
    expect(counts.get(NARROW)).toBe(0)
    expect(counts.get(ACCOUNT)).toBe(1)
    expect(counts.get(INSTANCE)).toBe(1)
    expect(events).toEqual([expect.objectContaining({ images: 0, failure: 'no_images', refunded: true })])
    const failed = logs.filter(entry => entry.name === 'brand.mark_drafts_failed')
    expect(failed).toHaveLength(1)
    expect(failed[0]!.level).toBe('error')

    // Die Liste zeigt den Grund UND den zurückgebuchten Zähler.
    const view = await read(event)
    expect(view.run).toMatchObject({
      state: 'failed',
      failure: 'drafts_failed',
      refunded: true,
      quota: { used: 0, limit: 3, remaining: 3 },
    })
  })

  it('der Lauf findet kein Briefing mehr ⇒ `drafts_no_brief`, zurückgebucht, Info-Zeile', async () => {
    runResult = { failure: 'no_brief' }
    await start(event)
    await detached
    expect((await latestRow())?.outcome).toBe('drafts_no_brief')
    expect(refunds).toEqual([NARROW])
    expect(logs.filter(entry => entry.name === 'brand.mark_drafts_failed').map(entry => entry.level)).toEqual(['info'])
  })

  it('Wurf beim Ablegen VOR dem ersten Bild ⇒ `drafts_failed`, zurückgebucht', async () => {
    createThrowsAt = 0
    await start(event)
    await detached
    expect((await latestRow())?.outcome).toBe('drafts_failed')
    expect(refunds).toEqual([NARROW])
  })

  it('der Bild-Lauf WIRFT ⇒ Ausgang `failed`, zurückgebucht, Platz frei — der Lauf endet nie still', async () => {
    runThrows = new Error('boom')
    await start(event)
    await detached
    const row = await latestRow()
    expect(row?.outcome).toBe('failed')
    expect(row?.finishedAt).not.toBe('')
    expect(refunds).toEqual([NARROW])
    expect(generators.countActiveBrandGenerations('u1')).toBe(0)
    expect(logs.some(entry => entry.name === 'brand.run_failed')).toBe(true)
  })

  it('kein Endpunkt unter der Bindung ⇒ nur der kurze Code steht an der Zeile', async () => {
    runThrows = Object.assign(new Error('AI endpoint unavailable'), { data: { code: 'ai_endpoint_unavailable' } })
    await start(event)
    await detached
    expect((await latestRow())?.outcome).toBe('ai_endpoint_unavailable')
  })

  it('die Marke ist während des Laufs gelöscht ⇒ nichts abgelegt, `profile_gone`', async () => {
    profileExists = false
    await start(event)
    await detached
    expect(created).toEqual([])
    expect((await latestRow())?.outcome).toBe('profile_gone')
  })

  it('eine gestörte Rückbuchung ändert den Ausgang nicht (fail-soft)', async () => {
    runResult = { failure: 'no_images' }
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
    expect((await latestRow())?.outcome).toBe('drafts_failed')
    expect(logs.some(entry => entry.name === 'brand.ai_quota_refund_failed')).toBe(true)
  })
})

describe('Teil-Erfolg ist ein Lauf — geklemmt, nicht abgelehnt', () => {
  it('GEGENPROBE: ein Bild von vier ⇒ `done`, keine Rückbuchung', async () => {
    runResult = { images: [image()], model: 'm', promptHash: 'h' }
    await start(event)
    await detached
    expect((await latestRow())?.outcome).toBe('done')
    expect(parseBrandRunDetail((await latestRow())?.detail).created).toBe(1)
    expect(refunds).toEqual([])
    expect(counts.get(NARROW)).toBe(1)
  })

  it('Wurf beim Ablegen NACH dem ersten Bild ⇒ `done` mit einem Entwurf, keine Rückbuchung', async () => {
    createThrowsAt = 1
    await start(event)
    await detached
    expect((await latestRow())?.outcome).toBe('done')
    expect(created).toHaveLength(1)
    expect(refunds).toEqual([])
  })

  it('während des Laufs kamen Entwürfe dazu ⇒ nur was unter den Deckel passt, Namen zählen von JETZT weiter', async () => {
    // Vorprüfung: 8 liegen (Platz für vier). Beim Ablegen liegen 10 — Platz für zwei.
    listings = [
      Array.from({ length: 8 }, () => ({})),
      Array.from({ length: 10 }, () => ({})),
    ]
    await start(event)
    await detached
    expect(created.map(entry => entry.title)).toEqual(['Entwurf 11', 'Entwurf 12'])
    expect((await latestRow())?.outcome).toBe('done')
  })
})

describe('Der abgebrochene Vorgänger — die Rückbuchung holt der nächste Start nach', () => {
  it('abgebrochen, gebucht, nichts abgelegt ⇒ GENAU EINE Rückbuchung, am Vorgänger vermerkt', async () => {
    counts.set(NARROW, 1)
    const previousId = seedStalled({ booked: true, created: 0, used: 1, limit: 3 })

    // Die Seite nennt ihn „unterbrochen".
    expect((await read(event)).run.state).toBe('stalled')

    const res = await start(event)
    await detached
    expect(refunds).toEqual([NARROW])
    expect(parseBrandRunDetail(store.rows.get(previousId)?.detail).refunded).toBe(true)
    // Der Zähler des Vorgängers ist zurück, der neue Lauf zählt als der erste.
    expect(res.quota).toEqual({ used: 1, limit: 3, remaining: 2 })
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

  it('GEGENPROBE: der abgebrochene Vorgänger hatte schon abgelegt ⇒ keine Rückbuchung', async () => {
    seedStalled({ booked: true, created: 2, used: 1, limit: 3 })
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
    expect(logs.some(entry => entry.name === 'brand.mark_drafts_stalled_refund_failed')).toBe(true)
  })
})

/**
 * LL1 c (2026-11-20): die Zahl der abgelegten Entwürfe steht SOFORT an der
 * Lauf-Zeile, nicht erst am Ende. Vorher sah ein Nachfolger nach einem
 * Absturz zwischen Ablegen und Ende „nichts abgelegt" und buchte für einen
 * Lauf mit Ergebnis zurück.
 *
 * „Stirbt" heißt hier: der Lauf bleibt an einer Stelle stehen (Tor), und sein
 * Herzschlag wird alt gestellt — genau das sieht der nächste Start nach einem
 * Ausliefern oder Absturz. Am Ende geht das Tor auf, damit der Test keinen
 * hängenden Lauf zurücklässt.
 */
describe('Der Lauf stirbt mittendrin — was der nächste Start an der Zeile findet', () => {
  /** Den laufenden Lauf wie abgestürzt aussehen lassen: Herzschlag älter als die Frist. */
  async function letHeartbeatDie() {
    const row = await latestRow()
    const at = new Date(Date.now() - RUN_LEASE_STALL_MS - 60_000).toISOString()
    store.rows.set(row!.$id, { ...store.rows.get(row!.$id)!, heartbeatAt: at })
  }

  /** Warten, bis der Lauf an seinem Tor steht (er rechnet hinter der Antwort). */
  async function untilStanding(reached: () => boolean) {
    for (let turn = 0; turn < 200 && !reached(); turn++) await new Promise(resolve => setTimeout(resolve, 1))
    expect(reached()).toBe(true)
  }

  it('ABGELEGT, DANN ABGEBROCHEN ⇒ die Zahl steht schon an der Zeile, der nächste Start bucht NICHT zurück', async () => {
    let open = () => {}
    createGate = new Promise<void>((resolve) => {
      open = resolve
    })
    // Der erste Entwurf wird abgelegt, vor dem zweiten bleibt der Lauf stehen.
    createGateAt = 1

    await start(event)
    const firstRun = detached
    await untilStanding(() => created.length === 1 && createCalls === 1)
    // Der Lauf ist NICHT zu Ende — und trotzdem nennt die Zeile den Entwurf.
    const row = await latestRow()
    expect(row?.finishedAt).toBe('')
    expect(parseBrandRunDetail(row?.detail).created).toBe(1)

    await letHeartbeatDie()
    expect((await read(event)).run.state).toBe('stalled')

    await start(event)
    expect(refunds).toEqual([])
    expect(logs.some(entry => entry.name === 'brand.mark_drafts_stalled_refunded')).toBe(false)
    // Beide Läufe sind gebucht: der abgebrochene mit Ergebnis und der neue.
    expect(counts.get(NARROW)).toBe(2)

    open()
    await Promise.all([firstRun, detached])
  })

  it('GEGENPROBE: NICHTS ABGELEGT, dann abgebrochen ⇒ der nächste Start bucht genau einmal zurück', async () => {
    let open = () => {}
    runGate = new Promise<void>((resolve) => {
      open = resolve
    })

    await start(event)
    const firstRun = detached
    await untilStanding(() => runCalls === 1)
    expect(parseBrandRunDetail((await latestRow())?.detail)).toMatchObject({ booked: true, created: 0 })
    const stalledId = (await latestRow())!.$id

    await letHeartbeatDie()
    // Der neue Lauf soll nicht am selben Tor stehen bleiben.
    runGate = null
    await start(event)
    const secondRun = detached
    expect(refunds).toEqual([NARROW])
    expect(parseBrandRunDetail(store.rows.get(stalledId)?.detail).refunded).toBe(true)
    // Der Zähler des Vorgängers ist zurück, der neue Lauf zählt als der eine.
    expect(counts.get(NARROW)).toBe(1)

    open()
    await Promise.all([firstRun, secondRun])
    // Es bleibt bei der EINEN Rückbuchung für den abgebrochenen Lauf.
    expect(refunds).toEqual([NARROW])
  })

  it('nach JEDEM abgelegten Bild steht die neue Zahl an der Zeile', async () => {
    const seen: number[] = []
    const update = store.update.bind(store)
    store.update = async (id, data) => {
      const row = await update(id, data)
      if (data.detail !== undefined && !row.finishedAt) seen.push(parseBrandRunDetail(row.detail).created)
      return row
    }
    await start(event)
    await detached
    // 0 beim Buchen (`booked`), dann 1, 2, 3, 4 — je Bild ein Zwischenstand.
    expect(seen).toEqual([0, 1, 2, 3, 4])
    expect((await latestRow())?.outcome).toBe('done')
  })

  it('ein gestörter Zwischenstand bricht das Ablegen nicht ab (fail-soft) — das Ende schreibt die Zahl', async () => {
    const update = store.update.bind(store)
    store.update = async (id, data) => {
      // Nur die Zwischenstände scheitern: Detail mit Entwürfen, noch kein Ende.
      if (data.detail !== undefined && data.finishedAt === undefined && parseBrandRunDetail(data.detail).created > 0) {
        throw new Error('update failed')
      }
      return await update(id, data)
    }
    await start(event)
    await detached
    expect(created).toHaveLength(4)
    expect((await latestRow())?.outcome).toBe('done')
    expect(parseBrandRunDetail((await latestRow())?.detail).created).toBe(4)
    expect(refunds).toEqual([])
  })
})

describe('Der Slot-Sync am Ende des Laufs', () => {
  it('schreibt gegen die Kapitel-Zeile von JETZT, nicht gegen den Stand vom Start', async () => {
    // Die Vorprüfung sah `stepRows: []`; während des Laufs hat der Mensch im
    // Kapitel gespeichert (Revision 7). Ein Sync mit dem alten Stand
    // überschriebe das.
    await start(event)
    await detached
    expect(syncedWith).toEqual([FRESH_STEP_ROWS])
  })
})

describe('GET …/mark/drafts — der Lauf-Stand', () => {
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
    expect((await read(event)).run).toMatchObject({ state: 'done', created: 4, failure: '' })
  })

  it('ist die Lauf-Tabelle nicht lesbar, antwortet die Liste trotzdem — mit „kein Lauf"', async () => {
    store.failLatest = true
    const view = await read(event)
    expect(view.run.state).toBe('none')
    expect(view.items).toEqual([])
  })
})

/**
 * LL1 c (2026-11-20): VERLORENER HERZSCHLAG. Der Lauf lebt, konnte seine
 * Zeile aber eine Minute lang nicht schreiben. Er legt dann nichts mehr ab
 * und bucht bewusst nicht selbst zurück. Bis hierher buchte für ihn NIEMAND
 * zurück, wenn in der Lücke keiner neu gestartet hatte: sein geschriebenes
 * Ende galt als „gescheitert", und nur ein Vorgänger OHNE Ende schuldete
 * eine Rückbuchung.
 */
describe('Verlorener Herzschlag — für diesen Lauf bucht der nächste Start zurück', () => {
  function loseHeartbeat() {
    vi.stubGlobal('keepRunLeaseAlive', () => ({ stop: () => {}, lost: () => true }))
  }
  function keepHeartbeat() {
    vi.stubGlobal('keepRunLeaseAlive', lease.keepRunLeaseAlive)
  }

  it('NIEMAND STARTET IN DER LÜCKE: Ende `lease_lost` ⇒ die Seite zeigt den Lauf schon wieder, der nächste Start bucht genau einmal zurück', async () => {
    loseHeartbeat()
    await start(event)
    await detached
    const lostRow = await latestRow()
    expect(lostRow?.outcome).toBe('lease_lost')
    expect(created).toEqual([])
    // Der Lauf selbst bucht nicht zurück: der Zähler steht noch auf eins.
    expect(refunds).toEqual([])
    expect(counts.get(NARROW)).toBe(1)
    // Die Seite rechnet die geschuldete Rückbuchung schon ein: wieder 3 von 3.
    expect((await read(event)).run).toMatchObject({
      state: 'failed',
      failure: 'lease_lost',
      refunded: false,
      quota: { used: 0, limit: 3, remaining: 3 },
    })

    keepHeartbeat()
    const res = await start(event)
    await detached
    expect(refunds).toEqual([NARROW])
    expect(parseBrandRunDetail(store.rows.get(lostRow!.$id)?.detail).refunded).toBe(true)
    expect(logs.filter(entry => entry.name === 'brand.mark_drafts_stalled_refunded')).toHaveLength(1)
    // Der Zähler des Vorgängers ist zurück, der neue Lauf zählt als der erste.
    expect(res.quota).toEqual({ used: 1, limit: 3, remaining: 2 })

    // GEGENPROBE: der übernächste Start bucht für niemanden mehr zurück.
    await start(event)
    await detached
    expect(refunds).toEqual([NARROW])
  })

  it('IN DER LÜCKE HAT SCHON EIN ANDERER START ZURÜCKGEBUCHT ⇒ das Ende lässt den Vermerk stehen, niemand bucht ein zweites Mal', async () => {
    loseHeartbeat()
    let open = () => {}
    runGate = new Promise<void>((resolve) => {
      open = resolve
    })
    await start(event)
    const firstRun = detached
    for (let turn = 0; turn < 200 && runCalls < 1; turn++) await new Promise(resolve => setTimeout(resolve, 1))
    const firstId = (await latestRow())!.$id

    // Die Zeile sieht abgebrochen aus (Herzschlag älter als die Frist). Ein
    // zweiter Start übernimmt, vermerkt und bucht zurück — und wird dann von
    // der Drossel abgelehnt: seine eigene Zeile fällt wieder.
    const stale = new Date(Date.now() - RUN_LEASE_STALL_MS - 60_000).toISOString()
    store.rows.set(firstId, { ...store.rows.get(firstId)!, heartbeatAt: stale })
    counts.set(ACCOUNT, 1000)
    await expect(start(event)).rejects.toMatchObject({ status: 429 })
    expect(refunds).toEqual([NARROW])
    expect(parseBrandRunDetail(store.rows.get(firstId)?.detail).refunded).toBe(true)
    counts.delete(ACCOUNT)

    // Jetzt kommt der erste Lauf zurück und schreibt sein Ende.
    open()
    await firstRun
    const ended = store.rows.get(firstId)
    expect(ended?.outcome).toBe('lease_lost')
    // Der Vermerk des Nachfolgers steht noch — das Ende hat kein Detail geschrieben.
    expect(parseBrandRunDetail(ended?.detail)).toMatchObject({ booked: true, created: 0, refunded: true })

    keepHeartbeat()
    runGate = null
    await start(event)
    await detached
    // Weiter genau EINE Rückbuchung für den einen Lauf.
    expect(refunds).toEqual([NARROW])
  })

  it('GEGENPROBE: ein Lauf, der mit eigenem Grund scheitert, hat selbst zurückgebucht ⇒ der nächste Start bucht nicht noch einmal', async () => {
    runResult = { images: [], model: 'm' }
    await start(event)
    await detached
    expect((await latestRow())?.outcome).toBe('drafts_failed')
    expect(refunds).toEqual([NARROW])

    runResult = fourImages()
    await start(event)
    await detached
    expect(refunds).toEqual([NARROW])
  })
})
