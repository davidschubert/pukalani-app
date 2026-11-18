/**
 * Typisierter Lint-Durchgang (SEC-023, SI1 c): `pnpm lint:typed`.
 *
 * Fährt `@typescript-eslint/no-floating-promises` über JEDEN Server-Ordner
 * (`packages/*\/server`, `apps/*\/server`) mit `eslint.typed.config.mjs`.
 * Je App-Programm EIN ESLint-Prozess, parallel: jedes TypeScript-Programm
 * entsteht genau einmal (vorher baute jedes Paket im `pnpm -r lint` das
 * Programm seiner App neu — 34 Aufbauten für acht Programme).
 *
 * Rot, wenn EIN Prozess nicht mit 0 endet — auch bei Abbruch durch ein
 * Signal (Speicher) oder einem Muster, das keine Datei trifft (ESLint bricht
 * dann selbst ab). Ein fälschlich grüner Lauf wäre schlimmer als ein
 * langsamer: der Deploy hängt am Lint-Job.
 *
 * Aufruf: `pnpm lint:typed` (vorher einmal `pnpm lint:prepare`).
 */
import { spawn } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
// `eslint/bin/…` steht nicht in den exports des Pakets — über package.json.
const eslintPackage = createRequire(import.meta.url).resolve('eslint/package.json')
const eslintBin = join(dirname(eslintPackage), JSON.parse(readFileSync(eslintPackage, 'utf8')).bin.eslint)
// Der Config-Load prüft Zuordnung und tsconfigs und wirft mit Hinweis.
const { serverDirsByProgram } = await import(new URL('../eslint.typed.config.mjs', import.meta.url).href)

const groups = Object.entries(serverDirsByProgram())
const limit = Math.max(1, Math.min(groups.length, availableParallelism()))

const runGroup = ([app, dirs]) => new Promise((resolveRun) => {
  const started = Date.now()
  const args = [eslintBin, '--config', 'eslint.typed.config.mjs', ...dirs.map(dir => `${dir}/**/*.ts`)]
  const child = spawn(process.execPath, args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  child.on('error', (error) => { output += `\n${error.message}\n` })
  child.on('close', (code, signal) => {
    resolveRun({ app, dirs, code, signal, output, seconds: (Date.now() - started) / 1000 })
  })
})

const queue = [...groups]
const results = []
await Promise.all(Array.from({ length: limit }, async () => {
  while (queue.length) {
    const result = await runGroup(queue.shift())
    results.push(result)
    const ok = result.code === 0 && !result.signal
    console.log(`${ok ? 'ok ' : 'ROT'} ${result.app.padEnd(10)} ${result.seconds.toFixed(1)} s  (${result.dirs.length} Server-Ordner)`)
    if (result.output.trim()) console.log(result.output.trimEnd())
  }
}))

const failed = results.filter(result => result.code !== 0 || result.signal)
if (results.length !== groups.length || failed.length) {
  console.error(`lint:typed ROT: ${failed.map(r => `${r.app} (${r.signal ?? `Exit ${r.code}`})`).join(', ') || 'nicht alle Programme gelaufen'}`)
  process.exit(1)
}
console.log(`lint:typed grün: ${groups.length} Programme, ${groups.reduce((n, [, dirs]) => n + dirs.length, 0)} Server-Ordner.`)
