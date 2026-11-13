import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * WÄCHTER: KEINE SCHREIBENDEN AUFRUFE BEIM SERVER-RENDERN (SEC-004).
 *
 * Beim SSR reicht Nuxt die Kopfzeilen der Seiten-Navigation an interne
 * Aufrufe weiter (`useFetch`, `useRequestFetch`) — auch `sec-fetch-site`,
 * aber keinen `Origin`. Kommt die Seite über einen Link von einer fremden
 * Seite, lehnt die Herkunftsprüfung (server/middleware/03.csrf-origin.ts)
 * einen schreibenden internen Aufruf deshalb ab. Das ist gewollt: ein
 * Seitenaufruf, den eine fremde Seite ausgelöst hat, soll beim Rendern
 * nichts Schreibendes auslösen. Schreibende Aufrufe gehören in den Browser —
 * `server: false`, `onMounted`, ein Klick-Handler.
 *
 * Erkannt wird mit dem TypeScript-Parser (mehrzeilige Aufrufe!) in
 * `<script>`-Blöcken von `.vue` und in `.ts` unter `packages/* /app` und
 * `apps/* /app`:
 *  1. `useFetch`/`useLazyFetch` mit Schreibmethode ohne `server: false`;
 *  2. `$fetch` ODER ein Aufruf über `useRequestFetch()` mit Schreibmethode,
 *     der beim SSR läuft: oberste Ebene von `<script setup>`, der Rumpf von
 *     `useAsyncData`/`useLazyAsyncData`/`callOnce` (außer mit
 *     `server: false`), eines Nuxt-Plugins (nicht `.client`), einer
 *     Routen-Middleware oder einer Inline-Middleware in `definePageMeta`.
 *     Im Klick-Handler, in `onMounted` oder in einem `server: false`-Rumpf
 *     ist `useRequestFetch()` dasselbe wie `$fetch` und läuft im Browser.
 * Eine nicht-literale Methode zählt vorsichtshalber als schreibend.
 *
 * Grenzen (bewusst): Aufrufe in Hilfsfunktionen, die eine SSR-Stelle aufruft,
 * und `watch(..., { immediate: true })` sieht der Wächter nicht.
 */

const REPO = resolve(import.meta.dirname, '../../..')
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Begründete Ausnahmen: `datei:zeile` ist zu wacklig, deshalb `datei` + Art. Heute leer. */
const EXCEPTIONS: Record<string, string> = {}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name.startsWith('.')) return []
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

interface Block { code: string, setup: boolean, lineOffset: number }

function scriptBlocks(path: string, source: string): Block[] {
  if (!path.endsWith('.vue')) return [{ code: source, setup: false, lineOffset: 0 }]
  const blocks: Block[] = []
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) {
    const before = source.slice(0, match.index + match[0].indexOf('>') + 1)
    blocks.push({
      code: match[2]!,
      setup: /\bsetup\b/.test(match[1]!),
      lineOffset: before.split('\n').length - 1,
    })
  }
  return blocks
}

type Kind = 'useFetch' | 'useRequestFetch' | '$fetch-ssr'
export interface Finding { file: string, line: number, kind: Kind, text: string }

function propName(p: ts.ObjectLiteralElementLike): string | null {
  if (!p.name) return null
  if (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) return p.name.text
  return null
}

function prop(obj: ts.ObjectLiteralExpression, name: string): ts.ObjectLiteralElementLike | undefined {
  return obj.properties.find(p => propName(p) === name)
}

/** Schreibmethode? Literal ⇒ exakt; nicht-literal ⇒ vorsichtshalber ja; keine Methode ⇒ nein. */
function writeMethod(options: ts.Expression | undefined): boolean {
  if (!options || !ts.isObjectLiteralExpression(options)) return false
  const m = prop(options, 'method')
  if (!m) return false
  if (ts.isShorthandPropertyAssignment(m)) return true
  if (!ts.isPropertyAssignment(m)) return true
  const init = m.initializer
  if (ts.isStringLiteralLike(init)) return WRITE_METHODS.has(init.text.toUpperCase())
  return true
}

