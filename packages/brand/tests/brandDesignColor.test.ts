import { describe, expect, it } from 'vitest'
import {
  BRAND_CONTRAST_PAIR_SPECS,
  brandAccentInk,
  brandColorContrastPairs,
  brandContrast,
  brandNeutralRamp,
  brandRampDark,
  brandRampLight,
  buildBrandDesign,
  isBrandHex,
} from '../shared/brandDesign'
import {
  BRAND_ACCENT_MIN_DISTANCE,
  BRAND_CONTRAST_REQUIRED_PAIRS,
  brandAccentCandidates,
  brandAccentTooClose,
  brandBaseCandidateBlocked,
  brandBaseCandidates,
  brandColorDefaults,
  brandColorDistance,
  brandColorPaper,
  brandColorRoleHex,
  brandColorRoles,
  brandColorRolesSlotValue,
  brandContrastReview,
  brandContrastSlotValue,
  brandRampSlotValue,
  brandRatioText,
  parseBrandColorRolesSlotValue,
  parseBrandContrastSlotValue,
  parseBrandRampSlotValue,
  validateBrandColorVocab,
} from '../shared/brandDesignColor'
import { BRAND_COLOR_ROLES } from '../shared/brandDesignVocab'
import { brandDirectionById } from '../shared/brandDirections'
import { BRAND_RAMP_SHADES, type BrandDesignValues } from '../shared/types/brand'

/**
 * DIE FARBWELT ALS PURE REGEL (Konzept §2.3, Paket D3).
 *
 * ── WAS HIER WIRKLICH GEPRÜFT WIRD ────────────────────────────────────────
 * Nicht die Ramp-Mathematik (die gehört der Themes-Engine und ist dort belegt)
 * und nicht das Preset (das prüft `brandDesign.test.ts`). Geprüft wird, was D3
 * dazwischen legt: dass die Kandidaten aus RICHTUNG und Farbwelt entstehen und
 * nicht aus dem Nichts, dass das AA-Gate wirklich sperrt, dass die Rollen je
 * eine eigene Quelle haben, dass die Matrix des Kapitels WÖRTLICH die des
 * Presets ist — und dass jeder der drei Slot-Werte den Rundlauf übersteht.
 *
 * Die Beispielwerte sind die abgenommenen von Kailua Coffee Co.: die Richtung
 * `warm-editorial` trägt genau den Dreiklang Milk · Crema · Roast des
 * Prototyps, „Crema als Basisfarbe" ist dort der sichtbare Durchfaller.
 */

const DIRECTION = 'warm-editorial'
const ROAST = '#4a3123'
const CREMA = '#b98a5e'
const MILK = '#e8d3b8'
const PALM = '#2f4a3a'
/**
 * EIN MITTELTON — er ist der Durchfaller der Kontrast-Matrix, seit die
 * Schriftfarbe auf dem Akzent gerechnet wird (D9): Papier darauf ist zu
 * schwach, die tiefste Marken-Stufe ebenso.
 */
const MIDTONE = '#408080'
/** Irgendeine stabile Profil-Id — die Kachel-Farbwelt hängt an ihr. */
const SEED = 'brand-design-d3-proof'

const KAILUA_DNA: Record<string, string> = {
  style: 'editorial',
  era: 'craft',
  form: 'soft',
  typography: 'bookish',
  color: 'earthy',
  imagery: 'craftClose',
  composition: 'calm',
  materiality: 'paper',
  motion: 'calmMotion',
  mood: 'honest',
}

describe('Das Farb-Vokabular (§2.3)', () => {
  it('ist gültig — fünf Rollen, je eigene Quelle, jedes Paar beschriftet', () => {
    expect(validateBrandColorVocab()).toEqual([])
    expect(BRAND_COLOR_ROLES).toHaveLength(5)
  })

  it('GEGENPROBE: zwei Rollen mit DERSELBEN Quelle fallen durch', () => {
    // Genau das Anti-Muster aus `sessionContent.ts` („two roles with the same
    // source and different names") — ohne diese Prüfung wäre es beim nächsten
    // Umbau wieder drin.
    const broken = BRAND_COLOR_ROLES.map((role, index) => (index === 2
      ? { ...role, source: BRAND_COLOR_ROLES[0]!.source }
      : role))
    expect(validateBrandColorVocab(broken).some(line => line.includes('trägt schon'))).toBe(true)
  })

  it('GEGENPROBE: ein Kontrast-Paar ohne Beschriftung fällt durch', () => {
    const broken = [...BRAND_CONTRAST_PAIR_SPECS, { id: 'erfunden-light' }]
    expect(validateBrandColorVocab(BRAND_COLOR_ROLES, broken)
      .some(line => line.includes('erfunden-light'))).toBe(true)
  })
})

