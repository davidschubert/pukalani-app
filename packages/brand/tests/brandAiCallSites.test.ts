import { globSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * JEDER MODELL-AUFRUF GIBT DIE ROUTING-KONSTANTE SEINER FAMILIE MIT (Finding
 * BE-004, 2026-11-13) — das ist die eigentliche Absicherung gegen die
 * Wiederholung.
 *
 * Der Vorfall: `brandMarkDrafts.ts` rief `aiImage` mit der BASIS
 * `BRAND_PROVIDER_ROUTING`. Die Basis ist seit AI1 auf die zwei EU-Endpunkte
 * des TEXTmodells gepinnt, das Bildmodell hat keinen davon — jeder Aufruf
 * 404, jeder Lauf leer, und weder Typecheck noch Lint noch ein Test sahen es:
 * alle drei Konstanten haben denselben Typ, und welche ein Aufrufer mitgibt,
 * ist eine Frage an den QUELLTEXT. Also wird der Quelltext gelesen.
 *
 * DIE DREI FAMILIEN (Transport ⇒ Konstante):
 *   · `aiImage`                         ⇒ `BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL`
 *   · `aiVision*` / `aiVideo*`          ⇒ `BRAND_PROVIDER_ROUTING_VERTEX_EU`
 *   · `aiComplete*` (Text, auch Stream) ⇒ `BRAND_PROVIDER_ROUTING`
 *
 * market und insights beziehen die Konstanten über ihren
 * `server/contracts/brandContract.ts` — derselbe Name, dieselbe Konstante.
 * Zwei insights-Routen reichen `run.providerRouting` durch, das
 * `insightsAi.ts` baut; diese DELEGATION steht unten ausdrücklich, und die
 * Quelle wird mitgeprüft — ein Durchreichen, das nirgends belegt ist, ist ein
 * Verstoss.
 *
 * KOMMENTARE TÄUSCHEN DEN SCAN NICHT: sie werden vor dem Abgleich entfernt
 * (ein Kommentar „statt `BRAND_PROVIDER_ROUTING`" steht in `brief.post.ts`).
 * Und ein Scan, der 0 Aufrufe findet, ist nicht grün — die Mindestzahlen
 * unten halten ihn ehrlich.
 */

type AiFamily = 'image' | 'eu' | 'text'

const TRANSPORTS: Readonly<Record<AiFamily, readonly string[]>> = {
  image: ['aiImage'],
  eu: ['aiVision', 'aiVisionJson', 'aiVideo', 'aiVideoDetailed', 'aiVideoJson', 'aiVideoJsonDetailed'],
  text: ['aiComplete', 'aiCompleteDetailed', 'aiCompleteJson', 'aiCompleteJsonDetailed', 'aiCompleteStream'],
}

const EXPECTED: Readonly<Record<AiFamily, string>> = {
  image: 'BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL',
  eu: 'BRAND_PROVIDER_ROUTING_VERTEX_EU',
  text: 'BRAND_PROVIDER_ROUTING',
}

/** Erkennt eine Typ-Angabe statt eines Wertes (`boolean`, `readonly`, `?:`). */
const TYPE_LITERAL = /\b(?:boolean|string|number|readonly)\b|\?:/

const CONSTANT = /\bBRAND_PROVIDER_ROUTING(?:_VERTEX_EU|_VERTEX_GLOBAL)?\b/g

interface AiSource {
  readonly path: string
  readonly source: string
}

interface AiCallSiteReport {
  readonly counts: Record<AiFamily, number>
  readonly violations: readonly string[]
}

/**
 * KOMMENTARE ENTFERNEN — mit Blick auf Zeichenketten und Regex-Literale.
 * Ein `'https://…'` ist kein Zeilenkommentar, ein `'**\/*.ts'` kein Block.
 * Kommentare werden durch Leerzeichen ersetzt (Zeilenumbrüche bleiben).
 */
function stripComments(source: string): string {
  let out = ''
  let index = 0
  let lastSignificant = ''
  while (index < source.length) {
    const char = source[index]!
    const next = source[index + 1]
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index++
      continue
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2)
      const stop = end === -1 ? source.length : end + 2
      out += source.slice(index, stop).replace(/[^\n]/g, ' ')
      index = stop
      continue
    }
    if (char === '\'' || char === '"' || char === '`') {
      let cursor = index + 1
      while (cursor < source.length && source[cursor] !== char) {
        cursor += source[cursor] === '\\' ? 2 : 1
      }
      out += source.slice(index, cursor + 1)
      index = cursor + 1
      lastSignificant = char
      continue
    }
    if (char === '/' && (lastSignificant === '' || '(,=:[!&|?{};'.includes(lastSignificant))) {
      // Ein Regex-Literal: bis zum unmaskierten `/` ausserhalb einer Klasse.
      let cursor = index + 1
      let inClass = false
      while (cursor < source.length && source[cursor] !== '\n') {
        const current = source[cursor]
        if (current === '\\') { cursor += 2; continue }
        if (current === '[') inClass = true
        else if (current === ']') inClass = false
        else if (current === '/' && !inClass) break
        cursor++
      }
      out += source.slice(index, cursor + 1)
      index = cursor + 1
      lastSignificant = '/'
      continue
    }
    out += char
    if (!/\s/.test(char)) lastSignificant = char
    index++
  }
  return out
}

