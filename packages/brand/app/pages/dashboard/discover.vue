<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import {
  BRAND_PUBLICATION_DEFAULT_FILTER,
  BRAND_PUBLICATION_FILTERS,
  BRAND_PUBLICATION_NOTE_MAX,
  type BrandPublicationFilter,
  brandPublicationFilterCount,
} from '../../../shared/brandPublication'
import type {
  BrandPublicationAdminDecisionResponse,
  BrandPublicationAdminItem,
  BrandPublicationAdminListResponse,
  BrandPublicationFlagResponse,
  BrandPublicationReport,
  BrandPublicationReportListResponse,
  BrandPublicationReportResolveResponse,
} from '../../../shared/types/brand'

/**
 * DIE MODERATION DER ÖFFENTLICHEN GALERIE — `/dashboard/discover`
 * (docs/plans/DISCOVER-BRANDS.md §4.4, Davids Entscheidung §9.1: FREIGABE VOR
 * VERÖFFENTLICHUNG; Vorlage ist der abgenommene Klickdummy
 * `.playground/app/pages/brand/demo/discover-admin.vue`).
 *
 * Die dritte Betreiber-Fläche dieses Layers nach Warteliste und Korrekturen
 * und folgt ihnen in allem — `UTable` (Davids B6-Regel), `CoreEmptyState`,
 * `users.manage`, `dashboardScope: 'operator'`, Cursor-Paginierung.
 *
 * ── VIER REITER, VIER FRAGEN ──────────────────────────────────────────────
 *  · Warteschlange — was will veröffentlicht werden?
 *  · Veröffentlicht — was steht draussen? (ausgeblendete gedämpft dazwischen)
 *  · Abgelehnt & zurückgezogen — was ist erledigt?
 *  · Meldungen — was hat jemand beanstandet?
 * Die ersten drei sind DIESELBE Liste mit einem anderen Filter (die Zuordnung
 * Reiter → Zustände steht pur in `shared/brandPublication.ts`), der vierte ist
 * eine eigene Route. Deshalb zwei Lade-Funktionen und nicht vier.
 *
 * ── GEBLÄTTERT WIRD ÜBER EINEN CURSOR, ALSO WIRD ANGEHÄNGT ────────────────
 * Wie bei den Korrekturen: von Hand geladen (ein `ref` plus `load()`) statt
 * über eine reaktive `useFetch`-Query. `useFetch` ERSETZT seine Daten bei jeder
 * Änderung, und eine Cursor-Liste, die beim Nachladen ihren Anfang verliert,
 * ist keine.
 *
 * ── DIE VORSCHAU EINER WARTENDEN MARKE ────────────────────────────────────
 * `/discover/<slug>?preview=1`. Öffentlich antwortet diese Adresse 404,
 * solange nichts freigegeben ist — der Parameter ist die verabredete
 * SCHNITTSTELLE zu Paket D2: die Anatomie-Seite darf ihn für `users.manage`
 * auswerten und dann den `pendingSnapshot` rendern. Bis D2 das tut, führt der
 * Link ins Leere; er steht trotzdem hier, weil die Alternative („später
 * einbauen") in genau der Ecke landet, in der niemand mehr nachsieht. Für
 * bereits öffentliche Marken ist es der gewöhnliche Link ohne Parameter.
 */
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'admin'],
  requiredCapability: 'users.manage',
  dashboardScope: 'operator',
})

