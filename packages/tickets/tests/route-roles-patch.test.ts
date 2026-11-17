import type { H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeRoleGateToDoor, resetCommunityWorld } from '../../core/tests/support/participationHarness'
import { ticketPatchSchema } from '../schemas/ticket'

/**
 * PATCH /api/tickets/:id — Rollen-Tor und Herkunft unter Gleichzeitigkeit
 * (OPS-009, SEC-038, RU1 e).
 */

const load = () => import('../server/api/tickets/[id].patch')

const OPERATOR_TICKET = {
  $id: 't-1',
  title: 'Titel',
  description: 'Text vom Betreiber',
  checklist: '',
  origin: 'operator',
  listId: 'l-1',
  status: 'open',
  membersJson: '',
}

describeRoleGateToDoor('PATCH /api/tickets/:id', load, {
  allow: ['operator'],
  deny: ['owner', 'admin', 'moderator', 'editor', 'member'],
}, {
  params: { id: 't-1' },
  body: { title: 'Neu' },
  globals: {
    useRuntimeConfig: () => ({ public: { appwriteDatabaseId: 'db' } }),
    requireTicketExists: async () => ({ ...OPERATOR_TICKET }),
  },
})

afterEach(() => {
  resetCommunityWorld()
  vi.unstubAllGlobals()
})

/**
 * ZWEI GLEICHZEITIGE BEARBEITUNGEN, beide lesen VOR dem ersten Schreiben
 * (Schranke in der Attrappe): A ist ein Text-Edit ohne Betreiber-Rolle, B ein
 * Edit eines Betreibers. Die Attrappe schreibt wie Appwrite TEILWEISE
 * (`updateRow` ändert nur die übergebenen Spalten).
 *
 * WARUM DAS OHNE SPERRE HÄLT (und deshalb keine gebaut ist): die Route
 * schreibt `origin` NUR, wenn sich der Wert ändert, und `originAfterTextEdit`
 * kennt nur eine Änderung — `operator` ⇒ `staff`. Ein veralteter Lesestand
 * kann also nie eine bessere Herkunft zurückschreiben; der ungünstigste Fall
 * ist, dass ein Betreiber-Text unter `staff` steht (sicher). Gegenprobe:
 * schreibt die Route `origin` bei jedem Text-Edit (`data.origin = nextOrigin`
 * ohne die Bedingung), endet die Reihenfolge „A schreibt, dann B" mit
 * `operator` über dem Text von A — dieser Test wird rot.
 */
async function racePatches(order: 'A-then-B' | 'B-then-A', bBody: Record<string, unknown>) {
  const row: Record<string, unknown> = { ...OPERATOR_TICKET }
  let reads = 0
  let releaseReads!: () => void
  const bothRead = new Promise<void>((resolve) => { releaseReads = resolve })
  const writeTurn: Record<'A' | 'B', Promise<void>> = { A: Promise.resolve(), B: Promise.resolve() }
  let releaseSecond!: () => void
  const secondMayWrite = new Promise<void>((resolve) => { releaseSecond = resolve })
  const first = order === 'A-then-B' ? 'A' : 'B'
  writeTurn[first === 'A' ? 'B' : 'A'] = secondMayWrite

  const tablesDB = (who: 'A' | 'B') => ({
    getRow: async () => {
      reads += 1
      if (reads === 2) releaseReads()
      await bothRead
      return { ...row }
    },
    updateRow: async ({ data }: { data: Record<string, unknown> }) => {
      await writeTurn[who]
      Object.assign(row, data)
      if (who === first) releaseSecond()
      return { ...row }
    },
  })

  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('requirePermission', (event: H3Event) => event.context.user)
  vi.stubGlobal('getRouterParam', () => 't-1')
  vi.stubGlobal('readValidatedBody', async (event: H3Event, parse: (b: unknown) => unknown) => parse(event.context.body))
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'db' } }))
  vi.stubGlobal('createAdminClient', (event: H3Event) => ({ tablesDB: tablesDB(event.context.who as 'A' | 'B') }))
  vi.stubGlobal('requireTicketExists', async (event: H3Event) => await tablesDB(event.context.who as 'A' | 'B').getRow())
  vi.stubGlobal('toH3Error', (e: unknown) => e)
  vi.stubGlobal('createError', (init: Record<string, unknown>) => Object.assign(new Error(String(init.statusText)), init))
  vi.stubGlobal('notifyTicketPeople', async () => {})
  vi.stubGlobal('notify', async () => {})

  const handler = (await load()).default as unknown as (e: H3Event) => Promise<unknown>
  const eventOf = (who: 'A' | 'B', labels: string[], body: unknown) =>
    ({ context: { who, body, user: { $id: `u-${who}`, labels } } }) as unknown as H3Event

  await Promise.all([
    handler(eventOf('A', [], { description: 'Text ohne Betreiber-Rolle' })),
    handler(eventOf('B', ['admin'], bBody)),
  ])
  return row
}

describe('PATCH /api/tickets/:id — Herkunft bei gleichzeitigen Bearbeitungen', () => {
  it('die Attrappe nimmt dieselben Bodies wie das echte Schema', () => {
    expect(() => ticketPatchSchema.parse({ description: 'x' })).not.toThrow()
    expect(() => ticketPatchSchema.parse({ title: 'x' })).not.toThrow()
  })

  for (const order of ['A-then-B', 'B-then-A'] as const) {
    for (const [what, bBody] of [
      ['Betreiber ändert den Titel', { title: 'Titel vom Betreiber' }],
      // Status lädt den Vorzustand (Benachrichtigung) — ein Edit, der liest, ohne Text zu ändern.
      ['Betreiber setzt den Status', { status: 'done' }],
    ] as const) {
      it(`${order}, ${what}: Text ohne Betreiber-Rolle steht nie unter „operator"`, async () => {
        const row = await racePatches(order, bBody)
        expect(row.description).toBe('Text ohne Betreiber-Rolle')
        expect(row.origin).toBe('staff')
      })
    }
  }
})
