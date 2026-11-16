/**
 * WAS DIE MIGRATIONEN ANLEGEN — gelesen aus den Dateien, nicht aus einer Liste.
 *
 * Mehrere Wächter brauchen dieselbe Antwort: „welche Tabellen und Spalten
 * legt dieser Layer an?" (Lösch-Pflicht, Datentür-Liste, Soll der
 * Schema-Parität). Bis GA1 P20 stand sie in drei von Hand gepflegten Listen;
 * jede hat einmal etwas Neues übersehen (OPS-012). Diese Datei liest sie
 * einmal aus dem Quelltext der Migrationen.
 *
 * WIE: kein TypeScript-Parser (die Migrationen liegen in keiner tsconfig, und
 * `lint:scripts` soll schnell bleiben), sondern der eine Aufruf-Stil, den alle
 * Migrationen teilen:
 *
 *   tablesDB.createTable({ databaseId, tableId: X, … })
 *   tablesDB.create<Art>Column({ databaseId, tableId: X, key: 'spalte', … })
 *   tablesDB.deleteTable({ … tableId: X }) / deleteColumn({ … tableId: X, key })
 *
 * `X` ist ein Literal oder eine Konstante derselben Datei
 * (`const CHECKS = 'brand_checks'`). Alles andere — ein Aufruf in einer
 * Schleife über eine Spalten-Liste, eine Tabelle als Funktions-Argument —
 * löst der Leser über die Werte auf, die in derselben Datei stehen
 * (`tableId`-Parameter ⇒ jede Aufrufstelle mit Literal oder Konstante). Was er
 * NICHT auflösen kann, VERSCHWEIGT er nicht: es steht in `unresolved`, und
 * der Wächter wird rot, bis die Stelle entweder lesbar geschrieben oder mit
 * Grund in `MIGRATION_READ_HINTS` eingetragen ist. Ein Leser, der still
 * weniger sieht, wäre dieselbe blinde Liste in neuem Gewand.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Kommentare raus, Zeichenketten bleiben (Tabellen-Ids sind Zeichenketten). */
export function stripComments(source) {
  let out = ''
  let i = 0
  let quote = null
  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]
    if (quote) {
      out += ch
      if (ch === '\\') {
        out += next ?? ''
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i += 1
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch
      out += ch
      i += 1
      continue
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1
      continue
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? source.length : end + 2
      continue
    }
    out += ch
    i += 1
  }
  return out
}

/** Der Text zwischen der Klammer bei `open` und ihrem Gegenstück. */
function balanced(source, open) {
  let depth = 0
  let quote = null
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

/** Wert einer Eigenschaft auf der OBERSTEN Ebene eines Objekt-Literals. */
function topLevelProperty(body, name) {
  let depth = 0
  let quote = null
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]
    if (quote) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '(' || ch === '{' || ch === '[') depth += 1
    else if (ch === ')' || ch === '}' || ch === ']') depth -= 1
    else if (depth === 0 && body.startsWith(name, i) && !/[A-Za-z0-9_$.]/.test(body[i - 1] ?? ' ')) {
      const after = body.slice(i + name.length)
      const explicit = after.match(/^\s*:\s*/)
      if (explicit) {
        const rest = after.slice(explicit[0].length)
        return rest.match(/^('[^']*'|"[^"]*"|`[^`]*`|[A-Za-z_$][A-Za-z0-9_$.]*)/)?.[1] ?? '?'
      }
      // Kurzschreibweise `{ tableId, key }`
      if (/^\s*(,|$)/.test(after)) return name
    }
  }
  return null
}

