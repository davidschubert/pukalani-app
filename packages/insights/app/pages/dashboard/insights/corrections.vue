<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { InsightsCorrectionStatus } from '../../../../shared/insightsCorrection'
import {
  INSIGHTS_CORRECTION_NOTE_MAX,
  INSIGHTS_CORRECTION_STATUSES,
} from '../../../../shared/insightsCorrection'
import type {
  InsightsCorrectionDecisionResponse,
  InsightsCorrectionListItem,
  InsightsCorrectionsListResponse,
} from '../../../../shared/types/insightsApi'

/**
 * DIE KORREKTURVORSCHLÄGE UND ENTFERNUNGS-WÜNSCHE (§9.3/§9.4, Adresse
 * `/dashboard/insights/corrections`).
 *
 * Muster: `/dashboard/brand-check/corrections` aus dem brand-Layer — dieselbe
 * Form (Reiter mit Zählern, `UTable` nach der B6-Regel, `CoreEmptyState`,
 * Annehmen ohne Notiz / Ablehnen mit Pflicht-Notiz). Drei Unterschiede, jeder
 * mit Grund:
 *
 *  1. **Kein Cursor.** Die Route liefert bis zu `INSIGHTS_CORRECTIONS_LIMIT`
 *     (200) Zeilen auf einmal — wie jede andere Liste dieses Layers. Ein
 *     „Mehr laden" für eine Arbeitsliste, die den Deckel nie erreicht, wäre
 *     ein Knopf, den niemand drückt, plus eine zweite Ladeart, die man
 *     pflegen muss.
 *  2. **Die Kontakt-Adresse steht nicht in der Tabelle**, nur ob es eine gibt
 *     (`hasContact`). Sie ist das einzige personenbezogene Feld dieses Layers
 *     (§9.3); eine Liste, die zwanzig fremde Adressen in den Browser schiebt,
 *     damit eine Spalte ein Häkchen zeigt, ist die teuerste Art, eine
 *     Auskunftspflicht zu verfehlen. Begründung am Typ.
 *  3. **Annehmen ändert das Ziel nicht.** Es heisst „stimmt, wir kümmern
 *     uns"; die Änderung macht der Mensch im Editor bzw. auf der Marken-Seite
 *     (Begründung im Kopf der Entscheidungs-Route).
 *
 * ── DER STANDARD IST „OFFEN", NICHT „ALLE" ───────────────────────────────
 * Das hier IST der Posteingang. Entschiedenes bleibt erreichbar — die Reiter
 * zeigen ihre Zähler —, aber wer die Seite öffnet, sieht das, was noch zu tun
 * ist.
 */
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'admin'],
  requiredCapability: 'insights.manage',
  // Betreiber-Sache, wie die drei Seiten daneben.
  dashboardScope: 'operator',
})

const { t, locale } = useI18n()
const toast = useToast()
useBrandTitle(() => t('insights.corrections.title'))

// ── Laden ──────────────────────────────────────────────────────────────────

type CorrectionFilter = InsightsCorrectionStatus | 'all'
const FILTERS: readonly CorrectionFilter[] = [...INSIGHTS_CORRECTION_STATUSES, 'all']

const filter = ref<CorrectionFilter>('open')

/**
 * Der Filter reist als Query MIT — er gehört auf den Server, weil dort auch
 * die Zähler entstehen. `useFetch` mit reaktiver Query lädt bei jedem Wechsel
 * neu; das ist hier richtig, weil jede Antwort die GANZE Ansicht ist (kein
 * Cursor, nichts zum Anhängen — s. Kopf, Punkt 1).
 */
const { data, refresh, status } = await useFetch<InsightsCorrectionsListResponse>('/api/insights/corrections', {
  query: computed(() => ({ status: filter.value === 'all' ? undefined : filter.value })),
  lazy: true,
  server: false,
})

/**
 * `server: false` lässt die Abfrage erst im Browser laufen — auf dem Server
 * steht `status` auf `idle`, im Browser schon beim Hydrieren auf `pending`.
 * Wer `status` direkt ins Markup bindet, bekommt einen Hydration-Mismatch
 * (Lade-Icon, `disabled` am Knopf, leerer Zustand — Klick-Beweis 2026-09-10).
 * Deshalb zählt der Ladezustand erst nach dem Mounten: dieselbe Wahrheit auf
 * beiden Seiten.
 */
const hydrated = ref(false)
onMounted(() => { hydrated.value = true })
const pending = computed(() => hydrated.value && status.value === 'pending')

const rows = computed(() => data.value?.items ?? [])
const counts = computed(() => data.value?.counts)

const filterItems = computed(() => FILTERS.map(value => ({
  value,
  label: t(`insights.corrections.filter.${value}`),
  // `all` zählt die Route nicht mit — sie liefert die drei Zustände, und die
  // Summe daraus ist dieselbe Zahl ohne eine vierte Abfrage.
  count: value === 'all'
    ? INSIGHTS_CORRECTION_STATUSES.reduce((sum, entry) => sum + (counts.value?.[entry] ?? 0), 0)
    : counts.value?.[value] ?? 0,
})))

