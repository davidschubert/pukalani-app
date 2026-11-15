import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  EXTRA_TABLES,
  USER_DATA_BUCKETS,
  USER_DATA_TABLES,
  type BucketCoverage,
  type Coverage,
  type Direction,
} from './support/userDataTables'

/**
 * JEDE TABELLE HAT EINE ENTSCHEIDUNG (GA1 P14, SEC-015/SEC-026).
 *
 * Der Test hält die Liste `support/userDataTables.ts` gegen drei Dinge:
 *  1. die Soll-Tabellen aus `scripts/ops/verify-schema-parity.mjs` — eine
 *     neue Tabelle ohne Eintrag wird rot (und ein Eintrag ohne Tabelle auch);
 *  2. die Dateien, die die Liste nennt — sie müssen die Tabelle wirklich
 *     nennen (wörtlich oder über ihre Konstante);
 *  3. die Ablagen aus Migrationen und Bootstrap-Skripten.
 *
 * Er prüft, DASS eine Tabelle in Export und Löschung vorkommt, nicht, dass
 * der Beitrag das Richtige mit ihr tut — das belegen die Tests der Layer
 * (`*UserData*.test.ts`). Was er NICHT sieht: eine neue SPALTE mit
 * Personenbezug an einer vorhandenen Tabelle.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8')
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** Alle Tabellen aus den `*_TABLES`-Konstanten des Paritäts-Skripts. */
function sollTables(): Set<string> {
  const source = stripComments(read('scripts/ops/verify-schema-parity.mjs'))
  const tables = new Set<string>(EXTRA_TABLES)
  for (const match of source.matchAll(/const [A-Z_]+_TABLES = \[([\s\S]*?)\]/g)) {
    for (const literal of match[1]!.matchAll(/'([a-z0-9_]+)'/g)) tables.add(literal[1]!)
  }
  return tables
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(ts|mts|mjs)$/.test(name)) out.push(path)
  }
  return out
}

function layerDirs(sub: string[]): string[] {
  const dirs: string[] = []
  for (const group of ['packages', 'apps']) {
    const base = join(ROOT, group)
    for (const name of readdirSync(base)) {
      for (const part of sub) dirs.push(join(base, name, part))
    }
  }
  return dirs
}

/** `const NAME = 'tabelle'` ⇒ unter welchen Namen kennt der Code die Tabelle? */
function constantNames(): Map<string, Set<string>> {
  const names = new Map<string, Set<string>>()
  for (const dir of layerDirs(['shared', 'server'])) {
    for (const file of walk(dir)) {
      for (const match of readFileSync(file, 'utf8').matchAll(/const ([A-Z][A-Z0-9_]*) = '([a-z0-9_]+)'/g)) {
        if (!names.has(match[2]!)) names.set(match[2]!, new Set())
        names.get(match[2]!)!.add(match[1]!)
      }
    }
  }
  return names
}

/** Bucket-Ids aus Migrationen, Bootstrap-Skripten und den Konstanten der Layer. */
function knownBuckets(): Set<string> {
  const buckets = new Set<string>()
  const patterns = [/bucketId: '([a-z0-9-]+)'/g, /const [A-Z_]*BUCKET[A-Z_]* = '([a-z0-9-]+)'/g]
  for (const dir of layerDirs(['scripts', 'shared', 'server'])) {
    for (const file of walk(dir)) {
      const source = readFileSync(file, 'utf8')
      for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) buckets.add(match[1]!)
      }
    }
  }
  return buckets
}

type ReadFile = (relative: string) => string | null

function mentions(source: string, needles: string[]): boolean {
  return needles.some(needle => new RegExp(`(^|[^A-Za-z0-9_])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_]|$)`).test(source))
}

function checkDirection(
  label: string,
  direction: Direction,
  needles: string[],
  readFile: ReadFile,
): string | null {
  if (typeof direction === 'object') {
    return direction.skip.trim().length >= 20 ? null : `${label}: ausgenommen ohne tragfähige Begründung`
  }
  const source = readFile(direction)
  if (source === null) return `${label}: Datei fehlt (${direction})`
  return mentions(source, needles) ? null : `${label}: ${direction} nennt die Tabelle nicht (${needles.join(' | ')})`
}

