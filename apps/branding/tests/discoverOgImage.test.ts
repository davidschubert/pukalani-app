import { describe, expect, it } from 'vitest'
import { BRAND_PALETTES } from '../../../packages/brand/shared/brandPalette'
import {
  DISCOVER_OG_FALLBACK_GRADIENT,
  DISCOVER_OG_HEIGHT,
  DISCOVER_OG_WIDTH,
  DISCOVER_OG_WORDMARK,
  discoverOgCacheKey,
  discoverOgColorAt,
  discoverOgGradient,
  renderDiscoverOgPng,
} from '../server/utils/discoverOgImage'
import { BRAND_CARD_LAYOUT } from '../../../packages/themes/shared/brandCard'
import { BRAND_CARD_FONT } from '../../../packages/themes/shared/brandCardFont.gen'

/**
 * DAS VORSCHAUBILD EINER ANATOMIE (Discover D4) — geprüft an dem, was eine
 * Vorschau-Antwort ausmacht: es IST ein PNG, es hat die Masse, die im Kopf
 * stehen, es trägt die Farbwelt der Marke, und kein Markenname der Welt bringt
 * es zum Absturz.
 *
 * Der letzte Punkt ist der wichtige: die Route ist öffentlich, gecacht und
 * bekommt Kundentext. Ein Fehlschlag dort wäre ein 500 auf einer Adresse, die
 * in fremden Chats steht.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

/** Breite und Höhe stehen im IHDR — dem ersten Chunk nach der Signatur. */
function pngSize(png: Buffer): { width: number, height: number, type: string } {
  return {
    type: png.subarray(12, 16).toString('ascii'),
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  }
}

