import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CUSTOM_DOMAIN_DENIALS, CUSTOM_DOMAIN_STATUSES } from '../../control/shared/customDomain'

/**
 * Jede Stufe einer eigenen Domain und jeder Grund, warum es keine gibt, hat
 * einen Text — in der Owner-Seite (onboarding) UND in der Betreiber-Liste
 * (control), beide Sprachen. Anlass: control-040 bringt die Stufe `paused` und
 * drei Gründe; vue-i18n gäbe bei einer Lücke den rohen SCHLÜSSEL aus, und das
 * sieht weder Typecheck noch Lint.
 */
type Tree = { [key: string]: string | Tree }

function locale(layer: 'onboarding' | 'control', lang: 'de' | 'en'): Tree {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, `../../${layer}/i18n/locales/${lang}.json`), 'utf8')) as Tree
}

function at(tree: Tree, path: string): string | Tree | undefined {
  return path.split('.').reduce<string | Tree | undefined>((node, key) => (typeof node === 'object' ? node[key] : undefined), tree)
}

describe('eigene Domain: Texte je Stufe und Grund', () => {
  for (const lang of ['de', 'en'] as const) {
    it(`${lang}: jede Stufe hat ihren Text (Owner-Seite und Betreiber-Liste)`, () => {
      const owner = locale('onboarding', lang)
      const operator = locale('control', lang)
      for (const status of CUSTOM_DOMAIN_STATUSES) {
        expect(typeof at(owner, `onboarding.domain.status.${status}`), `onboarding ${status}`).toBe('string')
        expect(typeof at(operator, `control.tenants.domain.status.${status}`), `control ${status}`).toBe('string')
      }
    })

    it(`${lang}: jeder Grund hat Hinweis und Wiedereinschalt-Satz, jeder 403-Code einen Fehlertext`, () => {
      const owner = locale('onboarding', lang)
      for (const reason of CUSTOM_DOMAIN_DENIALS) {
        expect(typeof at(owner, `onboarding.domain.pausedDenied.${reason}`), reason).toBe('string')
      }
      for (const key of ['planTitle', 'planDesc', 'trialTitle', 'trialDesc', 'approvalTitle', 'approvalDesc']) {
        expect(typeof at(owner, `onboarding.domain.${key}`), key).toBe('string')
      }
      for (const code of ['plan_required', 'trial_not_included', 'approval_required', 'domain_taken']) {
        expect(typeof at(owner, `onboarding.domain.errors.${code}`), code).toBe('string')
      }
    })
  }
})
