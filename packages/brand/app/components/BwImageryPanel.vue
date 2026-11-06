<script setup lang="ts">
import {
  BRAND_ICON_SAMPLE,
  BRAND_IMAGERY_AXES,
  BRAND_IMAGERY_AXIS_LABELS,
  BRAND_IMAGERY_PRINCIPLES,
  type BrandImageryText,
  brandIconStrokePx,
  brandIconStrokeRangeText,
  brandIconStrokeText,
  brandIconSuffix,
} from '../../shared/brandDesignImagery'
import { BRAND_ICON_OPTIONS, BRAND_ILLUSTRATION_OPTIONS, brandTermLabel } from '../../shared/brandDesignVocab'

/**
 * DIE BILDSPRACHE (Kapitel `imagery`, Konzept docs/archiv/BRAND-DESIGN.md §2.6,
 * Paket D6) — gebaut nach dem freigegebenen Prototyp
 * (`.playground/app/pages/brand/demo/design/imagery.vue`) mit Davids Korrektur
 * „Icons UNTER der Illustration, nicht daneben".
 *
 * ── KEINE FOTOS, UND ZWAR AUS EINEM GRUND (§1.4) ──────────────────────────
 * Ein Stock-Bild verkaufte die Entscheidung, die hier gerade getroffen wird —
 * man wählte dann das Bild und nicht das Prinzip. Die Karten zeigen deshalb
 * ABSTRAHIERTE Kompositionen aus der BESTÄTIGTEN Farbwelt: weiches Licht als
 * Verlauf, harter Kontrast als Kante, Nähe als Detail, das die Fläche füllt.
 * Sie sind gezeichnet, nicht geladen: kein Bild-Modell, kein Bucket, keine
 * Herkunftszeile. Die optionalen KI-Beispielbilder aus §2.6 hängen am
 * Bild-Transport von D5c und sind nicht Teil dieses Kapitels.
 *
 * ── DIE ICONS SIND ECHT ───────────────────────────────────────────────────
 * Phosphor in `regular`, `fill` und `bold` — dieselbe Familie, drei Stärken,
 * nebeneinander. Ein Bild von Icons hätte genau die Frage nicht beantwortet,
 * um die es geht. Daneben steht die STRICHSTÄRKEN-PROBE als eigenes SVG: sie
 * trägt die Zahl als `stroke-width` im Dokument, und damit lässt sich am
 * Bildschirm nachmessen, was die Regel behauptet (Phosphor rendert über eine
 * CSS-Maske, an ihm ist nichts messbar).
 *
 * ── FRIDA REDET HIER NICHT ────────────────────────────────────────────────
 * Wie in Farbwelt, Typografie und Zeichen: kein Chat, kein Zug, kein Lauf.
 * Dieses Kapitel rechnet JEDEN seiner vier Werte; bestätigt wird jede Session
 * unten auf ihrer Karte (`RENDERED_ABOVE`).
 *
 * ── DIE KOMPONENTE ZEIGT, DIE SEITE ENTSCHEIDET ───────────────────────────
 * Sie schreibt keinen Slot; jede Wahl geht als `pick(slotId, value)` an die
 * Seite, und die ist die einzige Stelle mit `setSlotValue` + Autosave
 * (dieselbe Arbeitsteilung wie `BwColorPanel`, `BwTypePanel`, `BwMarkPanel`).
 */

const props = withDefaults(defineProps<{
  /** Sperrt JEDE Auswahl — solange das Kapitel abgeschlossen ist etwa. */
  disabled?: boolean
  /** Die bestätigten Sessions dieses Kapitels: ein bestätigter Slot ist zu. */
  confirmed?: readonly string[]
}>(), { disabled: false, confirmed: () => [] })

const emit = defineEmits<{ pick: [slotId: string, value: string] }>()

const { t, locale } = useI18n()
const {
  colors,
  pair,
  defaults,
  principleId,
  illustrationId,
  iconsId,
  strokeVerdict,
  dodont,
  principleSlotValue,
} = useBrandImageryWorld()

