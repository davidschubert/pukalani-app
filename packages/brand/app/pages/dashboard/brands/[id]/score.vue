<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { RUN_LEASE_BUSY_CODE, RUN_LEASE_POLL_MS } from '../../../../../../core/shared/runLease'
import { pickBrandCheckTodos } from '../../../../../shared/brandCheck'
import type { BrandCheckRunEnd } from '../../../../../shared/brandCheckRunClient'
import {
  BRAND_RUN_POLL_TIMEOUT_MS,
  type BrandRunView,
  brandRunNoticeDue,
  noBrandRunView,
} from '../../../../../shared/brandRun'
import type {
  BrandCheckHistoryItem,
  BrandCheckHistoryResponse,
  BrandCheckResult,
  BrandCheckStartResponse,
  BrandProfileDetailResponse,
} from '../../../../../shared/types/brand'

/**
 * „MEINE BRANDS & SCORES" (docs/archiv/BRAND-CHECK-SEITE.md §5) —
 * `/dashboard/brands/<id>/score`.
 *
 * Vier Abschnitte, in der Reihenfolge, in der man sie braucht: die zwei Zahlen
 * (Website und Fundament), die Gegenüberstellung zum Vorgänger, die Liste
 * dessen, was ein Experte jetzt angehen würde, und der Verlauf.
 *
 * Sie RECHNET nur eines selbst: die To-do-Liste, und die über dieselbe pure
 * Regel wie die drei Befunde der Ergebnis-Seite (`pickBrandCheckTodos` — ohne
 * Deckel, sonst wörtlich `pickBrandCheckFindings`). Alles andere — Score,
 * Bänder, Kategorie-Werte, die Gegenüberstellung — kommt fertig vom Server.
 *
 * ── ZWEI ZAHLEN, NIE EINE ────────────────────────────────────────────────
 * Website-Score und Fundament-Reife stehen nebeneinander und werden NIE
 * verrechnet (§5b): sie messen Verschiedenes. Auch die Gegenüberstellung
 * vergleicht nur innerhalb einer Quelle — das erzwingt schon `diffBrandChecks`,
 * hier steht nur die Anzeige.
 *
 * ── NACH EINEM LAUF BLEIBEN WIR HIER ─────────────────────────────────────
 * Das öffentliche Formular springt auf die Ergebnis-Seite; hier nicht. Wer
 * „neu ermitteln" drückt, will die VERÄNDERUNG sehen, und die steht auf dieser
 * Seite. Das Ergebnis ist einen Klick entfernt („Ergebnis ansehen").
 *
 * ── DIE WEBSITE LÄSST SICH HIER NACHTRAGEN ───────────────────────────────
 * Ohne hinterlegte Adresse gibt es keinen Website-Check — und bis heute gibt
 * es keine Seite, auf der man sie nachträgt (die Startkarte wird nur beim
 * ANLEGEN erhoben). Das eine Feld hier ist deshalb kein Formular-Zoo, sondern
 * der fehlende Weg: `PATCH /api/brand/profiles/:id` kennt `websiteUrl`
 * längst.
 */
definePageMeta({ layout: 'default', middleware: 'auth' })

