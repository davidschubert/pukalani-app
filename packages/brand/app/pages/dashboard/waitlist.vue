<script setup lang="ts">
/**
 * DIE WARTELISTE ALS BETREIBER-FLÄCHE (Davids Entscheidung 2026-09-05).
 *
 * `brand_waitlist` füllte sich seit dem Double-Opt-in still vor sich hin und
 * war nur in der Appwrite-Konsole sichtbar — eine Warteliste, die niemand
 * liest, ist keine. Diese Seite ist das Gegenstück zu „Anfragen"/„Einladungen"
 * im Control Plane: Eintrag prüfen → Beta-Code zuweisen → Einladungs-Mail raus.
 *
 * ── DER STANDARD IST „BESTÄTIGT", NICHT „ALLE" ───────────────────────────
 * Das ist die Arbeitsliste. `pending` heißt, der Mensch hat den Link in seinem
 * Postfach noch nicht geöffnet — dort gibt es nichts zu entscheiden. Der Filter
 * steht trotzdem oben, weil „wie viele hängen im Opt-in?" eine echte Frage ist.
 *
 * ── DER KLARTEXT EINES CODES KOMMT HIER NIE VOR ──────────────────────────
 * Er existiert genau zwischen Erzeugung und Mail (gespeichert wird nur sein
 * sha256). Deshalb gibt es keinen „Code anzeigen"-Knopf und keine Wiederholung
 * derselben Einladung: eine `invited`-Zeile bekommt über diese Fläche keinen
 * zweiten Code — der Nachschlag bleibt `pnpm brand:invite`.
 *
 * ── UTable IST GESETZT (Davids Entscheidung B6) ──────────────────────────
 * Sortierung, Auswahl und Paginierung verhalten sich damit überall gleich; der
 * Leerzustand läuft über `CoreEmptyState`.
 */
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import {
  BRAND_WAITLIST_DEFAULT_FILTER,
  BRAND_WAITLIST_FILTERS,
  BRAND_WAITLIST_STATUSES,
  type BrandWaitlistFilter,
  type BrandWaitlistStatus,
} from '../../../shared/brandWaitlistAdmin'
import { BRAND_WAITLIST_NOTE_MAX } from '../../../schemas/brandWaitlist'
import type {
  BrandWaitlistAdminItem,
  BrandWaitlistAdminListResponse,
  BrandWaitlistDeclineResponse,
  BrandWaitlistInviteResponse,
  BrandWaitlistNoteResponse,
} from '../../../shared/types/brand'

/**
 * DIE ERSTE SEITE DIESES LAYERS MIT DER BETREIBER-SHELL: `layout: 'dashboard'`
 * und die `admin`-Middleware gehören dem admin-Layer. `apps/branding` zieht ihn
 * seit 2026-09-03 (Davids „eigener Dashboard-Zugang wie auf allen anderen
 * Pukalani-Websites"); der `.playground` dieses Layers zieht ihn NICHT — dort
 * ist diese Adresse folgerichtig nicht bedienbar. Die übrigen brand-Seiten
 * (/dashboard/brands/*) bleiben bewusst beim default-Layout: sie sind
 * Kunden-Fläche.
 */
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'admin'],
  requiredCapability: 'users.manage',
  // Betreiber-Sache: auf einem Mandanten-Host gäbe es diese Liste nicht (der
  // Orts-Wächter antwortet dort 404). `branding` ist ein Silo — hier ist sie
  // immer sichtbar; die Angabe ist die Aussage, nicht die Ausnahme.
  dashboardScope: 'operator',
})

const { t, locale } = useI18n()
const toast = useToast()
useBrandTitle(() => t('brand.admin.waitlist.title'))

const filter = ref<BrandWaitlistFilter>(BRAND_WAITLIST_DEFAULT_FILTER)

const { data, refresh, status } = await useFetch<BrandWaitlistAdminListResponse>(
  '/api/brand/admin/waitlist',
  {
    // Reaktive Query: ein Filterwechsel lädt neu, ohne eigenen Watcher.
    query: { status: filter },
    lazy: true,
    server: false,
  },
)

