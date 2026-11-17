import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  olderThanDays,
  resolveRowRetentionMode,
  retentionCutoffIso,
  runRowRetention,
  type RowRetentionDeps,
} from '../shared/rowRetention'
import {
  __resetRetentionJobsForTests,
  isRetentionJobRunning,
  isRetentionRowGone,
  retentionModeOf,
  retentionTick,
  runRetentionJob,
  tableRetentionDeps,
} from '../server/utils/rowRetention'

/**
 * DAS GERÜST DER FRISTEN-LÄUFE (EL1 c, KE3, RU1 c).
 *
 * Geprüft wird, was an einem Lösch-Lauf schiefgehen kann und nicht umkehrbar
 * ist: dass `count` nichts schreibt und dieselbe Zahl nennt, die `apply`
 * löscht; dass beim Löschen keine Zeile übersprungen wird; dass ein Lesefehler
 * wirft statt „nichts zu tun" zu melden; dass ein Tippfehler im Schalter nie
 * „löschen" bedeutet.
 */

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-17T12:00:00.000Z')

interface Row { $id: string, $createdAt: string }

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY).toISOString()
}

/** Eine Tabelle im Speicher, die wie Appwrite hinter einem Cursor weiterliest. */
function fakeTable(initial: Row[]) {
  let rows = [...initial]
  const calls = { list: 0, removed: [] as string[] }
  const failRemove = new Map<string, unknown>()
  const deps: RowRetentionDeps<Row> = {
    listPage: async ({ after, limit }) => {
      calls.list++
      let start = 0
      if (after !== null) {
        const index = rows.findIndex(row => row.$id === after)
        if (index === -1) throw new Error(`cursor ${after} gibt es nicht mehr`)
        start = index + 1
      }
      return rows.slice(start, start + limit)
    },
    decide: (row, now) => (olderThanDays(row.$createdAt, 30, now) ? 'old' : null),
    remove: async (row) => {
      const failure = failRemove.get(row.$id)
      if (failure) throw failure
      rows = rows.filter(entry => entry.$id !== row.$id)
      calls.removed.push(row.$id)
    },
    isGone: isRetentionRowGone,
  }
  return { deps, calls, failRemove, ids: () => rows.map(row => row.$id) }
}

function mixedRows(count: number): Row[] {
  // Abwechselnd alt (40 Tage) und frisch (5 Tage) — so liegt Fälliges zwischen
  // Bleibendem, und ein Cursor-Fehler zeigt sich als übersprungene Zeile.
  return Array.from({ length: count }, (_, index) => ({
    $id: `r${String(index).padStart(3, '0')}`,
    $createdAt: daysAgo(index % 2 === 0 ? 40 : 5),
  }))
}

describe('Schalter', () => {
  it('kennt genau drei Stellungen; fehlend heisst aus und ist gültig', () => {
    expect(resolveRowRetentionMode('off')).toEqual({ mode: 'off', invalid: false })
    expect(resolveRowRetentionMode('count')).toEqual({ mode: 'count', invalid: false })
    expect(resolveRowRetentionMode('apply')).toEqual({ mode: 'apply', invalid: false })
    expect(resolveRowRetentionMode(undefined)).toEqual({ mode: 'off', invalid: false })
    expect(resolveRowRetentionMode(null)).toEqual({ mode: 'off', invalid: false })
  })

  it('ein Tippfehler heisst aus — nie löschen', () => {
    for (const value of ['Apply', 'APPLY', 'apply ', 'dry-run', 'on', true, 1, {}]) {
      expect(resolveRowRetentionMode(value)).toEqual({ mode: 'off', invalid: true })
    }
  })
})

