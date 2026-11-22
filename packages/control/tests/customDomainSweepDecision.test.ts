import { describe, expect, it } from 'vitest'
import { CUSTOM_DOMAIN_GRACE_DAYS } from '../shared/customDomain'
import {
  CUSTOM_DOMAIN_CLEARED_PATCH,
  customDomainSweepHeldByUnknownApproval,
  decideCustomDomainSweep,
  resolveCustomDomainSweepMode,
  type CustomDomainSweepRow,
} from '../shared/customDomainSweep'
import {
  CUSTOM_DOMAIN_NOTICE_ENDING_DAYS,
  customDomainNoticeRowId,
  customDomainNoticesDue,
} from '../shared/customDomainNotice'

/**
 * BE-014 — die PURE Entscheidung des Fristen-Laufs und die zwei Hinweise.
 * Jede Zeile dieser Tabelle ist eine Domain, die entweder zu Unrecht
 * abgeschaltet oder zu Unrecht weiter verschenkt würde.
 */

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-11-16T12:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

/** Standard: bezahltes Pro, freigegeben, aktive Domain, keine Frist. */
function row(overrides: Partial<CustomDomainSweepRow> = {}): CustomDomainSweepRow {
  return {
    status: 'active',
    mode: 'pool',
    plan: 'pro',
    trialEndsAt: null,
    billingStatus: 'active',
    customDomain: 'kunde.de',
    customDomainStatus: 'active',
    customDomainApproved: true,
    customDomainVerifiedAt: iso(NOW - 30 * DAY),
    customDomainClaimedAt: iso(NOW - 30 * DAY),
    customDomainGraceEndsAt: null,
    ...overrides,
  }
}

describe('decideCustomDomainSweep — aktive Domain', () => {
  it('bezahltes Pro mit Freigabe ⇒ nichts', () => {
    expect(decideCustomDomainSweep(row(), NOW)).toEqual({ action: 'none' })
  })

  it('wieder berechtigt, Frist steht noch ⇒ Frist räumen', () => {
    expect(decideCustomDomainSweep(row({ customDomainGraceEndsAt: iso(NOW + 5 * DAY) }), NOW))
      .toEqual({ action: 'clear_grace', patch: { customDomainGraceEndsAt: null } })
  })

  it.each([
    ['Plan Personal', { plan: 'personal' }],
    ['Plan Basic', { plan: 'basic' }],
    ['Freigabe fehlt', { customDomainApproved: false }],
    ['Freigabe nie gesetzt (null)', { customDomainApproved: null }],
    ['Testphase mit aktiver Domain', { trialEndsAt: iso(NOW + 3 * DAY), billingStatus: null }],
  ])('%s, keine Frist ⇒ Frist beginnt (14 Tage)', (_label, patch) => {
    const decision = decideCustomDomainSweep(row(patch as Partial<CustomDomainSweepRow>), NOW)
    expect(decision).toEqual({ action: 'start_grace', patch: { customDomainGraceEndsAt: iso(NOW + CUSTOM_DOMAIN_GRACE_DAYS * DAY) } })
  })

  it('nicht berechtigt, Frist läuft ⇒ nichts', () => {
    expect(decideCustomDomainSweep(row({ plan: 'basic', customDomainGraceEndsAt: iso(NOW + DAY) }), NOW)).toEqual({ action: 'none' })
  })

  it('nicht berechtigt, Frist erreicht ⇒ abschalten (Frist weg, Stempel jetzt)', () => {
    expect(decideCustomDomainSweep(row({ plan: 'basic', customDomainGraceEndsAt: iso(NOW) }), NOW)).toEqual({
      action: 'pause',
      patch: { customDomainStatus: 'paused', customDomainPausedAt: iso(NOW), customDomainGraceEndsAt: null },
    })
  })

  it('unlesbare Frist ⇒ nichts (fail-open, nie zu Unrecht abschalten)', () => {
    expect(decideCustomDomainSweep(row({ plan: 'basic', customDomainGraceEndsAt: 'bald' }), NOW)).toEqual({ action: 'none' })
  })

  it('unlesbares Testphasen-Datum zählt nicht als Testphase', () => {
    expect(decideCustomDomainSweep(row({ trialEndsAt: 'irgendwann', billingStatus: null }), NOW)).toEqual({ action: 'none' })
  })

  it('eine Missbrauchs-Sperre hält den Lauf nicht auf (gleiche Regel an der Domain)', () => {
    expect(decideCustomDomainSweep({ ...row({ plan: 'basic' }), suspension: 'abuse' } as CustomDomainSweepRow, NOW).action).toBe('start_grace')
  })
})

