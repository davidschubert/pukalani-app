<script setup lang="ts">
/**
 * DER BALKEN ÜBER DEM GESPRÄCH — aus der Werkstatt-Seite geschnitten (WS1,
 * Kapitel g). Links der Schalter der Leiste, die Schicht über dem Kapitel-
 * Namen und der Kapitel-Name als EINZIGE `h1` der Seite (UX-011, Q09), rechts
 * der Schalter des Logs. Der Zustand der Spalten liegt in
 * `useBrandWorkshopLayout` auf der Seite; der Balken zeigt und meldet nur.
 */
const props = defineProps<{
  /** „Brand Foundation", „Brand Design" oder „Brand Book & Kit" — schon übersetzt. */
  layerLabel: string
  /** Der Kapitel-Name, schon übersetzt. */
  title: string
  navVisible: boolean
}>()

const emit = defineEmits<{ toggleNav: [] }>()

const logCollapsed = defineModel<boolean>('logCollapsed', { required: true })

const { t } = useI18n()
</script>

<template>
  <div class="flex min-w-0 flex-1 items-center gap-1.5">
    <UButton
      size="sm" color="neutral" variant="ghost"
      icon="i-ph-sidebar-simple"
      :aria-label="props.navVisible ? t('brand.workspace.bar.hideNav') : t('brand.workspace.bar.showNav')"
      :aria-expanded="props.navVisible"
      @click="emit('toggleNav')"
    />
    <div class="min-w-0 leading-tight">
      <!-- DIE SCHICHT ÜBER DEM KAPITEL-NAMEN (Brand Design D1): sie sagt,
           in WELCHEM Produkt man gerade steht. Fest verdrahtet auf „Brand
           Foundation" stand über „Moodboard" der Name der falschen Schicht
           — die eine Stelle, an der die Werkstatt behauptet hätte, Brand
           Design sei ein Kapitel der Foundation. -->
      <p class="bw-label uppercase tracking-wider" style="color: var(--bw-muted)">{{ props.layerLabel }}</p>
      <!-- DIE HAUPTÜBERSCHRIFT DER SEITE (UX-011, Q09): die Werkstatt hatte
           keine einzige Überschrift. Der Kapitel-Name ist die erste Ebene,
           die Kapitel des Logs sind die zweite, ihre Felder die dritte. -->
      <h1 class="truncate font-semibold">{{ props.title }}</h1>
    </div>
    <!-- Der Log-Toggle wirkt nur, wo es eine Log-SPALTE gibt: unter 768 px
         ist das Raster einspaltig, und der Stand kommt über den
         Modus-Umschalter. Neben dem jetzt lebendigen Nav-Toggle wäre er
         dort ein toter Knopf — also mobil gar nicht erst anbieten. -->
    <UButton
      size="sm" color="neutral" variant="ghost" class="ml-auto max-md:hidden"
      icon="i-ph-sidebar-simple" :ui="{ leadingIcon: '-scale-x-100' }"
      :aria-label="logCollapsed ? t('brand.workspace.bar.showLog') : t('brand.workspace.bar.hideLog')"
      @click="logCollapsed = !logCollapsed"
    />
  </div>
</template>
