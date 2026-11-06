<script setup lang="ts">
/**
 * NuxtLink kommt EXPLIZIT aus `#components` (nicht als Zeichenkette an
 * `<component :is>`): Nuxt registriert seine Komponenten beim ÜBERSETZEN, nicht
 * zur Laufzeit über `app.component()` — `:is="'NuxtLink'"` findet deshalb
 * nichts und rendert ein nacktes `<nuxtlink>`-Element, das aussieht wie die
 * Kachel und kein Link ist (im Browser-Beweis genau so erwischt).
 */
import { NuxtLink } from '#components'

/** "Meine Brands"-Karte (§3d): ruhig, kein Datengrid. Seit Runde 118
 *  wie die Discover-Kacheln: quadratisches Farbwelt-Bild mit der
 *  Wortmarke mittig, Details darunter auf der Freifläche. */
const props = withDefaults(defineProps<{
  title: string
  path: string
  flag?: string
  step: string
  progress: string
  remaining: string
  edited: string
  pct: number
  activity?: number[]
  score?: number
  /** Farbwelt der Brand: [hell, mittel, dunkel]. */
  gradient?: [string, string, string]
  /* Runde 35 (David): der „Euer Branding"-Einstieg wohnt AN DER KACHEL —
   * gesperrt (ausgegraut, Schloss), bis die Brand Foundation abgeschlossen
   * ist; erst dann aktiv mit Score und Pfeil. Bewusst kein 100%-Gate:
   * Monitoring läuft dauerhaft, „alles fertig" träte nie ein. */
  resultTo?: string
  resultReady?: boolean
  /**
   * ZIEL DER KARTE — und der Grund, warum es dieses Prop gibt (Audit C3).
   *
   * Auf der echten Übersicht steckte die GANZE Karte in einem `NuxtLink`.
   * Darin sitzen aber ein Dropdown-Auslöser, „Weiterarbeiten" und der
   * Ergebnis-Knopf: ein `button` im `a` ist ungültiges Markup, Screenreader
   * bekommen den Anker mit dem Knopf-Inhalt vorgelesen, und jeder Klick, dem
   * ein `.stop` fehlte, navigierte NEBENBEI zur Werkstatt.
   *
   * Mit `to` verlinkt nur noch die Kachel (die den Titel trägt) und der
   * „Weiterarbeiten"-Knopf; die Aktionszeile bleibt ausserhalb des Ankers.
   * OHNE `to` verhält sich die Komponente Zeichen für Zeichen wie vorher —
   * der Klickdummy wickelt sie weiter selbst ein und bleibt unangetastet.
   */
  to?: string
}>(), {
  flag: undefined,
  activity: undefined,
  score: undefined,
  gradient: () => ['#e6e5e2', '#b8b7b3', '#4a4a47'],
  resultTo: undefined,
  resultReady: false,
  to: undefined,
})
const bg = computed(() => `background: linear-gradient(165deg, ${props.gradient[0]} 0%, ${props.gradient[1]} 45%, ${props.gradient[2]} 100%)`)
/* Die Karten-TEXTE reicht die Seite bereits übersetzt herein (`step`,
 * `progress`, `remaining`, `edited`); übrig blieben das Aktionen-Menü und
 * der Knopf — die laufen seit 2026-09-01 ebenfalls über i18n. */
const { t } = useI18n()
const actions = computed(() => [[
  { label: t('brand.brands.card.rename'), icon: 'i-ph-pencil-simple' },
  { label: t('brand.brands.card.share'), icon: 'i-ph-share-network' },
  { label: t('brand.brands.card.delete'), icon: 'i-ph-trash' },
]])
</script>