/** Der Text in den Klammern ab `open` (dem Index der öffnenden Klammer). */
function balanced(source: string, open: number, left: string, right: string): string {
  let depth = 0
  for (let cursor = open; cursor < source.length; cursor++) {
    const char = source[cursor]
    if (char === '\'' || char === '"' || char === '`') {
      let end = cursor + 1
      while (end < source.length && source[end] !== char) end += source[end] === '\\' ? 2 : 1
      cursor = end
      continue
    }
    if (char === left) depth++
    else if (char === right) {
      depth--
      if (depth === 0) return source.slice(open + 1, cursor)
    }
  }
  return source.slice(open + 1)
}

/** Alle Werte von `providerRouting:` in einem Text — als Ausdruck. */
function routingExpressions(text: string): string[] {
  const found: string[] = []
  // Nicht nach `.`: `run.providerRouting` ist ein WERT, kein Schlüssel.
  const re = /(?<![\w.$])providerRouting\b(\s*:\s*)?/g
  for (const match of text.matchAll(re)) {
    const start = (match.index ?? 0) + match[0].length
    if (!match[1]) {
      // Kurzschreibweise `{ providerRouting }` — ein Durchreichen.
      found.push('providerRouting')
      continue
    }
    if (text[start] === '{') found.push(`{${balanced(text, start, '{', '}')}}`)
    else found.push(/^[\w.$]+/.exec(text.slice(start))?.[0] ?? '')
  }
  return found
}

/**
 * DIE PRÜFUNG — pur: Quelltexte rein, Zählung und Verstösse raus.
 *
 * `delegates`: Aufrufer-Pfad ⇒ Pfad der Quelle, die das durchgereichte
 * Routing baut. Die Quelle muss dann selbst die erwartete Konstante tragen.
 */
