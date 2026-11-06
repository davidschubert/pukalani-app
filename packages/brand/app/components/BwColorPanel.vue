<script setup lang="ts">
import { brandContrast, isBrandHex } from '../../shared/brandDesign'
import {
  brandColorPaper,
  brandColorRoleLabel,
  brandColorRoleNote,
  brandColorRoleSourceLabel,
  brandContrastLevelLabel,
  brandContrastPairLabel,
  brandNeutralOptionLabel,
  brandRatioText,
} from '../../shared/brandDesignColor'
import { BRAND_NEUTRAL_OPTIONS } from '../../shared/brandDesignVocab'
import { BRAND_RAMP_SHADES } from '../../shared/types/brand'

/**
 * DIE FARBWELT (Kapitel `color`, Konzept docs/archiv/BRAND-DESIGN.md §2.3,
 * Paket D3) — gebaut nach dem freigegebenen Prototyp
 * (`.playground/app/pages/brand/demo/design/color.vue`): Basisfarbe, Rampe
 * hell/dunkel mit zwei Szenen, Grundton, Akzent, Rollen, Kontrast-Matrix.
 *
 * ── HIER WIRD NICHTS BEHAUPTET ────────────────────────────────────────────
 * Rampe, getönter Grundton und jedes Kontrast-Urteil kommen aus der
 * Themes-Mathematik (`shared/brandDesign.ts`, der eine A14-Vertrag). Ein
 * Kandidat, der AA reisst, wird deshalb nicht „ausgegraut, weil es hübscher
 * aussieht" — er wird ausgegraut, weil die Zahl daneben es sagt. Und er steht
 * trotzdem in der Liste: eine Liste ohne den Durchfaller versteckt ihn.
 *
 * ── FRIDA REDET HIER NICHT ────────────────────────────────────────────────
 * Wie bei der Lesung und dem DNA-Vorschlag (D2b/D2c): kein Chat, kein Zug.
 * Dieser Abschnitt ist eine WERKBANK — der Mensch dreht an einer Farbe und
 * sieht sofort, was daraus folgt. Bestätigt wird jede der sechs Sessions wie
 * überall: auf der Karte in der Bühne.
 *
 * ── DIE KOMPONENTE ZEIGT, DIE SEITE ENTSCHEIDET ───────────────────────────
 * Sie schreibt keinen Slot. Jede Auswahl geht als `pick(slotId, value)` an die
 * Seite, und die ist die einzige Stelle mit `setSlotValue` + Autosave
 * (dieselbe Arbeitsteilung wie `BwDnaMixPanel`).
 *
 * ── ZWEI SZENEN STATT EINES UMSCHALTERS (Davids Entscheidung 2026-09-08) ──
 * Hell und dunkel stehen fest nebeneinander: ein Umschalter zeigt immer nur
 * eine Hälfte der Entscheidung. Unter jeder Szene das Text-auf-Grund-Paar
 * ihrer Welt, gerechnet aus denselben Rampen, die die Szene benutzt.
 */

const props = withDefaults(defineProps<{
  /** Sperrt JEDE Auswahl — solange das Kapitel abgeschlossen ist etwa. */
  disabled?: boolean
  /**
   * DIE BESTÄTIGTEN SESSIONS DIESES KAPITELS.
   *
   * Ein bestätigter Slot ist zu (`brandSlotControls`: „bestätigt schlägt
   * alles"), und die Tür zurück ist der Korrigieren-Knopf auf seiner Karte.
   * Diese Liste sperrt deshalb GENAU den Abschnitt, dessen Wert schon steht —
   * ein Klick, der stillschweigend nichts tut, wäre die schlechtere Antwort
   * als ein sichtbar gesperrter Knopf.
   */
  confirmed?: readonly string[]
}>(), { disabled: false, confirmed: () => [] })

const emit = defineEmits<{ pick: [slotId: string, value: string] }>()

