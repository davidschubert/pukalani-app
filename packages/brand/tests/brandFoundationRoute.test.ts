import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { BRAND_SLOTS, sessionTravels } from '../shared/slotRegistry'

/**
 * DIE ROUTE DER LESEANSICHT (`GET …/foundation`, Konzept
 * docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §2.6, Paket G2).
 *
 * ── WAS HIER GEPRÜFT WIRD UND IN `brandFoundation.test.ts` NICHT ─────────
 * Dort steht die reine Regel (was reist, welche Kapitel es gibt). Hier läuft,
 * was ihr erst Bedeutung gibt: dass ein FREMDES Branding 404 antwortet, dass
 * übersprungene Kapitel wirklich fehlen, dass der Zähler die Kapitel der
 * Werkstatt zählt — und die teuerste Zusage des Vorhabens an der ANTWORT:
 * keine Rohantwort, kein vertrauliches Feld, obwohl beide bestätigt in der
 * Zeile stehen.
 *
 * Die Doppel sind dieselben wie in `brandDocumentRoutes.test.ts`: Zeilen im
 * Speicher, ein `tablesDB`-Doppel. `assertBrandOwnerAccess` ist hier KEIN
 * leerer Stub, sondern die echte Regel im Kleinen (fremder Eigentümer ⇒ 404) —
 * ein Stub, der nie wirft, könnte die Zusage nicht prüfen.
 */

interface FakeRow { $id: string, [key: string]: unknown }

const profileRow: FakeRow = {
  $id: 'p1',
  $createdAt: '2026-09-01T00:00:00.000Z',
  $updatedAt: '2026-09-01T00:00:00.000Z',
  createdByUserId: 'u1',
  ownerType: 'user',
  ownerId: 'u1',
  title: 'Kailua Coffee Co.',
  contentLocale: 'en',
  pathKind: 'new',
  hasName: true,
  team: 'solo',
  subBrands: 'no',
  progressPct: 0,
  currentStepKey: 'values',
  storyBody: 'Erster Absatz der Story.\n\nZweiter Absatz.',
  lastActivityAt: '2026-09-01T00:00:00.000Z',
}

let stepRows: FakeRow[]

const tablesDB = {
  getRow: vi.fn(async ({ tableId, rowId }: { tableId: string, rowId: string }) => {
    if (tableId === 'brand_profiles') return profileRow
    if (tableId === 'brand_steps') {
      const row = stepRows.find(entry => entry.$id === rowId)
      if (row) return row
      throw Object.assign(new Error('not found'), { code: 404 })
    }
    throw new Error(`unerwartete Tabelle ${tableId}`)
  }),
  listRows: vi.fn(async ({ tableId }: { tableId: string }) => {
    if (tableId === 'brand_steps') return { rows: stepRows }
    return { rows: [] }
  }),
  updateRow: vi.fn(async ({ rowId }: { rowId: string }) => ({ $id: rowId })),
  createRow: vi.fn(async () => ({ $id: 'x1' })),
  deleteRow: vi.fn(async ({ rowId }: { rowId: string }) => ({ $id: rowId })),
}

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
  // Fehlende und fremde Zeile antworten identisch (404) — die Datentür verrät
  // nicht, ob es die Id gibt.
  if (row.ownerId !== userId) throw Object.assign(new Error('Not Found'), { status: 404, statusCode: 404 })
})
vi.stubGlobal('getRouterParam', (_event: H3Event, name: string) => (name === 'id' ? 'p1' : ''))
vi.stubGlobal('getQuery', () => ({}))
vi.stubGlobal('setHeader', () => {})

const foundationRoute = (await import('../server/api/brand/profiles/[id]/foundation.get'))
  .default as unknown as (event: H3Event) => Promise<Record<string, unknown>>

const event = { context: {} } as unknown as H3Event

interface FoundationResponse {
  profileId: string
  title: string
  contentLocale: string
  view: { chapters: { id: string, anchor: string, titleKey: string, state: string, blocks: unknown[] }[] }
  chapters: { stepKey: string, storedState: string, acceptance: { accepted: number, total: number } }[]
  accepted: { chapters: number, total: number }
}