describe('Alter', () => {
  it('fällig ist erst, was ÄLTER als die Frist ist', () => {
    expect(olderThanDays(daysAgo(31), 30, NOW)).toBe(true)
    expect(olderThanDays(new Date(NOW.getTime() - 30 * DAY - 1).toISOString(), 30, NOW)).toBe(true)
    expect(olderThanDays(daysAgo(30), 30, NOW)).toBe(false)
    expect(olderThanDays(daysAgo(29), 30, NOW)).toBe(false)
  })

  it('ein Zeitpunkt, der sich nicht lesen lässt, ist nie fällig', () => {
    expect(olderThanDays('', 30, NOW)).toBe(false)
    expect(olderThanDays(null, 30, NOW)).toBe(false)
    expect(olderThanDays(undefined, 30, NOW)).toBe(false)
    expect(olderThanDays('gestern', 30, NOW)).toBe(false)
  })

  it('rechnet den Stichtag für die Abfrage', () => {
    expect(retentionCutoffIso(NOW, 30)).toBe('2026-10-18T12:00:00.000Z')
  })
})

describe('Schleife', () => {
  it('count schreibt nichts und nennt die Zahl, die apply löscht', async () => {
    const counted = fakeTable(mixedRows(25))
    const count = await runRowRetention('count', counted.deps, { now: NOW, limits: { pageSize: 4 } })
    expect(counted.calls.removed).toEqual([])
    expect(counted.ids()).toHaveLength(25)
    expect(count).toMatchObject({ mode: 'count', considered: 25, expired: 13, deleted: 0, failed: 0, truncated: false })
    expect(count.byReason).toEqual({ old: 13 })

    const applied = fakeTable(mixedRows(25))
    const apply = await runRowRetention('apply', applied.deps, { now: NOW, limits: { pageSize: 4 } })
    expect(apply).toMatchObject({ mode: 'apply', considered: 25, expired: 13, deleted: 13, failed: 0, truncated: false })
    expect(apply.expired).toBe(count.expired)
  })

  it('apply überspringt nichts und lässt jede frische Zeile stehen', async () => {
    const table = fakeTable(mixedRows(25))
    await runRowRetention('apply', table.deps, { now: NOW, limits: { pageSize: 4 } })
    const expectedKept = mixedRows(25).filter((_, index) => index % 2 === 1).map(row => row.$id)
    expect(table.ids()).toEqual(expectedKept)
  })

  it('eine ganze Seite Fälliges: es wird mit demselben Cursor neu gelesen', async () => {
    const rows: Row[] = Array.from({ length: 10 }, (_, index) => ({ $id: `old${index}`, $createdAt: daysAgo(90) }))
    rows.push({ $id: 'fresh', $createdAt: daysAgo(1) })
    const table = fakeTable(rows)
    const result = await runRowRetention('apply', table.deps, { now: NOW, limits: { pageSize: 3 } })
    expect(result.deleted).toBe(10)
    expect(table.ids()).toEqual(['fresh'])
  })

  it('ein zweiter Lauf direkt danach findet nichts', async () => {
    const table = fakeTable(mixedRows(12))
    await runRowRetention('apply', table.deps, { now: NOW, limits: { pageSize: 5 } })
    const second = await runRowRetention('apply', table.deps, { now: NOW, limits: { pageSize: 5 } })
    expect(second).toMatchObject({ expired: 0, deleted: 0, failed: 0 })
  })

  it('ein Fehlschlag beim Löschen zählt, die Zeile bleibt, der Lauf macht weiter', async () => {
    const table = fakeTable(mixedRows(6))
    table.failRemove.set('r002', new Error('kaputt'))
    const result = await runRowRetention('apply', table.deps, { now: NOW, limits: { pageSize: 2 } })
    expect(result).toMatchObject({ expired: 3, deleted: 2, failed: 1 })
    expect(table.ids()).toContain('r002')
    expect(table.ids()).not.toContain('r000')
    expect(table.ids()).not.toContain('r004')
  })

  it('„gibt es nicht mehr" beim Löschen gilt als gelöscht — aber nur mit Appwrites Art', async () => {
    const gone = fakeTable(mixedRows(2))
    gone.failRemove.set('r000', { code: 404, type: 'row_not_found' })
    expect(await runRowRetention('apply', gone.deps, { now: NOW })).toMatchObject({ deleted: 1, failed: 0 })

    // Ein 404 ohne Art kommt vom Proxy vor Appwrite, wenn der Dienst fehlt.
    const proxy = fakeTable(mixedRows(2))
    proxy.failRemove.set('r000', { code: 404 })
    expect(await runRowRetention('apply', proxy.deps, { now: NOW })).toMatchObject({ deleted: 0, failed: 1 })
  })

  it('eine Regel, die wirft, löscht nichts', async () => {
    const table = fakeTable(mixedRows(4))
    const deps: RowRetentionDeps<Row> = {
      ...table.deps,
      decide: (row) => {
        if (row.$id === 'r000') throw new Error('Nachschlagen gescheitert')
        return 'old'
      },
    }
    const result = await runRowRetention('apply', deps, { now: NOW })
    expect(result).toMatchObject({ considered: 4, expired: 3, deleted: 3, failed: 1 })
    expect(table.ids()).toEqual(['r000'])
  })

  it('ein Lesefehler wirft', async () => {
    const deps: RowRetentionDeps<Row> = {
      listPage: async () => { throw new Error('500') },
      decide: () => 'old',
      remove: async () => {},
    }
    await expect(runRowRetention('apply', deps, { now: NOW })).rejects.toThrow('500')
  })

  it('die Deckel halten den Lauf endlich und melden es', async () => {
    const byDeletes = fakeTable(mixedRows(40))
    const first = await runRowRetention('apply', byDeletes.deps, { now: NOW, limits: { pageSize: 10, maxDeletes: 5 } })
    expect(first).toMatchObject({ deleted: 5, truncated: true })

    const byConsidered = fakeTable(mixedRows(40))
    const second = await runRowRetention('count', byConsidered.deps, { now: NOW, limits: { pageSize: 10, maxConsidered: 7 } })
    expect(second).toMatchObject({ considered: 7, truncated: true })
  })

  it('bricht ab statt zu kreisen, wenn die Liste den Cursor ignoriert', async () => {
    const page: Row[] = [{ $id: 'a', $createdAt: daysAgo(1) }, { $id: 'b', $createdAt: daysAgo(1) }]
    const deps: RowRetentionDeps<Row> = {
      listPage: async () => page,
      decide: () => null,
      remove: async () => {},
    }
    await expect(runRowRetention('count', deps, { now: NOW, limits: { pageSize: 2 } })).rejects.toThrow('Cursor')
  })
})

