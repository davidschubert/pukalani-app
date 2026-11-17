import { afterEach, describe, expect, it, vi } from 'vitest'
import { rejectOversizedUpload } from '../../core/server/utils/uploadSize'
import { fakeDoor } from '../../core/tests/support/doorFake'
import { probeRoute, resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { EVENTS_TABLE, MAX_EVENT_COVER_BYTES } from '../shared/types/event'

/**
 * POST /api/events/:id/cover — DIE ANGEGEBENE LÄNGE WIRD VOR DEM EINLESEN
 * GEPRÜFT (AB1 c).
 *
 * Echter Handler, echte Wache (Prüfstand `participationHarness.ts`), echte
 * frühe Prüfung `rejectOversizedUpload`. Gezählt wird, ob
 * `readMultipartFormData` gerufen wurde. Grenze ausgeschrieben: 2 MiB Cover +
 * 64 KiB Multipart-Rahmen.
 */

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

const load = () => import('../server/api/events/[id]/cover.post')
const LIMIT = 2 * 1024 * 1024 + 64 * 1024

function uploadGlobals(contentLength: string | undefined) {
  const reads = { count: 0 }
  const globals = {
    rejectOversizedUpload,
    getRequestHeader: (_e: unknown, name: string) => (name === 'content-length' ? contentLength : undefined),
    readMultipartFormData: async () => {
      reads.count += 1
      // Kein Bild — die Route bricht danach mit 415 ab, bevor sie etwas ablegt.
      return [{ name: 'file', filename: 'cover.png', data: Buffer.from('kein bild') }]
    },
    // Der Storage-Client wird vor dem Lesen nur angelegt, nicht benutzt.
    createAdminClient: () => ({ storage: {} }),
  }
  return { reads, globals }
}

const door = () => fakeDoor({ rows: { [EVENTS_TABLE]: [{ $id: 'e-1', title: 'Treffen' }] } }).tenantDb

describe('POST /api/events/:id/cover — frühe Größen-Prüfung', () => {
  it('die ausgeschriebene Grenze passt zur Konstante der Route', () => {
    expect(MAX_EVENT_COVER_BYTES).toBe(2 * 1024 * 1024)
  })

  it('zu große angegebene Länge: 413, Datei ungelesen, Datentür zu', async () => {
    const { reads, globals } = uploadGlobals(String(LIMIT + 1))
    const run = await probeRoute(load, { who: 'owner', params: { id: 'e-1' }, globals, door: door() })
    expect(run.status).toBe(413)
    expect(run.error?.statusText).toBe('File too large')
    expect(reads.count).toBe(0)
    expect(run.doorOpened).toBe(false)
  })

  it('passende angegebene Länge: die Route liest die Datei ein', async () => {
    const { reads, globals } = uploadGlobals(String(LIMIT))
    const run = await probeRoute(load, { who: 'owner', params: { id: 'e-1' }, globals, door: door() })
    expect(reads.count).toBe(1)
    expect(run.status).toBe(415)
  })

  it('ohne Längen-Angabe: keine frühe Ablehnung, die Route liest weiter', async () => {
    const { reads, globals } = uploadGlobals(undefined)
    const run = await probeRoute(load, { who: 'owner', params: { id: 'e-1' }, globals, door: door() })
    expect(reads.count).toBe(1)
    expect(run.status).toBe(415)
  })

  it('Rechte vor Größe: ein Mitglied ohne Rolle bekommt 403, nicht 413', async () => {
    const { reads, globals } = uploadGlobals(String(LIMIT + 1))
    const run = await probeRoute(load, { who: 'member', params: { id: 'e-1' }, globals, door: door() })
    expect(run.status).toBe(403)
    expect(reads.count).toBe(0)
  })
})
