import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LABELLED_PLAN_KEYS, LEGACY_PLAN_KEYS, planLabelKey } from '../app/utils/planLabels'
import { TENANT_PLANS } from '../shared/types/tenantRecord'

/**
 * Kasten „Pläne & Limits (Pool)" (PD1 c, 2026-11-17): für JEDEN Schlüssel, den
 * der Kasten zeigen kann, gibt es einen Namen in beiden Sprachen — vue-i18n gäbe
 * sonst den rohen Schlüssel aus, und das sieht weder Typecheck noch Lint. Ein
 * UNBEKANNTER Schlüssel bleibt roh sichtbar (nie „Unbekannt").
 */
type Tree = { [key: string]: string | Tree }
const PKG = resolve(import.meta.dirname, '..')

function locale(lang: 'de' | 'en'): Tree {
  return JSON.parse(readFileSync(resolve(PKG, `i18n/locales/${lang}.json`), 'utf8')) as Tree
}
function at(tree: Tree, path: string): string | Tree | undefined {
  return path.split('.').reduce<string | Tree | undefined>((node, key) => (typeof node === 'object' ? node[key] : undefined), tree)
}

/** Schlüssel, die Migration control-014 gesät hat — Herkunft der Alt-Zeilen. */
const SEEDED_014 = [...readFileSync(resolve(PKG, 'scripts/migrations/014-tenant-plans.ts'), 'utf8')
  .matchAll(/^\s{2}(\w+): \{ comments:/gm)].map(match => match[1]!)

describe('Pläne & Limits: Namen der Pläne', () => {
  it('kennt die heutigen Pläne und jede Zeile, die control-014 gesät hat', () => {
    expect(SEEDED_014.length).toBeGreaterThan(0)
    for (const key of [...TENANT_PLANS, ...SEEDED_014]) expect(LABELLED_PLAN_KEYS, key).toContain(key)
  })

  for (const lang of ['de', 'en'] as const) {
    it(`${lang}: jeder bekannte Schlüssel hat einen Namen, Alt-Pläne sind als solche kenntlich`, () => {
      const tree = locale(lang)
      for (const key of LABELLED_PLAN_KEYS) {
        const labelKey = planLabelKey(key)
        expect(labelKey, key).not.toBeNull()
        const value = at(tree, labelKey!)
        expect(typeof value, `${lang} ${key}`).toBe('string')
        expect((value as string).length).toBeGreaterThan(0)
        expect(value as string).not.toMatch(/[<>]/)
      }
      const marker = lang === 'de' ? 'Alt-Plan' : 'legacy plan'
      for (const key of LEGACY_PLAN_KEYS) expect(at(tree, `control.tenants.plan.${key}`), key).toContain(marker)
    })
  }

  it('ein unbekannter Schlüssel bekommt keinen Text — der Kasten zeigt ihn roh', () => {
    expect(planLabelKey('enterprise')).toBeNull()
    expect(planLabelKey('')).toBeNull()
  })

  it('der Kasten nimmt den Namen über planLabel(), nie direkt über t()', () => {
    const page = readFileSync(resolve(PKG, 'app/pages/dashboard/communities.vue'), 'utf8')
    expect(page).toContain('{{ planLabel(plan.key) }}')
    expect(page).not.toContain('t(`control.tenants.plan.${plan.key}`)')
    expect(page).toMatch(/return labelKey \? t\(labelKey\) : key/)
  })
})
