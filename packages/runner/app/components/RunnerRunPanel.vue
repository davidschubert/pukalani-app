<script setup lang="ts">
import { isActiveRunStatus } from '../../shared/runGuards'
import { RUNS_TABLE, RUN_EVENTS_TABLE, type RunAttachmentAddedResponse, type RunAttachmentSource, type RunEventRow, type RunEventsListResponse, type RunRow, type RunStartOptions, type RunsListResponse } from '../../shared/types/runner'

/**
 * DER LAUF-BEREICH — das generische Herzstück des AI-Runners
 * (docs/plans/AI-RUNNER.md § 9).
 *
 * ER KENNT KEIN TICKET (A14). Was ausgeführt wird, kommt vollständig über
 * Props: ein SUBJEKT (`subjectType`/`subjectId` — heute `'ticket'`, später ein
 * Roadmap-Eintrag oder ein GitHub-Issue), der fertige AUFTRAGSTEXT und zur
 * ANZEIGE die Antwort auf die eine Sicherheitsfrage (§ 8.2: gilt der Text als
 * geprüft?). Entschieden wird sie vom Server aus der Herkunft des Subjekts
 * (SEC-038) — sie reist deshalb nicht im Body. Wer den Bereich einbindet, baut den Text — dieser Layer
 * baut ihn nie selbst, sonst müsste er das Board kennen.
 *
 * DREI ZUSTÄNDE, und der Lauf entscheidet, welcher gilt:
 *
 *  1. FORMULAR   — es gibt keinen laufenden Auftrag (oder man will einen neuen)
 *  2. LAUF AKTIV — draft/queued/claimed/running: Zeitleiste + Abbrechen
 *  3. BERICHT    — ein Endzustand: Branch, Commit, Diffstat, Tests, Kosten
 *
 * ANLEGEN IST ZWEISTUFIG (Paket 3): `runs` legt einen `draft` an, die Anhänge
 * gehen dazu, `runs/:id/queue` gibt frei. Ein `queued`-Lauf ist binnen Sekunden
 * geclaimt — ohne diese Reihenfolge liefe der Auftrag mit halben Anhängen los,
 * ohne dass irgendwo ein Fehler stünde.
 */
const props = defineProps<{
  subjectType: string
  subjectId: string
  /** Der fertige Auftrag, wie er abgeschickt wird — gebaut vom Einbindenden */
  promptSource: string
  /**
   * NUR ANZEIGE: false = der Text gilt nicht als vom Betreiber geschrieben
   * (§ 8.2) — das Formular bietet dann weniger an. Die Entscheidung trifft der
   * Server selbst (SEC-038); dieser Wert wird nicht mitgeschickt.
   */
  promptTrusted: boolean
  /** LAZY: `blob()` läuft erst beim Start, nicht beim Anzeigen */
  attachments?: RunAttachmentSource[]
}>()

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const config = useRuntimeConfig()
const { formatRelativeTime } = useFormatRelativeTime()

const runs = ref<RunRow[]>([])
const events = ref<RunEventRow[]>([])
const loadFailed = ref(false)
const busy = ref(false)
/** Vom Benutzer erzwungenes Formular („Neuen Lauf starten") */
const forceForm = ref(false)
/** Ein bewusst ausgewählter (älterer) Lauf; '' = die Automatik entscheidet */
const selectedId = ref('')

const activeRun = computed(() => runs.value.find(run => isActiveRunStatus(run.status)) ?? null)
const current = computed<RunRow | null>(() =>
  runs.value.find(run => run.$id === selectedId.value) ?? activeRun.value ?? runs.value[0] ?? null)
const currentId = computed(() => current.value?.$id ?? '')

const view = computed<'form' | 'live' | 'report'>(() => {
  if (!current.value) return 'form'
  if (forceForm.value && !activeRun.value) return 'form'
  return isActiveRunStatus(current.value.status) ? 'live' : 'report'
})

const history = computed(() => runs.value.filter(run => run.$id !== currentId.value))
const attachmentCount = computed(() => props.attachments?.length ?? 0)

function sortRuns(list: RunRow[]): RunRow[] {
  return [...list].sort((a, b) => b.$createdAt.localeCompare(a.$createdAt))
}

async function loadRuns() {
  // SSR hat hier nichts zu holen: der Bereich hängt in einem Modal, das erst
  // auf Klick geöffnet wird.
  if (import.meta.server || !props.subjectId) return
  try {
    const response = await $fetch<RunsListResponse>('/api/runner/runs', {
      query: { subjectType: props.subjectType, subjectId: props.subjectId },
    })
    runs.value = sortRuns(response.runs)
    loadFailed.value = false
  }
  catch {
    // NIE als „noch kein Lauf" maskieren: ein 401 sieht sonst aus wie ein
    // leerer Bereich, und der nächste Klick legt einen zweiten Lauf an.
    loadFailed.value = true
  }
}

