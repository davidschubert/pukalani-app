<script setup lang="ts">
import type { BrandDnaBoard } from '../../shared/brandDesignDna'
import type { BwChoiceCard } from './BwChoiceCards.vue'
import type { BwDirectionChoice } from './BwWorkshopLog.vue'

/**
 * Eine der drei Board-Karten als Auswahl von `g.board` (D2c) — Board samt
 * übersetztem Namen, Notiz und Unterschieden.
 */
export interface BwBoardChoice {
  board: BrandDnaBoard
  name: string
  note: string
  differences: string[]
}

/**
 * DAS OPTIONS-MODUL IM ZUG — aus der Werkstatt-Seite geschnitten (WS1,
 * Kapitel c-Rest). Die Auswahl beantwortet sich im eigenen Modul. Ohne
 * „Überspringen" (Runde 39, David): die Positionierung ist die
 * Kernentscheidung, nicht eine Frage unter vielen.
 *
 * WELCHE Karten es gibt (Richtungen, Boards, Text-Karten oder keine), rechnet
 * die Seite — dort stehen die Verträge und Regeln. Die eigene Formulierung
 * (`ownChoice`) gehört ebenfalls der Seite: sie fällt dort mit dem Wechsel der
 * Frage. Jeder Klick geht als Ereignis zurück und von dort über
 * `answerFromGeorge` an George — ein eigener Übermittlungsweg wäre eine
 * zweite Wahrheit über dieselbe Handlung.
 */
const props = defineProps<{
  title: string
  directionChoices: BwDirectionChoice[]
  boardChoices: BwBoardChoice[]
  choiceCards: BwChoiceCard[]
  /** Der Wert des Felds (die stabile Id einer gewählten Karte), sonst `''`. */
  selected: string
  /** Läuft gerade ein Zug? Dann ist keine Wahl möglich. */
  disabled: boolean
  placeholder: string
}>()

const ownChoice = defineModel<string>('ownChoice', { required: true })

const emit = defineEmits<{
  pick: [id: string]
  submit: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="mt-3 rounded-2xl p-4" style="background: var(--bw-surface-hi)">
    <div class="rounded-xl px-4 py-3" style="background: var(--bw-paper)">
      <!-- BEFUND 9 (2026-09-10): solange die Sammel-Session läuft,
           trägt die Karte die aktuelle TEILfrage — vorher stand
           dort der Name der Session („Zahlen & Fakten"), während
           George daneben nach einem einzelnen Teil fragte. -->
      <span class="block text-sm font-medium">{{ props.title }}</span>
      <!-- GESCHLOSSENE MENGE ⇒ KARTEN (P4): der Klick übermittelt
           die stabile Id, „Übermitteln" entfällt — eine Karte IST
           die Entscheidung. Offene Auswahl (Positionierungs-
           Kategorie) behält ihr Feld. -->
      <!-- DIE RICHTUNG (Paket G4): drei Welten statt sechs, und
           eine Karte zeigt die Welt statt sie zu beschreiben. Sie
           steht VOR dem Text-Karten-Zweig, weil `result.direction`
           einen geschlossenen Vertrag HAT und sonst dort landete. -->
      <div v-if="props.directionChoices.length" class="mt-3 grid gap-2 sm:grid-cols-3">
        <BwDirectionCard
          v-for="choice in props.directionChoices" :key="choice.direction.id"
          :direction="choice.direction"
          :name="choice.name" :reason="choice.reason" :match="choice.match"
          :selected="props.selected === choice.direction.id"
          :disabled="props.disabled"
          @pick="id => emit('pick', id)"
        />
      </div>
      <!-- DIE DREI MOODBOARDS (D2c): dieselbe Stelle, dieselbe
           Mechanik wie die Richtungen — der Klick übermittelt die
           stabile Board-Id. Die Karten zeigen eine gerenderte
           SZENE, deshalb stehen sie hier und nicht in
           `choiceCards`. -->
      <div v-else-if="props.boardChoices.length" class="mt-3 grid gap-3 lg:grid-cols-3">
        <BwBoardCard
          v-for="choice in props.boardChoices" :key="choice.board.id"
          :board="choice.board"
          :name="choice.name" :note="choice.note" :differences="choice.differences"
          :selected="props.selected === choice.board.id"
          :disabled="props.disabled"
          @pick="id => emit('pick', id)"
        />
      </div>
      <BwChoiceCards
        v-else-if="props.choiceCards.length"
        class="mt-3"
        :options="props.choiceCards"
        :selected="props.selected"
        :disabled="props.disabled"
        @pick="id => emit('pick', id)"
      />
      <UInput
        v-else
        v-model="ownChoice" size="sm" class="mt-2 w-full"
        :placeholder="props.placeholder"
        :aria-label="t('brand.workspace.sendOwnAnswer')"
        @keydown.enter="emit('submit')"
      />
    </div>
    <div v-if="!props.choiceCards.length && !props.directionChoices.length && !props.boardChoices.length" class="mt-3 flex items-center justify-end gap-2">
      <UButton
        color="neutral" variant="ghost" class="bw-send rounded-full"
        :label="t('brand.workspace.submitChoice')"
        :disabled="!ownChoice.trim() || props.disabled"
        @click="emit('submit')"
      />
    </div>
  </div>
</template>
