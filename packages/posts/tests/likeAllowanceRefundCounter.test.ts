import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { utcDayKey } from '../../core/shared/likeAllowance'
import { type FakeRow, fakeDoor } from '../../core/tests/support/doorFake'
import { MEMBER_COUNTERS_TABLE } from '../shared/types/post'

/**
 * BE-020 (3) — die posts-Seite der Rückgabe: zurückgezählt wird nur, was
 * `spendMemberLikeAllowance` gezählt haben kann (derselbe UTC-Tag, Stand > 0,
 * Mechanik an). Sie hängt an derselben Registrierung wie das Verbrauchen.
 */

const event = { context: { tenant: null } } as unknown as H3Event
const today = utcDayKey(Date.now())

const counters = (overrides: Partial<FakeRow> = {}): FakeRow => ({
  $id: 'mc-1', userId: 'u-1', likeDay: today, likesToday: 3, likeLimitDay: '',
  trustLevel: 0, trustLevelLeader: false, ...overrides,
})

function wire(rows: FakeRow[], likesPerDayByLevel: unknown = [5, 5, 5, 5]) {
  const door = fakeDoor({ rows: { [MEMBER_COUNTERS_TABLE]: rows } })
  vi.stubGlobal('tenantDb', door.tenantDb)
  vi.stubGlobal('useTenant', () => null)
  vi.stubGlobal('tenantCacheScope', () => 'scope')
  vi.stubGlobal('useAppConfig', () => ({ pukalani: { discussions: { likesPerDayByLevel } } }))
  return door
}

beforeEach(async () => {
  const { __resetMemberCounterMemory } = await import('../server/utils/memberCounters')
  __resetMemberCounterMemory()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('refundMemberLikeAllowance', () => {
  it('zählt ein Like des heutigen Tages zurück', async () => {
    const door = wire([counters()])
    const { refundMemberLikeAllowance } = await import('../server/utils/memberCounters')
    await refundMemberLikeAllowance(event, 'u-1')
    expect(door.rows[MEMBER_COUNTERS_TABLE]![0]!.likesToday).toBe(2)
  })

  it('ein Stand von gestern bleibt unberührt', async () => {
    const door = wire([counters({ likeDay: '2000-01-01' })])
    const { refundMemberLikeAllowance } = await import('../server/utils/memberCounters')
    await refundMemberLikeAllowance(event, 'u-1')
    expect(door.rows[MEMBER_COUNTERS_TABLE]![0]!.likesToday).toBe(3)
  })

  it('bei 0 und bei abgeschalteter Mechanik passiert nichts', async () => {
    let door = wire([counters({ likesToday: 0 })])
    const { refundMemberLikeAllowance } = await import('../server/utils/memberCounters')
    await refundMemberLikeAllowance(event, 'u-1')
    expect(door.calls.filter(c => c.method === 'decrement')).toEqual([])

    door = wire([counters()], [0, 0, 0, 0])
    await refundMemberLikeAllowance(event, 'u-1')
    expect(door.rows[MEMBER_COUNTERS_TABLE]![0]!.likesToday).toBe(3)
  })

  it('hängt an der Autorität, die der posts-Layer registriert', async () => {
    const { refundMemberLikeAllowance, spendMemberLikeAllowance } = await import('../server/utils/memberCounters')
    expect(spendMemberLikeAllowance.refund).toBe(refundMemberLikeAllowance)
  })
})
