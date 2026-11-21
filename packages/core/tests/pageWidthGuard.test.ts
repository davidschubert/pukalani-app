import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * WÄCHTER: DIE SEITENBREITE KOMMT AUS EINER VARIABLE (UI-002, Q25).
 *
 * Davids Entscheidungen (DECISION-LOG 2026-08-20, 2026-08-23, 2026-11-21):
 *  - öffentliche Seiten sind so breit wie `--ui-container` (90rem überall,
 *    80rem auf branding.supply — gesetzt an EINER Stelle je App);
 *  - Dashboard und Kundenbereich sind 1280 px (`max-w-7xl`), weil dort eine
 *    Seitenleiste danebensteht.
 *
 * Geprüft wird die äußere Hülle einer Seite: ein `class="…mx-auto…"` mit einem
 * `max-w-…`. Zwei Fehler sind rot:
 *  (a) eine öffentliche Seite deckelt fest mit `max-w-7xl` (sie folgte dann der
 *      Variable nicht, eine App-eigene Breite griffe dort nicht);
 *  (b) eine Seite unter `/dashboard/` deckelt mit `max-w-(--ui-container)`
 *      (sie wäre auf 90rem-Sites breiter als ihre Nachbarn).
 * Schmalere Lesebreiten (`max-w-2xl` … `max-w-6xl`) bleiben erlaubt: wer
 * schmaler sein will, begrenzt sich selbst.
 */

const REPO = resolve(import.meta.dirname, '../../..')
const SKIP_DIRS = new Set(['node_modules', '.nuxt', '.output', '.playground'])

/** Ausnahmen — Schlüssel `Datei`, Wert = Grund in einem Satz. */
const EXCEPTIONS: Record<string, string> = {}

function vueFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...vueFiles(full))
    else if (name.endsWith('.vue')) out.push(full)
  }
  return out
}

function pageFiles(): string[] {
  const files: string[] = []
  for (const root of ['packages', 'apps']) {
    for (const entry of readdirSync(join(REPO, root))) {
      files.push(...vueFiles(join(REPO, root, entry, 'app', 'pages')))
    }
  }
  return files
}

/** Alle `class`-Werte einer Datei, die `mx-auto` tragen. */
function hullClasses(source: string): string[] {
  return [...source.matchAll(/\bclass="([^"]*)"/g)]
    .map(match => match[1] ?? '')
    .filter(value => /(?:^|\s)mx-auto(?:\s|$)/.test(value))
}

function violations(): string[] {
  const found: string[] = []
  for (const file of pageFiles()) {
    const rel = relative(REPO, file)
    if (EXCEPTIONS[rel]) continue
    const isDashboard = rel.includes('/pages/dashboard/')
    for (const value of hullClasses(readFileSync(file, 'utf8'))) {
      if (!isDashboard && /(?:^|\s)(?:[a-z]+:)?max-w-7xl(?:\s|$)/.test(value)) found.push(`${rel}: öffentliche Seite mit fester Hülle max-w-7xl`)
      if (isDashboard && value.includes('max-w-(--ui-container)')) found.push(`${rel}: Dashboard-Seite mit max-w-(--ui-container)`)
    }
  }
  return found
}

describe('Seitenbreite (UI-002)', () => {
  it('öffentliche Seiten lesen --ui-container, Dashboard-Seiten bleiben bei max-w-7xl', () => {
    expect(violations()).toEqual([])
  })

  it('der Prüfer erkennt beide Fehler (Gegenprobe)', () => {
    expect(hullClasses('<div class="@container mx-auto max-w-7xl">')).toEqual(['@container mx-auto max-w-7xl'])
    expect(hullClasses('<div class="max-w-7xl">')).toEqual([])
  })

  it('jede Ausnahme zeigt auf eine Datei, die es gibt', () => {
    for (const file of Object.keys(EXCEPTIONS)) expect(existsSync(join(REPO, file)), file).toBe(true)
  })
})
