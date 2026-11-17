import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetRetentionJobsForTests } from '../../core/server/utils/rowRetention'
import {
  buildRunTextRedaction,
  decideRunTextRetention,
  redactRunResult,
  reportHasText,
  RUN_TEXT_RETENTION_DAYS,
  runTextDue,
  runTextRemovedAt,
} from '../shared/runTextRetention'
import { RESULT_JSON_MAX_LENGTH } from '../shared/runRetention'
import type { RunRow, RunStatus } from '../shared/types/runner'

/**
 * TEXTE UND ANHÄNGE ALTER LÄUFE NACH 12 MONATEN (RU1 c).
 *
 * Geprüft wird, was an einem Schwärz-Lauf schiefgehen kann und nicht
 * umkehrbar ist: die Grenze der Frist auf die Millisekunde, dass ein nicht
 * beendeter Lauf nie angefasst wird, dass `count` nichts schreibt und dieselbe
 * Zahl nennt wie `apply`, dass nach `apply` Text und Anhänge weg und die
 * Zahlen UNVERÄNDERT sind, und dass ein gescheitertes Datei-Löschen die Zeile
 * nicht halb geschwärzt zurücklässt.
 *
 * Echt laufen: Regel, Erlaubnisliste, die Schleife des Gerüsts, die Sperre und
 * die Anbindung (`runRunTextRetention`, `tableRetentionDeps`). Nachgebildet:
 * Tabelle und Bucket — die Tabelle so streng wie Appwrite (`cursorAfter` auf
 * eine Zeile, die es nicht gibt, WIRFT; die Abfrage-Filter wirken).
 */

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-17T12:00:00.000Z')
const iso = (ms: number): string => new Date(ms).toISOString()
const daysAgo = (days: number): string => iso(NOW.getTime() - days * DAY)

/** Ein Bericht mit ALLEN bekannten Feldern (tools/ai-runner/src/result.ts + Spuren). */
const FULL_REPORT = {
  branch: 'claude/fix-login',
  commit: '9f1c2ab3d4e5f60718293a4b5c6d7e8f90a1b2c3',
  diffstat: ' app/pages/login.vue | 12 +++++++-----\n 1 file changed, 7 insertions(+), 5 deletions(-)',
  tests: [
    { cmd: 'pnpm lint', exit: 0, tail: 'Alles sauber, keine Funde in packages/core' },
    { cmd: 'pnpm -r test', exit: 1, tail: 'FAIL tests/login.test.ts — erwartet Max Mustermann' },
  ],
  durationMs: 482_113,
  costUsd: 3.17,
  numTurns: 41,
  model: 'claude-opus-4-1',
  transcriptFileId: '',
  workBranch: 'worktree-agent-1a2b3c',
  permissionDenials: 2,
  transcriptPurgedAt: '2025-01-10T08:00:00.000Z',
}

let seq = 0
function makeRun(overrides: Partial<RunRow> = {}): RunRow {
  seq++
  return {
    $id: `run-${String(seq).padStart(3, '0')}`,
    $sequence: seq,
    $tableId: 'runs',
    $databaseId: 'main',
    $createdAt: daysAgo(500),
    $updatedAt: daysAgo(400),
    $permissions: [],
    subjectType: 'ticket',
    subjectId: 'ticket-1',
    runnerId: 'runner-1',
    executor: 'claude-code',
    status: 'succeeded',
    repoKey: 'maui-monorepo',
    baseBranch: 'main',
    workBranch: 'worktree-agent-1a2b3c',
    model: 'opus',
    permissionMode: 'acceptEdits',
    interactive: false,
    promptSource: 'Bitte den Login reparieren. Rückmeldung von Erika: „geht nicht".',
    promptTrusted: true,
    testCommands: '["pnpm lint","pnpm -r test"]',
    attachmentsJson: JSON.stringify([
      { fileId: `file-${seq}-a`, name: 'screenshot.png', mimeType: 'image/png', size: 1024 },
      { fileId: `file-${seq}-b`, name: 'log.txt', mimeType: 'text/plain', size: 64 },
    ]),
    maxBudgetUsd: 5,
    sessionId: '0c5a6d1e-2f3b-4c5d-8e9f-0a1b2c3d4e5f',
    resumeSessionId: '',
    claimedAt: daysAgo(400),
    startedAt: daysAgo(400),
    finishedAt: daysAgo(400),
    resultJson: JSON.stringify(FULL_REPORT),
    error: '',
    createdBy: 'u-operator',
    ...overrides,
  } as RunRow
}

