<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { nameToSubdomain, OPERATOR_APEX } from '../../../schemas/tenant'
import type { TenantMode, TenantPlan, TenantStatus, TenantWave } from '../../../shared/types/tenantRecord'
import type { CommunitySuspension } from '../../../../core/shared/communitySuspension'
import type { CustomDomainApprovalResponse, CustomDomainStatus } from '../../../shared/customDomain'
import type { CustomDomainSweepItem, CustomDomainSweepMode, CustomDomainSweepRouteResponse } from '../../../shared/customDomainSweep'
import { planLabelKey } from '../../utils/planLabels'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'sites.manage' })

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const { promptFreshSignIn } = useRecentAuthPrompt()
useBrandTitle(() => t('control.tenants.title'))

interface TenantDto { id: string, name: string, host: string, mode: TenantMode, projectId: string, tenantId: string, status: TenantStatus, wave: TenantWave, plan: TenantPlan, openRegistration: boolean, suspension: CommunitySuspension, suspensionReason: string, suspendedAt: string | null, pastDueSince: string | null, customDomain: string, customDomainStatus: CustomDomainStatus, customDomainApproved: boolean, customDomainGraceEndsAt: string | null, customDomainPausedAt: string | null }

const { data, refresh } = await useFetch<{ total: number, tenants: TenantDto[] }>('/api/control/tenants', { lazy: true, server: false })
const tenants = computed(() => data.value?.tenants ?? [])

const showCreate = ref(false)
const showAdvanced = ref(false)
const saving = ref(false)
const form = reactive({ name: '', host: '', mode: 'pool' as TenantMode, projectId: '', wave: 'stable' as TenantWave, plan: 'basic' as TenantPlan })
const modeItems = computed(() => [
  { label: t('control.tenants.mode.pool'), value: 'pool' },
  { label: t('control.tenants.mode.silo'), value: 'silo' },
])
const waveItems = computed(() => [
  { label: t('control.tenants.wave.internal'), value: 'internal' },
  { label: t('control.tenants.wave.canary'), value: 'canary' },
  { label: t('control.tenants.wave.stable'), value: 'stable' },
])
const planItems = computed(() => [
  { label: t('control.tenants.plan.basic'), value: 'basic' },
  { label: t('control.tenants.plan.personal'), value: 'personal' },
  { label: t('control.tenants.plan.pro'), value: 'pro' },
])

// UX: der Name führt — die Subdomain folgt live, solange der Betreiber das
// Host-Feld nicht selbst angefasst hat (dann gewinnt seine Eingabe).
const hostTouched = ref(false)
watch(() => form.name, (name) => {
  if (hostTouched.value) return
  const slug = nameToSubdomain(name)
  form.host = slug ? `${slug}.${OPERATOR_APEX}` : ''
})

function openCreate() {
  form.name = ''
  form.host = ''
  form.mode = 'pool'
  form.projectId = ''
  form.wave = 'stable'
  form.plan = 'basic'
  hostTouched.value = false
  showAdvanced.value = false
  showCreate.value = true
}

