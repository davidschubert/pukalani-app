import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FAMILIES, TRANSPORT_FILES } from '../../../scripts/check-ai-routing.mjs'
import { codeOnly, findSlowRoutes, readRepo, type SourceFile } from './support/routeDeadlineScan'
import {
  LONG_PROXY_LOCATION,
  LONG_PROXY_READ_TIMEOUT_MS,
  LONG_PROXY_ROUTES,
  PROXY_READ_TIMEOUT_MS,
  ROUTE_DEADLINES,
  type Deadline,
  type RouteDeadlineEntry,
} from './support/routeDeadlines'

/**
 * WÄCHTER: KEINE ROUTE WARTET LÄNGER ALS DER WEBSERVER (LL1, BE-008).
 *
 * nginx wartet 60 s auf eine Antwort (`proxy_read_timeout`; auf
 * branding.supply 180 s für drei insights-Wege). Eine Route, deren eigene
 * Fristen in Summe darüber liegen, zeigt dem Menschen einen 504, während
 * Node weiterrechnet — er drückt noch einmal und zahlt doppelt. Bis heute
 * wurde das von Hand nachgezählt (2026-11-16). Dieser Wächter findet jede
 * Route, die einen LANGSAMEN BAUSTEIN erreicht, und verlangt für sie einen
 * Eintrag im Fristen-Buch `support/routeDeadlines.ts` (Bauform, Fristen,
 * Grund). Wie gesucht wird und was die Suche nicht sieht:
 * `support/routeDeadlineScan.ts`.
 *
 * LANGSAME BAUSTEINE (jeder mit eigener Frist):
 *  - die KI-Transporte des Core (`FAMILIES` aus `scripts/check-ai-routing.mjs`:
 *    `aiComplete*`, `aiCompleteStream`, `aiVision*`, `aiVideo*`, `aiImage`)
 *    und die Modell-Nachschau `checkAiModelEndpoints`,
 *  - der Abruf fremder Websites durch brand/market/insights
 *    (`fetchBrandDocument`, darauf bauen `fetchBrandSite`, `crawlBrand*`,
 *    `fetchBrandSiteForCheck`),
 *  - die YouTube-Abrufe von insights (`defaultFetchJson` in drei Dateien —
 *    nicht exportiert, als Wert weitergereicht),
 *  - die Generator-Registry des Markenberaters (`resolveBrandSlotGenerator`):
 *    Plugins tragen KI-Generatoren in eine Map ein, die Route holt sie über
 *    diesen Namen — eine Kante, die keine Namenssuche sieht.
 *
 * NICHT ERFASST (eigene Fristen, aber nicht in der Tabelle — kurz und meist
 * einzeln; wer hier einen langen Weg baut, trägt ihn oben ein):
 *  - ploi (`control/server/utils/ploi.ts`, 20 s je Aufruf — eine Route mit
 *    mehreren ploi-Schritten kann über 60 s kommen; ungezählt),
 *  - das Control Plane über die Naht (`controlService.ts`, 15 s),
 *    `appwritePlatform.ts` (15 s / 8 s), `siteSettle.ts` (20 s),
 *    `websiteHealth.ts` (5 s), `customDomainDns.ts` (4–8 s),
 *  - Stripe (Zeitgrenze des SDK), Mail (`mailBudget.ts` 10 s, Versand),
 *    Turnstile (5 s), Analytics-Proxy (5 s), `analytics/stats.get.ts` (10 s),
 *    `verifyAnalyticsScriptOwner.ts` (5 s), `entitlementsPull.ts` (10 s),
 *    `admin/server/utils/dependencies.ts` (4 s), `marketing/gate.get.ts` (2 s),
 *  - Datenbank-Aufrufe an Appwrite (ohne eigene Frist).
 *
 * ROT WIRD DER TEST BEI: einer gefundenen Route ohne Eintrag, einem Eintrag
 * ohne Route, einer `inline`-Summe über der Grenze, einer `detached`- oder
 * `stream`-Route ohne ihr Merkmal im Quelltext, einer Frist, deren Quelle
 * nicht mehr stimmt, und einer `over`-Liste, die wächst — oder deren Eintrag
 * in Wahrheit unter die Grenze passt.
 */

