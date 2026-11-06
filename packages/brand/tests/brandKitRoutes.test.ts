import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { BRAND_DNA_DIMENSION_IDS } from '../shared/brandDesignVocab'
import { brandDnaMixSlotValue } from '../shared/brandDesignDna'
import { brandColorRoles, brandColorRolesSlotValue } from '../shared/brandDesignColor'
import { BRAND_TYPE_DEFAULT_RULES, brandTypeRulesSlotValue } from '../shared/brandDesignType'
import { strFromU8, unzipSync } from 'fflate'
import { BRAND_KIT_DAILY_LIMIT, BRAND_KIT_ZIP_WEIGHT } from '../shared/brandKitLimits'
import { KAILUA_COFFEE_DESIGN } from '../shared/examples/kailuaCoffeeDesign'
import type { BrandKitManifest } from '../shared/types/brandKit'

/**
 * DIE ZWEI KIT-ROUTEN (Konzept docs/plans/BRAND-BOOK-KIT.md §2.9/§2.11/§2.12,
 * Paket K2).
 *
 * ── WAS HIER GEPRÜFT WIRD UND IN DEN PUREN TESTS NICHT ───────────────────
 * Die Dateien selbst stehen in `brandTokens.test.ts`, die Registry in
 * `brandKitFiles.test.ts`. Hier läuft, was ihnen erst Bedeutung gibt: die
 * REIHENFOLGE der Türen (Besitz vor Schranke), die 403 mit ihrem Grund, die
 * 409 ohne Preset, der Deckel, die Köpfe und das Ereignis. Vier davon sind
 * Zusagen über Sicherheit (§2.12) und keine sieht man einer puren Funktion an.
 *
 * Die Doppel sind dieselben wie in `brandDocumentRoutes.test.ts`: Zeilen im
 * Speicher, ein `tablesDB`-Doppel, ein zählender Rate-Limit-Store.
 */

const KAILUA = KAILUA_COFFEE_DESIGN!

interface FakeRow { $id: string, [key: string]: unknown }

let profileRow: FakeRow
let stepRows: FakeRow[]
let eventRows: FakeRow[]
let betaAccount: boolean
let headers: Record<string, string>
let hits: string[]
let hitCount: number
let fileParam: string
let nameParam: string

/**
 * DIE SECHS ABGENOMMENEN DESIGN-KAPITEL EINER MARKE — nur die TRAGENDEN
 * Werte (DNA, Basisfarbe, Akzent, Paar, Hierarchie, Zeichen-Art, Tempo).
 * Alles andere darf fehlen; `buildBrandDesign` sagt selbst, was reicht.
 */
function designSteps(): FakeRow[] {
  const locale = 'de'
  const mix = brandDnaMixSlotValue(
    BRAND_DNA_DIMENSION_IDS.map(dimension => ({
      dimension,
      value: KAILUA.dna[dimension]!,
      board: 'proposed',
      origin: 'foundation' as const,
    })),
    locale,
  )
  const roles = brandColorRolesSlotValue(
    brandColorRoles(KAILUA.color.base, KAILUA.color.accent, 'warm') ?? [],
    locale,
  )
  const slots: Record<string, Record<string, string>> = {
    'g.mix': { confirmed: mix },
    'h.base': { confirmed: KAILUA.color.base },
    'h.neutral': { confirmed: 'warm' },
    'h.accent': { confirmed: KAILUA.color.accent },
    'h.roles': { confirmed: roles },
    'i.pair': { confirmed: KAILUA.type.pair },
    'i.scale': { confirmed: KAILUA.type.scale },
    'i.rules': { confirmed: brandTypeRulesSlotValue(BRAND_TYPE_DEFAULT_RULES, locale) },
    'j.kind': { confirmed: KAILUA.mark.kind },
    'l.tempo': { confirmed: KAILUA.motion.tempo },
  }
  return ['dna', 'color', 'type', 'mark', 'imagery', 'motion'].map((stepKey, index) => ({
    $id: `p1_${stepKey}`,
    profileId: 'p1',
    stepKey,
    state: 'done',
    slots: JSON.stringify(stepKey === 'dna' ? slots : {}),
    $updatedAt: `2026-09-0${index + 1}T08:00:00.000Z`,
  }))
}

