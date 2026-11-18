/**
 * LN1 (2026-11-18): der Lint sieht Routen-Ordner namens `public`.
 *
 * `@nuxt/eslint-config` nimmt jeden Ordner namens `public` aus — gemeint sind
 * statische Dateien. Das traf auch `server/api/…/public/` (zwölf Routen ohne
 * Lint). Beide Configs begrenzen die Ausnahme seitdem auf die statischen
 * Ordner (`scripts/lib/lint-static-public.mjs`). Dieser Test fragt ESLint
 * selbst, statt die Muster nachzurechnen.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

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

const configs = ['eslint.config.mjs', 'eslint.typed.config.mjs']

describe('Lint und Ordner namens public (LN1)', () => {
  const routeDirs = publicRouteDirs()

  it('findet die Routen-Ordner, um die es geht', () => {
    const names = routeDirs.map(dir => relative(repoRoot, dir))
    expect(names).toContain(join('packages', 'insights', 'server', 'api', 'insights', 'public'))
    expect(names).toContain(join('packages', 'pages', 'server', 'api', 'pages', 'public'))
  })

  it.each(configs)('%s: eine Route unter server/…/public/ wird geprüft', async (config) => {
    const eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: resolve(repoRoot, config) })
    for (const dir of routeDirs) {
      expect(await eslint.isPathIgnored(join(dir, 'probe.get.ts')), relative(repoRoot, dir)).toBe(false)
    }
  }, 60_000)

  it.each(configs)('%s: statische public-Ordner bleiben ausgenommen', async (config) => {
    const eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: resolve(repoRoot, config) })
    for (const dir of ['apps/photos/public', 'packages/themes/public', 'packages/market/.playground/public', 'docs/public']) {
      expect(await eslint.isPathIgnored(resolve(repoRoot, dir, 'probe.js')), dir).toBe(true)
    }
  }, 60_000)
})
