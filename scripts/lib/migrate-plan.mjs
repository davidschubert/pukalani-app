/**
 * Reine Planungs-Logik des Migrations-Runners (OPS-002, GA1 P21) — ohne
 * Ausgabe, ohne Abbruch, ohne Kindprozess. `scripts/migrate.mjs` ruft diese
 * Funktionen und entscheidet über Meldung und Exit-Code; die Tests in
 * `packages/core/tests/migrateRunner.test.ts` rufen sie direkt (mit eigener
 * Wurzel als Fixture-Ordner).
 *
 * Jede Funktion bekommt die Repo-Wurzel als Parameter: ein Test kann so ein
 * kaputtes Manifest in einem Temp-Ordner prüfen, ohne dass der Runner eine
 * Hintertür für eine fremde Wurzel braucht.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { checkTarget, isLocalEndpoint } from './target.mjs'

/** Repo-Wurzel dieser Datei — Quelle des Zod-Schemas, unabhängig vom Prüf-Ordner. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const ENDPOINT_KEY = 'NUXT_PUBLIC_APPWRITE_ENDPOINT'
export const PROJECT_KEY = 'NUXT_PUBLIC_APPWRITE_PROJECT_ID'

/**
 * Liest GENAU die genannten Schlüssel aus dem Text einer Env-Datei
 * (`KEY=value`, optional `export `, Anführungszeichen werden entfernt, `#`
 * beginnt bei ungequoteten Werten einen Kommentar — wie Nodes `--env-file`).
 * Alles andere bleibt ungelesen: der Runner sieht nie einen Schlüssel.
 *
 * @param {string} text
 * @param {string[]} keys
 * @returns {Record<string, string>}
 */
export function readEnvValues(text, keys) {
  const wanted = new Set(keys)
  /** @type {Record<string, string>} */
  const values = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match || !wanted.has(match[1])) continue
    let value = match[2].trim()
    const quote = value[0]
    if ((quote === '"' || quote === '\'' || quote === '`') && value.indexOf(quote, 1) > 0) {
      value = value.slice(1, value.indexOf(quote, 1))
    }
    else {
      const hash = value.indexOf('#')
      if (hash >= 0) value = value.slice(0, hash).trim()
    }
    // Letzter Eintrag gewinnt — wie bei Node.
    values[match[1]] = value
  }
  return values
}

/**
 * Endpunkt und Projekt-Id aus einer Env-Datei.
 *
 * @param {string} file absoluter Pfad
 * @returns {{ endpoint: string | undefined, projectId: string | undefined }}
 */
export function readTargetFromEnvFile(file) {
  const values = readEnvValues(readFileSync(file, 'utf8'), [ENDPOINT_KEY, PROJECT_KEY])
  return { endpoint: values[ENDPOINT_KEY] || undefined, projectId: values[PROJECT_KEY] || undefined }
}

/**
 * Lädt und validiert `apps/<app>/site.manifest.ts`. Nicht ladbar oder
 * ungültig ist ein ABBRUCH-Grund — früher migrierte der Runner dann ALLE
 * Layer, also gerade im Fehlerfall am meisten.
 *
 * @param {string} root Repo-Wurzel (Tests: Fixture-Ordner)
 * @param {string} app
 * @returns {Promise<{ ok: true, manifest: { siteId: string, products: string[], appwriteProjects: string[] } } | { ok: false, message: string }>}
 */
export async function loadSiteManifest(root, app) {
  const rel = `apps/${app}/site.manifest.ts`
  const file = join(root, 'apps', app, 'site.manifest.ts')
  if (!existsSync(file)) {
    return { ok: false, message: `${rel} fehlt — ohne Site-Manifest weiß der Runner weder die Layer noch das erlaubte Projekt.` }
  }
  let raw
  try {
    raw = (await import(pathToFileURL(file).href)).default
  }
  catch (error) {
    return { ok: false, message: `${rel} nicht ladbar (${error instanceof Error ? error.message : String(error)}) — Abbruch, es wird NICHTS migriert.` }
  }
  const { siteManifestSchema } = await import(
    pathToFileURL(join(REPO_ROOT, 'packages', 'core', 'shared', 'utils', 'manifestSchema.ts')).href
  )
  const parsed = siteManifestSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ')
    return { ok: false, message: `${rel} ungültig (${issues}) — Abbruch, es wird NICHTS migriert (pnpm check:manifests zeigt alles).` }
  }
  return { ok: true, manifest: parsed.data }
}

/**
 * Migrations-Dateien eines Layers, lexikografisch (= nach Nummer).
 *
 * @param {string} root
 * @param {string} layer
 * @returns {string[]} absolute Pfade
 */
export function migrationsOf(root, layer) {
  const dir = join(root, 'packages', layer, 'scripts', 'migrations')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(name => /^\d{3}-.*\.ts$/.test(name))
    .sort()
    .map(name => join(dir, name))
}

/**
 * Welche Layer darf dieser Lauf berühren? Mit Manifest: `system` + die
 * Produkte der App. Ohne Manifest (Wellen-Modus): alle bekannten Layer.
 *
 * @param {string[]} layerOrder
 * @param {{ products: string[] } | null} manifest
 * @returns {string[]}
 */