const tablesDB = {
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    if (tableId === 'brand_profiles') {
      if (rowId !== profileRow.$id) throw Object.assign(new Error('not found'), { code: 404 })
      return profileRow
    }
    if (tableId === 'app_config') return { $id: 'global' }
    throw new Error(`unerwartete Tabelle ${tableId}`)
  }),
  listRows: vi.fn(async ({ tableId }: { tableId: string }) => {
    if (tableId === 'brand_steps') return { rows: stepRows }
    if (tableId === 'brand_mark_drafts') return { rows: [] }
    return { rows: [] }
  }),
  createRow: vi.fn(async ({ tableId, data }: { tableId: string, data: Record<string, unknown> }) => {
    const row: FakeRow = { $id: `e${eventRows.length + 1}`, ...data }
    if (tableId === 'brand_events') eventRows.push(row)
    return row
  }),
  updateRow: vi.fn(async ({ rowId }: { rowId: string }) => ({ $id: rowId })),
}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: {} } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('toH3Error', (error: unknown) => error)
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('requireBrandAccess', async () => ({ userId: 'u1', betaAccount }))
vi.stubGlobal('assertBrandOwnerAccess', (_event: H3Event, row: FakeRow, userId: string) => {
  if (row.ownerId !== userId) throw createError({ status: 404, statusText: 'Not Found' })
})
vi.stubGlobal('getRouterParam', (_event: H3Event, name: string) =>
  (name === 'id' ? 'p1' : name === 'file' ? fileParam : name === 'name' ? nameParam : ''))
vi.stubGlobal('setHeader', (_event: H3Event, name: string, value: string | number) => {
  headers[name] = String(value)
})
vi.stubGlobal('useRateLimitStore', () => ({
  prefix: 'rl:test:',
  store: {
    hit: async (key: string) => {
      hits.push(key.replace('rl:test:', ''))
      hitCount += 1
      return { count: hitCount, resetInMs: 3_600_000 }
    },
  },
}))

const manifestRoute = (await import('../server/api/brand/profiles/[id]/kit.get'))
  .default as unknown as (event: H3Event) => Promise<BrandKitManifest>
const fileRoute = (await import('../server/api/brand/profiles/[id]/kit/[file].get'))
  .default as unknown as (event: H3Event) => Promise<string>
const markRoute = (await import('../server/api/brand/profiles/[id]/kit/marks/[name].get'))
  .default as unknown as (event: H3Event) => Promise<string>
const zipRoute = (await import('../server/api/brand/profiles/[id]/kit.zip.get'))
  .default as unknown as (event: H3Event) => Promise<Buffer>

const event = { context: {} } as unknown as H3Event

interface ThrownError { status?: number, data?: { code?: string, reason?: string } }

async function expectThrown(run: () => Promise<unknown>): Promise<ThrownError> {
  try {
    await run()
  }
  catch (error) {
    return error as ThrownError
  }
  throw new Error('erwartete einen Fehler, bekam eine Antwort')
}

beforeEach(() => {
  profileRow = {
    $id: 'p1',
    ownerId: 'u1',
    ownerType: 'user',
    title: 'Kailua Coffee Co.',
    contentLocale: 'de',
    derivationUnlockedAt: '2026-09-08T09:00:00.000Z',
    derivationUnlockedVia: 'operator',
  }
  stepRows = designSteps()
  eventRows = []
  betaAccount = false
  headers = {}
  hits = []
  hitCount = 0
  fileParam = 'tokens.json'
  nameParam = 'kailua-coffee-co-wordmark-primary.svg'
  vi.clearAllMocks()
})

