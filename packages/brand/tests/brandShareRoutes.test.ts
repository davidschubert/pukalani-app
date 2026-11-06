import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'

/**
 * DIE ZWEI ROUTEN DES TEILENS, DIE PAKET G3 ANFASST (Konzept
 * docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §2.6/§2.8).
 *
 *  1. `GET …/profiles/:id/share` — der ZUSTAND für den Dialog: gibt es einen
 *     aktiven Link, und bis wann? Fremdes Branding 404, und der Token steht
 *     dort NICHT (er existiert genau einmal, beim Veröffentlichen).
 *  2. `GET /api/brand/share/:token` — die öffentliche Antwort. Sie filtert
 *     seit G3 auch beim LESEN: jeder Snapshot von VOR MV1 M5 trägt alles
 *     Bestätigte, Beschwerden und Wettbewerber eingeschlossen (§4). Ohne
 *     diesen Filter gäbe ein alter Link sie über die API preis — die Seite
 *     schützt der Renderer, die JSON-Antwort daneben niemand.
 *
 * Die Doppel sind dieselben wie in `brandFoundationRoute.test.ts`: Zeilen im
 * Speicher, ein `tablesDB`-Doppel, `assertBrandOwnerAccess` als echte Regel im
 * Kleinen (ein Stub, der nie wirft, könnte die 404-Zusage nicht prüfen).
 */

interface FakeRow { $id: string, [key: string]: unknown }

const profileRow: FakeRow = {
  $id: 'p1',
  ownerId: 'u1',
  ownerType: 'user',
  title: 'Kailua Coffee Co.',
  contentLocale: 'en',
}

/** Die Zeilen von `brand_shares` — jeder Test setzt sie selbst. */
let shareRows: FakeRow[]
/** Die Zeilen von `brand_steps` — nur das Veröffentlichen liest sie. */
let stepRows: FakeRow[]
let createdRows: { tableId: string, data: Record<string, string> }[]

const tablesDB = {
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    if (tableId === 'brand_profiles' && rowId === 'p1') return profileRow
    // Eine echte `AppwriteException` — `isAppwriteNotFound` prüft den Typ,
    // ein blosses `{ code: 404 }` liefe an ihm vorbei und würde als 500 enden.
    throw new AppwriteException('not found', 404)
  }),
  listRows: vi.fn(async ({ tableId }: { tableId: string }) => {
    if (tableId === 'brand_shares') return { rows: shareRows }
    if (tableId === 'brand_steps') return { rows: stepRows }
    return { rows: [] }
  }),
  createRow: vi.fn(async ({ tableId, data }: { tableId: string, data: Record<string, string> }) => {
    createdRows.push({ tableId, data })
    return { $id: 'e1' }
  }),
  updateRow: vi.fn(async ({ rowId }: { rowId: string }) => ({ $id: rowId })),
}

let routerParams: Record<string, string> = { id: 'p1' }
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
// Das Veröffentlichen liest einen leeren Rumpf gegen sein Zod-Schema.
vi.stubGlobal('readValidatedBody', async (_event: H3Event, parse: (value: unknown) => unknown) => parse({}))
vi.stubGlobal('setResponseHeaders', (_event: H3Event, headers: Record<string, string>) => {
  responseHeaders = { ...responseHeaders, ...headers }
})

const statusRoute = (await import('../server/api/brand/profiles/[id]/share.get'))
  .default as unknown as (event: H3Event) => Promise<{
    active: null | { shareId: string, publishedAt: string, expiresAt: string }
  }>

const publishRoute = (await import('../server/api/brand/profiles/[id]/share.post'))
  .default as unknown as (event: H3Event) => Promise<{ shareId: string, token: string }>

const viewRoute = (await import('../server/api/brand/share/[token].get'))
  .default as unknown as (event: H3Event) => Promise<{
    snapshot: { chapters: { stepKey: string, slots: { slotId: string, value: string }[] }[] }
    publishedAt: string
    expiresAt: string
  }>

const event = { context: {} } as unknown as H3Event

/**
 * Ein Ablauf in der Zukunft. Der `tokenHash` der Zeile ist beliebig: das
 * `tablesDB`-Doppel filtert nicht nach Query — geprüft wird hier, was die
 * Route MIT einer gefundenen Zeile tut, nicht Appwrites Unique-Index.
 */
