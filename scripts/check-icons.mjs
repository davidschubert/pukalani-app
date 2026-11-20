/**
 * Wächter für SYMBOL-NAMEN (FE-002, 2026-11-20).
 *
 * Warum es das gibt: ein Symbol-Name ist eine Zeichenkette (`i-ph-heart`).
 * Weder Typecheck noch Lint noch ein Test kennen die Liste der vorhandenen
 * Symbole — ein Tippfehler oder ein Name, den es im Paket nie gab, fällt erst
 * im Browser auf: der Knopf bleibt leer. Vier solche Namen standen monatelang
 * im Code, einer davon unter jedem Beitrag.
 *
 * Die Regeln:
 *  1. Jeder fest geschriebene Symbol-Name in `apps/`, `packages/` und der
 *     Doku-Site (`docs/app`, `docs/content`) existiert in seinem Symbol-Paket (`@iconify-json/<x>`),
 *     als Symbol oder als Alias.
 *  2. Das Paket ist dort installiert, wo der Name gebraucht wird: im
 *     Workspace-Paket der Datei selbst oder im Core (jede App erweitert den
 *     Core; das Symbol-Modul sucht die Pakete in der App und all ihren Layern).
 *  3. Der Core überschreibt JEDES Standard-Symbol von Nuxt UI (`ui.icons`).
 *     Die Vorgaben dort kommen aus einem Symbol-Paket, das die meisten Apps
 *     nicht installiert haben.
 *  4. Der Abruf fehlender Symbole bei einem fremden Dienst bleibt aus
 *     (`icon.fallbackToApi: false` in `packages/core/nuxt.config.ts`). Ein
 *     fehlendes Symbol bleibt dann leer — und genau deshalb gibt es Regel 1.
 *
 * Was der Wächter NICHT sieht: zusammengesetzte Namen (`i-circle-flags-${x}`,
 * werden übersprungen) und Namen, die aus gespeicherten Daten kommen.
 *
 * Aufruf: `pnpm check:icons` (fährt in `lint:scripts` mit, also im Lint-Lauf).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Das Paket, das jede App über `extends` mitbringt. */
export const CORE_PACKAGE = 'packages/core'

/** Wurzeln, in denen Symbol-Namen stehen (Code, Config, Hilfe-Inhalte). */
const SCAN_ROOTS = ['apps', 'packages', 'docs/app', 'docs/content', 'docs/package.json', 'docs/nuxt.config.ts']
const SCAN_EXTENSIONS = /\.(vue|ts|mts|js|mjs|json|ya?ml|md|mdc)$/
/** Tests dürfen erfundene Namen tragen (die Gegenprobe dieses Wächters). */
const SKIP = /(^|\/)(node_modules|\.nuxt|\.output|\.data|dist|tests|e2e)\//

/**
 * `i-<paket>-<name>`. Ein Paket-Name kann selbst einen Bindestrich tragen
 * (`circle-flags`), deshalb wird gegen die bekannten Pakete geprüft, längster
 * Name zuerst. Davor darf kein Buchstabe, keine Ziffer und kein Bindestrich
 * stehen (sonst träfe es `ui-ph-…` oder CSS-Klassen wie `multi-ph-x`).
 */
export function findIconNames(source, prefixes) {
  const ordered = [...prefixes].sort((a, b) => b.length - a.length)
  const pattern = new RegExp(`(?<![A-Za-z0-9_-])i-(${ordered.map(escapeRegExp).join('|')})-([a-z0-9]+(?:-[a-z0-9]+)*)(-?)(\\$\\{)?`, 'g')
  const found = []
  for (const match of source.matchAll(pattern)) {
    const [, prefix, name, trailingDash, template] = match
    // `i-ph-${x}` oder `i-circle-flags-${code}`: zusammengesetzt, nicht prüfbar.
    if (template || trailingDash) continue
    const line = source.slice(0, match.index).split('\n').length
    found.push({ prefix, name, line })
  }
  return found
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Workspace-Paket einer Datei: `apps/<x>`, `packages/<x>` oder `docs`. */
export function owningPackage(path) {
  const parts = path.split('/')
  if (parts[0] === 'docs') return 'docs'
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0]
}

