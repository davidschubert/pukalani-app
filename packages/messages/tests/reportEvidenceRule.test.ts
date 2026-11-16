import { describe, expect, it } from 'vitest'
import {
  REPORT_EVIDENCE_RETENTION_DAYS,
  evidenceDueForClearing,
  evidenceStillProtected,
  moderatorVisibleBody,
  resolveReportEvidenceSweepMode,
  shouldLogEvidenceSweep,
  type ReportEvidenceState,
} from '../shared/messageReport'
import { RETENTION_DAYS, evidenceDue } from '../scripts/lib/reportEvidenceRule.mjs'

/**
 * SEC-033 — DIE ZWEI REGELN NACH DER ERLEDIGUNG (Davids Entscheidung
 * 2026-11-12): Text nur bei offener Meldung; danach 90 Tage gespeichert,
 * dann gelöscht.
 */

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-16T12:00:00.000Z')
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString()

const base: ReportEvidenceState = {
  reportedBody: 'Beleg',
  reportedAt: ago(200),
  open: 0,
  closed: 1,
  lastClosedAt: ago(90),
}

describe('was die Moderation sieht (eine Funktion für Liste und Einzel-Route)', () => {
  it('offene Meldung ⇒ die eingefrorene Kopie', () => {
    expect(moderatorVisibleBody({ reportedBody: 'Beleg', reportedAt: ago(1), openReports: 1 })).toBe('Beleg')
  })

  it('erledigt ⇒ nichts, auch wenn die Kopie noch gespeichert ist', () => {
    expect(moderatorVisibleBody({ reportedBody: 'Beleg', reportedAt: ago(1), openReports: 0 })).toBeNull()
  })

  it('nie eingefroren ⇒ nichts, auch bei offener Meldung', () => {
    expect(moderatorVisibleBody({ reportedBody: 'Beleg', reportedAt: '', openReports: 3 })).toBeNull()
  })

  it('eine unsinnige Zahl gibt nichts heraus', () => {
    expect(moderatorVisibleBody({ reportedBody: 'Beleg', reportedAt: ago(1), openReports: Number.NaN })).toBeNull()
    expect(moderatorVisibleBody({ reportedBody: 'Beleg', reportedAt: ago(1), openReports: -1 })).toBeNull()
  })
})

describe('fällig zum Leeren', () => {
  it('genau 90 Tage nach der letzten Erledigung ⇒ fällig; einen Tag vorher nicht', () => {
    expect(REPORT_EVIDENCE_RETENTION_DAYS).toBe(90)
    expect(evidenceDueForClearing(base, NOW)).toBe(true)
    expect(evidenceDueForClearing({ ...base, lastClosedAt: ago(89) }, NOW)).toBe(false)
  })

  it('die LETZTE Erledigung zählt, nicht die Meldung', () => {
    // gemeldet vor 200 Tagen, zuletzt erledigt vor 10 ⇒ noch nicht fällig
    expect(evidenceDueForClearing({ ...base, lastClosedAt: ago(10) }, NOW)).toBe(false)
  })

  it('eine offene Meldung schützt, egal wie alt', () => {
    expect(evidenceDueForClearing({ ...base, open: 1, lastClosedAt: ago(400) }, NOW)).toBe(false)
  })

  it('ohne jede Meldungs-Zeile (zurückgezogen) beginnt die Frist bei der Meldung', () => {
    expect(evidenceDueForClearing({ ...base, closed: 0, lastClosedAt: '', reportedAt: ago(90) }, NOW)).toBe(true)
    expect(evidenceDueForClearing({ ...base, closed: 0, lastClosedAt: '', reportedAt: ago(30) }, NOW)).toBe(false)
  })

  it('unlesbares Datum ⇒ nie fällig', () => {
    expect(evidenceDueForClearing({ ...base, lastClosedAt: 'kein Datum' }, NOW)).toBe(false)
    expect(evidenceDueForClearing({ ...base, closed: 1, lastClosedAt: '' }, NOW)).toBe(false)
    expect(evidenceDueForClearing({ ...base, closed: 0, lastClosedAt: '', reportedAt: 'kaputt' }, NOW)).toBe(false)
  })

  it('schon geleert oder nie eingefroren ⇒ nichts zu tun', () => {
    expect(evidenceDueForClearing({ ...base, reportedBody: '' }, NOW)).toBe(false)
    expect(evidenceDueForClearing({ ...base, reportedAt: '' }, NOW)).toBe(false)
  })

  it('passt zur Grenze der Kontolöschung (geschützt bis < 90, fällig ab 90)', () => {
    expect(evidenceStillProtected(ago(90), NOW)).toBe(false)
    expect(evidenceDueForClearing({ ...base, closed: 0, lastClosedAt: '', reportedAt: ago(90) }, NOW)).toBe(true)
  })
})

describe('die Kopie im Zähl-Skript entscheidet gleich', () => {
  const cases: ReportEvidenceState[] = [
    base,
    { ...base, lastClosedAt: ago(89) },
    { ...base, lastClosedAt: ago(10) },
    { ...base, open: 1, lastClosedAt: ago(400) },
    { ...base, closed: 0, lastClosedAt: '', reportedAt: ago(90) },
    { ...base, closed: 0, lastClosedAt: '', reportedAt: ago(30) },
    { ...base, lastClosedAt: 'kein Datum' },
    { ...base, closed: 1, lastClosedAt: '' },
    { ...base, reportedBody: '' },
    { ...base, reportedAt: '' },
  ]
  it.each(cases.map((c, i) => [i, c] as const))('Fall %i', (_i, state) => {
    expect(evidenceDue(state, NOW)).toBe(evidenceDueForClearing(state, NOW))
  })

  it('dieselbe Frist', () => {
    expect(RETENTION_DAYS).toBe(REPORT_EVIDENCE_RETENTION_DAYS)
  })
})

describe('Schalter und Log-Zeile', () => {
  it('fehlt ⇒ off; bekannt ⇒ übernommen; unbekannt ⇒ off und ungültig', () => {
    expect(resolveReportEvidenceSweepMode(undefined)).toEqual({ mode: 'off', invalid: false })
    expect(resolveReportEvidenceSweepMode('count')).toEqual({ mode: 'count', invalid: false })
    expect(resolveReportEvidenceSweepMode('apply')).toEqual({ mode: 'apply', invalid: false })
    expect(resolveReportEvidenceSweepMode('dry-run')).toEqual({ mode: 'off', invalid: true })
  })

  it('erste Zeile immer, danach nur bei Änderung', () => {
    expect(shouldLogEvidenceSweep(null, { due: 0, cleared: 0, failed: 0 })).toBe(true)
    expect(shouldLogEvidenceSweep(3, { due: 3, cleared: 0, failed: 0 })).toBe(false)
    expect(shouldLogEvidenceSweep(3, { due: 4, cleared: 0, failed: 0 })).toBe(true)
    expect(shouldLogEvidenceSweep(3, { due: 3, cleared: 1, failed: 0 })).toBe(true)
    expect(shouldLogEvidenceSweep(3, { due: 3, cleared: 0, failed: 2 })).toBe(true)
  })
})
