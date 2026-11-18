/**
 * LN1 (2026-11-18): der Lint sieht Routen-Ordner namens `public`.
 *
 * `@nuxt/eslint-config` nimmt jeden Ordner namens `public` aus — gemeint sind
 * statische Dateien. Das traf auch `server/api/…/public/` (zwölf Routen ohne
 * Lint). Beide Configs begrenzen die Ausnahme seitdem auf die statischen
 * Ordner (`scripts/lib/lint-static-public.mjs`). Dieser Test fragt ESLint
 * selbst, statt die Muster nachzurechnen.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'
import { STATIC_PUBLIC_DIRS } from '../../../scripts/lib/lint-static-public.mjs'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))

/** Alle Ordner namens `public` unterhalb der `server`-Ordner von Layern und Apps. */
const publicRouteDirs = (): string[] => {
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue
      const full = join(dir, entry.name)
      if (entry.name === 'public') found.push(full)
      walk(full)
    }
  }
  for (const group of ['packages', 'apps']) {
    for (const name of readdirSync(resolve(repoRoot, group))) {
      const serverDir = resolve(repoRoot, group, name, 'server')
      if (existsSync(serverDir) && statSync(serverDir).isDirectory()) walk(serverDir)
    }
  }
  return found
}

/**
 * Nur die normale Config wird über ESLint gefragt. Die typisierte
 * (`eslint.typed.config.mjs`) wirft beim Laden, solange die `.nuxt`-tsconfigs
 * der Apps fehlen (`pnpm lint:prepare`) — im Test-Job der CI gibt es sie
 * nicht. Für sie wird der Quelltext gelesen: keine breite Ausnahme, dafür
 * die gemeinsame Liste.
 */
const eslintFor = () => new ESLint({ cwd: repoRoot, overrideConfigFile: resolve(repoRoot, 'eslint.config.mjs') })

describe('Lint und Ordner namens public (LN1)', () => {
  const routeDirs = publicRouteDirs()

  it('findet die Routen-Ordner, um die es geht', () => {
    const names = routeDirs.map(dir => relative(repoRoot, dir))
    expect(names).toContain(join('packages', 'insights', 'server', 'api', 'insights', 'public'))
    expect(names).toContain(join('packages', 'pages', 'server', 'api', 'pages', 'public'))
  })

  it('eslint.config.mjs: eine Route unter server/…/public/ wird geprüft', async () => {
    const eslint = eslintFor()
    for (const dir of routeDirs) {
      expect(await eslint.isPathIgnored(join(dir, 'probe.get.ts')), relative(repoRoot, dir)).toBe(false)
    }
  }, 60_000)

  it('eslint.config.mjs: statische public-Ordner bleiben ausgenommen', async () => {
    const eslint = eslintFor()
    for (const dir of ['apps/photos/public', 'packages/themes/public', 'packages/market/.playground/public', 'docs/public']) {
      expect(await eslint.isPathIgnored(resolve(repoRoot, dir, 'probe.js')), dir).toBe(true)
    }
  }, 60_000)

  it('die Liste der statischen Ordner trifft keinen Routen-Ordner', () => {
    expect(STATIC_PUBLIC_DIRS.length).toBeGreaterThan(0)
    for (const pattern of STATIC_PUBLIC_DIRS) {
      expect(pattern.startsWith('**'), pattern).toBe(false)
      expect(pattern.includes('server'), pattern).toBe(false)
    }
  })

  it('eslint.typed.config.mjs: keine breite Ausnahme mehr, dafür die gemeinsame Liste', () => {
    const source = readFileSync(resolve(repoRoot, 'eslint.typed.config.mjs'), 'utf8')
    const ignoreLines = source.split('\n').filter(line => !line.trimStart().startsWith('//'))
    expect(ignoreLines.some(line => line.includes('\'**/public\''))).toBe(false)
    expect(source).toContain('...STATIC_PUBLIC_DIRS')
  })
})
