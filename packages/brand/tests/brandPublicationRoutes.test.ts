import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'

/**
 * DIE DREI EIGENTÜMER-ROUTEN DER VERÖFFENTLICHUNG (docs/plans/DISCOVER-BRANDS.md
 * §4.3, Paket D1).
 *
 *  1. `GET …/profiles/:id/publication`    — Zustand + „darf eingereicht werden?"
 *  2. `POST …/profiles/:id/publication`   — einreichen (Zustand `pending`)
 *  3. `DELETE …/profiles/:id/publication` — zurückziehen
 *
 * Die Doppel sind dieselben wie in `brandShareRoutes.test.ts`: Zeilen im
 * Speicher, ein `tablesDB`-Doppel, `assertBrandOwnerAccess` als echte Regel im
 * Kleinen (ein Stub, der nie wirft, könnte die 404-Zusage nicht prüfen).
 *
 * GEPRÜFT WIRD, WAS MAN NICHT SEHEN KANN: dass die Freigabe wirklich davor
 * steht (nichts wird `published`), dass ein zweiter Stand den öffentlichen
 * NICHT überschreibt, dass die Adresse stabil bleibt und dass das Zurückziehen
 * keinen Rest hinterlässt.
 */

interface FakeRow { $id: string, [key: string]: unknown }

const profileRow: FakeRow = {
  $id: 'p1',
  ownerId: 'u1',
  ownerType: 'user',
  title: 'Kailua Coffee Co.',
  contentLocale: 'de',
  pathKind: 'new',
  hasName: true,
  team: 'solo',
  industry: 'Rösterei',
  websiteUrl: '',
}

let stepRows: FakeRow[]
let publicationRows: FakeRow[]
let checkRows: FakeRow[]
let created: { tableId: string, rowId: string, data: Record<string, unknown> }[]
let updated: { tableId: string, rowId: string, data: Record<string, unknown> }[]
/** `true` = die Tabelle `brand_publications` gibt es noch nicht (vor brand-020). */
let publicationsTableMissing = false

function publicationRow(extra: Record<string, unknown> = {}): FakeRow {
  return {
    $id: 'p1',
    slug: 'kailua-coffee-co',
    title: 'Kailua Coffee Co.',
    status: 'published',
    snapshot: '{"schemaVersion":1}',
    pendingSnapshot: '',
    submittedAt: '2026-09-01T10:00:00.000Z',
    publishedAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
    decisionNote: '',
    ...extra,
  }
}

/** Ein abgenommenes Kapitel — `state: 'done'` IST die Abnahme. */
function stepRow(stepKey: string, extra: Record<string, unknown> = {}): FakeRow {
  return {
    $id: `p1_${stepKey}`,
    profileId: 'p1',
    stepKey,
    state: 'done',
    slots: '{}',
    generations: '{"items":[],"count":0}',
    revision: 1,
    activeSeconds: 0,
    ...extra,
  }
}

function archetypeRow(primary: string): FakeRow {
  return stepRow('archetype', {
    slots: JSON.stringify({
      'd.primary': { confirmed: primary },
      'd.secondary': { confirmed: primary ? 'sage' : '' },
    }),
  })
}

/** Der vollständige, einreichbare Stand: A und B abgenommen, Archetyp gesetzt. */
function readyRows(): FakeRow[] {
  return [stepRow('context'), stepRow('pvm'), archetypeRow('creator')]
}

const tablesDB = {
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    if (tableId === 'brand_profiles' && rowId === 'p1') return profileRow
    if (tableId === 'brand_publications') {
      if (publicationsTableMissing) throw new AppwriteException('collection not found', 404)
      const row = publicationRows.find(entry => entry.$id === rowId)
      if (row) return row
    }
    // Eine echte `AppwriteException` — `isAppwriteNotFound` prüft den Typ.
    throw new AppwriteException('not found', 404)
  }),
  listRows: vi.fn(async ({ tableId }: { tableId: string }) => {
    if (tableId === 'brand_steps') return { rows: stepRows }
    if (tableId === 'brand_checks') return { rows: checkRows }
    if (tableId === 'brand_publications') {
      if (publicationsTableMissing) throw new AppwriteException('collection not found', 404)
      return { rows: publicationRows }
    }
    return { rows: [] }
  }),
  createRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    created.push({ tableId, rowId, data })
    return { $id: rowId, ...data }
  }),
  updateRow: vi.fn(async ({ tableId, rowId, data }: { tableId: string, rowId: string, data: Record<string, unknown> }) => {
    if (tableId === 'brand_publications' && !publicationRows.some(entry => entry.$id === rowId)) {
      throw new AppwriteException('not found', 404)
    }
    updated.push({ tableId, rowId, data })
    const existing = publicationRows.find(entry => entry.$id === rowId) ?? { $id: rowId }
    return { ...existing, ...data }
  }),
}

