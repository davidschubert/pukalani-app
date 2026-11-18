import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import type { MemoryStore } from '../../core/tests/support/runLeaseMemoryStore'
import { memoryStore } from '../../core/tests/support/runLeaseMemoryStore'
import type {
  BrandCheckResult,
  BrandCheckRunStateResponse,
  BrandCheckStartResponse,
} from '../shared/types/brand'
import { BRAND_CHECK_CRITERIA } from '../shared/brandCheck'
import { BRAND_RUN_SCOPES, parseBrandRunDetail } from '../shared/brandRun'

/**
 * DER BRAND-CHECK, DURCHGESPIELT — gefälschte Ablage, gefälschter Abruf,
 * gefälschtes Modell, ECHTE Route.
 *
 * Sieben Aussagen hängen nicht in einer puren Funktion, sondern in der
 * REIHENFOLGE der Route — und genau die verrutscht beim Umbauen still:
 *
 *  1. Ein Zwischenspeicher-Treffer holt NICHTS und bucht NICHTS. Andersherum
 *     sperrte sich jemand mit drei Klicks auf dasselbe Ergebnis selbst aus,
 *     und ein geteilter Link kostete bei jedem Öffnen Geld.
 *  2. Der Honigtopf antwortet wie der Erfolg und rührt die Ablage nicht an.
 *  3. „Da dürfen wir nicht hin" ist ein 400, „da stand nichts Lesbares" ein
 *     422 — zwei verschiedene Sätze für den Menschen davor.
 *  4. Fällt das Modell aus, wird NICHTS gespeichert: ein halber Check läge
 *     sonst sieben Tage als „Ergebnis" im Zwischenspeicher.
 *  5. Die Zeile trägt alle vierzig Kriterien und KEINEN Seitentext.
 *  6. Die rohe IP steht nirgends — weder in der Zeile noch im Log.
 *  7. Der GET zeigt weniger als die Zeile trägt (kein ipHash, kein textHash,
 *     kein Modellname).
 */

interface FakeRow { $id: string, $createdAt: string, [key: string]: unknown }

let stored: FakeRow[]
/** `brand_profiles` — nur für die Besitz-Prüfung des optionalen `profileId`. */
let profiles: FakeRow[]
let storeBroken: boolean
/** Nur `brand_profiles` fällt aus — die Besitz-Frage eines Dokument-Checks (SEC-014). */
let profileLookupBroken: boolean
let createBroken: boolean
let fetchOutcome: 'ok' | 'blocked' | 'failed' | 'robots' | 'tdm'
let judgeBroken: boolean
/** Was das Modell als Branche liefert (seit `check-judge-2` im selben Aufruf). */
let judgeIndustry: string
let logs: { level: string, event: string, data: Record<string, unknown> }[]
let body: Record<string, unknown>
let buckets: Map<string, number>
let clientIp: string
let routerId: string
/** Der KI-Riegel des Cores (`aiSwitchedOn`, P17 BE-006) — Standard: an. */
let aiOn: boolean
/** Die Lauf-Sperre (LL1 b) — die ECHTE Logik des Core, Store im Speicher. */
let store: MemoryStore
/** Der Lauf hinter der Antwort — `postHandler` wartet darauf. */
let detached: Promise<void> = Promise.resolve()
/** Hält das Urteil auf, solange es gesetzt ist (ein Lauf, der „läuft"). */
let judgeGate: Promise<void> | null
/** Der Status der Antwort (`setResponseStatus`); 200, wenn die Route keinen setzt. */
let status: number
/** Der Herzschlag des Laufs gilt als verloren. */
let leaseLost: boolean

const CLIENT_IP = '203.0.113.7'

/**
 * DIE ATTRAPPE LIEST DIE ABFRAGE, statt einen Wert herauszufischen.
 *
 * Vorher zog ein regulärer Ausdruck den ERSTEN Zeichenketten-Wert aus den
 * Abfragen und filterte damit auf `urlKey`. Das trug, solange es genau eine
 * Abfrage gab — seit die Ergebnis-Route zusätzlich ihren Vorgänger und ihren
 * Ranking-Platz holt (BRAND-CHECK-SEITE §10), fragt derselbe Test drei
 * verschiedene Dinge, und eine Attrappe, die alle drei gleich beantwortet,
 * prüft nichts mehr. `equal`, `lessThan`, `greaterThan`, `orderDesc` und
 * `limit` reichen dafür; alles andere kommt in diesen Routen nicht vor.
 */
interface FakeQuery { method: string, attribute?: string, values?: unknown[] }

function applyQueries(rows: FakeRow[], queries: string[]): FakeRow[] {
  const parsed = queries.map(query => JSON.parse(query) as FakeQuery)
  let result = [...rows]
  let limit = rows.length

  for (const query of parsed) {
    const field = query.attribute ?? ''
    const value = query.values?.[0]
    if (query.method === 'equal') result = result.filter(row => row[field] === value)
    else if (query.method === 'lessThan') result = result.filter(row => String(row[field] ?? '') < String(value))
    else if (query.method === 'greaterThan') result = result.filter(row => Number(row[field] ?? 0) > Number(value))
    else if (query.method === 'orderDesc') result.sort((a, b) => String(b[field] ?? '').localeCompare(String(a[field] ?? '')))
    else if (query.method === 'limit') limit = Number(value ?? rows.length)
  }

  return result.slice(0, limit)
}

const tablesDB = {
  // Die Ablage FILTERT — sonst fände der Zwischenspeicher jede Zeile für jede
  // Adresse, und ein Test über zwei verschiedene Websites prüfte am Ende nur
  // noch, dass die Attrappe alles zurückgibt.
  listRows: vi.fn(async ({ queries }: { queries: string[] }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    const rows = applyQueries(stored, queries)
    return { rows, total: rows.length }
  }),
  createRow: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    if (createBroken) throw new AppwriteException('Table not found', 404)
    const row = { $id: `c${stored.length + 1}`, $createdAt: new Date().toISOString(), ...data }
    stored.push(row)
    return row
  }),
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    if (storeBroken) throw new AppwriteException('Table not found', 404)
    if (profileLookupBroken && tableId === 'brand_profiles') throw new AppwriteException('Server error', 500)
    // Die lesende Route des Laufs holt EINE Lauf-Zeile über ihre Id.
    if (tableId === 'brand_runs') {
      const run = store.rows.get(rowId)
      if (!run) throw new AppwriteException('Row not found', 404)
      return { ...run }
    }
    const table = tableId === 'brand_profiles' ? profiles : stored
    const row = table.find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
    return row
  }),
}

const SITE = {
  content: {
    title: 'Kailua Coffee — Rösterei auf Oahu',
    description: 'Wir rösten Kaffee in kleinen Mengen auf Oahu und liefern ihn frisch geröstet bis vor eure Haustür.',
    text: 'GEHEIMER SEITENTEXT der niemals gespeichert werden darf. '.repeat(40),
  },
  signals: {
    title: 'Kailua Coffee — Rösterei auf Oahu',
    titleCount: 1,
    metaDescription: 'Wir rösten Kaffee in kleinen Mengen auf Oahu und liefern ihn frisch geröstet bis vor eure Haustür.',
    metaDescriptionCount: 1,
    ogTitle: 'Kailua Coffee',
    ogDescription: 'Rösterei auf Oahu',
    ogImage: 'https://kailua.coffee/og.png',
    hasFavicon: true,
    themeColor: '#0a7',
    colorScheme: 'light dark',
    hasPrefersColorScheme: true,
    viewport: 'width=device-width',
    htmlLang: 'de',
    headings: [{ level: 1, text: 'Kailua Coffee' }, { level: 2, text: 'Sorten' }],
    canonical: 'https://kailua.coffee/',
    jsonLdTypes: ['organization'],
    ctaTexts: ['Jetzt bestellen'],
    imageAlts: ['Die Farm im Morgenlicht'],
    doubleSpaceCount: 0,
    mojibakeCount: 0,
    doubleEscapedCount: 0,
  },
  finalUrl: 'https://kailua.coffee/',
  finalHost: 'kailua.coffee',
  httpsUpgraded: false,
}

