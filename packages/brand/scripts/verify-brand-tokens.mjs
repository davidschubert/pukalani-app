/**
 * DER FREMDE LESER (Konzept docs/plans/BRAND-BOOK-KIT.md §2.18 Zeile K2:
 * „Style-Dictionary-v5-Probelauf im Skript").
 *
 * ── WARUM ES DIESEN LAUF GIBT ────────────────────────────────────────────
 * Unsere Tests prüfen `tokens.json` gegen UNSER Bild der Norm (das Zod-Schema
 * in `schemas/brandTokens.ts`). Das ist die halbe Wahrheit: die Datei ist erst
 * dann etwas wert, wenn ein FREMDES Werkzeug sie lesen kann. Style Dictionary 5
 * ist genau dieses Werkzeug — es liest DTCG als Vorgabe, es löst Aliasse auf,
 * und es sagt sofort, wenn ein Verweis ins Leere zeigt.
 *
 * ── KEINE NEUE ABHÄNGIGKEIT ──────────────────────────────────────────────
 * Der Lauf holt Style Dictionary über `npx --yes` und wirft es danach weg.
 * Es steht bewusst NICHT im Katalog und nicht in einer `package.json`: es ist
 * kein Teil des Produkts, sondern ein Zeuge — und `check:single-copy` hätte
 * ein Werkzeug zu bewachen, das nie in einem Build landet. Der Preis ist, dass
 * dieser Lauf ein Netz braucht; deshalb ist er ein SKRIPT und kein Test.
 *
 * ── WAS ER PRÜFT ─────────────────────────────────────────────────────────
 *  1. Style Dictionary liest die Datei ohne Fehler und ohne Warnung über
 *     unaufgelöste Verweise.
 *  2. Die erzeugte CSS-Datei enthält für JEDE Rolle beider Modi und für jede
 *     Rampen-Stufe eine Variable — gezählt, nicht überflogen.
 *  3. Die Farben der Rollen sind die AUFGELÖSTEN Werte, nicht die Aliasse.
 *
 * AUFRUF: `node packages/brand/scripts/verify-brand-tokens.mjs`
 * (aus dem Repo-Wurzelverzeichnis oder von überall — die Pfade sind absolut).
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const jiti = createJiti(import.meta.url)

function fail(message) {
  console.error(`✗ ${message}`)
  process.exitCode = 1
}

function ok(message) {
  console.log(`✓ ${message}`)
}

const { KAILUA_COFFEE_DESIGN } = await jiti.import(join(ROOT, 'shared/examples/kailuaCoffeeDesign.ts'))
const { buildBrandTokens, renderBrandTokensJson } = await jiti.import(join(ROOT, 'shared/brandTokens.ts'))
const { BRAND_RAMP_SHADES } = await jiti.import(join(ROOT, 'shared/types/brand.ts'))

const preset = KAILUA_COFFEE_DESIGN
if (!preset) {
  fail('Die Kailua-Fixture fehlt — ohne sie prüft dieser Lauf nichts.')
  process.exit(1)
}

const tokens = buildBrandTokens(preset, {
  title: 'Kailua Coffee Co.',
  stand: '2026-09-09T10:20:00.000Z',
  locale: 'de',
})

const work = mkdtempSync(join(tmpdir(), 'brand-tokens-'))
try {
  writeFileSync(join(work, 'tokens.json'), renderBrandTokensJson(tokens))
  writeFileSync(join(work, 'config.json'), `${JSON.stringify({
    source: ['tokens.json'],
    platforms: {
      css: {
        transformGroup: 'css',
        buildPath: 'build/',
        files: [{ destination: 'variables.css', format: 'css/variables' }],
      },
    },
  }, null, 2)}\n`)

  let output = ''
  try {
    output = execFileSync('npx', ['--yes', 'style-dictionary@5', 'build', '--config', 'config.json'], {
      cwd: work,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  }
  catch (error) {
    fail(`Style Dictionary konnte die Datei nicht bauen:\n${error.stdout ?? ''}${error.stderr ?? ''}`)
    process.exit(1)
  }

  // „Reference doesn't exist" ist die Meldung, auf die es ankommt: sie wäre ein
  // Alias, den nur unser eigener Auflöser versteht.
  if (/reference doesn't exist|Broken references|Error:/i.test(output)) {
    fail(`Style Dictionary meldet Verweise ins Leere:\n${output}`)
  }
  else {
    ok('Style Dictionary 5 liest tokens.json ohne unaufgelöste Verweise.')
  }

  const css = readFileSync(join(work, 'build/variables.css'), 'utf8')
  const variables = css.match(/--[a-z0-9-]+:/gi) ?? []
  ok(`Die erzeugte CSS-Datei trägt ${variables.length} Variablen.`)

  let missing = 0
  for (const shade of BRAND_RAMP_SHADES) {
    if (!css.includes(`--color-brand-${shade}:`)) {
      fail(`Rampen-Stufe ${shade} fehlt in der Ausgabe.`)
      missing++
    }
  }
  for (const scheme of ['light', 'dark']) {
    for (const role of preset.color.roles) {
      if (!css.includes(`--color-${scheme}-${role.id}:`)) {
        fail(`Rolle ${scheme}.${role.id} fehlt in der Ausgabe.`)
        missing++
      }
    }
  }
  if (!missing) ok('Jede Rampen-Stufe und jede Rolle beider Modi steht in der Ausgabe.')

  // Aliasse müssen AUFGELÖST ankommen — ein `{color.brand.900}` im CSS wäre
  // ein Verweis, den kein Browser lesen kann.
  if (/\{[a-z0-9.-]+\}/i.test(css)) {
    fail('In der Ausgabe steht noch ein unaufgelöster Alias.')
  }
  else {
    ok('Alle Aliasse sind aufgelöst — im CSS stehen Werte, keine Verweise.')
  }

  if (!process.exitCode) console.log('\nAlles grün.')
}
finally {
  rmSync(work, { recursive: true, force: true })
}
