import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { layerInventory, layersWithMigrations, readMigrationSource } from '../../../scripts/lib/migration-inventory.mjs'
import { isPersonColumn, userDataDutyProblems } from '../../../scripts/lib/user-data-duty.mjs'
import {
  USER_DATA_BUCKETS,
  USER_DATA_TABLES,
  type BucketCoverage,
  type Coverage,
  type Direction,
} from './support/userDataTables'

/**
 * JEDE TABELLE HAT EINE ENTSCHEIDUNG (GA1 P14, SEC-015/SEC-026) — und seit
 * GA1 P20 (OPS-012) kommen die Tabellen aus den MIGRATIONEN selbst, nicht mehr
 * aus einer von Hand gepflegten Soll-Liste.
 *
 * Der Test hält die Liste `support/userDataTables.ts` gegen vier Dinge:
 *  1. die Tabellen, die die Migrationen aller Layer anlegen (plus die
 *     Tabellen aus den Anlege-Skripten der Apps) — eine neue Tabelle ohne
 *     Eintrag wird rot, ein Eintrag ohne Tabelle auch. Ein NEUER Layer ist
 *     damit von selbst dabei;
 *  2. die Dateien, die die Liste nennt — sie müssen die Tabelle wirklich
 *     nennen (wörtlich oder über ihre Konstante);
 *  3. die Ablagen aus Migrationen und Bootstrap-Skripten;
 *  4. die LÖSCH-PFLICHT je Layer (`scripts/lib/user-data-duty.mjs`, dieselbe
 *     Funktion fährt `pnpm check:manifests`): Manifest `userData`, Beitrag im
 *     Dateibaum, Personen-Spalten aus den Migrationen.
 *
 * Er prüft, DASS eine Tabelle in Export und Löschung vorkommt, nicht, dass
 * der Beitrag das Richtige mit ihr tut — das belegen die Tests der Layer
 * (`*UserData*.test.ts`). Eine neue SPALTE mit Personenbezug an einer Tabelle,
 * die „keine Personendaten" trägt, sieht er seit P20 — sofern sie wie eine
 * Person HEISST (Regel im Kopf von `user-data-duty.mjs`).
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
  const tables = new Set<string>()
  for (const match of source.matchAll(/const [A-Z_]+_TABLES = \[([\s\S]*?)\]/g)) {
    for (const literal of match[1]!.matchAll(/'([a-z0-9_]+)'/g)) tables.add(literal[1]!)
  }
  return tables
}

/** Tabellen und Spalten je Layer, gelesen aus den Migrationen. */
function migrationInventory() {
  const layers = new Map<string, ReturnType<typeof layerInventory>>()
  for (const layer of layersWithMigrations(ROOT)) layers.set(layer, layerInventory(ROOT, layer))
  return layers
}

