<script setup lang="ts">
import { brandAccentInk } from '../../shared/brandDesign'
import type { BrandSceneColors, BrandSceneFonts, BrandSceneMotion } from '../../shared/brandDesignScene'
import { BRAND_RAMP_SHADES, type BrandRamp } from '../../shared/types/brand'

/**
 * DIE ANWENDUNGS-SZENE (Konzept docs/archiv/BRAND-DESIGN.md §2.9,
 * Entscheidung §1.11 c, Paket D2c).
 *
 * EINE Komponente, sechs Zustände: dieselbe Szene ist die Vorschau in JEDEM
 * Kapitel (Moodboard, Farbwelt, Typografie, Zeichen, Bildsprache, Bewegung).
 * Sie zeigt einen AUSSCHNITT einer Anwendung — Kopf mit Wortmarke,
 * Überschrift, Fließtext, Knopf, Zitat, Karte, Rampen-Streifen —, weil
 * Menschen an Swatches nicht entscheiden können (H1, und der Marktbefund
 * Realtime Colors). Übernommen aus dem freigegebenen Prototyp
 * (`.playground/app/components/FdDesignScene.vue`): dieselbe Optik, aber mit
 * den Typen des Layers (`shared/brandDesignScene.ts`) und mit Texten aus
 * i18n statt der Kailua-Prosa des Dummys — die Szene steht in JEDER Marke.
 *
 * ── ALLES LOKAL, KEIN `:root`, KEINE IFRAMES ──────────────────────────────
 * Sämtliche Farben und Schriften leben als `--ds-*` am WURZELKNOTEN DIESER
 * Szene. Drei Szenen nebeneinander sind deshalb drei `<div>` und nicht drei
 * Dokumente; das Theme der Werkstatt daneben bleibt unberührt. Das Muster ist
 * von `BwDirectionCard` (G4) übernommen — der Unterschied ist, dass hier die
 * ECHTEN Schriften geladen sind (s. `app/assets/css/brand-fonts.css`).
 *
 * ── HELL UND DUNKEL SIND ZWEI RAMPEN, EIN SCHALTER ────────────────────────
 * Jede Szene trägt ihren eigenen Umschalter: eine Farbwelt, die man nur hell
 * sieht, ist eine halbe Entscheidung. Der Schalter ist bewusst NICHT der
 * App-Modus der Werkstatt — die Bühne bleibt hell, während die Szene dunkel
 * zeigt.
 *
 * ── BEI FESTEM SCHEMA IST DER UMSCHALTER KEIN BUTTON ──────────────────────
 * Die Szene steckt dann oft in einer Karte, die selbst ein `<button>` ist
 * (Moodboards, Kandidaten). Ein Button im Button ist ungültiges HTML: der
 * Browser schliesst beim Parsen den äusseren, und die Hydration findet einen
 * anderen Baum vor (2026-09-08 live erwischt). Deshalb rendert `scheme`
 * gesetzt ein `<span aria-hidden>` — nicht „aufräumen".
 *
 * ── BEWEGUNG IST OPTIONAL UND EHRLICH ─────────────────────────────────────
 * `motion` setzt Dauer, Easing und Versatz als lokale Variablen; ohne das
 * Prop bewegt sich nichts. Bei `prefers-reduced-motion: reduce` (oder wenn
 * die Bewegungs-Seite es simuliert) spielt die Szene NICHTS ab und schreibt
 * die Werte stattdessen als Text hin — genau die Regel, die das Kapitel
 * beschliesst (§2.7).
 */

