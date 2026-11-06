<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import {
  BRAND_CHECK_CORRECTION_DEFAULT_FILTER,
  BRAND_CHECK_CORRECTION_FILTERS,
  BRAND_CHECK_CORRECTION_STATUSES,
  type BrandCheckCorrectionFilter,
} from '../../../../shared/brandCheckCorrections'
import { BRAND_CHECK_CORRECTION_NOTE_MAX } from '../../../../schemas/brandCheck'
import type {
  BrandCheckCorrection,
  BrandCheckCorrectionDecisionResponse,
  BrandCheckCorrectionListResponse,
  BrandCheckHiddenResponse,
} from '../../../../shared/types/brand'

/**
 * DIE WARTESCHLANGE DER KORREKTURVORSCHLÄGE — `/dashboard/brand-check/corrections`
 * (Konzept: docs/archiv/BRAND-CHECK-SEITE.md §3b, Paket P3).
 *
 * Wer im Ranking eine falsch zugeordnete Branche sieht, schlägt sie hier zur
 * Korrektur vor; diese Seite ist die andere Hälfte davon: annehmen (der Wert
 * wandert in `brand_checks`) oder mit Begründung ablehnen. Sie ist die zweite
 * Betreiber-Fläche dieses Layers nach der Warteliste und folgt ihr in allem —
 * `UTable` (Davids B6-Regel), `CoreEmptyState`, `users.manage`,
 * `dashboardScope: 'operator'`.
 *
 * ── DER STANDARD IST „OFFEN", NICHT „ALLE" ────────────────────────────────
 * Das ist die Arbeitsliste. Entschiedenes bleibt erreichbar (die Reiter zeigen
 * ihre Zähler), aber wer die Seite öffnet, sieht das, was noch zu tun ist.
 *
 * ── GEBLÄTTERT WIRD ÜBER EINEN CURSOR, ALSO WIRD ANGEHÄNGT ────────────────
 * Die Route liefert `nextCursor`; „Mehr laden" hängt die nächste Seite an die
 * bestehende Liste. Deshalb lädt diese Seite von Hand (ein `ref` plus
 * `load()`) statt über eine reaktive `useFetch`-Query: `useFetch` ERSETZT seine
 * Daten bei jeder Änderung, und eine Cursor-Liste, die beim Nachladen ihren
 * Anfang verliert, ist keine.
 *
 * ── DER ENTFERNEN-WEG STEHT AUF DERSELBEN SEITE ───────────────────────────
 * `hidden` (§3 „Recht") ist der Griff für einen Entfernungswunsch eines
 * Website-Betreibers. Er ist selten, er braucht keine eigene Adresse, und er
 * gehört inhaltlich in dieselbe Ecke: eine Check-Id, zwei Knöpfe. Bewusst OHNE
 * Zustandsanzeige — ein ausgeblendeter Check antwortet auf jedem Leseweg 404
 * (auch dem des Betreibers), sein heutiger Zustand ist von hier aus also nicht
 * abfragbar. Zwei benannte Knöpfe sagen, was passiert; ein Schalter, dessen
 * Stellung geraten wäre, täte das nicht.
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
useBrandTitle(() => t('brand.admin.checkCorrections.title'))

// ── Laden ──────────────────────────────────────────────────────────────────

const filter = ref<BrandCheckCorrectionFilter>(BRAND_CHECK_CORRECTION_DEFAULT_FILTER)
const items = ref<BrandCheckCorrection[]>([])
const counts = ref<Record<string, number>>({})
const total = ref(0)
const nextCursor = ref('')
const loading = ref(false)

async function load(append: boolean): Promise<void> {
  loading.value = true
  try {
    const response = await $fetch<BrandCheckCorrectionListResponse>('/api/brand/admin/check-corrections', {
      query: {
        status: filter.value,
        cursor: append ? nextCursor.value : '',
      },
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

/** Ein Filterwechsel ist eine NEUE Liste, kein Nachschlag — Cursor zurück. */
watch(filter, () => {
  nextCursor.value = ''
  load(false)
})

onMounted(() => { load(false) })

