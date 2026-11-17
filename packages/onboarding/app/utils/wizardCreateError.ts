import { OPERATOR_TERMS_REQUIRED_CODE } from '../../shared/operatorTerms'

/**
 * PURE: was der Wizard bei einer Ablehnung von `POST /api/onboarding/site`
 * zeigt (PD1 c, 2026-11-17).
 *
 * `email_unverified` ist KEIN Fehlersatz mehr, sondern ein eigener Zustand: es
 * erscheint der Kasten `AuthEmailVerifyRequired` mit seinem Knopf „Mail erneut
 * senden" (core, `useEmailVerifyResend`). Vorher stand dort nur ein Satz, und
 * wer die erste Mail nicht fand, hatte im letzten Schritt keinen Weg. Alle
 * anderen Ablehnungen bleiben wie bisher ein Satz, der sagt, was JETZT zu tun
 * ist.
 */
export type WizardCreateOutcome =
  | { kind: 'verify' }
  | { kind: 'message', key: string }

export const WIZARD_EMAIL_UNVERIFIED_CODE = 'email_unverified'

export function classifyWizardCreateError(status: number | undefined, reason: string | undefined): WizardCreateOutcome {
  if (status === 409) return { kind: 'message', key: 'onboarding.errors.hostTaken' }
  if (status === 403) {
    return reason === WIZARD_EMAIL_UNVERIFIED_CODE
      ? { kind: 'verify' }
      : { kind: 'message', key: 'onboarding.errors.notAllowed' }
  }
  if (status === 400) {
    return {
      kind: 'message',
      key: reason === OPERATOR_TERMS_REQUIRED_CODE ? 'onboarding.errors.operatorTermsRequired' : 'onboarding.errors.invalid',
    }
  }
  return { kind: 'message', key: 'onboarding.errors.unavailable' }
}
