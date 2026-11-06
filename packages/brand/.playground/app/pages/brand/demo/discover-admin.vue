<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

/**
 * KLICKDUMMY „BETREIBER-SEITE DISCOVER" — Skizze von `/dashboard/discover`
 * (docs/plans/DISCOVER-BRANDS.md §4.4, Davids Entscheidung §9.1: FREIGABE VOR
 * VERÖFFENTLICHUNG). Statisch: kein Backend, die Knöpfe schalten nur den
 * Zustand dieser Seite.
 *
 * DREI REITER, DREI FRAGEN:
 *  · Warteschlange — was will veröffentlicht werden? (`pending`)
 *  · Veröffentlicht — was steht draußen? (`published`, dazu Featured/Ausblenden)
 *  · Meldungen — was hat jemand beanstandet?
 *
 * UTABLE, NICHT HANDGEBAUT (Davids Regel B6): das sind drei Datenlisten mit
 * gleichartigen Zeilen — Sortierung und Auswahl kommen mitgeliefert und
 * verhalten sich hier wie überall im Dashboard. Die Zähler stehen an den
 * Reitern, wie bei der Warteliste.
 *
 * Die echte Seite trägt `requiredCapability: 'users.manage'` und lebt in der
 * Betreiber-Shell; dieser Dummy behält die Playground-Hülle, damit David von
 * der Galerie aus hin- und zurückklicken kann.
 */

/* ── Warteschlange ──────────────────────────────────────────────────────── */
interface QueueRow {
  id: string
  title: string
  slug: string
  submitted: string
  metric: string
  value: number
  owner: string
}

const queue = ref<QueueRow[]>([
  { id: 'q1', title: 'Trailtage', slug: 'trailtage', submitted: 'vor 2 Stunden', metric: 'Brand Score', value: 82, owner: 'Konto · j.tesch@…' },
  { id: 'q2', title: 'Mila & Ben', slug: 'mila-und-ben', submitted: 'gestern', metric: 'Fundament-Reife', value: 78, owner: 'Konto · lena.k@…' },
  { id: 'q3', title: 'Faltwerk Architektur', slug: 'faltwerk-architektur', submitted: 'vor 3 Tagen', metric: 'Brand Score', value: 89, owner: 'Konto · mail@…' },
])

const queueColumns: TableColumn<QueueRow>[] = [
  { accessorKey: 'title', header: 'Marke' },
  { accessorKey: 'submitted', header: 'Eingereicht', id: 'submitted' },
  { accessorKey: 'value', header: 'Zahl', id: 'value' },
  { id: 'actions', header: 'Entscheidung' },
]

/* ── Veröffentlicht ─────────────────────────────────────────────────────── */
interface PublishedRow {
  id: string
  title: string
  slug: string
  stand: string
  metric: string
  value: number
  reports: number
  featured: boolean
}

const published = ref<PublishedRow[]>([
  { id: 'p1', title: 'Kailua Coffee Co.', slug: 'kailua-coffee-co', stand: '5. Sep 2026', metric: 'Brand Score', value: 87, reports: 0, featured: true },
  { id: 'p2', title: 'Nordlicht Physio', slug: 'nordlicht-physio', stand: '1. Sep 2026', metric: 'Brand Score', value: 91, reports: 0, featured: false },
  { id: 'p3', title: 'Bergwerk Studio', slug: 'bergwerk-studio', stand: '28. Aug 2026', metric: 'Fundament-Reife', value: 92, reports: 1, featured: false },
  { id: 'p4', title: 'Studio Anker', slug: 'studio-anker', stand: '24. Aug 2026', metric: 'Brand Score', value: 86, reports: 0, featured: false },
  { id: 'p5', title: 'Backhaus Lore', slug: 'backhaus-lore', stand: '19. Aug 2026', metric: 'Fundament-Reife', value: 85, reports: 1, featured: false },
])

const publishedColumns: TableColumn<PublishedRow>[] = [
  { accessorKey: 'title', header: 'Titel' },
  { accessorKey: 'slug', header: 'Adresse', id: 'slug' },
  { accessorKey: 'stand', header: 'Stand', id: 'stand' },
  { accessorKey: 'value', header: 'Zahl', id: 'value' },
  { accessorKey: 'reports', header: 'Meldungen', id: 'reports' },
  { id: 'featured', header: 'Featured' },
  { id: 'actions', header: 'Aktion' },
]

/* ── Meldungen ──────────────────────────────────────────────────────────── */
interface ReportRow {
  id: string
  brand: string
  reason: string
  reporter: string
  age: string
  done: boolean
}

const reports = ref<ReportRow[]>([
  { id: 'r1', brand: 'Bergwerk Studio', reason: 'Das Logo im Hero gehört einer anderen Firma — das ist nicht deren Marke.', reporter: 'anonym', age: 'vor 4 Stunden', done: false },
  { id: 'r2', brand: 'Backhaus Lore', reason: 'Im Kapitel Werte steht eine echte Kundenbeschwerde mit Namen.', reporter: 'k.reuter@…', age: 'gestern', done: false },
])

