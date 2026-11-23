<script setup lang="ts">
/**
 * DAS ANTWORT-MODUL IM ZUG — aus der Werkstatt-Seite geschnitten (WS1,
 * Kapitel c-Rest). Geantwortet wird im Prompt unter dem Zug; hier steht nur
 * der Beispiel-Ausweg.
 *
 * Ob das Beispiel offen ist, gehört der Seite (`exampleOpen`): auch die
 * Tab-Taste im Prompt und der Wechsel der Session lesen und schliessen es.
 * Das Übernehmen ins Prompt geht als Ereignis zurück.
 */
const props = defineProps<{
  /** Die Beispiel-Antwort aus dem Katalog (pfad- und team-abhängig). */
  example: string
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{ take: [] }>()

const { t } = useI18n()
</script>

<template>
  <div class="mt-2">
    <!-- Die ANFÜHRUNGSZEICHEN gehören in die Nachricht, nicht ins
         Markup (Audit A12): deutsche und englische Oberflächen
         setzen sie verschieden, und ein Literal hier hätte auf
         der englischen Seite deutsche Zeichen gezeigt. -->
    <button
      type="button" class="bw-label underline" style="color: var(--bw-muted)"
      :aria-expanded="open" @click="open = !open"
    >
      {{ open ? t('brand.workspace.example.hide') : t('brand.workspace.example.show') }}
    </button>
    <button v-if="open" type="button" class="bw-pending mt-2 block text-left" @click="emit('take')">
      {{ t('brand.workspace.example.quoted', { text: props.example, hint: t('brand.workspace.example.take') }) }}
    </button>
  </div>
</template>