// ── Die Regel ──────────────────────────────────────────────────────────────

describe('Regel: wann ist ein Lauf fällig?', () => {
  it('genau 365 Tage nach dem Ende ⇒ bleibt; 1 ms später ⇒ fällig', () => {
    const end = NOW.getTime() - RUN_TEXT_RETENTION_DAYS * DAY
    expect(runTextDue(makeRun({ finishedAt: iso(end) }), NOW)).toBe(false)
    expect(runTextDue(makeRun({ finishedAt: iso(end - 1) }), NOW)).toBe(true)
    expect(decideRunTextRetention(makeRun({ finishedAt: iso(end - 1) }), NOW)).toBe('text-expired')
  })

  it('jeder Endzustand ist fällig, jeder andere Zustand bleibt — egal wie alt', () => {
    for (const status of ['succeeded', 'needs_input', 'failed', 'cancelled'] as RunStatus[]) {
      expect(runTextDue(makeRun({ status }), NOW), status).toBe(true)
    }
    for (const status of ['draft', 'queued', 'claimed', 'running'] as RunStatus[]) {
      const ancient = makeRun({ status, $createdAt: daysAgo(3000), $updatedAt: daysAgo(3000), finishedAt: daysAgo(3000) })
      expect(runTextDue(ancient, NOW), status).toBe(false)
    }
  })

  it('ohne finishedAt zählt $updatedAt — jung geändert ⇒ bleibt, alt ⇒ fällig', () => {
    expect(runTextDue(makeRun({ finishedAt: null, $updatedAt: daysAgo(10) }), NOW)).toBe(false)
    expect(runTextDue(makeRun({ finishedAt: null, $updatedAt: daysAgo(366) }), NOW)).toBe(true)
  })

  it('unlesbares Datum ⇒ bleibt', () => {
    expect(runTextDue(makeRun({ finishedAt: 'gestern' }), NOW)).toBe(false)
    expect(runTextDue(makeRun({ $createdAt: 'kaputt' }), NOW)).toBe(false)
  })

  it('Gegenprobe: jünger als die Frist ANGELEGT ⇒ bleibt, auch wenn finishedAt etwas anderes behauptet', () => {
    expect(runTextDue(makeRun({ $createdAt: daysAgo(100), finishedAt: daysAgo(400) }), NOW)).toBe(false)
  })

  it('nichts mehr zu entfernen ⇒ bleibt (sonst zählte jeder Takt dieselben Zeilen)', () => {
    const redacted = makeRun({ ...buildRunTextRedaction(makeRun(), NOW.toISOString()) })
    expect(runTextDue(redacted, NOW)).toBe(false)
    // Je EIN Rest genügt, damit der Lauf fällig ist.
    expect(runTextDue({ ...redacted, promptSource: 'x' }, NOW)).toBe(true)
    expect(runTextDue({ ...redacted, error: 'kaputt' }, NOW)).toBe(true)
    expect(runTextDue({ ...redacted, attachmentsJson: '[{"fileId":"f"}]' }, NOW)).toBe(true)
    expect(runTextDue({ ...redacted, resultJson: '{"diffstat":"x"}' }, NOW)).toBe(true)
  })

  it('ein Lauf ohne Text, ohne Anhänge und mit leerem Bericht ist nie fällig', () => {
    expect(runTextDue(makeRun({ promptSource: '', attachmentsJson: '', resultJson: '', error: '' }), NOW)).toBe(false)
  })
})

// ── Die Erlaubnisliste des Berichts ────────────────────────────────────────