const FUTURE = new Date(Date.now() + 30 * 24 * 3600_000).toISOString()

function shareRow(extra: Record<string, unknown> = {}): FakeRow {
  return {
    $id: 's1',
    profileId: 'p1',
    tokenHash: 'egal-das-Doppel-filtert-nicht',
    snapshot: JSON.stringify({
      schemaVersion: 1,
      title: 'Kailua Coffee Co.',
      contentLocale: 'en',
      story: 'Ein Absatz.',
      chapters: [{
        stepKey: 'context',
        slots: [
          { slotId: 'a.pitch', value: 'Eine Rösterei mit Ausschank auf Oʻahu.' },
          { slotId: 'a.complaints', value: 'Zweimal war die Suppe um 13 Uhr alle.' },
          { slotId: 'a.competitors', value: 'Kona Trading — teuer, langsam' },
          { slotId: 'a.origin', value: 'Angefangen hat es mit einer geliehenen Maschine.' },
        ],
      }],
      presetId: '',
      presetVersion: '',
    }),
    publishedAt: '2026-09-06T10:00:00.000Z',
    expiresAt: FUTURE,
    revokedAt: null,
    ...extra,
  }
}

/**
 * Ein Ergebnis-Kapitel mit bestätigter Richtung. Die anderen Kapitel des Weges
 * fehlen bewusst: der Snapshot baut seine Kapitel aus der JOURNEY, und ein
 * Kapitel ohne bestätigten Inhalt fällt ohnehin weg.
 */
function resultRow(confirmed: string): FakeRow {
  return {
    $id: 'p1_result',
    profileId: 'p1',
    stepKey: 'result',
    state: 'done',
    slots: JSON.stringify({ 'result.direction': { confirmed, accepted: true } }),
    generations: '{"items":[],"count":0}',
    revision: 1,
    activeSeconds: 0,
  }
}

beforeEach(() => {
  profileRow.ownerId = 'u1'
  routerParams = { id: 'p1', token: 'geheim' }
  shareRows = []
  stepRows = []
  createdRows = []
  responseHeaders = {}
  tablesDB.createRow.mockClear()
})

describe('GET …/profiles/:id/share — der Zustand für den Dialog', () => {
  it('ohne aktive Zeile: `active: null`', async () => {
    expect(await statusRoute(event)).toEqual({ active: null })
  })

  it('mit aktiver Zeile: Id und beide Daten — aber KEIN Token', async () => {
    shareRows = [shareRow()]
    const result = await statusRoute(event)
    expect(result.active).toEqual({
      shareId: 's1',
      publishedAt: '2026-09-06T10:00:00.000Z',
      expiresAt: FUTURE,
    })
    // Der rohe Token existiert genau einmal (in der Publish-Antwort); auch der
    // HASH hat in einer Client-Antwort nichts zu suchen.
    const payload = JSON.stringify(result)
    expect(payload).not.toContain('geheim')
    expect(payload).not.toContain('tokenHash')
  })

  it('nach einer Rotation meldet sie die JÜNGSTE Zeile', async () => {
    shareRows = [
      shareRow({ $id: 'alt', publishedAt: '2026-09-01T10:00:00.000Z' }),
      shareRow({ $id: 'neu', publishedAt: '2026-09-05T10:00:00.000Z' }),
    ]
    expect((await statusRoute(event)).active?.shareId).toBe('neu')
  })

  it('FREMDES BRANDING: 404 — und zwar VOR jeder Abfrage der Zeilen', async () => {
    profileRow.ownerId = 'jemand-anderes'
    shareRows = [shareRow()]
    tablesDB.listRows.mockClear()
    await expect(statusRoute(event)).rejects.toMatchObject({ status: 404 })
    expect(tablesDB.listRows).not.toHaveBeenCalled()
  })

  it('unbekannte Profil-Id: 404, ununterscheidbar von fremd', async () => {
    routerParams = { id: 'gibt-es-nicht' }
    await expect(statusRoute(event)).rejects.toMatchObject({ status: 404 })
  })
})

