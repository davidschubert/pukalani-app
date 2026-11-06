<script setup lang="ts">
import { BRAND_AI_SLOT_DAILY_LIMIT, brandAiRejectionMessageKey } from '../../shared/brandAiLimits'
import {
  BRAND_MARK_BRIEF_FIELDS,
  brandMarkKindDefault,
  brandMarkMeasuresText,
} from '../../shared/brandDesignMark'
import { BRAND_MARK_KINDS, BRAND_MARK_SETTINGS, BRAND_MARK_VARIANTS, brandTermLabel } from '../../shared/brandDesignVocab'
import { brandMarkSettingSvg } from '../../shared/brandMarkSvg'
import type { BrandMarkBriefResponse } from '../../shared/types/brand'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DAS ZEICHEN (Kapitel `mark`, Konzept docs/archiv/BRAND-DESIGN.md §2.5,
 * Davids Entscheidung §1.11 b, Pakete D5a + D5b) — gebaut nach dem
 * freigegebenen Prototyp (`.playground/app/pages/brand/demo/design/mark.vue`)
 * mit Davids Korrektur „vier Richtungs-Karten nebeneinander".
 *
 * DREI STUFEN in dieser Reihenfolge, untereinander auf einer Bühne:
 *   1. Richtung + Briefing → was für ein Zeichen, und wofür
 *   2. Gesetzte Beispiele  → Wortmarke und Monogramm aus Schriftpaar und
 *                            Farbwelt, als SVG, in vier Varianten
 *   3. KI-Entwürfe         → vier Bilder aus Briefing, DNA und Farbwelt
 *                            (`BwDraftsPanel`, D5c)
 *
 * DIE REIHENFOLGE IST DAS PRODUKT. Wer bei den Bildern anfängt, bekommt ein
 * Logo ohne Begründung — genau das, was der Markt schon verkauft (§1.7).
 *
 * ── ES IST SATZ, KEIN LOGO ────────────────────────────────────────────────
 * §1.4 und §1.11 b: das Produkt verspricht kein Logo. Der Satz „gesetzte
 * Beispiele, kein Logo" steht deshalb SICHTBAR über Stufe 2 und nicht in
 * einer Hilfeseite. Der Markenrechts-Hinweis gehört zu den KI-Entwürfen und
 * steht deshalb dort — in `BwDraftsPanel`, immer sichtbar.
 *
 * ── DAS SVG KOMMT AUS DER PUREN REGEL, NICHT AUS DIESEM TEMPLATE ─────────
 * `brandMarkSettingSvg()` erzeugt dieselbe Zeichenkette, die später im Preset
 * steht (`shared/brandMarkSvg.ts`). Ein von Hand nachgebautes `<svg>` hier
 * wäre eine zweite Setzung: eine zum Ansehen und eine zum Mitnehmen. Der
 * einzige fremde Eingabewert — der Markenname — ist dort escaped, und die
 * Gegenprobe steht im Test.
 *
 * ── FRIDA REDET HIER NICHT ────────────────────────────────────────────────
 * Wie in Farbwelt und Typografie: kein Chat, kein Zug. Bestätigt wird jede
 * Session unten auf ihrer Karte (`RENDERED_ABOVE`); das Briefing ist der eine
 * LAUF dieses Kapitels (Knopf, warten, Ergebnis — wie der DNA-Vorschlag).
 *
 * ── DIE KOMPONENTE ZEIGT, DIE SEITE ENTSCHEIDET ───────────────────────────
 * Sie schreibt keinen Slot; jede Wahl geht als `pick(slotId, value)` an die
 * Seite. AUSNAHME ist der Briefing-Lauf: der schreibt `j.brief`
 * SERVER-seitig und lädt danach den Baustein nach (dieselbe Begründung wie in
 * `BwDnaPanel`) — sonst stünde die Karte in der Bühne weiter leer und der
 * nächste Autosave liefe in einen `revision_conflict`.
 */