describe('Bericht schwärzen: Erlaubnisliste statt Verbotsliste', () => {
  const removedAt = NOW.toISOString()

  it('vorher — nachher an einem Bericht mit allen bekannten Feldern', () => {
    const after = JSON.parse(redactRunResult(JSON.stringify(FULL_REPORT), removedAt))
    expect(after).toEqual({
      branch: FULL_REPORT.branch,
      commit: FULL_REPORT.commit,
      tests: [{ cmd: 'pnpm lint', exit: 0 }, { cmd: 'pnpm -r test', exit: 1 }],
      durationMs: FULL_REPORT.durationMs,
      costUsd: FULL_REPORT.costUsd,
      numTurns: FULL_REPORT.numTurns,
      model: FULL_REPORT.model,
      transcriptFileId: '',
      workBranch: FULL_REPORT.workBranch,
      permissionDenials: FULL_REPORT.permissionDenials,
      transcriptPurgedAt: FULL_REPORT.transcriptPurgedAt,
      textRemovedAt: removedAt,
    })
    expect(after.diffstat).toBeUndefined()
  })

  it('ein später hinzugefügtes Feld fällt von selbst', () => {
    const after = JSON.parse(redactRunResult(JSON.stringify({ costUsd: 1, summary: 'Ich habe den Login repariert' }), removedAt))
    expect(after).toEqual({ costUsd: 1, textRemovedAt: removedAt })
  })

  it('Text in einem Kennungsfeld fällt; Zahlen müssen Zahlen sein', () => {
    const after = JSON.parse(redactRunResult(JSON.stringify({ commit: 'Bitte nicht committen, Erika', costUsd: '3 Dollar' }), removedAt))
    expect(after).toEqual({ textRemovedAt: removedAt })
  })

  it('ein unlesbarer Bericht (Rohtext) wird zu einem leeren Bericht mit Spur', () => {
    expect(reportHasText('{"commit":"abc","diffstat":"gekürz')).toBe(true)
    expect(JSON.parse(redactRunResult('{"commit":"abc","diffstat":"gekürz', removedAt))).toEqual({ textRemovedAt: removedAt })
    expect(JSON.parse(redactRunResult('', removedAt))).toEqual({ textRemovedAt: removedAt })
  })

  it('das Ergebnis trägt keinen Text mehr und ist stabil', () => {
    const once = redactRunResult(JSON.stringify(FULL_REPORT), removedAt)
    expect(reportHasText(once)).toBe(false)
    expect(redactRunResult(once, removedAt)).toBe(once)
    expect(runTextRemovedAt(once)).toBe(removedAt)
    expect(runTextRemovedAt(JSON.stringify(FULL_REPORT))).toBeNull()
  })

  it('die Spur des Protokoll-Aufräumers (transcriptFileId leer) ist kein Text', () => {
    expect(reportHasText(JSON.stringify({ costUsd: 1, transcriptFileId: '', transcriptPurgedAt: removedAt }))).toBe(false)
  })

  it('passt immer in die Spalte', () => {
    const huge = { costUsd: 1, tests: Array.from({ length: 400 }, (_, i) => ({ cmd: `pnpm test --filter paket-${i}`, exit: 0 })) }
    const out = redactRunResult(JSON.stringify(huge), removedAt)
    expect(out.length).toBeLessThanOrEqual(RESULT_JSON_MAX_LENGTH)
    expect(JSON.parse(out)).toEqual({ costUsd: 1, textRemovedAt: removedAt })
  })
})

// ── Der ganze Lauf gegen nachgebildete Tabelle und Bucket ──────────────────

interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

interface World {
  rows: RunRow[]
  files: Set<string>
  /** fileId ⇒ Fehler beim Löschen */
  failFile: Map<string, unknown>
  writes: number
}

let world: World

function fakeTablesDB() {
  return {
    listRows: async ({ tableId, queries }: { tableId: string, queries: string[] }) => {
      expect(tableId).toBe('runs')
      const parsed = queries.map(q => JSON.parse(q) as ParsedQuery)
      let rows = [...world.rows]
      let limit = 25
      let after: string | null = null
      for (const q of parsed) {
        if (q.method === 'lessThan' && q.attribute === '$createdAt') {
          const before = Date.parse(String(q.values?.[0]))
          rows = rows.filter(row => Date.parse(row.$createdAt) < before)
        }
        else if (q.method === 'limit') limit = Number(q.values?.[0])
        else if (q.method === 'cursorAfter') after = String(q.values?.[0])
      }
      rows.sort((a, b) => a.$createdAt.localeCompare(b.$createdAt) || a.$id.localeCompare(b.$id))
      let start = 0
      if (after !== null) {
        const index = rows.findIndex(row => row.$id === after)
        if (index < 0) throw Object.assign(new Error('Cursor not found'), { code: 400 })
        start = index + 1
      }
      return { total: 0, rows: rows.slice(start, start + limit).map(row => ({ ...row })) }
    },
    updateRow: async ({ rowId, data }: { rowId: string, data: Partial<RunRow> }) => {
      const index = world.rows.findIndex(row => row.$id === rowId)
      if (index < 0) throw Object.assign(new Error('not found'), { code: 404, type: 'row_not_found' })
      world.writes++
      world.rows[index] = { ...world.rows[index]!, ...data }
    },
  }
}

