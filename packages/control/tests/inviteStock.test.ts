import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { InviteRequestRow } from '../shared/types/inviteRequest'
import { createRaceTablesDB } from './support/raceTablesDB'

/**
 * DIE ZUWEISUNG NIMMT EINEN PLATZ AUS DEM VORRAT — AUCH NEBEN ABGELAUFENEN.
 *
 * `assignCode` sucht den ältesten freien Platz. Bis 2026-11-17 holte die
 * Abfrage die zehn ältesten freien Plätze und sortierte Abgelaufene erst
 * danach aus. Sobald zehn alte Plätze abgelaufen waren, fand die Zuweisung
 * keinen mehr, legte jedes Mal einen neuen Code daneben an, und der Vorrat
 * schrumpfte nie (lokal gemessen mit verify-invite-stock: „4 → 4", der
 * zugewiesene Code NEU angelegt). Gefälschte Ablage mit echter Auswertung der
 * Abfragen, echte Funktion: geprüft wird, welche Zeile danach gebunden ist.
 */

const race = createRaceTablesDB()
const NOW = Date.parse('2026-11-17T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({ tablesDB: race.tablesDB }))
vi.stubGlobal('logEvent', () => {})

const { assignCode } = await import('../server/utils/inviteRequests')
const event = {} as H3Event

function slot(id: string, expiresAt: string | null) {
  race.seed('invite_codes', {
    $id: id, codeHash: 'h'.repeat(64), label: '', maxUses: 1, uses: 0,
    expiresAt, status: 'active', boundEmail: '', requestId: '',
  })
}

function request(email: string): InviteRequestRow {
  race.seed('invite_requests', { $id: `req-${email}`, email, status: 'new', reminders: 0 })
  return { $id: `req-${email}`, email, status: 'new', reminders: 0 } as unknown as InviteRequestRow
}

describe('assignCode — Platz aus dem Vorrat', () => {
  beforeEach(() => race.reset())

  it('findet den freien Platz hinter zwölf abgelaufenen älteren', async () => {
    for (let i = 0; i < 12; i++) slot(`expired-${i}`, new Date(NOW - DAY).toISOString())
    slot('fresh', new Date(NOW + 30 * DAY).toISOString())

    const result = await assignCode(event, request('ada@example.test'), {}, NOW)

    expect(result).toMatchObject({ codeId: 'fresh', fromStock: true })
    expect(race.table('invite_codes').size).toBe(13)
    expect(race.table('invite_codes').get('fresh')?.boundEmail).toBe('ada@example.test')
  })

  it('nimmt auch einen Platz ohne Ablaufdatum', async () => {
    for (let i = 0; i < 12; i++) slot(`expired-${i}`, new Date(NOW - DAY).toISOString())
    slot('open', null)

    const result = await assignCode(event, request('bea@example.test'), {}, NOW)

    expect(result).toMatchObject({ codeId: 'open', fromStock: true })
  })

  it('weist nie einen abgelaufenen Platz zu — ist nur der da, entsteht ein neuer Code', async () => {
    slot('expired', new Date(NOW - DAY).toISOString())

    const result = await assignCode(event, request('cem@example.test'), {}, NOW)

    expect(result.fromStock).toBe(false)
    expect(result.codeId).not.toBe('expired')
    expect(race.table('invite_codes').get('expired')?.boundEmail).toBe('')
    expect(race.table('invite_codes').size).toBe(2)
  })
})
