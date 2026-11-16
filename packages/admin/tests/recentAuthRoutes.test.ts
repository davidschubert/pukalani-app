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

/**
 * SEC-034 (Davids Entscheidung 2026-11-16, „wie die großen Anbieter:
 * Herausgabe, Zugänge, wer Zugriff hat; Sperren bleibt sofort"): fünf weitere
 * Routen verlangen die frische Anmeldung — NACH dem Rechte-Gate, VOR dem
 * ersten Datenzugriff.
 */
describe.each([
  ['Daten einer Person exportieren', '../server/api/admin/users/[id]/export.get.ts', 'users.manage', 'exportUserCompletely(event'],
  ['Nutzerliste als CSV', '../server/api/admin/users/export-csv.get.ts', 'users.manage', 'admin.users.list('],
  ['Lösch-Kopie herunterladen', '../server/api/admin/gdpr-exports/[fileId].get.ts', 'users.manage', 'admin.storage.getFile('],
  ['Zugänge setzen', '../server/api/admin/integrations.patch.ts', 'system.manage', 'InstanceSecret(event'],
  ['Rollen vergeben', '../server/api/admin/users/[id]/role.patch.ts', 'users.manage', 'admin.users.get('],
])('%s', (_name, path, permission, firstAccess) => {
  const source = read(path)

  it('verlangt eine frische Anmeldung', () => {
    expect(source).toContain(GUARD)
  })

  it('prüft NACH dem Rechte-Gate', () => {
    expect(source.indexOf(GUARD)).toBeGreaterThan(source.indexOf(`requirePermission(event, '${permission}')`))
  })

  it('prüft VOR dem ersten Datenzugriff', () => {
    const access = source.indexOf(firstAccess)
    expect(access).toBeGreaterThan(-1)
    expect(source.indexOf(GUARD)).toBeLessThan(access)
  })
})

describe.each([
  ['Sperren', '../server/api/admin/users/[id]/status.patch.ts'],
  ['Sitzungen beenden', '../server/api/admin/users/[id]/sessions.delete.ts'],
  ['Sammel-Sperre', '../server/api/admin/users/bulk.post.ts'],
])('%s geht sofort — bewusst OHNE frische Anmeldung', (_name, path) => {
  it('kein requireRecentAuth', () => {
    expect(read(path)).not.toContain('requireRecentAuth(')
  })
})

describe('Oberfläche: jede Aufrufstelle reicht den Fehler durch', () => {
  it.each([
    ['Export in der Liste', '../app/pages/dashboard/users/index.vue', 'admin.users.exportReauthText'],
    ['CSV in der Liste', '../app/pages/dashboard/users/index.vue', 'admin.users.csvReauthText'],
    ['Export auf der Detailseite', '../app/pages/dashboard/users/[id].vue', 'admin.users.exportReauthText'],
    ['Rollen auf der Detailseite', '../app/pages/dashboard/users/[id].vue', 'admin.users.roleReauthText'],
    ['Lösch-Kopien', '../app/pages/dashboard/admin/gdpr-exports.vue', 'admin.gdprExports.reauthText'],
    ['Zugänge', '../app/pages/dashboard/admin/integrations.vue', 'admin.integrations.reauthText'],
  ])('%s', (_name, path, key) => {
    const source = read(path)
    expect(source).toContain('useRecentAuthPrompt()')
    expect(source).toContain(`promptFreshSignIn(error, t('${key}'))`)
  })

  it('der CSV-Export läuft über $fetch, nicht mehr per Navigation (sonst käme kein Hinweis an)', () => {
    const source = read('../app/pages/dashboard/users/index.vue')
    expect(source).not.toContain('window.location.href')
    expect(source).toContain(`$fetch<Blob>('/api/admin/users/export-csv', { responseType: 'blob' })`)
  })

  it('Datei-Downloads entpacken den Fehler, bevor sie ihn lesen', () => {
    for (const path of ['../app/pages/dashboard/users/index.vue', '../app/pages/dashboard/admin/gdpr-exports.vue']) {
      expect(read(path), path).toContain('await unwrapBlobError(rawError)')
    }
  })

  it.each(['de', 'en'])('Texte in %s vorhanden', (lang) => {
    const messages = JSON.parse(read(`../i18n/locales/${lang}.json`)) as {
      admin: Record<string, Record<string, unknown>>
    }
    for (const key of ['users.exportReauthText', 'users.csvReauthText', 'users.roleReauthText', 'gdprExports.reauthText', 'integrations.reauthText', 'auditUnavailable.title', 'auditUnavailable.desc']) {
      const [section, name] = key.split('.') as [string, string]
      expect(messages.admin[section]?.[name], key).toBeTruthy()
    }
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
