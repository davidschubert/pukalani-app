<script setup lang="ts">
import { BRAND_DESIGN_DRAFTS_DAILY_LIMIT, brandAiRejectionMessageKey } from '../../shared/brandAiLimits'
import {
  BRAND_MARK_DRAFTS_MAX,
  BRAND_MARK_DRAFTS_PER_RUN,
  type BrandMarkDraftEntry,
} from '../../shared/brandMarkDrafts'
import type {
  BrandMarkDraftWriteResponse,
  BrandMarkDraftsRunResponse,
} from '../../shared/types/brand'

/**
 * STUFE 3 DES ZEICHENS: DIE KI-ENTWÜRFE (`j.drafts`, Konzept
 * docs/archiv/BRAND-DESIGN.md §2.5 Stufe 3, Davids Entscheidung §1.11 b,
 * Paket D5c) — gebaut nach dem freigegebenen Prototyp
 * (`.playground/app/pages/brand/demo/design/mark.vue`, Stufe 3).
 *
 * ── DREI SÄTZE STEHEN IMMER DA, NICHT NUR IM FEHLERFALL ──────────────────
 * Der Vermerk „Entwurf, kein geprüftes Logo" AN JEDER KARTE, der
 * Markenrechts-Hinweis unter dem Block, und die Zusage, dass Entwürfe privat
 * bleiben. Das ist die Leitplanke aus §1.11 b, und sie ist nur eine, solange
 * sie SICHTBAR ist: in einer Hilfeseite wäre sie eine Fussnote zu einem Bild,
 * das aussieht wie ein fertiges Logo.
 *
 * ── DIE HERKUNFT GEHÖRT AUF DIE KARTE ────────────────────────────────────
 * Modell, Datum und Prompt-Hash unter jedem Entwurf. Vier Karten mit demselben
 * Hash stammen aus demselben Lauf — genau diese Auskunft soll die Zeile geben,
 * und sie ist der Grund, warum die zwei Felder in der ZEILE stehen und nicht
 * nur im Ereignis-Funnel (Kopf von Migration brand-023).
 *
 * ── DAS BILD KOMMT AUS DER EIGENEN ROUTE ──────────────────────────────────
 * `…/mark/drafts/:id/image` — es gibt keine Bucket-Adresse, die ein Browser
 * aufrufen könnte (§2.13). `?v=` ist reiner Cache-Brecher; die Route antwortet
 * `private, no-store`.
 *
 * ── OHNE BILD-MODELL BLEIBT ES RUHIG ─────────────────────────────────────
 * 503 `image_unavailable` ist die vollständige, richtige Antwort einer Instanz
 * ohne Bild-Modell — das Kapitel läuft mit Stufe 1 und 2 vollständig weiter
 * (§2.19 Frage 1). Der Abschnitt sagt dann EINEN Satz und verschwindet nicht:
 * eine Fläche, die je nach Konfiguration da ist oder nicht, ist für den
 * Betreiber nicht nachvollziehbar.
 */
const props = defineProps<{
  profileId: string
  /** Sperrt jede Handlung — solange das Kapitel abgeschlossen ist etwa. */
  disabled?: boolean
}>()

const { t, locale } = useI18n()

const drafts = useBrandMarkDrafts(props.profileId)
const { items, kept, full } = drafts

const loading = ref(!drafts.loaded.value)
const running = ref(false)
const busyId = ref('')
const errorKey = ref('')
/** `null` = noch kein Lauf in dieser Sitzung; die Zeile steht dann allgemein. */
const remaining = ref<number | null>(null)
/** Der Modell-Name des letzten Laufs — nur für die Lauf-Zeile unter dem Knopf. */
const lastModel = ref('')

const canAct = computed(() => !props.disabled && !running.value && !busyId.value)

interface FetchErrorLike {
  status?: number
  statusCode?: number
  response?: { status?: number }
  data?: { reason?: string }
}

/**
 * Der fachliche Grund reist als `data.code` und kommt als `error.data.reason`
 * an (CLAUDE.md). Die DROSSEL-Codes haben ihre eigene Abbildung — sie sagt
 * „heute genug" statt „ging nicht".
 */
