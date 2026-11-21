#!/usr/bin/env node
/**
 * `pnpm check` — der ganze Lint-Lauf, lokal genau so wie in der CI (Q18,
 * DOC-012). Die Liste steht in scripts/lib/check-steps.mjs; der Job `lint`
 * in .github/workflows/lint.yml ruft nur dieses Skript.
 *
 *   pnpm check          alle Schritte; am Ende eine Tabelle mit Dauer
 *   pnpm check --list   nur die Liste zeigen
 *
 * Läuft weiter, wenn ein Schritt rot ist (alle Funde in einem Durchgang),
 * und endet dann mit Code 1. Ein Schritt mit `needs` fällt aus, wenn sein
 * Vorgänger rot war.
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHECK_STEPS } from './lib/check-steps.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const inCi = process.env.GITHUB_ACTIONS === 'true'

if (process.argv.includes('--list')) {
  for (const step of CHECK_STEPS) console.log(`pnpm ${step.run.join(' ').padEnd(42)} ${step.why}`)
  process.exit(0)
}

const results = []
for (const step of CHECK_STEPS) {
  const command = `pnpm ${step.run.join(' ')}`
  if (step.needs && results.find(result => result.name === step.needs)?.status !== 'ok') {
    results.push({ name: step.name, command, status: 'skipped', seconds: 0 })
    console.log(`\n▷ ${command} — ausgelassen, weil ${step.needs} nicht grün war`)
    continue
  }
  console.log(inCi ? `::group::${command}` : `\n▶ ${command}`)
  const started = Date.now()
  const run = spawnSync('pnpm', step.run, { cwd: ROOT, stdio: 'inherit' })
  const seconds = (Date.now() - started) / 1000
  if (inCi) console.log('::endgroup::')
  const status = run.status === 0 ? 'ok' : 'failed'
  if (status === 'failed' && inCi) console.log(`::error title=${step.name}::${command} endete mit ${run.status ?? run.signal}`)
  results.push({ name: step.name, command, status, seconds })
}

console.log('\npnpm check — Ergebnis')
for (const result of results) {
  const mark = result.status === 'ok' ? '✔' : result.status === 'failed' ? '✗' : '–'
  console.log(`  ${mark} ${result.command.padEnd(46)} ${result.seconds.toFixed(1).padStart(6)} s`)
}
const failed = results.filter(result => result.status !== 'ok')
const total = results.reduce((sum, result) => sum + result.seconds, 0)
console.log(`  ${failed.length ? `✗ ${failed.length} von ${results.length} nicht grün` : `✔ alle ${results.length} grün`} · ${total.toFixed(1)} s`)
process.exit(failed.length ? 1 : 0)
