<script setup lang="ts">
/**
 * DIE GESPRÄCHSANFRAGEN ALS BETREIBER-FLÄCHE (BS1 Paket Z0; Plan §4.1 (a):
 * „sichtbar unter /dashboard/… für den Betreiber, damit keine Anfrage nur in
 * einem Postfach lebt").
 *
 * ── WARUM SIE NICHT OPTIONAL IST ─────────────────────────────────────────
 * Die Betreiber-Mail ist der ZWEITE Zustellweg, und ihre Adresse
 * (`pukalani.brand.introCallNotify`) ist per Default LEER. Ohne diese Seite
 * hinge das Bemerken einer Anfrage an einer Konfigurationszeile, die niemand
 * gesetzt haben muss — und eine Anfrage, die niemand sieht, ist dasselbe wie
 * keine.
 *
 * ── DER STANDARD IST „OFFEN", NICHT „ALLE" ───────────────────────────────
 * Das ist die Arbeitsliste. `contacted` und `closed` stehen einen Klick
 * weiter; die Zähler oben sind unabhängig vom Filter, damit die Kopfzeile eine
 * Aussage über die LISTE bleibt und nicht über die gerade gewählte Ansicht.
 *
 * ── ZWEI HANDGRIFFE, MEHR NICHT ──────────────────────────────────────────
 * Zustand setzen und Notiz schreiben. Kein „antworten"-Knopf: geantwortet wird
 * im Mail-Programm, und ein Formular, das eine Mail verschickt, hätte hier
 * keinen Vorteil gegenüber `mailto:` — wohl aber einen Zustellweg mehr, der
 * kaputtgehen kann.
 *
 * ── UTable IST GESETZT (Davids Entscheidung B6) ──────────────────────────
 * Sortierung, Auswahl und Paginierung verhalten sich damit überall gleich; der
 * Leerzustand läuft über `CoreEmptyState`.
 */
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { BRAND_INTRO_NOTE_MAX } from '../../../schemas/brandIntroCall'
import {
  BRAND_INTRO_STATUSES,
  type BrandIntroStatus,
  normalizeBrandIntroStatus,
} from '../../../shared/brandIntroCall'
import type {
  BrandIntroListResponse,
  BrandIntroPatchResponse,
  BrandIntroRequestItem,
} from '../../../shared/types/brand'

/** Dieselbe Shell und dieselbe Begründung wie /dashboard/waitlist. */
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'admin'],
  requiredCapability: 'users.manage',
  dashboardScope: 'operator',
})

const { t, locale } = useI18n()
const toast = useToast()
useBrandTitle(() => t('brand.admin.introCalls.title'))

const FILTERS = [...BRAND_INTRO_STATUSES, 'all'] as const
type IntroFilter = typeof FILTERS[number]

const filter = ref<IntroFilter>('new')

const { data, refresh, status } = await useFetch<BrandIntroListResponse>(
  '/api/brand/admin/intro-calls',
  {
    // Reaktive Query: ein Filterwechsel lädt neu, ohne eigenen Watcher.
    query: { status: filter },
    lazy: true,
    server: false,
  },
)

const items = computed(() => data.value?.items ?? [])
const counts = computed(() => data.value?.counts)

const filterItems = computed(() => FILTERS.map(value => ({
  value,
  label: t(`brand.admin.introCalls.filter.${value}`),
})))

// ── Aktionen ───────────────────────────────────────────────────────────────

const busy = ref<string | null>(null)
const noting = ref<BrandIntroRequestItem | null>(null)
const noteDraft = ref('')
const reading = ref<BrandIntroRequestItem | null>(null)

function failToast(error: unknown) {
  const reason = (error as { data?: { reason?: string } })?.data?.reason ?? ''
  toast.add({
    title: t('brand.admin.introCalls.actionFailed'),
    description: t(reason === 'not_found'
      ? 'brand.admin.introCalls.error.not_found'
      : 'brand.admin.introCalls.error.generic'),
    color: 'error',
  })
}

/**
 * EINE Route für Zustand und Notiz — sie nimmt beide Felder einzeln entgegen,
 * und ein fehlendes wird nicht angefasst (Begründung im Schema). Deshalb
 * genügt hier ein Aufrufer für beide Handgriffe.
 */
