import { describe, expect, it } from 'vitest'
import { brandTokensSchema } from '../schemas/brandTokens'
import { brandContrast, buildBrandDesign } from '../shared/brandDesign'
import { brandColorRoles } from '../shared/brandDesignColor'
import { BRAND_TYPE_H1_REM, brandTypeRuleLines, brandTypeRulesFromLines, brandTypeScaleRatio } from '../shared/brandDesignType'
import { brandDesignSnapshotPreset } from '../shared/brandDesignValues'
import { BRAND_MARK_RADIUS_BY_FORM } from '../shared/brandDesignMark'
import { KAILUA_COFFEE_DESIGN } from '../shared/examples/kailuaCoffeeDesign'
import {
  BRAND_TOKEN_ACCENT_AA_RATIO,
  BRAND_TOKEN_MARK_TILE_REM,
  BRAND_TOKEN_TYPE_STEPS,
  brandTokenAccentLift,
  brandTokenColorValue,
  brandTokenCubicBezier,
  brandTokenMirrorShade,
  brandTokenRoleAlias,
  buildBrandTokens,
  renderBrandTokensJson,
} from '../shared/brandTokens'
import { renderBrandTokensCss, resolveBrandTokenAlias } from '../shared/brandTokensCss'
import { BRAND_RAMP_SHADES, type BrandDesignSnapshotPreset } from '../shared/types/brand'
import { BRAND_TOKEN_EXTENSION_ACCENT_LIFT, type BrandColorAliasToken, type BrandTypographyToken } from '../shared/types/brandKit'

/**
 * DAS TOKEN-MODELL (Konzept docs/plans/BRAND-BOOK-KIT.md §2.6, Paket K2).
 *
 * ── WAS HIER BEWIESEN WIRD ───────────────────────────────────────────────
 *  1. DIE FORM IST DIE NORM — das Zod-Schema liest die Datei so, wie Figma und
 *     Style Dictionary sie lesen würden. Ein fehlendes `$type`, eine Farbe
 *     ohne `hex`, ein Alias mit Leerzeichen: rot.
 *  2. DIE ALIASSE ZEIGEN AUF ETWAS — jeder Rollen-Alias beider Modi wird
 *     wirklich aufgelöst. Ein Alias ins Leere ist der Fehler, den man erst im
 *     Werkzeug des Kunden sieht.
 *  3. CSS UND JSON SIND DECKUNGSGLEICH — jeder Hex der CSS-Datei kommt in der
 *     JSON-Datei vor, und jede Rolle steht in BEIDEN Modi und BEIDEN Blöcken.
 *     Das ist die Zusage aus §2.6, und sie ist zählbar.
 *  4. DIE MARKE ENTSCHEIDET, NICHT DER VORSCHLAG — ein Gewicht von 700 und
 *     eine Hierarchie „Plakativ" kommen in den Tokens an. Ohne diesen Test
 *     wäre die stille Rückkehr auf die D4-Vorgabe unsichtbar.
 *
 * Die Marke ist Kailua Coffee Co. — dieselbe Fixture wie im Ergebnis-Board,
 * gerechnet aus `buildBrandDesign` und nicht abgeschrieben.
 */

const KAILUA = KAILUA_COFFEE_DESIGN!
const META = { title: 'Kailua Coffee Co.', stand: '2026-09-09T10:20:00.000Z', locale: 'de' }

function tokensOf(preset: BrandDesignSnapshotPreset = KAILUA) {
  return buildBrandTokens(preset, META)
}

/** Ein Preset wie Kailua, aber mit anderen Entscheidungen an der Schrift. */
function presetWith(overrides: { scale?: string, headingWeight?: number, headingTracking?: number, headingUppercase?: boolean }): BrandDesignSnapshotPreset {
  const preset = buildBrandDesign({
    dna: KAILUA.dna,
    base: KAILUA.color.base,
    neutral: 'warm',
    accent: KAILUA.color.accent,
    roles: brandColorRoles(KAILUA.color.base, KAILUA.color.accent, 'warm') ?? [],
    pair: KAILUA.type.pair,
    scale: overrides.scale ?? KAILUA.type.scale,
    typeRules: brandTypeRuleLines({
      headingWeight: overrides.headingWeight ?? 400,
      headingTracking: overrides.headingTracking ?? 0,
      headingUppercase: overrides.headingUppercase ?? false,
    }, 'de'),
    markKind: KAILUA.mark.kind,
    tempo: KAILUA.motion.tempo,
  })
  return brandDesignSnapshotPreset(preset!)
}

