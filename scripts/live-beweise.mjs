#!/usr/bin/env node
/**
 * Die Liste der Beweis-Skripte in `docs/referenz/LIVE-BEWEISE.md` wird
 * ERZEUGT, nicht gepflegt (OPS-012, GA1 P20).
 *
 *   pnpm live-beweise          # schreibt den erzeugten Abschnitt neu
 *   pnpm check:live-beweise    # rot, wenn der Abschnitt nicht zum Repo passt
 *
 * Die handgeschriebene Übersicht trug den Stand 2026-08-02 und sprach von
 * „zwei Dutzend" Skripten; im Repo lagen 81. Eine Liste, die jemand
 * nachtragen muss, veraltet — dieselbe Erfahrung wie bei der Produkt-Bilanz.
 *
 * Erzeugt wird NUR der Abschnitt zwischen den beiden Markern: je Skript der
 * Pfad, der erste Absatz seines Kopfkommentars („was beweist es?") und ob die
 * CI es fährt (steht sein Pfad in `.github/workflows/e2e.yml`?). Die
 * Einordnung drumherum — Gruppen, was zum Einhängen fehlt, wie man von Hand
 * startet — bleibt Text von Menschen.
 *
 * Ein Skript OHNE Kopfkommentar ist im Prüf-Modus rot: der Kopf ist die
 * Quelle, und ein Beweis, der nicht sagt, was er beweist, hilft niemandem.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DOC = 'docs/referenz/LIVE-BEWEISE.md'
const START = '<!-- ERZEUGT:ANFANG — nicht von Hand ändern, `pnpm live-beweise` schreibt diesen Abschnitt -->'
const END = '<!-- ERZEUGT:ENDE -->'
const NAME = /^(verify|acceptance)-.*\.mjs$/
const MAX = 220

/** Erster Absatz des ersten Blockkommentars, als eine Zeile. */
export function headSummary(source) {
  const block = source.match(/\/\*\*?([\s\S]*?)\*\//)
  if (!block || block.index > 200) return null
  const lines = block[1].split('\n').map(line => line.replace(/^\s*\*?\s?/, '').trimEnd())
  const paragraph = []
  for (const line of lines) {
    if (!line.trim()) {
      if (paragraph.length) break
      continue
    }
    paragraph.push(line.trim())
  }
  const text = paragraph.join(' ').replace(/\s+/g, ' ').replace(/\|/g, '/').trim()
  if (!text) return null
  return text.length > MAX ? `${text.slice(0, MAX - 1).trimEnd()}…` : text
}

export function proofScripts(root = ROOT) {
  const found = []
  for (const group of ['packages', 'apps']) {
    for (const name of readdirSync(join(root, group)).sort()) {
      const dir = join(root, group, name, 'scripts')
      if (!existsSync(dir)) continue
      for (const file of readdirSync(dir).sort()) {
        if (NAME.test(file)) found.push(`${group}/${name}/scripts/${file}`)
      }
    }
  }
  return found
}

/** @returns {{ section: string, problems: string[], count: number, inCi: number }} */
export function buildSection(root = ROOT) {
  const e2e = readFileSync(join(root, '.github/workflows/e2e.yml'), 'utf8')
    .split('\n').filter(line => !/^\s*#/.test(line)).join('\n')
  // In e2e.yml steht der Pfad ganz (`packages/media/scripts/…`) oder als
  // `cd packages/<layer>` mit `scripts/<datei>` im selben Schritt.
  const runsInCi = (path) => {
    if (e2e.includes(path)) return true
    const [group, name, , file] = path.split('/')
    let at = e2e.indexOf(`scripts/${file}`)
    while (at !== -1) {
      const before = e2e.slice(Math.max(0, at - 400), at)
      const cd = [...before.matchAll(/\bcd\s+((?:packages|apps)\/[a-z0-9_-]+)/g)].at(-1)?.[1]
      if (cd === `${group}/${name}`) return true
      at = e2e.indexOf(`scripts/${file}`, at + 1)
    }
    return false
  }
  const problems = []
  const rows = []
  let inCi = 0
  const scripts = proofScripts(root)
  for (const path of scripts) {
    const summary = headSummary(readFileSync(join(root, path), 'utf8'))
    if (!summary) {
      problems.push(`${path}: kein Kopfkommentar — die ersten Zeilen des Skripts sagen in einem Absatz, was es beweist (\`/** … */\` direkt am Anfang).`)
      continue
    }
    const ci = runsInCi(path)
    if (ci) inCi += 1
    rows.push(`| \`${path}\` | ${summary} | ${ci ? '**ja**' : 'nein'} |`)
  }
  const section = [
    START,
    '',
    `${scripts.length} Beweis-Skripte im Repo, ${inCi} davon fährt die CI bei jedem Push (\`.github/workflows/e2e.yml\`).`,
    '',
    '| Skript | Beweist (erster Absatz seines Kopfes) | In CI |',
    '| --- | --- | --- |',
    ...rows,
    '',
    END,
  ].join('\n')
  return { section, problems, count: scripts.length, inCi }
}

function main() {
  const check = process.argv.includes('--check')
  const file = join(ROOT, DOC)
  const current = readFileSync(file, 'utf8')
  const from = current.indexOf(START)
  const to = current.indexOf(END)
  if (from === -1 || to === -1 || to < from) {
    console.error(`✗ ${DOC}: die Marker für den erzeugten Abschnitt fehlen (ERZEUGT:ANFANG / ERZEUGT:ENDE).`)
    process.exit(1)
  }
  const { section, problems, count, inCi } = buildSection()
  const next = current.slice(0, from) + section + current.slice(to + END.length)
  if (problems.length) {
    console.error(`✗ Live-Beweise: ${problems.length} Skript(e) ohne Kopf\n`)
    for (const problem of problems) console.error(`  ✗ ${problem}`)
    process.exit(1)
  }
  if (check) {
    if (next !== current) {
      console.error(`✗ ${DOC} passt nicht zum Repo (neues oder gelöschtes Beweis-Skript, geänderter Kopf, anderer CI-Stand).`)
      console.error('  `pnpm live-beweise` ausführen und die Datei mit committen.')
      process.exit(1)
    }
    console.log(`✔ Live-Beweise: ${count} Skripte, ${inCi} in CI — die Übersicht passt zum Repo`)
    return
  }
  writeFileSync(file, next)
  console.log(`✔ ${DOC} geschrieben: ${count} Skripte, ${inCi} in CI`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
