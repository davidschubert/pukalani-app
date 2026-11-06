<script setup lang="ts">
import {
  type BrandNamePattern,
  deriveBrandNameRules,
  formatBrandNameRules,
  parseBrandNamePatterns,
} from '../../shared/brandKitSlots'
import { BRAND_NAME_TYPES } from '../../shared/brandKitVocab'
import { formatBrandSlotList } from '../../shared/brandSlotFormat'
import { brandListEntries } from '../../shared/brandSessions'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DIE NOMENKLATUR-WERKBANK (Kapitel `nomenclature`, Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.2, Paket K5) — gebaut nach dem
 * freigegebenen Prototyp
 * (`.playground/app/pages/brand/demo/kit/nomenclature.vue`).
 *
 * ── DREI SESSIONS AUF EINER FLÄCHE, WIE IN SCHICHT 2 ─────────────────────
 * Typen (`m.types`), Muster (`m.patterns`) und Regeln (`m.rules`) gehören
 * zusammen: die Typen bestimmen, wie viele Muster es gibt, und die Muster
 * bestimmen die Regeln. Drei getrennte Karten zeigten dreimal denselben
 * Gedanken in Einzelteilen — dieselbe Begründung wie bei `BwColorPanel` und
 * `BwTypePanel`. Bestätigt wird trotzdem jede Session unten auf ihrer Karte
 * (`RENDERED_ABOVE`).
 *
 * ABWEICHUNG VOM BRIEF, IM BAU ENTSCHIEDEN: die Typ-Chips stehen HIER und
 * nicht auf dem Standard-Chips-Instrument. Die Werkstatt hat heute keins —
 * `BwChips` wird ausschliesslich von der Abnahme-Fläche benutzt, das
 * Auswahl-Modul der Bühne kennt nur EINE Karte je Wahl (`BwChoiceCards`) und
 * fällt für einen Mehrfach-Slot auf ein Textfeld zurück. Ein Textfeld für
 * fünf Katalog-Ids wäre genau die Eingabe, gegen die `brandKitVocab.ts`
 * geschrieben ist.
 *
 * ── DIE KOMPONENTE ZEIGT, DIE SEITE ENTSCHEIDET ──────────────────────────
 * Sie schreibt keinen Slot; jede Wahl geht als `pick(slotId, value)` an die
 * Seite, und die ist die einzige Stelle mit `setSlotValue` + Autosave
 * (dieselbe Arbeitsteilung wie in jedem Design-Panel).
 */
const props = withDefaults(defineProps<{
  /** Die Architektur-Regel (`b2.rule`) — sie liegt in einem fremden Baustein. */
  architectureRule?: string
  disabled?: boolean
  /** Die bestätigten Sessions dieses Kapitels: ein bestätigter Slot ist zu. */
  confirmed?: readonly string[]
}>(), { architectureRule: '', disabled: false, confirmed: () => [] })

const emit = defineEmits<{ pick: [slotId: string, value: string] }>()

const { t, locale } = useI18n()
const store = useBrandWorkspaceStore()

function locked(slotId: string): boolean {
  return props.disabled || props.confirmed.includes(slotId)
}

/** Die Katalog-Namen in der Sprache der OBERFLÄCHE (der WERT trägt die Id). */
function typeLabel(id: string): string {
  const term = BRAND_NAME_TYPES.find(entry => entry.id === id)
  if (!term) return id
  return locale.value.toLowerCase().startsWith('de') ? term.de : term.en
}

function typeNote(id: string): string {
  const term = BRAND_NAME_TYPES.find(entry => entry.id === id)
  if (!term) return ''
  return locale.value.toLowerCase().startsWith('de') ? term.noteDe : term.noteEn
}

const chosenTypes = computed(() => brandListEntries(store.slotValue('m.types')))

/**
 * MEHRFACHWAHL: ein Klick nimmt hinzu oder weg. Gespeichert wird die LISTE der
 * Ids (`formatBrandSlotList`) — genau die Form, die der K4-Leser
 * (`wordEntries`/`kitTermLabel`) erwartet und die `m.patterns` als Eingabe
 * bekommt.
 *
 * KEINE VORWAHL (§2.2): die Session fragt eine Nachfrage (`answers.maxProbes:
 * 1`), weil die erste Antwort fast immer nur das Offensichtliche nennt. Eine
 * angehakte Vorauswahl beantwortete genau die Frage, die George gleich stellt.
 */
function toggleType(id: string): void {
  if (locked('m.types')) return
  const current = chosenTypes.value
  const next = current.includes(id)
    ? current.filter(entry => entry !== id)
    : [...current, id]
  // Katalog-Reihenfolge statt Klick-Reihenfolge: der Wert soll sich nicht
  // ändern, nur weil jemand zweimal auf dasselbe geklickt hat.
  const ordered = BRAND_NAME_TYPES.filter(term => next.includes(term.id)).map(term => term.id)
  emit('pick', 'm.types', formatBrandSlotList(ordered))
}

/** Die Muster, wie sie im Wert stehen — der EINE Leser (`brandKitSlots.ts`). */
const patterns = computed<BrandNamePattern[]>(() =>
  parseBrandNamePatterns(store.slotValue('m.patterns')))

