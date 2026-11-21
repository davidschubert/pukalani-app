/**
 * LINT AUS DEM HAUPTORDNER PRÜFT, WAS ER PRÜFEN SOLL (Q18, ARC-004/ARC-008).
 *
 * Bis Q18 meldete `eslint packages/<layer>/server/…` aus dem Hauptordner
 * „File ignored because no matching configuration" und endete mit Code 0:
 * die Nuxt-Vorlage schaltete TypeScript nur ein, wenn das Arbeitsverzeichnis
 * `typescript` kannte. Und ein Import aus `core` nach `admin` oder `billing`
 * ging ohne Meldung durch, weil „Fundament kennt Fundament" galt.
 *
 * Die Proben laufen über `lintText` (keine Datei wird angelegt), mit dem
 * Hauptordner als Arbeitsverzeichnis — genau so, wie ein Editor oder eine
 * Sitzung mit `pnpm exec eslint <pfad>` prüft.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

/**
 * WARUM EIN EIGENER PROZESS: die Nuxt-Vorlage fragt `process.cwd()`, ob
 * TypeScript da ist. Vitest läuft in `packages/core` — dort ist es da, und ein
 * Test im selben Prozess bliebe grün, auch wenn die Wurzel blind wäre (so beim
 * Bau dieses Tests gemessen: ohne `typescript: true` blieb er grün). Der
 * Kind-Prozess läuft im Hauptordner, wie ein Editor oder `pnpm exec eslint`.
 */
const RUNNER = `
import { ESLint } from 'eslint'
const probes = JSON.parse(process.env.Q18_PROBES)
const eslint = new ESLint({ cwd: process.cwd() })
const out = {}
for (const [filePath, code] of probes) {
  const [result] = await eslint.lintText(code, { filePath: process.cwd() + '/' + filePath, warnIgnored: true })
  out[filePath + '\\n' + code] = result.messages.some(m => /ignored/i.test(m.message))
    ? ['ignored']
    : result.messages.filter(m => m.severity === 2).map(m => m.ruleId ?? 'parse')
}
console.log(JSON.stringify(out))
`

const PROBES: Array<[string, string]> = [
  ['packages/core/shared/q18probe.ts', `import { x } from '../../posts/shared/topicViewKeys'\nexport const y = x\n`],
  ['packages/posts/server/api/posts/q18probe.get.ts', `export default defineEventHandler(async (_event) => {\n  const { tablesDB } = createAdminClient()\n  return tablesDB\n})\n`],
  ['packages/core/shared/q18probe.ts', `import { x } from '../../admin/shared/x'\nexport const y = x\n`],
  ['packages/core/server/utils/q18probe.ts', `import { x } from '../../../billing/shared/x'\nexport const y = x\n`],
  ['packages/admin/shared/q18probe.ts', `import { x } from '../../billing/shared/x'\nexport const y = x\n`],
  ['packages/admin/shared/q18probe.ts', `import { x } from '../../core/shared/x'\nexport const y = x\n`],
  ['packages/posts/shared/q18probe.ts', `import { x } from '../../core/shared/x'\nexport const y = x\n`],
  ['apps/comments/server/api/q18probe.get.ts', `export default defineEventHandler(async () => {\n  return await Promise.resolve(1).catch(() => null)\n})\n`],
]
let results: Record<string, string[]> = {}
const probe = (index: number) => results[`${PROBES[index]![0]}\n${PROBES[index]![1]}`]

describe('ESLint aus dem Hauptordner (Q18)', () => {
  beforeAll(() => {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', RUNNER], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env, Q18_PROBES: JSON.stringify(PROBES) },
    })
    if (run.status !== 0) throw new Error(`ESLint-Prozess endete mit ${run.status}: ${run.stderr}`)
    results = JSON.parse(run.stdout.trim().split('\n').at(-1)!) as Record<string, string[]>
  }, 120_000)

  it('Probe 3: core importiert aus einem Produkt — rot', () => {
    expect(probe(0))
      .toContain('pukalani/no-cross-layer-relative')
  })

  it('Probe 4: rohes tablesDB in einer Route eines Datentür-Layers — rot (nicht „ignored")', () => {
    expect(probe(1))
      .toContain('no-restricted-syntax')
  })

  it('Probe 9: core importiert aus admin — rot', () => {
    expect(probe(2))
      .toContain('pukalani/no-cross-layer-relative')
  })

  it('Probe 10: core importiert aus billing — rot', () => {
    expect(probe(3))
      .toContain('pukalani/no-cross-layer-relative')
  })

  it('Stufe 2 greift nicht quer: admin importiert aus billing — rot', () => {
    expect(probe(4))
      .toContain('pukalani/no-cross-layer-relative')
  })

  it('erlaubt bleibt: Stufe 2 importiert aus core, ein Produkt aus core', () => {
    expect(probe(5)).toEqual([])
    expect(probe(6)).toEqual([])
  })

  it('Server-Datei einer App wird gelesen: stilles .catch — rot', () => {
    expect(probe(7))
      .toContain('pukalani/no-silent-catch')
  })
})