/** Tabellen, die ein Skript einer APP anlegt (heute: `intro_requests`, apps/portfolio). */
function appScriptTables(): Set<string> {
  const tables = new Set<string>()
  for (const app of readdirSync(join(ROOT, 'apps'))) {
    for (const file of walk(join(ROOT, 'apps', app, 'scripts'))) {
      for (const event of readMigrationSource(readFileSync(file, 'utf8')).events) {
        if (event.kind === 'create' && !event.column) tables.add(event.table)
      }
    }
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
  const inventory = migrationInventory()
  const layerTables = new Set([...inventory.values()].flatMap(layer => [...layer.tables.keys()]))
  const appTables = appScriptTables()
  const tables = new Set([...layerTables, ...appTables])
  const constants = constantNames()

  it('die Migrationen sind lesbar: keine unverstandene Stelle, und die Liste ist nicht leer', () => {
    expect([...inventory.values()].flatMap(layer => layer.unresolved)).toEqual([])
    expect(tables.size).toBeGreaterThan(80)
    expect(tables.has('brand_checks')).toBe(true)
    expect(tables.has('invite_codes')).toBe(true)
    expect(appTables.has('intro_requests')).toBe(true)
  })

  it('die Soll-Listen der Schema-Parität nennen genau die Tabellen der Migrationen', () => {
    // `verify-schema-parity.mjs` führt sein Soll von Hand (welche Tabelle auf
    // welcher Instanz) — eine neue Tabelle, die dort fehlt, prüfte der
    // tägliche Wächter nie. Wer hier rot sieht: die Tabelle in ihren
    // Layer-Block im Skript eintragen (bzw. dort streichen).
    const soll = sollTables()
    expect([...layerTables].filter(table => !soll.has(table)).sort(), 'von einer Migration angelegt, fehlt im Soll von scripts/ops/verify-schema-parity.mjs').toEqual([])
    expect([...soll].filter(table => !layerTables.has(table)).sort(), 'steht im Soll von scripts/ops/verify-schema-parity.mjs, aber keine Migration legt sie (mehr) an').toEqual([])
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

describe('Lösch-Pflicht je Layer: Manifest, Beitrag und Migrationen passen zusammen (OPS-012)', () => {
  const columns = (...names: string[]) => new Set(names)
  const layer = (over: Partial<Parameters<typeof userDataDutyProblems>[0]['layers'][number]>) => ({
    key: 'neu',
    userData: true,
    hasContributor: true,
    tables: new Map<string, Set<string>>(),
    touched: new Map<string, Set<string>>(),
    ...over,
  })
  const run = (layers: ReturnType<typeof layer>[], registry: Record<string, Coverage> = {}, exceptions: { table: string, column: string, reason: string }[] = []) =>
    userDataDutyProblems({ layers, registry, exceptions })

  it('erkennt Personen-Spalten am Namen — und lässt Sach-Spalten in Ruhe', () => {
    for (const name of ['userId', 'authorId', 'ownerId', 'recipientId', 'redeemedByUserId', 'createdBy', 'invitedBy', 'createdByName', 'email', 'emailLower', 'reporterEmail', 'ip', 'ipHash', 'handle', 'authorName', 'stripeCustomerId', 'phone']) {
      expect(isPersonColumn(name), name).toBe(true)
    }
    for (const name of ['communityId', 'postId', 'profileId', 'targetId', 'name', 'title', 'tokenHash', 'inputHash', 'standby', 'priceId', 'runId', 'sessionId', 'ownerType', 'targetName', 'communityName']) {
      expect(isPersonColumn(name), name).toBe(false)
    }
  })

  it('GEGENPROBE: ein erfundener Layer mit einer Tabelle voller Personen-Spalten und ohne Beitrag ist rot', () => {
    const problems = run([layer({
      key: 'gästebuch',
      userData: true,
      hasContributor: false,
      tables: new Map([['guestbook_entries', columns('communityId', 'userId', 'authorName', 'email', 'ipHash', 'body')]]),
    })])
    expect(problems).toHaveLength(2)
    expect(problems[0]).toContain('server/plugins/user-data.ts fehlt')
    expect(problems[1]).toContain('guestbook_entries')
    expect(problems[1]).toContain('userId, authorName, email, ipHash')
    expect(problems[1]).toContain('kein Eintrag in packages/core/tests/support/userDataTables.ts')
  })

  it('GEGENPROBE: derselbe Layer, der im Manifest „keine Nutzerdaten" behauptet, ist ebenfalls rot', () => {
    const problems = run([layer({
      key: 'gästebuch',
      userData: false,
      hasContributor: false,
      tables: new Map([['guestbook_entries', columns('userId', 'email', 'body')]]),
    })])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('`userData: false`, aber die Migrationen des Layers legen Spalten mit Personenbezug an: „guestbook_entries" (userId, email)')
  })

  it('GEGENPROBE: eine neue Personen-Spalte an einer Tabelle mit „keine Personendaten" ist rot', () => {
    const problems = run(
      [layer({ key: 'pages', tables: new Map([['pages', columns('slug', 'title', 'updatedBy')]]) })],
      { pages: 'none' },
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('steht „keine Personendaten" (NONE)')
    expect(problems[0]).toContain('updatedBy')
  })

  it('GEGENPROBE: eine Personen-Spalte an der Tabelle eines ANDEREN Layers zählt mit', () => {
    const problems = run([layer({ key: 'admin', userData: false, hasContributor: false, touched: new Map([['app_config', columns('ownerId')]]) })])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('app_config')
  })

  it('`userData: false` und trotzdem ein registrierter Beitrag: das Manifest lügt', () => {
    const problems = run([layer({ userData: false, hasContributor: true })])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('auf `userData: true` stellen')
  })

  it('in Ordnung: Beitrag da, Tabelle mit Personen-Spalte hat eine Entscheidung', () => {
    expect(run(
      [layer({ tables: new Map([['notes', columns('userId', 'body')], ['note_tags', columns('noteId', 'tag')]]) })],
      { notes: { export: 'x.ts', erase: 'x.ts' } },
    )).toEqual([])
  })

  it('eine begründete Ausnahme auf Spalten-Ebene greift; ohne Grund oder ohne Spalte ist sie rot', () => {
    const reason = 'Handle eines öffentlichen Kanals, vom Betreiber eingetragen — keine Person.'
    const channels = layer({ userData: false, hasContributor: false, tables: new Map([['channels', columns('handle', 'title')]]) })
    expect(run([channels], {}, [{ table: 'channels', column: 'handle', reason }])).toEqual([])
    expect(run([channels], {}, [{ table: 'channels', column: 'handle', reason: 'egal' }])[0]).toContain('ohne tragfähigen Grund')
    expect(run([layer({})], {}, [{ table: 'channels', column: 'handle', reason }])[0]).toContain('nimmt nichts mehr aus')
  })
})
