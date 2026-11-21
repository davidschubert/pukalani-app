/**
 * EIN LINT-LAUF, EINE LISTE (Q18, DOC-012).
 *
 * `pnpm check` (scripts/check.mjs) fährt die Liste aus
 * scripts/lib/check-steps.mjs, der Job `lint` in .github/workflows/lint.yml
 * ruft NUR `pnpm check`. Dieser Test hält das: kommt im Workflow ein
 * einzelner Schritt dazu, liefen lokal und CI wieder auseinander — rot. Und
 * ein neues `check:*`-Skript, das in keinem Lauf steht, wäre ein Wächter, den
 * nie jemand fährt — auch rot.
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — reines JS-Modul ohne Typen (scripts/ liegt in keiner tsconfig)
import { CHECK_STEPS, NOT_IN_CHECK } from '../../../scripts/lib/check-steps.mjs'

interface CheckStep { name: string, run: string[], needs?: string, why: string }

const steps = CHECK_STEPS as CheckStep[]
const notInCheck = NOT_IN_CHECK as Map<string, string>
const repo = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url))
const scriptsOf = (path: string) => (JSON.parse(readFileSync(repo(path), 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {}

/** Die `run:`-Zeilen eines Jobs, ohne Kommentare. */
export function jobRuns(workflow: string, job: string): string[] {
  const lines = workflow.split('\n')
  const start = lines.findIndex(line => line === `  ${job}:`)
  if (start < 0) return []
  const runs: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^ {2}[\w-]+:\s*$/.test(line)) break
    const run = line.match(/^\s+-?\s*run:\s*(.+)$/)
    if (run && !line.trimStart().startsWith('#')) runs.push(run[1]!.trim())
  }
  return runs
}

describe('pnpm check und der Lint-Job fahren dieselbe Liste (Q18)', () => {
  const workflow = readFileSync(repo('.github/workflows/lint.yml'), 'utf8')
  const root = scriptsOf('package.json')

  it('der Job `lint` installiert und ruft dann NUR `pnpm check`', () => {
    expect(jobRuns(workflow, 'lint')).toEqual(['pnpm install --frozen-lockfile', 'pnpm check'])
  })

  it('`pnpm check` ist das Skript mit der Liste', () => {
    expect(root.check).toBe('node scripts/check.mjs')
    expect(readFileSync(repo('scripts/check.mjs'), 'utf8')).toContain("from './lib/check-steps.mjs'")
  })

  it('jeder Schritt nennt ein vorhandenes Skript und hat einen Grund', () => {
    const names = new Set<string>()
    for (const step of steps) {
      expect(names.has(step.name), step.name).toBe(false)
      names.add(step.name)
      expect(step.why.length, step.name).toBeGreaterThan(10)
      if (step.needs) expect(names.has(step.needs), `${step.name} braucht ${step.needs} VOR sich`).toBe(true)
      const filter = step.run.indexOf('--filter')
      if (filter >= 0) {
        const pkg = step.run[filter + 1]!.replace('@pukalani/', '')
        expect(scriptsOf(`packages/${pkg}/package.json`)[step.run.at(-1)!], step.name).toBeTruthy()
      }
      else if (step.run[0] !== '-r') {
        expect(root[step.run[0]!], step.name).toBeTruthy()
      }
    }
  })

  it('jedes `check:*`-Skript der Wurzel läuft in `pnpm check`, in `lint:scripts` oder steht mit Grund in NOT_IN_CHECK', () => {
    const inSteps = new Set(steps.map(step => step.run.at(-1)))
    const inLintScripts = root['lint:scripts'] ?? ''
    const orphans = Object.keys(root)
      .filter(name => name.startsWith('check:'))
      .filter(name => !inSteps.has(name) && !inLintScripts.includes(`pnpm ${name} `) && !inLintScripts.includes(`pnpm ${name}&`) && !notInCheck.has(name))
    expect(orphans).toEqual([])
  })

  it('NOT_IN_CHECK nimmt nur aus, was es gibt und was sonst nirgends läuft', () => {
    for (const [name, why] of notInCheck) {
      expect(root[name], `${name}: Skript gibt es nicht mehr — Eintrag streichen`).toBeTruthy()
      expect(steps.some(step => step.run.includes(name)), `${name} läuft doch in pnpm check`).toBe(false)
      expect(why.length).toBeGreaterThan(10)
    }
  })

  it('der Lese-Helfer erkennt einen zusätzlichen Schritt im Job (Gegenprobe)', () => {
    const extra = workflow.replace('      - run: pnpm check\n', '      - run: pnpm check\n      - run: pnpm check:i18n-keys\n')
    expect(jobRuns(extra, 'lint')).not.toEqual(['pnpm install --frozen-lockfile', 'pnpm check'])
    expect(existsSync(repo('scripts/lib/check-steps.mjs'))).toBe(true)
  })
})
