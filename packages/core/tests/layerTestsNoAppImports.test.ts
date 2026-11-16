import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * EIN TEST EINES LAYERS LÄDT KEINE DATEI AUS `apps/` (GA1 P26 erwischt, mit
 * P20 als Wächter): Code unter `apps/<app>/` lebt von Nuxts erzeugten Dateien
 * (`.nuxt/`, Auto-Importe). Lokal liegt der Ordner nach `pnpm lint:prepare`
 * da, im Job `test` der CI NICHT — derselbe Test ist dann lokal grün und in
 * der CI rot, und das zeigt erst der Push.
 *
 * Erlaubt bleibt: eine Datei aus `apps/` als TEXT lesen (`readFileSync`), und
 * der Import eines `site.manifest.ts` (nur `import type`, braucht kein Nuxt).
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const IMPORT_FROM_APPS = /(?:from|import\s*\()\s*['"`](?:\.\.\/)+apps\/([^'"`]+)['"`]/g

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(ts|mts|mjs)$/.test(name)) out.push(path)
  }
  return out
}

export function appImports(source: string): string[] {
  return [...source.matchAll(IMPORT_FROM_APPS)].map(match => match[1]!).filter(path => !/\/site\.manifest(\.ts)?$/.test(path))
}

describe('Tests der Layer hängen nicht an apps/<app>/.nuxt', () => {
  it('kein Test unter packages/*/tests importiert eine Datei aus apps/', () => {
    const offenders: string[] = []
    for (const layer of readdirSync(join(ROOT, 'packages'))) {
      for (const file of walk(join(ROOT, 'packages', layer, 'tests'))) {
        // Diese Datei trägt die Gegenproben unten als Text.
        if (file === fileURLToPath(import.meta.url)) continue
        for (const path of appImports(readFileSync(file, 'utf8'))) {
          offenders.push(`${file.slice(ROOT.length + 1)} importiert apps/${path} — in der CI fehlt dort .nuxt/. Die Logik in den Layer oder nach shared/ ziehen und dort testen, oder den Test in die App legen (apps/<app>/tests).`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('GEGENPROBE: Import und dynamischer Import werden erkannt, Textlesen und Site-Manifest nicht', () => {
    expect(appImports(`import { sweep } from '../../../apps/platform/server/utils/sweep'`)).toEqual(['platform/server/utils/sweep'])
    expect(appImports(`const mod = await import('../../../apps/branding/server/plugins/x.ts')`)).toEqual(['branding/server/plugins/x.ts'])
    expect(appImports(`const text = readFileSync(join(ROOT, 'apps/platform/nuxt.config.ts'), 'utf8')`)).toEqual([])
    expect(appImports(`import site from '../../../apps/platform/site.manifest'`)).toEqual([])
  })
})
