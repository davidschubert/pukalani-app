import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

/**
 * DIE SUCHE DES FRISTEN-WÄCHTERS (`routeDeadlineBudget.test.ts`) — pur bis auf
 * das Einlesen des Baums: Quelltexte rein, je Route die erreichten langsamen
 * Bausteine raus.
 *
 * LANGSAME BAUSTEINE sind Funktionen mit EIGENER Frist, deren Dauer an einem
 * fremden Dienst hängt (`SLOW_BLOCKS` im Test: die KI-Transporte des Core und
 * die benannten Abrufe fremder Websites und von YouTube).
 *
 * WIE ERREICHBARKEIT GEFUNDEN WIRD — über NAMEN, nicht über einen Typ-Graphen:
 *  1. Jede Deklaration auf oberster Ebene (`function x`, `const x =`) in
 *     `server/**` (ohne die Routen selbst) und `shared/**` aller Layer und
 *     Apps wird mit ihrem Rumpf eingelesen; der Rumpf reicht bis zur nächsten
 *     Deklaration am Zeilenanfang.
 *  2. Ein Rumpf, der einen langsamen Namen NENNT — als Aufruf (`name(`) oder
 *     als weitergereichter Wert (`deps.fetchJson ?? defaultFetchJson`; so
 *     kommt der YouTube-Abruf in die Sweeps) —, macht seine Deklaration
 *     langsam. Import-Zeilen zählen nicht. Exportierte Namen gelten
 *     danach überall (Nitro-Auto-Import aus `server/utils/**` UND
 *     ausgeschriebene Importe — beide laufen über denselben Namen),
 *     nicht exportierte nur in ihrer Datei. Das wird wiederholt, bis sich
 *     nichts mehr ändert.
 *  3. Eine Route ist im Blick, wenn ihr Quelltext einen langsamen Namen
 *     nennt.
 * Vor jedem Abgleich fallen Kommentare und der INHALT von Zeichenketten weg
 * (Ausdrücke in `${…}` bleiben Code) — ein Name in einem Kommentar, einer
 * Log-Meldung oder einem Prompt-Text erzeugt keine Kante.
 *
 * WAS DIE SUCHE NICHT SIEHT (bewusst, ehrlich):
 *  - Umbenennende Importe (`import { aiComplete as ask }`): die Kante hängt
 *    am Namen, und der neue Name ist keiner aus der Tabelle.
 *  - Methoden und Eigenschaften (`obj.aiComplete(`, `contract.read(`) und
 *    dynamische Importe — ein Baustein, der über ein Objekt gereicht wird
 *    (Verträge zwischen Layern), ist nur sichtbar, wo sein NAME steht.
 *  - Die Rümpfe enden an der nächsten Deklaration am Zeilenanfang; Typen und
 *    Interfaces dazwischen zählen zum Rumpf davor (Über-Näherung).
 *  - Middleware und Plugins: sie laufen nicht als eigene Route (Middleware
 *    vor JEDER Route — eine langsame Middleware fände hier niemand).
 *  - Gleichnamige Funktionen in zwei Layern werden nicht unterschieden —
 *    das ist eine Über-Näherung (eher eine Route zu viel im Blick als eine zu
 *    wenig).
 *  - Ausgehende Aufrufe ohne Eintrag in `SLOW_BLOCKS` (s. Kopf des Tests).
 */

export interface SourceFile {
  /** Pfad relativ zum Repo, mit `/`. */
  readonly path: string
  readonly source: string
}

export interface RouteReach {
  readonly path: string
  /** Die langsamen Namen, die die Route selbst aufruft (sortiert). */
  readonly calls: readonly string[]
}

/**
 * Kommentare entfernen und den Inhalt von Zeichenketten leeren. Ausdrücke in
 * Template-Literalen (`${…}`) bleiben Code. Ein Schrägstrich nach einem
 * Operator oder einer öffnenden Klammer beginnt einen regulären Ausdruck —
 * dessen Inhalt fällt ebenfalls weg (sonst öffnete ein `'` darin eine
 * Zeichenkette).
 */
