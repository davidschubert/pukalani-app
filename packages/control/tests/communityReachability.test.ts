import { describe, expect, it } from 'vitest'
import { communityUnreachableReason } from '../shared/communityReachability'

/**
 * SE1 d — die pure Regel „erreichbar oder nicht?". Nicht erreichbar heißt:
 * der Host antwortet 404 (stillgelegt oder Missbrauchs-Sperre). Die
 * Zahlungs-Sperre lässt den Host leben.
 */
describe('communityUnreachableReason', () => {
  it('aktiv ohne Sperre ⇒ erreichbar', () => {
    expect(communityUnreachableReason({ status: 'active', suspension: '' })).toBeNull()
    // Bestandszeilen vor control-034 tragen keine Sperre: NULL ist keine Sperre.
    expect(communityUnreachableReason({ status: 'active', suspension: null })).toBeNull()
    expect(communityUnreachableReason({ status: 'active' })).toBeNull()
  })

  it('stillgelegt ⇒ disabled — alles außer genau „active" (wie mapTenantRowToContext)', () => {
    expect(communityUnreachableReason({ status: 'disabled', suspension: '' })).toBe('disabled')
    expect(communityUnreachableReason({ status: '' })).toBe('disabled')
    expect(communityUnreachableReason({ status: null })).toBe('disabled')
    expect(communityUnreachableReason({})).toBe('disabled')
    expect(communityUnreachableReason({ status: 'Active' })).toBe('disabled')
    // Stillgelegt geht vor: auch mit Zahlungs-Sperre ist der Host aus.
    expect(communityUnreachableReason({ status: 'disabled', suspension: 'billing' })).toBe('disabled')
  })

  it('Missbrauchs-Sperre ⇒ abuse', () => {
    expect(communityUnreachableReason({ status: 'active', suspension: 'abuse' })).toBe('abuse')
  })

  it('Zahlungs-Sperre ⇒ erreichbar (der Host lebt, nur-lesend)', () => {
    expect(communityUnreachableReason({ status: 'active', suspension: 'billing' })).toBeNull()
  })

  it('ein unbekannter Sperr-Wert ist keine Missbrauchs-Sperre', () => {
    expect(communityUnreachableReason({ status: 'active', suspension: 'irgendwas' })).toBeNull()
  })
})