const { t, te, locale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
useBrandTitle(() => t('brand.discoverAdmin.title'))

type Tab = BrandPublicationFilter | 'reports'

const tab = ref<Tab>(BRAND_PUBLICATION_DEFAULT_FILTER)
const items = ref<BrandPublicationAdminItem[]>([])
const counts = ref<Record<string, number>>({})
const total = ref(0)
const nextCursor = ref('')

const reports = ref<BrandPublicationReport[]>([])
const reportCounts = ref<Record<string, number>>({})
const reportTotal = ref(0)
const reportCursor = ref('')

const loading = ref(false)
const busy = ref<string | null>(null)

/**
 * Der fachliche Grund reist als `data.code` durch den zentralen Fehler-Handler
 * und kommt als `error.data.reason` an (CLAUDE.md). Ein unbekannter Code fällt
 * auf den allgemeinen Satz zurück.
 */
function failToast(error: unknown): void {
  const reason = (error as { data?: { reason?: string } })?.data?.reason ?? ''
  const key = `brand.discoverAdmin.error.${reason}`
  toast.add({
    title: t('brand.discoverAdmin.actionFailed'),
    description: reason && te(key) ? t(key) : t('brand.discoverAdmin.error.generic'),
    color: 'error',
  })
}

// ── Laden ──────────────────────────────────────────────────────────────────

async function loadPublications(append: boolean): Promise<void> {
  const filter = tab.value === 'reports' ? BRAND_PUBLICATION_DEFAULT_FILTER : tab.value
  loading.value = true
  try {
    const response = await $fetch<BrandPublicationAdminListResponse>('/api/brand/admin/publications', {
      query: { status: filter, cursor: append ? nextCursor.value : '' },
    })
    items.value = append ? [...items.value, ...response.items] : response.items
    counts.value = response.counts
    total.value = response.total
    nextCursor.value = response.nextCursor
  }
  catch (error) {
    failToast(error)
  }
  finally {
    loading.value = false
  }
}

async function loadReports(append: boolean): Promise<void> {
  loading.value = true
  try {
    const response = await $fetch<BrandPublicationReportListResponse>('/api/brand/admin/publication-reports', {
      // Die Betreiber-Liste zeigt hier ALLE Meldungen, nicht nur die offenen:
      // der Reiter ist selbst schon der Filter, und „was habe ich zuletzt
      // erledigt?" ist die häufigste Rückfrage an eine Melde-Liste.
      query: { status: 'all', cursor: append ? reportCursor.value : '' },
    })
    reports.value = append ? [...reports.value, ...response.items] : response.items
    reportCounts.value = response.counts
    reportTotal.value = response.total
    reportCursor.value = response.nextCursor
  }
  catch (error) {
    failToast(error)
  }
  finally {
    loading.value = false
  }
}

async function reload(append = false): Promise<void> {
  if (tab.value === 'reports') await loadReports(append)
  else await loadPublications(append)
}

/** Ein Reiterwechsel ist eine NEUE Liste, kein Nachschlag — Cursor zurück. */
watch(tab, () => {
  nextCursor.value = ''
  reportCursor.value = ''
  reload(false)
})

onMounted(async () => {
  await reload(false)
  // Die Zahl am Reiter „Meldungen" soll von Anfang an stimmen, auch wenn man
  // ihn nie öffnet — sonst stünde dort eine 0, die nichts über die Ablage sagt.
  // Andersherum braucht der Melde-Reiter die Veröffentlichungs-Zähler.
  if (tab.value === 'reports') await loadPublications(false)
  else await loadReports(false)
})

const tabs = computed(() => [
  ...BRAND_PUBLICATION_FILTERS.filter(value => value !== 'all').map(value => ({
    value: value as Tab,
    label: t(`brand.discoverAdmin.tab.${value}`),
    count: brandPublicationFilterCount(value, counts.value),
  })),
  {
    value: 'reports' as Tab,
    label: t('brand.discoverAdmin.tab.reports'),
    count: reportCounts.value.open ?? 0,
  },
])

// ── Entscheiden ────────────────────────────────────────────────────────────

const declining = ref<BrandPublicationAdminItem | null>(null)
const hiding = ref<BrandPublicationAdminItem | null>(null)
const note = ref('')

function openDecline(entry: BrandPublicationAdminItem): void {
  declining.value = entry
  note.value = ''
}

function openHide(entry: BrandPublicationAdminItem): void {
  hiding.value = entry
  note.value = ''
}

async function act(
  entry: BrandPublicationAdminItem,
  action: 'approve' | 'unhide',
): Promise<void> {
  busy.value = entry.id
  try {
    await $fetch<BrandPublicationAdminDecisionResponse>(
      `/api/brand/admin/publications/${entry.id}/${action}`,
      { method: 'POST' },
    )
    toast.add({
      title: t(action === 'approve' ? 'brand.discoverAdmin.approved' : 'brand.discoverAdmin.unhiddenToast'),
      color: 'success',
    })
  }
  catch (error) {
    failToast(error)
  }
  finally {
    busy.value = null
    // Auch im Fehlerfall neu laden: bei `already_decided` steht die Wahrheit
    // schon in der Ablage, und der Betreiber soll sie sehen statt sie zu raten.
    nextCursor.value = ''
    await loadPublications(false)
  }
}

async function decline(): Promise<void> {
  const entry = declining.value
  if (!entry || !note.value.trim()) return
  busy.value = entry.id
  try {
    const response = await $fetch<BrandPublicationAdminDecisionResponse>(
      `/api/brand/admin/publications/${entry.id}/decline`,
      { method: 'POST', body: { decisionNote: note.value } },
    )
    declining.value = null
    toast.add({
      title: t(response.keepsPublicStand
        ? 'brand.discoverAdmin.declinedKept'
        : 'brand.discoverAdmin.declined'),
      color: 'success',
    })
  }
  catch (error) {
    failToast(error)
  }
  finally {
    busy.value = null
    nextCursor.value = ''
    await loadPublications(false)
  }
}

async function hide(): Promise<void> {
  const entry = hiding.value
  if (!entry || !note.value.trim()) return
  busy.value = entry.id
  try {
    await $fetch<BrandPublicationAdminDecisionResponse>(
      `/api/brand/admin/publications/${entry.id}/hide`,
      { method: 'POST', body: { decisionNote: note.value } },
    )
    hiding.value = null
    toast.add({ title: t('brand.discoverAdmin.hiddenToast'), color: 'success' })
  }
  catch (error) {
    failToast(error)
  }
  finally {
    busy.value = null
    nextCursor.value = ''
    await loadPublications(false)
  }
}

/**
 * Brand of the Day. Die Antwort sagt, ob eine vorige ABGELÖST wurde — ohne
 * diese Auskunft sähe der Betreiber die Ablösung erst beim nächsten Laden und
 * hielte sie womöglich für einen Fehler.
 */
async function setFeatured(entry: BrandPublicationAdminItem, featured: boolean): Promise<void> {
  busy.value = entry.id
  try {
    const response = await $fetch<BrandPublicationFlagResponse>(
      `/api/brand/admin/publications/${entry.id}/feature`,
      { method: 'POST', body: { featured } },
    )
    toast.add({
      title: featured
        ? t(response.replacedId ? 'brand.discoverAdmin.featuredReplaced' : 'brand.discoverAdmin.featuredOn')
        : t('brand.discoverAdmin.featuredOff'),
      color: 'success',
    })
  }
  catch (error) {
    failToast(error)
  }
  finally {
    busy.value = null
    nextCursor.value = ''
    await loadPublications(false)
  }
}

async function setExample(entry: BrandPublicationAdminItem, example: boolean): Promise<void> {
  busy.value = entry.id
  try {
    await $fetch<BrandPublicationFlagResponse>(
      `/api/brand/admin/publications/${entry.id}/example`,
      { method: 'POST', body: { example } },
    )
    toast.add({
      title: t(example ? 'brand.discoverAdmin.exampleOn' : 'brand.discoverAdmin.exampleOff'),
      color: 'success',
    })
  }
  catch (error) {
    failToast(error)
  }
  finally {
    busy.value = null
    nextCursor.value = ''
    await loadPublications(false)
  }
}

async function resolveReport(entry: BrandPublicationReport): Promise<void> {
  busy.value = entry.id
  try {
    await $fetch<BrandPublicationReportResolveResponse>(
      `/api/brand/admin/publication-reports/${entry.id}/resolve`,
      { method: 'POST' },
    )
    toast.add({ title: t('brand.discoverAdmin.reportResolved'), color: 'success' })
  }
  catch (error) {
    failToast(error)
  }
  finally {
    busy.value = null
    reportCursor.value = ''
    await loadReports(false)
  }
}

// ── Darstellung ────────────────────────────────────────────────────────────

const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))
function formatDate(value: string): string {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? dateFormat.value.format(parsed) : ''
}

