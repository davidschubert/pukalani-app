import { describe, expect, it } from 'vitest'
import {
  ANALYTICS_LIST_LIMIT,
  ANALYTICS_STATS_RANGES,
  ANALYTICS_TOTAL_METRICS,
  buildStatsQueries,
  countryFlagEmoji,
  mapCountryCounts,
  mapNamedCounts,
  mapSeries,
  mapTotals,
  mapVisitors,
  normalizeStatsRange,
  resolveStatsTarget,
} from '../shared/analyticsStats'

const OWN = 'pa-NFzv_HzyhC-TnVE577Kx6'
const SHARED = { scriptId: 'pa-nw6c94JiRWqzOc-zDcn1a', siteId: 'communities.pukalani.app' }
const HOST = 'kunde-a.pukalani.app'

describe('resolveStatsTarget', () => {
  it('fragt bei EIGENER Site den Host der Community — ohne Filter', () => {
    const target = resolveStatsTarget({ plausibleScriptId: OWN }, SHARED, HOST)
    expect(target).toEqual({ state: 'ready', siteId: HOST, filters: [] })
  })

  it('nennt die Zähl-Datei eine eigene Adresse, ist SIE das Ziel (KK1) — sonst der Host', () => {
    expect(resolveStatsTarget({ plausibleScriptId: OWN }, SHARED, HOST, `www.${HOST}`))
      .toEqual({ state: 'ready', siteId: `www.${HOST}`, filters: [] })
    expect(resolveStatsTarget({ plausibleScriptId: OWN }, SHARED, HOST, null))
      .toEqual({ state: 'ready', siteId: HOST, filters: [] })
    // Die Sammel-Site kennt keine eigene Adresse — der Wert darf dort nichts bewirken.
    expect(resolveStatsTarget({ enabled: true }, SHARED, HOST, 'www.fremd.example'))
      .toMatchObject({ state: 'ready', siteId: SHARED.siteId })
  })

  it('die eigene Site gewinnt auch, wenn der Schalter an ist', () => {
    const target = resolveStatsTarget({ plausibleScriptId: OWN, enabled: true }, SHARED, HOST)
    expect(target).toEqual({ state: 'ready', siteId: HOST, filters: [] })
  })

  /** Die eine Zeile, an der die ganze Trennung der Communities hängt. */
  it('fragt beim Schalter die Sammel-Site MIT Hostname-Filter', () => {
    const target = resolveStatsTarget({ plausibleScriptId: '', enabled: true }, SHARED, HOST)
    expect(target).toEqual({
      state: 'ready',
      siteId: 'communities.pukalani.app',
      filters: [['is', 'event:hostname', [HOST]]],
    })
  })

  it('ist aus, wenn weder Schalter noch eigene Site gesetzt sind', () => {
    expect(resolveStatsTarget({ plausibleScriptId: '', enabled: false }, SHARED, HOST)).toEqual({ state: 'off' })
    expect(resolveStatsTarget(null, SHARED, HOST)).toEqual({ state: 'off' })
    expect(resolveStatsTarget(undefined, SHARED, HOST)).toEqual({ state: 'off' })
  })

  it('ist aus, wenn der Schalter an ist, das Deployment aber keine Sammel-Site hat (Silo)', () => {
    expect(resolveStatsTarget({ enabled: true }, {}, HOST)).toEqual({ state: 'off' })
  })

  /**
   * Gegenprobe zur Fail-soft-Regel: „es wird gemessen, wir kommen nur nicht
   * dran" darf NIE zu „es wird nichts gemessen" werden.
   */
  it('meldet „nicht erreichbar", wenn die Sammel-Site keinen Site-Schlüssel hat', () => {
    expect(resolveStatsTarget({ enabled: true }, { scriptId: SHARED.scriptId }, HOST))
      .toEqual({ state: 'unavailable' })
  })

  it('meldet „nicht erreichbar" ohne Request-Host — in beiden Modi', () => {
    expect(resolveStatsTarget({ plausibleScriptId: OWN }, SHARED, '')).toEqual({ state: 'unavailable' })
    expect(resolveStatsTarget({ enabled: true }, SHARED, '')).toEqual({ state: 'unavailable' })
  })

  it('ignoriert eine unbrauchbare eigene Id und fällt auf den Schalter zurück', () => {
    const target = resolveStatsTarget({ plausibleScriptId: 'https://boese.example/x.js', enabled: true }, SHARED, HOST)
    expect(target).toEqual({
      state: 'ready',
      siteId: 'communities.pukalani.app',
      filters: [['is', 'event:hostname', [HOST]]],
    })
  })
})

