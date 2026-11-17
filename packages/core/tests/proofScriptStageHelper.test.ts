import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * OPS-009 (GA1 P27): EIN RUMPF FÜR DIE ANLAGE EINER PROBE-COMMUNITY.
 *
 * 22 Beweis-Skripte legten ihre Probe-Community über `POST
 * /api/onboarding/site` an, jedes mit einem eigenen, wortgleich kopierten
 * Rumpf. Ein neues Pflichtfeld an der Route brach sie alle, und kein Test sah
 * es. Seitdem gibt es den Rumpf genau einmal (`probeSiteBody` in
 * `scripts/lib/probe-stage.mjs`), und ein Unit-Test hält ihn gegen Schema und
 * Route (`packages/onboarding/tests/probeSiteBody.test.ts`).
 *
 * Dieser Wächter sorgt dafür, dass es so bleibt — auch für Skripte, die erst
 * morgen geschrieben werden: jedes Skript unter `scripts/`,
 * `packages/*\/scripts/` oder `apps/*\/scripts/`, das die Route nennt,
 * importiert die Hilfe und baut KEINEN eigenen Rumpf (kein `operatorTerms:`).
 * Ausnahmen stehen mit Grund in `EXEMPT`; eine veraltete Ausnahme ist rot.
 *
 * Kein Netz, keine Umgebung: gelesen wird nur der Dateiinhalt.
 */
const REPO = join(__dirname, '..', '..', '..')

const ROUTE = '/api/onboarding/site'
const IMPORTS_HELPER = /scripts\/lib\/probe-stage\.mjs['"]|\.\/probe-stage\.mjs['"]|lib\/probe-stage\.mjs['"]/
const OWN_BODY = /\boperatorTerms\s*:/

/** Ausnahmen MIT Grund. Eine Zeile ohne Grund ist keine Ausnahme. */
const EXEMPT: Record<string, string> = {
  'scripts/lib/probe-stage.mjs': 'definiert den einen Rumpf selbst',
}

const SCRIPT_FILE = /\.(?:mjs|cjs|js|mts|ts)$/

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name.startsWith('.')) return []
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return SCRIPT_FILE.test(name) ? [path] : []
  })
}

const subDirs = (root: string) =>
  readdirSync(join(REPO, root), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => join(REPO, root, entry.name, 'scripts'))

const rel = (path: string) => relative(REPO, path).split(sep).join('/')
const read = (path: string) => readFileSync(join(REPO, path), 'utf8')

const allScripts = [
  ...walk(join(REPO, 'scripts')),
  ...subDirs('packages').flatMap(walk),
  ...subDirs('apps').flatMap(walk),
].map(rel).sort()

/** Was an einem Skript falsch ist, das die Route nennt — leer = in Ordnung. */
function stageHelperProblems(source: string): string[] {
  if (!source.includes(ROUTE)) return []
  const problems: string[] = []
  if (!IMPORTS_HELPER.test(source)) problems.push('importiert scripts/lib/probe-stage.mjs nicht')
  if (OWN_BODY.test(source)) problems.push('baut einen eigenen Rumpf (operatorTerms:) statt probeSiteBody(…)')
  return problems
}

const HOW_TO = [
  'Ein Skript, das POST /api/onboarding/site ruft, nimmt den EINEN Rumpf (OPS-009):',
  '  import { probeSiteBody } from \'<relativer Pfad>/scripts/lib/probe-stage.mjs\'',
  '  body: probeSiteBody({ name, slug, inviteCode: code, description: \'…\', vibe: \'calm\' })',
  'Abweichungen gehen als Felder hinein; ein Feld mit `undefined` fällt weg.',
  'Ganz ohne Kopien: createProbeCommunity(…) aus derselben Datei (Vorbild:',
  'packages/onboarding/scripts/verify-dashboard-access.mjs).',
].join('\n')

describe('Selbsttest der Erkennung', () => {
  it('ein Skript mit eigenem Rumpf und ohne Hilfe ist rot', () => {
    const source = `await call(host, '${ROUTE}', { body: { operatorTerms: true, name } })`
    expect(stageHelperProblems(source)).toHaveLength(2)
  })

  it('ein Skript mit der Hilfe und ohne eigenen Rumpf ist grün', () => {
    const source = `import { probeSiteBody } from '../../../scripts/lib/probe-stage.mjs'\nawait call(host, '${ROUTE}', { body: probeSiteBody({ name, slug }) })`
    expect(stageHelperProblems(source)).toEqual([])
  })

  it('ein Skript, das die Route nicht nennt, wird nicht angesehen', () => {
    expect(stageHelperProblems('const body = { operatorTerms: true }')).toEqual([])
  })

  it('die Naht-Route des Control Plane ist eine andere Route', () => {
    expect(stageHelperProblems(`await fetch('/api/control/onboarding/site', { body: { jwt, site } })`)).toEqual([])
  })
})

describe('Beweis-Skripte nehmen den einen Rumpf (OPS-009)', () => {
  const callers = allScripts.filter(path => read(path).includes(ROUTE))

  it('findet die Skripte überhaupt (der Wächter sieht hin)', () => {
    expect(allScripts.length).toBeGreaterThan(100)
    // Gezählt werden Skripte, die die Route nennen ODER die Hilfe importieren:
    // wer ganz auf `createProbeCommunity` umgestellt ist, nennt den Pfad der
    // Route nicht mehr — die erste Zahl schrumpft also mit jedem Umzug.
    const usingHelper = allScripts.filter(path => IMPORTS_HELPER.test(read(path)))
    expect(new Set([...callers, ...usingHelper]).size).toBeGreaterThanOrEqual(15)
  })

  it('jedes Skript, das die Anlage-Route ruft, importiert die Hilfe und baut keinen eigenen Rumpf', () => {
    const wrong = callers
      .filter(path => !(path in EXEMPT))
      .flatMap(path => stageHelperProblems(read(path)).map(problem => `${path}: ${problem}`))
    expect(wrong, `Eigener Rumpf statt probeSiteBody:\n  ${wrong.join('\n  ')}\n\n${HOW_TO}`).toEqual([])
  })

  it('jede Ausnahme hat einen Grund, ihre Datei existiert und nennt die Route noch', () => {
    const stale = Object.entries(EXEMPT).flatMap(([path, reason]) => {
      if (!reason.trim()) return [`${path}: Ausnahme ohne Grund`]
      if (!existsSync(join(REPO, path))) return [`${path}: Datei gibt es nicht mehr — Eintrag löschen`]
      if (!read(path).includes(ROUTE)) return [`${path}: nennt die Route nicht mehr — Eintrag löschen`]
      return []
    })
    expect(stale, `Veraltete Ausnahmen:\n  ${stale.join('\n  ')}`).toEqual([])
  })
})
