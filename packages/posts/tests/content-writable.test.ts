import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { fakeDoor } from '../../core/tests/support/doorFake'
import { topicWriteDenial } from '../shared/topicState'
import { POSTS_TABLE } from '../shared/types/post'

/**
 * SEC-035 — Kommentare gibt es nur unter VERÖFFENTLICHTEN Beiträgen.
 *
 * Der Schreib-Wächter des posts-Layers prüfte bis dahin nur „geschlossen". Ein
 * geplanter, ausgeblendeter oder gelöschter Beitrag nahm weiter Kommentare an
 * — über den Konto-Weg und über den Gast-Weg, der beide Male hier fragt. Jetzt
 * ⇒ 403 mit eigenem Grund `topic_not_published` (derselbe Statuscode wie die
 * bestehende Sperre `topic_closed`). Unbekannte Ziele bleiben erlaubt: an
 * einem Ziel ohne Zeile gibt es nichts zu verbieten.
 */

type Guard = (event: H3Event, target: { targetType: string, targetId: string }) => Promise<void>
let guard: Guard

beforeEach(async () => {
  const door = fakeDoor({
    rows: {
      [POSTS_TABLE]: [
        { $id: 'p-open', status: 'published', closed: false },
        { $id: 'p-closed', status: 'published', closed: true },
        { $id: 'p-scheduled', status: 'scheduled', closed: false },
        { $id: 'p-hidden', status: 'hidden', closed: false },
        { $id: 'p-deleted', status: 'deleted', closed: false },
      ],
    },
  })
  vi.stubGlobal('defineNitroPlugin', (fn: () => void) => fn)
  vi.stubGlobal('registerContentWriteGuard', (_type: string, fn: Guard) => { guard = fn })
  vi.stubGlobal('tenantDb', door.tenantDb)
  vi.stubGlobal('createError', (init: Record<string, unknown>) => Object.assign(new Error(String(init.statusText)), init))
  const plugin = (await import('../server/plugins/content-writable')).default as unknown as () => void
  plugin()
})

afterEach(() => vi.unstubAllGlobals())

const check = (id: string) => guard({} as H3Event, { targetType: 'post', targetId: id })

describe('Schreib-Wächter für Kommentare unter Beiträgen', () => {
  it('veröffentlicht und offen: erlaubt', async () => {
    await expect(check('p-open')).resolves.toBeUndefined()
  })

  it('geschlossen: 403 topic_closed (wie bisher)', async () => {
    await expect(check('p-closed')).rejects.toMatchObject({ status: 403, data: { code: 'topic_closed' } })
  })

  it.each(['p-scheduled', 'p-hidden', 'p-deleted'])('%s: 403 topic_not_published', async (id) => {
    await expect(check(id)).rejects.toMatchObject({ status: 403, data: { code: 'topic_not_published' } })
  })

  it('unbekanntes Ziel: erlaubt (eingebettete Kommentare an freien Zeichenketten)', async () => {
    await expect(check('irgendwas')).resolves.toBeUndefined()
  })
})

describe('topicWriteDenial — die pure Regel', () => {
  it('Reihenfolge: nicht veröffentlicht schlägt geschlossen', () => {
    expect(topicWriteDenial({ status: 'hidden', closed: true })).toBe('topic_not_published')
    expect(topicWriteDenial({ status: 'published', closed: true })).toBe('topic_closed')
    expect(topicWriteDenial({ status: 'published', closed: false })).toBeNull()
  })
})