/** Die ganze Prüfung als Funktion — so lässt sie sich mit Gegenproben füttern. */
export function coverageProblems(input: {
  tables: Set<string>
  registry: Record<string, Coverage>
  constants: Map<string, Set<string>>
  readFile: ReadFile
}): string[] {
  const problems: string[] = []
  for (const table of [...input.tables].sort()) {
    if (!(table in input.registry)) problems.push(`${table}: kein Eintrag in userDataTables.ts`)
  }
  for (const [table, coverage] of Object.entries(input.registry)) {
    if (!input.tables.has(table)) {
      problems.push(`${table}: Eintrag ohne Tabelle (umbenannt oder entfernt?)`)
      continue
    }
    if (coverage === 'none') continue
    const needles = [`'${table}'`, ...(input.constants.get(table) ?? [])]
    for (const [direction, value] of [['Export', coverage.export], ['Löschung', coverage.erase]] as const) {
      const problem = checkDirection(`${table} (${direction})`, value, needles, input.readFile)
      if (problem) problems.push(problem)
    }
  }
  return problems
}

const readRepoFile: ReadFile = relative => (existsSync(join(ROOT, relative)) ? read(relative) : null)

describe('Export und Löschung: jede Tabelle hat eine Entscheidung', () => {
  const tables = sollTables()
  const constants = constantNames()

  it('die Soll-Liste ist lesbar und nicht leer', () => {
    expect(tables.size).toBeGreaterThan(80)
    expect(tables.has('brand_checks')).toBe(true)
    expect(tables.has('invite_codes')).toBe(true)
  })

  it('jede Tabelle steht in der Liste, und jede genannte Datei fasst ihre Tabelle an', () => {
    expect(coverageProblems({ tables, registry: USER_DATA_TABLES, constants, readFile: readRepoFile })).toEqual([])
  })

  it('GEGENPROBE: eine neue Tabelle ohne Eintrag wird gemeldet', () => {
    const problems = coverageProblems({
      tables: new Set([...tables, 'brand_newsletter']),
      registry: USER_DATA_TABLES,
      constants,
      readFile: readRepoFile,
    })
    expect(problems).toEqual(['brand_newsletter: kein Eintrag in userDataTables.ts'])
  })

  it('GEGENPROBE: ein Eintrag, dessen Datei die Tabelle nicht nennt, wird gemeldet', () => {
    const problems = coverageProblems({
      tables,
      registry: { ...USER_DATA_TABLES, invite_codes: { export: 'packages/tickets/server/utils/ticketsUserData.ts', erase: 'gibt/es/nicht.ts' } },
      constants,
      readFile: readRepoFile,
    })
    expect(problems).toHaveLength(2)
    expect(problems[0]).toContain('invite_codes (Export)')
    expect(problems[1]).toContain('Datei fehlt')
  })

  it('GEGENPROBE: „ausgenommen" braucht einen Grund, und ein veralteter Eintrag fällt auf', () => {
    const problems = coverageProblems({
      tables,
      registry: { ...USER_DATA_TABLES, communities: { export: { skip: 'so halt' }, erase: { skip: 'so halt' } }, alte_tabelle: 'none' },
      constants,
      readFile: readRepoFile,
    })
    expect(problems.filter(p => p.startsWith('communities'))).toHaveLength(2)
    expect(problems).toContain('alte_tabelle: Eintrag ohne Tabelle (umbenannt oder entfernt?)')
  })
})

describe('Export und Löschung: jede Ablage hat eine Entscheidung', () => {
  const buckets = knownBuckets()

  it('jede Ablage aus Migrationen und Skripten steht in der Liste, und umgekehrt', () => {
    expect([...buckets].filter(bucket => !(bucket in USER_DATA_BUCKETS)).sort()).toEqual([])
    expect(Object.keys(USER_DATA_BUCKETS).filter(bucket => !buckets.has(bucket)).sort()).toEqual([])
  })

  it('jede genannte Datei kennt ihre Ablage, jede Ausnahme hat einen Grund', () => {
    const problems: string[] = []
    for (const [bucket, coverage] of Object.entries(USER_DATA_BUCKETS)) {
      if (coverage === 'none') continue
      const entry: BucketCoverage = coverage
      const needles = [entry.needle ?? `'${bucket}'`]
      for (const [direction, value] of [['Export', entry.export], ['Löschung', entry.erase]] as const) {
        const problem = checkDirection(`${bucket} (${direction})`, value, needles, readRepoFile)
        if (problem) problems.push(problem)
      }
    }
    expect(problems).toEqual([])
  })
})