let routerParams: Record<string, string> = { id: 'p1' }
let body: Record<string, unknown> = { consent: true }
let quotaCount = 1
let responseHeaders: Record<string, string> = {}

vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('useAppConfig', () => ({ pukalani: { brand: {} } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB }))
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))
vi.stubGlobal('toH3Error', (error: unknown) => error)
vi.stubGlobal('logEvent', () => {})
vi.stubGlobal('requireBrandAccess', async () => ({ userId: 'u1' }))
vi.stubGlobal('assertBrandOwnerAccess', (_event: H3Event, row: FakeRow, userId: string) => {
  if (row.ownerId !== userId) throw Object.assign(new Error('Not Found'), { status: 404, statusCode: 404 })
})
vi.stubGlobal('getRouterParam', (_event: H3Event, name: string) => routerParams[name] ?? '')
vi.stubGlobal('readValidatedBody', async (_event: H3Event, parse: (value: unknown) => unknown) => parse(body))
vi.stubGlobal('setHeader', (_event: H3Event, name: string, value: unknown) => {
  responseHeaders[name] = String(value)
})
vi.stubGlobal('useRateLimitStore', () => ({
  prefix: 'rl:',
  store: { hit: async () => ({ count: quotaCount, resetInMs: 60_000 }) },
}))

interface PublicationAnswer {
  publication: {
    status: string
    slug: string
    path: string
    publishedAt: string
    decisionNote: string
    pendingUpdate: boolean
  }
  readiness: { allowed: boolean, blockers: string[] }
}

const getRoute = (await import('../server/api/brand/profiles/[id]/publication.get'))
  .default as unknown as (event: H3Event) => Promise<PublicationAnswer>
const postRoute = (await import('../server/api/brand/profiles/[id]/publication.post'))
  .default as unknown as (event: H3Event) => Promise<PublicationAnswer>
const deleteRoute = (await import('../server/api/brand/profiles/[id]/publication.delete'))
  .default as unknown as (event: H3Event) => Promise<PublicationAnswer>

const event = { context: {} } as unknown as H3Event

beforeEach(() => {
  profileRow.ownerId = 'u1'
  profileRow.title = 'Kailua Coffee Co.'
  routerParams = { id: 'p1' }
  body = { consent: true }
  stepRows = readyRows()
  publicationRows = []
  checkRows = []
  created = []
  updated = []
  quotaCount = 1
  publicationsTableMissing = false
  responseHeaders = {}
})

describe('GET …/publication — der Zustand für Kopf und Karte', () => {
  it('ohne Zeile: `none`, und die Bereitschaft steht daneben', async () => {
    const result = await getRoute(event)
    expect(result.publication.status).toBe('none')
    expect(result.publication.path).toBe('')
    expect(result.readiness).toEqual({ allowed: true, blockers: [] })
  })

  it('nennt die fehlenden Voraussetzungen, BEVOR jemand klickt', async () => {
    stepRows = [stepRow('context')]
    profileRow.title = ''
    const result = await getRoute(event)
    expect(result.readiness.allowed).toBe(false)
    expect(result.readiness.blockers).toEqual(['title_missing', 'pvm_open', 'archetype_missing'])
  })

  it('mit Zeile: Zustand, Adresse und die Begründung des Betreibers', async () => {
    publicationRows = [publicationRow({ status: 'declined', decisionNote: 'Fremdes Logo im Bild.' })]
    const result = await getRoute(event)
    expect(result.publication.status).toBe('declined')
    expect(result.publication.path).toBe('/discover/kailua-coffee-co')
    expect(result.publication.decisionNote).toBe('Fremdes Logo im Bild.')
  })

  it('FEHLT DIE TABELLE (Deploy vor brand-020), ist die Antwort `none` statt 500', async () => {
    publicationsTableMissing = true
    expect((await getRoute(event)).publication.status).toBe('none')
  })

  it('FREMDES BRANDING: 404 — und zwar VOR jeder weiteren Abfrage', async () => {
    profileRow.ownerId = 'jemand-anderes'
    tablesDB.listRows.mockClear()
    await expect(getRoute(event)).rejects.toMatchObject({ status: 404 })
    expect(tablesDB.listRows).not.toHaveBeenCalled()
  })
})

