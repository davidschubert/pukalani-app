import { describe, expect, it } from 'vitest'
import { FUNNEL_EVENTS } from '../shared/funnelEvents'

/**
 * DIESER TEST IST EIN VERTRAG MIT PLAUSIBLE, kein Typ-Test.
 *
 * Die Goals werden in der Plausible-Oberfläche von Hand auf den EXAKTEN Namen
 * angelegt (die CE hat keine Sites-API — docs/archiv/ANALYTICS-V2.md). Wer einen
 * Namen hier ändert, macht damit ein bestehendes Goal still zur Null: es wird
 * weiter gemessen, nur unter einem Namen, den niemand auswertet. Der Test
 * nagelt die Namen deshalb wörtlich fest — er soll BRECHEN, wenn jemand
 * umbenennt, damit die Umbenennung in Plausible bewusst mitgezogen wird.
 */
describe('FUNNEL_EVENTS', () => {
  it('trägt genau die in Plausible angelegten Namen (7 Anmelde- + 5 Studio-Goals)', () => {
    expect([...FUNNEL_EVENTS]).toEqual([
      'funnel_cta_start',
      'funnel_cta_plan',
      'funnel_register_done',
      'funnel_gate_no_code',
      'funnel_code_redeemed',
      'funnel_site_created',
      'funnel_request_submitted',
      // Studio-Trichter (pukalani.studio, W1 2026-08-21) — Goals liegen in der
      // Plausible-Site der portfolio-App, nicht in der der Plattform.
      'studio_cta_erstgespraech',
      'studio_wizard_start',
      'studio_wizard_step',
      'studio_wizard_submitted',
      'studio_booking_click',
    ])
  })

  it('vergibt jeden Namen genau einmal', () => {
    expect(new Set(FUNNEL_EVENTS).size).toBe(FUNNEL_EVENTS.length)
  })

  it('hält die Namensform, die Plausible ohne Maskierung filtern kann', () => {
    // Zwei Präfixe, zwei Trichter: `funnel_` = Anmelde-Trichter der Plattform,
    // `studio_` = Erstgespräch-Trichter von pukalani.studio. Alles andere an
    // der Form bleibt: nur Kleinbuchstaben und Unterstriche.
    for (const name of FUNNEL_EVENTS) {
      expect(name).toMatch(/^(funnel|studio)_[a-z_]+$/)
    }
  })
})