function messageKey(error: unknown): string {
  const value = error as FetchErrorLike | null
  const status = value?.status ?? value?.statusCode ?? value?.response?.status ?? 0
  const reason = typeof value?.data?.reason === 'string' ? value.data.reason : ''
  const throttled = brandAiRejectionMessageKey(reason)
  if (throttled) return throttled
  if (reason === 'image_unavailable' || status === 503) return 'brand.mark.drafts.error.unavailable'
  if (reason === 'drafts_no_brief') return 'brand.mark.drafts.error.noBrief'
  if (reason === 'drafts_limit_reached') return 'brand.mark.drafts.error.limitReached'
  if (reason === 'drafts_failed' || status === 502) return 'brand.mark.drafts.error.failed'
  if (status === 429) return 'brand.mark.drafts.error.rateLimited'
  if (status === 404) return 'brand.mark.drafts.error.notFound'
  return 'brand.mark.drafts.error.generic'
}

async function load(): Promise<void> {
  loading.value = true
  try {
    await drafts.load()
    errorKey.value = ''
  }
  catch (error) {
    errorKey.value = messageKey(error)
  }
  finally {
    loading.value = false
  }
}

onMounted(load)

async function run(): Promise<void> {
  if (!canAct.value || full.value) return
  running.value = true
  errorKey.value = ''
  try {
    const res = await $fetch<BrandMarkDraftsRunResponse>(drafts.base, { method: 'POST' })
    drafts.setItems(res.items)
    remaining.value = res.quota.remaining
    lastModel.value = res.model
  }
  catch (error) {
    errorKey.value = messageKey(error)
    if (errorKey.value.endsWith('draftsLimit')) remaining.value = 0
  }
  finally {
    running.value = false
  }
}

async function toggleKeep(entry: BrandMarkDraftEntry): Promise<void> {
  if (!canAct.value) return
  busyId.value = entry.id
  errorKey.value = ''
  try {
    const res = await $fetch<BrandMarkDraftWriteResponse>(
      `${drafts.base}/${encodeURIComponent(entry.id)}`,
      { method: 'PATCH', body: { kept: !entry.kept } },
    )
    drafts.setItems(res.items)
  }
  catch (error) {
    errorKey.value = messageKey(error)
  }
  finally {
    busyId.value = ''
  }
}

async function discard(entry: BrandMarkDraftEntry): Promise<void> {
  if (!canAct.value) return
  busyId.value = entry.id
  errorKey.value = ''
  try {
    const res = await $fetch<BrandMarkDraftWriteResponse>(
      `${drafts.base}/${encodeURIComponent(entry.id)}`,
      { method: 'DELETE' },
    )
    drafts.setItems(res.items)
  }
  catch (error) {
    errorKey.value = messageKey(error)
  }
  finally {
    busyId.value = ''
  }
}

/**
 * Das Datum in der Sprache der OBERFLÄCHE, nicht der Inhaltssprache: die
 * Herkunfts-Zeile ist eine Auskunft an den Bedienenden, kein Marken-Inhalt.
 */
