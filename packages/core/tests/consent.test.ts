import { describe, expect, it } from 'vitest'
import {
  CONSENT_ADOPTION_CUTOVER,
  adoptedConsentAt,
  consentWayFromPath,
  formatConsentCookie,
  isConsentKind,
  parseConsentCookie,
  requiredConsents,
} from '../shared/consent'
import { CONSENT_GATE_ALLOWED_API, consentGateAllowed, consentGateApplies } from '../shared/consentGate'
import { consentRowId } from '../server/utils/consentRecords'
import { createConsentPromptSchema } from '../schemas/auth'

/**
 * ZUSTIMMUNG ALS NACHWEIS (SEC-008) und die Tür ohne Zustimmung (SEC-007) —
 * die puren Regeln.
 */
describe('requiredConsents', () => {
  it('verlangt nichts im Core-Default', () => {
    expect(requiredConsents(undefined)).toEqual([])
    expect(requiredConsents({ termsUrl: '', termsVersion: '', businessOnly: false })).toEqual([])
    expect(requiredConsents({ termsUrl: '   ' })).toEqual([])
  })

  it('verlangt die AGB mit der aktuellen Fassung, wenn termsUrl gesetzt ist', () => {
    expect(requiredConsents({ termsUrl: '/terms', termsVersion: ' 2026-09-draft-1 ' }))
      .toEqual([{ kind: 'terms', version: '2026-09-draft-1' }])
    expect(requiredConsents({ termsUrl: '/terms' })).toEqual([{ kind: 'terms', version: '' }])
  })

  it('verlangt AGB und Unternehmer-Bestätigung wie auf branding.supply', () => {
    expect(requiredConsents({ termsUrl: '/terms', termsVersion: 'v1', businessOnly: true }))
      .toEqual([{ kind: 'terms', version: 'v1' }, { kind: 'business', version: '' }])
  })

  it('verlangt die Unternehmer-Bestätigung auch ohne AGB-Seite', () => {
    expect(requiredConsents({ businessOnly: true })).toEqual([{ kind: 'business', version: '' }])
  })

  it('verlangt nie die Betreiber-Bedingungen — die prüft nur die Anlage einer Community', () => {
    const configs = [
      undefined,
      { termsUrl: '/terms', termsVersion: 'v1', businessOnly: true },
      // Felder, die es in `pukalani.auth` nicht gibt, schalten nichts ein.
      { termsUrl: '/terms', operatorTerms: { url: 'https://example.test/terms', version: 'v1' } } as never,
    ]
    for (const config of configs) {
      expect(requiredConsents(config).map(consent => consent.kind)).not.toContain('operator')
    }
  })
})

describe('Arten', () => {
  it('kennt die Betreiber-Bedingungen als eigene Art', () => {
    expect(isConsentKind('terms')).toBe(true)
    expect(isConsentKind('business')).toBe(true)
    expect(isConsentKind('operator')).toBe(true)
    expect(isConsentKind('admin')).toBe(false)
    expect(isConsentKind(undefined)).toBe(false)
  })
})

describe('adoptedConsentAt (Übernahme aus dem Bestand)', () => {
  const before = '2026-10-01T10:00:00.000Z'
  const after = '2026-11-20T10:00:00.000Z'

  it('übernimmt die AGB-Zustimmung bei gleicher Fassung und altem Konto', () => {
    expect(adoptedConsentAt({
      kind: 'terms',
      version: 'v1',
      prefs: { termsAcceptedAt: '2026-10-01T10:00:05.000Z', termsVersion: 'v1' },
      accountCreatedAt: before,
    })).toBe('2026-10-01T10:00:05.000Z')
  })

  it('übernimmt nichts bei einer anderen Fassung', () => {
    expect(adoptedConsentAt({
      kind: 'terms',
      version: 'v2',
      prefs: { termsAcceptedAt: '2026-10-01T10:00:05.000Z', termsVersion: 'v1' },
      accountCreatedAt: before,
    })).toBeNull()
  })

  it('übernimmt nichts ohne Prefs', () => {
    expect(adoptedConsentAt({ kind: 'terms', version: '', prefs: undefined, accountCreatedAt: before })).toBeNull()
    expect(adoptedConsentAt({ kind: 'business', version: '', prefs: {}, accountCreatedAt: before })).toBeNull()
  })

  it('übernimmt nichts für Konten nach dem Stichtag', () => {
    expect(adoptedConsentAt({
      kind: 'business',
      version: '',
      prefs: { businessConfirmedAt: after },
      accountCreatedAt: after,
    })).toBeNull()
    // genau am Stichtag gilt schon die neue Regel
    expect(adoptedConsentAt({
      kind: 'business',
      version: '',
      prefs: { businessConfirmedAt: before },
      accountCreatedAt: CONSENT_ADOPTION_CUTOVER,
    })).toBeNull()
  })

  it('übernimmt nichts bei unlesbarem Datum', () => {
    expect(adoptedConsentAt({
      kind: 'business', version: '', prefs: { businessConfirmedAt: 'gestern' }, accountCreatedAt: before,
    })).toBeNull()
    expect(adoptedConsentAt({
      kind: 'business', version: '', prefs: { businessConfirmedAt: before }, accountCreatedAt: 'kaputt',
    })).toBeNull()
  })

  it('übernimmt die Unternehmer-Bestätigung ohne Fassung', () => {
    expect(adoptedConsentAt({
      kind: 'business', version: '', prefs: { businessConfirmedAt: before }, accountCreatedAt: before,
    })).toBe(before)
  })
})