/** Ein eindeutig wiedererkennbarer, formgültiger Wert je Session. */
function confirmedSlots(stepKey: string): string {
  return JSON.stringify(Object.fromEntries(BRAND_SLOTS
    .filter(slot => slot.stepId === stepKey && !slot.deactivated)
    .map(slot => [slot.id, { confirmed: `wert-${slot.id}-text`, accepted: true }])))
}

function makeStep(stepKey: string, extra: Record<string, unknown> = {}): FakeRow {
  return {
    $id: `p1_${stepKey}`,
    profileId: 'p1',
    stepKey,
    state: 'done',
    slots: confirmedSlots(stepKey),
    generations: '{"items":[],"count":0}',
    revision: 2,
    activeSeconds: 0,
    ...extra,
  }
}

beforeEach(() => {
  profileRow.ownerId = 'u1'
  stepRows = [
    makeStep('context'),
    makeStep('pvm'),
    makeStep('architecture'),
    makeStep('values', { state: 'active' }),
    makeStep('archetype'),
    makeStep('manifesto'),
    makeStep('verbal'),
    makeStep('naming'),
    makeStep('result'),
  ]
})

describe('GET …/foundation — was die Leseansicht zeigt', () => {
  it('liefert Titel, Inhaltssprache und die Kapitel des Handbuchs', async () => {
    const result = await foundationRoute(event) as unknown as FoundationResponse
    expect(result.profileId).toBe('p1')
    expect(result.title).toBe('Kailua Coffee Co.')
    expect(result.contentLocale).toBe('en')
    // Die Story steht am Profil — Kapitel 0 kommt aus `storyBody`.
    expect(result.view.chapters[0]!.id).toBe('story')
    // Die Schranke steht immer (§2.5).
    expect(result.view.chapters.map(chapter => chapter.id)).toContain('visuell')
  })

  it('ZEIGT KEINEN WERT, DER NICHT REIST — obwohl er bestätigt in der Zeile steht', async () => {
    const rendered = JSON.stringify(await foundationRoute(event))
    const held = BRAND_SLOTS.filter(slot => !slot.deactivated && !sessionTravels(slot))
    expect(held.length).toBeGreaterThan(0)
    for (const slot of held) {
      expect(rendered, `${slot.id} steht in der Leseansicht`).not.toContain(`wert-${slot.id}`)
    }
  })

  it('GEGENPROBE: die reisefähigen Werte stehen sehr wohl darin', async () => {
    const rendered = JSON.stringify(await foundationRoute(event))
    // Ohne diese Zeile bestünde die Prüfung oben auch für eine Route, die gar
    // nichts ausgibt.
    expect(rendered).toContain('wert-a.pitch')
    expect(rendered).toContain('wert-b.purpose')
    // Und die Gegenprobe am Paar (§2.3): beide `public`, nur eines ist eine
    // Festlegung.
    expect(rendered).not.toContain('wert-a.origin')
  })

  it('ÜBERSPRUNGENE Kapitel fehlen — `architecture` (subBrands: no) und `naming`', async () => {
    const result = await foundationRoute(event) as unknown as FoundationResponse
    const keys = result.chapters.map(chapter => chapter.stepKey)
    expect(keys).not.toContain('architecture')
    expect(keys).not.toContain('naming')
    expect(result.view.chapters.map(chapter => chapter.id)).not.toContain('architektur')
    expect(result.view.chapters.map(chapter => chapter.id)).not.toContain('name')
  })

  it('zählt die Kapitel der WERKSTATT, und zwar die abgenommenen', async () => {
    const result = await foundationRoute(event) as unknown as FoundationResponse
    expect(result.accepted.total).toBe(result.chapters.length)
    // Acht Kapitel liegen auf dem Weg, `values` steht auf `active`.
    expect(result.accepted.chapters).toBe(result.chapters.length - 1)
    const values = result.chapters.find(chapter => chapter.stepKey === 'values')!
    expect(values.storedState).toBe('active')
    expect(values.acceptance.total).toBeGreaterThan(0)
  })

  /**
   * DIE GEWÄHLTE RICHTUNG (Paket G4) — die eine Wahrheit ist der BESTÄTIGTE
   * Slot-Wert `result.direction`, nicht `brand_profiles.designPresetId`
   * (Kopf der Route). Der Aufbau oben setzt in jedes Kapitel den Marker-Wert
   * `wert-<slot>-text`, also auch in `result.direction`: die Route darf ihn
   * NICHT durchreichen, denn er ist keine Katalog-Id.
   */
  it('OHNE gültige Wahl steht die Schranke ohne Richtung — der rohe Wert reist nicht', async () => {
    const result = await foundationRoute(event) as unknown as FoundationResponse
    const visual = result.view.chapters.find(chapter => chapter.id === 'visuell')!
    expect(visual.blocks.every(block => (block as { kind: string }).kind === 'locked')).toBe(true)
    expect(JSON.stringify(result)).not.toContain('wert-result.direction')
  })

  it('MIT bestätigter Katalog-Id trägt Kapitel 10 die Richtung', async () => {
    stepRows = stepRows.map(row => (row.stepKey === 'result'
      ? { ...row, slots: JSON.stringify({ 'result.direction': { confirmed: 'calm-natural', accepted: true } }) }
      : row))
    const result = await foundationRoute(event) as unknown as FoundationResponse
    const visual = result.view.chapters.find(chapter => chapter.id === 'visuell')!
    expect(visual.blocks.map(block => (block as { kind: string }).kind))
      .toEqual(['direction', 'swatches', 'locked', 'locked', 'locked', 'locked', 'locked'])
    expect(visual.blocks[0]).toMatchObject({ directionId: 'calm-natural' })
    // Das Kapitel bleibt gesperrt: gewählt ist eine Welt, gebaut wird sie in
    // Brand Design (§11 d).
    expect(visual.state).toBe('locked')
  })

  it('FREMDES BRANDING: 404, wie das Dokument (DECISION-LOG 2026-09-05)', async () => {
    profileRow.ownerId = 'jemand-anderes'
    await expect(foundationRoute(event)).rejects.toMatchObject({ status: 404 })
  })

  it('ÄNDERT NICHTS am Branding — die einzige geschriebene Zeile ist das Ereignis (§2.9/§2.7)', async () => {
    tablesDB.updateRow.mockClear()
    tablesDB.createRow.mockClear()
    await foundationRoute(event)
    expect(tablesDB.updateRow).not.toHaveBeenCalled()
    // Seit Paket G3 zählt der Funnel den Aufruf (`foundation.viewed`). Alles
    // andere bleibt unangetastet: die Zusage ist „keine Wirkung auf die Marke",
    // nicht „kein Schreibzugriff überhaupt" — sonst wäre sie mit dem ersten
    // Messpunkt still verloren.
    const written = tablesDB.createRow.mock.calls.map(([args]) => (args as { tableId: string }).tableId)
    expect(written).toEqual(['brand_events'])
  })

  it('das Ereignis trägt Umfang, KEINEN Inhalt (Regel 1 des Ereignis-Kopfs)', async () => {
    tablesDB.createRow.mockClear()
    await foundationRoute(event)
    const [args] = tablesDB.createRow.mock.calls[0] as unknown as [{ data: Record<string, string> }]
    expect(args.data.type).toBe('foundation.viewed')
    // GEGENPROBE: derselbe wiedererkennbare Wert, der in der Antwort steht,
    // darf im Ereignis nicht auftauchen.
    expect(args.data.payload).not.toContain('wert-')
    expect(JSON.parse(args.data.payload)).toMatchObject({ chapters: expect.any(Number) })
  })

  it('FREMDES BRANDING schreibt auch kein Ereignis', async () => {
    profileRow.ownerId = 'jemand-anderes'
    tablesDB.createRow.mockClear()
    await expect(foundationRoute(event)).rejects.toMatchObject({ status: 404 })
    expect(tablesDB.createRow).not.toHaveBeenCalled()
  })
})
