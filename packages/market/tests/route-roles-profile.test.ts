import { expect } from 'vitest'
import type { FakeMarketDb, MarketWho } from './support/marketRouteKit'
import {
  FOREIGN_PROFILE,
  OWNER_ID,
  OWN_PROFILE,
  describeOwnedMarketRoute,
  marketWorld,
  writeCalls,
} from './support/marketRouteKit'

/**
 * ROLLEN AN DEN ÜBRIGEN BRANDING-ROUTEN (OPS-009, BT1 b) — die Auswahl-Liste
 * der Quellen (`GET /candidates`), die freiwillige Bewertung
 * (`POST /rating`) und das Opt-in (`PATCH /visibility`): die ECHTEN Handler
 * mit der ECHTEN Zugangs-Kette. Nachgebaut ist nur die Datenbank.
 *
 * WER DURCH DARF, AUSGESCHRIEBEN: nur der Besitzer des Brandings.
 */

const PASSES: Readonly<Record<MarketWho, boolean>> = {
  guest: false,
  noAccess: false,
  stranger: false,
  owner: true,
}

/** Ein zweites Branding des Besitzers — die Quelle, die `foundation` anbieten darf. */
function world(): FakeMarketDb {
  return marketWorld({
    brand_profiles: [
      { $id: 'p-own-2', ownerType: 'user', ownerId: OWNER_ID, title: 'Zweite Marke', contentLocale: 'de' },
    ],
  })
}

describeOwnedMarketRoute('GET /candidates?source=foundation', () => import('../server/api/market/profiles/[id]/candidates.get'), {
  method: 'GET',
  passes: PASSES,
  world,
  probe: { query: { source: 'foundation' } },
  passed: (run) => {
    const ids = (run.result as { options: { id: string }[] }).options.map(option => option.id)
    // Nur die EIGENEN Brandings, ohne das gerade offene — nie ein fremdes.
    expect(ids).toEqual(['p-own-2'])
    expect(ids).not.toContain(FOREIGN_PROFILE)
    expect(writeCalls(run.calls)).toEqual([])
  },
})

describeOwnedMarketRoute('POST /rating', () => import('../server/api/market/profiles/[id]/rating.post'), {
  method: 'POST',
  passes: PASSES,
  world,
  probe: { body: { score: 4 } },
  passed: (run) => {
    expect(run.result).toEqual({ counted: true })
    expect(writeCalls(run.calls)).toHaveLength(1)
    expect(writeCalls(run.calls)[0]?.op).toBe('create')
  },
})

describeOwnedMarketRoute('PATCH /visibility', () => import('../server/api/market/profiles/[id]/visibility.patch'), {
  method: 'PATCH',
  passes: PASSES,
  world,
  probe: { body: { marketVisibility: 'shared' } },
  passed: (run, db) => {
    expect(run.result).toEqual({ marketVisibility: 'shared' })
    expect(writeCalls(run.calls)).toEqual([{ op: 'update', table: 'brand_profiles', rowId: OWN_PROFILE }])
    expect(db.tables.get('brand_profiles')!.get(FOREIGN_PROFILE)!.marketVisibility).toBeUndefined()
  },
})
