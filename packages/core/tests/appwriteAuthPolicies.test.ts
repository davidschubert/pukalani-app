import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AUTH_POLICIES, CI_PROJECTS, ciCheckProject, comparePolicies, formatResult } from '../../../scripts/ops/appwrite-auth-policies.mjs'

/**
 * ANMELDE-REGELN (P29) — der Vergleich IST gegen SOLL aus
 * `scripts/ops/appwrite-auth-policies.mjs`. Ein zu großzügiger Vergleich
 * meldet eine verstellte Regel als „stimmt", ein zu strenger setzt bei jedem
 * `--apply` alles neu — beides sähe grün aus.
 */

/** IST, wie Appwrite 2.7.1 es liefert (gekürzt), mit allen Soll-Werten erfüllt. */
function istStimmt(): Record<string, unknown>[] {
  return [
    { $id: 'password-dictionary', enabled: true, denyList: [] },
    { $id: 'password-history', total: 5 },
    { $id: 'password-strength', min: 8, uppercase: false, lowercase: false, number: false, symbols: false },
    { $id: 'password-personal-data', enabled: true, denyList: [] },
    { $id: 'password-pwned', enabled: true, sessions: false, users: true },
    { $id: 'session-alert', enabled: true },
    { $id: 'deny-aliased-email', enabled: false },
    { $id: 'deny-disposable-email', enabled: true },
    { $id: 'deny-free-email', enabled: false },
  ]
}

describe('comparePolicies', () => {
  it('die Soll-Liste hat genau die sieben Regeln', () => {
    expect(AUTH_POLICIES.map(p => p.id)).toEqual([
      'password-dictionary',
      'password-personal-data',
      'password-strength',
      'password-history',
      'password-pwned',
      'deny-disposable-email',
      'session-alert',
    ])
  })

  it('alles stimmt: Felder außerhalb des Solls (denyList, Zeichenklassen, fremde Regeln) zählen nicht', () => {
    const result = comparePolicies(istStimmt())
    expect(result.every(r => r.ok)).toBe(true)
    expect(result).toHaveLength(7)
  })

  it('eine verstellte Regel ist genau EINE Abweichung mit ist → soll', () => {
    const ist = istStimmt().map(p => (p.$id === 'password-pwned' ? { ...p, sessions: true } : p))
    const off = comparePolicies(ist).filter(r => !r.ok)
    expect(off).toEqual([{ id: 'password-pwned', ok: false, diffs: [{ field: 'sessions', ist: true, soll: false }] }])
    expect(formatResult(off[0]!)).toBe('password-pwned: weicht ab (sessions: true → false)')
  })

  it('eine fehlende Regel und ein fehlendes Feld sind Abweichungen', () => {
    const ist = istStimmt()
      .filter(p => p.$id !== 'session-alert')
      .map(p => (p.$id === 'password-history' ? { $id: 'password-history' } : p))
    const off = comparePolicies(ist).filter(r => !r.ok)
    expect(off.map(r => r.id)).toEqual(['password-history', 'session-alert'])
    expect(formatResult(off[1]!)).toBe('session-alert: weicht ab (enabled: – → true)')
  })

  it('der Typ zählt: "8" ist nicht 8', () => {
    const ist = istStimmt().map(p => (p.$id === 'password-strength' ? { ...p, min: '8' } : p))
    expect(comparePolicies(ist).find(r => r.id === 'password-strength')?.ok).toBe(false)
  })

  it('kaputte Antwort: alles weicht ab, nichts wirft', () => {
    expect(comparePolicies(undefined).every(r => !r.ok)).toBe(true)
    expect(comparePolicies([null, 3]).every(r => !r.ok)).toBe(true)
  })

  it('stimmt-Zeile', () => {
    expect(formatResult({ id: 'session-alert', ok: true, diffs: [] })).toBe('session-alert: stimmt')
  })
})

