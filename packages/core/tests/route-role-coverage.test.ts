import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROUTE_ROLE_BACKLOG } from './support/routeRoleBacklog'

/**
 * WÄCHTER: JEDE ROUTE IM BLICK HAT EINEN ROLLEN-TEST (P27, OPS-009).
 *
 * `participation-guard-routes.test.ts` belegt, DASS eine Wache im Quelltext
 * steht. Ob sie für die richtigen Menschen greift — Gast, fremdes Konto,
 * Entfernte, die Team-Rollen, der Betreiber —, zeigt erst eine Probe, die die
 * Route AUSFÜHRT (Prüfstand `support/participationHarness.ts`). Dieser
 * Wächter zählt, welche Routen so eine Probe haben.
 *
 * IM BLICK sind:
 *  - jede schreibende Route (`.post.ts`, `.patch.ts`, `.put.ts`, `.delete.ts`),
 *  - jede lesende Route, die nach dem Konto fragt (`ACCOUNT_READ`, direkt
 *    oder über einen Helfer aus `server/utils`, s. `accountHelpers`).
 *
 * Jede Route im Blick braucht GENAU EINES von drei:
 *  (i)   einen Rollen-Test — eine Testdatei importiert oder lädt sie,
 *  (ii)  einen Eintrag in `EXCEPTIONS` mit Grund,
 *  (iii) einen Eintrag im Bestand `support/routeRoleBacklog.ts` (Stand
 *        2026-11-17, darf nur schrumpfen).
 *
 * Gesucht wird im Quelltext OHNE Kommentare: ein auskommentierter Import
 * zählt nicht.
 */

const REPO = resolve(import.meta.dirname, '../../..')

/**
 * Layer, deren Bestand LEER sein muss: die neun Pool-Produkte (dieselbe Liste
 * wie `POOL_LAYERS` in `participation-guard-routes.test.ts`). Ein Layer hier
 * und ein Eintrag im Bestand ⇒ rot. Wer den Bestand eines weiteren Layers
 * abgebaut hat, trägt ihn hier ein — dann wächst er nicht wieder.
 *
 * Dazu `control` (Control Plane, seit BT1 b): Betreiber- und Naht-Routen mit
 * eigenem Prüfstand `packages/control/tests/support/controlRouteHarness.ts`.
 */
const ZERO_BACKLOG_LAYERS: readonly string[] = [
  'activity', 'comments', 'courses', 'events', 'feedback', 'media', 'messages', 'moderation', 'posts',
  // Abgebaut mit BT1 b (2026-11-17): alle Bestands-Routen haben Tests
  // (control 64, onboarding 47).
  'control', 'onboarding',
]

/**
 * Routen ohne Rollen-Test — jede mit Grund (≥ 20 Zeichen). Pfade relativ zum
 * Repo. Heute: Maschinen-Routen ohne Konto. Sie weisen sich mit einem
 * Geheimnis oder einer Signatur aus; welcher Ausweis gilt, hält
 * `csrf-origin-routes.test.ts` fest.
 */
const EXCEPTIONS: Record<string, string> = {
  'packages/domains/server/api/site/domain/settle.post.ts':
    'Maschinen-Route ohne Konto: Ruf des Control Plane über das Naht-Geheimnis, keine Rolle zu prüfen.',
  'packages/runner/server/api/runner/runners/heartbeat.post.ts':
    'Maschinen-Route ohne Konto: der AI-Runner weist sich per Bearer-Schlüssel aus, keine Rolle zu prüfen.',
  'packages/runner/server/api/runner/runs/[id]/events.post.ts':
    'Maschinen-Route ohne Konto: der AI-Runner weist sich per Bearer-Schlüssel aus, keine Rolle zu prüfen.',
  'packages/runner/server/api/runner/runs/[id]/finish.post.ts':
    'Maschinen-Route ohne Konto: der AI-Runner weist sich per Bearer-Schlüssel aus, keine Rolle zu prüfen.',
  'packages/runner/server/api/runner/runs/[id]/session-end.post.ts':
    'Maschinen-Route ohne Konto: der AI-Runner weist sich per Bearer-Schlüssel aus, keine Rolle zu prüfen.',
  'packages/runner/server/api/runner/runs/[id]/transcript.post.ts':
    'Maschinen-Route ohne Konto: der AI-Runner weist sich per Bearer-Schlüssel aus, keine Rolle zu prüfen.',
  'packages/runner/server/api/runner/runs/claim.post.ts':
    'Maschinen-Route ohne Konto: der AI-Runner weist sich per Bearer-Schlüssel aus, keine Rolle zu prüfen.',
}

const WRITE_ROUTE = /\.(post|patch|put|delete)\.ts$/

