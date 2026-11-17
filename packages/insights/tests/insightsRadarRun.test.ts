import { describe, expect, it } from 'vitest'
import { RUN_LEASE_STALL_MS } from '../../core/shared/runLease'
import {
  insightsRadarLastRun,
  parseInsightsRadarRunDetail,
  toInsightsRadarRunDetail,
  toInsightsRadarRunView,
} from '../shared/insightsRadarRun'

/**
 * DIE LAUF-ZEILE DES RADAR-KNOPFES, GELESEN (LL1 a) — die pure Umrechnung
 * Zeile ⇒ Ansicht. Der Zustand kommt aus der Core-Regel `runLeaseState`;
 * geprüft wird hier, was die Radar-Seite daraus bekommt.
 */

const NOW = Date.parse('2026-11-17T12:00:00.000Z')
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()

function lease(input: Partial<{ heartbeatAt: string, finishedAt: string, outcome: string, detail: string }> = {}) {
  return {
    startedAt: iso(-10_000),
    heartbeatAt: input.heartbeatAt ?? iso(-5_000),
    finishedAt: input.finishedAt ?? '',
    outcome: input.outcome ?? '',
    detail: input.detail ?? '',
  }
}

const RESULT = {
  channels: 12, videos: 240, upserted: 238, deleted: 3, tooOld: 2, errors: 1, quotaUnits: 15,
  watchlist: { items: 40, updated: 39, gone: 1 },
}

describe('toInsightsRadarRunView', () => {
  it('keine Zeile ⇒ null (es lief noch nie ein Knopf-Lauf)', () => {
    expect(toInsightsRadarRunView(null, NOW)).toBeNull()
  })

  it('frischer Herzschlag ⇒ running, ohne Zahlen', () => {
    expect(toInsightsRadarRunView(lease(), NOW)).toEqual({
      state: 'running', startedAt: iso(-10_000), finishedAt: '', result: null,
    })
  })

  it('alter Herzschlag ⇒ stalled, ohne Zahlen', () => {
    const view = toInsightsRadarRunView(lease({ heartbeatAt: iso(-RUN_LEASE_STALL_MS - 1) }), NOW)
    expect(view?.state).toBe('stalled')
    expect(view?.result).toBeNull()
  })

  it('beendet mit `done` ⇒ die Zahlen aus dem Detail', () => {
    const view = toInsightsRadarRunView(lease({
      finishedAt: iso(-1_000), outcome: 'done', detail: JSON.stringify(RESULT),
    }), NOW)
    expect(view?.state).toBe('done')
    expect(view?.finishedAt).toBe(iso(-1_000))
    expect(view?.result).toEqual(RESULT)
  })

  it('beendet mit einem Fehler-Code ⇒ failed, und KEINE Zahlen (auch wenn welche drinstehen)', () => {
    const view = toInsightsRadarRunView(lease({
      finishedAt: iso(-1_000), outcome: 'failed', detail: JSON.stringify(RESULT),
    }), NOW)
    expect(view?.state).toBe('failed')
    expect(view?.result).toBeNull()
  })
})

describe('parseInsightsRadarRunDetail — klemmt, statt abzulehnen', () => {
  it('leer oder kaputt ⇒ Nullen, ohne Grund und ohne Teil-Kennzeichen', () => {
    const zero = { channels: 0, videos: 0, upserted: 0, deleted: 0, tooOld: 0, errors: 0, quotaUnits: 0 }
    expect(parseInsightsRadarRunDetail('')).toEqual(zero)
    expect(parseInsightsRadarRunDetail('{kaputt')).toEqual(zero)
    expect(parseInsightsRadarRunDetail('[1,2]')).toEqual(zero)
  })

  it('negative, gebrochene und fremde Werte werden geklemmt; ein unbekannter Grund fällt weg', () => {
    expect(parseInsightsRadarRunDetail(JSON.stringify({
      channels: -3, videos: 2.7, upserted: 'viel', skipped: 'irgendwas', partial: 'ja', watchlist: [1],
    }))).toEqual({ channels: 0, videos: 2, upserted: 0, deleted: 0, tooOld: 0, errors: 0, quotaUnits: 0 })
  })

  it('`skipped: running` (der nächtliche Lauf hielt das Flag) und `partial` reisen mit', () => {
    expect(parseInsightsRadarRunDetail(JSON.stringify({ skipped: 'running' })).skipped).toBe('running')
    const partial = parseInsightsRadarRunDetail(JSON.stringify({ channels: 2, partial: true, channelsUnread: 1 }))
    expect(partial.partial).toBe(true)
    expect(partial.channelsUnread).toBe(1)
  })
})