/**
 * DER TÄGLICHE BLICK (`--ci`, seit 2026-11-18): je Production-Projekt ein
 * Urteil. Das Protokoll der CI ist öffentlich — eine Zeile darf nur Projekt
 * und Regel-Namen nennen. Und ein Blick, der nichts lesen kann, muss rot sein.
 */
describe('ciCheckProject', () => {
  const entry = { project: 'account', keyEnv: 'SCHEMA_WATCH_KEY_ACCOUNT' }
  const env = { SCHEMA_WATCH_KEY_ACCOUNT: 'geheimer-wert' }

  it('alles stimmt → grün, kein Befund', async () => {
    const result = await ciCheckProject(entry, env, async () => istStimmt())
    expect(result.ok).toBe(true)
    expect(result.finding).toBeNull()
    expect(result.line).toBe('✔ account: 7 Regeln stimmen')
  })

  it('reicht Projekt und Schlüssel an den Leser weiter', async () => {
    let seen: unknown
    await ciCheckProject(entry, env, async (cfg: unknown) => {
      seen = cfg
      return istStimmt()
    })
    expect(seen).toEqual({ endpoint: 'https://api.pukalani.app/v1', project: 'account', key: 'geheimer-wert' })
  })

  it('Gegenprobe: eine verstellte Regel → rot, genannt wird nur ihr Name, nie ein Wert', async () => {
    const ist = istStimmt().map(p => p.$id === 'password-history' ? { ...p, total: 0 } : p)
    const result = await ciCheckProject(entry, env, async () => ist)
    expect(result.ok).toBe(false)
    expect(result.line).toBe('✖ account: weicht ab — password-history')
    expect(result.finding).toContain('password-history')
    expect(`${result.line} ${result.finding}`).not.toMatch(/total|[0-9]+ →|→/)
  })

  it('Gegenprobe: Schlüssel fehlt → rot statt still grün', async () => {
    const result = await ciCheckProject(entry, {}, async () => istStimmt())
    expect(result.ok).toBe(false)
    expect(result.finding).toContain('SCHEMA_WATCH_KEY_ACCOUNT')
  })

  it('Gegenprobe: Lesen scheitert → rot, ohne Fehlertext und ohne Schlüssel in der Zeile', async () => {
    const result = await ciCheckProject(entry, env, async () => {
      throw new Error('fetch failed geheimer-wert')
    })
    expect(result.ok).toBe(false)
    expect(`${result.line} ${result.finding}`).not.toContain('geheimer-wert')
    expect(result.line).toBe('✖ account: die Regeln ließen sich nicht lesen')
  })
})

describe('täglicher Blick: Projekte und Workflow', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  const workflow = readFileSync(join(root, '.github', 'workflows', 'production-watch.yml'), 'utf8')

  it('die vier Production-Projekte, je mit dem Schlüssel des Schema-Blicks', () => {
    expect(CI_PROJECTS.map(p => p.project)).toEqual(['account', 'admin', 'portfolio', 'branding'])
    const parity = readFileSync(join(root, 'scripts', 'ops', 'verify-schema-parity.mjs'), 'utf8')
    for (const { project, keyEnv } of CI_PROJECTS) {
      expect(parity).toMatch(new RegExp(`project: '${project}', ciKey: '${keyEnv}'`))
    }
  })

  it('der Workflow ruft den Blick mit --ci und reicht alle vier Schlüssel durch', () => {
    const at = workflow.indexOf('scripts/ops/appwrite-auth-policies.mjs --ci')
    expect(at).toBeGreaterThan(0)
    const step = workflow.slice(workflow.lastIndexOf('- name:', at), at)
    for (const { keyEnv } of CI_PROJECTS) {
      expect(step).toContain(`${keyEnv}: \${{ secrets.${keyEnv} }}`)
    }
    expect(step).toContain('PUKALANI_FINDINGS_FILE')
  })
})
