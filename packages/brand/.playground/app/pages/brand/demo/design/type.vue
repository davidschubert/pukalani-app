<script setup lang="ts">
import {
  DS_BRAND,
  DS_FONT_PAIRS,
  DS_MONO_STACK,
  DS_TYPE_SCALES,
  dsFontPair,
  dsSceneColors,
  dsSceneFonts,
} from '../../../../utils/demoDesign'

/**
 * KAPITEL „TYPOGRAFIE" (Konzept docs/archiv/BRAND-DESIGN.md §2.4, Prototyp-
 * Screen 3) — Paar-Karten mit ECHTEN Schriften, Specimen, Regeln mit
 * Live-Wirkung.
 *
 * DER UNTERSCHIED ZU G4 STEHT UND FÄLLT MIT DEN SCHRIFTEN: der
 * Richtungs-Katalog zeigt bewusst nur den Rückfall-Stack („eine Richtung,
 * kein Rendering-Beweis"). Hier wird eine Schrift ENTSCHIEDEN — also müssen
 * die sieben Familien geladen sein (`app/assets/css/demo-fonts.css`, §2.17).
 * Sieht das Specimen unten nach Georgia und Arial aus, fehlt die Deklaration
 * und nicht der Geschmack.
 *
 * NICHT JEDE FAMILIE HAT JEDEN SCHNITT: PT Sans und PT Serif gibt es nur in
 * 400 und 700. Ein Gewicht dazwischen fälscht der Browser — deshalb steht am
 * Regler ein Hinweis statt einer stillen Näherung.
 */
const pairId = ref('editorial')
const scaleId = ref('calm')
const headingWeight = ref(400)
const headingTracking = ref(0)
const headingUppercase = ref(false)

const WEIGHTS = [400, 500, 600, 700] as const
const TRACKINGS = [-2, -1, 0, 2, 4] as const
/** Familien mit nur zwei Schnitten — der Hinweis am Regler hängt daran. */
const TWO_WEIGHT_FAMILIES = ['PT Sans', 'PT Serif']

const pair = computed(() => dsFontPair(pairId.value))
const scale = computed(() => DS_TYPE_SCALES.find(entry => entry.id === scaleId.value) ?? DS_TYPE_SCALES[0]!)
const scaleFactor = computed(() => (scaleId.value === 'dense' ? 0.85 : scaleId.value === 'loud' ? 1.25 : 1))

const fonts = computed(() => dsSceneFonts(pairId.value, {
  headingWeight: headingWeight.value,
  headingTracking: headingTracking.value,
  headingUppercase: headingUppercase.value,
  scale: scaleFactor.value,
}))

const colors = dsSceneColors(DS_BRAND.palette.roast, DS_BRAND.palette.palm, DS_BRAND.palette.roast)

const headingStyle = computed(() => [
  `font-family: ${pair.value.headingStack}`,
  `font-weight: ${headingWeight.value}`,
  `letter-spacing: ${headingTracking.value}px`,
  `text-transform: ${headingUppercase.value ? 'uppercase' : 'none'}`,
].join('; '))

const weightWarning = computed(() =>
  TWO_WEIGHT_FAMILIES.includes(pair.value.headingFamily) && headingWeight.value !== 400 && headingWeight.value !== 700)
</script>

