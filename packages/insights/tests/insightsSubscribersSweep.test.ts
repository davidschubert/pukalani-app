import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppwriteException } from 'node-appwrite'
import { INSIGHTS_SUBSCRIBERS_TABLE } from '../shared/insightsRows'
import {
  INSIGHTS_NEWSLETTER_PENDING_GRACE_DAYS,
  insightsNewsletterAnonymizedEmail,
} from '../shared/insightsNewsletter'
import { runInsightsSubscribersSweep } from '../server/utils/insightsSubscribersSweep'

/**
 * DER FRISTEN-SWEEP DER NEWSLETTER-LISTE (BI1 I5a).
 *
 * Geprüft wird, was man nicht klicken kann — zwei Regeln auf zwei Sorten
 * Zeilen, und jede mit ihrer Gegenprobe:
 *
 *  1. UNBESTÄTIGT und 30 Tage über die Frist ⇒ die ZEILE IST WEG.
 *  2. Eine frisch abgelaufene unbestätigte Zeile bleibt (Gegenprobe).
 *  3. ABGEMELDET und Frist erreicht ⇒ Adresse und `ipHash` sind LEER, und
 *     `retentionAt` geht MIT auf `null` (die Lehre aus I1: sonst füllt die
 *     geleerte Zeile jeden Stapel und die nächste wird nie erreicht).
 *  4. `emailLower` bekommt den PLATZHALTER und nicht '': die Spalte trägt den
 *     Unique-Index, zwei leere Werte wären ein 409 ab der zweiten Zeile.
 *  5. EINE BESTÄTIGTE, AKTIVE ZEILE WIRD NIE ANGEFASST — der wichtigste
 *     Nicht-Fall des ganzen Laufs.
 *  6. FEHLT DIE TABELLE, passiert nichts und es gibt keinen Fehler (eine
 *     Instanz ohne insights-006 kann den Layer trotzdem im Baum haben).
 */

interface FakeRow {
  $id: string
  $createdAt: string
  [key: string]: unknown
}

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-10-24T10:00:00.000Z')

let rows: FakeRow[]
let tableMissing: boolean
let updateBroken: boolean
let logs: { level: string, name: string, data: Record<string, unknown> }[]

const tablesDB = {
  listRows: vi.fn(async ({ queries }: { queries?: string[] }) => {
    if (tableMissing) throw new AppwriteException('Table not found', 404)
    // Die Abfragen des SDK sind JSON-Zeichenketten — sie werden ausgepackt
    // statt mit einer Zeichenketten-Suche geraten, sonst prüfte der Test seine
    // eigene Heuristik (Muster: insightsRadarSweep.test.ts).
    const parsed = (queries ?? []).map(query => JSON.parse(query) as {
      method: string
      attribute?: string
      values?: unknown[]
    })
    const equalConfirmed = parsed.find(query => query.method === 'equal' && query.attribute === 'confirmedAt')
    if (equalConfirmed) {
      const wanted = String(equalConfirmed.values?.[0] ?? '')
      const found = rows
        .filter(row => String(row.confirmedAt ?? '') === wanted)
        .sort((a, b) => a.$createdAt.localeCompare(b.$createdAt))
      return { rows: found, total: found.length }
    }
    const lessOrEqual = parsed.find(query => query.method === 'lessThanEqual')
    if (lessOrEqual) {
      const cutoff = String(lessOrEqual.values?.[0] ?? '')
      // Wie Appwrite: eine Zeile mit `null` fällt aus einem Vergleich HERAUS.
      // Genau das ist der Grund, warum der Sweep `retentionAt` nullt.
      const found = rows
        .filter(row => typeof row.retentionAt === 'string' && String(row.retentionAt) <= cutoff)
        .sort((a, b) => String(a.retentionAt).localeCompare(String(b.retentionAt)))
      return { rows: found, total: found.length }
    }
    return { rows: [], total: 0 }
  }),
  updateRow: vi.fn(async ({ rowId, data }: { rowId: string, data: Record<string, unknown> }) => {
    if (updateBroken) throw new AppwriteException('nope', 500)
    const row = rows.find(entry => entry.$id === rowId)
    if (!row) throw new AppwriteException('Row not found', 404)
    Object.assign(row, data)
    return row
  }),
  deleteRow: vi.fn(async ({ rowId }: { rowId: string }) => {
    const at = rows.findIndex(entry => entry.$id === rowId)
    if (at < 0) throw new AppwriteException('Row not found', 404)
    rows.splice(at, 1)
    return {}
  }),
}

function subscriber(overrides: Partial<FakeRow> & { $id: string }): FakeRow {
  return {
    $createdAt: '2026-01-01T00:00:00.000Z',
    emailLower: 'aloha@example.com',
    email: 'aloha@example.com',
    locale: 'de',
    tokenHash: '',
    tokenExpiresAt: '',
    confirmedAt: '',
    unsubscribedAt: '',
    source: 'list',
    ipHash: 'hash',
    retentionAt: null,
    ...overrides,
  }
}

function sweep() {
  return runInsightsSubscribersSweep(NOW, {
    tablesDB,
    databaseId: 'main',
    log: (level, name, data) => logs.push({ level, name, data }),
  })
}

beforeEach(() => {
  rows = []
  tableMissing = false
  updateBroken = false
  logs = []
  tablesDB.listRows.mockClear()
  tablesDB.updateRow.mockClear()
  tablesDB.deleteRow.mockClear()
})