const reportColumns: TableColumn<ReportRow>[] = [
  { accessorKey: 'brand', header: 'Marke' },
  { accessorKey: 'reason', header: 'Grund', id: 'reason' },
  { accessorKey: 'age', header: 'Eingegangen', id: 'age' },
  { id: 'actions', header: 'Aktion' },
]

/* ── Ablehnen: Begründung ist PFLICHT ───────────────────────────────────────
 * Der Kunde SIEHT die Begründung (§3.4) — eine Ablehnung ohne Satz wäre für
 * ihn eine geschlossene Tür ohne Klinke. Deshalb ist „Ablehnen" im Dialog
 * gesperrt, solange das Feld leer ist. Gleiches Muster beim Ausblenden. */
const declineFor = ref<QueueRow | null>(null)
const declineNote = ref('')
const DECLINE_MAX = 300

function openDecline(row: QueueRow): void {
  declineFor.value = row
  declineNote.value = ''
}

function confirmDecline(): void {
  const row = declineFor.value
  if (!row) return
  queue.value = queue.value.filter(entry => entry.id !== row.id)
  declineFor.value = null
}

function approve(row: QueueRow): void {
  queue.value = queue.value.filter(entry => entry.id !== row.id)
  published.value = [{
    id: `p-${row.id}`,
    title: row.title,
    slug: row.slug,
    stand: 'heute',
    metric: row.metric,
    value: row.value,
    reports: 0,
    featured: false,
  }, ...published.value]
}

function hide(row: PublishedRow): void {
  published.value = published.value.filter(entry => entry.id !== row.id)
}

function resolveReport(row: ReportRow): void {
  row.done = true
}

/* ── Reiter mit Zählern ─────────────────────────────────────────────────── */
const tab = ref('queue')
const openReports = computed(() => reports.value.filter(entry => !entry.done).length)
const tabs = computed(() => [
  { value: 'queue', label: 'Warteschlange', badge: queue.value.length },
  { value: 'published', label: 'Veröffentlicht', badge: published.value.length },
  { value: 'reports', label: 'Meldungen', badge: openReports.value },
])
</script>

