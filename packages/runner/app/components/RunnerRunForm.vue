<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { createRunStartSchema } from '../../schemas/runStart'
import { UNTRUSTED_PERMISSION_MODES } from '../../shared/runGuards'
import { offeredTestCommands } from '../../shared/testCommands'
import { PERMISSION_MODES, type PermissionMode, type RunStartOptions, type RunnerPublic, type RunnersListResponse } from '../../shared/types/runner'

/**
 * „Vor dem Lauf": Rechner, Modell, Modus, Repo, Budget, Testbefehle
 * (docs/plans/AI-RUNNER.md § 9).
 *
 * DAS FORMULAR KENNT DEN AUFTRAG NICHT — es wählt nur, WIE gelaufen wird. Was
 * gelaufen wird (`promptSource`) bringt der Einbindende mit; `promptTrusted`
 * reist nur als ANZEIGE-Prop durch, damit Modus-Liste und Testbefehle ehrlich
 * sind — entschieden wird es auf dem Server (SEC-038).
 *
 * MODELLE UND REPOS KOMMEN AUS DER `app.config` (`pukalani.runner.*`), nicht
 * aus dem Markup: eine neue Modell-Generation soll eine Config-Zeile sein.
 * Beides ist ANZEIGE — was wirklich erlaubt ist, entscheidet die lokale
 * Allowlist auf dem Rechner (§ 8.1).
 */
const props = defineProps<{
  /** false = Text gilt nicht als vom Betreiber geschrieben (§ 8.2) — dann nur `plan`/`acceptEdits`, keine Testbefehle */
  promptTrusted: boolean
  /** Wie viele Dateien mitgeschickt werden — nur zur Anzeige */
  attachmentCount: number
  busy: boolean
}>()
const emit = defineEmits<{ start: [options: RunStartOptions] }>()

const { t } = useI18n()
const appConfig = useAppConfig()

interface RunnerConfig {
  models?: { value: string, label: string }[]
  repos?: string[]
}
const runnerConfig = computed<RunnerConfig>(() =>
  (appConfig.pukalani as { runner?: RunnerConfig } | undefined)?.runner ?? {})

/**
 * `app.config` merged mit defu, und Arrays werden KONKATENIERT — eine App, die
 * ihre eigenen Modelle nennt, ERGÄNZT die des Layers. Doppelte Werte wären
 * doppelte Einträge im Auswahlfeld, deshalb hier entdoppelt (der erste
 * gewinnt, wie überall bei defu).
 */
function unique<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const id = key(item)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

const modelItems = computed(() =>
  unique(runnerConfig.value.models ?? [], model => model.value)
    .map(model => ({ label: model.label, value: model.value })))
const repoItems = computed(() =>
  unique(runnerConfig.value.repos ?? [], repo => repo)
    .map(repo => ({ label: repo, value: repo })))

/**
 * Bei ungeprüftem Text stehen nur zwei der sechs Modi im Feld — dieselbe Menge,
 * die `permissionModeAllowed` durchlässt, aus derselben Konstante. Eine zweite
 * Liste hier wäre die Stelle, an der die Oberfläche und die Sicherung eines
 * Tages auseinanderlaufen.
 */
const modeItems = computed(() => {
  const modes: readonly PermissionMode[] = props.promptTrusted ? PERMISSION_MODES : UNTRUSTED_PERMISSION_MODES
  return modes.map(mode => ({ label: t(`runner.modes.${mode}`), value: mode }))
})

// Nur AKTIVE Rechner: ein stillgelegter weist jeden Claim ab (§ 4), ein Lauf
// auf ihn wäre eine Schlange ohne Abholer.
const { data: runnersData, status: runnersStatus, error: runnersError } = useFetch<RunnersListResponse>('/api/runner/runners', {
  // Der Bereich hängt in einem Modal, das erst auf Klick geöffnet wird — es
  // gibt hier nichts zu SSRen, und die Betreiber-Konsole soll für ein
  // geschlossenes Panel keine Runde nach Appwrite drehen.
  server: false,
  lazy: true,
})
const activeRunners = computed<RunnerPublic[]>(() =>
  (runnersData.value?.runners ?? []).filter(runner => runner.status === 'active'))
const runnerItems = computed(() => activeRunners.value.map(runner => ({ label: runner.name, value: runner.$id })))

