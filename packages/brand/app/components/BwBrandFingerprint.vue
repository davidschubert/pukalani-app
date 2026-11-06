<script setup lang="ts">
import { BRAND_CHECK_CATEGORIES } from '../../shared/brandCheck'

/**
 * DER MARKENABDRUCK — acht Kategorie-Werte als Netz
 * (docs/archiv/BRAND-CHECK-SEITE.md §10, „Markenabdruck = Profil").
 *
 * ── DAS WORT „RADAR" KOMMT HIER NICHT VOR ─────────────────────────────────
 * Es ist die Technik, nicht das Feature. Im UI heisst es überall
 * „Markenabdruck" bzw. „Brand Fingerprint" — auch im Dateinamen, in den
 * i18n-Schlüsseln und in diesem Kommentar. Wer die Zeichnung später anders
 * baut, ändert die Technik; der Name bleibt.
 *
 * ── EINE ODER ZWEI SERIEN, DERSELBE BAUSTEIN ──────────────────────────────
 * Eine Serie = der Abdruck EINER Marke (das braucht die Ergebnisseite v2, P6),
 * zwei Serien = der Vergleich (P4, übereinandergelegt). Deshalb nimmt die
 * Komponente eine LISTE und kennt weder Check noch Host — sie zeichnet Zahlen.
 *
 * ── `null` LÄSST EINE LÜCKE, ES ZEICHNET KEINE NULL ───────────────────────
 * „Nicht bewertbar" ist keine schwache Kategorie. Eine Achse ohne Wert bekommt
 * deshalb KEINEN Punkt; der Umriss verbindet die Nachbarn direkt.
 *
 * DIE WAHL GEGEN EIN SCHLOSS IM NETZ (bewusst, Alternative aus dem Auftrag):
 * ein Schloss-Symbol AUF der Achse müsste bei zwei Serien zweimal an dieselbe
 * Stelle — es läge übereinander und säße mitten im Umriss der anderen Marke,
 * also genau dort, wo die Zeichnung ihre Aussage hat. Stattdessen zwei ruhige
 * Zeichen: die SPEICHE einer Achse, auf der KEINE Serie einen Wert hat, wird
 * gestrichelt und ihr Etikett gedämpft; das Schloss selbst steht dort, wo es
 * eindeutig einer Seite gehört — in der Zeilenliste unter dem Netz (Vergleich)
 * bzw. an der Kategorie (Ergebnisseite). Der `aria-label` nennt „nicht
 * bewertbar" ohnehin je Achse und Serie, für beide Fälle.
 *
 * ── KLEIN HEISST OHNE ETIKETTEN, NICHT MIT UNLESBAREN ─────────────────────
 * Unter 280 px verschwinden die Achsen-Etiketten und darunter steht eine
 * Legende in Textform. Acht Wörter um ein 200-px-Netz herum wären auf einem
 * Telefon weder lesbar noch anklickbar — die Liste ist dort die bessere
 * Zeichnung.
 */

interface FingerprintSeries {
  /** Acht Werte 0–100 in Katalog-Reihenfolge; `null` = nicht bewertbar. */
  values: (number | null)[]
  color: 'accent' | 'pop' | 'ink'
  /** Kurzname der Serie (Host, „A"/„B") — steht in Legende und `aria-label`. */
  label?: string
}

const props = withDefaults(defineProps<{
  series: FingerprintSeries[]
  size?: number
  labels?: boolean
}>(), { size: 320, labels: true })

const { t, te } = useI18n()

// ── Geometrie ──────────────────────────────────────────────────────────────

const CENTER_X = 200
const CENTER_Y = 160
/**
 * Radius mit Etiketten (aussen bleibt Platz für Wörter) und ohne.
 *
 * 112 ist gemessen, nicht geraten: das längste deutsche Etikett
 * („Anpassung", 56 px bei Schriftgrad 11) beginnt an der Westachse bei x = 18,
 * das längste englische („Adaptability") bei etwa x = 10 — beides innerhalb
 * des Kastens. Wer die Etiketten länger macht, muss hier nachmessen.
 */
