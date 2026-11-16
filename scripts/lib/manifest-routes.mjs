/**
 * LIEGT JEDE ROUTE EINES PRODUKTS UNTER SEINEM NOT-AUS? (BE-005, GA1 P20)
 *
 * Die Produkt-Schranke (`core/server/middleware/04.product-gate.ts`) kennt nur
 * die `apiPrefixes` aus dem Manifest: schaltet der Betreiber ein Produkt ab,
 * antworten genau die Pfade darunter mit 404. Eine Route des Layers, die
 * AUSSERHALB liegt, bleibt erreichbar — ohne dass Typecheck, Lint oder ein
 * Test es merken. So lag die öffentliche Galerie von `brand`
 * (`/api/discover`, samt einer Schreib-Route) monatelang neben dem Not-Aus,
 * und acht Moderations-Routen von `comments` ebenso.
 *
 * Die Routen kommen aus dem DATEIBAUM (`packages/<layer>/server/api/**`),
 * die Präfixe aus dem MANIFEST. Von Hand ist nur die Ausnahmeliste unten —
 * je Eintrag ein Grund, und ein Eintrag, der nichts mehr ausnimmt, ist rot.
 *
 * Pure Funktion + Dateileser getrennt: `check:manifests` ruft beides, der
 * Test `packages/core/tests/manifestRouteCoverage.test.ts` füttert die pure
 * Funktion mit Gegenproben.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Routen eines ABSCHALTBAREN Layers, die bewusst nicht unter seinen
 * `apiPrefixes` liegen. `path` nimmt alles darunter aus (Segmentgrenze).
 * Jeder Eintrag braucht einen Grund, der einem Außenstehenden erklärt, warum
 * der Not-Aus des Produkts diese Route NICHT erreichen soll oder kann.
 */
export const ROUTE_PREFIX_EXCEPTIONS = [
  {
    layer: 'control',
    path: '/api/platform/entitlements',
    reason: 'Teilt sich den Ordner mit der Core-Route /api/platform/entitlements/refresh — ein Präfix dort schaltete beim Abschalten von control eine Route des Core mit ab. Die Adresse rufen alle Sites ab; ein Umzug unter /api/control ist eine eigene Änderung (GA1 P20, Rest).',
  },
]

const METHOD_SUFFIX = /\.(get|post|put|patch|delete|head|options)$/

/** `discover/[slug]/report.post.ts` ⇒ `/api/discover/[slug]/report` */
export function routePathOf(relativeFile) {
  const segments = relativeFile.replace(/\.ts$/, '').replace(METHOD_SUFFIX, '').split('/')
  if (segments.at(-1) === 'index') segments.pop()
  return `/api/${segments.join('/')}`.replace(/\/$/, '')
}

/**
 * Der Eintrag, den man ins Manifest schreiben würde: der Ordner der Datei,
 * bis zum ersten dynamischen Abschnitt, höchstens zwei Ebenen tief. Eine Datei
 * direkt unter `server/api/` steht für sich.
 */
function suggestedPrefix({ file, route }) {
  const dirs = file.split('/server/api/')[1].split('/').slice(0, -1)
  const fixed = []
  for (const dir of dirs) {
    if (dir.startsWith('[') || fixed.length === 2) break
    fixed.push(dir)
  }
  return fixed.length ? `/api/${fixed.join('/')}` : route
}

const covers = (prefix, route) => route === prefix || route.startsWith(`${prefix}/`)

function walk(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, base, out)
    else if (name.endsWith('.ts')) out.push(path.slice(base.length + 1).split('\\').join('/'))
  }
  return out
}

/** Routen eines Layers aus dem Dateibaum. */
export function layerRoutes(root, layer) {
  const server = join(root, 'packages', layer, 'server')
  return {
    api: walk(join(server, 'api')).map(file => ({ file: `packages/${layer}/server/api/${file}`, route: routePathOf(file) })),
    other: walk(join(server, 'routes')).map(file => `packages/${layer}/server/routes/${file}`),
  }
}

