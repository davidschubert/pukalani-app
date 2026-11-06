import { describe, expect, it } from 'vitest'
import {
  type BrandDnaPromptInput,
  type BrandDnaPromptReading,
  BRAND_DNA_SYSTEM_PROMPT,
  brandDnaPrompt,
} from '../server/utils/dnaPrompt'
import {
  BRAND_DNA_INSPIRATION_REASON_MAX,
  BRAND_DNA_REASON_MAX,
} from '../shared/brandDesignDna'
import { BRAND_DNA_DIMENSIONS } from '../shared/brandDesignVocab'

/**
 * DER AUFTRAG DES DNA-VORSCHLAGS, OHNE ANBIETER (Brand Design D2c, §2.2
 * Schritt 4).
 *
 * Er ist pur, also ist er prüfbar — und genau deshalb steht er in einer
 * eigenen Datei: an diesen Sätzen hängt, ob aus der Foundation eine
 * ABLEITUNG wird oder eine Geschmacksliste.
 *
 * JEDE PRÜFUNG HAT EINE GEGENPROBE oder prüft eine ABWESENHEIT: eine Prüfung,
 * die nur die richtige Eingabe kennt, ist immer grün.
 */

const reading: BrandDnaPromptReading = {
  number: 3,
  area: 'color (Farbwelt)',
  verdict: 'fits (Trägt schon)',
  anchor: 'Wert „Sorgfalt"',
  reason: 'Die gedeckten Töne tragen die Sorgfalt, ohne laut zu werden.',
  suggestion: 'Den Kontrast der Typografie nicht mitnehmen.',
  observed: [{ dimension: 'color', value: 'earthy' }, { dimension: 'composition', value: 'calm' }],
}

function input(overrides: Partial<BrandDnaPromptInput> = {}): BrandDnaPromptInput {
  return {
    contentLocale: 'de',
    foundation: [
      { label: 'Werte', value: '- Sorgfalt\n- Nähe' },
      { label: 'Archetyp', value: 'Der Fürsorgliche' },
    ],
    readings: [],
    ...overrides,
  }
}

describe('Der System-Prompt', () => {
  it('leitet ab, statt zu gefallen — und antwortet nur mit JSON', () => {
    expect(BRAND_DNA_SYSTEM_PROMPT).toMatch(/derive/i)
    expect(BRAND_DNA_SYSTEM_PROMPT).toMatch(/foundation/i)
    expect(BRAND_DNA_SYSTEM_PROMPT).toMatch(/JSON only/i)
    expect(BRAND_DNA_SYSTEM_PROMPT).toMatch(/no markdown fences/i)
  })
})

describe('Das Vokabular', () => {
  it('nennt alle zehn Dimensionen und JEDEN ihrer fünf Werte', () => {
    const prompt = brandDnaPrompt(input())
    expect(BRAND_DNA_DIMENSIONS).toHaveLength(10)
    for (const dimension of BRAND_DNA_DIMENSIONS) {
      expect(prompt).toContain(`${dimension.id} (${dimension.de})`)
      for (const value of dimension.values) {
        expect(prompt).toContain(`${value.id} (${value.de})`)
      }
    }
  })

  it('verlangt GENAU zehn Zeilen in der Reihenfolge des Katalogs', () => {
    const prompt = brandDnaPrompt(input())
    expect(prompt).toMatch(/exactly ten entries, one per dimension/i)
    expect(prompt).toContain(BRAND_DNA_DIMENSIONS.map(d => d.id).join(', '))
  })
})

describe('Die Foundation ist der Massstab', () => {
  it('steht VOR den Lesungen und wird als Massstab benannt', () => {
    const prompt = brandDnaPrompt(input({ readings: [reading] }))
    expect(prompt).toMatch(/the foundation is the yardstick — the readings are evidence, not a target/i)
    expect(prompt.indexOf('BRAND FOUNDATION')).toBeLessThan(prompt.indexOf('REFERENCE READINGS'))
  })

  it('trägt die Foundation-Blöcke wörtlich — GEGENPROBE: ein anderer Wert steht auch anders drin', () => {
    const prompt = brandDnaPrompt(input())
    expect(prompt).toContain('### Archetyp\nDer Fürsorgliche')

    const mutated = brandDnaPrompt(input({
      foundation: [{ label: 'Archetyp', value: 'Der Entdecker' }],
    }))
    expect(mutated).toContain('### Archetyp\nDer Entdecker')
    expect(mutated).not.toContain('Der Fürsorgliche')
    expect(mutated).not.toBe(prompt)
  })

  it('macht die Begründung zur Pflicht und verbietet das Wiederholen des Wertes', () => {
    const prompt = brandDnaPrompt(input())
    expect(prompt).toMatch(/reason: MANDATORY/)
    expect(prompt).toMatch(/archetype, one of the values, a tone word, the positioning/i)
    expect(prompt).toMatch(/only restates the value in other words is not a reason/i)
    expect(prompt).toMatch(/without a reason is discarded/i)
    expect(prompt).toContain(`max ${BRAND_DNA_REASON_MAX} characters`)
  })

  it('sagt ausdrücklich, dass erfundene Ids verworfen werden', () => {
    expect(brandDnaPrompt(input())).toMatch(/invented ids are discarded/i)
  })
})

