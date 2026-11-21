/**
 * Wächter für das REGELWERK der KI-Sitzungen (Q17).
 *
 * Warum es das gibt: `CLAUDE.md` und die Dateien unter `.claude/rules/` liest
 * jede Sitzung als verbindlich, in jeder Runde neu. Zwei Dinge sieht dabei
 * weder Typecheck noch Lint noch ein Test: die Dateien wachsen, bis sie die
 * Runde teuer machen, und eine Umbenennung im Code zieht den Namen in der
 * Regel nicht mit.
 *
 * Die Regeln:
 *  1. GRÖSSE: `CLAUDE.md` höchstens 20.000 Bytes, jede Datei unter
 *     `.claude/rules/` höchstens 15.000 Bytes. Wer ergänzt, kürzt in
 *     derselben Datei oder teilt sie thematisch.
 *  2. LADE-PFADE: jede Regeldatei hat einen `paths:`-Kopf, und jedes Muster
 *     darin trifft mindestens eine Datei. Ein Muster ohne Treffer lädt die
 *     Regel nie.
 *  3. PFADE: jede Pfad-Angabe in Backticks zeigt auf etwas, das es gibt.
 *     Kurzformen ab Layer (`core/server/…`) und ab Layer-Ordner
 *     (`server/plugins/…`) werden aufgelöst; ein Muster mit `*` muss treffen.
 *  4. SKRIPTE: jedes `pnpm <skript>` in Backticks und jeder nackte Name wie
 *     `check:…` steht in einer `package.json` des Repos.
 *
 * Was der Wächter NICHT sieht: Funktions-, Komponenten- und Env-Namen (dafür
 * bei jeder Umbenennung `git grep` über `.claude/` und `CLAUDE.md`), Zahlen
 * und alles, was nicht in Backticks steht. Platzhalter (`<name>`), Routen
 * (`/api/…`), Pfade im Heimordner (`~/…`) und Paketnamen (`@scope/…`) werden
 * übersprungen, nicht geraten.
 *
 * Aufruf: `pnpm check:rules` (fährt im Lint-Lauf mit).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Deckel in Bytes (Davids Entscheidung 2026-11-21). */
export const MAX_BYTES_CORE = 20_000
export const MAX_BYTES_RULE = 15_000

const CORE_FILE = 'CLAUDE.md'
const RULES_DIR = '.claude/rules/'
/** Was zum Regelwerk zählt: Kern, Zeiger, Domänen-Regeln, Helfer-Anleitungen. */
const isRulebookFile = path => path === CORE_FILE || path === 'AGENTS.md'
  || (/^\.claude\/(rules|agents)\/[^/]+\.md$/.test(path))

/** Ordner, die ein Layer oder eine App selbst trägt — Kurzform ab hier wird per Endung gesucht. */
const LAYER_DIRS = new Set(['server', 'app', 'shared', 'tests', 'e2e', 'i18n', 'migrations', 'content', 'public'])
/** Dateiendungen, bei denen ein einzelner Name (ohne `/`) als Datei gilt. */
const FILE_NAME = /^[\w.-]+\.(md|ts|mts|mjs|cjs|js|vue|json|ya?ml|css|conf)$/
/** `pnpm`-eigene Befehle: kein Skript-Name. */
const PNPM_BUILTINS = new Set([
  'install', 'i', 'add', 'remove', 'update', 'up', 'exec', 'dlx', 'why', 'outdated',
  'audit', 'store', 'dedupe', 'rebuild', 'list', 'ls', 'publish', 'pack', 'link',
])
/** Vorsilben, an denen ein nackter Name in Backticks als Skript erkannt wird. */
const SCRIPT_PREFIX = /^(check|lint|verify|dev|test|build):[a-z][\w:-]*$/

/**
 * Angaben, die wie ein Pfad aussehen, aber keiner sind — je mit Grund. Hier
 * steht nur, was der Wächter nicht selbst unterscheiden kann.
 */
export const NOT_A_PATH = {
  'Node.js': 'Name der Laufzeit, keine Datei',
  'app/types/': 'der VERBOTENE Ort für Domain-Types — er soll nicht existieren',
}

function escapeRegExp(text) {
  return text.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
}