export function allowedLayersOf(layerOrder, manifest) {
  if (!manifest) return [...layerOrder]
  return layerOrder.filter(layer => layer === 'system' || manifest.products.includes(layer))
}

/**
 * Plan eines Laufs: Layer und Dateien in Ausführungsreihenfolge
 * (LAYER_ORDER, dann Nummer).
 *
 * @param {object} input
 * @param {string} input.root
 * @param {string[]} input.layerOrder
 * @param {{ products: string[] } | null} input.manifest  null = Wellen-Modus (kein App-Kontext)
 * @param {string[]} [input.layers]  ausdrückliche --layer-Angaben
 * @param {string[]} [input.only]    ausdrückliche --only-Angaben (`<layer>-<NNN>`)
 * @returns {{ ok: true, layers: string[], skipped: string[], files: { layer: string, file: string }[] } | { ok: false, message: string }}
 */
export function planMigrations({ root, layerOrder, manifest, layers = [], only = [] }) {
  if (layers.length > 0 && only.length > 0) {
    return { ok: false, message: '--layer und --only schließen sich aus — --only nennt den Layer schon selbst.' }
  }
  const allowed = allowedLayersOf(layerOrder, manifest)
  const outside = manifest
    ? 'nutzt die App laut site.manifest.ts nicht (erlaubt: ' + allowed.join(', ') + ') — ein Layer, den die App nicht nutzt, hat in ihrem Projekt nichts verloren.'
    : 'ist kein bekannter Layer (bekannt: ' + layerOrder.join(', ') + ').'

  const checkLayer = (layer) => {
    if (!layerOrder.includes(layer)) return `Unbekannter Layer „${layer}" — bekannt: ${layerOrder.join(', ')}`
    if (!allowed.includes(layer)) return `Layer „${layer}" ${outside}`
    return null
  }

  if (only.length > 0) {
    /** @type {{ layer: string, file: string }[]} */
    const picked = []
    for (const spec of only) {
      const match = /^([a-z][a-z0-9]*)-(\d{3})$/.exec(spec)
      if (!match) return { ok: false, message: `--only „${spec}" hat nicht die Form <layer>-<NNN> (z. B. brand-026).` }
      const [, layer, number] = match
      const problem = checkLayer(layer)
      if (problem) return { ok: false, message: problem }
      const files = migrationsOf(root, layer)
      const file = files.find(f => f.split(/[\\/]/).at(-1)?.startsWith(`${number}-`))
      if (!file) {
        const known = files.map(f => `${layer}-${f.split(/[\\/]/).at(-1)?.slice(0, 3)}`)
        return { ok: false, message: `--only „${spec}": keine Migration ${number} im Layer ${layer}. Vorhanden: ${known.length > 0 ? known.join(', ') : '(keine)'}` }
      }
      if (!picked.some(p => p.file === file)) picked.push({ layer, file })
    }
    picked.sort((a, b) => layerOrder.indexOf(a.layer) - layerOrder.indexOf(b.layer) || a.file.localeCompare(b.file))
    return { ok: true, layers: [...new Set(picked.map(p => p.layer))], skipped: [], files: picked }
  }

  let chosen
  let skipped = []
  if (layers.length > 0) {
    for (const layer of layers) {
      const problem = checkLayer(layer)
      if (problem) return { ok: false, message: problem }
    }
    chosen = layerOrder.filter(layer => layers.includes(layer))
  }
  else {
    chosen = allowed
    skipped = layerOrder.filter(layer => !allowed.includes(layer))
  }
  const files = chosen.flatMap(layer => migrationsOf(root, layer).map(file => ({ layer, file })))
  return { ok: true, layers: chosen, skipped, files }
}

/**
 * Ziel-Entscheidung des Runners für EIN Projekt: `checkTarget` plus die
 * Runner-Regeln zu `--prod` und `--dry-run`.
 *   • Projekt nicht erlaubt ⇒ Abbruch (nennt beide Ids), auch lokal und im Probelauf.
 *   • Entfernter Endpunkt ohne --prod ⇒ Abbruch — außer im Probelauf.
 *   • --prod mit lokalem Endpunkt ⇒ Abbruch: Aufruf und Ziel passen nicht.
 *
 * @param {object} input
 * @param {string | undefined} input.endpoint
 * @param {string | undefined} input.projectId
 * @param {string[]} input.allowedProjects
 * @param {boolean} input.prod
 * @param {boolean} input.dryRun
 * @returns {{ ok: true, local: boolean } | { ok: false, reason: string, message: string }}
 */
export function decideRunTarget({ endpoint, projectId, allowedProjects, prod, dryRun }) {
  const result = checkTarget({ endpoint, projectId, allowedProjects, confirmed: prod || dryRun ? true : undefined })
  if (!result.ok) return result
  const local = isLocalEndpoint(endpoint)
  if (prod && local) {
    return {
      ok: false,
      reason: 'prod_but_local',
      message: `--prod angegeben, aber der Endpunkt ist lokal (${endpoint}, Projekt „${projectId}") — Aufruf und Ziel passen nicht zusammen. Lokal ohne --prod aufrufen oder die Prod-Env-Datei nehmen.`,
    }
  }
  return { ok: true, local }
}
