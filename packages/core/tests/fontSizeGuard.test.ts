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
 * NICHT Teil davon: `font-size` in `<style>`-Blöcken und CSS-Dateien
 * (`brand.css`, Marketing-, Portfolio-, Photos-Seiten) — das ist Rest von TY1.
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
