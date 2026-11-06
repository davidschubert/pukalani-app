import type { ComputedRef } from 'vue'
import type { BrandCompletionCtaTarget } from '../../shared/brandCompletionCta'
import { resolveBrandCompletionCta } from '../../shared/brandCompletionCta'

/**
 * DER FERTIGE ABSCHLUSS-CTA — EINE STELLE FÜR ZWEI AUFRUFER (BS1 R0).
 *
 * Der Wizard (`BwFoundationChapter`, die Schranke vor dem visuellen Teil) und
 * die Schranke des Marktvergleichs (`market.vue`) zeigen auf DASSELBE Ziel.
 * Bis heute stand es an beiden Stellen getippt — einmal als harte Adresse,
 * einmal als Pfad-Rückfall neben dem Config-Lesen. Das ist die Stelle, an der
 * es jetzt EINMAL steht.
 *
 * ── WARUM COMPOSABLE UND NICHT IMPORT ────────────────────────────────────
 * `market` hängt an `brand` über einen expliziten Vertrag, und der
 * Oberflächen-Vertrag (`packages/market/app/contracts/brandUi.ts`) trägt
 * ausdrücklich NUR Typen: ein Wert-Import über die Layer-Grenze zöge das
 * brand-Modul in ein fremdes Client-Bündel. Ein Composable geht denselben Weg
 * wie die Komponenten `BwWorkspace`/`BwFindingChip` — über den Auto-Import der
 * App, die beide Layer listet. Die App komponiert, nicht der Layer.
 *
 * ── WAS ES ZURÜCKGIBT ────────────────────────────────────────────────────
 * `to` ist FERTIG: bei einem internen Ziel steht `localePath()` schon darum,
 * bei einer externen Adresse ausdrücklich NICHT (`localePath` hängt einer
 * fremden URL sonst das eigene Sprach-Präfix voran). `external` sagt dem
 * Aufrufer, ob `navigateTo` `{ external: true }` braucht.
 */
export function useBrandCompletionCta(): ComputedRef<BrandCompletionCtaTarget> {
  const appConfig = useAppConfig()
  const localePath = useLocalePath()
  return computed(() => {
    const target = resolveBrandCompletionCta(appConfig.pukalani?.brand?.completionCta)
    return target.external ? target : { ...target, to: localePath(target.to) }
  })
}
