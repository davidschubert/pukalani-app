<script setup lang="ts">
/**
 * DER BRAND-CHECK-TEASER — die Karte, die auf `/brand-check` verweist
 * (Konzept: docs/archiv/BRAND-CHECK-SEITE.md §1 „Teaser werden Teaser").
 *
 * ── DAS FORMULAR LEBT GENAU EINMAL ────────────────────────────────────────
 * Bis 2026-09-05 trug die Startseite den Check selbst (`BwBrandCheckForm
 * source="home"`), About und Team gar nichts. Drei Einstiege mit drei
 * Zuständen (läuft · Fehler · Weiterleitung) sind dreimal dieselbe Erklärung
 * an drei Stellen — und die SEO-Seite des Instruments gäbe es trotzdem nicht.
 * Seither steht das Formular NUR auf `/brand-check`; hier steht die
 * Einladung dorthin.
 *
 * ── DIE VORSCHAU IST EIN BEISPIEL, KEIN ERGEBNIS ──────────────────────────
 * Der Ring zeigt einen erfundenen Wert und sagt das auch („Beispiel"). Ein
 * Ring ohne dieses Etikett läse sich wie ein Urteil über den Betrachter, und
 * ein leerer Ring (0) wie ein sehr schlechtes. Die drei Balken darunter sind
 * dieselbe Darstellung wie auf der Ergebnisseite — sie zeigen, was einen
 * erwartet, ohne etwas zu behaupten.
 */
defineProps<{
  /** Welche Seite den Klick gebracht hat — dieselbe Kennzeichnung wie beim
   *  Formular und bei der Warteliste (`source`). Sie steht als
   *  `data-check-teaser` am Abschnitt: ein Haken für die Auswertung, kein
   *  Query-Anhängsel an der indexierbaren Adresse. */
  source: string
}>()

const { t } = useI18n()
const localePath = useLocalePath()

/** Beispiel-Werte: ein Wert im mittleren Band und drei Kategorien darunter.
 *  Bewusst FEST — eine Animation oder Zufallszahlen suggerierten Messung. */
const SAMPLE_SCORE = 72
const SAMPLE_BARS = [
  { key: 'distinctiveness', percent: 80 },
  { key: 'consistency', percent: 62 },
  { key: 'craft', percent: 45 },
] as const
</script>

<template>
  <section
    class="bw-card grid items-center gap-10 p-10 @lg:grid-cols-[minmax(0,1fr)_20rem] @lg:p-14"
    :data-check-teaser="source"
  >
    <div class="min-w-0">
      <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('brand.checkPage.teaser.eyebrow') }}</p>
      <h2 class="mt-3 max-w-lg text-balance text-3xl font-extralight leading-snug tracking-tight sm:text-4xl">
        {{ t('brand.checkPage.teaser.title') }}
      </h2>
      <p class="mt-4 max-w-lg text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.checkPage.teaser.body') }}</p>
      <div class="mt-7">
        <UButton
          :label="t('brand.checkPage.teaser.cta')" :to="localePath('/brand-check')"
          size="lg" color="neutral" class="rounded-full" trailing-icon="i-ph-arrow-right"
          data-check-teaser-cta
        />
      </div>
    </div>

    <!-- Die Vorschau: Ring + drei Kategorie-Balken, wie auf der Ergebnisseite. -->
    <div class="bw-frame p-6" style="background: var(--bw-surface-hi)">
      <div class="flex items-center gap-5">
        <BwScoreRing :value="SAMPLE_SCORE" :size="76" />
        <div class="min-w-0">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('brand.checkPage.teaser.sampleLabel') }}</p>
          <p class="mt-1 text-sm tracking-tight">{{ t('brand.check.bands.strong') }}</p>
        </div>
      </div>
      <ul class="mt-6 space-y-3">
        <li v-for="bar in SAMPLE_BARS" :key="bar.key">
          <p class="bw-label" style="color: var(--bw-muted)">{{ t(`brand.check.categories.${bar.key}`) }}</p>
          <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full" style="background: var(--bw-line)">
            <div class="h-full rounded-full" :style="`inline-size: ${bar.percent}%; background: var(--bw-accent)`" />
          </div>
        </li>
      </ul>
      <p class="bw-label mt-5 leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.checkPage.teaser.sampleNote') }}</p>
    </div>
  </section>
</template>
