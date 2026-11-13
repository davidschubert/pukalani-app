import { afterEach, describe, expect, it, vi } from 'vitest'
import { ME, runRoute, type Scenario } from './support/messageRouteHarness'

/**
 * SEC-030 (Anteil Nachrichten) — WER ENTFERNT WURDE, SCHREIBT HIER NICHTS MEHR
 * (Davids Entscheidung, P05, 2026-11-13).
 *
 * Auch keine privaten Antworten in einem Gespräch, das schon besteht, und auch
 * kein Weiterlesen. Jede Route ruft die Core-Wache, BEVOR die Datenbank gefragt
 * wird — bewiesen an `dbTouches === 0`.
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

type Load = () => Promise<{ default: unknown }>

interface RouteCase {
  name: string
  load: Load
  /** Szenario-Anteile für den Entfernten. */
  removed: Omit<Scenario, 'who'>
  /** Szenario-Anteile für ein Mitglied (Gegenprobe). */
  member: Omit<Scenario, 'who'>
}

const WRITE_ROUTES: RouteCase[] = [
  {
    name: 'POST /api/messages (eröffnen)',
    load: () => import('../server/api/messages/index.post'),
    removed: { body: { handle: 'partner', body: 'Hallo' } },
    member: { body: { handle: 'partner', body: 'Hallo' } },
  },
  {
    name: 'POST /api/messages/[id] (antworten)',
    load: () => import('../server/api/messages/[id].post'),
    removed: { params: { id: 'conv-2' }, body: { body: 'Noch da?' } },
    member: { params: { id: 'conv-1' }, body: { body: 'Noch da?' } },
  },
  {
    name: 'DELETE /api/messages/[id] (für mich entfernen)',
    load: () => import('../server/api/messages/[id].delete'),
    removed: { params: { id: 'conv-2' } },
    member: { params: { id: 'conv-1' } },
  },
  {
    name: 'POST /api/messages/[id]/read (gelesen)',
    load: () => import('../server/api/messages/[id]/read.post'),
    removed: { params: { id: 'conv-2' } },
    member: { params: { id: 'conv-1' } },
  },
  {
    name: 'POST /api/messages/blocks (sperren)',
    load: () => import('../server/api/messages/blocks/index.post'),
    removed: { body: { userId: 'u-partner' } },
    member: { body: { userId: 'u-partner' } },
  },
  {
    name: 'DELETE /api/messages/blocks/[userId] (entsperren)',
    load: () => import('../server/api/messages/blocks/[userId].delete'),
    removed: { params: { userId: 'u-partner' } },
    member: { params: { userId: 'u-handle' } },
  },
]

const READ_ROUTES: RouteCase[] = [
  {
    name: 'GET /api/messages (Posteingang)',
    load: () => import('../server/api/messages/index.get'),
    removed: {},
    member: {},
  },
  {
    name: 'GET /api/messages/[id] (Verlauf)',
    load: () => import('../server/api/messages/[id].get'),
    removed: { params: { id: 'conv-2' } },
    member: { params: { id: 'conv-1' } },
  },
  {
    name: 'GET /api/messages/blocks (Sperrliste)',
    load: () => import('../server/api/messages/blocks/index.get'),
    removed: {},
    member: {},
  },
  {
    name: 'GET /api/messages/settings (Schalter lesen)',
    load: () => import('../server/api/messages/settings.get'),
    removed: {},
    member: {},
  },
]

describe.each([...WRITE_ROUTES, ...READ_ROUTES])('$name', (route) => {
  it('Entfernte Person: 403 not_a_member, keine Datenbank', async () => {
    const run = await runRoute(route.load, { who: 'removed', ...route.removed })
    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe('not_a_member')
    expect(run.dbTouches).toBe(0)
  })

  it('Gast: 401, keine Datenbank', async () => {
    const run = await runRoute(route.load, { who: 'guest', ...route.removed })
    expect(run.status).toBe(401)
    expect(run.dbTouches).toBe(0)
  })

  it('Mitglied: wie bisher', async () => {
    const run = await runRoute(route.load, { who: 'member', ...route.member })
    expect(run.error).toBeUndefined()
    expect(run.status).toBe(200)
  })

  it('Silo (kein Mandant): die Wache gibt durch', async () => {
    const run = await runRoute(route.load, { who: 'removed', mode: 'silo', ...route.removed })
    expect(run.error?.data?.code).not.toBe('not_a_member')
  })
})

describe('Antworten eines Entfernten in einem BESTEHENDEN Gespräch', () => {
  it('schreibt keine Nachricht', async () => {
    const run = await runRoute(() => import('../server/api/messages/[id].post'), {
      who: 'removed',
      params: { id: 'conv-2' },
      body: { body: 'Ich bin noch da' },
    })
    expect(run.status).toBe(403)
    expect(run.tables.messages!.filter(row => row.conversationId === 'conv-2')).toHaveLength(1)
  })

  it('Gegenprobe: das Mitglied schreibt in sein Gespräch', async () => {
    const run = await runRoute<{ messageId: string }>(() => import('../server/api/messages/[id].post'), {
      who: 'member',
      params: { id: 'conv-1' },
      body: { body: 'Hallo zurück' },
    })
    expect(run.result?.messageId).toBeTruthy()
    expect(run.tables.messages!.some(row => row.authorId === ME && row.body === 'Hallo zurück')).toBe(true)
  })
})

describe('PATCH /api/messages/settings (Owner-Schalter setzen)', () => {
  const load = () => import('../server/api/messages/settings.patch')

  it('Entfernte Person: 403 ohne Datenbank (Capability-Wache, keine Rolle mehr)', async () => {
    const run = await runRoute(load, { who: 'removed', body: { enabled: true } })
    expect(run.status).toBe(403)
    expect(run.dbTouches).toBe(0)
  })
})
