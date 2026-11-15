import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * BE-026 (2026-11-15): EIN Bootstrap-Skript (`scripts/bootstrap.mjs`). Vorher
 * lag es byte-gleich fünfmal unter `apps/<app>/scripts/bootstrap.ts` — eine
 * Korrektur an der Wache hätte fünfmal gleich gemacht werden müssen, und
 * `create-site` hätte jede neue App mit einer weiteren Kopie versorgt.
 *
 * Rot wird, wer eine Kopie zurücklegt oder ein App-Skript auf ein anderes
 * Ziel bzw. die falsche App zeigen lässt (`--app` ist das Ziel der
 * Migrationen — ein falscher Name migriert die falsche Instanz).
 */
const REPO = join(__dirname, '..', '..', '..')
const APPS = join(REPO, 'apps')

const appDirs = readdirSync(APPS, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && existsSync(join(APPS, entry.name, 'package.json')))
  .map(entry => entry.name)

describe('Bootstrap — eine Quelle', () => {
  it('das eine Skript existiert', () => {
    expect(existsSync(join(REPO, 'scripts', 'bootstrap.mjs'))).toBe(true)
  })

  it('keine App trägt eine eigene Kopie (apps/*/scripts/bootstrap.*)', () => {
    const copies = appDirs.flatMap((app) => {
      const dir = join(APPS, app, 'scripts')
      if (!existsSync(dir)) return []
      return readdirSync(dir).filter(name => /^bootstrap\./.test(name)).map(name => `apps/${app}/scripts/${name}`)
    })
    expect(copies).toEqual([])
  })

  it('jedes bootstrap-Skript ruft ../../scripts/bootstrap.mjs mit --app <eigener Ordner>', () => {
    const withBootstrap = appDirs.filter((app) => {
      const pkg = JSON.parse(readFileSync(join(APPS, app, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
      return Boolean(pkg.scripts?.bootstrap)
    })
    expect(withBootstrap.length).toBeGreaterThan(0)
    for (const app of withBootstrap) {
      const pkg = JSON.parse(readFileSync(join(APPS, app, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
      const command = pkg.scripts.bootstrap!
      expect(command, app).toMatch(/(^|\s)\.\.\/\.\.\/scripts\/bootstrap\.mjs(\s|$)/)
      const target = command.match(/--app[=\s]+(\S+)/)?.[1]
      expect(target, `${app}: ${command}`).toBe(app)
      expect(command.match(/--app[=\s]/g)?.length, app).toBe(1)
    }
  })
})