describe('GET /api/brand/share/:token — was der zweite Leser bekommt', () => {
  it('liefert den Snapshot samt Stand-Datum', async () => {
    shareRows = [shareRow()]
    const result = await viewRoute(event)
    expect(result.publishedAt).toBe('2026-09-06T10:00:00.000Z')
    expect(result.snapshot.chapters[0]!.stepKey).toBe('context')
  })

  it('EIN ALTER SNAPSHOT GIBT SEINE INTERNEN WERTE NICHT MEHR HERAUS (§4)', async () => {
    shareRows = [shareRow()]
    const payload = JSON.stringify(await viewRoute(event))
    expect(payload).not.toContain('Suppe um 13 Uhr')
    expect(payload).not.toContain('Kona Trading')
    // Auch die ROHANTWORT bleibt draussen — `a.origin` ist `public`, aber
    // keine Festlegung (`audience: 'internal'`, §2.3).
    expect(payload).not.toContain('geliehenen Maschine')
  })

  it('GEGENPROBE: die Festlegung steht sehr wohl darin', async () => {
    // Ohne diese Zeile bestünde die Prüfung oben auch für eine Route, die gar
    // nichts mehr ausgibt.
    shareRows = [shareRow()]
    const result = await viewRoute(event)
    expect(result.snapshot.chapters[0]!.slots.map(slot => slot.slotId)).toEqual(['a.pitch'])
    expect(JSON.stringify(result)).toContain('Ausschank auf Oʻahu')
  })

  it('ein Kapitel, von dem nichts übrig bleibt, fällt weg', async () => {
    shareRows = [shareRow({
      snapshot: JSON.stringify({
        schemaVersion: 1,
        title: 'X',
        contentLocale: 'en',
        story: '',
        chapters: [{ stepKey: 'context', slots: [{ slotId: 'a.complaints', value: 'geheim' }] }],
        presetId: '',
        presetVersion: '',
      }),
    })]
    expect((await viewRoute(event)).snapshot.chapters).toEqual([])
  })

  /**
   * BRAND DESIGN D9 (Davids Entscheidung 2026-09-09): die sechs Design-Kapitel
   * stehen NICHT als rohe Slot-Werte im Abbild. Der Schreibweg lässt sie seit
   * D9 nicht mehr hinein — jede Zeile aus der Zeit ZWISCHEN D8 und D9 trägt sie
   * aber noch, und die API liefert sie ohne diesen Filter aus. Dieselbe Lage
   * wie bei den internen Sessions vor MV1 M5, dieselbe Kur.
   */
  it('ein v2-Abbild von VOR D9 gibt seine rohen Design-Werte nicht mehr heraus', async () => {
    shareRows = [shareRow({
      snapshot: JSON.stringify({
        schemaVersion: 2,
        title: 'X',
        contentLocale: 'de',
        story: '',
        chapters: [
          { stepKey: 'context', slots: [{ slotId: 'a.pitch', value: 'Eine Rösterei.' }] },
          { stepKey: 'color', slots: [{ slotId: 'h.base', value: '#b98a5e' }] },
          { stepKey: 'motion', slots: [{ slotId: 'l.tempo', value: 'snappy' }] },
        ],
        presetId: 'design:p1',
        presetVersion: '1',
        design: { version: 1, color: { base: '#b98a5e' } },
      }),
    })]
    const result = await viewRoute(event)
    expect(result.snapshot.chapters.map(chapter => chapter.stepKey)).toEqual(['context'])
    const payload = JSON.stringify(result.snapshot.chapters)
    expect(payload).not.toContain('h.base')
    expect(payload).not.toContain('l.tempo')
    // GEGENPROBE: das PRESET bleibt unangetastet — die visuelle Identität ist
    // der halbe Grund, den Link zu verschicken.
    expect(JSON.stringify(result.snapshot)).toContain('#b98a5e')
    expect(result.snapshot.chapters[0]!.slots[0]!.value).toBe('Eine Rösterei.')
  })

  it('die vier Schutz-Köpfe stehen an der Antwort', async () => {
    shareRows = [shareRow()]
    await viewRoute(event)
    expect(responseHeaders['Cache-Control']).toBe('no-store')
    expect(responseHeaders['X-Robots-Tag']).toBe('noindex, nofollow')
    expect(responseHeaders['Referrer-Policy']).toBe('no-referrer')
    expect(responseHeaders['Content-Security-Policy']).toBe(`frame-ancestors 'none'`)
  })

  it('das Ereignis trägt die shareId — NIE den Token', async () => {
    shareRows = [shareRow()]
    await viewRoute(event)
    const written = createdRows.filter(row => row.tableId === 'brand_events')
    expect(written).toHaveLength(1)
    expect(written[0]!.data.type).toBe('share.viewed')
    expect(written[0]!.data.userId).toBe('')
    expect(written[0]!.data.payload).toContain('s1')
    expect(written[0]!.data.payload).not.toContain('geheim')
  })

  it('widerrufen ⇒ 404, ohne Ereignis', async () => {
    shareRows = [shareRow({ revokedAt: '2026-09-06T11:00:00.000Z' })]
    await expect(viewRoute(event)).rejects.toMatchObject({ status: 404 })
    expect(createdRows).toEqual([])
  })

  it('abgelaufen ⇒ 404 — dieselbe Antwort wie unbekannt', async () => {
    shareRows = [shareRow({ expiresAt: '2026-09-05T10:00:00.000Z' })]
    await expect(viewRoute(event)).rejects.toMatchObject({ status: 404 })
    shareRows = []
    await expect(viewRoute(event)).rejects.toMatchObject({ status: 404 })
  })

  it('ein Token ohne Länge und ein 10-KB-Token fallen vor jeder Abfrage durch', async () => {
    routerParams = { token: '' }
    await expect(viewRoute(event)).rejects.toMatchObject({ status: 404 })
    routerParams = { token: 'x'.repeat(10_000) }
    await expect(viewRoute(event)).rejects.toMatchObject({ status: 404 })
  })
})

