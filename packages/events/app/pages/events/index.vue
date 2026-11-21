<script setup lang="ts">
/**
 * Default-Seite des Layers — öffentlich (Gäste lesen, Mitglieder sagen zu).
 */
const { t } = useI18n()
const localePath = useLocalePath()

// Fester Satz als Beschreibung (Q10, SEO-003) — die Übersicht hatte keine.
useBrandTitle(() => t('events.list.title'), { description: () => t('events.list.description') })

/**
 * DER EINSTIEG IN DIE VERWALTUNG (F58, 2026-08-16) — wie bei den Kursen gab es
 * ihn hier GAR NICHT: Anlegen und Bearbeiten lebten ausschließlich unter
 * /dashboard/events, und von der Terminliste führte kein Weg dorthin.
 *
 * `useCapability` deckt BEIDE Quellen ab (Operator-Label ODER Rolle in dieser
 * Community) — dieselbe Rechnung, die `requireCommunityPermission` auf der
 * Route macht; in einer Silo-App gibt es keine Community-Rolle.
 *
 * „Neuer Termin" ÖFFNET DEN DIALOG HIER (Davids Entscheidung zum ersten
 * F58-Entwurf, der stattdessen nach /dashboard/events?new=1 verlinkte): geteilt
 * gehört der Mechanismus — dasselbe `EventFormModal` wie im Dashboard —, nicht
 * der Einstieg. Ein Link hätte die Tür zwar sichtbar gemacht, die Handlung aber
 * weiterhin woanders stattfinden lassen.
 *
 * „Verwalten" BLEIBT ein Link, und zwar mit Absicht: es beantwortet eine andere
 * Frage. Diese Liste zeigt nur VERÖFFENTLICHTES; Entwürfe, abgesagte und
 * ausgeblendete Termine, „Serie beenden" und die Filter stehen in der Tabelle.
 */
const canManage = useCapability('events.manage')

const createOpen = ref(false)

/**
 * `refreshNuxtData` statt eines Emits: die Liste lädt in `EventList` über
 * `useAsyncData('events:list')`, und dieser Schlüssel ist dort ein Literal.
 * Ihn hier zu nennen ist die kleinere Kopplung als ein Ref durch zwei
 * Komponenten — und der Kalender daneben zieht über seinen eigenen Ruf nach.
 *
 * Ohne `publish-on-create` (unten) wäre dieser Refresh übrigens sinnlos: ein
 * Entwurf steht in dieser Liste nicht.
 */
function onCreated() {
  void refreshNuxtData('events:list')
}
</script>

<template>
  <UContainer class="py-8">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold">{{ t('events.list.title') }}</h1>
        <p class="mt-1 text-sm text-muted">{{ t('events.list.description') }}</p>
      </div>
      <div v-if="canManage" class="flex shrink-0 items-center gap-2" data-testid="events-manage-actions">
        <UButton
          :to="localePath('/dashboard/events')"
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-ph-sliders-horizontal"
          data-testid="events-manage"
        >
          {{ t('events.list.manage') }}
        </UButton>
        <UButton
          size="sm"
          icon="i-ph-plus"
          data-testid="events-create"
          @click="() => { createOpen = true }"
        >
          {{ t('events.list.create') }}
        </UButton>
      </div>
    </div>

    <EventList class="mt-6" />

    <!-- publish-on-create: ein Entwurf wäre von dieser Seite aus im Moment des
         Anlegens unsichtbar (Begründung im Kopf von EventFormModal). -->
    <EventFormModal v-model:open="createOpen" publish-on-create @saved="onCreated" />
  </UContainer>
</template>
