/**
 * Wächter für die Datenschutz-Bindung der KI-Aufrufe (P17, SEC-005).
 *
 * Warum es das gibt: welche Bindung ein Aufruf mitgibt, ist eine Frage an den
 * QUELLTEXT — alle Konstanten haben denselben Typ, und ein Ort ohne passenden
 * Endpunkt fällt erst als 404 im Betrieb auf. Seit P17 bindet der Text-
 * Transport selbst (keine Speicherung, kein Sammeln, kein Ausweichen, Rechen-
 * ort Europa); dieser Wächter hält fest, was die Aufrufstellen darüber hinaus
 * angeben, und LISTET jede einzelne:
 *
 *   1. Jeder Aufruf von `aiComplete*`/`aiCompleteStream` (Text), `aiVision*`,
 *      `aiVideo*` und `aiImage` in `packages/<x>/server` und `apps/<x>/server`
 *      gibt als `providerRouting` entweder NICHTS (nur Text: die
 *      EU-Voreinstellung des Transports), eine BENANNTE Konstante aus
 *      `ROUTING_CONSTANTS` (`NAME` oder `{ ...NAME }`) oder ein eingetragenes
 *      Durchreichen (`DELEGATES`) mit. Ein loses Objekt-Literal, ein
 *      unbekannter Name oder Bild/Vision/Video ohne Angabe ist rot.
 *   2. Jeder Ort der Tabelle liegt in der EU (`isEuEndpoint`) — oder die
 *      Konstante trägt eine `exception` mit Grund und Entscheidung.
 *   3. Niemand ruft `chat/completions` am Transport vorbei — ausser den
 *      eingetragenen Prüfskripten (`DIRECT_SCRIPTS`), und die senden die volle
 *      Bindung wörtlich.
 *   4. Ein Scan mit zu wenig Funden ist nicht grün (`MINIMUM`).
 *   5. JEDER `providerRouting`-Schlüssel im Server-Code trägt eine benannte
 *      Konstante, auch ausserhalb eines Aufrufs (`checkRoutingKeys`).
 *
 * Kommentare werden vor dem Abgleich entfernt (zeichenketten-fest), sonst
 * täuschte ein Kommentar mit dem richtigen Namen einen falschen Aufruf weg.
 *
 * Die Tabelle steht WÖRTLICH hier (nacktes `node`, kein Build, kein Import aus
 * TypeScript) und ist per Test an den Code gebunden:
 * `packages/core/tests/checkAiRouting.test.ts` (Core-Konstante) und
 * `packages/brand/tests/aiRoutingConstants.test.ts` (die drei brand-Konstanten).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isEuEndpoint } from './ops/ai-model-endpoints.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const TEXT_EU = ['amazon-bedrock/eu-west-1', 'google-vertex/europe']

/**
 * DIE ERLAUBTEN BINDUNGEN — Name ⇒ Orte, optional mit begründeter Ausnahme
 * vom Ort. Eine neue Konstante gehört hier hinein, sonst ist ihr Aufruf rot.
 */
export const ROUTING_CONSTANTS = {
  AI_TEXT_PROVIDER_ROUTING: { only: TEXT_EU },
  BRAND_PROVIDER_ROUTING: { only: TEXT_EU },
  BRAND_PROVIDER_ROUTING_VERTEX_EU: { only: ['google-vertex/eu'] },
  BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL: {
    only: ['google-vertex/global'],
    exception: {
      reason: 'Bildmodell hat keinen EU-Endpunkt; Betreiber durch den Pin festgelegt',
      decided: '2026-11-13, David',
    },
  },
}

/** Die Transporte je Familie — genau diese Namen, keine Präfix-Suche (`aiVideoUrlAllowed` ist keiner). */
export const FAMILIES = {
  text: ['aiComplete', 'aiCompleteDetailed', 'aiCompleteJson', 'aiCompleteJsonDetailed', 'aiCompleteStream'],
  vision: ['aiVision', 'aiVisionJson'],
  video: ['aiVideo', 'aiVideoDetailed', 'aiVideoJson', 'aiVideoJsonDetailed'],
  image: ['aiImage'],
}

