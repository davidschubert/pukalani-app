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
 * Pfad, der erste Absatz seines Kopfkommentars („was beweist es?") und wann es
 * läuft — laut der Einteilung `scripts/buehne/beweise.mjs` (E2E-Lauf, Bühne
 * bei jedem Lauf, Bühne nachts oder von Hand mit Grund; OPS-009). Die
 * Einordnung drumherum — Gruppen, was zum Einhängen fehlt, wie man von Hand
 * startet — bleibt Text von Menschen.
 *
 * `--check` ist außerdem rot, wenn die Einteilung nicht zum Repo passt: ein
 * Skript ohne Zeile, eine doppelte Zeile, eine Zeile ohne Datei, `hand` ohne
 * Grund, `e2e` ohne Schritt in `.github/workflows/e2e.yml` (und umgekehrt).
 *
 * Ein Skript OHNE Kopfkommentar ist im Prüf-Modus rot: der Kopf ist die
 * Quelle, und ein Beweis, der nicht sagt, was er beweist, hilft niemandem.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BEWEISE, e2eDetector, LAEUFE, manifestProblems } from './buehne/beweise.mjs'

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

/** Spalte „Läuft" für einen Eintrag der Einteilung. */
function laufLabel(entry) {
  if (!entry) return '**fehlt in beweise.mjs**'
  if (entry.lauf === 'hand') return `von Hand: ${String(entry.grund ?? '').replace(/\|/g, '/')}`
  const label = LAEUFE[entry.lauf] ?? entry.lauf
  // Die Einzel-Instanz ist ein eigener Server im Lauf — das gehört in die Spalte.
  return (entry.braucht ?? []).includes('einzel') ? `${label}, Einzel-Instanz` : label
}

/**
 * @param {string} [root]
 * @param {import('./buehne/beweise.mjs').Beweis[]} [beweise]
 * @returns {{ section: string, problems: string[], count: number, perLauf: Record<string, number> }}
 */
export function buildSection(root = ROOT, beweise = BEWEISE) {
  const runsInE2e = e2eDetector(readFileSync(join(root, '.github/workflows/e2e.yml'), 'utf8'))
  const scripts = proofScripts(root)
  const problems = manifestProblems({ scripts, beweise, runsInE2e })
  const byPath = new Map(beweise.map(entry => [entry.skript, entry]))
  /** @type {Record<string, number>} */
  const perLauf = Object.fromEntries(Object.keys(LAEUFE).map(key => [key, 0]))
  const rows = []
  for (const path of scripts) {
    const summary = headSummary(readFileSync(join(root, path), 'utf8'))
    if (!summary) {
      problems.push(`${path}: kein Kopfkommentar — die ersten Zeilen des Skripts sagen in einem Absatz, was es beweist (\`/** … */\` direkt am Anfang).`)
      continue
    }
    const entry = byPath.get(path)
    if (entry && entry.lauf in perLauf) perLauf[entry.lauf] += 1
    rows.push(`| \`${path}\` | ${summary} | ${laufLabel(entry)} |`)
  }
  const counts = Object.entries(LAEUFE).map(([key, label]) => `${perLauf[key]} ${label}`).join(', ')
  const section = [
    START,
    '',
    `${scripts.length} Beweis-Skripte im Repo: ${counts} (Einteilung: \`scripts/buehne/beweise.mjs\`, Läufer: \`pnpm buehne run\`).`,
    '',
    '| Skript | Beweist (erster Absatz seines Kopfes) | Läuft |',
    '| --- | --- | --- |',
    ...rows,
    '',
    END,
  ].join('\n')
  return { section, problems, count: scripts.length, perLauf }
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
  const { section, problems, count, perLauf } = buildSection()
  const summary = Object.entries(perLauf).map(([key, n]) => `${key} ${n}`).join(' · ')
  const next = current.slice(0, from) + section + current.slice(to + END.length)
  if (problems.length) {
    console.error(`✗ Live-Beweise: ${problems.length} Problem(e) mit Köpfen oder Einteilung\n`)
    for (const problem of problems) console.error(`  ✗ ${problem}`)
    process.exit(1)
  }
  if (check) {
    if (next !== current) {
      console.error(`✗ ${DOC} passt nicht zum Repo (neues oder gelöschtes Beweis-Skript, geänderter Kopf, andere Einteilung).`)
      console.error('  `pnpm live-beweise` ausführen und die Datei mit committen.')
      process.exit(1)
    }
    console.log(`✔ Live-Beweise: ${count} Skripte (${summary}) — Übersicht und Einteilung passen zum Repo`)
    return
  }
  writeFileSync(file, next)
  console.log(`✔ ${DOC} geschrieben: ${count} Skripte (${summary})`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
