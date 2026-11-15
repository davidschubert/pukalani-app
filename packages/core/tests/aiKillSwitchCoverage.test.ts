import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  TRANSPORT_FILES,
  checkDirectEndpoint,
  readSources,
  stripComments,
} from '../../../scripts/check-ai-routing.mjs'

/**
 * DER RIEGEL DECKT JEDEN BEZAHLTEN KI-WEG (P17, BE-006) — am Quelltext gehalten.
 *
 * Jeder bezahlte Modell-Aufruf führt durch einen der fünf Core-Transporte,
 * denn `chat/completions` darf ausserhalb von ihnen niemand rufen (Regel 3 von
 * `check:ai-routing`, hier noch einmal gegen den echten Baum). Ruft also jeder
 * Transport `assertAiSwitchedOn` vor seinem `fetch`, erreicht ein angemeldeter
 * Abschalter jede Route mit bezahltem KI-Aufruf — auch eine, die es heute
 * noch nicht gibt.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

describe('die fünf Transporte', () => {
  it('es sind genau fünf', () => {
    expect(TRANSPORT_FILES).toHaveLength(5)
  })

  for (const path of TRANSPORT_FILES) {
    it(`${path.split('/').at(-1)} importiert den Riegel relativ und fragt ihn VOR dem fetch`, () => {
      const code = stripComments(readFileSync(join(repoRoot, path), 'utf8'))
      expect(code).toMatch(/import \{[^}]*\bassertAiSwitchedOn\b[^}]*\} from '\.\/aiKillSwitch'/)
      const guard = code.indexOf('await assertAiSwitchedOn(')
      const send = code.indexOf('fetch(')
      expect(guard, 'assertAiSwitchedOn fehlt').toBeGreaterThan(0)
      expect(send, 'fetch fehlt').toBeGreaterThan(0)
      expect(guard).toBeLessThan(send)
    })
  }
})

describe('niemand ruft den Vermittler am Transport vorbei', () => {
  it('kein `chat/completions` ausserhalb der Transporte (ausser eingetragenen Prüfskripten)', () => {
    expect(checkDirectEndpoint(readSources(repoRoot).all)).toEqual([])
  })
})