function checkAiCallSites(
  files: readonly AiSource[],
  delegates: Readonly<Record<string, string>> = {},
): AiCallSiteReport {
  const counts: Record<AiFamily, number> = { image: 0, eu: 0, text: 0 }
  const violations: string[] = []
  const byPath = new Map(files.map(file => [file.path, stripComments(file.source)]))

  for (const [path, code] of byPath) {
    for (const family of Object.keys(TRANSPORTS) as AiFamily[]) {
      const names = TRANSPORTS[family].join('|')
      const call = new RegExp(`(?<![\\w.$])(${names})\\s*(?:<[^()]*?>)?\\s*\\(`, 'g')
      for (const match of code.matchAll(call)) {
        counts[family]++
        const where = `${path} · ${match[1]}`
        const open = (match.index ?? 0) + match[0].length - 1
        const args = balanced(code, open, '(', ')')
        const expressions = routingExpressions(args)
        if (expressions.length !== 1) {
          violations.push(`${where}: ${expressions.length === 0 ? 'kein' : 'mehr als ein'} providerRouting`)
          continue
        }
        const expression = expressions[0]!
        const constants = [...expression.matchAll(CONSTANT)].map(hit => hit[0])
        if (constants.length > 0) {
          if (constants.length !== 1 || constants[0] !== EXPECTED[family]) {
            violations.push(`${where}: gibt ${constants.join(', ')} mit, verlangt ${EXPECTED[family]}`)
          }
          continue
        }
        // Keine Konstante im Ausdruck ⇒ Durchreichen. Nur mit belegter Quelle.
        const sourcePath = delegates[path]
        const delegate = sourcePath ? byPath.get(sourcePath) : undefined
        if (!delegate) {
          violations.push(`${where}: reicht ${expression || '?'} durch, ohne belegte Quelle`)
          continue
        }
        // TYP-ANGABEN zählen nicht: `providerRouting: { zdr: boolean, … }` in
        // einem Interface ist keine Fassung, die gebaut wird.
        const built = routingExpressions(delegate).filter(value => !TYPE_LITERAL.test(value))
        const builtConstants = built.flatMap(value => [...value.matchAll(CONSTANT)].map(hit => hit[0]))
        if (built.length === 0 || builtConstants.length !== built.length
          || builtConstants.some(name => name !== EXPECTED[family])) {
          violations.push(`${where}: Quelle ${sourcePath} baut ${builtConstants.join(', ') || 'nichts'}, verlangt ${EXPECTED[family]}`)
        }
      }
    }

    // DATEI-REGEL für das Bilder-Erzeugen: wer `aiImage` ruft, nennt KEINE
    // andere Routing-Konstante — auch nicht in einem Import, der „nur so"
    // mitläuft (genau so sah der Fehler aus).
    if (new RegExp(`(?<![\\w.$])(${TRANSPORTS.image.join('|')})\\s*\\(`).test(code)) {
      const others = [...new Set([...code.matchAll(CONSTANT)].map(hit => hit[0]))]
        .filter(name => name !== EXPECTED.image)
      if (others.length > 0) violations.push(`${path}: ruft aiImage und nennt ${others.join(', ')}`)
    }
  }
  return { counts, violations }
}

// ── Der echte Baum ─────────────────────────────────────────────────────────

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SCAN_DIRS = ['packages/brand/server', 'packages/market/server', 'packages/insights/server']

function readTree(): AiSource[] {
  return SCAN_DIRS.flatMap(dir =>
    globSync(`${dir}/**/*.ts`, { cwd: repoRoot }).map(path => ({
      path: relative(repoRoot, join(repoRoot, path)),
      source: readFileSync(join(repoRoot, path), 'utf8'),
    })))
}

/** Die zwei Redaktions-Routen reichen `run.providerRouting` aus `insightsAi.ts` durch. */
const DELEGATES: Readonly<Record<string, string>> = {
  'packages/insights/server/api/insights/posts/[id]/draft.post.ts': 'packages/insights/server/utils/insightsAi.ts',
  'packages/insights/server/api/insights/posts/[id]/translate.post.ts': 'packages/insights/server/utils/insightsAi.ts',
}

/**
 * MINDESTZAHLEN — Stand 2026-11-13: 1 Bild-Aufruf (Zeichen-Entwürfe), 2
 * Vision/Video (Inspirationslesung, Videolesen der Redaktion), 10 Text. Fällt
 * eine Zahl darunter, ist eher der Scan kaputt als der Code verschwunden —
 * wer wirklich einen Aufrufer entfernt, senkt die Zahl hier bewusst.
 */
const MINIMUM: Readonly<Record<AiFamily, number>> = { image: 1, eu: 2, text: 10 }

describe('Aufrufstellen im echten Baum (brand, market, insights)', () => {
  const report = checkAiCallSites(readTree(), DELEGATES)

  it('jeder Aufruf gibt die Konstante seiner Familie mit', () => {
    expect(report.violations).toEqual([])
  })

  it('findet mindestens so viele Aufrufe wie heute — ein leerer Scan ist nicht grün', () => {
    for (const family of Object.keys(MINIMUM) as AiFamily[]) {
      expect(report.counts[family], family).toBeGreaterThanOrEqual(MINIMUM[family])
    }
  })
})