describe('normalizeStatsRange', () => {
  it('lässt jeden angebotenen Zeitraum durch', () => {
    for (const range of ANALYTICS_STATS_RANGES) {
      expect(normalizeStatsRange(range)).toBe(range)
    }
  })

  /**
   * Der Wert ist EINGABE und landet in einer Abfrage gegen eine fremde Instanz
   * sowie im Cache-Schlüssel — fail-closed heißt hier: alles Unbekannte wird zu
   * 30 Tagen, statt zu einem Fehler oder zu einem durchgereichten Fremdwert.
   */
  it('macht aus allem Unbekannten die Vorgabe „30d"', () => {
    expect(normalizeStatsRange(undefined)).toBe('30d')
    expect(normalizeStatsRange('')).toBe('30d')
    expect(normalizeStatsRange('12mo')).toBe('30d')
    expect(normalizeStatsRange('day')).toBe('30d')
    expect(normalizeStatsRange(['7d'])).toBe('30d')
    expect(normalizeStatsRange(7)).toBe('30d')
    expect(normalizeStatsRange(null)).toBe('30d')
    expect(normalizeStatsRange({ range: '7d' })).toBe('30d')
  })
})

describe('buildStatsQueries', () => {
  const NOW = '2026-08-11T14:07:33.482Z'
  const queries = buildStatsQueries('communities.pukalani.app', [['is', 'event:hostname', [HOST]]], '30d', NOW)

  it('trägt Site und Filter in JEDE Abfrage', () => {
    for (const query of Object.values(queries)) {
      expect(query.site_id).toBe('communities.pukalani.app')
      expect(query.filters).toEqual([['is', 'event:hostname', [HOST]]])
    }
  })

  it('lässt `filters` ganz weg, wenn nicht gefiltert wird (eigene Site)', () => {
    const own = buildStatsQueries(HOST, [], '30d', NOW)
    for (const query of Object.values(own)) {
      expect('filters' in query).toBe(false)
    }
  })

  it('trennt „heute" und den gewählten Zeitraum — ein date_range gilt je Abfrage', () => {
    expect(queries.today.date_range).toBe('day')
    expect(queries.totals.date_range).toBe('30d')
    expect(queries.series.date_range).toBe('30d')
  })

  it('reicht den gewählten Zeitraum an alle Auswertungen durch — nur „heute" bleibt „day"', () => {
    const long = buildStatsQueries(HOST, [], '90d', NOW)
    expect(long.today.date_range).toBe('day')
    for (const key of ['totals', 'series', 'topPages', 'topSources', 'countries', 'regions', 'devices', 'browsers', 'os', 'entryPages'] as const) {
      expect(long[key].date_range).toBe('90d')
    }
  })

  it('ohne Angabe gelten 30 Tage', () => {
    expect(buildStatsQueries(HOST, []).totals.date_range).toBe('30d')
  })

  it('fragt die Übersichtszahlen in der Reihenfolge, in der sie gelesen werden', () => {
    expect(queries.totals.metrics).toEqual([...ANALYTICS_TOTAL_METRICS])
  })

  /**
   * `views_per_visit` verträgt sich NICHT mit `dimensions` (live gemessen) —
   * es darf deshalb ausschließlich in der reinen Metrik-Abfrage stehen.
   */
  it('hält `views_per_visit` aus jeder Abfrage mit Dimensionen heraus', () => {
    for (const query of Object.values(queries)) {
      if (query.dimensions) expect(query.metrics).not.toContain('views_per_visit')
    }
  })

  it('holt Zeitreihe, Seiten und Quellen über ihre Dimensionen', () => {
    expect(queries.series.dimensions).toEqual(['time:day'])
    expect(queries.topPages.dimensions).toEqual(['event:page'])
    expect(queries.topSources.dimensions).toEqual(['visit:source'])
    expect(queries.topPages.pagination).toEqual({ limit: ANALYTICS_LIST_LIMIT })
    expect(queries.topSources.pagination).toEqual({ limit: ANALYTICS_LIST_LIMIT })
  })

  it('holt Länder mit Code UND Namen in einer Abfrage', () => {
    expect(queries.countries.dimensions).toEqual(['visit:country', 'visit:country_name'])
    expect(queries.countries.pagination).toEqual({ limit: ANALYTICS_LIST_LIMIT })
  })

  it('holt Regionen, Geräte, Browser, Systeme und Einstiegsseiten je über eine Dimension', () => {
    expect(queries.regions.dimensions).toEqual(['visit:region_name'])
    expect(queries.devices.dimensions).toEqual(['visit:device'])
    expect(queries.browsers.dimensions).toEqual(['visit:browser'])
    expect(queries.os.dimensions).toEqual(['visit:os'])
    expect(queries.entryPages.dimensions).toEqual(['visit:entry_page'])
  })

  /**
   * DAS 30-MINUTEN-FENSTER ist der einzige Teil des Vertrags, der von der Uhr
   * abhängt — deshalb kommt sie als Argument herein und steht hier im Beweis.
   */
  it('fragt „letzte 30 Minuten" als Zeitpunkt-Paar mit Z-Suffix', () => {
    expect(queries.recent.date_range).toEqual(['2026-08-11T13:37:33Z', '2026-08-11T14:07:33Z'])
    expect(queries.recent.metrics).toEqual(['visitors'])
    expect(queries.recent.dimensions).toBeUndefined()
  })

  it('rechnet das Fenster auch über einen Tageswechsel korrekt zurück', () => {
    const overMidnight = buildStatsQueries(HOST, [], '7d', '2026-08-11T00:10:00.000Z')
    expect(overMidnight.recent.date_range).toEqual(['2026-08-10T23:40:00Z', '2026-08-11T00:10:00Z'])
  })
})

