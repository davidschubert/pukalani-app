import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Query } from 'node-appwrite'
import { GUIDELINES_SLUG, PAGES_TABLE, type PageRow } from '../shared/types/page'

/**
 * KK1 c — die Seiten-Routen lesen geblättert statt mit fester Obergrenze.
 *
 * Bis dahin: Verwaltungs-Liste `limit(500)`, Editor `limit(20)`, Löschen
 * `limit(50)`, öffentliche Einzel-Seite `limit(20)` — alles ohne Blättern.
 * Darüber fehlten Seiten ohne Hinweis, und das Löschen meldete „gelöscht",
 * während Fassungen stehen blieben.
 *
 * Geprüft wird die EINE Hilfe (`server/utils/pageRows.ts`), über die alle
 * vier Routen und die öffentliche Liste jetzt lesen, gegen eine nachgebaute
 * Tür, die `limit`, `cursorAfter` und `total` so beachtet wie Appwrite
 * (dasselbe Muster wie `public-pages-list.test.ts`). Die Routen selbst lädt
 * dieser Test bewusst NICHT: drei davon stehen im Rollen-Test-Bestand, und
 * ein Test, der sie lädt, gehört zu ihrem Rollen-Test (OPS-009).
 */

interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

function pagingDoor(initial: PageRow[], options: { removeDoesNothing?: boolean } = {}) {
  let rows = [...initial]
  const calls: ParsedQuery[][] = []
  let removes = 0
  const list = async <T>(_table: string, queries: string[] = []) => {
    const parsed = queries.map(raw => JSON.parse(raw) as ParsedQuery)
    calls.push(parsed)
    let found = rows.filter(row => parsed.every(q =>
      q.method !== 'equal' || !q.attribute || (q.values ?? []).includes((row as unknown as Record<string, unknown>)[q.attribute])))
    const total = found.length
    const cursor = parsed.find(q => q.method === 'cursorAfter')?.values?.[0]
    if (cursor !== undefined) found = found.slice(found.findIndex(r => r.$id === cursor) + 1)
    const limit = Number(parsed.find(q => q.method === 'limit')?.values?.[0] ?? 25)
    return { rows: found.slice(0, limit).map(r => ({ ...r })) as unknown as T[], total }
  }
  const remove = async (_table: string, rowId: string) => {
    removes += 1
    if (!options.removeDoesNothing) rows = rows.filter(r => r.$id !== rowId)
  }
  return {
    door: { list, remove },
    calls,
    removes: () => removes,
    rows: () => rows,
  }
}

let seq = 0
function row(slug: string, locale: string, title: string, sortOrder = 0, status: 'published' | 'draft' = 'published'): PageRow {
  seq += 1
  return {
    $id: `p-${String(seq).padStart(5, '0')}`, slug, locale, title, body: '', status, sortOrder,
  } as unknown as PageRow
}

let logged: Array<[string, string, Record<string, unknown>]> = []

async function load() {
  vi.resetModules()
  logged = []
  vi.stubGlobal('logEvent', (level: string, name: string, data: Record<string, unknown> = {}) => {
    logged.push([level, name, data])
  })
  return await import('../server/utils/pageRows')
}

