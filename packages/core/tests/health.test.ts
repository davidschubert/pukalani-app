import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProductManifest } from '../shared/types/manifest'

/**
 * /api/health HÄLT DAS APPWRITE-ERGEBNIS 5 SEKUNDEN (BE-002).
 *
 * Die Route ist ohne Anmeldung erreichbar und darf keine 429 kennen
 * (Wächter, Deploy-Beweis, UptimeRobot) — die Bremse ist deshalb ein
 * Zwischenspeicher je Prozess. Gezählt wird hier, wie oft die Route Appwrite
 * wirklich fragt.
 */
const healthGet = vi.fn<() => Promise<{ status: string }>>()
const listRows = vi.fn<(params: { tableId: string }) => Promise<unknown>>()

vi.mock('../server/lib/appwrite', () => ({
  createAdminClient: () => ({ health: { get: healthGet }, tablesDB: { listRows } }),
}))

/** Ohne registrierte Layer gibt es keine Probe ⇒ ok 0/0. */
const NO_PROBES = { state: 'ok', expected: 0, found: 0 }
/** Ohne Start-Plugin steht der Schalter der Karte auf `off` (PK1 E1c). */
const CARD_OFF = { mode: 'off', cards: false, previous: false, liveRelay: false }

type Handler = (event: object) => Promise<{
  ok: boolean
  build: string | null
  reason?: string
  schema?: { state: string, expected: number, found: number | null }
  siteCard?: { mode: string, cards: boolean, previous: boolean, liveRelay: boolean }
}>
let handler: Handler
let tenancy: { enabled?: boolean } = {}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-13T10:00:00Z'))
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { buildSha: 'abc1234', appwriteDatabaseId: 'main' } }))
  tenancy = {}
  vi.stubGlobal('useAppConfig', () => ({ pukalani: { tenancy } }))
  healthGet.mockReset()
  healthGet.mockResolvedValue({ status: 'pass' })
  listRows.mockReset()
  listRows.mockResolvedValue({ total: 0, rows: [] })
  // Frisches Modul je Test: der Zwischenspeicher ist Modul-Zustand.
  vi.resetModules()
  handler = (await import('../server/api/health')).default as unknown as Handler
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('/api/health', () => {
  it('zwei Aufrufe innerhalb einer Sekunde ⇒ eine Abfrage', async () => {
    await handler({})
    vi.advanceTimersByTime(900)
    await handler({})
    expect(healthGet).toHaveBeenCalledTimes(1)
  })

  it('nach 5 Sekunden fragt sie neu', async () => {
    await handler({})
    vi.advanceTimersByTime(5_001)
    await handler({})
    expect(healthGet).toHaveBeenCalledTimes(2)
  })

  it('10 gleichzeitige Aufrufe teilen sich EINE laufende Abfrage', async () => {
    let resolve: (value: { status: string }) => void = () => {}
    healthGet.mockReturnValueOnce(new Promise(r => (resolve = r)))
    const calls = Array.from({ length: 10 }, () => handler({}))
    resolve({ status: 'pass' })
    const results = await Promise.all(calls)
    expect(healthGet).toHaveBeenCalledTimes(1)
    expect(results.every(r => r.ok)).toBe(true)
  })

  it('eine Abfrage, die nie endet, blockiert spätere Aufrufe nicht für immer', async () => {
    healthGet.mockReturnValueOnce(new Promise(() => {}))
    void handler({})
    vi.advanceTimersByTime(9_000)
    void handler({})
    // Innerhalb der Frist teilen sich beide die hängende Abfrage.
    expect(healthGet).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1_001)
    expect((await handler({})).ok).toBe(true)
    expect(healthGet).toHaveBeenCalledTimes(2)
  })

  it('antwortet ohne `user`, mit `ok` und `build`', async () => {
    const body = await handler({ context: { user: { $id: 'u1' } } })
    expect(body).toEqual({ ok: true, build: 'abc1234', schema: NO_PROBES, siteCard: CARD_OFF })
    expect(body).not.toHaveProperty('user')
  })

  it('`build` wird nicht zwischengespeichert', async () => {
    await handler({})
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { buildSha: 'def5678' } }))
    expect((await handler({})).build).toBe('def5678')
    expect(healthGet).toHaveBeenCalledTimes(1)
  })

  it('meldet einen nicht gesunden Status als ok:false', async () => {
    healthGet.mockResolvedValueOnce({ status: 'fail' })
    expect((await handler({})).ok).toBe(false)
  })

  it('ein Fehlschlag wird gehalten und weitergegeben — Appwrite wird nicht bei jedem Aufruf neu getroffen', async () => {
    healthGet.mockRejectedValueOnce(new Error('502'))
    await expect(handler({})).rejects.toThrow('502')
    vi.advanceTimersByTime(1_000)
    await expect(handler({})).rejects.toThrow('502')
    expect(healthGet).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5_001)
    expect((await handler({})).ok).toBe(true)
    expect(healthGet).toHaveBeenCalledTimes(2)
  })
})