const schema = computed(() => createRunStartSchema(t, { promptTrusted: props.promptTrusted }))
type FormInput = z.infer<ReturnType<typeof createRunStartSchema>>

const state = reactive<FormInput>({
  runnerId: '',
  model: modelItems.value[0]?.value ?? 'sonnet',
  // VORSICHTIGSTE VORBELEGUNG, in beiden Fällen: `plan` schreibt nichts. Wer
  // mehr will, wählt es bewusst — das ist die Reihenfolge, die man haben will,
  // wenn ein Klick Code auf einem echten Rechner ausführt.
  permissionMode: 'plan',
  repoKey: repoItems.value[0]?.value ?? '',
  maxBudgetText: '',
  testCommands: [],
  // headless ist die Vorgabe; interaktiv (Terminal, § 7.3) wählt man bewusst.
  interactive: false,
})

// Genau EIN Rechner? Dann ist die Wahl keine Wahl — vorbelegen.
watch(runnerItems, (items) => {
  if (!state.runnerId && items.length === 1) state.runnerId = items[0]!.value
}, { immediate: true })

/**
 * Interaktiv geht NUR auf einem lokalen Rechner (er öffnet ein Terminal-Fenster;
 * ein SSH-Runner kann das nicht). Wechselt die Wahl auf einen nicht-lokalen
 * Rechner, fällt der Schalter zurück — sonst stünde ein Wunsch im Body, den der
 * Runner gar nicht erfüllen kann.
 */
const selectedRunner = computed<RunnerPublic | null>(() =>
  activeRunners.value.find(runner => runner.$id === state.runnerId) ?? null)
const interactiveAvailable = computed(() => selectedRunner.value?.kind === 'local')
watch(interactiveAvailable, (ok) => { if (!ok) state.interactive = false })

/**
 * TESTBEFEHLE NUR AUS DER LISTE DES RECHNERS (SEC-037). Der gewählte Rechner
 * meldet im Heartbeat je Repo, was er ausführen würde — genau das steht hier
 * zur Wahl, sonst nichts (auch kein „eigenen Eintrag anlegen"). Ein alter
 * Dienst meldet nichts ⇒ nichts wählbar. Die Anzeige-Kopie ist keine
 * Erlaubnis: die Route prüft jeden Eintrag noch einmal, der Rechner ein
 * drittes Mal gegen seine lokale Liste.
 */
const offeredTests = computed<string[]>(() =>
  selectedRunner.value ? offeredTestCommands(selectedRunner.value.capabilitiesJson, state.repoKey) : [])
const testItems = computed(() => offeredTests.value.map(command => ({ label: command, value: command })))

// Wechselt Rechner oder Repo, fällt weg, was dort nicht mehr angeboten wird —
// sonst stünde eine Wahl im Body, die der Server mit `test_command_not_listed`
// ablehnt. Bei ungeprüftem Auftrag gibt es gar keine Testbefehle.
watch([offeredTests, () => props.promptTrusted], ([offered, trusted]) => {
  const next = trusted ? state.testCommands.filter(command => offered.includes(command)) : []
  if (next.length !== state.testCommands.length) state.testCommands = next
}, { immediate: true })

const testsHelp = computed(() => {
  if (!selectedRunner.value) return t('runner.form.testsPickRunner')
  return testItems.value.length ? t('runner.form.testsHelp') : t('runner.form.testsNoneOffered')
})

function onSubmit(event: FormSubmitEvent<FormInput>) {
  emit('start', {
    runnerId: event.data.runnerId,
    model: event.data.model,
    permissionMode: event.data.permissionMode,
    repoKey: event.data.repoKey,
    maxBudgetUsd: event.data.maxBudgetText === '' ? 0 : Number(event.data.maxBudgetText),
    // In der Reihenfolge der gemeldeten Liste (nicht der Klick-Reihenfolge) und
    // nur, was gerade angeboten wird; ungeprüft ⇒ keine.
    testCommands: props.promptTrusted
      ? offeredTests.value.filter(command => event.data.testCommands.includes(command))
      : [],
    // Nur echt interaktiv, wenn der Rechner es auch kann.
    interactive: event.data.interactive && interactiveAvailable.value,
  })
}
</script>