const items = computed(() => data.value?.items ?? [])
const counts = computed(() => data.value?.counts)

const filterItems = computed(() => BRAND_WAITLIST_FILTERS.map(value => ({
  value,
  label: t(`brand.admin.waitlist.filter.${value}`),
})))

/** Der Export folgt der Ansicht — was man sieht, ist was man herunterlädt. */
const exportHref = computed(() => `/api/brand/admin/waitlist/export?status=${filter.value}`)

// ── Aktionen ───────────────────────────────────────────────────────────────

const busy = ref<string | null>(null)
const inviting = ref<BrandWaitlistAdminItem | null>(null)
const declining = ref<BrandWaitlistAdminItem | null>(null)
const noting = ref<BrandWaitlistAdminItem | null>(null)
const noteDraft = ref('')

/**
 * Der fachliche Ablehnungsgrund reist als `data.code` durch den zentralen
 * Fehler-Handler und kommt als `error.data.reason` an (core/server/error.ts).
 * Ein unbekannter Code fällt auf den allgemeinen Satz zurück — ein leerer Toast
 * wäre schlimmer als ein ungenauer.
 */
const KNOWN_REASONS = ['not_confirmed', 'already_invited', 'invite_mail_failed', 'waitlist_unavailable', 'not_found']

function reasonOf(error: unknown): string {
  const reason = (error as { data?: { reason?: string } })?.data?.reason ?? ''
  return KNOWN_REASONS.includes(reason) ? reason : 'generic'
}

function failToast(error: unknown) {
  const reason = reasonOf(error)
  toast.add({
    title: t('brand.admin.waitlist.actionFailed'),
    description: t(`brand.admin.waitlist.error.${reason}`),
    color: reason === 'invite_mail_failed' ? 'warning' : 'error',
  })
}

async function invite() {
  const entry = inviting.value
  if (!entry) return
  busy.value = entry.id
  try {
    await $fetch<BrandWaitlistInviteResponse>(`/api/brand/admin/waitlist/${entry.id}/invite`, { method: 'POST' })
    inviting.value = null
    toast.add({
      title: t('brand.admin.waitlist.invited', { email: entry.email }),
      description: t('brand.admin.waitlist.invitedHint'),
      color: 'success',
    })
    await refresh()
  }
  catch (error) {
    failToast(error)
    // Nachladen auch im Fehlerfall: bei `already_invited` steht die Wahrheit
    // schon in der Ablage, und der Betreiber soll sie sehen statt sie zu raten.
    await refresh()
  }
  finally {
    busy.value = null
  }
}

async function decline() {
  const entry = declining.value
  if (!entry) return
  busy.value = entry.id
  try {
    await $fetch<BrandWaitlistDeclineResponse>(`/api/brand/admin/waitlist/${entry.id}/decline`, { method: 'POST' })
    declining.value = null
    toast.add({ title: t('brand.admin.waitlist.declined', { email: entry.email }), color: 'success' })
    await refresh()
  }
  catch (error) {
    failToast(error)
    await refresh()
  }
  finally {
    busy.value = null
  }
}

function openNote(entry: BrandWaitlistAdminItem) {
  noting.value = entry
  noteDraft.value = entry.note
}

async function saveNote() {
  const entry = noting.value
  if (!entry) return
  busy.value = entry.id
  try {
    await $fetch<BrandWaitlistNoteResponse>(`/api/brand/admin/waitlist/${entry.id}`, {
      method: 'PATCH',
      body: { note: noteDraft.value },
    })
    noting.value = null
    toast.add({ title: t('brand.admin.waitlist.noteSaved'), color: 'success' })
    await refresh()
  }
  catch (error) {
    failToast(error)
  }
  finally {
    busy.value = null
  }
}

// ── Darstellung ────────────────────────────────────────────────────────────

const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))
function formatDate(value: string): string {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? dateFormat.value.format(parsed) : ''
}

const statusColor: Record<BrandWaitlistStatus, 'neutral' | 'info' | 'success' | 'warning'> = {
  pending: 'neutral',
  confirmed: 'info',
  invited: 'success',
  declined: 'warning',
}

