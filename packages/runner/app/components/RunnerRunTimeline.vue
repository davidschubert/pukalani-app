<script setup lang="ts">
import type { RunEventRow } from '../../shared/types/runner'

/**
 * Die Ereigniszeilen eines Laufs — docs/archiv/AI-RUNNER.md § 9.
 *
 * BEWUSST KEINE `UTable`, und das ist die begründete Ausnahme von B6: eine
 * Datenliste beantwortet „welche Zeile suche ich?" und braucht dafür
 * Sortierung, Auswahl und Seiten. Ein VERLAUF beantwortet „was ist passiert?",
 * hat genau eine richtige Reihenfolge (der `seq`-Zähler des Runners) und wird
 * von oben nach unten gelesen. Eine Kopfzeile mit sortierbaren Spalten wäre
 * hier eine Einladung, die einzige sinnvolle Ordnung zu zerstören. Genau so
 * steht es auch im Konzept: „ein Lauf-Verlauf ist keine Datenliste".
 *
 * Die Zeilen kommen GEBÜNDELT an (§ 7.2 Schritt 6) — deshalb sortiert die
 * Anzeige nach `seq` und nicht nach `$createdAt`: innerhalb eines Bündels
 * haben alle praktisch denselben Anlege-Zeitstempel.
 */
const props = defineProps<{
  events: RunEventRow[]
  /** true, solange der Lauf noch arbeitet — dann ist „leer" ein Warten, kein Nichts */
  live: boolean
}>()

const { t } = useI18n()
const { formatRelativeTime } = useFormatRelativeTime()

const KIND_META: Record<RunEventRow['kind'], { icon: string, class: string }> = {
  status: { icon: 'i-ph-info', class: 'text-info' },
  tool: { icon: 'i-ph-wrench', class: 'text-muted' },
  text: { icon: 'i-ph-chat-text', class: 'text-toned' },
  error: { icon: 'i-ph-warning-circle', class: 'text-error' },
}
function meta(kind: RunEventRow['kind']) {
  // Ein unbekannter `kind` aus der Datenbank darf die Anzeige nicht leeren.
  return KIND_META[kind] ?? KIND_META.text
}

const ordered = computed(() => [...props.events].sort((a, b) => a.seq - b.seq))
</script>

<template>
  <div>
    <ol v-if="ordered.length" class="space-y-2" data-runner-timeline>
      <li v-for="entry in ordered" :key="entry.$id" class="flex gap-2 text-sm">
        <UIcon :name="meta(entry.kind).icon" class="mt-0.5 size-4 shrink-0" :class="meta(entry.kind).class" />
        <span class="min-w-0 flex-1 whitespace-pre-wrap break-words" :class="entry.kind === 'error' ? 'text-error' : ''">
          {{ entry.message }}
        </span>
        <span class="shrink-0 text-xs text-dimmed">{{ formatRelativeTime(entry.at || entry.$createdAt) }}</span>
      </li>
    </ol>
    <p v-else-if="live" class="text-sm text-muted">{{ t('runner.timeline.waiting') }}</p>
    <p v-else class="text-sm text-muted">{{ t('runner.timeline.empty') }}</p>
  </div>
</template>
