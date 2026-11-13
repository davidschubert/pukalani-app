import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PASSWORD_POLICY_REASONS, isPasswordPolicyReason, passwordPolicyRejection } from '../shared/passwordPolicy'

/**
 * ABGELEHNTES PASSWORT, ABGELEHNTE ADRESSE (P29) — Appwrite-Typ → eigener Code.
 * Die Typen sind gegen Appwrite 2.7.1 gemessen bzw. aus dessen Quelltext.
 */
describe('passwordPolicyRejection', () => {
  it.each([
    ['password_pwned', 422, 'password_breached'],
    ['password_personal_data', 422, 'password_personal_data'],
    ['password_recently_used', 422, 'password_recently_used'],
    ['general_pwned_passwords_unavailable', 503, 'password_check_unavailable'],
    ['user_email_disposable', 422, 'email_not_allowed'],
  ])('%s → %i %s', (type, status, code) => {
    expect(passwordPolicyRejection(type)).toEqual({ status, code })
  })

  it.each([
    // Wörterbuch-Ablehnung: allgemeiner Typ, nicht sicher erkennbar ⇒ bleibt beim alten Verhalten
    'general_argument_invalid',
    'user_already_exists',
    'user_invalid_token',
    'user_invalid_credentials',
    '',
    undefined,
    null,
    42,
  ])('%s ist keine Regel-Ablehnung', (type) => {
    expect(passwordPolicyRejection(type)).toBeNull()
  })

  it('jeder Code ist ein gültiger reason des Envelopes (server/error.ts lässt nur kurze Schlüssel durch)', () => {
    for (const code of PASSWORD_POLICY_REASONS) {
      expect(code).toMatch(/^[a-z][a-z0-9_]{0,63}$/)
      expect(isPasswordPolicyReason(code)).toBe(true)
    }
    expect(isPasswordPolicyReason('rate_limited')).toBe(false)
  })

  it('jeder Code hat einen Satz in de und en', () => {
    const keyFor: Record<string, string> = {
      password_breached: 'breached',
      password_personal_data: 'personalData',
      password_recently_used: 'recentlyUsed',
      password_check_unavailable: 'checkUnavailable',
      email_not_allowed: 'emailNotAllowed',
    }
    const composable = readFileSync(new URL('../app/composables/useAuthErrorMessage.ts', import.meta.url), 'utf8')
    for (const locale of ['de', 'en']) {
      const messages = JSON.parse(readFileSync(new URL(`../i18n/locales/${locale}.json`, import.meta.url), 'utf8')) as { auth: { passwordPolicy: Record<string, string> } }
      for (const code of PASSWORD_POLICY_REASONS) {
        const key = keyFor[code]!
        expect(messages.auth.passwordPolicy[key], `${locale}: ${code}`).toBeTruthy()
        expect(composable).toContain(`'${code}') return t('auth.passwordPolicy.${key}')`)
      }
    }
  })
})