/** Die Adresse ohne Schema — im Text kürzer, im Link vollständig. */
function websiteLabel(value: string): string {
  return value.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }
const HIDE_LG = { td: 'hidden lg:table-cell', th: 'hidden lg:table-cell' }

const columns = computed<TableColumn<BrandWaitlistAdminItem>[]>(() => [
  { accessorKey: 'email', header: () => t('brand.admin.waitlist.col.email') },
  { id: 'who', header: () => t('brand.admin.waitlist.col.who'), meta: { class: HIDE_MD } },
  { accessorKey: 'website', header: () => t('brand.admin.waitlist.col.website'), meta: { class: HIDE_LG } },
  { accessorKey: 'source', header: () => t('brand.admin.waitlist.col.source'), meta: { class: HIDE_LG } },
  { accessorKey: 'status', header: () => t('brand.admin.waitlist.col.status') },
  { accessorKey: 'createdAt', header: () => t('brand.admin.waitlist.col.date'), meta: { class: HIDE_MD } },
  { id: 'actions', header: srOnlyHeader(() => t('ui.table.actions')) },
])

/**
 * Die Fallunterscheidung steht EINMAL hier und spiegelt die Regeln der Routen
 * (`shared/brandWaitlistAdmin.ts`): einladen nur aus `confirmed`, ablehnen
 * nicht aus `invited`. Die Seite kennt die Regel, durchsetzen tut sie der
 * Server — ein Knopf, der ins 409 führt, wäre trotzdem eine schlechte Auskunft.
 */
function rowActions(entry: BrandWaitlistAdminItem): DropdownMenuItem[][] {
  const actions: DropdownMenuItem[] = []
  if (entry.status === 'confirmed') {
    actions.push({
      label: t('brand.admin.waitlist.action.invite'),
      icon: 'i-ph-paper-plane-tilt',
      onSelect: () => { inviting.value = entry },
    })
  }
  if (entry.status !== 'invited' && entry.status !== 'declined') {
    actions.push({
      label: t('brand.admin.waitlist.action.decline'),
      icon: 'i-ph-x',
      color: 'error',
      onSelect: () => { declining.value = entry },
    })
  }
  actions.push({
    label: t('brand.admin.waitlist.action.note'),
    icon: 'i-ph-note-pencil',
    onSelect: () => { openNote(entry) },
  })
  return [actions]
}
</script>