const REPO = resolve(import.meta.dirname, '../../..')

/**
 * WIE VIELE `over`-EINTRÄGE ES HEUTE GIBT. Die Zahl darf nur sinken: wer
 * einen Weg umbaut (Lauf-Sperre + 202), stellt ihn auf `detached` und setzt
 * die Zahl herunter. Eine neue Route über der Grenze kommt NICHT hierher.
 */
const OVER_EXPECTED = 8

/** Die langsamen Bausteine, die überall gelten (Namen exportierter Funktionen). */
const SLOW_BLOCKS: readonly string[] = [
  ...Object.values(FAMILIES).flat(),
  'checkAiModelEndpoints',
  'fetchBrandDocument',
  'resolveBrandSlotGenerator',
]

/** Langsame Bausteine, die nicht exportiert sind — Datei + Name. */
const LOCAL_SLOW_BLOCKS = [
  'packages/insights/server/utils/insightsChannelsAdmin.ts',
  'packages/insights/server/utils/insightsWatchlistAdmin.ts',
  'packages/insights/server/utils/insightsRadarSweep.ts',
].map(path => ({ path, name: 'defaultFetchJson' }))

/** Die Definitionen der Transporte sind Blätter (werden nicht durchsucht). */
const LEAVES: readonly string[] = [...TRANSPORT_FILES, 'packages/core/server/utils/aiModelCheck.ts']

const tree = readRepo(REPO)
const found = findSlowRoutes({ ...tree, slow: SLOW_BLOCKS, localSeeds: LOCAL_SLOW_BLOCKS, leaves: LEAVES })
const foundPaths = new Set(found.routes.map(route => route.path))
const sources = new Map<string, string>([...tree.routes, ...tree.libraries].map(file => [file.path, file.source]))

function sourceOf(path: string): string {
  const known = sources.get(path)
  if (known !== undefined) return known
  return readFileSync(resolve(REPO, path), 'utf8')
}

/** Ziffern ohne Tausender-Striche: `120_000` ⇒ `120000`. */
function plainNumbers(code: string): string {
  return code.replace(/(\d)_(?=\d)/g, '$1')
}

/**
 * Den Wert einer EXPORTIERTEN Konstante aus dem Quelltext lesen
 * (`export const X = 60_000` oder `= 60 * 1000`). `null`: nicht gefunden,
 * nicht exportiert oder kein einfacher Zahlenausdruck.
 */
function readConstant(source: string, name: string): number | null {
  const code = plainNumbers(codeOnly(source))
  const match = new RegExp(String.raw`^export\s+const\s+${name}\s*(?::\s*number\s*)?=\s*(\d+(?:\s*\*\s*\d+)*)\s*$`, 'm').exec(code)
  if (!match) return null
  return match[1]!.split('*').reduce((product, part) => product * Number(part.trim()), 1)
}

function deadlineMs(deadline: Deadline): number {
  if ('ms' in deadline) return deadline.ms
  const value = readConstant(sourceOf(deadline.file), deadline.constant)
  if (value === null) throw new Error(`${deadline.file}: \`export const ${deadline.constant} = <Zahl>\` nicht gefunden`)
  return value
}

function sumOf(deadlines: readonly Deadline[]): number {
  return deadlines.reduce((sum, deadline) => sum + deadlineMs(deadline) * deadline.times, 0)
}

/** `packages/x/server/api/a/[id]/b.post.ts` ⇒ `/api/a/x/b` (Parameter als `x`). */
function urlOf(path: string): string {
  const tail = path.split('/server/api/')[1]!
  const withoutMethod = tail.replace(/(\.(get|post|patch|put|delete))?\.ts$/, '').replace(/\/index$/, '')
  return `/api/${withoutMethod.replace(/\[[^\]]+\]/g, 'x')}`
}