async function patch(entry: BrandIntroRequestItem, body: { status?: BrandIntroStatus, note?: string }) {
  busy.value = entry.id
  try {
    await $fetch<BrandIntroPatchResponse>(`/api/brand/admin/intro-calls/${entry.id}`, {
      method: 'PATCH',
      body,
    })
    await refresh()
    return true
  }
  catch (error) {
    failToast(error)
    // Nachladen auch im Fehlerfall: bei einem 404 steht die Wahrheit schon in
    // der Ablage, und der Betreiber soll sie sehen statt sie zu raten.
    await refresh()
    return false
  }
  finally {
    busy.value = null
  }
}

async function setStatus(entry: BrandIntroRequestItem, next: BrandIntroStatus) {
  if (await patch(entry, { status: next })) {
    toast.add({ title: t(`brand.admin.introCalls.set.${next}`), color: 'success' })
  }
}

function openNote(entry: BrandIntroRequestItem) {
  noting.value = entry
  noteDraft.value = entry.note
}

async function saveNote() {
  const entry = noting.value
  if (!entry) return
  if (await patch(entry, { note: noteDraft.value })) {
    noting.value = null
    toast.add({ title: t('brand.admin.introCalls.noteSaved'), color: 'success' })
  }
}

// ── Darstellung ────────────────────────────────────────────────────────────

const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))
function formatDate(value: string): string {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? dateFormat.value.format(parsed) : ''
}

const statusColor: Record<BrandIntroStatus, 'warning' | 'info' | 'neutral'> = {
  new: 'warning',
  contacted: 'info',
  closed: 'neutral',
}

const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }
const HIDE_LG = { td: 'hidden lg:table-cell', th: 'hidden lg:table-cell' }

const columns = computed<TableColumn<BrandIntroRequestItem>[]>(() => [
  { accessorKey: 'name', header: () => t('brand.admin.introCalls.col.who') },
  { id: 'message', header: () => t('brand.admin.introCalls.col.message'), meta: { class: HIDE_MD } },
  { accessorKey: 'source', header: () => t('brand.admin.introCalls.col.source'), meta: { class: HIDE_LG } },
  { accessorKey: 'status', header: () => t('brand.admin.introCalls.col.status') },
  { accessorKey: 'createdAt', header: () => t('brand.admin.introCalls.col.date'), meta: { class: HIDE_MD } },
  { id: 'actions', header: srOnlyHeader(() => t('ui.table.actions')) },
])

function rowActions(entry: BrandIntroRequestItem): DropdownMenuItem[][] {
  const current = normalizeBrandIntroStatus(entry.status)
  const actions: DropdownMenuItem[] = [{
    label: t('brand.admin.introCalls.action.read'),
    icon: 'i-ph-envelope-open',
    onSelect: () => { reading.value = entry },
  }]

  // `mailto:` statt eines eigenen Antwort-Formulars (s. Kopf). Betreff und
  // Anrede stehen schon drin — das ist der ganze Gewinn gegenüber Kopieren.
  actions.push({
    label: t('brand.admin.introCalls.action.reply'),
    icon: 'i-ph-paper-plane-tilt',
    to: `mailto:${entry.email}?subject=${encodeURIComponent(t('brand.admin.introCalls.replySubject'))}`,
    target: '_blank',
  })

  for (const next of BRAND_INTRO_STATUSES) {
    if (next === current) continue
    actions.push({
      label: t(`brand.admin.introCalls.action.${next}`),
      icon: next === 'closed' ? 'i-ph-check' : 'i-ph-arrow-right',
      onSelect: () => { setStatus(entry, next) },
    })
  }

  actions.push({
    label: t('brand.admin.introCalls.action.note'),
    icon: 'i-ph-note-pencil',
    onSelect: () => { openNote(entry) },
  })
  return [actions]
}
</script>

