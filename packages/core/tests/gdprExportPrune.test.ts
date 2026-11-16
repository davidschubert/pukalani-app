import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppwriteException } from 'node-appwrite'

/**
 * DIE SICHERUNGSKOPIEN GELÖSCHTER KONTEN VERFALLEN NACH 30 TAGEN — VON SELBST
 * (SEC-009).
 *
 * Vorher räumte nur die NÄCHSTE Löschung oder ein Blick in die Admin-Liste
 * auf, und das nur in Appwrites Standard-Seite (25 Dateien, unsortiert),
 * Fehler beim Löschen verschluckt. Auf einer Instanz mit wenigen Löschungen
 * lag eine Kopie so beliebig lange. Davids Entscheidung: „Die
 * Sicherungskopien gelöschter Konten räumt ein stündlicher Lauf nach 30 Tagen
 * weg, nicht erst die nächste Löschung."
 *
 * Geprüft wird hier der Lauf selbst (ohne Request), der Riegel gegen einen
 * Doppelstart, seine Log-Zeilen — und am Quelltext, dass Plugin und Handroute
 * ihn wirklich aufrufen.
 */

const BUCKET = 'gdpr-exports'
const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-15T12:00:00.000Z')

interface FakeFile { $id: string, $createdAt: string }

let bucketId = BUCKET
let files: FakeFile[] = []
let failList = false
let failDelete: Record<string, number> = {}
let listGate: Promise<void> | null = null
const calls = { list: 0, delete: [] as string[], queries: [] as string[][] }
const logs: Array<{ level: string, name: string, fields: Record<string, unknown> }> = []

function parseQueries(queries: string[] = []) {
  let limit = 25
  let cursorAfter: string | undefined
  let orderAsc: string | undefined
  for (const raw of queries) {
    const q = JSON.parse(raw) as { method: string, attribute?: string, values?: unknown[] }
    if (q.method === 'limit') limit = Number(q.values?.[0])
    if (q.method === 'cursorAfter') cursorAfter = String(q.values?.[0])
    if (q.method === 'orderAsc') orderAsc = q.attribute
  }
  return { limit, cursorAfter, orderAsc }
}

const storage = {
  async listFiles({ bucketId: id, queries }: { bucketId: string, queries?: string[] }) {
    calls.list++
    calls.queries.push(queries ?? [])
    if (listGate) await listGate
    if (failList) throw new AppwriteException('boom', 500, 'general_unknown')
    if (id !== BUCKET) throw new AppwriteException('no bucket', 404, 'storage_bucket_not_found')
    const { limit, cursorAfter, orderAsc } = parseQueries(queries)
    // Ohne Sortierung liefert Appwrite in Einfüge-Reihenfolge — der Fake
    // legt die Dateien bewusst NICHT nach Alter sortiert an.
    const ordered = orderAsc === '$createdAt'
      ? [...files].sort((a, b) => Date.parse(a.$createdAt) - Date.parse(b.$createdAt) || a.$id.localeCompare(b.$id))
      : [...files]
    const start = cursorAfter ? ordered.findIndex(f => f.$id === cursorAfter) + 1 : 0
    return { total: files.length, files: ordered.slice(start, start + limit).map(f => ({ ...f })) }
  },
  async deleteFile({ bucketId: id, fileId }: { bucketId: string, fileId: string }) {
    calls.delete.push(fileId)
    if (id !== BUCKET) throw new AppwriteException('no bucket', 404, 'storage_bucket_not_found')
    const forced = failDelete[fileId]
    if (forced) throw new AppwriteException('forced', forced, forced === 404 ? 'storage_file_not_found' : 'general_unknown')
    const index = files.findIndex(f => f.$id === fileId)
    if (index === -1) throw new AppwriteException('gone', 404, 'storage_file_not_found')
    files.splice(index, 1)
    return {}
  },
}

vi.mock('../server/lib/appwrite', () => ({ createSessionClient: () => ({}) }))
vi.stubGlobal('createAdminClient', () => ({ storage }))
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteGdprBucket: bucketId } }))
vi.stubGlobal('logEvent', (level: string, name: string, fields: Record<string, unknown> = {}) => {
  logs.push({ level, name, fields })
})

const { pruneExpiredGdprExports, runGdprExportPrune, cleanupExpiredGdprExports } = await import('../server/utils/userDataOrchestration')

function fileAged(id: string, days: number): FakeFile {
  return { $id: id, $createdAt: new Date(NOW.getTime() - days * DAY).toISOString() }
}

beforeEach(() => {
  bucketId = BUCKET
  files = []
  failList = false
  failDelete = {}
  listGate = null
  calls.list = 0
  calls.delete.length = 0
  calls.queries.length = 0
  logs.length = 0
})