const literal = token => token?.match(/^['"`]([^'"`$]*)['"`]$/)?.[1] ?? null

function splitTopLevel(text) {
  const parts = []
  let depth = 0
  let quote = null
  let current = ''
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quote) {
      current += ch
      if (ch === '\\') {
        current += text[i + 1] ?? ''
        i += 1
      }
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') quote = ch
    if (ch === '(' || ch === '{' || ch === '[') depth += 1
    if (ch === ')' || ch === '}' || ch === ']') depth -= 1
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) parts.push(current)
  return parts.map(part => part.trim()).filter(Boolean)
}

/**
 * Die Werte, die ein Name in dieser Datei annehmen kann.
 *  - `scalars`: Name ⇒ Zeichenketten (`const T = 'x'`, Schleifen-Variable
 *    über eine Liste von Zeichenketten, Funktions-Parameter je Aufrufstelle)
 *  - `objects`: Name ⇒ Objekt-Literale (Schleife über `[{ key: 'a' }, …]`),
 *    gelesen über `name.eigenschaft`
 */
function createScope(parent) {
  const scalars = new Map(parent ? [...parent.scalars].map(([name, values]) => [name, [...values]]) : [])
  const objects = new Map(parent ? [...parent.objects].map(([name, values]) => [name, [...values]]) : [])
  const add = (map, name, value) => {
    if (!map.has(name)) map.set(name, [])
    if (!map.get(name).includes(value)) map.get(name).push(value)
  }
  const resolve = (token) => {
    if (!token || token === '?') return []
    const direct = literal(token)
    if (direct !== null) return [direct]
    if (scalars.has(token)) return scalars.get(token)
    const member = token.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\.([A-Za-z_$][A-Za-z0-9_$]*)$/)
    if (member && objects.has(member[1])) {
      return objects.get(member[1]).flatMap(body => resolve(topLevelProperty(body, member[2])))
    }
    return []
  }
  /**
   * Bindet ein Muster (`x`, `{ a, b }`, `[a, b]`) an einen Ausdruck. `from`
   * ist der Scope, in dem der Ausdruck GILT (bei einem Funktions-Aufruf der
   * des Aufrufers) — gebunden wird immer in diesem hier.
   */
  const bind = (pattern, item, from = self) => {
    const p = pattern.trim()
    const value = item.trim()
    if (p.startsWith('{')) {
      const bodies = value.startsWith('{')
        ? [value.slice(1, value.lastIndexOf('}'))]
        : from.objects.get(value) ?? []
      for (const body of bodies) {
        for (const part of splitTopLevel(p.slice(1, p.lastIndexOf('}')))) {
          const [prop, alias] = part.split(':').map(x => x.trim())
          for (const v of from.resolve(topLevelProperty(body, prop))) add(scalars, alias ?? prop, v)
        }
      }
      return
    }
    if (p.startsWith('[')) {
      if (!value.startsWith('[')) return
      const items = splitTopLevel(value.slice(1, value.lastIndexOf(']')))
      splitTopLevel(p.slice(1, p.lastIndexOf(']'))).forEach((name, index) => {
        for (const v of from.resolve(items[index])) add(scalars, name, v)
      })
      return
    }
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(p)) return
    if (value.startsWith('{')) add(objects, p, value.slice(1, value.lastIndexOf('}')))
    else if (from.objects.has(value)) for (const body of from.objects.get(value)) add(objects, p, body)
    else for (const v of from.resolve(value)) add(scalars, p, v)
  }
  /** Namen eines Musters freiräumen — ein Parameter ÜBERDECKT, was außen gleich heißt. */
  const shadow = (pattern) => {
    for (const name of pattern.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? []) {
      scalars.delete(name)
      objects.delete(name)
    }
  }
  const self = { scalars, objects, add, resolve, bind, shadow }
  return self
}

/**
 * Liest EINE Migrations-Datei (samt eingebundener Fabriken aus
 * `scripts/migrations-lib/`, die der Aufrufer in `source` anhängt).
 * @returns {{ events: {kind:'create'|'drop', table:string, column?:string}[], unresolved: string[] }}
 */
export function readMigrationSource(rawSource) {
  const source = stripComments(rawSource)
  const scope = createScope()

  for (const m of source.matchAll(/\bconst\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::\s*string\s*)?=\s*(['"`])([^'"`$\n]*)\2/g)) {
    scope.add(scope.scalars, m[1], m[3])
  }
  // Listen-Konstanten: `const TABLES = ['a', B]`, `const COLS: T[] = [{ key: 'x' }]`
  const arrays = new Map()
  for (const m of source.matchAll(/\bconst\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=\n]+)?=\s*\[/g)) {
    arrays.set(m[1], splitTopLevel(balanced(source, m.index + m[0].length - 1)))
  }

  // Schleifen: `for (const MUSTER of LISTE)` — LISTE ist eine Konstante oder
  // steht an Ort und Stelle.
  for (const loop of source.matchAll(/for\s*\(\s*const\s+/g)) {
    const head = balanced(source, source.indexOf('(', loop.index))
    const split = head.match(/^\s*const\s+([\s\S]+?)\s+of\s+([\s\S]+)$/)
    if (!split) continue
    const expr = split[2].trim()
    const items = expr.startsWith('[')
      ? splitTopLevel(balanced(expr, 0))
      : arrays.get(expr.match(/^[A-Za-z_$][A-Za-z0-9_$]*/)?.[0] ?? '') ?? []
    for (const item of items) scope.bind(split[1], item)
  }

  // Funktionen der Datei: Name, Parameter, Rumpf. Ein Aufruf IN einer
  // Hilfsfunktion zählt an der Stelle, an der die Funktion GERUFEN wird, und
  // mit den Werten dieses einen Aufrufs — sonst stünde `createMediumtext(key)`
  // (oben definiert) vor jedem `deleteColumn` weiter unten, und ein Umbau
  // „Spalte löschen, neu anlegen" sähe aus wie „Spalte gelöscht" (pages-002).
  const functions = []
  const definitions = [
    ...source.matchAll(/\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g),
    ...source.matchAll(/\bconst\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\((?=[^)]*\)\s*(?::[^=]+)?=>)/g),
  ]
  for (const def of definitions) {
    const open = def.index + def[0].length - 1
    const paramsText = balanced(source, open)
    const params = splitTopLevel(paramsText)
      .map(param => (param.startsWith('{') || param.startsWith('[')
        ? param.slice(0, param.lastIndexOf(param.startsWith('{') ? '}' : ']') + 1)
        : param.split(/[:=?\s]/)[0]))
    // Rumpf: die erste `{` hinter den Parametern, außerhalb eines `<…>`-Typs.
    let i = open + paramsText.length + 2
    let angle = 0
    while (i < source.length && !(source[i] === '{' && angle === 0)) {
      if (source[i] === '<') angle += 1
      else if (source[i] === '>' && source[i - 1] !== '=') angle = Math.max(0, angle - 1)
      else if (source[i] === ';' || (source[i] === '\n' && source[i + 1] === '\n')) break
      i += 1
    }
    if (source[i] !== '{') continue
    functions.push({ name: def[1], params, start: i, end: i + balanced(source, i).length + 1, defAt: def.index })
  }
  const ownerOf = (pos) => {
    let owner = null
    for (const fn of functions) {
      if (pos > fn.start && pos < fn.end && (!owner || fn.start > owner.start)) owner = fn
    }
    return owner
  }

  const apiCalls = [...source.matchAll(/\.(createTable|deleteTable|deleteColumn|create[A-Z][A-Za-z]*Column)\s*\(\s*\{/g)].map(call => ({
    pos: call.index,
    method: call[1],
    body: balanced(source, call.index + call[0].length - 1),
    owner: ownerOf(call.index),
  }))
  const callSites = []
  for (const fn of functions) {
    for (const call of source.matchAll(new RegExp(`(?<![A-Za-z0-9_$.])${fn.name}\\s*\\(`, 'g'))) {
      if (call.index >= fn.defAt && call.index < fn.start) continue // die Definition selbst
      callSites.push({ pos: call.index, callee: fn, args: splitTopLevel(balanced(source, call.index + call[0].length - 1)), owner: ownerOf(call.index) })
    }
  }
  const unpackings = [...source.matchAll(/\bconst\s+(\{[^}]*\})\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*[\n;]/g)]
    .map(m => ({ pattern: m[1], from: m[2], owner: ownerOf(m.index) }))

  const events = []
  const unresolved = new Set()
  const lineOf = pos => source.slice(0, pos).split('\n').length

  function evaluate(owner, current, orderKey, depth) {
    // `const { tableId, name } = input` — ein Parameter-Objekt wird ausgepackt.
    for (const unpack of unpackings) {
      if (unpack.owner !== owner) continue
      current.bind(unpack.pattern, unpack.from)
    }
    for (const call of apiCalls) {
      if (call.owner !== owner) continue
      const key = [...orderKey, call.pos]
      const tables = current.resolve(topLevelProperty(call.body, 'tableId'))
      if (!tables.length) {
        unresolved.add(`Zeile ~${lineOf(call.pos)}: ${call.method} — tableId nicht lesbar`)
        continue
      }
      const kind = call.method.startsWith('delete') ? 'drop' : 'create'
      if (call.method === 'createTable' || call.method === 'deleteTable') {
        for (const table of tables) events.push({ key, kind, table })
        continue
      }
      const columns = current.resolve(topLevelProperty(call.body, 'key'))
      if (!columns.length) {
        unresolved.add(`Zeile ~${lineOf(call.pos)}: ${call.method} an ${tables.join('|')} — Spaltenname nicht lesbar`)
        continue
      }
      for (const table of tables) {
        for (const column of columns) events.push({ key, kind, table, column })
      }
    }
    if (depth >= 4) return
    for (const site of callSites) {
      if (site.owner !== owner || site.callee === owner) continue
      // Parameter überdecken, was außen gleich heißt; die Argumente gelten
      // im Scope des AUFRUFERS.
      const child = createScope(current)
      for (const param of site.callee.params) child.shadow(param)
      site.callee.params.forEach((param, index) => {
        if (site.args[index]) child.bind(param, site.args[index], current)
      })
      evaluate(site.callee, child, [...orderKey, site.pos], depth + 1)
    }
  }

  evaluate(null, scope, [], 0)
  // Eine Funktion, die in dieser Datei niemand ruft (Export einer Fabrik):
  // einmal an ihrer Definition lesen, damit nichts still unter den Tisch fällt.
  for (const fn of functions) {
    if (!callSites.some(site => site.callee === fn)) evaluate(fn, createScope(scope), [fn.defAt], 1)
  }

  const compare = (a, b) => {
    for (let i = 0; i < Math.max(a.key.length, b.key.length); i += 1) {
      if (a.key[i] === undefined) return -1
      if (b.key[i] === undefined) return 1
      if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i]
    }
    return 0
  }
  return {
    events: events.sort(compare).map(({ kind, table, column }) => (column ? { kind, table, column } : { kind, table })),
    unresolved: [...unresolved],
  }
}

