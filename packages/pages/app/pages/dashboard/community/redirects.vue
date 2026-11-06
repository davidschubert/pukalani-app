<script setup lang="ts">
/**
 * WEITERLEITUNGEN DIESER COMMUNITY (U15 Teil 3, Davids Entscheidung vom
 * 2026-08-13) — Reiter des Community-Hubs.
 *
 * ── WARUM DIE SEITE IM pages-LAYER LIEGT ──────────────────────────────────
 * Dieselbe Regel wie bei Menü und Sucheintrag (A14, „eine Seite reicht nur so
 * weit wie ihre Routen"): die Schreib-Route braucht keine Naht ins Control
 * Plane, und der Gegenstand sind die ADRESSEN dieser Website — die Gruppe, die
 * diesem Layer gehört. Der Audit vom 2026-08-09 führt den Punkt unter
 * „Settings · Website".
 *
 * ── EINE TABELLE, KEIN FORMULAR-STAPEL ────────────────────────────────────
 * `UTable` ist der Standard für Datenlisten im Dashboard (Davids Entscheidung
 * B6) und passt hier ohne Vorbehalt: eine Weiterleitung ist eine ZEILE mit
 * zwei Feldern, und zwanzig davon sind eine Liste, keine zwanzig Formulare.
 * Der leere Zustand kommt aus `CoreEmptyState`.
 *
 * ── EIN ZIELFELD, KEIN SCHALTER „extern" ──────────────────────────────────
 * Der Owner tippt ein Ziel, und die Form sagt eindeutig, was gemeint ist: was
 * mit `/` beginnt, ist eine Adresse auf dieser Seite, was mit `https://`
 * beginnt, liegt woanders. Ein zusätzlicher Schalter könnte dem nur
 * WIDERSPRECHEN — und ein Widerspruch zwischen Schalter und Eingabe ist ein
 * Fehler, den niemand versteht. Anders als beim Menü (Teil 1), wo der Schalter
 * die Auswahl zwischen Seiten-Wähler und Adressfeld umlegt, gibt es hier
 * nichts umzulegen. Die Zeile trägt das Ergebnis trotzdem explizit als
 * `external`, weil die REGEL es explizit braucht (301 gegen 302).
 *
 * ── GEPRÜFT WIRD MIT DEMSELBEN SCHEMA WIE AUF DEM SERVER ──────────────────
 * `createCommunityRedirectsSchema(t)` — dieselbe Datei, dieselben Prädikate,
 * nur mit übersetzten Texten. Eine zweite, „ungefähre" Prüfung im Browser wäre
 * schlimmer als keine: sie liesse Dinge durch, die der Server ablehnt, und
 * lehnte Dinge ab, die er nähme. Geprüft wird der GESAMTE Entwurf und nicht
 * nur die neue Zeile, weil die Schleifen-Regel („ein Ziel ist nie eine
 * Quelle") nur über die ganze Liste entschieden werden kann.
 */
import type { TableColumn } from '@nuxt/ui'
import { createCommunityRedirectsSchema } from '../../../../schemas/redirects'
import {
  MAX_REDIRECT_FROM,
  MAX_REDIRECT_RULES,
  MAX_REDIRECT_TO,
  type CommunityRedirectConfig,
  type CommunityRedirectRule,
  normalizeRedirectPath,
} from '../../../../../core/shared/communityRedirects'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'branding.manage' })

const { t } = useI18n()
const toast = useToast()
useBrandTitle(() => t('pages.redirects.title'))

const { data, refresh } = await useFetch<CommunityRedirectConfig>('/api/pages/redirects', { lazy: true, server: false })

const rules = ref<CommunityRedirectRule[]>([])
const savedJson = ref('[]')
watch(data, (value) => {
  rules.value = (value?.rules ?? []).map(rule => ({ ...rule }))
  savedJson.value = JSON.stringify(rules.value)
}, { immediate: true })

const draftFrom = ref('')
const draftTo = ref('')
const addError = ref('')
const saving = ref(false)

const schema = computed(() => createCommunityRedirectsSchema(t))
const dirty = computed(() => JSON.stringify(rules.value) !== savedJson.value)
const full = computed(() => rules.value.length >= MAX_REDIRECT_RULES)

/** Was mit `https://` beginnt, liegt woanders — s. Kopf. */
function isExternalTarget(to: string): boolean {
  return /^https?:\/\//i.test(to.trim())
}

/** Die erste Beanstandung des GESAMTEN Entwurfs, übersetzt — oder ''. */
function firstIssue(next: CommunityRedirectRule[]): string {
  const result = schema.value.safeParse({ rules: next })
  if (result.success) return ''
  return result.error.issues[0]?.message ?? t('pages.redirects.validation.fromInvalid')
}

function addRule() {
  addError.value = ''
  const from = normalizeRedirectPath(draftFrom.value)
  const to = draftTo.value.trim()
  const external = isExternalTarget(to)
  const candidate: CommunityRedirectRule = {
    from: from || draftFrom.value.trim(),
    to: external ? to : normalizeRedirectPath(to) || to,
    ...(external ? { external: true } : {}),
  }
  const next = [...rules.value, candidate]
  const issue = firstIssue(next)
  if (issue) {
    addError.value = issue
    return
  }
  rules.value = next
  draftFrom.value = ''
  draftTo.value = ''
}

