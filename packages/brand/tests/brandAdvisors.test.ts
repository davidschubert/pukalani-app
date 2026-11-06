import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BRAND_ADVISORS,
  BRAND_ADVISOR_KEYS,
  BRAND_DESIGN_VOICE,
  BRAND_VOICE,
  type BrandAdvisor,
  advisorByKey,
  advisorIsVoice,
  advisorOpenersFor,
  colleagueForStep,
  techniqueForStep,
  validateBrandAdvisors,
} from '../shared/brandAdvisors'
import {
  BRAND_DESIGN_STEP_KEYS,
  BRAND_FOUNDATION_STEP_KEYS,
  BRAND_STEP_KEYS,
} from '../shared/slotRegistry'

/**
 * DAS BERATERTEAM — was ohne diesen Beweis stillschweigend kaputtgehen kann.
 *
 *  1. Ein Baustein OHNE Technik fällt auf Georges eigene zurück — das ist die
 *     richtige Sicherung, aber es ist auch der perfekte Ort für ein Versehen:
 *     ein neuer Baustein sähe aus, als hätte ihn jemand zugeordnet. Hier wird
 *     deshalb geprüft, dass jeder der neun Bausteine WIRKLICH zugeordnet ist.
 *  2. Ein Baustein mit ZWEI Technik-Gebern hätte eine Facette, die von der
 *     Reihenfolge der Registry abhängt.
 *  3. Die Rollen-Titel, Schwerpunkte und Intro-Zeilen liegen in den
 *     Locale-Dateien; fehlt einer, rendert vue-i18n den SCHLÜSSEL (der
 *     `legal.imprint`-Fuss). Ein Berater ohne Text stünde also wörtlich als
 *     `brand.advisors.otto.role` im Steckbrief.
 *  4. EINE STIMME (Davids Entscheidung 2026-09-02): `BRAND_VOICE` ist George,
 *     und `techniqueForStep` darf nie wieder als Sprecher gelesen werden. Der
 *     Wächter dafür ist `colleagueForStep`, das in Georges eigenen Bausteinen
 *     ausdrücklich `null` sagt — „hier ist niemand zu erwähnen".
 */

const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'i18n', 'locales')
const LOCALES = ['de', 'en'] as const

interface AdvisorCopy {
  role?: string
  focus?: string
  /**
   * Seit der Solo-Weiche (BW1-Inhaltsrunde 2026-09-09) darf das Intro ein Paar
   * `{solo, team}` sein — es ist ein GESPROCHENER Satz und folgt der Anrede der
   * Marke (`shared/brandTeamText.ts`). Die Wächter unten prüfen deshalb JEDE
   * Fassung: eine Weiche darf keine Gelegenheit sein, in einem der beiden Zweige
   * den Namen der Kollegin oder das Übergabe-Verbot zu vergessen.
   */
  intro?: string | { solo?: string, team?: string }
}
type Catalog = { brand: { advisors?: Record<string, AdvisorCopy> } }

/** Alle Fassungen eines Intros — eine ohne Weiche, zwei mit. */
function introVariants(entry: AdvisorCopy | undefined): string[] {
  const intro = entry?.intro
  if (typeof intro === 'string') return [intro]
  if (!intro) return []
  // Ein halbes Paar ist ein Loch und kein Sonderfall: der Rückfall in
  // `teamTextKeyFor` griffe zwar, aber der Basis-Schlüssel steht dann nicht
  // mehr da — die Anrede fiele auf den rohen Schlüssel zurück.
  return typeof intro.solo === 'string' && typeof intro.team === 'string' ? [intro.solo, intro.team] : []
}

const catalogs = Object.fromEntries(LOCALES.map(locale => [
  locale,
  JSON.parse(readFileSync(join(localesDir, `${locale}.json`), 'utf8')) as Catalog,
])) as Record<(typeof LOCALES)[number], Catalog>

