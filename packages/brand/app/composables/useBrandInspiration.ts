import {
  type BrandInspirationEntry,
  BRAND_INSPIRATION_MAX,
} from '../../shared/brandInspiration'
import { brandReadingState, brandReadingUnreadCount } from '../../shared/brandReading'
import type {
  BrandInspirationListResponse,
  BrandInspirationReadingView,
} from '../../shared/types/brand'

/**
 * DIE VORBILDER EINER MARKE — EIN Zustand für ZWEI Abschnitte (Brand Design
 * D2b).
 *
 * ── WARUM NICHT ZWEI KOMPONENTEN MIT JE EIGENER LISTE ────────────────────
 * Die Ablage (`BwUploadsEditor`) und die Lesung (`BwReadingPanel`) stehen
 * untereinander in derselben Bühne und meinen dieselben zwölf Zeilen. Zwei
 * eigene Listen wären zwei Abrufe derselben Route — und, schlimmer, zwei
 * Stände: wer ein Bild hinzufügt, ändert damit den Zustand der LESUNG
 * (`stale`, „ein Bild ist noch nicht gelesen"), und ein Abschnitt, der davon
 * nichts mitbekommt, behauptet weiter, alles sei gelesen.
 *
 * `useState` und nicht `provide/inject`: der Schlüssel trägt die Marken-Id, der
 * Zustand überlebt damit den Wechsel zwischen den Kapiteln und ist trotzdem je
 * Marke getrennt. Zwei offene Marken in zwei Tabs teilen nichts.
 *
 * ── DER ZUSTAND DER LESUNG WIRD GERECHNET, NICHT ÜBERNOMMEN ──────────────
 * Der Server schickt ihn mit (`reading.state`), aber die Wahrheit sind die
 * Zeilen: nach einem Upload ist die Liste neu und der Server-Stand alt. Also
 * rechnet der Client dieselbe pure Regel (`brandReadingState`) über seine
 * eigene Liste — und kann gar nicht auseinanderlaufen. FAZIT und LAUF-ZEILE
 * kommen dagegen vom Server: sie stehen im Slot-Wert und lassen sich nicht
 * ableiten.
 */
export function useBrandInspiration(profileId: string) {
  const items = useState<BrandInspirationEntry[]>(
    `brand-inspiration:${profileId}`,
    () => [],
  )
  const summary = useState<BrandInspirationReadingView['summary']>(
    `brand-inspiration-summary:${profileId}`,
    () => ({ keeps: [], improves: [] }),
  )
  const runLine = useState<string>(`brand-inspiration-run:${profileId}`, () => '')
  const loaded = useState<boolean>(`brand-inspiration-loaded:${profileId}`, () => false)

  const base = `/api/brand/profiles/${encodeURIComponent(profileId)}/inspiration`

  const state = computed(() => brandReadingState(items.value))
  const unread = computed(() => brandReadingUnreadCount(items.value))
  const full = computed(() => items.value.length >= BRAND_INSPIRATION_MAX)

  /** Die ganze Liste übernehmen — jede Schreib-Antwort trägt sie (D2a). */
  function setItems(next: BrandInspirationEntry[]): void {
    items.value = next
    loaded.value = true
  }

  function setReading(view: BrandInspirationReadingView): void {
    summary.value = view.summary
    runLine.value = view.runLine
  }

  async function load(): Promise<void> {
    const res = await $fetch<BrandInspirationListResponse>(base)
    setItems(res.items)
    setReading(res.reading)
  }

  return { base, items, summary, runLine, loaded, state, unread, full, setItems, setReading, load }
}
