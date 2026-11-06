<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { BwNewBrandSubmit } from '../../components/BwNewBrandModal.vue'
import type {
  BrandCheckStartResponse,
  BrandProfileScores,
  BrandProfileScoresResponse,
} from '../../../shared/types/brand'

/**
 * „MEINE BRANDS & SCORES" ALS LISTE — `/dashboard/brand-scores`
 * (Davids Auftrag 2026-09-06: „kann ich die auch im Dashboard sehen als Liste?
 * damit ich die Übersicht nicht verliere"; Konzept BRAND-CHECK-SEITE §5).
 *
 * Die Karten-Übersicht (`/dashboard/brands`) zeigt je Brand EINE Zahl, weil
 * eine Karte für zwei keinen Platz hat. Wer fünf Brands führt, will aber
 * genau das Gegenteil: alle Zahlen untereinander, vergleichbar, sortierbar.
 * Das ist diese Seite — und deshalb ist sie eine TABELLE (`UTable`, Davids
 * B6-Regel) und keine zweite Kartenwand.
 *
 * ── EIN ABRUF, KEINE ZWEITE RUNDREISE ─────────────────────────────────────
 * Die Zeile braucht Stammdaten UND Zahlen. Beides kommt aus
 * `GET /api/brand/profiles/scores`: die Route LIEST die `brand_profiles`-Zeilen
 * ohnehin (ohne sie wüsste sie nicht, welche Brands zu fragen sind), Titel,
 * Adresse und Branche kosten dort also keine zusätzliche Abfrage. Ein zweiter
 * Abruf von `GET /api/brand/profiles` wäre eine Rundreise für Daten, die die
 * erste Antwort schon in der Hand hält — und dazwischen ein Zwischenzustand,
 * in dem eine Zeile ihre Zahl schon zeigt und ihren Namen noch nicht.
 *
 * ── ZWEI SPALTEN, NIE EINE ZAHL ───────────────────────────────────────────
 * Website-Score und Fundament-Reife stehen nebeneinander und werden nie
 * verrechnet (§5b): sie messen Verschiedenes. „—" heisst „dafür gibt es noch
 * keinen Check", nicht „null Punkte".
 *
 * ── DAS 404 DES GATES IST EIN ZUSTAND, KEINE FEHLERSEITE ──────────────────
 * `requireBrandAccess` antwortet ohne Beta-Zugang mit 404 (Datentür-Muster).
 * Dieselbe Antwort wie auf der Karten-Übersicht: „noch kein Zugang" mit dem
 * Weg zur Einladung, keine Fehlerseite.
 *
 * ── LAYOUT `default`, NICHT `dashboard` ───────────────────────────────────
 * `/dashboard/brands/*` ist KUNDEN-Fläche und läuft über das default-Layout
 * mit der Wizard-Navigation; die Betreiber-Shell (`layout: 'dashboard'` +
 * `middleware: admin`) gehört dem admin-Layer und verlangt `dashboard.access`,
 * das ein Beta-Kunde nicht hat. Diese Seite ist die Schwester von
 * `/dashboard/brands` und `/dashboard/brands/<id>/score` — also dasselbe
 * Layout, dieselbe Middleware. Ihr Menüpunkt wohnt aus demselben Grund im
 * Konto-Menü von `BwSiteNav` (dort steht „Brandings") und nicht in
 * `pukalani.admin.modules`: die Registry rendert nur in der Betreiber-Shell.
 */
