<script setup lang="ts">
import {
  BRAND_TYPE_TRACKINGS,
  BRAND_TYPE_WEIGHTS,
  brandTypeRatioText,
  brandTypeScaleFactor,
  brandTypeTrackingText,
} from '../../shared/brandDesignType'
import { BRAND_TYPE_SCALES, brandTermLabel } from '../../shared/brandDesignVocab'
import { BRAND_FONT_PAIRS, BRAND_MONO_STACK } from '../../shared/brandFontPairs'

/**
 * DIE TYPOGRAFIE (Kapitel `type`, Konzept docs/archiv/BRAND-DESIGN.md §2.4,
 * Paket D4) — gebaut nach dem freigegebenen Prototyp
 * (`.playground/app/pages/brand/demo/design/type.vue`): Paar-Karten mit
 * ECHTEN Schriften, Hierarchie, Regeln mit sofortiger Wirkung, Specimen,
 * Szene.
 *
 * ── DER UNTERSCHIED ZU G4 STEHT UND FÄLLT MIT DEN SCHRIFTEN ───────────────
 * Der Richtungs-Katalog (G4) zeigt bewusst nur Schrift-NAMEN — „eine
 * Richtung, kein Rendering-Beweis". Hier wird eine Schrift ENTSCHIEDEN, also
 * müssen die sieben Familien wirklich geladen sein
 * (`app/assets/css/brand-fonts.css`, §2.17). Sehen die Karten unten nach
 * Georgia und Arial aus, fehlt die Deklaration und nicht der Geschmack.
 *
 * ── FRIDA REDET HIER NICHT ────────────────────────────────────────────────
 * Wie in der Farbwelt (D3): kein Chat, kein Zug. Dieser Abschnitt ist eine
 * WERKBANK — der Mensch dreht an einer Einstellung und sieht sofort, was
 * daraus folgt. Bestätigt wird jede der drei Sessions wie überall: auf der
 * Karte in der Bühne (`RENDERED_ABOVE`).
 *
 * ── DIE KOMPONENTE ZEIGT, DIE SEITE ENTSCHEIDET ───────────────────────────
 * Sie schreibt keinen Slot. Jede Auswahl geht als `pick(slotId, value)` an
 * die Seite, und die ist die einzige Stelle mit `setSlotValue` + Autosave
 * (dieselbe Arbeitsteilung wie `BwColorPanel` und `BwDnaMixPanel`).
 *
 * ── DIE MONO-ROLLE IST KEINE WAHL ─────────────────────────────────────────
 * Sie steht fest (Themes-Regel „maximal drei Schriften") und hat genau eine
 * Aufgabe: Herkunft, Preise, Zahlen. Deshalb ist sie im Specimen SICHTBAR,
 * aber nirgends einstellbar — eine dritte wählbare Familie wäre die dritte
 * Marken-Stimme, die das Kapitel gerade verhindert.
 */

const props = withDefaults(defineProps<{
  /** Sperrt JEDE Auswahl — solange das Kapitel abgeschlossen ist etwa. */
  disabled?: boolean
  /**
   * DIE BESTÄTIGTEN SESSIONS DIESES KAPITELS. Ein bestätigter Slot ist zu
   * (`brandSlotControls`: „bestätigt schlägt alles"), und die Tür zurück ist
   * der Korrigieren-Knopf auf seiner Karte.
   */
  confirmed?: readonly string[]
}>(), { disabled: false, confirmed: () => [] })

const emit = defineEmits<{ pick: [slotId: string, value: string] }>()

const { t, locale } = useI18n()
const store = useBrandWorkspaceStore()
const {
  defaults,
  pairId,
  pair,
  scaleId,
  scaleFactor,
  rules,
  weightWarning,
  colors,
  fonts,
  rulesSlotValue,
} = useBrandTypeWorld()

function locked(slotId: string): boolean {
  return props.disabled || props.confirmed.includes(slotId)
}

function pick(slotId: string, value: string): void {
  if (locked(slotId)) return
  emit('pick', slotId, value)
}

/** Eine geänderte Stellschraube geht als GANZER Slot-Wert zurück (`i.rules`). */
function setRule(next: Parameters<typeof rulesSlotValue>[0]): void {
  pick('i.rules', rulesSlotValue(next))
}

/** Der Name der Marke ist das ehrlichste Specimen — sonst der Platzhalter. */
const wordmark = computed(() => store.profile?.title?.trim() || t('brand.scene.wordmarkFallback'))

