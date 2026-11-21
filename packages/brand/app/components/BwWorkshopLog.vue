<script setup lang="ts">
import { ref, watch } from 'vue'
import type { BrandJourneyStep } from '../../shared/brandJourney'
import type { BrandCardAction, BrandSlotControls } from '../../shared/brandSlotControls'
import type { BrandDirection } from '../../shared/brandDirections'
import type { BrandFindingView, BrandSlotView, BrandStepDetailResponse } from '../../shared/types/brand'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'
import type { BwChoiceCard } from './BwChoiceCards.vue'

/**
 * DER LOG RECHTS IN DER WERKSTATT — die Kapitel als aufklappbare Abschnitte,
 * je Feld eine Karte. Aus der Werkstatt-Seite geschnitten (WS1, Kapitel a).
 *
 * ── WAS HIER LEBT, WAS NICHT ─────────────────────────────────────────────
 * Der Log hält nur, was NIEMAND sonst liest: welche Kapitel aufgeklappt sind
 * und die lesend geholten Felder FREMDER Kapitel. Die Karten selbst rechnet
 * die Seite (`cardsFor`) — sie hängen an derselben Rechnung wie die Bühne
 * (Slot-Zustände, Beschriftung, Anzeige-Wert), und eine zweite Rechnung hier
 * wäre die zweite Wahrheit. Jede HANDLUNG an einer Karte (bestätigen,
 * korrigieren, beantworten, eingeben) geht als Ereignis an die Seite zurück;
 * dort hängen Autosave, Korrektur-Regel und Navigation. Befunde entscheidet
 * und verwirft der Store direkt (`applyFindingDecision`, `dropFinding`).
 */

export interface BwLogCard {
  id: string
  label: string
  note: string
  /** Der ROHE Wert — er geht ins Feld und wird zurückgeschrieben. */
  value: string
  /**
   * Was der Mensch LIEST. Für fast alle Slots derselbe Text; für eine
   * geschlossene Auswahl der Name statt der gespeicherten Id (P4). Zwei
   * Felder, weil die Karte beides braucht: das Etikett zum Lesen, den Wert
   * zum Bearbeiten.
   */
  display: string
  confirmed: boolean
  /**
   * Was statt eines Wertes dasteht. Für fast alle Slots „kommt im Gespräch";
   * für den PAARVERGLEICH (`d.pairs`) der Satz, dass sein Instrument noch
   * nicht gebaut ist (P4). Ohne ihn stand dort eine leere Karte ohne Weg —
   * und die Zeile war die einzige Verwendung von `stage.pairsPlaceholder`,
   * das seit dem Werkstatt-Umbau verwaist im Katalog lag (Audit A11).
   */
  placeholder: string
  /** Nur im laufenden Kapitel: die Bedienelemente. */
  controls: BrandSlotControls | null
  /**
   * WELCHER KNOPF AUF DIESER KARTE STEHT (Davids Befund 18, 2026-09-09) —
   * „Korrigieren", „Beantworten", „Entwerfen" oder keiner. Die Regel ist pur
   * (`brandLogCardAction`) und dort begründet; hier steht nur ihr Ergebnis.
   * Für ein FREMDES Kapitel bleibt es 'none': dort führt der Weg über den
   * Baustein selbst, nicht über eine Karte.
   */
  action: BrandCardAction
  /**
   * DIE OFFENEN BEFUNDE AN DIESEM FELD (§8, Paket 5) — gefiltert über die
   * Slot-Id, nicht über das Kapitel: ein Konflikt gehört zwei Feldern, und der
   * Chip steht an beiden. Der Store trägt die Befunde des OFFENEN Kapitels;
   * berührt einer davon ein Feld eines fremden Kapitels, erscheint er auch
   * dort — mehr weiss der Browser über fremde Kapitel nicht, und mehr
   * behauptet er auch nicht.
   */
  findings: BrandFindingView[]
  /** Die Notizen des Schliess-Aufrufs (§4) — eingeklappt, grau. */
  reviewNotes: string
  /** Was der Spezialist am Ziel vermisst hat (§7) — Hinweis, keine Sperre. */
  missing: string[]
  /**
   * Der Schliess-Aufruf ist gelaufen. `false` heisst fail-soft ausgefallen
   * (§7) — ein stilles Etikett, kein Knopf: der Prüfblick (§10, Paket 7) holt
   * genau diese Sessions nach.
   */
  reviewed: boolean
}