/**
 * DIE REGELN, PUR AUS DEN MUSTERN (§2.2) — ein VORSCHLAG, kein Wert.
 *
 * Geschrieben wird erst auf Klick: `m.rules` ist `stage-edit`, und ein
 * Automatismus, der bei jedem Muster-Zeichen den Regeltext überschriebe,
 * nähme dem Menschen genau die Fassung weg, die er gerade tippt. (Die
 * Design-Kapitel dürfen sich selbst vorbelegen, weil dort NICHTS von Hand
 * entsteht — hier schon.)
 */
const suggestedRules = computed(() => deriveBrandNameRules({
  patterns: patterns.value,
  architectureRule: props.architectureRule,
  locale: store.profile?.contentLocale ?? 'de',
}))

const rulesValue = computed(() => formatBrandNameRules(suggestedRules.value))
const rulesTaken = computed(() => store.slotValue('m.rules').trim() === rulesValue.value.trim())

function applyRules(): void {
  if (locked('m.rules') || suggestedRules.value.length === 0) return
  emit('pick', 'm.rules', rulesValue.value)
}
</script>

<template>
  <section data-brand-kit-nomenclature class="flex flex-col gap-8">
    <div>
      <!-- DIE HINWEISZEILE (§2.20 Nr. 4, Kunden-Fassung ohne Paragraphen-
           Verweis): dieses Kapitel gibt es nur auf dem Weg mit
           Markenarchitektur. Ohne Untermarken gäbe es kein Muster, das zu
           bestätigen wäre. -->
      <p class="bw-msg-help mt-3">{{ t('brand.kit.nomenclature.note') }}</p>
    </div>

    <!-- ── m.types ──────────────────────────────────────────────────────── -->
    <div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.kit.types.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.kit.types.tag') }}</span>
      </div>
      <p class="bw-doc-text mt-2">{{ t('brand.kit.types.intro') }}</p>

      <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <button
          v-for="term in BRAND_NAME_TYPES" :key="term.id"
          type="button"
          class="bw-choice-card rounded-2xl p-3 text-left"
          :class="chosenTypes.includes(term.id) ? 'bw-choice-card--selected' : ''"
          :data-kit-name-type="term.id"
          :aria-pressed="chosenTypes.includes(term.id)"
          :disabled="locked('m.types')"
          @click="toggleType(term.id)"
        >
          <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="text-sm font-medium">{{ typeLabel(term.id) }}</span>
            <UIcon
              v-if="chosenTypes.includes(term.id)" name="i-ph-check-circle-fill"
              class="ms-auto size-4 flex-none" style="color: var(--bw-accent)"
            />
          </span>
          <span class="mt-1 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ typeNote(term.id) }}
          </span>
        </button>
      </div>
    </div>

    <!-- ── m.patterns ───────────────────────────────────────────────────── -->
    <div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.kit.patterns.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.kit.patterns.tag') }}</span>
      </div>
      <p class="bw-doc-text mt-2">{{ t('brand.kit.patterns.intro') }}</p>

      <!-- Die Tabelle scrollt in SICH, nie die Seite (Responsive-Regel). -->
      <div v-if="patterns.length" class="mt-3 overflow-x-auto">
        <table class="w-full text-sm" data-kit-pattern-table>
          <thead>
            <tr class="bw-label" style="color: var(--bw-muted)">
              <th class="py-1 pe-3 text-left font-normal">{{ t('brand.kit.patterns.column.type') }}</th>
              <th class="py-1 pe-3 text-left font-normal">{{ t('brand.kit.patterns.column.pattern') }}</th>
              <th class="py-1 pe-3 text-left font-normal">{{ t('brand.kit.patterns.column.example') }}</th>
              <th class="py-1 text-left font-normal">{{ t('brand.kit.patterns.column.source') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in patterns" :key="entry.type" class="align-top">
              <td class="py-1.5 pe-3 font-medium">{{ typeLabel(entry.type) }}</td>
              <td class="py-1.5 pe-3">{{ entry.pattern }}</td>
              <td class="py-1.5 pe-3">{{ entry.example }}</td>
              <td class="py-1.5" style="color: var(--bw-ink-soft)">{{ entry.source }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="bw-pending mt-3">{{ t('brand.kit.patterns.empty') }}</p>
    </div>

    <!-- ── m.rules ──────────────────────────────────────────────────────── -->
    <div>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">{{ t('brand.kit.rules.title') }}</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">{{ t('brand.kit.rules.tag') }}</span>
      </div>
      <p class="bw-doc-text mt-2">{{ t('brand.kit.rules.intro') }}</p>

      <ol v-if="suggestedRules.length" class="mt-3 flex flex-col gap-1.5" data-kit-rules>
        <li v-for="(rule, index) in suggestedRules" :key="index" class="bw-doc-text">{{ rule }}</li>
      </ol>
      <p v-else class="bw-pending mt-3">{{ t('brand.kit.rules.empty') }}</p>

      <div v-if="suggestedRules.length" class="mt-3 flex items-center gap-2">
        <UButton
          color="neutral" variant="ghost" class="bw-send rounded-full"
          :label="t('brand.kit.rules.apply')"
          :disabled="locked('m.rules') || rulesTaken"
          @click="applyRules"
        />
        <span v-if="rulesTaken" class="bw-label" style="color: var(--bw-muted)">
          {{ t('brand.kit.rules.applied') }}
        </span>
      </div>
    </div>
  </section>
</template>