function limitOf(path: string): number {
  return path in LONG_PROXY_ROUTES ? LONG_PROXY_READ_TIMEOUT_MS : PROXY_READ_TIMEOUT_MS
}

/** Steht der Aufruf im Quelltext (ohne Kommentare und Zeichenketten)? */
function hasCall(path: string, name: string): boolean {
  return new RegExp(String.raw`(?<![\w$.])${name}\s*\(`).test(codeOnly(sourceOf(path)))
}

// ── Gegenproben: die Suche an gestelltem Quelltext ─────────────────────────

describe('Gegenproben der Suche', () => {
  const lib = (path: string, source: string): SourceFile => ({ path, source })
  const route = (path: string, source: string): SourceFile => ({ path, source })
  const scan = (libraries: SourceFile[], routes: SourceFile[], localSeeds: { path: string, name: string }[] = []) =>
    findSlowRoutes({ libraries, routes, slow: ['aiComplete'], localSeeds }).routes.map(r => r.path)

  it('findet eine Route über einen Auto-Import (ohne Import-Zeile, zwei Ebenen tief)', () => {
    const libraries = [
      lib('packages/a/server/utils/inner.ts', 'export async function innerAsk(e) {\n  return await aiComplete(e, "x")\n}\n'),
      lib('packages/b/server/utils/outer.ts', 'export async function outerAsk(e) {\n  return innerAsk(e)\n}\n'),
    ]
    expect(scan(libraries, [route('packages/c/server/api/x.post.ts', 'export default defineEventHandler(e => outerAsk(e))')]))
      .toEqual(['packages/c/server/api/x.post.ts'])
  })

  it('meldet eine Route ohne langsamen Baustein nicht', () => {
    const libraries = [lib('packages/a/server/utils/cheap.ts', 'export function cheap() {\n  return 1\n}\n')]
    expect(scan(libraries, [route('packages/c/server/api/y.get.ts', 'export default defineEventHandler(() => cheap())')]))
      .toEqual([])
  })

  it('Kommentare, Zeichenketten und Import-Zeilen erzeugen keine Kante', () => {
    const libraries = [lib('packages/a/server/utils/quiet.ts', [
      '// ruft früher aiComplete(event) auf',
      '/* aiComplete(event) */',
      'export function quiet() {',
      '  const note = \'aiComplete(event)\'',
      '  const tpl = `aiComplete(${1})`',
      '  return note + tpl',
      '}',
    ].join('\n'))]
    const routes = [
      route('packages/c/server/api/z.post.ts', 'import { aiComplete } from \'../utils/x\'\nexport default defineEventHandler(() => quiet())'),
    ]
    expect(scan(libraries, routes)).toEqual([])
  })

  it('ein Ausdruck in `${…}` bleibt Code', () => {
    expect(scan([], [route('packages/c/server/api/t.post.ts', 'export default defineEventHandler(async e => `${await aiComplete(e, "p")}`)')]))
      .toEqual(['packages/c/server/api/t.post.ts'])
  })

  it('ein nicht exportierter Baustein wirkt über die exportierte Funktion, die ihn als Wert weiterreicht', () => {
    const libraries = [lib('packages/a/server/utils/yt.ts', [
      'async function defaultFetchJson(url) {',
      '  return fetch(url)',
      '}',
      'export async function preview(deps = {}) {',
      '  const fetchJson = deps.fetchJson ?? defaultFetchJson',
      '  return fetchJson("u")',
      '}',
    ].join('\n'))]
    const routes = [route('packages/c/server/api/p.post.ts', 'export default defineEventHandler(() => preview())')]
    expect(scan(libraries, routes)).toEqual([])
    expect(scan(libraries, routes, [{ path: 'packages/a/server/utils/yt.ts', name: 'defaultFetchJson' }]))
      .toEqual(['packages/c/server/api/p.post.ts'])
  })

  it('eine Methode gleichen Namens ist keine Kante', () => {
    expect(scan([], [route('packages/c/server/api/m.post.ts', 'export default defineEventHandler(() => client.aiComplete())')]))
      .toEqual([])
  })

  it('liest exportierte Konstanten, nicht exportierte nicht', () => {
    expect(readConstant('export const A_MS = 60_000\n', 'A_MS')).toBe(60_000)
    expect(readConstant('export const A_MS = 60 * 1000\n', 'A_MS')).toBe(60_000)
    expect(readConstant('const A_MS = 60_000\n', 'A_MS')).toBeNull()
  })
})

