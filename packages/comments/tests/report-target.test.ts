import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { type FakeDoor, fakeDoor } from '../../core/tests/support/doorFake'
import { COMMENTS_TABLE } from '../shared/types/comment'

/**
 * SEC-031 — die Melde-Prüfung für Kommentare fragt „darf DIESES Konto den
 * Kommentar lesen?". Ein ausgeblendeter Kommentar trägt kein Leserecht mehr;
 * für den Melder ist er damit genauso „nicht vorhanden" wie eine erfundene Id.
 * Der Auto-Hide-Handler im selben Plugin bleibt bei der Operator-Klinke — er
 * moderiert, er liest nicht für jemanden.
 */

type Probe = (event: H3Event, id: string) => Promise<boolean>
let probe: Probe
let door: FakeDoor

beforeEach(async () => {
  door = fakeDoor({
    rows: {
      [COMMENTS_TABLE]: [
        { $id: 'k-visible', status: 'active' },
        { $id: 'k-tombstone', status: 'deleted' },
        { $id: 'k-hidden', status: 'hidden' },
      ],
    },
    readable: (_table, row) => row.status !== 'hidden',
  })
  vi.stubGlobal('defineNitroPlugin', (fn: () => void) => fn)
  vi.stubGlobal('registerReportTarget', (_type: string, fn: Probe) => { probe = fn })
  vi.stubGlobal('registerReportEscalationHandler', () => {})
  vi.stubGlobal('tenantDb', door.tenantDb)
  const plugin = (await import('../server/plugins/report-escalation')).default as unknown as () => void
  plugin()
})

afterEach(() => vi.unstubAllGlobals())

describe('Melde-Ziel „comment"', () => {
  it('lesbarer Kommentar (auch ein Tombstone): meldbar', async () => {
    await expect(probe({} as H3Event, 'k-visible')).resolves.toBe(true)
    await expect(probe({} as H3Event, 'k-tombstone')).resolves.toBe(true)
  })

  it('nicht lesbarer Kommentar: dieselbe Antwort wie eine erfundene Id', async () => {
    await expect(probe({} as H3Event, 'k-hidden')).resolves.toBe(false)
    await expect(probe({} as H3Event, 'k-nope')).resolves.toBe(false)
  })

  it('fragt ausschließlich die Mitglieder-Klinke', async () => {
    await probe({} as H3Event, 'k-hidden')
    expect(door.calls.map(call => call.handle)).toEqual(['member'])
  })
})
