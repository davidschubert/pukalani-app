<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { InsightsBrand, InsightsBrandEdit, InsightsBrandState } from '../../../../shared/insightsPost'
import { INSIGHTS_BRAND_STATES, insightsBrandEditSchema } from '../../../../shared/insightsPost'
import type {
  InsightsBrandCreatedResponse,
  InsightsBrandDetailResponse,
  InsightsBrandListItem,
  InsightsBrandSavedResponse,
  InsightsBrandsListResponse,
} from '../../../../shared/types/insightsApi'
import { createInsightsBrandSchema } from '../../../utils/insightsForms'

/**
 * DIE MARKEN-ENTITÄTEN (§9.4, Adresse `/dashboard/insights/brands`).
 *
 * ── WOFÜR ES DIESE SEITE GIBT ────────────────────────────────────────────
 * Prüfregel 6 verlangt, dass jede genannte Marke eine eigene Zeile hat —
 * „sonst gibt es keinen Ort, an dem ein Korrekturvorschlag ankommen könnte".
 * Die Schnellanlage im Beitrags-Editor macht diese Zeile; sie kennt drei
 * Felder. Hier steht der ganze Vertrag (§9.3): Zeichen, Historie,
 * Beziehungen, Belege — und der Notausgang aus Entscheidung 11
 * (`state: 'removed'` MIT Grund).
 *
 * ── DER STANDARD-FILTER IST „ALLE", NICHT „OFFEN" ────────────────────────
 * Anders als die Korrekturen nebenan: das hier ist kein Posteingang, sondern
 * ein VERZEICHNIS. Wer es öffnet, sucht meist eine bestimmte Marke, und die
 * kann in jedem der drei Zustände stehen. Die Reiter mit ihren Zählern sind
 * trotzdem da — „wie viele sind noch Entwurf?" ist die zweithäufigste Frage.
 *
 * ── DIE ZÄHLER KOMMEN AUS DER GELADENEN LISTE ────────────────────────────
 * Die Route liefert bis zu `INSIGHTS_BRANDS_LIMIT` (200) Zeilen ungefiltert;
 * gefiltert und gezählt wird hier. Das ist ehrlicher als drei zusätzliche
 * Zähl-Abfragen: Zahlen und Zeilen stammen garantiert aus demselben Stand.
 * Ab dem Tag, an dem 200 nicht mehr reichen, gehört beides auf den Server —
 * dann aber gemeinsam.
 *
 * ── BEARBEITET WIRD IN EINEM USLIDEOVER, NICHT AUF EINER EIGENEN SEITE ───
 * Eine Marke ist ein FORMULAR, kein Dokument: keine zwei Sprachfassungen,
 * kein Fliesstext, kein Zustands-Gate mit sechs Prüfregeln. Der Beitrag hat
 * dafür eine Vollseite, weil er all das hat. Eine dritte Adresse
 * (`/dashboard/insights/brands/<id>`) für zwanzig Felder wäre ein Rücksprung
 * pro Bearbeitung und ein zweiter Ladevorgang für die Liste dahinter.
 */
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'admin'],
  requiredCapability: 'insights.manage',
  // Betreiber-Sache, wie Liste, Editor und Radar daneben.
  dashboardScope: 'operator',
})

const { t, locale } = useI18n()
const toast = useToast()
useBrandTitle(() => t('insights.brands.title'))

// ── Laden ──────────────────────────────────────────────────────────────────

const { data, refresh, status } = await useFetch<InsightsBrandsListResponse>('/api/insights/brands', {
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

const brands = computed(() => data.value?.brands ?? [])

type BrandFilter = InsightsBrandState | 'all'
const FILTERS: readonly BrandFilter[] = [...INSIGHTS_BRAND_STATES, 'all']
const filter = ref<BrandFilter>('all')

const counts = computed(() => {
  const result = Object.fromEntries(INSIGHTS_BRAND_STATES.map(state => [state, 0])) as Record<InsightsBrandState, number>
  for (const brand of brands.value) result[brand.state] += 1
  return result
})

const filterItems = computed(() => FILTERS.map(value => ({
  value,
  label: t(`insights.brands.filter.${value}`),
  count: value === 'all'
    ? brands.value.length
    : counts.value[value],
})))

const rows = computed(() => brands.value.filter(brand => filter.value === 'all' || brand.state === filter.value))

const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }))
function formatDate(value: string): string {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? dateFormat.value.format(parsed) : ''
}

