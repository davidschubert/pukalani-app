import { describe, expect, it } from 'vitest'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { codeEnvNames, envDecisionProblems, runtimeConfigEnvNames } from '../../../scripts/lib/env-inventory.mjs'
import { ENV_NOT_REQUIRED, ENV_READ_BY_MODULES, ENV_UNDECIDED } from '../../../scripts/ops/site-env-decisions.mjs'
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

/**
 * OPS-012 (GA1 P20): jede Einstellung, die der Code liest, hat eine
 * ENTSCHEIDUNG. Die Namen kommen aus dem Code (`runtimeConfig` aller Layer und
 * Apps, dazu jedes `process.env.NUXT_…`), nicht aus einer Liste. Die
 * Pflicht-Liste selbst bleibt von Hand — sie läuft täglich gegen Production,
 * und „Pflicht" ist eine Entscheidung mit Reihenfolge (erst setzen, dann
 * eintragen). Dieser Test ist das Netz davor: eine NEUE Einstellung ohne
 * Antwort wird rot.
 */
describe('jede Einstellung aus dem Code hat eine Entscheidung', () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  const names = codeEnvNames(ROOT)
  const required = new Set(SITES.flatMap(site => requiredKeysFor(site.name)))
  const decide = (over: Partial<Parameters<typeof envDecisionProblems>[0]> = {}) => envDecisionProblems({
    names, required, notRequired: ENV_NOT_REQUIRED, undecided: ENV_UNDECIDED, readByModules: ENV_READ_BY_MODULES, ...over,
  })

  it('der Leser versteht runtimeConfig: verschachtelt, mit Kommentaren, Namen nach Nuxts Regel', () => {
    expect(runtimeConfigEnvNames(`
      export default defineNuxtConfig({
        runtimeConfig: {
          appwriteKey: '', // server-only
          /* aiKey: 'kein Schlüssel im Kommentar', */
          smtp: { host: '', port: 587 },
          public: { appwriteProjectId: '', tenancy: { controlHosts: '' } },
        },
      })
    `)).toEqual(['NUXT_APPWRITE_KEY', 'NUXT_SMTP_HOST', 'NUXT_SMTP_PORT', 'NUXT_PUBLIC_APPWRITE_PROJECT_ID', 'NUXT_PUBLIC_TENANCY_CONTROL_HOSTS'])
  })

  it('findet die Einstellungen des Repos, auch die außerhalb von runtimeConfig', () => {
    expect(names.size).toBeGreaterThan(60)
    expect(names.has('NUXT_APPWRITE_KEY')).toBe(true)
    // gelesen per process.env im Resolver-Plugin der Platform-App (SEC-025)
    expect(names.has('NUXT_PLATFORM_CONTROL_DATABASE_ID')).toBe(true)
  })

  it('heute: keine Einstellung ohne Entscheidung, kein toter Eintrag', () => {
    expect(decide()).toEqual([])
  })

  it('der Bestand „noch nicht bewertet" wird nur kürzer', () => {
    // Wer einen Namen bewertet, zieht ihn in die Pflicht-Liste oder nach
    // ENV_NOT_REQUIRED um und senkt diese Zahl. Neue Namen gehören nie hierher.
    expect(ENV_UNDECIDED.length).toBeLessThanOrEqual(36)
  })

  it('GEGENPROBE (SEC-025): eine Einstellung, die der Code liest und niemand entschieden hat, ist rot', () => {
    const problems = decide({ required: new Set([...required].filter(name => name !== 'NUXT_PLATFORM_CONTROL_DATABASE_ID')) })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('NUXT_PLATFORM_CONTROL_DATABASE_ID')
    expect(problems[0]).toContain('niemand hat entschieden')
  })

  it('GEGENPROBE: tote Einträge sind rot — Pflicht ohne Leser, Grund ohne Einstellung, doppelt geführt', () => {
    expect(decide({ required: new Set([...required, 'NUXT_GIBT_ES_NICHT']) })[0]).toContain('der Code liest die Einstellung nicht (mehr)')
    expect(decide({ notRequired: { ...ENV_NOT_REQUIRED, NUXT_ALT: 'Ein Grund, der lang genug ist, um zu zählen.' } })[0]).toContain('ENV_NOT_REQUIRED: NUXT_ALT')
    expect(decide({ undecided: [...ENV_UNDECIDED, 'NUXT_APPWRITE_KEY'] })[0]).toContain('mehr als einer Liste')
    expect(decide({ notRequired: { ...ENV_NOT_REQUIRED, NUXT_BRAND_CARD_CACHE_DIR: 'kurz' } })[0]).toContain('ohne tragfähigen Grund')
  })
})
