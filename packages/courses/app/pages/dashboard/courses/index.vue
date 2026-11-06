<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { CourseManageResponse, CourseRow } from '../../../../shared/types/course'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'courses.manage' })

const { t } = useI18n()
const localePath = useLocalePath()

useBrandTitle(() => t('courses.admin.title'))

const { data, status } = await useFetch<CourseManageResponse>('/api/courses/manage', {
  lazy: true,
  server: false,
})

const modalOpen = ref(false)

/**
 * `?new=1` öffnet den Anlege-Dialog sofort (F58) — das Ziel des Knopfes „Neuer
 * Kurs" auf der öffentlichen Kurs-Seite. Ohne den Parameter landete er auf
 * einer Liste, in der man den Knopf ein zweites Mal suchen muss; die
 * Beschriftung wäre dann nur halb wahr.
 *
 * Client-seitig (onMounted), weil der Dialog ohnehin erst dort rendert
 * (ClientOnly-Hülle) — und die Adresse wird danach bereinigt, damit ein Reload
 * oder ein Zurück-Sprung den Dialog nicht erneut aufreisst.
 */
const route = useRoute()
onMounted(() => {
  if (route.query.new !== '1') return
  modalOpen.value = true
  void navigateTo({ query: {} }, { replace: true })
})
/**
 * Das Anlege-Formular liegt seit Davids Entscheidung zu F58 in
 * `CourseFormModal` und wird mit der öffentlichen Kurs-Galerie GETEILT
 * (Begründung im Kopf der Komponente). `paidAvailable` reicht diese Seite
 * durch — sie hat die Antwort aus `/api/courses/manage` ohnehin schon.
 */
const paidAvailable = computed(() => data.value?.paidAvailable === true)

/** Ein frisch angelegter Kurs ist eine leere Hülle — weiter in den Builder. */
function onCreated(row: CourseRow) {
  void navigateTo(localePath(`/dashboard/courses/${row.$id}`))
}

const statusColor = (row: CourseRow) =>
  row.status === 'published' ? 'success' as const : row.status === 'archived' ? 'neutral' as const : 'warning' as const

// Nebenspalten fallen auf schmalen Schirmen weg — Titel, Status und die
// Aktion tragen die Entscheidung.
const HIDE_SM = { td: 'hidden sm:table-cell', th: 'hidden sm:table-cell' }
const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }

const columns = computed<TableColumn<CourseRow>[]>(() => [
  { accessorKey: 'title', header: () => t('courses.admin.col.title') },
  { accessorKey: 'slug', header: () => t('courses.admin.col.slug'), meta: { class: HIDE_MD } },
  { accessorKey: 'access', header: () => t('courses.admin.col.access'), meta: { class: HIDE_SM } },
  { accessorKey: 'lessonCount', header: () => t('courses.admin.col.lessons'), meta: { class: HIDE_SM } },
  { accessorKey: 'status', header: () => t('courses.admin.col.status') },
  { id: 'actions', header: srOnlyHeader(() => t('ui.table.actions')) },
])
</script>

<template>
  <UDashboardPanel id="courses-admin">
    <template #header>
      <UDashboardNavbar :title="t('courses.admin.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-ph-plus" size="sm" data-testid="course-create" @click="() => { modalOpen = true }">
            {{ t('courses.admin.create') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <ClientOnly>
        <template #fallback>
          <div class="flex justify-center py-16"><UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" /></div>
        </template>

        <div v-if="status === 'pending' && !data" class="flex justify-center py-16">
          <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
        </div>

        <UTable v-else :data="data?.rows ?? []" :columns="columns" data-testid="courses-admin-list">
          <template #title-cell="{ row }">
            <ULink
              :to="localePath(`/dashboard/courses/${row.original.$id}`)"
              class="font-medium text-default hover:text-primary hover:underline"
            >
              {{ row.original.title }}
            </ULink>
          </template>
          <template #slug-cell="{ row }">
            <span class="font-mono text-xs text-muted">/{{ row.original.slug }}</span>
          </template>
          <template #access-cell="{ row }">
            {{ t(`courses.access.${row.original.access}`) }}
          </template>
          <template #lessonCount-cell="{ row }">
            <span class="tabular-nums">{{ row.original.lessonCount }}</span>
          </template>
          <template #status-cell="{ row }">
            <UBadge :color="statusColor(row.original)" variant="subtle" size="sm">{{ t(`courses.status.${row.original.status}`) }}</UBadge>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <UButton
                color="neutral" variant="ghost" size="xs" icon="i-ph-pencil-simple"
                :to="localePath(`/dashboard/courses/${row.original.$id}`)"
                :data-course-edit="row.original.$id"
              >
                {{ t('courses.admin.edit') }}
              </UButton>
            </div>
          </template>
          <!-- „noch nichts angelegt" → der eine nächste Schritt ist Anlegen -->
          <template #empty>
            <CoreEmptyState
              icon="i-ph-graduation-cap"
              :title="t('courses.admin.emptyTitle')"
              :description="t('courses.admin.empty')"
              :action-label="t('courses.admin.create')"
              action-icon="i-ph-plus"
              @action="() => { modalOpen = true }"
            />
          </template>
        </UTable>
      </ClientOnly>

      <CourseFormModal v-model:open="modalOpen" :paid-available="paidAvailable" @created="onCreated" />
    </template>
  </UDashboardPanel>
</template>
