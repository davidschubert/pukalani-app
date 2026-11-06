<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { eventIsEditable, eventIsRedacted } from '../../../shared/eventModerationPolicy'
import type { EventDetailResponse, EventRow } from '../../../shared/types/event'
import { effectiveLocationType, isSeriesEvent, isSeriesMaster } from '../../../shared/types/event'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'events.manage' })

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const { formatDateTime } = useEventDateFormat()

useBrandTitle(() => t('events.admin.title'))

const { data, status, refresh } = await useFetch<{ rows: EventRow[] }>('/api/events/manage', {
  lazy: true,
  server: false,
})

// Ortstyp-Filter im Toolbar-Muster der Kommentar-Moderation
type LocationFilter = 'all' | 'online' | 'venue'
const LOCATION_FILTERS: LocationFilter[] = ['all', 'online', 'venue']
const LOCATION_ICON: Record<LocationFilter, string> = {
  all: 'i-ph-list-bullets',
  online: 'i-ph-broadcast',
  venue: 'i-ph-map-pin',
}
const locationFilter = ref<LocationFilter>('all')
const filterLinks = computed(() => LOCATION_FILTERS.map(value => ({
  label: t(`events.admin.filter.${value}`),
  icon: LOCATION_ICON[value],
  active: locationFilter.value === value,
  onSelect: () => { locationFilter.value = value },
})))
const filteredRows = computed(() => (data.value?.rows ?? []).filter(row =>
  locationFilter.value === 'all' || effectiveLocationType(row) === locationFilter.value))

// ---- Formular ----
//
// Es liegt seit Davids Entscheidung zu F58 in `EventFormModal` und wird von
// dieser Seite, der oeffentlichen Terminliste und der Detailseite GETEILT
// (Begruendung im Kopf der Komponente). Hier bleibt nur, WELCHE Row es zeigt.
//
// KEIN `publish-on-create` an dieser Stelle: im Dashboard ist Entwurf-zuerst
// richtig, weil die Entwurfsliste danebensteht. Oeffentlich waere derselbe
// Default eine Falle — dort verschwaende der Termin im Moment des Anlegens.
const modalOpen = ref(false)
const editingRow = ref<EventRow | null>(null)

function openCreate() {
  editingRow.value = null
  modalOpen.value = true
}

/**
 * TIEFE LINKS IN DIESE SEITE (F58, 2026-08-16): `?new=1` öffnet den
 * Anlege-Dialog, `?edit=<id>` genau diesen Termin.
 *
 * DIE PRODUKTSEITEN GEHEN SEIT DAVIDS ENTSCHEIDUNG NICHT MEHR DIESEN WEG — sie
 * öffnen `EventFormModal` an Ort und Stelle. Die Parameter bleiben trotzdem:
 * sie sind gültige Ziele für Lesezeichen, Mails und den „Verwalten"-Knopf, und
 * sie kosten nichts. Wer sie entfernt, bricht nur Links, ohne etwas zu gewinnen.
 *
 * `?edit` MUSS auf die Daten warten: die Liste lädt lazy und client-seitig, der
 * Dialog braucht aber die Zeile (Formular-Vorbelegung, Titelbild, ob 'paid'
 * wählbar ist). `watch(..., { immediate: true })` deckt beide Fälle ab —
 * Antwort noch unterwegs oder schon da.
 *
 * DIE LISTE ALLEIN REICHT NICHT, und das war beim Bau live zu sehen:
 * `/api/events/manage` liefert 100 Zeilen, in einer Community mit Serien sind
 * das schnell nur die jüngsten — der Knopf landete dann in der Tabelle und tat
 * NICHTS. Genau die halbe Wahrheit, gegen die F58 antritt. Deshalb der
 * Nachschlag über `/api/events/:id`: er kann für den Knopf gar nicht fehlgehen,
 * denn der steht nur auf einer Detailseite, die sich öffnen ließ — und
 * Entwürfe antworten dort 404, stehen also ohnehin nur über die Liste zur
 * Verfügung (die sie, frisch angelegt, auch führt).
 *
 * Die Adresse wird danach bereinigt (replace), damit ein Reload oder ein
 * Zurück-Sprung den Dialog nicht erneut aufreisst. Bleibt auch der Nachschlag
 * leer (gelöscht, fremde Community), passiert bewusst NICHTS: die Liste steht
 * da, und das ist die ehrlichere Antwort als ein leeres Formular.
 */
