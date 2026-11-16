import { describe, expect, it } from 'vitest'
import { classifyTurnstile } from '../../../scripts/ops/verify-turnstile.mjs'

/**
 * OPS-012 (GA1 P20): der Blick „Bot-Prüfung scharf?" läuft seit 2026-11-16
 * täglich im Produktions-Wächter. Dort darf ein einzelner Aussetzer kein
 * Alarm sein — die Deutung trennt deshalb „eindeutig" (sofort melden) von
 * „sagt nichts" (einmal neu fragen). Geprüft wird die Deutung, pur.
 */
const site = { host: 'branding.supply', site: 'branding', note: 'Brand-Wizard' }
const armed = { status: 403, reason: 'bot_check_required', ok: false }

describe('classifyTurnstile', () => {
  it('scharf: 403 mit festem Grund und Widget im HTML', () => {
    const result = classifyTurnstile(site, armed, { status: 200, widget: true })
    expect(result.ok).toBe(true)
  })

  it('AUS ist eindeutig und wird ohne zweiten Versuch gemeldet', () => {
    const result = classifyTurnstile(site, { status: 200, reason: null, ok: true }, { status: 200, widget: false })
    expect(result).toMatchObject({ ok: false, conclusive: true })
    expect(result.failure).toContain('Turnstile AUS')
  })

  it('403 ohne Widget auf einer Seite, die 200 antwortet, ist eindeutig: Site-Key fehlt', () => {
    const result = classifyTurnstile(site, armed, { status: 200, widget: false })
    expect(result).toMatchObject({ ok: false, conclusive: true })
    expect(result.failure).toContain('KEIN Widget')
  })

  it('sagt nichts und bekommt einen zweiten Versuch: nicht erreichbar, 503, Seite ohne 200, Unerwartetes', () => {
    expect(classifyTurnstile(site, null, null)).toMatchObject({ ok: false, conclusive: false })
    expect(classifyTurnstile(site, { status: 503, reason: 'bot_check_unavailable', ok: false }, { status: 200, widget: true })).toMatchObject({ ok: false, conclusive: false })
    expect(classifyTurnstile(site, armed, { status: 502, widget: false })).toMatchObject({ ok: false, conclusive: false })
    expect(classifyTurnstile(site, { status: 429, reason: null, ok: null }, { status: 200, widget: true })).toMatchObject({ ok: false, conclusive: false })
  })
})