<template>
  <UDashboardPanel id="brand-waitlist">
    <template #header>
      <UDashboardNavbar :title="t('brand.admin.waitlist.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            :to="exportHref"
            external
            icon="i-ph-download-simple"
            color="neutral"
            variant="ghost"
            :label="t('brand.admin.waitlist.export')"
            data-waitlist-export
          />
          <UButton
            icon="i-ph-arrows-clockwise"
            color="neutral"
            variant="ghost"
            :loading="status === 'pending'"
            :aria-label="t('brand.admin.waitlist.refresh')"
            @click="refresh()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="mb-4 text-sm text-muted">{{ t('brand.admin.waitlist.subtitle') }}</p>

      <!-- Was wartet, was ist bestätigt, was ist raus, was ist abgelehnt -->
      <div v-if="counts" class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4" data-waitlist-counts>
        <div v-for="key in BRAND_WAITLIST_STATUSES" :key="key" class="rounded-xl border border-default p-4">
          <p class="text-2xl font-semibold tabular-nums">{{ counts[key] }}</p>
          <p class="text-sm text-muted">{{ t(`brand.admin.waitlist.counts.${key}`) }}</p>
        </div>
      </div>

      <div class="mb-4 flex items-center gap-3">
        <USelect
          v-model="filter"
          :items="filterItems"
          class="w-56"
          :aria-label="t('brand.admin.waitlist.filterLabel')"
          data-waitlist-filter
        />
        <span class="text-sm text-dimmed">{{ t('brand.admin.waitlist.shown', { count: items.length }) }}</span>
      </div>

      <UTable :data="items" :columns="columns" data-waitlist-list>
        <template #email-cell="{ row }">
          <div class="min-w-0">
            <p class="font-medium">{{ row.original.email }}</p>
            <p v-if="row.original.note" class="line-clamp-1 text-xs text-muted" :title="row.original.note">
              {{ row.original.note }}
            </p>
          </div>
        </template>

        <template #who-cell="{ row }">
          <div class="min-w-0 text-sm">
            <p v-if="row.original.company" class="font-medium">{{ row.original.company }}</p>
            <p v-if="row.original.name" class="text-muted">{{ row.original.name }}</p>
            <span v-if="!row.original.company && !row.original.name" class="text-dimmed">—</span>
          </div>
        </template>

        <template #website-cell="{ row }">
          <a
            v-if="row.original.website"
            :href="row.original.website"
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm hover:underline"
          >{{ websiteLabel(row.original.website) }}</a>
          <span v-else class="text-dimmed">—</span>
        </template>

        <template #source-cell="{ row }">
          <UBadge v-if="row.original.source" color="neutral" variant="subtle" size="sm">
            {{ row.original.source }}
          </UBadge>
          <span v-else class="text-dimmed">—</span>
        </template>

        <template #status-cell="{ row }">
          <UBadge :color="statusColor[row.original.status]" variant="subtle" size="sm">
            {{ t(`brand.admin.waitlist.status.${row.original.status}`) }}
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
                :aria-label="t('brand.admin.waitlist.rowActions')"
                :loading="busy === row.original.id"
              />
            </UDropdownMenu>
          </div>
        </template>

        <template #empty>
          <CoreEmptyState
            icon="i-ph-list-checks"
            :title="t('brand.admin.waitlist.emptyTitle')"
            :description="t('brand.admin.waitlist.empty')"
            data-waitlist-empty
          />
        </template>
      </UTable>

      <!-- Einladen: ein Code geht raus, und zwar genau einmal -->
      <UModal
        :open="Boolean(inviting)"
        :title="t('brand.admin.waitlist.inviteTitle')"
        @update:open="(open) => { if (!open) inviting = null }"
      >
        <template #body>
          <p class="text-sm">{{ t('brand.admin.waitlist.inviteText', { email: inviting?.email ?? '' }) }}</p>
          <p class="mt-2 text-sm text-muted">{{ t('brand.admin.waitlist.inviteHint') }}</p>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('ui.cancel')" @click="inviting = null" />
            <UButton
              :loading="busy === inviting?.id"
              :label="t('brand.admin.waitlist.action.invite')"
              data-waitlist-invite-confirm
              @click="invite()"
            />
          </div>
        </template>
      </UModal>

      <!-- Ablehnen: die Zeile bleibt stehen, nur der Status wechselt -->
      <UModal
        :open="Boolean(declining)"
        :title="t('brand.admin.waitlist.declineTitle')"
        @update:open="(open) => { if (!open) declining = null }"
      >
        <template #body>
          <p class="text-sm">{{ t('brand.admin.waitlist.declineText', { email: declining?.email ?? '' }) }}</p>
          <p class="mt-2 text-sm text-muted">{{ t('brand.admin.waitlist.declineHint') }}</p>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('ui.cancel')" @click="declining = null" />
            <UButton
              color="error"
              :loading="busy === declining?.id"
              :label="t('brand.admin.waitlist.action.decline')"
              data-waitlist-decline-confirm
              @click="decline()"
            />
          </div>
        </template>
      </UModal>

      <!-- Notiz: gehört dem Betreiber, kein Code schreibt hier hinein -->
      <UModal
        :open="Boolean(noting)"
        :title="t('brand.admin.waitlist.noteTitle')"
        @update:open="(open) => { if (!open) noting = null }"
      >
        <template #body>
          <UFormField :label="t('brand.admin.waitlist.noteLabel')" :description="t('brand.admin.waitlist.noteHint')">
            <UTextarea
              v-model="noteDraft"
              :rows="4"
              :maxlength="BRAND_WAITLIST_NOTE_MAX"
              :placeholder="t('brand.admin.waitlist.notePlaceholder')"
              class="w-full"
              autofocus
              data-waitlist-note
            />
          </UFormField>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('ui.cancel')" @click="noting = null" />
            <UButton :loading="busy === noting?.id" :label="t('ui.save')" @click="saveNote()" />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