const route = useRoute()
onMounted(() => {
  if (route.query.new === '1') {
    openCreate()
    void navigateTo({ query: {} }, { replace: true })
  }
})
watch(() => [route.query.edit, data.value] as const, async ([editId]) => {
  if (typeof editId !== 'string' || !editId) return
  const listed = data.value?.rows.find(r => r.$id === editId)
  // Erst wenn die Liste DA ist (nur dann ist „nicht dabei" eine Aussage) darf
  // der Nachschlag laufen — sonst feuerte er bei jedem Aufruf zusätzlich.
  if (!listed && !data.value) return
  const row = listed ?? await $fetch<EventDetailResponse>(`/api/events/${editId}`).catch(() => null)
  if (!row) return
  openEdit(row)
  void navigateTo({ query: {} }, { replace: true })
}, { immediate: true })

function openEdit(row: EventRow) {
  editingRow.value = row
  modalOpen.value = true
}

// ---- Serie (§7e) ----

/**
 * „Einmalig" TRÄGT EINEN WERT, und das ist kein Geschmack (2026-08-16 live
 * erwischt): `USelect` reicht seine Items an Rekas `SelectItem` durch, und das
 * WIRFT bei `value: ''` — „must have a value prop that is not an empty string",
 * weil der leere String dort reserviert ist („Auswahl gelöscht, Platzhalter
 * zeigen").
 *
 * Die Items mounten erst beim ÖFFNEN der Liste, deshalb sah das Formular heil
 * aus: der Dialog ging auf, der Knopf zeigte „Einmalig" — und jeder Klick auf
 * die Liste stürzte ab. Serien-Termine waren damit über die Oberfläche gar
 * nicht anzulegen (der Absturz riss beim Vorab-Öffnen über `?new=1` die ganze
 * Seite mit, so ist er aufgefallen).
 *
 * Der Sentinel bleibt in DIESER Datei: das Formularfeld und die Nutzlast führen
 * weiter '' (`recurrence: '' | 'weekly' | …`, die Route kennt nur das) —
 * übersetzt wird an genau einer Stelle, dem Proxy darunter.
 */
async function stopSeries(master: EventRow) {
  try {
    let cancelled = 0
    const ok = await confirm({
      title: t('events.admin.stopSeriesTitle', { title: master.title }),
      description: t('events.admin.stopSeriesText'),
      confirmLabel: t('events.admin.stopSeries'),
      action: async () => {
        const res = await $fetch<{ cancelled: number }>(`/api/events/${master.$id}/series` as string, { method: 'DELETE' })
        cancelled = res.cancelled
      },
    })
    if (!ok) return
    toast.add({ title: t('events.admin.seriesStopped', { count: cancelled }), color: 'success', icon: 'i-ph-repeat' })
    await refresh()
  }
  catch {
    toast.add({ title: t('events.admin.actionFailed'), description: t('events.admin.actionFailedHint'), color: 'error' })
  }
}

// ---- Status-Aktionen ----

const busyId = ref('')

async function setStatus(row: EventRow, target: 'published' | 'draft') {
  busyId.value = row.$id
  try {
    await $fetch(`/api/events/${row.$id}` as string, { method: 'PATCH', body: { status: target } })
    // Was „veröffentlicht"/„zurückgezogen" für die Gäste bedeutet, steht nicht
    // im Titel — und genau das ist die Frage, die man beim Zurückziehen hat.
    toast.add({
      title: t(target === 'published' ? 'events.admin.published' : 'events.admin.unpublished'),
      description: t(target === 'published' ? 'events.admin.publishedHint' : 'events.admin.unpublishedHint'),
      color: 'success',
    })
    await refresh()
  }
  catch {
    toast.add({ title: t('events.admin.actionFailed'), description: t('events.admin.actionFailedHint'), color: 'error' })
  }
  finally {
    busyId.value = ''
  }
}

