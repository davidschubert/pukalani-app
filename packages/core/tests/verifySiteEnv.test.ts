import { describe, expect, it } from 'vitest'
import { SITES, missingKeys, requiredKeysFor } from '../../../scripts/ops/verify-site-env.mjs'

/**
 * SEC-025 (2026-11-13): die Platform-App lehnt ohne Mandanten-Resolver JEDE
 * Anfrage ab — und der Resolver braucht ALLE VIER `NUXT_PLATFORM_CONTROL_*`
 * (apps/platform/server/plugins/tenant-resolver.ts). Bis dahin führte der
 * tägliche Env-Wächter nur den Schlüssel; die drei anderen konnten auf dem
 * Server fehlen, ohne dass etwas rot wurde. Geprüft wird die LISTE (pure),
 * nicht der Server — das Skript selbst läuft per ssh nur in der CI.
 */
const CONTROL_KEYS = [
  'NUXT_PLATFORM_CONTROL_ENDPOINT',
  'NUXT_PLATFORM_CONTROL_PROJECT_ID',
  'NUXT_PLATFORM_CONTROL_DATABASE_ID',
  'NUXT_PLATFORM_CONTROL_KEY',
]

describe('verify-site-env — Pflicht-Liste der Site platform', () => {
  it('führt alle vier NUXT_PLATFORM_CONTROL_* (sonst 503 auf jedem Host)', () => {
    const required = requiredKeysFor('platform')
    for (const key of CONTROL_KEYS) expect(required, key).toContain(key)
  })

  it('meldet eine fehlende Database-Id als Befund', () => {
    const platform = SITES.find(s => s.name === 'platform')!
    const present = new Set(platform.required.filter(k => k !== 'NUXT_PLATFORM_CONTROL_DATABASE_ID'))
    expect(missingKeys(platform, present)).toEqual(['NUXT_PLATFORM_CONTROL_DATABASE_ID'])
  })

  it('Silo-Sites tragen die Control-Variablen NICHT (sie haben keine Mandanten-Trennung)', () => {
    for (const site of ['control', 'portfolio', 'branding', 'help', 'marketing']) {
      const required = requiredKeysFor(site) ?? []
      for (const key of CONTROL_KEYS) expect(required, `${site}: ${key}`).not.toContain(key)
    }
  })

  it('unbekannte Site ⇒ null', () => {
    expect(requiredKeysFor('gibt-es-nicht')).toBeNull()
  })
})
