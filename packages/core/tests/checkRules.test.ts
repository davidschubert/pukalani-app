import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  MAX_BYTES_CORE,
  MAX_BYTES_RULE,
  buildIndex,
  checkRulebook,
  checkTree,
  findScriptNames,
  globToRegExp,
  judgePath,
  readPathsHeader,
} from '../../../scripts/check-rules.mjs'

/**
 * DER WÄCHTER `pnpm check:rules` (Q17). Er hält das Regelwerk der
 * KI-Sitzungen klein und wahr: ein Größen-Deckel je Datei, Lade-Pfade mit
 * Treffer, und jeder in Backticks genannte Pfad und jedes `pnpm`-Skript
 * existiert. Ein Wächter, der nie rot wird, ist keiner — deshalb je Regel
 * eine Gegenprobe.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const files = [
  'CLAUDE.md',
  'package.json',
  'eslint.config.mjs',
  'scripts/migrate.mjs',
  'docs/OPEN-ITEMS.md',
  'packages/core/server/utils/softFail.ts',
  'packages/core/shared/runLease.ts',
  'packages/posts/server/plugins/user-data.ts',
  'packages/posts/shared/types/post.ts',
  'apps/control/app/app.config.ts',
  '.claude/rules/tests.md',
]
const scripts = new Set(['lint', 'migrate', 'check:rules', 'check:themes'])
const head = '---\npaths:\n  - "packages/core/**"\n---\n'

function violationsOf(source: string, path = '.claude/rules/probe.md'): string[] {
  return checkRulebook([{ path, source }], files, scripts).violations
}

describe('der echte Baum', () => {
  it('kein Befund, und es wird wirklich etwas geprüft', () => {
    const report = checkTree(repoRoot)
    expect(report.violations).toEqual([])
    expect(report.stats.files).toBeGreaterThan(10)
    expect(report.stats.paths).toBeGreaterThan(150)
    expect(report.stats.scripts).toBeGreaterThan(10)
    expect(report.stats.patterns).toBeGreaterThan(40)
  })
})

describe('Regel 1: der Größen-Deckel', () => {
  it('eine Regeldatei am Deckel ist in Ordnung', () => {
    const body = head + 'x'.repeat(MAX_BYTES_RULE - Buffer.byteLength(head))
    expect(violationsOf(body)).toEqual([])
  })

  it('GEGENPROBE: ein Byte darüber ist rot', () => {
    const body = head + 'x'.repeat(MAX_BYTES_RULE - Buffer.byteLength(head) + 1)
    const violations = violationsOf(body)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain(`${MAX_BYTES_RULE + 1} Bytes`)
  })

  it('gezählt werden Bytes, nicht Zeichen (ein Umlaut zählt doppelt)', () => {
    const body = head + 'ä'.repeat((MAX_BYTES_RULE - Buffer.byteLength(head)) / 2 + 1)
    expect(violationsOf(body)).toHaveLength(1)
  })

  it('GEGENPROBE: CLAUDE.md hat den eigenen, größeren Deckel', () => {
    expect(violationsOf('x'.repeat(MAX_BYTES_CORE), 'CLAUDE.md')).toEqual([])
    expect(violationsOf('x'.repeat(MAX_BYTES_CORE + 1), 'CLAUDE.md')).toHaveLength(1)
  })

  it('die Anleitungen der Helfer haben keinen Deckel', () => {
    expect(violationsOf('x'.repeat(MAX_BYTES_CORE * 2), '.claude/agents/probe.md')).toEqual([])
  })
})

describe('Regel 2: Lade-Pfade', () => {
  it('liest die Muster aus dem Kopf', () => {
    expect(readPathsHeader('---\npaths:\n  - "a/**"\n  - \'b/*.ts\'\n---\ntext')).toEqual(['a/**', 'b/*.ts'])
    expect(readPathsHeader('## ohne Kopf')).toBeNull()
  })

  it('GEGENPROBE: eine Regeldatei ohne Kopf ist rot', () => {
    expect(violationsOf('## Regel ohne Kopf')[0]).toContain('paths:')
  })

  it('GEGENPROBE: ein Muster ohne Treffer ist rot', () => {
    const violations = violationsOf('---\npaths:\n  - "packages/core/server/utils/requirePlanProduct*"\n---\n')
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('trifft keine Datei')
  })

  it('`**/` trifft auch die Wurzel, `*` bleibt im Segment', () => {
    expect(globToRegExp('**/package.json').test('package.json')).toBe(true)
    expect(globToRegExp('packages/*/server/**').test('packages/posts/server/plugins/user-data.ts')).toBe(true)
    expect(globToRegExp('packages/*').test('packages/posts/server')).toBe(false)
    expect(globToRegExp('core/utils/{mailer,notify}.ts').test('core/utils/notify.ts')).toBe(true)
    expect(globToRegExp('core/utils/{mailer,notify}.ts').test('core/utils/other.ts')).toBe(false)
  })
})

describe('Regel 3: Pfade in Backticks', () => {
  const index = buildIndex(files)

  it('volle Pfade, Ordner, Kurzform ab Layer und ab Layer-Ordner werden gefunden', () => {
    expect(judgePath('packages/core/shared/runLease.ts', index)?.ok).toBe(true)
    expect(judgePath('packages/core/server/', index)?.ok).toBe(true)
    expect(judgePath('core/server/utils/softFail.ts', index)?.ok).toBe(true)
    expect(judgePath('server/plugins/user-data.ts', index)?.ok).toBe(true)
    expect(judgePath('shared/types/', index)?.ok).toBe(true)
    expect(judgePath('eslint.config.mjs', index)?.ok).toBe(true)
    expect(judgePath('packages/*/server/**', index)?.ok).toBe(true)
  })

  it('Zeilennummer und Satzzeichen am Ende stören nicht', () => {
    expect(judgePath('(apps/control/app/app.config.ts:138),', index)?.ok).toBe(true)
  })

  it('GEGENPROBE: ein Pfad, den es nicht gibt, ist rot — mit Datei und Zeile', () => {
    const violations = violationsOf(`${head}\nRegel: \`core/shared/runLease.ts\`\nAlt: \`core/server/utils/isMailerConfigured.ts\``)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('.claude/rules/probe.md:7')
    expect(violations[0]).toContain('isMailerConfigured.ts')
  })

  it('GEGENPROBE: ein Verweis auf eine Regeldatei, die es nicht mehr gibt, ist rot', () => {
    expect(violationsOf(`${head}siehe \`tests.md\``)).toEqual([])
    expect(violationsOf(`${head}siehe \`hosts-ops.md\``)).toHaveLength(1)
  })

  it('GEGENPROBE: ein Muster ohne Treffer ist rot', () => {
    expect(judgePath('scripts/ops/verify-*.mjs', index)?.ok).toBe(false)
  })

  it('was kein Pfad im Repo ist, wird übersprungen, nicht geraten', () => {
    for (const word of ['/api/health', '~/.config/x/config.json', '<app>/server/x.ts', '@nuxt/ui', 'https://a.b/c.md',
      'basic/personal', 'job.run', 'Node.js', '../lib/x.mjs', 'packages/${name}/x.ts', 'NUXT_X=1']) {
      expect(judgePath(word, index), word).toBeNull()
    }
  })

  it('ein Code-Zaun wird nicht gelesen', () => {
    expect(violationsOf(`${head}\`\`\`\n\`core/gibt/es/nicht.ts\`\n\`\`\``)).toEqual([])
  })
})

describe('Regel 4: pnpm-Skripte', () => {
  it('findet den Skript-Namen hinter Schaltern und Filtern', () => {
    expect(findScriptNames('pnpm migrate --app control --prod')).toEqual(['migrate'])
    expect(findScriptNames('pnpm -r lint')).toEqual(['lint'])
    expect(findScriptNames('pnpm --filter @pukalani/themes check:themes')).toEqual(['check:themes'])
    expect(findScriptNames('check:rules')).toEqual(['check:rules'])
    expect(findScriptNames('pnpm install --frozen-lockfile')).toEqual([])
    expect(findScriptNames('pnpm <skript>')).toEqual([])
  })

  it('GEGENPROBE: ein Skript, das in keiner package.json steht, ist rot', () => {
    expect(violationsOf(`${head}\`pnpm migrate\` und \`check:rules\``)).toEqual([])
    const violations = violationsOf(`${head}\`pnpm ops:gibt-es-nicht\` und \`check:rules-size\``)
    expect(violations).toHaveLength(2)
    expect(violations[0]).toContain('ops:gibt-es-nicht')
    expect(violations[1]).toContain('check:rules-size')
  })
})