const { t, te, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const request = useRequestFetch()
const toast = useToast()

const profileId = computed(() => String(route.params.id ?? ''))

/**
 * Eine fremde oder fehlende Brand antwortet 404 — hier ein Zustand, kein Fehler.
 *
 * EIN AUSFALL IST KEIN ZUSTAND (LZ1, 2026-11-22): kein Status oder 5xx
 * (`isFetchOutage`) wirft jeder der drei Abrufe weiter, statt `null` zu
 * liefern. Sonst sagte die Seite bei einer Störung „Brand nicht gefunden",
 * „noch kein Check" oder ließ die To-dos still weg. Der Fehler steht dann im
 * `error` des Abrufs, und die Seite zeigt „Noch einmal versuchen".
 */
function nullUnlessOutage(error: unknown): null {
  if (isFetchOutage(error)) throw error
  return null
}

const { data: detail, status: detailStatus, error: detailError, refresh: refreshDetail } = await useAsyncData<BrandProfileDetailResponse | null>(
  'brand-score-profile',
  async () => {
    if (!profileId.value) return null
    try {
      return await request<BrandProfileDetailResponse>(`/api/brand/profiles/${encodeURIComponent(profileId.value)}`)
    }
    catch (error) {
      return nullUnlessOutage(error)
    }
  },
  { watch: [profileId] },
)

const { data: history, error: historyError, refresh: refreshHistory } = await useAsyncData<BrandCheckHistoryResponse | null>(
  'brand-score-history',
  async () => {
    if (!profileId.value) return null
    try {
      return await request<BrandCheckHistoryResponse>(`/api/brand/profiles/${encodeURIComponent(profileId.value)}/checks`)
    }
    catch (error) {
      return nullUnlessOutage(error)
    }
  },
  { watch: [profileId] },
)

const detailFailed = computed(() => isFetchOutage(detailError.value))
const historyFailed = computed(() => isFetchOutage(historyError.value))

const brandTitle = computed(() => detail.value?.profile.title ?? '')
const websiteUrl = computed(() => detail.value?.profile.startCard.websiteUrl ?? '')

const items = computed<BrandCheckHistoryItem[]>(() => history.value?.items ?? [])
const latestWebsite = computed(() => items.value.find(item => item.source !== 'document') ?? null)
const latestDocument = computed(() => items.value.find(item => item.source === 'document') ?? null)
const diff = computed(() => history.value?.diff ?? null)

/**
 * Die To-dos kommen aus dem JÜNGSTEN Website-Check, sonst aus dem Dokument-
 * Check (§5: „aus dem jüngsten Website-Check, sonst Dokument-Check"). Sie
 * brauchen die vierzig Kriterien MIT Belegen — die trägt nur das vollständige
 * Ergebnis, nicht der Verlauf.
 */
const todoSourceId = computed(() => (latestWebsite.value ?? latestDocument.value)?.id ?? '')

const { data: todoCheck, error: todoError, refresh: refreshTodoCheck } = await useAsyncData<BrandCheckResult | null>(
  'brand-score-todos',
  async () => {
    if (!todoSourceId.value) return null
    try {
      return await request<BrandCheckResult>(`/api/brand/check/${encodeURIComponent(todoSourceId.value)}`)
    }
    catch (error) {
      return nullUnlessOutage(error)
    }
  },
  { watch: [todoSourceId] },
)

const todoFailed = computed(() => isFetchOutage(todoError.value))

const todos = computed(() => (todoCheck.value ? pickBrandCheckTodos(todoCheck.value) : []))

// ── Anzeige-Helfer ─────────────────────────────────────────────────────────

/** Wie auf der Ergebnis-Seite in UTC — sonst bricht die Hydration. */
function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale.value === 'de' ? 'de-DE' : 'en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(date)
}

function categoryLabel(key: string): string {
  const messageKey = `brand.check.categories.${key}`
  return te(messageKey) ? t(messageKey) : key
}

function criterionTitle(criterionId: string): string {
  const key = `brand.check.criteria.${criterionId}.title`
  return te(key) ? t(key) : t('brand.check.result.criterionFallback')
}

function criterionNext(criterionId: string): string {
  const key = `brand.check.criteria.${criterionId}.next`
  return te(key) ? t(key) : t('brand.check.result.nextFallback')
}

function chapterLabel(stepKey: string): string {
  const key = `brand.steps.${stepKey}`
  return te(key) ? t(key) : stepKey
}

function sourceLabel(source: string): string {
  return source === 'document'
    ? t('brand.myScores.sources.document')
    : t('brand.myScores.sources.website')
}

function resultPath(checkId: string): string {
  return localePath(`/brand-check/${checkId}`)
}

/** Grün nach oben, rot nach unten, sonst ruhig — dieselbe Ampel wie im Ring. */
function trendColor(trend: string): string {
  if (trend === 'up') return 'var(--bw-accent)'
  if (trend === 'down') return 'var(--bw-stale)'
  return 'var(--bw-muted)'
}

