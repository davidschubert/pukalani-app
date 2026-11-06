<script setup lang="ts">
import { brandColorRoleLabel, brandColorRoleSourceLabel } from '../../shared/brandDesignColor'
import { brandMotionTokenLabel, brandMotionTokenUsage } from '../../shared/brandDesignMotion'
import { BRAND_MONO_STACK, brandFontPair } from '../../shared/brandFontPairs'
import { isBrandMarkSvg } from '../../shared/brandMarkSvg'
import { BRAND_RAMP_SHADES, type BrandDesignSnapshotPreset } from '../../shared/types/brand'

/**
 * DAS VOLLE KAPITEL 10 — „VISUELLE IDENTITÄT" (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.8, Paket D8; Form abgenommen am Klickdummy
 * `FdDesignChapter`).
 *
 * ── WARUM EINE EIGENE KOMPONENTE UND KEINE NEUEN BLOCK-ARTEN ─────────────
 * Kapitel 10 ist nach Brand Design kein Text mehr, sondern eine VITRINE:
 * Rampen, Schriftproben, SVG-Setzungen, eine Token-Tabelle. Sechs neue
 * Block-Arten in `BwFoundationChapter` würden den Renderer der elf anderen
 * Kapitel für dieses eine umbauen — dieselbe Entscheidung, die der Prototyp
 * mit `FdDesignChapter` neben `FdChapter` getroffen hat.
 *
 * ── EIN RENDERER, DREI ANSICHTEN ─────────────────────────────────────────
 * Privat (`/brand/:id/foundation`), öffentlich (`/brand/share/:token`) und
 * die Anatomie (`/discover/<slug>`) zeigen dieselbe Fläche aus
 * demselben Preset. Der EINZIGE Unterschied ist der Hinweis auf die
 * behaltenen Entwürfe: er steht nur, wo es sie gibt — im Snapshot gibt es sie
 * nie (§1.11 b), und die Zahl ist dort deshalb 0.
 *
 * ── DIE ENTWÜRFE STEHEN HIER MIT HINWEIS, NIE ALS BILD ───────────────────
 * §1.11 b ist keine Feinheit der Darstellung, sondern die Leitplanke selbst —
 * deshalb steht sie IM Dokument und nicht nur in der Werkstatt: „n behaltene
 * Entwürfe — privat". Kein Bild, kein Link, keine Id.
 *
 * ── DIE FÜNF ANKER SIND ZUSAGEN ──────────────────────────────────────────
 * `visuell-farbwelt` … `visuell-bewegung` (`BRAND_FOUNDATION_DESIGN_SECTIONS`)
 * stehen im Inhaltsverzeichnis und in verschickten Tieflinks. Sie sind so
 * unveränderlich wie eine Kapitel-Id.
 */
const props = withDefaults(defineProps<{
  preset: BrandDesignSnapshotPreset
  /** Der Markenname — er wird im Board gesetzt. */
  title: string
  /** Wie viele KI-Entwürfe behalten wurden. 0 = kein Hinweis (s. Kopf). */
  keptDrafts?: number
  /** „Stand …" im Board — leer heisst: kein Datum nennen. */
  stand?: string
  /** Ziel von „Als eigene Ansicht öffnen". `null` = kein Sprung anbieten. */
  boardTo?: string | null
}>(), { keptDrafts: 0, stand: '', boardTo: null })

const { t, locale } = useI18n()

const pair = computed(() => brandFontPair(props.preset.type.pair))
const headingStack = computed(() => pair.value?.headingStack ?? 'inherit')
const bodyStack = computed(() => pair.value?.bodyStack ?? 'inherit')

/** Der Paar-NAME in der Sprache des Lesers (die Familien heissen überall gleich). */
const pairName = computed(() => {
  const entry = pair.value
  if (!entry) return ''
  return locale.value.toLowerCase().startsWith('de') ? entry.nameDe : entry.nameEn
})

/** Hell und Dunkel als ZWEI Streifen — dieselbe Marke, zwei Welten (D3). */
const ramps = computed(() => [
  { id: 'light' as const, ramp: props.preset.color.rampLight },
  { id: 'dark' as const, ramp: props.preset.color.rampDark },
])

const roles = computed(() => props.preset.color.roles.map(role => ({
  hex: role.hex,
  label: brandColorRoleLabel(role.id, locale.value),
  source: brandColorRoleSourceLabel(role.source, locale.value),
})))

/** Alle acht Setzungen — vier Varianten, je Wortmarke und Monogramm (D5b). */
const markSvgs = computed(() => props.preset.mark.examples.filter(isBrandMarkSvg))

