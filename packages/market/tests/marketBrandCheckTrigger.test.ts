import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { MarketCompetitorRow } from '../shared/types/market'

/**
 * DER ANSTOSS FEHLENDER BRAND-CHECKS (Plan §7.3, BC1) — gegen eingesetzte
 * Nachbarn, ohne Netz, ohne Appwrite und ohne Modell.
 *
 * Sechs Aussagen, die NICHT in einer puren Funktion stecken, sondern in der
 * Reihenfolge und den Abbruchregeln dieser Schleife — und genau die verrutschen
 * beim Umbauen still:
 *
 *  1. Angestossen wird NUR, was noch keinen sichtbaren Check hat. Sonst
 *     bezahlte jeder Lauf denselben Auftritt noch einmal.
 *  2. NUR Website-Kandidaten. Eine Foundation hat keinen Auftritt, ein
 *     Bibliotheks-Eintrag keinen von uns geprüften.
 *  3. NUR was der Lauf lesen durfte (`eligible`). Ein per `robots.txt`
 *     ausgeschlossener Kandidat darf nicht über eine Hintertür doch gelesen
 *     werden.
 *  4. Ein 429 beendet den GANZEN Anstoss — der Konto-Deckel gilt fürs Konto,
 *     der nächste Kandidat liefe in dieselbe Wand.
 *  5. Jeder ANDERE Fehler kostet genau seinen Kandidaten den Score.
 *  6. Ein `cached`-Treffer wird NICHT gestempelt: er kann hier nur eine
 *     ausgeblendete Zeile sein (die Lesefunktion überspringt sie, der
 *     Zwischenspeicher des Checks nicht).
 */

interface RunCall { url: string, quota?: string, userId: string, rankingOptIn?: boolean, force?: boolean }

let lookups: Map<string, { checkId: string, score: number, band: string }>
let runCalls: RunCall[]
let runResults: (Error | { id: string, cached: boolean })[]
let updates: { competitorId: string, data: Record<string, unknown> }[]
let updateBroken: boolean
let logs: { level: string, event: string, data: Record<string, unknown> }[]

vi.mock('../server/contracts/brandContract', () => ({
  findBrandCheckForUrl: vi.fn(async (_event: H3Event, url: string) => {
    const hit = lookups.get(url)
    return hit ? { ...hit, createdAt: '2026-09-01T00:00:00.000Z', fresh: true } : null
  }),
  runBrandCheck: vi.fn(async (_event: H3Event, input: RunCall) => {
    runCalls.push(input)
    const next = runResults.shift() ?? { id: `new-${runCalls.length}`, cached: false }
    if (next instanceof Error) throw next
    return next
  }),
}))

vi.mock('../server/utils/marketStore', () => ({
  updateMarketCompetitor: vi.fn(async (
    _event: H3Event,
    _profileId: string,
    competitorId: string,
    data: Record<string, unknown>,
  ) => {
    if (updateBroken) throw new Error('row gone')
    updates.push({ competitorId, data })
    return {}
  }),
}))

vi.stubGlobal('logEvent', (level: string, event: string, data: Record<string, unknown> = {}) => {
  logs.push({ level, event, data })
})

const { triggerMarketBrandChecks } = await import('../server/utils/marketBrandCheck')

const event = {} as unknown as H3Event

function competitor(id: string, overrides: Partial<MarketCompetitorRow> = {}): MarketCompetitorRow {
  const base = {
    $id: id,
    $createdAt: '',
    $updatedAt: '',
    $permissions: [],
    $sequence: 0,
    $tableId: 'market_competitors',
    $databaseId: 'main',
    profileId: 'p1',
    name: id,
    // Bewusst eine UNTERSEITE: der Anstoss muss daraus die Startseite machen.
    url: `https://${id}.example/leistungen`,
    status: 'fetched',
    sourceKind: 'website',
  } as unknown as MarketCompetitorRow
  return { ...base, ...overrides }
}

/** Alle Kandidaten dürfen gelesen werden, sofern nichts anderes gesagt wird. */
function allEligible(rows: readonly MarketCompetitorRow[]): Set<string> {
  return new Set(rows.map(row => row.$id))
}

async function trigger(rows: readonly MarketCompetitorRow[], eligible?: ReadonlySet<string>) {
  await triggerMarketBrandChecks(event, {
    profileId: 'p1',
    userId: 'u-1',
    locale: 'de',
    competitors: rows,
    eligible: eligible ?? allEligible(rows),
  })
}

beforeEach(() => {
  lookups = new Map()
  runCalls = []
  runResults = []
  updates = []
  updateBroken = false
  logs = []
})

