<script setup lang="ts">
/**
 * PROTOTYP (M0) — DIE RECHTE SPALTE („Stand", Plan §2.5).
 *
 * Auf der Markt-Seite steht dort KEIN George und kein Prompt: es gibt hier
 * nichts zu besprechen, sondern etwas nachzusehen — wie viele Kandidaten,
 * wie viele Profile, wann der letzte Lauf war, was die Drosseln sind. Genau
 * deshalb ist die Spalte nicht leer geblieben: sie trägt die Auskünfte, die
 * sonst als Kleingedrucktes unter der Seite landen (Aufbewahrung des
 * Rohtextes, Vertraulichkeit).
 */
defineProps<{
  rows: readonly { label: string, value: string }[]
  notes?: readonly string[]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex-none border-b px-5 py-4" style="border-color: var(--bw-line)">
      <h2 class="text-sm font-medium">{{ t('market.stand.title') }}</h2>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <dl class="space-y-2.5">
        <div v-for="row in rows" :key="row.label" class="flex items-baseline justify-between gap-3">
          <dt class="bw-label" style="color: var(--bw-muted)">{{ row.label }}</dt>
          <dd class="text-sm tabular-nums" style="color: var(--bw-ink)">{{ row.value }}</dd>
        </div>
      </dl>

      <div v-if="notes?.length" class="mt-5 space-y-2 border-t pt-4" style="border-color: var(--bw-line)">
        <p v-for="note in notes" :key="note" class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
          {{ note }}
        </p>
      </div>

      <slot />
    </div>
  </div>
</template>
