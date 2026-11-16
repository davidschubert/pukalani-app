import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { stripComments } from '../../../scripts/lib/migration-inventory.mjs'
import { SERVER_WRITE_EXEMPT, SERVER_WRITTEN_TABLES } from '../../../scripts/lib/server-written-tables.mjs'

/**
 * SEC-002 (GA1 P13): „Der Server schreibt." Für jede Tabelle aus
 * `scripts/lib/server-written-tables.mjs` hält dieser Test am Quelltext fest:
 *
 *  1. Kein Schreibvorgang läuft über die Sitzung des Kontos — jede schreibende
 *     Aufrufstelle hängt an einer Tür mit `as: 'operator'`.
 *  2. Keine Datei, die eine Zeile anlegt, vergibt dabei `update`/`delete` an
 *     ein Konto.
 *
 * Er prüft, WIE geschrieben wird — nicht, ob die Route vorher die richtige
 * Frage stellt. Das halten `participation-guard-routes.test.ts` (jede
 * schreibende Route ruft eine Wache) und die Proben je Paket
 * (`tests/server-writes.test.ts`: ein fremdes Konto ändert und löscht nichts).
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const WRITE_METHODS = ['create', 'update', 'updatePermissions', 'remove', 'increment', 'decrement']

function serverFiles(): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (name.endsWith('.ts')) files.push(path)
    }
  }
  for (const group of ['packages', 'apps']) {
    for (const name of readdirSync(join(ROOT, group))) {
      const server = join(ROOT, group, name, 'server')
      if (existsSync(server)) walk(server)
    }
  }
  return files
}

/** Text des Ausdrucks, der VOR `index` endet (Bezeichner oder Aufruf mit Klammern). */
function receiverBefore(code: string, index: number): string {
  let i = index - 1
  while (i >= 0 && /\s/.test(code[i]!)) i--
  if (code[i] === ')') {
    let depth = 0
    for (; i >= 0; i--) {
      if (code[i] === ')') depth++
      else if (code[i] === '(') { depth--; if (depth === 0) break }
    }
    let start = i
    while (start > 0 && /[\w.$]/.test(code[start - 1]!)) start--
    return code.slice(start, index).trim()
  }
  let start = i + 1
  while (start > 0 && /[\w$]/.test(code[start - 1]!)) start--
  return code.slice(start, i + 1)
}

/** Der Ausdruck hinter `const name =` bis zum Zeilenende (reicht für jede Tür im Repo). */
function declarationOf(code: string, name: string): string | null {
  const match = new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*([^\\n]+)`).exec(code)
  return match ? match[1]! : null
}

/** Liefert eine Hilfsfunktion dieser Datei `name(event)` eine Operator-Tür? */
function helperReturnsOperatorDoor(code: string, name: string): boolean {
  const match = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`).exec(code)
  return !!match && isOperatorDoor(match[1]!)
}

function isOperatorDoor(expression: string): boolean {
  if (!/tenantDb\s*\(/.test(expression)) return false
  // `as` muss FEST 'operator' sein: ein `as: x ? 'operator' : 'member'` ist es nicht.
  return /as:\s*'operator'\s*[,}]/.test(expression)
}

export interface Finding { file: string, line: number, table: string, why: string }

