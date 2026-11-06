<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { RecentRunsResponse, RunRow, RunnerPublic, RunnerUpdatedResponse, RunnersListResponse } from '../../../shared/types/runner'

/**
 * AI-Runner — Rechner verwalten und Läufe verfolgen
 * (docs/plans/AI-RUNNER.md § 9, Paket 3).
 *
 * Zwei Tabellen, zwei Fragen: WELCHE Rechner gibt es (und meldet sich einer
 * noch?) und WAS lief zuletzt. Beides sind Datenlisten mit gleichartigen
 * Zeilen — also `UTable` (B6), inklusive der Leerzustände über
 * `CoreEmptyState`.
 *
 * Operator-only: `runner.manage` hängt bewusst NUR in der Admin-Rolle
 * (§ 4) — ein Lauf trägt Repo-Schlüssel, Branch-Namen und Kosten von Davids
 * Rechner, das ist keine Moderations-Sache.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'runner.manage' })

const { t } = useI18n()
const toast = useToast()
const { formatRelativeTime } = useFormatRelativeTime()

useBrandTitle(() => t('runner.page.title'))

const registerOpen = ref(false)
const updating = ref('')

const { data: runnersData, refresh: refreshRunners, error: runnersError } = await useFetch<RunnersListResponse>('/api/runner/runners', { server: false })
const { data: runsData, refresh: refreshRuns, error: runsError } = await useFetch<RecentRunsResponse>('/api/runner/runs/recent', { server: false })

const runners = computed<RunnerPublic[]>(() => runnersData.value?.runners ?? [])
const runs = computed<RunRow[]>(() => runsData.value?.runs ?? [])

/**
 * Stilllegen ist der AUS-SCHALTER der Naht: `requireRunner` weist einen
 * `status !== 'active'`-Rechner ab, und zwar VOR dem Secret-Vergleich. Das ist
 * der Weg für ein abhandengekommenes Token — gelöscht wird bewusst nicht, sonst
 * verlören alte Läufe die Herkunft ihrer `runnerId`.
 */
async function toggleStatus(runner: RunnerPublic) {
  updating.value = runner.$id
  const next = runner.status === 'active' ? 'disabled' : 'active'
  try {
    await $fetch<RunnerUpdatedResponse>(`/api/runner/runners/${runner.$id}`, { method: 'PATCH', body: { status: next } })
    await refreshRunners()
    toast.add({ title: t('runner.runners.updated'), color: 'success' })
  }
  catch {
    toast.add({ title: t('runner.runners.updateFailed'), description: t('runner.runners.updateFailedHint'), color: 'error' })
  }
  finally {
    updating.value = ''
  }
}

const HIDE_SM = { td: 'hidden sm:table-cell', th: 'hidden sm:table-cell' }

const runnerColumns = computed<TableColumn<RunnerPublic>[]>(() => [
  { accessorKey: 'name', header: () => t('runner.runners.col.name') },
  { accessorKey: 'kind', header: () => t('runner.runners.col.kind'), id: 'kind', meta: { class: HIDE_SM } },
  { accessorKey: 'status', header: () => t('runner.runners.col.status'), id: 'status' },
  { accessorKey: 'lastSeenAt', header: () => t('runner.runners.col.lastSeen'), id: 'lastSeen' },
  { id: 'actions', header: srOnlyHeader(() => t('ui.table.actions')) },
])

const runColumns = computed<TableColumn<RunRow>[]>(() => [
  { accessorKey: 'subjectId', header: () => t('runner.runs.col.subject'), id: 'subject' },
  { accessorKey: 'status', header: () => t('runner.runs.col.status'), id: 'status' },
  { accessorKey: 'model', header: () => t('runner.runs.col.model'), id: 'model', meta: { class: HIDE_SM } },
  { accessorKey: '$createdAt', header: () => t('runner.runs.col.created'), id: 'created' },
  { accessorKey: 'finishedAt', header: () => t('runner.runs.col.duration'), id: 'duration', meta: { class: HIDE_SM } },
])

function durationText(run: RunRow): string {
  const ms = runDurationMs(run)
  return ms === null ? '—' : formatDurationMs(ms)
}
</script>

