import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { type FakeDoor, fakeDoor } from '../../core/tests/support/doorFake'
import { POSTS_TABLE } from '../shared/types/post'

/**
 * SEC-031 — die Melde-Prüfung für Beiträge fragt „darf DIESES Konto den
 * Beitrag lesen?" und nicht „gibt es die Zeile?". Beides über dieselbe Antwort:
 * ein Beitrag, den das Konto nicht sehen kann (geplant, ausgeblendet, fremde
 * Community), ist für den Melder genauso „nicht vorhanden" wie eine erfundene
 * Id — sonst verriete die Melde-Route Existenz.
 */

type Probe = (event: H3Event, id: string) => Promise<boolean>
let probe: Probe
let door: FakeDoor

beforeEach(async () => {
  door = fakeDoor({
    rows: {
      [POSTS_TABLE]: [
        { $id: 'p-visible', status: 'published' },
        { $id: 'p-hidden', status: 'hidden' },
      ],
    },
    readable: (_table, row) => row.status === 'published',
  })
  vi.stubGlobal('defineNitroPlugin', (fn: () => void) => fn)
  vi.stubGlobal('registerReportTarget', (_type: string, fn: Probe) => { probe = fn })
  vi.stubGlobal('tenantDb', door.tenantDb)
  const plugin = (await import('../server/plugins/report-target')).default as unknown as () => void
  plugin()
})

afterEach(() => vi.unstubAllGlobals())

describe('Melde-Ziel „post"', () => {
  it('lesbarer Beitrag: meldbar', async () => {
    await expect(probe({} as H3Event, 'p-visible')).resolves.toBe(true)
  })

  it('nicht lesbarer Beitrag: dieselbe Antwort wie eine erfundene Id', async () => {
    const hidden = await probe({} as H3Event, 'p-hidden')
    const unknown = await probe({} as H3Event, 'p-nope')
    expect(hidden).toBe(false)
    expect(unknown).toBe(false)
  })

  it('fragt ausschließlich die Mitglieder-Klinke', async () => {
    await probe({} as H3Event, 'p-hidden')
    expect(door.calls.map(call => call.handle)).toEqual(['member'])
  })
})