<template>
  <div>
    <UAlert
      v-if="runnersError"
      color="error"
      variant="subtle"
      icon="i-ph-warning"
      :title="t('runner.form.runnersFailed')"
      class="mb-3"
    />

    <!-- Ohne Rechner gibt es nichts zu starten — und der nächste Schritt liegt
         auf einer anderen Seite, also führt der Leerzustand dorthin. -->
    <CoreEmptyState
      v-else-if="runnersStatus === 'success' && !activeRunners.length"
      icon="i-ph-desktop"
      :title="t('runner.form.noRunnersTitle')"
      :description="t('runner.form.noRunnersText')"
      :action-label="t('runner.form.noRunnersAction')"
      action-icon="i-ph-arrow-right"
      action-to="/dashboard/runner"
    />

    <UForm v-else :schema="schema" :state="state" class="space-y-3" data-runner-form @submit="onSubmit">
      <!-- § 8.2: der Text gilt nicht als vom Betreiber geschrieben. Der Hinweis
           erklärt, warum hier Modi und Testbefehle fehlen — ein Feld, das ohne
           Grund weniger anbietet, sieht wie ein Fehler aus. -->
      <UAlert
        v-if="!promptTrusted"
        color="warning"
        variant="subtle"
        icon="i-ph-shield-warning"
        :title="t('runner.form.untrustedTitle')"
        :description="t('runner.form.untrustedText')"
        data-runner-untrusted
      />

      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField name="runnerId" :label="t('runner.form.runner')">
          <USelect v-model="state.runnerId" :items="runnerItems" size="sm" class="w-full" :placeholder="t('runner.form.runnerPlaceholder')" />
        </UFormField>
        <UFormField name="repoKey" :label="t('runner.form.repo')" :help="t('runner.form.repoHelp')">
          <USelect v-model="state.repoKey" :items="repoItems" size="sm" class="w-full" />
        </UFormField>
        <UFormField name="model" :label="t('runner.form.model')">
          <USelect v-model="state.model" :items="modelItems" size="sm" class="w-full" />
        </UFormField>
        <UFormField name="permissionMode" :label="t('runner.form.mode')">
          <USelect v-model="state.permissionMode" :items="modeItems" size="sm" class="w-full" />
        </UFormField>
      </div>

      <UFormField name="maxBudgetText" :label="t('runner.form.budget')" :help="t('runner.form.budgetHelp')">
        <UInput v-model="state.maxBudgetText" type="number" min="0" max="100" step="0.5" size="sm" class="w-full sm:w-40" />
      </UFormField>

      <!-- SEC-037: Auswahl aus der Liste des Rechners, kein Freitext. Ungeprüft
           gibt es keine Testbefehle — dann ein Satz statt eines toten Felds. -->
      <UFormField
        name="testCommands"
        :label="t('runner.form.tests')"
        :help="promptTrusted ? testsHelp : t('runner.form.testsUntrusted')"
      >
        <USelectMenu
          v-if="promptTrusted"
          v-model="state.testCommands"
          multiple
          value-key="value"
          :items="testItems"
          :disabled="!testItems.length"
          :placeholder="t('runner.form.testsPlaceholder')"
          size="sm"
          class="w-full"
          data-runner-tests
        />
      </UFormField>

      <!-- § 7.3: interaktiv öffnet der Runner ein Terminal zum Zuschauen und
           Genehmigen. Nur auf einem lokalen Rechner — sonst gesperrt, mit
           Begründung statt eines wirkungslosen Schalters. -->
      <UFormField name="interactive" :help="interactiveAvailable ? t('runner.form.interactiveHelp') : t('runner.form.interactiveRemote')">
        <USwitch
          v-model="state.interactive"
          :disabled="!interactiveAvailable"
          size="sm"
          :label="t('runner.form.interactive')"
          data-runner-interactive
        />
      </UFormField>

      <div class="flex items-center justify-between gap-2">
        <p v-if="attachmentCount" class="text-xs text-muted">
          {{ t('runner.form.attachments', { count: attachmentCount }) }}
        </p>
        <span v-else />
        <UButton type="submit" icon="i-ph-rocket-launch" size="sm" :loading="busy" data-runner-start>
          {{ t('runner.form.start') }}
        </UButton>
      </div>
    </UForm>
  </div>
</template>
