<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { InsightsChannel, InsightsChannelPreview } from '../../../../shared/insightsChannel'
import type { InsightsTopicKey } from '../../../../shared/insightsPost'
import { INSIGHTS_CHANNEL_NOTE_MAX } from '../../../../shared/insightsChannel'
import { INSIGHTS_TOPICS } from '../../../../shared/insightsPost'
import type {
  InsightsChannelCreatedResponse,
  InsightsChannelDeletedResponse,
  InsightsChannelPreviewResponse,
  InsightsChannelUpdatedResponse,
  InsightsChannelsListResponse,
  InsightsChannelsSeededResponse,
} from '../../../../shared/types/insightsApi'
import { insightsDay, insightsNumber } from '../../../utils/insightsFormat'

/**
 * DIE KANALLISTE DES THEMENRADARS (BI2 K3, Adresse
 * `/dashboard/insights/channels`).
 *
 * ── WOFÜR ES DIESE SEITE GIBT ───────────────────────────────────────────
 * Bis BI2 stand die Liste im Code, und jede Änderung war ein Deploy. Der
 * Betrieb hat gezeigt, dass das nicht trägt: an zwei Tagen drei Änderungen,
 * und einer der Kanäle war nie der, für den wir ihn hielten. Hier pflegt der
 * Betreiber sie selbst — mit der Prüfung VOR dem Speichern, die genau diesen
 * Irrtum verhindert hätte.
 *
 * ── DIE VORSCHAU IST KEIN BEIWERK, SIE IST DER ZWECK ────────────────────
 * Der Ablauf ist absichtlich zweistufig: erst „Prüfen", dann „Aufnehmen".
 * Dazwischen stehen Titel, Abonnentenzahl und der jüngste Upload — die drei
 * Angaben, an denen `@PentagramDesign` im September aufgefallen wäre
 * (echte Id, Privatkonto, ein Video von 2012). Ein einstufiges Formular
 * wäre schneller und hätte genau diesen Fehler wieder zugelassen.
 *
 * ── AUSSCHALTEN STEHT VOR ENTFERNEN ─────────────────────────────────────
 * Der Zeilen-Knopf schaltet um; „Entfernen" liegt im Menü dahinter und fragt
 * nach. Ein Kanal, der nichts mehr liefert, soll mit seiner Notiz stehen
 * bleiben — sonst nimmt ihn in einem halben Jahr jemand erneut auf.
 *
 * ── `UTable` IST DER STANDARD (Davids B6-Regel), LEER ÜBER `CoreEmptyState` ─
 */
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'admin'],
  requiredCapability: 'insights.manage',
  // Betreiber-Sache, wie Liste, Editor und Radar daneben.
  dashboardScope: 'operator',
})

const { t, locale } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
useBrandTitle(() => t('insights.channels.title'))

const readerLocale = computed(() => (locale.value === 'de' ? 'de' : 'en') as 'de' | 'en')

// ── Laden ──────────────────────────────────────────────────────────────────

const { data, refresh, status } = await useFetch<InsightsChannelsListResponse>('/api/insights/channels', {
  lazy: true,
  server: false,
})

/**
 * MOUNT-GATE. `useFetch` mit `server: false` liefert auf dem Server `null`,
 * und ein `status` im Markup wäre damit ein Hydration-Mismatch (die Falle aus
 * den I2-Resten, hier wörtlich dieselbe).
 */
const hydrated = ref(false)
onMounted(() => {
  hydrated.value = true
})

const channels = computed<InsightsChannel[]>(() => data.value?.channels ?? [])
const activeCount = computed(() => channels.value.filter(channel => channel.active).length)
const seedAvailable = computed(() => data.value?.seedAvailable ?? 0)
const configured = computed(() => data.value?.configured === true)
const loading = computed(() => hydrated.value && status.value === 'pending')

// ── Die Themen-Auswahl ─────────────────────────────────────────────────────

/* Der Katalog, nicht die Daten: wer einen Kanal anlegt, soll JEDES Cluster
 * wählen können — auch eines, das noch keinen Kanal hat. Das ist der
 * Unterschied zum Filter im Radar, der nur anbietet, was vorkommt. */
const topicItems = INSIGHTS_TOPICS.map(topic => ({ label: topic.label, value: topic.key }))

// ── Die Saat übernehmen ────────────────────────────────────────────────────

const seeding = ref(false)