describe('die Fixture', () => {
  it('steht — ohne sie beweist dieser Test nichts', () => {
    expect(KAILUA_COFFEE_DESIGN).toBeDefined()
  })
})

describe('buildBrandTokens — die DTCG-Form', () => {
  it('hält das Schema der Norm', () => {
    const result = brandTokensSchema.safeParse(tokensOf())
    // Die Fehlerliste in der Meldung: ein „false" ohne Grund kostet zehn
    // Minuten, jedes Mal.
    expect(result.success ? [] : result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)).toEqual([])
  })

  it('trägt Fassung, Stand und Erzeuger im Kopf', () => {
    const meta = tokensOf().$extensions['supply.branding/meta']
    expect(meta).toEqual({
      formatVersion: 1,
      stand: META.stand,
      generator: 'branding.supply',
      presetVersion: KAILUA.version,
    })
  })

  it('rechnet Farbkanäle als 0–1 mit höchstens vier Nachkommastellen, Hex als Rückfall', () => {
    const value = brandTokenColorValue('#4A3123')
    expect(value).toEqual({ colorSpace: 'srgb', components: [0.2902, 0.1922, 0.1373], hex: '#4a3123' })

    const tokens = tokensOf()
    for (const shade of BRAND_RAMP_SHADES) {
      const node = tokens.color.brand[String(shade)]
      if (typeof node === 'string' || !node) throw new Error(`Stufe ${shade} fehlt`)
      for (const channel of node.$value.components) {
        expect(channel).toBeGreaterThanOrEqual(0)
        expect(channel).toBeLessThanOrEqual(1)
        expect(String(channel).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4)
      }
      expect(node.$value.hex).toBe(KAILUA.color.rampLight[shade])
    }
  })

  it('führt alle drei Rampen mit allen elf Stufen', () => {
    const tokens = tokensOf()
    for (const group of [tokens.color.brand, tokens.color['brand-dark'], tokens.color.neutral]) {
      const shades = Object.keys(group).filter(key => !key.startsWith('$'))
      expect(shades).toEqual(BRAND_RAMP_SHADES.map(String))
    }
  })
})