describe('decideCustomDomainSweep — Freigabe-Pflicht entfällt (PK1 K6)', () => {
  it('ohne Freigabe und ohne Ausnahme beginnt die Frist (Gegenprobe)', () => {
    expect(decideCustomDomainSweep(row({ customDomainApproved: false }), NOW).action).toBe('start_grace')
  })

  it('mit bestätigter Ausnahme ist eine bezahlte Pro-Domain ohne Freigabe berechtigt', () => {
    expect(decideCustomDomainSweep(row({ customDomainApproved: false }), NOW, { approvalWaived: true })).toEqual({ action: 'none' })
    expect(decideCustomDomainSweep(row({ customDomainApproved: false, customDomainGraceEndsAt: iso(NOW + DAY) }), NOW, { approvalWaived: true }).action).toBe('clear_grace')
  })

  it('Frage nicht zustande gekommen: nur-Freigabe-fehlt hält an, andere Gründe nicht', () => {
    expect(decideCustomDomainSweep(row({ customDomainApproved: false }), NOW, { approvalUnknown: true })).toEqual({ action: 'none' })
    expect(decideCustomDomainSweep(row({ customDomainApproved: false, customDomainGraceEndsAt: iso(NOW - 1) }), NOW, { approvalUnknown: true })).toEqual({ action: 'none' })
    expect(decideCustomDomainSweep(row({ plan: 'basic', customDomainApproved: false }), NOW, { approvalUnknown: true }).action).toBe('start_grace')
    expect(customDomainSweepHeldByUnknownApproval(row({ customDomainApproved: false }), NOW)).toBe(true)
    expect(customDomainSweepHeldByUnknownApproval(row({ plan: 'basic', customDomainApproved: false }), NOW)).toBe(false)
    expect(customDomainSweepHeldByUnknownApproval(row(), NOW)).toBe(false)
  })

  it('die Testphasen-Sperre bleibt auch mit Ausnahme', () => {
    expect(decideCustomDomainSweep(row({ trialEndsAt: iso(NOW + 5 * DAY), billingStatus: null }), NOW, { approvalWaived: true }).action).toBe('start_grace')
  })
})

describe('decideCustomDomainSweep — nichts zu tun', () => {
  it.each([
    ['stillgelegte Community', { status: 'disabled' }],
    ['Silo-Community', { mode: 'silo' }],
    ['keine Domain', { customDomain: '' }],
    ['Domain null (Bestand)', { customDomain: null }],
  ])('%s ⇒ nichts', (_label, patch) => {
    expect(decideCustomDomainSweep(row({ plan: 'basic', ...patch } as Partial<CustomDomainSweepRow>), NOW)).toEqual({ action: 'none' })
  })

  it('abgeschaltete Domain bleibt abgeschaltet', () => {
    expect(decideCustomDomainSweep(row({ plan: 'basic', customDomainStatus: 'paused' }), NOW)).toEqual({ action: 'none' })
  })
})