/**
 * WAS DAS VERÖFFENTLICHEN AN PRESET-DATEN EINFRIERT (Paket G4).
 *
 * Bis G4 las `share.post.ts` `brand_profiles.designPresetId` — zwei Spalten,
 * die seit Migration 001 existieren und NIE geschrieben wurden: `presetId` war
 * in jedem Snapshot leer. Die eine Wahrheit ist seither der bestätigte Wert
 * der Session `result.direction`; die Spalten bleiben unbeschrieben (Kopf der
 * Route). Der Beweis dafür ist die Gegenprobe unten: ein gesetztes
 * `designPresetId` am Profil darf NICHTS mehr bewirken.
 */
describe('POST …/profiles/:id/share — die Richtung reist als Preset mit', () => {
  function snapshotOf(): Record<string, unknown> {
    const created = createdRows.find(row => row.tableId === 'brand_shares')!
    return JSON.parse(created.data.snapshot!) as Record<string, unknown>
  }

  it('friert die bestätigte Richtung als `presetId` samt Fassung ein', async () => {
    stepRows = [resultRow('bold-contrast')]
    await publishRoute(event)
    expect(snapshotOf()).toMatchObject({ presetId: 'bold-contrast', presetVersion: '1' })
  })

  it('OHNE Wahl bleibt beides leer — nichts wird erfunden', async () => {
    await publishRoute(event)
    expect(snapshotOf()).toMatchObject({ presetId: '', presetVersion: '' })
  })

  it('EIN UNBEKANNTER WERT reist NICHT mit — ein Snapshot ist 30 Tage öffentlich', async () => {
    // Ein von Hand korrigiertes Feld kann jeden Text tragen. Er hätte in einem
    // öffentlich abrufbaren Abbild nichts verloren.
    stepRows = [resultRow('meine-eigene-welt')]
    await publishRoute(event)
    const snapshot = snapshotOf()
    expect(snapshot).toMatchObject({ presetId: '', presetVersion: '' })
    expect(JSON.stringify(snapshot)).not.toContain('meine-eigene-welt')
  })

  it('GEGENPROBE: die alte Profil-Spalte wirkt nicht mehr', async () => {
    profileRow.designPresetId = 'aus-der-spalte'
    profileRow.designPresetVersion = '9'
    stepRows = [resultRow('calm-natural')]
    await publishRoute(event)
    expect(snapshotOf()).toMatchObject({ presetId: 'calm-natural', presetVersion: '1' })
    delete profileRow.designPresetId
    delete profileRow.designPresetVersion
  })
})