async function takeSeed(): Promise<void> {
  seeding.value = true
  try {
    const result = await $fetch<InsightsChannelsSeededResponse>('/api/insights/channels/seed', { method: 'POST' })
    toast.add({
      title: result.seeded > 0
        ? t('insights.channels.seedDone', { count: result.seeded })
        : t('insights.channels.seedSkipped'),
      color: result.seeded > 0 ? 'success' : 'warning',
    })
    await refresh()
  }
  catch (error) {
    toast.add({ title: errorText(error), color: 'error' })
  }
  finally {
    seeding.value = false
  }
}

// ── Anlegen: prüfen, dann aufnehmen ────────────────────────────────────────

const addOpen = ref(false)
const addInput = ref('')
const addTopic = ref<InsightsTopicKey>(INSIGHTS_TOPICS[0]!.key)
const addNote = ref('')
const preview = ref<InsightsChannelPreview | null>(null)
const checking = ref(false)
const saving = ref(false)

function openAdd(): void {
  addInput.value = ''
  addTopic.value = INSIGHTS_TOPICS[0]!.key
  addNote.value = ''
  preview.value = null
  addOpen.value = true
}

/* Jede Änderung an der Eingabe verwirft die Vorschau. Ohne das könnte jemand
 * einen Kanal prüfen, das Feld ändern und den GEPRÜFTEN aufnehmen — oder,
 * schlimmer, umgekehrt denken, er nehme den neuen auf. */
watch(addInput, () => {
  preview.value = null
})

async function check(): Promise<void> {
  if (!addInput.value.trim()) return
  checking.value = true
  try {
    const result = await $fetch<InsightsChannelPreviewResponse>('/api/insights/channels/resolve', {
      method: 'POST',
      body: { input: addInput.value.trim() },
    })
    preview.value = result.preview
  }
  catch (error) {
    preview.value = null
    toast.add({ title: errorText(error), color: 'error' })
  }
  finally {
    checking.value = false
  }
}

