import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appSourceFiles, REPO } from './support/fetchErrorScan'

/**
 * WÄCHTER: SCHRIFTGRÖSSEN SIND STUFEN, KEINE VON HAND GESETZTEN MASSE (TY1, UI-007).
 *
 * Eine feste Größe wie `text-[26px]` oder `style="font-size: 14px"` in einer
 * Vorlage umgeht die Stufen von Tailwind (`text-xs` … `text-4xl`) — jede wäre
 * eine eigene Entscheidung, die niemand mehr überblickt. Wer eine Größe
 * braucht, nimmt die nächste Stufe.
 *
 * AUSNAHMEN stehen unten mit Grund und Zahl. Ein Eintrag ohne passende Stelle
 * macht den Test ebenfalls rot (keine Ausnahme stellt still eine neue Stelle
 * frei). Gescannt werden `.vue`- und `.ts`-Dateien unter `packages/* /app` und
 * `apps/* /app` (nicht `.playground`) und zählt Klassen `text-[…]` sowie `style="…font-size: …"`.
 *
 * ZWEITER TEIL (Bahn 4): `font-size` in `<style>`-Blöcken und `.css`-Dateien
 * unter `app/`. Dort heißt die Stufe `var(--text-sm)` (Tailwind legt die
 * Stufen als Variablen an). Gezählt werden `px` und `rem`; `em` und `clamp()`
 * sind relativ und bleiben frei. Die Studio-Site (`apps/portfolio`) und die
 * Photos-App haben eine eigene Skala — umgestellt ist dort nur, was sich um
 * höchstens 0,25 px ändert; der Rest steht als Ausnahme je Datei.
 */
const FIXED_SIZE = /(?:\b[a-z0-9]+:)*text-\[\d*\.?\d+(?:px|rem|em)\]|style="[^"]*font-size:\s*\d*\.?\d+(?:px|rem|em)/g

/** Datei → Zahl der erlaubten festen Größen, mit Grund. */
const EXCEPTIONS: Readonly<Record<string, { count: number, reason: string }>> = {
  'packages/admin/app/components/AnalyticsTrendChart.vue': { count: 2, reason: 'Achsenbeschriftung des Diagramms unter 12 px, eine Stufe grösser überlappt' },
  'packages/brand/app/components/BwDesignBoard.vue': { count: 1, reason: 'Mikro-Beschriftung der Gestaltungstafel unter 12 px' },
  'packages/brand/app/components/BwDirectionCard.vue': { count: 2, reason: 'Mikro-Beschriftung der Richtungskarte unter 12 px' },
  'packages/brand/app/components/BwColorPanel.vue': { count: 1, reason: 'Mikro-Beschriftung der Farbleiste unter 12 px' },
  'packages/brand/app/components/BwSessionBlock.vue': { count: 3, reason: 'Fließtext des Dokuments: überschreibt gewollt `.bw-doc-text` (1rem) auf 0.875rem' },
  'packages/brand/app/pages/brand/[profileId]/kit.vue': { count: 1, reason: 'Mikro-Beschriftung unter 12 px' },
  'packages/core/app/components/MarkdownContent.vue': { count: 1, reason: 'em: relativ zur umgebenden Schrift (Inline-Code), keine feste Größe' },
  'packages/events/app/components/EventCalendar.vue': { count: 1, reason: 'Zahl in der Kalenderzelle unter 12 px' },
  'packages/feedback/app/components/FeedbackVoteButton.vue': { count: 1, reason: 'Zähler im Stimmen-Knopf unter 12 px' },
  'packages/marketing/app/components/MarketingHeader.vue': { count: 1, reason: 'Merkmarke („neu") im Menü unter 12 px' },
  'packages/onboarding/app/components/MembersWorldMap.vue': { count: 2, reason: 'Beschriftung auf der Weltkarte unter 12 px' },
  'packages/themes/app/components/customize/CustomizeCurves.vue': { count: 1, reason: 'Mikro-Beschriftung der Kurven-Vorschau unter 12 px' },
  'packages/themes/app/components/customize/CustomizeSceneBranding.vue': { count: 2, reason: 'Mikro-Beschriftung der Vorschau-Szene unter 12 px' },
}

