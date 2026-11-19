import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { brandDnaMixSlotValue, parseBrandDnaMixSlotValue } from '../shared/brandDesignDna'
// @ts-expect-error — eine `.mjs`-Hilfe der Beweis-Skripte, bewusst ohne Typen.
import { PROBE_DNA_MIX, PROBE_DNA_MIX_ENTRIES } from '../scripts/lib/designProbe.mjs'

/**
 * DIE DESIGN-VORLAGE DER BEWEIS-SKRIPTE GEGEN DEN WORTSCHATZ DER APP.
 *
 * Drei Skripte (`verify-brand-kit`, `-design`, `-sessions`) schreiben einen
 * fertigen DNA-Mix direkt in die Ablage. Liest die App ihn nicht, entsteht
 * kein fertiges Design, und die Skripte werden rot, ohne dass am Produkt
 * etwas falsch ist — so geschehen, als ein Etikett der Herkunft umformuliert
 * wurde. Dieser Test meldet das beim nächsten `pnpm test`, nicht erst nachts.
 *
 * Die Erwartung (zehn Entscheidungen als Ids) steht ausgeschrieben in der
 * Hilfe und wird NICHT aus dem geprüften Text abgeleitet (Beweis-Regel 1).
 */
describe('Design-Vorlage der Beweis-Skripte (scripts/lib/designProbe.mjs)', () => {
  it('die App liest die Vorlage — alle zehn Zeilen, mit genau den gemeinten Ids', () => {
    expect(parseBrandDnaMixSlotValue(PROBE_DNA_MIX)).toEqual(PROBE_DNA_MIX_ENTRIES)
  })

  it('die App schreibt aus denselben Ids Zeichen für Zeichen diese Vorlage', () => {
    expect(brandDnaMixSlotValue(PROBE_DNA_MIX_ENTRIES, 'de')).toBe(PROBE_DNA_MIX)
  })

  it('Gegenprobe: ein Etikett von gestern liest die App nicht', () => {
    const stale = PROBE_DNA_MIX.replaceAll('Aus der Foundation', 'Aus eurer Foundation')
    expect(stale).not.toBe(PROBE_DNA_MIX)
    expect(parseBrandDnaMixSlotValue(stale)).toBeNull()
  })

  it('kein Beweis-Skript trägt wieder eine eigene Kopie des Mixes', () => {
    const dir = fileURLToPath(new URL('../scripts/', import.meta.url))
    const offenders = readdirSync(dir)
      .filter(name => name.endsWith('.mjs'))
      .filter(name => readFileSync(`${dir}${name}`, 'utf8').includes('## Visueller Stil\\n'))
    expect(offenders).toEqual([])
  })
})
