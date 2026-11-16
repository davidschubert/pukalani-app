import type { Models } from 'node-appwrite'

/**
 * Die Testphase je Konto (control-039, BE-015 — Davids Entscheidung
 * 2026-11-16: die Testphase gibt es EINMAL je Person, und die Person ist das
 * Konto im Runtime-Projekt, nicht die Community).
 *
 * EINE Zeile je Konto, mit fester Zeilen-Id aus Projekt und Konto
 * (`trialClaimRowId`, server/utils/trialClaims.ts). Das Anlegen IST die
 * Vergabe: 201 ⇒ jetzt vergeben, 409 ⇒ gab es schon.
 *
 * Nur Typen und Konstanten — der Hash lebt auf dem Server (node:crypto).
 */

export const TRIAL_CLAIMS_TABLE = 'trial_claims'

/** `onboarding` = beim Anlegen vergeben · `adopted` = aus dem Bestand übernommen. */
export const TRIAL_CLAIM_SOURCES = ['onboarding', 'adopted'] as const
export type TrialClaimSource = (typeof TRIAL_CLAIM_SOURCES)[number]

export interface TrialClaimRow extends Models.Row {
  runtimeProjectId: string
  runtimeUserId: string
  /** Die Community, für die die Testphase vergeben wurde. */
  communityId: string
  source: TrialClaimSource
  claimedAt: string
}

/**
 * Ergebnis einer Vergabe:
 *  - `granted` — dieses Anlegen bekommt die Testphase (Zeile neu angelegt);
 *  - `used` — das Konto hatte schon eine (409);
 *  - `unavailable` — die Tabelle gibt es noch nicht (Migration control-039
 *    ausstehend). Dann gilt das alte Verhalten; jeder ANDERE Fehler wirft.
 */
export type TrialClaimOutcome = 'granted' | 'used' | 'unavailable'

/**
 * Antwort der Vorab-Prüfung (`POST /api/control/onboarding/trial`, im Wizard
 * über `GET /api/onboarding/trial`): bekäme eine neue Community dieses Kontos
 * jetzt eine Testphase? Eine Auskunft, keine Zusage — vergeben wird erst beim
 * Anlegen.
 */
export interface TrialAvailability {
  trialAvailable: boolean
}
