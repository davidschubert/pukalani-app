/**
 * Wächter gegen LITERALE NUL-Bytes (0x00) in Text-Quelldateien (SEC-044).
 *
 * Warum es das gibt: eine Datei mit einem einzigen NUL-Byte gilt für git als
 * BINÄR. `git diff` meldet nur noch „Binary files differ", ein Pull Request
 * zeigt die Änderung an dieser Datei gar nicht an, und `grep` ohne `-a`
 * findet in ihr nichts mehr. Was in so einer Datei geändert wird, sieht in
 * keinem Review jemand — und weder Typecheck noch Lint noch Tests merken es,
 * denn zur Laufzeit ist das Zeichen völlig in Ordnung.
 *
 * 2026-11 waren es sechs Dateien (posts, market, control, comments, brand):
 * jeweils ein NUL als Trennzeichen in einem Cache-Schlüssel oder Vergleich,
 * direkt als Byte in die Zeichenkette getippt statt als Escape geschrieben.
 *
 * Die Regel: im Code schreibt man das Zeichen als Escape `\u0000` — in einem
 * String- oder Template-Literal ist das zur Laufzeit dasselbe Zeichen, aber
 * die Datei bleibt Text.
 *
 * Geprüft werden die versionierten Dateien UND die noch nicht versionierten,
 * nicht ignorierten — damit der Wächter lokal schon VOR dem ersten `git add`
 * anschlägt. Nur Text-Dateien nach Endung (Erlaubnisliste unten): Bilder,
 * Schriften, `.DS_Store`, `.mmdb` & Co. dürfen NUL enthalten und bleiben
 * außen vor.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Endungen, die in diesem Repo Text sind — nur sie werden geprüft. */
const TEXT_EXTENSIONS = new Set([
  'ts', 'mts', 'cts', 'tsx',
  'js', 'mjs', 'cjs', 'jsx',
  'vue',
  'json', 'jsonc', 'json5',
  'md', 'mdc',
  'yml', 'yaml',
  'css', 'scss',
  'html',
  'sh',
  'toml',
  'txt',
  'svg', 'xml',
])

/** Env-Vorlagen ohne „echte" Endung: `.env.example`, `.env.production.example`. */
const ENV_EXAMPLE = /^\.env(\..+)?\.example$/

/** Der Byte-Wert des gesuchten Zeichens — bewusst als Zahl, nie als Literal. */
const NUL = 0
const NEWLINE = 0x0a

function isTextFile(path) {
  const name = basename(path)
  if (ENV_EXAMPLE.test(name)) return true
  const ext = extname(name).slice(1).toLowerCase()
  return TEXT_EXTENSIONS.has(ext)
}

function gitList(args) {
  const out = execFileSync('git', ['ls-files', '-z', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return out.split('\u0000').filter(Boolean)
}

const files = [...new Set([
  ...gitList([]),
  ...gitList(['--others', '--exclude-standard']),
])].filter(isTextFile).sort()

const findings = []
let checked = 0
for (const rel of files) {
  const full = join(ROOT, rel)
  // Gelöscht, aber noch im Index (oder ein Submodul-Verzeichnis): überspringen.
  if (!existsSync(full) || !statSync(full).isFile()) continue
  checked++
  const buf = readFileSync(full)
  if (!buf.includes(NUL)) continue
  let line = 1
  let reported = 0
  for (const byte of buf) {
    if (byte === NEWLINE) {
      line++
      reported = 0
    }
    else if (byte === NUL && reported !== line) {
      findings.push(`${rel}:${line}`)
      reported = line
    }
  }
}

if (findings.length > 0) {
  console.error('✖ Literales NUL-Byte (0x00) in Text-Quelldateien:\n')
  for (const where of findings) console.error(`  ${where}`)
  console.error(`
Eine Datei mit NUL-Byte gilt für git als binär: ihr Diff ist in keinem Review
sichtbar. Beheben: das Zeichen im Code als Escape \`\\u0000\` schreiben (in
String- und Template-Literalen zur Laufzeit dasselbe Zeichen), z. B.
  perl -pi -e 's/\\x00/\\\\u0000/g' <datei>
und danach jede ersetzte Stelle mit \`git diff --text\` prüfen.`)
  process.exit(1)
}

console.log(`✔ NUL-Byte-Check: ${checked} Text-Dateien geprüft, kein literales NUL`)
