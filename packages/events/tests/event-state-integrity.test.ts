import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeDoor, type FakeRow, fakeDoor, runDoorRoute } from '../../core/tests/support/doorFake'
import { getPubliclyVisibleEvent } from '../server/utils/visibleEvent'
import { EVENTS_TABLE } from '../shared/types/event'

/**
 * BE-017 / BE-018 — Zustand und Leserecht eines Termins laufen nicht
 * auseinander. Gefahren werden die ECHTEN Handler gegen die nachgebaute
 * Datentür (core/tests/support/doorFake.ts); die Tür kann hier zusätzlich
 * `updatePermissions` und lässt einzelne Aufrufe gezielt scheitern.
 *
 *  - PATCH schreibt `access`/`priceAmount`/`priceLookupKey` wirklich (BE-018).
 *  - Der Serien-Master zieht einen von der Moderation ausgeblendeten Termin
 *    NICHT mit (BE-017).
 *  - Ein zweites Ausblenden holt den Entzug des Leserechts nach (BE-017).
 *  - Die Leseroute liefert nur `published`/`cancelled` (BE-017).
 *  - Wiederherstellen: erst Zustand, dann Leserecht — und wiederholbar (BE-017).
 */

const PUBLIC = 'read("any")'

const loadPatch = () => import('../server/api/events/[id].patch')
const loadHide = () => import('../server/api/events/[id]/hide.post')
const loadRestore = () => import('../server/api/events/[id]/restore.post')
const loadGet = () => import('../server/api/events/[id].get')
const loadIcs = () => import('../server/api/events/[id]/ics.get')

function eventRow(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: 'e-1',
    $permissions: [PUBLIC],
    communityId: 'c-a',
    title: 'Treffen',
    description: 'Beschreibung',
    startAt: '2030-01-01T10:00:00.000Z',
    endAt: null,
    location: null,
    url: null,
    capacity: null,
    attendeeCount: 0,
    status: 'published',
    organizerId: 'u-org',
    access: 'free',
    priceAmount: null,
    priceLookupKey: null,
    seriesId: null,
    recurrence: null,
    replayUrl: null,
    redactedAt: null,
    ...overrides,
  }
}

interface PermissionCall { id: string, permissions: string[] }

/** Tür mit `updatePermissions` und gezielten Ausfällen. */
function doorWithPermissions(base: FakeDoor, fail: { permissionsFor?: (id: string) => boolean } = {}) {
  const permissionCalls: PermissionCall[] = []
  const tenantDb = (event: H3Event, options?: { as?: 'member' | 'operator', actor?: string }) => {
    const handle = base.tenantDb(event, options)
    return {
      ...handle,
      async updatePermissions(table: string, id: string, permissions: string[]) {
        base.calls.push({ handle: options?.as === 'operator' ? 'operator' : 'member', method: 'updatePermissions', table, id })
        if (fail.permissionsFor?.(id)) throw Object.assign(new Error('appwrite down'), { code: 500 })
        permissionCalls.push({ id, permissions })
        const row = (base.rows[table] ?? []).find(r => r.$id === id)
        if (row) row.$permissions = permissions
        return row ? { ...row } : null
      },
    }
  }
  return { door: { ...base, tenantDb } as FakeDoor, permissionCalls }
}

const withPublishedRead = (base: string[]) => base.includes(PUBLIC) ? base : [...base, PUBLIC]
const withoutPublishedRead = (base: string[]) => base.filter(p => p !== PUBLIC)

/** Leserecht wie Appwrite: die Mitglieder-Klinke sieht nur Zeilen mit Publikum. */
const readableByAudience = (table: string, row: FakeRow) =>
  table !== EVENTS_TABLE || (row.$permissions as string[] | undefined ?? []).includes(PUBLIC)

function routeGlobals(extra: Record<string, unknown> = {}) {
  return {
    requireCommunityPermission: async () => ({ user: { $id: 'u-mod', name: 'Mod' }, actor: 'member' }),
    withPublishedRead,
    withoutPublishedRead,
    applyEventCoverVisibility: vi.fn(async () => {}),
    resolveReportsForTarget: vi.fn(async () => {}),
    removeActivitiesForObject: vi.fn(async () => {}),
    ...extra,
  }
}

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