definePageMeta({ layout: 'default', middleware: 'auth' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const request = useRequestFetch()
const toast = useToast()

/**
 * `denied` ist die 404 der Datentür, nicht „leer": ein Konto ohne Beta-Zugang
 * hat keine Brands, weil es keine anlegen DARF — der Leerzustand mit dem Knopf
 * „Brand anlegen" wäre dort eine Einladung ins Nichts.
 */
const denied = ref(false)

const { data, refresh, status } = await useAsyncData<BrandProfileScoresResponse | null>(
  'brand-scores-list',
  async () => {
    try {
      const response = await request<BrandProfileScoresResponse>('/api/brand/profiles/scores')
      denied.value = false
      return response
    }
    catch (error) {
      denied.value = statusOf(error) === 404
      return null
    }
  },
)

const rows = computed<BrandProfileScores[]>(() => data.value?.items ?? [])

// ── Kopfzeile: wie viele, und wie gut im Schnitt ───────────────────────────

/**
 * Der Durchschnitt zählt NUR geprüfte Websites. Ein ungeprüfter Auftritt ist
 * keine Null — er ist keine Angabe, und ihn als Null mitzurechnen zöge den
 * Schnitt nach unten und behauptete ein Ergebnis, das niemand ermittelt hat.
 */
const checked = computed(() => rows.value.filter(row => row.website !== null))

const averageWebsite = computed(() => {
  if (!checked.value.length) return 0
  const sum = checked.value.reduce((total, row) => total + (row.website?.score ?? 0), 0)
  return Math.round(sum / checked.value.length)
})

const summary = computed(() => (checked.value.length
  ? t('brand.myScores.list.summary', { count: rows.value.length, avg: averageWebsite.value })
  : t('brand.myScores.list.summaryEmpty', { count: rows.value.length })))

// ── Anzeige-Helfer ─────────────────────────────────────────────────────────

/** Wie überall im Layer in UTC — sonst rechnet der Server anders als der Browser. */
function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale.value === 'de' ? 'de-DE' : 'en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(date)
}

/**
 * Der HOST reicht — die volle Adresse mit Schema und Pfad sprengt jede
 * Tabellenspalte, und wiedererkannt wird eine Marke an ihrer Domain.
 * Unlesbares bleibt stehen, wie es der Mensch eingetragen hat: ein Strich
 * wäre dort die falsche Auskunft (es IST eine Adresse hinterlegt).
 */
function hostOf(url: string): string {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  }
  catch {
    return url
  }
}

function titleOf(row: BrandProfileScores): string {
  return row.title || t('brand.brands.card.untitled')
}

function scorePath(row: BrandProfileScores): string {
  return localePath(`/dashboard/brands/${row.profileId}/score`)
}

/** Der jüngere der beiden Stände — „wann haben wir hier zuletzt hingesehen?". */
function lastCheckAt(row: BrandProfileScores): string {
  const dates = [row.website?.createdAt, row.document?.createdAt].filter((value): value is string => !!value)
  return dates.sort((a, b) => b.localeCompare(a))[0] ?? ''
}

// ── Die Läufe ──────────────────────────────────────────────────────────────

interface FetchErrorLike {
  status?: number
  statusCode?: number
  response?: { status?: number }
  data?: { reason?: string }
}

function statusOf(error: unknown): number {
  const value = error as FetchErrorLike | null
  return value?.status ?? value?.statusCode ?? value?.response?.status ?? 0
}

/**
 * Dieselbe Übersetzung wie auf der Score-Seite: der zentrale Fehler-Handler
 * hebt `data.code` als `reason` ins Envelope (CLAUDE.md), die Statuszahl ist
 * der Rückfall. Der Konto-Deckel bekommt BEWUSST einen eigenen Satz — „für
 * heute aufgebraucht" ist eine andere Auskunft als „gerade nicht erreichbar".
 */
function messageKey(error: unknown): string {
  const value = error as FetchErrorLike | null
  const code = statusOf(error)
  const reason = typeof value?.data?.reason === 'string' ? value.data.reason : ''
  if (reason === 'brand_check_account_limit') return 'accountLimit'
  if (reason === 'document_empty') return 'documentEmpty'
  if (reason === 'profile_not_found') return 'notFound'
  if (reason === 'blocked_target') return 'blockedTarget'
  // BS1 R2b: die geprüfte Website untersagt die automatische Auswertung. VOR
  // dem 409-Rückfall, der hier sonst „Dokument leer" sagen würde.
  if (reason === 'site_blocked') return 'siteBlocked'
  if (reason === 'fetch_failed') return 'fetchFailed'
  if (reason === 'check_unavailable') return 'unavailable'
  if (code === 429) return 'accountLimit'
  if (code === 409) return 'documentEmpty'
  if (code === 503) return 'unavailable'
  if (code === 422) return 'fetchFailed'
  if (code === 400) return 'invalidUrl'
  return 'generic'
}

