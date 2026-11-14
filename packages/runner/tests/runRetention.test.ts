import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunStatus } from '../shared/types/runner'
import { clearTranscriptReference, resolveRunRetentionMode, RESULT_JSON_MAX_LENGTH, transcriptExpired } from '../shared/runRetention'
import type { RetentionEvent, RetentionFile, RetentionPageArgs, RetentionRun, RunRetentionDeps, RunRetentionLimits } from '../server/utils/runRetention'

/**
 * DER AUFRÄUM-LAUF DES RUNNERS (BE-025): Protokolle nach 30 Tagen, Ereignisse
 * nach 90 Tagen — einzeln, gedeckelt, nie etwas eines laufenden Auftrags, nie
 * ein Anhang.
 *
 * Echt laufen: die ganze Logik (Auswahl, Blättern, Zählen). Nachgebildet: der
 * Speicher, und zwar so streng wie Appwrite — `cursorAfter` auf einen Eintrag,
 * den es nicht mehr gibt, WIRFT. Ein Blättern, das nach dem Löschen auf einen
 * gelöschten Eintrag zeigt, fiele hier also genauso auf wie in Produktion.
 */

const logs: Array<{ level: string, name: string, data: Record<string, unknown> }> = []
vi.stubGlobal('logEvent', (level: string, name: string, data: Record<string, unknown> = {}) => {
  logs.push({ level, name, data })
})

const { sweepRunRetention } = await import('../server/utils/runRetention')

const NOW = Date.parse('2026-11-14T12:00:00.000Z')
const daysAgo = (days: number): string => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString()

interface World {
  runs: Map<string, RetentionRun>
  files: RetentionFile[]
  events: RetentionEvent[]
  /** Ids, deren Löschen mit einem Nicht-404-Fehler scheitert. */
  failDelete?: Set<string>
}

function run(status: RunStatus, finishedDaysAgo: number | null, createdDaysAgo = 200, resultJson = '{"transcriptFileId":"x","costUsd":1.5}'): RetentionRun {
  return {
    status,
    finishedAt: finishedDaysAgo === null ? null : daysAgo(finishedDaysAgo),
    $createdAt: daysAgo(createdDaysAgo),
    resultJson,
  }
}

/** Seite wie Appwrite: Filter, älteste zuerst, `cursorAfter` muss existieren. */
function page<T extends { $id: string, $createdAt: string }>(items: T[], { createdBefore, after, limit }: RetentionPageArgs): T[] {
  const sorted = items
    .filter(item => Date.parse(item.$createdAt) < Date.parse(createdBefore))
    .sort((a, b) => a.$createdAt.localeCompare(b.$createdAt) || a.$id.localeCompare(b.$id))
  let start = 0
  if (after) {
    const index = sorted.findIndex(item => item.$id === after)
    if (index < 0) throw Object.assign(new Error('Cursor not found'), { code: 400 })
    start = index + 1
  }
  return sorted.slice(start, start + limit).map(item => ({ ...item }))
}

function build(world: World, limits: Partial<RunRetentionLimits> = {}) {
  const calls = { listFiles: 0, listEvents: 0, updates: new Map<string, string>() }
  const deps: RunRetentionDeps = {
    listFiles: async (args) => {
      calls.listFiles++
      return page(world.files, args)
    },
    deleteFile: async (fileId) => {
      if (world.failDelete?.has(fileId)) throw Object.assign(new Error('boom'), { code: 500 })
      const index = world.files.findIndex(file => file.$id === fileId)
      if (index < 0) throw Object.assign(new Error('not found'), { code: 404 })
      world.files.splice(index, 1)
    },
    getRun: async runId => world.runs.get(runId) ?? null,
    updateRunResult: async (runId, resultJson) => {
      calls.updates.set(runId, resultJson)
      const current = world.runs.get(runId)
      if (current) current.resultJson = resultJson
    },
    listEvents: async (args) => {
      calls.listEvents++
      return page(world.events, args)
    },
    deleteEvent: async (eventId) => {
      if (world.failDelete?.has(eventId)) throw Object.assign(new Error('boom'), { code: 500 })
      const index = world.events.findIndex(row => row.$id === eventId)
      if (index < 0) throw Object.assign(new Error('not found'), { code: 404 })
      world.events.splice(index, 1)
    },
    limits,
  }
  return { deps, calls }
}

const transcript = (runId: string, createdDaysAgo: number, name = `run-${runId}.jsonl`): RetentionFile =>
  ({ $id: runId, name, $createdAt: daysAgo(createdDaysAgo) })