/**
 * WAS DER LESER NICHT SEHEN KANN — eine Stelle, mit Grund.
 *
 * `copies`: die Migration baut eine Tabelle als Kopie einer anderen auf und
 * liest deren Spalten zur LAUFZEIT aus der Datenbank (`listColumns`); im
 * Quelltext steht kein Spaltenname. Der Eintrag sagt, wer von wem erbt.
 * Ein Eintrag für eine Datei, die es nicht mehr gibt oder die nichts
 * Unlesbares mehr enthält, macht den Wächter rot (tote Ausnahme).
 */
export const MIGRATION_READ_HINTS = {
  'packages/control/scripts/migrations/029-communities-rename.ts': {
    reason: 'E8-3: `communities`/`community_plans` entstehen als Kopie von `tenants`/`tenant_plans`, Spalten kommen per listColumns aus der Datenbank',
    copies: [['tenants', 'communities'], ['tenant_plans', 'community_plans']],
  },
}

/** Alle Migrations-Dateien eines Layers, in Reihenfolge. */
export function migrationFiles(root, layer) {
  const dir = join(root, 'packages', layer, 'scripts', 'migrations')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(name => /^\d{3}-.*\.ts$/.test(name)).sort().map(name => ({
    rel: `packages/${layer}/scripts/migrations/${name}`,
    file: join(dir, name),
  }))
}