function createdLabel(entry: BrandMarkDraftEntry): string {
  const date = new Date(entry.createdAt)
  if (Number.isNaN(date.getTime())) return entry.createdAt
  return date.toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<template>
  <div data-brand-drafts>
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 class="text-xl font-medium">{{ t('brand.mark.drafts.title') }}</h2>
      <span class="bw-label ms-auto" style="color: var(--bw-muted)">
        {{ t('brand.mark.drafts.tag', { count: kept }) }}
      </span>
    </div>
    <p class="bw-doc-text mt-2">{{ t('brand.mark.drafts.intro') }}</p>

    <div class="mt-3 flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          icon="i-ph-sparkle"
          :label="items.length ? t('brand.mark.drafts.run.again') : t('brand.mark.drafts.run.first')"
          color="neutral" variant="outline" class="rounded-full"
          style="background: var(--bw-surface-hi)"
          data-drafts-run
          :loading="running"
          :disabled="!canAct || full"
          @click="run"
        />
        <p v-if="running" class="bw-pending">{{ t('brand.mark.drafts.running') }}</p>
      </div>
      <p class="bw-pending" data-drafts-quota>
        {{ remaining === null
          ? t('brand.mark.drafts.limits', { max: BRAND_DESIGN_DRAFTS_DAILY_LIMIT, per: BRAND_MARK_DRAFTS_PER_RUN })
          : t('brand.mark.drafts.remaining', { count: remaining, max: BRAND_DESIGN_DRAFTS_DAILY_LIMIT }) }}
      </p>
      <p v-if="full" class="bw-pending">
        {{ t('brand.mark.drafts.full', { max: BRAND_MARK_DRAFTS_MAX }) }}
      </p>
      <p v-if="errorKey" class="text-sm" style="color: var(--bw-stale)">{{ t(errorKey) }}</p>
    </div>

    <p v-if="loading" class="bw-pending mt-4">{{ t('brand.mark.drafts.loading') }}</p>
    <p v-else-if="!items.length" class="bw-pending mt-4" data-drafts-empty>
      {{ t('brand.mark.drafts.empty') }}
    </p>

    <div v-if="items.length" class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div
        v-for="draft in items" :key="draft.id"
        class="bw-frame p-3"
        :data-draft="draft.id"
        :data-draft-kept="draft.kept ? 'true' : 'false'"
        :style="draft.kept ? 'background: var(--bw-accent-soft)' : 'background: var(--bw-surface)'"
      >
        <!-- Das Bild kommt aus der eigenen Route (s. Kopf) — es gibt keine
             Bucket-Adresse, die ein Browser aufrufen könnte. -->
        <img
          :src="drafts.imageUrl(draft)"
          :alt="t('brand.mark.drafts.alt', { title: draft.title })"
          class="bw-frame block w-full"
          loading="lazy"
        >
        <p class="mt-2 text-sm font-medium">{{ draft.title }}</p>
        <!-- DER VERMERK STEHT AN JEDER KARTE (§1.11 b), nicht einmal oben. -->
        <p class="bw-label mt-1" style="color: var(--bw-draft)">
          {{ t('brand.mark.drafts.disclaimer') }}
        </p>
        <p class="bw-label mt-1.5" style="color: var(--bw-muted)">
          {{ draft.model || '—' }} · {{ createdLabel(draft) }} ·
          {{ t('brand.mark.drafts.promptHash', { hash: draft.promptHash || '—' }) }}
        </p>
        <div class="mt-2 flex items-center justify-end gap-1.5">
          <UButton
            size="xs" color="neutral" variant="ghost" class="rounded-full"
            icon="i-ph-trash"
            :label="t('brand.mark.drafts.discard')"
            :disabled="!canAct"
            @click="discard(draft)"
          />
          <button
            type="button"
            class="bw-confirm bw-confirm--xs"
            :class="draft.kept ? 'bw-confirm--done' : 'bw-confirm--open'"
            :data-draft-keep="draft.id"
            :aria-pressed="draft.kept"
            :disabled="!canAct"
            @click="toggleKeep(draft)"
          >
            <UIcon :name="draft.kept ? 'i-ph-check-circle-fill' : 'i-ph-check'" class="size-3.5" />
            {{ draft.kept ? t('brand.mark.drafts.kept') : t('brand.mark.drafts.keep') }}
          </button>
        </div>
      </div>
    </div>

    <!-- DER MARKENRECHTS-HINWEIS — immer sichtbar, auch ohne einen Entwurf. -->
    <div class="bw-frame mt-4 flex items-start gap-3 px-5 py-4" style="background: var(--bw-surface)">
      <UIcon name="i-ph-scales" class="mt-0.5 size-4 flex-none" style="color: var(--bw-muted)" />
      <div class="min-w-0">
        <p class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)" data-drafts-trademark>
          {{ t('brand.mark.drafts.trademark') }}
        </p>
        <p class="bw-label mt-2" style="color: var(--bw-muted)">
          {{ t('brand.mark.drafts.private') }}
        </p>
      </div>
    </div>
  </div>
</template>