describe('Antwort-Mapping', () => {
  it('liest die Besucherzahl von heute', () => {
    expect(mapVisitors({ results: [{ metrics: [42], dimensions: [] }] })).toBe(42)
  })

  it('liest die Übersichtszahlen in der Reihenfolge der Metriken', () => {
    expect(mapTotals({ results: [{ metrics: [120, 180, 350, 1.9, 94.6, 41.2], dimensions: [] }] })).toEqual({
      visitors: 120,
      visits: 180,
      pageviews: 350,
      viewsPerVisit: 1.9,
      visitDurationSeconds: 95,
      bounceRate: 41.2,
    })
  })

  it('liest die Tagesreihe mit ihren Datumsangaben', () => {
    expect(mapSeries({
      results: [
        { metrics: [3], dimensions: ['2026-08-03'] },
        { metrics: [7], dimensions: ['2026-08-04'] },
      ],
    })).toEqual([
      { date: '2026-08-03', visitors: 3 },
      { date: '2026-08-04', visitors: 7 },
    ])
  })

  it('liest Länder mit Code und Namen aus derselben Zeile', () => {
    expect(mapCountryCounts({
      results: [
        { metrics: [42], dimensions: ['DE', 'Germany'] },
        { metrics: [7], dimensions: ['US', 'United States'] },
      ],
    })).toEqual([
      { code: 'DE', name: 'Germany', visitors: 42 },
      { code: 'US', name: 'United States', visitors: 7 },
    ])
  })

  /** Alt-Events ohne Geo-Zuordnung: eine Flagge ohne Land ist ein Rätsel. */
  it('lässt namenlose Länderzeilen weg, behält aber ein Land ohne Code', () => {
    expect(mapCountryCounts({
      results: [
        { metrics: [5], dimensions: ['', ''] },
        { metrics: [3], dimensions: ['', 'Irgendwo'] },
      ],
    })).toEqual([{ code: '', name: 'Irgendwo', visitors: 3 }])
  })

  it('rechnet ISO-Codes in Flaggen um — und alles andere in nichts', () => {
    expect(countryFlagEmoji('DE')).toBe('🇩🇪')
    expect(countryFlagEmoji('US')).toBe('🇺🇸')
    expect(countryFlagEmoji('de')).toBe('🇩🇪')
    expect(countryFlagEmoji('')).toBe('')
    expect(countryFlagEmoji('D')).toBe('')
    expect(countryFlagEmoji('DEU')).toBe('')
    expect(countryFlagEmoji('D1')).toBe('')
    // Sondercode: zwei Indikator-Zeichen ohne Flaggenbild — harmlos, und
    // billiger als eine gepflegte Liste aller gültigen Codes.
    expect([...countryFlagEmoji('XX')]).toHaveLength(2)
  })

  it('liest Top-Listen und lässt namenlose Zeilen weg (Direktzugriff)', () => {
    expect(mapNamedCounts({
      results: [
        { metrics: [9], dimensions: ['/blog'] },
        { metrics: [4], dimensions: [''] },
      ],
    })).toEqual([{ name: '/blog', visitors: 9 }])
  })

  /**
   * Der eigentliche Zweck der Mapper: aus einer unerwarteten Antwort darf
   * niemals „NaN" in einer Kachel werden — das sähe nach einem Fehler in
   * UNSEREM Dashboard aus, nicht nach fehlenden Daten.
   */
  it('macht aus fehlenden oder falsch getippten Werten 0 statt NaN', () => {
    expect(mapVisitors({})).toBe(0)
    expect(mapVisitors({ results: [] })).toBe(0)
    expect(mapVisitors({ results: [{ metrics: ['viele'], dimensions: [] }] })).toBe(0)
    expect(mapTotals({}).pageviews).toBe(0)
    expect(mapTotals({}).viewsPerVisit).toBe(0)
    expect(mapSeries({})).toEqual([])
    expect(mapNamedCounts({})).toEqual([])
    expect(mapCountryCounts({})).toEqual([])
  })
})
