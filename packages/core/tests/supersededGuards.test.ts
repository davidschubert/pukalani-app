import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { layersWithMigrations, migrationFiles, readMigrationSource, stripComments } from '../../../scripts/lib/migration-inventory.mjs'

/**
 * PB1 c (2026-11-18): der Runner führt kein Register und fährt bei einem
 * vollen Lauf JEDE Migration erneut. Legt eine alte Migration eine Spalte,
 * einen Index oder eine Tabelle an, die eine spätere wieder entfernt, wurde
 * sie bei jedem vollen Lauf angelegt und wieder gelöscht (lokal gemessen: 39
 * Spalten-Paare in neun Layern, im Control Plane ganze Tabellen, dazu
 * überschriebene Plan-Zeilen und Unique-Indizes, die im Pool scheitern
 * würden).
 *
 * Dieser Wächter liest die Paare „angelegt in N, entfernt in M > N, am Ende
 * nicht mehr da" aus dem Quelltext und verlangt für jedes eine NACHFOLGER-
 * WACHE in der anlegenden Datei — einen Aufruf
 * `superseded({ table, column | index }, nachfolger, kette)` aus
 * `scripts/migrations-lib/supersededGuard.mts`, der genau diese Sache nennt —
 * oder einen Eintrag mit Grund in `OPEN_PAIRS`. Die Liste ist zugleich die
 * ehrliche Liste der offenen Stellen; ein Eintrag, den es nicht mehr braucht,
 * macht den Wächter rot.
 *
 * Was er NICHT sieht: Löschungen mit berechnetem Schlüssel (`deleteIndex` in
 * einer Schleife über alle tenantId-Indizes). Die fallen mit der Spalte — ihre
 * Wache ist die Wache der Spalte. Ob die Wache an der RICHTIGEN Stelle der
 * Datei steht und die richtige Bedingung prüft, beweist erst ein zweiter
 * voller Lauf ohne „✔"-Zeile für Anlegen/Löschen.
 */

const ROOT = resolve(__dirname, '../../..')

/** Paare, die bewusst OHNE Wache bleiben — Schlüssel `datei · sache`, Wert = Grund. */
const OPEN_PAIRS: Record<string, string> = {}

type Thing = { kind: 'table', table: string } | { kind: 'column', table: string, column: string } | { kind: 'index', table: string, key: string, columns: string[] }
interface Guard { table: string | '*', column?: string, index?: string }

function balanced(source: string, open: number): string {
  let depth = 0
  let quote: string | null = null
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i]
    if (quote) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') quote = ch
    else if (ch === '(' || ch === '{' || ch === '[') depth += 1
    else if (ch === ')' || ch === '}' || ch === ']') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  return source.slice(open + 1)
}

/** `const NAME = 'wert'` der Datei — mehr löst dieser Leser nicht auf. */
function constants(source: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const m of source.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*'([^'\n]*)'/g)) map.set(m[1]!, m[2]!)
  return map
}

function property(body: string, name: string, consts: Map<string, string>): string | null | '*' {
  const explicit = body.match(new RegExp(`(?:^|[\\s,{])${name}\\s*:\\s*('([^']*)'|[A-Za-z_$][\\w$]*)`))
  if (explicit) return explicit[2] ?? consts.get(explicit[1]!) ?? '*'
  if (new RegExp(`(?:^|[\\s,{])${name}\\s*(?:,|$)`).test(body)) return '*' // Kurzschreibweise `{ table, … }`
  return null
}

/** Das erste Objekt-Literal der Argumente — `{` in einer Zeichenkette (`${TABLE}`) zählt nicht. */
function firstObject(args: string): string | null {
  let quote: string | null = null
  for (let i = 0; i < args.length; i += 1) {
    const ch = args[i]
    if (quote) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') quote = ch
    else if (ch === '{') return balanced(args, i)
  }
  return null
}

function calls(source: string, name: string): string[] {
  return [...source.matchAll(new RegExp(`(?<![\\w$])${name}\\s*\\(`, 'g'))]
    .map(m => balanced(source, m.index! + m[0].length - 1))
}

interface IndexEvent { kind: 'create' | 'drop', table: string, key: string, columns: string[] }