const pairName = (id: string): string => {
  const entry = BRAND_FONT_PAIRS.find(candidate => candidate.id === id)
  if (!entry) return id
  return locale.value.toLowerCase().startsWith('de') ? entry.nameDe : entry.nameEn
}
const pairNote = (id: string): string => {
  const entry = BRAND_FONT_PAIRS.find(candidate => candidate.id === id)
  if (!entry) return ''
  return locale.value.toLowerCase().startsWith('de') ? entry.noteDe : entry.noteEn
}

/** Die Überschrift-Regeln als CSS — dieselben Werte, die die Szene bekommt. */
const headingStyle = computed(() => [
  `font-family: ${pair.value.headingStack}`,
  `font-weight: ${rules.value.headingWeight}`,
  `letter-spacing: ${rules.value.headingTracking}px`,
  `text-transform: ${rules.value.headingUppercase ? 'uppercase' : 'none'}`,
].join('; '))
</script>

<template>
  <section data-brand-type class="flex flex-col gap-8">
    <!-- ── i.pair ─────────────────────────────────────────────────────── -->
    <div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.type.pair.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.type.pair.tag') }}</span>
      </div>
      <p class="bw-doc-text mt-2">{{ t('brand.type.pair.intro') }}</p>

      <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <button
          v-for="entry in BRAND_FONT_PAIRS" :key="entry.id"
          type="button"
          class="bw-choice-card rounded-2xl p-4 text-left"
          :class="pairId === entry.id ? 'bw-choice-card--selected' : ''"
          :data-type-pair="entry.id"
          :aria-pressed="pairId === entry.id"
          :disabled="locked('i.pair')"
          @click="pick('i.pair', entry.id)"
        >
          <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="text-sm font-medium">{{ pairName(entry.id) }}</span>
            <span v-if="entry.id === defaults.pair" class="bw-pop-chip">{{ t('brand.type.pair.proposed') }}</span>
            <UIcon
              v-if="pairId === entry.id" name="i-ph-check-circle-fill"
              class="ms-auto size-4 flex-none" style="color: var(--bw-accent)"
            />
          </span>
          <!-- DAS SPECIMEN AUF DER KARTE: Überschrift, Fliesstext, Mono —
               drei Zeilen, drei Rollen. Ohne die Fliesstext-Zeile entschiede
               man ein Paar an seiner Überschrift, und genau davor warnt das
               Anti-Muster der Session. -->
          <span
            class="mt-3 block truncate text-[22px] leading-tight"
            :data-type-pair-heading="entry.id"
            :style="`font-family: ${entry.headingStack}`"
          >{{ wordmark }}</span>
          <span
            class="mt-1.5 block text-sm leading-relaxed"
            :data-type-pair-body="entry.id"
            :style="`font-family: ${entry.bodyStack}`"
          >{{ t('brand.type.pair.specimenBody') }}</span>
          <span class="mt-1.5 block text-xs" :style="`font-family: ${BRAND_MONO_STACK}`">
            {{ t('brand.type.pair.specimenMono') }}
          </span>
          <span class="bw-label mt-3 block" style="color: var(--bw-muted)">
            {{ entry.headingFamily }} · {{ entry.bodyFamily }}
          </span>
          <span class="mt-1 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ pairNote(entry.id) }}</span>
        </button>
      </div>
    </div>

    <!-- ── i.scale ────────────────────────────────────────────────────── -->
    <div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.type.scale.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">
          {{ t('brand.type.scale.tag', { ratio: brandTypeRatioText(scaleId, locale) }) }}
        </span>
      </div>
      <p class="bw-doc-text mt-2">{{ t('brand.type.scale.intro') }}</p>

      <div class="mt-3 grid gap-3 sm:grid-cols-3">
        <button
          v-for="entry in BRAND_TYPE_SCALES" :key="entry.id"
          type="button"
          class="bw-choice-card rounded-2xl p-3 text-left"
          :class="scaleId === entry.id ? 'bw-choice-card--selected' : ''"
          :data-type-scale="entry.id"
          :aria-pressed="scaleId === entry.id"
          :disabled="locked('i.scale')"
          @click="pick('i.scale', entry.id)"
        >
          <span class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium">{{ brandTermLabel(entry, locale) }}</span>
            <span class="bw-label" style="color: var(--bw-muted)">{{ brandTypeRatioText(entry.id, locale) }}</span>
          </span>
          <span class="mt-1 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t(`brand.type.scale.note.${entry.id}`) }}
          </span>
          <!-- Die Hierarchie in echt: dieselbe Überschrift, dieselbe Zeile,
               nur der Faktor unterscheidet die drei Karten. -->
          <span
            class="mt-3 block truncate leading-tight"
            :style="`${headingStyle}; font-size: ${1.5 * brandTypeScaleFactor(entry.id)}rem`"
          >{{ t('brand.type.specimen.subheading') }}</span>
          <span class="mt-1 block text-sm" :style="`font-family: ${pair.bodyStack}`">
            {{ t('brand.type.pair.specimenBody') }}
          </span>
        </button>
      </div>
    </div>

    <!-- ── i.rules + Specimen ─────────────────────────────────────────── -->
    <div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.type.rules.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.type.rules.tag') }}</span>
      </div>
      <p class="bw-doc-text mt-2">{{ t('brand.type.rules.intro') }}</p>

      <div class="mt-3 flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="bw-label w-36 flex-none" style="color: var(--bw-muted)">{{ t('brand.type.rules.weight') }}</span>
          <button
            v-for="weight in BRAND_TYPE_WEIGHTS" :key="weight"
            type="button" class="bw-chip"
            :class="rules.headingWeight === weight ? 'bw-chip--selected' : ''"
            :data-type-weight="weight"
            :aria-pressed="rules.headingWeight === weight"
            :disabled="locked('i.rules')"
            @click="setRule({ headingWeight: weight })"
          >{{ weight }}</button>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="bw-label w-36 flex-none" style="color: var(--bw-muted)">{{ t('brand.type.rules.tracking') }}</span>
          <button
            v-for="tracking in BRAND_TYPE_TRACKINGS" :key="tracking"
            type="button" class="bw-chip"
            :class="rules.headingTracking === tracking ? 'bw-chip--selected' : ''"
            :aria-pressed="rules.headingTracking === tracking"
            :disabled="locked('i.rules')"
            @click="setRule({ headingTracking: tracking })"
          >{{ brandTypeTrackingText(tracking, locale) }}</button>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="bw-label w-36 flex-none" style="color: var(--bw-muted)">{{ t('brand.type.rules.uppercase') }}</span>
          <button
            type="button" class="bw-chip"
            :class="rules.headingUppercase ? 'bw-chip--selected' : ''"
            :aria-pressed="rules.headingUppercase"
            :disabled="locked('i.rules')"
            @click="setRule({ headingUppercase: !rules.headingUppercase })"
          >{{ rules.headingUppercase ? t('brand.type.rules.on') : t('brand.type.rules.off') }}</button>
          <span class="bw-label" style="color: var(--bw-muted)">{{ t('brand.type.rules.uppercaseHint') }}</span>
        </div>
        <!-- NICHT JEDE FAMILIE HAT JEDEN SCHNITT: PT Sans und PT Serif gibt
             es nur in 400 und 700. Ein Gewicht dazwischen malt der Browser
             selbst — ein Hinweis ist ehrlicher als eine stille Näherung. -->
        <p v-if="weightWarning" class="text-sm" style="color: var(--bw-draft)">
          {{ t('brand.type.rules.weightWarning', { family: weightWarning }) }}
        </p>
      </div>

      <!-- DAS SPECIMEN: eine Fläche, vier Rollen. Es liest dieselben Regeln
           wie die Szene darunter — sonst hätte man zwei Wahrheiten. -->
      <div class="bw-card mt-4 p-7">
        <p class="bw-label" style="color: var(--bw-muted)">
          {{ t('brand.type.specimen.title', {
            pair: pairName(pairId), heading: pair.headingFamily, body: pair.bodyFamily,
          }) }}
        </p>
        <h3
          class="mt-4 leading-tight" data-type-specimen-heading
          :style="`${headingStyle}; font-size: ${2.6 * scaleFactor}rem`"
        >{{ t('brand.type.specimen.heading') }}</h3>
        <h4 class="mt-4 leading-tight" :style="`${headingStyle}; font-size: ${1.5 * scaleFactor}rem`">
          {{ t('brand.type.specimen.subheading') }}
        </h4>
        <p
          class="mt-3 max-w-2xl text-base leading-relaxed" data-type-specimen-body
          :style="`font-family: ${pair.bodyStack}`"
        >{{ t('brand.type.specimen.body') }}</p>
        <p class="mt-4 text-sm" :style="`font-family: ${BRAND_MONO_STACK}`">{{ t('brand.type.specimen.mono') }}</p>
        <p class="bw-label mt-4" style="color: var(--bw-muted)">{{ t('brand.type.specimen.monoNote') }}</p>
      </div>
    </div>

    <!-- ── Die Szene: dieselbe Typografie in der bestätigten Farbwelt ──── -->
    <div>
      <h2 class="text-xl font-medium">{{ t('brand.type.scene.title') }}</h2>
      <p class="bw-doc-text mt-2">{{ t('brand.type.scene.intro') }}</p>
      <div class="mt-3">
        <BwDesignScene :colors="colors" :fonts="fonts" :wordmark="wordmark" />
      </div>
      <p class="bw-pending mt-3">{{ t('brand.type.scene.note') }}</p>
    </div>
  </section>
</template>