watch(() => [props.subjectType, props.subjectId], () => {
  selectedId.value = ''
  forceForm.value = false
  events.value = []
  void loadRuns()
}, { immediate: true })

// Die Zeitleiste EINMAL holen, danach hält Realtime sie aktuell — wer ein
// Fenster mitten im Lauf öffnet, hätte sonst nur die Zeilen ab dem Öffnen.
watch(currentId, async (id) => {
  events.value = []
  if (!id || import.meta.server) return
  try {
    const response = await $fetch<RunEventsListResponse>(`/api/runner/runs/${id}/events`)
    events.value = response.events
  }
  catch {
    events.value = []
  }
}, { immediate: true })

function upsertRun(run: RunRow) {
  const index = runs.value.findIndex(entry => entry.$id === run.$id)
  if (index >= 0) runs.value[index] = run
  else runs.value = sortRuns([run, ...runs.value])
}

// Der Lauf selbst live: Statuswechsel (geclaimt, gestartet, fertig) kommen so
// ohne Poll an. Filter auf DIESES Subjekt — `where` ist der Filter, nicht das
// Publikum: lesen darf die Zeilen ohnehin nur `admin` (§ 4).
useRealtimeRows<RunRow>(
  config.public.appwriteDatabaseId,
  RUNS_TABLE,
  (event) => { if (event.type !== 'delete') upsertRun(event.payload) },
  { where: payload => payload.subjectType === props.subjectType && payload.subjectId === props.subjectId },
)

// Die Ereigniszeilen des GERADE gezeigten Laufs. Die Closure liest `currentId`
// bei jedem Ereignis neu — ein Wechsel des Laufs braucht deshalb kein neues
// Abonnement.
useRealtimeRows<RunEventRow>(
  config.public.appwriteDatabaseId,
  RUN_EVENTS_TABLE,
  (event) => {
    if (event.type === 'delete') return
    const index = events.value.findIndex(entry => entry.$id === event.payload.$id)
    if (index >= 0) events.value[index] = event.payload
    else events.value.push(event.payload)
  },
  { where: payload => payload.runId === currentId.value },
)

/** Der fachliche Grund aus dem Envelope (`{ok,code,message,reason}`). */
function reasonOf(error: unknown): string {
  return (error as { data?: { reason?: string } })?.data?.reason ?? ''
}

/**
 * Fachlicher Grund ⇒ Meldung. Eine Tabelle statt einer Ternär-Kette: mit den
 * Gründen aus SEC-037/SEC-038 waren es zu viele Zweige, um sie zu lesen.
 */
const START_ERROR_KEYS: Record<string, string> = {
  mode_not_allowed_untrusted: 'runner.panel.errors.mode',
  runner_unavailable: 'runner.panel.errors.runner',
  too_many_files: 'runner.panel.errors.tooManyFiles',
  tests_need_runner: 'runner.panel.errors.testsNeedRunner',
  tests_not_allowed_untrusted: 'runner.panel.errors.testsUntrusted',
  test_command_not_listed: 'runner.panel.errors.testNotListed',
  subject_not_found: 'runner.panel.errors.subjectNotFound',
  subject_trust_unavailable: 'runner.panel.errors.trustUnavailable',
}

