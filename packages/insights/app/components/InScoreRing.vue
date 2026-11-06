<script setup lang="ts">
/**
 * DER SCORE-RING DIESES LAYERS (BI1 I3).
 *
 * ── WARUM ES IHN GIBT, OBWOHL `BwScoreRing` EXISTIERT ────────────────────
 * `BwScoreRing` gehört dem brand-Layer, und ein Produkt-Layer importiert
 * keinen anderen (CONCEPT A14). Im PROTOTYP war das kein Problem: die
 * `In*`-Komponenten nehmen den Ring als SLOT herein, und die Seite im
 * Playground — die den brand-Layer per `extends` hat — hat ihn gesetzt.
 *
 * Die SEITEN dieses Layers können das nicht. Sie liegen in `packages/insights`,
 * werden aber in `apps/branding` gerendert, wo `BwScoreRing` per Auto-Import
 * zufällig da wäre. „Zufällig da" ist genau die stille Kopplung, die CLAUDE.md
 * verbietet: in einer zweiten Brand-Site ohne den brand-Layer bliebe die Stelle
 * leer, ohne dass es jemand merkt. Also bekommt dieser Layer seinen EIGENEN
 * Ring — klein, ohne Katalog, ohne Band, ohne Verlauf.
 *
 * ── ER IST BEWUSST SCHLICHTER ───────────────────────────────────────────
 * Nur Kreis und Zahl. Alles, was den Ring des Wizards ausmacht (Beschriftung,
 * Farbwelt, Animation), ist Produkt-Sprache des Brand-Checks; hier steht er
 * neben einem redaktionellen Text und soll die Zahl zeigen, nicht die Marke
 * inszenieren. Der ZAHLENWERT ist derselbe — er kommt aus `brand_checks`
 * (Entscheidung 7: „keine zweite Skala").
 *
 * ── DER KREIS IST EIN SVG UND KEINE ANIMATION ───────────────────────────
 * `stroke-dasharray` auf einem Kreis: auf Server und Browser dasselbe Markup,
 * also kein Hydration-Unterschied und kein Nachrechnen beim Einblenden.
 */
const props = withDefaults(defineProps<{
  /** 0–100. Werte darüber oder darunter werden geklemmt, nicht gemeldet. */
  value: number
  size?: number
  /** Vorlesetext — ohne ihn ist der Ring für einen Screenreader eine Ziffer ohne Bedeutung. */
  label?: string
}>(), {
  size: 72,
  label: '',
})

const STROKE = 3
const RADIUS = 50 - STROKE / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const clamped = computed(() => Math.max(0, Math.min(100, Math.round(props.value))))
const dash = computed(() => `${(clamped.value / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`)

/**
 * Dieselbe Dreiteilung wie an den Kategorie-Balken in `InBrandProfile` — ein
 * zweiter Schwellenwert für dieselbe Skala wäre zwei Aussagen über dieselbe
 * Zahl.
 */
const tone = computed(() => (clamped.value >= 90
  ? 'var(--bw-accent)'
  : clamped.value >= 50 ? 'var(--bw-draft)' : 'var(--bw-stale)'))
</script>

<template>
  <div
    class="relative flex-none"
    :style="`width: ${size}px; height: ${size}px`"
    role="img"
    :aria-label="label || String(clamped)"
  >
    <svg viewBox="0 0 100 100" class="size-full -rotate-90">
      <circle
        cx="50" cy="50" :r="RADIUS" fill="none"
        stroke="currentColor" :stroke-width="STROKE" class="opacity-20"
      />
      <circle
        cx="50" cy="50" :r="RADIUS" fill="none"
        :stroke="tone" :stroke-width="STROKE" stroke-linecap="round"
        :stroke-dasharray="dash"
      />
    </svg>
    <span
      class="absolute inset-0 grid place-items-center font-light tabular-nums"
      :style="`font-size: ${Math.round(size * 0.34)}px`"
      aria-hidden="true"
    >{{ clamped }}</span>
  </div>
</template>
