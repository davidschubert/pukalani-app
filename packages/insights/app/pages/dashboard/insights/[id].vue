<script setup lang="ts">
import type { InsightsPost, InsightsPostEdit, InsightsReviewIssue, InsightsState } from '../../../../shared/insightsPost'
import { insightsIsPublic, insightsPostDeletable } from '../../../../shared/insightsPost'
import { insightsNewsletterEnabled } from '../../../../shared/insightsPublic'
import type {
  InsightsBrandCreatedResponse,
  InsightsBrandListItem,
  InsightsDraftResponse,
  InsightsEvidenceResponse,
  InsightsNewsletterSendBatchResponse,
  InsightsNewsletterSendStatusResponse,
  InsightsPostDeletedResponse,
  InsightsPostDetailResponse,
  InsightsPostSavedResponse,
  InsightsPostStateResponse,
  InsightsTranslateResponse,
} from '../../../../shared/types/insightsApi'

/**
 * DER BEITRAGS-EDITOR ALS VOLLSEITE (§9.4, Adresse `/dashboard/insights/<id>`).
 *
 * ── DIE SEITE HÄLT DEN ZUSTAND, DIE KOMPONENTE DIE FORM ──────────────────
 * `InEditor` spricht mit keiner Route (Begründung in ihrem Kopf); hier liegen
 * alle Abrufe, alle Ladezustände und alle Fehlercodes. Das ist die Naht, an
 * der der freigegebene Prototyp und die Umsetzung dieselbe Komponente teilen.
 *
 * ── JEDER FEHLER WIRD BEIM NAMEN GENANNT ─────────────────────────────────
 * Die Routen schicken fachliche Gründe als `data.code`; der zentrale Handler
 * hebt genau diesen Schlüssel als `reason` ins Envelope (`{ok,code,message,
 * reason}`), und hier steht der einzige Leser dafür. Ein unbekannter Grund
 * fällt auf einen allgemeinen Satz zurück — sichtbar, nicht still.
 *
 * ── DER GESPERRTE ÜBERGANG IST KEINE 409 ─────────────────────────────────
 * Das Zustands-Gate antwortet 200 mit `changed: false` und der Liste der
 * offenen Stellen. Warum: die Liste käme in einem Fehler-Körper nie an (der
 * Handler lässt nur den kurzen Schlüssel durch) — die Begründung steht am Typ
 * `InsightsPostStateResponse`.
 */
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'admin'],
  requiredCapability: 'insights.manage',
  // Betreiber-Sache, wie die Liste daneben: auf einem Mandanten-Host gäbe es
  // diese Seite nicht. `branding` ist ein Silo — die Angabe ist die Aussage.
  dashboardScope: 'operator',
})

const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const localePath = useLocalePath()

const id = computed(() => String(route.params.id ?? ''))

const { data, refresh, status } = await useFetch<InsightsPostDetailResponse>(
  () => `/api/insights/posts/${id.value}`,
  { lazy: true, server: false },
)

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

/**
 * DER STAND, DEN DER EDITOR SIEHT. Er kommt aus der Abfrage, wird aber von
 * jeder Antwort (Speichern, Übersetzen, Entwerfen, Zustand) ÜBERSCHRIEBEN —
 * ein `refresh()` nach jedem Schreiben wäre eine zweite Rundreise für Daten,
 * die die Antwort schon trug.
 */
const post = ref<InsightsPost | null>(null)
const issues = ref<InsightsReviewIssue[]>([])
const brands = ref<InsightsBrandListItem[]>([])
const knownBrandIds = ref<string[]>([])

watch(data, (next) => {
  if (!next) return
  post.value = next.post
  issues.value = next.issues
  brands.value = next.brands
  knownBrandIds.value = next.knownBrandIds
}, { immediate: true })

useBrandTitle(() => {
  const current = post.value
  if (!current) return t('insights.editor.title')
  return current.baseLocale === 'de' ? (current.titleDe || t('insights.editor.untitled')) : (current.titleEn || t('insights.editor.untitled'))
})

const saving = ref(false)
const translating = ref(false)
const drafting = ref(false)
const transitioning = ref(false)
const checkingIndex = ref<number | null>(null)
const evidence = ref<Record<number, InsightsEvidenceResponse>>({})

/**
 * DER GRUND EINER ABLEHNUNG — aus `error.data.reason`, nicht aus der Meldung.
 *
 * Die Meldung ist bei 5xx generisch und bei 4xx englisch; der GRUND ist der
 * geprüfte Schlüssel, den unsere Route selbst gesetzt hat. Ohne diesen Leser
 * hiesse jedes Nein „es ging etwas schief".
 */