const event = (id: string, runId: string, createdDaysAgo: number): RetentionEvent =>
  ({ $id: id, runId, $createdAt: daysAgo(createdDaysAgo) })

beforeEach(() => {
  logs.length = 0
})

describe('Protokolle (30 Tage nach Laufende)', () => {
  function world(): World {
    return {
      runs: new Map([
        ['old', run('succeeded', 40)],
        ['young', run('failed', 10)],
        ['running', run('running', null)],
        ['claimed', run('claimed', null)],
        ['queued', run('queued', null)],
        ['draft', run('draft', null)],
        ['badname', run('succeeded', 40)],
      ]),
      files: [
        transcript('old', 40),
        // Datei alt, Lauf aber erst vor 10 Tagen beendet.
        transcript('young', 35),
        transcript('running', 50),
        transcript('claimed', 50),
        transcript('queued', 50),
        transcript('draft', 50),
        // Anhang: zufällige Id, kein Lauf dazu.
        { $id: 'att-1', name: 'screenshot.png', $createdAt: daysAgo(60) },
        transcript('badname', 40, 'something-else.jsonl'),
        // Jünger als die Frist: taucht in der Liste gar nicht auf.
        transcript('fresh', 5),
      ],
      events: [],
    }
  }

  it('Probelauf zählt und löscht nichts', async () => {
    const w = world()
    const { deps, calls } = build(w)
    const result = await sweepRunRetention('dry-run', deps, NOW)
    expect(result.transcripts).toEqual({ candidates: 1, deleted: 0, skipped: 7, failed: 0 })
    expect(w.files).toHaveLength(9)
    expect(calls.updates.size).toBe(0)
    expect(result.truncated).toBe(false)
  })

  it('apply löscht genau das abgelaufene Protokoll und zieht den Bericht nach', async () => {
    const w = world()
    const { deps, calls } = build(w)
    const result = await sweepRunRetention('apply', deps, NOW)
    expect(result.transcripts).toEqual({ candidates: 1, deleted: 1, skipped: 7, failed: 0 })
    expect(w.files.map(file => file.$id).sort()).toEqual(['att-1', 'badname', 'claimed', 'draft', 'fresh', 'queued', 'running', 'young'])
    const updated = JSON.parse(calls.updates.get('old') ?? '{}') as Record<string, unknown>
    expect(updated).toEqual({ transcriptFileId: '', costUsd: 1.5, transcriptPurgedAt: new Date(NOW).toISOString() })
    expect(calls.updates.size).toBe(1)
  })

  it('ein zweiter Lauf direkt danach findet nichts mehr', async () => {
    const w = world()
    const { deps } = build(w)
    await sweepRunRetention('apply', deps, NOW)
    const second = await sweepRunRetention('apply', deps, NOW)
    expect(second.transcripts.candidates).toBe(0)
    expect(second.transcripts.deleted).toBe(0)
  })

  it('ein verwaistes Protokoll (Lauf gelöscht) läuft ab; ein Anhang ohne Lauf bleibt', async () => {
    const w: World = {
      runs: new Map(),
      files: [
        transcript('orphan', 40),
        // Anhang mit Protokoll-ähnlichem Namen: heisst nicht nach der EIGENEN Id.
        { $id: 'att-2', name: 'run-orphan.jsonl', $createdAt: daysAgo(60) },
        { $id: 'att-3', name: 'notes.log', $createdAt: daysAgo(60) },
      ],
      events: [],
    }
    const { deps, calls } = build(w)
    const dry = await sweepRunRetention('dry-run', deps, NOW)
    expect(dry.transcripts).toEqual({ candidates: 1, deleted: 0, skipped: 2, failed: 0 })
    expect(w.files).toHaveLength(3)

    const applied = await sweepRunRetention('apply', deps, NOW)
    expect(applied.transcripts).toEqual({ candidates: 1, deleted: 1, skipped: 2, failed: 0 })
    expect(w.files.map(file => file.$id).sort()).toEqual(['att-2', 'att-3'])
    // Kein Lauf ⇒ kein Bericht, der nachzuziehen wäre.
    expect(calls.updates.size).toBe(0)
  })

  it('ein kaputter Bericht bleibt unangetastet, die Datei ist trotzdem weg', async () => {
    const w: World = { runs: new Map([['r', run('cancelled', 40, 200, 'nicht json')]]), files: [transcript('r', 40)], events: [] }
    const { deps, calls } = build(w)
    const result = await sweepRunRetention('apply', deps, NOW)
    expect(result.transcripts.deleted).toBe(1)
    expect(calls.updates.size).toBe(0)
    expect(w.runs.get('r')?.resultJson).toBe('nicht json')
  })

  it('scheitert das Nachziehen, zählt die Löschung und es gibt eine Warnzeile ohne Ids', async () => {
    const w: World = { runs: new Map([['r', run('succeeded', 40)]]), files: [transcript('r', 40)], events: [] }
    const { deps } = build(w)
    deps.updateRunResult = async () => {
      throw new Error('row write failed')
    }
    const result = await sweepRunRetention('apply', deps, NOW)
    expect(result.transcripts).toEqual({ candidates: 1, deleted: 1, skipped: 0, failed: 0 })
    const warn = logs.find(line => line.name === 'runner.retention_reference_failed')
    expect(warn?.data).toEqual({ count: 1 })
  })

  it('ohne finishedAt zählt das Anlegedatum der Datei', async () => {
    const w: World = {
      runs: new Map([['a', run('cancelled', null)], ['b', run('cancelled', null)]]),
      files: [transcript('a', 31), transcript('b', 29)],
      events: [],
    }
    const { deps } = build(w)
    const result = await sweepRunRetention('apply', deps, NOW)
    expect(result.transcripts.deleted).toBe(1)
    expect(w.files.map(file => file.$id)).toEqual(['b'])
  })

  it('Deckel greift ⇒ truncated, der nächste Lauf macht weiter', async () => {
    const runs = new Map<string, RetentionRun>()
    const files: RetentionFile[] = []
    for (let i = 0; i < 7; i++) {
      runs.set(`r${i}`, run('succeeded', 40 + i))
      files.push(transcript(`r${i}`, 40 + i))
    }
    const w: World = { runs, files, events: [] }
    const { deps } = build(w, { pageSize: 2, maxTranscriptDeletes: 3 })
    const first = await sweepRunRetention('apply', deps, NOW)
    expect(first.transcripts.deleted).toBe(3)
    expect(first.truncated).toBe(true)
    expect(logs.at(-1)?.level).toBe('warn')
    const second = await sweepRunRetention('apply', deps, NOW)
    const third = await sweepRunRetention('apply', deps, NOW)
    expect(second.transcripts.deleted + third.transcripts.deleted).toBe(4)
    expect(w.files).toHaveLength(0)
    expect(third.truncated).toBe(false)
  })

  it('Deckel für betrachtete Dateien ⇒ truncated', async () => {
    const files: RetentionFile[] = []
    for (let i = 0; i < 10; i++) files.push({ $id: `att-${i}`, name: 'a.png', $createdAt: daysAgo(60 + i) })
    const { deps } = build({ runs: new Map(), files, events: [] }, { pageSize: 3, maxFilesConsidered: 5 })
    const result = await sweepRunRetention('dry-run', deps, NOW)
    expect(result.transcripts.skipped).toBe(5)
    expect(result.truncated).toBe(true)
  })

  it('ein Fehler beim Löschen zählt failed, der Lauf macht weiter', async () => {
    const w: World = {
      runs: new Map([['a', run('succeeded', 50)], ['b', run('succeeded', 45)], ['c', run('succeeded', 40)]]),
      files: [transcript('a', 50), transcript('b', 45), transcript('c', 40)],
      events: [],
      failDelete: new Set(['b']),
    }
    const { deps } = build(w, { pageSize: 2 })
    const result = await sweepRunRetention('apply', deps, NOW)
    expect(result.transcripts).toEqual({ candidates: 3, deleted: 2, skipped: 0, failed: 1 })
    expect(w.files.map(file => file.$id)).toEqual(['b'])
    expect(logs.at(-1)?.level).toBe('warn')
  })

  it('404 beim Löschen gilt als gelöscht', async () => {
    const w: World = { runs: new Map([['a', run('succeeded', 50)]]), files: [transcript('a', 50)], events: [] }
    const { deps } = build(w)
    const realDelete = deps.deleteFile
    deps.deleteFile = async (fileId) => {
      await realDelete(fileId)
      throw Object.assign(new Error('gone'), { code: 404 })
    }
    const result = await sweepRunRetention('apply', deps, NOW)
    expect(result.transcripts).toEqual({ candidates: 1, deleted: 1, skipped: 0, failed: 0 })
  })
})

