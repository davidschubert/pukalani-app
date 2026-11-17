import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { classifyWizardCreateError } from '../app/utils/wizardCreateError'
import { OPERATOR_TERMS_REQUIRED_CODE } from '../shared/operatorTerms'

/**
 * Letzter Schritt des Wizards (PD1 c, 2026-11-17): lehnt das Anlegen mit
 * 403 `email_unverified` ab, erscheint der Kasten `AuthEmailVerifyRequired`
 * MIT Knopf „Mail erneut senden" — jede andere Ablehnung bleibt ein Satz wie
 * bisher. Teil 1 prüft die Regel, Teil 2 die Seite (Quelltext: das Paket hat
 * keine Komponenten-Umgebung), Teil 3 die Texte in beiden Sprachen.
 */
type Tree = { [key: string]: string | Tree }
const PKG = resolve(import.meta.dirname, '..')
const page = readFileSync(resolve(PKG, 'app/pages/start/community.vue'), 'utf8')
const core = readFileSync(resolve(PKG, '../core/app/components/auth/EmailVerifyRequired.vue'), 'utf8')

function locale(lang: 'de' | 'en'): Tree {
  return JSON.parse(readFileSync(resolve(PKG, `i18n/locales/${lang}.json`), 'utf8')) as Tree
}
function at(tree: Tree, path: string): string | Tree | undefined {
  return path.split('.').reduce<string | Tree | undefined>((node, key) => (typeof node === 'object' ? node[key] : undefined), tree)
}

describe('Wizard: Ablehnung beim Anlegen', () => {
  it('403 email_unverified ⇒ Kasten zum Bestätigen, kein Fehlersatz', () => {
    expect(classifyWizardCreateError(403, 'email_unverified')).toEqual({ kind: 'verify' })
  })

  it('andere Ablehnungen ⇒ dieselben Sätze wie bisher', () => {
    expect(classifyWizardCreateError(403, undefined)).toEqual({ kind: 'message', key: 'onboarding.errors.notAllowed' })
    expect(classifyWizardCreateError(403, 'something_else')).toEqual({ kind: 'message', key: 'onboarding.errors.notAllowed' })
    expect(classifyWizardCreateError(409, undefined)).toEqual({ kind: 'message', key: 'onboarding.errors.hostTaken' })
    expect(classifyWizardCreateError(400, OPERATOR_TERMS_REQUIRED_CODE)).toEqual({ kind: 'message', key: 'onboarding.errors.operatorTermsRequired' })
    expect(classifyWizardCreateError(400, 'email_unverified')).toEqual({ kind: 'message', key: 'onboarding.errors.invalid' })
    expect(classifyWizardCreateError(500, 'email_unverified')).toEqual({ kind: 'message', key: 'onboarding.errors.unavailable' })
    expect(classifyWizardCreateError(undefined, undefined)).toEqual({ kind: 'message', key: 'onboarding.errors.unavailable' })
  })
})

describe('Wizard-Seite: Kasten mit Sende-Knopf', () => {
  it('der Kasten aus core hat den Knopf zum erneuten Senden', () => {
    expect(core).toContain('data-email-verify-resend')
    expect(core).toContain('useEmailVerifyResend()')
  })

  it('die Seite nutzt die Regel und zeigt bei der Ablehnung den Kasten statt des Satzes', () => {
    expect(page).toContain('classifyWizardCreateError(status, reason)')
    expect(page).toMatch(/outcome\.kind === 'verify'\) needsVerification\.value = true/)
    expect(page).toMatch(/<div v-if="needsVerification"[^>]*data-wizard-verify-required>\s*<AuthEmailVerifyRequired :title="t\('onboarding\.verify\.createTitle'\)"/)
    // Ein neuer Versuch räumt den alten Zustand ab — und der Entwurf bleibt stehen.
    expect(page).toMatch(/createError\.value = ''\s*needsVerification\.value = false/)
    expect(page).not.toMatch(/draft\.value\s*=\s*\{/)
  })

  it('frühe Warnung aus dem Konto, ohne zu sperren', () => {
    expect(page).toContain('currentUser.value?.emailVerification === false')
    expect(page).toMatch(/<AuthEmailVerifyRequired\s+v-if="ownEmailUnverified[^"]*"\s+:title="t\('onboarding\.verify\.earlyTitle'\)"/)
    expect(page).not.toMatch(/canCreate = computed\([^)]*ownEmailUnverified/)
  })
})

describe('Wizard-Texte zur Bestätigung', () => {
  for (const lang of ['de', 'en'] as const) {
    it(`${lang}: jeder Text ist da, ohne spitze Klammern`, () => {
      const tree = locale(lang)
      for (const key of ['onboarding.verify.earlyTitle', 'onboarding.verify.createTitle', 'onboarding.verify.retryHint',
        'onboarding.errors.hostTaken', 'onboarding.errors.notAllowed', 'onboarding.errors.invalid',
        'onboarding.errors.unavailable', 'onboarding.errors.operatorTermsRequired']) {
        const value = at(tree, key)
        expect(typeof value, key).toBe('string')
        expect(value as string, key).not.toMatch(/[<>]/)
        expect((value as string).length, key).toBeGreaterThan(0)
      }
    })
  }
})