function indexEvents(source: string): IndexEvent[] {
  const consts = constants(source)
  const out: (IndexEvent & { at: number })[] = []
  for (const name of ['indexStep', 'createIndex', 'deleteIndex']) {
    for (const m of source.matchAll(new RegExp(`(?<![\\w$])${name}\\s*\\(`, 'g'))) {
      const body = firstObject(balanced(source, m.index! + m[0].length - 1))
      if (!body) continue
      const table = property(body, 'tableId', consts)
      const key = property(body, 'key', consts)
      if (!table || table === '*' || !key || key === '*') continue
      const columns = [...(body.match(/columns\s*:\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(c => c[1]!)
      out.push({ at: m.index!, kind: name === 'deleteIndex' ? 'drop' : 'create', table, key, columns })
    }
  }
  return out.sort((a, b) => a.at - b.at).map(({ at: _at, ...event }) => event)
}

function guards(source: string): Guard[] {
  const consts = constants(source)
  return calls(source, 'superseded').flatMap((args) => {
    const body = firstObject(args)
    if (!body) return []
    const table = property(body, 'table', consts)
    if (!table) return []
    return [{ table, column: property(body, 'column', consts) ?? undefined, index: property(body, 'index', consts) ?? undefined } as Guard]
  })
}

const describeThing = (thing: Thing) =>
  thing.kind === 'table' ? `Table ${thing.table}` : thing.kind === 'column' ? `${thing.table}.${thing.column}` : `${thing.table}#${thing.key}`

function covers(guard: Guard, thing: Thing): boolean {
  if (guard.table !== '*' && guard.table !== thing.table) return false
  const whole = !guard.column && !guard.index
  if (thing.kind === 'table') return whole
  if (thing.kind === 'column') return whole || guard.column === thing.column
  return whole || guard.index === thing.key || (!!guard.column && thing.columns.includes(guard.column))
}

interface Pair { file: string, thing: Thing, droppedIn: string, guarded: boolean }

/** Alle Paare eines Layers — `read` ist austauschbar für die Gegenprobe. */
function pairsOf(layer: string, read: (file: string) => string): Pair[] {
  const files = migrationFiles(ROOT, layer).map(({ rel, file }) => {
    const raw = read(file)
    const source = stripComments(raw)
    return { rel, source, events: readMigrationSource(raw).events, indexes: indexEvents(source), guards: guards(source) }
  })
  type Step = { file: number, drop: boolean, thing: Thing }
  const steps: Step[] = []
  files.forEach((entry, file) => {
    for (const event of entry.events) {
      const thing: Thing = event.column ? { kind: 'column', table: event.table, column: event.column } : { kind: 'table', table: event.table }
      steps.push({ file, drop: event.kind === 'drop', thing })
    }
    for (const event of entry.indexes) {
      steps.push({ file, drop: event.kind === 'drop', thing: { kind: 'index', table: event.table, key: event.key, columns: event.columns } })
    }
  })

  // Endstand nach allen Dateien: was steht am Ende noch?
  const tables = new Set<string>()
  const columns = new Set<string>()
  const indexes = new Map<string, string[]>()
  for (const { drop, thing } of steps) {
    if (thing.kind === 'table') {
      if (drop) {
        tables.delete(thing.table)
        for (const key of [...columns]) if (key.startsWith(`${thing.table}.`)) columns.delete(key)
        for (const key of [...indexes.keys()]) if (key.startsWith(`${thing.table}#`)) indexes.delete(key)
      }
      else tables.add(thing.table)
    }
    else if (thing.kind === 'column') {
      if (drop) {
        columns.delete(`${thing.table}.${thing.column}`)
        for (const [key, cols] of [...indexes]) if (key.startsWith(`${thing.table}#`) && cols.includes(thing.column)) indexes.delete(key)
      }
      else columns.add(`${thing.table}.${thing.column}`)
    }
    else if (drop) indexes.delete(`${thing.table}#${thing.key}`)
    else indexes.set(`${thing.table}#${thing.key}`, thing.columns)
  }
  const survives = (thing: Thing) => thing.kind === 'table'
    ? tables.has(thing.table)
    : thing.kind === 'column' ? columns.has(`${thing.table}.${thing.column}`) : indexes.has(`${thing.table}#${thing.key}`)

  const removes = (later: Step, thing: Thing) => {
    if (!later.drop || later.thing.table !== thing.table) return false
    if (later.thing.kind === 'table') return true
    if (thing.kind === 'column') return later.thing.kind === 'column' && later.thing.column === thing.column
    if (thing.kind === 'index') {
      return (later.thing.kind === 'index' && later.thing.key === thing.key)
        || (later.thing.kind === 'column' && thing.columns.includes(later.thing.column))
    }
    return false
  }

  const pairs: Pair[] = []
  const seen = new Set<string>()
  for (const step of steps) {
    if (step.drop || survives(step.thing)) continue
    const id = `${step.file}·${describeThing(step.thing)}`
    if (seen.has(id)) continue
    const later = steps.find(other => other.file > step.file && removes(other, step.thing))
    if (!later) continue
    seen.add(id)
    pairs.push({
      file: files[step.file]!.rel,
      thing: step.thing,
      droppedIn: files[later.file]!.rel.split('/').pop()!,
      guarded: files[step.file]!.guards.some(guard => covers(guard, step.thing)),
    })
  }
  return pairs
}

const pairKey = (pair: Pair) => `${pair.file} · ${describeThing(pair.thing)}`
const readFile = (file: string) => readFileSync(file, 'utf8')
const allPairs = (read: (file: string) => string = readFile) => layersWithMigrations(ROOT).flatMap(layer => pairsOf(layer, read))

describe('Nachfolger-Wachen (PB1 c): kein Anlegen-und-Löschen bei jedem vollen Lauf', () => {
  const pairs = allPairs()

  it('findet die bekannten Ketten überhaupt (sonst prüft der Wächter nichts)', () => {
    const keys = pairs.map(pairKey)
    expect(keys).toContain('packages/system/scripts/migrations/021-activities-tenant.ts · activities.tenantId')
    expect(keys).toContain('packages/system/scripts/migrations/018-app-config-features.ts · app_config.features')
    expect(keys).toContain('packages/control/scripts/migrations/010-tenants.ts · Table tenants')
    expect(keys).toContain('packages/pages/scripts/migrations/001-pages-table.ts · pages#uq_slug_locale')
    // pages-002 löscht `body` und legt ihn als mediumtext neu an — am Ende steht
    // er, das ist kein Paar.
    expect(keys.some(key => key.endsWith('pages.body'))).toBe(false)
  })

  it('jedes Paar trägt eine Wache in der anlegenden Datei oder steht mit Grund in OPEN_PAIRS', () => {
    const open = pairs.filter(pair => !pair.guarded && !(pairKey(pair) in OPEN_PAIRS))
      .map(pair => `${pairKey(pair)} (entfernt in ${pair.droppedIn})`)
    expect(open, [
      'Diese Stellen werden bei jedem vollen Lauf angelegt und wieder entfernt:',
      ...open.map(line => `  ${line}`),
      'Abhilfe: in der anlegenden Datei `superseded({ table, column | index }, nachfolger, kette)`',
      'aus scripts/migrations-lib/supersededGuard.mts — Nachfolger = was die Kette später anlegt und',
      'was danach bleibt, mit Begründung als Kommentar. Geht das nicht sauber: Eintrag in OPEN_PAIRS.',
    ].join('\n')).toEqual([])
  })

  it('keine veraltete Ausnahme in OPEN_PAIRS', () => {
    const needed = new Set(pairs.filter(pair => !pair.guarded).map(pairKey))
    const stale = Object.keys(OPEN_PAIRS).filter(key => !needed.has(key))
    expect(stale, `Veraltete Einträge in OPEN_PAIRS (Paar gibt es nicht mehr oder es ist bewacht):\n  ${stale.join('\n  ')}`).toEqual([])
  })

  it('Gegenprobe: ohne die Wache in system-021 wird der Wächter rot', () => {
    const target = join(ROOT, 'packages/system/scripts/migrations/021-activities-tenant.ts')
    const stripped = allPairs(file => file === target
      ? readFile(file).replace(/superseded\(\{[^}]*\}/g, 'superseded({ table: \'other\' }')
      : readFile(file))
    const pair = stripped.find(p => pairKey(p) === 'packages/system/scripts/migrations/021-activities-tenant.ts · activities.tenantId')
    expect(pair?.guarded).toBe(false)
  })

  it('Gegenprobe: eine Wache für eine ANDERE Spalte deckt das Paar nicht', () => {
    const target = join(ROOT, 'packages/courses/scripts/migrations/001-courses-tables.ts')
    const stripped = allPairs(file => file === target
      ? readFile(file).replace('column: \'entitlementFeature\' }, { table', 'column: \'title\' }, { table')
      : readFile(file))
    const pair = stripped.find(p => pairKey(p) === 'packages/courses/scripts/migrations/001-courses-tables.ts · courses.entitlementFeature')
    expect(pair?.guarded).toBe(false)
  })
})