describe('Berater-Registry', () => {
  it('kennt die fünf aus Davids Entscheidung plus Frida für Schicht 2', () => {
    expect(BRAND_ADVISORS.map(advisor => advisor.key)).toEqual([...BRAND_ADVISOR_KEYS])
    expect(BRAND_ADVISORS.map(advisor => advisor.name))
      .toEqual(['George', 'Vera', 'Milo', 'Nika', 'Otto', 'Frida'])
  })

  it('ist in sich schlüssig — jeder Baustein genau einmal, kein leeres Feld', () => {
    expect(validateBrandAdvisors(BRAND_ADVISORS, BRAND_STEP_KEYS)).toEqual([])
  })

  it('GEGENPROBE: ein fehlender und ein doppelter Baustein fallen durch', () => {
    const [george, vera, ...rest] = BRAND_ADVISORS as readonly BrandAdvisor[]
    // Vera abgehängt ⇒ pvm und architecture stehen ohne Berater da.
    expect(validateBrandAdvisors([george!, ...rest], BRAND_STEP_KEYS))
      .toEqual(expect.arrayContaining([expect.stringContaining('"pvm" hat keinen Berater')]))
    // Und George greift nach Veras Baustein ⇒ zwei Besitzer.
    const greedy: BrandAdvisor = { ...george!, steps: [...george!.steps, 'pvm'] }
    expect(validateBrandAdvisors([greedy, vera!, ...rest], BRAND_STEP_KEYS))
      .toEqual(expect.arrayContaining([expect.stringContaining('"pvm" hat zwei Berater')]))
  })

  it('ORDNET DIE NEUN BAUSTEINE WÖRTLICH SO ZU, wie David sie geschnitten hat', () => {
    expect(techniqueForStep('context').key).toBe('george')
    expect(techniqueForStep('result').key).toBe('george')
    expect(techniqueForStep('pvm').key).toBe('vera')
    expect(techniqueForStep('architecture').key).toBe('vera')
    expect(techniqueForStep('values').key).toBe('milo')
    expect(techniqueForStep('archetype').key).toBe('milo')
    expect(techniqueForStep('manifesto').key).toBe('nika')
    expect(techniqueForStep('verbal').key).toBe('nika')
    expect(techniqueForStep('naming').key).toBe('otto')
  })

  it('GIBT DIE SECHS DESIGN-KAPITEL FRIDA — und nur sie', () => {
    // Konzept §2.1: Schicht 2 gehört ihr, die Foundation bleibt unberührt.
    for (const stepKey of BRAND_DESIGN_STEP_KEYS) {
      expect(techniqueForStep(stepKey).key, stepKey).toBe('frida')
      expect(colleagueForStep(stepKey)?.key, stepKey).toBe('frida')
    }
    for (const stepKey of BRAND_FOUNDATION_STEP_KEYS) {
      expect(techniqueForStep(stepKey).key, stepKey).not.toBe('frida')
    }
  })

  it('FRIDA IST DIE ZWEITE STIMME — George bleibt die erste', () => {
    // `advisorIsVoice` ist die eine Stelle, die „spricht selbst" beantwortet:
    // die zwei Listen „das Team hinter der Stimme" (Werkstatt-Steckbrief,
    // Crew-Abschnitt auf /team) lesen sie, und ein `key !== 'george'` wäre
    // dort seit D0 still falsch.
    expect(BRAND_DESIGN_VOICE.key).toBe('frida')
    expect(BRAND_DESIGN_VOICE.fullName).toBe('Frida Martens')
    expect(advisorIsVoice('george')).toBe(true)
    expect(advisorIsVoice('frida')).toBe(true)
    for (const key of ['vera', 'milo', 'nika', 'otto'] as const) {
      expect(advisorIsVoice(key), key).toBe(false)
    }
  })

  it('DIE STIMME IST GEORGE — in jedem einzelnen Baustein', () => {
    // Davids Entscheidung 2026-09-02: `techniqueForStep` sagt, WIE gefragt
    // wird, nie WER spricht. Der Sprecher hängt an gar keinem Baustein.
    expect(BRAND_VOICE.key).toBe('george')
    expect(BRAND_VOICE.fullName).toBe('George Winter')
  })

  it('NENNT DIE KOLLEGIN NUR, WO ES EINE GIBT — sonst ausdrücklich niemanden', () => {
    // In Georges eigenen Bausteinen wäre „ich habe das mit George durchgesehen"
    // eine Selbst-Erwähnung; `null` ist deshalb ein Ergebnis, kein Loch.
    expect(colleagueForStep('context')).toBeNull()
    expect(colleagueForStep('result')).toBeNull()
    expect(colleagueForStep('pvm')?.key).toBe('vera')
    expect(colleagueForStep('values')?.key).toBe('milo')
    expect(colleagueForStep('verbal')?.key).toBe('nika')
    expect(colleagueForStep('naming')?.key).toBe('otto')
  })

  it('fällt auf Georges eigene Technik zurück — aber nur für Unbekanntes', () => {
    expect(techniqueForStep('gibt-es-nicht' as never).key).toBe('george')
    expect(colleagueForStep('gibt-es-nicht' as never)).toBeNull()
    expect(advisorByKey('vera')?.fullName).toBe('Vera Stein')
    expect(advisorByKey('gibt-es-nicht')).toBeUndefined()
  })

  it('trägt die About-Ebene mit — volle Namen und eine PROFESSIONELLE Zeile', () => {
    expect(BRAND_ADVISORS.map(advisor => advisor.fullName)).toEqual([
      'George Winter',
      'Vera Stein',
      'Milo Berger',
      'Nika Sommer',
      'Otto Kessler',
      'Frida Martens',
    ])
    for (const advisor of BRAND_ADVISORS) {
      // Davids Entscheidung 2026-09-02 (DECISION-LOG): die About-Zeile sagt,
      // WIE jemand arbeitet — kein „Rasse · Ort · zwei Marotten" mehr. Das
      // Trennzeichen der alten Steckbrief-Form ist deshalb der Wächter: käme
      // sie zurück, käme sie mit ihm zurück.
      expect(advisor.personal, advisor.key).not.toContain('·')
      expect(advisor.personal.length, advisor.key).toBeGreaterThan(40)
    }
  })

  it('WEDER DIE ANZEIGE NOCH DIE PROMPT-FELDER KENNEN DIE HUNDE-WELT', () => {
    // Sie ist am 2026-09-02 komplett verworfen — im Wizard UND auf der
    // About-Seite. Der Wächter deckt deshalb auch fullName und personal ab.
    const forbidden = /\b(dog|puppy|paw|bark|wuff|woof|breed|Hunde?|Rasse|Pfote|Wuffwuff|Witterung|Treuherz|Bellkant|Testbiss)\b/i
    for (const advisor of BRAND_ADVISORS) {
      const everything = [
        advisor.fullName,
        advisor.personal,
        advisor.strengths,
        advisor.interviewTechnique,
        ...advisor.toneTraits,
        ...advisor.neverDo,
        ...advisor.openers.de,
        ...advisor.openers.en,
      ].join(' ')
      expect(everything, advisor.key).not.toMatch(forbidden)
    }
  })

  it('wählt die Satzanfänge nach der Oberflächen-Sprache', () => {
    const vera = advisorByKey('vera')!
    expect(advisorOpenersFor(vera, 'de')).toBe(vera.openers.de)
    expect(advisorOpenersFor(vera, 'de-AT')).toBe(vera.openers.de)
    expect(advisorOpenersFor(vera, 'en')).toBe(vera.openers.en)
    // Alles Unbekannte bekommt Englisch — die Default-Locale der App.
    expect(advisorOpenersFor(vera, 'fr')).toBe(vera.openers.en)
  })
})