export interface BwLogChapter {
  stepKey: string
  label: string
  state: BrandJourneyStep['state']
  confirmed: number
  total: number
  /** Optionale Slots des Kapitels (Registry-Zahl, unabhängig vom Stand). */
  optional: number
  current: boolean
  /**
   * Wie viele OFFENE Befunde dieses Kapitel berühren (§8). Gerechnet über die
   * Slots (`countOpenFindings`), nicht über den Kapitel-Stempel des Befunds:
   * ein Konflikt zwischen B und C zählt in beiden — genau so, wie er auch
   * beide Abnahmen sperrt.
   */
  findings: number
  /** Die Zähl-Zeile unter dem Kapitel-Namen („3 von 10 bestätigt …"). */
  countLine: string
}

/** Eine der drei Richtungen (Paket G4) — Karte samt übersetztem Namen. */
export interface BwDirectionChoice {
  direction: BrandDirection
  name: string
  reason: string
  match: string
}

const props = defineProps<{
  profileId: string
  /** Der Baustein aus der Adresse — ein Wechsel klappt den Log neu auf. */
  stepKey: string
  chapters: BwLogChapter[]
  /**
   * Die Karten eines Kapitels. `loaded` sind die lesend geholten Felder eines
   * FREMDEN Kapitels (für das laufende `undefined`).
   */
  cardsFor: (chapter: BwLogChapter, loaded: Record<string, BrandSlotView> | undefined) => BwLogCard[]
  editingSlotId: string | null
  directionChoicesFor: (slotId: string) => BwDirectionChoice[]
  choiceCardsFor: (slotId: string) => BwChoiceCard[]
}>()

const emit = defineEmits<{
  /** Ein getippter oder gewählter Wert (Autosave plant die Seite). */
  input: [slotId: string, value: string]
  /** Jetzt speichern (Feld verlassen, Karte gewählt). */
  flush: []
  /** Der Feld-Link eines Befund-Chips. */
  field: [slotId: string]
  goStep: [stepKey: string]
  goSession: [slotId: string]
  revise: [slotId: string]
  apply: []
  discard: [slotId: string]
  edit: [slotId: string]
  confirm: [slotId: string]
}>()

const { t } = useI18n()
const store = useBrandWorkspaceStore()

const openChapters = ref<Set<string>>(new Set())
const foreignSlots = ref<Record<string, Record<string, BrandSlotView>>>({})

watch(() => props.stepKey, (key) => {
  openChapters.value = new Set(key ? [key] : [])
  foreignSlots.value = {}
}, { immediate: true })

function cardsOf(chapter: BwLogChapter): BwLogCard[] {
  return props.cardsFor(chapter, chapter.current ? undefined : foreignSlots.value[chapter.stepKey])
}

function slotActionName(action: string, field: string): string {
  return t('brand.workspace.slotActionName', { action, field })
}

async function toggleChapter(chapter: BwLogChapter): Promise<void> {
  const open = new Set(openChapters.value)
  if (open.has(chapter.stepKey)) {
    open.delete(chapter.stepKey)
    openChapters.value = open
    return
  }
  open.add(chapter.stepKey)
  openChapters.value = open
  if (chapter.current || foreignSlots.value[chapter.stepKey]) return
  try {
    const detail = await $fetch<BrandStepDetailResponse>(
      `/api/brand/profiles/${props.profileId}/steps/${chapter.stepKey}`,
    )
    foreignSlots.value = { ...foreignSlots.value, [chapter.stepKey]: detail.slots }
  }
  catch {
    foreignSlots.value = { ...foreignSlots.value, [chapter.stepKey]: {} }
  }
}

