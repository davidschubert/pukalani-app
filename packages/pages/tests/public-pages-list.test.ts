import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { createMicrocache } from '../../core/server/utils/microcache'
import { GUIDELINES_SLUG, type PageRow, type PublicPageNavItem } from '../shared/types/page'

/**
 * BE-019 — die öffentliche Seiten-Liste (`GET /api/pages/public`).
 *
 * (1) Die Sprache kommt aus der Anfrage. Sie war ein Schlüssel in einem
 * gewöhnlichen Objekt: `constructor`, `__proto__` oder `toString` trafen
 * geerbte Eigenschaften, und die Route gab eine Funktion statt einer Liste
 * zurück. Jede erfundene Sprache kostete außerdem eine eigene Abfrage und
 * einen eigenen Cache-Eintrag.
 *
 * (2) Die Liste las höchstens 50 Zeilen — eine Zeile je Seite UND Sprache.
 * Ab 26 Seiten in zwei Sprachen fehlten Seiten in Navigation und Fußzeile,
 * ohne Hinweis.
 *
 * Geprüft wird der ECHTE Handler gegen eine kleine nachgebaute Tür, die
 * `limit` und `cursorAfter` so beachtet wie Appwrite (der geteilte Prüfstand
 * `doorFake.ts` liest beide nicht).
 */

interface ParsedQuery { method: string, attribute?: string, values?: unknown[] }

function pagingDoor(rows: PageRow[]) {
  const calls: string[][] = []
  const list = async (_table: string, queries: string[] = []) => {
    calls.push(queries)
    const parsed = queries.map(raw => JSON.parse(raw) as ParsedQuery)
    let found = rows.filter(row => parsed.every(q =>
      q.method !== 'equal' || !q.attribute || (q.values ?? []).includes((row as unknown as Record<string, unknown>)[q.attribute])))
    for (const q of parsed) {
      if (q.method === 'orderAsc' && q.attribute) {
        const key = q.attribute as keyof PageRow
        found = [...found].sort((a, b) => Number(a[key]) - Number(b[key]))
      }
    }
    // `total` zählt wie bei Appwrite alle Treffer der Filter — Cursor und
    // Limit ändern ihn nicht.
    const total = found.length
    const cursor = parsed.find(q => q.method === 'cursorAfter')?.values?.[0]
    if (cursor !== undefined) found = found.slice(found.findIndex(r => r.$id === cursor) + 1)
    const limit = Number(parsed.find(q => q.method === 'limit')?.values?.[0] ?? 25)
    return { rows: found.slice(0, limit).map(r => ({ ...r })), total }
  }
  return { calls, tenantDb: () => ({ list }) }
}

let seq = 0
function row(slug: string, locale: string, title: string, sortOrder = 0): PageRow {
  seq += 1
  return {
    $id: `p-${String(seq).padStart(5, '0')}`, slug, locale, title, body: '', status: 'published', sortOrder,
  } as unknown as PageRow
}

let scope = 0
let logged: Array<[string, string, Record<string, unknown>]> = []
let fallbackAsks = 0

