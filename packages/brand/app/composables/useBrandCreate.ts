import { brandNewDraftBody } from '../../shared/brandStartCard'
import { firstOpenBrandStep } from '../../shared/brandJourney'
import type { BrandProfileDetailResponse } from '../../shared/types/brand'
import type { BwNewBrandSubmit } from '../components/BwNewBrandModal.vue'

/**
 * DIE ANLAGE AUS DEM MODAL — an EINER Stelle (Kailua-Befund 6, 2026-09-08).
 *
 * ── WARUM ES DIESES COMPOSABLE GIBT ──────────────────────────────────────
 * `BwNewBrandModal` hängt an DREI Orten im `live`-Modus: der Brandings-
 * Übersicht, dem Marken-Wähler der Werkstatt-Leiste und der Punkte-Seite. Bis
 * heute taten alle drei dasselbe — sie schickten die drei Antworten als Query
 * an `/dashboard/brands/new`, wo Weiche, Titel und Sprache ein zweites Mal
 * standen. Davids Entscheidung dreht das um: das Modal legt an und springt in
 * die Werkstatt.
 *
 * Drei Kopien dieser sechs Zeilen wären drei Gelegenheiten, den Sprung anders
 * zu machen — und die Abweichung merkte man erst, wenn ein Weg im falschen
 * Kapitel landet. Wohin es geht, entscheidet ohnehin eine pure Regel
 * (`firstOpenBrandStep`); hier steht nur der Aufruf und was daraus folgt.
 *
 * ── DAS MODAL SCHLIESST NUR BEI ERFOLG ───────────────────────────────────
 * Bei einem Fehlschlag steht die ganze Startkarte noch im Dialog. Es zu
 * schliessen, um dahinter einen Toast zu zeigen, hiesse die Arbeit wegzuwerfen
 * — der Satz gehört neben den Knopf, an dem er entstanden ist.
 */
export function useBrandCreate() {
  const localePath = useLocalePath()
  const appConfig = useAppConfig() as { pukalani?: { brand?: { contentLocales?: string[] } } }

  /** Die erlaubten Inhaltssprachen — aus der Config, nie aus dem Layer (§3e). */
  const contentLocales = computed(() => appConfig.pukalani?.brand?.contentLocales ?? ['en'])

  const creating = ref(false)
  const failed = ref(false)

  /** @returns `true`, wenn angelegt wurde — dann darf der Wirt sein Modal schliessen. */
  async function create(payload: BwNewBrandSubmit): Promise<boolean> {
    // Ohne Entwurf ist es der Demo-Zweig des Modals; der navigiert selbst.
    if (!payload.draft || creating.value) return false
    creating.value = true
    failed.value = false
    try {
      const detail = await $fetch<BrandProfileDetailResponse>('/api/brand/profiles', {
        method: 'POST',
        body: brandNewDraftBody(payload.kind === 'rebrand' ? 'relaunch' : 'new', payload.draft),
      })
      await navigateTo(localePath(`/brand/${detail.profile.id}/${firstOpenBrandStep(detail.journey)}`))
      return true
    }
    catch {
      failed.value = true
      return false
    }
    finally {
      creating.value = false
    }
  }

  return { contentLocales, creating, failed, create }
}
