<script setup lang="ts">
/**
 * DIE RUHIGE SPERR-FLÄCHE DER LIEFERSEITE (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.7: „Kacheln, die Design brauchen, zeigen
 * ohne Preset die ruhige Sperr-Fläche + CTA"; Prototyp `FdKitLocked.vue`).
 *
 * DREI DINGE, DIE SIE ABSICHTLICH TUT:
 *  1. Sie sagt, WAS dort entstünde und WORAUS — dieselbe Ehrlichkeit wie die
 *     Schranke in Kapitel 10 der Leseansicht. Weglassen wäre bequemer und
 *     verschwiege, dass es die Sache gibt.
 *  2. Sie nennt KEINEN PREIS (§1.11 d, bis BS1 Z1): an der Schranke steht ein
 *     Gespräch, keine Zahl. Das Ziel kommt aus `useBrandCompletionCta()` und
 *     ist damit dasselbe wie an jeder anderen Schranke — nie getippt.
 *  3. Sie ist eine EIGENE Komponente, weil dieselbe Fläche dreimal auf einer
 *     Seite steht (Tokens, Zeichen, Lizenzen) — drei Kopien wären drei
 *     Stellen, an denen der CTA später auseinanderläuft.
 *
 * Der zweite Knopf des Prototyps („Brand Design ansehen") steht hier NUR,
 * wenn die Seite ein Ziel kennt: ohne freigeschaltete Schicht 2 führte er in
 * eine Sperr-Fläche, und zwei Schranken hintereinander sind keine Auskunft.
 */
const props = defineProps<{
  /** Was hier stünde — „Design-Tokens", „Zeichen", „Lizenzen". */
  what: string
  /** Ziel für „Brand Design ansehen"; ohne Ziel entfällt der Knopf. */
  designTo?: string | null
}>()

const { t } = useI18n()
const callCta = useBrandCompletionCta()
const designTo = computed(() => props.designTo ?? null)
</script>

<template>
  <div class="mt-4 rounded-2xl px-6 py-7" style="background: var(--bw-surface)" data-kit-locked>
    <div class="flex items-start gap-3">
      <UIcon name="i-ph-lock-simple" class="mt-0.5 size-5 flex-none" style="color: var(--bw-muted)" />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium" style="color: var(--bw-ink-soft)">
          {{ t('brand.kitPage.locked.title') }}
        </p>
        <p class="mt-1.5 max-w-2xl text-sm leading-relaxed" style="color: var(--bw-muted)">
          {{ t('brand.kitPage.locked.lead', { what: props.what }) }}
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <UButton
            :to="callCta.to" :target="callCta.target" :rel="callCta.rel" :external="callCta.external"
            :label="t(callCta.labelKey)" trailing-icon="i-ph-arrow-right" class="rounded-full"
            data-kit-locked-cta
          />
          <UButton
            v-if="designTo"
            :to="designTo" :label="t('brand.kitPage.locked.design')"
            color="neutral" variant="ghost" class="rounded-full"
          />
        </div>
      </div>
    </div>
  </div>
</template>
