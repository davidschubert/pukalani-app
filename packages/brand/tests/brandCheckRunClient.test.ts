import { describe, expect, it } from 'vitest'
import {
  BRAND_CHECK_RUN_REMEMBER_MS,
  brandCheckRunEnd,
  parsePendingBrandCheckRun,
  serializePendingBrandCheckRun,
} from '../shared/brandCheckRunClient'

/**
 * WAS DER BROWSER VOM LAUF DES ÖFFENTLICHEN CHECKS WEISS (LL1 b).
 *
 * Zwei Regeln, beide pur: welcher gemerkte Lauf nach einem Neuladen wieder
 * aufgenommen wird, und wie ein Lauf für die Seite endet. Die erste liest aus
 * dem Speicher des Browsers — der gehört dem Menschen davor und kann alles
 * enthalten.
 */

const NOW = Date.parse('2026-11-18T12:00:00.000Z')
const TOKEN = `r${'a'.repeat(31)}.${'B'.repeat(43)}`

describe('der gemerkte Lauf', () => {
  it('ein frischer Merker wird wieder aufgenommen — mit der Adresse von damals', () => {
    const raw = serializePendingBrandCheckRun({ token: TOKEN, url: 'kailua.coffee', at: NOW - 30_000 })

    expect(parsePendingBrandCheckRun(raw, NOW)).toEqual({ token: TOKEN, url: 'kailua.coffee', at: NOW - 30_000 })
  })

  it('zu alt ⇒ nicht mehr aufnehmen (wer morgen wiederkommt, sieht ein leeres Formular)', () => {
    const raw = serializePendingBrandCheckRun({ token: TOKEN, url: 'kailua.coffee', at: NOW - BRAND_CHECK_RUN_REMEMBER_MS - 1 })

    expect(parsePendingBrandCheckRun(raw, NOW)).toBeNull()
    // GEGENPROBE: genau an der Grenze gilt er noch.
    const edge = serializePendingBrandCheckRun({ token: TOKEN, url: '', at: NOW - BRAND_CHECK_RUN_REMEMBER_MS })
    expect(parsePendingBrandCheckRun(edge, NOW)?.token).toBe(TOKEN)
  })

  it('aus der Zukunft (verstellte Uhr) ⇒ nicht aufnehmen', () => {
    const raw = serializePendingBrandCheckRun({ token: TOKEN, url: '', at: NOW + 10 * 60_000 })

    expect(parsePendingBrandCheckRun(raw, NOW)).toBeNull()
  })

  it('alles, was nicht genau die Form hat, heisst „kein offener Lauf" — ohne Wurf', () => {
    const broken = [
      null,
      undefined,
      '',
      'kein json',
      '[]',
      '"text"',
      '{}',
      JSON.stringify({ token: 'c1', url: 'x', at: NOW }),
      JSON.stringify({ token: `${TOKEN}x`, url: 'x', at: NOW }),
      JSON.stringify({ token: '../brand_checks/c1', url: 'x', at: NOW }),
      JSON.stringify({ token: TOKEN, url: 'x', at: 'gestern' }),
      JSON.stringify({ token: TOKEN, url: 'x' }),
    ]
    for (const raw of broken) expect(parsePendingBrandCheckRun(raw, NOW)).toBeNull()
  })

  it('eine fremde oder überlange Adresse im Merker wird geklemmt, nicht abgelehnt', () => {
    expect(parsePendingBrandCheckRun(JSON.stringify({ token: TOKEN, url: 42, at: NOW }), NOW)?.url).toBe('')
    const long = parsePendingBrandCheckRun(JSON.stringify({ token: TOKEN, url: 'x'.repeat(5000), at: NOW }), NOW)
    expect(long?.url).toHaveLength(512)
  })
})

describe('wie ein Lauf für die Seite endet', () => {
  it('fertig mit Ergebnis ⇒ die Id', () => {
    expect(brandCheckRunEnd({ state: 'done', failure: '', ref: 'c7' })).toEqual({ kind: 'done', id: 'c7' })
  })

  it('fertig OHNE Ergebnis-Id ist kein Erfolg', () => {
    expect(brandCheckRunEnd({ state: 'done', failure: '', ref: '' })).toEqual({ kind: 'failed', reason: 'failed' })
  })

  it('gescheitert ⇒ der kurze Grund des Laufs', () => {
    expect(brandCheckRunEnd({ state: 'failed', failure: 'site_blocked', ref: '' }))
      .toEqual({ kind: 'failed', reason: 'site_blocked' })
    expect(brandCheckRunEnd({ state: 'failed', failure: '', ref: '' })).toEqual({ kind: 'failed', reason: 'failed' })
  })

  it('abgebrochen, noch unterwegs und unbekannt sind drei verschiedene Auskünfte', () => {
    expect(brandCheckRunEnd({ state: 'stalled', failure: '', ref: '' })).toEqual({ kind: 'interrupted' })
    expect(brandCheckRunEnd({ state: 'running', failure: '', ref: '' })).toEqual({ kind: 'running' })
    expect(brandCheckRunEnd({ state: 'none', failure: '', ref: '' })).toEqual({ kind: 'gone' })
  })
})
