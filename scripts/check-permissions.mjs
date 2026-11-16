/**
 * Wächter für die Rechte an Appwrite-Ablagen (SEC-001).
 *
 * Die Regel: Appwrite ist unter eigener Adresse direkt erreichbar. Ein Recht
 * für Konten (`users`, `any`, ein Label …) an einem BUCKET gilt deshalb neben
 * unseren Routen — und was eine Route prüft (Typ, Größe, Magic Bytes), prüft
 * Appwrite an dieser Stelle nicht. Buckets tragen darum KEIN Schreibrecht;
 * geschrieben wird vom Server mit dem Admin-Client nach seinen Prüfungen.
 * Leserechte am Bucket bleiben erlaubt (z. B. `read("any")` für Schriften).
 *
 * Geprüft wird jede Bucket-Definition in `packages/<layer>/scripts/migrations/
 * *.ts` und im EINEN Bootstrap-Skript `scripts/bootstrap.mjs` (seit BE-026,
 * 2026-11-15; vorher je App eine Kopie unter `apps/<app>/scripts/`). Eine Bucket-Definition ist ein
 * Objekt-Literal mit dem Schlüssel `fileSecurity` (Tabellen tragen
 * `rowSecurity`). Ihr `permissions`-Feld muss als Array-Literal lesbar sein und
 * darf kein `create(`/`update(`/`delete(`/`write(` enthalten — weder als
 * String noch als `Permission.create(…)`. Fehlt es oder ist es nicht lesbar
 * (Variable, Spread), ist das ebenfalls ein Fehler: was der Wächter nicht
 * lesen kann, kann er nicht freigeben.
 *
 * STUFE 2 — TABELLEN, DIE NUR DER SERVER SCHREIBT (SEC-002, GA1 P13). Für jede
 * Tabelle aus `scripts/lib/server-written-tables.mjs`, die eine Rechte-
 * Migration nennt (`rights.migration`):
 *  - diese Migration gibt es, und sie nimmt das Schreib-Recht der Tabelle
 *    (`dropAccountWriteRight`);
 *  - KEIN `updateTable` in irgendeiner Migration setzt für die Tabelle ein
 *    Schreib-Recht (so ein Aufruf setzt absolut und öffnete die Tabelle bei
 *    jedem vollen Lauf wieder);
 *  - kein `createTable` in einer JÜNGEREN Migration legt sie mit Schreib-Recht
 *    an. Die ursprüngliche Anlage in einer älteren Migration bleibt stehen —
 *    sie läuft nur auf einer leeren Instanz, und die Rechte-Migration folgt
 *    im selben Lauf.
 * Der Rückweg (`packages/<layer>/scripts/rollback/`) liegt außerhalb und wird
 * nicht geprüft: er setzt das Recht mit Absicht.
 *
 * Ausnahmen stehen in `ALLOWED` (Datei + Bucket + Begründung) und gelten nur,
 * wenn die Definition zusätzlich eine nicht-leere `allowedFileExtensions`
 * trägt. Die Liste ist bewusst leer.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SERVER_WRITTEN_TABLES } from './lib/server-written-tables.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** @type {{ file: string, bucket: string, reason: string }[]} */
const ALLOWED = []

