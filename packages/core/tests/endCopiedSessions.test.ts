import { describe, expect, it } from 'vitest'
import { applyAllowed, sessionsBefore, summarize } from '../../../scripts/ops/end-copied-sessions.mjs'

/**
 * Der einmalige Abmelde-Lauf (PK1-EIN, Schritt C): die Regel, welche
 * Sitzungen fallen, und wann `--apply` löschen darf. Der Lauf selbst ist auf
 * der Bühne bewiesen (Protokoll in `docs/runbooks/PK1-EINSCHALTEN.md`).
 */
const CUT = Date.parse('2026-11-24T12:00:00.000Z')
const s = (id: string, createdAt: string, provider = 'email') => ({ $id: id, $createdAt: createdAt, provider })

describe('sessionsBefore', () => {
  it('nur Sitzungen streng vor der Stichzeit; genau zur Stichzeit bleibt stehen', () => {
    const list = [s('alt', '2026-11-20T00:00:00.000Z'), s('punkt', '2026-11-24T12:00:00.000Z'), s('neu', '2026-11-25T00:00:00.000Z')]
    expect(sessionsBefore(list, CUT).map((x: { $id: string }) => x.$id)).toEqual(['alt'])
  })

  it('unlesbares Datum fällt mit (lieber einmal neu anmelden als eine Kopie stehen lassen)', () => {
    expect(sessionsBefore([s('kaputt', 'nie')], CUT)).toHaveLength(1)
  })
})

describe('summarize', () => {
  it('zählt Konten, Sitzungen, Treffer und Anmelde-Wege', () => {
    const summary = summarize([
      { userId: 'a', sessions: [s('1', '2026-11-01T00:00:00.000Z'), s('2', '2026-11-02T00:00:00.000Z', 'server'), s('3', '2026-11-26T00:00:00.000Z')] },
      { userId: 'b', sessions: [] },
      { userId: 'c', sessions: [s('4', '2026-11-03T00:00:00.000Z')] },
    ], CUT)
    expect(summary).toEqual({ accounts: 3, accountsTargeted: 2, sessionsTotal: 4, targeted: 3, maxPerAccount: 2, byProvider: { email: 2, server: 1 } })
  })
})

describe('applyAllowed', () => {
  it('gleich oder weniger als bestätigt ⇒ ja; mehr ⇒ nein', () => {
    expect(applyAllowed(5, 5)).toBe(true)
    expect(applyAllowed(4, 5)).toBe(true)
    expect(applyAllowed(6, 5)).toBe(false)
  })

  it('ohne gültige Zahl ⇒ nein', () => {
    expect(applyAllowed(0, Number.NaN)).toBe(false)
    expect(applyAllowed(0, -1)).toBe(false)
    expect(applyAllowed(0, 1.5)).toBe(false)
  })
})