describe('Die Kandidaten (`h.base`, `h.accent`)', () => {
  it('nehmen die Töne der GEWÄHLTEN Richtung — nicht irgendwelche', () => {
    const gradient = brandDirectionById(DIRECTION)!.gradient
    const candidates = brandBaseCandidates(DIRECTION, SEED)
    expect(candidates).toHaveLength(3)
    expect(candidates[0]!.hex).toBe(gradient[2])
    expect(candidates[2]!.hex).toBe(gradient[1])
    expect(candidates[0]!.hex).toBe(ROAST)
    expect(candidates[2]!.hex).toBe(CREMA)
  })

  it('sind deterministisch und tragen drei VERSCHIEDENE Farben', () => {
    const first = brandBaseCandidates(DIRECTION, SEED)
    expect(brandBaseCandidates(DIRECTION, SEED)).toEqual(first)
    expect(new Set(first.map(entry => entry.hex)).size).toBe(3)
    for (const entry of first) expect(isBrandHex(entry.hex), entry.id).toBe(true)
  })

  it('stehen auch ohne bestätigte Richtung — dann aus der Kachel-Farbwelt', () => {
    const fallback = brandBaseCandidates('gibt-es-nicht', SEED)
    expect(fallback).toHaveLength(3)
    expect(new Set(fallback.map(entry => entry.hex)).size).toBe(3)
  })

  it('DAS AA-GATE: Roast trägt Text, Crema nicht', () => {
    // Der Prototyp führt Crema ausdrücklich mit — eine Liste ohne den
    // Durchfaller versteckt ihn (§2.3).
    expect(brandBaseCandidateBlocked(ROAST, 'tinted')).toBe(false)
    expect(brandBaseCandidateBlocked(CREMA, 'tinted')).toBe(true)
    expect(brandBaseCandidateBlocked(MILK, 'tinted')).toBe(true)
    expect(brandBaseCandidateBlocked('nicht-hex', 'tinted')).toBe(true)
  })

  it('der Papierton ist der der KANDIDATEN-Welt, nicht ein fester', () => {
    expect(brandColorPaper(ROAST, 'tinted')).not.toBe(brandColorPaper(PALM, 'tinted'))
    expect(brandColorPaper(ROAST, 'warm')).not.toBe(brandColorPaper(ROAST, 'cool'))
    expect(brandColorPaper('nicht-hex')).toBeNull()
  })

  it('DIE ABSTANDS-REGEL: derselbe Ton ist kein Signal', () => {
    expect(brandAccentTooClose(ROAST, ROAST)).toBe(true)
    expect(brandAccentTooClose(MILK, ROAST)).toBe(false)
    // Die Regel misst wirklich den Abstand und nicht „ist es dieselbe
    // Zeichenkette": eine zweite Stufe desselben Braun fällt durch.
    expect(brandColorDistance('#4c3325', ROAST)!).toBeLessThan(BRAND_ACCENT_MIN_DISTANCE)
    expect(brandAccentTooClose('#4c3325', ROAST)).toBe(true)
    expect(brandColorDistance('roast', ROAST)).toBeNull()
  })

  it('SIE MISST NICHT DEN KONTRAST — sonst fiele jeder tiefe Signal-Ton durch', () => {
    // Der Befund aus dem Bau von D3: ein Schiefer-Ton hat zu einem tiefen
    // Braun fast keinen KONTRAST (Helligkeit), ist aber klar ein anderer Ton.
    const slate = '#2a2d33'
    expect(brandContrast(slate, ROAST)!.ratio).toBeLessThan(2)
    expect(brandAccentTooClose(slate, ROAST)).toBe(false)
  })

  it('die Akzent-Kandidaten sagen JE Kandidat, ob die Regel greift', () => {
    const candidates = brandAccentCandidates(DIRECTION, SEED, CREMA)
    // Basis = Crema, und der erste Kandidat IST Crema — er fällt durch.
    expect(candidates[0]!.hex).toBe(CREMA)
    expect(candidates[0]!.tooClose).toBe(true)
    expect(candidates.some(entry => !entry.tooClose)).toBe(true)
  })

  it('… und sie bieten TIEFE Signal-Töne an, die hellen Knopf-Text tragen', () => {
    const candidates = brandAccentCandidates(DIRECTION, SEED, ROAST)
    expect(candidates).toHaveLength(3)
    expect(candidates[0]!.hex).toBe(CREMA)
    expect(new Set(candidates.map(entry => entry.hex)).size).toBe(3)
    expect(candidates.slice(1).every(entry => !entry.tooClose)).toBe(true)
  })
})

