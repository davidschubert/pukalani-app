import type { ComputedRef } from 'vue'
import type { BwTocLink } from '../components/BwReadingToc.vue'
import {
  BRAND_FOUNDATION_DESIGN_SECTIONS,
  type BrandFoundationChapter,
} from '../../shared/brandFoundation'

/**
 * DAS INHALTSVERZEICHNIS DER LESE-ANSICHTEN — EINE Regel für drei Seiten
 * (Konzept docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §2.6, Brand Design D8).
 *
 * Privat (`/brand/:id/foundation`), öffentlich (`/brand/share/:token`) und die
 * Anatomie (`/discover/<slug>`) zeigen dieselben Kapitel und brauchen
 * dieselbe Liste. Sie stand dreimal da; seit Kapitel 10 UNTERPUNKTE hat
 * (Farbwelt · Typografie · Zeichen · Bildsprache · Bewegung), wären drei
 * Kopien drei Gelegenheiten, sie zu vergessen.
 *
 * ── DIE UNTERPUNKTE STEHEN NUR, WENN ES SIE GIBT ─────────────────────────
 * Gefragt wird nach dem `design`-BLOCK des Kapitels, nicht nach seinem
 * Zustand: ohne Preset ist Kapitel 10 die Schranke, und fünf Sprungmarken ins
 * Nichts wären ein Verzeichnis, das lügt.
 *
 * ── DER ZUSTAND KOMMT AUS DEM KAPITEL ────────────────────────────────────
 * Die private Ansicht hat ihn vorher schon gesetzt (`pending` über
 * `brandFoundationPendingStep`); Snapshot-Ansichten kennen `pending` gar nicht.
 * Hier wird deshalb nichts mehr entschieden — nur gezeichnet.
 *
 * ── DIE ZÄHLUNG FOLGT DER REIHENFOLGE ────────────────────────────────────
 * Wie in `BwFoundationChapter`: ein Kapitel ohne Weg (Markenarchitektur, Name)
 * entfällt ohne Lücke, die Nummern rutschen nach. Die Unterpunkte tragen
 * bewusst KEINE Nummer — sie sind Abschnitte einer Fläche, keine Kapitel.
 */
export function useBrandFoundationToc(
  chapters: () => readonly BrandFoundationChapter[],
): ComputedRef<BwTocLink[]> {
  const { t } = useI18n()

  return computed<BwTocLink[]>(() => {
    const links: BwTocLink[] = []
    for (const [index, chapter] of chapters().entries()) {
      links.push({
        id: chapter.anchor,
        text: t(chapter.titleKey),
        state: chapter.state,
        counter: String(index).padStart(2, '0'),
      })
      if (!chapter.blocks.some(block => block.kind === 'design')) continue
      for (const section of BRAND_FOUNDATION_DESIGN_SECTIONS) {
        links.push({
          id: `${chapter.anchor}-${section}`,
          text: t(`brand.foundation.design.${section}`),
          // Ein Abschnitt eines abgenommenen Kapitels ist abgenommen — der
          // Zustand gehört dem Kapitel, nicht der Überschrift darin.
          state: chapter.state,
          depth: 3,
        })
      }
    }
    return links
  })
}
