import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runInsightsCorrectionsSweep } from '../server/utils/insightsCorrectionsSweep'

/**
 * EIN LAUF, DER NICHT LESEN KONNTE, MELDET SEINEN TAKT NICHT ALS GUT
 * (Bahn 2, Q13-Stelle 7; Takt `corrections-sweep`).
 *
 * `defineTimedJob` zählt einen Takt als `failed`, wenn `run` wirft. Vorher
 * machte der Lauf aus JEDEM Lesefehler „nichts zu tun" und der Takt hieß `ok`.
 * Still bleibt nur das fehlende Schema (Layer einkompiliert, Migration nicht
 * gelaufen). Gegenprobe: eine leere Tabelle ist ein gewöhnlicher, guter Lauf.
 */

let listFailure: unknown = null
const listRows = vi.fn(async () => {
  if (listFailure) throw listFailure
  return { rows: [], total: 0 }
})

vi.stubGlobal('createAdminClient', () => ({ tablesDB: { listRows } }))
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('logEvent', vi.fn())
vi.spyOn(console, 'warn').mockImplementation(() => {})

function appwriteError(code: number, type: string) {
  return Object.assign(new Error('appwrite'), { name: 'AppwriteException', code, type })
}

beforeEach(() => {
  listFailure = null
  listRows.mockClear()
})

describe('Lesefehler im Lauf', () => {
  it('ein Ausfall der Datenbank wirft — der Takt zählt als gescheitert', async () => {
    listFailure = appwriteError(500, 'general_unknown')
    await expect(runInsightsCorrectionsSweep(new Date())).rejects.toMatchObject({ code: 500 })
  })

  it('fehlende Tabelle bleibt still (nichts zu tun)', async () => {
    listFailure = appwriteError(404, 'table_not_found')
    await expect(runInsightsCorrectionsSweep(new Date())).resolves.toBeDefined()
  })

  it('Gegenprobe: leere Tabelle ist ein guter Lauf', async () => {
    await expect(runInsightsCorrectionsSweep(new Date())).resolves.toBeDefined()
    expect(listRows).toHaveBeenCalled()
  })
})
