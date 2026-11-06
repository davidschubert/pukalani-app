<script setup lang="ts">
/**
 * DIE RUHIGE SPERR-FLÄCHE DER LIEFERSEITE (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.7: „Kacheln, die Design brauchen, zeigen
 * ohne Preset die ruhige Sperr-Fläche + CTA").
 *
 * DREI DINGE, DIE SIE ABSICHTLICH TUT:
 *  1. Sie sagt, WAS dort entstünde und WORAUS — dieselbe Ehrlichkeit wie die
 *    Schranke in Kapitel 10 der Leseansicht. Weglassen wäre bequemer und
 *    würde verschweigen, dass es die Sache gibt.
 *  2. Sie nennt KEINEN PREIS (§1.11 d, bis BS1 Z1): an der Schranke steht ein
 *     Gespräch, keine Zahl.
 *  3. Sie ist eine EIGENE Komponente, weil dieselbe Fläche dreimal auf einer
 *     Seite steht (Tokens, Zeichen, Lizenzen) — drei Kopien wären drei
 *     Stellen, an denen der CTA später auseinanderläuft.
 */
defineProps<{
  /** Was hier stünde — „Design-Tokens", „Zeichen", „Lizenzen". */
  what: string
}>()
</script>

<template>
  <div class="mt-4 rounded-2xl px-6 py-7" style="background: var(--bw-surface)">
    <div class="flex items-start gap-3">
      <UIcon name="i-ph-lock-simple" class="mt-0.5 size-5 flex-none" style="color: var(--bw-muted)" />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium" style="color: var(--bw-ink-soft)">Kommt mit Brand Design</p>
        <p class="mt-1.5 max-w-2xl text-sm leading-relaxed" style="color: var(--bw-muted)">
          {{ what }} entstehen aus eurer Farbwelt, eurem Schriftpaar und eurem Zeichen — die werden im Brand Design entschieden. Bis dahin liefert das Kit alles Übrige: Brand Context, Pressekit, Bündel.
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <UButton label="Erstgespräch buchen" trailing-icon="i-ph-arrow-right" class="rounded-full" />
          <UButton to="/brand/demo/design/dna" label="Brand Design ansehen" color="neutral" variant="ghost" class="rounded-full" />
        </div>
      </div>
    </div>
  </div>
</template>
