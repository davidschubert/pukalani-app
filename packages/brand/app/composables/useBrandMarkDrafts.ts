import {
  BRAND_MARK_DRAFTS_MAX,
  BRAND_MARK_DRAFTS_PER_RUN,
  type BrandMarkDraftEntry,
} from '../../shared/brandMarkDrafts'
import type { BrandMarkDraftsListResponse } from '../../shared/types/brand'

/**
 * DIE KI-ENTWÜRFE EINER MARKE — der Zustand des Stufe-3-Abschnitts (Brand
 * Design D5c, §2.5 Stufe 3).
 *
 * ── DIE WAHRHEIT LIEGT AUF DEM SERVER, NICHT HIER ─────────────────────────
 * Wie bei den Vorbildern (D2a): jede Handlung antwortet mit der GANZEN Liste,
 * und die wird übernommen. Keine lokale Liste, die der Browser fortschreibt —
 * der Vorgabe-Name zählt server-seitig vom Stand der Marke weiter („Entwurf
 * 5"), und eine zweite Zählung hier wäre spätestens nach dem ersten Verwerfen
 * eine andere.
 *
 * `useState` mit der Marken-Id im Schlüssel (wie `useBrandInspiration`): der
 * Zustand überlebt den Wechsel zwischen den Kapiteln und ist trotzdem je Marke
 * getrennt.
 *
 * ── ES GIBT NUR EINEN KONSUMENTEN, UND TROTZDEM STEHT ES HIER ────────────
 * `BwMarkPanel` ist heute der einzige Leser. Die Trennung ist die des
 * Nachbarn und aus demselben Grund: die Bühne des Zeichens ist schon vier
 * Abschnitte lang, und der Lade-, Lauf- und Fehlerzustand einer Fläche mit
 * eigener Route gehört nicht in dieselbe Datei wie das SVG der Setzungen.
 */
export function useBrandMarkDrafts(profileId: string) {
  const items = useState<BrandMarkDraftEntry[]>(`brand-mark-drafts:${profileId}`, () => [])
  const loaded = useState<boolean>(`brand-mark-drafts-loaded:${profileId}`, () => false)

  const base = `/api/brand/profiles/${encodeURIComponent(profileId)}/mark/drafts`

  const kept = computed(() => items.value.filter(entry => entry.kept).length)
  /** Reicht der Platz für einen weiteren Lauf (vier Entwürfe)? */
  const full = computed(() =>
    items.value.length + BRAND_MARK_DRAFTS_PER_RUN > BRAND_MARK_DRAFTS_MAX)

  /** Die ganze Liste übernehmen — jede Schreib-Antwort trägt sie. */
  function setItems(next: BrandMarkDraftEntry[]): void {
    items.value = next
    loaded.value = true
  }

  async function load(): Promise<void> {
    const res = await $fetch<BrandMarkDraftsListResponse>(base)
    setItems(res.items)
  }

  /**
   * Die Adresse EINES Entwurfs-Bildes. `?v=` trägt den Anlege-Zeitpunkt und
   * ist reiner Cache-Brecher; die Route selbst antwortet `private, no-store`,
   * und es gibt keine Bucket-Adresse, die ein Browser aufrufen könnte (§2.13).
   */
  function imageUrl(entry: BrandMarkDraftEntry): string {
    return `${base}/${encodeURIComponent(entry.id)}/image?v=${encodeURIComponent(entry.createdAt)}`
  }

  return { base, items, loaded, kept, full, setItems, load, imageUrl }
}
