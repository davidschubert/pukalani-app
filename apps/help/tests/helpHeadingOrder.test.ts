import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * KEINE ÜBERSPRUNGENE ÜBERSCHRIFTEN-EBENE IN DER HILFE (UX-011, Teil 5).
 *
 * Die Seite setzt den Titel als `h1`; im Text beginnt jeder Abschnitt mit `##`.
 * Unter „Der Einrichtungs-Assistent" standen `####` direkt unter `##` — ein
 * Vorleseprogramm hört dann eine Gliederung mit Loch, axe meldet
 * `heading-order`. Der Test liest jede Inhalts-Datei beider Sprachen und
 * verlangt: eine Überschrift ist höchstens EINE Ebene tiefer als die vor ihr
 * (die erste höchstens `##`). Code-Blöcke zählen nicht.
 */
const CONTENT = join(process.cwd(), 'content')

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return markdownFiles(path)
    return entry.name.endsWith('.md') ? [path] : []
  })
}

/** Die Sprünge einer Datei, als `Zeile: ## → ####`. */
function headingJumps(markdown: string): string[] {
  const jumps: string[] = []
  let previous = 1
  let inFence = false
  markdown.split('\n').forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (inFence) return
    const match = /^(#{1,6})\s/.exec(line)
    if (!match) return
    const level = match[1]!.length
    if (level > previous + 1) jumps.push(`${index + 1}: ${'#'.repeat(previous)} → ${'#'.repeat(level)}`)
    previous = level
  })
  return jumps
}

describe('Hilfe: Überschriften-Ebenen', () => {
  it('erkennt einen Sprung und lässt Code-Blöcke aus (Gegenprobe der Regel)', () => {
    expect(headingJumps('## A\n#### B')).toEqual(['2: ## → ####'])
    expect(headingJumps('## A\n### B\n## C\n### D')).toEqual([])
    expect(headingJumps('## A\n```\n#### kein Kopf\n```\n### B')).toEqual([])
  })

  const files = markdownFiles(CONTENT)

  it('findet Inhalte beider Sprachen', () => {
    expect(files.length).toBeGreaterThan(10)
    expect(files.some(file => relative(CONTENT, file).startsWith('de/'))).toBe(true)
  })

  it.each(files.map(file => [relative(CONTENT, file), file]))('%s springt keine Ebene', (_name, file) => {
    expect(headingJumps(readFileSync(file, 'utf8'))).toEqual([])
  })
})