const REASON_KEY: Record<string, string> = {
  ai_disabled: 'insights.editor.error.aiDisabled',
  not_deletable: 'insights.editor.error.notDeletable',
  already_sent: 'insights.editor.error.alreadySent',
  not_public: 'insights.editor.error.notPublic',
  no_public_address: 'insights.editor.error.noPublicAddress',
  ai_hourly_limit: 'insights.editor.error.aiHourlyLimit',
  ai_daily_limit: 'insights.editor.error.aiDailyLimit',
  not_draft: 'insights.editor.error.notDraft',
  translation_empty: 'insights.editor.error.translationEmpty',
  slug_taken: 'insights.editor.error.slugTaken',
  transition_not_allowed: 'insights.editor.error.transitionNotAllowed',
  post_not_found: 'insights.editor.error.postNotFound',
  source_not_found: 'insights.editor.error.sourceNotFound',
  storage_unavailable: 'insights.editor.error.storageUnavailable',
}

function reasonOf(error: unknown): string {
  const data = (error as { data?: { reason?: unknown } } | undefined)?.data
  return typeof data?.reason === 'string' ? data.reason : ''
}

/**
 * Ein 400 des Schemas trägt keinen `reason` (Zod, nicht Fachlichkeit) — im
 * Klick-Beweis I2 stand dann nur „Das hat nicht geklappt" neben einer Quelle
 * ohne Herausgeber. Der Hinweis zeigt auf die Prüfregeln: sie rechnen dieselben
 * Formregeln lokal am Entwurf und nennen die Stelle.
 */
function isValidationError(error: unknown): boolean {
  const data = (error as { data?: { code?: unknown } } | undefined)?.data
  return data?.code === 'VALIDATION_ERROR'
}

function fail(error: unknown): void {
  const key = REASON_KEY[reasonOf(error)]
  const title = key
    ? t(key)
    : (isValidationError(error) ? t('insights.editor.error.validation') : t('insights.editor.error.generic'))
  toast.add({ title, color: 'error' })
}

// ── Speichern ──────────────────────────────────────────────────────────────

async function save(payload: InsightsPostEdit): Promise<void> {
  saving.value = true
  try {
    const saved = await $fetch<InsightsPostSavedResponse>(`/api/insights/posts/${id.value}`, {
      method: 'PATCH',
      body: payload,
    })
    post.value = saved.post
    issues.value = saved.issues
    toast.add({ title: t('insights.editor.saved'), color: 'success' })
  }
  catch (error) {
    fail(error)
  }
  finally {
    saving.value = false
  }
}

// ── Zustandswechsel ────────────────────────────────────────────────────────

async function changeState(to: InsightsState): Promise<void> {
  transitioning.value = true
  try {
    const result = await $fetch<InsightsPostStateResponse>(`/api/insights/posts/${id.value}/state`, {
      method: 'POST',
      body: { to },
    })
    post.value = result.post
    issues.value = result.issues
    toast.add({
      title: result.changed ? t('insights.editor.stateChanged') : t('insights.editor.stateBlocked', { count: result.issues.length }),
      color: result.changed ? 'success' : 'warning',
    })
  }
  catch (error) {
    fail(error)
  }
  finally {
    transitioning.value = false
  }
}

// ── Beleg-Ampel ────────────────────────────────────────────────────────────

async function checkEvidence(index: number): Promise<void> {
  checkingIndex.value = index
  try {
    const result = await $fetch<InsightsEvidenceResponse>(`/api/insights/posts/${id.value}/evidence`, {
      method: 'POST',
      body: { sourceIndex: index },
    })
    evidence.value = { ...evidence.value, [index]: result }
  }
  catch (error) {
    fail(error)
  }
  finally {
    checkingIndex.value = null
  }
}

// ── Übersetzen ─────────────────────────────────────────────────────────────

async function translate(): Promise<void> {
  translating.value = true
  try {
    const result = await $fetch<InsightsTranslateResponse>(`/api/insights/posts/${id.value}/translate`, {
      method: 'POST',
    })
    post.value = result.post
    toast.add({ title: t('insights.editor.translateDone'), color: 'success' })
  }
  catch (error) {
    fail(error)
  }
  finally {
    translating.value = false
  }
}

// ── KI-Entwurf ─────────────────────────────────────────────────────────────

async function runDraft(input: { brief: string, targetWords: number }): Promise<void> {
  drafting.value = true
  try {
    const result = await $fetch<InsightsDraftResponse>(`/api/insights/posts/${id.value}/draft`, {
      method: 'POST',
      body: input,
    })
    post.value = result.post
    toast.add({ title: t('insights.editor.draftDone'), color: 'success' })
  }
  catch (error) {
    fail(error)
  }
  finally {
    drafting.value = false
  }
}

// ── Löschen ────────────────────────────────────────────────────────────────

