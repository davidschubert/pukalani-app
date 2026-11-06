<script setup lang="ts">
import type { BwSidebarBrand } from '../../../components/BwWorkspaceSidebar.vue'
import type { BwRailLayer, BwRailStep } from '../../../components/BwProgressRail.vue'
import { brandDesignSnapshotPreset } from '../../../../shared/brandDesignValues'
import { BRAND_DESIGN_STEP_KEYS } from '../../../../shared/slotRegistry'
import type { BrandDesignResponse } from '../../../../shared/types/brand'
import { useBrandWorkspaceStore } from '../../../stores/brandWorkspace'
import { useBrandFoundationRailStep } from '../../../composables/useBrandFoundationRailStep'

/**
 * DAS ERGEBNIS-BOARD ALS EIGENE ANSICHT (Konzept docs/archiv/BRAND-DESIGN.md
 * §2.8, Davids Entscheidung 2026-09-08; Form abgenommen am Klickdummy
 * `/brand/demo/design/board`) — LESEN, nicht entscheiden.
 *
 * ── WARUM SIE NEBEN KAPITEL 10 EXISTIERT ─────────────────────────────────
 * Dasselbe Board steht als KOPF von Kapitel 10 in der Brand Foundation. Dort
 * ist es der Einstieg in einen Fliesstext; hier ist es die ganze Seite — in
 * der BREITEN Bühne der Werkstatt (72 rem) statt in Lesebreite, weil ein Board
 * eine Fläche ist und kein Absatz. Es ist das Artefakt, das man ausdruckt und
 * an die Wand hängt.
 *
 * ── SIE ENTSCHEIDET NICHTS ───────────────────────────────────────────────
 * Keine Chips, keine Knöpfe, keine Alternativen — wie die Leseansicht der
 * Foundation (§2.6 „keine Knöpfe im Text"). Rechts steht deshalb auch kein
 * Inhaltsverzeichnis (es gibt nur eine Fläche), sondern der Weg ZURÜCK in die
 * sechs Kapitel: korrigiert wird dort, nie hier.
 *
 * ── OHNE PRESET EINE RUHIGE SPERR-FLÄCHE ─────────────────────────────────
 * Die Route ist erreichbar, sobald die Marke freigeschaltet ist; das Board
 * entsteht aber erst mit sechs Abnahmen. Statt eines 404 steht dann der Stand
 * („x von 6 Kapiteln") und der Weg weiter — ein 404 auf eine Adresse, die der
 * Rail-Punkt selbst anbietet, wäre eine Sackgasse mit Absicht.
 *
 * ── FREMDES BRANDING IST 404 ─────────────────────────────────────────────
 * Wie Dokument und Leseansicht (DECISION-LOG 2026-09-05): die Route antwortet
 * 404, die Seite wirft ihre Fehlerseite.
 */
definePageMeta({ layout: 'brand-workspace' })

const route = useRoute()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const store = useBrandWorkspaceStore()
const request = useRequestFetch()

const profileId = computed(() => String(route.params.profileId ?? ''))

/**
 * SSR-FÄHIG wie Werkstatt, Dokument und Leseansicht: `useAsyncData` mit dem
 * request-gebundenen `fetch` — sonst antwortet die Datentür beim Serverlauf
 * mit der Gast-Sicht (404) und die Seite hydratisiert als „kein Zugang".
 */
const doc = await useAsyncData<BrandDesignResponse | null>(
  () => `brand-design-${profileId.value}`,
  () => request<BrandDesignResponse>(`/api/brand/profiles/${profileId.value}/design`),
  { watch: [profileId], default: () => null },
)

const shell = await useAsyncData<{ found: boolean } | null>(
  () => `brand-design-shell-${profileId.value}`,
  async () => {
    const found = await store.loadProfile(profileId.value, request)
    await store.loadProfiles(request).catch(() => {})
    return { found }
  },
  { watch: [profileId], default: () => null },
)

