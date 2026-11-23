import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { AppwriteException } from 'node-appwrite'
import { isAppwriteUserMissing } from '../../core/server/utils/userDataOrchestration'

/**
 * „KONTO WEG" IST EIN 404, NICHT JEDER FEHLER (SEC-026, Nachtrag).
 *
 * `erasureIdentity` las das Konto mit `.catch(() => null)`. Jeder Fehler —
 * ein 500, ein Netz-Wackler — hiess damit „Konto schon weg, keine Adresse",
 * und die Löschung im Control Plane lief OHNE Adresse: Einladungen an diese
 * Adresse und Early-Access-Anfragen blieben still stehen. Jetzt ist nur das
 * 404 für den Nutzer „weg"; alles andere bricht die Löschung ab.
 *
 * Der Export darf weiter degradieren, wenn das Control Plane nicht antwortet
 * — aber SICHTBAR: `{ unavailable: true }` statt eines leeren Objekts, das wie
 * „keine Mitgliedschaften" aussieht.
 */

let getUser: () => Promise<unknown>
let controlError: unknown
let previewRetained: Array<{ communityId: string, communityName: string, role: string, reason: string }> = []
let controlAvailable = true
const controlCalls: { path: string, body: Record<string, unknown> }[] = []

vi.mock('../server/utils/controlPlane', () => ({
  callControlPlane: async (_event: H3Event, path: string, body: Record<string, unknown>) => {
    controlCalls.push({ path, body })
    if (controlError) throw controlError
    if (path.endsWith('user-erase-preview')) return { retained: previewRetained }
    if (path.endsWith('user-erase')) {
      return { deleted: 1, invitesDeleted: 0, inviteRequestsDeleted: 0, anonymized: 0, invitesAnonymized: 0, inviteCodesAnonymized: 2, retained: [] }
    }
    return { memberships: [] }
  },
}))

vi.stubGlobal('useRuntimeConfig', () => ({ public: { appwriteProjectId: 'account' } }))
vi.stubGlobal('createAdminClient', () => ({ users: { get: async () => getUser() } }))
vi.stubGlobal('controlServiceAvailable', async () => controlAvailable)
vi.stubGlobal('isAppwriteUserMissing', isAppwriteUserMissing)
vi.stubGlobal('logEvent', () => {})

const { communityDeleteUserData, communityDeletionWarnings, communityExportUserData, SOLE_OWNER_WARNING_KEY } = await import('../server/utils/communityUserData')

const event = { context: {} } as unknown as H3Event

beforeEach(() => {
  getUser = async () => ({ $id: 'u1', email: 'a@example.com', emailVerification: true })
  controlError = undefined
  controlCalls.length = 0
  previewRetained = []
  controlAvailable = true
})

describe('communityDeleteUserData', () => {
  it('Normalfall: die bestätigte Adresse geht mit', async () => {
    await communityDeleteUserData(event, 'u1')
    expect(controlCalls[0]!.body.email).toBe('a@example.com')
  })

  it('geleerte Adressen an Early-Access-Codes zählen als anonymisiert (SEC-026)', async () => {
    expect(await communityDeleteUserData(event, 'u1')).toEqual({ deleted: 1, anonymized: 2 })
  })

  it('users.get mit 500 ⇒ Abbruch, das Control Plane wird NICHT ohne Adresse gerufen', async () => {
    getUser = async () => { throw new AppwriteException('Server Error', 500, 'general_unknown') }
    await expect(communityDeleteUserData(event, 'u1')).rejects.toThrow('Server Error')
    expect(controlCalls).toEqual([])
  })

  it('users.get mit 404 ⇒ Konto weg, Löschung läuft ohne Adresse weiter', async () => {
    getUser = async () => { throw new AppwriteException('User not found', 404, 'user_not_found') }
    await expect(communityDeleteUserData(event, 'u1')).resolves.toMatchObject({ deleted: 1 })
    expect(controlCalls[0]!.body.email).toBeUndefined()
  })
})

describe('communityExportUserData', () => {
  it('Control Plane nicht erreichbar ⇒ sichtbar „nicht verfügbar"', async () => {
    controlError = new Error('fetch failed')
    expect(await communityExportUserData(event, 'u1')).toEqual({ unavailable: true })
  })
})

describe('communityDeletionWarnings — vorher sagen, was ohne Inhaber dastünde', () => {
  it('einziger Owner: eine Warnung mit den Namen, je Community einmal', async () => {
    previewRetained = [
      { communityId: 'c1', communityName: 'Probe Eins', role: 'owner', reason: 'last_owner' },
      { communityId: 'c2', communityName: 'Probe Zwei', role: 'owner', reason: 'last_owner' },
    ]
    expect(await communityDeletionWarnings(event, 'u1')).toEqual([
      { key: SOLE_OWNER_WARNING_KEY, textKey: 'onboarding.accountDelete.soleOwnerText', items: ['Probe Eins', 'Probe Zwei'] },
    ])
    // fragt für GENAU dieses Konto im eigenen Projekt — ohne Adresse, die Vorschau braucht keine
    expect(controlCalls).toEqual([{
      path: '/api/control/community/members/user-erase-preview',
      body: { runtimeProjectId: 'account', runtimeUserId: 'u1' },
    }])
  })

  it('Gegenprobe: nichts zurückgehalten ⇒ keine Warnung', async () => {
    expect(await communityDeletionWarnings(event, 'u1')).toEqual([])
  })

  it('ohne Naht (Silo): keine Warnung und kein Ruf', async () => {
    controlAvailable = false
    expect(await communityDeletionWarnings(event, 'u1')).toEqual([])
    expect(controlCalls).toEqual([])
  })

  it('Naht gestört: wirft (der core meldet die Liste dann als unvollständig)', async () => {
    controlError = new Error('naht down')
    await expect(communityDeletionWarnings(event, 'u1')).rejects.toThrow('naht down')
  })
})