describe('pruneExpiredGdprExports — ohne Request, ohne Kontolöschung', () => {
  it('eine 31 Tage alte Kopie verschwindet, ohne dass ein Konto gelöscht wird', async () => {
    files = [fileAged('old', 31)]
    const result = await pruneExpiredGdprExports(undefined, { now: NOW })
    expect(result).toEqual({ scanned: 1, expired: 1, removed: 1, failed: 0 })
    expect(files).toEqual([])
  })

  it('liest ältestes zuerst, mit ausdrücklicher Seitengröße', async () => {
    files = [fileAged('a', 40)]
    await pruneExpiredGdprExports(undefined, { now: NOW })
    const first = calls.queries[0]!.map(q => JSON.parse(q) as { method: string, attribute?: string, values?: unknown[] })
    expect(first).toContainEqual(expect.objectContaining({ method: 'orderAsc', attribute: '$createdAt' }))
    expect(first).toContainEqual(expect.objectContaining({ method: 'limit', values: [100] }))
  })

  it('250 abgelaufene Kopien über mehrere Seiten — alle weg', async () => {
    files = Array.from({ length: 250 }, (_, i) => fileAged(`f${String(i).padStart(3, '0')}`, 31 + (i % 50)))
    const result = await pruneExpiredGdprExports(undefined, { now: NOW })
    expect(result.expired).toBe(250)
    expect(result.removed).toBe(250)
    expect(result.failed).toBe(0)
    expect(files).toEqual([])
  })

  it('Gegenprobe: eine frische Kopie beendet den Lauf und bleibt liegen', async () => {
    // Einfüge-Reihenfolge absichtlich gemischt: frisch zuerst.
    files = [fileAged('fresh', 29), fileAged('old', 45), fileAged('fresher', 1)]
    const result = await pruneExpiredGdprExports(undefined, { now: NOW })
    expect(result).toEqual({ scanned: 2, expired: 1, removed: 1, failed: 0 })
    expect(files.map(f => f.$id).sort()).toEqual(['fresh', 'fresher'])
    expect(calls.delete).toEqual(['old'])
  })

  it('genau an der Frist bleibt die Kopie (erst DANACH abgelaufen)', async () => {
    files = [fileAged('edge', 30)]
    const result = await pruneExpiredGdprExports(undefined, { now: NOW })
    expect(result.expired).toBe(0)
    expect(files).toHaveLength(1)
  })

  it('404 beim Löschen = schon weg = entfernt', async () => {
    files = [fileAged('a', 31), fileAged('b', 32)]
    failDelete = { a: 404 }
    const result = await pruneExpiredGdprExports(undefined, { now: NOW })
    expect(result).toEqual({ scanned: 2, expired: 2, removed: 2, failed: 0 })
  })

  it('500 beim Löschen wird GEZÄHLT, die übrigen werden trotzdem entfernt', async () => {
    files = [fileAged('a', 33), fileAged('b', 32), fileAged('c', 31)]
    failDelete = { b: 500 }
    const result = await pruneExpiredGdprExports(undefined, { now: NOW })
    expect(result).toEqual({ scanned: 3, expired: 3, removed: 2, failed: 1 })
    expect(files.map(f => f.$id)).toEqual(['b'])
  })

  it('gescheiterte Löschungen über Seitengrenzen: nichts doppelt gezählt, Rest weg', async () => {
    files = Array.from({ length: 250 }, (_, i) => fileAged(`f${String(i).padStart(3, '0')}`, 300 - i))
    failDelete = { f010: 500, f150: 500 }
    files.push(fileAged('fresh', 2))
    const result = await pruneExpiredGdprExports(undefined, { now: NOW })
    expect(result).toEqual({ scanned: 251, expired: 250, removed: 248, failed: 2 })
    expect(files.map(f => f.$id).sort()).toEqual(['f010', 'f150', 'fresh'])
  })

  it('dryRun löscht nichts und meldet nur, was abgelaufen ist', async () => {
    files = [fileAged('a', 31), fileAged('b', 40), fileAged('c', 2)]
    const result = await pruneExpiredGdprExports(undefined, { dryRun: true, now: NOW })
    expect(result).toEqual({ scanned: 3, expired: 2, removed: 0, failed: 0 })
    expect(calls.delete).toEqual([])
    expect(files).toHaveLength(3)
  })

  it('dryRun über mehrere Seiten zählt jede abgelaufene Kopie genau einmal', async () => {
    files = Array.from({ length: 230 }, (_, i) => fileAged(`f${String(i).padStart(3, '0')}`, 31))
    const result = await pruneExpiredGdprExports(undefined, { dryRun: true, now: NOW })
    expect(result.expired).toBe(230)
    expect(files).toHaveLength(230)
  })

  it('kein Bucket konfiguriert ⇒ nur Nullen, kein Aufruf', async () => {
    bucketId = ''
    files = [fileAged('a', 31)]
    const result = await pruneExpiredGdprExports(undefined, { now: NOW })
    expect(result).toEqual({ scanned: 0, expired: 0, removed: 0, failed: 0 })
    expect(calls.list).toBe(0)
  })

  it('scheiternde Liste wirft', async () => {
    failList = true
    files = [fileAged('a', 31)]
    await expect(pruneExpiredGdprExports(undefined, { now: NOW })).rejects.toThrow()
  })

  it('cleanupExpiredGdprExports bleibt als dünne Hülle (Anzahl entfernt)', async () => {
    files = [fileAged('a', 31), fileAged('b', 1)]
    const removed = await cleanupExpiredGdprExports({} as never)
    // Ohne `now` rechnet die Hülle mit der echten Uhr — beide Fake-Dateien
    // liegen relativ zu NOW, die Datei „a" ist auch heute älter als 30 Tage.
    expect(removed).toBeGreaterThanOrEqual(1)
  })
})

