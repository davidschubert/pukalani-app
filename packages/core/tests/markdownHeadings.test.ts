import { describe, expect, it } from 'vitest'
import { markdownHeadingId, markdownHeadings } from '../shared/markdown'

/**
 * SPRUNGMARKEN AUS DEM MARKDOWN (BI1 I3, Plan BRAND-INSIGHTS §9.5).
 *
 * Vier Aussagen, die man beim Umbauen still kaputt macht — und jede mit ihrer
 * Gegenprobe:
 *  1. Ein normaler Text ergibt einen lesbaren Slug; Umlaute werden zerlegt,
 *     nicht gelöscht.
 *  2. Eine Überschrift ohne verwertbare Zeichen bekommt `abschnitt-<index>` —
 *     nie eine leere Id.
 *  3. Ein Slug mit führender Ziffer bekommt dasselbe Präfix (ein CSS-Selektor
 *     darf nicht mit einer Ziffer beginnen — der Scrollspy fragt genau so).
 *  4. Zwei gleiche Überschriften ergeben ZWEI Ids.
 */

describe('markdownHeadingId', () => {
  it('macht aus einer Überschrift einen lesbaren Slug', () => {
    expect(markdownHeadingId('Was kostet ein Rebranding?', 0)).toBe('was-kostet-ein-rebranding')
  })

  it('zerlegt Umlaute, statt sie zu löschen', () => {
    expect(markdownHeadingId('Für Gründer', 0)).toBe('fur-grunder')
  })

  it('gibt NIE eine leere Id — Fallback ist abschnitt-<index>', () => {
    expect(markdownHeadingId('!!! ???', 3)).toBe('abschnitt-3')
    expect(markdownHeadingId('', 0)).toBe('abschnitt-0')
    // Gegenprobe: Zeichen ohne ASCII-Entsprechung sind kein Sonderfall.
    expect(markdownHeadingId('日本語', 7)).toBe('abschnitt-7')
  })

  it('lässt einen Slug nie mit einer Ziffer beginnen', () => {
    expect(markdownHeadingId('3 Gründe', 0)).toBe('abschnitt-3-grunde')
    // Gegenprobe: eine Ziffer MITTEN im Text ändert nichts.
    expect(markdownHeadingId('Version 3 im Vergleich', 0)).toBe('version-3-im-vergleich')
  })
})

describe('markdownHeadings', () => {
  it('liest h2 und h3 in Reihenfolge, mit Tiefe', () => {
    const headings = markdownHeadings([
      '# Titel der Seite',
      '',
      'Ein Absatz.',
      '',
      '## Der erste Abschnitt',
      '',
      '### Ein Unterpunkt',
      '',
      '## Der zweite Abschnitt',
    ].join('\n'))

    expect(headings).toEqual([
      // `#` wird vom Parser auf Ebene 2 gehoben (er kennt nur h2/h3).
      { id: 'titel-der-seite', text: 'Titel der Seite', depth: 2 },
      { id: 'der-erste-abschnitt', text: 'Der erste Abschnitt', depth: 2 },
      { id: 'ein-unterpunkt', text: 'Ein Unterpunkt', depth: 3 },
      { id: 'der-zweite-abschnitt', text: 'Der zweite Abschnitt', depth: 2 },
    ])
  })

  it('nimmt den TEXT der Überschrift, nicht ihre Marker', () => {
    const headings = markdownHeadings('## Der **fette** Teil und `code`')
    expect(headings[0]?.text).toBe('Der fette Teil und code')
    expect(headings[0]?.id).toBe('der-fette-teil-und-code')
  })

  it('vergibt für zwei gleiche Überschriften ZWEI Ids', () => {
    const headings = markdownHeadings('## Fazit\n\nText\n\n## Fazit')
    expect(headings.map(entry => entry.id)).toEqual(['fazit', 'fazit-1'])
  })

  it('findet in einem Text ohne Überschriften nichts', () => {
    expect(markdownHeadings('Nur ein Absatz.\n\n- und eine Liste')).toEqual([])
  })
})
