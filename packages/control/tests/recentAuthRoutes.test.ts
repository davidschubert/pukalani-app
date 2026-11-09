import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * RA3 (2026-11-09): frische Anmeldung (`requireRecentAuth`, core) an den
 * endgültigen Löschungen im Control Plane — Mandant löschen (Host sofort
 * offline) und Website austragen (Register-Eintrag + Entitlements weg).
 *
 * Wächter über den Quelltext wie in RA2 (onboarding/tests/recentAuthRoutes):
 * Typecheck und Lint sehen weder ein Umsortieren noch einen gelöschten Aufruf.
 */
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

const GUARD = 'await requireRecentAuth(event)'

describe.each([
  ['Mandant löschen', '../server/api/control/tenants/[id].delete.ts', 'tablesDB.deleteRow('],
  ['Website austragen', '../server/api/control/websites/[id].delete.ts', 'tablesDB.getRow<'],
])('%s', (_name, path, firstTouch) => {
  const source = read(path)

  it('verlangt eine frische Anmeldung', () => {
    expect(source).toContain(GUARD)
  })

  it('prüft NACH dem Rechte-Gate', () => {
    expect(source.indexOf(GUARD)).toBeGreaterThan(source.indexOf(`requirePermission(event, 'sites.manage')`))
  })

  it('prüft VOR dem ersten Datenbank-Zugriff', () => {
    const touch = source.indexOf(firstTouch)
    expect(touch).toBeGreaterThan(-1)
    expect(source.indexOf(GUARD)).toBeLessThan(touch)
  })
})

describe('Oberfläche', () => {
  it.each([
    ['Communities (Löschen)', '../app/pages/dashboard/communities.vue', 'control.tenants.reauthText'],
    ['Websites (Austragen)', '../app/pages/dashboard/websites.vue', 'control.websites.reauthText'],
  ])('%s fragt nach einer frischen Anmeldung', (_name, path, key) => {
    const source = read(path)
    expect(source).toContain('useRecentAuthPrompt()')
    expect(source).toContain(`promptFreshSignIn(error, t('${key}'))`)
  })

  it.each(['de', 'en'])('Texte in %s vorhanden', (lang) => {
    const messages = JSON.parse(read(`../i18n/locales/${lang}.json`)) as {
      control: { tenants: { reauthText?: string }, websites: { reauthText?: string } }
    }
    expect(messages.control.tenants.reauthText).toBeTruthy()
    expect(messages.control.websites.reauthText).toBeTruthy()
  })
})
