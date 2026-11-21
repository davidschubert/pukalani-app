#!/usr/bin/env node
/**
 * Manifest-Check (Strategie F1) — beendet die Doppelpflege von `extends` +
 * `package.json`: das Site-Manifest ist die Single Source of Truth, dieses
 * Script erzwingt Konsistenz. Läuft in der CI (lint) und lokal:
 *
 *   pnpm check:manifests
 *
 * Prüfungen:
 *  1. Jeder Layer unter packages/ hat ein Zod-valides product.manifest.ts;
 *     key === Ordnername; Manifeste nutzen nur `import type` (Erasability
 *     für --experimental-strip-types).
 *  2. hasMigrations ⇔ scripts/migrations/ existiert; jeder Layer mit
 *     Migrationen steht in der LAYER_ORDER von scripts/migrate.mjs (Drift!).
 *  3. Jede App unter apps/ hat ein Zod-valides site.manifest.ts; siteId ===
 *     Ordnername (ohne führenden Unterstrich); Produkte existieren;
 *     requires-Schluss erfüllt (transitiv).
 *  4. extends in nuxt.config.ts = Produkte in kanonischer EXTENDS_ORDER
 *     + core + system am Ende (früher gelistet = höhere Priorität).
 *  5. @pukalani/*-Dependencies in package.json = exakt Produkte + core + system.
 *  6. `apiPrefixes` im Manifest ⇒ `server/plugins/product-manifest.ts` Pflicht
 *     (PM1, 2026-09-09): das Manifest-FILE ist `import type`-only, erst das
 *     Nitro-Plugin registriert es zur Laufzeit (`registerProductManifest`).
 *     Ohne Plugin ist `apiPrefixes` ein Versprechen ohne Wirkung — die
 *     Produkt-Middleware (core/server/middleware/04.product-gate.ts) kennt
 *     nur die Registry, Notabschaltung und Sweep-Gates laufen ins Leere
 *     (`market` fuhr so seit M1, COMPLETE „BI1 I1"). Das Plugin muss den
 *     Aufruf wörtlich enthalten; Ausnahmen stehen begründet in
 *     MANIFEST_PLUGIN_EXCEPTIONS.
 *  7. JEDE ROUTE EINES ABSCHALTBAREN LAYERS LIEGT UNTER SEINEN `apiPrefixes`
 *     (BE-005, GA1 P20): die Routen kommen aus dem Dateibaum
 *     (`server/api/**`), nicht aus einer Liste. Eine Route daneben erreicht
 *     der Not-Aus des Produkts nicht — so lag die Galerie von `brand`
 *     (`/api/discover`) monatelang außerhalb. Dazu: kein Präfix deckt Routen
 *     eines ANDEREN Layers, kein Präfix zeigt ins Leere, und ein
 *     abschaltbarer Layer hat nichts unter `server/routes/`. Layer der Stufe
 *     `foundation` sind nicht abschaltbar und deshalb ausgenommen — dass das
 *     stimmt, liest die Prüfung an den zwei Stellen im Code nach, die es
 *     festlegen. Ausnahmen mit Grund: ROUTE_PREFIX_EXCEPTIONS in
 *     scripts/lib/manifest-routes.mjs (tote Einträge sind rot).
 *  8. KEINE GLOBALE `pageTransition` IN EINER APP MIT DASHBOARD (CLAUDE.md,
 *     2026-09-08 live erwischt): `UDashboardPanel` ist mehrwurzelig, mit
 *     `mode: 'out-in'` bleibt der Seitenbereich nach dem ersten Klick leer —
 *     ohne Fehler, nur im Prod-Build. „Mit Dashboard" = der Layer `admin`
 *     steht in den Produkten der App.
 *  9. DIE LÖSCH-PFLICHT (OPS-012, GA1 P20): das Manifest sagt `userData`,
 *     der Dateibaum sagt, ob der Beitrag für Auskunft und Löschung
 *     registriert wird, die MIGRATIONEN sagen, welche Tabellen und Spalten
 *     der Layer anlegt. `true` ohne Beitrag, `false` mit einer Personen-Spalte
 *     oder eine Tabelle mit Personen-Spalte ohne Entscheidung in
 *     `core/tests/support/userDataTables.ts` — alles rot. Regel und
 *     Ausnahmen: scripts/lib/user-data-duty.mjs. Kann der Leser eine
 *     Migration nicht lesen, ist auch das rot (scripts/lib/migration-inventory.mjs).
 * 10. DIE DATENTÜR-LISTE (OPS-012): legt ein Layer `communityId` an, steht er
 *     in DATA_DOOR_LAYERS (ESLint verbietet dort rohes tablesDB) oder mit
 *     Grund in DATA_DOOR_EXEMPT — scripts/lib/data-door-layers.mjs.
 * 11. DIE EINORDNUNG DER LAYER (Q18, ARC-008): das Feld `kind` im Manifest ist
 *     die EINE Quelle dafür, wer wen kennen darf (Stufe 1 `base`, Stufe 2
 *     `foundation`, `seam`, `product`). `eslint.config.mjs` liest es als TEXT
 *     (scripts/lib/layer-kinds.mjs) — hier steht, dass der Text-Leser dasselbe
 *     sieht wie das geladene Manifest. Dazu: Stufe 1 ist genau `core` und
 *     `system`, und `foundation`-tier heißt nicht abschaltbar, also nie
 *     `product`.
 * 12. ABHÄNGIGKEITEN ÜBER AUTO-IMPORT (Q18, ARC-003): nutzt ein Layer einen
 *     Namen eines anderen Layers ohne Import-Zeile, steht dieser in
 *     `requires` (auch transitiv) oder ist Stufe 1; ein Fundament-Layer
 *     braucht nie ein Produkt oder eine Naht. scripts/lib/autoimport-coupling.mjs.
 *
 * Ausgabe pro Verstoß eine Zeile (Datei · erwartet/ist), Exit 1 bei Fehlern.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { layerRoutes, routeCoverageProblems } from './lib/manifest-routes.mjs'
import { layerInventory } from './lib/migration-inventory.mjs'
import { CONTRIBUTOR_FILE, userDataDutyProblems } from './lib/user-data-duty.mjs'
import { dataDoorProblems } from './lib/data-door-layers.mjs'
import { kindFromManifestSource } from './lib/layer-kinds.mjs'
import { couplingProblems } from './lib/autoimport-coupling.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Kanonische extends-Reihenfolge (IST der comments-App): UI-/Produkt-
// Layer zuerst (höchste Priorität), Fundament core → system am Ende.
// blueprint (Kompositions-Layer) steht VOR den Produkt-Layern — seine
// Seiten-Kompositionen (Feed+Kommentare, …) müssen die „nackten"
// Produkt-Seiten überlagern (früher gelistet = höhere Priorität).
// `marketing` steht GANZ VORN: es ist der Chrome-Layer (Kopf/Fuß der
// öffentlichen Seiten, Marken-CSS). Er besitzt keine Daten und keine
// Produkt-Logik — seine Optik soll aber jede andere überlagern, und seine
// CSS-Dateien müssen früh in der Kette stehen.
const EXTENDS_ORDER = [
  'marketing', 'themes', 'admin', 'control', 'blueprint', 'comments', 'posts', 'events', 'media', 'feedback',
  'billing', 'courses', 'tickets', 'runner', 'activity', 'messages', 'moderation',
]
const FOUNDATION_ALWAYS = ['core', 'system']

// Prüfung 6 — Layer, die `apiPrefixes` deklarieren, aber BEWUSST kein
// server/plugins/product-manifest.ts haben. Jeder Eintrag braucht eine
// Begründung und Davids Entscheidung (DECISION-LOG). Heute leer: die drei
// Kandidaten domains/onboarding/runner haben am 2026-09-09 ein Plugin
// bekommen (PM1, Davids Entscheidung — Empfehlung angenommen).
const MANIFEST_PLUGIN_EXCEPTIONS = new Map([
  // ['layer', 'Begründung — wer/wann entschieden'],
])

const errors = []
const err = (msg) => errors.push(msg)

const { productManifestSchema, siteManifestSchema } = await import(
  pathToFileURL(join(ROOT, 'packages/core/shared/utils/manifestSchema.ts')).href
)

function listDirs(parent) {
  return readdirSync(join(ROOT, parent), { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => e.name)
}

/** Nur `import type` erlaubt — Wert-Importe brechen das Strip-Types-Laden. */
function checkTypeOnlyImports(file, rel) {
  const src = readFileSync(file, 'utf8')
  const valueImport = src.match(/^import\s+(?!type\s)[^\n]*$/m)
  if (valueImport) err(`${rel}: Wert-Import gefunden („${valueImport[0].trim()}") — Manifeste dürfen nur \`import type\` nutzen`)
}