const { t, locale } = useI18n()
const {
  base,
  neutral,
  accent,
  baseCandidates: rawBaseCandidates,
  accentCandidates,
  colors,
  fonts,
  roles,
  pairs,
  review,
  neutralPreview,
} = useBrandColorWorld()

/** Ist dieser Abschnitt zu? (gesperrtes Kapitel oder bestätigter Wert) */
function locked(slotId: string): boolean {
  return props.disabled || props.confirmed.includes(slotId)
}

function pick(slotId: string, value: string): void {
  if (locked(slotId)) return
  emit('pick', slotId, value)
}

/**
 * JEDER KANDIDAT MIT SEINEM URTEIL ALS TEXTFARBE auf SEINEM Papierton — das
 * Gate aus §2.3. Der Papierton ist der des KANDIDATEN, nicht der der aktuellen
 * Welt: jede Basisfarbe tönt ihre Neutral-Rampe selbst, und wer alle drei
 * gegen EINE Fläche misst, misst für zwei davon eine Fläche, die es in ihrer
 * Farbwelt nie geben wird.
 */
const baseCandidates = computed(() => rawBaseCandidates.value.map((candidate) => {
  const paper = brandColorPaper(candidate.hex, neutral.value)
  const verdict = paper ? brandContrast(candidate.hex, paper) : null
  return {
    ...candidate,
    verdict,
    blocked: verdict === null || verdict.level === 'fail' || verdict.level === 'AA18',
  }
}))

/**
 * FARB-PICKER UND HEX-FELD SIND EIN WERT (Davids Vorgabe 2026-09-08: „beides
 * muss gegeben sein").
 *
 * Das Feld spiegelt die wirksame Basisfarbe; jedes GÜLTIGE Hex darin wird zur
 * Entscheidung, jede unfertige Eingabe (`#4a`) bleibt liegen, ohne die Szene
 * zu leeren. Der Picker schreibt in dasselbe Feld — kein zweiter Zustand.
 */
const hexField = ref(base.value)
watch(base, (value) => {
  if (value.toLowerCase() !== hexField.value.trim().toLowerCase()) hexField.value = value
})
watch(hexField, (value) => {
  const next = value.trim().toLowerCase()
  if (isBrandHex(next) && next !== base.value) pick('h.base', next)
})

const pickerOpen = ref(false)
const pickerHex = computed<string>({
  get: () => base.value,
  set: (value) => { hexField.value = (value ?? '').toLowerCase() },
})

/** Icon-Farbe auf dem Picker-Knopf: hell auf dunkler Basis, sonst Tinte. */
function inkOn(hex: string): string {
  const ratio = brandContrast('#ffffff', hex)?.ratio ?? 0
  return ratio >= 3 ? '#ffffff' : 'var(--bw-ink)'
}

/**
 * DIE ZWEI WELTEN NEBENEINANDER — dieselben Paare, die die Szene benutzt
 * (`BwDesignScene`: hell = Rampe 900 auf Papier, dunkel = Neutral 50 auf
 * Neutral 950), hier nur benannt und mit dem WCAG-Urteil versehen.
 */
const schemeSides = computed(() => {
  const c = colors.value
  return ([
    { scheme: 'light' as const, label: t('brand.color.scheme.light'), ink: c.rampLight[900], ground: c.paper },
    { scheme: 'dark' as const, label: t('brand.color.scheme.dark'), ink: c.neutral[50], ground: c.neutral[950] },
  ]).map(side => ({ ...side, contrast: brandContrast(side.ink, side.ground) }))
})

/** Der Streifen einer Welt — hell und dunkel sind zwei getrennte Rampen. */
function rampHex(scheme: 'light' | 'dark', shade: number): string {
  const ramp = scheme === 'dark' ? colors.value.rampDark : colors.value.rampLight
  return ramp[shade as keyof typeof ramp]
}

const levelClass: Record<string, string> = {
  AAA: 'bw-state--confirmed',
  AA: 'bw-state--confirmed',
  AA18: 'bw-state--draft',
  fail: 'bw-state--stale',
}