/** Website-Score oder Fundament-Reife — beide klar beschriftet (Entscheidung 3). */
function scoreLabel(entry: BrandPublicationAdminItem): string {
  if (entry.score === null || !entry.scoreSource) return t('brand.discoverAdmin.score.none')
  return t(`brand.discoverAdmin.score.${entry.scoreSource}`)
}

function ownerLabel(entry: BrandPublicationAdminItem): string {
  return entry.ownerId
    ? t('brand.discoverAdmin.owner', { id: entry.ownerId })
    : t('brand.discoverAdmin.ownerUnknown')
}

/** Die Vorschau-Adresse — Begründung zum `?preview=1` im Kopf der Seite. */
function previewPath(entry: BrandPublicationAdminItem): string {
  return entry.status === 'published' ? entry.path : `${entry.path}?preview=1`
}

const statusColor: Record<string, 'neutral' | 'success' | 'warning' | 'error'> = {
  pending: 'neutral',
  published: 'success',
  declined: 'warning',
  hidden: 'error',
  withdrawn: 'neutral',
}

const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }
const HIDE_LG = { td: 'hidden lg:table-cell', th: 'hidden lg:table-cell' }

/**
 * Die Spalten wechseln mit dem Reiter: in der Warteschlange zählt „wann
 * eingereicht", bei den öffentlichen „seit wann draussen" und die zwei
 * Schalter. Eine Tabelle, die überall dieselben neun Spalten zeigt, zeigt in
 * jedem Reiter drei leere.
 */