describe('das Manifest', () => {
  it('nennt alle sieben Dateien mit Grund — und zählt nicht auf den Eimer', async () => {
    const manifest = await manifestRoute(event)
    expect(manifest.designReady).toBe(true)
    expect(manifest.stand).toBe('2026-09-06T08:00:00.000Z')
    expect(manifest.files.map(file => file.id)).toEqual([
      'tokens.json', 'tokens.css', 'licenses.md', 'brand.md', 'brand.json', 'readme.md',
    ])
    const tokens = manifest.files.find(file => file.id === 'tokens.json')!
    expect(tokens.available).toBe(true)
    expect(tokens.bytes).toBeGreaterThan(1000)
    expect(tokens.filename).toBe('kailua-coffee-co-tokens-2026-09-06.json')
    // Seit K3 sind auch die drei Context-Dateien da — sie brauchen kein Preset.
    const context = manifest.files.find(file => file.id === 'brand.md')!
    expect(context).toMatchObject({ available: true, filename: 'kailua-coffee-co-brand-2026-09-06.md' })
    expect(context.bytes).toBeGreaterThan(100)
    expect(headers['Cache-Control']).toBe('private, no-store')
    // §2.11: das Manifest ist die Seite, nicht die Datei.
    expect(hits).toEqual([])
    expect(eventRows).toEqual([])
  })

  it('sagt ohne abgenommene Schicht 2, welche Dateien fehlen', async () => {
    for (const row of stepRows) row.state = 'open'
    const manifest = await manifestRoute(event)
    expect(manifest.designReady).toBe(false)
    // SEIT K6: der DESIGN-Stand ist leer, der Stand des Kits nicht — `brand.md`
    // gibt es auch ohne Preset, und es ändert sich mit jedem Kapitel.
    expect(manifest.designStand).toBe('')
    expect(manifest.stand).toBe('2026-09-06T08:00:00.000Z')
    for (const id of ['tokens.json', 'tokens.css', 'licenses.md']) {
      expect(manifest.files.find(file => file.id === id))
        .toMatchObject({ available: false, reason: 'design_missing' })
    }
  })

  it('lässt das Datum im Dateinamen weg, wenn es gar keinen Stand gibt (§2.6)', async () => {
    for (const row of stepRows) row.$updatedAt = ''
    const manifest = await manifestRoute(event)
    expect(manifest.stand).toBe('')
    expect(manifest.files[0]!.filename).toBe('kailua-coffee-co-tokens.json')
    expect(manifest.bundle.filename).toBe('kailua-coffee-co-brand-kit.zip')
  })
})

describe('die drei Türen — in dieser Reihenfolge', () => {
  it('antwortet auf eine fremde Marke 404, nicht 403', async () => {
    profileRow.ownerId = 'u2'
    // Auch ohne Freischaltung: die Schranke wird erst gefragt, wenn Besitz
    // belegt ist — sonst verriete eine 403, dass es diese Marke gibt.
    profileRow.derivationUnlockedAt = ''
    expect((await expectThrown(() => manifestRoute(event))).status).toBe(404)
    expect((await expectThrown(() => fileRoute(event))).status).toBe(404)
  })

  it('antwortet ohne Freischaltung 403 mit dem Grund', async () => {
    profileRow.derivationUnlockedAt = ''
    profileRow.derivationUnlockedVia = ''
    for (const route of [manifestRoute, fileRoute]) {
      const error = await expectThrown(() => route(event))
      expect(error.status).toBe(403)
      expect(error.data?.code).toBe('derivation_locked')
    }
    // Und der Deckel wurde NICHT angefasst: eine 429 an einer gesperrten Marke
    // verriete, dass es dort etwas zu holen gibt.
    expect(hits).toEqual([])
  })

  it('lässt ein Beta-Konto ohne Feld durch (BS1 Entscheidung 6)', async () => {
    profileRow.derivationUnlockedAt = ''
    profileRow.derivationUnlockedVia = ''
    betaAccount = true
    await expect(manifestRoute(event)).resolves.toMatchObject({ designReady: true })
  })

  it('antwortet auf eine unbekannte Datei 404 — vor allem anderen', async () => {
    fileParam = 'evil.txt'
    expect((await expectThrown(() => fileRoute(event))).status).toBe(404)
    for (const evil of ['../../etc/passwd', 'marks/a.svg', '']) {
      fileParam = evil
      expect((await expectThrown(() => fileRoute(event))).status, evil).toBe(404)
    }
    // Kein Profil geladen, kein Eimer angefasst — die Liste entscheidet zuerst.
    expect(tablesDB.getRow).not.toHaveBeenCalled()
    expect(hits).toEqual([])
  })
})