function removeRule(index: number) {
  addError.value = ''
  rules.value = rules.value.filter((_, i) => i !== index)
}

async function save() {
  const issue = firstIssue(rules.value)
  if (issue) {
    addError.value = issue
    return
  }
  saving.value = true
  try {
    const result = await $fetch<CommunityRedirectConfig>('/api/pages/redirects', {
      method: 'PATCH',
      body: { rules: rules.value },
    })
    // Der gespeicherte Zustand zurück in die Tabelle: die Pfade können beim
    // Normalisieren anders geworden sein (Muster seo.vue).
    rules.value = result.rules.map(rule => ({ ...rule }))
    savedJson.value = JSON.stringify(rules.value)
    await refresh()
    toast.add({ title: t('pages.redirects.saved'), color: 'success' })
  }
  catch {
    toast.add({ title: t('pages.redirects.errorSave'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

interface RedirectRow { index: number, from: string, to: string, external: boolean }

const tableRows = computed<RedirectRow[]>(() => rules.value.map((rule, index) => ({
  index,
  from: rule.from,
  to: rule.to,
  external: rule.external === true,
})))

const columns = computed<TableColumn<RedirectRow>[]>(() => [
  { accessorKey: 'from', header: () => t('pages.redirects.col.from') },
  { accessorKey: 'to', header: () => t('pages.redirects.col.to') },
  { id: 'kind', header: () => t('pages.redirects.col.kind') },
  { id: 'actions', header: srOnlyHeader(() => t('ui.table.actions')) },
])
</script>

<template>
  <div class="flex w-full flex-col gap-4">
    <div class="flex items-start justify-between gap-4">
      <p class="max-w-2xl text-sm text-muted">{{ t('pages.redirects.description') }}</p>
      <UButton
        :loading="saving"
        :disabled="!dirty"
        icon="i-ph-floppy-disk"
        data-testid="redirects-save"
        @click="save"
      >
        {{ t('ui.save') }}
      </UButton>
    </div>

    <UCard>
      <template #header>
        <h2 class="font-semibold">{{ t('pages.redirects.add.title') }}</h2>
        <p class="mt-1 text-sm text-muted">{{ t('pages.redirects.add.hint') }}</p>
      </template>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
        <UFormField class="flex-1" :label="t('pages.redirects.add.fromLabel')">
          <UInput
            v-model="draftFrom"
            :maxlength="MAX_REDIRECT_FROM"
            :placeholder="t('pages.redirects.add.fromPlaceholder')"
            class="w-full font-mono"
            data-testid="redirects-from"
          />
        </UFormField>
        <UFormField class="flex-1" :label="t('pages.redirects.add.toLabel')">
          <UInput
            v-model="draftTo"
            :maxlength="MAX_REDIRECT_TO"
            :placeholder="t('pages.redirects.add.toPlaceholder')"
            class="w-full font-mono"
            data-testid="redirects-to"
          />
        </UFormField>
        <UButton
          icon="i-ph-plus"
          :disabled="full || !draftFrom || !draftTo"
          data-testid="redirects-add"
          @click="addRule"
        >
          {{ t('pages.redirects.add.action') }}
        </UButton>
      </div>

      <p v-if="addError" class="mt-3 text-sm text-error" data-testid="redirects-error">{{ addError }}</p>
      <p v-else-if="full" class="mt-3 text-sm text-warning">
        {{ t('pages.redirects.add.full', { max: MAX_REDIRECT_RULES }) }}
      </p>
    </UCard>

    <UTable :data="tableRows" :columns="columns" data-testid="redirects-table">
      <template #from-cell="{ row }">
        <span class="font-mono text-sm font-medium">{{ row.original.from }}</span>
      </template>
      <template #to-cell="{ row }">
        <span class="font-mono text-sm text-muted">{{ row.original.to }}</span>
      </template>
      <template #kind-cell="{ row }">
        <UBadge
          :color="row.original.external ? 'warning' : 'neutral'"
          variant="subtle"
          size="sm"
        >
          {{ row.original.external ? t('pages.redirects.kind.external') : t('pages.redirects.kind.internal') }}
        </UBadge>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end">
          <UButton
            color="error"
            variant="ghost"
            size="xs"
            icon="i-ph-trash"
            :aria-label="t('pages.redirects.remove')"
            :data-testid="`redirects-remove-${row.original.index}`"
            @click="() => removeRule(row.original.index)"
          />
        </div>
      </template>

      <template #empty>
        <CoreEmptyState
          icon="i-ph-arrow-bend-up-right"
          :title="t('pages.redirects.emptyTitle')"
          :description="t('pages.redirects.empty')"
          data-testid="redirects-empty"
        />
      </template>
    </UTable>

    <p class="text-xs text-muted">{{ t('pages.redirects.footnote') }}</p>
  </div>
</template>
