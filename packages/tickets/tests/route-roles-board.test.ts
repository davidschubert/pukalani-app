import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasCapability } from '../../core/shared/authz'
import { resetCommunityWorld, userIdOf } from '../../core/tests/support/participationHarness'
import { describeInstanceRoleGate, probeAs } from '../../core/tests/support/instanceRoleGate'
import { getEffectiveTicketsAiConfig } from '../server/utils/ticketTriage'
import { nextTicketPosition } from '../server/utils/ticketBoard'

/**
 * ROLLEN-PROBEN FÜR DAS TICKET-BOARD: Board, Listen, Einstellungen,
 * Zuweisbare, Beobachtet (OPS-009).
 *
 * Jede Route fragt das INSTANZ-Recht `tickets.manage` (`requirePermission`):
 * entschieden wird über das globale Label. Durch kommen der Betreiber
 * (`admin`) und das Karten-Mitglied (`moderator`); Community-Rollen zählen
 * nicht — ein Owner einer Community ist hier ein Konto wie jedes andere.
 * Das steht je Route ausgeschrieben unten.
 */

const BOARD_STAFF = {
  allow: ['operator', 'staff'],
  deny: ['owner', 'admin', 'moderator', 'editor', 'member'],
} as const

const runtimeConfig = () => ({ public: { appwriteDatabaseId: 'db' } })

const base = {
  globals: {
    useRuntimeConfig: runtimeConfig,
    nextTicketPosition,
  },
}

describeInstanceRoleGate('GET /api/tickets/board', () => import('../server/api/tickets/board.get'), BOARD_STAFF, base)

describeInstanceRoleGate('GET /api/tickets/assignable', () => import('../server/api/tickets/assignable.get'), BOARD_STAFF, base)

describeInstanceRoleGate('GET /api/tickets/watching', () => import('../server/api/tickets/watching.get'), BOARD_STAFF, base)

const loadSettings = () => import('../server/api/tickets/settings.get')
const settingsBase = {
  globals: {
    ...base.globals,
    // Die echte Auflösung (liest `app_config` über die Datentür); nur die
    // KI-Grundeinstellung des Core ist fest.
    getEffectiveTicketsAiConfig,
    getAiConfig: () => ({ enabled: true, model: 'probe/modell', baseUrl: '' }),
    hasCapability,
  },
}

describeInstanceRoleGate('GET /api/tickets/settings', loadSettings, BOARD_STAFF, settingsBase)

describeInstanceRoleGate('POST /api/tickets/lists', () => import('../server/api/tickets/lists/index.post'), BOARD_STAFF, {
  ...base,
  body: { title: 'Neue Liste' },
})

describeInstanceRoleGate('PATCH /api/tickets/lists/:id', () => import('../server/api/tickets/lists/[id].patch'), BOARD_STAFF, {
  ...base,
  params: { id: 'l-1' },
  body: { title: 'Umbenannt' },
})

describeInstanceRoleGate('POST /api/tickets/lists/:id/duplicate', () => import('../server/api/tickets/lists/[id]/duplicate.post'), BOARD_STAFF, {
  ...base,
  params: { id: 'l-1' },
})

describeInstanceRoleGate('POST /api/tickets/lists/:id/sort', () => import('../server/api/tickets/lists/[id]/sort.post'), BOARD_STAFF, {
  ...base,
  params: { id: 'l-1' },
  body: { by: 'alpha' },
})

describe('GET /api/tickets/settings — wer das Modell ändern darf', () => {
  afterEach(() => {
    resetCommunityWorld()
    vi.unstubAllGlobals()
  })

  it('Betreiber: canEditModel = true', async () => {
    const run = await probeAs(loadSettings, 'operator', settingsBase)
    expect(run.status).toBe(200)
    expect(run.result).toMatchObject({ canEditModel: true })
  })

  it('Karten-Mitglied: liest die Einstellungen, canEditModel = false', async () => {
    const run = await probeAs(loadSettings, 'staff', settingsBase)
    expect(run.status).toBe(200)
    expect(run.result).toMatchObject({ canEditModel: false })
  })
})

describe('GET /api/tickets/watching — nur die eigene Beobachtungsliste', () => {
  afterEach(() => {
    resetCommunityWorld()
    vi.unstubAllGlobals()
  })

  it('fragt die Beobachtungen nach dem Konto der Anfrage', async () => {
    const queries: string[] = []
    const run = await probeAs(() => import('../server/api/tickets/watching.get'), 'staff', {
      globals: {
        useRuntimeConfig: runtimeConfig,
        createAdminClient: () => ({
          tablesDB: {
            listRows: async (args: { queries: string[] }) => {
              queries.push(...args.queries)
              return { total: 0, rows: [] }
            },
          },
        }),
      },
    })
    expect(run.status).toBe(200)
    const byUser = queries.filter(query => query.includes('"userId"'))
    expect(byUser).toHaveLength(1)
    expect(byUser[0]).toContain(userIdOf('stranger'))
  })
})