/**
 * Wege, auf denen eine Route das Konto liest. Neben den Wachen
 * (`require…`) und `event.context.user` auch der Session-Client: er spricht
 * Appwrite als die angemeldete Person an.
 */
const ACCOUNT_READ = /\b(require[A-Z]\w*|event\.context\.user|getCurrentUser|useCurrentUser|createSessionClient)\b/

/**
 * Helfer aus `server/utils`, die das Konto lesen, aber NICHT als Konto-Frage
 * zählen. `tenantDb` ist die Datentür: sie liest das Konto nur, um den Zugriff
 * einzuschränken, und öffentliche Routen gehen genauso durch sie.
 */
const NOT_ACCOUNT_HELPERS: Record<string, string> = {
  tenantDb: 'Datentür — liest das Konto nur zum Einschränken, auch öffentliche Routen nutzen sie.',
}

/**
 * Aufrufe mit einem Pfad, die den QUELLTEXT lesen, statt die Route
 * auszuführen. Ein Quelltext-Test ist kein Rollen-Test.
 */
const SOURCE_READERS = new Set(['read', 'readFileSync', 'source', 'readSource', 'URL', 'fileURLToPath', 'resolve', 'join', 'existsSync'])

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

/** Block- und Zeilenkommentare entfernen (Strings bleiben stehen — gut genug für Bezeichner). */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

function toRepoPath(path: string): string {
  return relative(REPO, path).split(sep).join('/')
}

/** `packages/posts/…` ⇒ `posts`, `apps/branding/…` ⇒ `apps/branding`. */
function layerOf(path: string): string {
  const [root, name] = path.split('/')
  return root === 'apps' ? `apps/${name}` : name!
}

const roots = ['packages', 'apps'].flatMap(root =>
  readdirSync(resolve(REPO, root))
    .filter(name => statSync(resolve(REPO, root, name)).isDirectory())
    .map(name => `${root}/${name}`))

/**
 * Exportierte Funktionen aus `server/utils`, deren Rumpf das Konto liest
 * (eine Ebene tief; der Rumpf reicht bis zur nächsten exportierten Funktion).
 */
function accountHelpers(): Set<string> {
  const helpers = new Set<string>()
  for (const root of roots) {
    for (const file of walk(resolve(REPO, root, 'server/utils')).filter(f => f.endsWith('.ts'))) {
      const code = stripComments(readFileSync(file, 'utf8'))
      const starts = [...code.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)]
      starts.forEach((match, index) => {
        const body = code.slice(match.index!, starts[index + 1]?.index ?? code.length)
        if (ACCOUNT_READ.test(body.slice(body.indexOf('{')))) helpers.add(match[1]!)
      })
    }
  }
  for (const name of Object.keys(NOT_ACCOUNT_HELPERS)) helpers.delete(name)
  return helpers
}

const HELPERS = accountHelpers()

/** Fragt diese (lesende) Route nach dem Konto? */
function readsAccount(source: string, helpers: ReadonlySet<string> = HELPERS): boolean {
  const code = stripComments(source)
  if (ACCOUNT_READ.test(code)) return true
  return [...helpers].some(name => new RegExp(`\\b${name}\\s*\\(`).test(code))
}

/**
 * Welche Dateien lädt dieser Test? Zählt:
 *  - `import('…')` und `from '…'`,
 *  - ein Lade-Helfer mit String-Literal (`load('…')`, `handler('…')`) — jeder
 *    Aufruf eines Namens, der nicht in `SOURCE_READERS` steht und kein
 *    Methodenaufruf ist (`vi.mock('…')`, `.toContain('…')` zählen nicht),
 *  - eine Konstante mit Pfad, die an `import(NAME)` oder einen Lade-Helfer geht.
 * Nur relative Pfade (`./`, `../`), aufgelöst gegen die Testdatei; `.ts` wird
 * ergänzt. Ein Pfad, der mit `${…}` zusammengesetzt wird, ist nicht erkennbar —
 * seine Routen bleiben ehrlich im Bestand.
 */