const RADIUS_WITH_LABELS = 112
const RADIUS_PLAIN = 140
const LABEL_GAP = 14
/** Die Ringe des Netzes — dieselben vier Stufen wie im Band-Denken. */
const RINGS = [25, 50, 75, 100] as const

const showLabels = computed(() => props.labels && props.size >= 280)
const radius = computed(() => (showLabels.value ? RADIUS_WITH_LABELS : RADIUS_PLAIN))

/**
 * Ohne Etiketten wird der Kasten um das Netz herum zugeschnitten, statt den
 * Platz für Wörter freizuhalten, die nicht gezeichnet werden — sonst stünde
 * ein kleiner Abdruck in viel Leere.
 */
const viewBox = computed(() => {
  if (showLabels.value) return '0 0 400 320'
  const half = RADIUS_PLAIN + 10
  return `${CENTER_X - half} ${CENTER_Y - half} ${half * 2} ${half * 2}`
})

const boxHeight = computed(() => (showLabels.value
  ? Math.round(props.size * 320 / 400)
  : props.size))

interface Axis {
  key: string
  label: string
  /** Einheitsrichtung — mit ihr wird jeder Radius zu einem Punkt. */
  dx: number
  dy: number
}

/** Acht Achsen, oben beginnend und im Uhrzeigersinn — Katalog-Reihenfolge. */
const axes = computed<Axis[]>(() => BRAND_CHECK_CATEGORIES.map((category, index) => {
  const angle = (-90 + index * (360 / BRAND_CHECK_CATEGORIES.length)) * Math.PI / 180
  return {
    key: category.key,
    label: axisLabel(category.key),
    dx: Math.cos(angle),
    dy: Math.sin(angle),
  }
}))

/** Der kurze Kategoriename. Fehlt er, steht der lange da — nie ein Schlüssel. */
function axisLabel(key: string): string {
  const short = `brand.fingerprint.axis.${key}`
  if (te(short)) return t(short)
  const long = `brand.check.categories.${key}`
  return te(long) ? t(long) : key
}

function pointAt(axis: Axis, value: number): { x: number, y: number } {
  const r = radius.value * Math.max(0, Math.min(100, value)) / 100
  return { x: CENTER_X + axis.dx * r, y: CENTER_Y + axis.dy * r }
}

