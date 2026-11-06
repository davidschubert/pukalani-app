import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isRecentAuth, RECENT_AUTH_MAX_AGE_MS, REAUTH_REQUIRED_REASON } from '../shared/recentAuth'
import { isReauthRequired } from '../app/utils/fetchError'

const NOW = Date.parse('2026-11-06T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('isRecentAuth', () => {
  it('frische Session (gerade angemeldet) ist frisch', () => {
    expect(isRecentAuth(ago(30_000), NOW)).toBe(true)
  })

  it('genau an der Grenze ist noch frisch', () => {
    expect(isRecentAuth(ago(RECENT_AUTH_MAX_AGE_MS), NOW)).toBe(true)
  })

  // Gegenprobe zu den beiden oberen — ohne sie wäre ein `return true` grün.
  it('eine Millisekunde über der Grenze ist NICHT frisch', () => {
    expect(isRecentAuth(ago(RECENT_AUTH_MAX_AGE_MS + 1), NOW)).toBe(false)
  })

  it('eine Tage alte Session (das gestohlene Cookie) ist NICHT frisch', () => {
    expect(isRecentAuth(ago(3 * 24 * 60 * 60 * 1000), NOW)).toBe(false)
  })

  it('leichter Uhrenversatz (Session „aus der Zukunft") gilt als frisch', () => {
    expect(isRecentAuth(ago(-5_000), NOW)).toBe(true)
  })

  it('fail-closed: fehlendes oder unlesbares Datum ist NICHT frisch', () => {
    expect(isRecentAuth(undefined, NOW)).toBe(false)
    expect(isRecentAuth(null, NOW)).toBe(false)
    expect(isRecentAuth('', NOW)).toBe(false)
    expect(isRecentAuth('kein-datum', NOW)).toBe(false)
  })

  it('eigene Grenze wird respektiert', () => {
    expect(isRecentAuth(ago(90_000), NOW, 60_000)).toBe(false)
    expect(isRecentAuth(ago(30_000), NOW, 60_000)).toBe(true)
  })
})

describe('isReauthRequired', () => {
  it('erkennt den Grund aus dem Envelope', () => {
    expect(isReauthRequired({ data: { reason: REAUTH_REQUIRED_REASON } })).toBe(true)
  })

  // Ein anderes 403 (keine Berechtigung, gesperrte Community) darf NICHT zum
  // Neu-Anmelden führen — dort hilft es nicht.
  it('ignoriert andere Gründe und nackte 403', () => {
    expect(isReauthRequired({ status: 403, data: { reason: 'community_suspended' } })).toBe(false)
    expect(isReauthRequired({ status: 403 })).toBe(false)
    expect(isReauthRequired(null)).toBe(false)
  })
})

/**
 * Wächter an der Route: die Prüfung muss VOR der Löschung stehen. Ein
 * späteres Umsortieren (oder ein gelöschter Aufruf) würde sonst erst löschen
 * und dann ablehnen — Typecheck und Lint sähen davon nichts.
 */
describe('account.delete.ts', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../server/api/auth/account.delete.ts', import.meta.url)),
    'utf8',
  )

  it('verlangt eine frische Anmeldung vor deleteUserCompletely', () => {
    const guard = source.indexOf('await requireRecentAuth(event)')
    const deletion = source.indexOf('deleteUserCompletely(event')
    expect(guard).toBeGreaterThan(-1)
    expect(deletion).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(deletion)
  })
})