describe('decideCustomDomainSweep — Einträge ohne Nachweis', () => {
  const pending = (overrides: Partial<CustomDomainSweepRow> = {}) =>
    row({ customDomainStatus: 'pending_dns', customDomainVerifiedAt: null, customDomainClaimedAt: null, ...overrides })

  it('Eintrag ohne Datum ⇒ stempeln (Bestand zählt ab dem ersten Lauf)', () => {
    expect(decideCustomDomainSweep(pending(), NOW)).toEqual({ action: 'stamp_claim', patch: { customDomainClaimedAt: iso(NOW) } })
  })

  it('Fehler OHNE Nachweis und ohne Datum ⇒ stempeln', () => {
    expect(decideCustomDomainSweep(pending({ customDomainStatus: 'error' }), NOW).action).toBe('stamp_claim')
  })

  it('Fehler NACH dem Nachweis ⇒ kein Stempel', () => {
    expect(decideCustomDomainSweep(pending({ customDomainStatus: 'error', customDomainVerifiedAt: iso(NOW - DAY) }), NOW)).toEqual({ action: 'none' })
  })

  it('Eintrag älter als 14 Tage ⇒ verfällt (wie „Domain entfernen", Freigabe bleibt)', () => {
    const decision = decideCustomDomainSweep(pending({ customDomainClaimedAt: iso(NOW - 15 * DAY) }), NOW)
    expect(decision).toEqual({ action: 'expire_claim', patch: { ...CUSTOM_DOMAIN_CLEARED_PATCH } })
    expect(CUSTOM_DOMAIN_CLEARED_PATCH).not.toHaveProperty('customDomainApproved')
  })

  it('frischer Eintrag ⇒ nichts', () => {
    expect(decideCustomDomainSweep(pending({ customDomainClaimedAt: iso(NOW - 2 * DAY) }), NOW)).toEqual({ action: 'none' })
  })

  it('unlesbares Eintragsdatum ⇒ nichts (weder Stempel noch Verfall)', () => {
    expect(decideCustomDomainSweep(pending({ customDomainClaimedAt: 'gestern' }), NOW)).toEqual({ action: 'none' })
  })

  it('Domain mit Nachweis (Zertifikat unterwegs) verfällt nie', () => {
    expect(decideCustomDomainSweep(pending({ customDomainStatus: 'pending_cert', customDomainClaimedAt: iso(NOW - 40 * DAY) }), NOW)).toEqual({ action: 'none' })
  })
})

describe('resolveCustomDomainSweepMode', () => {
  it.each([['off'], ['dry-run'], ['apply']])('%s bleibt', (value) => {
    expect(resolveCustomDomainSweepMode(value)).toBe(value)
  })
  it.each([[undefined], [''], ['Apply'], ['on'], [true]])('%s ⇒ off', (value) => {
    expect(resolveCustomDomainSweepMode(value)).toBe('off')
  })
})

describe('customDomainNoticesDue', () => {
  it('erster Tag ⇒ nur start', () => {
    expect(customDomainNoticesDue(iso(NOW + 14 * DAY), NOW)).toEqual(['start'])
  })
  it('drei Tage vorher ⇒ nur ending (nie beide zugleich)', () => {
    expect(customDomainNoticesDue(iso(NOW + CUSTOM_DOMAIN_NOTICE_ENDING_DAYS * DAY), NOW)).toEqual(['ending'])
    expect(customDomainNoticesDue(iso(NOW + DAY), NOW)).toEqual(['ending'])
  })
  it('knapp mehr als drei Tage ⇒ nur start', () => {
    expect(customDomainNoticesDue(iso(NOW + 3 * DAY + 60_000), NOW)).toEqual(['start'])
  })
  it('nach dem Ende, ohne oder mit unlesbarem Datum ⇒ nichts', () => {
    expect(customDomainNoticesDue(iso(NOW), NOW)).toEqual([])
    expect(customDomainNoticesDue(iso(NOW - DAY), NOW)).toEqual([])
    expect(customDomainNoticesDue(null, NOW)).toEqual([])
    expect(customDomainNoticesDue('bald', NOW)).toEqual([])
  })
})

describe('customDomainNoticeRowId', () => {
  const base = ['c1', '2026-11-30T12:00:00.000Z', 'start', 'u1'] as const
  it('ist stabil und passt in eine Appwrite-Id (≤ 36, ohne _ am Anfang)', () => {
    const id = customDomainNoticeRowId(...base)
    expect(id).toBe(customDomainNoticeRowId(...base))
    expect(id.length).toBeLessThanOrEqual(36)
    expect(id).toMatch(/^cdgrace-[0-9a-f]{28}$/)
  })
  it('unterscheidet Art, Frist und Empfänger', () => {
    const id = customDomainNoticeRowId(...base)
    expect(customDomainNoticeRowId('c1', base[1], 'ending', 'u1')).not.toBe(id)
    expect(customDomainNoticeRowId('c1', '2027-01-10T12:00:00.000Z', 'start', 'u1')).not.toBe(id)
    expect(customDomainNoticeRowId('c1', base[1], 'start', 'u2')).not.toBe(id)
    expect(customDomainNoticeRowId('c2', base[1], 'start', 'u1')).not.toBe(id)
  })
})
