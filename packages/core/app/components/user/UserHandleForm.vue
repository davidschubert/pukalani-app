<script setup lang="ts">
import {
  HANDLE_CHANGE_INTERVAL_DAYS,
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  handleRejection,
  normalizeHandle,
} from '../../../shared/handles'
import type { AccountHandleResponse } from '../../../shared/types/handle'

/**
 * Der eigene @name — anzeigen und ändern. KONTO-WEIT seit AH-7 (2026-08-11).
 *
 * ── EINE FLÄCHE, ZWEI ORTE, EIN NAME ──────────────────────────────────────
 * Dieselbe Komponente steht auf `/profile` (account.pukalani.app) und im
 * Konto-Reiter jedes Community-Dashboards — und sie zeigt an beiden Orten
 * DASSELBE, weil es seit Davids Entscheidung vom 2026-08-11 nur noch einen
 * Namen je Pukalani-ID gibt. Vorher war das ein Slot mit Ersatztext, weil ein
 * Kontroll-Host keine Community hat und der Name pro Community galt; diese
 * Unterscheidung ist ersatzlos weg.
 *
 * Es gibt deshalb auch KEINE Mitglieder-Unterscheidung mehr (das `member`-Feld
 * der Vorgänger-Route ist mit ihr verschwunden): der Name gehört dem Konto,
 * gesetzt werden darf er überall. Was von der Zugehörigkeit abhängt, ist nur
 * die SICHTBARKEIT im Erwähnungs-Menü — und die pflegt der Server.
 *
 * ── DIE REGELN KOMMEN AUS DERSELBEN DATEI WIE AUF DEM SERVER ───────────────
 * `handleRejection` ist genau die Funktion, die auch `PATCH /api/account/handle`
 * benutzt. Hier sagt sie sofort, was stört; dort setzt sie es durch. Zwei
 * Regelwerke für eine Frage laufen auseinander — deshalb eines.
 *
 * ── WARUM IN DEN NACHRICHTEN KEIN EINZIGES `@` STEHT ───────────────────────
 * nuxt-i18n hält spitze Klammern für HTML und `@` für seinen eigenen
 * Verweis-Operator; beides bringt den Nachrichten-Compiler IM CLIENT zum
 * Absturz, während SSR noch richtig aussieht (2026-08-04 live erwischt). Man
 * KÖNNTE `{'@'}` schreiben — aber die Falle ist genau die, dass man es
 * irgendwann vergisst. Hier steht das `@` deshalb im TEMPLATE, als
 * Eingabefeld-Präfix, und die Übersetzungen bleiben davon frei.
 */
const { t, te, locale } = useI18n()
const toast = useToast()

// `server: false` mit Absicht: die Route VERGIBT beim ersten Aufruf einen
// Namen — das ist ein Schreibvorgang und gehört nicht in einen SSR-Durchlauf,
// den ein Crawler auslösen kann.
//
// Der Antworttyp kommt aus `shared/types/handle.ts` und wird vom Handler
// ebenfalls verlangt (TS2589-Umbau, 2026-08-14): eine hier lokal erfundene
// Form wäre eine Behauptung, die niemand gegenprüft.
const { data, refresh, error } = await useFetch<AccountHandleResponse>('/api/account/handle', {
  lazy: true,
  server: false,
  default: () => ({ handle: null, changedAt: null, canChange: true, availableAt: null }),
})

const draft = ref('')
const saving = ref(false)
const touched = ref(false)

watch(() => data.value?.handle, (value) => {
  if (value && !touched.value) draft.value = value
}, { immediate: true })

const current = computed(() => data.value?.handle ?? '')
const canChange = computed(() => data.value?.canChange !== false)
const unchanged = computed(() => normalizeHandle(draft.value) === current.value.toLowerCase())

/** Sofortige Rückmeldung — dieselbe Regel wie auf dem Server. */
const rejection = computed(() => (draft.value.trim() ? handleRejection(draft.value) : null))

const availableDate = computed(() => {
  const at = data.value?.availableAt
  if (!at) return ''
  return new Date(at).toLocaleDateString(locale.value, { year: 'numeric', month: 'long', day: 'numeric' })
})

/** Ablehnungsgründe von Regel UND Server teilen sich die Textbausteine. */
function reasonText(code: string): string {
  const key = `account.handle.errors.${code}`
  return te(key) ? t(key) : t('account.handle.errors.generic')
}

async function save() {
  if (saving.value || rejection.value || unchanged.value) return
  saving.value = true
  try {
    await $fetch('/api/account/handle', { method: 'PATCH', body: { handle: draft.value } })
    touched.value = false
    await refresh()
    toast.add({ title: t('account.handle.saved'), color: 'success' })
  }
  catch (error) {
    // Fachliche Gründe reisen als `reason` im Envelope (core/server/error.ts).
    const reason = (error as { data?: { reason?: string } })?.data?.reason
    toast.add({
      title: t('account.handle.saveFailed'),
      description: reason ? reasonText(reason) : undefined,
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <div>
      <p class="text-sm font-medium text-highlighted">{{ t('account.handle.title') }}</p>
      <p class="text-sm text-muted">{{ t('account.handle.description') }}</p>
    </div>

    <UFormField
      :label="t('account.handle.label')"
      :help="t('account.handle.hint', { min: HANDLE_MIN_LENGTH, max: HANDLE_MAX_LENGTH })"
      :error="rejection ? reasonText(rejection) : undefined"
    >
      <UInput
        v-model="draft"
        :disabled="!canChange || saving"
        :maxlength="HANDLE_MAX_LENGTH"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        data-handle-input
        @update:model-value="touched = true"
      >
        <!-- Das `@` lebt hier, nicht in den Übersetzungen (siehe Kopf). -->
        <template #leading>
          <span class="text-dimmed">@</span>
        </template>
      </UInput>
    </UFormField>

    <!-- LZ1: ohne diese Zeile stünde nach einem gescheiterten Abruf ein leeres
         Feld, als hätte das Konto noch keinen Namen. -->
    <CoreInlineLoadError v-if="error" :retry="refresh" data-handle-load-error />

    <!-- Die Sperrfrist als Satz, mit Datum — „geht nicht" allein beantwortet
         nicht, ab wann es wieder geht. -->
    <p v-if="!canChange" class="text-xs text-warning" data-handle-locked>
      {{ t('account.handle.lockedUntil', { date: availableDate, days: HANDLE_CHANGE_INTERVAL_DAYS }) }}
    </p>

    <div class="flex justify-end">
      <UButton
        size="sm"
        :loading="saving"
        :disabled="!canChange || !!rejection || unchanged"
        data-handle-save
        @click="save"
      >
        {{ t('account.handle.save') }}
      </UButton>
    </div>
  </div>
</template>