export function codeOnly(source: string): string {
  let out = ''
  let i = 0
  /** Stapel offener Template-Ausdrücke: Tiefe der geschweiften Klammern je `${`. */
  const templates: number[] = []
  let lastSignificant = ''
  const n = source.length

  const readTemplate = (): void => {
    // steht hinter dem öffnenden ` bzw. hinter dem `}` eines Ausdrucks
    while (i < n) {
      const ch = source[i]!
      if (ch === '\\') { i += 2; continue }
      if (ch === '`') { out += '`'; i++; lastSignificant = '`'; return }
      if (ch === '$' && source[i + 1] === '{') { out += '${'; i += 2; templates.push(0); lastSignificant = '{'; return }
      if (ch === '\n') out += '\n'
      i++
    }
  }

  while (i < n) {
    const ch = source[i]!
    const next = source[i + 1]
    if (ch === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i++
      continue
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? n : end + 2
      out += source.slice(i, stop).replace(/[^\n]/g, '')
      i = stop
      continue
    }
    if (ch === '\'' || ch === '"') {
      out += ch + ch
      i++
      while (i < n && source[i] !== ch && source[i] !== '\n') i += source[i] === '\\' ? 2 : 1
      i++
      lastSignificant = ch
      continue
    }
    if (ch === '`') {
      out += '`'
      i++
      readTemplate()
      continue
    }
    if (ch === '/' && (lastSignificant === '' || '(,=:[!&|?{};+-*%<>~^'.includes(lastSignificant))) {
      // regulärer Ausdruck
      out += '//'
      i++
      let inClass = false
      while (i < n && source[i] !== '\n') {
        const c = source[i]!
        if (c === '\\') { i += 2; continue }
        if (c === '[') inClass = true
        else if (c === ']') inClass = false
        else if (c === '/' && !inClass) { i++; break }
        i++
      }
      while (i < n && /[a-z]/.test(source[i]!)) i++
      lastSignificant = ')'
      continue
    }
    if (templates.length > 0) {
      if (ch === '{') templates[templates.length - 1]!++
      if (ch === '}') {
        if (templates[templates.length - 1] === 0) {
          templates.pop()
          out += '}'
          i++
          readTemplate()
          continue
        }
        templates[templates.length - 1]!--
      }
    }
    out += ch
    if (!/\s/.test(ch)) lastSignificant = /[\w$]/.test(ch) ? 'a' : ch
    i++
  }
  return out
}

/**
 * Nennt `code` den Namen als Bezeichner? Ein Aufruf (`name(`, `name<T>(`)
 * ebenso wie ein Weiterreichen als Wert (`deps.fetchJson ?? defaultFetchJson`)
 * — kein Eigenschafts-Zugriff (`obj.name`), kein Teil eines längeren Namens.
 * Import-Zeilen zählen nicht (`withoutImports`).
 */
