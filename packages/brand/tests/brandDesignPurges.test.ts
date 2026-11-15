import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { listAllRows, listAllRowsIfTableExists } from '../../core/server/utils/listAllRows'

/**
 * DIE LÖSCHZUSAGE DER BEIDEN BINÄR-TABELLEN (Audit-Befund 2026-09-09).
 *
 * `purgeBrandInspiration` und `purgeBrandMarkDrafts` sind die einzigen Stellen
 * dieses Layers, an denen der GDPR-Lauf DATEIEN entfernt. Bis zu diesem Befund
 * stand dort `…catch(() => {}); removed += 1`: jeder Fehler war geschluckt und
 * wurde trotzdem als „entfernt" gezählt — die Zusage bestätigte sich selbst,
 * und `deleteUserCompletely` hätte einen vollen Bucket als vollständige
 * Löschung abgeschlossen.
 *
 * Drei Aussagen, die kein Typ hält:
 *
 *  1. EIN 500 AUF DIE DATEI HÄLT DEN LAUF AN. Nicht die Zeile, nicht die
 *     Zählung — der ganze Lauf, damit `deleteUserCompletely` den Nutzer NICHT
 *     löscht und der Rest wiederholbar bleibt.
 *  2. EIN 404 IST KEIN FEHLER und zählt weiter mit: „entfernen, was nicht da
 *     ist" ist das Ziel und nicht sein Gegenteil.
 *  3. DER KLICK BLEIBT FAIL-SOFT. Dieselbe Löschreihenfolge, ein anderes
 *     Versprechen: wer „verwerfen" drückt, soll an einem zickenden Speicher
 *     nicht scheitern.
 */

interface FakeRow { $id: string, $createdAt: string, [key: string]: unknown }

let inspirationRows: FakeRow[]
let draftRows: FakeRow[]
/** Was `deleteFile` je Datei-Id tun soll — `undefined` = still gelingen. */
let fileErrors: Map<string, unknown>
let deletedFiles: string[]
let deletedRows: string[]
/** Was `listRows` je Tabelle werfen soll — `undefined` = normal lesen. */
let listErrors: Map<string, unknown>

/** Seitenweise wie Appwrite: `limit` und `cursorAfter` werden befolgt. */
function page(rows: FakeRow[], queries: string[] = []): FakeRow[] {
  const parsed = queries.map(q => JSON.parse(q) as { method: string, values: unknown[] })
  const limit = Number(parsed.find(q => q.method === 'limit')?.values[0] ?? 25)
  const cursor = parsed.find(q => q.method === 'cursorAfter')?.values[0]
  const start = cursor ? rows.findIndex(row => row.$id === cursor) + 1 : 0
  return rows.slice(start, start + limit)
}

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries?: string[] }) => {
    const error = listErrors.get(tableId)
    if (error) throw error
    const rows = tableId === 'brand_inspiration' ? inspirationRows : draftRows
    return { rows: page([...rows], queries), total: rows.length }
  }),
  deleteRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    const rows = tableId === 'brand_inspiration' ? inspirationRows : draftRows
    const at = rows.findIndex(row => row.$id === rowId)
    if (at < 0) throw new AppwriteException('Row not found', 404)
    rows.splice(at, 1)
    deletedRows.push(rowId)
  }),
}

const storage = {
  deleteFile: vi.fn(async ({ fileId }: { fileId: string }) => {
    const error = fileErrors.get(fileId)
    if (error) throw error
    deletedFiles.push(fileId)
  }),
}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB, storage }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: {} } }))
vi.stubGlobal('listAllRows', listAllRows)
vi.stubGlobal('listAllRowsIfTableExists', listAllRowsIfTableExists)

const { deleteBrandInspiration, purgeBrandInspiration } = await import(
  '../server/utils/brandInspirationStore'
)
const { deleteBrandMarkDraft, purgeBrandMarkDrafts } = await import(
  '../server/utils/brandMarkDrafts'
)

const event = { context: {} } as unknown as H3Event

function row(id: string, extra: Record<string, unknown> = {}): FakeRow {
  return { $id: id, $createdAt: '2026-09-08T10:00:00.000Z', profileId: 'p1', ...extra }
}

beforeEach(() => {
  inspirationRows = [row('f1', { number: 1, area: 'web' }), row('f2', { number: 2, area: 'web' })]
  draftRows = [row('d1', { title: 'Entwurf 1' }), row('d2', { title: 'Entwurf 2' })]
  fileErrors = new Map()
  deletedFiles = []
  deletedRows = []
  listErrors = new Map()
  tablesDB.deleteRow.mockClear()
  storage.deleteFile.mockClear()
})