describe('Ereignisse (90 Tage)', () => {
  function world(): World {
    return {
      runs: new Map([
        ['done', run('succeeded', 100)],
        ['active', run('running', null)],
      ]),
      files: [],
      events: [
        event('e1', 'done', 120),
        event('e2', 'done', 95),
        event('e3', 'active', 120),
        event('e4', 'gone', 130),
        // Jünger als 90 Tage — nie.
        event('e5', 'done', 80),
        event('e6', 'gone', 10),
      ],
    }
  }

  it('beendet und verwaist ⇒ weg; laufend und jung ⇒ bleibt', async () => {
    const w = world()
    const { deps } = build(w)
    const result = await sweepRunRetention('apply', deps, NOW)
    expect(result.events).toEqual({ candidates: 3, deleted: 3, skipped: 1, failed: 0 })
    expect(w.events.map(row => row.$id).sort()).toEqual(['e3', 'e5', 'e6'])
  })

  it('Probelauf zählt dieselbe Auswahl und löscht nichts', async () => {
    const w = world()
    const { deps } = build(w)
    const result = await sweepRunRetention('dry-run', deps, NOW)
    expect(result.events).toEqual({ candidates: 3, deleted: 0, skipped: 1, failed: 0 })
    expect(w.events).toHaveLength(6)
  })

  it('Status wird je Lauf nur einmal gefragt', async () => {
    const events: RetentionEvent[] = []
    for (let i = 0; i < 20; i++) events.push(event(`e${i}`, 'done', 100 + i))
    const w: World = { runs: new Map([['done', run('succeeded', 200)]]), files: [], events }
    const { deps } = build(w, { pageSize: 5 })
    const getRun = vi.fn(deps.getRun)
    deps.getRun = getRun
    await sweepRunRetention('apply', deps, NOW)
    expect(getRun).toHaveBeenCalledTimes(1)
    expect(w.events).toHaveLength(0)
  })

  it('übersprungene Zeilen schicken das Blättern nicht in eine Endlosschleife — und nichts wird übersprungen', async () => {
    // Abwechselnd laufend (bleibt) und beendet (geht), über mehrere Seiten.
    const runs = new Map<string, RetentionRun>([['done', run('succeeded', 200)], ['active', run('running', null)]])
    const events: RetentionEvent[] = []
    for (let i = 0; i < 25; i++) events.push(event(`e${String(i).padStart(2, '0')}`, i % 2 === 0 ? 'active' : 'done', 150 - i))
    const w: World = { runs, files: [], events }
    const { deps, calls } = build(w, { pageSize: 4 })
    const result = await sweepRunRetention('apply', deps, NOW)
    expect(result.events).toEqual({ candidates: 12, deleted: 12, skipped: 13, failed: 0 })
    expect(w.events.every(row => row.runId === 'active')).toBe(true)
    expect(calls.listEvents).toBeLessThan(15)
  })

  it('nur laufende alte Zeilen: das Blättern endet trotzdem', async () => {
    const events: RetentionEvent[] = []
    for (let i = 0; i < 30; i++) events.push(event(`e${i}`, 'active', 100 + i))
    const { deps, calls } = build({ runs: new Map([['active', run('running', null)]]), files: [], events }, { pageSize: 7 })
    const result = await sweepRunRetention('apply', deps, NOW)
    expect(result.events).toEqual({ candidates: 0, deleted: 0, skipped: 30, failed: 0 })
    expect(calls.listEvents).toBe(5)
  })

  it('Deckel ⇒ truncated', async () => {
    const events: RetentionEvent[] = []
    for (let i = 0; i < 10; i++) events.push(event(`e${i}`, 'done', 100 + i))
    const w: World = { runs: new Map([['done', run('succeeded', 200)]]), files: [], events }
    const { deps } = build(w, { pageSize: 3, maxEventDeletes: 4 })
    const result = await sweepRunRetention('apply', deps, NOW)
    expect(result.events.deleted).toBe(4)
    expect(result.truncated).toBe(true)
    expect(w.events).toHaveLength(6)
  })

  it('ein Löschfehler zählt failed, der Rest geht weiter', async () => {
    const w = world()
    w.failDelete = new Set(['e1'])
    const { deps } = build(w, { pageSize: 2 })
    const result = await sweepRunRetention('apply', deps, NOW)
    expect(result.events).toEqual({ candidates: 3, deleted: 2, skipped: 1, failed: 1 })
    expect(w.events.map(row => row.$id).sort()).toEqual(['e1', 'e3', 'e5', 'e6'])
  })

  it('ein zweiter Lauf direkt danach findet nichts mehr', async () => {
    const w = world()
    const { deps } = build(w)
    await sweepRunRetention('apply', deps, NOW)
    const second = await sweepRunRetention('apply', deps, NOW)
    expect(second.events.candidates).toBe(0)
    expect(second.events.deleted).toBe(0)
  })

  it('scheitert das Listen, endet nur dieser Teil — gezählt als failed', async () => {
    const w = world()
    w.files = [transcript('done', 100)]
    const { deps } = build(w)
    deps.listEvents = async () => {
      throw new Error('list failed')
    }
    const result = await sweepRunRetention('apply', deps, NOW)
    expect(result.events.failed).toBe(1)
    expect(result.transcripts.deleted).toBe(1)
  })
})