const props = withDefaults(defineProps<{
  profileId: string
  /** Sperrt JEDE Auswahl — solange das Kapitel abgeschlossen ist etwa. */
  disabled?: boolean
  /** Die bestätigten Sessions dieses Kapitels: ein bestätigter Slot ist zu. */
  confirmed?: readonly string[]
}>(), { disabled: false, confirmed: () => [] })

const emit = defineEmits<{ pick: [slotId: string, value: string] }>()

const { t, locale } = useI18n()
const store = useBrandWorkspaceStore()
const { contentLocale, colors, dna, fonts, spec, kindId, brief, pickId, wordmark } = useBrandMarkWorld()

function locked(slotId: string): boolean {
  return props.disabled || props.confirmed.includes(slotId)
}

function pick(slotId: string, value: string): void {
  if (locked(slotId)) return
  emit('pick', slotId, value)
}

/** Die Vorbelegung der Richtung — sie trägt den „Empfohlen"-Chip. */
const proposedKind = computed(() => brandMarkKindDefault(dna.value))

// ── Stufe 2: Varianten und Schutzraum ─────────────────────────────────────

/** Die gezeigte Variante ist eine ANSICHT, keine Entscheidung — kein Slot. */
const variantId = ref(BRAND_MARK_VARIANTS[0]!.id)
const showClearSpace = ref(true)

const variantNote = computed(() => t(`brand.mark.variant.note.${variantId.value}`))

function settingSvg(settingId: string): string {
  return brandMarkSettingSvg(spec.value, settingId, variantId.value, {
    clearSpace: showClearSpace.value,
    title: t(`brand.mark.setting.title.${settingId}`, { brand: wordmark.value }),
  })
}

const measures = computed(() => brandMarkMeasuresText(spec.value, contentLocale.value))

// ── Stufe 1b: der Briefing-Lauf ───────────────────────────────────────────

const running = ref(false)
const errorKey = ref('')
/** `null` = noch kein Lauf in dieser Sitzung; die Zeile steht dann nicht da. */
const remaining = ref<number | null>(null)

interface FetchErrorLike {
  status?: number
  statusCode?: number
  response?: { status?: number }
  data?: { reason?: string }
}

/**
 * Der fachliche Grund reist als `data.code` und kommt als `error.data.reason`
 * an (CLAUDE.md). Die DROSSEL-Codes haben ihre eigene Abbildung — sie sagt
 * „heute genug" statt „ging nicht".
 */
function messageKey(error: unknown): string {
  const value = error as FetchErrorLike | null
  const status = value?.status ?? value?.statusCode ?? value?.response?.status ?? 0
  const reason = typeof value?.data?.reason === 'string' ? value.data.reason : ''
  const throttled = brandAiRejectionMessageKey(reason)
  if (throttled) return throttled
  if (reason === 'mark_brief_no_foundation') return 'brand.mark.brief.error.noFoundation'
  if (reason === 'mark_brief_unavailable' || status === 503) return 'brand.mark.brief.error.unavailable'
  if (status === 429) return 'brand.mark.brief.error.rateLimited'
  if (status === 404) return 'brand.mark.brief.error.notFound'
  return 'brand.mark.brief.error.generic'
}

async function runBrief(): Promise<void> {
  if (locked('j.brief') || running.value) return
  running.value = true
  errorKey.value = ''
  try {
    const res = await $fetch<BrandMarkBriefResponse>(
      `/api/brand/profiles/${encodeURIComponent(props.profileId)}/mark/brief`,
      { method: 'POST' },
    )
    remaining.value = res.quota.remaining
    // Der neue Slot-Wert und die neue Revision (s. Kopf).
    await store.loadStep(props.profileId, 'mark')
  }
  catch (error) {
    errorKey.value = messageKey(error)
    if (errorKey.value.endsWith('slotLimit')) remaining.value = 0
  }
  finally {
    running.value = false
  }
}
</script>

