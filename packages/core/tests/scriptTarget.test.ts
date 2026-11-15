import { describe, expect, it } from 'vitest'
import { checkStripeTarget, checkTarget, CONFIRM_ENV, isLocalEndpoint } from '../../../scripts/lib/target.mjs'

/**
 * OPS-002 (GA1 P21): die EINE Ziel-Regel für Skripte mit Schreibzugriff
 * (`scripts/lib/target.mjs`). Rein — kein Netz, keine Appwrite.
 */
describe('isLocalEndpoint', () => {
  it.each([
    'http://localhost/v1',
    'http://localhost:8080/v1',
    'http://127.0.0.1/v1',
    'http://[::1]:8080/v1',
    'http://appwrite.localhost/v1',
    'HTTP://LOCALHOST/v1',
  ])('%s ist lokal', (endpoint) => {
    expect(isLocalEndpoint(endpoint)).toBe(true)
  })

  it.each([
    'https://api.pukalani.app/v1',
    'https://localhost.pukalani.app/v1',
    'http://127.0.0.2/v1',
    'kein-url',
    '',
    undefined,
  ])('%s ist NICHT lokal (Unlesbares zählt als entfernt)', (endpoint) => {
    expect(isLocalEndpoint(endpoint)).toBe(false)
  })
})

describe('checkTarget', () => {
  const remote = 'https://api.pukalani.app/v1'
  const local = 'http://localhost/v1'

  it('fehlender Endpunkt oder Projekt ⇒ incomplete', () => {
    expect(checkTarget({ endpoint: undefined, projectId: 'branding' })).toMatchObject({ ok: false, reason: 'incomplete' })
    expect(checkTarget({ endpoint: remote, projectId: '' })).toMatchObject({ ok: false, reason: 'incomplete' })
  })

  it('lokal ohne Liste ⇒ durch', () => {
    expect(checkTarget({ endpoint: local, projectId: 'pool' })).toEqual({ ok: true, local: true })
  })

  it('die Liste erlaubter Projekte gilt auch lokal — und die Meldung nennt beide Ids', () => {
    const result = checkTarget({ endpoint: local, projectId: 'account', allowedProjects: ['branding'] })
    expect(result).toMatchObject({ ok: false, reason: 'project_not_allowed' })
    expect(!result.ok && result.message).toContain('account')
    expect(!result.ok && result.message).toContain('branding')
  })

  it('leere Liste ⇒ jedes Projekt abgelehnt', () => {
    expect(checkTarget({ endpoint: local, projectId: 'marketing', allowedProjects: [] })).toMatchObject({ ok: false, reason: 'project_not_allowed' })
  })

  it('entfernt ohne Bestätigung ⇒ Abbruch mit Hinweis auf die Variable', () => {
    const result = checkTarget({ endpoint: remote, projectId: 'branding', allowedProjects: ['branding'] })
    expect(result).toMatchObject({ ok: false, reason: 'remote_unconfirmed' })
    expect(!result.ok && result.message).toContain(`${CONFIRM_ENV}=branding`)
  })

  it('entfernt mit confirmed=true (Runner mit --prod) ⇒ durch', () => {
    expect(checkTarget({ endpoint: remote, projectId: 'branding', allowedProjects: ['branding'], confirmed: true })).toEqual({ ok: true, local: false })
  })

  it('entfernt mit passender Bestätigung ⇒ durch', () => {
    expect(checkTarget({ endpoint: remote, projectId: 'branding', confirmed: 'branding' })).toEqual({ ok: true, local: false })
  })

  it('abweichende Bestätigung ⇒ Abbruch, die Meldung nennt beide Ids (auch lokal)', () => {
    for (const endpoint of [remote, local]) {
      const result = checkTarget({ endpoint, projectId: 'branding', confirmed: 'account' })
      expect(result).toMatchObject({ ok: false, reason: 'confirm_mismatch' })
      expect(!result.ok && result.message).toContain('„account"')
      expect(!result.ok && result.message).toContain('„branding"')
    }
  })

  it('die Liste schlägt die Bestätigung: confirmed=true hilft einem fremden Projekt nicht', () => {
    expect(checkTarget({ endpoint: remote, projectId: 'account', allowedProjects: ['branding'], confirmed: true })).toMatchObject({ ok: false, reason: 'project_not_allowed' })
  })
})

describe('checkStripeTarget', () => {
  it('fehlender Schlüssel ⇒ Abbruch', () => {
    expect(checkStripeTarget({ key: undefined, live: false }).ok).toBe(false)
  })

  it('Test-Schlüssel ohne --live ⇒ test', () => {
    expect(checkStripeTarget({ key: 'sk_test_abc', live: false })).toEqual({ ok: true, mode: 'test' })
  })

  it('Live-Schlüssel braucht --live', () => {
    expect(checkStripeTarget({ key: 'sk_live_abc', live: false }).ok).toBe(false)
    expect(checkStripeTarget({ key: 'rk_live_abc', live: false }).ok).toBe(false)
    expect(checkStripeTarget({ key: 'sk_live_abc', live: true })).toEqual({ ok: true, mode: 'live' })
  })

  it('--live mit Test-Schlüssel ⇒ Abbruch (Aufruf und Schlüssel passen nicht)', () => {
    expect(checkStripeTarget({ key: 'sk_test_abc', live: true }).ok).toBe(false)
  })

  it('die Meldung verrät den Schlüssel nie', () => {
    const result = checkStripeTarget({ key: 'sk_live_GEHEIM', live: false })
    expect(!result.ok && result.message).not.toContain('GEHEIM')
  })
})
