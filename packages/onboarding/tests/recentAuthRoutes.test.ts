import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * RA2 (2026-11-08): frische Anmeldung (`requireRecentAuth`, core) an den
 * UNUMKEHRBAREN Owner-Aktionen — Besitz übertragen und Community stilllegen.
 * Rollen ändern und Zugang entziehen bleiben bewusst ohne (umkehrbar,
 * Alltagsarbeit des Teams); die Begründung steht an jeder Route selbst.
 *
 * Wächter über den Quelltext, weil Typecheck und Lint weder ein Umsortieren
 * noch einen gelöschten Aufruf sehen — und ein Umsortieren hieße: erst
 * übertragen/stilllegen, dann ablehnen.
 */
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

const GUARD = 'await requireRecentAuth(event)'

describe.each([
  ['Besitz übertragen', '../server/api/community/members/[id]/transfer.post.ts', 'community.transfer'],
  ['Community stilllegen', '../server/api/community/delete.post.ts', 'community.delete'],
])('%s', (_name, path, capability) => {
  const source = read(path)

  it('verlangt eine frische Anmeldung', () => {
    expect(source).toContain(GUARD)
  })

  // NACH dem Rollen-Gate: ein Admin/Mitglied bekommt sein 403, statt sich erst
  // neu anzumelden und dann abzuprallen.
  it('prüft NACH dem Rollen-Gate', () => {
    const gate = source.indexOf(`requireCommunityTeamGate(event, '${capability}')`)
    expect(gate).toBeGreaterThan(-1)
    expect(source.indexOf(GUARD)).toBeGreaterThan(gate)
  })

  // VOR der Service-Naht: eine Ablehnung hat im Control Plane nichts angefasst.
  it('prüft VOR dem Aufruf des Control Plane', () => {
    const seam = source.indexOf('callControlPlane<')
    expect(seam).toBeGreaterThan(-1)
    expect(source.indexOf(GUARD)).toBeLessThan(seam)
  })
})

// Die Gegenprobe ist eine ENTSCHEIDUNG, kein Versehen: wer die Klammer hier
// nachrüstet, ändert sie bewusst — und schreibt die neue Begründung an die
// Route (dort steht die alte).
describe.each([
  ['Rolle ändern', '../server/api/community/members/[id].patch.ts'],
  ['Zugang entziehen', '../server/api/community/members/[id].delete.ts'],
])('%s (umkehrbar)', (_name, path) => {
  const source = read(path)

  it('bleibt ohne frische Anmeldung — begründet an der Route', () => {
    expect(source).not.toContain(GUARD)
    expect(source).toContain('BEWUSST OHNE FRISCHE ANMELDUNG (RA2')
  })
})

/**
 * Die Oberfläche fängt `reauth_required` über den EINEN Weg aus core ab
 * (`useRecentAuthPrompt`) — sonst stünde dort nur „Aktion fehlgeschlagen",
 * und niemand wüsste, dass ein neuer Login genügt.
 */
describe('Oberfläche', () => {
  it.each([
    ['Mitglieder-Seite (Übergabe)', '../app/pages/dashboard/members/index.vue', 'members.transfer.reauthText'],
    ['Community-Seite (Stilllegen)', '../app/pages/dashboard/community/index.vue', 'dashboard.community.danger.reauthText'],
  ])('%s fragt nach einer frischen Anmeldung', (_name, path, key) => {
    const source = read(path)
    expect(source).toContain('useRecentAuthPrompt()')
    expect(source).toContain(`promptFreshSignIn(error, t('${key}'))`)
  })

  it.each(['de', 'en'])('Texte in %s vorhanden', (lang) => {
    const messages = JSON.parse(read(`../i18n/locales/${lang}.json`)) as {
      members: { transfer: { reauthText?: string } }
      dashboard: { community: { danger: { reauthText?: string } } }
    }
    expect(messages.members.transfer.reauthText).toBeTruthy()
    expect(messages.dashboard.community.danger.reauthText).toBeTruthy()
  })
})