<template>
  <UDashboardPanel id="brand-intro-calls">
    <template #header>
      <UDashboardNavbar :title="t('brand.admin.introCalls.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-ph-arrows-clockwise"
            color="neutral"
            variant="ghost"
            :loading="status === 'pending'"
            :aria-label="t('brand.admin.introCalls.refresh')"
            @click="refresh()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="mb-4 text-sm text-muted">{{ t('brand.admin.introCalls.subtitle') }}</p>

      <div v-if="counts" class="mb-6 grid grid-cols-3 gap-3" data-intro-counts>
        <div v-for="key in BRAND_INTRO_STATUSES" :key="key" class="rounded-xl border border-default p-4">
          <p class="text-2xl font-semibold tabular-nums">{{ counts[key] ?? 0 }}</p>
          <p class="text-sm text-muted">{{ t(`brand.admin.introCalls.counts.${key}`) }}</p>
        </div>
      </div>

      <div class="mb-4 flex items-center gap-3">
        <USelect
          v-model="filter"
          :items="filterItems"
          class="w-56"
          :aria-label="t('brand.admin.introCalls.filterLabel')"
          data-intro-filter
        />
        <span class="text-sm text-dimmed">{{ t('brand.admin.introCalls.shown', { count: items.length }) }}</span>
      </div>

      <UTable :data="items" :columns="columns" data-intro-list>
        <template #name-cell="{ row }">
          <div class="min-w-0">
            <p class="font-medium">{{ row.original.name }}</p>
            <p class="text-xs text-muted">{{ row.original.email }}</p>
            <p v-if="row.original.company" class="text-xs text-dimmed">{{ row.original.company }}</p>
          </div>
        </template>

        <template #message-cell="{ row }">
          <div class="min-w-0 max-w-md">
            <p class="line-clamp-2 text-sm" :title="row.original.message">{{ row.original.message }}</p>
            <p v-if="row.original.note" class="line-clamp-1 text-xs text-muted">{{ row.original.note }}</p>
          </div>
        </template>

        <template #source-cell="{ row }">
          <UBadge v-if="row.original.source" color="neutral" variant="subtle" size="sm">
            {{ row.original.source }}
          </UBadge>
          <span v-else class="text-dimmed">—</span>
        </template>

        <template #status-cell="{ row }">
          <UBadge :color="statusColor[normalizeBrandIntroStatus(row.original.status)]" variant="subtle" size="sm">
            {{ t(`brand.admin.introCalls.status.${normalizeBrandIntroStatus(row.original.status)}`) }}
          </UBadge>
        </template>

        <template #createdAt-cell="{ row }">
          <span class="text-sm text-dimmed">{{ formatDate(row.original.createdAt) }}</span>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
              <UButton
                icon="i-ph-dots-three-vertical"
                color="neutral"
                variant="ghost"
                size="xs"
                :aria-label="t('brand.admin.introCalls.rowActions')"
                :loading="busy === row.original.id"
              />
            </UDropdownMenu>
          </div>
        </template>

        <template #empty>
          <CoreEmptyState
            icon="i-ph-phone-call"
            :title="t('brand.admin.introCalls.emptyTitle')"
            :description="t('brand.admin.introCalls.empty')"
            data-intro-empty
          />
        </template>
      </UTable>

      <!-- Die ganze Anfrage. Die Tabelle kürzt auf zwei Zeilen; hier steht sie
           vollständig, samt Telefon und Branding-Bezug. -->
      <UModal
        :open="Boolean(reading)"
        :title="reading?.name ?? ''"
        @update:open="(open) => { if (!open) reading = null }"
      >
        <template #body>
          <dl class="space-y-3 text-sm">
            <div>
              <dt class="text-muted">{{ t('brand.admin.introCalls.col.email') }}</dt>
              <dd>{{ reading?.email }}</dd>
            </div>
            <div v-if="reading?.phone">
              <dt class="text-muted">{{ t('brand.admin.introCalls.col.phone') }}</dt>
              <dd>{{ reading.phone }}</dd>
            </div>
            <div v-if="reading?.company">
              <dt class="text-muted">{{ t('brand.admin.introCalls.col.company') }}</dt>
              <dd>{{ reading.company }}</dd>
            </div>
            <div v-if="reading?.profileId">
              <dt class="text-muted">{{ t('brand.admin.introCalls.col.brand') }}</dt>
              <dd class="font-mono text-xs">{{ reading.profileId }}</dd>
            </div>
            <div>
              <dt class="text-muted">{{ t('brand.admin.introCalls.col.message') }}</dt>
              <dd class="whitespace-pre-wrap">{{ reading?.message }}</dd>
            </div>
          </dl>
        </template>
        <template #footer>
          <div class="flex w-full justify-end">
            <UButton color="neutral" variant="ghost" :label="t('ui.close')" @click="reading = null" />
          </div>
        </template>
      </UModal>

      <!-- Die Notiz des Betreibers zur Zeile -->
      <UModal
        :open="Boolean(noting)"
        :title="t('brand.admin.introCalls.noteTitle')"
        @update:open="(open) => { if (!open) noting = null }"
      >
        <template #body>
          <UTextarea
            v-model="noteDraft"
            :rows="4"
            :maxlength="BRAND_INTRO_NOTE_MAX"
            class="w-full"
            :placeholder="t('brand.admin.introCalls.notePlaceholder')"
            data-intro-note
          />
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('ui.cancel')" @click="noting = null" />
            <UButton
              :loading="busy === noting?.id"
              :label="t('ui.save')"
              data-intro-note-save
              @click="saveNote()"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