if (shell.data.value && !shell.data.value.found) {
  throw createError({ status: 404, statusText: 'Unknown brand profile' })
}

const view = computed(() => doc.data.value)
const title = computed(() => store.profile?.title || view.value?.title || '')

/**
 * DAS BOARD RENDERT DIE SNAPSHOT-FASSUNG, auch privat: es zeigt ohnehin keine
 * Entwürfe, und was gar nicht erst hineingereicht wird, kann auch kein
 * späterer Umbau versehentlich sichtbar machen (§1.11 b).
 */
const preset = computed(() => {
  const full = view.value?.preset
  return full ? brandDesignSnapshotPreset(full) : null
})

const stand = computed(() => {
  const value = Date.parse(view.value?.stand ?? '')
  return Number.isFinite(value)
    ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(value)
    : ''
})

const done = computed(() => view.value?.done ?? 0)
const total = computed(() => view.value?.total ?? BRAND_DESIGN_STEP_KEYS.length)
const progressPct = computed(() => (total.value === 0
  ? 0
  : Math.round((done.value / total.value) * 100)))

/** Der Weg zurück in die sechs Kapitel — rechts, statt eines Verzeichnisses. */
const chapterLinks = computed(() => store.designSteps.map(entry => ({
  key: entry.stepKey,
  label: t(`brand.steps.${entry.stepKey}`),
  done: entry.state === 'done',
  to: localePath(`/brand/${profileId.value}/${entry.stepKey}`),
})))

/** Das erste noch offene Kapitel — das Ziel von „Weiter im Brand Design". */
const nextChapter = computed(() => chapterLinks.value.find(entry => !entry.done) ?? null)

// ── Die Leiste (dieselbe wie in Werkstatt, Dokument und Leseansicht) ───────

const navExtras = useBrandWorkspaceNavExtras({
  profileId,
  findings: () => store.findings,
})

const foundationStep = useBrandFoundationRailStep({ profileId, active: false })

const railLayers = computed<BwRailLayer[]>(() => [
  {
    id: 'foundation',
    label: t('brand.workspace.railLayer'),
    steps: [
      ...store.railSteps
        .map((entry): BwRailStep => ({
          id: entry.stepKey,
          label: t(`brand.steps.${entry.stepKey}`),
          icon: '',
          state: entry.state === 'done'
            ? 'done'
            : entry.state === 'active' ? 'active' : entry.state === 'locked' ? 'locked' : 'open',
          counter: t('brand.nav.chapterCount', {
            confirmed: entry.progress.requiredTotal - entry.missingRequired.length,
            total: entry.progress.requiredTotal,
          }),
        })),
      {
        id: 'document',
        label: t('brand.nav.document'),
        icon: '',
        state: 'open',
        kind: 'document',
        to: localePath(`/brand/${profileId.value}/document`),
      },
      foundationStep.value,
      ...navExtras.value,
    ],
  },
  {
    id: 'design',
    label: t('brand.designLayer.label'),
    note: t('brand.designLayer.progress', { done: done.value, total: total.value }),
    steps: [
      ...chapterLinks.value.map((entry): BwRailStep => ({
        id: entry.key,
        label: entry.label,
        icon: '',
        state: entry.done ? 'done' : 'open',
        to: entry.to,
      })),
      // DIESE SEITE IST DER ERGEBNIS-PUNKT — er steht als `active` da, nicht
      // als Link auf sich selbst.
      {
        id: 'design-result',
        kind: 'result',
        label: t('brand.designLayer.result'),
        icon: '',
        state: 'active',
      },
    ],
  },
])

const LOCALE_FLAGS: Record<string, string> = { en: 'i-circle-flags-us', de: 'i-circle-flags-de' }

