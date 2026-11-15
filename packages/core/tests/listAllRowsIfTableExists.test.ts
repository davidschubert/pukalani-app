import { describe, expect, it } from 'vitest'
import { AppwriteException } from 'node-appwrite'
import type { TablesDB } from 'node-appwrite'
import { isAppwriteTableMissing, listAllRowsIfTableExists } from '../server/utils/listAllRows'

/**
 * EIN LESEFEHLER IST EIN FEHLER, KEIN „NICHTS GEFUNDEN" (SEC-026, Teil 2).
 *
 * Die GDPR-Contributors der Layer schrieben ihre Lesevorgänge als
 * `listAllRows(…).catch(() => [])`. Ein Netz-Wackler wurde damit zu „dieser
 * Mensch hat hier keine Zeilen", der Contributor meldete Erfolg, und
 * `deleteUserCompletely` löschte das Konto — die Zeilen blieben, und ein
 * zweiter Lauf war nicht mehr möglich (das Konto, über das man sie fände, war
 * weg). Der Export sah genauso vollständig aus, wie er es nicht war.
 *
 * Geduldet ist genau EIN Fall: die Tabelle gibt es auf dieser Instanz nicht
 * (die Migration des Layers lief dort noch nicht). Diese Tests halten die
 * Grenze fest — und vor allem die Gegenproben: ein 500, ein 404 einer
 * ANDEREN Art und ein gewöhnlicher Fehler kommen durch.
 */

function failingDb(error: unknown): TablesDB {
  return { listRows: async () => { throw error } } as unknown as TablesDB
}

function db(rows: { $id: string }[]): TablesDB {
  return { listRows: async () => ({ total: rows.length, rows }) } as unknown as TablesDB
}

describe('listAllRowsIfTableExists', () => {
  it('liefert die Zeilen wie listAllRows, wenn die Tabelle da ist', async () => {
    expect(await listAllRowsIfTableExists(db([{ $id: 'a' }, { $id: 'b' }]), 'db', 't', [])).toHaveLength(2)
  })

  it('fehlende Tabelle (404 table_not_found) ⇒ leere Liste', async () => {
    const error = new AppwriteException('Table with the requested ID could not be found.', 404, 'table_not_found')
    expect(await listAllRowsIfTableExists(failingDb(error), 'db', 't', [])).toEqual([])
  })

  it('der alte Name collection_not_found zählt genauso', async () => {
    const error = new AppwriteException('Collection not found', 404, 'collection_not_found')
    expect(await listAllRowsIfTableExists(failingDb(error), 'db', 't', [])).toEqual([])
  })

  it('GEGENPROBE: ein 404 OHNE Art schlägt durch (so antwortet der Proxy, wenn Appwrite fehlt)', async () => {
    const error = new AppwriteException('Not found', 404)
    await expect(listAllRowsIfTableExists(failingDb(error), 'db', 't', [])).rejects.toBe(error)
  })

  it('GEGENPROBE: ein 500 schlägt durch', async () => {
    const error = new AppwriteException('Server Error', 500, 'general_unknown')
    await expect(listAllRowsIfTableExists(failingDb(error), 'db', 't', [])).rejects.toBe(error)
  })

  it('GEGENPROBE: ein 404 einer ANDEREN Art (Datenbank fehlt) schlägt durch', async () => {
    const error = new AppwriteException('Database not found', 404, 'database_not_found')
    await expect(listAllRowsIfTableExists(failingDb(error), 'db', 't', [])).rejects.toBe(error)
  })

  it('GEGENPROBE: ein gewöhnlicher Fehler (Netz) schlägt durch', async () => {
    const error = new Error('fetch failed')
    await expect(listAllRowsIfTableExists(failingDb(error), 'db', 't', [])).rejects.toBe(error)
  })

  it('GEGENPROBE: ein 400 (Spalte fehlt) ist KEINE fehlende Tabelle', async () => {
    const error = new AppwriteException('Attribute not found in schema', 400, 'general_query_invalid')
    await expect(listAllRowsIfTableExists(failingDb(error), 'db', 't', [])).rejects.toBe(error)
  })
})

describe('isAppwriteTableMissing', () => {
  it('erkennt nur Appwrite-404 für die Tabelle', () => {
    expect(isAppwriteTableMissing(new AppwriteException('x', 404, 'table_not_found'))).toBe(true)
    expect(isAppwriteTableMissing(new AppwriteException('x', 404, 'row_not_found'))).toBe(false)
    expect(isAppwriteTableMissing(new AppwriteException('x', 503))).toBe(false)
    expect(isAppwriteTableMissing({ code: 404, type: 'table_not_found' })).toBe(false)
  })
})