describe('der Download', () => {
  it('liefert die Datei mit Typ, Dateinamen und ohne Zwischenspeicher', async () => {
    const body = await fileRoute(event)
    expect(body).toContain('"$type": "color"')
    expect(headers['Content-Type']).toBe('application/json; charset=utf-8')
    expect(headers['Cache-Control']).toBe('private, no-store')
    expect(headers['Content-Disposition']).toBe(
      'attachment; filename="kailua-coffee-co-tokens-2026-09-06.json"; '
      + 'filename*=UTF-8\'\'Kailua%20Coffee%20Co.%20tokens%202026-09-06.json',
    )
  })

  it('liefert auch CSS und Lizenzen — mit ihrem eigenen Typ', async () => {
    fileParam = 'tokens.css'
    expect(await fileRoute(event)).toContain('--ui-color-primary-600')
    expect(headers['Content-Type']).toBe('text/css; charset=utf-8')

    fileParam = 'licenses.md'
    expect(await fileRoute(event)).toContain('OFL-1.1')
    expect(headers['Content-Type']).toBe('text/markdown; charset=utf-8')
  })

  it('schreibt ein Ereignis mit der Datei-ID, nie mit dem Dateinamen', async () => {
    await fileRoute(event)
    expect(eventRows).toHaveLength(1)
    expect(eventRows[0]).toMatchObject({ type: 'kit.downloaded', profileId: 'p1', userId: 'u1' })
    const payload = JSON.parse(String(eventRows[0]!.payload)) as Record<string, unknown>
    expect(payload).toEqual({ file: 'tokens.json', design: true })
    expect(JSON.stringify(payload)).not.toContain('Kailua')
  })

  it('antwortet ohne Preset 409 mit dem Grund — und nicht mit einer halben Datei', async () => {
    for (const row of stepRows) row.state = 'open'
    const error = await expectThrown(() => fileRoute(event))
    expect(error.status).toBe(409)
    expect(error.data?.code).toBe('kit_file_design_missing')
    // KEIN zweites Feld: der zentrale Handler hebt nur `code` ins Envelope —
    // ein `reason` daneben wäre eine Auskunft, die nie ankommt.
    expect(error.data?.reason).toBeUndefined()
    expect(eventRows).toEqual([])
  })

  it('liefert den Brand Context — auch OHNE abgenommene Schicht 2 (K3)', async () => {
    for (const row of stepRows) row.state = 'open'
    fileParam = 'brand.md'
    const body = await fileRoute(event)
    expect(body).toContain('# Kailua Coffee Co.')
    expect(body).toContain('Brand Context aus branding.supply')
    // Ohne Preset fehlt genau der visuelle Abschnitt (§2.6 Nr. 8).
    expect(body).not.toContain('## Visuell')
    expect(headers['Content-Type']).toBe('text/markdown; charset=utf-8')
    expect(headers['Cache-Control']).toBe('private, no-store')

    fileParam = 'brand.json'
    const json = JSON.parse(await fileRoute(event)) as { schemaVersion: number, design: unknown }
    expect(json.schemaVersion).toBe(1)
    expect(json.design).toBeNull()
    expect(headers['Content-Type']).toBe('application/json; charset=utf-8')

    fileParam = 'readme.md'
    expect(await fileRoute(event)).toContain('## Was fehlt')
  })

  it('KEINE Datei meldet mehr `not_built_yet` — die Registry ist voll', async () => {
    const manifest = await manifestRoute(event)
    expect(manifest.files.filter(file => file.reason === 'not_built_yet')).toEqual([])
  })

  it('bucht je Abruf einmal auf den Eimer der MARKE', async () => {
    await fileRoute(event)
    fileParam = 'tokens.css'
    await fileRoute(event)
    expect(hits).toEqual(['brand-kit-day:p1', 'brand-kit-day:p1'])
  })

  it('weist den 61. Abruf des Tages mit `brand_kit_limit` ab', async () => {
    hitCount = BRAND_KIT_DAILY_LIMIT
    const error = await expectThrown(() => fileRoute(event))
    expect(error.status).toBe(429)
    expect(error.data?.code).toBe('brand_kit_limit')
    expect(headers['Retry-After']).toBe('3600')
    // Gegenprobe: einer davor geht durch — sonst wäre der Test auch grün,
    // wenn der Deckel bei 1 läge.
    hitCount = BRAND_KIT_DAILY_LIMIT - 2
    await expect(fileRoute(event)).resolves.toContain('$type')
  })
})

