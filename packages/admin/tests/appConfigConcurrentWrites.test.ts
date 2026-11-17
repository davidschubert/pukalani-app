import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseProductsColumn } from '../../core/shared/types/config'
import { applyThemeSettingsPatch, parseStoredThemeSettings } from '../shared/themeSettingsPatch'

/**
 * ZWEI BETREIBER IM SELBEN AUGENBLICK (BP1 d, 2026-11-17).
 *
 * Ausgeführt werden die ECHTEN Handler mit dem ECHTEN `mutateAppConfig()`;
 * gestellt ist nur Appwrite — eine Zeile `app_config/global`, deren Lesen und
 * Schreiben je ein paar Millisekunden dauert, damit sich zwei Aufrufe
 * wirklich überlappen. Die Gegenprobe tauscht nur die Kette gegen dasselbe
 * Lesen-Rechnen-Schreiben OHNE Kette und zeigt, dass dann eine Änderung
 * verloren geht — sonst wäre der Haupttest auch ohne Kette grün.
 */

const OPERATOR = { $id: 'betreiber-1', name: 'Betreiber', labels: ['admin'] }

type Row = Record<string, unknown>

let row: Row | null
let ops: string[]
let audits: Array<Record<string, unknown>>
let activities: Array<Record<string, unknown>>

const tick = () => new Promise(resolve => setTimeout(resolve, 5))
const notFound = () => Object.assign(new Error('Row not found'), { code: 404 })

const tablesDB = {
  getRow: async () => {
    ops.push('read')
    const snapshot = row ? { $id: 'global', ...row } : null
    await tick()
    if (!snapshot) throw notFound()
    return snapshot
  },
  updateRow: async ({ data }: { data: Row }) => {
    await tick()
    if (!row) throw notFound()
    ops.push('write')
    row = { ...row, ...data }
    return row
  },
  createRow: async ({ data }: { data: Row }) => {
    await tick()
    ops.push('create')
    row = { ...data }
    return row
  },
}

interface Manifest { key: string, tier: 'optional' | 'foundation', requires?: string[] }
const REGISTRY = new Map<string, Manifest>([
  ['core', { key: 'core', tier: 'foundation' }],
  ['comments', { key: 'comments', tier: 'optional' }],
  ['moderation', { key: 'moderation', tier: 'optional', requires: ['comments'] }],
  ['events', { key: 'events', tier: 'optional' }],
  ['courses', { key: 'courses', tier: 'optional' }],
])

/** Dasselbe Lesen-Rechnen-Schreiben wie `mutateAppConfig`, nur OHNE Kette. */
async function unchainedMutate<T>(
  _event: unknown,
  compute: (current: Row | null) => Promise<{ data: Row, result: T }> | { data: Row, result: T },
): Promise<T> {
  const current = await tablesDB.getRow().catch(() => null)
  const { data, result } = await compute(current)
  await tablesDB.updateRow({ data }).catch(() => tablesDB.createRow({ data }))
  return result
}