const columns = computed<TableColumn<BrandPublicationAdminItem>[]>(() => {
  const base: TableColumn<BrandPublicationAdminItem>[] = [
    { accessorKey: 'title', header: () => t('brand.discoverAdmin.col.brand') },
    { accessorKey: 'status', header: () => t('brand.discoverAdmin.col.status') },
    { id: 'score', header: () => t('brand.discoverAdmin.col.score'), meta: { class: HIDE_MD } },
  ]
  if (tab.value === 'pending') {
    base.push({
      accessorKey: 'submittedAt',
      header: () => t('brand.discoverAdmin.col.submitted'),
      meta: { class: HIDE_MD },
    })
  }
  else {
    base.push({
      accessorKey: 'publishedAt',
      header: () => t('brand.discoverAdmin.col.published'),
      meta: { class: HIDE_MD },
    })
  }
  if (tab.value === 'live') {
    base.push(
      { accessorKey: 'reportCount', header: () => t('brand.discoverAdmin.col.reports'), meta: { class: HIDE_LG } },
      { id: 'featured', header: () => t('brand.discoverAdmin.col.featured'), meta: { class: HIDE_LG } },
      { id: 'example', header: () => t('brand.discoverAdmin.col.example'), meta: { class: HIDE_LG } },
    )
  }
  base.push({ id: 'actions', header: srOnlyHeader(() => t('ui.table.actions')) })
  return base
})

const reportColumns = computed<TableColumn<BrandPublicationReport>[]>(() => [
  { accessorKey: 'title', header: () => t('brand.discoverAdmin.col.brand') },
  { accessorKey: 'reason', header: () => t('brand.discoverAdmin.col.reason') },
  { accessorKey: 'status', header: () => t('brand.discoverAdmin.col.status'), meta: { class: HIDE_MD } },
  { accessorKey: 'createdAt', header: () => t('brand.discoverAdmin.col.received'), meta: { class: HIDE_LG } },
  { id: 'actions', header: srOnlyHeader(() => t('ui.table.actions')) },
])
</script>

