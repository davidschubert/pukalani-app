import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { listAllRows, listAllRowsIfTableExists } from '../../core/server/utils/listAllRows'

/**
 * DAS LÖSCHEN EINES KONTOS ODER EINER MARKE ERREICHT AUCH DIE PRÜFERGEBNISSE
 * (SEC-015, Davids Entscheidung 2026-11-12/15).
 *
 * Drei Aussagen:
 *  1. `markBrandChecksErased` findet die Zeilen über `userId`, über
 *     `profileId` UND über den Dokument-Schlüssel `doc:<profileId>` — und
 *     verschiebt einen schon gesetzten Zeitpunkt NIE (die 90 Tage beginnen
 *     beim ERSTEN Löschen).
 *  2. Ein Lesefehler bricht ab, statt wie „keine Zeilen" auszusehen.
 *  3. Die Entscheidung nach Ablauf der Frist ist pur und als Tabelle prüfbar.
 */

interface FakeRow { $id: string, $createdAt: string, [key: string]: unknown }

let checks: FakeRow[]
let readBroken: boolean
let writeBroken: boolean

const tablesDB = {
  listRows: vi.fn(async ({ queries }: { tableId: string, queries: string[] }) => {
    if (readBroken) throw new AppwriteException('Server Error', 500, 'general_unknown')
    const filters = queries
      .map(q => JSON.parse(q) as { method: string, attribute: string, values: unknown[] })
      .filter(q => q.method === 'equal')
    const rows = checks.filter(row => filters.every(f => f.values.includes(row[f.attribute])))
    return { total: rows.length, rows }
  }),
  updateRow: vi.fn(async ({ rowId, data }: { rowId: string, data: Record<string, unknown> }) => {
    if (writeBroken) throw new AppwriteException('Server Error', 500, 'general_unknown')
    const row = checks.find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404, 'row_not_found')
    Object.assign(row, data)
    return row
  }),
}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('listAllRows', listAllRows)
vi.stubGlobal('listAllRowsIfTableExists', listAllRowsIfTableExists)

const {
  BRAND_CHECK_ERASURE_RETENTION_DAYS,
  brandCheckAnonymizedData,
  decideBrandCheckPurge,
  markBrandChecksErased,
} = await import('../server/utils/brandCheckErasure')

const event = { context: {} } as unknown as H3Event
const row = (id: string, extra: Record<string, unknown> = {}): FakeRow =>
  ({ $id: id, $createdAt: '2026-11-01T00:00:00.000Z', userId: '', profileId: '', urlKey: '', ...extra })

beforeEach(() => {
  checks = [
    row('mine-web', { userId: 'u1', urlKey: 'kailua.coffee' }),
    row('mine-market', { userId: 'u1', urlKey: 'rival.example' }),
    row('brand-web', { userId: '', profileId: 'p1', urlKey: 'kailua.coffee' }),
    row('brand-doc', { userId: '', profileId: '', urlKey: 'doc:p1', source: 'document' }),
    row('guest', { userId: '', urlKey: 'kailua.coffee' }),
    row('other', { userId: 'u2', profileId: 'p2', urlKey: 'doc:p2', source: 'document' }),
  ]
  readBroken = false
  writeBroken = false
  tablesDB.updateRow.mockClear()
})

describe('markBrandChecksErased', () => {
  it('über das Konto: nur die Zeilen mit dieser userId', async () => {
    const count = await markBrandChecksErased(event, { userId: 'u1' })
    expect(count).toBe(2)
    expect(checks.filter(c => c.erasedAt).map(c => c.$id).sort()).toEqual(['mine-market', 'mine-web'])
  })

  it('über die Marke: profileId UND der Dokument-Schlüssel', async () => {
    const count = await markBrandChecksErased(event, { profileId: 'p1' })
    expect(count).toBe(2)
    expect(checks.filter(c => c.erasedAt).map(c => c.$id).sort()).toEqual(['brand-doc', 'brand-web'])
  })

  it('GEGENPROBE: Gast-Checks derselben Adresse und fremde Zeilen bleiben unberührt', async () => {
    await markBrandChecksErased(event, { userId: 'u1', profileId: 'p1' })
    expect(checks.find(c => c.$id === 'guest')?.erasedAt).toBeUndefined()
    expect(checks.find(c => c.$id === 'other')?.erasedAt).toBeUndefined()
  })

  it('eine LEERE Kennung trifft nichts — sonst wären alle Gast-Checks „gelöscht"', async () => {
    expect(await markBrandChecksErased(event, { userId: '', profileId: '' })).toBe(0)
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('ein zweiter Lauf ändert nichts und verschiebt den Zeitpunkt nicht', async () => {
    await markBrandChecksErased(event, { userId: 'u1' })
    const first = checks.find(c => c.$id === 'mine-web')?.erasedAt
    tablesDB.updateRow.mockClear()

    expect(await markBrandChecksErased(event, { userId: 'u1' })).toBe(0)
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(checks.find(c => c.$id === 'mine-web')?.erasedAt).toBe(first)
  })

  it('ein Lesefehler bricht ab, statt „keine Zeilen" zu melden', async () => {
    readBroken = true
    await expect(markBrandChecksErased(event, { userId: 'u1' })).rejects.toThrow('Server Error')
  })

  it('ein Schreibfehler bricht ab', async () => {
    writeBroken = true
    await expect(markBrandChecksErased(event, { userId: 'u1' })).rejects.toThrow('Server Error')
  })
})

describe('decideBrandCheckPurge', () => {
  const now = new Date('2026-12-31T00:00:00.000Z')
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()

  it('die Frist ist 90 Tage', () => {
    expect(BRAND_CHECK_ERASURE_RETENTION_DAYS).toBe(90)
  })

  it.each([
    ['nicht gelöscht', { erasedAt: null, source: 'document' }, 'keep'],
    ['nicht gelöscht (Bestand ohne Spalte)', { source: 'website' }, 'keep'],
    ['89 Tage, Dokument', { erasedAt: daysAgo(89), source: 'document' }, 'keep'],
    ['89 Tage, Website', { erasedAt: daysAgo(89), source: 'website' }, 'keep'],
    ['90 Tage, Dokument', { erasedAt: daysAgo(90), source: 'document' }, 'delete'],
    ['90 Tage, Website', { erasedAt: daysAgo(90), source: 'website' }, 'anonymize'],
    ['90 Tage, ohne `source` (Bestand = Website)', { erasedAt: daysAgo(90) }, 'anonymize'],
    ['ausgeblendet + gelöscht, Website', { erasedAt: daysAgo(120), source: 'website', hidden: true }, 'anonymize'],
    ['ausgeblendet + gelöscht, Dokument', { erasedAt: daysAgo(120), source: 'document', hidden: true }, 'delete'],
    ['unlesbarer Zeitpunkt', { erasedAt: 'kein-datum', source: 'document' }, 'keep'],
  ] as const)('%s ⇒ %s', (_label, input, expected) => {
    expect(decideBrandCheckPurge(input, now)).toBe(expected)
  })

  it('anonymisiert heisst: wieder ein gewöhnlicher Gast-Check, `hidden` bleibt unberührt', () => {
    const data = brandCheckAnonymizedData()
    expect(data).toEqual({ userId: '', profileId: '', ipHash: '', rankingOptIn: false, erasedAt: null })
    expect(data).not.toHaveProperty('hidden')
  })
})
