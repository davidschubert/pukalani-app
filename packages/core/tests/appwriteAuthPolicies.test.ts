import { describe, expect, it } from 'vitest'
import { AUTH_POLICIES, comparePolicies, formatResult } from '../../../scripts/ops/appwrite-auth-policies.mjs'

/**
 * ANMELDE-REGELN (P29) — der Vergleich IST gegen SOLL aus
 * `scripts/ops/appwrite-auth-policies.mjs`. Ein zu großzügiger Vergleich
 * meldet eine verstellte Regel als „stimmt", ein zu strenger setzt bei jedem
 * `--apply` alles neu — beides sähe grün aus.
 */

/** IST, wie Appwrite 2.7.1 es liefert (gekürzt), mit allen Soll-Werten erfüllt. */
function istStimmt(): Record<string, unknown>[] {
  return [
    { $id: 'password-dictionary', enabled: true, denyList: [] },
    { $id: 'password-history', total: 5 },
    { $id: 'password-strength', min: 8, uppercase: false, lowercase: false, number: false, symbols: false },
    { $id: 'password-personal-data', enabled: true, denyList: [] },
    { $id: 'password-pwned', enabled: true, sessions: false, users: true },
    { $id: 'session-alert', enabled: true },
    { $id: 'deny-aliased-email', enabled: false },
    { $id: 'deny-disposable-email', enabled: true },
    { $id: 'deny-free-email', enabled: false },
  ]
}

describe('comparePolicies', () => {
  it('die Soll-Liste hat genau die sieben Regeln', () => {
    expect(AUTH_POLICIES.map(p => p.id)).toEqual([
      'password-dictionary',
      'password-personal-data',
      'password-strength',
      'password-history',
      'password-pwned',
      'deny-disposable-email',
      'session-alert',
    ])
  })

  it('alles stimmt: Felder außerhalb des Solls (denyList, Zeichenklassen, fremde Regeln) zählen nicht', () => {
    const result = comparePolicies(istStimmt())
    expect(result.every(r => r.ok)).toBe(true)
    expect(result).toHaveLength(7)
  })

  it('eine verstellte Regel ist genau EINE Abweichung mit ist → soll', () => {
    const ist = istStimmt().map(p => (p.$id === 'password-pwned' ? { ...p, sessions: true } : p))
    const off = comparePolicies(ist).filter(r => !r.ok)
    expect(off).toEqual([{ id: 'password-pwned', ok: false, diffs: [{ field: 'sessions', ist: true, soll: false }] }])
    expect(formatResult(off[0]!)).toBe('password-pwned: weicht ab (sessions: true → false)')
  })

  it('eine fehlende Regel und ein fehlendes Feld sind Abweichungen', () => {
    const ist = istStimmt()
      .filter(p => p.$id !== 'session-alert')
      .map(p => (p.$id === 'password-history' ? { $id: 'password-history' } : p))
    const off = comparePolicies(ist).filter(r => !r.ok)
    expect(off.map(r => r.id)).toEqual(['password-history', 'session-alert'])
    expect(formatResult(off[1]!)).toBe('session-alert: weicht ab (enabled: – → true)')
  })

  it('der Typ zählt: "8" ist nicht 8', () => {
    const ist = istStimmt().map(p => (p.$id === 'password-strength' ? { ...p, min: '8' } : p))
    expect(comparePolicies(ist).find(r => r.id === 'password-strength')?.ok).toBe(false)
  })

  it('kaputte Antwort: alles weicht ab, nichts wirft', () => {
    expect(comparePolicies(undefined).every(r => !r.ok)).toBe(true)
    expect(comparePolicies([null, 3]).every(r => !r.ok)).toBe(true)
  })

  it('stimmt-Zeile', () => {
    expect(formatResult({ id: 'session-alert', ok: true, diffs: [] })).toBe('session-alert: stimmt')
  })
})
