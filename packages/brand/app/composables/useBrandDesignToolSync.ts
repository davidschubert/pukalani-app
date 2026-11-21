import { type ComputedRef, computed, onMounted, watch } from 'vue'
import type { BrandStepKey } from '../../shared/slotRegistry'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * EIN DESIGN-WERKZEUG UND SEINE FELDER — die eine Mechanik, die Farbwelt (D3),
 * Typografie (D4), Zeichen (D5), Bildsprache (D6) und Bewegung (D7) teilen.
 * Bis WS1 (Kapitel d) stand sie fünfmal wortgleich in der Werkstatt-Seite.
 *
 * DIESELBE ARBEITSTEILUNG WIE BEI DER DNA: die `useBrand…World()`-Composables
 * RECHNEN, die SEITE schreibt — über ihr `onInput`, also denselben Weg wie
 * jede Eingabe (Store, dann Autosave). Hier entsteht kein eigener Zustand.
 *
 * DAS KAPITEL BELEGT SICH SELBST VOR (H5: „jede Session muss als BESTÄTIGUNG
 * durchlaufbar sein") — dieselbe Mechanik wie `g.boards`/`g.mix` in D2c.
 *
 * DREI SICHERUNGEN, die man nicht „vereinfachen" darf:
 *  1. Die GLEICHHEITS-Prüfung. Ohne sie schriebe jeder Renderdurchlauf
 *     denselben Text und der Autosave liefe im Kreis.
 *  2. BESTÄTIGTES bleibt unberührt. Ein bestätigter Slot ist zu; ein Schreiber
 *     darauf holte sich `slot_confirmed` vom Server — für eine Änderung, die
 *     niemand ausgelöst hat. Wer eine Ableitung nach der Bestätigung ändern
 *     will, geht durch „Korrigieren" (und der Veraltet-Hinweis sagt es ihm).
 *  3. Ein FEHLENDER Wert LÖSCHT. `h.contrast` steht nur da, solange die
 *     Pflicht-Paare AA halten (§2.3) — reisst eine spätere Basisfarbe sie,
 *     muss die alte, grüne Tabelle weg und nicht stehen bleiben.
 *
 *  4. ERST NACH DEM MOUNT. Der Server rendert diese Seite mit; ein
 *     `immediate`-Watcher im Setup füllte die Karte im Browser eine Runde
 *     früher als auf dem Server — drei Hydration-Mismatches (s. den Zwilling
 *     im DNA-Kapitel der Seite).
 *
 * Aufrufen im Setup der Seite, in der Reihenfolge der Kapitel: jedes Werkzeug
 * hängt seinen eigenen `onMounted`-Abgleich an.
 */
export interface BrandDesignToolSyncInput {
  /** Das offene Kapitel der Seite. */
  stepKey: ComputedRef<BrandStepKey | null>
  /** Das Kapitel dieses Werkzeugs. */
  chapter: BrandStepKey
  /** Die Felder, die das Werkzeug selbst vorbelegt. */
  slots: readonly string[]
  /**
   * Die Felder, die das Panel sperrt, sobald sie bestätigt sind — fehlt die
   * Liste, sind es dieselben wie `slots`. Beim Zeichen ist sie länger: das
   * Briefing (`j.brief`) schreibt der Mensch, gesperrt wird es trotzdem.
   */
  panelSlots?: readonly string[]
  /** Was das Werkzeug gerade rechnet (`useBrand…World().slotValues`). */
  values: ComputedRef<Record<string, string>>
  /** Der Schreibweg der Seite. */
  onInput: (slotId: string, value: string) => void
}

export function useBrandDesignToolSync(input: BrandDesignToolSyncInput) {
  const store = useBrandWorkspaceStore()

  const show = computed(() => input.stepKey.value === input.chapter)

  /** Was der Mensch schon bestätigt hat — das Panel sperrt genau diese Abschnitte. */
  const confirmed = computed(() =>
    (input.panelSlots ?? input.slots).filter(slotId => store.slotConfirmed(slotId)))

  onMounted(() => {
    watch(input.values, (values) => {
      if (input.stepKey.value !== input.chapter) return
      for (const slotId of input.slots) {
        if (store.slotConfirmed(slotId)) continue
        const value = values[slotId] ?? ''
        if (store.slotValue(slotId) === value) continue
        input.onInput(slotId, value)
      }
    }, { immediate: true })
  })

  /** Eine Wahl aus dem Panel — sie geht denselben Weg wie jede Eingabe. */
  function pick(slotId: string, value: string): void {
    if (store.slotConfirmed(slotId)) return
    input.onInput(slotId, value)
  }

  return { show, confirmed, pick }
}