/** Glob → RegExp: `**` beliebig tief, `*` innerhalb eines Segments, `{a,b}` als Auswahl. */
export function globToRegExp(glob) {
  let out = ''
  let depth = 0
  for (let i = 0; i < glob.length; i++) {
    if (glob.startsWith('**/', i)) { out += '(?:.*/)?'; i += 2 }
    else if (glob.startsWith('**', i)) { out += '.*'; i += 1 }
    else if (glob[i] === '*') out += '[^/]*'
    else if (glob[i] === '{') { out += '(?:'; depth += 1 }
    else if (glob[i] === '}' && depth) { out += ')'; depth -= 1 }
    else if (glob[i] === ',' && depth) out += '|'
    else out += escapeRegExp(glob[i])
  }
  return new RegExp(`^${out}$`)
}

/** Verzeichnis aus der Datei-Liste: Dateien, Ordner, Layer, Wurzel-Einträge. */
export function buildIndex(files) {
  const fileSet = new Set(files)
  const dirs = new Set()
  const baseNames = new Set()
  for (const file of files) {
    const parts = file.split('/')
    baseNames.add(parts[parts.length - 1])
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
  }
  const roots = new Set(files.map(file => file.split('/')[0]))
  const layers = new Set(files.filter(f => f.startsWith('packages/')).map(f => f.split('/')[1]))
  return { files, fileSet, dirs, baseNames, roots, layers }
}

function existsExact(index, path) {
  const clean = path.replace(/\/+$/, '')
  return index.fileSet.has(clean) || index.dirs.has(clean)
}

function existsAsSuffix(index, path) {
  const clean = path.replace(/\/+$/, '')
  const tail = `/${clean}`
  for (const file of index.files) if (file.endsWith(tail) || file.includes(`${tail}/`)) return true
  for (const dir of index.dirs) if (dir.endsWith(tail)) return true
  return false
}

function matchesGlob(index, glob, { anywhere = false } = {}) {
  const clean = glob.replace(/\/+$/, '')
  const pattern = globToRegExp(anywhere ? `**/${clean}` : clean)
  if (index.files.some(file => pattern.test(file))) return true
  for (const dir of index.dirs) if (pattern.test(dir)) return true
  return false
}

/**
 * Ein Wort aus einem Backtick-Abschnitt: ist es eine Pfad-Angabe, und gibt es
 * sie? `null` = keine Aussage (kein Pfad oder nicht entscheidbar), sonst
 * `{ ok, tried }`.
 */