/**
 * WELCHE ZEILE gerade läuft, und in welcher Quelle. Ein einzelner Schlüssel
 * statt zweier Mengen: ein KI-Aufruf je Klick, und zwei gleichzeitig laufende
 * Prüfungen derselben Brand wären zwei bezahlte Läufe auf dieselbe Frage.
 */
const running = ref('')

function runKey(profileId: string, source: 'website' | 'document'): string {
  return `${profileId}:${source}`
}

function isRunning(profileId: string, source: 'website' | 'document'): boolean {
  return running.value === runKey(profileId, source)
}

async function run(row: BrandProfileScores, source: 'website' | 'document'): Promise<void> {
  if (running.value) return
  running.value = runKey(row.profileId, source)
  try {
    if (source === 'website') {
      await $fetch<BrandCheckStartResponse>('/api/brand/check', {
        method: 'POST',
        body: {
          url: row.websiteUrl,
          locale: locale.value === 'de' ? 'de' : 'en',
          // „Neu ermitteln" heisst: den Sieben-Tage-Zwischenspeicher umgehen.
          // Ohne `force` käme dieselbe Zahl zurück und der Knopf täte sichtbar
          // nichts — genau dafür gibt es den Konto-Deckel (10/Tag).
          force: true,
          profileId: row.profileId,
        },
      })
    }
    else {
      await $fetch<BrandCheckStartResponse>(
        `/api/brand/profiles/${encodeURIComponent(row.profileId)}/check`,
        // ERST beim ZWEITEN Mal erzwingen: der erste Lauf findet ohnehin nichts
        // im Zwischenspeicher, und mit `force` wäre der versehentliche
        // Doppelklick ein zweiter bezahlter Aufruf.
        { method: 'POST', body: { force: row.document !== null } },
      )
    }
    // Ein Lauf schreibt genau EINE neue Zeile; die Liste kostet einen Abruf,
    // und ein Nachladen der ganzen Tabelle ist ehrlicher als eine von Hand
    // fortgeschriebene Zeile, die neben der Wahrheit stehen kann.
    await refresh()
    toast.add({ title: t('brand.myScores.list.done'), duration: 2500 })
  }
  catch (error) {
    toast.add({
      title: t('brand.myScores.list.failed'),
      description: t(`brand.myScores.errors.${messageKey(error)}`),
      color: 'error',
    })
  }
  finally {
    running.value = ''
  }
}

// ── Die Tabelle ────────────────────────────────────────────────────────────

/**
 * Sortiert wird im BROWSER (`v-model:sorting`, UTable bringt das Modell mit):
 * die Liste ist auf 50 Brands gedeckelt (`PROFILE_LIMIT` der Route), da ist
 * eine Server-Sortierung eine Rundreise für nichts.
 *
 * `-1` für „kein Check": der Wert steht NUR in der Sortierung, angezeigt wird
 * ein Strich. Er sortiert ungeprüfte Brands unter jede geprüfte — auch bei
 * absteigender Sortierung, wo eine 0 sie zwischen die schwachen Ergebnisse
 * mischen würde.
 */
const NO_SCORE = -1

const sorting = ref<{ id: string, desc: boolean }[]>([])

const columns = computed<TableColumn<BrandProfileScores>[]>(() => [
  { id: 'brand', accessorFn: row => titleOf(row).toLocaleLowerCase(locale.value) },
  { id: 'website', accessorFn: row => hostOf(row.websiteUrl), enableSorting: false },
  { id: 'websiteScore', accessorFn: row => row.website?.score ?? NO_SCORE },
  { id: 'documentScore', accessorFn: row => row.document?.score ?? NO_SCORE },
  { id: 'lastCheck', accessorFn: row => lastCheckAt(row), enableSorting: false },
  { id: 'actions', header: srOnlyHeader(() => t('ui.table.actions')), enableSorting: false },
])

/** Aufsteigend → absteigend → aus; dasselbe Verhalten wie überall im Dashboard. */
function sortIcon(direction: false | 'asc' | 'desc'): string {
  if (direction === 'asc') return 'i-ph-arrow-up'
  if (direction === 'desc') return 'i-ph-arrow-down'
  return 'i-ph-arrows-down-up'
}

// ── Anlegen (derselbe Weg wie auf der Karten-Übersicht) ────────────────────