describe('Die Vorbelegung (H5)', () => {
  const defaults = brandColorDefaults(KAILUA_DNA, DIRECTION, SEED)

  it('nimmt die erste Basisfarbe, die Text trägt', () => {
    expect(defaults.base).toBe(ROAST)
    expect(brandBaseCandidateBlocked(defaults.base, defaults.neutral)).toBe(false)
  })

  it('nimmt den Grundton aus der DNA (`color: earthy` ⇒ warm)', () => {
    expect(defaults.neutral).toBe('warm')
  })

  it('nimmt einen Akzent, mit dem die Kontrast-Prüfung DURCHGEHT', () => {
    // Das ist die ganze Zusage von H5: ein Durchgang, in dem man nur
    // widerspricht, wo man will — kein Kapitel, das von Anfang an rot ist.
    expect(brandAccentTooClose(defaults.accent, defaults.base)).toBe(false)
    const pairs = brandColorContrastPairs(defaults.base, defaults.accent, defaults.neutral)!
    expect(brandContrastReview(pairs).ok).toBe(true)
  })

  it('steht auch ohne DNA und ohne Richtung', () => {
    const bare = brandColorDefaults(undefined, '', SEED)
    expect(isBrandHex(bare.base)).toBe(true)
    expect(isBrandHex(bare.accent)).toBe(true)
    expect(bare.neutral).toBe('tinted')
  })
})

describe('Die Rollen (`h.roles`)', () => {
  const roles = brandColorRoles(ROAST, PALM, 'tinted')!

  it('sind fünf, jede mit aufgelöstem Hex', () => {
    expect(roles).toHaveLength(5)
    for (const role of roles) expect(isBrandHex(role.hex), role.id).toBe(true)
    expect(roles.map(role => role.id)).toEqual(BRAND_COLOR_ROLES.map(role => role.id))
  })

  it('holen ihre Farbe aus der QUELLE, die der Katalog nennt', () => {
    const rampLight = brandRampLight(ROAST)!
    const neutral = brandNeutralRamp(ROAST)!
    expect(roles.find(role => role.id === 'ground')!.hex).toBe(rampLight[900])
    expect(roles.find(role => role.id === 'surface')!.hex).toBe(rampLight[100])
    expect(roles.find(role => role.id === 'light')!.hex).toBe(neutral[100])
    expect(roles.find(role => role.id === 'accent')!.hex).toBe(PALM)
    expect(roles.find(role => role.id === 'paper')!.hex).toBe(neutral[50])
  })

  it('tragen fünf VERSCHIEDENE Farben — sonst wären es keine fünf Rollen', () => {
    expect(new Set(roles.map(role => role.hex)).size).toBe(5)
  })

  it('eine unbekannte Quelle ergibt `null`, keine erfundene Farbe', () => {
    const colors = { rampLight: brandRampLight(ROAST)!, neutral: brandNeutralRamp(ROAST)!, accent: PALM }
    expect(brandColorRoleHex('ramp.777', colors)).toBeNull()
    expect(brandColorRoleHex('mond.50', colors)).toBeNull()
    expect(brandColorRoleHex('accent', colors)).toBe(PALM)
  })

  it('ohne gültige Farbe gibt es keine Rollen', () => {
    expect(brandColorRoles('roast', PALM, 'tinted')).toBeNull()
    expect(brandColorRoles(ROAST, 'palm', 'tinted')).toBeNull()
  })
})

