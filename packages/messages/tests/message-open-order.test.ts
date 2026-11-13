import { afterEach, describe, expect, it, vi } from 'vitest'
import { RECIPIENT_UNAVAILABLE_CODE, MESSAGES_DISABLED_CODE } from '../shared/messageErrors'
import { runRoute } from './support/messageRouteHarness'

/**
 * SEC-036 Punkte 2 und 3 — ERÖFFNEN VERRÄT NICHT, WER HIER IST (P05, 2026-11-13).
 *
 *  2. Ist das Produkt aus, bekommen bekannte und unbekannte Handles dieselbe
 *     Antwort, und der Handle wird gar nicht erst aufgelöst. Unbekannt und
 *     „bekannt, aber nicht anschreibbar" enden gleich.
 *  3. Nur ein 403 der Rechte-Wache wird zum einheitlichen Code. Eine STÖRUNG
 *     der Rollen-Auflösung wird protokolliert und als 503 gemeldet.
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

const openRoute = () => import('../server/api/messages/index.post')

describe('Owner-Schalter vor der Handle-Auflösung', () => {
  it('bekannter und unbekannter Handle: dieselbe Antwort, keine Auflösung', async () => {
    const known = await runRoute(openRoute, { who: 'member', enabled: false, body: { handle: 'handle', body: 'Hallo' } })
    const unknown = await runRoute(openRoute, { who: 'member', enabled: false, body: { handle: 'niemand', body: 'Hallo' } })
    expect(known.status).toBe(403)
    expect(known.error?.data?.code).toBe(MESSAGES_DISABLED_CODE)
    expect(unknown.error).toEqual(known.error)
    expect(known.handleLookups).toBe(0)
    expect(unknown.handleLookups).toBe(0)
  })
})

describe('Empfänger nicht verfügbar', () => {
  it('unbekannter Handle und bekannter ohne Recht zum Eröffnen enden gleich', async () => {
    const unknown = await runRoute(openRoute, { who: 'member', permission: 'deny', body: { handle: 'niemand', body: 'Hallo' } })
    const known = await runRoute(openRoute, { who: 'member', permission: 'deny', body: { handle: 'handle', body: 'Hallo' } })
    expect(unknown.status).toBe(403)
    expect(unknown.error?.data?.code).toBe(RECIPIENT_UNAVAILABLE_CODE)
    expect(known.error).toEqual(unknown.error)
  })
})

describe('requireMayOpenConversation: 403 gegen Störung', () => {
  it('403 der Rechte-Wache: einheitlicher Code, kein Fehler-Log', async () => {
    const run = await runRoute(openRoute, { who: 'member', permission: 'deny', body: { handle: 'handle', body: 'Hallo' } })
    expect(run.status).toBe(403)
    expect(run.error?.data?.code).toBe(RECIPIENT_UNAVAILABLE_CODE)
    expect(run.logs.filter(log => log.level === 'error')).toHaveLength(0)
  })

  it('Ausfall der Rollen-Auflösung: genau eine Log-Zeile und 503 ohne Details', async () => {
    const run = await runRoute(openRoute, { who: 'member', permission: 'fail', body: { handle: 'handle', body: 'Hallo' } })
    expect(run.status).toBe(503)
    expect(run.error?.data?.code).toBeUndefined()
    expect(run.error?.statusText).not.toContain('resolver')
    const errors = run.logs.filter(log => log.level === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0]!.name).toBe('messages.permission_lookup_failed')
    expect(run.tables.conversations!.some(row => String(row.$id).startsWith('new-'))).toBe(false)
  })
})