const filterItems = computed(() => BRAND_CHECK_CORRECTION_FILTERS.map(value => ({
  value,
  label: t(`brand.admin.checkCorrections.filter.${value}`),
  // `all` zählt die Route nicht mit — sie liefert die drei Zustände. Die Summe
  // daraus ist dieselbe Zahl und braucht keine vierte Abfrage.
  count: value === 'all'
    ? BRAND_CHECK_CORRECTION_STATUSES.reduce((sum, status) => sum + (counts.value[status] ?? 0), 0)
    : counts.value[value] ?? 0,
})))

// ── Entscheiden ────────────────────────────────────────────────────────────

const busy = ref<string | null>(null)
const declining = ref<BrandCheckCorrection | null>(null)
const declineNote = ref('')

/**
 * Der fachliche Grund reist als `data.code` durch den zentralen Fehler-Handler
 * und kommt als `error.data.reason` an (CLAUDE.md). Ein unbekannter Code fällt
 * auf den allgemeinen Satz zurück.
 */
const KNOWN_REASONS = ['already_decided', 'invalid_value', 'not_found', 'corrections_unavailable', 'check_not_found']

function reasonOf(error: unknown): string {
  const reason = (error as { data?: { reason?: string } })?.data?.reason ?? ''
  return KNOWN_REASONS.includes(reason) ? reason : 'generic'
}

function failToast(error: unknown): void {
  const reason = reasonOf(error)
  toast.add({
    title: t('brand.admin.checkCorrections.actionFailed'),
    description: te(`brand.admin.checkCorrections.error.${reason}`)
      ? t(`brand.admin.checkCorrections.error.${reason}`)
      : t('brand.admin.checkCorrections.error.generic'),
    color: 'error',
  })
}

async function accept(entry: BrandCheckCorrection): Promise<void> {
  busy.value = entry.id
  try {
    const response = await $fetch<BrandCheckCorrectionDecisionResponse>(
      `/api/brand/admin/check-corrections/${entry.id}/accept`,
      { method: 'POST' },
    )
    toast.add({
      title: t('brand.admin.checkCorrections.accepted'),
      description: response.changed
        ? t('brand.admin.checkCorrections.acceptedHint')
        : t('brand.admin.checkCorrections.unchangedHint'),
      color: 'success',
    })
  }
  catch (error) {
    failToast(error)
  }
  finally {
    busy.value = null
    // Auch im Fehlerfall: bei `already_decided` steht die Wahrheit schon in der
    // Ablage, und der Betreiber soll sie sehen statt sie zu raten.
    nextCursor.value = ''
    await load(false)
  }
}

async function decline(): Promise<void> {
  const entry = declining.value
  if (!entry) return
  busy.value = entry.id
  try {
    await $fetch<BrandCheckCorrectionDecisionResponse>(
      `/api/brand/admin/check-corrections/${entry.id}/decline`,
      { method: 'POST', body: { decisionNote: declineNote.value } },
    )
    declining.value = null
    toast.add({ title: t('brand.admin.checkCorrections.declined'), color: 'success' })
  }
  catch (error) {
    failToast(error)
  }
  finally {
    busy.value = null
    nextCursor.value = ''
    await load(false)
  }
}

function openDecline(entry: BrandCheckCorrection): void {
  declining.value = entry
  declineNote.value = ''
}

// ── Entfernen-Weg (`hidden`) ───────────────────────────────────────────────

const hiddenId = ref('')
const hiddenBusy = ref(false)

