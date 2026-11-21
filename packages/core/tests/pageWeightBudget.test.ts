import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { startPageScripts } from '../../../scripts/lib/page-weight.mjs'
import { measureApp } from '../../../scripts/check-page-weight.mjs'
import { PAGE_WEIGHT_BUDGETS } from '../../../scripts/lib/page-weight-budgets.mjs'

/**
 * WÄCHTER FÜR DAS SKRIPT-GEWICHT DER STARTSEITE (Q22). Gerechnet wird aus dem
 * Client-Manifest; nachgeladene Teile (`dynamicImports`) zählen nicht.
 */

const MANIFEST = {
  'entry.js': { file: 'entry.js', isEntry: true, imports: ['shared.js'], dynamicImports: ['consent.vue'] },
  'shared.js': { file: 'shared.js', imports: [] },
  'pages/index.vue': { file: 'index.js', imports: ['shared.js', 'button.vue'] },
  'button.vue': { file: 'button.js' },
  'layouts/site.vue': { file: 'site.js', css: ['site.css'] },
  'consent.vue': { file: 'zod-und-formular.js' },
  'pages/dashboard.vue': { file: 'dashboard.js' },
}

describe('startPageScripts', () => {
  it('Einstieg + Seite + Layout, transitiv über statische Imports', () => {
    expect(startPageScripts(MANIFEST, ['pages/index.vue', 'layouts/site.vue'])).toEqual({
      files: ['button.js', 'entry.js', 'index.js', 'shared.js', 'site.js'],
      missing: [],
    })
  })

  it('GEGENPROBE: nachgeladene Teile und fremde Seiten zählen nicht; fehlende Wurzel wird gemeldet', () => {
    const { files, missing } = startPageScripts(MANIFEST, ['pages/index.vue', 'layouts/weg.vue'])
    expect(files).not.toContain('zod-und-formular.js')
    expect(files).not.toContain('dashboard.js')
    expect(missing).toEqual(['layouts/weg.vue'])
  })
})

describe('measureApp', () => {
  function fakeApp(sizes: Record<string, number>, buildDir = 'node_modules/.cache/nuxt/.nuxt'): string {
    const dir = mkdtempSync(join(tmpdir(), 'q22-weight-'))
    const manifestDir = join(dir, buildDir, 'dist/server')
    const publicDir = join(dir, '.output/public/_nuxt')
    mkdirSync(manifestDir, { recursive: true })
    mkdirSync(publicDir, { recursive: true })
    writeFileSync(join(manifestDir, 'client.manifest.mjs'), `export default ${JSON.stringify(MANIFEST)}`)
    // Zufallsbytes lassen sich nicht packen: gepackt ≈ roh.
    for (const [file, bytes] of Object.entries(sizes)) writeFileSync(join(publicDir, file), randomBytes(bytes))
    return dir
  }

  const files = { 'entry.js': 40_000, 'shared.js': 30_000, 'index.js': 20_000, 'button.js': 5_000, 'site.js': 5_000, 'zod-und-formular.js': 500_000 }

  it('unter der Grenze grün', async () => {
    const r = await measureApp('x', { roots: ['pages/index.vue', 'layouts/site.vue'], maxScriptGzipKB: 120 }, fakeApp(files))
    expect(r.ok).toBe(true)
    expect(r.files).toBe(5)
    expect(r.kb).toBeGreaterThanOrEqual(97)
    expect(r.kb).toBeLessThanOrEqual(100)
  })

  it('findet den Build auch unter `.nuxt/` (so baut die CI)', async () => {
    const r = await measureApp('x', { roots: ['pages/index.vue', 'layouts/site.vue'], maxScriptGzipKB: 120 }, fakeApp(files, '.nuxt'))
    expect(r.built).toBe(true)
    expect(r.ok).toBe(true)
  })

  it('GEGENPROBE: ohne Manifest an beiden Orten gilt „kein Build"', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'q22-weight-leer-'))
    mkdirSync(join(dir, '.output/public/_nuxt'), { recursive: true })
    const r = await measureApp('x', { roots: ['pages/index.vue'], maxScriptGzipKB: 120 }, dir)
    expect(r.built).toBe(false)
  })

  it('GEGENPROBE: über der Grenze rot', async () => {
    const r = await measureApp('x', { roots: ['pages/index.vue', 'layouts/site.vue'], maxScriptGzipKB: 90 }, fakeApp(files))
    expect(r.ok).toBe(false)
  })

  it('GEGENPROBE: eine Datei aus dem Manifest fehlt im Build — rot, nicht still weniger', async () => {
    const { 'shared.js': _dropped, ...rest } = files
    const r = await measureApp('x', { roots: ['pages/index.vue', 'layouts/site.vue'], maxScriptGzipKB: 1_000 }, fakeApp(rest))
    expect(r.ok).toBe(false)
    expect(r.absent).toEqual(['shared.js'])
  })

  it('jede Grenze der Liste ist gesetzt (kein 0, kein Platzhalter)', () => {
    const budgets = PAGE_WEIGHT_BUDGETS as Record<string, { roots: string[], maxScriptGzipKB: number }>
    expect(Object.keys(budgets).sort()).toEqual(['branding', 'help', 'marketing', 'platform', 'portfolio'])
    for (const [app, b] of Object.entries(budgets)) {
      expect(b.maxScriptGzipKB, app).toBeGreaterThan(100)
      expect(b.roots[0], app).toBe('pages/index.vue')
    }
  })
})