<template>
  <div class="bw-root min-h-dvh px-6 pb-10">
    <BwSiteNav />
    <div class="mx-auto max-w-7xl">
      <NuxtLink to="/brand/demo/discover" class="bw-label inline-flex items-center gap-1.5" style="color: var(--bw-muted)">
        <UIcon name="i-ph-arrow-left" class="size-4" /> Discover Brands
      </NuxtLink>

      <div class="mt-4">
        <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Betreiber · /dashboard/discover</p>
        <h1 class="mt-1 text-3xl font-extralight leading-tight tracking-tight">Veröffentlichungen</h1>
        <p class="mt-3 max-w-2xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
          Jede Marke wird erst öffentlich, wenn sie hier freigegeben ist. Eine Ablehnung braucht eine Begründung — der Kunde sieht sie in seiner Leseansicht und kann erneut einreichen.
        </p>
      </div>

      <!-- Reiter mit Zählern (Muster Warteliste) -->
      <div class="mt-8 flex flex-wrap items-center gap-2">
        <button
          v-for="entry in tabs" :key="entry.value"
          class="bw-select-card inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
          :class="tab === entry.value ? 'bw-select-card--on' : ''"
          @click="tab = entry.value"
        >
          {{ entry.label }}
          <span class="bw-label rounded-full px-2 py-0.5" :style="tab === entry.value ? 'background: rgb(247 242 234 / 0.2)' : 'background: var(--bw-line)'">{{ entry.badge }}</span>
        </button>
      </div>

      <!-- WARTESCHLANGE -->
      <div v-if="tab === 'queue'" class="bw-card mt-6 overflow-x-auto p-2">
        <UTable v-if="queue.length" :data="queue" :columns="queueColumns">
          <template #title-cell="{ row }">
            <div class="min-w-0">
              <p class="font-medium">{{ row.original.title }}</p>
              <p class="bw-label" style="color: var(--bw-muted)">/discover/{{ row.original.slug }} · {{ row.original.owner }}</p>
            </div>
          </template>
          <template #value-cell="{ row }">
            <div class="flex items-center gap-2">
              <BwScoreRing :value="row.original.value" :size="32" />
              <span class="bw-label" style="color: var(--bw-muted)">{{ row.original.metric }}</span>
            </div>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex flex-wrap items-center justify-end gap-2">
              <UButton to="/brand/demo/anatomie" size="sm" color="neutral" variant="ghost" icon="i-ph-eye" label="Vorschau" />
              <UButton size="sm" icon="i-ph-check" label="Freigeben" class="rounded-full" @click="approve(row.original)" />
              <UButton size="sm" color="neutral" variant="outline" label="Ablehnen" class="rounded-full" @click="openDecline(row.original)" />
            </div>
          </template>
        </UTable>
        <p v-else class="p-10 text-center text-sm" style="color: var(--bw-muted)">Nichts wartet auf eine Entscheidung.</p>
      </div>

      <!-- VERÖFFENTLICHT -->
      <div v-else-if="tab === 'published'" class="bw-card mt-6 overflow-x-auto p-2">
        <UTable :data="published" :columns="publishedColumns">
          <template #title-cell="{ row }">
            <p class="font-medium">{{ row.original.title }}</p>
          </template>
          <template #slug-cell="{ row }">
            <NuxtLink to="/brand/demo/anatomie" class="bw-label underline underline-offset-4" style="color: var(--bw-muted)">/discover/{{ row.original.slug }}</NuxtLink>
          </template>
          <template #stand-cell="{ row }">
            <span class="bw-label whitespace-nowrap" style="color: var(--bw-muted)">{{ row.original.stand }}</span>
          </template>
          <template #value-cell="{ row }">
            <div class="flex items-center gap-2">
              <BwScoreRing :value="row.original.value" :size="32" />
              <span class="bw-label" style="color: var(--bw-muted)">{{ row.original.metric }}</span>
            </div>
          </template>
          <template #reports-cell="{ row }">
            <span v-if="row.original.reports" class="bw-state bw-state--stale">{{ row.original.reports }} offen</span>
            <span v-else class="bw-label" style="color: var(--bw-muted)">—</span>
          </template>
          <template #featured-cell="{ row }">
            <!-- Featured = Brand of the Day. Genau EINE Marke trägt es; der
                 Schalter im Dummy erlaubt bewusst auch mehrere, damit David
                 sieht, dass die Regel im Server sitzt und nicht im Knopf. -->
            <USwitch v-model="row.original.featured" :aria-label="`${row.original.title} als Brand of the Day`" />
          </template>
          <template #actions-cell="{ row }">
            <div class="flex items-center justify-end">
              <UButton size="sm" color="neutral" variant="ghost" icon="i-ph-eye-slash" label="Ausblenden" @click="hide(row.original)" />
            </div>
          </template>
        </UTable>
      </div>

      <!-- MELDUNGEN -->
      <div v-else class="bw-card mt-6 overflow-x-auto p-2">
        <UTable :data="reports" :columns="reportColumns">
          <template #brand-cell="{ row }">
            <div class="min-w-0">
              <p class="font-medium">{{ row.original.brand }}</p>
              <p class="bw-label" style="color: var(--bw-muted)">{{ row.original.reporter }}</p>
            </div>
          </template>
          <template #reason-cell="{ row }">
            <p class="max-w-md text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ row.original.reason }}</p>
          </template>
          <template #age-cell="{ row }">
            <span class="bw-label whitespace-nowrap" style="color: var(--bw-muted)">{{ row.original.age }}</span>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex flex-wrap items-center justify-end gap-2">
              <UButton to="/brand/demo/anatomie" size="sm" color="neutral" variant="ghost" icon="i-ph-eye" label="Ansehen" />
              <span v-if="row.original.done" class="bw-state bw-state--confirmed">Erledigt</span>
              <UButton v-else size="sm" color="neutral" variant="outline" label="Erledigen" class="rounded-full" @click="resolveReport(row.original)" />
            </div>
          </template>
        </UTable>
      </div>

      <p class="bw-pending mt-8">Klickdummy — Entscheidungen wirken nur in dieser Sitzung.</p>
      <BwSiteFooter />
    </div>

    <!-- ABLEHNEN MIT BEGRÜNDUNG -->
    <UModal :open="!!declineFor" @update:open="value => { if (!value) declineFor = null }">
      <template #content>
        <div class="bw-root relative p-8" style="background: var(--bw-surface-hi)">
          <button
            class="absolute right-5 top-5 grid size-8 place-items-center rounded-full"
            aria-label="Schließen" @click="declineFor = null"
          >
            <UIcon name="i-ph-x" class="size-4.5" style="color: var(--bw-ink-soft)" />
          </button>
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Ablehnen</p>
          <h2 class="mt-1 text-[28px] font-extralight leading-tight tracking-tight">{{ declineFor?.title }}</h2>
          <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            Die Begründung steht in der Leseansicht des Kunden. Schreibt sie so, dass er weiß, was er ändern muss.
          </p>
          <UFormField label="Begründung" class="mt-5" :hint="`${declineNote.length}/${DECLINE_MAX}`">
            <UTextarea v-model="declineNote" :rows="4" :maxlength="DECLINE_MAX" placeholder="Im Kapitel Werte steht ein fremdes Logo …" class="w-full" />
          </UFormField>
          <div class="mt-6 flex flex-wrap items-center gap-2">
            <UButton label="Ablehnen" class="rounded-full" :disabled="!declineNote.trim()" @click="confirmDecline" />
            <UButton label="Abbrechen" color="neutral" variant="ghost" @click="declineFor = null" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