async function confirmAdd(): Promise<void> {
  if (!preview.value) return
  saving.value = true
  try {
    await $fetch<InsightsChannelCreatedResponse>('/api/insights/channels', {
      method: 'POST',
      body: { channelId: preview.value.channelId, topic: addTopic.value, note: addNote.value.trim() },
    })
    toast.add({ title: t('insights.channels.saved'), color: 'success' })
    addOpen.value = false
    await refresh()
  }
  catch (error) {
    toast.add({ title: errorText(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

// ── Ändern und entfernen ───────────────────────────────────────────────────

/** Welche Zeile gerade schreibt — damit nur IHR Knopf lädt, nicht alle. */
const busyId = ref('')

async function patch(channel: InsightsChannel, body: Record<string, unknown>): Promise<void> {
  busyId.value = channel.channelId
  try {
    await $fetch<InsightsChannelUpdatedResponse>(`/api/insights/channels/${channel.channelId}`, {
      method: 'PATCH',
      body,
    })
    await refresh()
  }
  catch (error) {
    toast.add({ title: errorText(error), color: 'error' })
  }
  finally {
    busyId.value = ''
  }
}

async function remove(channel: InsightsChannel): Promise<void> {
  // Entfernen ist der seltene, nicht umkehrbare Weg; ein eigener Dialog für
  // eine Rückfrage, die in einem Satz passt, wäre mehr Oberfläche als Gewinn.
  if (!confirm(t('insights.channels.removeConfirm'))) return
  busyId.value = channel.channelId
  try {
    await $fetch<InsightsChannelDeletedResponse>(`/api/insights/channels/${channel.channelId}`, { method: 'DELETE' })
    toast.add({ title: t('insights.channels.removed'), color: 'success' })
    await refresh()
  }
  catch (error) {
    toast.add({ title: errorText(error), color: 'error' })
  }
  finally {
    busyId.value = ''
  }
}

/** Der Ablehnungsgrund aus dem Envelope — sonst ein Satz. */
function errorText(error: unknown): string {
  const reason = (error as { data?: { reason?: string } } | null)?.data?.reason
  const key = `insights.channels.error.${reason ?? 'generic'}`
  const text = t(key)
  return text === key ? t('insights.channels.error.generic') : text
}

// ── Die Tabelle ────────────────────────────────────────────────────────────

const columns = computed<TableColumn<InsightsChannel>[]>(() => [
  { accessorKey: 'title', header: () => t('insights.channels.channel') },
  { accessorKey: 'topic', header: () => t('insights.channels.topic') },
  { id: 'lastUpload', header: () => t('insights.channels.lastUpload') },
  { accessorKey: 'subscribers', header: () => t('insights.channels.subscribers') },
  { accessorKey: 'note', header: () => t('insights.channels.note') },
  { id: 'state', header: () => t('insights.channels.state') },
  { id: 'actions', header: () => t('insights.channels.state') },
])

function youtubeUrl(channel: InsightsChannel): string {
  return channel.handle
    ? `https://www.youtube.com/@${channel.handle}`
    : `https://www.youtube.com/channel/${channel.channelId}`
}
</script>

<template>
  <UDashboardPanel id="insights-channels">
    <template #header>
      <UDashboardNavbar :title="t('insights.channels.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            :label="t('insights.channels.add')" icon="i-ph-plus"
            :disabled="!configured"
            @click="openAdd"
          />
          <UButton
            :label="t('insights.radar.title')" icon="i-ph-broadcast"
            color="neutral" variant="ghost"
            :to="localePath('/dashboard/insights/radar')"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="text-sm leading-relaxed" style="color: var(--ui-text-muted)">{{ t('insights.channels.lead') }}</p>

      <UAlert
        v-if="hydrated && !configured"
        class="mt-4 shrink-0"
        icon="i-ph-key" color="warning" variant="subtle"
        :description="t('insights.channels.keyMissing')"
      />

      <!--
        `shrink-0` wie auf der Radar-Seite: der Body ist eine Flex-SPALTE, und
        eine UCard mit `overflow-hidden` schrumpft dort auf null, sobald die
        Tabelle darunter überläuft (Klick-Beweis 2026-09-09, ohne jeden Fehler
        in Konsole, Lint oder Typecheck).
      -->
      <UCard v-if="hydrated && seedAvailable > 0" class="mt-4 shrink-0">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <p class="text-sm leading-relaxed">{{ t('insights.channels.emptySeed') }}</p>
          <UButton
            :label="t('insights.channels.seed')" icon="i-ph-download-simple"
            :loading="seeding"
            @click="takeSeed"
          />
        </div>
      </UCard>

      <div v-if="channels.length > 0" class="mt-6 flex items-baseline gap-3">
        <p class="text-sm font-medium">{{ t('insights.channels.count', channels.length) }}</p>
        <p class="text-sm" style="color: var(--ui-text-dimmed)">
          {{ t('insights.channels.countActive', { active: activeCount, total: channels.length }) }}
        </p>
      </div>

      <CoreEmptyState
        v-if="hydrated && !loading && channels.length === 0 && seedAvailable === 0"
        class="mt-6" icon="i-ph-broadcast"
        :title="t('insights.channels.title')" :description="t('insights.channels.empty')"
      />

      <div v-else-if="channels.length > 0" class="mt-4 overflow-x-auto">
        <UTable :data="channels" :columns="columns" :loading="loading">
          <template #title-cell="{ row }">
            <div class="flex flex-col">
              <span class="text-sm font-medium">{{ row.original.title || row.original.channelId }}</span>
              <ULink
                :to="youtubeUrl(row.original)" target="_blank" rel="noopener"
                class="text-xs" style="color: var(--ui-text-dimmed)"
              >
                {{ row.original.handle ? `@${row.original.handle}` : t('insights.channels.openOnYoutube') }}
              </ULink>
            </div>
          </template>

          <template #topic-cell="{ row }">
            <USelectMenu
              :model-value="row.original.topic"
              :items="topicItems"
              value-key="value"
              size="xs"
              class="w-44"
              :disabled="busyId === row.original.channelId"
              @update:model-value="value => patch(row.original, { topic: value })"
            />
          </template>

          <template #lastUpload-cell="{ row }">
            <span class="text-sm tabular-nums" style="color: var(--ui-text-muted)">
              <template v-if="row.original.lastUploadAt">{{ insightsDay(row.original.lastUploadAt, readerLocale) }}</template>
              <template v-else>{{ t('insights.channels.checkedNever') }}</template>
            </span>
          </template>

          <template #subscribers-cell="{ row }">
            <span class="text-sm tabular-nums">{{ insightsNumber(row.original.subscribers, readerLocale) }}</span>
          </template>

          <template #note-cell="{ row }">
            <UTextarea
              :model-value="row.original.note"
              :rows="2"
              :maxlength="INSIGHTS_CHANNEL_NOTE_MAX"
              :placeholder="t('insights.channels.notePlaceholder')"
              size="xs"
              class="w-72"
              :disabled="busyId === row.original.channelId"
              @blur="(event: FocusEvent) => {
                const value = (event.target as HTMLTextAreaElement).value.trim()
                if (value !== row.original.note) patch(row.original, { note: value })
              }"
            />
          </template>

          <template #state-cell="{ row }">
            <UBadge :color="row.original.active ? 'success' : 'neutral'" variant="subtle">
              {{ row.original.active ? t('insights.channels.activeOn') : t('insights.channels.activeOff') }}
            </UBadge>
          </template>

          <template #actions-cell="{ row }">
            <div class="flex items-center gap-1">
              <UButton
                :label="row.original.active ? t('insights.channels.turnOff') : t('insights.channels.turnOn')"
                :icon="row.original.active ? 'i-ph-pause' : 'i-ph-play'"
                color="neutral" variant="ghost" size="xs"
                :loading="busyId === row.original.channelId"
                @click="patch(row.original, { active: !row.original.active })"
              />
              <UButton
                :label="t('insights.channels.remove')" icon="i-ph-trash"
                color="error" variant="ghost" size="xs"
                :disabled="busyId === row.original.channelId"
                @click="remove(row.original)"
              />
            </div>
          </template>
        </UTable>
      </div>

      <!-- Prüfen, dann aufnehmen — die zwei Schritte sind Absicht (s. Kopf). -->
      <UModal v-model:open="addOpen" :title="t('insights.channels.addTitle')">
        <template #body>
          <p class="text-sm leading-relaxed" style="color: var(--ui-text-muted)">{{ t('insights.channels.addHint') }}</p>

          <UFormField class="mt-4" :label="t('insights.channels.inputLabel')" name="channelInput">
            <div class="flex gap-2">
              <UInput
                v-model="addInput"
                :placeholder="t('insights.channels.inputPlaceholder')"
                class="flex-1"
                @keydown.enter.prevent="check"
              />
              <UButton
                :label="checking ? t('insights.channels.checking') : t('insights.channels.check')"
                :loading="checking"
                :disabled="!addInput.trim()"
                color="neutral"
                @click="check"
              />
            </div>
          </UFormField>

          <div v-if="preview" class="mt-6">
            <h3 class="text-sm font-medium">{{ t('insights.channels.previewTitle') }}</h3>
            <p class="mt-1 text-xs leading-relaxed" style="color: var(--ui-text-dimmed)">
              {{ t('insights.channels.previewHint') }}
            </p>

            <UCard class="mt-3">
              <dl class="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                <div class="flex items-baseline gap-2">
                  <dt style="color: var(--ui-text-muted)">{{ t('insights.channels.channel') }}</dt>
                  <dd class="font-medium">{{ preview.title }}</dd>
                </div>
                <div class="flex items-baseline gap-2">
                  <dt style="color: var(--ui-text-muted)">{{ t('insights.channels.previewSubscribers') }}</dt>
                  <dd class="tabular-nums">{{ insightsNumber(preview.subscribers, readerLocale) }}</dd>
                </div>
                <div class="flex items-baseline gap-2">
                  <dt style="color: var(--ui-text-muted)">{{ t('insights.channels.previewLastUpload') }}</dt>
                  <dd class="tabular-nums">
                    <template v-if="preview.lastUploadAt">{{ insightsDay(preview.lastUploadAt, readerLocale) }}</template>
                    <template v-else>{{ t('insights.channels.previewUnknown') }}</template>
                  </dd>
                </div>
                <div class="flex items-baseline gap-2">
                  <dt style="color: var(--ui-text-muted)">YouTube</dt>
                  <dd>
                    <ULink
                      :to="preview.handle ? `https://www.youtube.com/@${preview.handle}` : `https://www.youtube.com/channel/${preview.channelId}`"
                      target="_blank" rel="noopener"
                    >
                      {{ preview.handle ? `@${preview.handle}` : t('insights.channels.openOnYoutube') }}
                    </ULink>
                  </dd>
                </div>
              </dl>
            </UCard>

            <UAlert
              v-if="preview.known"
              class="mt-3" color="warning" variant="subtle"
              icon="i-ph-info"
              :description="t('insights.channels.previewKnown')"
            />

            <UFormField class="mt-4" :label="t('insights.channels.topic')" name="channelTopic">
              <USelectMenu v-model="addTopic" :items="topicItems" value-key="value" class="w-full" />
            </UFormField>

            <UFormField class="mt-4" :label="t('insights.channels.note')" name="channelNote">
              <UTextarea
                v-model="addNote"
                :rows="2"
                :maxlength="INSIGHTS_CHANNEL_NOTE_MAX"
                :placeholder="t('insights.channels.notePlaceholder')"
                class="w-full"
              />
            </UFormField>
          </div>
        </template>

        <template #footer>
          <UButton
            :label="t('insights.channels.confirm')" icon="i-ph-check"
            :loading="saving"
            :disabled="!preview || preview.known"
            @click="confirmAdd"
          />
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