describe('POST …/publication — einreichen', () => {
  it('legt eine Zeile im Zustand `pending` an — NIE `published`', async () => {
    const result = await postRoute(event)
    expect(result.publication.status).toBe('pending')
    const row = created.find(entry => entry.tableId === 'brand_publications')!
    expect(row.rowId).toBe('p1')
    expect(row.data.status).toBe('pending')
    // Die Freigabe steht davor: der ÖFFENTLICHE Stand wird hier nicht gesetzt.
    expect(row.data.snapshot).toBeUndefined()
    expect(String(row.data.pendingSnapshot)).toContain('schemaVersion')
  })

  it('schreibt den Steckbrief, den die Galerie filtert', async () => {
    const row = (await postRoute(event), created.find(entry => entry.tableId === 'brand_publications')!)
    expect(row.data.slug).toBe('kailua-coffee-co')
    expect(row.data.pathKind).toBe('new')
    // Freitext „Rösterei" ist keine Katalog-Id ⇒ `unknown`, ohne KI.
    expect(row.data.industry).toBe('unknown')
  })

  it('die Branche aus dem Dialog schlägt den Freitext — aber nur als Katalog-Id', async () => {
    body = { consent: true, industry: 'food' }
    await postRoute(event)
    const row = created.find(entry => entry.tableId === 'brand_publications')!
    expect(row.data.industry).toBe('food')

    // Eine erfundene Id fällt am Schema, nicht erst an der Galerie.
    created.length = 0
    body = { consent: true, industry: 'bakery-of-doom' }
    await expect(postRoute(event)).rejects.toBeTruthy()
    expect(created.find(entry => entry.tableId === 'brand_publications')).toBeUndefined()
    expect(row.data.archetype).toBe('creator')
    expect(row.data.archetypeSecondary).toBe('sage')
    expect(row.data.locale).toBe('de')
    expect(String(row.data.paletteId).length).toBeGreaterThan(0)
  })

  it('setzt das Opt-in am Profil auf `public`', async () => {
    await postRoute(event)
    expect(updated.find(entry => entry.tableId === 'brand_profiles')?.data)
      .toEqual({ publicationVisibility: 'public' })
  })

  it('OHNE die Voraussetzungen: 409 mit ALLEN Gründen, und es entsteht nichts', async () => {
    stepRows = [stepRow('context'), archetypeRow('')]
    await expect(postRoute(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'publication_not_ready', blockers: ['pvm_open', 'archetype_missing'] },
    })
    expect(created).toEqual([])
    expect(updated).toEqual([])
  })

  it('EIN NEUER STAND LÄSST DEN ÖFFENTLICHEN STEHEN (§3.4)', async () => {
    publicationRows = [publicationRow()]
    const result = await postRoute(event)
    const write = updated.find(entry => entry.tableId === 'brand_publications')!
    // Nur der eingereichte Stand wird geschrieben — `snapshot` bleibt, was er
    // war. Ohne diese Trennung sähe die Öffentlichkeit während der Prüfung
    // genau das, was noch niemand geprüft hat.
    expect(write.data.snapshot).toBeUndefined()
    expect(write.data.status).toBe('pending')
    expect(result.publication.pendingUpdate).toBe(true)
    expect(result.publication.publishedAt).toBe('2026-09-02T10:00:00.000Z')
  })

  it('DIE ADRESSE BLEIBT, auch wenn der Titel sich geändert hat', async () => {
    publicationRows = [publicationRow({ status: 'declined' })]
    profileRow.title = 'Kailua Coffee Company'
    await postRoute(event)
    expect(updated.find(entry => entry.tableId === 'brand_publications')?.data.slug)
      .toBe('kailua-coffee-co')
  })

  it('KOLLISION: eine fremde Marke desselben Namens bekommt `-2`', async () => {
    publicationRows = [{ $id: 'fremd', slug: 'kailua-coffee-co' }]
    await postRoute(event)
    expect(created.find(entry => entry.tableId === 'brand_publications')?.data.slug)
      .toBe('kailua-coffee-co-2')
  })

  it('die Begründung der letzten Ablehnung fällt weg', async () => {
    publicationRows = [publicationRow({ status: 'declined', decisionNote: 'Fremdes Logo.' })]
    await postRoute(event)
    expect(updated.find(entry => entry.tableId === 'brand_publications')?.data.decisionNote).toBe('')
  })

  it('AUSGEBLENDET bleibt ausgeblendet: 409, kein Schreibvorgang', async () => {
    publicationRows = [publicationRow({ status: 'hidden' })]
    await expect(postRoute(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'publication_state' },
    })
    expect(updated.filter(entry => entry.tableId === 'brand_publications')).toEqual([])
  })

  it('OHNE HÄKCHEN gibt es keine Einreichung', async () => {
    body = {}
    await expect(postRoute(event)).rejects.toBeTruthy()
    body = { consent: false }
    await expect(postRoute(event)).rejects.toBeTruthy()
    expect(created).toEqual([])
  })

  it('DER TAGES-DECKEL greift VOR jedem Schreibvorgang', async () => {
    quotaCount = 11
    await expect(postRoute(event)).rejects.toMatchObject({
      status: 429,
      data: { code: 'publication_limit' },
    })
    expect(created).toEqual([])
    expect(responseHeaders['Retry-After']).toBeTruthy()
  })

  it('das Ereignis trägt Kennzahlen — nie den Inhalt des Abbilds', async () => {
    await postRoute(event)
    const written = created.filter(entry => entry.tableId === 'brand_events')
    expect(written).toHaveLength(1)
    expect(written[0]!.data.type).toBe('publication.submitted')
    expect(String(written[0]!.data.payload)).not.toContain('schemaVersion')
  })

  it('FREMDES BRANDING: 404', async () => {
    profileRow.ownerId = 'jemand-anderes'
    await expect(postRoute(event)).rejects.toMatchObject({ status: 404 })
  })
})