function trendIcon(trend: string): string {
  if (trend === 'up') return 'i-ph-arrow-up'
  if (trend === 'down') return 'i-ph-arrow-down'
  if (trend === 'new') return 'i-ph-sparkle'
  return 'i-ph-equals'
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

// ── Die Läufe ──────────────────────────────────────────────────────────────

interface FetchErrorLike {
  status?: number
  statusCode?: number
  response?: { status?: number }
  data?: { reason?: string }
}

/**
 * Der zentrale Fehler-Handler hebt `data.code` als `reason` ins Envelope
 * (CLAUDE.md); die Statuszahl ist der Rückfall. Der Konto-Deckel bekommt
 * BEWUSST einen eigenen Satz — „für heute aufgebraucht" ist eine andere
 * Auskunft als „gerade nicht erreichbar", und nur die erste sagt dem Menschen,
 * dass morgen etwas anderes gilt.
 */
function messageKey(error: unknown): string {
  const value = error as FetchErrorLike | null
  const code = value?.status ?? value?.statusCode ?? value?.response?.status ?? 0
  const reason = typeof value?.data?.reason === 'string' ? value.data.reason : ''
  if (reason === 'brand_check_account_limit') return 'accountLimit'
  if (reason === 'document_empty') return 'documentEmpty'
  if (reason === 'profile_not_found') return 'notFound'
  if (reason === 'blocked_target') return 'blockedTarget'
  // BS1 R2b: die geprüfte Website untersagt die automatische Auswertung. VOR
  // dem 409-Rückfall, der hier sonst „Dokument leer" sagen würde.
  if (reason === 'site_blocked') return 'siteBlocked'
  if (reason === 'fetch_failed') return 'fetchFailed'
  // Der Abschalter (P17, BE-006) — ein eigener Satz, nicht „in ein paar
  // Minuten noch einmal".
  if (reason === 'check_paused') return 'paused'
  if (reason === 'check_unavailable') return 'unavailable'
  if (code === 429) return 'accountLimit'
  if (code === 409) return 'documentEmpty'
  if (code === 503) return 'unavailable'
  if (code === 422) return 'fetchFailed'
  if (code === 400) return 'invalidUrl'
  return 'generic'
}

/** Der Satz zu einem Website-Lauf, der nicht mit einem Ergebnis endete. */
function websiteRunErrorKey(end: BrandCheckRunEnd): string {
  // Der Grund eines Laufs ist dasselbe Wort wie früher der Fehler-Code.
  if (end.kind === 'failed') return messageKey({ data: { reason: end.reason } })
  if (end.kind === 'interrupted') return 'websiteInterrupted'
  if (end.kind === 'running') return 'websiteBackground'
  return 'generic'
}

const running = ref<'' | 'website' | 'document'>('')
const errorKey = ref('')

// ── Der Fundament-Check rechnet im Hintergrund (LL1 b, 2026-11-17) ─────────

/**
 * DER STAND DES JÜNGSTEN LAUFS kommt mit dem Verlauf (`documentRun`). Der
 * Start antwortet sofort (`202`); solange der Lauf läuft, fragt die Seite den
 * Verlauf alle paar Sekunden ab (`useRunPolling`, nur bei sichtbarem Reiter).
 * Wer die Seite neu lädt oder in einem zweiten Reiter öffnet, sieht denselben
 * Stand. Ein zweiter Start während eines Laufs ist kein Fehler, sondern ein
 * ruhiger Hinweis (`run_running`).
 */
const documentRun = computed<BrandRunView>(() => history.value?.documentRun ?? noBrandRunView())
const documentRunning = computed(() => running.value === 'document' || documentRun.value.state === 'running')
/** Der ruhige Hinweis „läuft schon" nach einem zweiten Start. */
const documentAlreadyRunning = ref(false)

/**
 * Was der jüngste Lauf hinterlassen hat — nur einen Tag lang (eine Übersicht
 * weist nicht wochenlang auf einen alten Fehlschlag hin). Der Grund ist
 * dasselbe Wort, das früher als Fehler-Code der Anfrage kam.
 */
const documentRunMessage = computed(() => {
  const view = documentRun.value
  if (!brandRunNoticeDue(view, Date.now())) return ''
  if (view.state === 'stalled') return t('brand.myScores.document.interrupted')
  if (view.failure === 'ai_endpoint_unavailable') return t('error.aiEndpointUnavailableHint')
  return t('brand.myScores.errors.unavailable')
})

/** EINE NACHFRAGE: der Verlauf samt Lauf-Stand, mit Frist (eine hängende Abfrage hält das Nachfragen sonst an). */
async function pollDocumentRun(): Promise<void> {
  if (!profileId.value) return
  history.value = await $fetch<BrandCheckHistoryResponse>(
    `/api/brand/profiles/${encodeURIComponent(profileId.value)}/checks`,
    { timeout: BRAND_RUN_POLL_TIMEOUT_MS },
  )
}

useRunPolling({
  active: () => documentRun.value.state === 'running',
  intervalMs: RUN_LEASE_POLL_MS,
  tick: pollDocumentRun,
})

// Der Lauf ist zu Ende ⇒ der ruhige Hinweis fällt. Die To-dos laden sich
// selbst nach: sie hängen an der Id des jüngsten Checks (`todoSourceId`).
watch(() => documentRun.value.state, (next, previous) => {
  if (previous === 'running' && next !== 'running') documentAlreadyRunning.value = false
})

async function reload(): Promise<void> {
  await refreshHistory()
  await refreshTodoCheck()
}

async function runWebsiteCheck(): Promise<void> {
  if (running.value || !websiteUrl.value) return
  running.value = 'website'
  errorKey.value = ''
  try {
    const started = await $fetch<BrandCheckStartResponse>('/api/brand/check', {
      method: 'POST',
      body: {
        url: websiteUrl.value,
        locale: locale.value === 'de' ? 'de' : 'en',
        // „Neu ermitteln" heisst: den Sieben-Tage-Zwischenspeicher umgehen.
        // Genau dafür gibt es den Konto-Deckel (10/Tag) — ohne `force` bekäme
        // der Knopf dasselbe Ergebnis zurück und täte sichtbar nichts.
        force: true,
        profileId: profileId.value,
      },
    })
    // DER CHECK RECHNET IM HINTERGRUND (LL1 b, 2026-11-18): der Start
    // antwortet `202` mit einem Kennzeichen, die Seite wartet auf das Ende
    // dieses einen Laufs. Läuft für diese Adresse schon einer (zweiter
    // Reiter, Klick nach einem Neuladen), führt dieselbe Antwort auf DIESEN
    // Lauf — es entsteht kein zweiter.
    if (started.token) {
      const end = await awaitBrandCheckRun(started.token)
      if (end.kind !== 'done') errorKey.value = websiteRunErrorKey(end)
    }
    await reload()
  }
  catch (error) {
    errorKey.value = messageKey(error)
  }
  finally {
    running.value = ''
  }
}

async function runDocumentCheck(): Promise<void> {
  if (running.value || documentRunning.value) return
  running.value = 'document'
  errorKey.value = ''
  documentAlreadyRunning.value = false
  try {
    const started = await $fetch<BrandCheckStartResponse>(
      `/api/brand/profiles/${encodeURIComponent(profileId.value)}/check`,
      {
        method: 'POST',
        // ERST beim ZWEITEN Mal erzwingen. Der erste Lauf findet ohnehin
        // nichts im Zwischenspeicher — mit `force` wäre nur der versehentliche
        // Doppelklick darauf ein zweiter bezahlter Aufruf. Ein „erneut prüfen"
        // dagegen MUSS erzwingen, sonst bekäme es sieben Tage lang dieselbe
        // Zahl zurück und der Knopf täte sichtbar nichts.
        body: { force: latestDocument.value !== null },
      },
    )
    // EIN LAUF IST ANGENOMMEN (`202`): sein Stand geht an den Verlauf, das
    // Nachfragen übernimmt ab hier. Ein Treffer im Zwischenspeicher (`200`)
    // hat nichts gestartet — dann genügt das Nachladen wie bisher.
    if (started.run && history.value) history.value = { ...history.value, documentRun: started.run }
    else await reload()
  }
  catch (error) {
    // „Läuft schon" ist KEIN Fehler: ein zweiter Reiter (oder ein Doppelklick)
    // hat den Lauf gestartet. Stand holen — dann zeigt auch dieser Reiter ihn.
    if ((error as FetchErrorLike | null)?.data?.reason === RUN_LEASE_BUSY_CODE) {
      documentAlreadyRunning.value = true
      await refreshHistory()
    }
    else {
      errorKey.value = messageKey(error)
    }
  }
  finally {
    running.value = ''
  }
}

// ── Website nachtragen ─────────────────────────────────────────────────────

const urlDraft = ref('')
const savingUrl = ref(false)

/** Fehlendes Schema ergänzen, vorhandenes stehen lassen — dieselbe Haltung
 *  wie im öffentlichen Formular (der Server prüft, wir helfen nur beim Tippen). */
function withScheme(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

const canSaveUrl = computed(() => {
  const candidate = withScheme(urlDraft.value)
  if (!candidate) return false
  try {
    return new URL(candidate).hostname.includes('.')
  }
  catch {
    return false
  }
})

async function saveWebsiteUrl(): Promise<void> {
  if (!canSaveUrl.value || savingUrl.value) return
  savingUrl.value = true
  errorKey.value = ''
  try {
    const response = await $fetch<BrandProfileDetailResponse>(
      `/api/brand/profiles/${encodeURIComponent(profileId.value)}`,
      { method: 'PATCH', body: { websiteUrl: withScheme(urlDraft.value) } },
    )
    detail.value = response
    urlDraft.value = ''
    toast.add({ title: t('brand.myScores.website.saved'), duration: 2000 })
    await reload()
  }
  catch (error) {
    errorKey.value = messageKey(error)
  }
  finally {
    savingUrl.value = false
  }
}

// ── Der Verlauf als Tabelle ────────────────────────────────────────────────

const historyColumns = computed<TableColumn<BrandCheckHistoryItem>[]>(() => [
  { accessorKey: 'createdAt', header: () => t('brand.myScores.history.date') },
  { accessorKey: 'source', header: () => t('brand.myScores.history.source') },
  { accessorKey: 'score', header: () => t('brand.myScores.history.score') },
  { id: 'actions', header: srOnlyHeader(() => t('ui.table.actions')) },
])

useBrandTitle(() => t('brand.myScores.title'))
</script>

<template>
  <div class="bw-root pb-10">
    <div class="mx-auto w-full max-w-7xl">
      <div class="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div class="min-w-0">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">{{ t('brand.myScores.title') }}</p>
          <h1 class="mt-2 text-2xl font-semibold">{{ brandTitle || t('brand.brands.card.untitled') }}</h1>
          <p class="mt-1 text-sm" style="color: var(--bw-muted)">{{ t('brand.myScores.subtitle') }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <!-- Der Rückweg in die LISTE (P6c): wer hier gelandet ist, kam
               entweder von einer Karte oder aus der Tabelle — beide Wege
               stehen offen, damit keiner in einer Sackgasse endet. -->
          <UButton
            :to="localePath('/dashboard/brand-scores')" icon="i-ph-gauge" variant="ghost" color="neutral"
            :label="t('brand.myScores.list.all')"
          />
          <UButton
            :to="localePath('/dashboard/brands')" icon="i-ph-arrow-left" variant="ghost" color="neutral"
            :label="t('brand.myScores.back')"
          />
        </div>
      </div>

      <div v-if="detailStatus === 'pending'" class="bw-card p-10 text-center" data-score-loading>
        <UIcon name="i-ph-circle-notch" class="mx-auto size-6 animate-spin" style="color: var(--bw-muted)" />
        <p class="mt-4 text-sm" style="color: var(--bw-ink-soft)">{{ t('brand.myScores.loading') }}</p>
      </div>

      <div v-else-if="detailFailed" class="bw-card p-10" data-score-load-error>
        <CoreLoadError :retry="refreshDetail" />
      </div>

      <div v-else-if="!detail" class="bw-card p-10 text-center" data-score-missing>
        <p class="font-medium">{{ t('brand.myScores.missingTitle') }}</p>
        <p class="mx-auto mt-2 max-w-md text-sm leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.myScores.missingText') }}</p>
        <UButton
          class="mt-6" :to="localePath('/dashboard/brands')" variant="outline" color="neutral"
          :label="t('brand.myScores.back')"
        />
      </div>

      <template v-else>
        <p
          v-if="errorKey" class="mb-6 text-sm leading-relaxed"
          style="color: var(--bw-stale)" data-score-error
        >
          {{ t(`brand.myScores.errors.${errorKey}`) }}
        </p>

        <!-- Der Verlauf ist ausgefallen (LZ1): sonst stünde unten „noch kein
             Check", obwohl es vielleicht welche gibt. -->
        <CoreInlineLoadError v-if="historyFailed" class="mb-6" :retry="refreshHistory" data-score-history-error />

        <!-- 1 · Die zwei Zahlen -->
        <div class="grid gap-6 lg:grid-cols-2">
          <section class="bw-card p-8" data-score-website>
            <h2 class="text-xl font-semibold tracking-tight">{{ t('brand.myScores.website.title') }}</h2>
            <p class="bw-label mt-2 leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.myScores.website.lead') }}</p>

            <div v-if="latestWebsite" class="mt-6 flex flex-wrap items-center gap-6">
              <BwScoreRing :value="latestWebsite.score" :size="96" />
              <div class="min-w-0">
                <p class="text-2xl font-extralight tracking-tight">{{ t(`brand.check.bands.${latestWebsite.band}`) }}</p>
                <p class="bw-label mt-2" style="color: var(--bw-muted)">{{ t('brand.myScores.website.stand', { date: formatDate(latestWebsite.createdAt) }) }}</p>
                <UButton
                  class="mt-3" size="sm" variant="ghost" color="neutral" trailing-icon="i-ph-arrow-right"
                  :to="resultPath(latestWebsite.id)" :label="t('brand.myScores.website.open')"
                />
              </div>
            </div>
            <p v-else-if="websiteUrl" class="mt-6 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.myScores.website.none') }}</p>

            <!-- Ohne hinterlegte Adresse: der fehlende Weg, ein Feld breit. -->
            <div v-if="!websiteUrl" class="mt-6" data-score-website-url>
              <p class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.myScores.website.noUrl') }}</p>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <UInput
                  v-model="urlDraft" type="text" name="website" autocomplete="url" inputmode="url"
                  :placeholder="t('brand.myScores.website.urlPlaceholder')"
                  :aria-label="t('brand.myScores.website.urlLabel')"
                  :disabled="savingUrl" class="min-w-56 flex-1"
                />
                <UButton
                  :disabled="!canSaveUrl" :loading="savingUrl" color="neutral" class="rounded-full"
                  :label="t('brand.myScores.website.addUrl')" data-score-save-url
                  @click="saveWebsiteUrl"
                />
              </div>
            </div>
            <div v-else class="mt-6">
              <UButton
                :loading="running === 'website'" :disabled="running !== ''" color="neutral" class="rounded-full"
                :label="latestWebsite ? t('brand.myScores.website.recheck') : t('brand.myScores.website.start')"
                data-score-recheck
                @click="runWebsiteCheck"
              />
              <p v-if="running === 'website'" class="bw-label mt-3" style="color: var(--bw-muted)">{{ t('brand.myScores.website.running') }}</p>
            </div>
          </section>

          <section class="bw-card p-8" data-score-document>
            <h2 class="text-xl font-semibold tracking-tight">{{ t('brand.myScores.document.title') }}</h2>
            <p class="bw-label mt-2 leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.myScores.document.lead') }}</p>

            <div v-if="latestDocument" class="mt-6 flex flex-wrap items-center gap-6">
              <BwScoreRing :value="latestDocument.score" :size="96" />
              <div class="min-w-0">
                <p class="text-2xl font-extralight tracking-tight">{{ t(`brand.check.bands.${latestDocument.band}`) }}</p>
                <p class="bw-label mt-2" style="color: var(--bw-muted)">{{ t('brand.myScores.document.stand', { date: formatDate(latestDocument.createdAt) }) }}</p>
                <UButton
                  class="mt-3" size="sm" variant="ghost" color="neutral" trailing-icon="i-ph-arrow-right"
                  :to="resultPath(latestDocument.id)" :label="t('brand.myScores.document.open')"
                />
              </div>
            </div>
            <p v-else class="mt-6 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.myScores.document.none') }}</p>

            <div class="mt-6">
              <UButton
                :loading="documentRunning" :disabled="running !== '' || documentRunning" color="neutral" class="rounded-full"
                :label="latestDocument ? t('brand.myScores.document.recheck') : t('brand.myScores.document.start')"
                data-score-document-run
                @click="runDocumentCheck"
              />
              <template v-if="documentRunning">
                <p class="bw-label mt-3" style="color: var(--bw-muted)" data-score-document-running>
                  {{ documentAlreadyRunning ? t('brand.myScores.document.alreadyRunning') : t('brand.myScores.document.running') }}
                </p>
                <p class="bw-label mt-1" style="color: var(--bw-muted)">{{ t('brand.myScores.document.background') }}</p>
              </template>
              <p
                v-else-if="documentRunMessage" class="mt-3 text-sm leading-relaxed" style="color: var(--bw-stale)"
                data-score-document-outcome
              >
                {{ documentRunMessage }}
              </p>
            </div>
          </section>
        </div>

        <!-- 2 · Gegenüberstellung — nur mit Vorgänger derselben Quelle -->
        <section v-if="diff" class="bw-card mt-6 p-8" data-score-diff>
          <h2 class="text-xl font-semibold tracking-tight">{{ t('brand.myScores.diff.title') }}</h2>
          <p class="bw-label mt-2 leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.myScores.diff.lead') }}</p>
          <p class="bw-label mt-1" style="color: var(--bw-muted)">
            {{ sourceLabel(diff.source) }} · {{ t('brand.myScores.diff.dates', { previous: formatDate(diff.previousAt), latest: formatDate(diff.latestAt) }) }}
          </p>

          <!-- KEINE UTable (B6): eine Gegenüberstellung zweier Messungen mit
               festen Kategorien in der Marken-Karte (bw-Optik), kein
               Datenbestand — nichts zu sortieren, auszuwählen oder zu blättern.
               Die Liste der Messungen weiter unten ist einer und nutzt UTable. -->
          <div class="mt-6 overflow-x-auto">
            <table class="w-full min-w-md text-sm">
              <thead>
                <tr class="bw-label uppercase tracking-wider" style="color: var(--bw-muted)">
                  <th class="py-2 text-left font-normal">{{ t('brand.myScores.diff.category') }}</th>
                  <th class="py-2 text-right font-normal">{{ t('brand.myScores.diff.previous') }}</th>
                  <th class="py-2 text-right font-normal">{{ t('brand.myScores.diff.latest') }}</th>
                  <th class="py-2 text-right font-normal">{{ t('brand.myScores.diff.change') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in diff.categories" :key="row.id" style="border-top: 1px solid var(--bw-line)">
                  <td class="py-2.5 pr-3">{{ categoryLabel(row.id) }}</td>
                  <td class="py-2.5 text-right tabular-nums" style="color: var(--bw-muted)">
                    {{ row.previous === null ? t('brand.myScores.diff.notAssessable') : row.previous }}
                  </td>
                  <td class="py-2.5 text-right tabular-nums">
                    {{ row.latest === null ? t('brand.myScores.diff.notAssessable') : row.latest }}
                  </td>
                  <td class="py-2.5 text-right tabular-nums" :style="`color: ${trendColor(row.trend)}`">
                    <span class="inline-flex items-center justify-end gap-1">
                      <UIcon :name="trendIcon(row.trend)" class="size-3.5 flex-none" />
                      {{ row.delta === null ? (row.trend === 'new' ? t('brand.myScores.diff.isNew') : '—') : signed(row.delta) }}
                    </span>
                  </td>
                </tr>
                <tr style="border-top: 1px solid var(--bw-line-strong)">
                  <td class="py-2.5 pr-3 font-medium">{{ t('brand.myScores.diff.total') }}</td>
                  <td class="py-2.5 text-right tabular-nums" style="color: var(--bw-muted)">{{ diff.previousScore }}</td>
                  <td class="py-2.5 text-right font-medium tabular-nums">{{ diff.latestScore }}</td>
                  <td
                    class="py-2.5 text-right font-medium tabular-nums"
                    :style="`color: ${trendColor(diff.delta > 0 ? 'up' : diff.delta < 0 ? 'down' : 'same')}`"
                  >
                    {{ signed(diff.delta) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- 3 · Was der Experte jetzt angehen würde -->
        <section v-if="todoCheck" class="bw-card mt-6 p-8" data-score-todos>
          <h2 class="text-xl font-semibold tracking-tight">{{ t('brand.myScores.todos.title') }}</h2>
          <p class="bw-label mt-2 leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.myScores.todos.lead') }}</p>

          <p v-if="!todos.length" class="mt-6 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.myScores.todos.empty') }}</p>

          <ol v-else class="mt-6 space-y-4">
            <li v-for="(todo, index) in todos" :key="todo.criterionId" class="bw-frame p-5" style="background: var(--bw-surface-hi)">
              <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p class="font-medium tracking-tight">{{ index + 1 }}. {{ criterionTitle(todo.criterionId) }}</p>
                <p class="bw-label" style="color: var(--bw-muted)">
                  {{ categoryLabel(todo.category) }} · {{ t('brand.myScores.todos.points', { score: todo.score }) }}
                </p>
              </div>
              <blockquote
                v-if="todo.evidence" class="mt-3 border-l-2 pl-3 text-sm leading-relaxed"
                style="border-color: var(--bw-line-strong); color: var(--bw-ink-soft)"
              >
                {{ todo.evidence }}
              </blockquote>
              <p v-if="todo.note" class="bw-label mt-2 leading-relaxed" style="color: var(--bw-muted)">{{ todo.note }}</p>
              <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ criterionNext(todo.criterionId) }}</p>
              <div v-if="todo.wizardStep" class="mt-3">
                <UButton
                  size="xs" variant="ghost" color="neutral" trailing-icon="i-ph-arrow-right"
                  :to="localePath(`/brand/${profileId}/${todo.wizardStep}`)"
                  :label="t('brand.myScores.todos.chapter', { chapter: chapterLabel(todo.wizardStep) })"
                />
              </div>
            </li>
          </ol>
        </section>

        <!-- Die To-dos sind ausgefallen (LZ1): sagen statt still weglassen. -->
        <section v-else-if="todoFailed" class="bw-card mt-6 p-8" data-score-todos-error>
          <h2 class="text-xl font-semibold tracking-tight">{{ t('brand.myScores.todos.title') }}</h2>
          <CoreInlineLoadError class="mt-4" :retry="refreshTodoCheck" />
        </section>

        <!-- 4 · Verlauf -->
        <section class="bw-card mt-6 p-8" data-score-history>
          <h2 class="text-xl font-semibold tracking-tight">{{ t('brand.myScores.history.title') }}</h2>
          <p class="bw-label mt-2 leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.myScores.history.lead') }}</p>

          <!-- Ausfall: die Zeile steht oben (data-score-history-error), hier keine Leermeldung. -->
          <p v-if="!items.length && !historyFailed" class="mt-6 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t('brand.myScores.history.empty') }}</p>

          <UTable v-else-if="items.length" :data="items" :columns="historyColumns" class="mt-4">
            <template #createdAt-cell="{ row }">
              <span class="whitespace-nowrap">{{ formatDate(row.original.createdAt) }}</span>
            </template>
            <template #source-cell="{ row }">
              <span style="color: var(--bw-muted)">{{ sourceLabel(row.original.source) }}</span>
            </template>
            <template #score-cell="{ row }">
              <span class="tabular-nums">{{ row.original.score }}</span>
            </template>
            <template #actions-cell="{ row }">
              <UButton
                size="xs" variant="ghost" color="neutral" trailing-icon="i-ph-arrow-right"
                :to="resultPath(row.original.id)" :label="t('brand.myScores.history.open')"
              />
            </template>
          </UTable>
        </section>
      </template>
    </div>
  </div>
</template>
