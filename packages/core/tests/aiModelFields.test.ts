import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { stripComments } from '../../../scripts/lib/migration-inventory.mjs'
import { MODEL_FIELDS, MODEL_LIST_FIELDS, NOT_A_MODEL_CHOICE } from '../../../scripts/ops/ai-model-endpoints.mjs'

/**
 * OPS-012 (GA1 P20): die FELDNAMEN, unter denen der tägliche Modell-Wächter
 * (`scripts/ops/verify-ai-models.mjs`) nach Modell-Wahlen sucht, standen in
 * einer Liste von Hand. BE-004 war die Folge: `imageModel` fehlte, das
 * Bildmodell hatte keinen Endpunkt mehr, der Wächter blieb grün.
 *
 * Hier kommt die Liste aus dem Code: jedes Feld `…Model` / `…Models` in einer
 * `app.config.ts` (Layer und Apps) steht in der Feldliste des Wächters oder
 * mit Grund in `NOT_A_MODEL_CHOICE`.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

export function modelFieldNames(source: string): string[] {
  const code = stripComments(source)
  return [...new Set([...code.matchAll(/(?:^|[{,\s])([A-Za-z]*[mM]odels?)\s*:/g)].map(match => match[1]!))]
}

function configFiles(): string[] {
  const files: string[] = []
  for (const group of ['packages', 'apps']) {
    for (const name of readdirSync(join(ROOT, group))) {
      const file = join(ROOT, group, name, 'app', 'app.config.ts')
      if (existsSync(file)) files.push(file)
    }
  }
  return files
}

describe('Modell-Felder: der tägliche Wächter kennt jedes Feld aus dem Code', () => {
  const known = new Set<string>([...MODEL_FIELDS, ...MODEL_LIST_FIELDS])
  const found = new Map<string, string>()
  for (const file of configFiles()) {
    for (const field of modelFieldNames(readFileSync(file, 'utf8'))) {
      if (!found.has(field)) found.set(field, file.slice(ROOT.length + 1))
    }
  }

  it('der Leser findet Felder in jeder Schreibweise und überliest Kommentare', () => {
    expect(modelFieldNames(`
      ai: { reviewModel: 'a/b' }, // imageModel: 'im/kommentar'
      model: '',
      outsideViewModels: [] as string[],
      /* videoModel: 'auch/kommentar' */
      modelLabel: 'kein Modell-Feld',
    `)).toEqual(['reviewModel', 'model', 'outsideViewModels'])
  })

  it('findet die Felder des Repos', () => {
    expect(found.has('model')).toBe(true)
    expect(found.has('imageModel')).toBe(true)
    expect(found.size).toBeGreaterThanOrEqual(8)
  })

  it('jedes Modell-Feld steht in der Feldliste des Wächters oder ist mit Grund ausgenommen', () => {
    const unknown = [...found].filter(([field]) => !known.has(field) && !(field in NOT_A_MODEL_CHOICE))
      .map(([field, file]) => `${field} (${file}) — in MODEL_FIELDS bzw. MODEL_LIST_FIELDS (scripts/ops/ai-model-endpoints.mjs) aufnehmen, samt Zeile in REQUIRED_ENDPOINT; oder mit Grund in NOT_A_MODEL_CHOICE`)
    expect(unknown).toEqual([])
  })

  it('keine tote Ausnahme, jede mit Grund, keine doppelt geführt', () => {
    for (const [field, reason] of Object.entries(NOT_A_MODEL_CHOICE)) {
      expect(found.has(field), `NOT_A_MODEL_CHOICE.${field}: das Feld gibt es in keiner app.config.ts (mehr)`).toBe(true)
      expect(known.has(field), `NOT_A_MODEL_CHOICE.${field} steht auch in der Feldliste`).toBe(false)
      expect(reason.length, `NOT_A_MODEL_CHOICE.${field}: Grund fehlt`).toBeGreaterThan(30)
    }
  })

  it('GEGENPROBE (BE-004): ein Feld, das der Wächter nicht kennt, fiele auf', () => {
    const fields = modelFieldNames(`brand: { ai: { imageModel: 'x/y', audioModel: 'z/w' } }`)
    expect(fields.filter(field => !known.has(field) && !(field in NOT_A_MODEL_CHOICE))).toEqual(['audioModel'])
  })
})