<template>
  <UDashboardPanel id="runner">
    <template #header>
      <UDashboardNavbar :title="t('runner.page.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-ph-plus" size="sm" data-runner-register @click="() => { registerOpen = true }">
            {{ t('runner.runners.register') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="mb-3 text-sm text-muted">{{ t('runner.page.subtitle') }}</p>

      <!-- Ein Fetch-Fehler ist KEINE leere Liste (401/Session/Netz) -->
      <UAlert
        v-if="runnersError || runsError"
        color="error"
        variant="subtle"
        icon="i-ph-warning"
        :title="t('runner.page.loadFailed')"
        class="mb-4"
        :actions="[{ label: t('runner.page.retry'), color: 'error', variant: 'solid', onClick: () => { void refreshRunners(); void refreshRuns() } }]"
      />

      <section class="space-y-2">
        <h2 class="text-sm font-semibold">{{ t('runner.runners.title') }}</h2>
        <UTable :data="runners" :columns="runnerColumns" data-runners-table>
          <template #kind-cell="{ row }">
            <span class="text-muted">{{ t(`runner.runners.kind.${row.original.kind}`) }}</span>
          </template>
          <template #status-cell="{ row }">
            <UBadge
              :color="row.original.status === 'active' ? 'success' : 'neutral'"
              :icon="row.original.status === 'active' ? 'i-ph-check-circle' : 'i-ph-prohibit'"
              variant="subtle"
              size="sm"
            >
              {{ t(`runner.runners.status.${row.original.status}`) }}
            </UBadge>
          </template>
          <template #lastSeen-cell="{ row }">
            <span class="whitespace-nowrap text-muted">
              {{ row.original.lastSeenAt ? formatRelativeTime(row.original.lastSeenAt) : t('runner.runners.never') }}
            </span>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <UButton
                size="xs"
                color="neutral"
                variant="subtle"
                :icon="row.original.status === 'active' ? 'i-ph-pause' : 'i-ph-play'"
                :loading="updating === row.original.$id"
                :disabled="!!updating"
                :data-runner-toggle="row.original.$id"
                @click="toggleStatus(row.original)"
              >
                {{ row.original.status === 'active' ? t('runner.runners.disable') : t('runner.runners.enable') }}
              </UButton>
            </div>
          </template>
          <template #empty>
            <CoreEmptyState
              icon="i-ph-desktop"
              :title="t('runner.runners.emptyTitle')"
              :description="t('runner.runners.empty')"
              :action-label="t('runner.runners.register')"
              action-icon="i-ph-plus"
              @action="() => { registerOpen = true }"
            />
          </template>
        </UTable>
      </section>

      <section class="mt-8 space-y-2">
        <h2 class="text-sm font-semibold">{{ t('runner.runs.title') }}</h2>
        <UTable :data="runs" :columns="runColumns" data-runs-table>
          <!-- KEIN Link auf das Subjekt: der Layer weiß nicht, was ein 'ticket'
               ist, und wo dessen Karte hängt (A14). Die Verdrahtung gehört der
               App — hier steht, WAS es war, nicht WO es liegt. -->
          <template #subject-cell="{ row }">
            <span class="whitespace-nowrap text-sm">
              {{ row.original.subjectType }}
              <span class="ms-1 font-mono text-xs text-dimmed">{{ row.original.subjectId }}</span>
            </span>
          </template>
          <template #status-cell="{ row }">
            <RunnerStatusBadge :status="row.original.status" />
          </template>
          <template #model-cell="{ row }">
            <span class="whitespace-nowrap text-muted">{{ row.original.model }}</span>
          </template>
          <template #created-cell="{ row }">
            <span class="whitespace-nowrap text-muted">{{ formatRelativeTime(row.original.$createdAt) }}</span>
          </template>
          <template #duration-cell="{ row }">
            <span class="whitespace-nowrap tabular-nums text-muted">{{ durationText(row.original) }}</span>
          </template>
          <template #empty>
            <!-- OHNE Aktion: ein Lauf startet AM Subjekt (im Ticket), nicht
                 hier — ein Knopf in dieser Tabelle hätte kein Ziel. -->
            <CoreEmptyState
              icon="i-ph-rocket-launch"
              :title="t('runner.runs.emptyTitle')"
              :description="t('runner.runs.empty')"
            />
          </template>
        </UTable>
      </section>

      <RunnerRegisterModal v-model:open="registerOpen" @registered="() => { void refreshRunners() }" />
    </template>
  </UDashboardPanel>
</template>