export function judgePath(rawWord, index) {
  let word = rawWord.replace(/^[('"„[]+/, '').replace(/[)'"“\],.;]+$/, '')
  word = word.replace(/#[\w-]*$/, '').replace(/:\d+(?:[-–]\d+)?$/, '').replace(/:$/, '')
  if (!word || word in NOT_A_PATH) return null
  if (/[<>{}$=@…|\\]|:\/\//.test(word)) return null
  if (/^[/~]|^\.\.?\//.test(word)) return null
  const isGlob = word.includes('*')
  if (!word.includes('/')) {
    if (isGlob || !FILE_NAME.test(word)) return null
    return { ok: index.baseNames.has(word), tried: `eine Datei namens ${word}` }
  }
  const first = word.split('/')[0]
  const second = word.split('/')[1] ?? ''
  if (index.roots.has(first)) {
    return { ok: isGlob ? matchesGlob(index, word) : existsExact(index, word), tried: word }
  }
  if (index.layers.has(first)) {
    const hasShape = isGlob || /\.\w+$/.test(word) || word.endsWith('/') || LAYER_DIRS.has(second)
    if (!hasShape) return null
    const full = `packages/${word}`
    return { ok: isGlob ? matchesGlob(index, full) : existsExact(index, full), tried: full }
  }
  if (LAYER_DIRS.has(first)) {
    return { ok: isGlob ? matchesGlob(index, word, { anywhere: true }) : existsAsSuffix(index, word), tried: `…/${word}` }
  }
  return null
}

/** `pnpm`-Aufrufe und nackte Skript-Namen eines Backtick-Abschnitts. */
export function findScriptNames(span) {
  const names = []
  const words = span.trim().split(/\s+/)
  for (let i = 0; i < words.length; i++) {
    if (words[i] !== 'pnpm') continue
    let j = i + 1
    while (j < words.length) {
      const word = words[j]
      if (word === '--filter' || word === '-F' || word === '-C' || word === '--dir') j += 2
      else if (word.startsWith('-') || word === 'run') j += 1
      else break
    }
    const name = words[j]
    if (name && /^[a-z][\w:.-]*$/.test(name) && !PNPM_BUILTINS.has(name)) names.push(name)
  }
  if (words.length === 1 && SCRIPT_PREFIX.test(words[0])) names.push(words[0])
  return names
}

/** `paths:`-Muster aus dem Kopf einer Regeldatei; `null` = kein Kopf. */
export function readPathsHeader(source) {
  const head = source.match(/^---\n([\s\S]*?)\n---/)
  if (!head) return null
  const block = head[1].match(/^paths:\s*\n((?:[ \t]+-[^\n]*\n?)+)/m)
  if (!block) return null
  return block[1].split('\n').map(line => line.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, '')).filter(Boolean)
}

/** Backtick-Abschnitte je Zeile (ein- und mehrfache Backticks, keine Code-Zäune). */
function inlineSpans(source) {
  const spans = []
  let fenced = false
  source.split('\n').forEach((line, index) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; return }
    if (fenced) return
    for (const match of line.matchAll(/`([^`\n]+)`/g)) spans.push({ text: match[1], line: index + 1 })
  })
  return spans
}

/**
 * Der reine Kern: Regelwerk-Dateien (`{ path, source }`), die Datei-Liste des
 * Repos und alle Skript-Namen hinein, Verstöße heraus.
 */
export function checkRulebook(docs, files, scriptNames) {
  const index = buildIndex(files)
  const violations = []
  const stats = { files: docs.length, paths: 0, scripts: 0, patterns: 0 }
  for (const doc of docs) {
    const bytes = Buffer.byteLength(doc.source, 'utf8')
    const isRule = doc.path.startsWith(RULES_DIR)
    const limit = doc.path === CORE_FILE ? MAX_BYTES_CORE : isRule ? MAX_BYTES_RULE : null
    if (limit !== null && bytes > limit) {
      violations.push(`${doc.path}: ${bytes} Bytes, erlaubt sind ${limit} — kürzen (Herleitung und Datum nach docs/OPEN-ITEMS-COMPLETE.md) oder thematisch teilen`)
    }
    if (isRule) {
      const patterns = readPathsHeader(doc.source)
      if (!patterns?.length) violations.push(`${doc.path}: der \`paths:\`-Kopf fehlt oder ist leer — die Regel lädt nie`)
      for (const pattern of patterns ?? []) {
        stats.patterns += 1
        if (!matchesGlob(index, pattern)) violations.push(`${doc.path}: Lade-Pfad „${pattern}“ trifft keine Datei`)
      }
    }
    for (const span of inlineSpans(doc.source)) {
      for (const name of findScriptNames(span.text)) {
        stats.scripts += 1
        if (!scriptNames.has(name)) violations.push(`${doc.path}:${span.line}: Skript „${name}“ steht in keiner package.json`)
      }
      for (const word of span.text.split(/\s+/)) {
        const verdict = judgePath(word, index)
        if (!verdict) continue
        stats.paths += 1
        if (!verdict.ok) violations.push(`${doc.path}:${span.line}: „${word}“ gibt es nicht (gesucht: ${verdict.tried})`)
      }
    }
  }
  return { violations, stats }
}

/** Den echten Baum prüfen. */
export function checkTree(root = ROOT) {
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').filter(Boolean)
  const present = files.filter((file) => {
    try { readFileSync(join(root, file), { flag: 'r' }); return true }
    catch { return false }
  })
  const scriptNames = new Set()
  for (const file of present.filter(f => f === 'package.json' || f.endsWith('/package.json'))) {
    const scripts = JSON.parse(readFileSync(join(root, file), 'utf8')).scripts ?? {}
    for (const name of Object.keys(scripts)) scriptNames.add(name)
  }
  const docs = present.filter(isRulebookFile).map(path => ({ path, source: readFileSync(join(root, path), 'utf8') }))
  return checkRulebook(docs, present, scriptNames)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { violations, stats } = checkTree()
  if (violations.length) {
    console.error(`Regelwerk: ${violations.length} Verstoß/Verstöße\n`)
    for (const violation of violations) console.error(`  ${violation}`)
    console.error('\nDie Regeln stehen im Kopf von scripts/check-rules.mjs.')
    process.exit(1)
  }
  console.log(`Regelwerk in Ordnung: ${stats.files} Dateien, ${stats.paths} Pfad-Angaben, ${stats.scripts} Skript-Namen, ${stats.patterns} Lade-Pfade geprüft.`)
}