describe('Berater im i18n-Katalog', () => {
  it('hat Rollen-Titel, Schwerpunkt und Intro-Zeile in BEIDEN Sprachen', () => {
    const gaps: string[] = []
    for (const advisor of BRAND_ADVISORS) {
      for (const locale of LOCALES) {
        const entry = catalogs[locale].brand.advisors?.[advisor.key]
        if (!entry?.role?.trim()) gaps.push(`${advisor.key}.role fehlt in ${locale}`)
        if (!entry?.focus?.trim()) gaps.push(`${advisor.key}.focus fehlt in ${locale}`)
        const intros = introVariants(entry)
        if (!intros.length || intros.some(intro => !intro.trim())) gaps.push(`${advisor.key}.intro fehlt in ${locale}`)
      }
    }
    expect(gaps).toEqual([])
  })

  it('das Phasen-Intro nennt die Kollegin beim Namen', () => {
    for (const advisor of BRAND_ADVISORS) {
      for (const locale of LOCALES) {
        for (const intro of introVariants(catalogs[locale].brand.advisors?.[advisor.key])) {
          expect(intro, `${advisor.key}/${locale}`).toContain(advisor.name)
        }
      }
    }
  })

  it('KEIN INTRO KÜNDIGT EINE ÜBERGABE AN — George gibt nichts ab', () => {
    // Der eigentliche Wächter der Eine-Stimme-Entscheidung auf der Textseite:
    // „Ab hier übernimmt Vera" war bis zum 2026-09-02 der Wortlaut, und genau
    // er macht aus einer Erwähnung wieder einen Sprecherwechsel.
    const handoverWording = /übernimmt|takes over|führt ab hier|leads from here/i
    for (const advisor of BRAND_ADVISORS) {
      for (const locale of LOCALES) {
        for (const intro of introVariants(catalogs[locale].brand.advisors?.[advisor.key])) {
          expect(intro, `${advisor.key}/${locale}`).not.toMatch(handoverWording)
        }
      }
    }
  })

  it('der Rollen-Titel der Registry und der des Katalogs sagen dasselbe', () => {
    // Zwei Quellen für denselben Titel sind ein Risiko: der PROMPT liest die
    // Registry (englisch), der KOPF den Katalog. Laufen sie auseinander, stellt
    // sich Vera dem Modell anders vor als dem Menschen.
    for (const advisor of BRAND_ADVISORS) {
      expect(catalogs.en.brand.advisors![advisor.key]!.role).toBe(advisor.role.en)
      expect(catalogs.de.brand.advisors![advisor.key]!.role).toBe(advisor.role.de)
    }
  })
})