function listFiles() {
  const files = []
  const packages = join(ROOT, 'packages')
  if (existsSync(packages)) {
    for (const entry of readdirSync(packages, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(packages, entry.name, 'scripts', 'migrations')
      if (!existsSync(dir)) continue
      for (const name of readdirSync(dir)) {
        if (name.endsWith('.ts')) files.push(join(dir, name))
      }
    }
  }
  // Das Bootstrap-Skript MUSS da sein: fehlte es still, sähe der Wächter
  // seine Buckets nie und wäre trotzdem grün.
  const bootstrap = join(ROOT, 'scripts', 'bootstrap.mjs')
  if (!existsSync(bootstrap)) {
    console.error('✖ scripts/bootstrap.mjs fehlt — der Wächter kann dessen Buckets nicht prüfen.')
    process.exit(1)
  }
  files.push(bootstrap)
  return files.sort()
}

/**
 * Zwei Masken derselben Länge (Zeilenumbrüche bleiben, damit Positionen und
 * Zeilennummern stimmen):
 *  - `code`: Kommentare UND Zeichenketten-Inhalte durch Leerzeichen ersetzt —
 *    zum Zählen von Klammern und Finden von Schlüsseln;
 *  - `noComments`: nur Kommentare ersetzt — zum Lesen der Rechte-Strings.
 */
function mask(source) {
  const code = source.split('')
  const noComments = source.split('')
  const blank = (arr, from, to) => {
    for (let k = from; k < to; k++) if (arr[k] !== '\n') arr[k] = ' '
  }
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]
    if (ch === '/' && next === '/') {
      const end = source.indexOf('\n', i)
      const stop = end === -1 ? source.length : end
      blank(code, i, stop)
      blank(noComments, i, stop)
      i = stop
    }
    else if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      blank(code, i, stop)
      blank(noComments, i, stop)
      i = stop
    }
    else if (ch === '\'' || ch === '"' || ch === '`') {
      let j = i + 1
      while (j < source.length && source[j] !== ch) {
        if (source[j] === '\\') j++
        j++
      }
      blank(code, i + 1, j)
      i = j + 1
    }
    else {
      i++
    }
  }
  return { code: code.join(''), noComments: noComments.join('') }
}

function lineOf(text, index) {
  let line = 1
  for (let k = 0; k < index; k++) if (text[k] === '\n') line++
  return line
}

/** Grenzen des innersten Objekt-Literals um `index` (Klammern im maskierten Code). */
function enclosingObject(code, index) {
  let depth = 0
  let start = -1
  for (let k = index; k >= 0; k--) {
    if (code[k] === '}') depth++
    else if (code[k] === '{') {
      if (depth === 0) {
        start = k
        break
      }
      depth--
    }
  }
  if (start === -1) return null
  depth = 0
  for (let k = start; k < code.length; k++) {
    if (code[k] === '{') depth++
    else if (code[k] === '}') {
      depth--
      if (depth === 0) return { start, end: k + 1 }
    }
  }
  return null
}

/** Wert eines Schlüssels im Objekt-Block: Text bis zum nächsten Komma/Ende auf gleicher Tiefe. */
function valueOf(code, noComments, block, key) {
  const pattern = new RegExp(`(?<![\\w.$])${key}\\s*:`, 'g')
  const slice = code.slice(block.start, block.end)
  let match
  while ((match = pattern.exec(slice)) !== null) {
    // Nur Schlüssel auf der obersten Ebene des Blocks zählen
    let depth = 0
    for (let k = block.start; k < block.start + match.index; k++) {
      const c = code[k]
      if (c === '{' || c === '[' || c === '(') depth++
      else if (c === '}' || c === ']' || c === ')') depth--
    }
    if (depth !== 1) continue
    const from = block.start + match.index + match[0].length
    let k = from
    let level = 0
    while (k < block.end - 1) {
      const c = code[k]
      if (c === '{' || c === '[' || c === '(') level++
      else if (c === '}' || c === ']' || c === ')') level--
      else if (c === ',' && level === 0) break
      k++
    }
    return {
      index: block.start + match.index,
      code: code.slice(from, k).trim(),
      text: noComments.slice(from, k).trim(),
    }
  }
  return null
}

