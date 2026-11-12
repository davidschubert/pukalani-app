import { describe, expect, it } from 'vitest'
import { brandGuestStartPath, brandSignupOpen } from '../shared/brandAdmissionView'

/**
 * Die Regel hinter „offene Beta" (Davids Entscheidung 2026-11-12). Sie lenkt
 * jeden Start-Knopf für Gäste — ein Fehler hier schickte sie entweder vor eine
 * geschlossene Registrierung oder weiter auf eine Warteliste, die es nicht
 * mehr braucht.
 */
describe('brandSignupOpen', () => {
  it('ist offen, wenn der Modus open ist und die Kontoanlage an', () => {
    expect(brandSignupOpen({ mode: 'open', registrationEnabled: true })).toBe(true)
  })

  it('ist nicht offen, solange die Kontoanlage aus ist — auch im Modus open', () => {
    // Gegenprobe zum Fall darüber: derselbe Modus, nur der zweite Schalter fehlt.
    expect(brandSignupOpen({ mode: 'open', registrationEnabled: false })).toBe(false)
  })

  it('bleibt bei invite und closed beim Weg über die Einladung', () => {
    expect(brandSignupOpen({ mode: 'invite', registrationEnabled: true })).toBe(false)
    expect(brandSignupOpen({ mode: 'closed', registrationEnabled: true })).toBe(false)
  })
})

describe('brandGuestStartPath', () => {
  it('führt Gäste bei offener Anmeldung zur Kontoanlage, sonst zur Einladung', () => {
    expect(brandGuestStartPath(true)).toBe('/register')
    expect(brandGuestStartPath(false)).toBe('/invite')
  })
})
