<script setup lang="ts">
import { computed } from 'vue'
import type { BrandSlotControls } from '../../shared/brandSlotControls'
import type { BrandSlot } from '../../shared/slotRegistry'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DAS ENTWURFS-MODUL IM ZUG — aus der Werkstatt-Seite geschnitten (WS1,
 * Kapitel c-Rest). Der Entwurfs-Moment: Basis-Zeile, gestrichelter Rahmen
 * (fällt mit der Bestätigung), drei Wege heraus.
 *
 * Dasselbe Muster wie `BwStageConfirm`: der Wert kommt aus dem Store, was die
 * Bühne über das Feld weiss (Steuerung, Anzeige-Wert, „steht oben schon",
 * abgeschnitten, Antwort-Modus, Hervorhebung), reicht die Seite herein. Auch
 * der ERZEUGUNGS-Zustand bleibt, wo er lebt: ob ein Strom läuft, sagt
 * `useBrandGeneration` der Seite; der Hinweis je Feld (`hints`) und ob seine
 * Zeile offen ist (`hintOpen`) gehören der Seite, weil `generateSlot()` sie
 * nach dem Lauf leert und der Wechsel der Session sie zurücksetzt. Jede
 * Handlung geht als Ereignis zurück.
 */
const props = defineProps<{
  /** Das Feld dieser Karte (`slot` ist als Attribut-Name in Vue vergeben). */
  field: BrandSlot
  controls: BrandSlotControls
  /** Der Satz des Bereitschafts-Gates — nur, wenn er auch gezeigt wird. */
  note: string | null
  label: string
  /** Der Name der Stimme dieses Kapitels (George, in Schicht 2 Frida). */
  voiceName: string
  /** Steht DIESES Feld gerade im Editor? */
  editing: boolean
  /** Der Wert steht schon im Panel darüber (`RENDERED_ABOVE`). */
  renderedAbove: boolean
  /** Was der Mensch liest (Name statt Id bei einer geschlossenen Auswahl). */
  display: string
  /** Das Antwort-Modul einer Entwurfs-Session (Kailua-Befund 5, Weg B). */
  awaitsAnswer: boolean
  /** Das Modell hat an seiner Decke abgebrochen (KI1 d). */
  truncated: boolean
  /** … und ein Neuversuch ist für dieses Feld möglich. */
  canRetryTruncated: boolean
  /** Läuft irgendein Entwurf? */
  streaming: boolean
  /** Läuft der Entwurf GENAU DIESES Felds? Dann steht hier „Stopp". */
  streamingHere: boolean
  /** Nach einem Gesprächszug tritt der Entwurfs-Knopf hervor (Befund 8b). */
  nudge: boolean
  /** Der Hinweis für dieses Feld („wärmer", „kürzer") — lokal, nie gespeichert. */
  hint: string
}>()

const hintOpen = defineModel<boolean>('hintOpen', { required: true })

const emit = defineEmits<{
  'input': [value: string]
  'flush': []
  'retryTruncated': []
  'update:hint': [value: string]
  'generate': []
  'stop': []
  'versions': []
  'apply': []
  'discard': []
  'edit': []
  'confirm': []
}>()

const { t } = useI18n()
const store = useBrandWorkspaceStore()

const value = computed(() => store.slotValue(props.field.id))
</script>