describe('Log-Zeile', () => {
  it('genau EINE Zusammenfassung mit Zahlen, ohne Ids', async () => {
    const w: World = { runs: new Map([['secret-run', run('succeeded', 100)]]), files: [transcript('secret-run', 100)], events: [event('secret-event', 'secret-run', 120)] }
    const { deps } = build(w)
    await sweepRunRetention('apply', deps, NOW)
    const summaries = logs.filter(line => line.name === 'runner.retention')
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.level).toBe('info')
    expect(JSON.stringify(logs)).not.toContain('secret')
    expect(summaries[0]?.data).toMatchObject({ mode: 'apply', transcriptsDeleted: 1, eventsDeleted: 1, truncated: false })
  })
})

describe('transcriptExpired', () => {
  const cutoff = daysAgo(30)
  it.each<[RunStatus, boolean]>([
    ['succeeded', true],
    ['failed', true],
    ['cancelled', true],
    ['needs_input', true],
    ['running', false],
    ['claimed', false],
    ['queued', false],
    ['draft', false],
  ])('Status %s ⇒ %s', (status, expected) => {
    expect(transcriptExpired(run(status, 40), daysAgo(40), cutoff)).toBe(expected)
  })

  it('unlesbare Zeitstempel ⇒ nicht löschen', () => {
    expect(transcriptExpired({ status: 'succeeded', finishedAt: 'kaputt', $createdAt: daysAgo(200) }, daysAgo(40), cutoff)).toBe(false)
  })

  it('jünger angelegter Lauf ⇒ nicht löschen, auch wenn finishedAt etwas anderes behauptet', () => {
    expect(transcriptExpired({ status: 'succeeded', finishedAt: daysAgo(40), $createdAt: daysAgo(5) }, daysAgo(40), cutoff)).toBe(false)
  })
})

