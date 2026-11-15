import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { COMMENT_TOMBSTONE_DATA } from '../server/utils/commentTombstone'

/**
 * Das Aufräum-Skript für den Altbestand (`scripts/ops/erasure-backfill.mjs`)
 * schreibt für alte gelöschte Kommentare denselben Platzhalter wie der Code —
 * als schlichtes Skript ohne Import aus dem Layer. Kommt hier ein Feld dazu
 * (so wie `translations` nach dem Übersetzungs-Cache), muss das Skript es
 * auch leeren; dieser Test wird sonst rot.
 */
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts', 'ops', 'erasure-backfill.mjs')

describe('erasure-backfill: Platzhalter eines gelöschten Kommentars', () => {
  it('leert jedes Feld, das der Code leert', () => {
    const source = readFileSync(SCRIPT, 'utf8')
    const patch = /patchRow\('comments', row\.\$id,\s*\{([^}]*)\}/.exec(source)
    expect(patch).not.toBeNull()
    for (const [key, value] of Object.entries(COMMENT_TOMBSTONE_DATA)) {
      if (key === 'status') continue // die Regel findet nur Zeilen, die schon „deleted" sind
      expect(patch![1]).toContain(`${key}: ${value === null ? 'null' : `'${value}'`}`)
    }
  })
})