export function mentionsName(code: string, name: string): boolean {
  return new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`).test(code)
}

/** `import … from ''` und `export … from ''` entfernen (nach `codeOnly`). */
export function withoutImports(code: string): string {
  return code.replace(/^\s*(?:import|export)\b[^;=]*?\bfrom\s*(?:''|"")/gm, '')
}

interface Declaration {
  readonly name: string
  readonly exported: boolean
  readonly body: string
}

const DECLARATION = /^(export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s*\*?\s*([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*))/gm

/** Deklarationen auf oberster Ebene (am Zeilenanfang) mit ihrem Rumpf. */
export function declarations(code: string): Declaration[] {
  const starts = [...code.matchAll(DECLARATION)]
  return starts.map((match, index) => ({
    name: (match[2] ?? match[3])!,
    exported: Boolean(match[1]),
    body: code.slice(match.index! + match[0].length, starts[index + 1]?.index ?? code.length),
  }))
}

/**
 * DIE SUCHE. `libraries`: alle Dateien, deren Funktionen eine Route rufen kann
 * (`server/**` ohne Routen, `shared/**`). `routes`: die Routen-Dateien.
 * `slow`: die Namen der langsamen Bausteine, die überall gelten; ihre
 * Definitionen (`leaves`) werden nicht eingelesen — sie SIND die Blätter.
 * `localSeeds`: langsame Bausteine, die NICHT exportiert sind (Datei + Name,
 * z. B. der YouTube-Abruf `defaultFetchJson`) — sie gelten nur in ihrer Datei
 * und machen von dort aus die exportierten Funktionen langsam, die sie nennen.
 */
export function findSlowRoutes(input: {
  libraries: readonly SourceFile[]
  routes: readonly SourceFile[]
  slow: readonly string[]
  leaves?: readonly string[]
  localSeeds?: ReadonlyArray<{ readonly path: string, readonly name: string }>
}): { routes: RouteReach[], slowNames: ReadonlySet<string> } {
  const leaves = new Set(input.leaves ?? [])
  const files = input.libraries
    .filter(file => !leaves.has(file.path))
    .map(file => ({ path: file.path, decls: declarations(withoutImports(codeOnly(file.source))) }))

  const global = new Set(input.slow)
  const local = new Map<string, Set<string>>(files.map(file => [file.path, new Set<string>()]))
  for (const seed of input.localSeeds ?? []) {
    const own = local.get(seed.path)
    if (!own) throw new Error(`localSeeds: ${seed.path} nicht eingelesen`)
    own.add(seed.name)
  }

  let changed = true
  while (changed) {
    changed = false
    for (const file of files) {
      const own = local.get(file.path)!
      for (const decl of file.decls) {
        if (own.has(decl.name) || (decl.exported && global.has(decl.name))) continue
        const hit = [...global, ...own].some(name => name !== decl.name && mentionsName(decl.body, name))
        if (!hit) continue
        own.add(decl.name)
        if (decl.exported) global.add(decl.name)
        changed = true
      }
    }
    // Ein lokaler Samen, der selbst exportiert ist, gilt überall.
    for (const file of files) {
      for (const decl of file.decls) {
        if (decl.exported && local.get(file.path)!.has(decl.name) && !global.has(decl.name)) {
          global.add(decl.name)
          changed = true
        }
      }
    }
  }

  const routes = input.routes.flatMap((route) => {
    const code = withoutImports(codeOnly(route.source))
    const calls = [...global].filter(name => mentionsName(code, name)).sort()
    return calls.length > 0 ? [{ path: route.path, calls }] : []
  })
  return { routes, slowNames: global }
}

// ── Einlesen des echten Baums ───────────────────────────────────────────────

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const SOURCE = /\.(ts|mts|js|mjs)$/

/** Liest Routen (`server/api/**`, `server/routes/**`) und Bibliotheken aller Layer und Apps. */
export function readRepo(repo: string): { libraries: SourceFile[], routes: SourceFile[] } {
  const roots = ['packages', 'apps'].flatMap(root =>
    readdirSync(resolve(repo, root))
      .filter(name => statSync(resolve(repo, root, name)).isDirectory())
      .map(name => resolve(repo, root, name)))
  const read = (file: string): SourceFile => ({
    path: relative(repo, file).split(sep).join('/'),
    source: readFileSync(file, 'utf8'),
  })
  const isRoute = (file: string) => /\/server\/(api|routes)\//.test(file.split(sep).join('/'))
  const routes: SourceFile[] = []
  const libraries: SourceFile[] = []
  for (const root of roots) {
    for (const file of walk(join(root, 'server')).filter(f => SOURCE.test(f) && !f.endsWith('.d.ts'))) {
      ;(isRoute(file) ? routes : libraries).push(read(file))
    }
    for (const file of walk(join(root, 'shared')).filter(f => SOURCE.test(f) && !f.endsWith('.d.ts'))) {
      libraries.push(read(file))
    }
  }
  return { libraries, routes }
}