describe('BE-018 — PATCH schreibt Zugang und Preis', () => {
  it('access paid + Lookup-Key + Betrag landen auf der Zeile', async () => {
    const base = fakeDoor({ rows: { [EVENTS_TABLE]: [eventRow()] } })
    const { door } = doorWithPermissions(base)
    const run = await runDoorRoute(loadPatch, {
      door, params: { id: 'e-1' }, body: { access: 'paid', priceLookupKey: 'x', priceAmount: 500 }, globals: routeGlobals(),
    })

    expect(run.status).toBe(200)
    const row = base.rows[EVENTS_TABLE]![0]!
    expect(row.access).toBe('paid')
    expect(row.priceLookupKey).toBe('x')
    expect(row.priceAmount).toBe(500)
  })

  it('ohne die Felder im Body bleiben sie unangetastet', async () => {
    const base = fakeDoor({ rows: { [EVENTS_TABLE]: [eventRow({ access: 'paid', priceLookupKey: 'alt', priceAmount: 900 })] } })
    const { door } = doorWithPermissions(base)
    const run = await runDoorRoute(loadPatch, {
      door, params: { id: 'e-1' }, body: { title: 'Neuer Titel' }, globals: routeGlobals(),
    })

    expect(run.status).toBe(200)
    const row = base.rows[EVENTS_TABLE]![0]!
    expect(row).toMatchObject({ title: 'Neuer Titel', access: 'paid', priceLookupKey: 'alt', priceAmount: 900 })
  })

  it('null ist erlaubt und setzt das Feld zurück', async () => {
    const base = fakeDoor({ rows: { [EVENTS_TABLE]: [eventRow({ access: 'paid', priceLookupKey: 'alt', priceAmount: 900 })] } })
    const { door } = doorWithPermissions(base)
    const run = await runDoorRoute(loadPatch, {
      door, params: { id: 'e-1' }, body: { access: 'free', priceLookupKey: null, priceAmount: null }, globals: routeGlobals(),
    })

    expect(run.status).toBe(200)
    expect(base.rows[EVENTS_TABLE]![0]!).toMatchObject({ access: 'free', priceLookupKey: null, priceAmount: null })
  })

  it('access paid ohne Lookup-Key bleibt 422 und schreibt nichts', async () => {
    const base = fakeDoor({ rows: { [EVENTS_TABLE]: [eventRow()] } })
    const { door } = doorWithPermissions(base)
    const run = await runDoorRoute(loadPatch, {
      door, params: { id: 'e-1' }, body: { access: 'paid' }, globals: routeGlobals(),
    })

    expect(run.status).toBe(422)
    expect(base.rows[EVENTS_TABLE]![0]!.access).toBe('free')
    expect(base.calls.some(c => c.method === 'update')).toBe(false)
  })
})

describe('BE-017 — der Serien-Master zieht ausgeblendete Termine nicht mit', () => {
  function seriesRows(): FakeRow[] {
    const series = { seriesId: 'm-1' }
    return [
      eventRow({ $id: 'm-1', ...series, recurrence: 'weekly' }),
      eventRow({ $id: 'i-normal', ...series }),
      eventRow({ $id: 'i-hidden', ...series, status: 'hidden', $permissions: [] }),
      eventRow({ $id: 'i-cancelled', ...series, status: 'cancelled' }),
    ]
  }

  it('Entwurf und zurück: hidden bleibt hidden und ohne Leserecht, normal folgt, abgesagt bleibt abgesagt', async () => {
    const base = fakeDoor({ rows: { [EVENTS_TABLE]: seriesRows() } })
    const { door, permissionCalls } = doorWithPermissions(base)
    const listSeriesInstances = async (_db: unknown, seriesId: string) =>
      base.rows[EVENTS_TABLE]!.filter(r => r.seriesId === seriesId && r.$id !== seriesId).map(r => ({ ...r }))
    const globals = routeGlobals({ listSeriesInstances })

    const down = await runDoorRoute(loadPatch, { door, params: { id: 'm-1' }, body: { status: 'draft' }, globals })
    expect(down.status).toBe(200)
    const up = await runDoorRoute(loadPatch, { door, params: { id: 'm-1' }, body: { status: 'published' }, globals })
    expect(up.status).toBe(200)

    const byId = (id: string) => base.rows[EVENTS_TABLE]!.find(r => r.$id === id)!
    expect(byId('i-hidden')).toMatchObject({ status: 'hidden', $permissions: [] })
    expect(permissionCalls.filter(c => c.id === 'i-hidden')).toEqual([])
    expect(base.calls.filter(c => c.id === 'i-hidden' && c.method === 'update')).toEqual([])

    expect(byId('i-normal')).toMatchObject({ status: 'published', $permissions: [PUBLIC] })
    expect(permissionCalls.filter(c => c.id === 'i-normal').map(c => c.permissions)).toEqual([[], [PUBLIC]])

    expect(byId('i-cancelled').status).toBe('cancelled')
  })
})

