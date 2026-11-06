import { describe, expect, it } from 'vitest'
import {
  BRAND_EVENTS_RETENTION_MONTHS,
  brandEventSweepDue,
  brandEventsRetentionCutoff,
} from '../shared/brandEventsRetention'

/**
 * DIE 24-MONATS-FRIST DER FUNNEL-EREIGNISSE (BS1 R1b) — mit GEGENPROBE an
 * jeder Zusage.
 *
 * Die Gegenprobe ist hier das Ganze: eine Regel, die IMMER `true` sagt,
 * bestünde jeden Test, der nur „alt wird gelöscht" prüft — und nähme dem
 * Betreiber am Tag der Messung seinen Trichter. Eine, die immer `false` sagt,
 * bestünde jeden Test, der nur „frisch bleibt stehen" prüft — und wäre die
 * stille Version davon, die Frist gar nicht zu haben. Genau die stand hier bis
 * heute: der Kommentar in `007-brand-events.ts` versprach sie, gebaut war sie
 * nie.
 */

const NOW = new Date('2026-09-07T12:00:00.000Z')

describe('brandEventsRetentionCutoff', () => {
  it('der Stichtag liegt genau 24 KALENDER-Monate zurück', () => {
    expect(brandEventsRetentionCutoff(NOW)).toBe('2024-09-07T12:00:00.000Z')
  })

  it('die Frist IST die Konstante — keine zweite Zahl daneben', () => {
    const cutoff = new Date(brandEventsRetentionCutoff(NOW))
    const months = (NOW.getUTCFullYear() - cutoff.getUTCFullYear()) * 12
      + (NOW.getUTCMonth() - cutoff.getUTCMonth())
    expect(months).toBe(BRAND_EVENTS_RETENTION_MONTHS)
  })

  it('Kalender, nicht 24 × 30 Tage — der Unterschied wäre gut drei Wochen', () => {
    const days = (NOW.getTime() - Date.parse(brandEventsRetentionCutoff(NOW))) / 86_400_000
    expect(days).toBeGreaterThan(24 * 30)
    expect(Math.round(days)).toBe(730)
  })

  it('der 29. Februar rollt auf den 1. März — kürzer ist die sichere Seite', () => {
    // 24 Monate vor dem 29.02.2028 gibt es nicht (2026 ist kein Schaltjahr).
    expect(brandEventsRetentionCutoff(new Date('2028-02-29T00:00:00.000Z')))
      .toBe('2026-03-01T00:00:00.000Z')
  })
})

describe('brandEventSweepDue', () => {
  it('älter als 24 Monate ⇒ fällig', () => {
    expect(brandEventSweepDue({ $createdAt: '2024-09-07T11:59:59.000Z' }, NOW)).toBe(true)
  })

  it('deutlich älter (25 Monate) ⇒ fällig', () => {
    expect(brandEventSweepDue({ $createdAt: '2024-08-07T12:00:00.000Z' }, NOW)).toBe(true)
  })

  it('GEGENPROBE: 23 Monate alt ⇒ NICHT fällig', () => {
    expect(brandEventSweepDue({ $createdAt: '2024-10-07T12:00:00.000Z' }, NOW)).toBe(false)
  })

  it('GEGENPROBE: eine Sekunde jünger als der Stichtag ⇒ NICHT fällig', () => {
    expect(brandEventSweepDue({ $createdAt: '2024-09-07T12:00:01.000Z' }, NOW)).toBe(false)
  })

  it('EXAKT auf dem Stichtag ⇒ NICHT fällig — die Sekunde gehört dem Aufbewahren', () => {
    expect(brandEventSweepDue({ $createdAt: brandEventsRetentionCutoff(NOW) }, NOW)).toBe(false)
  })

  it('GEGENPROBE: ein Ereignis von heute ⇒ NICHT fällig', () => {
    expect(brandEventSweepDue({ $createdAt: NOW.toISOString() }, NOW)).toBe(false)
  })

  it('IM ZWEIFEL WIRD NICHT GELÖSCHT: kein Zeitstempel ⇒ NICHT fällig', () => {
    expect(brandEventSweepDue({}, NOW)).toBe(false)
  })

  it('IM ZWEIFEL WIRD NICHT GELÖSCHT: unlesbarer Zeitstempel ⇒ NICHT fällig', () => {
    expect(brandEventSweepDue({ $createdAt: 'vorgestern' }, NOW)).toBe(false)
  })

  it('Appwrites Zeitform (+00:00 statt Z) wird verstanden', () => {
    // So kommt `$createdAt` aus der API zurück — eine Regel, die nur `Z`
    // versteht, hielte in Produktion JEDE Zeile für unlesbar und damit für
    // nicht fällig: die Frist wäre still wieder weg.
    expect(brandEventSweepDue({ $createdAt: '2023-01-01T00:00:00.000+00:00' }, NOW)).toBe(true)
  })
})