function ratioText(ratio: number): string {
  return brandRatioText(ratio, locale.value)
}

function levelText(level: string): string {
  return brandContrastLevelLabel(level, locale.value)
}
</script>

<template>
  <section data-brand-color class="flex flex-col gap-8">
    <!-- ── h.base ─────────────────────────────────────────────────────── -->
    <div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.color.base.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.color.base.tag') }}</span>
      </div>
      <p class="bw-doc-text mt-2">{{ t('brand.color.base.intro') }}</p>

      <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <button
          v-for="entry in baseCandidates" :key="entry.id"
          type="button"
          class="bw-choice-card rounded-2xl p-4 text-left"
          :class="base === entry.hex ? 'bw-choice-card--selected' : ''"
          :aria-pressed="base === entry.hex"
          :disabled="locked('h.base') || entry.blocked"
          @click="pick('h.base', entry.hex)"
        >
          <span class="flex items-center gap-2.5">
            <span class="bw-swatch size-8 rounded-full" :style="`background: ${entry.hex}`" />
            <span class="min-w-0 leading-tight">
              <span class="block text-sm font-medium">{{ t(`brand.color.candidate.${entry.id}`) }}</span>
              <span class="bw-label block font-mono" style="color: var(--bw-muted)">{{ entry.hex }}</span>
            </span>
          </span>
          <span class="mt-2.5 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t(entry.reasonKey) }}</span>
          <span v-if="entry.verdict" class="bw-state mt-2.5" :class="levelClass[entry.verdict.level]">
            {{ t('brand.color.base.onPaper', { ratio: ratioText(entry.verdict.ratio), level: levelText(entry.verdict.level) }) }}
          </span>
          <span v-if="entry.blocked" class="bw-label mt-2 block" style="color: var(--bw-stale)">
            {{ t('brand.color.base.blocked') }}
          </span>
        </button>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <!-- Picker (Nuxt UI) + Hex-Feld: derselbe Wert, zwei Griffe. `bw-root`
             am Popover-Inhalt ist Pflicht — er teleportiert an den Body. -->
        <UPopover v-model:open="pickerOpen" :content="{ align: 'start' }" :ui="{ content: 'bw-root bw-overlay p-3' }">
          <button
            type="button" class="bw-swatch flex size-9 items-center justify-center rounded-full"
            :style="`background: ${pickerHex}`" :disabled="locked('h.base')"
            :aria-label="t('brand.color.base.pickerLabel')"
          >
            <UIcon name="i-ph-eyedropper" class="size-4" :style="`color: ${inkOn(pickerHex)}`" />
          </button>
          <template #content>
            <UColorPicker v-model="pickerHex" format="hex" :throttle="80" />
            <p class="bw-label mt-2 font-mono" style="color: var(--bw-muted)">{{ pickerHex }}</p>
          </template>
        </UPopover>
        <UInput
          v-model="hexField" size="sm" placeholder="#4a3123" :disabled="locked('h.base')"
          :aria-label="t('brand.color.base.hexLabel')"
          class="w-40" :ui="{ base: 'font-mono' }"
        />
        <span class="bw-label" style="color: var(--bw-muted)">{{ t('brand.color.base.hexHint') }}</span>
      </div>
    </div>

    <!-- ── h.ramp ─────────────────────────────────────────────────────── -->
    <div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.color.ramp.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.color.ramp.tag') }}</span>
      </div>
      <p class="bw-doc-text mt-2">{{ t('brand.color.ramp.intro') }}</p>

      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <div v-for="side in schemeSides" :key="`strip-${side.scheme}`">
          <p class="bw-label" style="color: var(--bw-muted)">{{ side.label }}</p>
          <div class="mt-2 flex overflow-hidden rounded-xl">
            <span
              v-for="shade in BRAND_RAMP_SHADES" :key="shade"
              class="h-10 flex-1"
              :style="`background: ${rampHex(side.scheme, shade)}`"
              :title="`${shade} · ${rampHex(side.scheme, shade)}`"
            />
          </div>
          <div class="mt-1 flex">
            <span
              v-for="shade in BRAND_RAMP_SHADES" :key="shade"
              class="bw-label flex-1 text-center" style="color: var(--bw-muted); font-size: 10px"
            >{{ shade }}</span>
          </div>
        </div>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <div v-for="side in schemeSides" :key="`scene-${side.scheme}`" class="min-w-0">
          <p class="bw-label" style="color: var(--bw-muted)">{{ side.label }}</p>
          <div class="mt-2">
            <BwDesignScene compact :colors="colors" :fonts="fonts" :scheme="side.scheme" />
          </div>
          <p class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" style="color: var(--bw-ink-soft)">
            <span
              class="bw-swatch size-4 flex-none rounded-full"
              :style="`background: ${side.ink}; box-shadow: inset 0 0 0 1px var(--bw-line-strong)`"
            />
            <span class="font-mono">{{ t('brand.color.ramp.pair', { ink: side.ink, ground: side.ground }) }}</span>
            <span v-if="side.contrast" class="bw-state" :class="levelClass[side.contrast.level]">
              {{ ratioText(side.contrast.ratio) }} · {{ levelText(side.contrast.level) }}
            </span>
          </p>
        </div>
      </div>
      <p class="bw-pending mt-3">{{ t('brand.color.ramp.note') }}</p>
    </div>

    <!-- ── h.neutral + h.accent ───────────────────────────────────────── -->
    <div class="grid gap-6 lg:grid-cols-2">
      <div>
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 class="text-xl font-medium">{{ t('brand.color.neutral.title') }}</h2>
          <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.color.neutral.tag') }}</span>
        </div>
        <p class="bw-doc-text mt-2">{{ t('brand.color.neutral.intro') }}</p>
        <div class="mt-3 flex flex-col gap-2">
          <button
            v-for="option in BRAND_NEUTRAL_OPTIONS" :key="option.id"
            type="button"
            class="bw-choice-card rounded-2xl p-3 text-left"
            :class="neutral === option.id ? 'bw-choice-card--selected' : ''"
            :aria-pressed="neutral === option.id"
            :disabled="locked('h.neutral')"
            @click="pick('h.neutral', option.id)"
          >
            <span class="flex items-center justify-between gap-2">
              <span class="text-sm font-medium">{{ brandNeutralOptionLabel(option.id, locale) }}</span>
              <UIcon
                v-if="neutral === option.id" name="i-ph-check-circle-fill"
                class="size-4 flex-none" style="color: var(--bw-accent)"
              />
            </span>
            <span class="mt-1 block text-sm" style="color: var(--bw-ink-soft)">{{ t(`brand.color.neutral.note.${option.id}`) }}</span>
            <span class="mt-2 flex overflow-hidden rounded-full">
              <span v-for="hex in neutralPreview(option.id)" :key="hex" class="h-2.5 flex-1" :style="`background: ${hex}`" />
            </span>
          </button>
        </div>
      </div>

      <div>
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 class="text-xl font-medium">{{ t('brand.color.accent.title') }}</h2>
          <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.color.accent.tag') }}</span>
        </div>
        <p class="bw-doc-text mt-2">{{ t('brand.color.accent.intro') }}</p>
        <div class="mt-3 flex flex-col gap-2">
          <button
            v-for="candidate in accentCandidates" :key="candidate.id"
            type="button"
            class="bw-choice-card rounded-2xl p-3 text-left"
            :class="accent === candidate.hex ? 'bw-choice-card--selected' : ''"
            :aria-pressed="accent === candidate.hex"
            :disabled="locked('h.accent') || candidate.tooClose"
            @click="pick('h.accent', candidate.hex)"
          >
            <span class="flex items-center gap-2.5">
              <span class="bw-swatch size-6 rounded-full" :style="`background: ${candidate.hex}`" />
              <span class="text-sm font-medium">{{ t(`brand.color.candidate.${candidate.id}`) }}</span>
              <span class="bw-label font-mono" style="color: var(--bw-muted)">{{ candidate.hex }}</span>
              <UIcon
                v-if="accent === candidate.hex" name="i-ph-check-circle-fill"
                class="ms-auto size-4 flex-none" style="color: var(--bw-accent)"
              />
            </span>
            <span class="mt-1.5 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t(candidate.reasonKey) }}</span>
            <span v-if="candidate.tooClose" class="bw-label mt-2 block" style="color: var(--bw-stale)">
              {{ t('brand.color.accent.tooClose') }}
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- ── h.roles ────────────────────────────────────────────────────── -->
    <div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.color.roles.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.color.roles.tag') }}</span>
      </div>
      <div class="mt-3 flex flex-col gap-2">
        <div
          v-for="role in roles" :key="role.id"
          class="bw-frame grid items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[2rem_10rem_10rem_minmax(0,1fr)]"
          style="background: var(--bw-surface)"
        >
          <span class="bw-swatch size-7 rounded-full" :style="`background: ${role.hex}`" />
          <p class="text-sm font-medium">{{ brandColorRoleLabel(role.id, locale) }}</p>
          <p class="bw-label" style="color: var(--bw-muted)">
            {{ brandColorRoleSourceLabel(role.source, locale) }} · <span class="font-mono">{{ role.hex }}</span>
          </p>
          <p class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ brandColorRoleNote(role.id, locale) }}</p>
        </div>
      </div>
    </div>

    <!-- ── h.contrast ─────────────────────────────────────────────────── -->
    <div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.color.contrast.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.color.contrast.tag') }}</span>
      </div>
      <p class="bw-doc-text mt-2">{{ t('brand.color.contrast.intro') }}</p>
      <div class="mt-3 overflow-x-auto">
        <table class="w-full min-w-[34rem] border-collapse text-left text-sm">
          <thead>
            <tr>
              <th
                v-for="col in ['pair', 'scheme', 'sample', 'ratio', 'verdict']" :key="col"
                class="bw-label border-b px-0 pb-2 pr-4 font-normal uppercase tracking-wider"
                style="color: var(--bw-muted); border-color: var(--bw-line)"
              >{{ t(`brand.color.contrast.column.${col}`) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pair in pairs" :key="pair.id">
              <td class="border-b py-2.5 pr-4 align-middle" style="border-color: var(--bw-line)">
                {{ brandContrastPairLabel(pair.id, locale) }}
              </td>
              <td class="border-b py-2.5 pr-4 align-middle" style="border-color: var(--bw-line); color: var(--bw-ink-soft)">
                {{ pair.scheme === 'light' ? t('brand.color.scheme.light') : t('brand.color.scheme.dark') }}
              </td>
              <td class="border-b py-2.5 pr-4 align-middle" style="border-color: var(--bw-line)">
                <span
                  class="inline-block rounded-lg px-2.5 py-1 text-xs"
                  :style="`background: ${pair.background}; color: ${pair.foreground}`"
                >{{ t('brand.color.contrast.sample') }}</span>
              </td>
              <td class="border-b py-2.5 pr-4 align-middle tabular-nums" style="border-color: var(--bw-line); color: var(--bw-ink-soft)">
                {{ ratioText(pair.ratio) }}
              </td>
              <td class="border-b py-2.5 pr-4 align-middle" style="border-color: var(--bw-line)">
                <span class="bw-state" :class="levelClass[pair.level]">{{ levelText(pair.level) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!review.ok" class="mt-3 text-sm" style="color: var(--bw-stale)">
        {{ t('brand.color.contrast.blocked', {
          pairs: review.failing.map(id => brandContrastPairLabel(id, locale)).join(', '),
        }) }}
      </p>
      <p v-else class="bw-pending mt-3">{{ t('brand.color.contrast.note') }}</p>
    </div>
  </section>
</template>