/**
 * Regel 1 und 2 — pur, damit der Test sie mit erfundenen Dateien füttern kann.
 * `collections`: Paket-Name → Set der Symbol-Namen.
 * `installed`: Workspace-Paket → Set der dort eingetragenen Symbol-Pakete.
 */
export function checkIconNames(files, { collections, installed }) {
  const violations = []
  let count = 0
  const prefixes = Object.keys(collections)
  for (const { path, source } of files) {
    const own = installed[owningPackage(path)] ?? new Set()
    const core = installed[CORE_PACKAGE] ?? new Set()
    for (const { prefix, name, line } of findIconNames(source, prefixes)) {
      count++
      if (!collections[prefix].has(name)) {
        violations.push(`${path}:${line} — \`i-${prefix}-${name}\` gibt es im Symbol-Paket \`${prefix}\` nicht`)
        continue
      }
      if (!own.has(prefix) && !core.has(prefix)) {
        violations.push(`${path}:${line} — \`i-${prefix}-${name}\`: das Symbol-Paket \`${prefix}\` ist weder in ${owningPackage(path)} noch im Core eingetragen`)
      }
    }
  }
  return { violations, count }
}

/** Regel 3 — die Schlüssel der Nuxt-UI-Vorgabe gegen die des Core. */
export function checkUiIconOverrides(defaultKeys, coreKeys) {
  const core = new Set(coreKeys)
  return defaultKeys
    .filter(key => !core.has(key))
    .map(key => `packages/core/app/app.config.ts — \`ui.icons.${key}\` fehlt: Nuxt UI nimmt dann seine Vorgabe aus einem Symbol-Paket, das die meisten Apps nicht haben`)
}

/** Regel 4 — der Schalter gegen den Abruf beim fremden Dienst. */
export function checkFallbackSwitch(nuxtConfigSource) {
  const body = iconBlock(nuxtConfigSource)
  if (body !== null && /\bfallbackToApi:\s*false\b/.test(body)) return []
  return ['packages/core/nuxt.config.ts — `icon: { fallbackToApi: false }` fehlt: ein fehlendes Symbol würde wieder bei einem fremden Dienst angefragt']
}