/**
 * @param {{ key: string, tier: 'foundation'|'optional', apiPrefixes?: string[], api: {file:string, route:string}[], other: string[] }[]} layers
 * @param {{ layer: string, path: string, reason: string }[]} exceptions
 * @returns {string[]} ein Satz je Verstoß, mit dem, was zu tun ist
 */
export function routeCoverageProblems(layers, exceptions = ROUTE_PREFIX_EXCEPTIONS) {
  const problems = []
  const used = new Set()

  for (const layer of layers) {
    const prefixes = layer.apiPrefixes ?? []

    // Ein Präfix darf keine Route eines ANDEREN Layers decken — sonst fällt
    // sie mit, wenn dieses Produkt abgeschaltet wird.
    for (const prefix of prefixes) {
      for (const other of layers) {
        if (other.key === layer.key) continue
        for (const { file, route } of other.api) {
          if (covers(prefix, route)) {
            problems.push(`packages/${layer.key}/product.manifest.ts: das Präfix ${prefix} deckt auch ${file} (Layer „${other.key}") — wird „${layer.key}" abgeschaltet, fällt diese Route mit. Präfix enger fassen oder die Route in den Layer holen, dem sie gehört.`)
          }
        }
      }
      if (!layer.api.some(({ route }) => covers(prefix, route))) {
        problems.push(`packages/${layer.key}/product.manifest.ts: das Präfix ${prefix} deckt keine einzige Route des Layers — Tippfehler oder Rest einer gelöschten Route? Eintrag streichen oder korrigieren.`)
      }
    }

    // Stufe „foundation" ist nicht abschaltbar (die Prüfung dazu steht in
    // check-manifests.mjs) — der Not-Aus erreicht diese Layer mit Absicht nicht.
    if (layer.tier !== 'optional') continue

    // Je fehlendem Präfix EINE Meldung (nicht eine je Datei) — sie nennt den
    // Eintrag, der fehlt, und die Routen, um die es geht.
    const missing = new Map()
    for (const { file, route } of layer.api) {
      if (prefixes.some(prefix => covers(prefix, route))) continue
      const index = exceptions.findIndex(entry => entry.layer === layer.key && covers(entry.path, route))
      if (index !== -1) {
        used.add(index)
        continue
      }
      const suggestion = suggestedPrefix({ file, route })
      if (!missing.has(suggestion)) missing.set(suggestion, [])
      missing.get(suggestion).push(file)
    }
    for (const [suggestion, files] of missing) {
      problems.push(`packages/${layer.key}/product.manifest.ts: ${files.length} Route(n) unter ${suggestion} liegen unter keinem apiPrefixes-Eintrag [${prefixes.join(', ') || 'keiner'}] — der Not-Aus von „${layer.key}" erreicht sie nicht. '${suggestion}' in apiPrefixes aufnehmen, oder die Route(n) mit Grund in ROUTE_PREFIX_EXCEPTIONS (scripts/lib/manifest-routes.mjs) eintragen:\n      ${files.join('\n      ')}`)
    }
    for (const file of layer.other) {
      problems.push(`${file}: ein abschaltbarer Layer hat eine Route außerhalb von server/api/ — die Produkt-Schranke prüft nur /api/**, der Not-Aus von „${layer.key}" erreicht sie nicht. Nach server/api/ unter ein Präfix des Manifests legen.`)
    }
  }

  exceptions.forEach((entry, index) => {
    if ((entry.reason ?? '').trim().length < 40) {
      problems.push(`ROUTE_PREFIX_EXCEPTIONS: ${entry.layer} ${entry.path} — ohne tragfähigen Grund (ein Satz, der erklärt, warum der Not-Aus diese Route nicht erreichen soll).`)
    }
    if (!used.has(index)) {
      problems.push(`ROUTE_PREFIX_EXCEPTIONS: ${entry.layer} ${entry.path} nimmt keine Route mehr aus (Route gelöscht, umgezogen oder inzwischen unter einem Präfix) — Eintrag streichen.`)
    }
  })
  return problems
}