<template>
  <div class="bw-root group">
    <!-- Mit `to` ist die Kachel der Link (sie trägt den Titel), ohne `to`
         bleibt sie ein schlichter Kasten — s. das Prop. -->
    <component :is="to ? NuxtLink : 'div'" :to="to" class="bw-tile relative block overflow-hidden" style="aspect-ratio: 1 / 1">
      <div class="absolute inset-0 transition-transform duration-300 group-hover:scale-[1.04]" :style="bg" />
      <p class="absolute inset-0 grid place-items-center p-6 text-center text-2xl font-extralight leading-snug tracking-tight" style="color: #f7f2ea; text-shadow: 0 1px 12px rgb(20 20 20 / 0.3)">{{ title }}</p>
    </component>
    <div class="mt-3 flex items-start justify-between gap-3">
      <p class="bw-label flex items-center gap-1.5" style="color: var(--bw-muted)">{{ path }}<UIcon v-if="flag" :name="flag" class="size-4 flex-none" /></p>
      <div class="flex flex-none items-center gap-2">
        <BwScoreRing v-if="score !== undefined" :value="score" :size="34" />
        <UDropdownMenu :items="actions">
          <UButton icon="i-ph-dots-three" color="neutral" variant="ghost" size="sm" :aria-label="t('brand.brands.card.actions')" />
        </UDropdownMenu>
      </div>
    </div>
    <div class="mt-2 flex items-end justify-between gap-3">
      <p class="bw-label" style="color: var(--bw-ink-soft)">{{ step }}</p>
      <BwSparkline v-if="activity" :values="activity" style="color: var(--bw-line-strong)" />
    </div>
    <!-- Runde 52 (David): dasselbe Fortschritts-Modul wie unten links im
         Wizard — Mono-Versal-Zeile, Prozent, horizontaler Balken. -->
    <div class="mt-3">
      <div class="flex items-baseline justify-between gap-3">
        <p class="bw-label uppercase tracking-wider" style="color: var(--bw-muted)">{{ progress }} · {{ remaining }}</p>
        <span class="bw-label uppercase tracking-wider">{{ pct }}&thinsp;%</span>
      </div>
      <div class="mt-2 h-1.5 overflow-hidden rounded-full" style="background: var(--bw-line)">
        <div class="h-full rounded-full" :style="`width: ${pct}%; background: var(--bw-accent)`" />
      </div>
    </div>
    <div class="mt-3 flex items-center justify-between">
      <span class="bw-label" style="color: var(--bw-muted)">{{ edited }}</span>
      <!-- Ohne `to` bleibt es der reine Knopf des Klickdummys (die Karte lag
           dort ohnehin in einem Link); mit `to` trägt er sein Ziel selbst. -->
      <UButton :to="to" size="sm" trailing-icon="i-ph-arrow-right" :label="t('brand.brands.card.continue')" color="neutral" variant="outline" class="rounded-full" style="background: var(--bw-surface-hi)" />
    </div>
    <!-- Runde 35: der Ergebnis-Einstieg (vorher Button in der Werkstatt-
         Spalte). Button statt NuxtLink, weil die Karte im Klickdummy selbst
         in einem Link steckt — kein a-in-a. -->
    <div v-if="resultTo" class="mt-3">
      <button
        v-if="resultReady" type="button"
        class="flex w-full items-center gap-3 rounded-full py-2.5 pl-2 pr-2 text-left text-sm"
        style="background: var(--bw-surface-hi); box-shadow: var(--bw-shadow-card)"
        @click.stop.prevent="void navigateTo(resultTo)"
      >
        <!-- Ohne Score das Sparkle, wie im Rail-Fuß (Audit C1): die echte
             Übersicht reicht heute keinen Score herein, und der Knopf stand
             sonst ohne führendes Zeichen da. -->
        <BwScoreRing v-if="score !== undefined" :value="score" :size="28" class="flex-none" />
        <span v-else class="grid size-7 flex-none place-items-center rounded-full" style="background: var(--bw-accent-soft)">
          <UIcon name="i-ph-sparkle" class="size-4" style="color: var(--bw-accent)" />
        </span>
        <span class="min-w-0 flex-1 font-medium">{{ t('brand.brands.card.result') }}</span>
        <span class="grid size-7 flex-none place-items-center rounded-full">
          <UIcon name="i-ph-arrow-right" class="size-4" style="color: var(--bw-ink-soft)" />
        </span>
      </button>
      <!-- Kein `aria-label` (Audit C7): auf einem rollenlosen `div` wirkt es
           nicht, und der Text stand daneben ohnehin schon. -->
      <div
        v-else class="flex w-full items-center gap-3 rounded-full py-2.5 pl-2 pr-2 text-sm"
        style="background: var(--bw-surface); color: var(--bw-muted)"
      >
        <span class="grid size-7 flex-none place-items-center rounded-full" style="background: var(--bw-surface-hi)">
          <UIcon name="i-ph-lock-simple" class="size-4" />
        </span>
        <span class="min-w-0 flex-1">{{ t('brand.brands.card.result') }}</span>
        <span class="bw-label flex-none pr-1">{{ t('brand.brands.card.resultLocked') }}</span>
      </div>
    </div>
  </div>
</template>