describe('runGdprExportPrune — Riegel und Log-Zeilen', () => {
  it('zweiter Aufruf während eines laufenden ⇒ null + busy-Zeile', async () => {
    files = [fileAged('a', 31)]
    let open!: () => void
    listGate = new Promise<void>((resolve) => { open = resolve })
    const first = runGdprExportPrune({ now: NOW })
    const second = await runGdprExportPrune({ now: NOW })
    expect(second).toBeNull()
    expect(logs).toContainEqual({ level: 'warn', name: 'gdpr.exports_prune_busy', fields: {} })
    open()
    const result = await first
    expect(result).toEqual({ scanned: 1, expired: 1, removed: 1, failed: 0 })
    // Nach dem Lauf ist der Riegel wieder offen.
    listGate = null
    expect(await runGdprExportPrune({ now: NOW })).not.toBeNull()
  })

  it('nichts abgelaufen ⇒ KEINE Zeile (ein stündliches „0" macht das Log unlesbar)', async () => {
    files = [fileAged('a', 1)]
    await runGdprExportPrune({ now: NOW })
    expect(logs).toEqual([])
  })

  it('etwas entfernt ⇒ eine info-Zeile mit den Zählern', async () => {
    files = [fileAged('a', 31)]
    await runGdprExportPrune({ now: NOW })
    expect(logs).toEqual([
      { level: 'info', name: 'gdpr.exports_pruned', fields: { scanned: 1, expired: 1, removed: 1, failed: 0 } },
    ])
  })

  it('failed > 0 ⇒ zusätzlich eine error-Zeile mit eigenem Namen', async () => {
    files = [fileAged('a', 31), fileAged('b', 32)]
    failDelete = { a: 500 }
    await runGdprExportPrune({ now: NOW })
    expect(logs.map(l => `${l.level}:${l.name}`)).toEqual(['info:gdpr.exports_pruned', 'error:gdpr.exports_prune_incomplete'])
    expect(logs[1]!.fields).toEqual({ scanned: 2, expired: 2, removed: 1, failed: 1 })
  })

  it('Lauf wirft ⇒ error-Zeile, Fehler geht an den Aufrufer, Riegel wieder offen', async () => {
    failList = true
    await expect(runGdprExportPrune({ now: NOW })).rejects.toThrow()
    expect(logs).toContainEqual({ level: 'error', name: 'gdpr.exports_prune_failed', fields: { message: 'boom' } })
    failList = false
    expect(await runGdprExportPrune({ now: NOW })).not.toBeNull()
  })
})

describe('Plugin (Quelltext)', () => {
  const source = readFileSync(fileURLToPath(new URL('../server/plugins/gdpr-export-prune.ts', import.meta.url)), 'utf8')

  // Seit OPS-011 meldet sich der Takt über `defineTimedJob` an (Timer und
  // unref liegen in der Hilfe, timedJob.test.ts); hier bleibt das Tor davor.
  it('ohne Bucket kein Timer — die Prüfung steht VOR der Anmeldung des Takts', () => {
    const guard = source.indexOf('appwriteGdprBucket')
    expect(guard).toBeGreaterThan(-1)
    expect(source.indexOf('defineTimedJob(')).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(source.indexOf('defineTimedJob('))
  })

  it('ruft den Lauf mit Riegel, stündlich, Timer gelöst', () => {
    expect(source).toContain('runGdprExportPrune(')
    expect(source).toContain('60 * 60 * 1000')
    expect(source).toContain('unref: true')
  })
})