describe('Weg und Merkzeichen', () => {
  it('liest den Weg aus dem Pfad', () => {
    expect(consentWayFromPath('/api/auth/oauth/callback?userId=x')).toBe('oauth')
    expect(consentWayFromPath('/api/auth/otp/verify')).toBe('otp')
    expect(consentWayFromPath('/api/auth/signup')).toBe('password')
    expect(consentWayFromPath('/api/auth/login')).toBeNull()
  })

  it('schreibt und liest das Merkzeichen, Unbekanntes fällt weg', () => {
    expect(formatConsentCookie(['business', 'terms'])).toBe('terms.business')
    expect(parseConsentCookie('terms.business')).toEqual(['terms', 'business'])
    expect(parseConsentCookie('admin.terms')).toEqual(['terms'])
    expect(parseConsentCookie(undefined)).toEqual([])
    expect(parseConsentCookie('x'.repeat(100))).toEqual([])
  })

  it('das Merkzeichen trägt nie die Betreiber-Bedingungen', () => {
    expect(formatConsentCookie(['operator', 'terms'])).toBe('terms')
    expect(parseConsentCookie('terms.operator')).toEqual(['terms'])
  })
})

describe('consentRowId', () => {
  it('trennt die Betreiber-Bedingungen von den AGB derselben Fassung', () => {
    expect(consentRowId('u-123', 'operator', 'v1')).not.toBe(consentRowId('u-123', 'terms', 'v1'))
    expect(consentRowId('u-123', 'operator', '2026-11-entwurf-1')).toMatch(/^c[0-9a-f]{31}$/)
  })

  it('ist stabil und eine gültige Appwrite-Id', () => {
    const id = consentRowId('u-123', 'terms', 'v1')
    expect(id).toBe(consentRowId('u-123', 'terms', 'v1'))
    expect(id).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/)
    expect(id).toHaveLength(32)
  })

  it('trennt Konto, Art und Fassung', () => {
    const ids = new Set([
      consentRowId('u-123', 'terms', 'v1'),
      consentRowId('u-123', 'terms', 'v2'),
      consentRowId('u-123', 'business', ''),
      consentRowId('u-124', 'terms', 'v1'),
    ])
    expect(ids.size).toBe(4)
  })
})

describe('Erlaubnisliste der Tür', () => {
  it('jeder Eintrag hat einen Grund', () => {
    for (const entry of CONSENT_GATE_ALLOWED_API) expect(entry.reason.length).toBeGreaterThan(10)
  })

  it('lässt Konto, Auskunft, Löschung, Telemetrie, Anwesenheit und Health durch', () => {
    for (const path of [
      '/api/auth/consent',
      '/api/auth/logout',
      '/api/auth/account',
      '/api/auth/export',
      '/api/auth/mfa/challenge',
      '/api/telemetry/error',
      '/api/presence/heartbeat',
      '/api/health',
    ]) {
      expect(consentGateAllowed(path), path).toBe(true)
    }
  })

  it('vergleicht an der Segmentgrenze', () => {
    expect(consentGateAllowed('/api/authx')).toBe(false)
    expect(consentGateAllowed('/api/authx/consent')).toBe(false)
    expect(consentGateAllowed('/api/healthcheck')).toBe(false)
    expect(consentGateAllowed('/api/presence-export')).toBe(false)
  })

  it('lässt mehrdeutige Pfade nie durch', () => {
    expect(consentGateAllowed('/api/auth/../brand/run')).toBe(false)
    expect(consentGateAllowed('/api/auth//x')).toBe(false)
    expect(consentGateAllowed('/api/auth/%2e%2e/brand')).toBe(false)
    expect(consentGateAllowed('/api/auth\\x')).toBe(false)
  })

  it('prüft nur schreibende API-Anfragen', () => {
    expect(consentGateApplies('GET', '/api/brand/projects')).toBe(false)
    expect(consentGateApplies('HEAD', '/api/brand/projects')).toBe(false)
    expect(consentGateApplies('OPTIONS', '/api/brand/projects')).toBe(false)
    expect(consentGateApplies('POST', '/api/brand/projects')).toBe(true)
    expect(consentGateApplies('DELETE', '/api/comments/1')).toBe(true)
    expect(consentGateApplies('POST', '/api/auth/consent')).toBe(false)
    expect(consentGateApplies('POST', '/dashboard')).toBe(false)
  })
})

describe('createConsentPromptSchema', () => {
  it('verlangt genau die fehlenden Häkchen', () => {
    const both = createConsentPromptSchema(undefined, { requireTerms: true, requireBusiness: true })
    expect(both.safeParse({ terms: true, business: true }).success).toBe(true)
    expect(both.safeParse({ terms: true }).success).toBe(false)
    expect(both.safeParse({ terms: 'true', business: true }).success).toBe(false)
    const termsOnly = createConsentPromptSchema(undefined, { requireTerms: true })
    expect(termsOnly.safeParse({ terms: true }).success).toBe(true)
    expect(termsOnly.safeParse({}).success).toBe(false)
  })
})