/* ── K6: ZEICHEN, BÜNDEL UND DER STAND ÜBER ALLE KAPITEL ─────────────────── */

/** Eine Foundation-Zeile, jünger als jedes Design-Kapitel. */
function foundationRow(stepKey: string, updatedAt: string): FakeRow {
  return {
    $id: `p1_${stepKey}`,
    profileId: 'p1',
    stepKey,
    state: 'done',
    slots: '{}',
    $updatedAt: updatedAt,
  }
}

describe('der Stand des Kits', () => {
  it('nimmt das jüngste Kapitel ALLER Schichten, nicht nur der Design-Kapitel', async () => {
    stepRows.push(foundationRow('story', '2026-09-20T10:00:00.000Z'))
    const manifest = await manifestRoute(event)
    expect(manifest.stand).toBe('2026-09-20T10:00:00.000Z')
    // Der DESIGN-Stand bleibt, was er war — er beantwortet eine andere Frage.
    expect(manifest.designStand).toBe('2026-09-06T08:00:00.000Z')
    expect(manifest.foundationStand).toBe('2026-09-20T10:00:00.000Z')
    // … und er steht im Dateinamen jeder Datei.
    expect(manifest.files[0]!.filename).toBe('kailua-coffee-co-tokens-2026-09-20.json')
    expect(manifest.bundle.filename).toBe('kailua-coffee-co-brand-kit-2026-09-20.zip')
  })

  it('trägt auch OHNE Preset ein Datum — das war vor K6 nicht so', async () => {
    for (const row of stepRows) row.state = 'open'
    stepRows.push(foundationRow('story', '2026-09-20T10:00:00.000Z'))
    const manifest = await manifestRoute(event)
    expect(manifest.designReady).toBe(false)
    expect(manifest.designStand).toBe('')
    expect(manifest.stand).toBe('2026-09-20T10:00:00.000Z')
  })
})

describe('das Manifest nach K6', () => {
  it('nennt acht Zeichen, das Bündel und die drei Kapitel', async () => {
    const manifest = await manifestRoute(event)
    expect(manifest.marks).toHaveLength(8)
    expect(manifest.marks[0]).toMatchObject({
      id: 'marks/kailua-coffee-co-wordmark-primary.svg',
      filename: 'kailua-coffee-co-wordmark-primary.svg',
      setting: 'wordmark',
      variant: 'primary',
    })
    expect(manifest.marks[0]!.bytes).toBeGreaterThan(100)
    expect(manifest.bundle).toEqual({
      filename: 'kailua-coffee-co-brand-kit-2026-09-06.zip',
      available: true,
      weight: BRAND_KIT_ZIP_WEIGHT,
      missing: 0,
    })
    expect(manifest.chapters.map(entry => entry.stepKey))
      .toEqual(['nomenclature', 'aiguide', 'presskit'])
    /*
     * DIE ZUSTÄNDE KOMMEN AUS DER JOURNEY, NICHT AUS EINER ZWEITEN RECHNUNG:
     * diese Marke hat nur Design-Zeilen und keine fertige Foundation, und ihre
     * Weiche W4 ist unentschieden — die Journey sagt deshalb `skipped` für
     * `nomenclature` und `locked` für die zwei anderen. Genau das steht im
     * Manifest, ohne dass es hier eine zweite Zustandslogik gäbe. Der OFFENE
     * Fall braucht eine ganze Marke und wird darum live bewiesen
     * (`verify-brand-kit.mjs`, Abschnitt 9).
     */
    expect(manifest.chapters.map(entry => entry.state)).toEqual(['skipped', 'locked', 'locked'])
    expect(manifest.contentLocale).toBe('de')
    // Weiterhin: die Seite bucht nichts (§2.11).
    expect(hits).toEqual([])
  })

  it('zählt ohne Preset VIER fehlende Kacheln — drei Dateien plus die Zeichen', async () => {
    for (const row of stepRows) row.state = 'open'
    const manifest = await manifestRoute(event)
    expect(manifest.marks).toEqual([])
    expect(manifest.bundle.missing).toBe(4)
    expect(manifest.bundle.available).toBe(true)
  })
})

