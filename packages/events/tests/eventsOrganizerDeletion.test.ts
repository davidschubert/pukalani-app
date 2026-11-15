import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { listAllRows, listAllRowsIfTableExists } from '../../core/server/utils/listAllRows'

/**
 * SEC-032 — „Termine einer gelöschten Person: absagen und Texte leeren"
 * (Davids Entscheidung 2026-11-15). Bis hierher bekam ein organisierter
 * Termin nur `status: 'cancelled'` und einen leeren Namen; Konto-Id, Titel,
 * Beschreibung, Ort, Adresse, Links, Übersetzungen und das Titelbild blieben.
 * Jetzt läuft dieselbe Schwärzung wie bei der Moderation
 * (`redactEventContent`), dazu fällt die Konto-Id.
 */

type Row = { $id: string, $createdAt: string, [key: string]: unknown }

let tables: Record<string, Row[]>
let fileError: unknown
const deletedFiles: string[] = []

const tablesDB = {
  listRows: vi.fn(async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
    const filters = queries
      .map(q => JSON.parse(q) as { method: string, attribute: string, values: unknown[] })
      .filter(q => q.method === 'equal')
    const rows = (tables[tableId] ?? []).filter(row => filters.every(f => f.values.includes(row[f.attribute])))
    return { total: rows.length, rows: rows.map(r => ({ ...r })) }
  }),
  deleteRow: vi.fn(async () => {}),
  updateRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    const row = (tables[tableId] ?? []).find(r => r.$id === rowId)!
    Object.assign(row, data)
    return { ...row }
  }),
  decrementRowColumn: vi.fn(async () => ({})),
}

const storage = {
  deleteFile: vi.fn(async ({ fileId }: { bucketId: string, fileId: string }) => {
    if (fileError) throw fileError
    deletedFiles.push(fileId)
  }),
}

const removeActivitiesForObject = vi.fn(async () => 0)

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB, storage }))
vi.stubGlobal('listAllRows', listAllRows)
vi.stubGlobal('listAllRowsIfTableExists', listAllRowsIfTableExists)
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('removeActivitiesForObject', removeActivitiesForObject)

const { eventsDeleteUserData, eventsExportUserData } = await import('../server/utils/eventsUserData')

const event = { context: {} } as unknown as H3Event

function organized(overrides: Record<string, unknown> = {}): Row {
  return {
    $id: 'e1',
    $createdAt: '2026-11-01T00:00:00.000Z',
    organizerId: 'u1',
    organizerName: 'Ada',
    status: 'published',
    title: 'Grillabend bei Ada',
    description: 'Bei mir im Garten',
    location: 'Adas Garten',
    address: 'Musterweg 1',
    locationNotes: 'Klingel links',
    url: 'https://ada.example/einladung',
    replayUrl: 'https://ada.example/replay',
    coverFileId: 'cover-1',
    translations: JSON.stringify({ en: { title: 'BBQ at Ada' } }),
    redactedAt: null,
    startAt: '2026-12-01T18:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  tables = { event_rsvps: [], event_votes: [], event_tickets: [], events: [organized(), organized({ $id: 'e2', organizerId: 'u2', title: 'Fremder Termin' })] }
  fileError = undefined
  deletedFiles.length = 0
  removeActivitiesForObject.mockClear()
})

describe('eventsDeleteUserData — organisierte Termine', () => {
  it('abgesagt, jeder Text leer, Konto-Id weg, Titelbild gelöscht, Feed geräumt', async () => {
    expect(await eventsDeleteUserData(event, 'u1')).toMatchObject({ anonymized: 1 })
    const stored = tables.events!.find(e => e.$id === 'e1')!
    expect(stored).toMatchObject({
      status: 'cancelled', organizerName: '', organizerId: '',
      title: '', description: '', location: null, address: null, locationNotes: null,
      url: null, replayUrl: null, coverFileId: null, translations: '',
    })
    expect(typeof stored.redactedAt).toBe('string')
    expect(deletedFiles).toEqual(['cover-1'])
    expect(removeActivitiesForObject).toHaveBeenCalledWith(event, { objectType: 'event', objectId: 'e1' })
    // Datum bleibt — die Zusagenden sollen sehen, WANN abgesagt wurde.
    expect(stored.startAt).toBe('2026-12-01T18:00:00.000Z')
  })

  it('Gegenprobe: der Termin eines anderen Menschen bleibt unberührt', async () => {
    await eventsDeleteUserData(event, 'u1')
    expect(tables.events!.find(e => e.$id === 'e2')).toMatchObject({ title: 'Fremder Termin', organizerId: 'u2', coverFileId: 'cover-1' })
  })

  it('zweiter Lauf findet nichts mehr', async () => {
    await eventsDeleteUserData(event, 'u1')
    expect(await eventsDeleteUserData(event, 'u1')).toMatchObject({ anonymized: 0 })
  })

  it('Titelbild schon weg (404) ⇒ Erfolg', async () => {
    fileError = new AppwriteException('File not found', 404, 'storage_file_not_found')
    await expect(eventsDeleteUserData(event, 'u1')).resolves.toMatchObject({ anonymized: 1 })
  })

  it('Titelbild lässt sich nicht löschen (500) ⇒ die Löschung bricht ab, die Zeile bleibt auffindbar', async () => {
    fileError = new AppwriteException('Server Error', 500, 'general_unknown')
    await expect(eventsDeleteUserData(event, 'u1')).rejects.toThrow()
    // Die Konto-Id steht noch da — ein zweiter Lauf findet den Termin wieder.
    expect(tables.events!.find(e => e.$id === 'e1')!.organizerId).toBe('u1')
  })
})

describe('eventsExportUserData — organisierte Termine vollständig', () => {
  it('enthält Adresse, Ortshinweise und beide Links', async () => {
    const result = await eventsExportUserData(event, 'u1')
    expect(result.organizedEvents[0]).toMatchObject({
      address: 'Musterweg 1', locationNotes: 'Klingel links',
      url: 'https://ada.example/einladung', replayUrl: 'https://ada.example/replay',
    })
  })
})