describe('Die Kontrast-Prüfung (`h.contrast`)', () => {
  it('ist WÖRTLICH die Matrix des Presets — eine Rechnung, zwei Leser', () => {
    const values: BrandDesignValues = {
      dna: KAILUA_DNA,
      base: ROAST,
      neutral: 'tinted',
      accent: PALM,
      roles: brandColorRoles(ROAST, PALM, 'tinted')!,
      pair: 'editorial',
      scale: 'calm',
      markKind: 'word',
      tempo: 'calm',
    }
    const preset = buildBrandDesign(values)!
    expect(preset.color.contrastPairs).toEqual(brandColorContrastPairs(ROAST, PALM, 'tinted'))
    expect(preset.color.base).toBe(ROAST)
    expect(preset.color.accent).toBe(PALM)
    expect(preset.color.roles).toHaveLength(5)
    expect(preset.color.roles.every(role => isBrandHex(role.hex))).toBe(true)
  })

  it('urteilt je Paar und deckt beide Welten ab', () => {
    const pairs = brandColorContrastPairs(ROAST, PALM, 'tinted')!
    expect(pairs).toHaveLength(BRAND_CONTRAST_PAIR_SPECS.length)
    expect(pairs.some(pair => pair.scheme === 'light')).toBe(true)
    expect(pairs.some(pair => pair.scheme === 'dark')).toBe(true)
    for (const pair of pairs) expect(pair.ratio).toBeGreaterThan(0)
  })

  /**
   * DIE SCHRIFTFARBE AUF DEM AKZENT WIRD GEMESSEN, NICHT GESETZT (D9).
   *
   * Bis D8 mass `button-light` fest Papier auf Akzent — ein HELLER Akzent fiel
   * damit immer durch, obwohl die Vorschau-Szene daneben längst dunklen Text
   * darauf setzte (`--ds-accent-ink`). Die Tabelle sagte „fällt durch", das
   * Produkt zeigte lesbaren Text: zwei Aussagen über dieselbe Fläche.
   *
   * Jetzt misst die Matrix, was die Szene setzt. Weich wird sie davon nicht —
   * die drei Fälle unten stehen genau dafür nebeneinander.
   */
  it('heller Akzent: die Matrix misst DUNKLE Schrift und besteht', () => {
    const pairs = brandColorContrastPairs(ROAST, MILK, 'tinted')!
    const button = pairs.find(pair => pair.id === 'button-light')!
    expect(button.foreground).toBe(brandRampLight(ROAST)![950])
    expect(brandContrastReview(pairs).ok).toBe(true)
  })

  it('tiefer Akzent: dieselbe Regel wählt PAPIER', () => {
    const pairs = brandColorContrastPairs(ROAST, PALM, 'tinted')!
    const button = pairs.find(pair => pair.id === 'button-light')!
    expect(button.foreground).toBe(brandNeutralRamp(ROAST)![50])
    expect(brandContrastReview(pairs).ok).toBe(true)
  })

  it('MITTELTON: er trägt weder helle noch dunkle Schrift und reisst `button-light`', () => {
    const pairs = brandColorContrastPairs(ROAST, MIDTONE, 'tinted')!
    const review = brandContrastReview(pairs)
    expect(review.ok).toBe(false)
    expect(review.failing).toEqual(['button-light'])
  })

  it('`brandAccentInk` nimmt den HÖHEREN der beiden Kontraste — beide Richtungen', () => {
    const paper = brandNeutralRamp(ROAST)![50]
    const ink = brandRampLight(ROAST)![950]
    expect(brandAccentInk(MILK, paper, ink)).toBe(ink)
    expect(brandAccentInk(PALM, paper, ink)).toBe(paper)
    /*
     * GEGENPROBE gegen eine Regel, die nur zufällig richtig liegt: die
     * gewählte Farbe trägt bei JEDEM der drei Akzente den höheren Kontrast —
     * nachgerechnet mit `brandContrast`, nicht mit sich selbst.
     */
    for (const accent of [MILK, PALM, MIDTONE]) {
      const chosen = brandAccentInk(accent, paper, ink)
      const other = chosen === paper ? ink : paper
      expect(brandContrast(chosen, accent)!.ratio)
        .toBeGreaterThanOrEqual(brandContrast(other, accent)!.ratio)
    }
  })

  it('das PRESET trägt dieselbe Schriftfarbe wie die Matrix des Kapitels', () => {
    const values: BrandDesignValues = {
      dna: KAILUA_DNA,
      base: ROAST,
      neutral: 'tinted',
      accent: MILK,
      roles: brandColorRoles(ROAST, MILK, 'tinted')!,
      pair: 'editorial',
      scale: 'calm',
      markKind: 'word',
      tempo: 'calm',
    }
    const preset = buildBrandDesign(values)!
    const fromPreset = preset.color.contrastPairs.find(pair => pair.id === 'button-light')!
    const fromChapter = brandColorContrastPairs(ROAST, MILK, 'tinted')!
      .find(pair => pair.id === 'button-light')!
    expect(fromPreset.foreground).toBe(fromChapter.foreground)
    expect(fromPreset.foreground).toBe(brandRampLight(ROAST)![950])
  })

  it('ein FEHLENDES Pflicht-Paar zählt wie ein durchgefallenes', () => {
    const pairs = brandColorContrastPairs(ROAST, PALM, 'tinted')!
      .filter(pair => pair.id !== 'body-light')
    expect(brandContrastReview(pairs).failing).toContain('body-light')
    expect(brandContrastReview([]).failing).toEqual([...BRAND_CONTRAST_REQUIRED_PAIRS])
  })

  it('`accent-dark` ist BEWUSST keine Pflicht — sonst gäbe es keine ruhige dunkle Welt', () => {
    expect(BRAND_CONTRAST_REQUIRED_PAIRS).not.toContain('accent-dark')
    expect(BRAND_CONTRAST_REQUIRED_PAIRS).toHaveLength(5)
  })

  it('gibt bei ungültigen Farben `null` statt einer Matrix aus Notfarben', () => {
    expect(brandColorContrastPairs('roast', PALM, 'tinted')).toBeNull()
    expect(brandColorContrastPairs(ROAST, 'palm', 'tinted')).toBeNull()
  })
})