describe('eine Zeichen-Datei', () => {
  it('liefert das SVG mit Typ, Dateinamen und ohne Zwischenspeicher', async () => {
    const svg = await markRoute(event)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('<title>Kailua Coffee Co. — wordmark primary</title>')
    expect(headers['Content-Type']).toBe('image/svg+xml; charset=utf-8')
    expect(headers['Cache-Control']).toBe('private, no-store')
    expect(headers['Content-Disposition']).toBe(
      'attachment; filename="kailua-coffee-co-wordmark-primary.svg"; '
      + 'filename*=UTF-8\'\'Kailua%20Coffee%20Co.%20wordmark%20primary%202026-09-06.svg',
    )
    expect(hits).toEqual(['brand-kit-day:p1'])
  })

  it('schreibt ein Ereignis OHNE den Markennamen — die Setzung, nicht der Dateiname', async () => {
    await markRoute(event)
    expect(eventRows).toHaveLength(1)
    const payload = JSON.parse(String(eventRows[0]!.payload)) as Record<string, unknown>
    expect(payload).toEqual({ file: 'marks/wordmark-primary.svg', design: true })
    expect(JSON.stringify(payload)).not.toContain('kailua')
  })

  it('antwortet auf einen fremden Namen 404 — und baut nie einen Pfad', async () => {
    for (const evil of ['', 'x.svg', '../../etc/passwd', 'marks/kailua-coffee-co-wordmark-primary.svg']) {
      nameParam = evil
      const error = await expectThrown(() => markRoute(event))
      expect(error.status, evil).toBe(404)
    }
  })

  it('antwortet ohne Preset 409 `kit_file_design_missing` — nicht 404', async () => {
    for (const row of stepRows) row.state = 'open'
    const error = await expectThrown(() => markRoute(event))
    expect(error.status).toBe(409)
    expect(error.data?.code).toBe('kit_file_design_missing')
    expect(error.data?.reason).toBeUndefined()
  })

  it('steht hinter denselben drei Türen: fremd ⇒ 404, gesperrt ⇒ 403', async () => {
    profileRow.ownerId = 'u2'
    expect((await expectThrown(() => markRoute(event))).status).toBe(404)
    profileRow.ownerId = 'u1'
    profileRow.derivationUnlockedAt = ''
    profileRow.derivationUnlockedVia = ''
    const error = await expectThrown(() => markRoute(event))
    expect(error.status).toBe(403)
    expect(error.data?.code).toBe('derivation_locked')
    expect(hits).toEqual([])
  })
})