// ── Der echte Baum ─────────────────────────────────────────────────────────

describe('die Suche im echten Baum', () => {
  it('findet die bekannten Wege (die Suche ist nicht leer gelaufen)', () => {
    expect(tree.routes.length).toBeGreaterThan(400)
    expect(found.routes.length).toBeGreaterThanOrEqual(30)
    // Je ein Weg pro Art von Kante: direkt, Auto-Import über zwei Layer,
    // weitergereichter Wert, Registry.
    for (const path of [
      'packages/posts/server/api/posts/[id]/translate.post.ts',
      'packages/insights/server/api/insights/posts/[id]/evidence.post.ts',
      'packages/insights/server/api/insights/channels/resolve.post.ts',
      'packages/brand/server/api/brand/profiles/[id]/steps/[stepKey]/generate.post.ts',
    ]) expect(foundPaths.has(path), path).toBe(true)
  })
})

describe('jede gefundene Route steht im Fristen-Buch', () => {
  it.each(found.routes.map(route => [route.path, route.calls.join(', ')] as const))('%s', (path, calls) => {
    if (!(path in ROUTE_DEADLINES)) {
      expect.fail(`${path} erreicht einen langsamen Baustein (${calls}), steht aber nicht in `
        + 'packages/core/tests/support/routeDeadlines.ts — trage sie mit ihren Fristen als `inline` ein, '
        + 'oder rechne mit Lauf-Sperre, 202 und runDetached() (`detached`) bzw. sende ein Lebenszeichen (`stream`).')
    }
  })
})

