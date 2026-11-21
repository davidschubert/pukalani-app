/**
 * ABHÄNGIGKEITEN ÜBER AUTO-IMPORT (Q18, ARC-003) — `pnpm check:manifests`,
 * Prüfung 12.
 *
 * Nuxt importiert Composables, Utils und Komponenten eines Layers in JEDEN
 * anderen Layer derselben App, ohne Import-Zeile. So entsteht eine
 * Abhängigkeit, die weder ein Mensch noch die Lint-Regel sieht: `control`
 * rief `registerFeedbackBackend` aus `feedback`, `insights` baute
 * `CommentSection` aus `comments` ein — beide Manifeste sagten nichts davon.
 * In der nächsten App ohne den anderen Layer startet der Server nicht oder
 * die Seite zeigt ein Loch, ohne Fehlermeldung.
 *
 * WAS ROT IST: ein Layer nutzt einen Namen, den ein ANDERER Layer exportiert,
 * ohne Import-Zeile, und dieser andere Layer ist weder Stufe 1 (`kind:
 * 'base'`, in jeder App) noch über `requires` erreichbar (auch transitiv).
 * Dazu kommt die Richtung: ein Fundament-Layer (`base`/`foundation`) darf
 * nichts von einem Produkt oder einer Naht brauchen — auch nicht per
 * `requires`.
 *
 * WIE GELESEN WIRD (ein Muster, kein Compiler — bewusst schnell, < 2 s):
 *  - EXPORTE: `export function|const|let|class <Name>` in `app/composables`,
 *    `app/utils`, `server/utils`, `shared/utils`; Komponenten aus dem
 *    Dateinamen unter `app/components` (Nuxts Namensregel mit Pfad-Präfix).
 *  - NUTZUNG: jeder Bezeichner und jedes Komponenten-Tag in `app/**` und
 *    `server/**` (ohne Tests), nach Entfernen von Kommentaren und
 *    Zeichenketten; nicht mitgezählt werden Eigenschafts-Zugriffe
 *    (`.name`), Eigenschafts-Namen in Typen und Objekten (`name:`),
 *    importierte und selbst deklarierte Namen, Namen unter sechs Zeichen.
 *  - Server-Code sieht nur Server- und `shared/`-Exporte, App-Code nur App-
 *    und `shared/`-Exporte (so trennt Nuxt die Auto-Importe auch).
 *
 * Fehlalarm ⇒ Eintrag in COUPLING_EXCEPTIONS mit Grund; ein Eintrag, der
 * nichts mehr ausnimmt, ist rot.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/** `<nutzender Layer> -> <Name>` → Grund. */
export const COUPLING_EXCEPTIONS = new Map([
  // ['layer -> Name', 'Grund — wer/wann'],
])

const SKIP_DIRS = new Set(['node_modules', '.nuxt', '.output', 'dist', '.playground', 'tests', 'e2e', 'scripts', '.data', 'public'])
const EXPORT_DIRS = ['app/composables', 'app/utils', 'server/utils', 'shared/utils']
const EXPORT_LINE = /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_]\w*)/gm
const MIN_NAME = 6

function* walk(dir) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(join(dir, entry.name))
    }
    else if (/\.(ts|vue|mts)$/.test(entry.name) && !/\.(test|spec|d)\.ts$/.test(entry.name)) {
      yield join(dir, entry.name)
    }
  }
}

const pascal = part => part.split(/[-_]/).map(word => word.slice(0, 1).toUpperCase() + word.slice(1)).join('')

/** Nuxts Komponenten-Name aus dem Pfad unter `app/components` (Präfix aus den Ordnern, ohne Doppelung). */
export function componentName(relPath) {
  let name = ''
  for (const part of relPath.replace(/\.vue$/, '').replace('.global', '').split('/')) {
    const pc = pascal(part)
    name = name && pc.startsWith(name) ? pc : name + pc
  }
  return name
}

/** Kommentare und Zeichenketten weg — was übrig bleibt, ist Code. */
export function stripNoise(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
}

/** Die Namen, die eine Datei nutzt, ohne sie zu importieren oder selbst zu deklarieren. */
export function usedNames(source) {
  const code = stripNoise(source)
  const imported = new Set()
  for (const block of code.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const spec of block[1].split(',')) {
      const name = spec.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim()
      if (name) imported.add(name)
    }
  }
  for (const match of code.matchAll(/import\s+(?:type\s+)?([A-Za-z_]\w*)\s+from/g)) imported.add(match[1])
  const local = new Set([...code.matchAll(/(?:function|const|let|var|class)\s+([A-Za-z_]\w*)/g)].map(match => match[1]))
  // Typisierte Parameter und Eigenschaften (`siteProjectId: string`) sind
  // eigene Namen der Datei, kein Auto-Import — auch wo sie danach als
  // Kurzschreibweise (`{ siteProjectId }`) wieder auftauchen.
  for (const match of code.matchAll(/(?<![.$\w<-])([A-Za-z_]\w*)[ \t]*\??:(?!:)/g)) local.add(match[1])

  const tags = new Set()
  for (const match of code.matchAll(/<([A-Z][A-Za-z0-9]+)/g)) tags.add(match[1])
  for (const match of code.matchAll(/<([a-z]+(?:-[a-z0-9]+)+)/g)) tags.add(pascal(match[1]))

  const withoutStrings = code.replace(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g, ' ')
  const idents = new Set()
  for (const match of withoutStrings.matchAll(/(?<![.$\w-])([A-Za-z_]\w*)\b(?![ \t]*\??:(?!:))/g)) idents.add(match[1])

  const names = new Set()
  for (const name of [...idents, ...tags]) {
    if (name.length >= MIN_NAME && !imported.has(name) && !local.has(name)) names.add(name)
  }
  return names
}