const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }
const HIDE_LG = { td: 'hidden lg:table-cell', th: 'hidden lg:table-cell' }

const columns = computed<TableColumn<InsightsBrandListItem>[]>(() => [
  { id: 'name', header: () => t('insights.brands.col.name') },
  { accessorKey: 'slug', header: () => t('insights.brands.col.slug'), meta: { class: HIDE_MD } },
  { accessorKey: 'industry', header: () => t('insights.brands.col.industry'), meta: { class: HIDE_MD } },
  { accessorKey: 'country', header: () => t('insights.brands.col.country'), meta: { class: HIDE_LG } },
  { accessorKey: 'state', header: () => t('insights.brands.col.state') },
  { accessorKey: 'updatedAt', header: () => t('insights.brands.col.updated'), meta: { class: HIDE_LG } },
  // Ein Kopf DARF nicht leer bleiben (stiller Hydrations-Fehler) — `srOnlyHeader`
  // trägt die Beschriftung für Vorleseprogramme.
  { id: 'actions', header: srOnlyHeader(() => t('ui.table.actions')) },
])

const stateColor: Record<InsightsBrandState, 'neutral' | 'success' | 'warning'> = {
  draft: 'neutral',
  published: 'success',
  removed: 'warning',
}

// ── Fehler ─────────────────────────────────────────────────────────────────

/**
 * Der GRUND einer Ablehnung — aus `error.data.reason`, wie überall in diesem
 * Layer. Ein 400 des Schemas trägt keinen (Zod, nicht Fachlichkeit); dafür
 * gibt es den eigenen Satz `validation`, der auf die Felder zeigt.
 */
const REASON_KEY: Record<string, string> = {
  brand_not_found: 'insights.brands.error.notFound',
  slug_taken: 'insights.brands.error.slugTaken',
  storage_unavailable: 'insights.editor.error.storageUnavailable',
}

function fail(error: unknown): void {
  const data = (error as { data?: { reason?: unknown, code?: unknown } } | undefined)?.data
  const reason = typeof data?.reason === 'string' ? data.reason : ''
  const key = REASON_KEY[reason]
    ?? (data?.code === 'VALIDATION_ERROR' ? 'insights.brands.error.validation' : 'insights.editor.error.generic')
  toast.add({ title: t(key), color: 'error' })
}

// ── Bearbeiten ─────────────────────────────────────────────────────────────

/**
 * DER ENTWURF IM FORMULAR — eine tiefe Kopie der Server-Antwort.
 *
 * Ohne sie änderte jede Eingabe die Zeile in der Tabelle dahinter, und ein
 * Abbrechen liesse sie geändert stehen (dasselbe Argument wie `clone()` im
 * Beitrags-Editor).
 */
function emptyDraft(): InsightsBrandEdit {
  return {
    slug: '',
    name: '',
    homepage: '',
    libraryKey: '',
    checkId: '',
    publicationId: '',
    industry: '',
    country: '',
    foundedYear: null,
    archetype: '',
    archetypeSecondary: '',
    paletteId: '',
    marks: [],
    history: [],
    relations: [],
    sources: [],
    state: 'draft',
    removalReason: '',
  }
}

/**
 * ZEILE → FORMULAR. JEDES Feld ausgeschrieben (CLAUDE.md) und JEDE Liste als
 * eigene Kopie — ein Spread über die Antwort brächte ausserdem die drei
 * Server-eigenen Felder (`slugHistory`, `removedAt`, `claimedBy`) mit, die
 * dieses Formular gar nicht schicken darf.
 */
function toDraft(brand: InsightsBrand): InsightsBrandEdit {
  return {
    slug: brand.slug,
    name: brand.name,
    homepage: brand.homepage,
    libraryKey: brand.libraryKey,
    checkId: brand.checkId,
    publicationId: brand.publicationId,
    industry: brand.industry,
    country: brand.country,
    foundedYear: brand.foundedYear,
    archetype: brand.archetype,
    archetypeSecondary: brand.archetypeSecondary,
    paletteId: brand.paletteId,
    marks: brand.marks.map(mark => ({ ...mark })),
    history: brand.history.map(entry => ({ ...entry })),
    relations: [...brand.relations],
    sources: brand.sources.map(source => ({ ...source })),
    state: brand.state,
    removalReason: brand.removalReason,
  }
}

const editingId = ref('')
const editOpen = ref(false)
const loadingDetail = ref(false)
const saving = ref(false)
const draft = reactive<InsightsBrandEdit>(emptyDraft())

