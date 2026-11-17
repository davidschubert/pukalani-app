import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetRetentionJobsForTests } from '../../core/server/utils/rowRetention'
import { runTextDue } from '../shared/runTextRetention'
import {
  buildStaleRunClosure,
  decideStaleRun,
  runAbandoned,
  STALE_RUN_DAYS,
  STALE_RUN_ERROR,
  staleRunDue,
  staleRunLastActivity,
} from '../shared/staleRunRetention'
import type { RunEventRow, RunRow, RunStatus } from '../shared/types/runner'

/**
 * LÄUFE, DIE NIE BEENDET WURDEN (RU1 c, zweiter Teil).
 *
 * Geprüft wird, was an diesem Lauf schiefgehen kann: die Grenze der Frist auf
 * die Millisekunde, dass ein Endzustand (auch `needs_input`) nie angefasst
 * wird, dass ein lebender Lauf über sein jüngstes EREIGNIS als lebend gilt
 * (die Zeile selbst bewegt er nicht), dass `count` nichts schreibt und
 * dieselbe Zahl nennt, die `apply` beendet, dass der letzte Blick vor dem
 * Schreiben eine inzwischen bewegte Zeile stehen lässt, und dass ein
 * Fehlschlag zählt und die Zeile unverändert lässt.
 *
 * Echt laufen: Regel, die Schleife des Gerüsts, die Sperre und die Anbindung
 * (`runStaleRunRetention`, `appwriteStaleRunStore`). Nachgebildet: die zwei
 * Tabellen — so streng wie Appwrite (`cursorAfter` auf eine Zeile, die es
 * nicht gibt, WIRFT; die Abfrage-Filter wirken; ein Schreiben setzt
 * `$updatedAt`).
 */

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-17T12:00:00.000Z')
const iso = (ms: number): string => new Date(ms).toISOString()
const daysAgo = (days: number): string => iso(NOW.getTime() - days * DAY)

let seq = 0
function makeRun(overrides: Partial<RunRow> = {}): RunRow {
  seq++
  return {
    $id: `run-${String(seq).padStart(3, '0')}`,
    $sequence: seq,
    $tableId: 'runs',
    $databaseId: 'main',
    $createdAt: daysAgo(30),
    $updatedAt: daysAgo(20),
    $permissions: [],
    subjectType: 'ticket',
    subjectId: 'ticket-1',
    runnerId: 'runner-1',
    executor: 'claude-code',
    status: 'running',
    repoKey: 'maui-monorepo',
    baseBranch: 'main',
    workBranch: '',
    model: 'opus',
    permissionMode: 'acceptEdits',
    interactive: false,
    promptSource: 'Bitte den Login reparieren.',
    promptTrusted: true,
    testCommands: '',
    attachmentsJson: '',
    maxBudgetUsd: 5,
    sessionId: '',
    resumeSessionId: '',
    claimedAt: daysAgo(20),
    startedAt: daysAgo(20),
    finishedAt: null,
    resultJson: '',
    error: '',
    createdBy: 'u-operator',
    ...overrides,
  } as RunRow
}

// ── Die Regel ──────────────────────────────────────────────────────────────