describe('runInsightsSubscribersSweep — Regel 1 (unbestätigt)', () => {
  it('löscht die Zeile, deren Link mehr als 30 Tage her ist', async () => {
    rows = [subscriber({
      $id: 'p1',
      emailLower: 'alt@example.com',
      email: 'alt@example.com',
      tokenExpiresAt: new Date(NOW.getTime() - (INSIGHTS_NEWSLETTER_PENDING_GRACE_DAYS + 2) * DAY_MS).toISOString(),
    })]

    const result = await sweep()

    expect(result.deleted).toBe(1)
    expect(rows).toHaveLength(0)
    expect(tablesDB.deleteRow).toHaveBeenCalledWith({
      databaseId: 'main',
      tableId: INSIGHTS_SUBSCRIBERS_TABLE,
      rowId: 'p1',
    })
  })

  it('lässt eine frisch abgelaufene Zeile stehen (Gegenprobe)', async () => {
    rows = [subscriber({
      $id: 'p2',
      tokenExpiresAt: new Date(NOW.getTime() - 2 * DAY_MS).toISOString(),
    })]

    const result = await sweep()

    expect(result.checkedPending).toBe(1)
    expect(result.deleted).toBe(0)
    expect(rows).toHaveLength(1)
  })

  it('zählt einen Fehlschlag, statt den Lauf abzubrechen', async () => {
    rows = [
      subscriber({
        $id: 'weg',
        $createdAt: '2026-01-01T00:00:00.000Z',
        tokenExpiresAt: new Date(NOW.getTime() - 90 * DAY_MS).toISOString(),
      }),
      subscriber({
        $id: 'p3',
        $createdAt: '2026-01-02T00:00:00.000Z',
        emailLower: 'zwei@example.com',
        tokenExpiresAt: new Date(NOW.getTime() - 90 * DAY_MS).toISOString(),
      }),
    ]
    tablesDB.deleteRow.mockImplementationOnce(async () => {
      throw new AppwriteException('nope', 500)
    })

    const result = await sweep()

    expect(result.errors).toBe(1)
    expect(result.deleted).toBe(1)
    expect(logs.map(entry => entry.name)).toContain('insights.subscribers_sweep_failed')
    // Und im Log steht KEINE Adresse.
    expect(JSON.stringify(logs)).not.toContain('example.com')
  })
})

describe('runInsightsSubscribersSweep — Regel 2 (abgemeldet)', () => {
  it('leert Adresse und ipHash und nullt die Frist MIT', async () => {
    rows = [subscriber({
      $id: 'u1',
      confirmedAt: '2025-09-01T00:00:00.000Z',
      unsubscribedAt: '2025-10-01T00:00:00.000Z',
      retentionAt: '2026-10-01T00:00:00.000Z',
    })]

    const result = await sweep()

    expect(result.cleared).toBe(1)
    const row = rows[0]!
    expect(row.email).toBe('')
    expect(row.ipHash).toBe('')
    expect(row.retentionAt).toBeNull()
    // Der PLATZHALTER statt '' — sonst kollidierte der Unique-Index.
    expect(row.emailLower).toBe(insightsNewsletterAnonymizedEmail('u1'))
    // Der Nachweis bleibt: abgemeldet, und wann.
    expect(row.unsubscribedAt).toBe('2025-10-01T00:00:00.000Z')
  })

  it('findet die geleerte Zeile beim nächsten Lauf nicht mehr (die Lehre aus I1)', async () => {
    rows = [subscriber({
      $id: 'u2',
      confirmedAt: '2025-09-01T00:00:00.000Z',
      unsubscribedAt: '2025-10-01T00:00:00.000Z',
      retentionAt: '2026-10-01T00:00:00.000Z',
    })]

    await sweep()
    tablesDB.updateRow.mockClear()
    const second = await sweep()

    expect(second.checkedUnsubscribed).toBe(0)
    expect(second.cleared).toBe(0)
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
  })

  it('lässt eine laufende Frist in Ruhe (Gegenprobe)', async () => {
    rows = [subscriber({
      $id: 'u3',
      confirmedAt: '2026-09-01T00:00:00.000Z',
      unsubscribedAt: '2026-10-01T00:00:00.000Z',
      retentionAt: '2027-10-01T00:00:00.000Z',
    })]

    const result = await sweep()

    expect(result.cleared).toBe(0)
    expect(rows[0]!.email).toBe('aloha@example.com')
  })
})

describe('runInsightsSubscribersSweep — was er NIE anfasst', () => {
  it('lässt die bestätigte, aktive Zeile vollständig stehen', async () => {
    rows = [subscriber({
      $id: 'ok',
      confirmedAt: '2026-02-01T00:00:00.000Z',
      tokenExpiresAt: new Date(NOW.getTime() - 300 * DAY_MS).toISOString(),
    })]

    const result = await sweep()

    expect(result).toMatchObject({ deleted: 0, cleared: 0, errors: 0 })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.email).toBe('aloha@example.com')
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    expect(tablesDB.deleteRow).not.toHaveBeenCalled()
  })

  it('tut auf einer Instanz ohne die Tabelle nichts und wirft nicht', async () => {
    tableMissing = true

    const result = await sweep()

    expect(result).toEqual({
      checkedPending: 0,
      deleted: 0,
      checkedUnsubscribed: 0,
      cleared: 0,
      errors: 0,
    })
    expect(logs).toHaveLength(0)
  })
})
