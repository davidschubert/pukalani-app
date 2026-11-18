import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { allowedLayersOf } from '../../../scripts/lib/migrate-plan.mjs'
import { columnReport, columnSoll, compareColumns, readLayerOrder } from '../../../scripts/lib/schema-columns.mjs'

/**
 * MG1 c (2026-11-18): der tägliche Schema-Blick vergleicht je Instanz die
 * Spalten der Datenbank mit dem Soll aus den Migrationen — nur für die Layer,
 * die die App nutzt. Hier ohne Netz: Soll und Ist sind ausgeschrieben, die
 * Erwartung auch (nie aus der geprüften Funktion abgeleitet).
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

type Inventory = { tables: Map<string, Set<string>>, touched: Map<string, Set<string>>, unresolved: string[] }
const inventory = (tables: Record<string, string[]>, extra: Partial<Inventory> = {}): Inventory => ({
  tables: new Map(Object.entries(tables).map(([table, columns]) => [table, new Set(columns)])),
  touched: extra.touched ?? new Map(),
  unresolved: extra.unresolved ?? [],
})

/** Drei Layer im Repo; die App nutzt nur `pages` (plus `system`). */
const INVENTORIES: Record<string, Inventory> = {
  system: inventory({ app_config: ['siteName', 'locale'] }),
  pages: inventory({ pages: ['slug', 'title', 'body'] }),
  tickets: inventory({ tickets: ['title', 'status'] }),
}
const LAYERS = allowedLayersOf(['system', 'tickets', 'pages'], { products: ['pages'] })
const SOLL = columnSoll(LAYERS.map(layer => ({ layer, inventory: INVENTORIES[layer]! })))

const ist = (tables: Record<string, string[] | null>) =>
  new Map(Object.entries(tables).map(([table, columns]) => [table, columns ? new Set(columns) : null]))

/** Das Ist, das zum Soll passt — Appwrites `$`-Felder stehen mit drin. */
const GOOD = {
  app_config: ['$id', '$createdAt', '$updatedAt', 'siteName', 'locale'],
  pages: ['$id', 'slug', 'title', 'body'],
}