async function stubAll(options: { chained?: boolean, allowed?: boolean } = {}) {
  vi.resetModules()
  const { chained = true, allowed = true } = options
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('requirePermission', (_event: unknown, permission: string) => {
    ops.push(`permission:${permission}`)
    if (!allowed) throw Object.assign(new Error('Forbidden'), { status: 403, statusCode: 403 })
    return OPERATOR
  })
  vi.stubGlobal('getRouterParam', (event: { params: Record<string, string> }, name: string) => event.params[name])
  vi.stubGlobal('readValidatedBody', async (event: { body: unknown }, parse: (body: unknown) => unknown) => parse(event.body))
  vi.stubGlobal('createError', (init: Record<string, unknown>) =>
    Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
  vi.stubGlobal('toH3Error', (error: unknown) => error)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
  vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
  vi.stubGlobal('getProductRegistry', () => REGISTRY)
  vi.stubGlobal('invalidateProductGateCache', () => {})
  vi.stubGlobal('getEffectiveProducts', async () => {
    // Wie der Core: wirksamer Stand aus der (frisch gelesenen) Zeile.
    const stored = parseProductsColumn(row?.products)
    return Object.fromEntries([...REGISTRY.keys()].map(key => [key, stored[key] ?? { enabled: true, status: 'active' }]))
  })
  vi.stubGlobal('recordAudit', async (_event: unknown, entry: Record<string, unknown>) => { audits.push(entry) })
  vi.stubGlobal('recordActivity', async (_event: unknown, entry: Record<string, unknown>) => { activities.push(entry) })
  if (chained) {
    const { mutateAppConfig } = await import('../server/utils/appConfigWrite')
    vi.stubGlobal('mutateAppConfig', mutateAppConfig)
  }
  else {
    vi.stubGlobal('mutateAppConfig', unchainedMutate)
  }
}

const PRODUCTS_ROUTE = '../server/api/admin/products/[key].patch.ts'
const THEME_SETTINGS_ROUTE = '../server/api/admin/themes/settings.patch.ts'

async function load(path: string) {
  const module = await import(path) as { default: (event: unknown) => Promise<unknown> }
  return module.default
}

function event(body: unknown, params: Record<string, string> = {}) {
  return { context: { user: OPERATOR }, params, body }
}

const storedProducts = () => parseProductsColumn(row?.products)
const storedTheme = () => parseStoredThemeSettings(row?.themeSettings)

beforeEach(() => {
  row = { products: '{}', themeSettings: '{}', registrationEnabled: true }
  ops = []
  audits = []
  activities = []
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Produkt-Schalter: zwei Betreiber gleichzeitig', () => {
  it('zwei Schalter an zwei Produkten ⇒ beide Änderungen stehen in der Zeile', async () => {
    await stubAll()
    const run = await load(PRODUCTS_ROUTE)
    await Promise.all([
      run(event({ enabled: false }, { key: 'events' })),
      run(event({ enabled: false }, { key: 'courses' })),
    ])
    expect(storedProducts()).toEqual({
      events: { enabled: false, status: 'inactive' },
      courses: { enabled: false, status: 'inactive' },
    })
    // Fremde Spalten bleiben unberührt (nur `products` wird geschrieben).
    expect(row?.registrationEnabled).toBe(true)
    // In der Kette: lesen, schreiben, lesen, schreiben — nie zwei Lesungen am Stück.
    expect(ops.filter(op => op === 'read' || op === 'write')).toEqual(['read', 'write', 'read', 'write'])
    expect(audits.map(entry => entry.targetId).sort()).toEqual(['courses', 'events'])
  })

  it('GEGENPROBE ohne Kette: eine der zwei Änderungen geht verloren', async () => {
    await stubAll({ chained: false })
    const run = await load(PRODUCTS_ROUTE)
    await Promise.all([
      run(event({ enabled: false }, { key: 'events' })),
      run(event({ enabled: false }, { key: 'courses' })),
    ])
    expect(Object.keys(storedProducts())).toHaveLength(1)
  })

  it('Abhängigkeiten werden gegen den frischen Stand geprüft: nie „moderation an, comments aus"', async () => {
    row = { products: JSON.stringify({ moderation: { enabled: false, status: 'inactive' } }) }
    await stubAll()
    const run = await load(PRODUCTS_ROUTE)
    const results = await Promise.allSettled([
      run(event({ enabled: true }, { key: 'moderation' })),
      run(event({ enabled: false }, { key: 'comments' })),
    ])
    // Der erste gewinnt, der zweite sieht dessen Ergebnis und wird abgelehnt.
    expect(results[0]).toMatchObject({ status: 'fulfilled' })
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { status: 409 } })
    expect(storedProducts()).toEqual({})
    expect(audits).toHaveLength(1)
  })

  it('eine Zeile, die fehlt, wird angelegt', async () => {
    row = null
    await stubAll()
    const run = await load(PRODUCTS_ROUTE)
    await run(event({ enabled: false }, { key: 'events' }))
    expect(ops).toContain('create')
    expect(storedProducts()).toEqual({ events: { enabled: false, status: 'inactive' } })
  })

  it('ohne system.manage (Gast oder Konto ohne Recht) ⇒ abgelehnt, nichts gelesen, nichts geschrieben', async () => {
    await stubAll({ allowed: false })
    const run = await load(PRODUCTS_ROUTE)
    await expect(run({ context: {}, params: { key: 'events' }, body: { enabled: false } })).rejects.toMatchObject({ status: 403 })
    expect(ops).toEqual(['permission:system.manage'])
    expect(row?.products).toBe('{}')
    expect(audits).toEqual([])
  })
})

