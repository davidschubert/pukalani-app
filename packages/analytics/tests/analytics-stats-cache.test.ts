import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { createMicrocache } from '../../core/server/utils/microcache'
import { normalizeHost } from '../../core/server/utils/tenantResolver'
import type { PlausibleQuery } from '../shared/analyticsStats'

/**
 * BE-022 (2) — DER ZWISCHENSPEICHER DER ZAHLEN KENNT DEN HOST.
 *
 * Das Ziel der Abfrage hängt am Host der Anfrage (`resolveStatsTarget`: bei
 * eigener Plausible-Site ist der Host der Site-Schlüssel, bei der Sammel-Site
 * der Filter). Der Schlüssel des Zwischenspeichers trug aber nur Mandant und
 * Zeitraum — wer dieselbe Community über ihre eigene Domain UND über die
 * Pukalani-Adresse öffnete, sah zwei Minuten lang auf der zweiten die Zahlen
 * der ersten.
 */

vi.stubGlobal('createMicrocache', createMicrocache)
vi.stubGlobal('tenantCacheScope', (event: H3Event) => `pool:${(event.context.tenant as { tenantId: string }).tenantId}`)

const cache = await import('../server/utils/analyticsConfigCache')

function eventFor(tenantId: string, host = 'kunde-a.pukalani.app'): H3Event {
  return { headers: { host }, context: { tenant: { mode: 'pool', tenantId } } } as unknown as H3Event
}

function numbers(visitors: number) {
  return { active: true as const, today: { visitors } }
}

describe('Zahlen-Zwischenspeicher je Host', () => {
  beforeEach(() => {
    cache.clearAnalyticsStatsCache(eventFor('t-a'))
    cache.clearAnalyticsStatsCache(eventFor('t-b'))
  })

  it('zwei Hosts derselben Community bekommen getrennte Einträge', () => {
    const event = eventFor('t-a')
    cache.writeAnalyticsStatsCache(event, numbers(1), 'kunde-a.pukalani.app', '30d')

    expect(cache.readAnalyticsStatsCache(event, 'kunde-a.example', '30d')).toBeUndefined()
    expect(cache.readAnalyticsStatsCache(event, 'kunde-a.pukalani.app', '30d')).toEqual(numbers(1))

    cache.writeAnalyticsStatsCache(event, numbers(2), 'kunde-a.example', '30d')
    expect(cache.readAnalyticsStatsCache(event, 'kunde-a.example', '30d')).toEqual(numbers(2))
    expect(cache.readAnalyticsStatsCache(event, 'kunde-a.pukalani.app', '30d')).toEqual(numbers(1))
  })

  it('verschiedene Zeiträume bleiben getrennt', () => {
    const event = eventFor('t-a')
    cache.writeAnalyticsStatsCache(event, numbers(7), 'kunde-a.example', '7d')
    expect(cache.readAnalyticsStatsCache(event, 'kunde-a.example', '30d')).toBeUndefined()
    expect(cache.readAnalyticsStatsCache(event, 'kunde-a.example', '7d')).toEqual(numbers(7))
  })

  it('clear leert ALLE Hosts und Zeiträume dieses Mandanten', () => {
    const event = eventFor('t-a')
    cache.writeAnalyticsStatsCache(event, numbers(1), 'kunde-a.pukalani.app', '30d')
    cache.writeAnalyticsStatsCache(event, numbers(2), 'kunde-a.example', '90d')

    cache.clearAnalyticsStatsCache(event)

    expect(cache.readAnalyticsStatsCache(event, 'kunde-a.pukalani.app', '30d')).toBeUndefined()
    expect(cache.readAnalyticsStatsCache(event, 'kunde-a.example', '90d')).toBeUndefined()
  })

  it('zwei Mandanten sehen einander nie — auch nicht unter demselben Host', () => {
    cache.writeAnalyticsStatsCache(eventFor('t-a'), numbers(1), 'same.example', '30d')
    expect(cache.readAnalyticsStatsCache(eventFor('t-b'), 'same.example', '30d')).toBeUndefined()

    cache.clearAnalyticsStatsCache(eventFor('t-b'))
    expect(cache.readAnalyticsStatsCache(eventFor('t-a'), 'same.example', '30d')).toEqual(numbers(1))
  })

  it('erfundene Hosts fressen keinen Speicher: höchstens 8 Hosts je Mandant', () => {
    const event = eventFor('t-a')
    for (let i = 0; i < 20; i++) {
      cache.writeAnalyticsStatsCache(event, numbers(i), `h${i}.example`, '30d')
    }
    const kept = Array.from({ length: 20 }, (_, i) => cache.readAnalyticsStatsCache(event, `h${i}.example`, '30d'))
      .filter(Boolean)
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.length).toBeLessThanOrEqual(8)
    // Der zuletzt geschriebene ist immer da.
    expect(cache.readAnalyticsStatsCache(event, 'h19.example', '30d')).toEqual(numbers(19))
  })

  it('ein Eintrag läuft nach 120 s ab, auch wenn daneben frisch geschrieben wird', () => {
    vi.useFakeTimers()
    try {
      const event = eventFor('t-a')
      cache.writeAnalyticsStatsCache(event, numbers(1), 'kunde-a.pukalani.app', '30d')
      vi.advanceTimersByTime(100_000)
      cache.writeAnalyticsStatsCache(event, numbers(2), 'kunde-a.example', '30d')
      vi.advanceTimersByTime(30_000)
      expect(cache.readAnalyticsStatsCache(event, 'kunde-a.pukalani.app', '30d')).toBeUndefined()
      expect(cache.readAnalyticsStatsCache(event, 'kunde-a.example', '30d')).toEqual(numbers(2))
    }
    finally {
      vi.useRealTimers()
    }
  })
})