function loadedFiles(source: string, testFile: string): string[] {
  const code = stripComments(source)
  const literals: string[] = []
  const rel = String.raw`(\.{1,2}\/[^'"\`$]*)`

  for (const m of code.matchAll(new RegExp(String.raw`\bimport\(\s*(['"\`])${rel}\1\s*\)`, 'g'))) literals.push(m[2]!)
  for (const m of code.matchAll(new RegExp(String.raw`\bfrom\s+(['"])${rel}\1`, 'g'))) literals.push(m[2]!)
  for (const m of code.matchAll(new RegExp(String.raw`(?<![.\w$])([A-Za-z_$][\w$]*)\(\s*(['"\`])${rel}\2`, 'g'))) {
    if (m[1] !== 'import' && !SOURCE_READERS.has(m[1]!)) literals.push(m[3]!)
  }
  for (const m of code.matchAll(new RegExp(String.raw`\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"\`])${rel}\2`, 'g'))) {
    const uses = code.matchAll(new RegExp(String.raw`(?<![.\w$])([A-Za-z_$][\w$]*)\(\s*${m[1]}\s*[,)]`, 'g'))
    if ([...uses].some(use => !SOURCE_READERS.has(use[1]!))) literals.push(m[3]!)
  }

  return literals.flatMap((literal) => {
    const base = resolve(dirname(testFile), literal)
    return [base, `${base}.ts`].map(toRepoPath)
  })
}

const routes = roots
  .flatMap(root => walk(resolve(REPO, root, 'server/api')))
  .filter(path => path.endsWith('.ts'))
  .map(path => ({ path: toRepoPath(path), source: readFileSync(path, 'utf8') }))
  .map(route => ({ ...route, layer: layerOf(route.path), write: WRITE_ROUTE.test(route.path) }))

const inView = routes.filter(route => route.write || readsAccount(route.source))
const inViewPaths = new Set(inView.map(route => route.path))

const testFiles = roots
  .flatMap(root => walk(resolve(REPO, root, 'tests')))
  .filter(path => /\.(test|spec)\.ts$/.test(path) || (path.endsWith('.ts') && path.split(sep).includes('support')))

const tested = new Set<string>()
for (const file of testFiles) {
  for (const target of loadedFiles(readFileSync(file, 'utf8'), file)) tested.add(target)
}

const backlogEntries = Object.entries(ROUTE_ROLE_BACKLOG).flatMap(([layer, paths]) => paths.map(path => ({ layer, path })))
const backlog = new Set(backlogEntries.map(entry => entry.path))

describe('Wächter-Selbsttest', () => {
  const testFile = resolve(REPO, 'packages/demo/tests/x.test.ts')

  it('ein auskommentierter Import zählt nicht', () => {
    expect(loadedFiles(`// await import('../server/api/a.post')\n`, testFile)).toEqual([])
    expect(loadedFiles(`/* import('../server/api/a.post') */`, testFile)).toEqual([])
  })

  it('ein echter Import zählt, mit und ohne Endung', () => {
    expect(loadedFiles(`const m = await import('../server/api/a.post')`, testFile))
      .toContain('packages/demo/server/api/a.post.ts')
    expect(loadedFiles(`import x from '../server/api/b.get.ts'`, testFile))
      .toContain('packages/demo/server/api/b.get.ts')
  })

  it('Lade-Helfer zählen, Quelltext-Leser und Methoden nicht', () => {
    expect(loadedFiles(`await load('../server/api/a.post')`, testFile)).toContain('packages/demo/server/api/a.post.ts')
    expect(loadedFiles(`const R = '../server/api/a.post.ts'\nawait import(R)`, testFile))
      .toContain('packages/demo/server/api/a.post.ts')
    expect(loadedFiles(`read('../server/api/a.post.ts')`, testFile)).toEqual([])
    expect(loadedFiles(`new URL('../server/api/a.post.ts', import.meta.url)`, testFile)).toEqual([])
    expect(loadedFiles(`vi.mock('../server/api/a.post')`, testFile)).toEqual([])
    expect(loadedFiles(`const R = '../server/api/a.post.ts'\nread(R)`, testFile)).toEqual([])
  })

  it('Repo-Pfade in Listen anderer Wächter zählen nicht', () => {
    expect(loadedFiles(`const X = { 'packages/demo/server/api/a.post.ts': 'Grund' }`, testFile)).toEqual([])
  })

  it('erkennt lesende Routen, die nach dem Konto fragen', () => {
    const none = new Set<string>()
    expect(readsAccount('const user = await requireUser(event)', none)).toBe(true)
    expect(readsAccount('if (!event.context.user) throw createError({ status: 401 })', none)).toBe(true)
    expect(readsAccount('const { tablesDB } = createSessionClient(event)', none)).toBe(true)
    expect(readsAccount('return { ok: true }', none)).toBe(false)
    expect(readsAccount('// requireUser(event)\nreturn 1', none)).toBe(false)
    expect(readsAccount('const ctx = await loadThing(event)', new Set(['loadThing']))).toBe(true)
  })

  it('findet Routen und Tests', () => {
    expect(routes.length).toBeGreaterThan(400)
    expect(inView.length).toBeGreaterThan(300)
    expect(tested.size).toBeGreaterThan(50)
    expect(HELPERS.has('tenantDb')).toBe(false)
  })
})