describe('Theme-Einstellungen: zwei Betreiber gleichzeitig', () => {
  it('Default und ein Built-in gleichzeitig ⇒ beide Änderungen stehen in der Zeile', async () => {
    row = { themeSettings: JSON.stringify({ builtins: { ocean: { name: 'Meer' } } }) }
    await stubAll()
    const run = await load(THEME_SETTINGS_ROUTE)
    await Promise.all([
      run(event({ defaultThemeId: 'sunset', defaultVariantId: null })),
      run(event({ builtins: { forest: { hidden: true } } })),
    ])
    expect(storedTheme()).toEqual({
      defaultThemeId: 'sunset',
      builtins: { ocean: { name: 'Meer' }, forest: { hidden: true } },
    })
    expect(ops.filter(op => op === 'read' || op === 'write')).toEqual(['read', 'write', 'read', 'write'])
    // Der Feed sieht den Wechsel, verglichen mit dem Stand aus der Kette.
    expect(activities).toEqual([expect.objectContaining({ type: 'theme.default_changed', objectId: 'sunset' })])
  })

  it('zwei Built-ins gleichzeitig ⇒ beide Einträge', async () => {
    await stubAll()
    const run = await load(THEME_SETTINGS_ROUTE)
    await Promise.all([
      run(event({ builtins: { ocean: { hidden: true } } })),
      run(event({ builtins: { forest: { name: 'Wald' } } })),
    ])
    expect(storedTheme().builtins).toEqual({ ocean: { hidden: true }, forest: { name: 'Wald' } })
  })

  it('GEGENPROBE ohne Kette: eine der zwei Änderungen geht verloren', async () => {
    await stubAll({ chained: false })
    const run = await load(THEME_SETTINGS_ROUTE)
    await Promise.all([
      run(event({ builtins: { ocean: { hidden: true } } })),
      run(event({ builtins: { forest: { name: 'Wald' } } })),
    ])
    expect(Object.keys(storedTheme().builtins ?? {})).toHaveLength(1)
  })

  it('derselbe Default noch einmal ⇒ kein Feed-Eintrag', async () => {
    row = { themeSettings: JSON.stringify({ defaultThemeId: 'sunset' }) }
    await stubAll()
    const run = await load(THEME_SETTINGS_ROUTE)
    await run(event({ defaultThemeId: 'sunset' }))
    expect(activities).toEqual([])
  })

  it('ohne system.manage ⇒ abgelehnt, nichts gelesen, nichts geschrieben', async () => {
    await stubAll({ allowed: false })
    const run = await load(THEME_SETTINGS_ROUTE)
    await expect(run({ context: {}, params: {}, body: { defaultThemeId: 'sunset' } })).rejects.toMatchObject({ status: 403 })
    expect(ops).toEqual(['permission:system.manage'])
    expect(row?.themeSettings).toBe('{}')
  })
})

describe('Theme-Einstellungen: die Regel „nur das geänderte Feld"', () => {
  const stored = {
    defaultThemeId: 'sunset',
    defaultVariantId: 'dusk',
    builtins: { ocean: { name: 'Meer', hidden: true }, forest: { order: 2 } },
  }

  it('ein fehlender Schlüssel bleibt, ein genannter ersetzt, null heißt „keiner"', () => {
    expect(applyThemeSettingsPatch(stored, {})).toEqual(stored)
    expect(applyThemeSettingsPatch(stored, { defaultThemeId: 'ocean', defaultVariantId: null }))
      .toEqual({ defaultThemeId: 'ocean', builtins: stored.builtins })
    expect(applyThemeSettingsPatch(stored, { defaultThemeId: null }))
      .toEqual({ defaultVariantId: 'dusk', builtins: stored.builtins })
  })

  it('builtins je Eintrag: genannter ersetzt ganz, {} fällt weg, andere bleiben', () => {
    expect(applyThemeSettingsPatch(stored, { builtins: { ocean: { hidden: false } } }).builtins)
      .toEqual({ ocean: { hidden: false }, forest: { order: 2 } })
    expect(applyThemeSettingsPatch(stored, { builtins: { ocean: {} } }).builtins)
      .toEqual({ forest: { order: 2 } })
    expect(applyThemeSettingsPatch({ builtins: { ocean: { order: 1 } } }, { builtins: { ocean: {} } }))
      .toEqual({})
  })

  it('kaputter gespeicherter Stand ⇒ leer, wie bisher', () => {
    expect(parseStoredThemeSettings('kein json')).toEqual({})
    expect(parseStoredThemeSettings('[1]')).toEqual({})
    expect(parseStoredThemeSettings(undefined)).toEqual({})
  })
})