const sidebarBrands = computed<BwSidebarBrand[]>(() => store.profiles.map(profile => ({
  id: profile.id,
  title: profile.title || t('brand.brands.card.untitled'),
  path: t(`brand.brands.card.path.${profile.pathKind}`),
  flag: LOCALE_FLAGS[profile.contentLocale],
  to: localePath(`/brand/${profile.id}/${profile.currentStepKey}`),
  current: profile.id === profileId.value,
})))

const railCollapsed = ref(false)
const asideCollapsed = ref(false)

function print(): void {
  if (import.meta.client) window.print()
}

async function goToStep(key: string | null): Promise<void> {
  if (!key || !store.canEnter(key)) return
  await navigateTo(localePath(`/brand/${profileId.value}/${key}`))
}

useBrandTitle(() => (title.value
  ? `${t('brand.foundation.design.title')} · ${title.value}`
  : t('brand.foundation.design.title')))
</script>

<template>
  <BwWorkspace
    class="fd-page"
    stage-width="72rem"
    :progress-pct="progressPct"
    :content-locale="view?.contentLocale ?? locale"
    :locale-in-topbar="false"
    :topbar="false"
    :rail-footer="false"
    rail-width="300px"
    :rail-collapsed="railCollapsed"
    :george-collapsed="asideCollapsed"
    initial-mode="stage"
    style="--bw-rail-pad-x: 1rem; --bw-rail-pad-y: 0.75rem"
  >
    <template #rail>
      <BwWorkspaceSidebar
        :layers="railLayers"
        :brands="sidebarBrands"
        :manage-to="localePath('/dashboard/brands')"
        @select="goToStep"
        @select-brand="to => navigateTo(to)"
      />
    </template>

    <template #stage-bar>
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <UButton
          size="sm" color="neutral" variant="ghost"
          icon="i-ph-sidebar-simple"
          :aria-label="railCollapsed ? t('brand.workspace.bar.showNav') : t('brand.workspace.bar.hideNav')"
          @click="railCollapsed = !railCollapsed"
        />
        <div class="min-w-0 leading-tight">
          <p class="bw-label uppercase tracking-wider" style="color: var(--bw-muted)">
            {{ t('brand.designLayer.label') }}
          </p>
          <p class="truncate font-semibold">{{ t('brand.foundation.design.title') }}</p>
        </div>
        <div class="ml-auto flex flex-none items-center gap-1.5">
          <UButton
            v-if="preset"
            size="sm" color="neutral" variant="ghost" icon="i-ph-printer"
            :label="t('brand.foundation.design.print')" class="max-sm:hidden" @click="print"
          />
          <UButton
            size="sm" color="neutral" variant="ghost" class="max-sm:hidden"
            :to="`${localePath(`/brand/${profileId}/foundation`)}#visuell`"
            icon="i-ph-book-open" :label="t('brand.foundation.design.inDocument')"
          />
          <UButton
            size="sm" color="neutral" variant="ghost" class="max-md:hidden"
            icon="i-ph-sidebar-simple" :ui="{ leadingIcon: '-scale-x-100' }"
            :aria-label="asideCollapsed ? t('brand.foundation.showToc') : t('brand.foundation.hideToc')"
            @click="asideCollapsed = !asideCollapsed"
          />
        </div>
      </div>
    </template>

    <template #default>
      <div class="flex flex-col gap-6 pb-6">
        <!-- Nur im Druck: Kopfzeile mit Marke auf jeder Seite. -->
        <p class="fd-print-head bw-label">
          {{ title }} · {{ t('brand.foundation.design.title') }}<template v-if="stand"> · {{ t('brand.foundation.design.stand', { date: stand }) }}</template>
        </p>

        <div>
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
            {{ t('brand.foundation.design.eyebrow') }}
          </p>
          <h1 class="mt-1 text-3xl font-extralight leading-tight tracking-tight">
            {{ t('brand.foundation.design.headline') }}
          </h1>
          <p class="bw-label mt-2" style="color: var(--bw-muted)">{{ t('brand.foundation.design.lead') }}</p>
        </div>

        <p v-if="doc.error.value" class="bw-pending">{{ t('brand.foundation.loadFailed') }}</p>

        <BwDesignBoard v-else-if="preset" :preset="preset" :title="title" :stand="stand" />

        <!-- OHNE PRESET: der Stand, kein 404 (s. Kopf). -->
        <div v-else class="bw-card p-8" data-design-locked>
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
            {{ t('brand.foundation.design.lockedProgress', { done, total }) }}
          </p>
          <p class="mt-3 text-xl font-extralight leading-snug tracking-tight">
            {{ t('brand.foundation.design.lockedTitle') }}
          </p>
          <p class="mt-2 max-w-xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t('brand.foundation.design.lockedLead') }}
          </p>
          <UButton
            v-if="nextChapter"
            :to="nextChapter.to" class="mt-5 rounded-full" trailing-icon="i-ph-arrow-right"
            :label="t('brand.foundation.design.toChapter')"
          />
        </div>

        <p v-if="preset" class="fd-noprint bw-pending">{{ t('brand.foundation.design.correctHint') }}</p>
      </div>
    </template>

    <!-- RECHTS: der Weg zurück in die Kapitel, kein Inhaltsverzeichnis. -->
    <template #george>
      <div class="flex min-h-0 flex-1 flex-col">
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
            {{ t('brand.foundation.design.correctTitle') }}
          </p>
          <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t('brand.foundation.design.correctLead') }}
          </p>
          <ul class="mt-4 flex flex-col gap-1">
            <li v-for="chapter in chapterLinks" :key="chapter.key">
              <NuxtLink
                :to="chapter.to"
                class="bw-frame flex items-center gap-3 px-3 py-2 text-sm"
                style="background: var(--bw-surface)"
              >
                <UIcon
                  :name="chapter.done ? 'i-ph-check-circle-fill' : 'i-ph-circle'"
                  class="size-4 flex-none"
                  :style="`color: ${chapter.done ? 'var(--bw-accent)' : 'var(--bw-muted)'}`"
                />
                <span class="min-w-0 flex-1 truncate">{{ chapter.label }}</span>
                <UIcon name="i-ph-arrow-right" class="size-4 flex-none" style="color: var(--bw-muted)" />
              </NuxtLink>
            </li>
          </ul>

          <p class="bw-label mt-6 uppercase tracking-widest" style="color: var(--bw-muted)">
            {{ t('brand.foundation.design.privateTitle') }}
          </p>
          <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t('brand.foundation.design.privateLead') }}
          </p>
        </div>
        <div class="flex-none border-t px-6 pb-5" style="border-color: var(--bw-line)">
          <BwRailFooter
            :progress-pct="progressPct"
            :progress-title="t('brand.foundation.design.progressTitle')"
            :progress-count="`${done}/${total}`"
          />
        </div>
      </div>
    </template>
  </BwWorkspace>
</template>

<style>
/* Druck wie die Leseansicht der Foundation (dort begründet): nicht `scoped`,
 * weil die Zonen der Werkstatt fremde Komponenten sind; `.fd-page` hält die
 * Regeln bei DIESER Seite. Das Board selbst behält seine Farben — die Regel
 * dafür wohnt in `BwDesignBoard`. */
.fd-print-head { display: none; }
@media print {
  .fd-page header,
  .fd-page .bw-rail,
  .fd-page .bw-stage-bar,
  .fd-page .bw-george,
  .fd-page .bw-modeswitch { display: none !important; }
  .fd-page,
  .fd-page .bw-shell { display: block !important; height: auto !important; }
  .fd-page .bw-stage { overflow: visible !important; padding: 0 !important; }
  .fd-page .bw-stage-inner { max-width: none !important; }
  .fd-page .fd-print-head { display: block; }
  .fd-page .fd-noprint { display: none !important; }
}
</style>