function locked(slotId: string): boolean {
  return props.disabled || props.confirmed.includes(slotId)
}

function pick(slotId: string, value: string): void {
  if (locked(slotId)) return
  emit('pick', slotId, value)
}

/**
 * Die Katalog-Texte stehen zweisprachig NEBEN den Werten (wie die Paar-Namen
 * in D4): auf dem Bildschirm gilt die Sprache der OBERFLÄCHE, im Slot-Wert die
 * der Marke. Deshalb hier ein eigener Griff und nicht `contentLocale`.
 */
function uiText(entry: BrandImageryText): string {
  return locale.value.toLowerCase().startsWith('de') ? entry.de : entry.en
}

/**
 * DIE FARBEN DER SKIZZEN — fünf Stufen aus der bestätigten Farbwelt.
 *
 * Sie sind benannt wie im Prototyp (Papier, Milch, Crema, Roast, Akzent), aber
 * GERECHNET statt gesetzt: der Prototyp trug feste Kailua-Hex-Werte, die es im
 * Produkt nicht gibt (dieselbe Entscheidung wie in `brandMarkVariantColors`).
 */
const sketch = computed(() => ({
  paper: colors.value.paper,
  soft: colors.value.neutral[100],
  warm: colors.value.rampLight[200],
  ink: colors.value.rampLight[900],
  accent: colors.value.accent,
}))

/** Die Strichstärke der gewählten Option, in der Sprache der Oberfläche. */
const strokeText = computed(() => brandIconStrokeText(strokeVerdict.value.stroke, locale.value))
const rangeText = computed(() => brandIconStrokeRangeText(strokeVerdict.value, locale.value))
</script>

