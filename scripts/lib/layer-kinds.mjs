/**
 * WELCHER LAYER IST WAS — die EINE Quelle ist das Feld `kind` im
 * `packages/<layer>/product.manifest.ts` (Q18, ARC-008).
 *
 * Vorher stand die Einteilung an vier Stellen von Hand (Lint-Konfiguration,
 * Konzept, Regelwerk, Manifest-Feld `tier`) und an jeder anders. Jetzt lesen
 * `eslint.config.mjs` und `scripts/check-manifests.mjs` von hier.
 *
 * WARUM TEXT GELESEN WIRD UND NICHT IMPORTIERT: `eslint.config.mjs` lädt auch
 * ein Editor mit eigenem, älterem Node — ein `import` einer `.ts`-Datei bräche
 * dort die ganze Konfiguration. Die Zeile hat deshalb eine FESTE Form
 * (`  kind: '<wert>',` allein in einer Zeile, genau einmal je Datei); alles
 * andere wirft. `pnpm check:manifests` (Prüfung 11) vergleicht das Gelesene
 * mit dem wirklich geladenen Manifest — der Leser kann also nicht still
 * etwas anderes sehen als das Programm.
 *
 * Die vier Werte (Typ: packages/core/shared/types/manifest.ts):
 *  - base        Fundament, Stufe 1: `core`, `system`. In jeder App. Kennen
 *                nur einander.
 *  - foundation  Fundament, Stufe 2. Kennt Stufe 1, nie ein Produkt oder
 *                eine Naht.
 *  - seam        Naht: darf mehrere andere kennen (je eigener Lint-Block).
 *  - product     Produkt: kennt kein anderes Produkt.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const LAYER_KINDS = ['base', 'foundation', 'seam', 'product']

const KIND_LINE = /^ {2}kind: '([a-z]+)',$/gm

/** Liest `kind` aus dem Text eines Manifests; wirft bei jeder Abweichung von der festen Form. */
export function kindFromManifestSource(source, label) {
  const found = [...source.matchAll(KIND_LINE)].map(match => match[1])
  if (found.length !== 1) {
    throw new Error(`${label}: erwartet GENAU EINE Zeile der Form \`  kind: '<${LAYER_KINDS.join('|')}>',\` — gefunden: ${found.length} (scripts/lib/layer-kinds.mjs)`)
  }
  if (!LAYER_KINDS.includes(found[0])) {
    throw new Error(`${label}: kind '${found[0]}' gibt es nicht — erlaubt: ${LAYER_KINDS.join(', ')}`)
  }
  return found[0]
}

/**
 * Alle Layer unter `packages/`, nach `kind` sortiert.
 * Ein Ordner ohne Manifest oder ohne lesbare Zeile wirft — ein Layer ohne
 * Einordnung soll Lint und Manifest-Prüfung sofort brechen.
 */
export function readLayerKinds(root) {
  const packagesDir = join(root, 'packages')
  const byKind = Object.fromEntries(LAYER_KINDS.map(kind => [kind, []]))
  const kindOf = {}
  const layers = readdirSync(packagesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => entry.name)
    .sort()
  for (const layer of layers) {
    const rel = `packages/${layer}/product.manifest.ts`
    const file = join(root, rel)
    if (!existsSync(file)) throw new Error(`${rel}: fehlt — jeder Layer braucht ein Manifest mit \`kind\` (scripts/lib/layer-kinds.mjs)`)
    const kind = kindFromManifestSource(readFileSync(file, 'utf8'), rel)
    byKind[kind].push(layer)
    kindOf[layer] = kind
  }
  return { layers, kindOf, ...byKind }
}