function serverFalse(options: ts.Expression | undefined): boolean {
  if (!options || !ts.isObjectLiteralExpression(options)) return false
  const s = prop(options, 'server')
  return Boolean(s && ts.isPropertyAssignment(s) && s.initializer.kind === ts.SyntaxKind.FalseKeyword)
}

function calleeName(call: ts.CallExpression): string | null {
  const c = call.expression
  if (ts.isIdentifier(c)) return c.text
  return null
}

const isFn = (n: ts.Node): n is ts.FunctionLikeDeclaration =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)

export function scanSource(file: string, source: string): Finding[] {
  const findings: Finding[] = []
  const isPlugin = /\/app\/plugins\//.test(file) && !/\.client\.ts$/.test(file)
  for (const block of scriptBlocks(file, source)) {
    const sf = ts.createSourceFile(file.endsWith('.vue') ? `${file}.ts` : file, block.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 + block.lineOffset
    const text = (n: ts.Node) => n.getText(sf).replace(/\s+/g, ' ').slice(0, 120)

    // Bezeichner, die an `useRequestFetch()` hängen.
    const requestFetchNames = new Set<string>()
    const collect = (n: ts.Node) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer
        && ts.isCallExpression(n.initializer) && calleeName(n.initializer) === 'useRequestFetch') {
        requestFetchNames.add(n.name.text)
      }
      ts.forEachChild(n, collect)
    }
    collect(sf)

    // Funktionen, deren Rumpf beim SSR läuft.
    const ssrFns = new Set<ts.Node>()
    const markSsr = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const name = calleeName(n)
        const fnArgs = n.arguments.filter(isFn)
        const optionsArg = [...n.arguments].reverse().find(ts.isObjectLiteralExpression)
        if ((name === 'useAsyncData' || name === 'useLazyAsyncData' || name === 'callOnce') && !serverFalse(optionsArg)) {
          fnArgs.forEach(f => ssrFns.add(f))
        }
        if (name === 'defineNuxtRouteMiddleware') fnArgs.forEach(f => ssrFns.add(f))
        if (name === 'defineNuxtPlugin' && isPlugin) {
          fnArgs.forEach(f => ssrFns.add(f))
          if (optionsArg) {
            const setup = prop(optionsArg, 'setup')
            if (setup && (ts.isMethodDeclaration(setup) || (ts.isPropertyAssignment(setup) && isFn(setup.initializer)))) {
              ssrFns.add(ts.isPropertyAssignment(setup) ? setup.initializer : setup)
            }
          }
        }
        // Inline-Middleware in definePageMeta läuft auch beim SSR.
        if (name === 'definePageMeta' && n.arguments[0] && ts.isObjectLiteralExpression(n.arguments[0])) {
          const mw = prop(n.arguments[0], 'middleware')
          if (mw && ts.isPropertyAssignment(mw)) {
            const items = ts.isArrayLiteralExpression(mw.initializer) ? mw.initializer.elements : [mw.initializer]
            items.filter(isFn).forEach(f => ssrFns.add(f))
          }
        }
      }
      ts.forEachChild(n, markSsr)
    }
    markSsr(sf)

    const nearestFn = (n: ts.Node): ts.Node | null => {
      for (let p = n.parent; p; p = p.parent) if (isFn(p)) return p
      return null
    }
    const runsOnSsr = (n: ts.Node) => {
      const fn = nearestFn(n)
      if (!fn) return block.setup
      return ssrFns.has(fn)
    }

    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const name = calleeName(n)
        const options = n.arguments[1]
        if ((name === 'useFetch' || name === 'useLazyFetch') && writeMethod(options) && !serverFalse(options)) {
          findings.push({ file, line: at(n), kind: 'useFetch', text: text(n) })
        }
        const viaRequestFetch = (name !== null && requestFetchNames.has(name))
          || (ts.isCallExpression(n.expression) && calleeName(n.expression) === 'useRequestFetch')
        if (viaRequestFetch && writeMethod(options) && runsOnSsr(n)) {
          findings.push({ file, line: at(n), kind: 'useRequestFetch', text: text(n) })
        }
        if (name === '$fetch' && writeMethod(options) && runsOnSsr(n)) {
          findings.push({ file, line: at(n), kind: '$fetch-ssr', text: text(n) })
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  return findings
}