async function openBrand(id: string): Promise<void> {
  editingId.value = id
  editOpen.value = true
  loadingDetail.value = true
  try {
    const detail = await $fetch<InsightsBrandDetailResponse>(`/api/insights/brands/${id}`)
    Object.assign(draft, toDraft(detail.brand))
  }
  catch (error) {
    editOpen.value = false
    fail(error)
  }
  finally {
    loadingDetail.value = false
  }
}

async function save(): Promise<void> {
  saving.value = true
  try {
    const saved = await $fetch<InsightsBrandSavedResponse>(`/api/insights/brands/${editingId.value}`, {
      method: 'PATCH',
      body: draft,
    })
    // Der Server kann die Adresse geändert haben (`titel-2`) — der Entwurf
    // übernimmt sie, sonst schickt das nächste Speichern die alte zurück.
    draft.slug = saved.brand.slug
    toast.add({ title: t('insights.brands.saved'), color: 'success' })
    editOpen.value = false
    await refresh()
  }
  catch (error) {
    fail(error)
  }
  finally {
    saving.value = false
  }
}

// ── Die Felder, die eine eigene Rechnung brauchen ──────────────────────────

/** Leer heisst `null` und nicht `0`: es gibt keinen Jahrgang 0, und `null`
 *  sagt „unbekannt" ehrlicher als eine Zahl (dieselbe Regel wie in der
 *  Ablage-Abbildung). */
const foundedYearInput = computed({
  get: () => (draft.foundedYear === null ? '' : String(draft.foundedYear)),
  set: (value: string) => {
    const trimmed = value.trim()
    const parsed = Number.parseInt(trimmed, 10)
    draft.foundedYear = trimmed && Number.isFinite(parsed) ? parsed : null
  },
})

const stateItems = computed(() => INSIGHTS_BRAND_STATES.map(state => ({
  label: t(`insights.brands.state.${state}`),
  value: state,
})))

/** Die anderen Marken zur Auswahl — die eigene Zeile ist keine Beziehung zu
 *  sich selbst. */
const relationItems = computed(() => brands.value
  .filter(brand => brand.id !== editingId.value)
  .map(brand => ({ label: brand.name, value: brand.id })))

/** Die Beleg-Auswahl der Zeilen-Editoren: „Quelle 1", „Quelle 2", … Ein
 *  Zeiger auf eine Quelle, die es nicht gibt, fällt am Schema (`Zeichen ohne
 *  Beleg`) — die Auswahl zeigt deshalb nur, was da ist. */
const sourceItems = computed(() => [
  // `-1` steht als EIGENER Eintrag drin: ein numerisches USelect zeigt einen
  // Wert ohne Eintrag roh an („-1" statt des Platzhalters, Klick-Beweis
  // 2026-09-10). Das Schema weist ihn weiter ab — der Fehler steht dann
  // lesbar unter dem Feld (`name` an der Zeile).
  { label: t('insights.brands.sourceIndexNone'), value: -1 },
  ...draft.sources.map((source, index) => ({
    label: t('insights.editor.at.source', { number: index + 1 }),
    value: index,
  })),
])

/** Ausgeschrieben statt gerechnet — ein zusammengebauter i18n-Schlüssel wäre
 *  für den Wächter unsichtbar (dieselbe Regel wie bei den Quellen-Arten). */
const MARK_KIND_KEY = {
  symbol: 'insights.profile.markSymbol',
  claim: 'insights.profile.markClaim',
  type: 'insights.profile.markType',
  color: 'insights.profile.markColor',
} as const

const markKindItems = computed(() => (Object.keys(MARK_KIND_KEY) as (keyof typeof MARK_KIND_KEY)[]).map(kind => ({
  label: t(MARK_KIND_KEY[kind]),
  value: kind,
})))

function addMark(): void {
  draft.marks.push({ kind: 'symbol', text: '', sourceIndex: draft.sources.length ? 0 : -1 })
}
function removeMark(index: number): void {
  draft.marks.splice(index, 1)
}

function addHistory(): void {
  draft.history.push({ year: new Date().getFullYear(), text: '', sourceIndex: draft.sources.length ? 0 : -1 })
}
function removeHistory(index: number): void {
  draft.history.splice(index, 1)
}

/**
 * EINE QUELLE ENTFERNEN — und die Beleg-Zeiger MITZIEHEN.
 *
 * Wörtlich dieselbe Rechnung wie im Beitrags-Editor, nur für ZWEI Listen:
 * `marks[].sourceIndex` und `history[].sourceIndex` zeigen auf eine POSITION.
 * Zeiger auf genau diese Quelle werden ungültig (`-1`), damit das Schema sie
 * zeigt statt sie stillschweigend auf die falsche Quelle umzubiegen.
 */
