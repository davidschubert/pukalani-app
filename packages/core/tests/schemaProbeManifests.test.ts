import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { ProductManifest } from '../shared/types/manifest'

/**
 * WÄCHTER DER SCHEMA-PROBEN (OPS-008).
 *
 * `/api/health` sagt, ob die Datenbank zum ausgerollten Programm passt — aber
 * nur so gut, wie die Probe im `product.manifest.ts` jedes Layers stimmt.
 * Bleibt sie nach einer neuen Migration stehen, meldet die Plattform `ok`,
 * obwohl die neue Spalte fehlt. Dieser Test liest die Migrations-Dateien von
 * der Platte (kein Netz, läuft auch in der CI unter Linux) und hält die
 * Manifeste daran fest:
 *  - `hasMigrations` ⇔ es gibt `scripts/migrations/NNN-*.ts`
 *  - `hasMigrations` ⇒ `schema` ist gesetzt, ohne Migrationen kein `schema`
 *  - `schema.latest` = höchste Dateinummer
 *  - die Datei `probe.migration` existiert, legt etwas an und nennt Tabelle
 *    und Spalte wörtlich (als String in Anführungszeichen)
 *  - KEINE spätere Datei legt eine Tabelle oder Spalte an (sonst gehört die
 *    Probe dorthin) und keine löscht das Geprüfte
 *
 * Eine Heuristik über Quelltext — sie sieht `createTable(` und
 * `create…Column(` (auch eigene Helfer wie `createTranslationsColumn(`),
 * Kommentare zählen nicht. Bricht ein Layer sie BEGRÜNDET, gehört er mit
 * Grund in `EXCEPTIONS`.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const PACKAGES = join(ROOT, 'packages')
const MIGRATION_FILE = /^(\d{3})-.*\.ts$/

/**
 * Begründete Ausnahmen: `<layer>-<NNN>` einer späteren Migration, die
 * etwas anlegt, ohne dass die Probe dorthin wandern soll. Heute leer.
 */
const EXCEPTIONS: Record<string, string> = {}

/** Block- und Zeilenkommentare entfernen (grob, reicht für Migrations-Skripte). */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(line => (line.trimStart().startsWith('//') ? '' : line.replace(/\s\/\/.*$/, '')))
    .join('\n')
}

function quoted(id: string): RegExp {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`['"\`]${escaped}['"\`]`)
}

const CREATES = /\bcreate\w*Table\(|\bcreate\w*Column\(/

/** Argument-Text jedes Aufrufs `name(` bis zur passenden schließenden Klammer. */
function callArguments(source: string, name: string): string[] {
  const calls: string[] = []
  let index = source.indexOf(`${name}(`)
  while (index !== -1) {
    let depth = 0
    let end = index + name.length
    for (; end < source.length; end++) {
      if (source[end] === '(') depth++
      else if (source[end] === ')' && --depth === 0) break
    }
    calls.push(source.slice(index + name.length, end + 1))
    index = source.indexOf(`${name}(`, end)
  }
  return calls
}

interface Layer {
  name: string
  manifest: ProductManifest
  /** Nummer → Quelltext ohne Kommentare. */
  migrations: Map<string, string>
}

const layers: Layer[] = await Promise.all(
  readdirSync(PACKAGES)
    .filter(name => existsSync(join(PACKAGES, name, 'product.manifest.ts')))
    .sort()
    .map(async (name) => {
      const module = await import(pathToFileURL(join(PACKAGES, name, 'product.manifest.ts')).href) as { default: ProductManifest }
      const dir = join(PACKAGES, name, 'scripts', 'migrations')
      const migrations = new Map<string, string>()
      if (existsSync(dir)) {
        for (const file of readdirSync(dir).sort()) {
          const match = MIGRATION_FILE.exec(file)
          if (!match) continue
          const previous = migrations.get(match[1]!) ?? ''
          migrations.set(match[1]!, previous + stripComments(readFileSync(join(dir, file), 'utf8')))
        }
      }
      return { name, manifest: module.default, migrations }
    }),
)

describe('Schema-Proben in den product.manifest.ts (OPS-008)', () => {
  it('findet die Layer (Gegenprobe gegen einen leeren Lauf)', () => {
    expect(layers.length).toBeGreaterThan(10)
    expect(layers.filter(layer => layer.migrations.size > 0).length).toBeGreaterThanOrEqual(18)
  })

  describe.each(layers.map(layer => [layer.name, layer] as const))('%s', (name, { manifest, migrations }) => {
    const numbers = [...migrations.keys()].sort()
    const latest = numbers.at(-1)

    it('hasMigrations stimmt mit scripts/migrations/ überein', () => {
      expect(manifest.hasMigrations, `${name}: hasMigrations`).toBe(numbers.length > 0)
    })

    if (numbers.length === 0) {
      it('ohne Migrationen kein `schema`', () => {
        expect(manifest.schema).toBeUndefined()
      })
      return
    }

    it('`schema` ist gesetzt und `latest` ist die höchste Migration', () => {
      expect(manifest.schema, `${name}: \`schema\` fehlt im product.manifest.ts`).toBeDefined()
      expect(manifest.schema!.latest, `${name}: neue Migration ${latest} — \`schema.latest\` nachziehen`).toBe(latest)
    })

    it('die Probe zeigt auf eine Migration, die Tabelle/Spalte wörtlich anlegt', () => {
      const probe = manifest.schema!.probe
      const source = migrations.get(probe.migration)
      expect(source, `${name}: Migration ${probe.migration} gibt es nicht`).toBeDefined()
      expect(probe.migration <= latest!).toBe(true)
      expect(CREATES.test(source!), `${name}-${probe.migration} legt weder Tabelle noch Spalte an`).toBe(true)
      expect(quoted(probe.table).test(source!), `${name}-${probe.migration} nennt die Tabelle '${probe.table}' nicht`).toBe(true)
      if (probe.column) {
        expect(quoted(probe.column).test(source!), `${name}-${probe.migration} nennt die Spalte '${probe.column}' nicht`).toBe(true)
      }
    })

    it('keine spätere Migration legt etwas an oder löscht das Geprüfte', () => {
      const probe = manifest.schema!.probe
      for (const number of numbers.filter(n => n > probe.migration)) {
        const source = migrations.get(number)!
        if (!EXCEPTIONS[`${name}-${number}`]) {
          expect(
            CREATES.test(source),
            `Migration ${number} legt eine Tabelle oder Spalte an, die Probe steht aber noch auf ${probe.migration} — \`schema.probe\` im product.manifest.ts nachziehen (${name})`,
          ).toBe(false)
        }
        const dropsTable = callArguments(source, 'deleteTable').some(args => quoted(probe.table).test(args))
        const dropsColumn = probe.column !== undefined
          && callArguments(source, 'deleteColumn').some(args => quoted(probe.column!).test(args))
        expect(dropsTable || dropsColumn, `${name}-${number} löscht, was die Probe prüft`).toBe(false)
      }
    })
  })
})