<template>
  <UDashboardPanel id="brand-discover">
    <template #header>
      <UDashboardNavbar :title="t('brand.discoverAdmin.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-ph-arrows-clockwise"
            color="neutral"
            variant="ghost"
            :loading="loading"
            :aria-label="t('brand.discoverAdmin.refresh')"
            @click="reload(false)"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="mb-4 text-sm text-muted">{{ t('brand.discoverAdmin.subtitle') }}</p>

      <!-- Die vier Reiter mit ihren Zählern -->
      <div class="mb-6 flex flex-wrap gap-2" data-discover-admin-tabs>
        <UButton
          v-for="entry in tabs"
          :key="entry.value"
          :color="tab === entry.value ? 'primary' : 'neutral'"
          :variant="tab === entry.value ? 'solid' : 'subtle'"
          size="sm"
          :data-discover-admin-tab="entry.value"
          @click="tab = entry.value"
        >
          {{ entry.label }}
          <UBadge color="neutral" variant="subtle" size="sm">{{ entry.count }}</UBadge>
        </UButton>
      </div>

      <!-- MELDUNGEN -->
      <template v-if="tab === 'reports'">
        <UTable :data="reports" :columns="reportColumns" :loading="loading" data-discover-admin-reports>
          <template #title-cell="{ row }">
            <div class="min-w-0">
              <NuxtLink
                v-if="row.original.path"
                :to="localePath(row.original.path)"
                class="font-medium hover:underline"
              >{{ row.original.title || row.original.slug }}</NuxtLink>
              <span v-else class="font-medium">{{ row.original.publicationId }}</span>
              <p class="text-xs text-dimmed">
                {{ row.original.reporterEmail || t('brand.discoverAdmin.reporterAnonymous') }}
              </p>
            </div>
          </template>

          <template #reason-cell="{ row }">
            <!-- `whitespace-normal` ist Pflicht: `UTable` setzt in der Zelle
                 `whitespace-nowrap`, und ohne das Gegenmittel wird der Grund
                 nicht umgebrochen, sondern hart abgeschnitten. -->
            <p class="line-clamp-3 max-w-md whitespace-normal text-sm text-muted" :title="row.original.reason">
              {{ row.original.reason }}
            </p>
          </template>

          <template #status-cell="{ row }">
            <UBadge :color="row.original.status === 'open' ? 'warning' : 'neutral'" variant="subtle" size="sm">
              {{ t(`brand.discoverAdmin.reportStatus.${row.original.status}`) }}
            </UBadge>
          </template>

          <template #createdAt-cell="{ row }">
            <span class="text-sm text-dimmed">{{ formatDate(row.original.createdAt) }}</span>
          </template>

          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <UButton
                v-if="row.original.status === 'open'"
                size="xs"
                color="neutral"
                variant="subtle"
                :loading="busy === row.original.id"
                :label="t('brand.discoverAdmin.action.resolve')"
                :data-discover-admin-resolve="row.original.id"
                @click="resolveReport(row.original)"
              />
              <span v-else class="text-xs text-dimmed">{{ formatDate(row.original.decidedAt) }}</span>
            </div>
          </template>

          <template #empty>
            <CoreEmptyState
              icon="i-ph-flag"
              :title="t('brand.discoverAdmin.reportsEmptyTitle')"
              :description="t('brand.discoverAdmin.reportsEmpty')"
              data-discover-admin-reports-empty
            />
          </template>
        </UTable>

        <div v-if="reportCursor" class="mt-6 flex justify-center">
          <UButton
            color="neutral"
            variant="subtle"
            :loading="loading"
            :label="t('brand.discoverAdmin.more')"
            @click="reload(true)"
          />
        </div>
        <p v-else-if="reports.length" class="mt-6 text-center text-xs text-dimmed">
          {{ t('brand.discoverAdmin.shown', { count: reports.length, total: reportTotal }) }}
        </p>
      </template>

      <!-- VERÖFFENTLICHUNGEN -->
      <template v-else>
        <UTable :data="items" :columns="columns" :loading="loading" data-discover-admin-list>
          <template #title-cell="{ row }">
            <!-- Ausgeblendetes wird GEDÄMPFT, nicht versteckt: es steht im
                 selben Reiter wie das Öffentliche, weil es dorthin gehört. -->
            <div class="min-w-0" :class="row.original.status === 'hidden' ? 'opacity-60' : ''">
              <p class="flex items-center gap-2 font-medium">
                {{ row.original.title || row.original.slug }}
                <UBadge v-if="row.original.example" color="neutral" variant="subtle" size="sm">
                  {{ t('brand.discoverAdmin.col.example') }}
                </UBadge>
                <UBadge v-if="row.original.featured" color="primary" variant="subtle" size="sm">
                  {{ t('brand.discoverAdmin.col.featured') }}
                </UBadge>
              </p>
              <p class="text-xs text-dimmed">{{ row.original.path }} · {{ ownerLabel(row.original) }}</p>
              <p v-if="row.original.decisionNote" class="line-clamp-1 text-xs text-muted" :title="row.original.decisionNote">
                {{ row.original.decisionNote }}
              </p>
            </div>
          </template>

          <template #status-cell="{ row }">
            <UBadge :color="statusColor[row.original.status] ?? 'neutral'" variant="subtle" size="sm">
              {{ t(`brand.discoverAdmin.status.${row.original.status}`) }}
            </UBadge>
          </template>

          <template #score-cell="{ row }">
            <div class="min-w-0">
              <p class="text-sm font-medium">{{ row.original.score ?? '—' }}</p>
              <p class="text-xs text-dimmed">{{ scoreLabel(row.original) }}</p>
            </div>
          </template>

          <template #submittedAt-cell="{ row }">
            <span class="text-sm text-dimmed">{{ formatDate(row.original.submittedAt) }}</span>
          </template>

          <template #publishedAt-cell="{ row }">
            <span class="text-sm text-dimmed">{{ formatDate(row.original.publishedAt) }}</span>
          </template>

          <template #reportCount-cell="{ row }">
            <UBadge v-if="row.original.reportCount" color="warning" variant="subtle" size="sm">
              {{ row.original.reportCount }}
            </UBadge>
            <span v-else class="text-dimmed">—</span>
          </template>

          <template #featured-cell="{ row }">
            <USwitch
              :model-value="row.original.featured"
              :disabled="busy === row.original.id || row.original.status !== 'published'"
              :aria-label="t('brand.discoverAdmin.col.featured')"
              :data-discover-admin-featured="row.original.id"
              @update:model-value="(value: boolean) => setFeatured(row.original, value)"
            />
          </template>

          <template #example-cell="{ row }">
            <USwitch
              :model-value="row.original.example"
              :disabled="busy === row.original.id"
              :aria-label="t('brand.discoverAdmin.col.example')"
              :data-discover-admin-example="row.original.id"
              @update:model-value="(value: boolean) => setExample(row.original, value)"
            />
          </template>

          <template #actions-cell="{ row }">
            <div class="flex flex-wrap justify-end gap-2">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-ph-eye"
                :to="localePath(previewPath(row.original))"
                :label="t('brand.discoverAdmin.action.preview')"
                :data-discover-admin-preview="row.original.id"
              />
              <template v-if="row.original.status === 'pending'">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="subtle"
                  :loading="busy === row.original.id"
                  :label="t('brand.discoverAdmin.action.approve')"
                  :data-discover-admin-approve="row.original.id"
                  @click="act(row.original, 'approve')"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :label="t('brand.discoverAdmin.action.decline')"
                  :data-discover-admin-decline="row.original.id"
                  @click="openDecline(row.original)"
                />
              </template>
              <UButton
                v-else-if="row.original.status === 'published'"
                size="xs"
                color="neutral"
                variant="ghost"
                :label="t('brand.discoverAdmin.action.hide')"
                :data-discover-admin-hide="row.original.id"
                @click="openHide(row.original)"
              />
              <UButton
                v-else-if="row.original.status === 'hidden'"
                size="xs"
                color="neutral"
                variant="subtle"
                :loading="busy === row.original.id"
                :label="t('brand.discoverAdmin.action.unhide')"
                :data-discover-admin-unhide="row.original.id"
                @click="act(row.original, 'unhide')"
              />
            </div>
          </template>

          <template #empty>
            <CoreEmptyState
              icon="i-ph-globe-hemisphere-west"
              :title="t('brand.discoverAdmin.emptyTitle')"
              :description="t('brand.discoverAdmin.empty')"
              data-discover-admin-empty
            />
          </template>
        </UTable>

        <div v-if="nextCursor" class="mt-6 flex justify-center">
          <UButton
            color="neutral"
            variant="subtle"
            :loading="loading"
            :label="t('brand.discoverAdmin.more')"
            data-discover-admin-more
            @click="reload(true)"
          />
        </div>
        <p v-else-if="items.length" class="mt-6 text-center text-xs text-dimmed">
          {{ t('brand.discoverAdmin.shown', { count: items.length, total }) }}
        </p>
      </template>

      <!-- ABLEHNEN: die Begründung ist PFLICHT (der Kunde sieht sie) -->
      <UModal
        :open="Boolean(declining)"
        :title="t('brand.discoverAdmin.declineTitle')"
        @update:open="(open: boolean) => { if (!open) declining = null }"
      >
        <template #body>
          <p class="text-sm">
            {{ declining?.status === 'published' || declining?.publishedAt
              ? t('brand.discoverAdmin.declineUpdateText', { title: declining?.title ?? '' })
              : t('brand.discoverAdmin.declineText', { title: declining?.title ?? '' }) }}
          </p>
          <UFormField
            class="mt-4"
            :label="t('brand.discoverAdmin.noteLabel')"
            :description="t('brand.discoverAdmin.noteHint')"
            :hint="`${note.length}/${BRAND_PUBLICATION_NOTE_MAX}`"
            required
          >
            <UTextarea
              v-model="note"
              :rows="4"
              :maxlength="BRAND_PUBLICATION_NOTE_MAX"
              :placeholder="t('brand.discoverAdmin.notePlaceholder')"
              class="w-full"
              autofocus
              data-discover-admin-decline-note
            />
          </UFormField>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('ui.cancel')" @click="declining = null" />
            <UButton
              color="error"
              :disabled="!note.trim()"
              :loading="busy === declining?.id"
              :label="t('brand.discoverAdmin.action.decline')"
              data-discover-admin-decline-confirm
              @click="decline()"
            />
          </div>
        </template>
      </UModal>

      <!-- AUSBLENDEN: dasselbe Muster, dieselbe Pflicht (Entscheidung 8) -->
      <UModal
        :open="Boolean(hiding)"
        :title="t('brand.discoverAdmin.hideTitle')"
        @update:open="(open: boolean) => { if (!open) hiding = null }"
      >
        <template #body>
          <p class="text-sm">{{ t('brand.discoverAdmin.hideText', { title: hiding?.title ?? '' }) }}</p>
          <UFormField
            class="mt-4"
            :label="t('brand.discoverAdmin.noteLabel')"
            :description="t('brand.discoverAdmin.noteHint')"
            :hint="`${note.length}/${BRAND_PUBLICATION_NOTE_MAX}`"
            required
          >
            <UTextarea
              v-model="note"
              :rows="4"
              :maxlength="BRAND_PUBLICATION_NOTE_MAX"
              :placeholder="t('brand.discoverAdmin.notePlaceholder')"
              class="w-full"
              autofocus
              data-discover-admin-hide-note
            />
          </UFormField>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('ui.cancel')" @click="hiding = null" />
            <UButton
              color="error"
              :disabled="!note.trim()"
              :loading="busy === hiding?.id"
              :label="t('brand.discoverAdmin.action.hide')"
              data-discover-admin-hide-confirm
              @click="hide()"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