function chapterGlyph(chapter: BwLogChapter): { name: string, style: string } {
  if (chapter.state === 'done') return { name: 'i-ph-check-circle-fill', style: 'color: var(--bw-accent)' }
  if (chapter.state === 'locked') return { name: 'i-ph-lock-simple', style: 'color: var(--bw-muted)' }
  if (chapter.state === 'active' || chapter.current) return { name: 'i-ph-circle-half-fill', style: 'color: var(--bw-ink)' }
  return { name: 'i-ph-circle', style: 'color: var(--bw-muted)' }
}
</script>

<template>
  <!-- Kein Hüll-Element: die Kapitel stehen wie vorher direkt im scrollenden
       Bereich der Seite (Fragment, keine Attribute zum Durchreichen). -->
  <div v-for="chapter in props.chapters" :key="chapter.stepKey" class="bw-log-chapter">
    <h2>
      <button
        type="button"
        class="flex w-full items-start gap-2.5 py-1 text-left"
        :aria-expanded="openChapters.has(chapter.stepKey)"
        @click="toggleChapter(chapter)"
      >
        <UIcon :name="chapterGlyph(chapter).name" class="mt-0.5 size-5 flex-none" :style="chapterGlyph(chapter).style" />
        <span class="min-w-0 flex-1 leading-tight">
          <span class="block text-sm font-medium">{{ chapter.label }}</span>
          <span class="bw-label block tabular-nums" style="color: var(--bw-muted)">
            {{ chapter.countLine }}
          </span>
          <!-- Der Befund-Zähler steht in SEINER Farbe und nur, wenn es
               etwas zu zählen gibt (§8) — beratend, nicht alarmierend. -->
          <span
            v-if="chapter.findings > 0"
            class="bw-label block tabular-nums" style="color: var(--bw-stale)"
          >{{ t('brand.finding.openCount', { count: chapter.findings }, chapter.findings) }}</span>
        </span>
        <UIcon
          name="i-ph-caret-down"
          class="mt-1 size-4 flex-none transition-transform"
          :class="openChapters.has(chapter.stepKey) ? '' : '-rotate-90'"
          style="color: var(--bw-muted)"
        />
      </button>
    </h2>

    <div v-if="openChapters.has(chapter.stepKey)" class="mt-2 space-y-3">
      <!-- Jede Karte liest sich wie der Erklär-Layer: Ampel + Headline,
           Beschreibungs-Subline, DANN die Antwort. „Korrigieren"
           erscheint erst bei Hover/Fokus (`bw-fix`), „Bestätigen"
           bleibt bei offenen Einträgen immer sichtbar. -->
      <div
        v-for="card in cardsOf(chapter)" :key="card.id"
        class="bw-log-card rounded-xl px-3 py-2.5" style="background: var(--bw-surface-hi)"
      >
        <!-- Der Status-Punkt ist ein BILD mit Namen (`role="img"`): ein
             nacktes `span` darf keinen `aria-label` tragen (UX-011). -->
        <h3 class="flex items-center gap-2 text-sm font-medium">
          <span
            class="bw-dot"
            role="img"
            :class="card.confirmed ? 'bw-dot--confirmed' : card.value ? 'bw-dot--draft' : ''"
            :title="t(card.confirmed ? 'brand.workspace.slotState.confirmed' : card.value ? 'brand.workspace.slotState.draft' : 'brand.workspace.slotState.empty')"
            :aria-label="t(card.confirmed ? 'brand.workspace.slotState.confirmed' : card.value ? 'brand.workspace.slotState.draft' : 'brand.workspace.slotState.empty')"
          >
            <UIcon v-if="card.confirmed" name="i-ph-check-bold" class="size-2.5" />
          </span>
          <span class="min-w-0">{{ card.label }}</span>
        </h3>
        <p v-if="card.note" class="mt-0.5 text-xs" style="color: var(--bw-muted)">{{ card.note }}</p>

        <!-- GESCHLOSSENE AUSWAHL: „Korrigieren" führt zurück auf die
             KARTEN, nie in ein Textfeld — dort stünde die rohe Id
             (`branded-house`) zur Bearbeitung (P4-Restkante). -->
        <!-- KORRIGIEREN FÜHRT AUF DIESELBEN KARTEN wie die Bühne —
             die Richtung auf ihre Welten (G4), jede andere geschlossene
             Auswahl auf ihre Text-Karten, nie in ein Textfeld mit der
             rohen Id (P4-Restkante). -->
        <div
          v-if="card.controls && props.editingSlotId === card.id && card.controls.editable && props.directionChoicesFor(card.id).length"
          class="mt-1.5 grid gap-2 sm:grid-cols-3"
        >
          <BwDirectionCard
            v-for="choice in props.directionChoicesFor(card.id)" :key="choice.direction.id"
            :direction="choice.direction"
            :name="choice.name" :reason="choice.reason" :match="choice.match"
            :selected="card.value === choice.direction.id"
            @pick="id => { emit('input', card.id, id); emit('flush') }"
          />
        </div>
        <BwChoiceCards
          v-else-if="card.controls && props.editingSlotId === card.id && card.controls.editable && props.choiceCardsFor(card.id).length"
          class="mt-1.5"
          :options="props.choiceCardsFor(card.id)"
          :selected="card.value"
          @pick="id => { emit('input', card.id, id); emit('flush') }"
        />
        <UTextarea
          v-else-if="card.controls && props.editingSlotId === card.id && card.controls.editable"
          class="mt-1.5 w-full" :rows="3"
          :model-value="card.value"
          @update:model-value="value => emit('input', card.id, String(value))"
          @blur="emit('flush')"
        />
        <!-- BEFUND 1 (2026-09-10): auch der Notizblock zeigte die
             Speicherform eines strukturierten Wertes. -->
        <BwSlotValue v-else-if="card.value" class="mt-1.5" size="sm" :slot-id="card.id" :value="card.display" />
        <p v-else class="bw-pending mt-1.5">{{ card.placeholder }}</p>

        <!-- DIE BEFUNDE AN DIESEM FELD (§8) — kompakt: Icon und ein
             gekürzter Satz, ein Klick klappt Felder und Handlungen
             auf. Der Log ist eine SPALTE, kein Formular. -->
        <div v-if="card.findings.length" class="mt-1.5 flex flex-col gap-1.5">
          <BwFindingChip
            v-for="finding in card.findings" :key="finding.id"
            compact :finding="finding" :profile-id="props.profileId"
            @field="slotId => emit('field', slotId)"
            @decided="store.applyFindingDecision"
            @stale="store.dropFinding(finding.id)"
          />
        </div>

        <!-- Die Notizen des Schliess-Aufrufs (§4): grau, einklappbar.
             Sie fangen ab, was nach sechs Zügen aus dem Gespräch
             fällt — und tragen die Gründe abgelehnter Befunde. -->
        <details v-if="card.reviewNotes || card.missing.length" class="mt-1.5">
          <summary class="bw-label cursor-pointer" style="color: var(--bw-muted)">{{ t('brand.log.notes') }}</summary>
          <p v-if="card.reviewNotes" class="mt-1 whitespace-pre-wrap text-sm" style="color: var(--bw-ink-soft)">{{ card.reviewNotes }}</p>
          <ul v-if="card.missing.length" class="mt-1 flex flex-col gap-0.5">
            <li v-for="(entry, index) in card.missing" :key="index" class="bw-label" style="color: var(--bw-muted)">
              · {{ entry }}
            </li>
          </ul>
        </details>

        <!-- FAIL-SOFT SICHTBAR (§7): der Schliess-Aufruf ist
             ausgefallen. Ein stilles Etikett, kein Knopf — der
             Prüfblick (§10) holt diese Sessions nach. -->
        <p v-if="card.confirmed && !card.reviewed" class="bw-label mt-1.5" style="color: var(--bw-muted)">
          {{ t('brand.review.unreviewed') }}
        </p>

        <!-- JEDER KNOPF NENNT SEIN FELD (UX-011, Q09): elf Mal
             „Bestätigen" mit gleichem Namen sagt einem
             Vorleseprogramm nicht, WAS bestätigt wird. Der Name
             beginnt mit dem sichtbaren Text („Bestätigen:
             Gründungsimpuls"), damit Sprachsteuerung den Knopf über
             das Wort findet, das dasteht. -->
        <div class="mt-1 flex items-center justify-end gap-2">
          <!-- Ein Kapitel, das NICHT offen ist, wird nicht hier
               korrigiert: der Weg dorthin ist der Baustein selbst. -->
          <UButton
            v-if="!card.controls"
            size="xs" color="neutral" variant="ghost" class="bw-fix rounded-full"
            icon="i-ph-pencil-simple" :label="t('brand.workspace.reviseSlot')"
            :aria-label="slotActionName(t('brand.workspace.reviseSlot'), card.label)"
            :disabled="!store.canEnter(chapter.stepKey)"
            @click="emit('goStep', chapter.stepKey)"
          />
          <UButton
            v-else-if="card.confirmed"
            size="xs" color="neutral" variant="ghost" class="bw-fix rounded-full"
            icon="i-ph-pencil-simple" :label="t('brand.workspace.reviseSlot')"
            :aria-label="slotActionName(t('brand.workspace.reviseSlot'), card.label)"
            @click="emit('revise', card.id)"
          />
          <template v-else-if="card.controls.showConfirm">
            <!-- BEFUND 18 (David, 2026-09-09): eine LEERE Karte sagt
                 nicht „Korrigieren" — dort ist nichts zu korrigieren.
                 Eine Frage-Session bekommt „Beantworten", eine
                 Ableitung „Entwerfen"; beide springen in die Session,
                 wo das Modul der Bühne den Rest macht. Welcher Knopf
                 wohin gehört, rechnet `brandLogCardAction`. -->
            <UButton
              v-if="card.action === 'answer' || card.action === 'draft'"
              size="xs" color="neutral" variant="ghost" class="rounded-full"
              :icon="card.action === 'answer' ? 'i-ph-chat-circle-dots' : 'i-ph-pen-nib'"
              :label="card.action === 'answer' ? t('brand.workspace.answerSlot') : t('brand.workspace.draftSlot')"
              :aria-label="slotActionName(card.action === 'answer' ? t('brand.workspace.answerSlot') : t('brand.workspace.draftSlot'), card.label)"
              @click="emit('goSession', card.id)"
            />
            <!-- Dieselben zwei Ausgänge wie auf der Bühne (Befund 3). -->
            <template v-else-if="card.controls.editable && props.editingSlotId === card.id">
              <UButton
                size="xs" color="neutral" variant="ghost" class="rounded-full"
                icon="i-ph-check" :label="t('brand.workspace.reviseApply')"
                @click="emit('apply')"
              />
              <UButton
                size="xs" color="neutral" variant="ghost" class="rounded-full"
                icon="i-ph-arrow-counter-clockwise" :label="t('brand.workspace.reviseDiscard')"
                @click="emit('discard', card.id)"
              />
            </template>
            <UButton
              v-else-if="card.controls.editable"
              size="xs" color="neutral" variant="ghost" class="rounded-full"
              icon="i-ph-pencil-simple"
              :label="t('brand.workspace.reviseSlot')"
              :aria-label="slotActionName(t('brand.workspace.reviseSlot'), card.label)"
              @click="emit('edit', card.id)"
            />
            <button
              type="button" class="bw-confirm bw-confirm--open bw-confirm--xs"
              :disabled="!card.controls.confirmEnabled"
              :aria-label="slotActionName(t('brand.workspace.confirmSlot'), card.label)"
              @click="emit('confirm', card.id)"
            >
              <UIcon name="i-ph-check" class="size-3.5" /> {{ t('brand.workspace.confirmSlot') }}
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