describe('clearTranscriptReference', () => {
  const at = '2026-11-14T12:00:00.000Z'
  it('leert die Datei-Id und hinterlässt die Spur', () => {
    const out = clearTranscriptReference('{"transcriptFileId":"r1","commit":"abc"}', at)
    expect(JSON.parse(out ?? 'null')).toEqual({ transcriptFileId: '', commit: 'abc', transcriptPurgedAt: at })
  })

  it.each(['', 'nicht json', 'null', '[1,2]', '"text"', '42'])('kaputt oder kein Objekt (%j) ⇒ null', (input) => {
    expect(clearTranscriptReference(input, at)).toBeNull()
  })

  it('Überlänge ⇒ ohne transcriptPurgedAt', () => {
    const filler = 'x'.repeat(RESULT_JSON_MAX_LENGTH - 60)
    const input = JSON.stringify({ transcriptFileId: 'r1', note: filler })
    expect(input.length).toBeLessThanOrEqual(RESULT_JSON_MAX_LENGTH)
    const out = clearTranscriptReference(input, at)
    expect(out).not.toBeNull()
    expect(out!.length).toBeLessThanOrEqual(RESULT_JSON_MAX_LENGTH)
    expect(JSON.parse(out!)).toEqual({ transcriptFileId: '', note: filler })
  })
})

describe('resolveRunRetentionMode', () => {
  it.each<[unknown, string, boolean]>([
    [undefined, 'off', false],
    [null, 'off', false],
    ['', 'off', false],
    ['off', 'off', false],
    ['dry-run', 'dry-run', false],
    ['apply', 'apply', false],
    ['APPLY', 'off', true],
    ['yes', 'off', true],
    [true, 'off', true],
  ])('%j ⇒ %s (invalid: %s)', (value, mode, invalid) => {
    expect(resolveRunRetentionMode(value)).toEqual({ mode, invalid })
  })
})