<template>
  <section data-brand-imagery class="flex flex-col gap-8">
    <!-- ── k.photo ──────────────────────────────────────────────────────── -->
    <div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.imagery.photo.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.imagery.photo.tag') }}</span>
      </div>
      <p class="bw-doc-text mt-2">{{ t('brand.imagery.photo.intro') }}</p>

      <div class="mt-4 grid gap-3 lg:grid-cols-3">
        <button
          v-for="entry in BRAND_IMAGERY_PRINCIPLES" :key="entry.id"
          type="button"
          class="bw-choice-card rounded-2xl p-3 text-left"
          :class="principleId === entry.id ? 'bw-choice-card--selected' : ''"
          :data-imagery-principle="entry.id"
          :aria-pressed="principleId === entry.id"
          :disabled="locked('k.photo')"
          @click="pick('k.photo', principleSlotValue(entry.id))"
        >
          <!-- DIE ABSTRAHIERTE KOMPOSITION: Farbwelt und Form, kein Motiv. -->
          <svg
            viewBox="0 0 160 100" class="bw-frame w-full"
            role="img" :aria-label="t('brand.imagery.photo.sketch', { name: uiText(entry.name) })"
          >
            <template v-if="entry.scene === 'daylight'">
              <defs>
                <linearGradient :id="`bw-imagery-${entry.id}`" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" :stop-color="sketch.paper" />
                  <stop offset="60%" :stop-color="sketch.soft" />
                  <stop offset="100%" :stop-color="sketch.warm" />
                </linearGradient>
              </defs>
              <rect x="0" y="0" width="160" height="100" :fill="`url(#bw-imagery-${entry.id})`" />
              <rect x="18" y="52" width="52" height="34" rx="6" :fill="sketch.ink" opacity="0.85" />
              <circle cx="118" cy="34" r="16" :fill="sketch.paper" opacity="0.75" />
            </template>
            <template v-else-if="entry.scene === 'contrast'">
              <rect x="0" y="0" width="160" height="100" :fill="sketch.ink" />
              <path d="M0 100 L70 0 L160 0 L160 100 Z" :fill="sketch.warm" opacity="0.25" />
              <rect x="96" y="30" width="40" height="40" rx="4" :fill="sketch.warm" />
            </template>
            <template v-else>
              <rect x="0" y="0" width="160" height="100" :fill="sketch.soft" />
              <ellipse cx="72" cy="52" rx="46" ry="34" :fill="sketch.ink" />
              <ellipse cx="72" cy="52" rx="14" ry="30" :fill="sketch.warm" opacity="0.8" />
              <rect x="0" y="82" width="160" height="18" :fill="sketch.accent" opacity="0.85" />
            </template>
          </svg>

          <span class="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="text-sm font-medium">{{ uiText(entry.name) }}</span>
            <span v-if="entry.id === defaults.principle" class="bw-pop-chip">
              {{ t('brand.imagery.photo.proposed') }}
            </span>
            <UIcon
              v-if="principleId === entry.id" name="i-ph-check-circle-fill"
              class="ms-auto size-4 flex-none" style="color: var(--bw-accent)"
            />
          </span>
          <span class="mt-1 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ uiText(entry.reason) }}
          </span>
          <!-- DIE VIER ACHSEN: das ist der Satz, den eine Fotografin bekommt. -->
          <span class="bw-label mt-2 block leading-relaxed" style="color: var(--bw-muted)">
            <span v-for="axis in BRAND_IMAGERY_AXES" :key="axis" class="block">
              {{ uiText(BRAND_IMAGERY_AXIS_LABELS[axis]) }}: {{ uiText(entry.axes[axis].doText) }}
            </span>
          </span>
        </button>
      </div>

      <!-- DIE NICHT-BEHAUPTUNG, SICHTBAR (§1.4) — wie „kein Logo" in D5. -->
      <p class="mt-3 text-sm" style="color: var(--bw-ink-soft)">{{ t('brand.imagery.photo.noPhotos') }}</p>
    </div>

    <!-- ── k.illustration ───────────────────────────────────────────────── -->
    <div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.imagery.illustration.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">
          {{ t('brand.imagery.illustration.tag') }}
        </span>
      </div>
      <p class="bw-doc-text mt-2">{{ t('brand.imagery.illustration.intro') }}</p>

      <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <button
          v-for="option in BRAND_ILLUSTRATION_OPTIONS" :key="option.id"
          type="button"
          class="bw-choice-card rounded-2xl p-3 text-left"
          :class="illustrationId === option.id ? 'bw-choice-card--selected' : ''"
          :data-imagery-illustration="option.id"
          :aria-pressed="illustrationId === option.id"
          :disabled="locked('k.illustration')"
          @click="pick('k.illustration', option.id)"
        >
          <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="text-sm font-medium">{{ brandTermLabel(option, locale) }}</span>
            <span v-if="option.id === defaults.illustration" class="bw-pop-chip">
              {{ t('brand.imagery.photo.proposed') }}
            </span>
            <UIcon
              v-if="illustrationId === option.id" name="i-ph-check-circle-fill"
              class="ms-auto size-4 flex-none" style="color: var(--bw-accent)"
            />
          </span>
          <span class="mt-1 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t(`brand.imagery.illustration.note.${option.id}`) }}
          </span>
        </button>
      </div>
    </div>

    <!-- ── k.icons ──────────────────────────────────────────────────────── -->
    <div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.imagery.icons.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.imagery.icons.tag') }}</span>
      </div>
      <p class="bw-doc-text mt-2">{{ t('brand.imagery.icons.intro') }}</p>

      <div class="mt-3 grid gap-2 sm:grid-cols-3">
        <button
          v-for="option in BRAND_ICON_OPTIONS" :key="option.id"
          type="button"
          class="bw-choice-card rounded-2xl p-3 text-left"
          :class="iconsId === option.id ? 'bw-choice-card--selected' : ''"
          :data-imagery-icons="option.id"
          :aria-pressed="iconsId === option.id"
          :disabled="locked('k.icons')"
          @click="pick('k.icons', option.id)"
        >
          <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="text-sm font-medium">{{ brandTermLabel(option, locale) }}</span>
            <span v-if="option.id === defaults.icons" class="bw-pop-chip">
              {{ t('brand.imagery.photo.proposed') }}
            </span>
            <UIcon
              v-if="iconsId === option.id" name="i-ph-check-circle-fill"
              class="ms-auto size-4 flex-none" style="color: var(--bw-accent)"
            />
          </span>

          <!-- DIE FÜNF ECHTEN ICONS: dieselbe Familie, dieser Schnitt.
               IN DER TINTE DER OBERFLÄCHE, nicht in der der Marke: hier wird
               eine STRICHSTÄRKE beurteilt, keine Farbe — und die dunkle
               Marken-Tinte verschwand auf dem dunklen Grund der Werkstatt
               (am eigenen Klick gesehen). Die Farbe entscheidet das Kapitel
               davor. -->
          <span class="mt-2 flex items-center gap-3" style="color: var(--bw-ink)">
            <UIcon
              v-for="icon in BRAND_ICON_SAMPLE" :key="icon"
              :name="`${icon}${brandIconSuffix(option.id)}`" class="size-6"
            />
          </span>

          <!-- DIE PROBE: dieselbe Stärke als echtes `stroke-width`, nachmessbar
               (Phosphor rendert als CSS-Maske, an ihm misst niemand etwas). -->
          <svg
            viewBox="0 0 96 24" class="mt-2 h-6 w-24" style="color: var(--bw-ink)"
            :data-imagery-stroke="option.id" role="img"
            :aria-label="t('brand.imagery.icons.sample', {
              stroke: brandIconStrokeText(brandIconStrokePx(option.id), locale),
            })"
          >
            <g
              :fill="brandIconStrokePx(option.id) === 0 ? 'currentColor' : 'none'"
              :stroke="brandIconStrokePx(option.id) === 0 ? 'none' : 'currentColor'"
              :stroke-width="brandIconStrokePx(option.id)"
              stroke-linecap="round" stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="8" />
              <rect x="28" y="4" width="16" height="16" rx="4" />
              <path d="M52 16 L60 8 L68 16" />
              <path d="M76 12 L92 12" />
            </g>
          </svg>

          <span class="bw-label mt-1.5 block" style="color: var(--bw-muted)">
            {{ t('brand.imagery.icons.strokeLabel', {
              stroke: brandIconStrokeText(brandIconStrokePx(option.id), locale),
            }) }}
          </span>
          <span class="mt-1 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t(`brand.imagery.icons.note.${option.id}`) }}
          </span>
        </button>
      </div>

      <!-- DIE REGEL ALS AUSKUNFT, NICHT ALS TOR: bestätigen lässt sich jeder
           Fall — eine Marke darf laute Icons wollen (§2.6). -->
      <p
        class="mt-3 text-sm leading-relaxed" data-imagery-stroke-rule
        :style="`color: ${strokeVerdict.kind === 'fits' ? 'var(--bw-ink-soft)' : 'var(--bw-draft)'}`"
      >
        {{ t(`brand.imagery.icons.rule.${strokeVerdict.kind}`, {
          stroke: strokeText, range: rangeText, family: strokeVerdict.family,
        }) }}
      </p>
      <!-- Die Zeile im echten Fliesstext: die Icons stehen später daneben. -->
      <p class="mt-2 flex items-center gap-2 text-sm" :style="`font-family: ${pair.bodyStack}`">
        <UIcon
          v-for="icon in BRAND_ICON_SAMPLE.slice(0, 3)" :key="icon"
          :name="`${icon}${brandIconSuffix(iconsId)}`" class="size-4 flex-none"
        />
        <span class="min-w-0">{{ t('brand.imagery.icons.line') }}</span>
      </p>
    </div>

    <!-- ── k.dodont ─────────────────────────────────────────────────────── -->
    <div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.imagery.dodont.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.imagery.dodont.tag') }}</span>
      </div>
      <p class="bw-doc-text mt-2">{{ t('brand.imagery.dodont.intro') }}</p>

      <div class="mt-3 flex flex-col gap-2">
        <div
          v-for="(entry, index) in dodont" :key="index"
          class="bw-frame grid gap-x-4 gap-y-2 px-5 py-4 sm:grid-cols-2"
          style="background: var(--bw-surface)"
          data-imagery-dodont
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
  </section>
</template>