async function start(options: RunStartOptions) {
  busy.value = true
  let draft: RunRow | null = null
  try {
    draft = await $fetch<RunRow>('/api/runner/runs', {
      method: 'POST',
      body: {
        subjectType: props.subjectType,
        subjectId: props.subjectId,
        promptSource: props.promptSource,
        // KEIN `promptTrusted`: ob der Auftrag als geprüft gilt, bestimmt der
        // Server aus der Herkunft des Subjekts (SEC-038), nie aus dem Body.
        ...options,
      },
    })

    // Sequenziell, nicht parallel: die Anhänge landen in EINER Spalte
    // (`attachmentsJson`), und zwei gleichzeitige Uploads würden sich
    // gegenseitig überschreiben (lesen–anhängen–schreiben ohne Sperre).
    for (const attachment of props.attachments ?? []) {
      const body = new FormData()
      body.append('file', await attachment.blob(), attachment.name)
      await $fetch<RunAttachmentAddedResponse>(`/api/runner/runs/${draft.$id}/files`, { method: 'POST', body })
    }

    const queued = await $fetch<RunRow>(`/api/runner/runs/${draft.$id}/queue`, { method: 'POST' })
    upsertRun(queued)
    selectedId.value = queued.$id
    forceForm.value = false
    toast.add({ title: t('runner.panel.started'), description: t('runner.panel.startedHint'), color: 'success', icon: 'i-ph-rocket-launch' })
  }
  catch (error) {
    /**
     * DEN ENTWURF NICHT LIEGEN LASSEN. Er ist für den Runner unsichtbar
     * (`claim` filtert auf `queued`), stünde aber für immer in der Liste und
     * sähe wie ein hängender Lauf aus. Genau dafür darf das Board
     * `draft → cancelled` (§ 4). Fail-soft: scheitert auch das, ist die
     * ursprüngliche Meldung die wichtigere.
     */
    if (draft) await $fetch(`/api/runner/runs/${draft.$id}/cancel`, { method: 'POST' }).catch(() => {})

    const reason = reasonOf(error)
    const status = (error as { statusCode?: number })?.statusCode
    const key = START_ERROR_KEYS[reason] ?? (status === 415 ? 'runner.panel.errors.fileType' : 'runner.panel.errors.start')
    toast.add({ title: t(key), description: t('runner.panel.errors.startHint'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

async function cancelRun(run: RunRow) {
  try {
    const ok = await confirm({
      title: t('runner.panel.cancelTitle'),
      description: t('runner.panel.cancelText'),
      confirmLabel: t('runner.panel.cancelConfirm'),
      action: () => $fetch(`/api/runner/runs/${run.$id}/cancel`, { method: 'POST' }),
    })
    if (!ok) return
    await loadRuns()
    toast.add({ title: t('runner.panel.cancelled'), description: t('runner.panel.cancelledHint'), color: 'success' })
  }
  catch {
    toast.add({ title: t('runner.panel.errors.cancel'), color: 'error' })
  }
}

function showForm() {
  selectedId.value = ''
  forceForm.value = true
}
function select(run: RunRow) {
  forceForm.value = false
  selectedId.value = run.$id
}

/**
 * Eine beantwortete Rückfrage: der Bericht hat den NEUEN Lauf angelegt und
 * reicht ihn hoch. Einhängen und auswählen wie ein frisch gestarteter Lauf —
 * derselbe Weg wie am Ende von `start()`. Realtime pflegt ihn danach fort.
 */
function onResumed(run: RunRow) {
  upsertRun(run)
  selectedId.value = run.$id
  forceForm.value = false
}
</script>

<template>
  <div class="space-y-3" data-runner-panel>
    <UAlert
      v-if="loadFailed"
      color="error"
      variant="subtle"
      icon="i-ph-warning"
      :title="t('runner.panel.loadFailed')"
      :actions="[{ label: t('runner.panel.retry'), color: 'error', variant: 'solid', onClick: () => { void loadRuns() } }]"
    />

    <!-- 1. FORMULAR -->
    <RunnerRunForm
      v-if="view === 'form'"
      :prompt-trusted="promptTrusted"
      :attachment-count="attachmentCount"
      :busy="busy"
      @start="start"
    />

    <!-- 2. LAUF AKTIV · 3. BERICHT — beide zeigen oben denselben Kopf -->
    <template v-else-if="current">
      <div class="flex flex-wrap items-center gap-2">
        <RunnerStatusBadge :status="current.status" />
        <span class="text-xs text-muted">{{ formatRelativeTime(current.$createdAt) }}</span>
        <span class="flex-1" />
        <UButton
          v-if="view === 'live'"
          icon="i-ph-prohibit"
          color="neutral"
          variant="subtle"
          size="xs"
          data-runner-cancel
          @click="cancelRun(current)"
        >
          {{ t('runner.panel.cancel') }}
        </UButton>
        <UButton
          v-else
          icon="i-ph-rocket-launch"
          color="neutral"
          variant="subtle"
          size="xs"
          data-runner-new
          @click="showForm"
        >
          {{ t('runner.panel.newRun') }}
        </UButton>
      </div>

      <RunnerRunReport v-if="view === 'report'" :run="current" @resumed="onResumed" />

      <RunnerRunTimeline
        v-if="view === 'live' || events.length"
        :events="events"
        :live="view === 'live'"
      />
    </template>

    <!-- Frühere Läufe zum selben Subjekt. BEWUSST KEINE UTable (B6): drei
         Angaben je Zeile in einer schmalen Spalte, und die Zeile ist ein
         Knopf — dieselbe Begründung wie bei der Beobachtet-Schublade des
         Boards. -->
    <div v-if="history.length" class="border-t border-default pt-3">
      <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-dimmed">{{ t('runner.panel.history') }}</h4>
      <ul class="space-y-1" data-runner-history>
        <li v-for="run in history" :key="run.$id">
          <button type="button" class="flex w-full cursor-pointer items-center gap-2 rounded px-1 py-1 text-start hover:bg-elevated" @click="select(run)">
            <RunnerStatusBadge :status="run.status" />
            <span class="min-w-0 flex-1 truncate text-xs text-muted">{{ run.model }} · {{ run.repoKey }}</span>
            <span class="shrink-0 text-xs text-dimmed">{{ formatRelativeTime(run.$createdAt) }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