function removeSource(index: number): void {
  draft.sources.splice(index, 1)
  for (const list of [draft.marks, draft.history]) {
    for (const entry of list) {
      if (entry.sourceIndex === index) entry.sourceIndex = -1
      else if (entry.sourceIndex > index) entry.sourceIndex -= 1
    }
  }
}

// ── Neue Marke ─────────────────────────────────────────────────────────────

const newOpen = ref(false)
const creating = ref(false)
const newSchema = computed(() => createInsightsBrandSchema(t))
const newForm = reactive({ name: '', homepage: '', industry: '' })

async function createBrand(): Promise<void> {
  creating.value = true
  try {
    const created = await $fetch<InsightsBrandCreatedResponse>('/api/insights/brands', {
      method: 'POST',
      body: { name: newForm.name.trim(), homepage: newForm.homepage, industry: newForm.industry },
    })
    newOpen.value = false
    newForm.name = ''
    newForm.homepage = ''
    newForm.industry = ''
    await refresh()
    // Direkt aufschlagen: die Schnellanlage kennt drei Felder, der Rest des
    // Vertrags wartet im Formular.
    await openBrand(created.id)
  }
  catch (error) {
    fail(error)
  }
  finally {
    creating.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="insights-brands">
    <template #header>
      <UDashboardNavbar :title="t('insights.brands.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-ph-arrows-clockwise" color="neutral" variant="ghost"
            :loading="pending"
            :aria-label="t('insights.brands.refresh')"
            @click="refresh()"
          />
          <UButton :label="t('insights.brands.new')" icon="i-ph-plus" @click="newOpen = true" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="text-sm leading-relaxed text-muted">{{ t('insights.brands.lead') }}</p>

      <div class="mt-4 mb-6 flex flex-wrap gap-2" data-insights-brands-filter>
        <UButton
          v-for="entry in filterItems"
          :key="entry.value"
          :color="filter === entry.value ? 'primary' : 'neutral'"
          :variant="filter === entry.value ? 'solid' : 'subtle'"
          size="sm"
          :data-insights-brands-tab="entry.value"
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
        data-insights-brands-list
      >
        <template #name-cell="{ row }">
          <button class="text-left text-sm font-medium hover:underline" @click="openBrand(row.original.id)">
            {{ row.original.name }}
          </button>
        </template>
        <template #slug-cell="{ row }">
          <span class="font-mono text-xs text-muted">{{ row.original.slug }}</span>
        </template>
        <template #industry-cell="{ row }">
          <span class="text-sm text-muted">{{ row.original.industry || '—' }}</span>
        </template>
        <template #country-cell="{ row }">
          <span class="text-sm uppercase text-muted">{{ row.original.country || '—' }}</span>
        </template>
        <template #state-cell="{ row }">
          <UBadge :color="stateColor[row.original.state]" variant="subtle" size="sm">
            {{ t(`insights.brands.state.${row.original.state}`) }}
          </UBadge>
        </template>
        <template #updatedAt-cell="{ row }">
          <span class="text-sm tabular-nums text-dimmed">{{ formatDate(row.original.updatedAt) }}</span>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UButton
              icon="i-ph-pencil-simple" size="xs" color="neutral" variant="ghost"
              :aria-label="t('insights.brands.edit')"
              :data-insights-brand-edit="row.original.id"
              @click="openBrand(row.original.id)"
            />
          </div>
        </template>

        <template #empty>
          <CoreEmptyState
            icon="i-ph-buildings"
            :title="t('insights.brands.emptyTitle')"
            :description="t('insights.brands.emptyDescription')"
            :action-label="t('insights.brands.new')"
            action-icon="i-ph-plus"
            data-insights-brands-empty
            @action="newOpen = true"
          />
        </template>
      </UTable>

      <!-- Bearbeiten. `bw-root` trägt den Token-Satz des brand-Layers — ohne
           ihn stünden die `var(--bw-*)`-Farben des Quellen-Panels auf
           Vorgabewerten. -->
      <USlideover
        v-model:open="editOpen"
        :title="draft.name || t('insights.brands.edit')"
        :description="t('insights.brands.editHint')"
        :ui="{ content: 'sm:max-w-2xl' }"
      >
        <template #body>
          <div class="bw-root">
            <div v-if="loadingDetail" class="flex justify-center py-12">
              <UIcon name="i-ph-circle-notch" class="size-6 animate-spin text-muted" />
            </div>

            <UForm
              v-else
              :schema="insightsBrandEditSchema"
              :state="draft"
              class="space-y-6"
              data-insights-brand-form
              @submit="save"
            >
              <div class="grid gap-3 sm:grid-cols-2">
                <UFormField :label="t('insights.editor.brandName')" name="name" required>
                  <UInput v-model="draft.name" class="w-full" :maxlength="200" />
                </UFormField>
                <UFormField :label="t('insights.editor.slug')" name="slug" :description="t('insights.brands.slugHint')" required>
                  <UInput v-model="draft.slug" class="w-full font-mono text-xs" :maxlength="160" />
                </UFormField>
                <UFormField :label="t('insights.editor.brandHomepage')" name="homepage">
                  <UInput v-model="draft.homepage" class="w-full font-mono text-xs" :maxlength="512" />
                </UFormField>
                <UFormField :label="t('insights.editor.brandIndustry')" name="industry">
                  <UInput v-model="draft.industry" class="w-full" :maxlength="40" />
                </UFormField>
                <UFormField :label="t('insights.profile.country')" name="country" :description="t('insights.brands.countryHint')">
                  <UInput v-model="draft.country" class="w-full uppercase" :maxlength="2" />
                </UFormField>
                <UFormField :label="t('insights.brands.foundedYear')" name="foundedYear">
                  <UInput v-model="foundedYearInput" class="w-full tabular-nums" inputmode="numeric" :maxlength="4" />
                </UFormField>
                <UFormField :label="t('insights.profile.archetype')" name="archetype">
                  <UInput v-model="draft.archetype" class="w-full" :maxlength="40" />
                </UFormField>
                <UFormField :label="t('insights.brands.archetypeSecondary')" name="archetypeSecondary">
                  <UInput v-model="draft.archetypeSecondary" class="w-full" :maxlength="40" />
                </UFormField>
                <UFormField :label="t('insights.brands.paletteId')" name="paletteId">
                  <UInput v-model="draft.paletteId" class="w-full font-mono text-xs" :maxlength="40" />
                </UFormField>
                <UFormField :label="t('insights.brands.libraryKey')" name="libraryKey">
                  <UInput v-model="draft.libraryKey" class="w-full font-mono text-xs" :maxlength="64" />
                </UFormField>
                <UFormField :label="t('insights.brands.checkId')" name="checkId" :description="t('insights.brands.checkIdHint')">
                  <UInput v-model="draft.checkId" class="w-full font-mono text-xs" :maxlength="64" />
                </UFormField>
                <UFormField :label="t('insights.brands.publicationId')" name="publicationId" :description="t('insights.brands.publicationIdHint')">
                  <UInput v-model="draft.publicationId" class="w-full font-mono text-xs" :maxlength="64" />
                </UFormField>
              </div>

              <UFormField :label="t('insights.profile.relations')" name="relations" :description="t('insights.brands.relationsHint')">
                <USelectMenu
                  v-model="draft.relations"
                  :items="relationItems"
                  value-key="value"
                  multiple
                  class="w-full"
                  :placeholder="t('insights.brands.relationsPlaceholder')"
                />
              </UFormField>

              <!-- Quellen: dieselbe Komponente wie im Beitrags-Editor, nur
                   ohne Beleg-Ampel — die Route dahinter hängt an einem
                   Beitrag (s. Kopf von `InSourcesEditor`). -->
              <div class="bw-card p-5">
                <InSourcesEditor v-model="draft.sources" @remove="removeSource" />
              </div>

              <!-- Zeichen (§2.1): je ein Satz mit Beleg -->
              <div class="bw-card p-5">
                <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.profile.marks') }}</p>
                <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('insights.brands.marksHint') }}</p>
                <ul class="mt-4 space-y-3">
                  <li v-for="(mark, index) in draft.marks" :key="index" class="grid gap-2 sm:grid-cols-[10rem_1fr_10rem_auto] sm:items-end">
                    <UFormField :label="t('insights.brands.markKind')">
                      <USelect v-model="mark.kind" :items="markKindItems" value-key="value" class="w-full" />
                    </UFormField>
                    <UFormField :label="t('insights.brands.markText')" :name="`marks.${index}.text`">
                      <UInput v-model="mark.text" class="w-full" :maxlength="300" />
                    </UFormField>
                    <UFormField :label="t('insights.brands.sourceIndex')" :name="`marks.${index}.sourceIndex`">
                      <USelect
                        v-model="mark.sourceIndex" :items="sourceItems" value-key="value" class="w-full"
                        :placeholder="t('insights.brands.sourceIndexNone')"
                      />
                    </UFormField>
                    <UButton
                      icon="i-ph-trash" size="xs" color="neutral" variant="ghost"
                      :aria-label="t('insights.brands.markRemove')"
                      @click="removeMark(index)"
                    />
                  </li>
                </ul>
                <UButton
                  class="mt-4 rounded-full" icon="i-ph-plus" color="neutral" variant="ghost"
                  style="background: var(--bw-surface)"
                  :label="t('insights.brands.markAdd')"
                  @click="addMark"
                />
              </div>

              <!-- Historie (§9.3): Jahr, ein Satz, Beleg -->
              <div class="bw-card p-5">
                <p class="bw-label" style="color: var(--bw-muted)">{{ t('insights.profile.history') }}</p>
                <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('insights.brands.historyHint') }}</p>
                <ul class="mt-4 space-y-3">
                  <li v-for="(entry, index) in draft.history" :key="index" class="grid gap-2 sm:grid-cols-[7rem_1fr_10rem_auto] sm:items-end">
                    <UFormField :label="t('insights.brands.historyYear')" :name="`history.${index}.year`">
                      <UInput v-model.number="entry.year" class="w-full tabular-nums" inputmode="numeric" :maxlength="4" />
                    </UFormField>
                    <UFormField :label="t('insights.brands.historyText')" :name="`history.${index}.text`">
                      <UInput v-model="entry.text" class="w-full" :maxlength="300" />
                    </UFormField>
                    <UFormField :label="t('insights.brands.sourceIndex')" :name="`history.${index}.sourceIndex`">
                      <USelect
                        v-model="entry.sourceIndex" :items="sourceItems" value-key="value" class="w-full"
                        :placeholder="t('insights.brands.sourceIndexNone')"
                      />
                    </UFormField>
                    <UButton
                      icon="i-ph-trash" size="xs" color="neutral" variant="ghost"
                      :aria-label="t('insights.brands.historyRemove')"
                      @click="removeHistory(index)"
                    />
                  </li>
                </ul>
                <UButton
                  class="mt-4 rounded-full" icon="i-ph-plus" color="neutral" variant="ghost"
                  style="background: var(--bw-surface)"
                  :label="t('insights.brands.historyAdd')"
                  @click="addHistory"
                />
              </div>

              <!-- Zustand und Notausgang (Entscheidung 11) -->
              <div class="grid gap-3 sm:grid-cols-2">
                <UFormField :label="t('insights.brands.col.state')" name="state" required>
                  <USelect v-model="draft.state" :items="stateItems" value-key="value" class="w-full" data-insights-brand-state />
                </UFormField>
                <UFormField
                  v-if="draft.state === 'removed'"
                  :label="t('insights.brands.removalReason')"
                  name="removalReason"
                  :description="t('insights.brands.removalReasonHint')"
                  required
                >
                  <UInput v-model="draft.removalReason" class="w-full" :maxlength="300" />
                </UFormField>
              </div>

              <div class="flex justify-end gap-2">
                <UButton color="neutral" variant="ghost" :label="t('ui.cancel')" @click="editOpen = false" />
                <UButton type="submit" :loading="saving" :label="t('insights.editor.save')" data-insights-brand-save />
              </div>
            </UForm>
          </div>
        </template>
      </USlideover>

      <!-- Anlegen: drei Felder, wie im Beitrags-Editor (der Rest im Formular) -->
      <UModal v-model:open="newOpen" :title="t('insights.brands.new')">
        <template #body>
          <UForm :schema="newSchema" :state="newForm" class="space-y-3" @submit="createBrand">
            <UFormField :label="t('insights.editor.brandName')" name="name" required>
              <UInput v-model="newForm.name" class="w-full" :maxlength="200" />
            </UFormField>
            <UFormField :label="t('insights.editor.brandHomepage')" name="homepage">
              <UInput v-model="newForm.homepage" class="w-full font-mono text-xs" :maxlength="512" />
            </UFormField>
            <UFormField :label="t('insights.editor.brandIndustry')" name="industry">
              <UInput v-model="newForm.industry" class="w-full" :maxlength="40" />
            </UFormField>
            <UButton type="submit" :loading="creating" :label="t('insights.editor.brandCreate')" data-insights-brand-create />
          </UForm>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
