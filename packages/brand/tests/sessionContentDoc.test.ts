import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BRAND_SLOTS } from '../shared/slotRegistry'
import { SESSION_CONTENT_DOC, renderSessionContentMarkdown } from '../scripts/print-session-content.mts'

/**
 * DIE LESE-FASSUNG IST ERZEUGT, ALSO MUSS SIE AKTUELL SEIN.
 *
 * Muster `check:themes` (themes-Layer, CI-Gate): eine committete Datei, die aus
 * Code entsteht, ist genau so lange wahr, wie jemand sie nach jeder Änderung
 * neu erzeugt. Ein Test ist der billigste Termin dafür — und der einzige, der
 * nicht vergessen wird.
 *
 * ── WARUM DER TEST DIE FUNKTION IMPORTIERT UND NICHT DAS SKRIPT AUSFÜHRT ──
 * Ein Kindprozess kostet Sekunden und verlangt eine installierte
 * jiti-Auflösung; die Funktion ist pur. Das Skript SCHREIBT deshalb nur, wenn
 * es als Programm läuft (Klammer `runAsProgram`) — ohne sie schriebe dieser
 * Testlauf die Doku neu und wäre danach immer grün.
 */
describe('BRAND-WIZARD-SESSION-INHALTE.md', () => {
  const generated = renderSessionContentMarkdown()

  it('steht so im Baum, wie die Registry sie erzeugt', () => {
    const committed = readFileSync(SESSION_CONTENT_DOC, 'utf8')
    // Kein `toBe` auf 3.000 Zeilen: die Fehlermeldung wäre unlesbar. Die erste
    // abweichende Zeile sagt, WO es auseinanderläuft.
    const a = committed.split('\n')
    const b = generated.split('\n')
    const firstDiff = a.findIndex((line, index) => line !== b[index])
    expect(
      firstDiff === -1 && a.length === b.length,
      firstDiff === -1
        ? `Zeilenzahl weicht ab: ${a.length} im Baum, ${b.length} erzeugt`
        : `Zeile ${firstDiff + 1}:\n  im Baum:  ${a[firstDiff]}\n  erzeugt:  ${b[firstDiff]}`,
    ).toBe(true)
  })

  it('zeigt JEDE Session mit ihrem Ziel und ihren Anti-Mustern', () => {
    for (const session of BRAND_SLOTS) {
      expect(generated, session.id).toContain(`### \`${session.id}\``)
      expect(generated, session.id).toContain(session.goal)
      expect(generated, session.id).toContain(session.antiPatterns[0]!)
    }
  })

  it('zeigt die Beispiele in BEIDEN Sprachen', () => {
    const purpose = BRAND_SLOTS.find(session => session.id === 'b.purpose')!
    expect(generated).toContain(purpose.examples.new.de[0]!)
    expect(generated).toContain(purpose.examples.new.en[0]!)
    expect(generated).toContain(purpose.examples.relaunch.de[0]!)
  })

  it('GEGENPROBE: eine geänderte Registry ergäbe eine andere Datei', () => {
    // Ohne diese Zeile prüfte der Vergleich oben nur, dass zwei Zeichenketten
    // gleich sind — auch wenn beide leer wären.
    expect(generated).not.toBe('')
    expect(generated).not.toContain('### `z.erfunden`')
  })
})
