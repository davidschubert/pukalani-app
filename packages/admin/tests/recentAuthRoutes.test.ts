import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * RA3 (2026-11-09): frische Anmeldung (`requireRecentAuth`, core) auch am
 * Löschen einer Person in der Betreiber-Konsole. Die Löschung ist endgültig
 * (`deleteUserCompletely` sperrt und räumt sofort ab).
 *
 * Wächter über den Quelltext wie in RA2 (onboarding/tests/recentAuthRoutes):
 * Typecheck und Lint sehen weder ein Umsortieren noch einen gelöschten Aufruf.
 */
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

const GUARD = 'await requireRecentAuth(event)'

describe('Nutzer löschen (admin/users/[id] DELETE)', () => {
  const source = read('../server/api/admin/users/[id]/index.delete.ts')

  it('verlangt eine frische Anmeldung', () => {
    expect(source).toContain(GUARD)
  })

  it('prüft NACH dem Rechte-Gate', () => {
    expect(source.indexOf(GUARD)).toBeGreaterThan(source.indexOf(`requirePermission(event, 'users.manage')`))
  })

  it('prüft VOR dem ersten Schreiben', () => {
    const write = source.indexOf('deleteUserCompletely(event')
    expect(write).toBeGreaterThan(-1)
    expect(source.indexOf(GUARD)).toBeLessThan(write)
  })
})

describe('Oberfläche', () => {
  it.each([
    ['Nutzerliste', '../app/pages/dashboard/users/index.vue'],
    ['Nutzer-Detailseite', '../app/pages/dashboard/users/[id].vue'],
  ])('%s fragt nach einer frischen Anmeldung', (_name, path) => {
    const source = read(path)
    expect(source).toContain('useRecentAuthPrompt()')
    expect(source).toContain(`promptFreshSignIn(error, t('admin.users.reauthText'))`)
  })

  it.each(['de', 'en'])('Text in %s vorhanden', (lang) => {
    const messages = JSON.parse(read(`../i18n/locales/${lang}.json`)) as { admin: { users: { reauthText?: string } } }
    expect(messages.admin.users.reauthText).toBeTruthy()
  })
})
