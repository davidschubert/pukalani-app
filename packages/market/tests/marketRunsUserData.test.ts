import { beforeEach, describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'
import type { FakeMarketDb } from './support/marketRouteKit'
import { FOREIGN_PROFILE, OWNER_ID, OWN_PROFILE, installMarketGlobals, kitEvent, marketWorld } from './support/marketRouteKit'
import { marketDeleteUserData, marketExportUserData } from '../server/utils/marketUserData'
import { removeMarketProfileData } from '../server/utils/marketStore'

/**
 * AUSKUNFT UND LÖSCHUNG DER LAUF-ZEILEN (LL1 d) — `market_runs` trägt seit
 * LL1 d ZWEI Arten: den Vergleichs-Lauf (`run`) und den Bericht-Lauf
 * (`report`). Beide hängen über `subject` am Branding; die Kaskade und der
 * Export filtern NICHT nach `scope`, also gehen beide mit. Dieser Test hält
 * das fest — ein späterer Filter nach `scope` liesse die Bericht-Läufe sonst
 * still zurück.
 */

let db: FakeMarketDb

function runRow(id: string, scope: string, subject: string, detail: Record<string, unknown>) {
  return {
    $id: id,
    scope,
    subject,
    seq: 1,
    startedAt: '2026-11-18T10:00:00.000Z',
    heartbeatAt: '2026-11-18T10:00:30.000Z',
    finishedAt: '2026-11-18T10:00:30.000Z',
    outcome: 'done',
    detail: JSON.stringify(detail),
  }
}

beforeEach(() => {
  db = marketWorld({
    market_runs: [
      runRow('run-own', 'run', OWN_PROFILE, { total: 2, done: 2 }),
      runRow('report-own', 'report', OWN_PROFILE, { booked: true, paid: true, withProfile: 2 }),
      runRow('report-foreign', 'report', FOREIGN_PROFILE, { booked: true, paid: true, withProfile: 1 }),
    ],
  })
  installMarketGlobals({ db, marketConfig: { enabled: true } })
})

const event = () => kitEvent({ who: 'owner' }) as unknown as H3Event

describe('market_runs — beide Arten hängen am Branding', () => {
  it('die Löschung eines Brandings nimmt den Bericht-Lauf mit — und nur den eigenen', async () => {
    await removeMarketProfileData(event(), OWN_PROFILE)
    const left = db.rows('market_runs').map(row => row.$id)
    expect(left).toEqual(['report-foreign'])
  })

  it('die Konto-Löschung nimmt den Bericht-Lauf mit', async () => {
    await marketDeleteUserData(event(), OWNER_ID)
    expect(db.rows('market_runs').map(row => row.$id)).toEqual(['report-foreign'])
  })

  it('die Auskunft enthält den Bericht-Lauf — mit Zeitpunkten, Ausgang und NUR den Zahlen aus `detail`', async () => {
    const exported = await marketExportUserData(event(), OWNER_ID) as {
      brandings: { profileId: string, runs: { scope: string, outcome: string, counts: Record<string, number> }[] }[]
    }
    const own = exported.brandings.find(branding => branding.profileId === OWN_PROFILE)
    expect(own?.runs.map(run => run.scope).sort()).toEqual(['report', 'run'])
    const report = own?.runs.find(run => run.scope === 'report')
    expect(report?.outcome).toBe('done')
    // `booked`/`paid` sind Wahrheitswerte und keine Zahlen — sie gehen nicht hinaus.
    expect(report?.counts).toEqual({ withProfile: 2 })
    expect(exported.brandings.some(branding => branding.profileId === FOREIGN_PROFILE)).toBe(false)
  })
})