describe('Mit Vorbildern', () => {
  const prompt = brandDnaPrompt(input({ readings: [reading] }))

  it('zitiert die Lesung mit ihrer NUMMER, ihrem Urteil und ihrer Belegung', () => {
    expect(prompt).toContain('- reference 3 · area: color (Farbwelt) · verdict: fits (Trägt schon)')
    expect(prompt).toContain('measured against: Wert „Sorgfalt"')
    expect(prompt).toContain('observed: color=earthy, composition=calm')
    expect(prompt).toContain('suggestion: Den Kontrast der Typografie nicht mitnehmen.')
  })

  it('erlaubt „both" NUR mit einem Satz, der die Vorbild-Nummer nennt', () => {
    expect(prompt).toMatch(/inspirationReason: ONLY with origin "both"/)
    expect(prompt).toMatch(/names the reference NUMBER/)
    // Der Kunde kennt sein Bild als „Vorbild 3": der deutsche Satz darf nicht „reference" sagen.
    expect(prompt).toContain('call a reference „Vorbild N"')
    expect(prompt).toContain(`max ${BRAND_DNA_INSPIRATION_REASON_MAX} characters`)
    expect(prompt).toMatch(/"both" without it is downgraded to "foundation"/)
  })

  it('schliesst „inspiration" als Herkunft AUS — die Foundation ist immer die Grundlage', () => {
    expect(prompt).toMatch(/"inspiration" is NOT allowed/)
    expect(prompt).toMatch(/the foundation is always the basis/i)
  })

  it('verbietet das Nachbauen fremder Marken, Schriften und Farbwerte', () => {
    expect(prompt).toMatch(/do not name brands, fonts, colour values or products/i)
    expect(prompt).toMatch(/do not reproduce a design you recognise/i)
  })
})

describe('Ohne Vorbilder', () => {
  const prompt = brandDnaPrompt(input())

  it('lässt den Beleg-Abschnitt WEG und sagt ausdrücklich, dass es keine gibt', () => {
    expect(prompt).toContain('There are none.')
    expect(prompt).not.toContain('- reference ')
    // Der Auftrags-Satz nennt den Massstab immer; der BELEG-Abschnitt fehlt.
    expect(prompt).not.toMatch(/Use them as corroboration or as a corrective/)
  })

  it('verlangt überall `origin: "foundation"` und schliesst beide anderen aus', () => {
    expect(prompt).toMatch(/origin: always "foundation"/)
    expect(prompt).toMatch(/"both" and "inspiration" are not allowed here/)
    expect(prompt).toMatch(/Do not invent references/i)
    expect(prompt).toMatch(/inspirationReason: leave it out entirely/)
  })

  it('nennt die „both"-Regel GAR NICHT — sie wäre eine Einladung', () => {
    expect(prompt).not.toMatch(/ONLY with origin "both"/)
    expect(prompt).not.toMatch(/names the reference NUMBER/)
  })

  it('GEGENPROBE: dieselbe Eingabe MIT einer Lesung ergibt einen anderen Prompt', () => {
    const withReading = brandDnaPrompt(input({ readings: [reading] }))
    expect(withReading).not.toBe(prompt)
    expect(withReading).toContain('- reference 3')
    expect(withReading).not.toContain('There are none.')
  })
})

describe('Die Sprache', () => {
  it('bestellt die Antwort-Texte in der INHALTSSPRACHE — GEGENPROBE: en sagt English', () => {
    expect(brandDnaPrompt(input())).toContain('write reason and inspirationReason in German')
    const english = brandDnaPrompt(input({ contentLocale: 'en' }))
    expect(english).toContain('write reason and inspirationReason in English')
    expect(english).not.toContain('in German')
    // Das Vokabular folgt mit: die Etiketten stehen dann englisch daneben.
    expect(english).toContain('minimal (Minimal)')
    expect(english).toContain('era (Aesthetic era)')
  })
})

describe('Das Antwortformat', () => {
  it('nennt das JSON-Schema in einer Zeile und nur die zwei erlaubten Herkünfte', () => {
    const prompt = brandDnaPrompt(input({ readings: [reading] }))
    expect(prompt).toContain('{"dna":[{"dimension":"<dimension id>","value":"<value id>",')
    expect(prompt).toContain('"origin":"foundation|both"')
    expect(prompt).not.toContain('"origin":"foundation|inspiration|both"')
  })
})