describe('Die Slot-Werte — hin und zurück', () => {
  const light = brandRampLight(ROAST)!
  const dark = brandRampDark(ROAST)!
  const roles = brandColorRoles(ROAST, PALM, 'tinted')!
  const pairs = brandColorContrastPairs(ROAST, PALM, 'tinted')!

  it('`h.ramp`: zwei Blöcke, elf Stufen, verlustfrei zurück', () => {
    for (const locale of ['de', 'en']) {
      const value = brandRampSlotValue(light, dark, locale)
      expect(value.split('\n\n')).toHaveLength(2)
      const back = parseBrandRampSlotValue(value)
      expect(back, locale).not.toBeNull()
      expect(back!.light).toEqual(light)
      expect(back!.dark).toEqual(dark)
      expect(Object.keys(back!.light)).toHaveLength(BRAND_RAMP_SHADES.length)
    }
  })

  it('`h.roles`: fünf Blöcke, Hex verlustfrei, Quelle aus dem Katalog', () => {
    for (const locale of ['de', 'en']) {
      const value = brandColorRolesSlotValue(roles, locale)
      expect(value.split('\n\n')).toHaveLength(5)
      expect(parseBrandColorRolesSlotValue(value), locale).toEqual(roles)
    }
  })

  it('`h.contrast`: sechs Blöcke, Zahl und Urteil verlustfrei', () => {
    for (const locale of ['de', 'en']) {
      const value = brandContrastSlotValue(pairs, locale)
      expect(value.split('\n\n')).toHaveLength(6)
      const back = parseBrandContrastSlotValue(value)
      expect(back, locale).not.toBeNull()
      for (const [index, pair] of pairs.entries()) {
        expect(back![index]!.id).toBe(pair.id)
        expect(back![index]!.foreground).toBe(pair.foreground)
        expect(back![index]!.background).toBe(pair.background)
        expect(back![index]!.level).toBe(pair.level)
        // Die Zahl reist gerundet (eine Nachkommastelle) — das ist die Form,
        // die im Handbuch steht, und sie muss sich wiederfinden lassen.
        expect(back![index]!.ratio).toBeCloseTo(Number(pair.ratio.toFixed(1)), 5)
      }
    }
  })

  it('der Wert steht in der INHALTS-Sprache — die Zahl auch', () => {
    expect(brandRatioText(13.53, 'de')).toBe('13,5:1')
    expect(brandRatioText(13.53, 'en')).toBe('13.5:1')
    expect(brandContrastSlotValue(pairs, 'de')).toContain('Fließtext auf Papier')
    expect(brandContrastSlotValue(pairs, 'en')).toContain('Body text on paper')
    expect(brandContrastSlotValue(pairs, 'en')).not.toContain('Fließtext')
    expect(brandColorRolesSlotValue(roles, 'de')).toContain('Grund & Text')
    expect(brandColorRolesSlotValue(roles, 'en')).toContain('Ground and text')
  })

  it('FAIL-SOFT: ein von Hand bearbeiteter Wert ergibt `null`, nie eine halbe Farbwelt', () => {
    expect(parseBrandRampSlotValue('Ich habe hier was geändert.')).toBeNull()
    expect(parseBrandRampSlotValue('## Hell\n50 #ffffff')).toBeNull()
    expect(parseBrandColorRolesSlotValue('## Grund & Text\nirgendwas')).toBeNull()
    expect(parseBrandContrastSlotValue('')).toBeNull()
    expect(parseBrandContrastSlotValue(brandContrastSlotValue(pairs.slice(0, 3), 'de'))).toBeNull()
  })
})