// ── 1+2: Produkt-Manifeste ────────────────────────────────────────────────
const layers = listDirs('packages')
const manifests = new Map()

for (const layer of layers) {
  const rel = `packages/${layer}/product.manifest.ts`
  const file = join(ROOT, rel)
  if (!existsSync(file)) {
    err(`${rel}: fehlt — jeder Layer braucht ein Produkt-Manifest`)
    continue
  }
  checkTypeOnlyImports(file, rel)

  let manifest
  try {
    manifest = (await import(pathToFileURL(file).href)).default
  }
  catch (e) {
    err(`${rel}: nicht ladbar — ${e.message}`)
    continue
  }
  const parsed = productManifestSchema.safeParse(manifest)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) err(`${rel}: ${issue.path.join('.') || '(root)'} — ${issue.message}`)
    continue
  }
  if (parsed.data.key !== layer) err(`${rel}: key „${parsed.data.key}" ≠ Ordnername „${layer}"`)

  const hasDir = existsSync(join(ROOT, 'packages', layer, 'scripts', 'migrations'))
  if (parsed.data.hasMigrations !== hasDir) {
    err(`${rel}: hasMigrations=${parsed.data.hasMigrations}, aber scripts/migrations/ ${hasDir ? 'existiert' : 'fehlt'}`)
  }
  manifests.set(layer, parsed.data)
}

