import type { H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetCommunityWorld, userIdOf } from '../../core/tests/support/participationHarness'
import { describeInstanceRoleGate, probeAs } from '../../core/tests/support/instanceRoleGate'
import { nextTicketPosition, requireTicketExists, requireTicketList } from '../server/utils/ticketBoard'

/**
 * ROLLEN-PROBEN FÜR DIE KARTEN DES TICKET-BOARDS: Anlegen, Duplizieren,
 * Triage, Beobachten, Anhänge (OPS-009).
 *
 * Jede Route fragt das INSTANZ-Recht `tickets.manage` (`requirePermission`).
 * Durch kommen der Betreiber (`admin`) und das Karten-Mitglied
 * (`moderator`); Community-Rollen zählen nicht. Die Helfer, die vor dem
 * Schreiben lesen (`requireTicketExists`, `requireTicketList`), laufen echt
 * und öffnen dabei die Datentür.
 */

const CARD_STAFF = {
  allow: ['operator', 'staff'],
  deny: ['owner', 'admin', 'moderator', 'editor', 'member'],
} as const

const runtimeConfig = () => ({ public: { appwriteDatabaseId: 'db' } })

const base = {
  params: { id: 't-1' },
  globals: {
    useRuntimeConfig: runtimeConfig,
    requireTicketExists,
    requireTicketList,
    nextTicketPosition,
  },
}

describeInstanceRoleGate('POST /api/tickets', () => import('../server/api/tickets/index.post'), CARD_STAFF, {
  ...base,
  body: { listId: 'l-1', title: 'Neue Karte' },
})

describeInstanceRoleGate('POST /api/tickets/:id/duplicate', () => import('../server/api/tickets/[id]/duplicate.post'), CARD_STAFF, base)

describeInstanceRoleGate('POST /api/tickets/:id/triage', () => import('../server/api/tickets/[id]/triage.post'), CARD_STAFF, {
  ...base,
  globals: {
    ...base.globals,
    // Die KI-Triage selbst ist nicht Gegenstand: geprüft wird das Tor der
    // Route. Ihr erster Schritt hinter dem Tor ist das Lesen des Tickets.
    triageTicket: async (event: H3Event, id: string) => await requireTicketExists(event, id),
  },
})

describeInstanceRoleGate('POST /api/tickets/:id/watch', () => import('../server/api/tickets/[id]/watch.post'), CARD_STAFF, base)

describeInstanceRoleGate('DELETE /api/tickets/:id/watch', () => import('../server/api/tickets/[id]/watch.delete'), CARD_STAFF, base)

describeInstanceRoleGate('GET /api/tickets/:id/files', () => import('../server/api/tickets/[id]/files.get'), CARD_STAFF, base)

describeInstanceRoleGate('POST /api/tickets/:id/files', () => import('../server/api/tickets/[id]/files.post'), CARD_STAFF, base)

describeInstanceRoleGate('DELETE /api/tickets/files/:fileId', () => import('../server/api/tickets/files/[fileId].delete'), CARD_STAFF, {
  ...base,
  params: { fileId: 'f-1' },
})

describe('DELETE /api/tickets/:id/watch — löscht nur die eigene Beobachtung', () => {
  afterEach(() => {
    resetCommunityWorld()
    vi.unstubAllGlobals()
  })

  it('sucht die Zeile nach Ticket UND Konto der Anfrage', async () => {
    const queries: string[] = []
    const deleted: string[] = []
    const run = await probeAs(() => import('../server/api/tickets/[id]/watch.delete'), 'operator', {
      params: { id: 't-1' },
      globals: {
        useRuntimeConfig: runtimeConfig,
        createAdminClient: () => ({
          tablesDB: {
            listRows: async (args: { queries: string[] }) => {
              queries.push(...args.queries)
              return { total: 1, rows: [{ $id: 'w-eigen' }] }
            },
            deleteRow: async (args: { rowId: string }) => { deleted.push(args.rowId) },
          },
        }),
      },
    })
    expect(run.status).toBe(200)
    expect(queries.some(query => query.includes('"ticketId"') && query.includes('t-1'))).toBe(true)
    expect(queries.some(query => query.includes('"userId"') && query.includes(userIdOf('operator')))).toBe(true)
    expect(deleted).toEqual(['w-eigen'])
  })
})