<template>
  <div class="mt-3">
    <div :class="props.controls.showDraftBadge ? 'bw-draft-frame' : ''">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="bw-label" style="color: var(--bw-muted)">{{ props.label }}</p>
        <span v-if="props.controls.showDraftBadge" class="bw-state bw-state--draft">
          <UIcon name="i-ph-pen-nib" />
          {{ t('brand.workspace.draftBadge', { voice: props.voiceName }) }}
        </span>
      </div>
      <UTextarea
        v-if="props.editing && props.controls.editable"
        class="mt-3 w-full" :rows="4" :maxlength="props.field.maxLength"
        :model-value="value"
        @update:model-value="next => emit('input', String(next))"
        @blur="emit('flush')"
      />
      <p
        v-else-if="value && props.renderedAbove"
        class="bw-pending mt-3"
      >
        {{ t('brand.dna.card.above') }}
      </p>
      <!-- BEFUND 1 (2026-09-10): ein `structured`-Wert stand hier
           wörtlich in seiner Speicherform („## Team / Nur ich").
           Die Form gehört EINER Komponente (s. `BwSlotValue`),
           Einzelfelder bleiben unverändert freier Text. -->
      <BwSlotValue
        v-else-if="value"
        class="mt-3"
        :slot-id="props.field.id"
        :value="props.display"
      />
      <!-- DAS ANTWORT-MODUL EINER ENTWURFS-SESSION (Kailua-Befund
           5, Weg B): „Noch offen — kommt im Gespräch" zeigte auf
           ein Gespräch, in dem nichts entstand — für diese Felder
           gibt es keine Katalog-Frage, also fragte niemand. Jetzt
           steht hier Georges Frage zu GENAU diesem Feld, und die
           Antwort darunter steuert den Entwurf. -->
      <template v-else-if="props.awaitsAnswer">
        <p class="mt-3">
          {{ t('brand.workspace.stage.draftAnswer', { voice: props.voiceName, field: props.label }) }}
        </p>
        <p v-if="props.field.helpKey" class="bw-msg-help mt-2">{{ t(props.field.helpKey) }}</p>
      </template>
      <p v-else class="bw-pending mt-3">{{ t('brand.workspace.stage.pending') }}</p>
      <!-- ABGESCHNITTEN AM FELD (KI1 d): der Wert endet mitten im
           Satz, weil der Entwurfs-Zug die Token-Decke gerissen
           hat. Eine Anzeige aus dem Verlauf, keine Spalte — sie
           fällt mit dem nächsten vollständigen Entwurf und mit der
           ersten eigenen Änderung. -->
      <div v-if="props.truncated" class="mt-3 flex flex-wrap items-center gap-2">
        <span class="bw-state bw-state--stale">
          <UIcon name="i-ph-scissors" />
          {{ t('brand.workspace.truncated.fieldBadge') }}
        </span>
        <p class="bw-msg-help">{{ t('brand.workspace.truncated.fieldHint') }}</p>
        <UButton
          v-if="props.canRetryTruncated"
          size="sm" color="neutral" variant="soft" class="rounded-full" icon="i-ph-arrow-clockwise"
          :label="t('brand.workspace.truncated.retry')"
          @click="emit('retryTruncated')"
        />
      </div>
    </div>

    <!-- DIE ANTWORT-ZEILE. Sie steht VOR den Knöpfen, weil sie
         hier die Hauptsache ist — bei „Nochmal, mit Hinweis"
         (unten) ist es umgekehrt: dort ist der Knopf die
         Hauptsache und das Feld sein Ausklapp. Derselbe Weg für
         beide: der Text geht als Hinweis in `generateSlot()`,
         nie in den Chat und nie als Feldwert. -->
    <div v-if="props.awaitsAnswer && props.controls.showHint" class="mt-3 flex items-center gap-2">
      <UInput
        size="sm" class="flex-1" maxlength="500"
        :model-value="props.hint"
        :placeholder="t('brand.workspace.generate.answerPlaceholder')"
        :aria-label="t('brand.workspace.generate.answerLabel', { voice: props.voiceName })"
        :disabled="props.streaming"
        @update:model-value="next => emit('update:hint', String(next))"
        @keydown.enter="emit('generate')"
      />
      <UButton
        size="sm" color="neutral" variant="ghost" class="bw-send rounded-full"
        icon="i-ph-arrow-right"
        :aria-label="t('brand.workspace.generate.answerLabel', { voice: props.voiceName })"
        :disabled="props.streaming"
        @click="emit('generate')"
      />
    </div>

    <!-- ZU WENIG IST ZU WENIG: statt eines Knopfes, der in ein 409
         läuft, steht hier ruhig, was fehlt. -->
    <p v-if="props.note" class="bw-pending mt-2">{{ props.note }}</p>
    <!-- NOCH GAR NICHTS DA (Befund 9): der Bestätigen-Knopf ist
         abgeschaltet — bis hierher sah man ihm das kaum an, und ein
         Klick tat nichts, ohne es zu sagen. Jetzt steht der Grund
         daneben. Die Regel ist pur (`showConfirmBlockedNote`) und
         schliesst sich mit dem Bedarfs-Satz darüber aus. -->
    <p v-if="props.controls.showConfirmBlockedNote" class="bw-pending mt-2">
      {{ t('brand.workspace.confirmNeedsValue') }}
    </p>

    <!-- Links die WEITER-Wege (nochmal, frühere Fassungen),
         rechts die ABSCHLUSS-Wege (korrigieren, übernehmen) —
         dieselbe Aufteilung wie im Dummy. -->
    <div class="mt-2 flex flex-wrap items-center gap-2">
      <template v-if="props.streamingHere">
        <UButton
          size="sm" variant="outline" color="neutral" class="rounded-full"
          icon="i-ph-stop" :label="t('brand.workspace.generate.stop')"
          @click="emit('stop')"
        />
      </template>
      <template v-else>
        <!-- Leerer Slot: die STIMME dieses Kapitels legt vor
             („George, entwirf das" — in den Design-Kapiteln
             „Frida, entwirf das", D8: der Name kommt aus `voice`,
             nicht aus dem Katalogtext). Steht schon etwas da, geht es nur noch
             MIT Hinweis weiter — „nochmal genauso" wäre ein Klick
             ins Ungefähre. Die Weiche ist der WERT, nicht
             `showHint` (das sagt nur „generierbar und bereit"):
             mit showHint stand auf jungfräulichen Feldern
             „Nochmal, mit Hinweis", obwohl es nie ein erstes Mal
             gab (Davids Durchspiel-Audit 2026-09-03). -->
        <!-- NACH EINEM GESPRÄCHSZUG TRITT ER HERVOR (Befund 8b):
             George hat eben gesagt, dass der Entwurf hier entsteht
             — dann darf der Knopf nicht wie ein Nebenweg aussehen.
             Eine Fassung, kein zweiter Knopf und kein Blinken; sie
             fällt beim Klick und mit dem ersten Wert. -->
        <UButton
          size="sm" color="neutral" class="rounded-full"
          :variant="props.nudge ? 'solid' : 'ghost'"
          icon="i-ph-sparkle"
          :label="value
            ? t('brand.workspace.retryWithHint')
            : t('brand.workspace.generate.start', { voice: props.voiceName })"
          :loading="props.streaming"
          :disabled="props.streaming"
          :aria-expanded="value ? hintOpen : undefined"
          @click="value ? (hintOpen = !hintOpen) : emit('generate')"
        />
        <UButton
          v-if="props.controls.showVersions"
          size="sm" variant="ghost" color="neutral" class="rounded-full"
          icon="i-ph-clock-counter-clockwise"
          :label="t('brand.workspace.versions.open')"
          @click="emit('versions')"
        />
        <!-- ZWEI AUSGÄNGE STATT EINEM (Befund 3, 2026-09-10):
             „Korrigieren beenden" SPEICHERTE — es gab keinen Weg
             zurück. Jetzt entscheidet der Mensch, ob seine
             Änderung gilt. -->
        <template v-if="props.controls.editable && props.editing">
          <UButton
            size="sm" color="neutral" variant="ghost" class="ml-auto rounded-full"
            icon="i-ph-check" :label="t('brand.workspace.reviseApply')"
            @click="emit('apply')"
          />
          <UButton
            size="sm" color="neutral" variant="ghost" class="rounded-full"
            icon="i-ph-arrow-counter-clockwise" :label="t('brand.workspace.reviseDiscard')"
            @click="emit('discard')"
          />
        </template>
        <UButton
          v-else-if="props.controls.editable"
          size="sm" color="neutral" variant="ghost" class="ml-auto rounded-full"
          icon="i-ph-pencil-simple"
          :label="t('brand.workspace.reviseSlot')"
          @click="emit('edit')"
        />
        <button
          v-if="props.controls.showConfirm"
          type="button" class="bw-confirm bw-confirm--open"
          :class="props.controls.editable ? '' : 'ml-auto'"
          :disabled="!props.controls.confirmEnabled"
          @click="emit('confirm')"
        >
          <UIcon name="i-ph-check" class="size-4" />
          {{ t('brand.workspace.acceptAndConfirm') }}
        </button>
      </template>
    </div>
    <!-- Die Hinweis-Zeile des zweiten Anlaufs. `!awaitsAnswer`
         schliesst sie gegen die Antwort-Zeile oben aus: zwei
         Felder für dieselbe Eingabe wären zwei Wahrheiten
         darüber, was gleich in den Entwurf geht. -->
    <div v-if="hintOpen && props.controls.showHint && !props.awaitsAnswer" class="mt-2 flex items-center gap-2">
      <UInput
        size="sm" class="flex-1" maxlength="500"
        :model-value="props.hint"
        :placeholder="t('brand.workspace.generate.hintPlaceholder')"
        :aria-label="t('brand.workspace.generate.hintLabel', { voice: props.voiceName })"
        :disabled="props.streaming"
        @update:model-value="next => emit('update:hint', String(next))"
        @keydown.enter="emit('generate')"
      />
      <UButton
        size="sm" color="neutral" variant="ghost" class="bw-send rounded-full"
        icon="i-ph-arrow-right" :aria-label="t('brand.workspace.generate.hintLabel', { voice: props.voiceName })"
        :disabled="props.streaming"
        @click="emit('generate')"
      />
    </div>
  </div>
</template>