// ── 6: apiPrefixes ⇒ Laufzeit-Plugin ────────────────────────────────────
for (const [layer, m] of manifests) {
  if (!m.apiPrefixes?.length) continue
  const rel = `packages/${layer}/server/plugins/product-manifest.ts`
  const file = join(ROOT, rel)
  if (MANIFEST_PLUGIN_EXCEPTIONS.has(layer)) {
    if (existsSync(file)) err(`${rel}: existiert, der Layer steht aber in MANIFEST_PLUGIN_EXCEPTIONS — Ausnahme streichen`)
    continue
  }
  if (!existsSync(file)) {
    err(`${rel}: fehlt — das Manifest deklariert apiPrefixes [${m.apiPrefixes.join(', ')}], ohne Plugin registriert sie niemand (Notabschaltung tot; Muster: packages/insights)`)
    continue
  }
  const src = readFileSync(file, 'utf8')
  if (!/registerProductManifest\s*\(\s*manifest\s*\)/.test(src) || !/from\s+'\.\.\/\.\.\/product\.manifest'/.test(src)) {
    err(`${rel}: muss \`import manifest from '../../product.manifest'\` und \`registerProductManifest(manifest)\` enthalten`)
  }
}

// ── 7: jede Route eines abschaltbaren Layers liegt unter seinen Präfixen ─
{
  for (const problem of routeCoverageProblems(
    [...manifests].map(([layer, m]) => ({ key: layer, tier: m.tier, apiPrefixes: m.apiPrefixes, ...layerRoutes(ROOT, layer) })),
  )) err(problem)

  // Die Ausnahme „foundation" stimmt nur, solange diese Layer wirklich nicht
  // abschaltbar sind. Zwei Stellen legen das fest — fällt eine weg, gilt die
  // Ausnahme nicht mehr, und Prüfung 7 muss auch für sie gelten.
  const premises = [
    ['packages/admin/server/api/admin/products/[key].patch.ts', /manifest\.tier\s*!==\s*'optional'/, 'die Schalt-Route lehnt alles ab, was nicht `optional` ist'],
    ['packages/core/server/utils/entitlementDocument.ts', /if\s*\(tier\s*===\s*'foundation'\)\s*return true/, 'ein Entitlement schaltet `foundation` nie ab'],
  ]
  for (const [rel, pattern, what] of premises) {
    const file = join(ROOT, rel)
    if (!existsSync(file) || !pattern.test(readFileSync(file, 'utf8'))) {
      err(`${rel}: die Stelle „${what}" ist nicht mehr zu finden — Prüfung 7 nimmt Layer der Stufe \`foundation\` nur deshalb aus. Entweder die Stelle wiederherstellen oder die Ausnahme in scripts/lib/manifest-routes.mjs aufheben.`)
    }
  }
}

