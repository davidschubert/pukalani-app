<script setup lang="ts">
import type { MarketSignalReport } from '../../../shared/marketSignal'

/**
 * MARKT-SIGNAL — die Auswertungs-Seite (U19).
 *
 * Sie ist der LESER, dessen Fehlen den alten Wizard-Fragen ihren Wert genommen
 * hat (Davids Entscheidung 2026-08-12: die Karte darf nur mit definiertem
 * Empfänger gebaut werden). Was hier steht, ist genau das, was die Karte drüben
 * erhebt — Größe, Zweck, Ziel.
 *
 * KEINE COMMUNITY-NAMEN. Die Seite beantwortet „wie sieht unser Markt aus?",
 * nicht „was hat Kunde X geantwortet?". Für die zweite Frage gibt es die
 * Communities-Liste; hier würden Namen nur dazu verleiten, aus drei
 * Katalog-Antworten ein Kundenprofil zu bauen.
 *
 * KEIN `UTable` (Regel B6 gilt Datenlisten): das hier ist keine Liste von
 * Zeilen, sondern drei Verteilungen mit fester Optionsreihenfolge — nichts zu
 * sortieren, nichts auszuwählen, nichts zu blättern. Balken lesen sich als
 * Verteilung in einem Blick, eine Tabelle nicht.
 *
 * Die REGEL des Zählens steht pur in `shared/marketSignal.ts`; hier wird nur
 * gemalt.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'sites.manage' })

const { t } = useI18n()
useBrandTitle(() => t('control.marketSignal.title'))

const { data, status, error, refresh } = await useFetch<MarketSignalReport & { truncated: boolean }>(
  '/api/control/market-signal',
  { lazy: true, server: false },
)

const report = computed(() => data.value ?? null)

/** Prozent für die Anzeige — eine Nachkommastelle wäre Genauigkeit, die drei
 *  Dutzend Antworten nicht hergeben. */
function percent(share: number): string {
  return `${Math.round(share * 100)} %`
}

const participation = computed(() => {
  const value = report.value
  if (!value || value.communities === 0) return '0 %'
  return percent(value.answeredAny / value.communities)
})
</script>

<template>
  <UDashboardPanel id="market-signal">
    <template #header>
      <UDashboardNavbar :title="t('control.marketSignal.title')" />
    </template>

    <template #body>
      <div class="space-y-6">
        <p class="text-sm text-muted">
          {{ t('control.marketSignal.intro') }}
        </p>

        <UAlert
          v-if="report?.truncated"
          color="warning"
          variant="subtle"
          icon="i-ph-warning"
          :title="t('control.marketSignal.truncated')"
        />

        <div v-if="isFetchLoading(status)" class="space-y-3">
          <USkeleton class="h-24 w-full" />
          <USkeleton class="h-64 w-full" />
        </div>
        <!-- Fehler statt „keine Marktsignale" (FE-004, LZ1) -->
        <div v-else-if="error && !data" role="alert">
          <CoreLoadError :retry="refresh" />
        </div>


        <template v-else-if="report">
          <div class="grid gap-4 sm:grid-cols-3">
            <UCard>
              <p class="text-sm text-muted">
                {{ t('control.marketSignal.communities') }}
              </p>
              <p class="mt-1 text-2xl font-semibold" data-market-signal-communities>
                {{ report.communities }}
              </p>
            </UCard>
            <UCard>
              <p class="text-sm text-muted">
                {{ t('control.marketSignal.answered') }}
              </p>
              <p class="mt-1 text-2xl font-semibold" data-market-signal-answered>
                {{ report.answeredAny }}
              </p>
            </UCard>
            <UCard>
              <p class="text-sm text-muted">
                {{ t('control.marketSignal.participation') }}
              </p>
              <p class="mt-1 text-2xl font-semibold" data-market-signal-participation>
                {{ participation }}
              </p>
            </UCard>
          </div>

          <UCard
            v-for="distribution in report.distributions"
            :key="distribution.question"
            :data-market-signal-question="distribution.question"
          >
            <template #header>
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <h2 class="font-semibold">
                  {{ t(`control.marketSignal.questions.${distribution.question}`) }}
                </h2>
                <p class="text-sm text-muted">
                  {{ t('control.marketSignal.answeredOf', {
                    answered: distribution.answered,
                    unanswered: distribution.unanswered,
                  }) }}
                </p>
              </div>
            </template>

            <CoreEmptyState
              v-if="distribution.answered === 0"
              icon="i-ph-chart-bar"
              :title="t('control.marketSignal.empty')"
            />

            <ul v-else class="space-y-3">
              <li
                v-for="option in distribution.options"
                :key="option.id"
                :data-market-signal-option="`${distribution.question}.${option.id}`"
                :data-market-signal-count="option.count"
              >
                <div class="flex items-baseline justify-between gap-3 text-sm">
                  <!--
                    EIGENE Beschriftungen, NICHT die der Karte: `apps/control`
                    extended den onboarding-Layer nicht, `onboarding.
                    profileSignal.*` gäbe hier also den rohen Schlüssel aus —
                    genau der Impressum-Fall, den `check:i18n-keys` für
                    Config-Schlüssel abfängt, für `t()`-Aufrufe im Markup aber
                    bewusst nicht. Sie dürfen ausserdem kürzer sein als die
                    Kundentexte: hier liest ein Betreiber eine Verteilung.
                  -->
                  <span class="min-w-0 truncate">
                    {{ t(`control.marketSignal.options.${distribution.question}.${option.id}`) }}
                  </span>
                  <span class="shrink-0 tabular-nums text-muted">
                    {{ option.count }} · {{ percent(option.share) }}
                  </span>
                </div>
                <div class="mt-1 h-2 w-full overflow-hidden rounded-full bg-elevated">
                  <div
                    class="h-full rounded-full bg-primary transition-[width]"
                    :style="{ width: `${Math.round(option.share * 100)}%` }"
                  />
                </div>
              </li>
            </ul>
          </UCard>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