async function createTenant() {
  saving.value = true
  try {
    await $fetch('/api/control/tenants', {
      method: 'POST',
      body: {
        name: form.name,
        host: form.host,
        mode: form.mode,
        // leer = Server nimmt den Pool-Default (pukalani.control.defaultPoolProject)
        ...(form.projectId ? { projectId: form.projectId } : {}),
        ...(form.wave !== 'stable' ? { wave: form.wave } : {}),
        ...(form.plan !== 'basic' ? { plan: form.plan } : {}),
      },
    })
    toast.add({
      title: t('control.tenants.created'),
      description: t('control.tenants.createdHint', { host: form.host }),
      color: 'success',
    })
    showCreate.value = false
    await refresh()
  }
  catch (error) {
    // Der Statustext fällt unter HTTP/2 weg — ohne Ersatz stünde hier eine
    // leere Beschreibung.
    toast.add({
      title: t('control.tenants.createFailed'),
      description: (error as { statusMessage?: string })?.statusMessage || t('control.tenants.createFailedHint'),
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}

async function changeWave(tenant: TenantDto, wave: TenantWave) {
  if (wave === tenant.wave) return
  try {
    await $fetch(`/api/control/tenants/${tenant.id}`, { method: 'PATCH', body: { wave } })
    toast.add({ title: t('control.tenants.waveChanged'), description: t('control.tenants.waveChangedHint'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('control.tenants.updateFailed'), description: t('control.tenants.updateFailedHint'), color: 'error' })
  }
}

async function changePlan(tenant: TenantDto, plan: TenantPlan) {
  if (plan === tenant.plan) return
  try {
    await $fetch(`/api/control/tenants/${tenant.id}`, { method: 'PATCH', body: { plan } })
    toast.add({ title: t('control.tenants.planChanged'), description: t('control.tenants.planChangedHint'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('control.tenants.updateFailed'), description: t('control.tenants.updateFailedHint'), color: 'error' })
  }
}

async function toggleStatus(tenant: TenantDto) {
  const status = tenant.status === 'active' ? 'disabled' : 'active'
  try {
    await $fetch(`/api/control/tenants/${tenant.id}`, { method: 'PATCH', body: { status } })
    toast.add({
      title: t(status === 'active' ? 'control.tenants.enabled' : 'control.tenants.disabled'),
      description: t(status === 'active' ? 'control.tenants.enabledHint' : 'control.tenants.disabledHint'),
      color: 'success',
    })
    await refresh()
  }
  catch {
    toast.add({ title: t('control.tenants.updateFailed'), description: t('control.tenants.updateFailedHint'), color: 'error' })
  }
}

/**
 * S1: Mitglieder-Registrierung der Community. Der Schalter GEHÖRT der Kundin
 * (/dashboard/community auf ihrem Host) — hier steht er als
 * Support-Weg, weil der Kunden-Pfad eine aktive community_members-Rolle verlangt
 * und ein Betreiber die bewusst nicht hat.
 */
async function toggleOpenRegistration(tenant: TenantDto, openRegistration: boolean) {
  try {
    await $fetch(`/api/control/tenants/${tenant.id}`, { method: 'PATCH', body: { openRegistration } })
    // „Tenant aktualisiert" allein verrät nicht, in welche Richtung der
    // Schalter gekippt ist — genau das ist hier die Auskunft.
    toast.add({
      title: t('control.tenants.updated'),
      description: t(openRegistration ? 'control.tenants.registrationOpenHint' : 'control.tenants.registrationClosedHint'),
      color: 'success',
    })
    await refresh()
  }
  catch {
    toast.add({ title: t('control.tenants.updateFailed'), description: t('control.tenants.updateFailedHint'), color: 'error' })
    await refresh()
  }
}

/**
 * Löschen geht jetzt durch useConfirm (Löschen-Vertrag, seit 2026-07-28).
 * Vorher löschte EIN Klick auf das Papierkorb-Symbol den Mandanten einer
 * Kundin ohne Rückfrage — die einzige Liste im Dashboard, in der das noch so
 * war. Beim Umbau auf die Tabelle wandert die Aktion ins Zeilen-Menü; ohne
 * Rückfrage wäre sie dort genauso scharf, nur unauffälliger.
 */
async function removeTenant(tenant: TenantDto) {
  try {
    const ok = await confirm({
      title: t('control.tenants.confirmDeleteTitle'),
      description: t('control.tenants.confirmDeleteText', { host: tenant.host }),
      confirmLabel: t('control.tenants.delete'),
      color: 'error',
      action: () => $fetch(`/api/control/tenants/${tenant.id}`, { method: 'DELETE' }),
    })
    if (!ok) return
    toast.add({
      title: t('control.tenants.deleted'),
      description: t('control.tenants.deletedHint', { host: tenant.host }),
      color: 'success',
    })
    await refresh()
  }
  catch (error) {
    // RA3: Löschen verlangt eine frische Anmeldung — der EINE Weg aus core.
    if (await promptFreshSignIn(error, t('control.tenants.reauthText'))) return
    toast.add({ title: t('control.tenants.deleteFailed'), description: t('control.tenants.deleteFailedHint'), color: 'error' })
  }
}

/**
 * SPERREN / ENTSPERREN (M13, Davids Entscheidung vom 2026-08-02, Auslöser 1).
 *
 * Der GRUND ist Pflicht — und zwar nicht als Formalie: genau dieser Text steht
 * danach im Hinweis, den der Owner in seinem Dashboard liest. Deshalb sagt das
 * Modal das auch so, statt „Notiz" zu beschriften.
 *
 * ZWEI STUFEN in EINEM Modal, weil es dieselbe Entscheidung mit zwei Härten ist:
 * „nur-lesend" (Zahlung) oder „ganz aus" (Missbrauch). Zwei getrennte Knöpfe in
 * der Zeile wären zwei Gelegenheiten, den falschen zu treffen.
 */
const showSuspend = ref(false)
const suspendTarget = ref<TenantDto | null>(null)
const suspendForm = reactive({ kind: 'billing' as Exclude<CommunitySuspension, ''>, reason: '' })
const suspendSaving = ref(false)

const suspendKindItems = computed(() => [
  { label: t('control.tenants.suspend.kindBilling'), value: 'billing' },
  { label: t('control.tenants.suspend.kindAbuse'), value: 'abuse' },
])

function openSuspend(tenant: TenantDto) {
  suspendTarget.value = tenant
  suspendForm.kind = 'billing'
  suspendForm.reason = ''
  showSuspend.value = true
}

async function submitSuspend() {
  const tenant = suspendTarget.value
  if (!tenant) return
  suspendSaving.value = true
  try {
    await $fetch(`/api/control/tenants/${tenant.id}/suspension`, {
      method: 'POST',
      body: { suspension: suspendForm.kind, reason: suspendForm.reason },
    })
    toast.add({
      title: t('control.tenants.suspend.done'),
      // Die Wirkung tritt erst mit dem Resolver-Cache ein (≤30 s) — das gehört
      // in die Meldung, sonst lädt der Betreiber den Host neu und glaubt, es
      // habe nicht funktioniert.
      description: t('control.tenants.suspend.doneHint', { host: tenant.host }),
      color: 'success',
    })
    showSuspend.value = false
    await refresh()
  }
  catch (error) {
    toast.add({
      title: t('control.tenants.updateFailed'),
      description: (error as { statusMessage?: string })?.statusMessage || t('control.tenants.updateFailedHint'),
      color: 'error',
    })
  }
  finally {
    suspendSaving.value = false
  }
}

async function unsuspend(tenant: TenantDto) {
  try {
    const ok = await confirm({
      title: t('control.tenants.unsuspend.title'),
      description: t('control.tenants.unsuspend.text', { host: tenant.host }),
      confirmLabel: t('control.tenants.unsuspend.confirm'),
      action: () => $fetch(`/api/control/tenants/${tenant.id}/suspension`, {
        method: 'POST',
        body: { suspension: '' },
      }),
    })
    if (!ok) return
    toast.add({ title: t('control.tenants.unsuspend.done'), description: t('control.tenants.unsuspend.doneHint', { host: tenant.host }), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('control.tenants.updateFailed'), description: t('control.tenants.updateFailedHint'), color: 'error' })
  }
}

/**
 * EIGENE DOMAIN FREIGEBEN (control-040, SEC-022 — Davids Entscheidung vom
 * 2026-11-16: eine eigene Domain ist nur mit der Freigabe des Betreibers je
 * Community aktiv). Der Schalter springt sofort um und fällt bei einem Fehler
 * zurück. Wer die Freigabe einer AKTIVEN Domain entzieht, schaltet sie sofort
 * ab (ohne Frist) — das fragt die Seite vorher, mit demselben Dialog wie das
 * Löschen und das Entsperren.
 */
const { formatDate } = useFormatDate()

const DOMAIN_STATUS_COLORS: Record<CustomDomainStatus, 'success' | 'warning' | 'info' | 'error' | 'neutral'> = {
  none: 'neutral',
  pending_dns: 'info',
  pending_cert: 'info',
  pending_platform: 'info',
  active: 'success',
  error: 'error',
  paused: 'warning',
}

async function toggleDomainApproval(tenant: TenantDto, approved: boolean) {
  if (!approved && tenant.customDomainStatus === 'active') {
    const ok = await confirm({
      title: t('control.tenants.domain.revokeTitle'),
      description: t('control.tenants.domain.revokeText', { domain: tenant.customDomain, host: tenant.host }),
      confirmLabel: t('control.tenants.domain.revokeConfirm'),
      color: 'warning',
    })
    if (!ok) return
  }
  const previous = tenant.customDomainApproved
  tenant.customDomainApproved = approved
  try {
    const result = await $fetch<CustomDomainApprovalResponse>(`/api/control/tenants/${tenant.id}/custom-domain`, {
      method: 'POST',
      body: { approved },
    })
    Object.assign(tenant, {
      customDomainApproved: result.customDomainApproved,
      customDomainStatus: result.customDomainStatus,
      customDomainGraceEndsAt: result.customDomainGraceEndsAt,
      customDomainPausedAt: result.customDomainPausedAt,
    })
    toast.add({
      title: t(approved ? 'control.tenants.domain.approvedDone' : 'control.tenants.domain.revokedDone'),
      description: t(result.customDomainStatus === 'paused' && previous
        ? 'control.tenants.domain.pausedHint'
        : approved ? 'control.tenants.domain.approvedHint' : 'control.tenants.domain.revokedHint', { host: tenant.host }),
      color: 'success',
    })
  }
  catch {
    tenant.customDomainApproved = previous
    toast.add({ title: t('control.tenants.updateFailed'), description: t('control.tenants.updateFailedHint'), color: 'error' })
  }
}

// ── Editierbarer Quota-Katalog (tenant_plans, control-014) ────────────────────
// Zahlen wirken im Pool nach ≤ 90 s (Katalog-Cache 60 s + Host-Cache 30 s im
// platform-Resolver) — kein Deploy nötig. 0 = unbegrenzt.
interface PlanLimitsDto { key: string, limits: Record<string, { perDay?: number, total?: number }> }
/** Name eines Plans im Kasten: heutige und Alt-Pläne übersetzt, Unbekanntes roh (app/utils/planLabels.ts). */
function planLabel(key: string): string {
  const labelKey = planLabelKey(key)
  return labelKey ? t(labelKey) : key
}
const { data: plansData, refresh: refreshPlans } = await useFetch<{ plans: PlanLimitsDto[] }>('/api/control/plans', { lazy: true, server: false })
const planEdits = reactive<Record<string, { perDay: number, total: number }>>({})
watch(() => plansData.value?.plans, (plans) => {
  for (const plan of plans ?? []) {
    planEdits[plan.key] = {
      perDay: plan.limits.comments?.perDay ?? 0,
      total: plan.limits.comments?.total ?? 0,
    }
  }
}, { immediate: true })
const planSaving = ref<string | null>(null)

async function savePlanLimits(key: string) {
  const edit = planEdits[key]
  if (!edit) return
  planSaving.value = key
  try {
    await $fetch(`/api/control/plans/${key}`, {
      method: 'PATCH',
      body: { comments: { perDay: edit.perDay, total: edit.total } },
    })
    toast.add({ title: t('control.plans.saved'), color: 'success' })
    await refreshPlans()
  }
  catch {
    toast.add({ title: t('control.plans.saveFailed'), description: t('control.plans.saveFailedHint'), color: 'error' })
  }
  finally {
    planSaving.value = null
  }
}

// ── Fristen-Lauf der eigenen Domain (BE-014) ─────────────────────────────────
// Die Zahlen, nach denen das Scharfschalten entschieden wird. Die Route zählt
// IMMER nur (schreibt nie), egal was der Schalter sagt; geladen wird erst im
// Browser und nur hier, damit die Liste darüber nicht darauf wartet.
const { data: sweepData, status: sweepStatus, error: sweepError, refresh: refreshSweep } = await useFetch<CustomDomainSweepRouteResponse>('/api/control/sweeps/custom-domain', { lazy: true, server: false })
const SWEEP_MODE_COLORS: Record<CustomDomainSweepMode, 'neutral' | 'info' | 'warning'> = { 'off': 'neutral', 'dry-run': 'info', 'apply': 'warning' }
function sweepModeLabel(mode: CustomDomainSweepMode): string {
  return t(`control.domainSweep.mode.${mode === 'dry-run' ? 'dryRun' : mode}`)
}
const sweepRemindCount = computed(() => (sweepData.value?.items ?? []).filter(item => item.action === 'remind').length)
const sweepColumns = computed<TableColumn<CustomDomainSweepItem>[]>(() => [
  { accessorKey: 'host', header: () => t('control.domainSweep.col.community') },
  { accessorKey: 'domain', header: () => t('control.domainSweep.col.domain') },
  { accessorKey: 'action', header: () => t('control.domainSweep.col.action') },
  { accessorKey: 'graceEndsAt', header: () => t('control.domainSweep.col.graceEnds') },
])

const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }
const HIDE_LG = { td: 'hidden lg:table-cell', th: 'hidden lg:table-cell' }

const columns = computed<TableColumn<TenantDto>[]>(() => [
  { accessorKey: 'name', header: () => t('control.tenants.col.site') },
  { accessorKey: 'mode', header: () => t('control.tenants.col.mode'), meta: { class: HIDE_MD } },
  { id: 'tier', header: () => t('control.tenants.col.tier') },
  { id: 'registration', header: () => t('control.tenants.col.registration'), meta: { class: HIDE_LG } },
  { id: 'domain', header: () => t('control.tenants.col.domain'), meta: { class: HIDE_LG } },
  { accessorKey: 'status', header: () => t('control.tenants.col.status') },
  { id: 'actions', header: srOnlyHeader(() => t('ui.table.actions')) },
])

function rowActions(tenant: TenantDto): DropdownMenuItem[][] {
  return [
    [{
      label: tenant.status === 'active' ? t('control.tenants.disable') : t('control.tenants.enable'),
      icon: tenant.status === 'active' ? 'i-ph-pause' : 'i-ph-play',
      onSelect: () => { void toggleStatus(tenant) },
    }],
    // Sperren und Stilllegen stehen in EIGENEN Gruppen: das eine ist eine
    // Maßnahme gegen den Kunden, das andere der Löschweg. Sie zu mischen wäre
    // die Einladung, im Menü daneben zu greifen.
    [tenant.suspension
      ? { label: t('control.tenants.unsuspend.action'), icon: 'i-ph-lock-open', onSelect: () => { void unsuspend(tenant) } }
      : { label: t('control.tenants.suspend.action'), icon: 'i-ph-lock-simple', color: 'warning' as const, onSelect: () => { openSuspend(tenant) } }],
    [{ label: t('control.tenants.delete'), icon: 'i-ph-trash', color: 'error', onSelect: () => { void removeTenant(tenant) } }],
  ]
}
</script>

<template>
  <UDashboardPanel id="tenants">
    <template #header>
      <UDashboardNavbar :title="t('control.tenants.title')">
        <template #leading>
          <CoreSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-ph-plus" data-tenants-create :label="t('control.tenants.new')" @click="openCreate" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="mb-4 text-sm text-muted">{{ t('control.tenants.subtitle') }}</p>

      <UTable :data="tenants" :columns="columns" data-tenants-list>
        <template #name-cell="{ row }">
          <div class="min-w-0" :data-tenant="row.original.host">
            <p class="font-medium">{{ row.original.name || row.original.host }}</p>
            <p class="truncate font-mono text-xs text-muted">
              <a :href="`https://${row.original.host}`" target="_blank" rel="noopener" class="hover:underline">{{ row.original.host }}</a>
              · {{ row.original.projectId }}<template v-if="row.original.tenantId"> · {{ row.original.tenantId }}</template>
            </p>
          </div>
        </template>
        <template #mode-cell="{ row }">
          <UBadge :color="row.original.mode === 'pool' ? 'primary' : 'neutral'" variant="subtle" size="sm">{{ row.original.mode }}</UBadge>
        </template>
        <!-- Pool-Mandanten haben einen Plan, Silo-Mandanten eine Welle —
             dieselbe Spalte, weil es dieselbe Frage ist: „was bekommt der?" -->
        <template #tier-cell="{ row }">
          <USelect
            v-if="row.original.mode === 'pool'"
            :model-value="row.original.plan"
            :items="planItems"
            size="sm"
            class="w-36"
            :aria-label="t('control.tenants.planLabel')"
            @update:model-value="(plan) => changePlan(row.original, plan as TenantPlan)"
          />
          <USelect
            v-else
            :model-value="row.original.wave"
            :items="waveItems"
            size="sm"
            class="w-36"
            :aria-label="t('control.tenants.waveLabel')"
            @update:model-value="(wave) => changeWave(row.original, wave as TenantWave)"
          />
        </template>
        <template #registration-cell="{ row }">
          <USwitch
            :model-value="row.original.openRegistration"
            size="sm"
            :aria-label="t('control.tenants.openRegistration')"
            :data-tenant-open-registration="row.original.openRegistration"
            @update:model-value="(open: boolean) => toggleOpenRegistration(row.original, open)"
          />
        </template>
        <template #domain-cell="{ row }">
          <div class="space-y-1" :data-tenant-domain="row.original.customDomain || 'none'">
            <div v-if="row.original.customDomain" class="flex items-center gap-2">
              <span class="truncate font-mono text-xs">{{ row.original.customDomain }}</span>
              <UBadge :color="DOMAIN_STATUS_COLORS[row.original.customDomainStatus]" variant="subtle" size="sm" :data-tenant-domain-status="row.original.customDomainStatus">
                {{ t(`control.tenants.domain.status.${row.original.customDomainStatus}`) }}
              </UBadge>
            </div>
            <p v-else class="text-xs text-dimmed">
              {{ t('control.tenants.domain.none') }}
            </p>
            <USwitch
              v-if="row.original.mode === 'pool'"
              :model-value="row.original.customDomainApproved"
              size="sm"
              :label="t('control.tenants.domain.approved')"
              :data-tenant-domain-approved="row.original.customDomainApproved"
              @update:model-value="(approved: boolean) => toggleDomainApproval(row.original, approved)"
            />
            <p v-if="row.original.customDomainGraceEndsAt && row.original.customDomainStatus === 'active'" class="text-xs text-warning">
              {{ t('control.tenants.domain.graceUntil', { date: formatDate(row.original.customDomainGraceEndsAt) }) }}
            </p>
            <p v-if="row.original.customDomainPausedAt && row.original.customDomainStatus === 'paused'" class="text-xs text-dimmed">
              {{ t('control.tenants.domain.pausedSince', { date: formatDate(row.original.customDomainPausedAt) }) }}
            </p>
          </div>
        </template>
        <template #status-cell="{ row }">
          <div class="space-y-1">
            <UBadge
              v-if="row.original.suspension"
              color="error"
              variant="subtle"
              size="sm"
              :data-tenant-suspension="row.original.suspension"
              :title="row.original.suspensionReason"
            >
              {{ t(`control.tenants.suspend.badge.${row.original.suspension}`) }}
            </UBadge>
            <UBadge v-else :color="row.original.status === 'active' ? 'success' : 'neutral'" variant="subtle" size="sm">{{ row.original.status }}</UBadge>
            <!-- Läuft eine Frist? Dann macht diese Community demnächst von
                 selbst zu — das soll man sehen, bevor der Kunde anruft. -->
            <p v-if="row.original.pastDueSince && !row.original.suspension" class="text-xs text-warning" data-tenant-past-due>
              {{ t('control.tenants.suspend.pastDue') }}
            </p>
          </div>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
              <UButton
                icon="i-ph-dots-three-vertical"
                color="neutral"
                variant="ghost"
                size="xs"
                :aria-label="t('control.tenants.rowActions')"
              />
            </UDropdownMenu>
          </div>
        </template>

        <template #empty>
          <CoreEmptyState
            icon="i-ph-buildings"
            :title="t('control.tenants.emptyTitle')"
            :description="t('control.tenants.empty')"
            :action-label="t('control.tenants.new')"
            action-icon="i-ph-plus"
            data-tenants-empty
            @action="openCreate"
          />
        </template>
      </UTable>

      <!-- Editierbarer Quota-Katalog (tenant_plans): Zahlen wirken im Pool
           ohne Deploy (Resolver-Cache ≤ 90 s). 0 = unbegrenzt.
           BEWUSST KEINE UTable (B6): drei feste Pläne (plus die Alt-Zeilen
           free/business, app/utils/planLabels.ts) mit Eingabefeldern und
           eigenem Speichern-Knopf — ein Formular, keine Liste. Die Mandanten
           darüber sind die Datenliste dieser Seite und stehen als Tabelle. -->
      <section class="mt-8 rounded-lg border border-default p-4" data-plan-limits>
        <h2 class="font-semibold">{{ t('control.plans.title') }}</h2>
        <p class="mt-1 text-sm text-muted">{{ t('control.plans.subtitle') }}</p>
        <div class="mt-4 space-y-3">
          <div v-for="plan in plansData?.plans ?? []" :key="plan.key" class="flex flex-wrap items-end gap-3" :data-plan-row="plan.key">
            <UBadge :color="plan.key === 'pro' ? 'primary' : plan.key === 'personal' ? 'info' : 'neutral'" variant="subtle" class="mb-1.5 w-36 justify-center" data-plan-label>
              {{ planLabel(plan.key) }}
            </UBadge>
            <UFormField :label="t('control.plans.commentsPerDay')" size="sm">
              <UInput v-model.number="planEdits[plan.key]!.perDay" type="number" min="0" size="sm" class="w-32" />
            </UFormField>
            <UFormField :label="t('control.plans.commentsTotal')" size="sm">
              <UInput v-model.number="planEdits[plan.key]!.total" type="number" min="0" size="sm" class="w-32" />
            </UFormField>
            <UButton
              size="sm"
              variant="soft"
              :loading="planSaving === plan.key"
              :label="t('control.plans.save')"
              @click="() => savePlanLimits(plan.key)"
            />
          </div>
        </div>
        <p class="mt-3 text-xs text-dimmed">{{ t('control.plans.hint') }}</p>
      </section>

      <!-- Fristen-Lauf der eigenen Domain (BE-014): EINE kleine Karte mit
           den Zahlen des stündlichen Laufs. Die Route zählt nur — der Knopf
           „Neu zählen" kann nichts abschalten. -->
      <section class="mt-8 rounded-lg border border-default p-4" data-domain-sweep>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <h2 class="font-semibold">{{ t('control.domainSweep.title') }}</h2>
            <UBadge v-if="sweepData" :color="SWEEP_MODE_COLORS[sweepData.configuredMode]" variant="subtle" size="sm" :data-domain-sweep-mode="sweepData.configuredMode">
              {{ sweepModeLabel(sweepData.configuredMode) }}
            </UBadge>
          </div>
          <UButton
            size="sm"
            variant="soft"
            icon="i-ph-arrow-clockwise"
            :loading="sweepStatus === 'pending'"
            :label="t('control.domainSweep.recount')"
            data-domain-sweep-recount
            @click="() => refreshSweep()"
          />
        </div>
        <p class="mt-1 text-sm text-muted">{{ t('control.domainSweep.subtitle') }}</p>
        <p v-if="sweepError" class="mt-3 text-sm text-error">{{ t('control.domainSweep.loadFailed') }}</p>
        <template v-else-if="sweepData">
          <p class="mt-3 text-sm" data-domain-sweep-counts>
            {{ t('control.domainSweep.count.startGrace') }} {{ sweepData.counts.startGrace }}
            · {{ t('control.domainSweep.count.remind') }} {{ sweepRemindCount }}
            · {{ t('control.domainSweep.count.pause') }} {{ sweepData.counts.pause }}
            · {{ t('control.domainSweep.count.expireClaim') }} {{ sweepData.counts.expireClaim }}
            · {{ t('control.domainSweep.count.mails') }} {{ sweepData.mails.start + sweepData.mails.ending }}
          </p>
          <p class="mt-1 text-xs text-dimmed">
            {{ t('control.domainSweep.checked', { count: sweepData.checked }) }}<template v-if="sweepData.counts.failed"> · <span class="text-error">{{ t('control.domainSweep.failed', { count: sweepData.counts.failed }) }}</span></template>
          </p>
          <UTable v-if="sweepData.items.length" :data="sweepData.items" :columns="sweepColumns" class="mt-3" data-domain-sweep-items>
            <template #host-cell="{ row }">
              <span class="font-mono text-xs">{{ row.original.host }}</span>
            </template>
            <template #domain-cell="{ row }">
              <span class="font-mono text-xs">{{ row.original.domain }}</span>
            </template>
            <template #action-cell="{ row }">
              {{ t(`control.domainSweep.action.${row.original.action}`) }}
            </template>
            <template #graceEndsAt-cell="{ row }">
              {{ row.original.graceEndsAt ? formatDate(row.original.graceEndsAt) : '–' }}
            </template>
          </UTable>
          <p v-else class="mt-3 text-sm text-muted" data-domain-sweep-empty>{{ t('control.domainSweep.nothing') }}</p>
        </template>
      </section>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="showCreate" :title="t('control.tenants.new')">
    <template #body>
      <div class="space-y-3">
        <UFormField :label="t('control.tenants.name')" :help="t('control.tenants.nameHelp')">
          <UInput v-model="form.name" :placeholder="t('control.tenants.namePlaceholder')" class="w-full" autofocus />
        </UFormField>
        <UFormField :label="t('control.tenants.host')" :help="t('control.tenants.hostHelp')">
          <UInput v-model="form.host" placeholder="kunde-a.pukalani.app" class="w-full font-mono" @input="() => { hostTouched = true }" />
        </UFormField>

        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          :icon="showAdvanced ? 'i-ph-caret-up' : 'i-ph-caret-down'"
          :label="t('control.tenants.advanced')"
          @click="() => { showAdvanced = !showAdvanced }"
        />
        <div v-if="showAdvanced" class="space-y-3 rounded-md border border-default p-3">
          <UFormField :label="t('control.tenants.modeLabel')" :help="t('control.tenants.modeHelp')">
            <USelect v-model="form.mode" :items="modeItems" class="w-full" />
          </UFormField>
          <UFormField :label="t('control.tenants.project')" :help="t('control.tenants.projectHelp')">
            <UInput v-model="form.projectId" :placeholder="t('control.tenants.projectPlaceholder')" class="w-full font-mono" />
          </UFormField>
          <UFormField v-if="form.mode === 'silo'" :label="t('control.tenants.waveLabel')" :help="t('control.tenants.waveHelp')">
            <USelect v-model="form.wave" :items="waveItems" class="w-full" />
          </UFormField>
          <UFormField v-if="form.mode === 'pool'" :label="t('control.tenants.planLabel')" :help="t('control.tenants.planHelp')">
            <USelect v-model="form.plan" :items="planItems" class="w-full" />
          </UFormField>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :label="t('ui.cancel')" @click="() => { showCreate = false }" />
        <UButton
          :loading="saving"
          :disabled="!form.name || !form.host || (form.mode === 'silo' && !form.projectId)"
          data-tenants-save
          :label="t('control.tenants.create')"
          @click="createTenant"
        />
      </div>
    </template>
  </UModal>

  <UModal v-model:open="showSuspend" :title="t('control.tenants.suspend.action')">
    <template #body>
      <div class="space-y-3">
        <p class="text-sm text-muted">
          {{ t('control.tenants.suspend.intro', { host: suspendTarget?.host ?? '' }) }}
        </p>
        <UFormField :label="t('control.tenants.suspend.kindLabel')" :help="t('control.tenants.suspend.kindHelp')">
          <USelect v-model="suspendForm.kind" :items="suspendKindItems" class="w-full" data-suspend-kind />
        </UFormField>
        <UFormField :label="t('control.tenants.suspend.reasonLabel')" :help="t('control.tenants.suspend.reasonHelp')">
          <UTextarea v-model="suspendForm.reason" :rows="3" class="w-full" data-suspend-reason autofocus />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :label="t('ui.cancel')" @click="() => { showSuspend = false }" />
        <UButton
          color="error"
          :loading="suspendSaving"
          :disabled="suspendForm.reason.trim().length < 5"
          data-suspend-save
          :label="t('control.tenants.suspend.confirm')"
          @click="submitSuspend"
        />
      </div>
    </template>
  </UModal>
</template>
