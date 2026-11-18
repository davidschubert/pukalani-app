import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FOREIGN_PROFILE,
  OWN_PROFILE,
  PNG_BYTES,
  brandWorld,
  callBrandRoute,
  describeWorkshopRoute,
  inspirationRow,
  leaks,
  type BrandRouteRun,
  type FakeBrandAppwrite,
} from './support/brandRouteKit'

/**
 * ROLLEN-TESTS: DIE VORBILDER EINER MARKE (OPS-009, BT1 b).
 *
 * Hochladen, ändern, löschen, ausliefern. Zwei Grenzen werden geprüft:
 *  1. die MARKE — nur ihr Besitzer kommt an die Vorbilder (`describeWorkshopRoute`);
 *  2. das VORBILD — auch der Besitzer einer Marke kommt über SEINE Marke nicht
 *     an das Vorbild einer anderen Marke. Die Antwort ist dieselbe wie für
 *     eine unbekannte Id, und es fließt kein Byte.
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

const BUCKET = 'brand-inspiration'
const FOREIGN_BYTES = Buffer.concat([PNG_BYTES, Buffer.from('GEHEIM-bild-fremd')])

const seed = () => [inspirationRow('i-eigen', OWN_PROFILE), inspirationRow('i-fremd', FOREIGN_PROFILE)]
const files = () => ({ [`${BUCKET}/i-eigen`]: PNG_BYTES, [`${BUCKET}/i-fremd`]: FOREIGN_BYTES })

const uploadRoute = () => import('../server/api/brand/profiles/[id]/inspiration/index.post')
const patchRoute = () => import('../server/api/brand/profiles/[id]/inspiration/[fileId].patch')
const deleteRoute = () => import('../server/api/brand/profiles/[id]/inspiration/[fileId].delete')
const imageRoute = () => import('../server/api/brand/profiles/[id]/inspiration/[fileId]/image.get')

describeWorkshopRoute('POST /api/brand/profiles/[id]/inspiration', uploadRoute, {
  seed,
  files,
  multipart: [
    { name: 'area', data: Buffer.from('color') },
    { name: 'note', data: Buffer.from('Notiz') },
    { name: 'file', filename: 'bild.png', type: 'image/png', data: PNG_BYTES },
  ],
  ownerStatus: 201,
  owner: (_run, db) => {
    const created = db.rows.filter(row => row.$tableId === 'brand_inspiration' && row.profileId === OWN_PROFILE)
    expect(created).toHaveLength(2)
    expect(db.writes().some(call => call.method === 'createFile' && call.target === `bucket:${BUCKET}`)).toBe(true)
  },
})

describeWorkshopRoute('PATCH /api/brand/profiles/[id]/inspiration/[fileId]', patchRoute, {
  seed,
  files,
  params: () => ({ fileId: 'i-eigen' }),
  body: { note: 'neu' },
  owner: (_run, db) => {
    expect(db.rows.find(row => row.$id === 'i-eigen')?.note).toBe('neu')
  },
})

describeWorkshopRoute('DELETE /api/brand/profiles/[id]/inspiration/[fileId]', deleteRoute, {
  seed,
  files,
  params: () => ({ fileId: 'i-eigen' }),
  owner: (_run, db) => {
    expect(db.rows.some(row => row.$id === 'i-eigen')).toBe(false)
    expect(db.files.has(`${BUCKET}/i-eigen`)).toBe(false)
  },
})

describeWorkshopRoute('GET /api/brand/profiles/[id]/inspiration/[fileId]/image', imageRoute, {
  seed,
  files,
  params: () => ({ fileId: 'i-eigen' }),
  owner: (run) => {
    expect(Buffer.isBuffer(run.result)).toBe(true)
    expect((run.result as Buffer).equals(PNG_BYTES)).toBe(true)
    // Die Kopfzeilen, die die Route selbst setzt: erkannter Typ, kein Zwischenspeicher.
    expect(run.headers['Content-Type']).toBe('image/png')
    expect(run.headers['Cache-Control']).toBe('private, no-store')
  },
})

// ── Die zweite Grenze: das Vorbild einer ANDEREN Marke über die eigene ─────

describe('Vorbild einer anderen Marke über die eigene Marke', () => {
  const cases: { name: string, load: () => Promise<{ default: unknown }>, body?: unknown }[] = [
    { name: 'PATCH', load: patchRoute, body: { note: 'übernommen' } },
    { name: 'DELETE', load: deleteRoute },
    { name: 'GET image', load: imageRoute },
  ]

  const ask = (load: () => Promise<{ default: unknown }>, fileId: string, db: FakeBrandAppwrite, body?: unknown): Promise<BrandRouteRun> =>
    callBrandRoute(load, { who: 'owner', db, params: { id: OWN_PROFILE, fileId }, body })

  for (const entry of cases) {
    it(`${entry.name}: Besitzer von p-eigen fragt nach i-fremd ⇒ wie eine unbekannte Id, kein Byte, nichts geschrieben`, async () => {
      const db = brandWorld(seed(), files())
      const before = { ...db.rows.find(row => row.$id === 'i-fremd') }
      const foreign = await ask(entry.load, 'i-fremd', db, entry.body)
      expect(foreign.status).toBe(404)
      expect(foreign.result).toBeUndefined()
      expect(leaks(foreign, 'GEHEIM')).toBe(false)
      expect(db.calls.some(call => call.target === `bucket:${BUCKET}`)).toBe(false)
      expect(db.writes()).toEqual([])
      expect(db.rows.find(row => row.$id === 'i-fremd')).toEqual(before)
      expect(db.files.has(`${BUCKET}/i-fremd`)).toBe(true)

      const unknown = await ask(entry.load, 'i-unbekannt', brandWorld(seed(), files()), entry.body)
      expect({ status: foreign.status, text: foreign.error?.statusText })
        .toEqual({ status: unknown.status, text: unknown.error?.statusText })
    })
  }

  it('GEGENPROBE: der Besitzer der anderen Marke bekommt sein Bild', async () => {
    const db = brandWorld(seed(), files())
    const run = await callBrandRoute(imageRoute, { who: 'stranger', db, params: { id: FOREIGN_PROFILE, fileId: 'i-fremd' } })
    expect(run.status).toBe(200)
    expect((run.result as Buffer).equals(FOREIGN_BYTES)).toBe(true)
  })
})

describe('GET …/inspiration/[fileId]/image — der Fremde bekommt keine Bytes', () => {
  it('stranger an p-eigen: 404 ohne Körper, kein Abruf aus der Ablage, keine Bild-Kopfzeilen', async () => {
    const db = brandWorld(seed(), files())
    const run = await callBrandRoute(imageRoute, { who: 'stranger', db, params: { id: OWN_PROFILE, fileId: 'i-eigen' } })
    expect(run.status).toBe(404)
    expect(run.result).toBeUndefined()
    expect(db.calls.some(call => call.target === `bucket:${BUCKET}`)).toBe(false)
    expect(run.headers['Content-Type']).toBeUndefined()
  })
})