const props = withDefaults(defineProps<{
  colors: BrandSceneColors
  fonts: BrandSceneFonts
  motion?: BrandSceneMotion | null
  /** Dreier-Vergleich: kleinere Schrift, weniger Bausteine. */
  compact?: boolean
  /** Der Name im Kopf der Szene; leer = der Platzhalter aus i18n. */
  wordmark?: string
  /** Leer = die Vorgabe-Überschrift aus i18n. */
  heading?: string
  /** Erzwungener Modus (Vergleiche zeigen alle drei gleich). */
  scheme?: 'light' | 'dark' | null
  /** Jede Änderung spielt die Übergänge einmal ab (Bewegungs-Kapitel). */
  playKey?: number
  /** Simulation des Systemschalters — zeigt den Text-Zustand. */
  simulateReducedMotion?: boolean
}>(), {
  motion: null,
  compact: false,
  wordmark: '',
  heading: '',
  scheme: null,
  playKey: 0,
  simulateReducedMotion: false,
})

const { t } = useI18n()

const wordmarkText = computed(() => props.wordmark.trim() || t('brand.scene.wordmarkFallback'))
const headingText = computed(() => props.heading.trim() || t('brand.scene.heading'))

const localScheme = ref<'light' | 'dark'>('light')
const scheme = computed<'light' | 'dark'>(() => props.scheme ?? localScheme.value)
const dark = computed(() => scheme.value === 'dark')

/** Der aktive Streifen — hell und dunkel sind zwei getrennte Rampen (§2.3). */
const ramp = computed<BrandRamp>(() => (dark.value ? props.colors.rampDark : props.colors.rampLight))

/**
 * Die Schriftfarbe AUF dem Akzent wird gerechnet, nicht gesetzt: sonst steht
 * in der Vorschau ein Knopf, dessen Beschriftung niemand lesen kann — und
 * genau das soll das Kapitel ja verhindern.
 */
const accentInk = computed(() => brandAccentInk(
  props.colors.accent,
  props.colors.paper,
  ramp.value[950],
))

const vars = computed(() => {
  const n = props.colors.neutral
  const r = ramp.value
  const scale = props.fonts.scale ?? 1
  const parts = [
    `--ds-bg: ${dark.value ? n[950] : props.colors.paper}`,
    `--ds-surface: ${dark.value ? n[900] : n[100]}`,
    `--ds-line: ${dark.value ? n[800] : n[200]}`,
    `--ds-ink: ${dark.value ? n[50] : r[900]}`,
    `--ds-ink-soft: ${dark.value ? n[300] : r[700]}`,
    `--ds-brand: ${dark.value ? r[400] : r[600]}`,
    `--ds-accent: ${props.colors.accent}`,
    `--ds-accent-ink: ${accentInk.value}`,
    `--ds-font-heading: ${props.fonts.headingStack}`,
    `--ds-font-body: ${props.fonts.bodyStack}`,
    `--ds-heading-weight: ${props.fonts.headingWeight ?? 400}`,
    `--ds-heading-tracking: ${props.fonts.headingTracking ?? 0}px`,
    `--ds-heading-transform: ${props.fonts.headingUppercase ? 'uppercase' : 'none'}`,
    `--ds-h1: ${(props.compact ? 1.35 : 2.1) * scale}rem`,
    `--ds-dur: ${props.motion ? props.motion.duration : 0}ms`,
    `--ds-ease: ${props.motion ? props.motion.easing : 'linear'}`,
    `--ds-stagger: ${props.motion ? props.motion.stagger : 0}ms`,
  ]
  return parts.join('; ')
})

/* ECHTES `prefers-reduced-motion` — nur im Browser messbar, deshalb erst
 * onMounted. Der SSR-Stand ist „keine Reduktion", und das ist der ehrlichere
 * Ausgangswert: eine Szene, die serverseitig Bewegung verspricht und im
 * Browser stillsteht, ist besser als umgekehrt. */
const systemReduced = ref(false)
onMounted(() => {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  systemReduced.value = query.matches
  query.addEventListener('change', event => { systemReduced.value = event.matches })
})
const reduced = computed(() => props.simulateReducedMotion || systemReduced.value)

/* Abspielen: ein Zähler von aussen, eine Klasse für die Dauer der Animation.
 * Ohne das Entfernen der Klasse liefe der zweite Klick ins Leere (die
 * Animation wäre schon beendet und würde nicht neu starten). */