const brandManifest: ProductManifest = {
  key: 'brand', tier: 'optional', hasMigrations: true, userData: false,
  schema: { latest: '026', probe: { migration: '026', table: 'brand_checks', column: 'erasedAt' } },
  title: { en: 'b', de: 'b' }, description: { en: 'b', de: 'b' }, icon: 'i-ph-x',
}

/**
 * SCHEMA-STAND (OPS-008): `schema` sagt, ob die Datenbank zum ausgerollten
 * Programm passt — `ok` bleibt davon UNBERÜHRT (seit P10 färbt `ok:false`
 * jeden Deploy rot; ein Fehlalarm hier darf das nicht).
 */
describe('/api/health — Schema-Stand (OPS-008)', () => {
  beforeEach(async () => {
    const { registerProductManifest } = await import('../server/utils/productRegistry')
    registerProductManifest(brandManifest)
  })

  it('Migration ausstehend ⇒ ok bleibt true, schema.state ist behind', async () => {
    listRows.mockRejectedValue(Object.assign(new Error('Invalid query'), { code: 400, type: 'general_query_invalid' }))
    const body = await handler({})
    expect(body.ok).toBe(true)
    expect(body.schema).toEqual({ state: 'behind', expected: 1, found: 0 })
  })

  it('verrät keine Tabellen-, Spalten- oder Migrationsnamen', async () => {
    listRows.mockRejectedValue(Object.assign(new Error('x'), { code: 404, type: 'table_not_found' }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(JSON.stringify(await handler({}))).not.toMatch(/brand|erasedAt|026/)
  })

  it('alles da ⇒ ok 1/1', async () => {
    expect((await handler({})).schema).toEqual({ state: 'ok', expected: 1, found: 1 })
  })

  it('Lesefehler ⇒ unknown, ok bleibt true', async () => {
    listRows.mockRejectedValue(Object.assign(new Error('x'), { code: 500, type: 'general_unknown' }))
    const body = await handler({})
    expect(body).toEqual({ ok: true, build: 'abc1234', schema: { state: 'unknown', expected: 1, found: null }, siteCard: CARD_OFF })
  })

  it('eine hängende Probe hält die Antwort höchstens 4 s auf', async () => {
    listRows.mockReturnValue(new Promise(() => {}))
    const pending = handler({})
    await vi.advanceTimersByTimeAsync(4_000)
    expect((await pending).schema).toEqual({ state: 'unknown', expected: 1, found: null })
  })

  it('Appwrite-Check und Schema-Prüfung laufen parallel', async () => {
    let resolveHealth: (value: { status: string }) => void = () => {}
    healthGet.mockReturnValueOnce(new Promise(r => (resolveHealth = r)))
    const pending = handler({})
    await vi.advanceTimersByTimeAsync(0)
    // Die Probe ist schon unterwegs, obwohl der Appwrite-Check noch läuft.
    expect(listRows).toHaveBeenCalledTimes(1)
    resolveHealth({ status: 'pass' })
    expect((await pending).ok).toBe(true)
  })
})

/**
 * SEC-025 (2026-11-13): Mandanten-Trennung an, aber kein Resolver registriert
 * (fehlende `NUXT_PLATFORM_CONTROL_*`). Die Plattform lehnt dann jede Anfrage
 * mit 503 ab — `/api/health` bleibt als einzige erreichbar und MUSS das sagen,
 * sonst erscheint ein Konfigurationsfehler als Ausfall ohne Grund. HTTP 200
 * bleibt: der Deploy-Beweis liest `.build` per `curl -f`.
 */
describe('/api/health — Trennung ohne Resolver (SEC-025)', () => {
  it('meldet ok:false mit benanntem Grund, `build` bleibt lesbar', async () => {
    tenancy = { enabled: true }
    const body = await handler({})
    expect(body).toEqual({ ok: false, build: 'abc1234', reason: 'tenant_resolver_missing', siteCard: CARD_OFF })
  })

  it('fragt Appwrite dann gar nicht — auch keine Schema-Probe', async () => {
    tenancy = { enabled: true }
    const { registerProductManifest } = await import('../server/utils/productRegistry')
    registerProductManifest(brandManifest)
    await handler({})
    expect(healthGet).not.toHaveBeenCalled()
    expect(listRows).not.toHaveBeenCalled()
  })

  it('verrät nicht, WELCHE Einstellung fehlt', async () => {
    tenancy = { enabled: true }
    expect(JSON.stringify(await handler({}))).not.toMatch(/NUXT_|CONTROL|DATABASE|KEY/i)
  })

  it('mit registriertem Resolver ⇒ wieder ok:true (Gegenprobe)', async () => {
    tenancy = { enabled: true }
    const { registerTenantResolver } = await import('../server/utils/tenantResolver')
    registerTenantResolver(() => null)
    expect(await handler({})).toEqual({ ok: true, build: 'abc1234', schema: NO_PROBES, siteCard: CARD_OFF })
  })

  it('Trennung aus ⇒ kein Grund, Antwort unverändert', async () => {
    tenancy = { enabled: false }
    expect(await handler({})).toEqual({ ok: true, build: 'abc1234', schema: NO_PROBES, siteCard: CARD_OFF })
  })
})

/**
 * DER SCHALTER DER KARTE (PK1 E1c): `/api/health` sagt, wie die App ihn
 * gelesen hat — Runbook-Prüfung nach dem Umschalten, Bestätigung für die
 * Freigabe-Pflicht eigener Domains (K6) und die Warnung des Wächters bei einem
 * stehen gebliebenen vorigen Schlüssel. Nie ein Schlüssel, nie seine Kennung.
 */
describe('/api/health — Schalter der Karte (PK1 E1c)', () => {
  const KEY = Buffer.alloc(32, 7).toString('base64')
  const OLD = Buffer.alloc(32, 9).toString('base64')

  afterEach(async () => {
    const { configureSiteCard } = await import('../server/utils/siteCard')
    configureSiteCard({ mode: 'off' })
  })

  it.each([
    [{ mode: 'read', key: KEY }, { mode: 'read', cards: true, previous: false, liveRelay: false }],
    [{ mode: 'write', key: KEY }, { mode: 'write', cards: true, previous: false, liveRelay: false }],
    [{ mode: 'write', key: KEY, previousKey: OLD }, { mode: 'write', cards: true, previous: true, liveRelay: false }],
    // `write` ohne brauchbaren Schlüssel bleibt `write`, aber ohne Karten.
    [{ mode: 'write', key: '' }, { mode: 'write', cards: false, previous: false, liveRelay: false }],
    // `read` ohne Schlüssel fällt auf `off`.
    [{ mode: 'read', key: 'kaputt' }, { mode: 'off', cards: false, previous: false, liveRelay: false }],
  ])('%j ⇒ %j', async (config, expected) => {
    const { configureSiteCard } = await import('../server/utils/siteCard')
    configureSiteCard(config)
    const body = await handler({})
    expect(body.siteCard).toEqual(expected)
    // Kein Schlüssel und keine Kennung in der Antwort.
    expect(JSON.stringify(body)).not.toContain(KEY)
    expect(JSON.stringify(body)).not.toContain(OLD)
  })

  // PK1 E1d: `liveRelay` nur mit `write`, Schlüssel UND WebSocket im Build.
  it.each([
    [{ mode: 'write', key: KEY }, true, true],
    [{ mode: 'write', key: KEY }, false, false],
    [{ mode: 'read', key: KEY }, true, false],
    [{ mode: 'write', key: '' }, true, false],
    [{ mode: 'off' }, true, false],
  ])('liveRelay: %j, WebSocket gebaut %s ⇒ %s', async (config, built, expected) => {
    const { configureSiteCard, setWebsocketBuiltForTests } = await import('../server/utils/siteCard')
    configureSiteCard(config)
    setWebsocketBuiltForTests(built)
    try {
      expect((await handler({})).siteCard?.liveRelay).toBe(expected)
    }
    finally {
      setWebsocketBuiltForTests(null)
    }
  })

  it('auch bei fehlendem Resolver lesbar (SEC-025)', async () => {
    tenancy = { enabled: true }
    const { configureSiteCard } = await import('../server/utils/siteCard')
    configureSiteCard({ mode: 'write', key: KEY })
    expect((await handler({})).siteCard).toEqual({ mode: 'write', cards: true, previous: false, liveRelay: false })
  })
})