describe('Regel: wann ist ein Lauf „nie beendet"?', () => {
  const quiet = (at: string) => ({ $createdAt: daysAgo(60), $updatedAt: at, claimedAt: null, startedAt: null })

  it('genau 7 Tage still ⇒ bleibt; 1 ms später ⇒ fällig', () => {
    const exact = iso(NOW.getTime() - STALE_RUN_DAYS * DAY)
    expect(staleRunDue(makeRun({ status: 'queued', ...quiet(exact) }), null, NOW)).toBe(false)
    const justOver = iso(NOW.getTime() - STALE_RUN_DAYS * DAY - 1)
    expect(staleRunDue(makeRun({ status: 'queued', ...quiet(justOver) }), null, NOW)).toBe(true)
  })

  it('jeder Endzustand bleibt — auch needs_input, egal wie alt', () => {
    const terminal: RunStatus[] = ['succeeded', 'needs_input', 'failed', 'cancelled']
    for (const status of terminal) {
      expect(staleRunDue(makeRun({ status, ...quiet(daysAgo(400)) }), null, NOW)).toBe(false)
    }
  })

  it('draft, queued, claimed und running sind fällig — Entwurf und hängender Lauf mit eigenem Grund', () => {
    expect(decideStaleRun(makeRun({ status: 'draft', ...quiet(daysAgo(8)) }), null, NOW)).toBe('stale-draft')
    for (const status of ['queued', 'claimed', 'running'] as const) {
      expect(decideStaleRun(makeRun({ status, ...quiet(daysAgo(8)) }), null, NOW)).toBe('stale-active')
    }
  })

  it('ein jüngeres EREIGNIS hält einen Lauf am Leben, auch wenn die Zeile alt ist', () => {
    const run = makeRun({ status: 'running', ...quiet(daysAgo(30)) })
    expect(staleRunDue(run, null, NOW)).toBe(true)
    expect(staleRunDue(run, daysAgo(1), NOW)).toBe(false)
    expect(staleRunDue(run, daysAgo(10), NOW)).toBe(true)
  })

  it('claimedAt und startedAt zählen als Lebenszeichen', () => {
    expect(staleRunDue(makeRun({ status: 'claimed', ...quiet(daysAgo(30)), claimedAt: daysAgo(2) }), null, NOW)).toBe(false)
    expect(staleRunDue(makeRun({ status: 'running', ...quiet(daysAgo(30)), startedAt: daysAgo(2) }), null, NOW)).toBe(false)
  })

  it('kein lesbares Lebenszeichen ⇒ bleibt; unlesbare Werte zählen nicht, ein lesbarer genügt', () => {
    expect(staleRunDue(makeRun({ status: 'queued', ...quiet('kaputt') }), null, NOW)).toBe(false)
    expect(staleRunLastActivity({ $updatedAt: 'kaputt', claimedAt: daysAgo(9), startedAt: null }, null)).toBe(daysAgo(9))
  })

  it('Gegenprobe: jünger als die Frist ANGELEGT ⇒ bleibt', () => {
    expect(staleRunDue(makeRun({ status: 'draft', $createdAt: daysAgo(3), $updatedAt: daysAgo(30), claimedAt: null, startedAt: null }), null, NOW)).toBe(false)
  })

  it('das Beenden ist dieselbe Wirkung wie der Abbrechen-Knopf, plus Grund', () => {
    const closure = buildStaleRunClosure(NOW.toISOString())
    expect(closure).toEqual({ status: 'cancelled', finishedAt: NOW.toISOString(), error: STALE_RUN_ERROR })
    expect(runAbandoned({ status: 'cancelled', error: STALE_RUN_ERROR })).toBe(true)
    expect(runAbandoned({ status: 'cancelled', error: '' })).toBe(false)
    expect(runAbandoned({ status: 'failed', error: STALE_RUN_ERROR })).toBe(false)
  })

  it('danach greift die Text-Frist von selbst (12 Monate nach dem neuen Ende)', () => {
    const run = makeRun({ status: 'draft', $createdAt: daysAgo(800), $updatedAt: daysAgo(800), claimedAt: null, startedAt: null })
    expect(runTextDue(run, NOW)).toBe(false)
    const closed = { ...run, ...buildStaleRunClosure(daysAgo(366)), $updatedAt: daysAgo(366) }
    expect(runTextDue(closed, NOW)).toBe(true)
  })
})

// ── Der ganze Lauf gegen nachgebildete Tabellen ────────────────────────────

interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

interface World {
  runs: RunRow[]
  events: RunEventRow[]
  writes: number
  /** runId ⇒ Fehler beim Schreiben */
  failUpdate: Map<string, unknown>
  /** runId ⇒ Fehler beim Nachschlagen des Ereignisses */
  failEvents: Set<string>
  /** Vor dem frischen Lesen einer Zeile anwenden (jemand handelt dazwischen). */
  beforeGet: Map<string, (row: RunRow) => RunRow>
}

let world: World
let clock = 0