beforeEach(() => {
  seq = 0
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const ADMIN = { logName: 'pages.admin_list_capped', scope: 'pool:t-1' }

/** 600 Seiten in zwei Sprachen = 1.200 Zeilen, Tabellen-Reihenfolge ≠ Sortierung. */
function sixHundredPages(): PageRow[] {
  const rows: PageRow[] = []
  for (let i = 0; i < 600; i++) {
    const order = (i * 37) % 600
    rows.push(row(`page-${order}`, 'en', `Page ${order}`, order))
    rows.push(row(`page-${order}`, 'de', `Seite ${order}`, order, 'draft'))
  }
  return rows
}

describe('Verwaltungs-Liste: alle Zeilen, im Speicher sortiert', () => {
  it('1.200 Zeilen (600 Seiten × 2 Sprachen) ⇒ alle 600 Seiten, sortiert, kein Netz', async () => {
    const { listPageRowsPaged, buildAdminPageGroups, ADMIN_PAGES_MAX, ADMIN_PAGES_PAGE_SIZE } = await load()
    const fake = pagingDoor(sixHundredPages())
    const { rows, capped } = await listPageRowsPaged<PageRow>(fake.door, PAGES_TABLE, [], {
      pageSize: ADMIN_PAGES_PAGE_SIZE, maxRows: ADMIN_PAGES_MAX, ...ADMIN,
    })
    expect(rows).toHaveLength(1_200)
    expect(capped).toBe(false)
    const groups = buildAdminPageGroups(rows, false)
    expect(groups).toHaveLength(600)
    expect(groups.map(g => g.sortOrder)).toEqual(Array.from({ length: 600 }, (_, i) => i))
    expect(groups.every(g => g.locales.length === 2)).toBe(true)
    expect(logged).toEqual([])
  })

  it('GEGENPROBE: der alte Deckel limit(500) sah bei denselben Daten nicht alle Seiten', async () => {
    const fake = pagingDoor(sixHundredPages())
    const old = await fake.door.list<PageRow>(PAGES_TABLE, [Query.orderAsc('sortOrder'), Query.limit(500)])
    expect(new Set(old.rows.map(r => r.slug)).size).toBeLessThan(600)
  })

  it('geblättert wird nach Kennung, nie mit Sortierung im Cursor, je Abfrage höchstens 100', async () => {
    const { listPageRowsPaged } = await load()
    const fake = pagingDoor(sixHundredPages())
    await listPageRowsPaged<PageRow>(fake.door, PAGES_TABLE, [], { pageSize: 100, maxRows: 2_000, ...ADMIN })
    // 1.200 Zeilen: 12 volle Seiten + eine leere Abschluss-Abfrage.
    expect(fake.calls).toHaveLength(13)
    expect(fake.calls.every(c => c.find(q => q.method === 'limit')?.values?.[0] === 100)).toBe(true)
    expect(fake.calls.some(c => c.some(q => q.method.startsWith('order')))).toBe(false)
    expect(fake.calls[0]!.some(q => q.method === 'cursorAfter')).toBe(false)
    expect(fake.calls[1]!.find(q => q.method === 'cursorAfter')?.values?.[0]).toBe('p-00100')
  })

  it('das Netz greift (2.100 Zeilen) ⇒ 2.000 Zeilen, capped, GENAU EINE Log-Zeile nur mit Zahlen', async () => {
    const { listPageRowsPaged, ADMIN_PAGES_MAX, ADMIN_PAGES_PAGE_SIZE } = await load()
    const rows: PageRow[] = []
    for (let i = 0; i < 2_100; i++) rows.push(row(`p-${i}`, 'en', `Geheimer Titel ${i}`, i))
    const fake = pagingDoor(rows)
    const result = await listPageRowsPaged<PageRow>(fake.door, PAGES_TABLE, [], {
      pageSize: ADMIN_PAGES_PAGE_SIZE, maxRows: ADMIN_PAGES_MAX, ...ADMIN,
    })
    expect(result.rows).toHaveLength(2_000)
    expect(result.capped).toBe(true)
    expect(logged).toHaveLength(1)
    expect(logged[0]![1]).toBe('pages.admin_list_capped')
    expect(logged[0]![2]).toEqual({ scope: 'pool:t-1', read: 2_000, total: 2_100 })
    expect(JSON.stringify(logged)).not.toContain('Geheimer Titel')
  })

  it('genau an der Grenze ohne weitere Zeilen ⇒ nicht capped, keine Log-Zeile', async () => {
    const { listPageRowsPaged } = await load()
    const rows: PageRow[] = []
    for (let i = 0; i < 2_000; i++) rows.push(row(`p-${i}`, 'en', `P ${i}`, i))
    const result = await listPageRowsPaged<PageRow>(pagingDoor(rows).door, PAGES_TABLE, [], { pageSize: 100, maxRows: 2_000, ...ADMIN })
    expect(result.rows).toHaveLength(2_000)
    expect(result.capped).toBe(false)
    expect(logged).toEqual([])
  })

  it('ein Netz, das kein Vielfaches der Seitengröße ist, wird nie überschritten', async () => {
    const { listPageRowsPaged } = await load()
    const rows: PageRow[] = []
    for (let i = 0; i < 400; i++) rows.push(row(`p-${i}`, 'en', `P ${i}`, i))
    const fake = pagingDoor(rows)
    const result = await listPageRowsPaged<PageRow>(fake.door, PAGES_TABLE, [], { pageSize: 100, maxRows: 250, ...ADMIN })
    expect(result.rows).toHaveLength(250)
    expect(result.capped).toBe(true)
    expect(fake.calls.map(c => c.find(q => q.method === 'limit')?.values?.[0])).toEqual([100, 100, 50])
  })

  it('der Regeln-Rückfall steht in der Liste, wenn es die Zeile nicht gibt — und nur dann', async () => {
    const { buildAdminPageGroups } = await load()
    const base = [row('home', 'en', 'Home', 0), row('imprint', 'de', 'Impressum', 90)]
    expect(buildAdminPageGroups(base, true).map(g => g.slug)).toContain(GUIDELINES_SLUG)
    expect(buildAdminPageGroups(base, false).map(g => g.slug)).not.toContain(GUIDELINES_SLUG)
    const withRow = [...base, row(GUIDELINES_SLUG, 'en', 'Our rules', 5, 'draft')]
    const groups = buildAdminPageGroups(withRow, true).filter(g => g.slug === GUIDELINES_SLUG)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.locales.map(l => l.title)).toEqual(['Our rules'])
  })

  it('gleicher sortOrder ⇒ nach slug; die kleinste Fassung bestimmt die Gruppe', async () => {
    const { buildAdminPageGroups } = await load()
    const groups = buildAdminPageGroups([
      row('zeta', 'en', 'Z', 1),
      row('alpha', 'en', 'A', 1),
      row('mid', 'en', 'M', 5),
      row('mid', 'de', 'M', 0),
    ], false)
    expect(groups.map(g => g.slug)).toEqual(['mid', 'alpha', 'zeta'])
  })
})

describe('Fassungen einer Seite (Editor, öffentliche Einzel-Seite)', () => {
  it('30 Fassungen ⇒ alle 30 (der alte Deckel limit(20) sah 20), fremde Seiten bleiben draußen', async () => {
    const { listPageRowsPaged, PAGE_VERSIONS_MAX, PAGE_VERSIONS_PAGE_SIZE } = await load()
    const rows: PageRow[] = []
    for (let i = 0; i < 30; i++) rows.push(row('about', `l${i}`, `About ${i}`))
    for (let i = 0; i < 10; i++) rows.push(row('other', `l${i}`, `Other ${i}`))
    const fake = pagingDoor(rows)
    const { rows: found, capped } = await listPageRowsPaged<PageRow>(fake.door, PAGES_TABLE, [Query.equal('slug', 'about')], {
      pageSize: PAGE_VERSIONS_PAGE_SIZE, maxRows: PAGE_VERSIONS_MAX, logName: 'pages.versions_capped', scope: 'pool:t-1',
    })
    expect(found).toHaveLength(30)
    expect(found.every(r => r.slug === 'about')).toBe(true)
    expect(capped).toBe(false)
    // Gegenprobe gegen den alten Deckel.
    const old = await fake.door.list<PageRow>(PAGES_TABLE, [Query.equal('slug', 'about'), Query.limit(20)])
    expect(old.rows).toHaveLength(20)
  })
})

describe('Löschen: alle Fassungen, oder ehrlich ein Rest', () => {
  it('250 Fassungen ⇒ alle weg, die Nachbar-Seite bleibt, deleted = 250, kein Rest', async () => {
    const { removePageVersions } = await load()
    const rows: PageRow[] = []
    for (let i = 0; i < 250; i++) rows.push(row('legal', `l${i}`, `Legal ${i}`))
    rows.push(row('home', 'en', 'Home'))
    const fake = pagingDoor(rows)
    const result = await removePageVersions(fake.door, 'legal', { logName: 'pages.delete_incomplete', scope: 'pool:t-1' })
    expect(result).toEqual({ deleted: 250, remaining: 0 })
    expect(fake.rows().map(r => r.slug)).toEqual(['home'])
    expect(logged).toEqual([])
  })

  it('GEGENPROBE: der alte Weg (eine Abfrage mit limit(50)) ließ 200 von 250 stehen', async () => {
    const rows: PageRow[] = []
    for (let i = 0; i < 250; i++) rows.push(row('legal', `l${i}`, `Legal ${i}`))
    const fake = pagingDoor(rows)
    const res = await fake.door.list<PageRow>(PAGES_TABLE, [Query.equal('slug', 'legal'), Query.limit(50)])
    await Promise.all(res.rows.map(r => fake.door.remove(PAGES_TABLE, r.$id)))
    expect(fake.rows()).toHaveLength(200)
  })

  it('der Deckel hält eine Schleife auf, deren Löschen nichts bewirkt — und meldet den Rest (eine Log-Zeile)', async () => {
    const { removePageVersions, PAGE_DELETE_MAX_ROUNDS } = await load()
    const rows = [row('stuck', 'en', 'Geheimer Titel'), row('stuck', 'de', 'Geheimer Titel')]
    const fake = pagingDoor(rows, { removeDoesNothing: true })
    const result = await removePageVersions(fake.door, 'stuck', { logName: 'pages.delete_incomplete', scope: 'pool:t-1' })
    expect(result.remaining).toBe(2)
    // Runden + die eine Nachfrage nach dem Rest.
    expect(fake.calls).toHaveLength(PAGE_DELETE_MAX_ROUNDS + 1)
    expect(logged).toHaveLength(1)
    expect(logged[0]![1]).toBe('pages.delete_incomplete')
    expect(logged[0]![2]).toMatchObject({ scope: 'pool:t-1', remaining: 2 })
    expect(JSON.stringify(logged)).not.toContain('Geheimer Titel')
  })

  it('jede Runde fragt von vorn (kein Cursor auf eine gelöschte Zeile)', async () => {
    const { removePageVersions, PAGE_DELETE_BATCH } = await load()
    const rows: PageRow[] = []
    // Zweieinhalb Runden: zwei volle, eine halbe, dann eine leere Abfrage.
    const count = Math.floor(PAGE_DELETE_BATCH * 2.5)
    for (let i = 0; i < count; i++) rows.push(row('legal', `l${i}`, `Legal ${i}`))
    const fake = pagingDoor(rows)
    await removePageVersions(fake.door, 'legal', { logName: 'pages.delete_incomplete', scope: 'pool:t-1' })
    expect(fake.calls.some(c => c.some(q => q.method === 'cursorAfter'))).toBe(false)
    expect(fake.calls).toHaveLength(4)
    expect(fake.rows()).toEqual([])
  })
})