/**
 * DER LÖSCHEN-KNOPF — aktiv nur, solange `insightsPostDeletable` Ja sagt.
 *
 * Dieselbe Regel wie in der Route (409 `not_deletable`) und in der Liste. Der
 * Knopf VERSCHWINDET hier nicht, sondern wird ausgegraut: im Editor steht man
 * vor genau diesem einen Beitrag, und ein Knopf, der fehlt, sagt nichts —
 * einer, der ausgegraut ist und „erst zurückziehen" dazuschreibt, sagt den
 * nächsten Handgriff.
 */
const deleteOpen = ref(false)
const deleting = ref(false)

const deletable = computed(() => (post.value ? insightsPostDeletable(post.value.state) : false))

const postTitle = computed(() => {
  const current = post.value
  if (!current) return ''
  return (current.baseLocale === 'de' ? current.titleDe : current.titleEn) || t('insights.editor.untitled')
})

async function confirmDelete(): Promise<void> {
  deleting.value = true
  try {
    await $fetch<InsightsPostDeletedResponse>(`/api/insights/posts/${id.value}`, { method: 'DELETE' })
    deleteOpen.value = false
    toast.add({ title: t('insights.editor.deleted'), color: 'success' })
    await navigateTo(localePath('/dashboard/insights'))
  }
  catch (error) {
    fail(error)
    // Der Zustand kann sich in einem zweiten Reiter geändert haben — die
    // Wahrheit steht in der Ablage, nicht in diesem Tab.
    await refresh()
  }
  finally {
    deleting.value = false
  }
}

// ── Newsletter: an die Liste schicken (I5b) ────────────────────────────────

/**
 * DER RIEGEL WIRD HIER GELESEN, NICHT IN DER KOMPONENTE.
 *
 * `pukalani.insights.newsletter.enabled` (Layer-Default `false`) — zu heisst:
 * es wird NICHT GEFRAGT und das Panel erscheint nicht. Dieselbe pure Regel wie
 * im Anmelde-Formular (`insightsNewsletterEnabled`, fail-closed: nur echtes
 * `true`). Die zwei Routen prüfen ihn unabhängig davon und antworten 404 —
 * eine Sperre nur in der Oberfläche ist keine.
 */
const appConfig = useAppConfig() as { pukalani?: { insights?: { newsletter?: { enabled?: unknown } } } }
const newsletterOpen = computed(() => insightsNewsletterEnabled(appConfig.pukalani?.insights?.newsletter?.enabled))

const newsletter = ref<InsightsNewsletterSendStatusResponse | null>(null)
const newsletterSending = ref(false)
const newsletterProgress = ref<{ sent: number, total: number } | null>(null)

/**
 * Der Stand wird geholt, sobald ein FREIGEGEBENER Beitrag vor uns steht —
 * nicht beim Laden der Seite. Zwei Gründe: an einem Entwurf gibt es nichts zu
 * zeigen (das Panel bleibt weg), und die Zählung der Empfänger blättert durch
 * die Liste. Eine Abfrage, die niemand sieht, zahlt trotzdem.
 *
 * Fehler sind hier STILL: ein nicht ladbarer Newsletter-Stand darf keinen Toast
 * über einem Beitrag auslösen, an dem gerade geschrieben wird. Ohne Stand gibt
 * es kein Panel, und das ist die ehrliche Anzeige von „weiss ich nicht".
 */
async function loadNewsletter(): Promise<void> {
  const current = post.value
  if (!newsletterOpen.value || !current || !insightsIsPublic(current)) {
    newsletter.value = null
    return
  }
  try {
    newsletter.value = await $fetch<InsightsNewsletterSendStatusResponse>(`/api/insights/posts/${id.value}/newsletter`)
  }
  catch {
    newsletter.value = null
  }
}

watch(post, () => { void loadNewsletter() }, { immediate: true })

/**
 * EIN DECKEL AUF DIE SCHLEIFE — 400 Stapel à 50, also 20.000 Mails.
 *
 * Nicht eine Erwartung, sondern die Sicherung gegen eine Route, die aus
 * irgendeinem Grund nie `done` meldet: eine `while (true)`-Schleife im Browser,
 * die POSTs schickt, ist das Gegenteil von dem, was dieses Panel schützen soll.
 */
const SEND_ROUNDS_MAX = 400

/**
 * DIE SEITE RUFT, BIS `done` — und das ist der Entwurf, nicht ein Notbehelf.
 *
 * Die Route arbeitet EINEN Stapel ab (höchstens 50 Mails) und antwortet. So
 * steht keine Route minutenlang offen, und der Mensch sieht einen Balken statt
 * eines hängenden Knopfes. Drei Abbruch-Gründe, und alle drei hören SOFORT auf
 * zu rufen:
 *  · `done` — die Liste ist durch.
 *  · `aborted` — es gibt keinen Mail-Weg. Jeder weitere Aufruf scheiterte
 *    gleich; der Fortschritt steht in der Ablage, der Knopf setzt später fort.
 *  · ein Fehler — der Grund steht im Toast, der Stand wird neu geholt.
 */