const transitions = computed(() => props.preset.motion.transitions.map(token => ({
  id: token.id,
  label: brandMotionTokenLabel(token.id),
  durationMs: token.durationMs,
  usage: brandMotionTokenUsage(token.id, locale.value),
})))
</script>

<template>
  <div class="flex flex-col gap-8" data-design-chapter>
    <!-- DAS ERGEBNIS-BOARD ALS KOPF (§2.8): alles auf einer Fläche, bevor die
         Abschnitte darunter es erklären. -->
    <div>
      <BwDesignBoard :preset="preset" :title="title" :stand="stand" compact />
      <p v-if="boardTo" class="fd-noprint mt-2 flex flex-wrap items-center gap-2">
        <span class="bw-pending">{{ t('brand.foundation.design.boardHint') }}</span>
        <NuxtLink :to="boardTo" class="bw-label underline" style="color: var(--bw-ink-soft)">
          {{ t('brand.foundation.design.boardLink') }}
        </NuxtLink>
      </p>
    </div>

    <!-- ── FARBWELT ──────────────────────────────────────────────────────── -->
    <div id="visuell-farbwelt" class="scroll-mt-6">
      <p class="bw-label" style="color: var(--bw-muted)">
        {{ t('brand.foundation.design.farbwelt') }} · {{ preset.color.base }}
      </p>
      <div class="mt-3 flex flex-col gap-3">
        <div v-for="entry in ramps" :key="entry.id">
          <p class="bw-label" style="color: var(--bw-muted)">
            {{ t(`brand.foundation.design.ramp.${entry.id}`) }}
          </p>
          <div class="mt-1.5 flex overflow-hidden rounded-xl">
            <span
              v-for="shade in BRAND_RAMP_SHADES" :key="shade"
              class="h-9 flex-1" :style="`background: ${entry.ramp[shade]}`"
              :title="`${shade} · ${entry.ramp[shade]}`"
            />
          </div>
        </div>
      </div>
      <div v-if="roles.length" class="mt-4 flex flex-col gap-2">
        <div
          v-for="role in roles" :key="role.label"
          class="fd-box flex items-center gap-3 rounded-2xl px-5 py-3" style="background: var(--bw-surface)"
        >
          <span class="bw-swatch size-6 flex-none rounded-full" :style="`background: ${role.hex}`" />
          <p class="min-w-0 flex-1 text-sm font-medium">{{ role.label }}</p>
          <p class="bw-label flex-none font-mono" style="color: var(--bw-muted)">{{ role.hex }}</p>
          <p class="bw-label flex-none max-sm:hidden" style="color: var(--bw-muted)">{{ role.source }}</p>
        </div>
      </div>
    </div>

    <!-- ── TYPOGRAFIE ────────────────────────────────────────────────────── -->
    <div id="visuell-typografie" class="scroll-mt-6">
      <p class="bw-label" style="color: var(--bw-muted)">
        {{ t('brand.foundation.design.typografie') }}<template v-if="pair"> · {{ pairName }} ({{ pair.headingFamily }} · {{ pair.bodyFamily }})</template>
      </p>
      <div class="fd-box mt-3 rounded-2xl px-5 py-5" style="background: var(--bw-surface)">
        <p class="text-[30px] leading-tight" :style="`font-family: ${headingStack}`">
          {{ t('brand.type.specimen.heading') }}
        </p>
        <p class="mt-3 text-base leading-relaxed" :style="`font-family: ${bodyStack}`">
          {{ t('brand.type.specimen.body') }}
        </p>
        <p class="mt-3 text-sm" :style="`font-family: ${BRAND_MONO_STACK}`">{{ t('brand.type.specimen.mono') }}</p>
      </div>
      <ul v-if="preset.type.rules.length" class="mt-3 flex flex-col gap-1.5">
        <li
          v-for="rule in preset.type.rules" :key="rule"
          class="flex items-start gap-2.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"
        >
          <span class="mt-2 size-1 flex-none rounded-full" style="background: var(--bw-line-strong)" />
          <span class="min-w-0">{{ rule }}</span>
        </li>
      </ul>
    </div>

    <!-- ── ZEICHEN ───────────────────────────────────────────────────────── -->
    <div id="visuell-zeichen" class="scroll-mt-6">
      <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.foundation.design.zeichen') }}</p>
      <div v-if="markSvgs.length" class="mt-3 grid gap-3 sm:grid-cols-2">
        <!-- Der SVG-Quelltext kommt aus dem Preset (`brandMarkSvg.ts`,
             Markenname escaped); `isBrandMarkSvg` ist der Riegel davor —
             dieselbe Begründung wie in `BwMarkPanel`. -->
        <!-- eslint-disable vue/no-v-html -->
        <span
          v-for="(svg, index) in markSvgs" :key="index"
          class="bw-frame block w-full overflow-hidden" v-html="svg"
        />
        <!-- eslint-enable vue/no-v-html -->
      </div>
      <ul v-if="preset.mark.brief.length" class="mt-3 flex flex-col gap-1.5">
        <li
          v-for="line in preset.mark.brief" :key="line"
          class="flex items-start gap-2.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"
        >
          <span class="mt-2 size-1 flex-none rounded-full" style="background: var(--bw-line-strong)" />
          <span class="min-w-0">{{ line }}</span>
        </li>
      </ul>
      <p class="bw-pending mt-3">{{ t('brand.foundation.design.markNote') }}</p>

      <!-- Entwürfe: privat, mit Hinweis (§1.11 b). -->
      <div
        v-if="keptDrafts > 0"
        class="fd-box mt-4 flex items-start gap-3 rounded-2xl px-5 py-4" style="background: var(--bw-surface)"
        data-design-drafts
      >
        <UIcon name="i-ph-eye-slash" class="mt-0.5 size-4 flex-none" style="color: var(--bw-muted)" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium" style="color: var(--bw-ink-soft)">
            {{ t('brand.foundation.design.drafts', { count: keptDrafts }, keptDrafts) }}
          </p>
          <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-muted)">
            {{ t('brand.foundation.design.draftsNote') }}
          </p>
        </div>
      </div>
    </div>

    <!-- ── BILDSPRACHE ───────────────────────────────────────────────────── -->
    <div id="visuell-bildsprache" class="scroll-mt-6">
      <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.foundation.design.bildsprache') }}</p>
      <ul v-if="preset.imagery.principles.length" class="mt-2 flex flex-col gap-1.5">
        <li
          v-for="line in preset.imagery.principles" :key="line"
          class="flex items-start gap-2.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"
        >
          <span class="mt-2 size-1 flex-none rounded-full" style="background: var(--bw-line-strong)" />
          <span class="min-w-0">{{ line }}</span>
        </li>
      </ul>
      <div v-if="preset.imagery.dodont.length" class="mt-3 flex flex-col gap-2">
        <div
          v-for="entry in preset.imagery.dodont" :key="entry.doText"
          class="fd-box grid gap-x-4 gap-y-2 rounded-2xl px-5 py-4 sm:grid-cols-2"
          style="background: var(--bw-surface)"
        >
          <p class="flex items-start gap-2 text-sm leading-relaxed">
            <UIcon name="i-ph-check-circle-fill" class="mt-0.5 size-4 flex-none" style="color: var(--bw-accent)" />
            <span class="min-w-0">{{ entry.doText }}</span>
          </p>
          <p class="flex items-start gap-2 text-sm leading-relaxed" style="color: var(--bw-muted)">
            <UIcon name="i-ph-x-circle-fill" class="mt-0.5 size-4 flex-none" style="color: var(--bw-stale)" />
            <span class="min-w-0 line-through">{{ entry.dontText }}</span>
          </p>
        </div>
      </div>
    </div>

    <!-- ── BEWEGUNG ──────────────────────────────────────────────────────── -->
    <div id="visuell-bewegung" class="scroll-mt-6">
      <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.foundation.design.bewegung') }}</p>
      <div v-if="transitions.length" class="mt-2 overflow-x-auto">
        <table class="w-full min-w-[26rem] border-collapse text-left text-sm">
          <tbody>
            <tr v-for="token in transitions" :key="token.id">
              <td class="border-b py-2 pr-4 font-medium" style="border-color: var(--bw-line)">{{ token.label }}</td>
              <td class="border-b py-2 pr-4 tabular-nums" style="border-color: var(--bw-line); color: var(--bw-ink-soft)">
                {{ token.durationMs }} ms
              </td>
              <td class="border-b py-2 pr-4" style="border-color: var(--bw-line); color: var(--bw-ink-soft)">
                {{ token.usage }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul v-if="preset.motion.rules.length" class="mt-3 flex flex-col gap-1.5">
        <li
          v-for="rule in preset.motion.rules" :key="rule"
          class="flex items-start gap-2.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"
        >
          <span class="mt-2 size-1 flex-none rounded-full" style="background: var(--bw-line-strong)" />
          <span class="min-w-0">{{ rule }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