const fakeStorage = {
  deleteFile: async ({ bucketId, fileId }: { bucketId: string, fileId: string }) => {
    expect(bucketId).toBe('runner-files')
    const failure = world.failFile.get(fileId)
    if (failure) throw failure
    if (!world.files.has(fileId)) throw Object.assign(new Error('gone'), { code: 404, type: 'storage_file_not_found' })
    world.files.delete(fileId)
  },
}

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB: fakeTablesDB(), storage: fakeStorage }))
vi.stubGlobal('useAppConfig', () => ({ pukalani: { runner: { textRetention: 'count' } } }))

const { runRunTextRetention, runTextRetentionMode } = await import('../server/utils/runTextRetention')

function seed(rows: RunRow[]): void {
  world = { rows, files: new Set(), failFile: new Map(), writes: 0 }
  for (const row of rows) {
    for (const entry of JSON.parse(row.attachmentsJson || '[]') as Array<{ fileId: string }>) world.files.add(entry.fileId)
  }
}

const snapshot = (): RunRow[] => world.rows.map(row => ({ ...row }))

beforeEach(() => {
  __resetRetentionJobsForTests()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('der Lauf (runRunTextRetention)', () => {
  function mixedWorld() {
    const old1 = makeRun({ status: 'failed', error: 'Tests rot: erwartet Max Mustermann' })
    const old2 = makeRun({ status: 'needs_input', $createdAt: daysAgo(450) })
    const running = makeRun({ status: 'running', $createdAt: daysAgo(900), finishedAt: null, $updatedAt: daysAgo(900) })
    const fresh = makeRun({ $createdAt: daysAgo(20), $updatedAt: daysAgo(19), finishedAt: daysAgo(19) })
    const endedRecently = makeRun({ $createdAt: daysAgo(500), finishedAt: daysAgo(100) })
    seed([old1, old2, running, fresh, endedRecently])
    return { old1, old2, running, fresh, endedRecently }
  }

  it('count schreibt nichts und nennt dieselbe Zahl, die apply schwärzt', async () => {
    mixedWorld()
    const before = snapshot()
    const filesBefore = new Set(world.files)
    const counted = await runRunTextRetention('count', { now: NOW })
    expect(counted).toMatchObject({ mode: 'count', expired: 2, deleted: 0, failed: 0, byReason: { 'text-expired': 2 } })
    expect(world.writes).toBe(0)
    expect(snapshot()).toEqual(before)
    expect(world.files).toEqual(filesBefore)

    const applied = await runRunTextRetention('apply', { now: NOW })
    expect(applied).toMatchObject({ mode: 'apply', expired: 2, deleted: 2, failed: 0 })
  })

  it('nach apply sind Text und Anhänge weg, Kosten/Dauer/Commit unverändert', async () => {
    const { old1, old2 } = mixedWorld()
    await runRunTextRetention('apply', { now: NOW })
    for (const id of [old1.$id, old2.$id]) {
      const row = world.rows.find(entry => entry.$id === id)!
      expect(row.promptSource).toBe('')
      expect(row.attachmentsJson).toBe('')
      expect(row.error).toBe('')
      const report = JSON.parse(row.resultJson)
      expect(report.costUsd).toBe(FULL_REPORT.costUsd)
      expect(report.durationMs).toBe(FULL_REPORT.durationMs)
      expect(report.commit).toBe(FULL_REPORT.commit)
      expect(report.diffstat).toBeUndefined()
      expect(report.tests.every((test: Record<string, unknown>) => !('tail' in test))).toBe(true)
      expect(report.textRemovedAt).toBe(NOW.toISOString())
      // Was nicht Text ist, steht unverändert.
      const original = id === old1.$id ? old1 : old2
      for (const key of ['status', 'finishedAt', 'sessionId', 'workBranch', 'repoKey', 'model', 'maxBudgetUsd', 'testCommands', 'createdBy', 'subjectId'] as const) {
        expect(row[key], key).toEqual(original[key])
      }
    }
  })

  it('die Anhang-Dateien der fälligen Läufe sind weg, die übrigen liegen noch', async () => {
    const { old1, old2, running, fresh, endedRecently } = mixedWorld()
    const idsOf = (row: RunRow) => (JSON.parse(row.attachmentsJson) as Array<{ fileId: string }>).map(entry => entry.fileId)
    await runRunTextRetention('apply', { now: NOW })
    for (const fileId of [...idsOf(old1), ...idsOf(old2)]) expect(world.files.has(fileId), fileId).toBe(false)
    for (const fileId of [...idsOf(running), ...idsOf(fresh), ...idsOf(endedRecently)]) expect(world.files.has(fileId), fileId).toBe(true)
  })

  it('frischer, kürzlich beendeter und laufender Lauf bleiben vollständig', async () => {
    const { running, fresh, endedRecently } = mixedWorld()
    await runRunTextRetention('apply', { now: NOW })
    for (const original of [running, fresh, endedRecently]) {
      expect(world.rows.find(row => row.$id === original.$id)).toEqual(original)
    }
  })

  it('ein zweiter Lauf direkt danach findet nichts', async () => {
    mixedWorld()
    await runRunTextRetention('apply', { now: NOW })
    const writes = world.writes
    const again = await runRunTextRetention('apply', { now: NOW })
    expect(again).toMatchObject({ expired: 0, deleted: 0, failed: 0 })
    expect(world.writes).toBe(writes)
  })

  it('Datei-Löschen scheitert ⇒ Zeile unverändert, failed; der Rest läuft weiter, der nächste Takt holt nach', async () => {
    const { old1, old2 } = mixedWorld()
    const blocked = (JSON.parse(old1.attachmentsJson) as Array<{ fileId: string }>)[1]!.fileId
    world.failFile.set(blocked, Object.assign(new Error('Speicher weg'), { code: 500 }))

    const result = await runRunTextRetention('apply', { now: NOW })
    expect(result).toMatchObject({ expired: 2, deleted: 1, failed: 1 })
    expect(world.rows.find(row => row.$id === old1.$id)).toEqual(old1)
    expect(world.rows.find(row => row.$id === old2.$id)!.promptSource).toBe('')

    // Nächster Takt: die erste Datei ist schon weg (gilt als Erfolg), die zweite geht jetzt.
    world.failFile.clear()
    const retry = await runRunTextRetention('apply', { now: NOW })
    expect(retry).toMatchObject({ expired: 1, deleted: 1, failed: 0 })
    expect(world.rows.find(row => row.$id === old1.$id)!.promptSource).toBe('')
  })

  it('ein 404 OHNE Art (Proxy) ist kein „schon gelöscht" ⇒ failed, Zeile unverändert', async () => {
    const { old1 } = mixedWorld()
    const first = (JSON.parse(old1.attachmentsJson) as Array<{ fileId: string }>)[0]!.fileId
    world.failFile.set(first, Object.assign(new Error('Not Found'), { code: 404 }))
    const result = await runRunTextRetention('apply', { now: NOW })
    expect(result).toMatchObject({ deleted: 1, failed: 1 })
    expect(world.rows.find(row => row.$id === old1.$id)).toEqual(old1)
  })

  it('blättert ohne Lücke: viele fällige Läufe bei kleiner Seite werden alle geschwärzt', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => makeRun({ $createdAt: daysAgo(800 - i) }))
    rows.splice(3, 0, makeRun({ status: 'running', $createdAt: daysAgo(797), finishedAt: null, $updatedAt: daysAgo(797) }))
    seed(rows)
    const result = await runRunTextRetention('apply', { now: NOW, limits: { pageSize: 2 } })
    expect(result).toMatchObject({ deleted: 7, failed: 0, truncated: false })
    expect(world.rows.filter(row => row.status !== 'running').every(row => row.promptSource === '')).toBe(true)
    expect(world.rows.find(row => row.status === 'running')!.promptSource).not.toBe('')
  })

  it('der Schalter kommt aus pukalani.runner.textRetention', () => {
    expect(runTextRetentionMode()).toBe('count')
  })
})