async function sendNewsletter(input: { introDe: string, introEn: string }): Promise<void> {
  newsletterSending.value = true
  newsletterProgress.value = { sent: newsletter.value?.send?.sent ?? 0, total: newsletter.value?.recipients ?? 0 }
  try {
    for (let round = 0; round < SEND_ROUNDS_MAX; round++) {
      const result = await $fetch<InsightsNewsletterSendBatchResponse>(
        `/api/insights/posts/${id.value}/newsletter`,
        { method: 'POST', body: { introDe: input.introDe, introEn: input.introEn } },
      )
      newsletterProgress.value = {
        sent: result.send.sent,
        total: Math.max(result.send.recipients, result.send.sent + result.send.failed + result.remaining),
      }
      if (result.aborted) {
        toast.add({ title: t('insights.newsletter.send.stoppedTitle'), description: t('insights.newsletter.send.stoppedText'), color: 'warning' })
        break
      }
      if (result.done) {
        toast.add({ title: t('insights.newsletter.send.doneTitle'), color: 'success' })
        break
      }
    }
  }
  catch (error) {
    fail(error)
  }
  finally {
    newsletterSending.value = false
    newsletterProgress.value = null
    await loadNewsletter()
  }
}

// ── Marke anlegen ──────────────────────────────────────────────────────────

async function createBrand(input: { name: string, homepage: string, industry: string }): Promise<void> {
  try {
    const created = await $fetch<InsightsBrandCreatedResponse>('/api/insights/brands', {
      method: 'POST',
      body: input,
    })
    brands.value = [...brands.value, created.brand]
    knownBrandIds.value = [...knownBrandIds.value, created.id]
    toast.add({ title: t('insights.editor.brandCreated'), color: 'success' })
  }
  catch (error) {
    fail(error)
  }
}
</script>

<template>
  <UDashboardPanel id="insights-editor">
    <template #header>
      <UDashboardNavbar :title="t('insights.editor.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            :label="t('insights.editor.backToList')" icon="i-ph-arrow-left"
            color="neutral" variant="ghost"
            :to="localePath('/dashboard/insights')"
          />
          <UButton
            icon="i-ph-arrows-clockwise" color="neutral" variant="ghost"
            :loading="pending"
            :aria-label="t('insights.editor.reload')"
            @click="refresh()"
          />
          <UButton
            :label="t('insights.editor.delete')" icon="i-ph-trash"
            color="error" variant="ghost"
            :disabled="!deletable"
            :title="deletable ? undefined : t('insights.editor.deleteBlocked')"
            data-insights-delete
            @click="deleteOpen = true"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- `bw-root` trägt den Token-Satz des brand-Layers; ohne ihn stünden die
           `var(--bw-*)`-Farben der Komponente auf Vorgabewerten. -->
      <div class="bw-root">
        <InEditor
          v-if="post"
          :post="post"
          :brands="brands"
          :known-brand-ids="knownBrandIds"
          :issues="issues"
          :evidence="evidence"
          :saving="saving"
          :translating="translating"
          :drafting="drafting"
          :transitioning="transitioning"
          :checking-index="checkingIndex"
          :newsletter="newsletter"
          :newsletter-sending="newsletterSending"
          :newsletter-progress="newsletterProgress"
          @save="save"
          @send-newsletter="sendNewsletter"
          @change-state="changeState"
          @check-evidence="checkEvidence"
          @translate="translate"
          @draft="runDraft"
          @create-brand="createBrand"
        />
        <CoreEmptyState
          v-else-if="hydrated && !pending"
          icon="i-ph-newspaper"
          :title="t('insights.editor.error.postNotFound')"
          :description="t('insights.editor.emptyDescription')"
          :action-label="t('insights.editor.backToList')"
          :action-to="localePath('/dashboard/insights')"
        />
      </div>

      <!-- Löschen: der Titel steht im Text — eine Bestätigung ohne den Namen
           der Sache ist keine. -->
      <UModal v-model:open="deleteOpen" :title="t('insights.editor.deleteTitle')">
        <template #body>
          <p class="text-sm leading-relaxed">{{ t('insights.editor.deleteText', { title: postTitle }) }}</p>
          <p class="mt-2 text-sm text-muted">{{ t('insights.editor.deleteHint') }}</p>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('ui.cancel')" @click="deleteOpen = false" />
            <UButton
              color="error"
              :loading="deleting"
              :label="t('insights.editor.delete')"
              data-insights-delete-confirm
              @click="confirmDelete()"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
