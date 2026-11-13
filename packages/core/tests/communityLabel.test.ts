import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

/**
 * COMMUNITY-LABEL: VERGABE BLEIBT FAIL-SOFT, ENTZUG MELDET SEIN ERGEBNIS
 * (SEC-024, 2026-11-13).
 *
 * Bis dahin warf `revokeCommunityLabel` nie und gab nichts zurück — die
 * Entfernen-Route antwortete `ok`, auch wenn das Lese-Publikum blieb. Jetzt
 * läuft jeder Schreibvorgang über den EINEN Schreiber (`mutateUserLabels`),
 * und der Entzug sagt, ob er gehalten hat.
 *
 * Gestubbt sind nur die Auto-Imports hinter der Naht: der Admin-Client
 * (Konto-Speicher), `logEvent` und der Handle-Entzug.
 */

let stored: string[] = []
let failWrites = 0
const updateLabels = vi.fn(async ({ labels }: { userId: string, labels: string[] }) => {
  if (failWrites > 0) {
    failWrites--
    throw new Error('Appwrite hiccup')
  }
  stored = [...labels]
  return { labels: [...stored] }
})
const get = vi.fn(async ({ userId }: { userId: string }) => ({ $id: userId, labels: [...stored] }))
const revokeAccountHandleAudience = vi.fn(async () => {})
const logs: Array<{ level: string, name: string }> = []

vi.stubGlobal('createAdminClient', () => ({ users: { get, updateLabels } }))
vi.stubGlobal('logEvent', (level: string, name: string) => { logs.push({ level, name }) })
vi.stubGlobal('revokeAccountHandleAudience', revokeAccountHandleAudience)

const { grantCommunityLabel, revokeCommunityLabel, setCommunityModeratorLabel } = await import('../server/utils/communityLabel')

function eventFor(userId = 'operator1', labels: string[] = ['admin']): H3Event {
  return { context: { user: { $id: userId, labels } } } as unknown as H3Event
}

describe('revokeCommunityLabel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    logs.length = 0
    failWrites = 0
  })

  it('nimmt Zugehörigkeit UND Moderations-Label, lässt Betreiber-Rolle und andere Communities stehen', async () => {
    stored = ['admin', 'cOther', 'cA', 'modcA']
    const result = await revokeCommunityLabel(eventFor(), 'cA', 'u-gone')
    expect(result).toEqual({ revoked: true })
    expect(stored).toEqual(['admin', 'cOther'])
    expect(revokeAccountHandleAudience).toHaveBeenCalledWith(expect.anything(), 'u-gone', 'cA')
  })

  it('heilt einen einzelnen Schreibfehler selbst (zweiter Versuch)', async () => {
    stored = ['cA']
    failWrites = 1
    const result = await revokeCommunityLabel(eventFor(), 'cA', 'u-gone')
    expect(result).toEqual({ revoked: true })
    expect(stored).toEqual([])
  })

  it('meldet einen endgültigen Fehlschlag als Ergebnis — und protokolliert ihn', async () => {
    stored = ['cA']
    failWrites = 2
    const result = await revokeCommunityLabel(eventFor(), 'cA', 'u-gone')
    expect(result.revoked).toBe(false)
    expect(stored).toEqual(['cA'])
    expect(logs).toContainEqual({ level: 'error', name: 'community_label.revoke_failed' })
  })

  it('nichts wegzunehmen ist Erfolg', async () => {
    stored = ['cOther']
    const result = await revokeCommunityLabel(eventFor(), 'cA', 'u-gone')
    expect(result).toEqual({ revoked: true })
    expect(updateLabels).not.toHaveBeenCalled()
  })

  it('ein gelöschtes Konto trägt kein Label mehr — Erfolg', async () => {
    get.mockRejectedValueOnce(Object.assign(new Error('User not found'), { code: 404 }))
    const result = await revokeCommunityLabel(eventFor(), 'cA', 'u-deleted')
    expect(result).toEqual({ revoked: true })
  })

  it('verweigert ein Betreiber-Label als Community-Id und sagt es (kein stilles „ok")', async () => {
    stored = ['admin']
    const result = await revokeCommunityLabel(eventFor(), 'admin', 'u-gone')
    expect(result.revoked).toBe(false)
    expect(stored).toEqual(['admin'])
  })

  it('läuft ohne Request (Abgleich-Lauf): `event` darf fehlen', async () => {
    stored = ['cA', 'moderator']
    const result = await revokeCommunityLabel(undefined, 'cA', 'u-gone')
    expect(result).toEqual({ revoked: true })
    expect(stored).toEqual(['moderator'])
  })
})

describe('grantCommunityLabel / setCommunityModeratorLabel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    logs.length = 0
    failWrites = 0
  })

  it('Vergabe wirft nie, auch wenn beide Versuche scheitern', async () => {
    stored = []
    failWrites = 2
    await expect(grantCommunityLabel(eventFor('u1', []), 'cA')).resolves.toBeUndefined()
    expect(logs).toContainEqual({ level: 'error', name: 'community_label.failed' })
  })

  it('Vergabe ergänzt nur und schreibt den neuen Stand in den Request-Kontext', async () => {
    stored = ['moderator', 'cX']
    const event = eventFor('u1', ['moderator', 'cX'])
    await grantCommunityLabel(event, 'cA')
    expect(stored).toEqual(['moderator', 'cX', 'cA'])
    expect((event.context.user as { labels: string[] }).labels).toEqual(['moderator', 'cX', 'cA'])
  })

  it('Moderations-Label folgt der Rolle über denselben Schreiber', async () => {
    stored = ['cA']
    await setCommunityModeratorLabel(eventFor('u1', ['cA']), 'cA', true)
    expect(stored).toEqual(['cA', 'modcA'])
    await setCommunityModeratorLabel(eventFor('u1', ['cA', 'modcA']), 'cA', false)
    expect(stored).toEqual(['cA'])
  })
})