function ringPoints(percent: number): string {
  return axes.value
    .map((axis) => {
      const point = pointAt(axis, percent)
      return `${round(point.x)},${round(point.y)}`
    })
    .join(' ')
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

// ── Die Serien ─────────────────────────────────────────────────────────────

const TONE: Record<FingerprintSeries['color'], string> = {
  accent: 'var(--bw-accent)',
  pop: 'var(--bw-pop)',
  ink: 'var(--bw-ink)',
}

interface DrawnSeries {
  color: string
  label: string
  /** Nur die bewertbaren Achsen — die Lücke entsteht durch Weglassen. */
  vertices: { x: number, y: number }[]
}

const drawn = computed<DrawnSeries[]>(() => props.series.map(series => ({
  color: TONE[series.color] ?? TONE.ink,
  label: series.label ?? '',
  vertices: axes.value
    .map((axis, index) => {
      const value = series.values[index]
      return typeof value === 'number' ? pointAt(axis, value) : null
    })
    .filter((point): point is { x: number, y: number } => point !== null),
})))

function polygonPoints(vertices: { x: number, y: number }[]): string {
  return vertices.map(point => `${round(point.x)},${round(point.y)}`).join(' ')
}

/** Eine Achse, auf der KEINE Serie einen Wert hat — ihre Speiche wird gestrichelt. */
function axisIsBlank(index: number): boolean {
  return props.series.every(series => typeof series.values[index] !== 'number')
}

// ── Etiketten und Legende ──────────────────────────────────────────────────

function labelAnchor(axis: Axis): 'start' | 'middle' | 'end' {
  if (Math.abs(axis.dx) < 0.01) return 'middle'
  return axis.dx > 0 ? 'start' : 'end'
}

function labelPoint(axis: Axis): { x: number, y: number } {
  const r = radius.value + LABEL_GAP
  return { x: round(CENTER_X + axis.dx * r), y: round(CENTER_Y + axis.dy * r) }
}

function valueText(value: number | null | undefined): string {
  return typeof value === 'number' ? String(Math.round(value)) : t('brand.fingerprint.notAssessable')
}

/**
 * Der `aria-label` sagt dieselben Zahlen wie die Zeichnung — Achse für Achse,
 * Serie für Serie. Eine Grafik ohne diese Zeile wäre für einen Screenreader
 * genau nichts.
 */
const ariaLabel = computed(() => {
  const parts = props.series.map((series) => {
    const values = axes.value
      .map((axis, index) => `${axis.label} ${valueText(series.values[index])}`)
      .join(', ')
    return series.label
      ? t('brand.fingerprint.ariaSeries', { label: series.label, values })
      : values
  })
  return t('brand.fingerprint.aria', { values: parts.join(' — ') })
})
</script>

<template>
  <div data-fingerprint>
    <svg
      :viewBox="viewBox"
      :width="size"
      :height="boxHeight"
      role="img"
      :aria-label="ariaLabel"
      class="max-w-full"
    >
      <!-- Das Netz: vier Ringe und acht Speichen -->
      <polygon
        v-for="ring in RINGS"
        :key="`ring-${ring}`"
        :points="ringPoints(ring)"
        fill="none"
        :stroke="ring === 100 ? 'var(--bw-line-strong)' : 'var(--bw-line)'"
        stroke-width="1"
      />
      <line
        v-for="(axis, index) in axes"
        :key="`spoke-${axis.key}`"
        :x1="CENTER_X"
        :y1="CENTER_Y"
        :x2="round(CENTER_X + axis.dx * radius)"
        :y2="round(CENTER_Y + axis.dy * radius)"
        stroke="var(--bw-line)"
        stroke-width="1"
        :stroke-dasharray="axisIsBlank(index) ? '3 4' : undefined"
      />

      <!-- Die Abdrücke: Fläche halbtransparent, Kontur voll -->
      <g v-for="(shape, index) in drawn" :key="`series-${index}`">
        <polygon
          v-if="shape.vertices.length > 2"
          :points="polygonPoints(shape.vertices)"
          :fill="shape.color"
          fill-opacity="0.16"
          :stroke="shape.color"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <polyline
          v-else-if="shape.vertices.length === 2"
          :points="polygonPoints(shape.vertices)"
          fill="none"
          :stroke="shape.color"
          stroke-width="2"
        />
        <circle
          v-for="(vertex, vertexIndex) in shape.vertices"
          :key="`vertex-${vertexIndex}`"
          :cx="round(vertex.x)"
          :cy="round(vertex.y)"
          r="3"
          :fill="shape.color"
        />
      </g>

      <!-- Die Achsen-Etiketten (ab 280 px) -->
      <template v-if="showLabels">
        <text
          v-for="(axis, index) in axes"
          :key="`label-${axis.key}`"
          :x="labelPoint(axis).x"
          :y="labelPoint(axis).y"
          :text-anchor="labelAnchor(axis)"
          dominant-baseline="middle"
          font-size="11"
          :fill="axisIsBlank(index) ? 'var(--bw-muted)' : 'var(--bw-ink-soft)'"
        >{{ axis.label }}</text>
      </template>
    </svg>

    <!-- Ohne Etiketten trägt die Liste die Achsen — sie ist dort die Zeichnung -->
    <ul v-if="!showLabels" class="mt-4 space-y-1.5" data-fingerprint-legend>
      <li
        v-for="(axis, index) in axes"
        :key="`legend-${axis.key}`"
        class="flex flex-wrap items-baseline justify-between gap-x-3"
      >
        <span class="bw-label" style="color: var(--bw-ink-soft)">{{ axis.label }}</span>
        <span class="flex items-center gap-2">
          <span
            v-for="(entry, entryIndex) in props.series"
            :key="`legend-value-${entryIndex}`"
            class="bw-label tabular-nums"
            :style="`color: ${TONE[entry.color] ?? TONE.ink}`"
          >{{ valueText(entry.values[index]) }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>