<template>
  <section data-brand-mark class="flex flex-col gap-8">
    <!-- ── STUFE 1a: j.kind ─────────────────────────────────────────────── -->
    <div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.mark.kind.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.mark.kind.tag') }}</span>
      </div>
      <p class="bw-doc-text mt-2">{{ t('brand.mark.kind.intro') }}</p>

      <!-- VIER KARTEN NEBENEINANDER (Davids Korrektur am Prototyp). -->
      <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button
          v-for="kind in BRAND_MARK_KINDS" :key="kind.id"
          type="button"
          class="bw-choice-card rounded-2xl p-4 text-left"
          :class="kindId === kind.id ? 'bw-choice-card--selected' : ''"
          :data-mark-kind="kind.id"
          :aria-pressed="kindId === kind.id"
          :disabled="locked('j.kind')"
          @click="pick('j.kind', kind.id)"
        >
          <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="text-sm font-medium">{{ brandTermLabel(kind, locale) }}</span>
            <span v-if="kind.id === proposedKind" class="bw-pop-chip">{{ t('brand.mark.kind.proposed') }}</span>
            <UIcon
              v-if="kindId === kind.id" name="i-ph-check-circle-fill"
              class="ms-auto size-4 flex-none" style="color: var(--bw-accent)"
            />
          </span>
          <span class="mt-2 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t(`brand.mark.kind.reason.${kind.id}`) }}
          </span>
        </button>
      </div>
    </div>

    <!-- ── STUFE 1b: j.brief ────────────────────────────────────────────── -->
    <div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.mark.brief.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.mark.brief.tag') }}</span>
      </div>
      <p class="bw-doc-text mt-2">{{ t('brand.mark.brief.intro') }}</p>

      <dl v-if="brief" class="mt-4 flex flex-col gap-2">
        <div
          v-for="field in BRAND_MARK_BRIEF_FIELDS" :key="field.id"
          class="bw-frame grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[12rem_minmax(0,1fr)]"
          style="background: var(--bw-surface)"
          :data-mark-brief="field.id"
        >
          <dt class="min-w-0">
            <span class="text-sm font-medium">{{ locale.startsWith('de') ? field.de : field.en }}</span>
            <!-- ZWEI FELDER SCHREIBT KEIN MODELL: sie sind gerechnet, und das
                 steht dran — sonst hielte man die Zahlen für eine Meinung. -->
            <span v-if="!field.written" class="bw-label mt-0.5 block" style="color: var(--bw-muted)">
              {{ t('brand.mark.brief.derived') }}
            </span>
          </dt>
          <dd class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ brief[field.id] }}</dd>
        </div>
      </dl>
      <p v-else class="bw-pending mt-4">{{ t('brand.mark.brief.empty') }}</p>

      <div class="mt-3 flex flex-col gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            icon="i-ph-sparkle"
            :label="brief ? t('brand.mark.brief.run.again') : t('brand.mark.brief.run.first')"
            color="neutral" variant="outline" class="rounded-full"
            style="background: var(--bw-surface-hi)"
            :loading="running"
            :disabled="locked('j.brief') || running"
            @click="runBrief"
          />
          <p v-if="running" class="bw-pending">{{ t('brand.mark.brief.running') }}</p>
        </div>
        <p class="bw-pending">
          {{ remaining === null
            ? t('brand.mark.brief.limits', { max: BRAND_AI_SLOT_DAILY_LIMIT })
            : t('brand.mark.brief.remaining', { count: remaining, max: BRAND_AI_SLOT_DAILY_LIMIT }) }}
        </p>
        <p v-if="errorKey" class="text-sm" style="color: var(--bw-stale)">{{ t(errorKey) }}</p>
      </div>
    </div>

    <!-- ── STUFE 2: j.examples + j.pick ─────────────────────────────────── -->
    <div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.mark.examples.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.mark.examples.tag') }}</span>
      </div>
      <p class="bw-doc-text mt-2">
        {{ t('brand.mark.examples.intro', { family: spec.headingFamily }) }}
      </p>
      <!-- DIE NICHT-BEHAUPTUNG, SICHTBAR (§1.4). -->
      <p class="mt-2 text-sm" style="color: var(--bw-ink-soft)">{{ t('brand.mark.examples.notALogo') }}</p>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button
          v-for="variant in BRAND_MARK_VARIANTS" :key="variant.id"
          type="button" class="bw-chip"
          :class="variantId === variant.id ? 'bw-chip--selected' : ''"
          :data-mark-variant="variant.id"
          :aria-pressed="variantId === variant.id"
          @click="variantId = variant.id"
        >{{ brandTermLabel(variant, locale) }}</button>
        <UButton
          size="xs" color="neutral" variant="ghost" class="ms-auto rounded-full"
          icon="i-ph-frame-corners"
          :label="showClearSpace ? t('brand.mark.examples.clearSpace.hide') : t('brand.mark.examples.clearSpace.show')"
          @click="showClearSpace = !showClearSpace"
        />
      </div>
      <p class="bw-label mt-1" style="color: var(--bw-muted)">{{ variantNote }}</p>

      <div class="mt-3 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <button
          v-for="setting in BRAND_MARK_SETTINGS" :key="setting.id"
          type="button"
          class="bw-choice-card rounded-2xl p-3 text-left"
          :class="pickId === setting.id ? 'bw-choice-card--selected' : ''"
          :data-mark-setting="setting.id"
          :aria-pressed="pickId === setting.id"
          :disabled="locked('j.pick')"
          @click="pick('j.pick', setting.id)"
        >
          <!-- Der SVG-Quelltext kommt aus der puren Regel `brandMarkSvg.ts`;
               die einzige fremde Eingabe (der Markenname) ist dort escaped und
               steht nur im Textinhalt. Ein von Hand nachgebautes `<svg>` hier
               wäre die zweite Setzung neben der des Presets (s. Kopf). -->
          <!-- eslint-disable-next-line vue/no-v-html -->
          <span class="bw-frame block w-full overflow-hidden" v-html="settingSvg(setting.id)" />
          <span class="mt-2 flex items-center justify-between gap-2">
            <span class="text-sm font-medium">{{ brandTermLabel(setting, locale) }}</span>
            <UIcon
              v-if="pickId === setting.id" name="i-ph-check-circle-fill"
              class="size-4 flex-none" style="color: var(--bw-accent)"
            />
          </span>
          <span class="bw-label mt-1 block" style="color: var(--bw-muted)">
            {{ t(`brand.mark.setting.note.${setting.id}`) }}
          </span>
        </button>
      </div>

      <p class="bw-label mt-3" style="color: var(--bw-muted)" data-mark-measures>{{ measures }}</p>
    </div>

    <!-- ── Die Szene: dasselbe Zeichen in der bestätigten Marke ─────────── -->
    <div>
      <h2 class="text-xl font-medium">{{ t('brand.mark.scene.title') }}</h2>
      <p class="bw-doc-text mt-2">{{ t('brand.mark.scene.intro') }}</p>
      <div class="mt-3">
        <BwDesignScene :colors="colors" :fonts="fonts" :wordmark="wordmark" />
      </div>
    </div>

    <!-- ── STUFE 3: j.drafts — die KI-Entwürfe (D5c) ────────────────────── -->
    <!-- EIGENE KOMPONENTE, weil sie eine eigene ROUTE, einen eigenen
         Lade-Zustand und einen eigenen Lauf hat (dieselbe Trennung wie
         `BwUploadsEditor`/`BwReadingPanel` im Kapitel `dna`). Sie schreibt
         KEINEN Slot: `j.drafts` zieht der Server nach, wenn jemand einen
         Entwurf behält. -->
    <BwDraftsPanel :profile-id="profileId" :disabled="disabled" />
  </section>
</template>
