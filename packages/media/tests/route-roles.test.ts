import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeDoor } from '../../core/tests/support/doorFake'
import { describeRoleGatedRoute, probeRoute, resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { MEDIA_TABLE } from '../shared/types/media'

/**
 * ROLLEN-PROBEN FÜR MEDIEN (P27, OPS-009).
 *
 * Echte Handler, echte Core-Wachen (Prüfstand
 * `core/tests/support/participationHarness.ts`). Die Probe endet an der
 * Datentür: geprüft wird, wer VOR ihr abgewiesen wird und wer durchkommt.
 *
 * `media.manage` (Bibliothek pflegen) — ausgeschrieben aus der Rechte-Matrix
 * (`core/shared/communityAuthz.ts`), nicht berechnet: Editor, Admin, Owner;
 * der Betreiber im protokollierten Not-Zugang. Der Moderator NICHT (er
 * verfasst nichts), ein Mitglied ohne Rolle auch nicht.
 *
 * Die öffentliche Galerie (`GET /api/media` ohne `?all`) bedient Gäste; dort
 * entscheidet das Leserecht der Zeilen (Mitglieder-Klinke) und der Filter auf
 * Veröffentlichtes.
 */

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

const MANAGE = {
  allow: ['owner', 'admin', 'editor', 'operator'],
  deny: ['moderator', 'member'],
} as const

/** Technik, die die Liste vor und nach der Tür braucht (Adressen der Bilder). */
const CONFIG = {
  useRuntimeConfig: () => ({ public: { appwriteEndpoint: 'http://appwrite.test/v1', appwriteProjectId: 'probe' } }),
}

/** Kleinste gültige PNG-Signatur (12 Byte) — die Route prüft die Magie-Bytes. */
const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0])

/** Technik für den Upload: Kopfzeile und eingelesene Datei, mit Zähler. */
function uploadGlobals() {
  const reads = { count: 0 }
  const globals = {
    getRequestHeader: () => '128',
    readMultipartFormData: async () => {
      reads.count += 1
      return [{ name: 'file', filename: 'bild.png', data: PNG }]
    },
  }
  return { reads, globals }
}

// ── Rollen-Tore ─────────────────────────────────────────────────────────────

describeRoleGatedRoute('POST /api/media (hochladen)', () => import('../server/api/media/index.post'), MANAGE, {
  globals: uploadGlobals().globals,
})

describeRoleGatedRoute('PATCH /api/media/:id', () => import('../server/api/media/[id].patch'), MANAGE, {
  params: { id: 'm-1' }, body: { title: 'Neuer Titel' },
})

describeRoleGatedRoute('DELETE /api/media/:id', () => import('../server/api/media/[id].delete'), MANAGE, {
  params: { id: 'm-1' },
})

describeRoleGatedRoute('GET /api/media/:id/file (Vorschau)', () => import('../server/api/media/[id]/file.get'), MANAGE, {
  params: { id: 'm-1' },
})

describeRoleGatedRoute('GET /api/media?all (mit Entwürfen)', () => import('../server/api/media/index.get'), MANAGE, {
  query: { all: '' }, globals: CONFIG,
})

describe('POST /api/media — die Datei wird erst NACH der Wache eingelesen', () => {
  const load = () => import('../server/api/media/index.post')

  for (const who of ['guest', 'stranger', 'member', 'moderator'] as const) {
    it(`${who}: abgewiesen, die Datei bleibt ungelesen`, async () => {
      const { reads, globals } = uploadGlobals()
      const run = await probeRoute(load, { who, globals })
      expect([401, 403]).toContain(run.status)
      expect(reads.count).toBe(0)
    })
  }

  it('editor: die Datei wird eingelesen', async () => {
    const { reads, globals } = uploadGlobals()
    const run = await probeRoute(load, { who: 'editor', globals })
    expect(run.guardPassed).toBe(true)
    expect(reads.count).toBe(1)
  })
})

// ── Öffentliche Galerie ─────────────────────────────────────────────────────

describe('GET /api/media (öffentliche Galerie)', () => {
  const load = () => import('../server/api/media/index.get')

  function mediaDoor() {
    return fakeDoor({
      rows: {
        [MEDIA_TABLE]: [
          { $id: 'm-1', title: 'Sichtbar', subtitle: '', alt: '', fileId: 'f-1', featured: false, published: true, sortOrder: 0 },
          { $id: 'm-2', title: 'Entwurf', subtitle: '', alt: '', fileId: 'f-2', featured: false, published: false, sortOrder: 0 },
        ],
      },
    })
  }

  function capturing(): { load: () => Promise<{ default: unknown }>, seen: { body?: { items: Array<Record<string, unknown>> } } } {
    const seen: { body?: { items: Array<Record<string, unknown>> } } = {}
    return {
      seen,
      load: async () => ({
        default: async (e: unknown) => {
          const handler = (await load()).default as (event: unknown) => Promise<{ items: Array<Record<string, unknown>> }>
          seen.body = await handler(e)
          return seen.body
        },
      }),
    }
  }

  for (const who of ['guest', 'stranger', 'member'] as const) {
    it(`${who}: kein 401/403, nur Veröffentlichtes, nur über die Mitglieder-Klinke`, async () => {
      const door = mediaDoor()
      const probe = capturing()
      const run = await probeRoute(probe.load, { who, door: door.tenantDb, globals: CONFIG })
      expect(run.status).toBe(200)
      expect(run.guardPassed, 'ohne ?all fragt kein Rollen-Tor').toBe(false)
      expect(door.calls.every(call => call.handle === 'member')).toBe(true)
      expect(probe.seen.body?.items.map(item => item.id)).toEqual(['m-1'])
      expect(probe.seen.body?.items[0]).not.toHaveProperty('fileId')
    })
  }
})
