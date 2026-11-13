import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { type FakeRow, fakeDoor, runDoorRoute } from '../../core/tests/support/doorFake'
import { replyParentDenial } from '../shared/replyParent'
import { COMMENTS_TABLE } from '../shared/types/comment'

/**
 * SEC-035 — eine Antwort hängt nur an einem AKTIVEN Kommentar DESSELBEN Fadens.
 *
 * Vorher prüfte nur der Gast-Weg den Faden, und keiner der beiden Wege den
 * Zustand des Eltern-Kommentars. Jetzt gilt EINE pure Regel für beide:
 * nicht aktiv ⇒ 404 (wie „nicht gefunden"), fremder Faden ⇒ 422. Und eine
 * Benachrichtigung, die ein Gast auslöst, trägt einen eigenen Typ — die Glocke
 * und die Mail kennzeichnen ihn als Gast.
 */

const loadAccount = () => import('../server/api/comments/index.post')
const loadGuest = () => import('../server/api/comments/guest.post')

function parent(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    $id: 'k-parent',
    communityId: 'c-a',
    targetType: 'post',
    targetId: 'p-1',
    content: 'Eltern',
    authorId: 'u-author',
    authorName: 'Autorin',
    authorKind: 'user',
    status: 'active',
    rootId: null,
    depth: 0,
    targetUrl: '/feed',
    ...overrides,
  }
}

const reply = (overrides: Record<string, unknown> = {}) => ({
  targetType: 'post',
  targetId: 'p-1',
  content: 'Antwort',
  parentId: 'k-parent',
  ...overrides,
})

const guestConfig = () => ({ pukalani: { comments: { embed: { enabled: true, guests: true } } } })

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

describe('replyParentDenial — die eine Regel', () => {
  const target = { targetType: 'post', targetId: 'p-1' }

  it('aktiver Kommentar im selben Faden: erlaubt', () => {
    expect(replyParentDenial(parent() as never, target)).toBeNull()
  })

  it('anderes Ziel oder anderer Typ: fremder Faden', () => {
    expect(replyParentDenial(parent({ targetId: 'p-2' }) as never, target)).toBe('other_thread')
    expect(replyParentDenial(parent({ targetType: 'lesson' }) as never, target)).toBe('other_thread')
  })

  it('ausgeblendet oder gelöscht: nicht aktiv — und das schlägt den fremden Faden', () => {
    expect(replyParentDenial(parent({ status: 'hidden' }) as never, target)).toBe('not_active')
    expect(replyParentDenial(parent({ status: 'deleted', targetId: 'p-2' }) as never, target)).toBe('not_active')
  })
})

describe('POST /api/comments (Konto)', () => {
  it('Eltern-Kommentar aus einem anderen Ziel: 422, nichts angelegt', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [parent({ targetId: 'p-2' })] } })
    const run = await runDoorRoute(loadAccount, { door, body: reply() })

    expect(run.status).toBe(422)
    expect(door.rows[COMMENTS_TABLE]).toHaveLength(1)
  })

  it('Eltern-Kommentar gelöscht (Tombstone, lesbar): 404 wie „nicht gefunden"', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [parent({ status: 'deleted' })] } })
    const run = await runDoorRoute(loadAccount, { door, body: reply() })

    expect(run.status).toBe(404)
    expect(run.error?.statusText).toBe('Parent comment not found')
    expect(door.rows[COMMENTS_TABLE]).toHaveLength(1)
  })

  it('Gegenprobe: aktiver Eltern-Kommentar im selben Faden ⇒ 201', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [parent()] } })
    const run = await runDoorRoute(loadAccount, { door, body: reply() })

    expect(run.status).toBe(200)
    expect(door.rows[COMMENTS_TABLE]).toHaveLength(2)
  })
})

describe('POST /api/comments/guest (Gast)', () => {
  const notifications: Array<Record<string, unknown>> = []
  const guestRun = (door: ReturnType<typeof fakeDoor>, body: Record<string, unknown>) => {
    notifications.length = 0
    return runDoorRoute(loadGuest, {
      door,
      who: 'guest',
      mode: 'silo',
      body: { ...body, guestName: 'Gastname' },
      globals: {
        useAppConfig: guestConfig,
        notify: async (_e: unknown, input: Record<string, unknown>) => { notifications.push(input) },
      },
    })
  }

  it('Eltern-Kommentar aus einem anderen Ziel: 422 über dieselbe Regel', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [parent({ targetId: 'p-2' })] } })
    const run = await guestRun(door, reply())
    expect(run.status).toBe(422)
    expect(door.rows[COMMENTS_TABLE]).toHaveLength(1)
  })

  it('ausgeblendeter Eltern-Kommentar: 404, nichts angelegt, KEINE Benachrichtigung', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [parent({ status: 'hidden' })] } })
    const run = await guestRun(door, reply())

    expect(run.status).toBe(404)
    expect(run.error?.statusText).toBe('Parent comment not found')
    expect(door.rows[COMMENTS_TABLE]).toHaveLength(1)
    expect(notifications).toHaveLength(0)
  })

  it('Antwort auf ein Konto: die Benachrichtigung trägt den Gast-Typ', async () => {
    const door = fakeDoor({ rows: { [COMMENTS_TABLE]: [parent()] } })
    const run = await guestRun(door, reply())

    expect(run.status).toBe(200)
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({ recipientId: 'u-author', type: 'reply.guest', title: 'Gastname' })
  })
})
