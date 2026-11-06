<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { communityRoleHasCapability } from '../../../../core/shared/communityAuthz'
import { trialNotice } from '../../../../control/shared/onboarding'
import type { MyCommunityView } from '../../../../control/shared/myCommunities'

/**
 * `/settings/billing` — die KONTO-Sicht aufs Geld (AH-3).
 *
 * WAS DAS IST: eine ÜBERSICHT, kein Zahlweg. Ein Community-Abo bleibt im
 * Community-Dashboard, weil die COMMUNITY zahlt und nicht das Konto (A6/M13,
 * Davids Entscheidung 2026-08-03) — der Knopf sitzt dort, wo der Owner
 * ohnehin eingeloggt ist, und diese Seite verlinkt genau dorthin. Deshalb
 * fasst sie kein Stripe an, braucht kein Secret und keine neue Service-Naht.
 *
 * WARUM ES SIE TROTZDEM GIBT: wer drei Communities besitzt, hat heute drei
 * Dashboards abzuklappern, um zu sehen, wo eine Testphase ausläuft. Die
 * Antwort auf „wo kostet mich was etwas" gehört ans Konto.
 *
 * GEFILTERT WIRD ÜBER DIE CAPABILITY, nicht über `role === 'owner'`. Das ist
 * dieselbe Regel, mit der das Control Plane die Zeile überhaupt erst füllt
 * (`projectMyCommunities` gibt `trialEndsAt` und `suspension` NUR an
 * `community.billing`) — würde hier eine zweite, gröbere Regel stehen, zeigte
 * die Tabelle Zeilen mit dauerhaft leeren Zellen und niemand wüsste, ob das
 * „keine Testphase" oder „darfst du nicht sehen" heißt.
 *
 * DIE DATEN SIND GETEILT, NICHT NEU: `useMyCommunities()` ist derselbe Abruf,
 * den `/communities` und `/profile/activity` benutzen.
 *
 * TESTPHASE ERST NACH DER HYDRATION — `trialNotice` rechnet gegen
 * `Date.now()`, und eine serverseitig gerenderte Tageszahl weicht von der im
 * Browser ab (dieselbe Lehre wie auf `/communities`).
 */
definePageMeta({ layout: 'onboarding', middleware: 'auth' })

const { t } = useI18n()

const { data, status } = useMyCommunities()

const owned = computed(() =>
  (data.value?.communities ?? []).filter(community => communityRoleHasCapability(community.role, 'community.billing')),
)

const now = ref<number | null>(null)
onMounted(() => { now.value = Date.now() })

function noticeFor(community: MyCommunityView) {
  return now.value === null ? null : trialNotice(community.trialEndsAt, now.value)
}

/** Der Plan-Reiter des Community-Dashboards — Ziel jeder Zeile. */
function planLink(community: MyCommunityView): string {
  return `https://${community.host}/dashboard/community/plan`
}

const columns: TableColumn<MyCommunityView>[] = [
  { accessorKey: 'name', header: () => t('onboarding.account.billing.columns.community') },
  { accessorKey: 'plan', header: () => t('onboarding.account.billing.columns.plan') },
  { id: 'state', header: () => t('onboarding.account.billing.columns.state') },
  { id: 'actions', header: srOnlyHeader(() => t('ui.table.actions')) },
]

useBrandTitle(() => t('onboarding.account.billing.title'))
</script>

<template>
  <div class="space-y-4" data-account-billing>
    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-ph-info"
      :description="t('onboarding.account.billing.note')"
    />

    <CoreEmptyState
      v-if="status !== 'pending' && !owned.length"
      icon="i-ph-receipt"
      :title="t('onboarding.account.billing.emptyTitle')"
      :description="t('onboarding.account.billing.emptyText')"
    />

    <UTable
      v-else
      :data="owned"
      :columns="columns"
      :loading="status === 'pending'"
      data-billing-table
    >
      <template #name-cell="{ row }">
        <div class="min-w-0">
          <p class="truncate font-medium text-default">{{ row.original.name }}</p>
          <p class="truncate text-xs text-muted">{{ row.original.host }}</p>
        </div>
      </template>

      <template #plan-cell="{ row }">
        <UBadge color="primary" variant="subtle" size="sm" :data-billing-plan="row.original.plan">
          {{ t(`onboarding.subscription.plans.${row.original.plan}.name`) }}
        </UBadge>
      </template>

      <!--
        DASS vor WARUM, wie auf der Community-Karte: `readOnly` trägt jede
        Zeile, der GRUND steht nur dort, wo ihn das Control Plane
        mitgeschickt hat. Die Sperre schlägt den Testphasen-Hinweis — wer
        gesperrt ist, hat keine Testphase mehr.
      -->
      <template #state-cell="{ row }">
        <span
          v-if="row.original.readOnly"
          class="flex items-center gap-1.5 text-sm text-error"
          data-billing-state="locked"
        >
          <UIcon name="i-ph-lock-simple" class="size-4 shrink-0" />
          {{ row.original.suspension === 'billing'
            ? t('onboarding.communities.suspendedBilling')
            : row.original.suspension === 'abuse'
              ? t('onboarding.communities.suspendedAbuse')
              : t('onboarding.communities.readOnly') }}
        </span>
        <span
          v-else-if="noticeFor(row.original)"
          class="flex items-center gap-1.5 text-sm"
          :class="noticeFor(row.original)?.kind === 'ending' ? 'text-warning' : 'text-muted'"
          data-billing-state="trial"
        >
          <UIcon
            :name="noticeFor(row.original)?.kind === 'ending' ? 'i-ph-hourglass-medium' : 'i-ph-info'"
            class="size-4 shrink-0"
          />
          {{ noticeFor(row.original)?.kind === 'ending'
            ? t('onboarding.communities.trialEnding', noticeFor(row.original)!.daysLeft)
            : t('onboarding.communities.trialEnded') }}
        </span>
        <span v-else class="flex items-center gap-1.5 text-sm text-muted" data-billing-state="active">
          <UIcon name="i-ph-check-circle" class="size-4 shrink-0" />
          {{ t('onboarding.account.billing.stateActive') }}
        </span>
      </template>

      <template #actions-cell="{ row }">
        <UButton
          :to="planLink(row.original)"
          external
          size="sm"
          color="neutral"
          variant="subtle"
          icon="i-ph-arrow-square-out"
          data-billing-plan-link
        >
          {{ t('onboarding.account.billing.manage') }}
        </UButton>
      </template>
    </UTable>
  </div>
</template>
