<script setup lang="ts">
/** Archetyp-Paarvergleich (§3c-Visuals): Bild-Karten statt Adjektivliste.
 *  Im Dummy: typografische Karten mit Stimmung + Beispielmarken. */
defineProps<{
  a: { id: string, motto: string, mood: string, brands: string }
  b: { id: string, motto: string, mood: string, brands: string }
}>()
defineEmits<{ pick: [id: string] }>()
/* Motto, Stimmung und Beispielmarken reicht die Seite herein — eigen ist
 * hier nur das verbindende „wie …". */
const { t } = useI18n()
</script>

<template>
  <div class="bw-pair">
    <button v-for="card in [a, b]" :key="card.id" class="bw-pair-card" @click="$emit('pick', card.id)">
      <p class="text-xl font-extralight leading-snug tracking-tight">„{{ card.motto }}"</p>
      <p class="mt-2 text-sm" style="color: var(--bw-ink-soft)">{{ card.mood }}</p>
      <p class="bw-label mt-9" style="color: var(--bw-muted)">{{ t('brand.workspace.likeBrands', { brands: card.brands }) }}</p>
    </button>
  </div>
</template>