async function setHidden(hidden: boolean): Promise<void> {
  const id = hiddenId.value.trim()
  if (!id) return
  hiddenBusy.value = true
  try {
    const response = await $fetch<BrandCheckHiddenResponse>(
      `/api/brand/admin/checks/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: { hidden } },
    )
    toast.add({
      title: response.hidden
        ? t('brand.admin.checkCorrections.hiddenOn')
        : t('brand.admin.checkCorrections.hiddenOff'),
      color: 'success',
    })
  }
  catch (error) {
    failToast(error)
  }
  finally {
    hiddenBusy.value = false
  }
}

// ── Darstellung ────────────────────────────────────────────────────────────

const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))
function formatDate(value: string): string {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? dateFormat.value.format(parsed) : ''
}

/** Branchen-Ids sind englisch und stabil; das Wort dazu kommt aus i18n. */
function industryLabel(id: string): string {
  const key = `brand.industry.${id}`
  return id && te(key) ? t(key) : '—'
}

function fieldLabel(field: string): string {
  const key = `brand.admin.checkCorrections.field.${field}`
  return te(key) ? t(key) : field
}

const statusColor: Record<string, 'neutral' | 'success' | 'warning'> = {
  open: 'neutral',
  accepted: 'success',
  declined: 'warning',
}

const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }
const HIDE_LG = { td: 'hidden lg:table-cell', th: 'hidden lg:table-cell' }

const columns = computed<TableColumn<BrandCheckCorrection>[]>(() => [
  { accessorKey: 'host', header: () => t('brand.admin.checkCorrections.col.host') },
  { accessorKey: 'field', header: () => t('brand.admin.checkCorrections.col.field'), meta: { class: HIDE_MD } },
  { id: 'change', header: () => t('brand.admin.checkCorrections.col.change') },
  { accessorKey: 'reason', header: () => t('brand.admin.checkCorrections.col.reason'), meta: { class: HIDE_LG } },
  { accessorKey: 'reporterEmail', header: () => t('brand.admin.checkCorrections.col.reporter'), meta: { class: HIDE_LG } },
  { accessorKey: 'status', header: () => t('brand.admin.checkCorrections.col.status') },
  { accessorKey: 'createdAt', header: () => t('brand.admin.checkCorrections.col.date'), meta: { class: HIDE_MD } },
  { id: 'actions', header: srOnlyHeader(() => t('ui.table.actions')) },
])
</script>

<template>
  <UDashboardPanel id="brand-check-corrections">
    <template #header>
      <UDashboardNavbar :title="t('brand.admin.checkCorrections.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-ph-arrows-clockwise"
            color="neutral"
            variant="ghost"
            :loading="loading"
            :aria-label="t('brand.admin.checkCorrections.refresh')"
            @click="load(false)"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="mb-4 text-sm text-muted">{{ t('brand.admin.checkCorrections.subtitle') }}</p>

      <!-- Die vier Reiter mit ihren Zählern -->
      <div class="mb-6 flex flex-wrap gap-2" data-corrections-filter>
        <UButton
          v-for="entry in filterItems"
          :key="entry.value"
          :color="filter === entry.value ? 'primary' : 'neutral'"
          :variant="filter === entry.value ? 'solid' : 'subtle'"
          size="sm"
          :data-corrections-tab="entry.value"
          @click="filter = entry.value"
        >
          {{ entry.label }}
          <UBadge color="neutral" variant="subtle" size="sm">{{ entry.count }}</UBadge>
        </UButton>
      </div>

      <UTable :data="items" :columns="columns" :loading="loading" data-corrections-list>
        <template #host-cell="{ row }">
          <NuxtLink
            :to="localePath(`/brand-check/${row.original.checkId}`)"
            class="font-medium hover:underline"
          >{{ row.original.host || row.original.checkId }}</NuxtLink>
        </template>

        <template #field-cell="{ row }">
          <span class="text-sm text-muted">{{ fieldLabel(row.original.field) }}</span>
        </template>

        <template #change-cell="{ row }">
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="text-muted">{{ industryLabel(row.original.current) }}</span>
            <UIcon name="i-ph-arrow-right" class="size-3.5 flex-none text-dimmed" />
            <span class="font-medium">{{ industryLabel(row.original.proposed) }}</span>
          </div>
        </template>

        <template #reason-cell="{ row }">
          <p v-if="row.original.reason" class="line-clamp-2 max-w-xs text-sm text-muted" :title="row.original.reason">
            {{ row.original.reason }}
          </p>
          <span v-else class="text-dimmed">—</span>
        </template>

        <template #reporterEmail-cell="{ row }">
          <span v-if="row.original.reporterEmail" class="text-sm">{{ row.original.reporterEmail }}</span>
          <span v-else class="text-dimmed">—</span>
        </template>

        <template #status-cell="{ row }">
          <div class="min-w-0">
            <UBadge :color="statusColor[row.original.status] ?? 'neutral'" variant="subtle" size="sm">
              {{ t(`brand.admin.checkCorrections.status.${row.original.status}`) }}
            </UBadge>
            <p v-if="row.original.decisionNote" class="line-clamp-1 text-xs text-muted" :title="row.original.decisionNote">
              {{ row.original.decisionNote }}
            </p>
          </div>
        </template>

        <template #createdAt-cell="{ row }">
          <span class="text-sm text-dimmed">{{ formatDate(row.original.createdAt) }}</span>
        </template>

        <template #actions-cell="{ row }">
          <div v-if="row.original.status === 'open'" class="flex justify-end gap-2">
            <UButton
              size="xs"
              color="neutral"
              variant="subtle"
              :loading="busy === row.original.id"
              :label="t('brand.admin.checkCorrections.action.accept')"
              :data-corrections-accept="row.original.id"
              @click="accept(row.original)"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              :label="t('brand.admin.checkCorrections.action.decline')"
              :data-corrections-decline="row.original.id"
              @click="openDecline(row.original)"
            />
          </div>
          <span v-else class="flex justify-end text-xs text-dimmed">{{ formatDate(row.original.decidedAt) }}</span>
        </template>

        <template #empty>
          <CoreEmptyState
            icon="i-ph-chats-circle"
            :title="t('brand.admin.checkCorrections.emptyTitle')"
            :description="t('brand.admin.checkCorrections.empty')"
            data-corrections-empty
          />
        </template>
      </UTable>

      <div v-if="nextCursor" class="mt-6 flex justify-center">
        <UButton
          color="neutral"
          variant="subtle"
          :loading="loading"
          :label="t('brand.admin.checkCorrections.more')"
          data-corrections-more
          @click="load(true)"
        />
      </div>
      <p v-else-if="items.length" class="mt-6 text-center text-xs text-dimmed">
        {{ t('brand.admin.checkCorrections.shown', { count: items.length, total }) }}
      </p>

      <!-- Der Entfernen-Weg: selten, deshalb schlicht (s. Kopf) -->
      <section class="mt-10 rounded-xl border border-default p-6" data-corrections-hidden>
        <h2 class="text-sm font-medium">{{ t('brand.admin.checkCorrections.hiddenTitle') }}</h2>
        <p class="mt-1 text-sm text-muted">{{ t('brand.admin.checkCorrections.hiddenHint') }}</p>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <UInput
            v-model="hiddenId"
            class="w-72"
            :placeholder="t('brand.admin.checkCorrections.hiddenPlaceholder')"
            :aria-label="t('brand.admin.checkCorrections.hiddenLabel')"
            data-corrections-hidden-id
          />
          <UButton
            color="neutral"
            :disabled="!hiddenId.trim()"
            :loading="hiddenBusy"
            :label="t('brand.admin.checkCorrections.hide')"
            data-corrections-hide
            @click="setHidden(true)"
          />
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="!hiddenId.trim()"
            :loading="hiddenBusy"
            :label="t('brand.admin.checkCorrections.unhide')"
            data-corrections-unhide
            @click="setHidden(false)"
          />
        </div>
      </section>

      <!-- Ablehnen: die Begründung ist freiwillig, aber sie ist der Unterschied
           zwischen einer Antwort und einem Verschwinden. -->
      <UModal
        :open="Boolean(declining)"
        :title="t('brand.admin.checkCorrections.declineTitle')"
        @update:open="(open) => { if (!open) declining = null }"
      >
        <template #body>
          <p class="text-sm">
            {{ t('brand.admin.checkCorrections.declineText', { host: declining?.host ?? '' }) }}
          </p>
          <UFormField
            class="mt-4"
            :label="t('brand.admin.checkCorrections.declineNoteLabel')"
            :description="t('brand.admin.checkCorrections.declineNoteHint')"
          >
            <UTextarea
              v-model="declineNote"
              :rows="4"
              :maxlength="BRAND_CHECK_CORRECTION_NOTE_MAX"
              :placeholder="t('brand.admin.checkCorrections.declineNotePlaceholder')"
              class="w-full"
              autofocus
              data-corrections-decline-note
            />
          </UFormField>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('ui.cancel')" @click="declining = null" />
            <UButton
              color="error"
              :loading="busy === declining?.id"
              :label="t('brand.admin.checkCorrections.action.decline')"
              data-corrections-decline-confirm
              @click="decline()"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