describe('die Rollen — dieselben Namen, gespiegelte Stufen', () => {
  it('spiegelt die Stufe, nicht den Namen', () => {
    expect(brandTokenMirrorShade(50)).toBe(950)
    expect(brandTokenMirrorShade(900)).toBe(100)
    expect(brandTokenMirrorShade(500)).toBe(500)
    expect(brandTokenRoleAlias('ramp.900', 'light')).toBe('{color.brand.900}')
    expect(brandTokenRoleAlias('ramp.900', 'dark')).toBe('{color.brand-dark.100}')
    expect(brandTokenRoleAlias('neutral.50', 'dark')).toBe('{color.neutral.950}')
    expect(brandTokenRoleAlias('accent', 'dark')).toBe('{color.accent}')
    expect(brandTokenRoleAlias('bogus.7', 'light')).toBeNull()
  })

  it('trägt jede Rolle des Presets in beiden Modi', () => {
    const tokens = tokensOf()
    const ids = KAILUA.color.roles.map(role => role.id)
    expect(ids.length).toBeGreaterThan(0)
    for (const scheme of ['light', 'dark'] as const) {
      const group = tokens.color[scheme]
      expect(Object.keys(group).filter(key => !key.startsWith('$'))).toEqual(ids)
    }
  })

  it('löst jeden Alias auf ein Token auf, das es gibt', () => {
    const tokens = tokensOf()
    for (const scheme of ['light', 'dark'] as const) {
      for (const [id, node] of Object.entries(tokens.color[scheme])) {
        if (id.startsWith('$') || typeof node === 'string') continue
        expect(resolveBrandTokenAlias(tokens, node.$value), `${scheme}.${id}`).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
    expect(resolveBrandTokenAlias(tokens, '{color.brand.4711}')).toBeNull()
    expect(resolveBrandTokenAlias(tokens, 'kein alias')).toBeNull()
  })

  it('belegt den Kontrast nur mit geprüften Paaren des Presets', () => {
    const tokens = tokensOf()
    const known = new Set(KAILUA.color.contrastPairs.map(pair => pair.id))
    let belegt = 0
    for (const scheme of ['light', 'dark'] as const) {
      for (const [id, node] of Object.entries(tokens.color[scheme])) {
        if (id.startsWith('$') || typeof node === 'string') continue
        const contrast = (node as BrandColorAliasToken).$extensions?.['supply.branding/contrast']
        if (!contrast) continue
        belegt++
        expect(known.has(contrast.pair), `${scheme}.${id} → ${contrast.pair}`).toBe(true)
        expect(contrast.ratio).toBeGreaterThan(0)
      }
    }
    // Nicht jede Rolle kommt in einem der sechs Paare vor (§2.6) — aber die
    // tragenden tun es, und ohne diese Untergrenze wäre der Test auch dann
    // grün, wenn die Belege ganz fehlten.
    expect(belegt).toBeGreaterThanOrEqual(4)
  })
})

describe('die Größen-Leiter', () => {
  it('setzt H1 auf die Zahl aus D4 und staffelt geometrisch', () => {
    const tokens = tokensOf()
    const sizes = BRAND_TOKEN_TYPE_STEPS.map((step) => {
      const node = tokens.type.scale[step.id]
      if (typeof node === 'string' || !node || node.$type !== 'typography') throw new Error(`Stufe ${step.id} fehlt`)
      return node.$value.fontSize.value
    })
    // „Ruhig" = Faktor 1 ⇒ H1 ist genau die Zahl aus `BRAND_TYPE_H1_REM`.
    expect(sizes[0]).toBe(BRAND_TYPE_H1_REM)
    expect(sizes[4]).toBe(1)
    for (let index = 1; index < sizes.length; index++) {
      expect(sizes[index]!).toBeLessThan(sizes[index - 1]!)
    }
  })

  it('folgt der gewählten Hierarchie, nicht dem Vorschlag', () => {
    const loud = tokensOf(presetWith({ scale: 'loud' }))
    const node = loud.type.scale.h1
    if (typeof node === 'string' || !node || node.$type !== 'typography') throw new Error('h1 fehlt')
    expect(node.$value.fontSize.value).toBe(Math.round(brandTypeScaleRatio('loud') * 1000) / 1000)
    expect(node.$value.fontSize.value).toBeGreaterThan(BRAND_TYPE_H1_REM)
  })

  it('stellt jede Stufe zusätzlich als Einzel-Maß bereit (Figma liest keine Verbünde)', () => {
    const tokens = tokensOf()
    for (const step of BRAND_TOKEN_TYPE_STEPS) {
      const composite = tokens.type.scale[step.id]
      const single = tokens.type.scale[`${step.id}-size`]
      if (typeof composite === 'string' || !composite || composite.$type !== 'typography') throw new Error('Verbund fehlt')
      if (typeof single === 'string' || !single || single.$type !== 'dimension') throw new Error('Einzel-Maß fehlt')
      expect(single.$value).toEqual(composite.$value.fontSize)
    }
  })

  it('trägt Gewicht, Laufweite und Versalien der MARKE', () => {
    const preset = presetWith({ headingWeight: 700, headingTracking: -0.5, headingUppercase: true })
    // Gegenprobe an der Quelle: die Zeilen des Presets tragen die Entscheidung
    // wirklich (sonst prüfte der Rest hier den Vorschlag gegen sich selbst).
    expect(brandTypeRulesFromLines(preset.type.rules))
      .toEqual({ headingWeight: 700, headingTracking: -0.5, headingUppercase: true })

    const tokens = buildBrandTokens(preset, META)
    expect(tokens.font.weight.heading.$value).toBe(700)
    expect(tokens.font.weight.body.$value).toBe(400)
    const h1 = tokens.type.scale.h1 as BrandTypographyToken
    expect(h1.$value.fontWeight).toBe(700)
    expect(h1.$value.letterSpacing).toEqual({ value: -0.5, unit: 'px' })
    expect(h1.$extensions?.['supply.branding/type']).toEqual({ uppercase: true })
    // Der Fließtext bleibt unangetastet (D4) — keine Versalien, kein Sperren.
    const body = tokens.type.scale.body as BrandTypographyToken
    expect(body.$value.fontWeight).toBe(400)
    expect(body.$value.letterSpacing).toBeUndefined()
    expect(body.$extensions).toBeUndefined()
  })
})

describe('Zeichen und Bewegung', () => {
  it('rechnet den Zeichen-Radius aus der Formsprache auf die Bezugs-Kachel', () => {
    const tokens = tokensOf()
    const percent = BRAND_MARK_RADIUS_BY_FORM[KAILUA.dna.form ?? '']!
    expect(tokens.radius.mark.$value).toEqual({
      value: Math.round(BRAND_TOKEN_MARK_TILE_REM * (percent / 100) * 1000) / 1000,
      unit: 'rem',
    })
    // Der Prozentwert reist mit: er ist die Zahl, die auf JEDER Kachel gilt.
    expect(tokens.radius.mark.$extensions?.['supply.branding/mark'])
      .toEqual({ radiusPercent: percent, referenceTileRem: BRAND_TOKEN_MARK_TILE_REM })
  })

  it('übernimmt die Dauern des Presets und liest die Kurve', () => {
    const tokens = tokensOf()
    for (const token of KAILUA.motion.transitions) {
      const node = tokens.motion.duration[token.id]
      if (typeof node === 'string' || !node) throw new Error(`Dauer ${token.id} fehlt`)
      expect(node.$value).toEqual({ value: token.durationMs, unit: 'ms' })
    }
    const easing = tokens.motion.easing.brand
    if (typeof easing === 'string' || !easing) throw new Error('Kurve fehlt')
    expect(easing.$value).toEqual([0.22, 0.61, 0.36, 1])
    expect(brandTokenCubicBezier('linear')).toBeNull()
    expect(brandTokenCubicBezier('cubic-bezier(0.4, 0, 0.2, 1)')).toEqual([0.4, 0, 0.2, 1])
  })
})

describe('tokens.css — abgeleitet, nicht zweitgerechnet', () => {
  it('nimmt jeden Hex aus tokens.json (Deckungsgleichheit)', () => {
    const tokens = tokensOf()
    const json = renderBrandTokensJson(tokens)
    const css = renderBrandTokensCss(tokens)
    const hexes = [...new Set(css.match(/#[0-9a-f]{6}/g) ?? [])]
    expect(hexes.length).toBeGreaterThan(20)
    expect(hexes.filter(hex => !json.includes(hex))).toEqual([])
  })

  it('nennt jede Rolle in beiden Modi UND in beiden Blöcken', () => {
    const tokens = tokensOf()
    const css = renderBrandTokensCss(tokens)
    const root = css.slice(css.indexOf(':root {'), css.indexOf('.dark {'))
    const dark = css.slice(css.indexOf('.dark {'), css.indexOf('@theme {'))
    const theme = css.slice(css.indexOf('@theme {'))
    for (const role of KAILUA.color.roles) {
      expect(root, `:root ${role.id}`).toContain(`--brand-color-${role.id}:`)
      expect(dark, `.dark ${role.id}`).toContain(`--brand-color-${role.id}:`)
      expect(theme, `@theme ${role.id}`).toContain(`--color-brand-${role.id}:`)
    }
  })

  it('setzt im dunklen Modus die ganze Rampe neu, nicht nur die Rollen', () => {
    const tokens = tokensOf()
    const css = renderBrandTokensCss(tokens)
    const dark = css.slice(css.indexOf('.dark {'), css.indexOf('@theme {'))
    for (const shade of BRAND_RAMP_SHADES) {
      expect(dark).toContain(`--ui-color-primary-${shade}: ${KAILUA.color.rampDark[shade]};`)
    }
    expect(dark).toContain('--ui-primary: var(--ui-color-primary-400);')
  })

  it('setzt Familiennamen mit Leerzeichen in Anführungszeichen', () => {
    const css = renderBrandTokensCss(tokensOf())
    expect(css).toContain("--brand-font-heading: 'Source Serif 4', Georgia, 'Times New Roman', serif;")
    expect(css).toContain('--font-mono: \'Geist Mono\', ui-monospace, SFMono-Regular, monospace;')
  })

  it('beginnt mit demselben Kopf — und rechnet zweimal dasselbe', () => {
    const css = renderBrandTokensCss(tokensOf())
    expect(css.split('\n').slice(0, 10)).toEqual([
      '/* tokens.css — abgeleitet aus tokens.json (DTCG)',
      ' * Design-Tokens Kailua Coffee Co. · Stand 2026-09-09T10:20:00.000Z · DTCG 2025.10 · gerechnet, nicht gespeichert.',
      ' * Stand 2026-09-09T10:20:00.000Z · Fassung 1 · branding.supply',
      ' * Gerechnet, nicht von Hand gepflegt — jede Farbe steht so in tokens.json. */',
      '',
      ':root {',
      '  --ui-color-primary-50: #fdf3ee;',
      '  --ui-color-primary-100: #f1dfd5;',
      '  --ui-color-primary-200: #e2c8ba;',
      '  --ui-color-primary-300: #c8a694;',
    ])
    // Gerechnet, nie gespeichert (§2.6): zwei Aufrufe, dasselbe Ergebnis.
    expect(renderBrandTokensJson(tokensOf())).toBe(renderBrandTokensJson(tokensOf()))
    expect(css).toBe(renderBrandTokensCss(tokensOf()))
  })
})

// ── Der gehobene Dunkelmodus-Akzent (§2.20 Nr. 7, Nachschnitt K2) ──────────

describe('Dunkelmodus-Akzent (§2.20 Nr. 7)', () => {
  it('Kailua: color.dark.accent zeigt auf die erste AA-fähige Stufe der Akzent-Rampe, der Beleg trägt das gemessene Original', () => {
    const tokens = tokensOf()
    const dark = tokens.color.dark.accent as BrandColorAliasToken
    const lift = dark.$extensions?.[BRAND_TOKEN_EXTENSION_ACCENT_LIFT]
    expect(lift).toBeDefined()
    // Das Original erreicht auf der dunklen Fläche kein AA — der Grund der Hebung.
    expect(lift!.measured.ratio).toBeLessThan(BRAND_TOKEN_ACCENT_AA_RATIO)
    expect(lift!.from).toBe('{color.accent}')
    expect(dark.$value).toBe(`{color.accent-dark.${lift!.lifted.shade}}`)
    // Der Alias löst sich auf, und die gehobene Farbe erreicht AA auf derselben Fläche.
    const hex = resolveBrandTokenAlias(tokens, dark.$value)
    expect(hex).toBeTruthy()
    const verdict = brandContrast(hex!, lift!.ground)
    expect(verdict!.ratio).toBeGreaterThanOrEqual(BRAND_TOKEN_ACCENT_AA_RATIO)
    expect(lift!.lifted.ratio).toBe(Math.round(verdict!.ratio * 100) / 100)
    // Die Rampe selbst steht als Gruppe in der Datei — Style Dictionary/Figma sehen ein Ziel.
    expect(tokens.color['accent-dark'][String(lift!.lifted.shade)]).toBeDefined()
    // Das Original bleibt unangetastet: helle Rolle und Akzent-Token behalten den Markenwert.
    expect((tokens.color.light.accent as BrandColorAliasToken).$value).toBe('{color.accent}')
    expect(tokens.color.accent.$value.hex).toBe(KAILUA.color.accent.toLowerCase())
  })

  it('die erste Stufe von dunkel nach hell gewinnt — keine dunklere Stufe erreicht AA', () => {
    const tokens = tokensOf()
    const lift = (tokens.color.dark.accent as BrandColorAliasToken).$extensions![BRAND_TOKEN_EXTENSION_ACCENT_LIFT]!
    const darker = BRAND_RAMP_SHADES.filter(shade => shade > lift.lifted.shade)
    for (const shade of darker) {
      const hex = resolveBrandTokenAlias(tokens, `{color.accent-dark.${shade}}`)!
      expect(brandContrast(hex, lift.ground)!.ratio).toBeLessThan(BRAND_TOKEN_ACCENT_AA_RATIO)
    }
  })

  it('GEGENPROBE: ein Akzent, der auf dunkler Fläche schon AA erreicht, wird nicht gehoben', () => {
    const preset: BrandDesignSnapshotPreset = { ...KAILUA, color: { ...KAILUA.color, accent: '#f2c94c' } }
    const tokens = tokensOf(preset)
    const dark = tokens.color.dark.accent as BrandColorAliasToken
    expect(dark.$value).toBe('{color.accent}')
    expect(dark.$extensions?.[BRAND_TOKEN_EXTENSION_ACCENT_LIFT]).toBeUndefined()
    expect(brandTokenAccentLift('#f2c94c', KAILUA.color.neutral[950], KAILUA.color.rampDark)).toBeNull()
  })

  it('die CSS-Ableitung trägt im .dark-Block die gehobene Farbe, im :root das Original', () => {
    const tokens = tokensOf()
    const lifted = resolveBrandTokenAlias(tokens, (tokens.color.dark.accent as BrandColorAliasToken).$value)!
    const css = renderBrandTokensCss(tokens)
    const [rootBlock = '', darkBlock = ''] = [css.split('.dark {')[0], css.split('.dark {')[1]?.split('}')[0]]
    expect(rootBlock).toContain(`--brand-color-accent: ${KAILUA.color.accent.toLowerCase()};`)
    expect(darkBlock).toContain(`--brand-color-accent: ${lifted};`)
    // Zod: die neue Gruppe ist Teil der Form.
    expect(brandTokensSchema.safeParse(tokens).success).toBe(true)
  })
})