async function setup(rows: PageRow[], options: { guidelinesFallback?: boolean } = {}) {
  vi.resetModules()
  const door = pagingDoor(rows)
  const tenantScope = `pool:t-${++scope}`
  fallbackAsks = 0
  logged = []
  let query: Record<string, unknown> = {}
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('createMicrocache', createMicrocache)
  vi.stubGlobal('tenantCacheScope', () => tenantScope)
  vi.stubGlobal('useTenant', () => ({ mode: 'pool', tenantId: tenantScope }))
  vi.stubGlobal('assertCommunityContentReadable', () => {})
  vi.stubGlobal('getQuery', () => query)
  vi.stubGlobal('tenantDb', door.tenantDb)
  vi.stubGlobal('toH3Error', (e: unknown) => e)
  vi.stubGlobal('logEvent', (level: string, name: string, data: Record<string, unknown> = {}) => {
    logged.push([level, name, data])
  })
  vi.stubGlobal('guidelinesFallbackApplies', async () => {
    fallbackAsks += 1
    return options.guidelinesFallback === true
  })
  // Die Cache-Hilfen sind in Nitro Auto-Imports — hier die echten Funktionen.
  const cacheModule = await import('../server/utils/publicPagesCache')
  for (const [name, value] of Object.entries(cacheModule)) vi.stubGlobal(name, value)
  const handler = (await import('../server/api/pages/public/index.get')).default as unknown as (e: H3Event) => Promise<unknown>
  const event = { context: {} } as H3Event
  const get = async (q: Record<string, unknown> = {}) => {
    query = q
    return await handler(event)
  }
  /** Abfragen an die Seiten-Tabelle (nicht die Regeln-Frage, die ist gestubbt). */
  const listCalls = () => door.calls.length
  return { get, listCalls }
}