describe('purgeBrandInspiration — die harte Löschung', () => {
  it('entfernt Zeile UND Datei und zählt, was wirklich weg ist', async () => {
    expect(await purgeBrandInspiration(event, 'p1')).toBe(2)
    expect(deletedRows).toEqual(['f1', 'f2'])
    expect(deletedFiles).toEqual(['f1', 'f2'])
  })

  it('ein 500 auf die DATEI hält den Lauf an — kein stiller Rest im Bucket', async () => {
    fileErrors.set('f2', new AppwriteException('Storage unavailable', 500))
    await expect(purgeBrandInspiration(event, 'p1')).rejects.toMatchObject({ statusCode: 503 })
    // Die erste Datei ist trotzdem weg: der Lauf bleibt wiederholbar, er meldet
    // sich nur nicht mehr als vollständig.
    expect(deletedFiles).toEqual(['f1'])
  })

  it('ein 404 auf die Datei zählt mit — „war schon weg" ist das Ziel', async () => {
    fileErrors.set('f1', new AppwriteException('File not found', 404))
    expect(await purgeBrandInspiration(event, 'p1')).toBe(2)
    expect(deletedFiles).toEqual(['f2'])
  })

  it('GEGENPROBE: der KLICK bleibt fail-soft — ein 500 auf die Datei wirft nicht', async () => {
    fileErrors.set('f1', new AppwriteException('Storage unavailable', 500))
    await expect(deleteBrandInspiration(event, 'p1', 'f1')).resolves.toBeUndefined()
    expect(deletedRows).toEqual(['f1'])
  })
})

describe('purgeBrandMarkDrafts — dieselbe Zusage, dieselbe Härte', () => {
  it('entfernt Zeile UND Datei und zählt, was wirklich weg ist', async () => {
    expect(await purgeBrandMarkDrafts(event, 'p1')).toBe(2)
    expect(deletedFiles).toEqual(['d1', 'd2'])
  })

  it('ein 500 auf die DATEI hält den Lauf an', async () => {
    fileErrors.set('d1', new AppwriteException('Storage unavailable', 500))
    await expect(purgeBrandMarkDrafts(event, 'p1')).rejects.toMatchObject({ statusCode: 503 })
    expect(deletedFiles).toEqual([])
  })

  it('ein 404 auf die Datei zählt mit', async () => {
    fileErrors.set('d2', new AppwriteException('File not found', 404))
    expect(await purgeBrandMarkDrafts(event, 'p1')).toBe(2)
    expect(deletedFiles).toEqual(['d1'])
  })

  it('GEGENPROBE: der KLICK („verwerfen") bleibt fail-soft', async () => {
    fileErrors.set('d1', new AppwriteException('Storage unavailable', 500))
    await expect(deleteBrandMarkDraft(event, 'p1', 'd1')).resolves.toBeUndefined()
    expect(deletedRows).toEqual(['d1'])
  })
})

/**
 * DIE LISTE DER LÖSCHUNG (SEC-026, Teil 2).
 *
 * Beide Purges lasen über die LISTE der Oberfläche: eine Seite mit
 * `Query.limit(50)` und `.catch(() => [])`. Ein Lesefehler hiess damit
 * „nichts zu löschen", und ab der 51. Zeile blieb der Rest im Bucket — beides
 * als vollständige Löschung gemeldet. Jetzt liest die Löschung ALLE Zeilen und
 * lässt einen Lesefehler durch; nur die fehlende Tabelle ist eine Null.
 */
describe('Purges — die Liste ist vollständig und streng', () => {
  const many = (prefix: string) => Array.from({ length: 120 }, (_, i) => row(`${prefix}${String(i).padStart(3, '0')}`))

  it('purgeBrandInspiration liest über die 50er-Seite hinaus', async () => {
    inspirationRows = many('f')
    expect(await purgeBrandInspiration(event, 'p1')).toBe(120)
    expect(inspirationRows).toEqual([])
  })

  it('purgeBrandMarkDrafts liest über die 50er-Seite hinaus', async () => {
    draftRows = many('d')
    expect(await purgeBrandMarkDrafts(event, 'p1')).toBe(120)
    expect(draftRows).toEqual([])
  })

  it('ein Lesefehler hält purgeBrandInspiration an — kein „nichts gefunden"', async () => {
    listErrors.set('brand_inspiration', new AppwriteException('Server Error', 500, 'general_unknown'))
    await expect(purgeBrandInspiration(event, 'p1')).rejects.toBeTruthy()
    expect(deletedRows).toEqual([])
  })

  it('ein Lesefehler hält purgeBrandMarkDrafts an', async () => {
    listErrors.set('brand_mark_drafts', new AppwriteException('Server Error', 500, 'general_unknown'))
    await expect(purgeBrandMarkDrafts(event, 'p1')).rejects.toBeTruthy()
    expect(deletedRows).toEqual([])
  })

  it('fehlende Tabelle (Migration offen) ⇒ eine Null, kein Abbruch', async () => {
    listErrors.set('brand_inspiration', new AppwriteException('Table not found', 404, 'table_not_found'))
    listErrors.set('brand_mark_drafts', new AppwriteException('Table not found', 404, 'table_not_found'))
    expect(await purgeBrandInspiration(event, 'p1')).toBe(0)
    expect(await purgeBrandMarkDrafts(event, 'p1')).toBe(0)
  })
})