describe('Lauf mit Sperre und Log', () => {
  const lines: Array<{ level: string, event: string, job?: string } & Record<string, unknown>> = []

  beforeEach(() => {
    __resetRetentionJobsForTests()
    lines.length = 0
    const capture = (level: string) => (line: unknown) => {
      lines.push({ level, ...(JSON.parse(String(line)) as { event: string }) })
    }
    vi.spyOn(console, 'log').mockImplementation(capture('info'))
    vi.spyOn(console, 'warn').mockImplementation(capture('warn'))
    vi.spyOn(console, 'error').mockImplementation(capture('error'))
  })

  it('count meldet seine Zahlen immer, auch die Null — ohne Ids', async () => {
    const empty = fakeTable([])
    await runRetentionJob('probe', 'count', empty.deps, { now: NOW })
    const line = lines.find(entry => entry.event === 'retention.run')
    expect(line).toMatchObject({ level: 'info', job: 'probe', mode: 'count', expired: 0, deleted: 0 })
    expect(JSON.stringify(lines)).not.toContain('r000')
  })

  it('apply schweigt bei einem leeren Lauf und meldet, wenn etwas geschah', async () => {
    await runRetentionJob('probe', 'apply', fakeTable([]).deps, { now: NOW })
    expect(lines.filter(entry => entry.event === 'retention.run')).toHaveLength(0)

    await runRetentionJob('probe', 'apply', fakeTable(mixedRows(3)).deps, { now: NOW })
    expect(lines.find(entry => entry.event === 'retention.run')).toMatchObject({ job: 'probe', deleted: 2 })
  })

  it('gescheiterte Schritte stehen im Fehler-Log, und der Takt meldet failed', async () => {
    const table = fakeTable(mixedRows(3))
    table.failRemove.set('r000', new Error('kaputt'))
    const tick = retentionTick(() => runRetentionJob('probe', 'apply', table.deps, { now: NOW }))
    await expect(tick()).rejects.toThrow('unvollständig: 1')
    expect(lines.find(entry => entry.event === 'retention.incomplete')).toMatchObject({ level: 'error', job: 'probe', failed: 1 })
  })

  it('ein Lesefehler wird gemeldet und weitergeworfen; die Sperre fällt', async () => {
    const deps: RowRetentionDeps<Row> = {
      listPage: async () => { throw new Error('Appwrite antwortet nicht') },
      decide: () => 'old',
      remove: async () => {},
    }
    await expect(runRetentionJob('probe', 'apply', deps, { now: NOW })).rejects.toThrow('antwortet nicht')
    expect(lines.find(entry => entry.event === 'retention.failed')).toMatchObject({ level: 'error', job: 'probe' })
    expect(isRetentionJobRunning('probe')).toBe(false)
  })

  it('zwei Läufe derselben Kennung laufen nicht gleichzeitig; der Takt meldet skipped', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const slow: RowRetentionDeps<Row> = {
      listPage: async () => { await gate; return [] },
      decide: () => null,
      remove: async () => {},
    }
    const first = runRetentionJob('probe', 'count', slow, { now: NOW })
    expect(isRetentionJobRunning('probe')).toBe(true)
    const tick = retentionTick(() => runRetentionJob('probe', 'count', slow, { now: NOW }))
    expect(await tick()).toBe('skipped')
    // Eine ANDERE Kennung ist davon nicht betroffen.
    expect(await runRetentionJob('other', 'count', fakeTable([]).deps, { now: NOW })).not.toBeNull()
    release()
    expect(await first).not.toBeNull()
    expect(isRetentionJobRunning('probe')).toBe(false)
  })

  it('ein ungültiger Schalter heisst aus und wird einmal gemeldet', () => {
    expect(retentionModeOf('probe', 'aply')).toBe('off')
    expect(retentionModeOf('probe', 'aply')).toBe('off')
    expect(lines.filter(entry => entry.event === 'retention.invalid_mode')).toHaveLength(1)
    expect(retentionModeOf('probe', 'count')).toBe('count')
  })
})

