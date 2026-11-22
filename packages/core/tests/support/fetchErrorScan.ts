import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * Zählt je Datei die Abrufe, deren Ergebnis den Fehler NICHT liest (FE-004,
 * Q14) — die Grundlage der Rest-Liste `listStateBacklog.ts`.
 *
 * Ein Abruf ist `useFetch`, `useLazyFetch`, `useAsyncData` oder
 * `useLazyAsyncData` in einer `.vue`-Datei unter `packages/* /app` oder
 * `apps/* /app`. Er gilt als OFFEN, wenn
 *  - sein Ergebnis zerlegt wird (`const { data, status } = …`) und `error`
 *    nicht darunter ist, oder
 *  - es in einer Variablen steht (`const res = …`) und `res.error` nirgends in
 *    der Datei vorkommt, oder
 *  - es gar nicht gebunden ist.
 * Zeilen, die mit `//` oder `*` beginnen (Kommentare), zählen nicht.
 */
export const REPO = resolve(import.meta.dirname, '../../../..')
const SKIP_DIRS = new Set(['node_modules', '.nuxt', '.output', '.playground'])
const CALL = /\b(?:useFetch|useLazyFetch|useAsyncData|useLazyAsyncData)\s*[<(]/g

function vueFilesUnder(dir: string, out: string[], extensions: readonly string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) vueFilesUnder(full, out, extensions)
    else if (extensions.some(ext => name.endsWith(ext))) out.push(full)
  }
}

export function appVueFiles(): string[] {
  return appSourceFiles(['.vue'])
}

/** Quelldateien unter `packages/* /app` und `apps/* /app` mit einer der Endungen. */
export function appSourceFiles(extensions: readonly string[]): string[] {
  const out: string[] = []
  for (const root of ['packages', 'apps']) {
    const base = join(REPO, root)
    for (const unit of readdirSync(base)) {
      const app = join(base, unit, 'app')
      try {
        if (statSync(app).isDirectory()) vueFilesUnder(app, out, extensions)
      }
      catch { /* Ordner ohne app/ */ }
    }
  }
  return out
}

export function openFetchCount(source: string): number {
  let open = 0
  for (const match of source.matchAll(CALL)) {
    const index = match.index ?? 0
    const lineStart = source.lastIndexOf('\n', index) + 1
    const linePrefix = source.slice(lineStart, index).trim()
    if (linePrefix.startsWith('//') || linePrefix.startsWith('*')) continue
    const before = source.slice(Math.max(0, index - 600), index)
    const destructured = before.match(/\{([^{}]*)\}\s*=\s*(?:await\s+)?$/)
    if (destructured) {
      if (!/\berror\b/.test(destructured[1]!)) open++
      continue
    }
    // Auch `const x = bedingung ? await useFetch(…) : null` (PostFeed, LZ1).
    const named = before.match(/(?:const|let)\s+(\w+)\s*=\s*(?:[^;\n]*\?\s*)?(?:await\s+)?$/)
    if (named) {
      if (!source.includes(`${named[1]}.error`)) open++
      continue
    }
    open++
  }
  return open
}

/** `Datei (relativ zum Repo) → Zahl offener Abrufe`, nur Dateien mit mindestens einem. */
export function scanOpenFetches(): Record<string, number> {
  const result: Record<string, number> = {}
  for (const file of appVueFiles()) {
    const count = openFetchCount(readFileSync(file, 'utf8'))
    if (count > 0) result[relative(REPO, file)] = count
  }
  return result
}
