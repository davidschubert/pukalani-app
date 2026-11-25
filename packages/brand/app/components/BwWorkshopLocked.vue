<script setup lang="ts">
/**
 * DIE SPERR-FLÄCHE DER WERKSTATT — aus der Werkstatt-Seite geschnitten (WS1,
 * Rest nach Bahn C). Gesperrter Baustein: eine Fläche, keine Fehlerseite.
 *
 * Reine Anzeige: den Grund (`blocked`) reicht die Seite aus dem Store herein.
 */
const props = defineProps<{
  /** Der Sperr-Grund aus dem Store (`store.blocked`, `data.code` des Servers). */
  blocked: string
}>()

const { t } = useI18n()
const localePath = useLocalePath()

/**
 * DIE SPERR-FLÄCHE HAT ZWEI SÄTZE (Brand Design D1) — die Fläche bleibt eine.
 *
 * „Schließ das Kapitel davor ab" ist für einen gesperrten FOUNDATION-Baustein
 * richtig und für ein Design-Kapitel eine Irreführung: davor fehlt nichts, das
 * Produkt ist für diese Marke schlicht nicht freigeschaltet. Der Server nennt
 * den Grund (`data.code: 'design_locked'`, `canEnterBrandStep`), der Store
 * reicht ihn als `blocked` durch, hier wird ein Text daraus. Jeder andere
 * Grund behält den alten Satz — ein unbekannter Code darf nie in einer leeren
 * Fläche enden.
 */
const lockedTextKey = computed(() => {
  if (props.blocked === 'design_locked') return 'brand.workspace.designLocked'
  // SCHICHT 3 SAGT ETWAS ANDERES ALS SCHICHT 2 (K1): „Book & Kit ist Teil der
  // Ableitung" — und die Ableitung ist EIN Feld, das auch den Marktvergleich
  // öffnet. Der Grund kommt aus derselben Quelle wie bei Schicht 2
  // (`canEnterBrandStep` → `data.code`), nur heisst er hier
  // `derivation_locked` und steht auf `skipped` statt auf `locked` (D0-Lehre:
  // die Kapitel zählen sonst im Fortschritt mit).
  if (props.blocked === 'derivation_locked') return 'brand.workspace.derivationLocked'
  return 'brand.workspace.stepLocked'
})

/**
 * DER WEG ZUM ERSTGESPRÄCH — AUS DER CONFIG, NICHT GETIPPT (BS1 R0).
 *
 * Er steht NUR an der Ableitungs-Schranke (K1, §2.7: „CTA, KEIN Preis"): dort
 * ist die Auskunft „das gibt es, so kommt ihr dran" die halbe Produktseite.
 * An der Design-Schranke bleibt es beim Satz — dort führt der Einstieg über
 * Kapitel 10 der Leseansicht, und zwei CTAs auf denselben Weg wären zwei
 * Zählungen desselben Klicks.
 */
const callCta = useBrandCompletionCta()
</script>

<template>
  <div class="bw-root grid min-h-dvh place-items-center px-6">
    <div class="max-w-md text-center">
      <BwIllustration variant="journey" class="mx-auto h-16 w-auto" style="color: var(--bw-ink-soft)" />
      <p class="mt-4 font-medium">
        {{ t(`${lockedTextKey}.title`) }}
      </p>
      <p class="mt-1 text-sm" style="color: var(--bw-muted)">
        {{ t(`${lockedTextKey}.description`) }}
      </p>
      <div class="mt-5 flex flex-wrap items-center justify-center gap-2">
        <UButton
          class="rounded-full" variant="outline" :to="localePath('/dashboard/brands')"
          :label="t('brand.brands.title')"
        />
        <!-- Nur an der Ableitungs-Schranke, und ohne Preis (s. `callCta`). -->
        <UButton
          v-if="blocked === 'derivation_locked'"
          :to="callCta.to" :target="callCta.target" :rel="callCta.rel" :external="callCta.external"
          class="rounded-full" trailing-icon="i-ph-arrow-right"
          :label="t(callCta.labelKey)"
          data-derivation-cta
        />
      </div>
    </div>
  </div>
</template>