export function fixedSizeCount(source: string): number {
  return [...source.matchAll(FIXED_SIZE)].length
}

const CSS_FIXED_SIZE = /font-size:\s*\d*\.?\d+(?:px|rem)\b/g
const STYLE_BLOCK = /<style[^>]*>([\s\S]*?)<\/style>/g

/** Feste Größen in CSS: die ganze `.css`-Datei, in `.vue` nur die `<style>`-Blöcke. */
export function cssFixedSizeCount(source: string, isCssFile: boolean): number {
  const css = isCssFile ? source : [...source.matchAll(STYLE_BLOCK)].map(m => m[1]).join('\n')
  return [...css.matchAll(CSS_FIXED_SIZE)].length
}

const STUDIO = 'Studio-Site mit eigener Skala: umgestellt nur, was sich um höchstens 0,25 px ändert'
const PHOTOS = 'Photos-App mit eigener Skala: umgestellt nur, was sich um höchstens 0,25 px ändert'

/** CSS: Datei → Zahl der erlaubten festen Größen, mit Grund. */
const CSS_EXCEPTIONS: Readonly<Record<string, { count: number, reason: string }>> = {
  'apps/marketing/app/components/HeroSection.vue': { count: 1, reason: 'Mikro-Beschriftung im Hero-Bild unter 12 px' },
  'packages/brand/app/assets/css/brand.css': { count: 2, reason: 'Mikro-Beschriftung unter 12 px; Gesprächstext der Werkstatt (0.925rem) bleibt, bis der Umbau der Werkstatt (Bahn 6) steht' },
  'packages/brand/app/components/BwDesignBoard.vue': { count: 1, reason: 'Mikro-Beschriftung der Gestaltungstafel unter 12 px' },
  'packages/brand/app/components/BwDesignScene.vue': { count: 11, reason: 'gestaltete Vorschau-Szene: eine verkleinerte Website im eigenen Maßstab' },
  'packages/brand/app/components/BwMotionPanel.vue': { count: 1, reason: 'Probe des bewegten Zeichens: Größe gehört zur Gestaltung der Probe' },
  'packages/brand/app/pages/brand/[profileId]/kit.vue': { count: 1, reason: 'Mikro-Beschriftung unter 12 px' },
  'apps/photos/app/assets/css/photos.css': { count: 3, reason: PHOTOS },
  'apps/photos/app/components/AppFooter.vue': { count: 4, reason: PHOTOS },
  'apps/photos/app/components/AppHeader.vue': { count: 1, reason: PHOTOS },
  'apps/photos/app/components/GalleryGrid.vue': { count: 2, reason: PHOTOS },
  'apps/photos/app/pages/about.vue': { count: 3, reason: PHOTOS },
  'apps/photos/app/pages/contact.vue': { count: 4, reason: PHOTOS },
  'apps/photos/app/pages/gallery.vue': { count: 1, reason: PHOTOS },
  'apps/photos/app/pages/index.vue': { count: 2, reason: PHOTOS },
  'apps/portfolio/app/assets/css/portfolio.css': { count: 8, reason: STUDIO },
  'apps/portfolio/app/components/SiteFooter.vue': { count: 4, reason: STUDIO },
  'apps/portfolio/app/components/SiteHeader.vue': { count: 1, reason: STUDIO },
  'apps/portfolio/app/pages/[slug].vue': { count: 2, reason: STUDIO },
  'apps/portfolio/app/pages/cases/[slug].vue': { count: 3, reason: STUDIO },
  'apps/portfolio/app/pages/erstgespraech/index.vue': { count: 10, reason: STUDIO },
  'apps/portfolio/app/pages/index.vue': { count: 19, reason: STUDIO },
  'apps/portfolio/app/pages/nuxt-entwickler-freelancer/index.vue': { count: 3, reason: STUDIO },
  'apps/portfolio/app/pages/ux-audit/index.vue': { count: 7, reason: STUDIO },
  'apps/portfolio/app/pages/wissen/freelancer-oder-agentur/index.vue': { count: 3, reason: STUDIO },
  'apps/portfolio/app/pages/wissen/was-kostet-ux-design/index.vue': { count: 3, reason: STUDIO },
}