<template>
  <FdDesignWorkspace chapter="type">
    <!-- ── i.pair ───────────────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Schriftpaar</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">i.pair · sechs kuratierte Paare</span>
      </div>
      <p class="bw-doc-text mt-2">
        Zwei Rollen, Text und Überschrift — die Mono ist fix und gehört Herkunft und Preisen. Alle Familien sind selbst gehostet; hier lädt nichts von einem fremden Server.
      </p>

      <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <button
          v-for="entry in DS_FONT_PAIRS" :key="entry.id"
          type="button"
          class="bw-choice-card rounded-2xl p-4 text-left"
          :class="pairId === entry.id ? 'bw-choice-card--selected' : ''"
          :aria-pressed="pairId === entry.id"
          @click="pairId = entry.id"
        >
          <span class="flex items-start justify-between gap-2">
            <span class="text-sm font-medium">{{ entry.name }}</span>
            <UIcon v-if="pairId === entry.id" name="i-ph-check-circle-fill" class="mt-0.5 size-4 flex-none" style="color: var(--bw-accent)" />
          </span>
          <span class="mt-3 block text-[22px] leading-tight" :style="`font-family: ${entry.headingStack}`">
            Kailua Coffee Co.
          </span>
          <span class="mt-1.5 block text-sm leading-relaxed" :style="`font-family: ${entry.bodyStack}`">
            Eine Sorte pro Saison — mit Ort, Monat und Namen.
          </span>
          <span class="bw-label mt-3 block" style="color: var(--bw-muted)">{{ entry.headingFamily }} · {{ entry.bodyFamily }}</span>
          <span class="mt-1 block text-sm" style="color: var(--bw-ink-soft)">{{ entry.note }}</span>
        </button>
      </div>
    </section>

    <!-- ── i.scale ──────────────────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Hierarchie</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">i.scale · {{ scale.ratio }}</span>
      </div>
      <p class="bw-doc-text mt-2">Wie weit Überschrift und Text auseinanderliegen — hergeleitet aus DNA „Komposition".</p>
      <div class="mt-3 grid gap-3 sm:grid-cols-3">
        <button
          v-for="entry in DS_TYPE_SCALES" :key="entry.id"
          type="button"
          class="bw-choice-card rounded-2xl p-3 text-left"
          :class="scaleId === entry.id ? 'bw-choice-card--selected' : ''"
          :aria-pressed="scaleId === entry.id"
          @click="scaleId = entry.id"
        >
          <span class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium">{{ entry.label }}</span>
            <span class="bw-label" style="color: var(--bw-muted)">{{ entry.ratio }}</span>
          </span>
          <span class="mt-1 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ entry.note }}</span>
        </button>
      </div>
    </section>

    <!-- ── i.rules + Specimen ───────────────────────────────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Schrift-Regeln</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">i.rules · Wirkung sofort im Specimen</span>
      </div>

      <div class="mt-3 flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="bw-label w-32 flex-none" style="color: var(--bw-muted)">Überschrift-Gewicht</span>
          <button
            v-for="weight in WEIGHTS" :key="weight"
            type="button" class="bw-chip" :class="headingWeight === weight ? 'bw-chip--selected' : ''"
            :aria-pressed="headingWeight === weight" @click="headingWeight = weight"
          >{{ weight }}</button>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="bw-label w-32 flex-none" style="color: var(--bw-muted)">Laufweite</span>
          <button
            v-for="tracking in TRACKINGS" :key="tracking"
            type="button" class="bw-chip" :class="headingTracking === tracking ? 'bw-chip--selected' : ''"
            :aria-pressed="headingTracking === tracking" @click="headingTracking = tracking"
          >{{ tracking > 0 ? `+${tracking}` : tracking }} px</button>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="bw-label w-32 flex-none" style="color: var(--bw-muted)">Versalien</span>
          <button
            type="button" class="bw-chip" :class="headingUppercase ? 'bw-chip--selected' : ''"
            :aria-pressed="headingUppercase" @click="headingUppercase = !headingUppercase"
          >{{ headingUppercase ? 'An' : 'Aus' }}</button>
          <span class="bw-label" style="color: var(--bw-muted)">Versalien sind eine Ausnahme, kein Stil — sie kosten Lesbarkeit.</span>
        </div>
        <p v-if="weightWarning" class="bw-label" style="color: var(--bw-draft)">
          {{ pair.headingFamily }} gibt es nur in 400 und 700 — das gewählte Gewicht fälscht der Browser. Nimm 400 oder 700 oder ein anderes Paar.
        </p>
      </div>

      <!-- DAS SPECIMEN: eine Fläche, vier Rollen. Es liest dieselben Regeln
           wie die Szene darunter — sonst hätte man zwei Wahrheiten. -->
      <div class="bw-card mt-4 p-7">
        <p class="bw-label" style="color: var(--bw-muted)">Specimen · {{ pair.name }} ({{ pair.headingFamily }} · {{ pair.bodyFamily }})</p>
        <h3 class="mt-4 leading-tight" :style="`${headingStyle}; font-size: ${2.6 * scaleFactor}rem`">
          Eine Sorte pro Saison
        </h3>
        <h4 class="mt-4 leading-tight" :style="`${headingStyle}; font-size: ${1.5 * scaleFactor}rem`">
          Kona · Juli 2026 · Farm Kealakekua
        </h4>
        <p class="mt-3 max-w-2xl text-base leading-relaxed" :style="`font-family: ${pair.bodyStack}`">
          Anbau, Röstung und Ausschank liegen in einer Hand — nicht als Effizienz-Idee, sondern weil sich sonst niemand mehr erinnert, wer welche Entscheidung getroffen hat. Was in der Kanne ist, hat einen Ort, einen Monat und einen Namen.
        </p>
        <p class="mt-4 text-sm" :style="`font-family: ${DS_MONO_STACK}`">
          1 kg 38,00 € · 250 g 11,50 € · Ernte 07/2026 · 1 200 m
        </p>
        <p class="bw-label mt-4" style="color: var(--bw-muted)">
          Mono ist FIX (Themes-Regel „maximal drei Schriften") und trägt Herkunft, Preise und Zahlen.
        </p>
      </div>
    </section>

    <!-- Die Szene mit derselben Typografie. -->
    <section>
      <h2 class="text-xl font-medium">In der Anwendung</h2>
      <div class="mt-3">
        <FdDesignScene :colors="colors" :fonts="fonts" />
      </div>
    </section>
  </FdDesignWorkspace>
</template>
