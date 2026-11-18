import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FOREIGN_PROFILE,
  OWN_PROFILE,
  PNG_BYTES,
  brandWorld,
  callBrandRoute,
  describeWorkshopRoute,
  draftRow,
  leaks,
  type FakeBrandAppwrite,
} from './support/brandRouteKit'

/**
 * ROLLEN-TESTS: DIE ZEICHEN-ENTWÜRFE EINER MARKE (OPS-009, BT1 b).
 *
 * Behalten/umbenennen, verwerfen, ausliefern. Dieselben zwei Grenzen wie bei
 * den Vorbildern: die MARKE (nur ihr Besitzer) und der ENTWURF (auch der
 * Besitzer kommt über seine Marke nicht an den Entwurf einer anderen).
 * Start und Liste der Entwürfe prüft `brandMarkDraftsRunRoute.test.ts`.
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

const BUCKET = 'brand-drafts'
const FOREIGN_BYTES = Buffer.concat([PNG_BYTES, Buffer.from('GEHEIM-entwurf-fremd')])

const seed = () => [draftRow('d-eigen', OWN_PROFILE), draftRow('d-fremd', FOREIGN_PROFILE)]
const files = () => ({ [`${BUCKET}/d-eigen`]: PNG_BYTES, [`${BUCKET}/d-fremd`]: FOREIGN_BYTES })

const patchRoute = () => import('../server/api/brand/profiles/[id]/mark/drafts/[draftId].patch')
const deleteRoute = () => import('../server/api/brand/profiles/[id]/mark/drafts/[draftId].delete')
const imageRoute = () => import('../server/api/brand/profiles/[id]/mark/drafts/[draftId]/image.get')

describeWorkshopRoute('PATCH /api/brand/profiles/[id]/mark/drafts/[draftId]', patchRoute, {
  seed,
  files,
  params: () => ({ draftId: 'd-eigen' }),
  body: { kept: true },
  owner: (_run, db) => {
    expect(db.rows.find(row => row.$id === 'd-eigen')?.kept).toBe(true)
  },
})

describeWorkshopRoute('DELETE /api/brand/profiles/[id]/mark/drafts/[draftId]', deleteRoute, {
  seed,
  files,
  params: () => ({ draftId: 'd-eigen' }),
  owner: (_run, db) => {
    expect(db.rows.some(row => row.$id === 'd-eigen')).toBe(false)
    expect(db.files.has(`${BUCKET}/d-eigen`)).toBe(false)
  },
})

describeWorkshopRoute('GET /api/brand/profiles/[id]/mark/drafts/[draftId]/image', imageRoute, {
  seed,
  files,
  params: () => ({ draftId: 'd-eigen' }),
  owner: (run) => {
    expect((run.result as Buffer).equals(PNG_BYTES)).toBe(true)
    expect(run.headers['Content-Type']).toBe('image/png')
    expect(run.headers['Cache-Control']).toBe('private, no-store')
  },
})

describe('Entwurf einer anderen Marke über die eigene Marke', () => {
  const cases: { name: string, load: () => Promise<{ default: unknown }>, body?: unknown }[] = [
    { name: 'PATCH', load: patchRoute, body: { kept: true } },
    { name: 'DELETE', load: deleteRoute },
    { name: 'GET image', load: imageRoute },
  ]

  const ask = (load: () => Promise<{ default: unknown }>, draftId: string, db: FakeBrandAppwrite, body?: unknown) =>
    callBrandRoute(load, { who: 'owner', db, params: { id: OWN_PROFILE, draftId }, body })

  for (const entry of cases) {
    it(`${entry.name}: Besitzer von p-eigen fragt nach d-fremd ⇒ wie eine unbekannte Id, kein Byte, nichts geschrieben`, async () => {
      const db = brandWorld(seed(), files())
      const before = { ...db.rows.find(row => row.$id === 'd-fremd') }
      const foreign = await ask(entry.load, 'd-fremd', db, entry.body)
      expect(foreign.status).toBe(404)
      expect(foreign.result).toBeUndefined()
      expect(leaks(foreign, 'GEHEIM')).toBe(false)
      expect(db.calls.some(call => call.target === `bucket:${BUCKET}`)).toBe(false)
      expect(db.writes()).toEqual([])
      expect(db.rows.find(row => row.$id === 'd-fremd')).toEqual(before)

      const unknown = await ask(entry.load, 'd-unbekannt', brandWorld(seed(), files()), entry.body)
      expect({ status: foreign.status, text: foreign.error?.statusText })
        .toEqual({ status: unknown.status, text: unknown.error?.statusText })
    })
  }

  it('GEGENPROBE: der Besitzer der anderen Marke bekommt seinen Entwurf', async () => {
    const run = await callBrandRoute(imageRoute, {
      who: 'stranger',
      db: brandWorld(seed(), files()),
      params: { id: FOREIGN_PROFILE, draftId: 'd-fremd' },
    })
    expect(run.status).toBe(200)
    expect((run.result as Buffer).equals(FOREIGN_BYTES)).toBe(true)
  })
})

describe('GET …/mark/drafts/[draftId]/image — der Fremde bekommt keine Bytes', () => {
  it('stranger an p-eigen: 404 ohne Körper, kein Abruf aus der Ablage, keine Bild-Kopfzeilen', async () => {
    const db = brandWorld(seed(), files())
    const run = await callBrandRoute(imageRoute, { who: 'stranger', db, params: { id: OWN_PROFILE, draftId: 'd-eigen' } })
    expect(run.status).toBe(404)
    expect(run.result).toBeUndefined()
    expect(db.calls.some(call => call.target === `bucket:${BUCKET}`)).toBe(false)
    expect(run.headers['Content-Type']).toBeUndefined()
  })
})