/** Der Inhalt des obersten `icon: { … }`-Blocks einer Nuxt-Config. */
function iconBlock(source) {
  const start = source.search(/^ {2}icon:\s*\{/m)
  if (start < 0) return null
  const open = source.indexOf('{', start)
  let depth = 0
  for (let index = open; index < source.length; index++) {
    if (source[index] === '{') depth++
    else if (source[index] === '}' && --depth === 0) return source.slice(open + 1, index)
  }
  return null
}

/**
 * Schlüssel eines Objekt-Literals `icons: { a: '…' }` (unsere Config) oder
 * `const defaultIcons = { a: "…" }` (so schreibt Nuxt UI seine Vorgabe).
 */
export function iconKeysOf(source) {
  const start = source.search(/\b(?:icons:|defaultIcons\s*=)\s*\{/)
  if (start < 0) return []
  const open = source.indexOf('{', start)
  const close = source.indexOf('}', open)
  return [...source.slice(open + 1, close).matchAll(/^\s*([A-Za-z]+):\s*['"]i-/gm)].map(match => match[1])
}

// ─── Lesen aus dem echten Baum ───────────────────────────────────────────────

function gitFiles(root) {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', ...SCAN_ROOTS], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return out.split('\u0000').filter(Boolean)
}

/** Workspace-Paket → eingetragene Symbol-Pakete (aus den `package.json`). */
export function readInstalled(root = ROOT) {
  const installed = {}
  for (const path of gitFiles(root)) {
    if (!/^(apps|packages)\/[^/]+\/package\.json$/.test(path) && path !== 'docs/package.json') continue
    const json = JSON.parse(readFileSync(join(root, path), 'utf8'))
    const names = Object.keys({ ...json.dependencies, ...json.devDependencies })
      .filter(name => name.startsWith('@iconify-json/'))
      .map(name => name.slice('@iconify-json/'.length))
    installed[dirname(path)] = new Set(names)
  }
  return installed
}

/** Symbol-Paket → Set seiner Namen, gelesen aus `node_modules` des Besitzers. */
export function readCollections(installed, root = ROOT) {
  const collections = {}
  for (const [pkg, prefixes] of Object.entries(installed)) {
    const require = createRequire(join(root, pkg, 'package.json'))
    for (const prefix of prefixes) {
      if (collections[prefix]) continue
      let file
      try {
        file = require.resolve(`@iconify-json/${prefix}/icons.json`)
      }
      catch {
        // `docs` wird in der CI nicht immer installiert; dann zählt das Paket
        // eines anderen Besitzers oder der Name bleibt ungeprüft (Meldung unten).
        continue
      }
      const json = JSON.parse(readFileSync(file, 'utf8'))
      collections[prefix] = new Set([...Object.keys(json.icons), ...Object.keys(json.aliases ?? {})])
    }
  }
  return collections
}

export function readSources(root = ROOT) {
  return gitFiles(root)
    .filter(path => SCAN_EXTENSIONS.test(path) && !SKIP.test(path) && !path.endsWith('package.json'))
    .filter(path => existsSync(join(root, path)))
    .map(path => ({ path, source: readFileSync(join(root, path), 'utf8') }))
}

/** Die `ui.icons`-Vorgabe von Nuxt UI, gelesen aus dem installierten Paket. */
export function readUiDefaultKeys(root = ROOT) {
  // Nicht über `require.resolve`: das Paket gibt `package.json` nicht frei.
  const shared = join(root, CORE_PACKAGE, 'node_modules', '@nuxt', 'ui', 'dist', 'shared')
  if (!existsSync(shared)) return []
  const files = readdirSync(shared).filter(name => name.endsWith('.mjs'))
  for (const name of files) {
    const keys = iconKeysOf(readFileSync(join(shared, name), 'utf8'))
    if (keys.length > 0) return keys
  }
  return []
}

export function checkTree(root = ROOT) {
  const installed = readInstalled(root)
  const collections = readCollections(installed, root)
  const unread = [...new Set(Object.values(installed).flatMap(set => [...set]))].filter(prefix => !collections[prefix])
  const names = checkIconNames(readSources(root), { collections, installed })
  const defaultKeys = readUiDefaultKeys(root)
  const coreKeys = iconKeysOf(readFileSync(join(root, CORE_PACKAGE, 'app/app.config.ts'), 'utf8'))
  const violations = [
    ...names.violations,
    ...(defaultKeys.length === 0 ? ['Die Standard-Symbole von Nuxt UI waren nicht lesbar (dist/shared) — Regel 3 kann nicht prüfen'] : []),
    ...checkUiIconOverrides(defaultKeys, coreKeys),
    ...checkFallbackSwitch(readFileSync(join(root, CORE_PACKAGE, 'nuxt.config.ts'), 'utf8')),
  ]
  return { violations, count: names.count, collections: Object.keys(collections), unread, defaultKeys: defaultKeys.length }
}

function main() {
  const report = checkTree()
  if (report.unread.length > 0) {
    console.log(`○ nicht installiert, daher ungeprüft: ${report.unread.join(', ')}`)
  }
  if (report.violations.length > 0) {
    console.error(`✖ check:icons — ${report.violations.length} Befund(e):`)
    for (const line of report.violations) console.error(`  ${line}`)
    process.exit(1)
  }
  console.log(`✔ check:icons — ${report.count} Symbol-Namen in Ordnung (Pakete: ${report.collections.join(', ')}; ${report.defaultKeys} Standard-Symbole von Nuxt UI überschrieben; kein Abruf beim fremden Dienst)`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