function fakeTablesDB() {
  return {
    listRows: async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
      const parsed = queries.map(q => JSON.parse(q) as ParsedQuery)
      if (tableId === 'run_events') {
        const runId = String(parsed.find(q => q.method === 'equal' && q.attribute === 'runId')?.values?.[0])
        if (world.failEvents.has(runId)) throw Object.assign(new Error('read failed'), { code: 500 })
        const rows = world.events.filter(e => e.runId === runId).sort((a, b) => b.seq - a.seq)
        return { total: 0, rows: rows.slice(0, 1) }
      }
      expect(tableId).toBe('runs')
      let rows = [...world.runs]
      let limit = 25
      let after: string | null = null
      for (const q of parsed) {
        if (q.method === 'lessThan' && q.attribute === '$createdAt') {
          const before = Date.parse(String(q.values?.[0]))
          rows = rows.filter(row => Date.parse(row.$createdAt) < before)
        }
        else if (q.method === 'equal' && q.attribute === 'status') {
          rows = rows.filter(row => (q.values ?? []).includes(row.status))
        }
        else if (q.method === 'limit') limit = Number(q.values?.[0])
        else if (q.method === 'cursorAfter') after = String(q.values?.[0])
      }
      rows.sort((a, b) => a.$createdAt.localeCompare(b.$createdAt) || a.$id.localeCompare(b.$id))
      let start = 0
      if (after !== null) {
        // Appwrite liest den Cursor per Id — er muss existieren, nicht zum Filter passen.
        if (!world.runs.some(row => row.$id === after)) throw Object.assign(new Error('Cursor not found'), { code: 400 })
        const index = rows.findIndex(row => row.$id === after)
        start = index < 0 ? rows.findIndex(row => row.$id > after!) : index + 1
        if (start < 0) start = rows.length
      }
      return { total: 0, rows: rows.slice(start, start + limit).map(row => ({ ...row })) }
    },
    getRow: async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
      expect(tableId).toBe('runs')
      const index = world.runs.findIndex(row => row.$id === rowId)
      if (index < 0) throw Object.assign(new Error('not found'), { code: 404, type: 'row_not_found' })
      const change = world.beforeGet.get(rowId)
      if (change) world.runs[index] = change(world.runs[index]!)
      return { ...world.runs[index]! }
    },
    updateRow: async ({ rowId, data }: { rowId: string, data: Partial<RunRow> }) => {
      const failure = world.failUpdate.get(rowId)
      if (failure) throw failure
      const index = world.runs.findIndex(row => row.$id === rowId)
      if (index < 0) throw Object.assign(new Error('not found'), { code: 404, type: 'row_not_found' })
      world.writes++
      clock++
      world.runs[index] = { ...world.runs[index]!, ...data, $updatedAt: iso(NOW.getTime() + clock) }
    },
  }
}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB: fakeTablesDB() }))
vi.stubGlobal('useAppConfig', () => ({ pukalani: { runner: { staleRunRetention: 'count' } } }))

const { runStaleRunRetention, staleRunRetentionMode } = await import('../server/utils/staleRunRetention')

function event(runId: string, at: string, eventSeq = 1): RunEventRow {
  return { $id: `ev-${runId}-${eventSeq}`, $createdAt: at, $updatedAt: at, runId, seq: eventSeq, kind: 'status', message: 'x', at } as RunEventRow
}

function seed(runs: RunRow[], events: RunEventRow[] = []): void {
  world = { runs, events, writes: 0, failUpdate: new Map(), failEvents: new Set(), beforeGet: new Map() }
}

const snapshot = (): RunRow[] => world.runs.map(row => ({ ...row }))
const byId = (id: string): RunRow => world.runs.find(row => row.$id === id)!

