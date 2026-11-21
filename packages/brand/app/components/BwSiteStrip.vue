<script setup lang="ts">
import type { BrandSiteAnalysisView, BrandSiteAnalyzeResponse } from '../../shared/types/brand'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * „WEBSITE LESEN" (P2.3) — der Streifen über dem Gespräch der Werkstatt.
 *
 * Erster Abschnitt, der aus der Werkstatt-Seite herausgeschnitten wurde (Q21,
 * ARC-001): die Grenze ist die klarste der Seite — eine Route
 * (`POST …/analyze`), ein Stück Profil aus dem Store (`startCard.websiteUrl`,
 * `siteAnalysis`), und NICHTS sonst auf der Seite liest seinen Zustand.
 * Verhalten und Aussehen sind unverändert; die Zustände dieses Streifens
 * (Zustimmung, läuft, Ergebnis, Fehler) waren schon vorher lokal und bleiben
 * es — die Wahrheit über das Profil bleibt im Store. Gedeckt vom Rauch-Test
 * `tests/render/workshopPage.test.ts` (Klick-Weg „Website lesen").
 */
const props = defineProps<{
  profileId: string
  /** Der Baustein aus der Adresse — nur `context` zeigt den Streifen. */
  stepKey: string
}>()

const { t, locale } = useI18n()
const store = useBrandWorkspaceStore()

/**
 * NUR IM BAUSTEIN KONTEXT und nur mit hinterlegter Adresse. ZWEI KLICKS,
 * KEINE CHECKBOX: der erste zeigt den Satz, der zweite löst aus.
 */
const siteUrl = computed(() => store.profile?.startCard.websiteUrl ?? '')
const showSiteStrip = computed(() => props.stepKey === 'context' && siteUrl.value.length > 0)

const siteAnalysis = ref<BrandSiteAnalysisView | null>(null)
watch(
  () => store.profile?.siteAnalysis,
  (value) => { siteAnalysis.value = value ?? null },
  { immediate: true },
)

const siteConsent = ref(false)
const siteRunning = ref(false)
const siteError = ref<string | null>(null)
const siteDone = ref<BrandSiteAnalyzeResponse | null>(null)

watch(() => props.stepKey, () => {
  siteConsent.value = false
  siteError.value = null
  siteDone.value = null
})

/** Die Gründe kommen als `data.reason`; ein unbekannter fällt auf den allgemeinen Satz. */
const SITE_ERROR_KEYS: Record<string, string> = {
  no_url: 'brand.workspace.site.error.noUrl',
  blocked_target: 'brand.workspace.site.error.blocked',
  not_html: 'brand.workspace.site.error.notHtml',
  too_large: 'brand.workspace.site.error.tooLarge',
  fetch_failed: 'brand.workspace.site.error.unreachable',
  brand_analyze_daily_limit: 'brand.workspace.site.error.dailyLimit',
}

function siteDate(iso: string): string {
  return iso ? new Date(iso).toLocaleDateString(locale.value) : ''
}

async function readSite(): Promise<void> {
  siteRunning.value = true
  siteError.value = null
  siteDone.value = null
  try {
    const response = await $fetch<BrandSiteAnalyzeResponse>(
      `/api/brand/profiles/${props.profileId}/analyze`,
      { method: 'POST', body: {} },
    )
    siteDone.value = response
    siteAnalysis.value = {
      url: siteUrl.value,
      analyzedAt: response.analyzedAt,
      textLength: response.textLength,
      stale: false,
    }
    siteConsent.value = false
  }
  catch (error) {
    const reason = (error as { data?: { reason?: string } }).data?.reason ?? ''
    siteError.value = SITE_ERROR_KEYS[reason] ?? 'brand.workspace.site.error.failed'
  }
  finally {
    siteRunning.value = false
  }
}
</script>

<template>
  <!-- Er SAGT, dass gelesen wird, und tut es erst nach einer Bestätigung. -->
  <div v-if="showSiteStrip" class="rounded-2xl px-4 py-3" style="background: var(--bw-surface)">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.workspace.site.label') }}</p>
        <p class="mt-0.5 truncate text-sm" style="color: var(--bw-ink-soft)">
          <template v-if="siteAnalysis?.analyzedAt">
            {{ t('brand.workspace.site.read', { date: siteDate(siteAnalysis.analyzedAt) }) }}
          </template>
          <template v-else>{{ t('brand.workspace.site.never') }}</template>
        </p>
      </div>

      <div class="flex flex-none items-center gap-2">
        <template v-if="siteConsent">
          <UButton
            size="sm" class="rounded-full" :loading="siteRunning"
            :label="t('brand.workspace.site.confirm')" @click="readSite"
          />
          <UButton
            size="sm" variant="ghost" color="neutral" class="rounded-full"
            :disabled="siteRunning"
            :label="t('brand.workspace.site.cancel')" @click="siteConsent = false"
          />
        </template>
        <UButton
          v-else
          size="sm" variant="ghost" color="neutral" class="rounded-full"
          icon="i-ph-globe"
          :label="siteAnalysis?.analyzedAt ? t('brand.workspace.site.again') : t('brand.workspace.site.start')"
          @click="siteConsent = true"
        />
      </div>
    </div>

    <p v-if="siteConsent" class="mt-2 text-sm" style="color: var(--bw-ink-soft)">
      {{ t('brand.workspace.site.consent') }}
    </p>
    <p v-if="siteRunning" class="bw-pending mt-2">{{ t('brand.workspace.site.running') }}</p>
    <p v-else-if="siteDone" class="mt-2 text-sm" style="color: var(--bw-ink-soft)">
      {{ t('brand.workspace.site.done', { chars: siteDone.textLength }) }}
    </p>
    <p v-else-if="siteError" class="mt-2 text-sm" style="color: var(--bw-stale)">{{ t(siteError) }}</p>
    <p v-else-if="siteAnalysis?.stale" class="mt-2 text-sm" style="color: var(--bw-stale)">
      {{ t('brand.workspace.site.stale') }}
    </p>
  </div>
</template>
