import { afterEach, describe, expect, it, vi } from 'vitest'
import { rejectOversizedUpload } from '../../core/server/utils/uploadSize'
import { describeRoleGatedRoute, probeRoute, resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { MAX_FAVICON_BYTES } from '../../core/shared/communityFavicon'

/**
 * POST /api/community/branding/favicon — ROLLEN-TOR UND FRÜHE GRÖSSEN-PRÜFUNG
 * (OPS-009, AB1 c).
 *
 * Echter Handler, echte Core-Wachen (Prüfstand
 * `core/tests/support/participationHarness.ts`), echte frühe Prüfung
 * `rejectOversizedUpload`.
 *
 * `branding.manage` — ausgeschrieben aus der Rechte-Matrix
 * (`core/shared/communityAuthz.ts`), nicht berechnet: Admin und Owner; der
 * Betreiber im protokollierten Not-Zugang (globales Label `admin`). Editor,
 * Moderator und Mitglied NICHT.
 *
 * Grenze ausgeschrieben: 1.000.000 Byte Favicon + 64 KiB Multipart-Rahmen.
 */

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

const load = () => import('../server/api/community/branding/favicon.post')
const LIMIT = 1_000_000 + 64 * 1024

function uploadGlobals(contentLength: string | undefined) {
  const reads = { count: 0 }
  const globals = {
    rejectOversizedUpload,
    getRequestHeader: (_e: unknown, name: string) => (name === 'content-length' ? contentLength : undefined),
    readMultipartFormData: async () => {
      reads.count += 1
      // Kein PNG — die Route bricht danach mit 415 ab, bevor sie etwas ablegt.
      return [{ name: 'file', filename: 'icon.png', data: Buffer.from('kein png') }]
    },
  }
  return { reads, globals }
}

describeRoleGatedRoute('POST /api/community/branding/favicon', load, {
  allow: ['owner', 'admin', 'operator'],
  deny: ['moderator', 'editor', 'member'],
}, {
  globals: uploadGlobals('128').globals,
})

describe('POST /api/community/branding/favicon — frühe Größen-Prüfung', () => {
  it('die ausgeschriebene Grenze passt zur Konstante der Route', () => {
    expect(MAX_FAVICON_BYTES).toBe(1_000_000)
  })

  it('zu große angegebene Länge: 413, Datei ungelesen', async () => {
    const { reads, globals } = uploadGlobals(String(LIMIT + 1))
    const run = await probeRoute(load, { who: 'owner', globals })
    expect(run.status).toBe(413)
    expect(run.error?.statusText).toBe('File too large')
    expect(reads.count).toBe(0)
  })

  it('passende angegebene Länge: die Route liest die Datei ein', async () => {
    const { reads, globals } = uploadGlobals(String(LIMIT))
    const run = await probeRoute(load, { who: 'owner', globals })
    expect(reads.count).toBe(1)
    expect(run.status).toBe(415)
  })

  it('ohne Längen-Angabe: keine frühe Ablehnung, die Route liest weiter', async () => {
    const { reads, globals } = uploadGlobals(undefined)
    const run = await probeRoute(load, { who: 'owner', globals })
    expect(reads.count).toBe(1)
    expect(run.status).toBe(415)
  })

  it('Rechte vor Größe: ein Editor bekommt 403, nicht 413', async () => {
    const { reads, globals } = uploadGlobals(String(LIMIT + 1))
    const run = await probeRoute(load, { who: 'editor', globals })
    expect(run.status).toBe(403)
    expect(reads.count).toBe(0)
  })

  it('ohne Konto: 401 vor 413', async () => {
    const { reads, globals } = uploadGlobals(String(LIMIT + 1))
    const run = await probeRoute(load, { who: 'guest', globals })
    expect(run.status).toBe(401)
    expect(reads.count).toBe(0)
  })
})
