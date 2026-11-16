import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'

/**
 * DER EINE SCHREIBER DES BETREIBER-PROTOKOLLS (BE-021, 2026-11-16).
 *
 * Bis hierher schluckten `recordAudit` und `logAuthEvent` jeden Schreibfehler
 * mit leerem `catch` — ein Protokoll, das seit Tagen nichts mehr annimmt, sah
 * aus wie ein ruhiger Tag. Jetzt: genau EINE Zeile `audit.write_failed` je
 * Ausfall (ohne Namen, ohne Personen-Ids, ohne rohe Meldung), und im
 * strikten Modus (Herausgabe von Personendaten) ein 503 mit Grund.
 */

let createRow: (args: { data: Record<string, unknown> }) => Promise<unknown>
const rows: Record<string, unknown>[] = []
const logs: Array<{ level: string, event: string, data: Record<string, unknown> }> = []

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteDatabaseId: 'main' } }))
vi.stubGlobal('createAdminClient', () => ({
  tablesDB: { createRow: (args: { data: Record<string, unknown> }) => createRow(args) },
  users: { get: async () => ({ name: 'Erika Beispiel' }) },
}))
vi.stubGlobal('trustedClientIp', () => '203.0.113.9')
vi.stubGlobal('logEvent', (level: string, event: string, data: Record<string, unknown> = {}) => { logs.push({ level, event, data }) })
vi.stubGlobal('createError', (init: Record<string, unknown>) =>
  Object.assign(new Error(String(init.statusText)), init, { statusCode: init.status }))

const { auditFailureFields, writeAuditLog } = await import('../server/utils/auditLog')
vi.stubGlobal('writeAuditLog', writeAuditLog)
const { logAuthEvent } = await import('../server/utils/authAudit')

const event = { context: {} } as unknown as H3Event
const row = {
  actorId: 'betreiber-1',
  actorName: 'Max Betreiber',
  action: 'user.exported',
  targetType: 'user',
  targetId: 'person-42',
  targetName: 'Erika Beispiel',
}

beforeEach(() => {
  rows.length = 0
  logs.length = 0
  createRow = async ({ data }) => { rows.push(data); return {} }
})

describe('writeAuditLog', () => {
  it('schreibt die Zeile mit IP vom eigenen Proxy und serialisierten Metadaten', async () => {
    expect(await writeAuditLog(event, { ...row, metadata: { searched: true } })).toBe(true)
    expect(rows).toEqual([{ ...row, metadata: '{"searched":true}', ip: '203.0.113.9' }])
    expect(logs).toEqual([])
  })

  it('leere Metadaten werden zur leeren Zeichenkette', async () => {
    await writeAuditLog(event, { ...row, metadata: {} })
    expect(rows[0]!.metadata).toBe('')
  })

  it('Fehler ⇒ GENAU EINE Zeile audit.write_failed, ohne Namen, Ids und rohe Meldung; Rückgabe false', async () => {
    createRow = async () => { throw new AppwriteException('Unknown attribute: "targetName" in table audit_logs', 400, 'document_invalid_structure') }
    expect(await writeAuditLog(event, row)).toBe(false)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toEqual({
      level: 'error',
      event: 'audit.write_failed',
      data: { action: 'user.exported', targetType: 'user', strict: false, status: 400, type: 'document_invalid_structure' },
    })
    const line = JSON.stringify(logs[0])
    for (const secret of ['Max Betreiber', 'Erika Beispiel', 'person-42', 'betreiber-1', 'Unknown attribute', '203.0.113.9']) {
      expect(line).not.toContain(secret)
    }
  })

  it('strikt ⇒ 503 mit Grund audit_unavailable — und trotzdem genau eine Zeile im Log', async () => {
    createRow = async () => { throw new Error('fetch failed') }
    await expect(writeAuditLog(event, row, { strict: true })).rejects.toMatchObject({
      status: 503,
      data: { code: 'audit_unavailable' },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]!.data).toMatchObject({ strict: true, status: null, type: null })
  })

  it('auch ein Fehler VOR dem Schreiben (Client nicht baubar) wird gemeldet statt geworfen', async () => {
    vi.stubGlobal('createAdminClient', () => { throw new Error('kein Schlüssel') })
    expect(await writeAuditLog(event, row)).toBe(false)
    expect(logs.map(entry => entry.event)).toEqual(['audit.write_failed'])
    vi.stubGlobal('createAdminClient', () => ({
      tablesDB: { createRow: (args: { data: Record<string, unknown> }) => createRow(args) },
      users: { get: async () => ({ name: 'Erika Beispiel' }) },
    }))
  })
})

describe('auditFailureFields — nur kurze Kennungen', () => {
  it('nimmt Status und type eines AppwriteException, verwirft einen type in fremder Form', () => {
    expect(auditFailureFields(new AppwriteException('x', 401, 'general_unauthorized_scope'))).toEqual({ status: 401, type: 'general_unauthorized_scope' })
    expect(auditFailureFields(new AppwriteException('x', 500, 'Böse Meldung mit Leerzeichen'))).toEqual({ status: 500, type: null })
    expect(auditFailureFields(new Error('irgendwas'))).toEqual({ status: null, type: null })
  })
})

describe('logAuthEvent — Auth blockiert nie, meldet aber den Ausfall', () => {
  it('schreibt über den einen Schreiber', async () => {
    await logAuthEvent(event, 'user.login', { userId: 'u1', method: 'password' })
    expect(rows).toEqual([expect.objectContaining({ actorId: 'u1', actorName: 'Erika Beispiel', action: 'user.login', metadata: '{"method":"password"}' })])
  })

  it('Schreibfehler ⇒ kein Wurf, eine Zeile audit.write_failed', async () => {
    createRow = async () => { throw new AppwriteException('nope', 404, 'table_not_found') }
    await expect(logAuthEvent(event, 'user.login', { userId: 'u1', name: 'X' })).resolves.toBeUndefined()
    expect(logs).toHaveLength(1)
    expect(logs[0]!.data).toMatchObject({ action: 'user.login', strict: false, status: 404, type: 'table_not_found' })
  })
})