describe('DELETE …/publication — zurückziehen', () => {
  it('nimmt den öffentlichen Stand MIT, nicht nur den Zustand', async () => {
    publicationRows = [publicationRow()]
    const result = await deleteRoute(event)
    expect(result.publication.status).toBe('withdrawn')
    const write = updated.find(entry => entry.tableId === 'brand_publications')!
    // „kein Rest" (§3.2): der eingefrorene Text verschwindet mit.
    expect(write.data.snapshot).toBe('')
    expect(write.data.pendingSnapshot).toBe('')
  })

  it('nimmt das Opt-in am Profil zurück', async () => {
    publicationRows = [publicationRow()]
    await deleteRoute(event)
    expect(updated.find(entry => entry.tableId === 'brand_profiles')?.data)
      .toEqual({ publicationVisibility: 'private' })
  })

  it('die Adresse bleibt reserviert — die Zeile wird nicht gelöscht', async () => {
    publicationRows = [publicationRow()]
    const result = await deleteRoute(event)
    expect(result.publication.slug).toBe('kailua-coffee-co')
  })

  it('ohne Veröffentlichung: 409 statt eines stillen Erfolgs', async () => {
    await expect(deleteRoute(event)).rejects.toMatchObject({
      status: 409,
      data: { code: 'publication_state' },
    })
  })

  it('zweimal zurückziehen: das zweite Mal wird abgelehnt', async () => {
    publicationRows = [publicationRow({ status: 'withdrawn' })]
    await expect(deleteRoute(event)).rejects.toMatchObject({ status: 409 })
  })

  it('FREMDES BRANDING: 404', async () => {
    publicationRows = [publicationRow()]
    profileRow.ownerId = 'jemand-anderes'
    await expect(deleteRoute(event)).rejects.toMatchObject({ status: 404 })
  })
})