/** Die fünf Transport-Dateien — die einzigen, die `chat/completions` kennen dürfen. */
export const TRANSPORT_FILES = [
  'packages/core/server/utils/aiComplete.ts',
  'packages/core/server/utils/aiCompleteStream.ts',
  'packages/core/server/utils/aiImage.ts',
  'packages/core/server/utils/aiVision.ts',
  'packages/core/server/utils/aiVideo.ts',
]

/** Aufrufer, die eine anderswo gebaute Bindung durchreichen ⇒ Quelle und ihre Konstante. */
export const DELEGATES = {
  'packages/insights/server/api/insights/posts/[id]/draft.post.ts': {
    source: 'packages/insights/server/utils/insightsAi.ts',
    constant: 'BRAND_PROVIDER_ROUTING',
  },
  'packages/insights/server/api/insights/posts/[id]/translate.post.ts': {
    source: 'packages/insights/server/utils/insightsAi.ts',
    constant: 'BRAND_PROVIDER_ROUTING',
  },
  'packages/insights/server/api/insights/posts/[id]/change-note.post.ts': {
    source: 'packages/insights/server/utils/insightsAi.ts',
    constant: 'BRAND_PROVIDER_ROUTING',
  },
}

/** Stand 2026-11-16: 21 Text, 1 Vision, 1 Video, 1 Bild — als Untergrenzen mit Luft. */
export const MINIMUM = { text: 15, vision: 1, video: 1, image: 1 }

/**
 * KOMMENTARE ENTFERNEN — mit Blick auf Zeichenketten und Regex-Literale.
 * EIN LESER FÜR BEIDE PRÜFUNGEN (WL1 d, seit 2026-11-17): diese Funktion,
 * `balanced` und `routingExpressions` nutzt auch
 * `packages/brand/tests/brandAiCallSites.test.ts` — bis dahin standen sie
 * dort ein zweites Mal, wortgleich. Kommentare
 * werden durch Leerzeichen ersetzt, Zeilenumbrüche bleiben (Zeilennummern).
 */