async function cancelEvent(row: EventRow) {
  try {
    const ok = await confirm({
      title: t('events.admin.confirmCancelTitle'),
      description: t('events.admin.confirmCancelText', { title: row.title }),
      confirmLabel: t('events.admin.cancel'),
      action: () => $fetch(`/api/events/${row.$id}` as string, { method: 'DELETE' }),
    })
    if (!ok) return
    toast.add({ title: t('events.admin.cancelled'), description: t('events.admin.cancelledHint'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('events.admin.actionFailed'), description: t('events.admin.actionFailedHint'), color: 'error' })
  }
}

const statusColor = (row: EventRow) =>
  row.status === 'published'
    ? 'success'
    : row.status === 'cancelled'
      ? 'error'
      // F15: ausgeblendet ist eine Moderations-Aussage, kein Redaktions-Zustand —
      // deshalb `warning` und nicht das `neutral` des Entwurfs. Ein Editor soll
      // auf einen Blick sehen, dass hier jemand ANDERES eingegriffen hat.
      : row.status === 'hidden' ? 'warning' : 'neutral'

// Ort und Teilnehmerzahl sind Kontext — auf schmalen Schirmen fallen sie weg.
const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }
const HIDE_LG = { td: 'hidden lg:table-cell', th: 'hidden lg:table-cell' }

const columns = computed<TableColumn<EventRow>[]>(() => [
  { accessorKey: 'title', header: () => t('events.admin.col.event') },
  { accessorKey: 'startAt', header: () => t('events.admin.col.start'), id: 'start' },
  { accessorKey: 'location', header: () => t('events.admin.col.location'), meta: { class: HIDE_LG } },
  { id: 'attendees', header: () => t('events.admin.col.attendees'), meta: { class: HIDE_MD } },
  { accessorKey: 'status', header: () => t('events.admin.col.status') },
  { id: 'actions', header: srOnlyHeader(() => t('ui.table.actions')) },
])

/**
 * Zeilen-Aktionen — „Serie beenden" nur beim Serien-Master mit laufender Regel,
 * Veröffentlichen/Zurückziehen je nach Status, Bearbeiten und Absagen nicht mehr
 * bei abgesagten Terminen.
 *
 * AUSGEBLENDETE TERMINE (F15) bekommen KEINE Aktion, sondern einen Satz. Der
 * Grund ist keine Bequemlichkeit: `eventIsEditable()` sperrt sie in der
 * PATCH-Route, und zurück in die Welt kommen sie nur über
 * `POST /api/events/:id/restore` hinter `events.moderate` — einer Capability, die
 * ein Editor per Definition nicht hat. Ein Knopf hier wäre also entweder wirkungslos
 * oder ein 409; ein leeres Menü wiederum sähe nach einem Fehler aus. Deshalb ein
 * deaktivierter Eintrag, der sagt, WER das war und wo es hingehört.
 */
function rowActions(row: EventRow): DropdownMenuItem[][] {
  const items: DropdownMenuItem[] = []
  if (row.status === 'hidden') {
    return [[{ label: t('events.admin.hiddenByModeration'), icon: 'i-ph-eye-slash', disabled: true }]]
  }
  if (row.status === 'draft') {
    items.push({ label: t('events.admin.publish'), icon: 'i-ph-paper-plane-tilt', color: 'success', onSelect: () => { void setStatus(row, 'published') } })
  }
  if (row.status === 'published') {
    items.push({ label: t('events.admin.unpublish'), icon: 'i-ph-eye-slash', onSelect: () => { void setStatus(row, 'draft') } })
  }
  if (eventIsEditable(row.status)) {
    items.push({ label: t('events.admin.edit'), icon: 'i-ph-pencil-simple', onSelect: () => openEdit(row) })
  }
  if (isSeriesMaster(row) && (!row.seriesUntil || new Date(row.seriesUntil) > new Date())) {
    items.push({ label: t('events.admin.stopSeries'), icon: 'i-ph-repeat', onSelect: () => { void stopSeries(row) } })
  }
  const destructive: DropdownMenuItem[] = row.status !== 'cancelled'
    ? [{ label: t('events.admin.cancel'), icon: 'i-ph-calendar-x', color: 'error', onSelect: () => { void cancelEvent(row) } }]
    : []
  return destructive.length ? [items, destructive] : [items]
}
</script>

