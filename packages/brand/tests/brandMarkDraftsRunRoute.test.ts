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