describe('toInsightsRadarRunDetail — nur Zahlen und Kennungen', () => {
  it('trägt nichts außer den bekannten Feldern hinaus', () => {
    const detail = toInsightsRadarRunDetail({ ...RESULT, title: 'Ein Videotitel' } as typeof RESULT)
    expect(detail).toEqual(RESULT)
    expect(JSON.stringify(detail)).not.toContain('Videotitel')
  })
})

/**
 * DIE ZAHLEN DES LETZTEN LAUFS AUF DER SEITE (LL1 c) — aus der Lauf-Zeile,
 * nicht aus der Meldung beim Ende. Gescheitert und abgebrochen tragen keine
 * Zahlen, ein laufender Lauf und „noch keiner" nichts.
 */
describe('insightsRadarLastRun', () => {
  const STARTED = '2026-11-17T03:00:00.000Z'
  const FINISHED = '2026-11-17T03:01:30.000Z'
  const NUMBERS = { channels: 11, videos: 22, upserted: 20, deleted: 1, tooOld: 2, errors: 0, quotaUnits: 14 }

  it('fertig ⇒ die Zahlen mit dem Tag des Endes', () => {
    expect(insightsRadarLastRun({ state: 'done', startedAt: STARTED, finishedAt: FINISHED, result: NUMBERS }))
      .toEqual({ kind: 'done', at: FINISHED, result: NUMBERS })
  })

  it('fertig, aber nichts geholt ⇒ der Grund statt Nullen', () => {
    expect(insightsRadarLastRun({ state: 'done', startedAt: STARTED, finishedAt: FINISHED, result: { ...NUMBERS, skipped: 'no_channels' } }))
      .toEqual({ kind: 'skipped', at: FINISHED, reason: 'no_channels' })
  })

  it('gescheitert und abgebrochen werden benannt, ohne Zahlen', () => {
    expect(insightsRadarLastRun({ state: 'failed', startedAt: STARTED, finishedAt: FINISHED, result: null }))
      .toEqual({ kind: 'failed', at: FINISHED })
    // Ein abgebrochener Lauf hat kein Ende — dann zählt sein Beginn.
    expect(insightsRadarLastRun({ state: 'stalled', startedAt: STARTED, finishedAt: '', result: null }))
      .toEqual({ kind: 'stalled', at: STARTED })
  })

  it('läuft oder noch keiner ⇒ nichts', () => {
    expect(insightsRadarLastRun({ state: 'running', startedAt: STARTED, finishedAt: '', result: null })).toBeNull()
    expect(insightsRadarLastRun(null)).toBeNull()
    expect(insightsRadarLastRun(undefined)).toBeNull()
  })

  it('aus einer echten Zeile gerechnet: done mit Zahlen, ein alter Herzschlag ⇒ abgebrochen', () => {
    const now = Date.parse(FINISHED) + 1000
    const done = toInsightsRadarRunView({
      startedAt: STARTED, heartbeatAt: FINISHED, finishedAt: FINISHED, outcome: 'done', detail: JSON.stringify(NUMBERS),
    }, now)
    expect(insightsRadarLastRun(done)).toEqual({ kind: 'done', at: FINISHED, result: NUMBERS })
    const stalled = toInsightsRadarRunView({
      startedAt: STARTED, heartbeatAt: STARTED, finishedAt: '', outcome: '', detail: JSON.stringify(NUMBERS),
    }, Date.parse(STARTED) + RUN_LEASE_STALL_MS + 1)
    expect(insightsRadarLastRun(stalled)).toEqual({ kind: 'stalled', at: STARTED })
  })
})
