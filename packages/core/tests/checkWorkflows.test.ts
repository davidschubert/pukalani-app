import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkWorkflow } from '../../../scripts/check-workflows.mjs'

/**
 * SEC-041 (2026-11-14): der Wächter `pnpm check:workflows` hält zwei Regeln
 * für `.github/workflows/*.yml` — jede fremde Action über einen Commit, und
 * Rechte je Job statt auf Workflow-Ebene. Ein Wächter, der nie rot wird, ist
 * keiner: hier steht je Regel ein Gegenbeispiel, das er melden MUSS.
 */
const COMMIT = '3d3c42e5aac5ba805825da76410c181273ba90b1'

function workflow(overrides: { uses?: string, top?: string, jobPermissions?: boolean } = {}): string {
  const uses = overrides.uses ?? `actions/checkout@${COMMIT} # v7.0.1`
  const top = overrides.top ?? 'permissions: {}'
  const jobPermissions = overrides.jobPermissions ?? true
  return [
    'name: Beispiel',
    'on:',
    '  push:',
    top,
    'jobs:',
    '  bauen:',
    '    runs-on: ubuntu-latest',
    ...(jobPermissions ? ['    permissions:', '      contents: read'] : []),
    '    steps:',
    `      - uses: ${uses}`,
    '      - run: echo ok',
    '',
  ].join('\n')
}

describe('check-workflows — fremde Actions', () => {
  it('nimmt eine Action mit Commit und Versions-Kommentar an', () => {
    expect(checkWorkflow('x.yml', workflow())).toEqual([])
  })

  it.each([
    ['ein Versions-Tag', 'actions/checkout@v7'],
    ['einen Zweig', 'actions/checkout@main'],
    ['einen Commit ohne Versions-Kommentar', `actions/checkout@${COMMIT}`],
    ['einen gekürzten Commit', 'actions/checkout@3d3c42e # v7.0.1'],
  ])('meldet %s', (_label, uses) => {
    const findings = checkWorkflow('x.yml', workflow({ uses }))
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('nicht über einen Commit eingebunden')
  })

  it('lässt eine Action aus dem eigenen Repo in Ruhe', () => {
    expect(checkWorkflow('x.yml', workflow({ uses: './.github/actions/eigene' }))).toEqual([])
  })
})

describe('check-workflows — Rechte', () => {
  it('meldet Rechte auf Workflow-Ebene', () => {
    const findings = checkWorkflow('x.yml', workflow({ top: 'permissions:\n  contents: read' }))
    expect(findings.some(f => f.includes('auf Workflow-Ebene'))).toBe(true)
  })

  it('meldet eine fehlende Angabe auf Workflow-Ebene', () => {
    const findings = checkWorkflow('x.yml', workflow({ top: '# nichts' }))
    expect(findings.some(f => f.includes('auf Workflow-Ebene'))).toBe(true)
  })

  it('meldet einen Job ohne eigene Rechte — mit seinem Namen', () => {
    const findings = checkWorkflow('x.yml', workflow({ jobPermissions: false }))
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('„bauen"')
  })
})

describe('check-workflows — Secrets und Umgebung', () => {
  function job(lines: string[]): string {
    return [
      'name: Beispiel',
      'on:',
      '  push:',
      'permissions: {}',
      'jobs:',
      '  liefern:',
      '    runs-on: ubuntu-latest',
      '    permissions: {}',
      ...lines,
      '',
    ].join('\n')
  }
  const secretStep = [
    '    steps:',
    '      - name: Schlüssel',
    '        env:',
    '          KEY: ${{ secrets.DEPLOY_SSH_KEY }}',
    '        run: echo ok',
  ]

  it('meldet ein Secret in einem Job ohne Umgebung', () => {
    const findings = checkWorkflow('x.yml', job(secretStep))
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('liest ein Secret ohne Umgebung')
  })

  it('nimmt dasselbe Secret mit Umgebung an (Kurz- und Langform)', () => {
    expect(checkWorkflow('x.yml', job(['    environment: production', ...secretStep]))).toEqual([])
    expect(checkWorkflow('x.yml', job(['    environment:', '      name: production', '      deployment: false', ...secretStep]))).toEqual([])
  })

  it('zählt github.token und einen Kommentar nicht als Secret', () => {
    const lines = ['    steps:', '      # früher: secrets.PLOI_SSH_KEY', '      - run: echo ok', '        env:', '          GH_TOKEN: ${{ github.token }}']
    expect(checkWorkflow('x.yml', job(lines))).toEqual([])
  })

  it.each([
    ['pnpm install', '      - run: pnpm install --frozen-lockfile'],
    ['einen Build', '      - run: pnpm --filter app build'],
    ['npx', '      - run: npx playwright install'],
    ['die pnpm-Action', '      - uses: pnpm/action-setup@73e46992e05b19abd31f2f3c20e0e7370d762115 # v6.1.1'],
  ])('meldet %s in einem Job mit Umgebung', (_label, line) => {
    const findings = checkWorkflow('x.yml', job(['    environment: production', ...secretStep, line]))
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('installiert oder baut')
  })

  it('lässt ein eigenes Skript ohne Abhängigkeiten in einem Job mit Umgebung zu', () => {
    expect(checkWorkflow('x.yml', job(['    environment: production', ...secretStep, '      - run: node scripts/ops/verify-site-env.mjs']))).toEqual([])
  })
})

describe('check-workflows — die echten Workflows', () => {
  const dir = join(import.meta.dirname, '..', '..', '..', '.github', 'workflows')
  const files = readdirSync(dir).filter(file => /\.ya?ml$/.test(file))

  it('findet die Workflows überhaupt (sonst prüft der Rest nichts)', () => {
    expect(files.length).toBeGreaterThanOrEqual(7)
  })

  it.each(files)('%s hält beide Regeln ein', (file) => {
    expect(checkWorkflow(file, readFileSync(join(dir, file), 'utf8'))).toEqual([])
  })
})
