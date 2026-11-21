import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * WÄCHTER: JEDER `<U…>`-BAUSTEIN IN EINER VORLAGE IST EINER, DEN DIE
 * BIBLIOTHEK AUSLIEFERT (FE-003, Q15, 2026-11-21).
 *
 * Anlass: `UButtonGroup` heißt seit Nuxt UI 4 `UFieldGroup`. Zwei
 * Dashboard-Seiten (Mitglieder, Statistik) trugen den alten Namen weiter. Vue
 * löst einen unbekannten Namen nicht auf: der Server schrieb an der Stelle
 * einen Kommentar, der Browser ein unbekanntes Element `<ubuttongroup>` —
 * „Hydration completed but contains mismatches", und die Knöpfe standen ohne
 * die Gruppen-Optik da. Weder Typecheck noch Lint noch ein Unit-Test sehen
 * das; der Dev-Server sagt es nur in der Browser-Konsole („Failed to resolve
 * component").
 *
 * Geprüft wird gegen die DATEIEN der installierten Bibliothek — nach einem
 * Versions-Sprung, der einen Baustein umbenennt, wird der Wächter also von
 * selbst rot und nennt jede Stelle.
 *
 * WAS ER NICHT SIEHT: dynamische Namen (`<component :is>`), Bausteine in
 * Render-Funktionen (`h(resolveComponent('U…'))`) und eigene Bausteine ohne
 * `U`-Vorsilbe.
 */

const REPO = resolve(import.meta.dirname, '../../..')
const LIBRARY = resolve(import.meta.dirname, '../node_modules/@nuxt/ui/dist/runtime/components')
const SKIP_DIRS = new Set(['node_modules', '.nuxt', '.output', '.playground', 'dist'])

function vueFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) vueFiles(full, out)
    else if (name.endsWith('.vue')) out.push(full)
  }
  return out
}

/** Namen, wie Nuxt UI sie registriert: Dateiname mit der Vorsilbe `U` (Unterordner zählen nicht mit). */
const shipped = new Set(vueFiles(LIBRARY).map(file => `U${basename(file, '.vue')}`))

/** Alle `<U…>`-Namen einer Vorlage, die die Bibliothek nicht kennt. Eigene Bausteine wie `UserAvatar` beginnen nicht mit `U` + Großbuchstabe. */
function unknownIn(source: string, known: Set<string>): string[] {
  const template = source.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '')
  const names = new Set([...template.matchAll(/<(U[A-Z][A-Za-z0-9]*)/g)].map(match => match[1]!))
  return [...names].filter(name => !known.has(name)).sort()
}

function appDirs(): string[] {
  const dirs: string[] = []
  for (const group of ['packages', 'apps']) {
    const root = join(REPO, group)
    for (const name of readdirSync(root)) dirs.push(join(root, name, 'app'))
  }
  return dirs
}

describe('Wächter: Bausteine der Bibliothek beim richtigen Namen', () => {
  it('liest die Bibliothek wirklich (sonst wäre alles unbekannt oder nichts geprüft)', () => {
    expect(shipped.size).toBeGreaterThan(100)
    for (const name of ['UButton', 'UTable', 'UFieldGroup', 'UDashboardPanel', 'UColorModeButton']) expect(shipped.has(name), name).toBe(true)
  })

  it('GEGENPROBE: der alte Name fällt auf, Kommentare und eigene Bausteine nicht', () => {
    expect(shipped.has('UButtonGroup')).toBe(false)
    expect(unknownIn('<template><UButtonGroup size="sm"><UButton /></UButtonGroup></template>', shipped)).toEqual(['UButtonGroup'])
    expect(unknownIn('<template><!-- früher <UButtonGroup> --><UserAvatar /><UFieldGroup /></template>', shipped)).toEqual([])
  })

  it('keine Vorlage nennt einen Baustein, den die Bibliothek nicht ausliefert', () => {
    const files = appDirs().flatMap(dir => vueFiles(dir))
    expect(files.length).toBeGreaterThan(300)
    const offenders = files
      .map(file => ({ file: relative(REPO, file), unknown: unknownIn(readFileSync(file, 'utf8'), shipped) }))
      .filter(entry => entry.unknown.length > 0)
      .map(entry => `${entry.file}: ${entry.unknown.join(', ')}`)
    expect(offenders).toEqual([])
  })
})