/**
 * DER ABRUF DES CHECKS ist seit BS1 R2b `fetchBrandSiteForCheck`
 * (`brandCheckFetch.ts`) — dieselbe Rückgabe wie `fetchBrandSite`, aber mit
 * der Erlaubnis-Frage davor. Zwei neue Ausgänge kommen dazu: `robots` und
 * `tdm`, beide als `BrandSiteBlockedError`.
 */
vi.mock('../server/utils/brandCheckFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/utils/brandCheckFetch')>()
  const fetchError = await import('../server/utils/brandSiteFetch')
  return {
    ...actual,
    fetchBrandSiteForCheck: vi.fn(async () => {
      if (fetchOutcome === 'blocked') throw new fetchError.BrandSiteFetchError('blocked_target', 'nope')
      if (fetchOutcome === 'failed') throw new fetchError.BrandSiteFetchError('not_html', 'nope')
      if (fetchOutcome === 'robots') throw new actual.BrandSiteBlockedError('robots', 'nope')
      if (fetchOutcome === 'tdm') throw new actual.BrandSiteBlockedError('tdm', 'nope')
      return SITE
    }),
  }
})

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
      return { judgements, industry: judgeIndustry, model: 'anthropic/claude-haiku-4.5' }
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
vi.stubGlobal('logEvent', (level: string, event: string, data: Record<string, unknown> = {}) => {
  logs.push({ level, event, data })
})
vi.stubGlobal('setHeader', () => {})
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
vi.stubGlobal('keepRunLeaseAlive', (...args: Parameters<typeof lease.keepRunLeaseAlive>) => {
  const alive = lease.keepRunLeaseAlive(...args)
  return { stop: alive.stop, lost: () => leaseLost || alive.lost() }
})
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
// Die ECHTE Besitz-Regel (Nitro-Auto-Import): die Sichtbarkeit eines
// Dokument-Checks hängt an ihr, eine Attrappe prüfte hier nur sich selbst.
vi.stubGlobal('assertBrandOwnerAccess', (await import('../server/utils/brandOwnership')).assertBrandOwnerAccess)
vi.stubGlobal('readValidatedBody', async (_event: H3Event, parse: (input: unknown) => unknown) => parse(body))
vi.stubGlobal('getRouterParam', () => routerId)
vi.stubGlobal('trustedClientIp', () => clientIp)
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

const startHandler = (await import('../server/api/brand/check.post'))
  .default as unknown as (event: H3Event) => Promise<BrandCheckStartResponse>
const runStateHandler = (await import('../server/api/brand/check/runs/[token].get'))
  .default as unknown as (event: H3Event) => Promise<BrandCheckRunStateResponse>

/**
 * DER START, BIS ZUM ENDE SEINES LAUFS (LL1 b).
 *
 * Seit der Check hinter der Antwort rechnet, antwortet die Route `202` mit
 * leerer Id — das Ergebnis entsteht danach. Die Tests dieser Datei fragen
 * aber fast alle nach dem, was der ganze Vorgang hinterlässt (Zeile, Buchung,
 * Log). Diese Hilfe ruft deshalb die ECHTE Route, wartet auf den Lauf und
 * trägt die Id des Ergebnisses nach, die am fertigen Lauf steht (`ref`) —
 * genau das, was die Seite über die Abfrage liest. Was die ANTWORT selbst
 * trägt (`202`, Kennzeichen), prüfen die Tests am Ende der Datei mit
 * `startHandler` direkt.
 */
async function postHandler(target: H3Event): Promise<BrandCheckStartResponse> {
  detached = Promise.resolve()
  const response = await startHandler(target)
  await detached
  if (response.id || !response.token) return response
  return { ...response, id: parseBrandRunDetail(lastRun()?.detail).ref }
}

/** Die jüngste Lauf-Zeile (Einfüge-Reihenfolge der Map). */
function lastRun() {
  return [...store.rows.values()].at(-1)
}

/** Der Ausgang des jüngsten Laufs — `done` oder der kurze Grund. */
function lastOutcome(): string {
  return lastRun()?.outcome ?? ''
}
const getHandler = (await import('../server/api/brand/check/[id].get'))
  .default as unknown as (event: H3Event) => Promise<BrandCheckResult>
const { runBrandCheck } = await import('../server/utils/brandCheckRun')
const { judgeBrandCheck } = await import('../server/utils/brandCheckJudge')
const { fetchBrandSiteForCheck } = await import('../server/utils/brandCheckFetch')

const event = { context: {} } as unknown as H3Event

function lastWrite(): Record<string, unknown> {
  const call = tablesDB.createRow.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> } | undefined
  return call?.data ?? {}
}

beforeEach(() => {
  stored = []
  profiles = []
  storeBroken = false
  profileLookupBroken = false
  createBroken = false
  fetchOutcome = 'ok'
  judgeBroken = false
  judgeIndustry = 'food'
  logs = []
  buckets = new Map()
  clientIp = CLIENT_IP
  routerId = ''
  aiOn = true
  store = memoryStore()
  detached = Promise.resolve()
  judgeGate = null
  status = 200
  leaseLost = false
  body = { url: 'kailua.coffee', locale: 'de' }
  vi.mocked(judgeBrandCheck).mockClear()
  vi.mocked(fetchBrandSiteForCheck).mockClear()
  // Die Session wird je Test gesetzt — der Normalfall dieser Route ist der Gast.
  ;(event as unknown as { context: Record<string, unknown> }).context = {}
  tablesDB.listRows.mockClear()
  tablesDB.createRow.mockClear()
  tablesDB.getRow.mockClear()
})

describe('POST /api/brand/check · der Zwischenspeicher', () => {
  it('gleiche Adresse innerhalb von sieben Tagen ⇒ die alte Zeile, ohne Abruf und ohne Buchung', async () => {
    stored = [{ $id: 'c9', $createdAt: new Date(Date.now() - 60_000).toISOString(), urlKey: 'kailua.coffee', score: 71 }]

    const result = await postHandler(event)

    expect(result).toEqual({ ok: true, id: 'c9', cached: true })
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    // Nichts gebucht: was nichts kostet, kostet kein Kontingent.
    expect(buckets.size).toBe(0)
    expect(logs.find(entry => entry.event === 'brand.check_completed')?.data.cached).toBe(true)
  })

  it('eine acht Tage alte Zeile zählt nicht mehr — es wird neu geprüft', async () => {
    stored = [{
      $id: 'c9',
      $createdAt: new Date(Date.now() - 8 * 24 * 3_600_000).toISOString(),
      urlKey: 'kailua.coffee',
      score: 71,
    }]

    const result = await postHandler(event)

    expect(result.cached).toBe(false)
    expect(tablesDB.createRow).toHaveBeenCalledTimes(1)
  })

  it('fragt mit dem normalisierten Schlüssel, absteigend und mit Limit', async () => {
    body = { url: 'https://Kailua.Coffee/?utm_source=news', locale: 'en' }

    await postHandler(event)

    const queries = (tablesDB.listRows.mock.calls[0]?.[0] as { queries: string[] }).queries
    expect(queries).toHaveLength(3)
    expect(queries.join(' ')).toContain('kailua.coffee')
    expect(queries.join(' ')).not.toContain('utm_source')
    expect(queries.join(' ')).toContain('limit')
  })
})