/** name → { layer, file, side } je Layer (`side`: 'app' | 'server' | 'shared'). */
export function layerExports(root, layer) {
  const exports = new Map()
  const base = join(root, 'packages', layer)
  for (const sub of EXPORT_DIRS) {
    for (const file of walk(join(base, sub))) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(EXPORT_LINE)) {
        if (!exports.has(match[1])) exports.set(match[1], { file: relative(root, file), side: sub.split('/')[0] })
      }
    }
  }
  const componentsDir = join(base, 'app/components')
  for (const file of walk(componentsDir)) {
    if (!file.endsWith('.vue')) continue
    const name = componentName(relative(componentsDir, file).split('\\').join('/'))
    if (!exports.has(name)) exports.set(name, { file: relative(root, file), side: 'app' })
  }
  return exports
}

/** Alle Layer, die `layer` über `requires` erreicht (transitiv, ohne sich selbst). */
export function requiredClosure(layer, requiresOf) {
  const seen = new Set()
  const queue = [...(requiresOf[layer] ?? [])]
  while (queue.length) {
    const next = queue.shift()
    if (seen.has(next)) continue
    seen.add(next)
    queue.push(...(requiresOf[next] ?? []))
  }
  return seen
}

/**
 * @param {{ root: string, kindOf: Record<string,string>, requiresOf: Record<string,string[]>, exceptions?: Map<string,string> }} input
 * @returns {string[]} Probleme, eine Zeile je Paar
 */
export function couplingProblems({ root, kindOf, requiresOf, exceptions = COUPLING_EXCEPTIONS }) {
  const layers = Object.keys(kindOf).sort()
  const owners = new Map()
  for (const layer of layers) {
    for (const [name, info] of layerExports(root, layer)) {
      if (!owners.has(name)) owners.set(name, [])
      owners.get(name).push({ layer, ...info })
    }
  }

  const problems = []
  const usedExceptions = new Set()
  const isFoundation = layer => kindOf[layer] === 'base' || kindOf[layer] === 'foundation'

  // Richtung: Fundament braucht nie Produkt oder Naht — auch nicht per requires.
  for (const layer of layers) {
    if (!isFoundation(layer)) continue
    for (const req of requiresOf[layer] ?? []) {
      if (kindOf[req] && !isFoundation(req)) {
        problems.push(`packages/${layer}/product.manifest.ts: requires „${req}" — ein Fundament-Layer (kind '${kindOf[layer]}') hängt nie von einem ${kindOf[req] === 'seam' ? 'Naht' : 'Produkt'}-Layer ab (CONCEPT.md A14)`)
      }
    }
  }

  for (const layer of layers) {
    const reachable = requiredClosure(layer, requiresOf)
    const hits = new Map() // owner → Map(name → Set(files))
    for (const sub of ['app', 'server']) {
      for (const file of walk(join(root, 'packages', layer, sub))) {
        const isServer = sub === 'server'
        for (const name of usedNames(readFileSync(file, 'utf8'))) {
          const candidates = owners.get(name)
          if (!candidates || candidates.some(owner => owner.layer === layer)) continue
          for (const owner of candidates) {
            if (owner.side !== 'shared' && (owner.side === 'server') !== isServer) continue
            if (kindOf[owner.layer] === 'base' || reachable.has(owner.layer)) continue
            const key = `${layer} -> ${name}`
            if (exceptions.has(key)) {
              usedExceptions.add(key)
              continue
            }
            if (!hits.has(owner.layer)) hits.set(owner.layer, new Map())
            const byName = hits.get(owner.layer)
            if (!byName.has(name)) byName.set(name, { source: owner.file, files: new Set() })
            byName.get(name).files.add(relative(root, file))
          }
        }
      }
    }
    for (const [owner, byName] of [...hits].sort()) {
      const detail = [...byName].sort().map(([name, { source, files }]) => `${name} (${source}; genutzt in ${[...files].sort()[0]}${files.size > 1 ? ` +${files.size - 1}` : ''})`).join(', ')
      const direction = isFoundation(layer) && !isFoundation(owner)
        ? `ein Fundament-Layer darf nicht von „${owner}" (kind '${kindOf[owner]}') abhängen — Verstoß gegen CONCEPT.md A14, nicht per requires heilbar`
        : `„${owner}" in requires eintragen oder den Aufruf hinter eine Abfrage stellen (useProduct)`
      problems.push(`packages/${layer}: nutzt per Auto-Import aus „${owner}" — ${detail}; ${direction}`)
    }
  }

  for (const key of exceptions.keys()) {
    if (!usedExceptions.has(key)) problems.push(`scripts/lib/autoimport-coupling.mjs: COUPLING_EXCEPTIONS „${key}" nimmt nichts mehr aus — streichen`)
  }
  return problems
}
