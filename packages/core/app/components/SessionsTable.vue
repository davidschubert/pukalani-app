<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { SessionRow } from '../../shared/types/session'
import { formatSessionLocation } from '../../shared/sessionLocation'

const props = defineProps<{ sessions: SessionRow[] }>()

const { t, locale } = useI18n()
const slots = useSlots()

// Icons aus utils/clientInfo, Beschriftungen aus utils/sessionInfo (Auto-Import) —
// beide teilt sich diese Tabelle mit dem Detail-Dialog.
function dateTime(iso: string): string {
  return sessionDateTime(iso, locale.value)
}

/**
 * EIN Dialog für alle Zeilen: geöffnet wird er mit der angeklickten Sitzung,
 * beim Schließen bleibt die Auswahl stehen. Ein Exemplar je Zeile wäre bei 20
 * Sitzungen 20-mal dieselbe Karte im Baum.
 */
const detailsSession = ref<SessionRow | null>(null)
const detailsOpen = ref(false)

function showDetails(session: SessionRow): void {
  detailsSession.value = session
  detailsOpen.value = true
}

/**
 * Attributions-PFLICHT (CC BY 4.0): DB-IP verlangt die Nennung, sobald wir
 * seine Daten ZEIGEN. Deshalb hängt der Hinweis nicht an der Konfiguration,
 * sondern am Ergebnis — steht in keiner Zeile eine Stadt oder Region, stammt
 * auf dieser Seite nichts von DB-IP und ein Hinweis wäre irreführend.
 */
const showsGeoData = computed(() => props.sessions.some(s => s.city || s.region))

// Kompakt (4 Spalten): Standort+IP sowie die drei Zeitpunkte teilen sich je
// EINE Spalte — sechs Einzelspalten sprengen die 2/3-Karte der Detailseite.
const columns = computed<TableColumn<SessionRow>[]>(() => [
  { accessorKey: 'client', header: () => t('account.sessions.client') },
  { accessorKey: 'auth', header: () => t('account.sessions.auth') },
  { accessorKey: 'location', header: () => t('account.sessions.location') },
  { accessorKey: 'times', header: () => t('account.sessions.times') },
  ...(slots.actions ? [{ id: 'actions', header: srOnlyHeader(() => t('ui.table.actions')) }] : []),
])
</script>

<template>
  <div>
    <UTable :data="sessions" :columns="columns">
      <template #client-cell="{ row }">
        <div class="flex min-w-0 flex-col gap-1">
          <div class="flex flex-wrap items-center gap-1.5">
            <UIcon :name="browserIcon(row.original.clientName)" class="size-4 shrink-0 text-muted" />
            <span class="font-medium">{{ browserLabel(row.original) || t('account.sessions.unknown') }}</span>
            <UBadge v-if="row.original.current" color="success" variant="subtle" size="sm">{{ t('account.sessions.current') }}</UBadge>
          </div>
          <div v-if="engineLabel(row.original)" class="flex items-center gap-1.5 text-xs text-dimmed">
            <UIcon name="i-ph-engine" class="size-3.5 shrink-0" />
            <span class="truncate">{{ engineLabel(row.original) }}</span>
          </div>
          <div v-if="osLabel(row.original)" class="flex items-center gap-1.5 text-xs text-muted">
            <UIcon :name="osIcon(row.original.osName)" class="size-3.5 shrink-0" />
            <span class="truncate">{{ osLabel(row.original) }}</span>
          </div>
          <div v-if="deviceLabel(row.original)" class="flex items-center gap-1.5 text-xs text-muted">
            <UIcon :name="deviceIcon(row.original.deviceName)" class="size-3.5 shrink-0" />
            <span class="truncate">{{ deviceLabel(row.original) }}</span>
          </div>
        </div>
      </template>
      <template #auth-cell="{ row }">
        <div class="flex flex-col gap-1">
          <UBadge color="neutral" variant="subtle" size="sm" class="w-fit">
            <UIcon :name="row.original.provider === 'email' ? 'i-ph-envelope-simple' : 'i-ph-plugs-connected'" class="size-3.5" />
            {{ row.original.provider || '—' }}
          </UBadge>
          <UBadge v-if="row.original.factors.length" color="info" variant="subtle" size="sm" class="w-fit" :title="t('account.sessions.factors')">
            <UIcon name="i-ph-shield-check" class="size-3.5" />
            {{ row.original.factors.join(', ') }}
          </UBadge>
        </div>
      </template>
      <template #location-cell="{ row }">
        <div class="flex min-w-0 flex-col gap-1">
          <div class="flex items-center gap-1.5">
            <UIcon :name="flagIcon(row.original.countryCode)" class="size-4 shrink-0" />
            <span class="truncate" :class="formatSessionLocation(row.original) ? '' : 'text-muted'">{{ formatSessionLocation(row.original) || t('account.sessions.unknown') }}</span>
          </div>
          <span class="truncate font-mono text-xs text-muted">{{ row.original.ip || '—' }}</span>
          <UButton
            color="neutral"
            variant="link"
            size="xs"
            class="w-fit p-0"
            @click="showDetails(row.original)"
          >
            {{ t('account.sessions.details') }}
          </UButton>
        </div>
      </template>
      <template #times-cell="{ row }">
        <div class="flex flex-col gap-0.5 text-xs">
          <span class="flex items-center gap-1 whitespace-nowrap text-muted" :title="t('account.sessions.created')">
            <UIcon name="i-ph-plus-circle" class="size-3.5 shrink-0" />{{ dateTime(row.original.$createdAt) }}
          </span>
          <span class="flex items-center gap-1 whitespace-nowrap text-muted" :title="t('account.sessions.updated')">
            <UIcon name="i-ph-clock" class="size-3.5 shrink-0" />{{ dateTime(row.original.$updatedAt) }}
          </span>
          <span v-if="row.original.expire" class="flex items-center gap-1 whitespace-nowrap text-dimmed" :title="t('account.sessions.expires')">
            <UIcon name="i-ph-hourglass" class="size-3.5 shrink-0" />{{ dateTime(row.original.expire) }}
          </span>
        </div>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end">
          <slot name="actions" :session="row.original" />
        </div>
      </template>
    </UTable>
    <!-- Attribution (CC BY 4.0) — nur wenn wirklich DB-IP-Daten zu sehen sind -->
    <i18n-t
      v-if="showsGeoData"
      keypath="account.sessions.geoAttribution"
      tag="p"
      scope="global"
      class="mt-2 text-xs text-dimmed"
    >
      <template #provider>
        <ULink to="https://db-ip.com" target="_blank" rel="noopener" class="underline">DB-IP</ULink>
      </template>
    </i18n-t>
    <SessionDetailsModal v-model:open="detailsOpen" :session="detailsSession" />
  </div>
</template>