// ── 9 + 10: Lösch-Pflicht und Datentür, aus den Migrationen gelesen ──────
{
  const { USER_DATA_TABLES } = await import(
    pathToFileURL(join(ROOT, 'packages/core/tests/support/userDataTables.ts')).href
  )
  const read = []
  for (const [layer, m] of manifests) {
    const inventory = layerInventory(ROOT, layer)
    for (const note of inventory.unresolved) {
      err(`${note} — der Leser der Migrationen versteht diese Stelle nicht, die Wächter für Lösch-Pflicht und Datentür wären hier blind. Tabelle und Spalte als Literal oder Konstante derselben Datei schreiben (Stil der übrigen Migrationen), oder die Datei mit Grund in MIGRATION_READ_HINTS (scripts/lib/migration-inventory.mjs) eintragen.`)
    }
    for (const note of inventory.staleHints) err(note)
    const contributorFile = join(ROOT, 'packages', layer, CONTRIBUTOR_FILE(layer))
    read.push({
      key: layer,
      userData: m.userData,
      hasContributor: existsSync(contributorFile) && /registerUserDataContributor\s*\(/.test(readFileSync(contributorFile, 'utf8')),
      hasServerApi: existsSync(join(ROOT, 'packages', layer, 'server', 'api')),
      tables: inventory.tables,
      touched: inventory.touched,
      tenantTables: [...inventory.tables, ...inventory.touched].filter(([, columns]) => columns.has('communityId')).map(([table]) => table),
    })
  }
  for (const problem of userDataDutyProblems({ layers: read, registry: USER_DATA_TABLES })) err(problem)
  for (const problem of dataDoorProblems({ layers: read })) err(problem)
}

// requires müssen existieren
for (const [layer, m] of manifests) {
  for (const req of m.requires ?? []) {
    if (!manifests.has(req)) err(`packages/${layer}/product.manifest.ts: requires „${req}" — Layer existiert nicht`)
  }
}

// ── 11: die Einordnung hat eine Quelle, und der Text-Leser sieht sie ──────
{
  const BASE_LAYERS = ['core', 'system']
  for (const [layer, m] of manifests) {
    const rel = `packages/${layer}/product.manifest.ts`
    let fromText
    try {
      fromText = kindFromManifestSource(readFileSync(join(ROOT, rel), 'utf8'), rel)
    }
    catch (e) {
      err(e.message)
      continue
    }
    if (fromText !== m.kind) err(`${rel}: der Text-Leser für eslint.config.mjs liest kind '${fromText}', das Manifest sagt '${m.kind}' (scripts/lib/layer-kinds.mjs)`)
    if ((m.kind === 'base') !== BASE_LAYERS.includes(layer)) err(`${rel}: kind 'base' (Fundament Stufe 1) haben genau ${BASE_LAYERS.join(' und ')} — sie sind in jeder App; ein weiterer Layer gehört nach 'foundation'`)
    if (m.tier === 'foundation' && m.kind === 'product') err(`${rel}: tier 'foundation' (nicht abschaltbar) und kind 'product' passen nicht zusammen — ein Produkt lässt sich abschalten`)
  }

  // Die Doku liest nicht, sie wird gelesen: die Tabelle in CONCEPT.md A14
  // steht je Layer unter der Überschrift seines `kind` (eine Zeile je Layer).
  const conceptRel = 'docs/CONCEPT.md'
  const concept = readFileSync(join(ROOT, conceptRel), 'utf8')
  const a14Start = concept.search(/^### A14\b/m)
  const fromA14 = a14Start < 0 ? '' : concept.slice(a14Start)
  const nextSection = fromA14.slice(1).search(/^### /m)
  const a14 = nextSection < 0 ? fromA14 : fromA14.slice(0, nextSection + 1)
  if (!a14) err(`${conceptRel}: Abschnitt „### A14" nicht gefunden — Prüfung 11 kann die Layer-Tabelle nicht lesen`)
  const documented = new Map()
  let heading = null
  for (const line of a14.split('\n')) {
    const kindHeading = line.match(/^\*\*[^*]+\*\* \(`kind: '([a-z]+)'`/)
    if (kindHeading) heading = kindHeading[1]
    else if (/^\*\*/.test(line)) heading = null
    const row = line.match(/^\| `([a-z][a-z0-9-]*)` \|/)
    if (!row) continue
    if (documented.has(row[1])) err(`${conceptRel} A14: Layer „${row[1]}" steht zweimal in der Tabelle`)
    documented.set(row[1], heading)
  }
  for (const [layer, m] of manifests) {
    if (!documented.has(layer)) err(`${conceptRel} A14: Layer „${layer}" fehlt in der Tabelle (unter der Überschrift mit \`kind: '${m.kind}'\`)`)
    else if (documented.get(layer) !== m.kind) err(`${conceptRel} A14: Layer „${layer}" steht unter ${documented.get(layer) ? `\`kind: '${documented.get(layer)}'\`` : 'einer Überschrift ohne kind'}, sein Manifest sagt '${m.kind}'`)
  }
  for (const layer of documented.keys()) {
    if (!manifests.has(layer)) err(`${conceptRel} A14: Layer „${layer}" steht in der Tabelle, existiert aber nicht unter packages/`)
  }
}

// ── 12: Abhängigkeiten über Auto-Import stehen in requires ────────────────
{
  const kindOf = Object.fromEntries([...manifests].map(([layer, m]) => [layer, m.kind]))
  const requiresOf = Object.fromEntries([...manifests].map(([layer, m]) => [layer, m.requires ?? []]))
  for (const problem of couplingProblems({ root: ROOT, kindOf, requiresOf })) err(problem)
}

// Destruktiv-Guard (M3): zerstörerische Appwrite-Aufrufe in Migrationen nur
// mit Marker `// destruktiv-ok: <Begründung>` — additiv-sicher ist Default,
// jede Ausnahme muss begründet UND geguardet sein (Audit: M3-MIGRATIONS-AUDIT).
{
  const destructivePattern = /\.(deleteTable|deleteColumn|deleteIndex|deleteRow|deleteRows|update\w*Column)\s*\(/g
  for (const layer of layers) {
    const dir = join(ROOT, 'packages', layer, 'scripts', 'migrations')
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith('.ts')) continue
      const rel = `packages/${layer}/scripts/migrations/${entry}`
      const src = readFileSync(join(dir, entry), 'utf8')
      const calls = [...src.matchAll(destructivePattern)].map(m => m[1])
      if (calls.length > 0 && !src.includes('destruktiv-ok:')) {
        err(`${rel}: zerstörerische Aufrufe (${[...new Set(calls)].join(', ')}) ohne \`// destruktiv-ok:\`-Marker — Guard + Begründung nötig (M3)`)
      }
    }
  }
}

// LAYER_ORDER-Drift gegen scripts/migrate.mjs
{
  const migrateSrc = readFileSync(join(ROOT, 'scripts/migrate.mjs'), 'utf8')
  const match = migrateSrc.match(/const LAYER_ORDER = \[([^\]]+)\]/)
  if (!match) {
    err('scripts/migrate.mjs: LAYER_ORDER nicht gefunden — Drift-Check unmöglich')
  }
  else {
    const order = [...match[1].matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1])
    for (const [layer, m] of manifests) {
      if (m.hasMigrations && !order.includes(layer)) err(`scripts/migrate.mjs: Layer „${layer}" hat Migrationen, fehlt aber in LAYER_ORDER`)
    }
    for (const entry of order) {
      if (!manifests.get(entry)?.hasMigrations) err(`scripts/migrate.mjs: LAYER_ORDER enthält „${entry}", der Layer hat aber keine Migrationen (mehr)`)
    }
  }
}

// ── 3–5: Site-Manifeste + extends + package.json ──────────────────────────
for (const app of listDirs('apps')) {
  const rel = `apps/${app}/site.manifest.ts`
  const file = join(ROOT, rel)
  if (!existsSync(file)) {
    err(`${rel}: fehlt — jede App braucht ein Site-Manifest`)
    continue
  }
  checkTypeOnlyImports(file, rel)

  let site
  try {
    site = (await import(pathToFileURL(file).href)).default
  }
  catch (e) {
    err(`${rel}: nicht ladbar — ${e.message}`)
    continue
  }
  const parsed = siteManifestSchema.safeParse(site)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) err(`${rel}: ${issue.path.join('.') || '(root)'} — ${issue.message}`)
    continue
  }
  const { siteId, products } = parsed.data

  if (siteId !== app.replace(/^_/, '')) err(`${rel}: siteId „${siteId}" ≠ App-Ordner „${app}" (ohne führenden Unterstrich)`)
  if (new Set(products).size !== products.length) err(`${rel}: doppelte Produkt-Einträge`)

  for (const f of products) {
    if (!manifests.has(f)) err(`${rel}: Produkt „${f}" existiert nicht unter packages/`)
    if (FOUNDATION_ALWAYS.includes(f)) err(`${rel}: „${f}" ist implizit immer dabei — nicht listen`)
  }

  // requires-Schluss (transitiv)
  const missing = new Set()
  const visit = (key) => {
    for (const req of manifests.get(key)?.requires ?? []) {
      if (!products.includes(req)) missing.add(`${key} → ${req}`)
      else visit(req)
    }
  }
  for (const f of products) visit(f)
  for (const m of missing) err(`${rel}: requires verletzt — ${m} fehlt in products`)

  // extends-Konsistenz (Menge + kanonische Reihenfolge)
  const expected = [
    ...EXTENDS_ORDER.filter(l => products.includes(l)),
    ...products.filter(f => !EXTENDS_ORDER.includes(f)), // neue Layer: ans Ende der Produkte
    ...FOUNDATION_ALWAYS,
  ].map(l => `../../packages/${l}`)
  const nuxtSrc = readFileSync(join(ROOT, 'apps', app, 'nuxt.config.ts'), 'utf8')
  const extendsMatch = nuxtSrc.match(/extends:\s*\[([^\]]+)\]/)
  if (!extendsMatch) {
    err(`apps/${app}/nuxt.config.ts: extends-Array nicht gefunden`)
  }
  else {
    const actual = [...extendsMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1])
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      err(`apps/${app}/nuxt.config.ts: extends passt nicht zum Site-Manifest\n    erwartet: [${expected.join(', ')}]\n    ist:      [${actual.join(', ')}]`)
    }
  }

  // ── 8: keine globale pageTransition in einer App mit Dashboard ─────────
  if (products.includes('admin')) {
    const code = nuxtSrc.split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n')
    if (/\bpageTransition\s*:/.test(code)) {
      err(`apps/${app}/nuxt.config.ts: globale \`pageTransition\` in einer App mit Dashboard (Layer admin) — im Prod-Build bleibt der Seitenbereich nach dem ersten Klick leer. Übergänge je Route über <NuxtPage :transition> (Muster: apps/portfolio, Layout \`site\`).`)
    }
  }

  // package.json-Konsistenz (@pukalani/*-Menge)
  const pkg = JSON.parse(readFileSync(join(ROOT, 'apps', app, 'package.json'), 'utf8'))
  const actualDeps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    .filter(d => d.startsWith('@pukalani/')).map(d => d.slice('@pukalani/'.length)).sort()
  const expectedDeps = [...products, ...FOUNDATION_ALWAYS].sort()
  const missingDeps = expectedDeps.filter(d => !actualDeps.includes(d))
  const extraDeps = actualDeps.filter(d => !expectedDeps.includes(d))
  for (const d of missingDeps) err(`apps/${app}/package.json: @pukalani/${d} fehlt (im Site-Manifest gewählt)`)
  for (const d of extraDeps) err(`apps/${app}/package.json: @pukalani/${d} überzählig (nicht im Site-Manifest)`)
}

// ── Ergebnis ──────────────────────────────────────────────────────────────
if (errors.length) {
  console.error(`✗ Manifest-Check: ${errors.length} Verstoß/Verstöße\n`)
  for (const e of errors) console.error(`  ✗ ${e}`)
  process.exit(1)
}
console.log(`✔ Manifest-Check: ${manifests.size} Layer, ${listDirs('apps').length} Apps — konsistent`)
