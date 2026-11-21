import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseSiteProfile, serializeSiteProfile } from '../shared/onboarding'
import { COMMUNITIES_TABLE } from '../shared/types/tenantRecord'
import { COMMUNITY_ID, NEIGHBOUR_COMMUNITY_ID, POOL_PROJECT, jwtOf, probeControlRoute } from './support/controlRouteHarness'
import { clearRuntimeAccounts } from './support/runtimeAccounts'

/**
 * KI-TRAINING JE COMMUNITY (KC1): die Wahl liegt im `profile`-JSON der
 * Community (wie die Hauptsprache, ohne Migration). Gespeichert wird nur
 * `true`; `false` nimmt den Schlüssel heraus; ein fehlendes Feld lässt die
 * Wahl stehen. Die Rollen-Fragen stellt route-roles-seam-community-team.test.ts.
 */

vi.mock('node-appwrite', async importOriginal =>
  (await import('./support/runtimeAccounts')).withFakeAccount(await importOriginal<typeof import('node-appwrite')>()))

afterEach(() => {
  clearRuntimeAccounts()
  vi.unstubAllGlobals()
})

const route = () => import('../server/api/control/community/profile.post')

function storedProfile(run: Awaited<ReturnType<typeof probeControlRoute>>, id = COMMUNITY_ID) {
  const row = run.db.table(COMMUNITIES_TABLE).get(id) as { profile?: string } | undefined
  return parseSiteProfile(row?.profile)
}

describe('parseSiteProfile — aiTraining', () => {
  it('nur ein echtes true zählt, alles andere ist die Vorgabe', () => {
    expect(parseSiteProfile('{"aiTraining":true}').aiTraining).toBe(true)
    expect(parseSiteProfile('{"aiTraining":"true"}').aiTraining).toBeUndefined()
    expect(parseSiteProfile('{"aiTraining":false}').aiTraining).toBeUndefined()
    expect(parseSiteProfile('').aiTraining).toBeUndefined()
  })
})

describe('POST /api/control/community/profile — aiTraining', () => {
  const body = (extra: Record<string, unknown>) => ({ jwt: jwtOf('owner'), communityId: COMMUNITY_ID, name: 'Probe', description: '', ...extra })

  it('Vorgabe: ohne Wahl ist Training aus', async () => {
    const run = await probeControlRoute(route, { secret: 'right', body: body({}) })
    expect(run.status).toBe(200)
    expect((run.result as { aiTraining: boolean }).aiTraining).toBe(false)
    expect(storedProfile(run).aiTraining).toBeUndefined()
  })

  it('Wahl „ja" wird gespeichert — nur an DIESER Community', async () => {
    const run = await probeControlRoute(route, { secret: 'right', body: body({ aiTraining: true }) })
    expect(run.status).toBe(200)
    expect((run.result as { aiTraining: boolean }).aiTraining).toBe(true)
    expect(storedProfile(run).aiTraining).toBe(true)
    expect(storedProfile(run, NEIGHBOUR_COMMUNITY_ID).aiTraining).toBeUndefined()
  })

  const chosen = (db: Parameters<NonNullable<Parameters<typeof probeControlRoute>[1]['seed']>>[0]) =>
    db.seed(COMMUNITIES_TABLE, {
      $id: COMMUNITY_ID, projectId: POOL_PROJECT, name: 'Probe', host: 'c-a.probe.example.test', status: 'active',
      plan: 'personal', openRegistration: false, suspension: '', profile: serializeSiteProfile({ locale: 'de', aiTraining: true }),
    })

  it('ein Speichern OHNE das Feld lässt die Wahl stehen', async () => {
    const run = await probeControlRoute(route, { secret: 'right', seed: chosen, body: body({}) })
    expect(storedProfile(run)).toMatchObject({ aiTraining: true, locale: 'de' })
  })

  it('„nein" nimmt die Wahl zurück, die Hauptsprache bleibt', async () => {
    const run = await probeControlRoute(route, { secret: 'right', seed: chosen, body: body({ aiTraining: false }) })
    expect((run.result as { aiTraining: boolean }).aiTraining).toBe(false)
    expect(storedProfile(run)).toEqual({ locale: 'de' })
  })
})