export function stripComments(source) {
  let out = ''
  let index = 0
  let lastSignificant = ''
  while (index < source.length) {
    const char = source[index]
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

/** Der Text in den Klammern ab `open` (Index der öffnenden Klammer). */
export function balanced(source, open, left, right) {
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

/** Alle Werte von `providerRouting` in einem Argument-Text — als Ausdruck. */
export function routingExpressions(text) {
  const found = []
  // Nicht nach `.`: `run.providerRouting` ist ein WERT, kein Schlüssel.
  const re = /(?<![\w.$])providerRouting\b(\s*:\s*)?/g
  for (const match of text.matchAll(re)) {
    const start = (match.index ?? 0) + match[0].length
    if (!match[1]) {
      found.push('providerRouting')
      continue
    }
    if (text[start] === '{') found.push(`{${balanced(text, start, '{', '}')}}`)
    else found.push(/^[\w.$]+/.exec(text.slice(start))?.[0] ?? '')
  }
  return found
}

/** `NAME` oder `{ ...NAME }` ⇒ der Name; alles andere ⇒ `null`. */
function constantName(expression) {
  const plain = /^([A-Z][A-Z0-9_]*)$/.exec(expression)
  if (plain) return plain[1]
  const spread = /^\{\s*\.\.\.([A-Z][A-Z0-9_]*)\s*,?\s*\}$/.exec(expression)
  return spread ? spread[1] : null
}

function lineOf(code, index) {
  let line = 1
  for (let i = 0; i < index; i++) if (code[i] === '\n') line++
  return line
}

/** Prüft die Tabelle selbst: Orte vorhanden, in der EU oder mit Ausnahme. */
export function checkRoutingConstants(table) {
  const violations = []
  for (const [name, entry] of Object.entries(table)) {
    if (!Array.isArray(entry.only) || entry.only.length === 0) {
      violations.push(`Tabelle: ${name} nennt keinen Ort (leere oder fehlende \`only\`-Liste)`)
      continue
    }
    const outside = entry.only.filter(tag => !isEuEndpoint(tag))
    const excepted = Boolean(entry.exception?.reason && entry.exception?.decided)
    if (outside.length > 0 && !excepted) {
      violations.push(`Tabelle: ${name} nennt ${outside.join(', ')} ausserhalb der EU — ohne eingetragene Ausnahme (reason + decided)`)
    }
  }
  return violations
}

/**
 * DIE PRÜFUNG — pur: Quelltexte rein, Aufrufstellen, Zählung und Verstösse
 * raus. `files`: `{ path, source }` mit Pfaden relativ zur Wurzel.
 */
export function checkAiRouting(files, { delegates = DELEGATES, minimum = MINIMUM, constants = ROUTING_CONSTANTS } = {}) {
  const sites = []
  const violations = []
  const counts = { text: 0, vision: 0, video: 0, image: 0 }
  const byPath = new Map(files.map(file => [file.path, stripComments(file.source)]))
  const names = Object.entries(FAMILIES).flatMap(([family, list]) => list.map(name => [name, family]))
  const familyOf = new Map(names)
  const call = new RegExp(`(?<![\\w.$])(${names.map(([name]) => name).join('|')})\\s*(?:<[^()]*?>)?\\s*\\(`, 'g')

  for (const [path, code] of byPath) {
    if (TRANSPORT_FILES.includes(path)) continue
    for (const match of code.matchAll(call)) {
      const transport = match[1]
      const family = familyOf.get(transport)
      counts[family]++
      const line = lineOf(code, match.index ?? 0)
      const open = (match.index ?? 0) + match[0].length - 1
      const expressions = routingExpressions(balanced(code, open, '(', ')'))
      const site = { path, line, transport, family, binding: '', only: [], status: 'VERSTOSS' }
      sites.push(site)
      const fail = (reason) => {
        site.binding = reason
        violations.push(`${path}:${line} ${transport} — ${reason}`)
      }

      if (expressions.length === 0) {
        if (family !== 'text') {
          fail(`${family === 'image' ? 'Bild' : family === 'vision' ? 'Vision' : 'Video'} ohne providerRouting — der Ort ist Pflicht`)
          continue
        }
        site.binding = 'Voreinstellung (AI_TEXT_PROVIDER_ROUTING)'
        site.only = constants.AI_TEXT_PROVIDER_ROUTING?.only ?? []
      }
      else if (expressions.length > 1) {
        fail('mehr als ein providerRouting')
        continue
      }
      else {
        const expression = expressions[0].trim()
        const name = constantName(expression)
        if (name) {
          if (!constants[name]) {
            fail(`unbekannte Konstante ${name} (nicht in ROUTING_CONSTANTS)`)
            continue
          }
          site.binding = name
          site.only = constants[name].only
        }
        else if (/^[\w$]+(?:\.[\w$]+)*$/.test(expression)) {
          const delegate = delegates[path]
          const sourceCode = delegate ? byPath.get(delegate.source) : undefined
          if (!delegate || sourceCode === undefined) {
            fail(`reicht ${expression} durch, ohne eingetragene Quelle (DELEGATES)`)
            continue
          }
          const builds = new RegExp(`\\{\\s*\\.\\.\\.${delegate.constant}\\s*\\}`).test(sourceCode)
          if (!builds || !constants[delegate.constant]) {
            fail(`Quelle ${delegate.source} baut nicht { ...${delegate.constant} }`)
            continue
          }
          site.binding = `${expression} ⇒ ${delegate.constant}`
          site.only = constants[delegate.constant].only
        }
        else {
          fail(`loses Objekt statt benannter Konstante: ${expression.replace(/\s+/g, ' ').slice(0, 60)}`)
          continue
        }
      }
      const excepted = Object.entries(constants).find(([, entry]) => entry.only === site.only)?.[1]?.exception
      site.status = site.only.every(tag => isEuEndpoint(tag)) ? 'EU' : (excepted ? 'AUSNAHME' : 'VERSTOSS')
      if (site.status === 'VERSTOSS') violations.push(`${path}:${line} ${transport} — Ort ausserhalb der EU ohne Ausnahme`)
    }
  }

  for (const [family, least] of Object.entries(minimum)) {
    if (counts[family] < least) {
      violations.push(`Scan: nur ${counts[family]} ${family}-Aufrufe gefunden, Mindestzahl ${least} — eher ist der Scan kaputt als der Code verschwunden`)
    }
  }
  return { sites, counts, violations }
}

/** Erkennt eine Typ-Angabe statt eines Wertes (`boolean`, `readonly`, `?:`). */
const TYPE_LITERAL = /\b(?:boolean|string|number|readonly)\b|\?:/

/**
 * JEDER `providerRouting`-SCHLÜSSEL IM SERVER-CODE, nicht nur der im Aufruf.
 *
 * Die Prüfung oben liest die Argumente eines Aufrufs. Wer die Optionen vorher
 * in einer Variablen baut (`const options = { providerRouting: { only: […] } }`
 * und dann `aiCompleteJson(event, prompt, options)`), stünde dort als
 * „Voreinstellung" — und sendete in Wahrheit einen eigenen Ort. Darum gilt
 * dieselbe Regel für jede Stelle, an der der Schlüssel einen Wert bekommt:
 * benannte Konstante, eingetragenes Durchreichen oder eine Typ-Angabe.
 */
export function checkRoutingKeys(files, { delegates = DELEGATES, constants = ROUTING_CONSTANTS } = {}) {
  const violations = []
  for (const file of files) {
    if (TRANSPORT_FILES.includes(file.path)) continue
    const code = stripComments(file.source)
    for (const match of code.matchAll(/(?<![\w.$])providerRouting\b(\??)(\s*:\s*)?/g)) {
      const at = `${file.path}:${lineOf(code, match.index ?? 0)}`
      // `providerRouting?: Typ` ist eine Typ-Angabe.
      if (match[1]) continue
      if (!match[2]) {
        // Kurzschreibweise `{ providerRouting }` oder ein nackter Name: ein Wert, dessen Herkunft belegt sein muss.
        if (!delegates[file.path]) violations.push(`${at} — reicht providerRouting durch, ohne eingetragene Quelle (DELEGATES)`)
        continue
      }
      const start = (match.index ?? 0) + match[0].length
      const expression = code[start] === '{'
        ? `{${balanced(code, start, '{', '}')}}`
        : (/^[\w.$]+/.exec(code.slice(start))?.[0] ?? '')
      const name = constantName(expression.trim())
      if (name) {
        if (!constants[name]) violations.push(`${at} — unbekannte Konstante ${name} (nicht in ROUTING_CONSTANTS)`)
        continue
      }
      // Typ-Literal (`{ zdr: boolean, … }`) oder Typ-Name (`AiProviderRouting`).
      if (expression.startsWith('{') ? TYPE_LITERAL.test(expression) : /^[A-Z][a-z]/.test(expression)) continue
      if (/^[\w$]+(?:\.[\w$]+)*$/.test(expression)) {
        if (!delegates[file.path]) violations.push(`${at} — reicht ${expression} durch, ohne eingetragene Quelle (DELEGATES)`)
        continue
      }
      violations.push(`${at} — loses Objekt statt benannter Konstante: ${expression.replace(/\s+/g, ' ').slice(0, 60)}`)
    }
  }
  return violations
}

/**
 * Prüf-Skripte, die den Vermittler von Hand und direkt rufen (kein Nitro, kein
 * Transport). Sie stehen hier mit Grund — und müssen die EU-Orte wörtlich
 * senden.
 */
export const DIRECT_SCRIPTS = {
  'packages/brand/scripts/verify-brand-context.mjs': 'Prüfskript für den Brand Context, von Hand gefahren; sendet die Bindung wörtlich',
}

/** Kein Weg an den Transporten vorbei: `chat/completions` steht nur in ihnen. */
export function checkDirectEndpoint(files, { directScripts = DIRECT_SCRIPTS } = {}) {
  const violations = []
  for (const file of files) {
    if (TRANSPORT_FILES.includes(file.path)) continue
    const code = stripComments(file.source)
    if (!code.includes('chat/completions')) continue
    if (!directScripts[file.path]) {
      violations.push(`${file.path} — ruft chat/completions am Transport vorbei (nur die fünf Core-Transporte dürfen das)`)
      continue
    }
    const bound = TEXT_EU.every(tag => code.includes(`'${tag}'`))
      && /zdr:\s*true/.test(code) && /data_collection:\s*'deny'/.test(code) && /allow_fallbacks:\s*false/.test(code)
    if (!bound) violations.push(`${file.path} — eingetragenes Prüfskript sendet nicht die volle Bindung (zdr, deny, kein Ausweichen, beide EU-Orte)`)
  }
  return violations
}

const SKIP_DIRS = new Set(['node_modules', '.nuxt', '.output', 'tests', 'test', 'e2e', '__tests__'])
const SKIP_FILE = /\.(test|spec)\.[cm]?[jt]s$/

/** Rekursiv, ohne `fs.glob` (in Node 22 noch experimentell und mit Warnung). */
function walk(root, dir, extensions, out) {
  if (!existsSync(join(root, dir))) return
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(root, path, extensions, out)
    }
    else if (extensions.some(ext => entry.name.endsWith(ext)) && !SKIP_FILE.test(entry.name)) {
      out.push(path)
    }
  }
}

function read(root, subdirs, extensions) {
  const paths = []
  for (const group of ['packages', 'apps']) {
    if (!existsSync(join(root, group))) continue
    for (const unit of readdirSync(join(root, group), { withFileTypes: true })) {
      if (!unit.isDirectory()) continue
      for (const sub of subdirs) walk(root, `${group}/${unit.name}/${sub}`, extensions, paths)
    }
  }
  return paths.sort().map(path => ({ path, source: readFileSync(join(root, path), 'utf8') }))
}

/** `server`: die Dateien mit Aufrufstellen · `all`: Produktionscode UND Skripte für Regel 3. */
export function readSources(root = ROOT) {
  const scripts = []
  walk(root, 'scripts', ['.mjs', '.js', '.ts'], scripts)
  return {
    server: read(root, ['server'], ['.ts']),
    all: [
      ...read(root, ['server', 'app', 'shared', 'scripts'], ['.ts', '.vue', '.js', '.mjs']),
      ...scripts
        .filter(path => path !== 'scripts/check-ai-routing.mjs')
        .sort()
        .map(path => ({ path, source: readFileSync(join(root, path), 'utf8') })),
    ],
  }
}

function main() {
  const sources = readSources()
  const report = checkAiRouting(sources.server)
  const violations = [...new Set([
    ...checkRoutingConstants(ROUTING_CONSTANTS),
    ...report.violations,
    ...checkRoutingKeys(sources.server),
    ...checkDirectEndpoint(sources.all),
  ])]

  console.log(`check:ai-routing — ${report.sites.length} KI-Aufrufstellen (Text ${report.counts.text}, Vision ${report.counts.vision}, Video ${report.counts.video}, Bild ${report.counts.image})\n`)
  for (const site of report.sites) {
    console.log(`  ${site.path}:${site.line}  ${site.transport}  ${site.binding}  ${site.only.join(',') || '-'}  ${site.status}`)
  }
  console.log('\nAusnahmen vom Ort:')
  for (const [name, entry] of Object.entries(ROUTING_CONSTANTS)) {
    if (entry.exception) console.log(`  ${name} (${entry.only.join(', ')}): ${entry.exception.reason} — entschieden ${entry.exception.decided}`)
  }

  console.log('\nPrüfskripte mit direktem Aufruf (senden die Bindung wörtlich):')
  for (const [path, reason] of Object.entries(DIRECT_SCRIPTS)) console.log(`  ${path}: ${reason}`)

  if (violations.length) {
    console.error(`\n✖ check:ai-routing — ${violations.length} Verstoss/Verstösse:\n`)
    for (const violation of violations) console.error(`  ${violation}`)
    console.error('\nRegel und Begründung: Kopf von scripts/check-ai-routing.mjs')
    process.exit(1)
  }
  console.log('\n✔ check:ai-routing — jede Aufrufstelle gebunden, jeder Ort in der EU oder begründet, kein Weg am Transport vorbei.')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