const newBrandOpen = ref(false)

/**
 * Das Modal LEGT AN und springt in die Werkstatt (Kailua-Befund 6) —
 * wortgleich zur Karten-Übersicht und zur Werkstatt-Leiste, und zwar
 * buchstäblich: alle drei rufen `useBrandCreate`. Ein zweiter Anlage-Weg wäre
 * ein zweites Formular für dieselbe Sache.
 */
const {
  contentLocales: newBrandLocales,
  creating: newBrandCreating,
  failed: newBrandFailed,
  create: createBrand,
} = useBrandCreate()

async function createFromModal(payload: BwNewBrandSubmit): Promise<void> {
  if (await createBrand(payload)) newBrandOpen.value = false
}

useBrandTitle(() => t('brand.myScores.list.title'))
</script>

<template>
  <div class="bw-root pb-10">
    <div class="mx-auto w-full max-w-(--ui-container)">
      <div class="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold">{{ t('brand.myScores.list.title') }}</h1>
          <p class="mt-1 text-sm" style="color: var(--bw-muted)">{{ t('brand.myScores.list.subtitle') }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <span v-if="!denied && rows.length" class="bw-label" style="color: var(--bw-muted)" data-scores-summary>
            {{ summary }}
          </span>
          <UButton
            :to="localePath('/dashboard/brands')" icon="i-ph-squares-four" variant="outline" color="neutral"
            :label="t('brand.brands.title')"
          />
        </div>
      </div>

      <!-- Kein Beta-Zugang: derselbe Zustand wie auf der Karten-Übersicht. -->
      <div
        v-if="denied"
        class="bw-rounded-card flex flex-col items-center justify-center border border-dashed p-10 text-center"
        style="border-color: var(--bw-line-strong)"
        data-scores-denied
      >
        <BwIllustration variant="journey" class="mx-auto h-16 w-auto" style="color: var(--bw-ink-soft)" />
        <p class="mt-4 font-medium">{{ t('brand.workspace.noAccess.title') }}</p>
        <p class="mt-1 max-w-md text-sm" style="color: var(--bw-muted)">{{ t('brand.workspace.noAccess.description') }}</p>
        <UButton
          class="mt-4" icon="i-ph-envelope-open" variant="outline"
          :label="t('brand.workspace.noAccess.action')" :to="localePath('/invite')"
        />
      </div>

      <section v-else data-scores-table>
        <UTable v-model:sorting="sorting" :data="rows" :columns="columns" :loading="status === 'pending'">
          <template #brand-header="{ column }">
            <UButton
              variant="ghost" color="neutral" size="sm" class="-mx-2.5"
              :label="t('brand.myScores.list.col.brand')"
              :icon="sortIcon(column.getIsSorted())"
              :aria-label="t('brand.myScores.list.sortBy', { column: t('brand.myScores.list.col.brand') })"
              data-scores-sort-brand
              @click="column.toggleSorting(column.getIsSorted() === 'asc')"
            />
          </template>

          <template #websiteScore-header="{ column }">
            <UButton
              variant="ghost" color="neutral" size="sm" class="-mx-2.5"
              :label="t('brand.myScores.list.col.websiteScore')"
              :icon="sortIcon(column.getIsSorted())"
              :aria-label="t('brand.myScores.list.sortBy', { column: t('brand.myScores.list.col.websiteScore') })"
              data-scores-sort-website
              @click="column.toggleSorting(column.getIsSorted() === 'asc')"
            />
          </template>

          <template #documentScore-header="{ column }">
            <UButton
              variant="ghost" color="neutral" size="sm" class="-mx-2.5"
              :label="t('brand.myScores.list.col.documentScore')"
              :icon="sortIcon(column.getIsSorted())"
              :aria-label="t('brand.myScores.list.sortBy', { column: t('brand.myScores.list.col.documentScore') })"
              data-scores-sort-document
              @click="column.toggleSorting(column.getIsSorted() === 'asc')"
            />
          </template>

          <template #website-header>
            <span class="bw-label" style="color: var(--bw-muted)">{{ t('brand.myScores.list.col.website') }}</span>
          </template>

          <template #lastCheck-header>
            <span class="bw-label" style="color: var(--bw-muted)">{{ t('brand.myScores.list.col.lastCheck') }}</span>
          </template>

          <template #brand-cell="{ row }">
            <div class="min-w-0">
              <NuxtLink
                :to="scorePath(row.original)"
                class="font-medium tracking-tight hover:underline"
                :data-scores-brand="row.original.profileId"
              >{{ titleOf(row.original) }}</NuxtLink>
              <p v-if="row.original.industry" class="bw-label mt-0.5 truncate" style="color: var(--bw-muted)">
                {{ row.original.industry }}
              </p>
            </div>
          </template>

          <!-- Ohne Adresse gibt es keinen Website-Check — und der fehlende
               Schritt steht dort, wo die Lücke ist. Nachgetragen wird sie auf
               der Score-Seite: dort sitzt das eine Feld (`PATCH /api/brand/
               profiles/:id`), und ein zweites Formular in einer Tabellenzelle
               wäre dieselbe Sache an zwei Stellen. -->
          <template #website-cell="{ row }">
            <a
              v-if="row.original.websiteUrl"
              :href="row.original.websiteUrl" target="_blank" rel="noopener noreferrer nofollow"
              class="text-sm hover:underline" style="color: var(--bw-ink-soft)"
            >{{ hostOf(row.original.websiteUrl) }}</a>
            <NuxtLink
              v-else :to="scorePath(row.original)" class="bw-label hover:underline"
              style="color: var(--bw-muted)" :data-scores-add-url="row.original.profileId"
            >{{ t('brand.myScores.list.addUrl') }}</NuxtLink>
          </template>

          <template #websiteScore-cell="{ row }">
            <div v-if="row.original.website" class="min-w-0">
              <BwScorePill :value="row.original.website.score" :band="row.original.website.band" />
              <p class="bw-label mt-0.5" style="color: var(--bw-muted)">{{ formatDate(row.original.website.createdAt) }}</p>
            </div>
            <span v-else style="color: var(--bw-muted)">—</span>
          </template>

          <template #documentScore-cell="{ row }">
            <div v-if="row.original.document" class="min-w-0">
              <BwScorePill :value="row.original.document.score" :band="row.original.document.band" />
              <p class="bw-label mt-0.5" style="color: var(--bw-muted)">{{ formatDate(row.original.document.createdAt) }}</p>
            </div>
            <span v-else style="color: var(--bw-muted)">—</span>
          </template>

          <template #lastCheck-cell="{ row }">
            <span v-if="lastCheckAt(row.original)" class="text-sm" style="color: var(--bw-muted)">
              {{ formatDate(lastCheckAt(row.original)) }}
            </span>
            <span v-else class="bw-label" style="color: var(--bw-muted)">{{ t('brand.myScores.list.never') }}</span>
          </template>

          <template #actions-cell="{ row }">
            <div class="flex flex-wrap justify-end gap-2">
              <UButton
                size="xs" color="neutral" variant="subtle"
                :disabled="!row.original.websiteUrl || (running !== '' && !isRunning(row.original.profileId, 'website'))"
                :loading="isRunning(row.original.profileId, 'website')"
                :label="t('brand.myScores.list.runWebsite')"
                :data-scores-run-website="row.original.profileId"
                @click="run(row.original, 'website')"
              />
              <UButton
                size="xs" color="neutral" variant="ghost"
                :disabled="running !== '' && !isRunning(row.original.profileId, 'document')"
                :loading="isRunning(row.original.profileId, 'document')"
                :label="t('brand.myScores.list.runDocument')"
                :data-scores-run-document="row.original.profileId"
                @click="run(row.original, 'document')"
              />
            </div>
          </template>

          <template #empty>
            <CoreEmptyState
              icon="i-ph-gauge"
              :title="t('brand.myScores.list.emptyTitle')"
              :description="t('brand.myScores.list.empty')"
              :action-label="t('brand.myScores.list.emptyCta')"
              data-scores-empty
              @action="newBrandOpen = true"
            />
          </template>
        </UTable>
      </section>
    </div>

    <BwNewBrandModal
      v-model:open="newBrandOpen" mode="live"
      :content-locales="newBrandLocales" :loading="newBrandCreating" :failed="newBrandFailed"
      @submit="createFromModal"
    />
  </div>
</template>