describe('Fristen-Buch', () => {
  const entries = Object.entries(ROUTE_DEADLINES) as Array<[string, RouteDeadlineEntry]>

  it.each(entries.map(([path, entry]) => [path, entry] as const))('%s', (path, entry) => {
    expect(foundPaths.has(path), `${path}: erreicht keinen langsamen Baustein (mehr) oder gibt es nicht mehr — Eintrag streichen`)
      .toBe(true)

    if (entry.form === 'detached') {
      const where = entry.via ?? path
      expect(hasCall(where, 'runDetached'), `${where}: kein runDetached( — die Route rechnet nicht hinter der Antwort`).toBe(true)
      expect(/setResponseStatus\(\s*event\s*,\s*202\s*\)/.test(codeOnly(sourceOf(path))), `${path}: setzt keine 202`).toBe(true)
      return
    }
    if (entry.form === 'stream') {
      const where = entry.via ?? path
      expect(hasCall(where, 'startBrandStreamHeartbeat'), `${where}: startet kein Lebenszeichen (startBrandStreamHeartbeat)`).toBe(true)
      return
    }

    expect(entry.deadlines.length, `${path}: keine Fristen`).toBeGreaterThan(0)
    for (const deadline of entry.deadlines) {
      expect(Number.isInteger(deadline.times) && deadline.times >= 1, `${path}: times muss eine ganze Zahl ≥ 1 sein`).toBe(true)
      expect(deadline.what.length, `${path}: \`what\` erklärt die Frist`).toBeGreaterThanOrEqual(10)
      if ('hand' in deadline) {
        expect(plainNumbers(codeOnly(sourceOf(deadline.hand))), `${deadline.hand}: die Zahl ${deadline.ms} von Hand steht dort nicht mehr`)
          .toMatch(new RegExp(String.raw`(?<!\d)${deadline.ms}(?!\d)`))
      }
      else {
        expect(readConstant(sourceOf(deadline.file), deadline.constant), `${deadline.file}: \`export const ${deadline.constant}\` fehlt`)
          .not.toBeNull()
      }
    }

    const sum = sumOf(entry.deadlines)
    const limit = limitOf(path)
    if (entry.form === 'inline') {
      expect(sum, `${path}: Σ Fristen ${sum} ms > ${limit} ms — der Webserver gibt vorher auf. `
        + 'Baue die Route auf Lauf-Sperre, 202 und runDetached() um (core/server/utils/runLease.ts).').toBeLessThanOrEqual(limit)
    }
    else {
      expect(entry.reason.length, `${path}: \`over\` braucht einen Grund`).toBeGreaterThanOrEqual(30)
      expect(sum, `${path}: Σ Fristen ${sum} ms passt unter ${limit} ms — gehört nach \`inline\``).toBeGreaterThan(limit)
    }
  })

  it(`der Bestand über der Grenze (\`over\`) wächst nicht (heute ${OVER_EXPECTED})`, () => {
    const over = entries.filter(([, entry]) => entry.form === 'over').map(([path]) => path)
    expect(over.length, `over-Liste: ${over.length} Einträge, erwartet höchstens ${OVER_EXPECTED} — `
      + 'eine neue lange Route kommt nicht in den Bestand, sie rechnet hinter der Antwort').toBeLessThanOrEqual(OVER_EXPECTED)
    expect(over.length, `over-Liste ist auf ${over.length} geschrumpft — OVER_EXPECTED auf ${over.length} senken`)
      .toBe(OVER_EXPECTED)
  })
})

describe('die 180-s-Ausnahme auf branding.supply', () => {
  it('das Runbook nennt den nginx-Block noch wörtlich', () => {
    const runbook = readFileSync(resolve(REPO, 'docs/runbooks/BRANDING-SUPPLY-SETUP.md'), 'utf8')
    expect(runbook).toContain(`location ~ ${LONG_PROXY_LOCATION} {`)
    expect(runbook).toContain(`proxy_read_timeout ${LONG_PROXY_READ_TIMEOUT_MS / 1000}s;`)
  })

  it.each(Object.entries(LONG_PROXY_ROUTES))('%s', (path, reason) => {
    expect(reason.length).toBeGreaterThanOrEqual(30)
    expect(path.startsWith('packages/insights/'), 'der Block gilt nur für insights auf branding.supply').toBe(true)
    expect(new RegExp(LONG_PROXY_LOCATION).test(urlOf(path)), `${urlOf(path)} wird vom 180-s-Block nicht getroffen`).toBe(true)
    expect(path in ROUTE_DEADLINES, `${path}: steht nicht im Fristen-Buch`).toBe(true)
  })
})

describe('Übersicht', () => {
  it('gibt die Zählung je Bauform und die over-Liste aus', () => {
    const entries = Object.entries(ROUTE_DEADLINES)
    const count = (form: RouteDeadlineEntry['form']) => entries.filter(([, entry]) => entry.form === form).length
    const over = entries.flatMap(([path, entry]) => entry.form === 'over' ? [`  ${String(sumOf(entry.deadlines) / 1000).padStart(5)} s  ${path}`] : [])
    console.info([
      `Fristen-Wächter: ${found.routes.length} Routen erreichen einen langsamen Baustein`,
      `  inline ${count('inline')} · detached ${count('detached')} · stream ${count('stream')} · over ${count('over')}`,
      'over (Σ Fristen):',
      ...over,
    ].join('\n'))
    expect(entries.length).toBe(found.routes.length)
  })
})