describe('das Bündel', () => {
  it('liefert ein gültiges Zip mit allen Dateien und den Zeichen', async () => {
    const zip = await zipRoute(event)
    const back = unzipSync(new Uint8Array(zip))
    const names = Object.keys(back).sort()
    expect(names).toEqual([
      'LICENSES.md',
      'README.md',
      'brand.json',
      'brand.md',
      'marks/kailua-coffee-co-monogram-icon.svg',
      'marks/kailua-coffee-co-monogram-inverted.svg',
      'marks/kailua-coffee-co-monogram-mono.svg',
      'marks/kailua-coffee-co-monogram-primary.svg',
      'marks/kailua-coffee-co-wordmark-icon.svg',
      'marks/kailua-coffee-co-wordmark-inverted.svg',
      'marks/kailua-coffee-co-wordmark-mono.svg',
      'marks/kailua-coffee-co-wordmark-primary.svg',
      'tokens.css',
      'tokens.json',
    ])
    // Im Zip heisst eine Datei, wie sie heisst — der Marken-Stamm steht am ZIP.
    expect(strFromU8(back['README.md']!)).toContain('# Brand Kit — Kailua Coffee Co.')
    expect(strFromU8(back['README.md']!)).toContain('`marks/` — 8 Setzungen als SVG')
    expect(strFromU8(back['tokens.json']!)).toContain('"$type": "color"')
  })

  it('setzt Typ, Länge, Dateinamen und `no-store`', async () => {
    const zip = await zipRoute(event)
    expect(headers['Content-Type']).toBe('application/zip')
    expect(headers['Cache-Control']).toBe('private, no-store')
    expect(headers['Content-Length']).toBe(String(zip.byteLength))
    expect(headers['Content-Disposition']).toBe(
      'attachment; filename="kailua-coffee-co-brand-kit-2026-09-06.zip"; '
      + 'filename*=UTF-8\'\'Kailua%20Coffee%20Co.%20brand%20kit%202026-09-06.zip',
    )
  })

  it('bucht FÜNF Treffer auf den Eimer der Marke (§2.11)', async () => {
    await zipRoute(event)
    expect(hits).toEqual(Array.from({ length: BRAND_KIT_ZIP_WEIGHT }, () => 'brand-kit-day:p1'))
    expect(eventRows).toHaveLength(1)
    const payload = JSON.parse(String(eventRows[0]!.payload)) as Record<string, unknown>
    expect(payload).toEqual({ file: 'kit.zip', design: true })
  })

  it('weist ab, sobald der Eimer voll ist — und rechnet dann gar nicht erst', async () => {
    hitCount = BRAND_KIT_DAILY_LIMIT
    const error = await expectThrown(() => zipRoute(event))
    expect(error.status).toBe(429)
    expect(error.data?.code).toBe('brand_kit_limit')
    expect(eventRows).toEqual([])
  })

  it('liegt ohne Preset kleiner da — und die README sagt, was fehlt', async () => {
    for (const row of stepRows) row.state = 'open'
    const back = unzipSync(new Uint8Array(await zipRoute(event)))
    expect(Object.keys(back).sort()).toEqual(['README.md', 'brand.json', 'brand.md'])
    const readme = strFromU8(back['README.md']!)
    expect(readme).toContain('## Was fehlt')
    expect(readme).toContain('`marks/` — kommt mit Brand Design')
    expect(readme).toContain('`tokens.json` — kommt mit Brand Design')
  })

  it('steht hinter denselben drei Türen: fremd ⇒ 404, gesperrt ⇒ 403', async () => {
    profileRow.ownerId = 'u2'
    expect((await expectThrown(() => zipRoute(event))).status).toBe(404)
    profileRow.ownerId = 'u1'
    profileRow.derivationUnlockedAt = ''
    profileRow.derivationUnlockedVia = ''
    const error = await expectThrown(() => zipRoute(event))
    expect(error.status).toBe(403)
    expect(error.data?.code).toBe('derivation_locked')
    expect(hits).toEqual([])
  })

  it('antwortet mit einem kleinen Deckel 413 `kit_too_large` (§2.6)', async () => {
    /*
     * DER DECKEL IST EIN IMPORT, KEIN SCHALTER: der Test tauscht ihn für DIESEN
     * einen Lauf gegen 64 Bytes aus. Damit ist der 413-Zweig bewiesen, ohne
     * dass es irgendwo eine Env-Variable oder einen Prod-Knopf gibt, den
     * jemand versehentlich umlegen könnte.
     */
    vi.resetModules()
    vi.doMock('../shared/brandKitLimits', async () => ({
      ...(await vi.importActual<typeof import('../shared/brandKitLimits')>('../shared/brandKitLimits')),
      BRAND_KIT_ZIP_MAX_BYTES: 64,
    }))
    try {
      const capped = (await import('../server/api/brand/profiles/[id]/kit.zip.get'))
        .default as unknown as (event: H3Event) => Promise<Buffer>
      const error = await expectThrown(() => capped(event))
      expect(error.status).toBe(413)
      expect(error.data?.code).toBe('kit_too_large')
      // Der Eimer wurde VORHER gebucht — der Deckel steht hinter der Drossel.
      expect(hits).toHaveLength(BRAND_KIT_ZIP_WEIGHT)
      expect(eventRows).toEqual([])
    }
    finally {
      vi.doUnmock('../shared/brandKitLimits')
      vi.resetModules()
    }
  })
})