describe('Anbindung an eine Tabelle', () => {
  it('fragt nur Zeilen vor dem Stichtag ab, älteste zuerst, hinter dem Cursor', async () => {
    const queries: string[][] = []
    const deleted: string[] = []
    const tablesDB = {
      listRows: async (params: { queries: string[] }) => {
        queries.push(params.queries)
        return { rows: [], total: 0 }
      },
      deleteRow: async (params: { rowId: string }) => { deleted.push(params.rowId) },
    }
    const deps = tableRetentionDeps<never>(tablesDB as never, 'db', 'tabelle', {
      createdBefore: '2026-10-18T12:00:00.000Z',
      decide: () => 'old',
    })
    await deps.listPage({ after: null, limit: 50 })
    await deps.listPage({ after: 'row-7', limit: 50 })
    await deps.remove({ $id: 'row-9' } as never)

    const first = queries[0]!.map(raw => JSON.parse(raw) as { method: string, attribute?: string, values?: unknown[] })
    expect(first.map(query => query.method)).toEqual(['lessThan', 'orderAsc', 'orderAsc', 'limit'])
    expect(first[0]).toMatchObject({ attribute: '$createdAt', values: ['2026-10-18T12:00:00.000Z'] })
    expect(first[3]).toMatchObject({ values: [50] })
    const second = queries[1]!.map(raw => JSON.parse(raw) as { method: string, values?: unknown[] })
    expect(second.at(-1)).toMatchObject({ method: 'cursorAfter', values: ['row-7'] })
    expect(deleted).toEqual(['row-9'])
  })
})