/** Hängt eingebundene Fabriken aus `scripts/migrations-lib/` an (dort stehen die Aufrufe). */
function withFactories(root, source, read) {
  let out = source
  for (const m of source.matchAll(/from\s+'(?:\.\.\/)+scripts\/migrations-lib\/([A-Za-z0-9_-]+\.mts)'/g)) {
    const file = join(root, 'scripts', 'migrations-lib', m[1])
    if (existsSync(file)) out += `\n${read(file)}`
  }
  return out
}

/**
 * Stand NACH allen Migrationen eines Layers: Tabellen mit ihren Spalten.
 * @returns {{ tables: Map<string, Set<string>>, touched: Map<string, Set<string>>, unresolved: string[], staleHints: string[] }}
 *   `tables` = hier ANGELEGTE Tabellen; `touched` = Spalten an Tabellen, die
 *   ein anderer Layer angelegt hat.
 */
export function layerInventory(root, layer, options = {}) {
  const read = options.read ?? (file => readFileSync(file, 'utf8'))
  const files = options.files ?? migrationFiles(root, layer)
  const hints = options.hints ?? MIGRATION_READ_HINTS
  const tables = new Map()
  const touched = new Map()
  const unresolved = []
  const staleHints = []
  for (const { rel, file } of files) {
    const result = readMigrationSource(withFactories(root, read(file), read))
    const hint = hints[rel]
    if (hint && !result.unresolved.length) staleHints.push(`${rel}: Eintrag in MIGRATION_READ_HINTS, aber die Datei ist inzwischen ganz lesbar — Eintrag streichen`)
    if (!hint) for (const note of result.unresolved) unresolved.push(`${rel} · ${note}`)
    for (const event of result.events) {
      const { kind, table, column } = event
      if (kind === 'create' && !column) {
        if (!tables.has(table)) tables.set(table, new Set())
      }
      else if (kind === 'create') {
        const target = tables.has(table) ? tables : touched
        if (!target.has(table)) target.set(table, new Set())
        target.get(table).add(column)
      }
      else if (!column) {
        tables.delete(table)
        touched.delete(table)
      }
      else {
        tables.get(table)?.delete(column)
        touched.get(table)?.delete(column)
      }
    }
    for (const [from, to] of hint?.copies ?? []) {
      const source = tables.get(from) ?? touched.get(from)
      if (!tables.has(to)) tables.set(to, new Set())
      for (const column of source ?? []) tables.get(to).add(column)
    }
  }
  return { tables, touched, unresolved, staleHints }
}

/** Layer unter `packages/`, die ein Migrations-Verzeichnis haben. */
export function layersWithMigrations(root) {
  return readdirSync(join(root, 'packages'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(root, 'packages', entry.name, 'scripts', 'migrations')))
    .map(entry => entry.name)
    .sort()
}
