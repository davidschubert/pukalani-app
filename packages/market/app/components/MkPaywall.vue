<script setup lang="ts">
/**
 * PROTOTYP (M0) — Komponenten-Vorlage für M1–M4.
 *
 * DIE SCHRANKE (Plan §1.9, Davids Entscheidung 3 in §6).
 *
 * ── SIE IST VON TAG EINS SICHTBAR, NICHT VERSTECKT ───────────────────────
 * „Frei bauen, bezahlt anwenden": die Foundation ist der Trichter, der
 * Vergleich ist die Anwendung. Die Seite „Markt" existiert deshalb auch ohne
 * Zugang, zeigt was sie tut und nennt den Preis-Anker — heute „im
 * Erstgespräch", mit einem Preis, sobald es einen gibt. Eine Seite, die man
 * erst nach dem Kauf sieht, verkauft nichts.
 *
 * ── SIE SPERRT DEN KNOPF, NICHT DIE SEITE ────────────────────────────────
 * Kandidaten und Adressen darf man auch gesperrt pflegen: der Kunde soll
 * vorbereiten können, was er kauft. Gesperrt ist genau der LAUF — die
 * Handlung, die Geld kostet. Der Knopf steckt deshalb im Slot `action`, und
 * ob er klickbar ist, entscheidet die Seite.
 */
withDefaults(defineProps<{
  unlocked?: boolean
}>(), { unlocked: false })

const { t } = useI18n()
</script>

<template>
  <section
    class="bw-card p-5"
    :style="unlocked ? '' : 'background: var(--bw-surface)'"
  >
    <div class="flex items-start gap-3">
      <!-- Zustand nie nur über Farbe: Glyphe UND Überschrift sagen dasselbe. -->
      <UIcon
        :name="unlocked ? 'i-ph-lock-simple-open' : 'i-ph-lock-simple'"
        class="mt-0.5 size-5 flex-none"
        :style="`color: ${unlocked ? 'var(--bw-accent)' : 'var(--bw-ink-soft)'}`"
      />
      <div class="min-w-0 flex-1">
        <h2 class="text-base font-medium tracking-tight">
          {{ t(unlocked ? 'market.paywall.unlockedTitle' : 'market.paywall.title') }}
        </h2>
        <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ t(unlocked ? 'market.paywall.unlockedBody' : 'market.paywall.body') }}
        </p>

        <div v-if="!unlocked" class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span class="bw-label" style="color: var(--bw-ink)">{{ t('market.paywall.price') }}</span>
          <span class="bw-label" style="color: var(--bw-muted)">{{ t('market.paywall.beta') }}</span>
        </div>

        <div class="mt-4">
          <slot name="action" />
        </div>
      </div>
    </div>
  </section>
</template>