// ── Darstellung ────────────────────────────────────────────────────────────

const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))
function formatDate(value: string): string {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? dateFormat.value.format(parsed) : ''
}

const statusColor: Record<InsightsCorrectionStatus, 'neutral' | 'success' | 'warning'> = {
  open: 'neutral',
  accepted: 'success',
  declined: 'warning',
}

const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }
const HIDE_LG = { td: 'hidden lg:table-cell', th: 'hidden lg:table-cell' }

const columns = computed<TableColumn<InsightsCorrectionListItem>[]>(() => [
  { id: 'target', header: () => t('insights.corrections.col.target') },
  { accessorKey: 'kind', header: () => t('insights.corrections.col.kind'), meta: { class: HIDE_MD } },
  { accessorKey: 'field', header: () => t('insights.corrections.col.field'), meta: { class: HIDE_MD } },
  { accessorKey: 'proposed', header: () => t('insights.corrections.col.proposed'), meta: { class: HIDE_LG } },
  { accessorKey: 'reason', header: () => t('insights.corrections.col.reason'), meta: { class: HIDE_LG } },
  { id: 'contact', header: () => t('insights.corrections.col.contact'), meta: { class: HIDE_LG } },
  { accessorKey: 'createdAt', header: () => t('insights.corrections.col.date'), meta: { class: HIDE_MD } },
  { accessorKey: 'status', header: () => t('insights.corrections.col.status') },
  { id: 'actions', header: srOnlyHeader(() => t('ui.table.actions')) },
])

/** Das Ziel in Worten: der Titel bzw. Name, wenn die Route ihn auflösen
 *  konnte — sonst die rohe Id, damit die Zeile trotzdem greifbar bleibt. */
function targetLabelOf(item: InsightsCorrectionListItem): string {
  return item.targetLabel || item.targetId
}

// ── Entscheiden ────────────────────────────────────────────────────────────

const busy = ref('')
const declining = ref<InsightsCorrectionListItem | null>(null)
const declineNote = ref('')

const REASON_KEY: Record<string, string> = {
  already_decided: 'insights.corrections.error.alreadyDecided',
  note_required: 'insights.corrections.error.noteRequired',
  correction_not_found: 'insights.corrections.error.notFound',
  storage_unavailable: 'insights.editor.error.storageUnavailable',
}

function fail(error: unknown): void {
  const data = (error as { data?: { reason?: unknown } } | undefined)?.data
  const reason = typeof data?.reason === 'string' ? data.reason : ''
  toast.add({ title: t(REASON_KEY[reason] ?? 'insights.editor.error.generic'), color: 'error' })
}

async function decide(item: InsightsCorrectionListItem, next: 'accepted' | 'declined', note: string): Promise<void> {
  busy.value = item.id
  try {
    await $fetch<InsightsCorrectionDecisionResponse>(`/api/insights/corrections/${item.id}/decision`, {
      method: 'POST',
      body: { status: next, decisionNote: note },
    })
    declining.value = null
    toast.add({
      title: next === 'accepted' ? t('insights.corrections.accepted') : t('insights.corrections.declined'),
      description: next === 'accepted' ? t('insights.corrections.acceptedHint') : undefined,
      color: 'success',
    })
  }
  catch (error) {
    fail(error)
  }
  finally {
    busy.value = ''
    // Auch im Fehlerfall: bei `already_decided` steht die Wahrheit schon in
    // der Ablage, und der Betreiber soll sie sehen statt sie zu raten.
    await refresh()
  }
}

function openDecline(item: InsightsCorrectionListItem): void {
  declining.value = item
  declineNote.value = ''
}

async function confirmDecline(): Promise<void> {
  const item = declining.value
  if (!item) return
  await decide(item, 'declined', declineNote.value)
}
</script>