describe('Schriftgrößen sind Stufen (TY1)', () => {
  const found: Record<string, number> = {}
  for (const file of appSourceFiles(['.vue', '.ts'])) {
    const n = fixedSizeCount(readFileSync(file, 'utf8'))
    if (n > 0) found[relative(REPO, file)] = n
  }

  it('keine neue feste Größe außerhalb der begründeten Ausnahmen', () => {
    const bad = Object.entries(found)
      .filter(([file, n]) => n > (EXCEPTIONS[file]?.count ?? 0))
      .map(([file, n]) => `${file}: ${n} feste Größe(n), erlaubt ${EXCEPTIONS[file]?.count ?? 0}`)
    expect(bad, 'nimm die nächste Stufe (text-xs … text-4xl) oder trage eine Ausnahme MIT GRUND ein').toEqual([])
  })

  it('jede Ausnahme hat eine passende Stelle', () => {
    const stale = Object.entries(EXCEPTIONS)
      .filter(([file, e]) => (found[file] ?? 0) < e.count)
      .map(([file, e]) => `${file}: eingetragen ${e.count}, gefunden ${found[file] ?? 0}`)
    expect(stale, 'Eintrag senken oder löschen').toEqual([])
  })

  it('Gegenprobe: die Erkennung findet feste Größen, aber keine Stufen', () => {
    expect(fixedSizeCount('<p class="text-[26px] sm:text-[1.3rem]">')).toBe(2)
    expect(fixedSizeCount('<p style="color: red; font-size: 14px">')).toBe(1)
    expect(fixedSizeCount('<p class="text-sm text-2xl md:text-3xl">')).toBe(0)
  })
})

describe('Schriftgrößen in CSS sind Stufen (TY1, Bahn 4)', () => {
  const found: Record<string, number> = {}
  for (const file of appSourceFiles(['.vue', '.css'])) {
    const n = cssFixedSizeCount(readFileSync(file, 'utf8'), file.endsWith('.css'))
    if (n > 0) found[relative(REPO, file)] = n
  }

  it('keine neue feste Größe in CSS außerhalb der begründeten Ausnahmen', () => {
    const bad = Object.entries(found)
      .filter(([file, n]) => n > (CSS_EXCEPTIONS[file]?.count ?? 0))
      .map(([file, n]) => `${file}: ${n} feste Größe(n) in CSS, erlaubt ${CSS_EXCEPTIONS[file]?.count ?? 0}`)
    expect(bad, 'nimm font-size: var(--text-sm) (xs … 4xl) oder trage eine Ausnahme MIT GRUND ein').toEqual([])
  })

  it('jede CSS-Ausnahme hat eine passende Stelle', () => {
    const stale = Object.entries(CSS_EXCEPTIONS)
      .filter(([file, e]) => (found[file] ?? 0) < e.count)
      .map(([file, e]) => `${file}: eingetragen ${e.count}, gefunden ${found[file] ?? 0}`)
    expect(stale, 'Eintrag senken oder löschen').toEqual([])
  })

  it('Gegenprobe: CSS-Erkennung zählt px/rem in Style-Blöcken, nicht Stufen, em oder Attribute', () => {
    const vue = '<template><p style="font-size: 14px">x</p></template>\n<style scoped>.a { font-size: 0.95rem; } .b { font-size: var(--text-sm); } .c { font-size: 0.9em; }</style>'
    expect(cssFixedSizeCount(vue, false)).toBe(1)
    expect(cssFixedSizeCount('.a{font-size:12px}.b{font-size: 1.1rem;}', true)).toBe(2)
  })

  it('Gegenprobe an einer echten Datei: eine zurückgesetzte Stufe wird rot', () => {
    const file = 'apps/marketing/app/components/FeeCalculator.vue'
    const source = readFileSync(`${REPO}/${file}`, 'utf8')
    const reverted = source.replace('font-size: var(--text-base)', 'font-size: 1.05rem')
    expect(reverted).not.toBe(source)
    expect(cssFixedSizeCount(reverted, false)).toBeGreaterThan(CSS_EXCEPTIONS[file]?.count ?? 0)
  })
})