describe('BE-017 — zweites Ausblenden holt den Entzug nach', () => {
  it('hidden mit stehengebliebenem Leserecht: 200, Recht weg, kein zweiter Status-Schreibvorgang', async () => {
    const base = fakeDoor({ rows: { [EVENTS_TABLE]: [eventRow({ status: 'hidden', $permissions: [PUBLIC, 'read("user:u-org")'] })] } })
    const { door, permissionCalls } = doorWithPermissions(base)
    const globals = routeGlobals()
    const run = await runDoorRoute(loadHide, { door, params: { id: 'e-1' }, globals })

    expect(run.status).toBe(200)
    expect(run.body).toEqual({ ok: true })
    expect(permissionCalls).toEqual([{ id: 'e-1', permissions: ['read("user:u-org")'] }])
    expect(base.calls.filter(c => c.method === 'update')).toEqual([])
    expect(globals.applyEventCoverVisibility).toHaveBeenCalledTimes(1)
    expect(globals.resolveReportsForTarget).not.toHaveBeenCalled()
    expect(globals.removeActivitiesForObject).not.toHaveBeenCalled()
  })

  it.each(['draft', 'cancelled'])('%s bleibt 409', async (status) => {
    const base = fakeDoor({ rows: { [EVENTS_TABLE]: [eventRow({ status })] } })
    const { door, permissionCalls } = doorWithPermissions(base)
    const run = await runDoorRoute(loadHide, { door, params: { id: 'e-1' }, globals: routeGlobals() })

    expect(run.status).toBe(409)
    expect(permissionCalls).toEqual([])
  })
})

describe('BE-017 — die Leserouten liefern nur published und cancelled', () => {
  const readGlobals = {
    myRsvpsFor: async () => new Map(),
    myVotesFor: async () => new Map(),
    attendeesFor: async () => [],
    resolveAvatars: async () => new Map(),
    setHeader: () => {},
    buildEventIcs: () => 'BEGIN:VCALENDAR',
    getPubliclyVisibleEvent,
  }

  it('GET: hidden mit stehengebliebenem Leserecht ⇒ 404 wie eine unbekannte Id', async () => {
    const door = fakeDoor({ rows: { [EVENTS_TABLE]: [eventRow({ status: 'hidden' })] }, readable: readableByAudience })
    const run = await runDoorRoute(loadGet, { door, params: { id: 'e-1' }, globals: readGlobals })

    expect(run.status).toBe(404)
    expect(run.error?.statusText).toBe('Event not found')
  })

  it('GET: published und cancelled bleiben lesbar', async () => {
    for (const status of ['published', 'cancelled']) {
      const door = fakeDoor({ rows: { [EVENTS_TABLE]: [eventRow({ status })] }, readable: readableByAudience })
      const run = await runDoorRoute(loadGet, { door, params: { id: 'e-1' }, globals: readGlobals })
      expect(run.status, status).toBe(200)
    }
  })

  it('ICS: hidden mit stehengebliebenem Leserecht ⇒ 404', async () => {
    const door = fakeDoor({ rows: { [EVENTS_TABLE]: [eventRow({ status: 'hidden' })] }, readable: readableByAudience })
    const run = await runDoorRoute(loadIcs, { door, params: { id: 'e-1' }, globals: readGlobals })

    expect(run.status).toBe(404)
    expect(run.error?.statusText).toBe('Event not found')
  })
})

describe('BE-017 — Wiederherstellen: erst Zustand, dann Leserecht', () => {
  it('Reihenfolge: update(status) vor updatePermissions', async () => {
    const base = fakeDoor({ rows: { [EVENTS_TABLE]: [eventRow({ status: 'hidden', $permissions: [] })] }, readable: readableByAudience })
    const { door } = doorWithPermissions(base)
    const run = await runDoorRoute(loadRestore, { door, params: { id: 'e-1' }, globals: routeGlobals() })

    expect(run.status).toBe(200)
    const writes = base.calls.filter(c => c.method === 'update' || c.method === 'updatePermissions').map(c => c.method)
    expect(writes).toEqual(['update', 'updatePermissions'])
    expect(base.rows[EVENTS_TABLE]![0]!).toMatchObject({ status: 'published', $permissions: [PUBLIC] })
  })

  it('scheitert das Leserecht: Termin nicht lesbar, und ein zweiter Versuch gelingt', async () => {
    const base = fakeDoor({ rows: { [EVENTS_TABLE]: [eventRow({ status: 'hidden', $permissions: [] })] }, readable: readableByAudience })
    let failing = true
    const { door } = doorWithPermissions(base, { permissionsFor: () => failing })

    const first = await runDoorRoute(loadRestore, { door, params: { id: 'e-1' }, globals: routeGlobals() })
    expect(first.status).toBeGreaterThanOrEqual(500)
    const row = base.rows[EVENTS_TABLE]![0]!
    expect(row.$permissions).toEqual([])
    expect(readableByAudience(EVENTS_TABLE, row)).toBe(false)
    expect(row.status).toBe('hidden')

    failing = false
    const second = await runDoorRoute(loadRestore, { door, params: { id: 'e-1' }, globals: routeGlobals() })
    expect(second.status).toBe(200)
    expect(base.rows[EVENTS_TABLE]![0]!).toMatchObject({ status: 'published', $permissions: [PUBLIC] })
  })
})