describe('checkAiCallSites — Gegenproben', () => {
  it('GEGENPROBE: aiImage mit der Basis ist ein Verstoss (der Vorfall selbst)', () => {
    const report = checkAiCallSites([{
      path: 'x.ts',
      source: `import { BRAND_PROVIDER_ROUTING } from './brandProviderRouting'
        await aiImage(event, prompt, { model, providerRouting: { ...BRAND_PROVIDER_ROUTING } })`,
    }])
    expect(report.counts.image).toBe(1)
    expect(report.violations.length).toBeGreaterThanOrEqual(1)
    expect(report.violations.join('\n')).toContain('verlangt BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL')
  })

  it('GEGENPROBE: aiImage richtig gepinnt, aber die Basis steht daneben im Code', () => {
    const report = checkAiCallSites([{
      path: 'y.ts',
      source: `const fallback = BRAND_PROVIDER_ROUTING
        await aiImage(event, prompt, { providerRouting: { ...BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL } })`,
    }])
    expect(report.violations).toEqual(['y.ts: ruft aiImage und nennt BRAND_PROVIDER_ROUTING'])
  })

  it('GEGENPROBE: Vision mit der Basis, Text mit der Vertex-Fassung, Video ohne Routing', () => {
    const report = checkAiCallSites([{
      path: 'z.ts',
      source: `await aiVisionJson<Raw>(event, images, prompt, { providerRouting: { ...BRAND_PROVIDER_ROUTING } })
        await aiCompleteJson<unknown>(event, prompt, { providerRouting: { ...BRAND_PROVIDER_ROUTING_VERTEX_EU } })
        await aiVideoJsonDetailed(event, urls, prompt, { model })`,
    }])
    expect(report.counts).toEqual({ image: 0, eu: 2, text: 1 })
    expect(report.violations).toHaveLength(3)
  })

  it('ein Kommentar mit der falschen Konstante täuscht den Scan nicht', () => {
    const report = checkAiCallSites([{
      path: 'k.ts',
      source: `// früher: BRAND_PROVIDER_ROUTING — das war BE-004
        /* auch hier: BRAND_PROVIDER_ROUTING_VERTEX_EU */
        const url = 'https://openrouter.ai' // kein Kommentar-Anfang im String
        await aiImage(event, prompt, { providerRouting: { ...BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL } })`,
    }])
    expect(report.violations).toEqual([])
    expect(report.counts.image).toBe(1)
  })

  it('GEGENPROBE: ein Kommentar MIT dem richtigen Namen rettet einen falschen Aufruf nicht', () => {
    const report = checkAiCallSites([{
      path: 'c.ts',
      source: `await aiImage(event, prompt, {
          // BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL wäre richtig
          providerRouting: { ...BRAND_PROVIDER_ROUTING },
        })`,
    }])
    expect(report.violations.join('\n')).toContain('gibt BRAND_PROVIDER_ROUTING mit')
  })

  it('Durchreichen braucht eine belegte Quelle mit der richtigen Konstante', () => {
    const caller = { path: 'route.ts', source: 'await aiCompleteJsonDetailed<unknown>(event, p, { providerRouting: run.providerRouting })' }
    const good = { path: 'run.ts', source: 'return { model, providerRouting: { ...BRAND_PROVIDER_ROUTING } }' }
    const bad = { path: 'run.ts', source: 'return { model, providerRouting: { ...BRAND_PROVIDER_ROUTING_VERTEX_EU } }' }
    expect(checkAiCallSites([caller, good], { 'route.ts': 'run.ts' }).violations).toEqual([])
    expect(checkAiCallSites([caller, bad], { 'route.ts': 'run.ts' }).violations).toHaveLength(1)
    // GEGENPROBE: ohne Eintrag ist das Durchreichen nicht belegt.
    expect(checkAiCallSites([caller, good]).violations).toHaveLength(1)
  })
})