describe('Spalten-Soll je App', () => {
  it('nimmt nur die Layer der App: system + pages, nicht tickets', () => {
    expect(LAYERS).toEqual(['system', 'pages'])
    expect([...SOLL.tables.keys()].sort()).toEqual(['app_config', 'pages'])
    expect([...SOLL.tables.get('pages')!.columns].sort()).toEqual(['body', 'slug', 'title'])
    expect(SOLL.skipped).toEqual([])
  })

  it('der gute Fall ist grün — die $-Felder zählen nicht', () => {
    const result = compareColumns(SOLL.tables, ist(GOOD))
    expect(result).toEqual({ missingTables: [], missingColumns: [], extraColumns: [], compared: 2 })
    const report = columnReport('account', SOLL, result, { ci: true })
    expect(report.fatal).toBe(0)
    expect(report.lines).toEqual(['✔  account    2 Tabellen spaltengleich mit dem Soll ihrer Layer'])
  })

  it('GEGENPROBE: eine fehlende Soll-Spalte macht rot und nennt Tabelle, Spalte, Layer', () => {
    const result = compareColumns(SOLL.tables, ist({ ...GOOD, pages: ['$id', 'slug', 'title'] }))
    expect(result.missingColumns).toEqual([{ table: 'pages', layer: 'pages', columns: ['body'] }])
    expect(result.extraColumns).toEqual([])
    const report = columnReport('account', SOLL, result, { ci: true })
    expect(report.fatal).toBe(1)
    expect(report.lines).toEqual(['✖  account    pages: SPALTE FEHLT body (Layer pages) — Migration des Layers nachholen'])
  })

  it('GEGENPROBE: eine zusätzliche Ist-Spalte macht rot', () => {
    const result = compareColumns(SOLL.tables, ist({ ...GOOD, app_config: [...GOOD.app_config, 'handAngelegt'] }))
    expect(result.extraColumns).toEqual([{ table: 'app_config', layer: 'system', columns: ['handAngelegt'] }])
    expect(result.missingColumns).toEqual([])
    const report = columnReport('account', SOLL, result, { ci: false })
    expect(report.fatal).toBe(1)
    // Am Mac (ohne --ci) mit Namen.
    expect(report.lines).toEqual(['✖  account    app_config: SPALTE OHNE SOLL handAngelegt (Layer system) — von Hand angelegt? Migration schreiben oder Spalte entfernen'])
  })

  it('mit --ci steht der Name einer zusätzlichen Spalte NICHT im Text, nur die Anzahl', () => {
    const result = compareColumns(SOLL.tables, ist({ ...GOOD, app_config: [...GOOD.app_config, 'nurAufProduction'] }))
    const text = columnReport('account', SOLL, result, { ci: true }).lines.join('\n')
    expect(text).not.toContain('nurAufProduction')
    expect(text).toBe('✖  account    app_config: SPALTE OHNE SOLL 1 Spalte(n) — Namen am Mac: pnpm ops:schema-parity (Layer system) — von Hand angelegt? Migration schreiben oder Spalte entfernen')
  })

  it('eine Tabelle eines Layers, den die App nicht nutzt, erzeugt keinen Befund', () => {
    // `tickets` steht in der Datenbank (eingefrorener Schatten), mit einer
    // Spalte zu wenig und einer zu viel — und wird gar nicht angesehen.
    const result = compareColumns(SOLL.tables, ist({ ...GOOD, tickets: ['$id', 'title', 'altlast'] }))
    expect(result).toEqual({ missingTables: [], missingColumns: [], extraColumns: [], compared: 2 })
    expect(columnReport('account', SOLL, result, { ci: true }).fatal).toBe(0)
  })

  it('eine Soll-Tabelle, die ganz fehlt, ist rot', () => {
    const result = compareColumns(SOLL.tables, ist({ app_config: GOOD.app_config, pages: null }))
    expect(result.missingTables).toEqual([{ table: 'pages', layer: 'pages' }])
    expect(columnReport('account', SOLL, result, { ci: true }).fatal).toBe(1)
  })

  it('ein Layer mit unlesbaren Migrationen wird ausgelassen und GENANNT, nicht still', () => {
    const soll = columnSoll([
      { layer: 'system', inventory: INVENTORIES.system! },
      { layer: 'pages', inventory: inventory({ pages: ['slug'] }, { unresolved: ['001-x.ts · Zeile ~3: createTextColumn an pages — Spaltenname nicht lesbar'] }) },
    ])
    expect([...soll.tables.keys()]).toEqual(['app_config'])
    // Die echte `pages`-Tabelle hat mehr Spalten — das ist KEIN Befund.
    const result = compareColumns(soll.tables, ist(GOOD))
    const report = columnReport('account', soll, result, { ci: true })
    expect(report.fatal).toBe(0)
    expect(report.lines).toContain('⚠  account    nicht verglichen: Layer pages — 1 Stelle(n) seiner Migrationen nicht lesbar — Soll wäre lückenhaft (pnpm check:manifests nennt sie)')
  })

  it('Spalten an der Tabelle eines anderen genutzten Layers zählen zum Soll; ohne Besitzer: genannt', () => {
    const soll = columnSoll([
      { layer: 'system', inventory: INVENTORIES.system! },
      { layer: 'pages', inventory: inventory({ pages: ['slug'] }, { touched: new Map([['app_config', new Set(['pagesEnabled'])], ['intro_requests', new Set(['note'])]]) }) },
    ])
    expect([...soll.tables.get('app_config')!.columns].sort()).toEqual(['locale', 'pagesEnabled', 'siteName'])
    expect(soll.skipped).toEqual([{ layer: 'pages', table: 'intro_requests', reason: 'legt Spalten an einer Tabelle an, die kein genutzter Layer anlegt — ohne deren übrige Spalten gäbe es nur Scheinbefunde' }])
  })
})

describe('Layer-Liste aus dem Runner', () => {
  it('liest LAYER_ORDER aus scripts/migrate.mjs — dieselbe Liste, die der Runner fährt', () => {
    const order = readLayerOrder(readFileSync(join(ROOT, 'scripts', 'migrate.mjs'), 'utf8'))
    expect(order[0]).toBe('system')
    expect(order).toContain('pages')
    expect(order).toContain('brand')
    expect(readLayerOrder('const ANDERS = []')).toEqual([])
  })
})