/**
 * Dieselbe Lücke durch die ROUTE: eine Community mit eigener Plausible-Site,
 * zweimal geöffnet — über die Pukalani-Adresse und über die eigene Domain. Die
 * Attrappe antwortet je Site mit einer anderen Besucherzahl.
 */
describe('GET /api/analytics/stats — zwei Hosts derselben Community', () => {
  const visitorsBySite: Record<string, number> = { 'kunde-a.pukalani.app': 11, 'kunde-a.example': 22 }

  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('requireCommunityPermission', async () => {})
  vi.stubGlobal('requirePlanProduct', () => {})
  vi.stubGlobal('getQuery', () => ({ range: '30d' }))
  vi.stubGlobal('getHeader', (event: H3Event, name: string) =>
    (event as unknown as { headers: Record<string, string> }).headers[name])
  vi.stubGlobal('normalizeHost', normalizeHost)
  vi.stubGlobal('useAppConfig', () => ({ pukalani: { analytics: { instance: 'https://plausible.example.test' } } }))
  vi.stubGlobal('tenantDb', () => ({ find: async () => ({ $id: 'r', plausibleScriptId: 'pa-OWNownOWNown000000001', enabled: false }) }))
  vi.stubGlobal('readInstanceSecret', async () => 'key')
  vi.stubGlobal('useRuntimeConfig', () => ({}))
  vi.stubGlobal('readAnalyticsStatsCache', cache.readAnalyticsStatsCache)
  vi.stubGlobal('writeAnalyticsStatsCache', cache.writeAnalyticsStatsCache)
  vi.stubGlobal('useTenant', () => null)

  /**
   * Was die Zähl-Datei der Kennung über ihre Seite sagt (KK1): `null` = die
   * Instanz kennt die Kennung nicht (404), eine Zeichenkette = die Adresse in
   * der Datei, `'down'` = der Abruf scheitert.
   */
  let scriptDomain: string | null | 'down' = null
  let scriptFetches = 0
  const queriedSites: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('/js/')) {
      scriptFetches += 1
      if (scriptDomain === 'down') throw new TypeError('fetch failed')
      if (scriptDomain === null) return new Response('Not found', { status: 404 })
      return new Response(`!function(){var t={endpoint:"https://plausible.example.test/api/event",domain:${JSON.stringify(scriptDomain)}};t.x=1}();`, { status: 200 })
    }
    const query = JSON.parse(String(init?.body)) as PlausibleQuery
    queriedSites.push(query.site_id)
    return new Response(JSON.stringify({ results: [{ metrics: [visitorsBySite[query.site_id] ?? 0], dimensions: [] }] }), { status: 200 })
  }))

  type StatsHandler = (event: H3Event) => Promise<{ today?: { visitors: number } }>
  const loadHandler = async () => (await import('../server/api/analytics/stats.get')).default as unknown as StatsHandler

  beforeEach(async () => {
    scriptDomain = null
    scriptFetches = 0
    queriedSites.length = 0
    const { __resetOwnScriptSiteCache } = await import('../server/utils/verifyAnalyticsScriptOwner')
    __resetOwnScriptSiteCache()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('die eigene Domain bekommt IHRE Zahlen, nicht die der Pukalani-Adresse', async () => {
    const handler = await loadHandler()

    cache.clearAnalyticsStatsCache(eventFor('t-route'))
    const first = await handler(eventFor('t-route', 'kunde-a.pukalani.app'))
    const second = await handler(eventFor('t-route', 'kunde-a.example'))

    expect(first.today?.visitors).toBe(11)
    expect(second.today?.visitors).toBe(22)
  })

  /**
   * KK1 (2026-11-17): die Seite liegt in Plausible unter der Schwester-Adresse
   * (`www.`). Das Speichern nahm die Kennung an, die Zahlen fragten aber den
   * Host der Anfrage — „gerade nicht erreichbar". Jetzt ist das Ziel die
   * Adresse, die die Zähl-Datei nennt.
   */
  it('die Zähl-Datei nennt die www-Adresse: abgefragt wird SIE, nicht der Host der Anfrage', async () => {
    visitorsBySite['www.kunde-a.example'] = 33
    scriptDomain = 'www.kunde-a.example'
    const handler = await loadHandler()

    cache.clearAnalyticsStatsCache(eventFor('t-www'))
    const run = await handler(eventFor('t-www', 'kunde-a.example'))

    expect(run.today?.visitors).toBe(33)
    expect(new Set(queriedSites)).toEqual(new Set(['www.kunde-a.example']))
  })

  it('Gegenprobe: nennt die Datei eine FREMDE Seite, bleibt es beim Host der Anfrage — nie fremde Zahlen', async () => {
    visitorsBySite['fremd.example'] = 99
    scriptDomain = 'fremd.example'
    const handler = await loadHandler()

    cache.clearAnalyticsStatsCache(eventFor('t-fremd'))
    const run = await handler(eventFor('t-fremd', 'kunde-a.example'))

    expect(run.today?.visitors).toBe(22)
    expect(queriedSites).not.toContain('fremd.example')
  })

  it('die Datei ist nicht lesbar: wie bisher der Host der Anfrage', async () => {
    scriptDomain = 'down'
    const handler = await loadHandler()

    cache.clearAnalyticsStatsCache(eventFor('t-down'))
    const run = await handler(eventFor('t-down', 'kunde-a.example'))

    expect(run.today?.visitors).toBe(22)
  })

  it('die gelesene Adresse wird gehalten: zwei Aufrufe, EIN Abruf der Zähl-Datei', async () => {
    scriptDomain = 'www.kunde-a.example'
    const handler = await loadHandler()

    cache.clearAnalyticsStatsCache(eventFor('t-once'))
    await handler(eventFor('t-once', 'kunde-a.example'))
    cache.clearAnalyticsStatsCache(eventFor('t-once'))
    await handler(eventFor('t-once', 'kunde-a.example'))

    expect(scriptFetches).toBe(1)
  })
})
