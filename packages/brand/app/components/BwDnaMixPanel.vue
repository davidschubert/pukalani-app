<script setup lang="ts">
import {
  type BrandDnaMixSources,
  brandDnaBoardName,
  brandDnaValueLabel,
} from '../../shared/brandDesignDna'
import { BRAND_DNA_DIMENSIONS } from '../../shared/brandDesignVocab'
import { brandSceneColors, brandSceneFonts } from '../../shared/brandDesignScene'

/**
 * MIX & MATCH UND „EUER STAND" (`g.mix`, Konzept docs/archiv/BRAND-DESIGN.md
 * §2.2 Schritt 5, Paket D2c).
 *
 * ── DAS LOCK-MUSTER, UND WARUM ES AUS EINEM KATALOG SCHÖPFT ──────────────
 * Festhalten, was sitzt — den Rest neu vorschlagen (Huemint/Fontjoy,
 * Marktbefund §1.7). „Neu vorschlagen" heisst hier: aus einem der DREI Boards,
 * nicht aus dem Nichts. Ein Wurf über 10 × 5 Werten erzeugte Kombinationen,
 * die niemand verantwortet — und die Begründungen des Vorschlags gälten für
 * keine davon mehr.
 *
 * ── DIE CHIPS STEHEN UNTEREINANDER (Davids Korrektur 2026-09-08) ─────────
 * Drei Optionen je Dimension lesen sich als LISTE, nicht als umbrechende
 * Zeile: so steht „wie vorgeschlagen" immer an derselben Stelle, und der Blick
 * über zehn Zeilen vergleicht Gleiches mit Gleichem.
 *
 * ── SIE ZEIGT, SIE SCHREIBT NICHT ────────────────────────────────────────
 * Jede Änderung reist als Ereignis nach oben; die SEITE legt sie in den Slot
 * und spült den Autosave (dieselbe Arbeitsteilung wie in `BwSessionBlock`).
 * Ein zweiter Schreiber auf dieselbe `revision` wäre ein 409 gegen sich selbst.
 *
 * ── „FESTGEHALTEN" IST EINE GESTE, KEINE FESTLEGUNG ──────────────────────
 * Das Schloss lebt hier als lokaler Zustand und überlebt keinen Reload — mit
 * Absicht: gespeichert müsste es in `g.mix` mitreisen und stünde damit im
 * Handbuch der Marke. Was es steuert (welche Dimension „neu vorschlagen"
 * anfasst), ist eine Frage dieses Moments.
 */
defineProps<{
  /** Sperrt die Bedienung — solange das Kapitel abgeschlossen ist etwa. */
  disabled?: boolean
}>()

const emit = defineEmits<{
  /** Eine neue Belegung — die Seite schreibt sie in `g.mix`. */
  sources: [next: BrandDnaMixSources]
}>()

const { t, locale } = useI18n()
const { boards, sources, colorBoard, typeBoard, resuggested, withSource } = useBrandDnaBoards()

/** Festgehalten = beim Neu-Vorschlagen unangetastet (s. Kopf). */
const held = ref<Record<string, boolean>>({})
const heldCount = computed(() => BRAND_DNA_DIMENSIONS.filter(d => held.value[d.id]).length)

function dimensionLabel(dimensionId: string): string {
  const dimension = BRAND_DNA_DIMENSIONS.find(entry => entry.id === dimensionId)
  if (!dimension) return dimensionId
  return locale.value.startsWith('de') ? dimension.de : dimension.en
}

function dimensionHint(dimensionId: string): string {
  const dimension = BRAND_DNA_DIMENSIONS.find(entry => entry.id === dimensionId)
  if (!dimension) return ''
  return locale.value.startsWith('de') ? dimension.hintDe : dimension.hintEn
}

function boardName(boardId: string): string {
  return brandDnaBoardName(boardId, locale.value)
}

function valueLabel(dimensionId: string, valueId: string): string {
  return brandDnaValueLabel(dimensionId, valueId, locale.value)
}

function toggleHold(dimensionId: string): void {
  held.value = { ...held.value, [dimensionId]: !held.value[dimensionId] }
}

const colors = computed(() => {
  const board = colorBoard.value
  return board
    ? brandSceneColors(board.base, board.accent, board.base)
    : brandSceneColors('', '', '')
})
const fonts = computed(() => brandSceneFonts(typeBoard.value?.fontPairId ?? ''))
</script>

<template>
  <div v-if="boards.length" class="flex flex-col gap-7">
    <section data-brand-mix>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.dna.mix.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">
          {{ t('brand.dna.mix.held', { count: heldCount, total: BRAND_DNA_DIMENSIONS.length }) }}
        </span>
      </div>
      <p class="bw-doc-text mt-2">{{ t('brand.dna.mix.intro') }}</p>

      <div class="mt-4 flex flex-col gap-2">
        <div
          v-for="dimension in BRAND_DNA_DIMENSIONS" :key="dimension.id"
          class="bw-frame grid items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto]"
          style="background: var(--bw-surface)"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium">{{ dimensionLabel(dimension.id) }}</p>
            <p class="bw-label" style="color: var(--bw-muted)">{{ dimensionHint(dimension.id) }}</p>
          </div>
          <div class="flex flex-col items-start gap-1.5">
            <button
              v-for="board in boards" :key="board.id"
              type="button"
              class="bw-chip"
              :class="sources[dimension.id] === board.id ? 'bw-chip--selected' : ''"
              :aria-pressed="sources[dimension.id] === board.id"
              :disabled="disabled"
              @click="emit('sources', withSource(dimension.id, board.id))"
            >
              {{ valueLabel(dimension.id, board.values[dimension.id] ?? '') }}
              <span class="bw-label ms-1" style="color: var(--bw-muted)">{{ boardName(board.id) }}</span>
            </button>
          </div>
          <UButton
            size="xs" color="neutral" :variant="held[dimension.id] ? 'solid' : 'ghost'"
            class="justify-self-end rounded-full"
            :icon="held[dimension.id] ? 'i-ph-lock-simple-fill' : 'i-ph-lock-simple-open'"
            :label="held[dimension.id] ? t('brand.dna.mix.holding') : t('brand.dna.mix.hold')"
            :disabled="disabled"
            @click="toggleHold(dimension.id)"
          />
        </div>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <UButton
          icon="i-ph-sparkle" :label="t('brand.dna.mix.resuggest')"
          color="neutral" variant="outline" class="rounded-full"
          style="background: var(--bw-surface-hi)"
          :disabled="disabled"
          @click="emit('sources', resuggested(held))"
        />
        <p class="bw-pending">{{ t('brand.dna.mix.resuggestHint') }}</p>
      </div>
    </section>

    <!-- „EUER STAND": was aus der Mischung geworden ist. Die Szene steht hier
         FREI (kein umgebender Button) und trägt deshalb ihren eigenen
         Hell/Dunkel-Umschalter — eine Farbwelt, die man nur hell sieht, ist
         eine halbe Entscheidung. -->
    <section data-brand-mix-scene>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.dna.stand.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">
          {{ t('brand.dna.stand.from', {
            color: boardName(colorBoard?.id ?? ''),
            type: boardName(typeBoard?.id ?? ''),
          }) }}
        </span>
      </div>
      <div class="mt-3">
        <BwDesignScene :colors="colors" :fonts="fonts" />
      </div>
      <p class="bw-pending mt-3">{{ t('brand.dna.stand.note') }}</p>
    </section>
  </div>
</template>