function literalString(value) {
  const m = value?.text.match(/^(['"`])(.*)\1$/s)
  return m ? m[2] : null
}

const WRITE_RIGHT = /(?<![\w$])(?:Permission\s*\.\s*)?(create|update|delete|write)\s*\(/
/** Bezeichner, die in einem lesbaren Rechte-Literal vorkommen dürfen. */
const READABLE_IDENTIFIERS = new Set(['Permission', 'Role', 'read', 'any', 'users', 'user', 'guests', 'label', 'team', 'member', 'create', 'update', 'delete', 'write'])

function checkPermissions(perm) {
  if (!perm) return { error: 'kein `permissions`-Feld' }
  if (!perm.code.startsWith('[') || !perm.code.endsWith(']')) {
    return { error: `\`permissions\` ist kein Array-Literal (\`${perm.text.replace(/\s+/g, ' ').slice(0, 60)}\`)` }
  }
  if (perm.code.includes('...')) return { error: '`permissions` enthält einen Spread und ist nicht lesbar' }
  for (const identifier of perm.code.match(/[A-Za-z_$][\w$]*/g) ?? []) {
    if (!READABLE_IDENTIFIERS.has(identifier)) {
      return { error: `\`permissions\` enthält den Bezeichner \`${identifier}\` und ist nicht lesbar` }
    }
  }
  const write = perm.text.match(WRITE_RIGHT)
  if (write) return { error: `Schreibrecht \`${write[0].replace(/\s+/g, '')}…\` in \`permissions: ${perm.text.replace(/\s+/g, ' ')}\`` }
  return { error: null }
}

const findings = []
let checked = 0
/** @type {Map<string, number>} */
const perFile = new Map()

for (const file of listFiles()) {
  const rel = relative(ROOT, file)
  const source = readFileSync(file, 'utf8')
  const { code, noComments } = mask(source)
  const keyPattern = /(?<![\w.$])fileSecurity\s*:/g
  const seen = new Set()
  let match
  while ((match = keyPattern.exec(code)) !== null) {
    const block = enclosingObject(code, match.index)
    if (!block || seen.has(block.start)) continue
    seen.add(block.start)
    checked++
    perFile.set(rel, (perFile.get(rel) ?? 0) + 1)

    const bucket = literalString(valueOf(code, noComments, block, 'bucketId'))
      ?? literalString(valueOf(code, noComments, block, 'name'))
      ?? valueOf(code, noComments, block, 'bucketId')?.text
      ?? '?'
    const perm = valueOf(code, noComments, block, 'permissions')
    const { error } = checkPermissions(perm)
    if (!error) continue

    const extensions = valueOf(code, noComments, block, 'allowedFileExtensions')
    const hasExtensions = Boolean(extensions && /^\[\s*\S/.test(extensions.code) && extensions.code !== '[]')
    const allowed = ALLOWED.find(entry => entry.file === rel && entry.bucket === bucket)
    if (allowed && hasExtensions) continue

    const line = lineOf(source, perm ? perm.index : block.start)
    findings.push(`${rel}:${line}  Bucket '${bucket}': ${error}`)
  }
}

if (findings.length > 0) {
  console.error('✖ Bucket mit Schreibrecht oder unlesbaren Rechten:\n')
  for (const finding of findings) console.error(`  ${finding}`)
  console.error(`
Appwrite ist unter eigener Adresse direkt erreichbar: ein Recht am Bucket gilt
neben jeder Route und ihren Prüfungen. Buckets tragen deshalb kein Schreibrecht
(\`permissions: []\` oder nur Leserechte, als Array-Literal); geschrieben wird
vom Server mit dem Admin-Client nach seinen Prüfungen.`)
  process.exit(1)
}

// ── Stufe 2: Tabellen, die nur der Server schreibt ────────────────────────
const tableFindings = []
let tableDefinitions = 0
const guarded = SERVER_WRITTEN_TABLES.filter(entry => entry.rights)

function migrationFilesOf(layer) {
  const dir = join(ROOT, 'packages', layer, 'scripts', 'migrations')
  return existsSync(dir) ? readdirSync(dir).filter(name => /^\d{3}-.*\.ts$/.test(name)).map(name => ({ name, path: join(dir, name) })) : []
}

/** `tableId: 'x'` oder `tableId: X` mit `const X = 'x'` in derselben Datei. */
function tableIdOf(code, noComments, block) {
  const value = valueOf(code, noComments, block, 'tableId')
  const literal = literalString(value)
  if (literal) return literal
  const name = value?.text.match(/^[A-Za-z_$][\w$]*$/)?.[0]
  if (!name) return null
  return noComments.match(new RegExp(`const\\s+${name}\\s*=\\s*(['"\`])([^'"\`]+)\\1`))?.[2] ?? null
}

for (const entry of guarded) {
  const own = migrationFilesOf(entry.layer).find(file => file.name.startsWith(`${entry.rights.migration}-`))
  const drops = own && new RegExp(`dropAccountWriteRight\\(\\s*tablesDB\\s*,\\s*databaseId\\s*,\\s*'${entry.table}'`).test(mask(readFileSync(own.path, 'utf8')).noComments)
  if (!drops) tableFindings.push(`packages/${entry.layer}/scripts/migrations/${entry.rights.migration}-*.ts  Tabelle '${entry.table}': die Rechte-Migration fehlt oder nimmt das Schreib-Recht nicht (dropAccountWriteRight)`)
}

if (guarded.length > 0) {
  for (const file of listFiles().filter(path => path.includes(join('scripts', 'migrations')))) {
    const rel = relative(ROOT, file)
    const [, layer, number] = rel.match(/^packages\/([^/]+)\/scripts\/migrations\/(\d{3})-/) ?? []
    const source = readFileSync(file, 'utf8')
    const { code, noComments } = mask(source)
    const keyPattern = /(?<![\w.$])rowSecurity\s*:/g
    const seen = new Set()
    let match
    while ((match = keyPattern.exec(code)) !== null) {
      const block = enclosingObject(code, match.index)
      if (!block || seen.has(block.start)) continue
      seen.add(block.start)
      const entry = guarded.find(candidate => candidate.table === tableIdOf(code, noComments, block))
      if (!entry) continue
      tableDefinitions++
      const call = code.slice(Math.max(0, block.start - 40), block.start).match(/(createTable|updateTable)\s*\(\s*$/)?.[1]
      const perm = valueOf(code, noComments, block, 'permissions')
      const { error } = checkPermissions(perm)
      if (!error) continue
      const original = call === 'createTable' && layer === entry.layer && number < entry.rights.migration
      if (original) continue
      tableFindings.push(`${rel}:${lineOf(source, perm ? perm.index : block.start)}  Tabelle '${entry.table}' (${call ?? 'unbekannter Aufruf'}): ${error}`)
    }
  }
}

if (tableFindings.length > 0) {
  console.error('✖ Tabelle, die nur der Server schreibt, mit Schreibrecht oder unlesbaren Rechten:\n')
  for (const finding of tableFindings) console.error(`  ${finding}`)
  console.error(`
Diese Tabellen schreibt nur der Server (scripts/lib/server-written-tables.mjs):
kein Schreib-Recht an der Tabelle, weder für Konten noch für Labels. Das
Tabellenrecht besitzt die dort genannte Rechte-Migration; ältere Migrationen
setzen es nicht mehr, jüngere legen es nicht wieder an.`)
  process.exit(1)
}

// Sichtbar machen, dass das Bootstrap-Skript wirklich gelesen wurde: null
// Definitionen dort hieße, der Wächter läuft an seinen Buckets vorbei.
const bootstrapCount = perFile.get(join('scripts', 'bootstrap.mjs')) ?? 0
if (bootstrapCount === 0) {
  console.error('✖ scripts/bootstrap.mjs: keine Bucket-Definition gefunden — der Wächter sieht dessen Buckets nicht.')
  process.exit(1)
}
console.log(`✔ Ablagen-Rechte: ${checked} Bucket-Definitionen geprüft (davon ${bootstrapCount} in scripts/bootstrap.mjs), kein Schreibrecht`)
console.log(`✔ Tabellen-Rechte: ${guarded.length} Tabellen, die nur der Server schreibt, ${tableDefinitions} Definitionen geprüft`)
