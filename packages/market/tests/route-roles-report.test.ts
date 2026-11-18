import { beforeEach, describe, expect, it } from 'vitest'
import type { FakeMarketDb, MarketWho } from './support/marketRouteKit'
import {
  FOREIGN_PROFILE,
  OWN_PROFILE,
  UNKNOWN_PROFILE,
  dataCallsBeyondGuard,
  installMarketGlobals,
  marketWorld,
  runMarketRoute,
  targetProfileOf,
  writeCalls,
} from './support/marketRouteKit'

/**
 * ROLLEN AN DEN BERICHT-ROUTEN (OPS-009; LL1 d) — `POST /report` und
 * `GET /report`, die ECHTEN Handler mit der ECHTEN Zugangs-Kette
 * (`requireMarketProfile` ⇒ Beta-Zugang ⇒ Besitz; beim POST zusätzlich die
 * Freischaltung). Nachgebaut ist nur die Datenbank (`marketRouteKit.ts`).
 *
 * WER DURCH DARF, AUSGESCHRIEBEN: nur der Besitzer des Brandings. Gast, Konto
 * ohne Beta-Zugang und fremdes Konto bekommen 404 — dieselbe Antwort wie für
 * eine Id, zu der es kein Branding gibt.
 */

const PASSES: Record<MarketWho, boolean> = {
  guest: false,
  noAccess: false,
  stranger: false,
  owner: true,
}

let db: FakeMarketDb

beforeEach(() => {
  db = marketWorld()
  installMarketGlobals({ db, marketConfig: { enabled: true } })
})

const loadPost = () => import('../server/api/market/profiles/[id]/report.post')
const loadGet = () => import('../server/api/market/profiles/[id]/report.get')

describe.each([
  ['POST /report', loadPost, 'POST'],
  ['GET /report', loadGet, 'GET'],
] as const)('%s', (_name, load, method) => {
  it.each(Object.entries(PASSES).filter(([, passes]) => !passes).map(([who]) => [who as MarketWho]))(
    '%s ⇒ 404, ohne einen Zugriff hinter der Wache',
    async (who) => {
      const run = await runMarketRoute(db, load, { who, method, profileId: targetProfileOf(who) })
      expect(run.status).toBe(404)
      expect(dataCallsBeyondGuard(run.calls)).toEqual([])
      expect(writeCalls(run.calls)).toEqual([])
    },
  )

  it('fremdes Konto: fremde und unbekannte Branding-Id antworten GLEICH (404, kein Zugriff dahinter)', async () => {
    const foreign = await runMarketRoute(db, load, { who: 'stranger', method, profileId: FOREIGN_PROFILE })
    const unknown = await runMarketRoute(db, load, { who: 'stranger', method, profileId: UNKNOWN_PROFILE })
    expect(foreign.status).toBe(404)
    expect(unknown.status).toBe(404)
    expect(foreign.code).toBe(unknown.code)
    expect(dataCallsBeyondGuard(foreign.calls)).toEqual([])
    expect(dataCallsBeyondGuard(unknown.calls)).toEqual([])
  })

  it('der Besitzer auf einem FREMDEN Branding ⇒ 404 wie jeder andere', async () => {
    const run = await runMarketRoute(db, load, { who: 'owner', method, profileId: FOREIGN_PROFILE })
    expect(run.status).toBe(404)
    expect(dataCallsBeyondGuard(run.calls)).toEqual([])
  })
})

describe('der Besitzer kommt durch', () => {
  it('POST /report: an der Wache vorbei — ohne Marktprofil antwortet die FACH-Prüfung (409 `market_no_profiles`)', async () => {
    expect(PASSES.owner).toBe(true)
    const run = await runMarketRoute(db, loadPost, { who: 'owner', method: 'POST', profileId: OWN_PROFILE })
    expect(run.status).toBe(409)
    expect(run.code).toBe('market_no_profiles')
    // Er hat die market-Daten seines Brandings gelesen — die Wache liess ihn durch.
    expect(run.calls.some(call => call.table === 'market_competitors')).toBe(true)
  })

  it('POST /report: ohne Freischaltung (Kapitel B nicht abgenommen) ⇒ 409 `market_locked`, BEVOR market-Daten gelesen werden', async () => {
    db.tables.get('brand_steps')!.get(`${OWN_PROFILE}_pvm`)!.state = 'open'
    const run = await runMarketRoute(db, loadPost, { who: 'owner', method: 'POST', profileId: OWN_PROFILE })
    expect(run.status).toBe(409)
    expect(run.code).toBe('market_locked')
    expect(run.calls.some(call => call.table.startsWith('market_'))).toBe(false)
  })

  it('GET /report: 200, noch kein Bericht, kein Lauf', async () => {
    const run = await runMarketRoute(db, loadGet, { who: 'owner', profileId: OWN_PROFILE })
    expect(run.status).toBe(200)
    expect(run.result).toMatchObject({ report: null, reportRun: { state: 'none' } })
  })
})
