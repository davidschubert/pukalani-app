import { beforeEach, describe, expect, it } from 'vitest'
import type { FakeMarketDb, FakeRow, MarketWho } from './support/marketRouteKit'
import {
  FOREIGN_PROFILE,
  OWN_PROFILE,
  describeOwnedMarketRoute,
  installMarketGlobals,
  marketWorld,
  runMarketRoute,
  writeCalls,
} from './support/marketRouteKit'

/**
 * ROLLEN AN DEN KANDIDATEN-ROUTEN (OPS-009, BT1 b) — `GET`/`POST
 * /competitors`, `PATCH`/`DELETE /competitors/<cid>`: die ECHTEN Handler mit
 * der ECHTEN Zugangs-Kette (`requireMarketProfile`). Nachgebaut ist nur die
 * Datenbank (`support/marketRouteKit.ts`).
 *
 * WER DURCH DARF, AUSGESCHRIEBEN: nur der Besitzer des Brandings.
 *
 * Dazu die zweite Tür der Kandidaten-Routen: eine Kandidaten-Id, die zu
 * einem ANDEREN Branding gehört, antwortet wie eine unbekannte (404), und
 * ein `foundation`-Kandidat darf nur auf ein EIGENES Branding zeigen.
 */

const PASSES: Readonly<Record<MarketWho, boolean>> = {
  guest: false,
  noAccess: false,
  stranger: false,
  owner: true,
}

function competitorRow(id: string, profileId: string, url: string): FakeRow {
  return {
    $id: id,
    profileId,
    name: id,
    url,
    status: 'pending',
    sourceKind: 'website',
    sourceRef: '',
    role: 'competitor',
    excludedReason: '',
    pagesFetched: '',
    brandCheckId: '',
  }
}

/** Ein Kandidat im eigenen Branding, einer in einem fremden. */
function world(): FakeMarketDb {
  return marketWorld({
    market_competitors: [
      competitorRow('c-own', OWN_PROFILE, 'https://a.example/'),
      competitorRow('c-foreign', FOREIGN_PROFILE, 'https://b.example/'),
    ],
  })
}

const loadList = () => import('../server/api/market/profiles/[id]/competitors/index.get')
const loadCreate = () => import('../server/api/market/profiles/[id]/competitors/index.post')
const loadPatch = () => import('../server/api/market/profiles/[id]/competitors/[cid].patch')
const loadDelete = () => import('../server/api/market/profiles/[id]/competitors/[cid].delete')

describeOwnedMarketRoute('GET /competitors', loadList, {
  method: 'GET',
  passes: PASSES,
  world,
  passed: (run) => {
    const ids = (run.result as { competitors: { id: string }[] }).competitors.map(entry => entry.id)
    // Nur die Kandidaten DES Brandings — der fremde fehlt.
    expect(ids).toEqual(['c-own'])
  },
})

describeOwnedMarketRoute('POST /competitors', loadCreate, {
  method: 'POST',
  passes: PASSES,
  world,
  probe: { body: { name: 'Neu', url: 'https://c.example/' } },
  passed: (run, db) => {
    expect(writeCalls(run.calls)).toEqual([{ op: 'create', table: 'market_competitors', rowId: expect.any(String) }])
    const created = db.rows('market_competitors').find(row => row.url === 'https://c.example/')
    expect(created?.profileId).toBe(OWN_PROFILE)
  },
})

describeOwnedMarketRoute('PATCH /competitors/<cid>', loadPatch, {
  method: 'PATCH',
  passes: PASSES,
  world,
  probe: { cid: 'c-own', body: { name: 'Umbenannt' } },
  passed: (run, db) => {
    expect(writeCalls(run.calls)).toEqual([{ op: 'update', table: 'market_competitors', rowId: 'c-own' }])
    expect(db.tables.get('market_competitors')!.get('c-own')!.name).toBe('Umbenannt')
  },
})

describeOwnedMarketRoute('DELETE /competitors/<cid>', loadDelete, {
  method: 'DELETE',
  passes: PASSES,
  world,
  probe: { cid: 'c-own' },
  passed: (_run, db) => {
    expect(db.tables.get('market_competitors')!.has('c-own')).toBe(false)
    expect(db.tables.get('market_competitors')!.has('c-foreign')).toBe(true)
  },
})

// ── Die zweite Tür: die Kandidaten-Id gehört zum Branding ───────────────────

describe('Kandidaten-Id aus einem ANDEREN Branding', () => {
  let db: FakeMarketDb

  beforeEach(() => {
    db = world()
    installMarketGlobals({ db, marketConfig: { enabled: true } })
  })

  it.each([
    ['PATCH', loadPatch, { name: 'Gekapert' }],
    ['DELETE', loadDelete, undefined],
  ] as const)('%s: der Besitzer mit der Id eines fremden Kandidaten ⇒ 404 wie eine unbekannte Id, nichts geschrieben', async (method, load, body) => {
    const foreign = await runMarketRoute(db, load, { who: 'owner', method, profileId: OWN_PROFILE, cid: 'c-foreign', body })
    const unknown = await runMarketRoute(db, load, { who: 'owner', method, profileId: OWN_PROFILE, cid: 'c-unknown', body })
    expect(foreign.status).toBe(404)
    expect(unknown.status).toBe(404)
    expect(foreign.code).toBe(unknown.code)
    expect(writeCalls([...foreign.calls, ...unknown.calls])).toEqual([])
    // Hinter der Id-Prüfung liegt nichts: keine Marktprofile gelesen.
    expect(foreign.calls.some(call => call.table === 'market_profiles')).toBe(false)
    expect(db.tables.get('market_competitors')!.get('c-foreign')!.name).toBe('c-foreign')
  })
})

describe('POST /competitors mit `foundation` — nur ein EIGENES Branding als Quelle', () => {
  let db: FakeMarketDb

  beforeEach(() => {
    db = world()
    installMarketGlobals({ db, marketConfig: { enabled: true } })
  })

  it('ein fremdes Branding als Quelle ⇒ 404, kein Kandidat angelegt — wie eine unbekannte Id', async () => {
    const foreign = await runMarketRoute(db, loadCreate, {
      who: 'owner', method: 'POST', profileId: OWN_PROFILE,
      body: { name: 'Fremd', sourceKind: 'foundation', sourceRef: FOREIGN_PROFILE },
    })
    const unknown = await runMarketRoute(db, loadCreate, {
      who: 'owner', method: 'POST', profileId: OWN_PROFILE,
      body: { name: 'Fremd', sourceKind: 'foundation', sourceRef: 'p-gibt-es-nicht' },
    })
    expect(foreign.status).toBe(404)
    expect(unknown.status).toBe(404)
    expect(writeCalls([...foreign.calls, ...unknown.calls])).toEqual([])
  })

  it('GEGENPROBE: das eigene Branding als Quelle ⇒ angelegt', async () => {
    const run = await runMarketRoute(db, loadCreate, {
      who: 'owner', method: 'POST', profileId: OWN_PROFILE,
      body: { name: 'Eigen', sourceKind: 'foundation', sourceRef: OWN_PROFILE },
    })
    expect(run.status).toBe(200)
    expect(writeCalls(run.calls)).toEqual([{ op: 'create', table: 'market_competitors', rowId: expect.any(String) }])
  })
})