/**
 * DER ABSCHALTER (P17, BE-006): der öffentliche Check rief das Modell bis
 * hierher OHNE den Schalter zu fragen. Jetzt fragt er VOR der Buchung — und
 * ein Zwischenspeicher-Treffer bleibt erreichbar, denn er kostet nichts.
 */
describe('POST /api/brand/check · KI abgeschaltet', () => {
  it('⇒ 503 `check_paused`, KEIN Abruf, KEIN Modell, KEINE Buchung, keine Zeile', async () => {
    aiOn = false

    await expect(postHandler(event)).rejects.toMatchObject({
      status: 503,
      data: { code: 'check_paused' },
    })
    expect(judgeBrandCheck).not.toHaveBeenCalled()
    expect(fetchBrandSiteForCheck).not.toHaveBeenCalled()
    expect(buckets.size).toBe(0)
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    const paused = logs.find(entry => entry.event === 'brand.check_paused')
    expect(paused?.data).toEqual({ host: 'kailua.coffee' })
  })

  it('auch direkt über `runBrandCheck` (der Weg des Marktvergleichs)', async () => {
    aiOn = false
    await expect(runBrandCheck(event, { url: 'https://kailua.coffee/', locale: 'de', userId: 'u1', quota: 'account' }))
      .rejects.toMatchObject({ status: 503, data: { code: 'check_paused' } })
    expect(buckets.size).toBe(0)
    expect(judgeBrandCheck).not.toHaveBeenCalled()
  })

  it('ein Zwischenspeicher-Treffer wird trotzdem ausgeliefert', async () => {
    aiOn = false
    stored = [{ $id: 'c9', $createdAt: new Date(Date.now() - 60_000).toISOString(), urlKey: 'kailua.coffee', score: 71 }]

    expect(await postHandler(event)).toEqual({ ok: true, id: 'c9', cached: true })
    expect(buckets.size).toBe(0)
  })

  it('GEGENPROBE: an ⇒ es wird gemessen und gespeichert', async () => {
    await postHandler(event)
    expect(judgeBrandCheck).toHaveBeenCalledTimes(1)
    expect(tablesDB.createRow).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/brand/check · Abwehr', () => {
  it('HONIGTOPF: antwortet wie der Erfolg, rührt aber nichts an', async () => {
    body = { ...body, hp: 'ich bin ein Skript' }

    const result = await postHandler(event)

    expect(result).toEqual({ ok: true, id: '', cached: true })
    expect(tablesDB.listRows).not.toHaveBeenCalled()
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect(logs.map(entry => entry.event)).toContain('brand.check_honeypot')
  })

  // Seit LL1 b steht, was NACH der Buchung scheitert, als AUSGANG am Lauf —
  // mit demselben Wort, das früher der Fehler-Code der Anfrage war. Die
  // Statuszahl dazu trägt weiter die Mechanik (`runBrandCheck`, s. u.).
  it('verbotenes Ziel ⇒ der Lauf endet mit `blocked_target`', async () => {
    fetchOutcome = 'blocked'

    await postHandler(event)

    expect(lastOutcome()).toBe('blocked_target')
    expect(tablesDB.createRow).not.toHaveBeenCalled()
  })

  it('robots.txt sagt nein ⇒ `site_blocked`, keine Zeile, ein Ereignis mit Grund (BS1 R2b)', async () => {
    fetchOutcome = 'robots'

    await postHandler(event)

    expect(lastOutcome()).toBe('site_blocked')
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    const blocked = logs.find(entry => entry.event === 'brand.check_blocked')
    expect(blocked?.data.reason).toBe('robots')
    // Der HOST darf ins Log, der Pfad nie (Log-Regel §6).
    expect(blocked?.data.host).toBe('kailua.coffee')
  })

  it('Nutzungsvorbehalt ⇒ `site_blocked` mit dem anderen Grund im Log', async () => {
    fetchOutcome = 'tdm'

    await postHandler(event)

    expect(lastOutcome()).toBe('site_blocked')
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect(logs.find(entry => entry.event === 'brand.check_blocked')?.data.reason).toBe('tdm')
  })

  it('GEGENPROBE: eine Website ohne Verbot wird ganz normal gemessen und gespeichert', async () => {
    fetchOutcome = 'ok'

    await postHandler(event)

    expect(tablesDB.createRow).toHaveBeenCalled()
    expect(logs.map(entry => entry.event)).not.toContain('brand.check_blocked')
  })

  it('unlesbare Seite ⇒ der Lauf endet mit `fetch_failed`', async () => {
    fetchOutcome = 'failed'

    await postHandler(event)

    expect(lastOutcome()).toBe('fetch_failed')
  })

  it('die Mechanik selbst wirft dafür weiter 400 / 409 / 422 (der Weg des Marktvergleichs)', async () => {
    const input = { url: 'https://kailua.coffee/', locale: 'de' as const, userId: '' }
    fetchOutcome = 'blocked'
    await expect(runBrandCheck(event, input)).rejects.toMatchObject({ status: 400, data: { code: 'blocked_target' } })
    fetchOutcome = 'robots'
    // 409 und nicht 403: nicht WIR verweigern, die fremde Website tut es.
    await expect(runBrandCheck(event, input)).rejects.toMatchObject({ status: 409, data: { code: 'site_blocked' } })
    fetchOutcome = 'failed'
    // 422 und kein 502 — nicht WIR sind ausgefallen.
    await expect(runBrandCheck(event, input)).rejects.toMatchObject({ status: 422, data: { code: 'fetch_failed' } })
  })

  it('Anbieter kaputt ⇒ der Lauf endet mit `check_unavailable` UND keine Zeile', async () => {
    judgeBroken = true

    await postHandler(event)

    expect(lastOutcome()).toBe('check_unavailable')
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect(stored).toHaveLength(0)
  })

  it('kaputte Ablage beim LESEN ⇒ 503, bevor irgendetwas Geld kostet', async () => {
    storeBroken = true

    await expect(postHandler(event)).rejects.toMatchObject({
      status: 503,
      data: { code: 'check_unavailable' },
    })
    expect(buckets.size).toBe(0)
  })

  it('kaputte Ablage beim SCHREIBEN ⇒ `check_unavailable` (ein Ergebnis, das niemand wiederfindet, ist keins)', async () => {
    createBroken = true

    await postHandler(event)

    expect(lastOutcome()).toBe('check_unavailable')
  })
})

describe('POST /api/brand/check · die zwei Deckel', () => {
  it('drei Checks je Anschluss und Tag — der vierte ist ein 429', async () => {
    for (let run = 1; run <= 3; run++) {
      body = { url: `kailua-${run}.coffee`, locale: 'de' }
      await expect(postHandler(event)).resolves.toMatchObject({ cached: false })
    }

    body = { url: 'kailua-4.coffee', locale: 'de' }
    await expect(postHandler(event)).rejects.toMatchObject({
      status: 429,
      data: { code: 'brand_check_ip_limit' },
    })
  })

  it('bucht auf einen HASH, nie auf die rohe IP', async () => {
    await postHandler(event)

    const ipKeys = [...buckets.keys()].filter(key => key.includes('brand-check-ip-day'))
    expect(ipKeys).toHaveLength(1)
    expect(ipKeys[0]).not.toContain(CLIENT_IP)
    expect(ipKeys[0]).toMatch(/brand-check-ip-day:[0-9a-f]{64}$/)
  })

  it('zwei verschiedene Anschlüsse teilen sich den Deckel NICHT', async () => {
    await postHandler(event)
    clientIp = '198.51.100.4'
    body = { url: 'kailua-2.coffee', locale: 'de' }
    await postHandler(event)

    expect([...buckets.keys()].filter(key => key.includes('brand-check-ip-day'))).toHaveLength(2)
  })

  it('bucht zusätzlich auf den EIGENEN Instanz-Eimer', async () => {
    await postHandler(event)
    expect(buckets.get('rl:brand-check-instance-day')).toBe(1)
    // Nicht der Eimer des Wizards — sonst nähme eine Werbe-Welle den zahlenden
    // Kunden ihre Entwürfe weg.
    expect(buckets.has('rl:brand-ai-instance-day')).toBe(false)
  })
})

describe('POST /api/brand/check · was gespeichert wird', () => {
  it('schreibt alle Felder, alle vierzig Kriterien und einen Score', async () => {
    const result = await postHandler(event)

    expect(result).toMatchObject({ ok: true, cached: false })
    const written = lastWrite()
    expect(written).toMatchObject({
      urlKey: 'kailua.coffee',
      url: 'https://kailua.coffee/',
      host: 'kailua.coffee',
      locale: 'de',
      scoreVersion: 'score-1',
      promptVersion: 'check-judge-3',
      model: 'anthropic/claude-haiku-4.5',
      band: 'exceptional',
    })
    expect(written.score).toBe(100)

    const criteria = JSON.parse(String(written.criteria)) as { id: string, kind: string }[]
    expect(criteria).toHaveLength(BRAND_CHECK_CRITERIA.length)
    expect(criteria.map(entry => entry.id)).toEqual(BRAND_CHECK_CRITERIA.map(entry => entry.id))
    expect(JSON.parse(String(written.categories))).toHaveLength(8)
    // Alles voll bewertet ⇒ nichts zu verbessern, also kein Befund.
    expect(JSON.parse(String(written.findings))).toEqual([])
  })

  it('speichert KEINEN Seitentext — nur seinen Hash', async () => {
    await postHandler(event)

    const written = lastWrite()
    expect(JSON.stringify(written)).not.toContain('GEHEIMER SEITENTEXT')
    expect(String(written.textHash)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('speichert KEINE rohe IP — nur den Tages-Stempel', async () => {
    await postHandler(event)

    const written = lastWrite()
    expect(JSON.stringify(written)).not.toContain(CLIENT_IP)
    expect(String(written.ipHash)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('protokolliert Host, Score und Dauer — nie Seitentext und nie die IP', async () => {
    await postHandler(event)

    const completed = logs.find(entry => entry.event === 'brand.check_completed')
    expect(completed?.data).toMatchObject({ host: 'kailua.coffee', score: 100, cached: false })
    expect(JSON.stringify(logs)).not.toContain('GEHEIMER SEITENTEXT')
    expect(JSON.stringify(logs)).not.toContain(CLIENT_IP)
  })

  it('nicht beurteilte Kriterien werden `null`, nicht 0', async () => {
    const judge = await import('../server/utils/brandCheckJudge')
    vi.mocked(judge.judgeBrandCheck).mockResolvedValueOnce({ judgements: {}, model: 'stub' })

    await postHandler(event)

    const written = lastWrite()
    const criteria = JSON.parse(String(written.criteria)) as { id: string, kind: string, score: number | null }[]
    expect(criteria.filter(entry => entry.kind === 'judged').every(entry => entry.score === null)).toBe(true)
    // Vier von acht Kategorien haben nur beurteilte Kriterien und sind damit
    // gesperrt — der Gesamtwert rechnet über die übrigen, nicht über Nullen.
    const categories = JSON.parse(String(written.categories)) as { locked: boolean }[]
    expect(categories.filter(entry => entry.locked)).toHaveLength(2)
    expect(written.score).toBe(100)
  })
})

describe('GET /api/brand/check/[id]', () => {
  it('unbekannte Id ⇒ 404 `check_not_found`', async () => {
    routerId = 'gibtesnicht'
    await expect(getHandler(event)).rejects.toMatchObject({
      status: 404,
      data: { code: 'check_not_found' },
    })
  })

  it('eine Id, die keine sein kann, wird gar nicht erst abgefragt', async () => {
    routerId = '../../etc/passwd'
    await expect(getHandler(event)).rejects.toMatchObject({ status: 404 })
    expect(tablesDB.getRow).not.toHaveBeenCalled()
  })

  it('liefert das gespeicherte Ergebnis — und WENIGER, als die Zeile trägt', async () => {
    const started = await postHandler(event)
    routerId = started.id

    const result = await getHandler(event)

    expect(result).toMatchObject({
      id: started.id,
      url: 'https://kailua.coffee/',
      host: 'kailua.coffee',
      locale: 'de',
      score: 100,
      band: 'exceptional',
      scoreVersion: 'score-1',
    })
    expect(result.criteria).toHaveLength(BRAND_CHECK_CRITERIA.length)
    expect(result.categories).toHaveLength(8)
    // Weder Personenbezug noch Betriebsinterna verlassen den Server.
    expect(Object.keys(result)).not.toContain('ipHash')
    expect(Object.keys(result)).not.toContain('textHash')
    expect(Object.keys(result)).not.toContain('model')
    expect(JSON.stringify(result)).not.toContain('GEHEIMER SEITENTEXT')
  })

  it('eine kaputte JSON-Spalte ist ein 404, kein 500', async () => {
    stored = [{ $id: 'c1', $createdAt: new Date().toISOString(), categories: '{{', criteria: '[]', findings: '[]' }]
    routerId = 'c1'

    await expect(getHandler(event)).rejects.toMatchObject({
      status: 404,
      data: { code: 'check_not_found' },
    })
  })
})

/**
 * DAS RANKING-HÄKCHEN, DIE BRANCHE UND „NEU ERMITTELN"
 * (docs/archiv/BRAND-CHECK-SEITE.md §3/§5/§8, Davids Entscheidungen 1, 2 und 4).
 *
 * Vier Aussagen, die in der REIHENFOLGE der Route stecken:
 *  1. Ein frischer Check trägt das Häkchen des Prüfers, die Branche aus dem
 *     einen Modell-Aufruf, `hidden: false` und seine Quelle.
 *  2. `force` wirkt NUR mit Konto — und zahlt dann vom Konto-Deckel STATT vom
 *     Anschluss-Deckel.
 *  3. Ein eingeloggter Mensch OHNE `force` zählt weiter gegen den Anschluss:
 *     die Anmeldung ist kein Gutschein auf das Dreifache.
 *  4. Eine FREMDE Brand-Id ist ein 404 — und kostet kein Kontingent.
 */
function login(userId = 'u-1') {
  ;(event as unknown as { context: Record<string, unknown> }).context = { user: { $id: userId } }
}

describe('POST /api/brand/check · Ranking-Häkchen, Branche und Quelle', () => {
  it('schreibt Häkchen, Branche, `hidden: false` und die Quelle', async () => {
    body = { ...body, rankingOptIn: true }
    judgeIndustry = 'agency'

    await postHandler(event)

    expect(lastWrite()).toMatchObject({
      rankingOptIn: true,
      industry: 'agency',
      hidden: false,
      source: 'website',
      userId: '',
      profileId: '',
    })
  })

  it('ohne Häkchen bleibt der Check privat — Default AUS', async () => {
    await postHandler(event)
    expect(lastWrite().rankingOptIn).toBe(false)
  })

  it('schreibt die Branche des Urteils, ohne eine eigene zu erfinden', async () => {
    // Die PRÜFUNG gegen den Katalog steht in `parseBrandCheckJudgement` (dort
    // getestet); die Route reicht das Ergebnis nur durch — sie darf keine
    // zweite Meinung haben, sonst gäbe es zwei Stellen, an denen eine Branche
    // entsteht.
    judgeIndustry = 'unknown'
    await postHandler(event)
    expect(lastWrite().industry).toBe('unknown')
  })

  it('eingeloggt: die userId steht in der Zeile', async () => {
    login()
    await postHandler(event)
    expect(lastWrite().userId).toBe('u-1')
  })
})

describe('POST /api/brand/check · „neu ermitteln"', () => {
  const cachedRow = () => ({
    $id: 'c9',
    $createdAt: new Date(Date.now() - 60_000).toISOString(),
    urlKey: 'kailua.coffee',
    score: 71,
  })

  it('Gast mit `force` bekommt trotzdem den Zwischenspeicher', async () => {
    stored = [cachedRow()]
    body = { ...body, force: true }

    await expect(postHandler(event)).resolves.toEqual({ ok: true, id: 'c9', cached: true })
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect(buckets.size).toBe(0)
  })

  it('eingeloggt mit `force` umgeht den Zwischenspeicher und prüft neu', async () => {
    stored = [cachedRow()]
    login()
    body = { ...body, force: true }

    const result = await postHandler(event)

    expect(result.cached).toBe(false)
    expect(tablesDB.createRow).toHaveBeenCalled()
  })

  it('`force` zahlt vom KONTO-Eimer, nicht vom Anschluss-Eimer', async () => {
    login()
    body = { ...body, force: true }
    await postHandler(event)

    expect([...buckets.keys()]).toEqual(
      expect.arrayContaining(['rl:brand-check-account-day:u-1', 'rl:brand-check-instance-day']),
    )
    expect([...buckets.keys()].some(key => key.startsWith('rl:brand-check-ip-day:'))).toBe(false)
  })

  it('eingeloggt OHNE `force` zahlt weiter vom Anschluss-Eimer', async () => {
    login()
    await postHandler(event)

    expect([...buckets.keys()].some(key => key.startsWith('rl:brand-check-ip-day:'))).toBe(true)
    expect(buckets.has('rl:brand-check-account-day:u-1')).toBe(false)
  })

  it('der elfte erzwungene Check des Tages wird abgewiesen', async () => {
    login()
    body = { ...body, force: true }
    for (let i = 0; i < 10; i++) await postHandler(event)

    await expect(postHandler(event)).rejects.toMatchObject({
      status: 429,
      data: { code: 'brand_check_account_limit' },
    })
  })
})

describe('POST /api/brand/check · die eigene Brand', () => {
  it('übernimmt eine EIGENE Profil-Id', async () => {
    login()
    profiles = [{ $id: 'p1', $createdAt: '', ownerType: 'user', ownerId: 'u-1' }]
    body = { ...body, profileId: 'p1' }

    await postHandler(event)

    expect(lastWrite().profileId).toBe('p1')
  })

  it('eine FREMDE Profil-Id ist ein 404 — und kostet kein Kontingent', async () => {
    login()
    profiles = [{ $id: 'p1', $createdAt: '', ownerType: 'user', ownerId: 'jemand-anderes' }]
    body = { ...body, profileId: 'p1' }

    await expect(postHandler(event)).rejects.toMatchObject({ status: 404 })
    expect(buckets.size).toBe(0)
    expect(tablesDB.createRow).not.toHaveBeenCalled()
  })

  it('ein GAST kann keine Brand zuordnen — die Angabe fällt still weg', async () => {
    profiles = [{ $id: 'p1', $createdAt: '', ownerType: 'user', ownerId: 'u-1' }]
    body = { ...body, profileId: 'p1' }

    await postHandler(event)

    expect(lastWrite().profileId).toBe('')
  })
})

/**
 * VORGÄNGER UND RANKING-PLATZ (BRAND-CHECK-SEITE §10) — zwei Nebenangaben, die
 * die Ergebnisseite v2 zu „↑ +7 seit dem 12. August" und „Platz 2 von 3"
 * macht. Beide sind ZUGABEN: sie dürfen fehlen, aber sie dürfen nie etwas
 * Falsches behaupten — ein Delta gegen den Check SELBST oder gegen einen
 * ausgeblendeten Vorgänger wäre genau das.
 */
describe('GET /api/brand/check/<id> · Vorgänger und Ranking-Platz', () => {
  function checkRow(id: string, overrides: Record<string, unknown> = {}): FakeRow {
    return {
      $id: id,
      $createdAt: '2026-09-01T00:00:00.000Z',
      urlKey: 'kailua.coffee',
      url: 'https://kailua.coffee/',
      host: 'kailua.coffee',
      locale: 'de',
      score: 70,
      band: 'strong',
      scoreVersion: 'score-1',
      hidden: false,
      rankingOptIn: true,
      categories: '[]',
      criteria: '[]',
      findings: '[]',
      ...overrides,
    }
  }

  it('nennt den unmittelbaren Vorgänger derselben Adresse', async () => {
    stored = [
      checkRow('alt', { $createdAt: '2026-08-12T00:00:00.000Z', score: 63, band: 'average' }),
      checkRow('neu', { $createdAt: '2026-09-01T00:00:00.000Z', score: 70 }),
    ]
    routerId = 'neu'

    const result = await getHandler(event)
    expect(result.previous).toEqual({
      id: 'alt',
      score: 63,
      band: 'average',
      createdAt: '2026-08-12T00:00:00.000Z',
    })
  })

  it('der ERSTE Check einer Adresse hat keinen Vorgänger — und ist nie sein eigener', async () => {
    stored = [checkRow('nur-einer')]
    routerId = 'nur-einer'

    const result = await getHandler(event)
    expect(result.previous).toBeNull()
  })

  it('ein AUSGEBLENDETER Vorgänger ergibt null — es wird nicht weiter zurückgegriffen', async () => {
    stored = [
      checkRow('ganz-alt', { $createdAt: '2026-07-01T00:00:00.000Z', score: 40 }),
      checkRow('alt', { $createdAt: '2026-08-12T00:00:00.000Z', score: 63, hidden: true }),
      checkRow('neu', { $createdAt: '2026-09-01T00:00:00.000Z' }),
    ]
    routerId = 'neu'

    const result = await getHandler(event)
    expect(result.previous).toBeNull()
  })

  it('nennt den Platz nach derselben Rangfolge wie das Ranking', async () => {
    stored = [
      checkRow('a', { urlKey: 'a.example', score: 90 }),
      checkRow('b', { urlKey: 'b.example', score: 70 }),
      checkRow('c', { urlKey: 'c.example', score: 50 }),
    ]
    routerId = 'b'

    const result = await getHandler(event)
    expect(result.rank).toEqual({ position: 2, total: 3 })
  })

  it('ohne Häkchen gibt es keinen Platz — und keine zweite Abfrage', async () => {
    stored = [checkRow('a', { rankingOptIn: false })]
    routerId = 'a'

    const result = await getHandler(event)
    expect(result.rank).toBeNull()
    // Genau eine Abfrage: die des Vorgängers. Der Ranking-Lauf liest ein
    // Fenster von 500 Zeilen und wird deshalb gar nicht erst begonnen.
    expect(tablesDB.listRows).toHaveBeenCalledTimes(1)
  })

  it('ein älterer Check derselben Adresse hat keinen eigenen Platz (je Adresse der jüngste)', async () => {
    stored = [
      checkRow('alt', { $createdAt: '2026-08-12T00:00:00.000Z', score: 63 }),
      checkRow('neu', { $createdAt: '2026-09-01T00:00:00.000Z', score: 70 }),
    ]
    routerId = 'alt'

    const result = await getHandler(event)
    expect(result.rank).toBeNull()
  })

  it('eine kaputte Ablage kostet die Nebenangaben, nicht das Ergebnis', async () => {
    stored = [checkRow('a')]
    routerId = 'a'
    tablesDB.listRows.mockRejectedValueOnce(new AppwriteException('boom', 500))
    tablesDB.listRows.mockRejectedValueOnce(new AppwriteException('boom', 500))

    const result = await getHandler(event)
    expect(result.id).toBe('a')
    expect(result.previous).toBeNull()
    expect(result.rank).toBeNull()
  })
})

/**
 * DIE MECHANIK OHNE ROUTE (BC1) — `runBrandCheck` direkt gerufen, mit
 * denselben Attrappen.
 *
 * Sie hat seit BC1 einen ZWEITEN Aufrufer (der Lauf des Marktvergleichs über
 * `packages/market/server/contracts/brandContract.ts`), und der schickt weder
 * einen Rumpf noch eine Session mit einem Häkchen. Vier Aussagen hängen
 * deshalb an der Funktion und nicht mehr am Handler:
 *
 *  1. Ein Zwischenspeicher-Treffer bucht auch hier NICHTS — was nichts kostet,
 *     kostet kein Kontingent, egal wer ruft.
 *  2. `quota: 'account'` bucht den KONTO-Eimer, OHNE den Zwischenspeicher zu
 *     umgehen. Das ist der ganze Grund, warum es den dritten Eingang gibt.
 *  3. Ohne Konto fällt `'account'` auf den Anschluss-Eimer zurück.
 *  4. Ein Anbieter-Fehler speichert NICHTS — sonst läge ein halber Check
 *     sieben Tage als „Ergebnis" im Zwischenspeicher.
 */
describe('runBrandCheck · die Mechanik ohne Route', () => {
  it('Zwischenspeicher-Treffer: keine Zeile, keine Buchung', async () => {
    stored = [{ $id: 'c9', $createdAt: new Date(Date.now() - 60_000).toISOString(), urlKey: 'kailua.coffee', score: 71 }]

    const result = await runBrandCheck(event, {
      url: 'https://kailua.coffee/',
      locale: 'de',
      userId: 'u-1',
      quota: 'account',
    })

    expect(result).toEqual({ id: 'c9', cached: true })
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect(buckets.size).toBe(0)
  })

  it('`quota: account` bucht den Konto-Eimer, ohne den Zwischenspeicher zu umgehen', async () => {
    const result = await runBrandCheck(event, {
      url: 'https://kailua.coffee/',
      locale: 'de',
      userId: 'u-7',
      quota: 'account',
    })

    expect(result.cached).toBe(false)
    expect(buckets.has('rl:brand-check-account-day:u-7')).toBe(true)
    expect([...buckets.keys()].some(key => key.startsWith('rl:brand-check-ip-day:'))).toBe(false)
    expect(buckets.get('rl:brand-check-instance-day')).toBe(1)
  })

  it('`quota: account` OHNE Konto zahlt vom Anschluss — nicht aus einem Gäste-Eimer', async () => {
    await runBrandCheck(event, {
      url: 'https://kailua.coffee/',
      locale: 'de',
      userId: '',
      quota: 'account',
    })

    expect([...buckets.keys()].some(key => key.startsWith('rl:brand-check-ip-day:'))).toBe(true)
    expect([...buckets.keys()].some(key => key.startsWith('rl:brand-check-account-day'))).toBe(false)
  })

  it('der elfte Aufruf eines Kontos ist ein 429 — mit Sekunden im Fehler statt im Kopf', async () => {
    for (let i = 1; i <= 10; i++) {
      await runBrandCheck(event, { url: `https://k-${i}.coffee/`, locale: 'de', userId: 'u-2', quota: 'account' })
    }

    // Die Sekunden reisen als `data.retryAfterSec` mit: den `Retry-After`-Kopf
    // setzt die Route, weil ein Dienst nicht in eine fremde Antwort schreibt.
    await expect(runBrandCheck(event, {
      url: 'https://k-11.coffee/',
      locale: 'de',
      userId: 'u-2',
      quota: 'account',
    })).rejects.toMatchObject({
      status: 429,
      data: { code: 'brand_check_account_limit', retryAfterSec: expect.any(Number) },
    })
  })

  it('Anbieter kaputt ⇒ 503 und KEINE Zeile', async () => {
    judgeBroken = true

    await expect(runBrandCheck(event, {
      url: 'https://kailua.coffee/',
      locale: 'de',
      userId: 'u-1',
      quota: 'account',
    })).rejects.toMatchObject({ status: 503, data: { code: 'check_unavailable' } })
    expect(tablesDB.createRow).not.toHaveBeenCalled()
    expect(stored).toHaveLength(0)
  })

  it('ein angestossener Check gehört niemandem: kein Häkchen, keine Brand', async () => {
    // Der Marktvergleich prüft FREMDE Auftritte. Ein `rankingOptIn: true` von
    // hier machte uns zum Anmelder einer Marke, die uns nicht gehört (§8.1).
    await runBrandCheck(event, {
      url: 'https://kailua.coffee/',
      locale: 'en',
      userId: 'u-3',
      quota: 'account',
    })

    expect(lastWrite()).toMatchObject({
      rankingOptIn: false,
      profileId: '',
      hidden: false,
      source: 'website',
      locale: 'en',
      userId: 'u-3',
    })
  })
})

describe('GET /api/brand/check/<id> · ausgeblendet', () => {
  it('ein ausgeblendeter Check ist ein 404, nicht ein leeres Ergebnis', async () => {
    stored = [{
      $id: 'c1',
      $createdAt: new Date().toISOString(),
      hidden: true,
      categories: '[]',
      criteria: '[]',
      findings: '[]',
    }]
    routerId = 'c1'

    await expect(getHandler(event)).rejects.toMatchObject({
      status: 404,
      data: { code: 'check_not_found' },
    })
  })
})

/**
 * EIN DOKUMENT-CHECK GEHÖRT SEINER BESITZERIN (SEC-014).
 *
 * Seit dem Fundament-Check schreibt dieselbe Tabelle Urteile über eine NICHT
 * veröffentlichte Brand Foundation — mit wörtlichen Belegstellen daraus. Davids
 * Entscheidung: das Ergebnis einer nicht veröffentlichten Marke sieht nur ihre
 * Besitzerin. Mit Ranking-Häkchen hat sie der Veröffentlichung zugestimmt;
 * dann bleibt der Link aus dem Ranking lesbar.
 *
 * Alle Absagen sind DASSELBE 404 wie „gibt es nicht" — ohne Session, mit
 * fremder Session und wenn die Besitz-Frage selbst scheitert. Ein anderer
 * Status wäre die Auskunft, dass es die Id gibt.
 */
describe('GET /api/brand/check/<id> · Dokument-Check', () => {
  function documentRow(overrides: Partial<FakeRow> = {}): FakeRow {
    return {
      $id: 'd1',
      $createdAt: new Date().toISOString(),
      urlKey: 'doc:p1',
      url: '',
      host: 'Kailua Brand',
      locale: 'de',
      score: 64,
      band: 'strong',
      scoreVersion: 'doc-score-1',
      source: 'document',
      profileId: 'p1',
      rankingOptIn: false,
      hidden: false,
      categories: '[]',
      criteria: '[]',
      findings: '[]',
      ...overrides,
    }
  }

  const NOT_FOUND = { status: 404, statusText: 'Check not found', data: { code: 'check_not_found' } }

  beforeEach(() => {
    profiles = [{ $id: 'p1', $createdAt: new Date().toISOString(), ownerType: 'user', ownerId: 'u-owner' }]
    stored = [documentRow()]
    routerId = 'd1'
  })

  it('ohne Session ⇒ 404 `check_not_found`, identisch mit einer unbekannten Id', async () => {
    const hidden = await getHandler(event).catch((error: unknown) => error) as Record<string, unknown>
    routerId = 'gibtesnicht'
    const unknown = await getHandler(event).catch((error: unknown) => error) as Record<string, unknown>

    expect(hidden).toMatchObject(NOT_FOUND)
    expect({ status: hidden.status, statusText: hidden.statusText, data: hidden.data })
      .toEqual({ status: unknown.status, statusText: unknown.statusText, data: unknown.data })
  })

  it('fremde Session ⇒ dasselbe 404', async () => {
    login('u-stranger')
    await expect(getHandler(event)).rejects.toMatchObject(NOT_FOUND)
  })

  it('die Besitzerin ⇒ 200 mit dem Ergebnis', async () => {
    login('u-owner')
    const result = await getHandler(event)
    expect(result).toMatchObject({ id: 'd1', source: 'document', host: 'Kailua Brand', score: 64 })
  })

  it('mit Ranking-Häkchen ⇒ 200 auch ohne Session (der Link aus dem Ranking)', async () => {
    stored = [documentRow({ rankingOptIn: true })]
    const result = await getHandler(event)
    expect(result).toMatchObject({ id: 'd1', source: 'document' })
  })

  it('die Besitz-Frage scheitert ⇒ 404, kein 5xx (fail-closed)', async () => {
    login('u-owner')
    profileLookupBroken = true
    await expect(getHandler(event)).rejects.toMatchObject(NOT_FOUND)
  })

  it('das Profil gibt es nicht mehr ⇒ 404', async () => {
    login('u-owner')
    profiles = []
    await expect(getHandler(event)).rejects.toMatchObject(NOT_FOUND)
  })

  it('GEGENPROBE: ein Website-Check bleibt ohne Session lesbar', async () => {
    stored = [documentRow({ $id: 'w1', source: 'website', urlKey: 'kailua.coffee', url: 'https://kailua.coffee/', host: 'kailua.coffee', profileId: 'p1' })]
    routerId = 'w1'
    const result = await getHandler(event)
    expect(result).toMatchObject({ id: 'w1', source: 'website' })
  })

  it('GEGENPROBE: eine Zeile ohne `source` (Bestand) liest sich als Website-Check', async () => {
    stored = [documentRow({ $id: 'w2', source: undefined, urlKey: 'kailua.coffee' })]
    routerId = 'w2'
    const result = await getHandler(event)
    expect(result).toMatchObject({ id: 'w2', source: 'website' })
  })
})

/**
 * DER CHECK RECHNET HINTER DER ANTWORT (LL1 b, 2026-11-18).
 *
 * Bis hierher prüfte die Datei, was der ganze Vorgang hinterlässt. Dieser
 * Block prüft, was die ANTWORT trägt und wem ein Lauf gehört — ohne Konto:
 *
 *  1. Der Start antwortet `202` mit einem Kennzeichen, BEVOR gelesen und
 *     geurteilt ist; das Ergebnis steht am fertigen Lauf.
 *  2. Derselbe Besucher, dieselbe Adresse, zweiter Start ⇒ derselbe Lauf,
 *     dasselbe Kennzeichen, KEINE zweite Buchung, KEIN zweites Urteil.
 *  3. Ein FREMDER (anderer Anschluss) trifft die Sperre nie: er bekommt
 *     seinen eigenen Lauf und erfährt vom anderen nichts.
 *  4. Die Abfrage antwortet nur auf das richtige Kennzeichen — und auf alles
 *     andere wortgleich mit 404.
 */
describe('POST /api/brand/check · der Lauf hinter der Antwort (LL1 b)', () => {
  /** Hält das Urteil auf; gibt die Funktion zurück, die es freigibt. */
  function holdJudge(): () => void {
    let release: () => void = () => {}
    judgeGate = new Promise<void>((resolve) => {
      release = resolve
    })
    return () => {
      judgeGate = null
      release()
    }
  }

  async function runState(token: string): Promise<BrandCheckRunStateResponse> {
    routerId = token
    return await runStateHandler(event)
  }

  it('antwortet 202 mit Kennzeichen, solange der Lauf noch rechnet — ohne Id, ohne Zeile', async () => {
    const release = holdJudge()

    const started = await startHandler(event)

    expect(status).toBe(202)
    expect(started).toMatchObject({ ok: true, id: '', cached: false })
    expect(started.token).toMatch(/^r[0-9a-f]{31}\.[\w-]{43}$/)
    expect(started.run?.state).toBe('running')
    // Gebucht ist schon, gespeichert noch nichts.
    expect(buckets.get('rl:brand-check-instance-day')).toBe(1)
    expect(stored).toHaveLength(0)
    expect((await runState(started.token ?? '')).run.state).toBe('running')

    release()
    await detached

    const ended = await runState(started.token ?? '')
    expect(ended.run).toMatchObject({ state: 'done', failure: '', ref: 'c1' })
    expect(stored).toHaveLength(1)
  })

  it('ein Treffer im Zwischenspeicher antwortet weiter sofort mit 200 — ohne Lauf-Zeile', async () => {
    stored = [{ $id: 'c9', $createdAt: new Date(Date.now() - 60_000).toISOString(), urlKey: 'kailua.coffee', score: 71 }]

    expect(await startHandler(event)).toEqual({ ok: true, id: 'c9', cached: true })
    expect(status).toBe(200)
    expect(store.rows.size).toBe(0)
  })

  it('der Honigtopf nimmt keine Sperre', async () => {
    body = { ...body, hp: 'ich bin ein Skript' }

    await startHandler(event)

    expect(store.rows.size).toBe(0)
  })

  it('zweiter Start desselben Besuchers für dieselbe Adresse ⇒ DERSELBE Lauf, keine zweite Buchung', async () => {
    const release = holdJudge()

    const first = await startHandler(event)
    const firstRun = detached
    // Anders geschrieben, dieselbe Adresse — der Schlüssel ist normalisiert.
    body = { url: 'https://Kailua.Coffee/?utm_source=news', locale: 'de' }
    const second = await startHandler(event)

    expect(status).toBe(202)
    expect(second.token).toBe(first.token)
    expect(second).toMatchObject({ ok: true, id: '', cached: false })
    expect(second.run?.state).toBe('running')
    expect(store.rows.size).toBe(1)
    // EINE Buchung, EIN Urteil — der zweite Klick hat nichts gekostet.
    expect(buckets.get('rl:brand-check-instance-day')).toBe(1)
    expect([...buckets.entries()].filter(([key]) => key.includes('brand-check-ip-day'))).toEqual([[expect.any(String), 1]])

    release()
    await firstRun
    expect(judgeBrandCheck).toHaveBeenCalledTimes(1)
    expect(stored).toHaveLength(1)
  })

  it('fünf gleichzeitige Starts desselben Besuchers ⇒ genau ein Lauf, alle mit demselben Kennzeichen', async () => {
    const release = holdJudge()

    const answers = await Promise.all(Array.from({ length: 5 }, () => startHandler(event)))

    expect(new Set(answers.map(answer => answer.token)).size).toBe(1)
    expect(store.rows.size).toBe(1)
    expect(buckets.get('rl:brand-check-instance-day')).toBe(1)

    release()
    await detached
    expect(judgeBrandCheck).toHaveBeenCalledTimes(1)
  })

  it('ein FREMDER Anschluss mit derselben Adresse trifft die Sperre nicht — eigener Lauf, eigenes Kennzeichen', async () => {
    const release = holdJudge()

    const mine = await startHandler(event)
    clientIp = '198.51.100.4'
    const theirs = await startHandler(event)

    expect(theirs.token).toBeTruthy()
    expect(theirs.token).not.toBe(mine.token)
    expect(store.rows.size).toBe(2)
    const subjects = [...store.rows.values()].map(row => row.subject)
    expect(new Set(subjects).size).toBe(2)

    release()
    await detached
  })

  it('ein Konto und ein Gast am selben Anschluss sind zwei Besucher', async () => {
    const release = holdJudge()

    const guest = await startHandler(event)
    ;(event as unknown as { context: Record<string, unknown> }).context = { user: { $id: 'u-7' } }
    const account = await startHandler(event)

    expect(account.token).not.toBe(guest.token)
    expect(store.rows.size).toBe(2)

    release()
    await detached
  })

  it('an der Zeile steht weder die Adresse noch der Anschluss noch das Kennzeichen', async () => {
    const started = await postHandler(event)

    const row = lastRun()
    expect(row?.scope).toBe(BRAND_RUN_SCOPES.check)
    expect(row?.subject).toMatch(/^[0-9a-f]{64}$/)
    const raw = JSON.stringify(row)
    expect(raw).not.toContain('kailua')
    expect(raw).not.toContain(CLIENT_IP)
    // Die Unterschrift des Kennzeichens steht nirgends — nur der Zufallswert,
    // aus dem sie sich ohne den Server-Schlüssel nicht rechnen lässt.
    expect(raw).not.toContain((started.token ?? '').split('.')[1])
  })

  it('der Deckel lehnt ab ⇒ 429 UND die Sperre fällt wieder (der nächste Versuch hängt nicht)', async () => {
    for (let run = 1; run <= 3; run++) {
      body = { url: `kailua-${run}.coffee`, locale: 'de' }
      await postHandler(event)
    }
    const before = store.rows.size

    body = { url: 'kailua-4.coffee', locale: 'de' }
    await expect(startHandler(event)).rejects.toMatchObject({ status: 429, data: { code: 'brand_check_ip_limit' } })

    expect(store.rows.size).toBe(before)
    expect(judgeBrandCheck).toHaveBeenCalledTimes(3)
  })

  it('ein gescheiterter Lauf ist frei für den nächsten Start (kein Hängen an der alten Zeile)', async () => {
    fetchOutcome = 'failed'
    await postHandler(event)
    expect(lastOutcome()).toBe('fetch_failed')

    fetchOutcome = 'ok'
    const again = await postHandler(event)

    expect(lastOutcome()).toBe('done')
    expect(again.id).toBe('c1')
    expect(store.rows.size).toBe(2)
  })

  it('der Herzschlag ging verloren ⇒ der Lauf speichert NICHTS mehr', async () => {
    leaseLost = true

    await postHandler(event)

    expect(lastOutcome()).toBe('lease_lost')
    expect(stored).toHaveLength(0)
  })

  it('die zugeordnete Marke verschwindet während des Laufs ⇒ kein Check, der an ihr hinge', async () => {
    ;(event as unknown as { context: Record<string, unknown> }).context = { user: { $id: 'u1' } }
    profiles = [{ $id: 'p1', $createdAt: '2026-09-01T00:00:00.000Z', ownerType: 'user', ownerId: 'u1' }]
    body = { url: 'kailua.coffee', locale: 'de', force: true, profileId: 'p1' }
    const release = holdJudge()

    await startHandler(event)
    profiles = []
    release()
    await detached

    expect(lastOutcome()).toBe('profile_gone')
    expect(stored).toHaveLength(0)
  })
})

describe('GET /api/brand/check/runs/<kennzeichen> · wer den Stand lesen darf', () => {
  const NOT_FOUND = { status: 404, data: { code: 'run_not_found' } }

  async function runState(token: string): Promise<BrandCheckRunStateResponse> {
    routerId = token
    return await runStateHandler(event)
  }

  it('das richtige Kennzeichen ⇒ der Stand, und NUR der Stand', async () => {
    const started = await postHandler(event)

    const answer = await runState(started.token ?? '')

    expect(Object.keys(answer)).toEqual(['run'])
    expect(Object.keys(answer.run).sort()).toEqual(
      ['created', 'failure', 'finishedAt', 'model', 'quota', 'ref', 'refunded', 'startedAt', 'state'],
    )
    expect(answer.run).toMatchObject({ state: 'done', ref: 'c1' })
    // Weder der Gegenstand der Sperre noch der Zufallswert gehen hinaus.
    const raw = JSON.stringify(answer)
    expect(raw).not.toContain(lastRun()?.subject ?? 'x')
    expect(raw).not.toContain(parseBrandRunDetail(lastRun()?.detail).key)
  })

  it('ein gescheiterter Lauf nennt seinen kurzen Grund', async () => {
    fetchOutcome = 'robots'
    const started = await postHandler(event)

    expect((await runState(started.token ?? '')).run).toMatchObject({ state: 'failed', failure: 'site_blocked', ref: '' })
  })

  it('falsch geformt ⇒ 404, OHNE nachzuschlagen', async () => {
    await postHandler(event)
    tablesDB.getRow.mockClear()

    for (const token of ['', 'x', 'c1', '../brand_checks/c1', `${'r'.padEnd(32, '0')}`, `${'r'.padEnd(32, '0')}.zu-kurz`]) {
      await expect(runState(token)).rejects.toMatchObject(NOT_FOUND)
    }
    expect(tablesDB.getRow).not.toHaveBeenCalled()
  })

  it('richtige Zeile, falsche Unterschrift ⇒ dasselbe 404 wie eine unbekannte Zeile', async () => {
    const started = await postHandler(event)
    const [rowId, signature] = (started.token ?? '').split('.') as [string, string]
    const flipped = signature.startsWith('A') ? `B${signature.slice(1)}` : `A${signature.slice(1)}`
    const unknownRow = `r${'0'.repeat(31)}`

    await expect(runState(`${rowId}.${flipped}`)).rejects.toMatchObject(NOT_FOUND)
    await expect(runState(`${unknownRow}.${signature}`)).rejects.toMatchObject(NOT_FOUND)
    // GEGENPROBE: unverändert geht es.
    await expect(runState(started.token ?? '')).resolves.toMatchObject({ run: { state: 'done' } })
  })

  it('das Kennzeichen eines FREMDEN Laufs passt nicht auf den eigenen', async () => {
    const mine = await postHandler(event)
    clientIp = '198.51.100.4'
    const theirs = await postHandler(event)
    const [mineRow] = (mine.token ?? '').split('.') as [string, string]
    const [, theirSignature] = (theirs.token ?? '').split('.') as [string, string]

    await expect(runState(`${mineRow}.${theirSignature}`)).rejects.toMatchObject(NOT_FOUND)
  })

  it('eine Lauf-Zeile einer ANDEREN Art (Entwürfe einer Marke) gibt es hier nicht', async () => {
    const started = await postHandler(event)
    const row = lastRun()
    if (!row) throw new Error('kein Lauf')
    // Dieselbe Zeile, nur als Lauf einer Marke ausgewiesen — das Kennzeichen
    // stimmt rechnerisch weiter, die Art nicht.
    row.scope = BRAND_RUN_SCOPES.drafts

    await expect(runState(started.token ?? '')).rejects.toMatchObject(NOT_FOUND)
  })

  it('ein anderer Server-Schlüssel hätte ein anderes Kennzeichen ausgestellt', async () => {
    const started = await postHandler(event)

    vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' }, appwriteKey: 'ein-anderer-schluessel' }))
    try {
      await expect(runState(started.token ?? '')).rejects.toMatchObject(NOT_FOUND)
    }
    finally {
      vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' }, appwriteKey: 'test-server-secret' }))
    }
  })

  it('die Ablage ist nicht lesbar ⇒ 404, kein 500 (die Seite fragt einfach wieder)', async () => {
    const started = await postHandler(event)
    storeBroken = true

    await expect(runState(started.token ?? '')).rejects.toMatchObject(NOT_FOUND)
  })
})
