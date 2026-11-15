import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MESSAGE_PREVIEW_LENGTH } from '../shared/types/message'

/**
 * Das Aufräum-Skript für den Altbestand (`scripts/ops/erasure-backfill.mjs`)
 * rechnet die Vorschau einer Unterhaltung nach — als schlichtes Skript ohne
 * Import aus dem Layer. Weicht seine Länge von der Konstante hier ab, meldet
 * es jede lange Vorschau als „veraltet" (beim ersten Lauf lokal genau so
 * geschehen: 4 Scheintreffer von 20). Dieser Test hält die Zahl fest.
 */
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts', 'ops', 'erasure-backfill.mjs')

describe('erasure-backfill: Vorschau-Länge', () => {
  it('nutzt dieselbe Länge wie messagePreview', () => {
    const match = /const PREVIEW = (\d+)/.exec(readFileSync(SCRIPT, 'utf8'))
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBe(MESSAGE_PREVIEW_LENGTH)
  })
})