export function sessionWrites(file: string, source: string, tables = SERVER_WRITTEN_TABLES): Finding[] {
  const code = stripComments(source)
  const findings: Finding[] = []
  for (const { table, constant } of tables) {
    const target = `(?:${constant}\\b|'${table}')`
    const pattern = new RegExp(`\\.\\s*(${WRITE_METHODS.join('|')})\\s*(?:<[^>(]*(?:<[^>]*>)?[^>(]*>)?\\s*\\(\\s*${target}`, 'g')
    for (const match of code.matchAll(pattern)) {
      const receiver = receiverBefore(code, match.index)
      const line = code.slice(0, match.index).split('\n').length
      let expression: string | null = receiver
      if (/^[\w$]+$/.test(receiver)) expression = declarationOf(code, receiver)
      if (!expression) {
        findings.push({ file, line, table, why: `Zugang „${receiver}" ist in dieser Datei nicht angelegt (Parameter?)` })
        continue
      }
      const helper = /^([\w$]+)\s*\(\s*event\s*\)$/.exec(expression.trim())
      const ok = isOperatorDoor(expression) || (!!helper && helperReturnsOperatorDoor(code, helper[1]!))
      if (!ok) findings.push({ file, line, table, why: `schreibt über „${expression.trim().slice(0, 80)}" — nicht fest die Operator-Klinke` })
    }
    // Roh an der Tür vorbei: eine Datei, die den Session-Client in die Hand
    // nimmt, schreibt nicht roh in die Tabelle.
    const rawWrite = new RegExp(`(?:createRow|updateRow|deleteRow|upsertRow|incrementRowColumn|decrementRowColumn)\\s*(?:<[^>(]*>)?\\s*\\(\\s*\\{[^}]*tableId:\\s*${target}`)
    if (rawWrite.test(code) && /createSessionClient\s*\(/.test(code)) {
      findings.push({ file, line: 1, table, why: 'schreibt roh in die Tabelle und nimmt den Session-Client in die Hand' })
    }
  }
  return findings
}

export function ownerWriteStamps(file: string, source: string, tables = SERVER_WRITTEN_TABLES): Finding[] {
  const code = stripComments(source)
  const findings: Finding[] = []
  for (const { table, constant } of tables) {
    const creates = new RegExp(`(?:\\.\\s*create\\s*(?:<[^>(]*>)?\\s*\\(\\s*(?:${constant}\\b|'${table}')|createRow[\\s\\S]{0,200}tableId:\\s*(?:${constant}\\b|'${table}'))`).test(code)
    if (!creates) continue
    // `ownerUserId: string` ist eine Typ-Angabe, kein vergebenes Recht.
    for (const match of code.matchAll(/Permission\.(?:update|delete|write)\s*\(|ownerUserId\s*:(?!\s*string\b)/g)) {
      findings.push({ file, line: code.slice(0, match.index).split('\n').length, table, why: `legt Zeilen an und vergibt ein Schreibrecht (${match[0].trim()})` })
    }
  }
  return findings
}

describe('Tabellen, die nur der Server schreibt', () => {
  const files = serverFiles().map(path => ({ file: relative(ROOT, path), source: readFileSync(path, 'utf8') }))
  const exempt = SERVER_WRITE_EXEMPT as Record<string, string>

  it('die Liste passt zu den Konstanten der Layer', () => {
    for (const { table, constant, layer } of SERVER_WRITTEN_TABLES) {
      const dir = join(ROOT, 'packages', layer, 'shared', 'types')
      const declared = readdirSync(dir).some(name =>
        new RegExp(`export const ${constant} = '${table}'`).test(readFileSync(join(dir, name), 'utf8')))
      expect(declared, `${constant} = '${table}' in packages/${layer}/shared/types`).toBe(true)
    }
  })

  it('der Leser sieht die Schreibstellen überhaupt (sonst wäre der Wächter blind)', () => {
    const post = files.find(f => f.file === 'packages/posts/server/api/posts/index.post.ts')!
    expect(sessionWrites(post.file, post.source)).toEqual([])
    // Gegenprobe am selben Quelltext: dieselbe Zeile über die Mitglieder-Klinke fällt auf.
    const viaSession = post.source.replace(/const writer = tenantDb\(event, \{[^}]*\}\)/, 'const writer = tenantDb(event)')
    expect(viaSession).not.toBe(post.source)
    expect(sessionWrites(post.file, viaSession).map(f => f.table)).toEqual(['community_posts'])
    // … und eine Klinke, die nur manchmal der Server ist, ebenso.
    const sometimes = post.source.replace(/const writer = tenantDb\(event, \{[^}]*\}\)/, "const writer = tenantDb(event, { as: flag ? 'operator' : 'member' })")
    expect(sessionWrites(post.file, sometimes)).toHaveLength(1)
    // … und ein vergebenes Schreibrecht beim Anlegen.
    const stamped = post.source.replace('withPublishedRead([], event),', 'withPublishedRead([], event).concat(Permission.update(Role.user(user.$id))),')
    expect(stamped).not.toBe(post.source)
    expect(ownerWriteStamps(post.file, stamped)).toHaveLength(1)
  })

  it('kein Schreibvorgang läuft über die Sitzung des Kontos', () => {
    const found = files.flatMap(f => sessionWrites(f.file, f.source)).filter(f => !(f.file in exempt))
    expect(found.map(f => `${f.file}:${f.line} [${f.table}] ${f.why}`)).toEqual([])
  })

  it('keine Datei, die Zeilen anlegt, vergibt ein Schreibrecht an ein Konto', () => {
    const found = files.flatMap(f => ownerWriteStamps(f.file, f.source)).filter(f => !(f.file in exempt))
    expect(found.map(f => `${f.file}:${f.line} [${f.table}] ${f.why}`)).toEqual([])
  })

  it('keine Ausnahme, die nichts mehr ausnimmt', () => {
    const hit = new Set([
      ...files.flatMap(f => sessionWrites(f.file, f.source)),
      ...files.flatMap(f => ownerWriteStamps(f.file, f.source)),
    ].map(f => f.file))
    expect(Object.keys(exempt).filter(file => !hit.has(file))).toEqual([])
  })
})
