<script setup lang="ts">
import { BRAND_CHECK_CATEGORIES, brandCheckCriteriaOf } from '../../shared/brandCheck'
import type { BrandCheckCriterionResult } from '../../shared/types/brand'

/**
 * DIE AMPEL-MATRIX 8 × 5 — die dritte Zoomstufe („Diagnose",
 * docs/archiv/BRAND-CHECK-SEITE.md §10).
 *
 * Acht Zeilen (die Kategorien in Katalog-Reihenfolge), fünf Zellen je Zeile
 * (ihre Kriterien, ebenfalls in Katalog-Reihenfolge). VIER Zustände, mehr
 * nicht: 0 rot · 1 bernstein · 2 grün · nicht bewertbar = Schloss.
 *
 * ── KEINE 0–100-HEATMAP JE KRITERIUM ──────────────────────────────────────
 * Ein Kriterium IST 0, 1 oder 2 (§10, wörtlich). Ein Farbverlauf darüber wäre
 * Scheingenauigkeit — er sähe nach einer feineren Messung aus, als es sie
 * gibt. Deshalb vier Farben und kein Gradient.
 *
 * ── DIE RASTER-STRUKTUR KOMMT AUS DEM KATALOG, NICHT AUS DEN DATEN ────────
 * Iteriert wird über `BRAND_CHECK_CATEGORIES` und `brandCheckCriteriaOf`; die
 * gespeicherten Kriterien werden nur NACHGESCHLAGEN. Eine Zeile aus der Zeit
 * eines älteren Katalogs hat sonst sechs Zellen in einer Reihe und vier in der
 * nächsten — das Raster ist die Aussage, nicht die Antwort der Ablage. Was der
 * Katalog kennt und die Zeile nicht, ist ein Schloss (dasselbe wie „nicht
 * bewertbar": wir haben dazu keinen Wert).
 *
 * ── DIE FARBEN SIND BESTEHENDE TOKEN ──────────────────────────────────────
 * `--bw-accent` (grün), `--bw-draft` (bernstein, dieselbe Familie wie das
 * Entwurfs-Etikett) und `--bw-stale` (rot). Sie sind in hell UND dunkel
 * definiert; ein viertes Farbpaar für die Ampel wäre eine zweite Wahrheit über
 * dieselben drei Bedeutungen. Die FORM der Zelle (`.bw-matrix-cell`) steht in
 * `app/assets/css/brand.css` und nicht in einem `style`-Block: kein anderer
 * Baustein dieses Layers bringt eigenes CSS mit, und eine Ausnahme wäre der
 * Anfang eines zweiten Design-Systems.
 */

const props = defineProps<{ criteria: BrandCheckCriterionResult[] }>()
const emit = defineEmits<{ select: [criterionId: string] }>()

const { t, te } = useI18n()

type CellState = 'none' | 'partial' | 'full' | 'locked'

interface Cell {
  id: string
  state: CellState
  title: string
  note: string
}

const byId = computed(() => new Map(props.criteria.map(entry => [entry.id, entry])))

const rows = computed(() => BRAND_CHECK_CATEGORIES.map(category => ({
  key: category.key,
  label: categoryLabel(category.key),
  cells: brandCheckCriteriaOf(category.key).map((criterion): Cell => {
    const stored = byId.value.get(criterion.id)
    return {
      id: criterion.id,
      state: stateOf(stored?.score ?? null),
      title: criterionTitle(criterion.id),
      note: stored?.note || stored?.evidence || '',
    }
  }),
})))

function stateOf(score: 0 | 1 | 2 | null): CellState {
  if (score === 0) return 'none'
  if (score === 1) return 'partial'
  if (score === 2) return 'full'
  return 'locked'
}

const TONE: Record<CellState, string> = {
  none: 'var(--bw-stale)',
  partial: 'var(--bw-draft)',
  full: 'var(--bw-accent)',
  locked: 'transparent',
}

function categoryLabel(key: string): string {
  const messageKey = `brand.check.categories.${key}`
  return te(messageKey) ? t(messageKey) : key
}

function criterionTitle(criterionId: string): string {
  const key = `brand.check.criteria.${criterionId}.title`
  return te(key) ? t(key) : t('brand.check.result.criterionFallback')
}

function stateLabel(state: CellState): string {
  return t(`brand.checkResult.matrixLegend.${state}`)
}

/** Der Titel einer Zelle nennt Kriterium, Zustand und — wenn vorhanden — die Notiz. */
function cellTitle(cell: Cell): string {
  const head = t('brand.checkResult.matrixCell', { criterion: cell.title, state: stateLabel(cell.state) })
  return cell.note ? `${head} — ${cell.note}` : head
}
</script>

<template>
  <div data-check-matrix>
    <ul class="space-y-2">
      <li
        v-for="row in rows"
        :key="row.key"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap"
      >
        <span class="bw-label w-full min-w-0 sm:w-52 sm:flex-none" style="color: var(--bw-ink-soft)">{{ row.label }}</span>
        <span class="flex flex-1 gap-2">
          <button
            v-for="cell in row.cells"
            :key="cell.id"
            type="button"
            class="bw-matrix-cell"
            :class="cell.state === 'locked' ? 'bw-matrix-cell--locked' : ''"
            :style="`background: ${TONE[cell.state]}`"
            :title="cellTitle(cell)"
            :aria-label="cellTitle(cell)"
            :data-cell="cell.id"
            :data-state="cell.state"
            @click="emit('select', cell.id)"
          >
            <UIcon
              v-if="cell.state === 'locked'"
              name="i-ph-lock-simple"
              class="size-3.5"
              style="color: var(--bw-muted)"
            />
          </button>
        </span>
      </li>
    </ul>

    <!-- Die Legende steht UNTER der Matrix und nicht in einem Tooltip: die
         Farben sind die einzige Auskunft, und eine Auskunft, die man erst
         suchen muss, ist keine. -->
    <ul class="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2" data-check-matrix-legend>
      <li v-for="state in (['full', 'partial', 'none', 'locked'] as const)" :key="state" class="flex items-center gap-2">
        <span
          class="bw-matrix-cell bw-matrix-cell--legend"
          :class="state === 'locked' ? 'bw-matrix-cell--locked' : ''"
          :style="`background: ${TONE[state]}`"
        />
        <span class="bw-label" style="color: var(--bw-muted)">{{ stateLabel(state) }}</span>
      </li>
    </ul>
  </div>
</template>