const playing = ref(false)
let playTimer: ReturnType<typeof setTimeout> | undefined
watch(() => props.playKey, () => {
  if (!props.motion || reduced.value) return
  playing.value = false
  clearTimeout(playTimer)
  window.requestAnimationFrame(() => {
    playing.value = true
    playTimer = setTimeout(() => { playing.value = false }, props.motion!.duration * 2 + props.motion!.stagger * 3)
  })
})
onBeforeUnmount(() => clearTimeout(playTimer))
</script>

<template>
  <div
    class="ds-scene bw-frame overflow-hidden"
    :class="[compact ? 'ds-scene--compact' : '', playing ? 'ds-scene--play' : '', motion && !reduced ? 'ds-scene--motion' : '']"
    :style="vars"
  >
    <!-- Kopf: Wortmarke in der Überschriften-Schrift, rechts der Umschalter. -->
    <div class="ds-head flex items-center gap-3 px-5 py-3">
      <span class="ds-mark min-w-0 truncate">{{ wordmarkText }}</span>
      <span class="ds-nav ms-auto hidden items-center gap-4 sm:flex">
        <span>{{ t('brand.scene.nav1') }}</span>
        <span>{{ t('brand.scene.nav2') }}</span>
        <span>{{ t('brand.scene.nav3') }}</span>
      </span>
      <!-- Bei FESTEM Schema ist der Umschalter kein <button> — s. Kopf
           (Button im Button, Hydration-Mismatch am 2026-09-08). -->
      <span v-if="props.scheme !== null" class="ds-toggle ds-toggle--fixed" aria-hidden="true">
        <UIcon :name="dark ? 'i-ph-sun' : 'i-ph-moon'" class="size-3.5" />
      </span>
      <button
        v-else
        type="button" class="ds-toggle" :aria-pressed="dark"
        :aria-label="dark ? t('brand.scene.toggleToLight') : t('brand.scene.toggleToDark')"
        @click="localScheme = dark ? 'light' : 'dark'"
      >
        <UIcon :name="dark ? 'i-ph-sun' : 'i-ph-moon'" class="size-3.5" />
      </button>
    </div>

    <!-- Hero -->
    <div class="px-5 pb-5 pt-4">
      <p class="ds-eyebrow">{{ t('brand.scene.eyebrow') }}</p>
      <h3 class="ds-h1 mt-2">{{ headingText }}</h3>
      <p class="ds-body mt-3">{{ t('brand.scene.body') }}</p>
      <div class="mt-4 flex flex-wrap items-center gap-3">
        <span class="ds-button">{{ t('brand.scene.button') }}</span>
        <span class="ds-link">{{ t('brand.scene.link') }}</span>
      </div>

      <!-- Karte + Zitat: die zwei Flächen, an denen man Grund und Kontrast
           beurteilt (im Vergleich bleibt nur die Karte). -->
      <div class="mt-5 grid gap-3" :class="compact ? '' : 'sm:grid-cols-2'">
        <div class="ds-card ds-anim" style="--ds-i: 0">
          <p class="ds-card-title">{{ t('brand.scene.cardTitle') }}</p>
          <p class="ds-card-text">{{ t('brand.scene.cardText') }}</p>
          <p class="ds-meta">{{ t('brand.scene.cardMeta') }}</p>
        </div>
        <blockquote v-if="!compact" class="ds-quote ds-anim" style="--ds-i: 1">
          {{ t('brand.scene.quote') }}
        </blockquote>
      </div>

      <!-- Der Rampen-Streifen: elf Stufen der AKTIVEN Welt. -->
      <div class="mt-5 flex overflow-hidden rounded-full">
        <span
          v-for="shade in BRAND_RAMP_SHADES" :key="shade"
          class="h-3 flex-1" :style="`background: ${ramp[shade]}`"
          :title="`${shade} · ${ramp[shade]}`"
        />
      </div>
      <p v-if="motion && reduced" class="ds-meta mt-3">
        {{ t('brand.scene.reducedMotion', { duration: motion.duration, easing: motion.easing, stagger: motion.stagger }) }}
      </p>
    </div>
  </div>
