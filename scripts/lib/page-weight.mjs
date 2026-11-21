/**
 * SKRIPT-GEWICHT DER STARTSEITE (Q22, PERF-006/PERF-010) — die reine Rechnung.
 *
 * Nuxts Client-Manifest (`.nuxt/dist/server/client.manifest.mjs`) kennt je
 * Quelldatei ihre Ausgabe-Datei und deren statische `imports`. Was die
 * Startseite beim ersten Aufruf lädt, ist die transitive Hülle aus dem
 * Einstieg (`isEntry`), der Seite und ihrem Layout — genau die Dateien, die
 * Nuxt als `modulepreload` in das HTML schreibt. Nachgeladene Teile
 * (`dynamicImports`) zählen nicht mit: die holt der Browser erst bei Bedarf.
 *
 * Gemessen wird GEPACKT (gzip, Stufe 6 wie nginx), weil Production seit Q04
 * gepackt ausliefert; die Grenzen stehen in `page-weight-budgets.mjs`.
 */
import { gzipSync } from 'node:zlib'

/**
 * @param {Record<string, { file?: string, isEntry?: boolean, imports?: string[], resourceType?: string }>} manifest
 * @param {string[]} roots Schlüssel der Seite und ihres Layouts im Manifest
 * @returns {{ files: string[], missing: string[] }}
 */
export function startPageScripts(manifest, roots) {
  const entries = Object.keys(manifest).filter(key => manifest[key]?.isEntry)
  const missing = roots.filter(key => !manifest[key])
  const seen = new Set()
  const files = new Set()
  const queue = [...entries, ...roots.filter(key => manifest[key])]
  while (queue.length > 0) {
    const key = queue.pop()
    if (key === undefined || seen.has(key)) continue
    seen.add(key)
    const item = manifest[key]
    if (!item) continue
    if (item.file && item.file.endsWith('.js')) files.add(item.file)
    for (const next of item.imports ?? []) queue.push(next)
  }
  if (entries.length === 0) missing.push('(isEntry)')
  return { files: [...files].sort(), missing }
}

/** @param {Buffer | string} content */
export function gzipBytes(content) {
  return gzipSync(content, { level: 6 }).length
}