describe('jede Route im Blick: Rollen-Test, Ausnahme oder Bestand', () => {
  it.each(inView.map(route => [route.path] as const))('%s', (path) => {
    const hasTest = tested.has(path)
    const exception = path in EXCEPTIONS
    const listed = backlog.has(path)

    if (hasTest && listed) expect.fail(`${path}: hat einen Rollen-Test — aus dem Bestand streichen (support/routeRoleBacklog.ts)`)
    if (hasTest && exception) expect.fail(`${path}: hat einen Rollen-Test — die Ausnahme streichen`)
    if (exception && listed) expect.fail(`${path}: steht in EXCEPTIONS UND im Bestand — eine Liste genügt`)
    if (!hasTest && !exception && !listed) {
      expect.fail(`${path}: kein Rollen-Test. Schreibe einen mit dem Prüfstand `
        + '(packages/core/tests/support/participationHarness.ts: describeGuardedRoute, describeRoleGatedRoute, '
        + 'describeAccountRoute). Der Bestand nimmt keine neuen Routen auf.')
    }
  })
})

describe('Ausnahmeliste', () => {
  it.each(Object.entries(EXCEPTIONS))('%s', (path, reason) => {
    expect(reason.length, 'Ausnahme braucht einen Grund').toBeGreaterThanOrEqual(20)
    expect(existsSync(resolve(REPO, path)), `${path}: Datei gibt es nicht mehr — Eintrag streichen`).toBe(true)
    expect(inViewPaths.has(path), `${path}: ist nicht (mehr) im Blick — Eintrag streichen`).toBe(true)
  })
})

describe('Bestand (support/routeRoleBacklog.ts)', () => {
  it('jeder Eintrag zeigt auf eine Route im Blick, im richtigen Layer', () => {
    const problems: string[] = []
    for (const { layer, path } of backlogEntries) {
      if (!existsSync(resolve(REPO, path))) problems.push(`${path}: Datei gibt es nicht mehr — aus dem Bestand streichen`)
      else if (!inViewPaths.has(path)) problems.push(`${path}: ist nicht (mehr) im Blick — aus dem Bestand streichen`)
      if (layerOf(path) !== layer) problems.push(`${path}: steht unter „${layer}", gehört zu „${layerOf(path)}"`)
    }
    expect(problems).toEqual([])
  })

  it('kein Eintrag doppelt, jede Gruppe alphabetisch', () => {
    const seen = new Set<string>()
    const doubles = backlogEntries.filter(({ path }) => seen.has(path) || !seen.add(path)).map(({ path }) => path)
    expect(doubles).toEqual([])
    for (const [layer, paths] of Object.entries(ROUTE_ROLE_BACKLOG)) {
      expect([...paths], layer).toEqual([...paths].sort())
    }
    expect(Object.keys(ROUTE_ROLE_BACKLOG)).toEqual(Object.keys(ROUTE_ROLE_BACKLOG).sort())
  })

  it.each(ZERO_BACKLOG_LAYERS.map(layer => [layer] as const))('Layer %s hat keinen Bestand mehr', (layer) => {
    expect(ROUTE_ROLE_BACKLOG[layer] ?? []).toEqual([])
  })
})

describe('Abdeckung je Layer', () => {
  it('gibt die Zahlen aus', () => {
    const rows = [...new Set(inView.map(route => route.layer))].sort().map((layer) => {
      const own = inView.filter(route => route.layer === layer)
      return {
        layer,
        imBlick: own.length,
        mitTest: own.filter(route => tested.has(route.path)).length,
        ausnahme: own.filter(route => route.path in EXCEPTIONS).length,
        bestand: own.filter(route => backlog.has(route.path)).length,
      }
    })
    const total = rows.reduce((sum, row) => ({
      layer: 'gesamt',
      imBlick: sum.imBlick + row.imBlick,
      mitTest: sum.mitTest + row.mitTest,
      ausnahme: sum.ausnahme + row.ausnahme,
      bestand: sum.bestand + row.bestand,
    }), { layer: 'gesamt', imBlick: 0, mitTest: 0, ausnahme: 0, bestand: 0 })
    const width = Math.max(...rows.map(row => row.layer.length), 'gesamt'.length)
    const line = (row: typeof total) => [row.layer.padEnd(width), ...[row.imBlick, row.mitTest, row.ausnahme, row.bestand]
      .map(n => String(n).padStart(9))].join(' ')
    console.info([
      'Rollen-Tests je Layer (OPS-009)',
      [''.padEnd(width), ...['im Blick', 'mit Test', 'Ausnahme', 'Bestand'].map(h => h.padStart(9))].join(' '),
      ...rows.map(line),
      line(total),
    ].join('\n'))
    expect(rows.length).toBeGreaterThan(0)
  })
})