</template>

<style scoped>
/* Alles hier liest NUR `--ds-*`. Keine bw-Token in der Szene: sie soll
 * aussehen wie die Marke, nicht wie die Werkstatt. */
.ds-scene {
  background: var(--ds-bg);
  color: var(--ds-ink);
  font-family: var(--ds-font-body);
  box-shadow: inset 0 0 0 1px var(--ds-line);
}
.ds-head { border-bottom: 1px solid var(--ds-line); }
.ds-mark {
  font-family: var(--ds-font-heading);
  font-weight: var(--ds-heading-weight);
  letter-spacing: var(--ds-heading-tracking);
  text-transform: var(--ds-heading-transform);
  font-size: 1rem;
  color: var(--ds-ink);
}
.ds-nav { font-size: 0.75rem; color: var(--ds-ink-soft); }
.ds-toggle {
  display: grid; place-items: center;
  width: 1.75rem; height: 1.75rem; border-radius: 999px;
  color: var(--ds-ink-soft); background: var(--ds-surface);
}
.ds-toggle--fixed { opacity: 0.4; cursor: default; display: inline-flex; }
.ds-eyebrow { font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ds-ink-soft); }
.ds-h1 {
  font-family: var(--ds-font-heading);
  font-weight: var(--ds-heading-weight);
  letter-spacing: var(--ds-heading-tracking);
  text-transform: var(--ds-heading-transform);
  font-size: var(--ds-h1);
  line-height: 1.15;
}
.ds-body { font-size: 0.9rem; line-height: 1.6; color: var(--ds-ink-soft); max-width: 34rem; }
.ds-scene--compact .ds-body { font-size: 0.8rem; }
.ds-button {
  display: inline-block; border-radius: 999px;
  padding: 0.45rem 1.1rem; font-size: 0.8rem;
  background: var(--ds-accent); color: var(--ds-accent-ink);
  transition: transform var(--ds-dur) var(--ds-ease), filter var(--ds-dur) var(--ds-ease);
}
.ds-scene--motion .ds-button:hover { transform: translateY(-2px); filter: brightness(1.06); }
.ds-link { font-size: 0.8rem; color: var(--ds-brand); text-decoration: underline; text-underline-offset: 3px; }
.ds-card { border-radius: 14px; padding: 0.9rem 1rem; background: var(--ds-surface); box-shadow: inset 0 0 0 1px var(--ds-line); }
.ds-card-title { font-family: var(--ds-font-heading); font-size: 0.95rem; }
.ds-card-text { margin-top: 0.35rem; font-size: 0.8rem; line-height: 1.5; color: var(--ds-ink-soft); }
.ds-meta { margin-top: 0.5rem; font-size: 0.75rem; color: var(--ds-brand); font-variant-numeric: tabular-nums; }
.ds-quote {
  border-inline-start: 2px solid var(--ds-accent);
  padding-inline-start: 0.9rem;
  font-family: var(--ds-font-heading);
  font-size: 0.95rem; line-height: 1.45;
}

/* Die Einblendung spielt nur auf Zuruf (`playKey`) — eine Szene, die bei
 * jedem Rendern wackelt, ist im Vergleich dreier Boards unbrauchbar. */
.ds-scene--play .ds-anim {
  animation: ds-rise var(--ds-dur) var(--ds-ease) both;
  animation-delay: calc(var(--ds-i, 0) * var(--ds-stagger));
}
@keyframes ds-rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .ds-scene--play .ds-anim { animation: none; }
  .ds-scene--motion .ds-button { transition: none; }
  .ds-scene--motion .ds-button:hover { transform: none; filter: none; }
}
</style>