describe('triggerMarketBrandChecks · wen er anstösst', () => {
  it('stösst genau die Kandidaten OHNE sichtbaren Check an — auf dem URSPRUNG', async () => {
    const rows = [competitor('a'), competitor('b')]
    lookups.set('https://a.example/', { checkId: 'alt-a', score: 70, band: 'strong' })

    await trigger(rows)

    // Nur b — und mit der Startseite, nicht mit `/leistungen`: der Check misst
    // den AUFTRITT der Marke.
    expect(runCalls.map(call => call.url)).toEqual(['https://b.example/'])
    expect(runCalls[0]).toMatchObject({ quota: 'account', userId: 'u-1', rankingOptIn: false })
    // KEIN `force`: der Sieben-Tage-Zwischenspeicher ist der Kostendeckel.
    expect(runCalls[0]?.force).toBeUndefined()
  })

  it('rührt Foundation und Bibliothek nicht an', async () => {
    const rows = [
      competitor('own', { sourceKind: 'foundation', url: '' }),
      competitor('lib', { sourceKind: 'library' }),
      competitor('shared', { sourceKind: 'shared' }),
    ]

    await trigger(rows)

    expect(runCalls).toEqual([])
  })

  it('überspringt, was der Lauf nicht lesen durfte', async () => {
    const rows = [competitor('blocked'), competitor('ok')]

    await trigger(rows, new Set(['ok']))

    expect(runCalls.map(call => call.url)).toEqual(['https://ok.example/'])
  })

  it('höchstens fünf je Lauf', async () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => competitor(id))

    await trigger(rows)

    expect(runCalls).toHaveLength(5)
  })

  it('eine unbrauchbare Adresse wird gar nicht erst gerufen', async () => {
    const rows = [competitor('kaputt', { url: 'nicht mal eine adresse' })]

    await trigger(rows)

    expect(runCalls).toEqual([])
  })
})

describe('triggerMarketBrandChecks · Abbruch und Fail-soft', () => {
  it('ein 429 beendet den ganzen Anstoss', async () => {
    const rows = [competitor('a'), competitor('b'), competitor('c')]
    runResults = [
      { id: 'neu-a', cached: false },
      Object.assign(new Error('limit'), {
        statusCode: 429,
        data: { code: 'brand_check_account_limit' },
      }),
    ]

    await trigger(rows)

    expect(runCalls).toHaveLength(2)
    expect(logs.find(entry => entry.event === 'market.brand_check_skipped')?.data)
      .toMatchObject({ status: 429, code: 'brand_check_account_limit' })
    // Der eine gelungene Check hängt trotzdem an seiner Zeile.
    expect(updates).toEqual([{ competitorId: 'a', data: { brandCheckId: 'neu-a' } }])
  })

  it('ein 422 kostet nur SEINEN Kandidaten den Score', async () => {
    const rows = [competitor('tot'), competitor('lebt')]
    runResults = [
      Object.assign(new Error('unreachable'), { statusCode: 422, data: { code: 'fetch_failed' } }),
      { id: 'neu-lebt', cached: false },
    ]

    await trigger(rows)

    expect(runCalls).toHaveLength(2)
    expect(updates).toEqual([{ competitorId: 'lebt', data: { brandCheckId: 'neu-lebt' } }])
  })

  it('ein `cached`-Treffer bekommt KEINEN Stempel (er ist ausgeblendet)', async () => {
    const rows = [competitor('versteckt')]
    runResults = [{ id: 'hidden-1', cached: true }]

    await trigger(rows)

    expect(updates).toEqual([])
    expect(logs.find(entry => entry.event === 'market.brand_check_skipped')?.data)
      .toMatchObject({ code: 'not_visible' })
  })

  it('eine Zeile, die sich nicht schreiben lässt, kostet den Link — nicht den Lauf', async () => {
    updateBroken = true
    const rows = [competitor('a')]

    await expect(trigger(rows)).resolves.toBeUndefined()
    expect(logs.map(entry => entry.event)).toContain('market.brand_check_stamp_failed')
  })
})

describe('triggerMarketBrandChecks · der Stempel', () => {
  it('trägt auch GEFUNDENE Checks nach, und nur was sich geändert hat', async () => {
    const rows = [
      competitor('a'),
      competitor('b', { brandCheckId: 'alt-b' }),
    ]
    lookups.set('https://a.example/', { checkId: 'alt-a', score: 70, band: 'strong' })
    lookups.set('https://b.example/', { checkId: 'alt-b', score: 61, band: 'average' })

    await trigger(rows)

    // a bekommt seine gefundene Id, b steht schon richtig und wird nicht angefasst.
    expect(updates).toEqual([{ competitorId: 'a', data: { brandCheckId: 'alt-a' } }])
    expect(runCalls).toEqual([])
  })

  it('räumt eine Id weg, zu der es keinen sichtbaren Check mehr gibt', async () => {
    // Der Betreiber hat den Check ausgeblendet: der Link zeigte sonst auf ein
    // Ergebnis, das aus der Auskunft genommen wurde.
    const rows = [competitor('a', { brandCheckId: 'weg' })]
    runResults = [Object.assign(new Error('blocked'), { statusCode: 400, data: { code: 'blocked_target' } })]

    await trigger(rows)

    expect(updates).toEqual([{ competitorId: 'a', data: { brandCheckId: '' } }])
  })
})