/** WCAG-Kontrastverhältnis zweier Farben (1…21). */
function contrast(a: readonly number[], b: readonly number[]): number {
  const luminance = (color: readonly number[]): number => {
    const [r, g, bl] = color.map((channel) => {
      const c = channel / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }) as [number, number, number]
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const first = luminance(a)
  const second = luminance(b)
  const [light, dark] = first > second ? [first, second] : [second, first]
  return (light + 0.05) / (dark + 0.05)
}

describe('Discover-OG: die Farbwelt', () => {
  it('findet jeden Katalog-Eintrag', () => {
    for (const palette of BRAND_PALETTES) {
      expect(discoverOgGradient(palette.id)).toEqual([...palette.gradient])
    }
    // Grossschreibung und Leerraum sind Bedienspuren, kein anderer Wert.
    expect(discoverOgGradient(' Bread ')).toEqual([...BRAND_PALETTES[0]!.gradient])
  })

  it('eine unbekannte oder fehlende Id ergibt den neutralen Rückfall, nicht die erste Welt', () => {
    expect(discoverOgGradient('gibt-es-nicht')).toEqual([...DISCOVER_OG_FALLBACK_GRADIENT])
    expect(discoverOgGradient('')).toEqual([...DISCOVER_OG_FALLBACK_GRADIENT])
    expect(discoverOgGradient(null)).toEqual([...DISCOVER_OG_FALLBACK_GRADIENT])
    expect(discoverOgGradient(undefined)).not.toEqual([...BRAND_PALETTES[0]!.gradient])
  })

  it('der Verlauf läuft hell → tief und ist unten wirklich tief', () => {
    const gradient = discoverOgGradient('bread')
    expect(discoverOgColorAt(gradient, 0)).toEqual([...hexRgb('#e8d3b8')])
    expect(discoverOgColorAt(gradient, 1)).toEqual([...hexRgb('#4a3123')])
    // Ausserhalb 0…1 wird geklemmt statt extrapoliert.
    expect(discoverOgColorAt(gradient, -5)).toEqual(discoverOgColorAt(gradient, 0))
    expect(discoverOgColorAt(gradient, 5)).toEqual(discoverOgColorAt(gradient, 1))
  })
})

describe('Discover-OG: der Kontrast an der Titel-Grundlinie', () => {
  /**
   * Die Zusage aus dem Kopf von `discoverOgImage.ts`: an der Grundlinie des
   * Titels trägt JEDE der zwölf Welten weisse Schrift mit mindestens 3:1 (die
   * AA-Schwelle für grosse Schrift) — nachgerechnet, nicht behauptet. Die
   * hellste Welt (Messing) ist der Prüfstein.
   */
  it('hält AA für grosse Schrift in allen zwölf Welten', () => {
    const white = [255, 255, 255]
    // Ein Titel kann zwei Zeilen haben und wächst nach OBEN — also ist die
    // hellste Stelle, an der Schrift steht, die Grundlinie der OBERSTEN Zeile
    // bei der GRÖSSTEN Schriftstufe. Nur an der unteren zu messen wäre eine
    // Zusage über die halbe Fläche.
    const { titleBaseline, titleSizes, titleLeading } = BRAND_CARD_LAYOUT
    const topBaseline = titleBaseline - Math.round(titleSizes[0] * titleLeading)
    for (const baseline of [topBaseline, titleBaseline]) {
      for (const palette of BRAND_PALETTES) {
        const color = discoverOgColorAt([...palette.gradient], baseline / DISCOVER_OG_HEIGHT)
        expect(contrast(color, white), `Farbwelt ${palette.id} @ ${baseline}`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('hält an der Herkunftszeile sogar AA für Fliesstext', () => {
    const white = [255, 255, 255]
    const t = BRAND_CARD_LAYOUT.wordmarkBaseline / DISCOVER_OG_HEIGHT
    for (const palette of BRAND_PALETTES) {
      const color = discoverOgColorAt([...palette.gradient], t)
      expect(contrast(color, white), `Farbwelt ${palette.id}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('Discover-OG: das Bild', () => {
  it('ist ein PNG mit 1200×630', async () => {
    const png = await renderDiscoverOgPng({
      title: 'Kailua Coffee Co.',
      paletteId: 'bluegrey',
      wordmark: DISCOVER_OG_WORDMARK,
    })
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true)
    expect(pngSize(png)).toEqual({ type: 'IHDR', width: DISCOVER_OG_WIDTH, height: DISCOVER_OG_HEIGHT })
    expect(png.length).toBeGreaterThan(1000)
  })

  it('sieht je Farbwelt anders aus — sonst wäre die Facette Dekoration', async () => {
    const [a, b] = await Promise.all([
      renderDiscoverOgPng({ title: 'Krume & Gold', paletteId: 'bread' }),
      renderDiscoverOgPng({ title: 'Krume & Gold', paletteId: 'fir' }),
    ])
    expect(a.equals(b)).toBe(false)
  })

  it('rendert jede der zwölf Welten ohne Fehlschlag', async () => {
    for (const palette of BRAND_PALETTES) {
      const png = await renderDiscoverOgPng({ title: 'Hafenkontor', paletteId: palette.id })
      expect(pngSize(png).width).toBe(DISCOVER_OG_WIDTH)
    }
  })

  it('stürzt an Zeichen ausserhalb des Atlas NICHT ab — sie fallen weg', async () => {
    // Kyrillisch, Japanisch, Emoji: der gebackene Zeichensatz kennt keines
    // davon. Weglassen statt Kästchen (Regel von `sanitizeBrandCardText`) —
    // heraus kommt ein Bild in der Farbwelt, nur ohne Wortmarke.
    for (const title of ['Кофейня Каилуа', 'カイルア珈琲', '☕️🌊', '', '   ']) {
      const png = await renderDiscoverOgPng({ title, paletteId: 'petrol', wordmark: DISCOVER_OG_WORDMARK })
      expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true)
      expect(pngSize(png).height).toBe(DISCOVER_OG_HEIGHT)
    }
  })

  it('verträgt einen absurd langen Namen ohne Leerzeichen', async () => {
    const png = await renderDiscoverOgPng({ title: 'A'.repeat(400), paletteId: 'olive' })
    expect(pngSize(png).width).toBe(DISCOVER_OG_WIDTH)
  })

  it('setzt die Herkunftszeile nur, wenn eine da ist', async () => {
    const [mit, ohne] = await Promise.all([
      renderDiscoverOgPng({ title: 'Hafenkontor', paletteId: 'slate', wordmark: DISCOVER_OG_WORDMARK }),
      renderDiscoverOgPng({ title: 'Hafenkontor', paletteId: 'slate' }),
    ])
    expect(mit.equals(ohne)).toBe(false)
  })

  it('kennt jedes Zeichen der Herkunftszeile — auch den Mittelpunkt', () => {
    for (const ch of DISCOVER_OG_WORDMARK) {
      expect(BRAND_CARD_FONT.glyphs[ch], `Zeichen ${JSON.stringify(ch)}`).toBeDefined()
    }
  })
})

describe('Discover-OG: der Ablage-Name', () => {
  it('ist ein Hash und NIE die Eingabe', () => {
    const key = discoverOgCacheKey('kailua-coffee-co', '2026-09-05T10:00:00.000Z')
    expect(key).toMatch(/^[0-9a-z]{5,12}$/)
    expect(key).not.toContain('kailua')
    // Auch ein Slug, der wie ein Pfad aussieht, kann keinen Pfad erzeugen.
    expect(discoverOgCacheKey('../../etc/passwd', '')).toMatch(/^[0-9a-z]{5,12}$/)
  })

  it('wandert mit dem Stand — sonst bliebe ein neuer Snapshot unsichtbar', () => {
    expect(discoverOgCacheKey('kailua', '2026-09-05T10:00:00.000Z'))
      .not.toBe(discoverOgCacheKey('kailua', '2026-09-06T10:00:00.000Z'))
    expect(discoverOgCacheKey('kailua', '2026-09-05T10:00:00.000Z'))
      .toBe(discoverOgCacheKey('kailua', '2026-09-05T10:00:00.000Z'))
  })
})

/** #rrggbb → [r, g, b] — nur für die Erwartungswerte oben. */
function hexRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}
