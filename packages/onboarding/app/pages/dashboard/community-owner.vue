<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import {
  createOwnerSlotAssignSchema,
  createOwnerSlotCheckSchema,
  isOwnerSlotReason,
  type CommunityOwnerReassignResponse,
  type CommunityOwnerSlotView,
} from '../../../shared/communityOwnerSlot'

/**
 * VERWAISTER INHABER-PLATZ (LA2, Davids Entscheidung 2026-11-24) — die
 * Betreiber-Seite auf dem Kontroll-Host (account.pukalani.app).
 *
 * Löscht der einzige Owner einer Community sein Konto, bleibt sein Platz ohne
 * Person stehen, und „Besitz übertragen" kann niemand mehr. Hier gibt ein
 * Betreiber den Platz einem bestehenden Konto: erst prüfen (zeigt, ob es noch
 * einen lebenden Inhaber gibt), dann die Adresse nennen und bestätigen.
 *
 * KEINE UTable (B6-Ausnahme mit Grund): die Seite zeigt EINEN Datensatz — eine
 * Community und ihren Inhaber-Zustand — und ist ein Formular, keine Liste.
 *
 * Autorität bleibt der Server (`sites.manage`, frische Anmeldung, N7-Sperre
 * auf Mandanten-Hosts); `dashboardScope: 'operator'` hält die Seite zusätzlich
 * von jedem Mandanten-Host fern.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'sites.manage', dashboardScope: 'operator' })

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const { promptFreshSignIn } = useRecentAuthPrompt()

useBrandTitle(() => t('onboarding.ownerSlot.title'))

const checkSchema = computed(() => createOwnerSlotCheckSchema(t))
const assignSchema = computed(() => createOwnerSlotAssignSchema(t))

const checkState = reactive({ communityId: '' })
const assignState = reactive({ email: '' })

const checking = ref(false)
const status = ref<CommunityOwnerSlotView | null>(null)

/** Der fachliche Grund aus dem Fehler-Envelope (`data.reason`) als Satz. */
function errorMessage(error: unknown): { title: string, description?: string } {
  const reason = (error as { data?: { reason?: string } })?.data?.reason
  if (isOwnerSlotReason(reason)) return { title: t(`onboarding.ownerSlot.errors.${reason}`) }
  const code = (error as { statusCode?: number, status?: number })?.statusCode ?? (error as { status?: number })?.status
  if (code === 404) return { title: t('onboarding.ownerSlot.errors.notFound') }
  return { title: t('onboarding.ownerSlot.errors.failed'), description: t('onboarding.ownerSlot.errors.failedHint') }
}

async function check(event: FormSubmitEvent<{ communityId: string }>) {
  checking.value = true
  status.value = null
  try {
    status.value = await $fetch<CommunityOwnerSlotView>('/api/onboarding/operator/community-owner', {
      query: { communityId: event.data.communityId },
    })
  }
  catch (error) {
    toast.add({ ...errorMessage(error), color: 'error' })
  }
  finally {
    checking.value = false
  }
}

/** Der Zustand als ein Satz mit Farbe — vier Fälle, genau einer gilt. */
const state = computed(() => {
  const current = status.value
  if (!current) return null
  if (current.disabled) return { color: 'neutral' as const, title: t('onboarding.ownerSlot.stateDisabled'), text: t('onboarding.ownerSlot.stateDisabledText') }
  if (current.owners.length === 0) return { color: 'neutral' as const, title: t('onboarding.ownerSlot.stateNone'), text: t('onboarding.ownerSlot.stateNoneText') }
  if (current.orphaned) return { color: 'warning' as const, title: t('onboarding.ownerSlot.stateOrphaned'), text: t('onboarding.ownerSlot.stateOrphanedText') }
  return { color: 'success' as const, title: t('onboarding.ownerSlot.statePresent'), text: t('onboarding.ownerSlot.statePresentText') }
})

const canAssign = computed(() => Boolean(status.value?.orphaned && !status.value.disabled))

async function assign(event: FormSubmitEvent<{ email: string }>) {
  const current = status.value
  if (!current) return
  try {
    const ok = await confirm({
      title: t('onboarding.ownerSlot.confirmTitle', { name: current.communityName }),
      description: t('onboarding.ownerSlot.confirmText', { email: event.data.email }),
      confirmLabel: t('onboarding.ownerSlot.confirm'),
      color: 'warning',
      action: () => $fetch<CommunityOwnerReassignResponse>('/api/onboarding/operator/community-owner', {
          method: 'POST',
          body: { communityId: current.communityId, email: event.data.email },
        }),
    })
    if (!ok) return
    toast.add({ title: t('onboarding.ownerSlot.done', { name: current.communityName }), color: 'success' })
    assignState.email = ''
    status.value = null
  }
  catch (error) {
    if (await promptFreshSignIn(error, t('onboarding.ownerSlot.reauthText'))) return
    toast.add({ ...errorMessage(error), color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="community-owner">
    <template #header>
      <UDashboardNavbar :title="t('onboarding.ownerSlot.title')">
        <template #leading>
          <CoreSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full flex-col gap-6 lg:max-w-3xl">
        <p class="text-sm text-muted">
          {{ t('onboarding.ownerSlot.description') }}
        </p>

        <UPageCard :title="t('onboarding.ownerSlot.checkTitle')" variant="subtle">
          <UForm :schema="checkSchema" :state="checkState" class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit="check">
            <UFormField
              name="communityId"
              :label="t('onboarding.ownerSlot.communityIdLabel')"
              :help="t('onboarding.ownerSlot.communityIdHelp')"
              class="flex-1"
            >
              <UInput v-model="checkState.communityId" class="w-full" autocomplete="off" />
            </UFormField>
            <UButton type="submit" :loading="checking" icon="i-ph-magnifying-glass">
              {{ t('onboarding.ownerSlot.check') }}
            </UButton>
          </UForm>

          <UAlert
            v-if="status && state"
            class="mt-4"
            :color="state.color"
            variant="subtle"
            :title="`${status.communityName} · ${state.title}`"
            :description="`${state.text} ${t('onboarding.ownerSlot.ownerCount', { count: status.owners.length }, status.owners.length)}`"
          />
        </UPageCard>

        <UPageCard v-if="canAssign" :title="t('onboarding.ownerSlot.assignTitle')" variant="subtle">
          <UForm :schema="assignSchema" :state="assignState" class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit="assign">
            <UFormField
              name="email"
              :label="t('onboarding.ownerSlot.emailLabel')"
              :help="t('onboarding.ownerSlot.emailHelp')"
              class="flex-1"
            >
              <UInput v-model="assignState.email" type="email" class="w-full" autocomplete="off" />
            </UFormField>
            <UButton type="submit" color="warning" icon="i-ph-crown-simple">
              {{ t('onboarding.ownerSlot.assign') }}
            </UButton>
          </UForm>
        </UPageCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