<template>
  <UDashboardPanel id="events-admin">
    <template #header>
      <UDashboardNavbar :title="t('events.admin.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-ph-plus" size="sm" data-testid="event-create" @click="openCreate">
            {{ t('events.admin.create') }}
          </UButton>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UNavigationMenu :items="filterLinks" highlight class="-mx-1 flex-1" data-events-filter />
      </UDashboardToolbar>
    </template>

    <template #body>
      <ClientOnly>
        <template #fallback>
          <div class="flex justify-center py-16"><UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" /></div>
        </template>

        <div v-if="status === 'pending' && !data" class="flex justify-center py-16">
          <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
        </div>

        <UTable v-else :data="filteredRows" :columns="columns" data-events-table>
          <template #title-cell="{ row }">
            <div class="flex min-w-0 items-center gap-2" :data-admin-event="row.original.$id">
              <!-- Geschwärzt (F46): auch die Redaktion muss „leer" von „von der
                   Moderation entfernt" unterscheiden können — sonst steht hier
                   eine namenlose Zeile, die wie ein Datenfehler aussieht. -->
              <span v-if="eventIsRedacted(row.original.redactedAt)" class="truncate text-muted italic">
                {{ t('events.redacted.title') }}
              </span>
              <span v-else class="truncate font-medium">{{ row.original.title }}</span>
              <!-- Serie: Master trägt die Regel, Instanzen den Serien-Hinweis -->
              <UBadge v-if="isSeriesMaster(row.original)" color="info" variant="subtle" size="sm" icon="i-ph-repeat" :data-series-master="row.original.$id">
                {{ t(`events.series.${row.original.recurrence}`) }}
              </UBadge>
              <UTooltip v-else-if="isSeriesEvent(row.original)" :text="t('events.series.instanceHint')">
                <UIcon name="i-ph-repeat" class="size-4 shrink-0 text-muted" />
              </UTooltip>
            </div>
          </template>
          <template #start-cell="{ row }">
            <span class="whitespace-nowrap text-sm text-muted">{{ formatDateTime(row.original.startAt) }}</span>
          </template>
          <template #location-cell="{ row }">
            <span class="text-sm text-muted">{{ row.original.location || '—' }}</span>
          </template>
          <template #attendees-cell="{ row }">
            <span class="whitespace-nowrap text-sm tabular-nums text-muted">
              {{ t('events.card.attendees', { count: row.original.attendeeCount }) }}<template v-if="row.original.capacity !== null">/{{ row.original.capacity }}</template>
            </span>
          </template>
          <template #status-cell="{ row }">
            <UBadge :color="statusColor(row.original)" variant="subtle" size="sm">
              {{ t(`events.admin.status.${row.original.status}`) }}
            </UBadge>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
                <UButton
                  icon="i-ph-dots-three-vertical"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :aria-label="t('events.admin.rowActions')"
                  :loading="busyId === row.original.$id"
                  :data-admin-publish="row.original.$id"
                  :data-admin-cancel="row.original.$id"
                />
              </UDropdownMenu>
            </div>
          </template>

          <template #empty>
            <CoreEmptyState
              v-if="locationFilter !== 'all'"
              icon="i-ph-funnel"
              :title="t('ui.empty.noResultsTitle')"
              :description="t('ui.empty.noResultsText')"
              :action-label="t('ui.empty.resetFilters')"
              action-icon="i-ph-arrow-counter-clockwise"
              @action="() => { locationFilter = 'all' }"
            />
            <CoreEmptyState
              v-else
              icon="i-ph-calendar-dots"
              :title="t('events.admin.emptyTitle')"
              :description="t('events.admin.empty')"
              :action-label="t('events.admin.create')"
              action-icon="i-ph-plus"
              @action="openCreate"
            />
          </template>
        </UTable>
      </ClientOnly>

      <EventFormModal v-model:open="modalOpen" :event="editingRow" @saved="() => refresh()" />

    </template>
  </UDashboardPanel>
</template>
