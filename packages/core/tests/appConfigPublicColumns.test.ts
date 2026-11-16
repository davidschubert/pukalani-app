import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { layerInventory, layersWithMigrations } from '../../../scripts/lib/migration-inventory.mjs'
import { APP_CONFIG_PUBLIC_COLUMNS } from '../shared/appConfigPublicColumns'

/**
 * BE-003 (GA1 P13): `app_config` trägt `read("any")` — jede Spalte ist für
 * jeden lesbar. Eine neue Spalte braucht deshalb eine ENTSCHEIDUNG: sie steht
 * mit Begründung in `APP_CONFIG_PUBLIC_COLUMNS`, oder sie gehört in eine
 * Tabelle ohne Rechte. Die Spalten kommen aus den Migrationen selbst.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const TABLE = 'app_config'

function appConfigColumns(): string[] {
  const columns = new Set<string>()
  for (const layer of layersWithMigrations(ROOT)) {
    const inventory = layerInventory(ROOT, layer)
    for (const source of [inventory.tables, inventory.touched]) {
      for (const column of source.get(TABLE) ?? []) columns.add(column)
    }
  }
  return [...columns].sort()
}

describe('app_config: jede Spalte ist öffentlich und steht auf der Liste', () => {
  const columns = appConfigColumns()

  it('der Leser findet die Tabelle überhaupt (sonst wäre der Wächter blind)', () => {
    expect(columns).toContain('registrationEnabled')
    expect(columns).toContain('maintenanceMode')
  })

  it('keine Spalte ohne Eintrag „darf öffentlich sein, weil …"', () => {
    const missing = columns.filter(column => !(column in APP_CONFIG_PUBLIC_COLUMNS))
    expect(missing, 'neue Spalte in app_config: mit Begründung in core/shared/appConfigPublicColumns.ts eintragen — oder in app_secrets/instance_secrets anlegen').toEqual([])
  })

  it('kein Eintrag für eine Spalte, die es nicht mehr gibt', () => {
    const stale = Object.keys(APP_CONFIG_PUBLIC_COLUMNS).filter(column => !columns.includes(column))
    expect(stale).toEqual([])
  })

  it('jeder Eintrag trägt einen Satz', () => {
    for (const [column, reason] of Object.entries(APP_CONFIG_PUBLIC_COLUMNS)) {
      expect(reason.trim().length, column).toBeGreaterThan(20)
    }
  })
})