beforeEach(() => {
  seq = 0
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const twoLocales = () => [
  row('home', 'en', 'Home', 0),
  row('home', 'de', 'Start', 0),
  row('about', 'en', 'About', 1),
  row('about', 'de', 'Über uns', 1),
  row('imprint', 'de', 'Impressum', 90),
]

describe('BE-019 (1): die Sprache aus der Anfrage ist geprüft', () => {
  it.each([
    ['constructor', { locale: 'constructor' }],
    ['__proto__', { locale: '__proto__' }],
    // Die alte Route schnitt auf 8 Zeichen — `toString` und `valueOf` kamen
    // also unverkürzt am Objekt an, `constructor` nur als `construc`.
    ['toString', { locale: 'toString' }],
    ['valueOf', { locale: 'valueOf' }],
    ['hasOwnProperty', { locale: 'hasOwnProperty' }],
    ['ein Array-Wert', { locale: ['de', 'en'] }],
    ['leer', { locale: '' }],
  ])('%s ⇒ dieselbe Liste wie ohne Sprache (en)', async (_label, query) => {
    const { get } = await setup(twoLocales())
    const plain = await get()
    // Die zweite Anfrage trifft einen VORHANDENEN Cache-Eintrag — genau dort
    // gab das alte Objekt-Nachschlagen die geerbte Eigenschaft zurück.
    const odd = await get(query)
    expect(Array.isArray(odd)).toBe(true)
    expect(odd).toEqual(plain)
    expect((odd as PublicPageNavItem[]).map(i => i.title)).toEqual(['Home', 'About', 'Impressum'])
  })

  it('auch als ERSTE Anfrage eines Mandanten liefert eine erfundene Sprache die Liste', async () => {
    const { get } = await setup(twoLocales())
    const first = await get({ locale: '__proto__' })
    expect(Array.isArray(first)).toBe(true)
    expect((first as PublicPageNavItem[]).map(i => i.slug)).toEqual(['home', 'about', 'imprint'])
  })

  it('de bekommt die deutsche Fassung, eine unbekannte gültige Sprache (fr) den Rückfall en, sonst die erste', async () => {
    const { get } = await setup(twoLocales())
    expect((await get({ locale: 'de' }) as PublicPageNavItem[]).map(i => i.title)).toEqual(['Start', 'Über uns', 'Impressum'])
    expect((await get({ locale: 'fr' }) as PublicPageNavItem[]).map(i => i.title)).toEqual(['Home', 'About', 'Impressum'])
  })

  it('eine erfundene Sprache kostet nichts: keine zweite Abfrage, kein eigener Eintrag', async () => {
    const { get, listCalls } = await setup(twoLocales())
    await get({ locale: 'fr' })
    const afterFirst = listCalls()
    await get({ locale: 'zz' })
    await get({ locale: 'constructor' })
    await get({ locale: 'xx-YY' })
    await get({ locale: 'de' })
    expect(listCalls()).toBe(afterFirst)
  })

  it('der Regeln-Rückfall folgt weiter der gewünschten Sprache und wird je Mandant einmal gefragt', async () => {
    const { get } = await setup(twoLocales(), { guidelinesFallback: true })
    const en = await get() as PublicPageNavItem[]
    const de = await get({ locale: 'de' }) as PublicPageNavItem[]
    const enGuidelines = en.find(i => i.slug === GUIDELINES_SLUG)
    const deGuidelines = de.find(i => i.slug === GUIDELINES_SLUG)
    expect(enGuidelines).toBeDefined()
    expect(deGuidelines).toBeDefined()
    expect(deGuidelines!.title).not.toBe(enGuidelines!.title)
    expect(fallbackAsks).toBe(1)
  })

  it('gibt es die Regeln als veröffentlichte Zeile, wird der Rückfall nicht gefragt', async () => {
    const { get } = await setup([...twoLocales(), row(GUIDELINES_SLUG, 'en', 'Our rules', 5)], { guidelinesFallback: true })
    const items = await get() as PublicPageNavItem[]
    expect(items.filter(i => i.slug === GUIDELINES_SLUG).map(i => i.title)).toEqual(['Our rules'])
    expect(fallbackAsks).toBe(0)
  })
})

describe('BE-019 (2): die Liste liest ALLE veröffentlichten Zeilen', () => {
  it('60 Seiten in zwei Sprachen (120 Zeilen) ⇒ alle 60 Seiten, sortiert', async () => {
    const rows: PageRow[] = []
    for (let i = 0; i < 60; i++) {
      // Die Reihenfolge der Zeilen in der Tabelle ist NICHT die Sortierung —
      // die Route muss selbst sortieren.
      const order = (i * 37) % 60
      rows.push(row(`page-${order}`, 'en', `Page ${order}`, order))
      rows.push(row(`page-${order}`, 'de', `Seite ${order}`, order))
    }
    const { get } = await setup(rows)
    const items = await get({ locale: 'de' }) as PublicPageNavItem[]
    expect(items).toHaveLength(60)
    expect(items.map(i => i.sortOrder)).toEqual(Array.from({ length: 60 }, (_, i) => i))
    expect(items.every(i => i.title.startsWith('Seite '))).toBe(true)
  })

  it('Entwürfe bleiben draußen, auch über mehrere Seiten der Abfrage', async () => {
    const rows: PageRow[] = []
    for (let i = 0; i < 150; i++) rows.push(row(`p-${i}`, 'en', `P ${i}`, i))
    for (const r of rows.slice(0, 30)) (r as unknown as Record<string, unknown>).status = 'draft'
    const { get } = await setup(rows)
    const items = await get() as PublicPageNavItem[]
    expect(items).toHaveLength(120)
    expect(items[0]!.slug).toBe('p-30')
  })

  it('die harte Obergrenze greift mit EINER Log-Zeile (nur Zahlen), statt still abzuschneiden', async () => {
    const rows: PageRow[] = []
    for (let i = 0; i < 1_100; i++) rows.push(row(`p-${i}`, 'en', `Geheimer Titel ${i}`, i))
    const { get } = await setup(rows)
    const items = await get() as PublicPageNavItem[]
    expect(items).toHaveLength(1_000)
    const capped = logged.filter(([, name]) => name === 'pages.public_list_capped')
    expect(capped).toHaveLength(1)
    expect(JSON.stringify(capped[0])).not.toContain('Geheimer Titel')
    expect(capped[0]![2]).toMatchObject({ read: 1_000, total: 1_100 })
  })

  it('genau an der Grenze ohne weitere Zeilen: keine Log-Zeile', async () => {
    const rows: PageRow[] = []
    for (let i = 0; i < 1_000; i++) rows.push(row(`p-${i}`, 'en', `P ${i}`, i))
    const { get } = await setup(rows)
    expect(await get()).toHaveLength(1_000)
    expect(logged.filter(([, name]) => name === 'pages.public_list_capped')).toEqual([])
  })
})