const roots = (['packages', 'apps'] as const).flatMap(top =>
  readdirSync(resolve(REPO, top), { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => resolve(REPO, top, e.name, 'app')))

const files = roots.flatMap(walk).filter(p => p.endsWith('.vue') || p.endsWith('.ts'))
const findings = files.flatMap(path => scanSource(relative(REPO, path), readFileSync(path, 'utf8')))

describe('Wächter-Selbsttest', () => {
  it('liest überhaupt Dateien und findet useFetch-Aufrufe', () => {
    expect(files.length).toBeGreaterThan(300)
    expect(files.some(f => /\buseFetch\s*[<(]/.test(readFileSync(f, 'utf8')))).toBe(true)
  })

  it('erkennt mehrzeiliges useFetch mit POST ohne server:false', () => {
    const src = `<script setup lang="ts">
const { data } = await useFetch(
  '/api/x',
  {
    method: 'POST',
    body: { a: 1 },
  },
)
</script>`
    expect(scanSource('x.vue', src).map(f => f.kind)).toEqual(['useFetch'])
  })

  it('server:false, GET und Handler sind in Ordnung', () => {
    const src = `<script setup lang="ts">
await useFetch('/api/x', { method: 'POST', server: false })
await useFetch('/api/y')
await useFetch('/api/z', { method: 'get' })
async function save() { await $fetch('/api/x', { method: 'POST' }) }
onMounted(() => { void $fetch('/api/x', { method: 'DELETE' }) })
</script>`
    expect(scanSource('x.vue', src)).toEqual([])
  })

  it('erkennt useRequestFetch und $fetch im useAsyncData-Rumpf', () => {
    const src = `<script setup lang="ts">
const request = useRequestFetch()
await useAsyncData('k', async () => request('/api/x', { method: 'POST', body: {} }))
await useAsyncData('l', () => $fetch('/api/y', { method: 'PUT' }))
await useAsyncData('m', () => $fetch('/api/y', { method: 'PUT' }), { server: false })
await useAsyncData('n', async () => request('/api/x', { method: 'POST' }), { watch: [x], server: false })
async function save() { await request('/api/x', { method: 'POST' }) }
</script>`
    expect(scanSource('x.vue', src).map(f => f.kind)).toEqual(['useRequestFetch', '$fetch-ssr'])
  })

  it('erkennt $fetch auf oberster Ebene von script setup, nicht in einem .ts-Composable', () => {
    expect(scanSource('x.vue', `<script setup lang="ts">\nawait $fetch('/api/x', { method: 'POST' })\n</script>`)
      .map(f => f.kind)).toEqual(['$fetch-ssr'])
    expect(scanSource('app/composables/x.ts', `export function f() { return $fetch('/api/x', { method: 'POST' }) }`))
      .toEqual([])
  })

  it('nicht-literale Methode zählt vorsichtshalber als schreibend', () => {
    expect(scanSource('x.vue', `<script setup lang="ts">\nawait useFetch('/api/x', { method })\n</script>`)
      .map(f => f.kind)).toEqual(['useFetch'])
  })
})

describe('Keine schreibenden Aufrufe beim Server-Rendern', () => {
  it('Fundstellen', () => {
    const open = findings.filter(f => !EXCEPTIONS[`${f.file}#${f.kind}`])
    expect(open.map(f => `${f.file}:${f.line} [${f.kind}] ${f.text}`).join('\n'),
      'Schreibender Aufruf beim SSR: in den Browser verlegen (server: false / onMounted / Handler), '
      + 'die Seite zeigt bis dahin ihren Ladezustand').toBe('')
  })

  it('Ausnahmen haben Grund und Gegenstand', () => {
    for (const [key, reason] of Object.entries(EXCEPTIONS)) {
      expect(reason.length, key).toBeGreaterThan(20)
      expect(findings.some(f => `${f.file}#${f.kind}` === key), `${key}: Ausnahme ohne Fundstelle`).toBe(true)
    }
  })
})
