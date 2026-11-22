/**
 * WÄCHTER: SKRIPT-GEWICHT DER STARTSEITE (Q22, PERF-006/PERF-010).
 *
 * Nach dem Build einer App: rechnet aus dem Client-Manifest, wie viele
 * Skript-Bytes (gzip) die Startseite beim ersten Aufruf lädt, und ist rot,
 * wenn das die Grenze aus `scripts/lib/page-weight-budgets.mjs` übersteigt.
 * Apps ohne Eintrag dort werden übersprungen.
 *
 * Aufruf: `pnpm check:page-weight --app <name>` (mehrfach möglich); ohne
 * `--app` alle Apps der Liste, deren Build da ist. Hart (Exit 1) prüft ihn
 * `.github/workflows/page-weight.yml` im Pull Request und auf `main`; im
 * Ausliefern läuft er nach jedem Build nur noch als Warnung (Review-Befund
 * B1: eine zu schwere App hielt sonst das Ausliefern aller Apps auf).
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PAGE_WEIGHT_BUDGETS } from './lib/page-weight-budgets.mjs'
import { gzipBytes, startPageScripts } from './lib/page-weight.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Wo Nuxt seinen Build-Ordner ablegt, hängt von der Umgebung ab: in der CI
 * `.nuxt/`, auf dem Mac `node_modules/.cache/nuxt/.nuxt/` (am 2026-11-21 im
 * Ausliefern erwischt — der Wächter fand dort „keinen Build"). Gibt es
 * beide, gilt der jüngere.
 * @param {string} appDir
 */
export function findManifest(appDir) {
  const candidates = [
    join(appDir, '.nuxt/dist/server/client.manifest.mjs'),
    join(appDir, 'node_modules/.cache/nuxt/.nuxt/dist/server/client.manifest.mjs'),
  ].filter(path => existsSync(path))
  candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return candidates[0]
}

/**
 * @param {string} app
 * @param {{ roots: string[], maxScriptGzipKB: number }} budget
 * @param {string} appDir
 */
export async function measureApp(app, budget, appDir = join(ROOT, 'apps', app)) {
  const manifestPath = findManifest(appDir)
  const publicDir = join(appDir, '.output/public/_nuxt')
  if (!manifestPath || !existsSync(publicDir)) return { app, built: false }
  const manifest = (await import(pathToFileURL(manifestPath).href)).default
  const { files, missing } = startPageScripts(manifest, budget.roots)
  let bytes = 0
  const absent = []
  for (const file of files) {
    const path = join(publicDir, file)
    if (!existsSync(path)) {
      absent.push(file)
      continue
    }
    bytes += gzipBytes(readFileSync(path))
  }
  const kb = Math.round(bytes / 1024)
  return { app, built: true, files: files.length, kb, max: budget.maxScriptGzipKB, missing, absent, ok: missing.length === 0 && absent.length === 0 && kb <= budget.maxScriptGzipKB }
}

async function main() {
  const args = process.argv.slice(2)
  const wanted = []
  for (let i = 0; i < args.length; i++) if (args[i] === '--app' && args[i + 1]) wanted.push(args[++i])
  const apps = wanted.length > 0 ? wanted : Object.keys(PAGE_WEIGHT_BUDGETS)
  let failed = false
  for (const app of apps) {
    const budget = PAGE_WEIGHT_BUDGETS[/** @type {keyof typeof PAGE_WEIGHT_BUDGETS} */ (app)]
    if (!budget) {
      console.log(`○ ${app}: keine Grenze festgelegt — übersprungen`)
      continue
    }
    const r = await measureApp(app, budget)
    if (!r.built) {
      // Ausdrücklich verlangt, aber kein Build da: das ist ein Fehler, kein Überspringen.
      if (wanted.length > 0) {
        console.error(`✗ ${app}: kein Build gefunden (erst \`pnpm --filter ${app} build\`)`)
        failed = true
      }
      else console.log(`○ ${app}: kein Build — übersprungen`)
      continue
    }
    if (r.missing.length > 0) console.error(`✗ ${app}: nicht im Manifest: ${r.missing.join(', ')} (Startseite oder Layout umbenannt?)`)
    if (r.absent.length > 0) console.error(`✗ ${app}: Dateien fehlen in .output: ${r.absent.join(', ')}`)
    console.log(`${r.ok ? '✓' : '✗'} ${app}: Startseite lädt ${r.files} Skript-Dateien, ${r.kb} KB gepackt (Grenze ${r.max} KB)`)
    if (!r.ok) failed = true
  }
  if (failed) process.exit(1)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main()
}