beforeEach(() => {
  __resetRetentionJobsForTests()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('der Lauf (runStaleRunRetention)', () => {
  function mixedWorld() {
    const staleDraft = makeRun({ status: 'draft', $updatedAt: daysAgo(40), claimedAt: null, startedAt: null, attachmentsJson: '[{"fileId":"f1","name":"a.png","mimeType":"image/png","size":1}]' })
    const staleRunning = makeRun({ status: 'running' })
    const staleQueued = makeRun({ status: 'queued', claimedAt: null, startedAt: null })
    const aliveByEvent = makeRun({ status: 'running' })
    const freshQueued = makeRun({ status: 'queued', $createdAt: daysAgo(2), $updatedAt: daysAgo(2), claimedAt: null, startedAt: null })
    const question = makeRun({ status: 'needs_input', finishedAt: daysAgo(20), sessionId: 's-1' })
    const done = makeRun({ status: 'succeeded', finishedAt: daysAgo(20) })
    seed(
      [staleDraft, staleRunning, staleQueued, aliveByEvent, freshQueued, question, done],
      [event(staleRunning.$id, daysAgo(19)), event(aliveByEvent.$id, daysAgo(25), 1), event(aliveByEvent.$id, daysAgo(1), 2)],
    )
    return { staleDraft, staleRunning, staleQueued, aliveByEvent, freshQueued, question, done }
  }

  it('count schreibt nichts und nennt dieselbe Zahl, die apply beendet', async () => {
    mixedWorld()
    const before = snapshot()
    const counted = await runStaleRunRetention('count', { now: NOW })
    expect(counted).toMatchObject({ mode: 'count', expired: 3, deleted: 0, failed: 0, byReason: { 'stale-draft': 1, 'stale-active': 2 } })
    expect(world.writes).toBe(0)
    expect(world.runs).toEqual(before)

    const applied = await runStaleRunRetention('apply', { now: NOW })
    expect(applied).toMatchObject({ mode: 'apply', expired: 3, deleted: 3, failed: 0 })
    expect(world.writes).toBe(3)
  })

  it('nach apply: die drei hängenden sind abgebrochen mit Grund und Endzeit, alles andere unverändert', async () => {
    const runs = mixedWorld()
    const before = snapshot()
    await runStaleRunRetention('apply', { now: NOW })
    for (const id of [runs.staleDraft.$id, runs.staleRunning.$id, runs.staleQueued.$id]) {
      expect(byId(id)).toMatchObject({ status: 'cancelled', error: 'abandoned', finishedAt: NOW.toISOString() })
      // Text und Anhänge bleiben — die räumt die Text-Frist 12 Monate nach dem neuen Ende.
      expect(byId(id).promptSource).toBe(before.find(row => row.$id === id)!.promptSource)
      expect(byId(id).attachmentsJson).toBe(before.find(row => row.$id === id)!.attachmentsJson)
    }
    for (const id of [runs.aliveByEvent.$id, runs.freshQueued.$id, runs.question.$id, runs.done.$id]) {
      expect(byId(id)).toEqual(before.find(row => row.$id === id))
    }
  })

  it('ein zweiter Lauf direkt danach findet nichts', async () => {
    mixedWorld()
    await runStaleRunRetention('apply', { now: NOW })
    const writes = world.writes
    const again = await runStaleRunRetention('apply', { now: NOW })
    expect(again).toMatchObject({ expired: 0, deleted: 0, failed: 0 })
    expect(world.writes).toBe(writes)
  })

  it('letzter Blick: hat das Board inzwischen abgebrochen oder der Dienst geclaimt, bleibt die Zeile', async () => {
    const runs = mixedWorld()
    world.beforeGet.set(runs.staleQueued.$id, row => ({ ...row, status: 'claimed', claimedAt: NOW.toISOString(), $updatedAt: NOW.toISOString() }))
    world.beforeGet.set(runs.staleRunning.$id, row => ({ ...row, status: 'cancelled', finishedAt: NOW.toISOString(), $updatedAt: NOW.toISOString() }))
    const result = await runStaleRunRetention('apply', { now: NOW })
    expect(result).toMatchObject({ expired: 1, deleted: 1, failed: 0 })
    expect(byId(runs.staleQueued.$id).status).toBe('claimed')
    expect(byId(runs.staleRunning.$id)).toMatchObject({ status: 'cancelled', error: '' })
  })

  it('Schreiben scheitert ⇒ failed, Zeile unverändert, der Rest läuft weiter', async () => {
    const runs = mixedWorld()
    world.failUpdate.set(runs.staleRunning.$id, Object.assign(new Error('boom'), { code: 500 }))
    const before = byId(runs.staleRunning.$id)
    const result = await runStaleRunRetention('apply', { now: NOW })
    expect(result).toMatchObject({ expired: 3, deleted: 2, failed: 1 })
    expect(byId(runs.staleRunning.$id)).toEqual(before)
  })

  it('Ereignis nicht lesbar ⇒ failed, nicht „still" — die Zeile bleibt', async () => {
    const runs = mixedWorld()
    world.failEvents.add(runs.staleRunning.$id)
    const result = await runStaleRunRetention('apply', { now: NOW })
    expect(result).toMatchObject({ expired: 2, deleted: 2, failed: 1 })
    expect(byId(runs.staleRunning.$id).status).toBe('running')
  })

  it('ein 404 OHNE Art (Proxy) ist kein „gibt es nicht mehr" ⇒ failed', async () => {
    const runs = mixedWorld()
    world.failUpdate.set(runs.staleQueued.$id, Object.assign(new Error('proxy'), { code: 404 }))
    const result = await runStaleRunRetention('apply', { now: NOW })
    expect(result).toMatchObject({ deleted: 2, failed: 1 })
    expect(byId(runs.staleQueued.$id).status).toBe('queued')
  })

  it('blättert ohne Lücke: viele hängende Läufe bei kleiner Seite werden alle beendet', async () => {
    const runs = Array.from({ length: 23 }, () => makeRun({ status: 'queued', claimedAt: null, startedAt: null }))
    seed([...runs, makeRun({ status: 'succeeded', finishedAt: daysAgo(20) })])
    const result = await runStaleRunRetention('apply', { now: NOW, limits: { pageSize: 5 } })
    expect(result).toMatchObject({ expired: 23, deleted: 23, failed: 0, truncated: false })
    expect(world.runs.filter(row => row.status === 'queued')).toHaveLength(0)
  })

  it('der Schalter kommt aus pukalani.runner.staleRunRetention', () => {
    expect(staleRunRetentionMode()).toBe('count')
  })
})
