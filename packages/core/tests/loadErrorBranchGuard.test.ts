import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appSourceFiles, REPO } from './support/fetchErrorScan'

/**
 * WÄCHTER: DER FEHLERZWEIG STEHT NICHT IM DATEN-ZWEIG (LZ1, Bahn 4).
 *
 * Gefunden im Browser: zwei Seiten hatten `<CoreLoadError>` INNERHALB von
 * `v-else-if="rows.length > 0"`. Fehlt der Abruf, ist die Liste leer — der
 * Daten-Zweig wird nie gezeichnet, und die Seite sagt „leer" statt „Fehler".
 * Weder Lint noch Typecheck noch `listStateBacklog` sehen das, denn `error`
 * wird ja gelesen.
 *
 * Geprüft wird: kein Vorfahr eines `<CoreLoadError>`/`<CoreListState>` trägt
 * eine Bedingung, die eine Länge, Größe oder Anzahl verlangt (und nicht selbst
 * nach dem Fehler fragt — `error`, `loadFailed` …). Erkannt wird über die Einrückung der Vorlage.
 */
const STATE_TAG = /<(?:CoreLoadError|CoreListState)\b/
const NEEDS_ROWS = /v-(?:else-)?if="([^"]*(?:\.length|\.size\b|\btotal\b|\bcount\b)[^"]*)"/

export function branchesHidingError(source: string): string[] {
  const lines = source.split('\n')
  const hits: string[] = []
  lines.forEach((line, index) => {
    if (!STATE_TAG.test(line)) return
    let indent = line.length - line.trimStart().length
    for (let j = index - 1; j >= 0 && indent > 0; j--) {
      const text = lines[j]!
      const trimmed = text.trimStart()
      const own = text.length - trimmed.length
      if (own >= indent || !trimmed.startsWith('<') || trimmed.startsWith('</') || trimmed.startsWith('<!--')) continue
      indent = own
      // Das öffnende Tag kann über mehrere Zeilen gehen: bis zum nächsten Tag-Anfang lesen.
      const tag = [trimmed, ...lines.slice(j + 1, j + 6).map(l => l.trim()).filter((_, k, a) => !a.slice(0, k + 1).some(x => x.startsWith('<')))].join(' ')
      const cond = tag.match(NEEDS_ROWS)?.[1]
      if (cond && !/error|[Ff]ail/.test(cond)) hits.push(`Zeile ${index + 1}: im Zweig „${cond}"`)
    }
  })
  return hits
}

describe('Fehlerzweig steht nicht im Daten-Zweig (LZ1)', () => {
  it('keine Seite versteckt ihren Fehler hinter „es gibt Zeilen"', () => {
    const bad: string[] = []
    for (const file of appSourceFiles(['.vue'])) {
      for (const hit of branchesHidingError(readFileSync(file, 'utf8'))) bad.push(`${relative(REPO, file)} ${hit}`)
    }
    expect(bad, 'den Fehlerzweig VOR den Leer-Zustand ziehen').toEqual([])
  })

  it('Gegenprobe: die alte Form ist rot, die neue grün', () => {
    const old = [
      '<template>',
      '  <div>',
      '    <CoreEmptyState v-if="rows.length === 0" />',
      '    <div v-else-if="rows.length > 0" class="mt-4">',
      '      <div v-if="error && !data" role="alert">',
      '        <CoreLoadError :retry="refresh" />',
      '      </div>',
      '      <UTable v-else :data="rows" />',
      '    </div>',
      '  </div>',
      '</template>',
    ].join('\n')
    const fixed = [
      '<template>',
      '  <div>',
      '    <div v-if="error && !data" role="alert">',
      '      <CoreLoadError :retry="refresh" />',
      '    </div>',
      '    <CoreEmptyState v-else-if="rows.length === 0" />',
      '    <div v-else class="mt-4">',
      '      <UTable :data="rows" />',
      '    </div>',
      '  </div>',
      '</template>',
    ].join('\n')
    expect(branchesHidingError(old)).toHaveLength(1)
    expect(branchesHidingError(fixed)).toEqual([])
  })
})

/**
 * EIN LADE-ZEICHEN (UI-008, Bahn 4): „lädt" ist der offene Kreis aus
 * `icons.loading` — eine Seite nimmt `<CoreLoadingState>`, ein kleines Zeichen
 * in Zeile oder Knopf dasselbe Symbol. Der Strahlenkranz `i-ph-spinner` stand
 * daneben und drehte auf derselben Seite anders als der Knopf.
 */
const OTHER_SPINNER = /i-ph-spinner(?:-gap)?\b/g

describe('ein Lade-Zeichen (UI-008)', () => {
  it('kein `i-ph-spinner` in app-Code', () => {
    const bad = appSourceFiles(['.vue', '.ts'])
      .filter(file => readFileSync(file, 'utf8').match(OTHER_SPINNER) !== null)
      .map(file => relative(REPO, file))
    expect(bad, 'CoreLoadingState oder i-ph-circle-notch nehmen').toEqual([])
  })

  it('Gegenprobe: die Erkennung trifft beide Varianten, nicht den Kreis', () => {
    expect('<UIcon name="i-ph-spinner" /> icon="i-ph-spinner-gap"'.match(OTHER_SPINNER)).toHaveLength(2)
    expect('<UIcon name="i-ph-circle-notch" />'.match(OTHER_SPINNER)).toBeNull()
  })
})