<template>
  <UDashboardPanel id="insights-corrections">
    <template #header>
      <UDashboardNavbar :title="t('insights.corrections.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-ph-arrows-clockwise" color="neutral" variant="ghost"
            :loading="pending"
            :aria-label="t('insights.corrections.refresh')"
            @click="refresh()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="text-sm leading-relaxed text-muted">{{ t('insights.corrections.lead') }}</p>

      <div class="mt-4 mb-6 flex flex-wrap gap-2" data-insights-corrections-filter>
        <UButton
          v-for="entry in filterItems"
          :key="entry.value"
          :color="filter === entry.value ? 'primary' : 'neutral'"
          :variant="filter === entry.value ? 'solid' : 'subtle'"
          size="sm"
          :data-insights-corrections-tab="entry.value"
          @click="filter = entry.value"
        >
          {{ entry.label }}
          <UBadge color="neutral" variant="subtle" size="sm">{{ entry.count }}</UBadge>
        </UButton>
      </div>

      <!-- `whitespace-normal`: Nuxt UI setzt auf jede Zelle `whitespace-nowrap`, und
           ein Grund-Satz schob bei 1440 px die Aktions-Spalte aus dem Panel
           (Klick-Beweis 2026-09-10, dieselbe Falle wie die Kit-Lizenztabelle). -->
      <UTable
        :data="rows" :columns="columns" :loading="pending"
        :ui="{ td: 'whitespace-normal align-top' }"
        data-insights-corrections-list
      >
        <template #target-cell="{ row }">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ targetLabelOf(row.original) }}</p>
            <p class="text-xs text-dimmed">{{ t(`insights.corrections.targetKind.${row.original.targetKind}`) }}</p>
          </div>
        </template>

        <template #kind-cell="{ row }">
          <UBadge
            :color="row.original.kind === 'removal' ? 'warning' : 'neutral'"
            variant="subtle" size="sm"
          >
            {{ t(`insights.corrections.kind.${row.original.kind}`) }}
          </UBadge>
        </template>

        <template #field-cell="{ row }">
          <span class="text-sm text-muted">{{ row.original.field || '—' }}</span>
        </template>

        <template #proposed-cell="{ row }">
          <p v-if="row.original.proposed" class="line-clamp-2 max-w-xs text-sm" :title="row.original.proposed">
            {{ row.original.proposed }}
          </p>
          <span v-else class="text-dimmed">—</span>
        </template>

        <template #reason-cell="{ row }">
          <p v-if="row.original.reason" class="line-clamp-2 max-w-xs text-sm text-muted" :title="row.original.reason">
            {{ row.original.reason }}
          </p>
          <span v-else class="text-dimmed">—</span>
        </template>

        <!-- Nur OB eine Adresse hinterlegt ist (s. Kopf, Punkt 2). -->
        <template #contact-cell="{ row }">
          <UIcon
            v-if="row.original.hasContact"
            name="i-ph-envelope-simple" class="size-4 text-muted"
            :aria-label="t('insights.corrections.contactYes')"
          />
          <span v-else class="text-dimmed">—</span>
        </template>

        <template #createdAt-cell="{ row }">
          <span class="text-sm text-dimmed">{{ formatDate(row.original.createdAt) }}</span>
        </template>

        <template #status-cell="{ row }">
          <div class="min-w-0">
            <UBadge :color="statusColor[row.original.status]" variant="subtle" size="sm">
              {{ t(`insights.corrections.status.${row.original.status}`) }}
            </UBadge>
            <p v-if="row.original.decisionNote" class="line-clamp-1 text-xs text-muted" :title="row.original.decisionNote">
              {{ row.original.decisionNote }}
            </p>
          </div>
        </template>

        <template #actions-cell="{ row }">
          <div v-if="row.original.status === 'open'" class="flex justify-end gap-2">
            <UButton
              size="xs" color="neutral" variant="subtle"
              :loading="busy === row.original.id"
              :label="t('insights.corrections.action.accept')"
              :data-insights-correction-accept="row.original.id"
              @click="decide(row.original, 'accepted', '')"
            />
            <UButton
              size="xs" color="neutral" variant="ghost"
              :label="t('insights.corrections.action.decline')"
              :data-insights-correction-decline="row.original.id"
              @click="openDecline(row.original)"
            />
          </div>
          <span v-else class="flex justify-end text-xs text-dimmed">{{ formatDate(row.original.decidedAt) }}</span>
        </template>

        <template #empty>
          <CoreEmptyState
            icon="i-ph-chats-circle"
            :title="t('insights.corrections.emptyTitle')"
            :description="t('insights.corrections.emptyDescription')"
            data-insights-corrections-empty
          />
        </template>
      </UTable>

      <!-- Ablehnen: die Begründung ist PFLICHT — sie ist der Unterschied
           zwischen einer Antwort und einem Verschwinden (Anwaltsfrage 3). -->
      <UModal
        :open="Boolean(declining)"
        :title="t('insights.corrections.declineTitle')"
        @update:open="(open: boolean) => { if (!open) declining = null }"
      >
        <template #body>
          <p class="text-sm leading-relaxed">
            {{ t('insights.corrections.declineText', { target: declining ? targetLabelOf(declining) : '' }) }}
          </p>
          <UFormField
            class="mt-4"
            :label="t('insights.corrections.declineNoteLabel')"
            :description="t('insights.corrections.declineNoteHint')"
            required
          >
            <UTextarea
              v-model="declineNote"
              :rows="4"
              :maxlength="INSIGHTS_CORRECTION_NOTE_MAX"
              :placeholder="t('insights.corrections.declineNotePlaceholder')"
              class="w-full"
              autofocus
              data-insights-correction-note
            />
          </UFormField>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('ui.cancel')" @click="declining = null" />
            <UButton
              color="error"
              :disabled="!declineNote.trim()"
              :loading="busy === declining?.id"
              :label="t('insights.corrections.action.decline')"
              data-insights-correction-decline-confirm
              @click="confirmDecline()"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
