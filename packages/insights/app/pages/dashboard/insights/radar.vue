<script setup lang="ts">
import { INSIGHTS_RADAR_RETENTION_DAYS } from '../../../../shared/insightsPost'
import { INSIGHTS_RADAR_DAILY_QUOTA } from '../../../../shared/insightsYoutube'
import type {
  InsightsRadarResponse,
  InsightsRadarRunResponse,
  InsightsRadarRunResult,
  InsightsRadarRunView,
  InsightsRadarVideoItem,
  InsightsWatchVerdictResponse,
} from '../../../../shared/types/insightsApi'
import { RUN_LEASE_BUSY_CODE, RUN_LEASE_POLL_MS } from '../../../../../core/shared/runLease'
import { insightsRadarLastRun } from '../../../../shared/insightsRadarRun'
import type { InsightsVerdict } from '../../../../shared/insightsWatchlist'
import { insightsDay, insightsNumber } from '../../../utils/insightsFormat'

/**
 * DER THEMENRADAR (§9.6, Adresse `/dashboard/insights/radar`) — seit I4 mit
 * Inhalt.
 *
 * ── DIE SEITE BEANTWORTET ZUERST DEN ZUSTAND, DANN DIE DATEN ────────────
 * Eine leere Radar-Tabelle heisst DREI verschiedene Dinge: „noch nie
 * gelaufen", „kein API-Schlüssel" und „keine Kanäle konfiguriert". Für den
 * Betreiber sind das drei verschiedene Arbeiten (warten · eine Env-Zeile
 * eintragen · die App-Config ergänzen), und eine Tabelle ohne Zeilen sagt
 * keine davon. Die Status-Karte oben ist deshalb kein Beiwerk: sie ist der
 * eigentliche Inhalt, solange das Gate nicht offen ist.
 *
 * ── DER ENV-NAME STEHT WÖRTLICH DA ──────────────────────────────────────
 * `NUXT_INSIGHTS_YOUTUBE_KEY` als Code-Schnipsel, nicht als Umschreibung. Was
 * fehlt, muss man eintragen können, ohne erst im Repo zu suchen — und der
 * Env-Wächter (`pnpm ops:site-env`) mahnt genau diese Zeile an.
 *
 * ── DER WERT SELBST TAUCHT NIRGENDS AUF ─────────────────────────────────
 * Weder hier noch in einer Antwort: die Route sagt nur `configured: true`.
 * Der Schlüssel steht bei dieser API in der Query jeder Adresse, und eine
 * Oberfläche, die ihn „zur Kontrolle" anzeigt, ist ein Screenshot davon.
 *
 * ── `InRadar` BLEIBT UNVERÄNDERT ────────────────────────────────────────
 * Die Komponente rechnet die Opportunity aus den Zahlen, die sie bekommt —
 * das ist seit dem Prototyp so und soll so bleiben: die Zahl steht neben ihrem
 * Rechenweg. Was die Seite beisteuert, ist die gespeicherte `relevance` (das
 * dritte Signal, das nur der Lauf kennt) über `resolveRelevance`. Die
 * ANGEZEIGTE Zahl kann dadurch um einen Punkt von der gespeicherten abweichen,
 * wenn eine Zeile von gestern ist: das Alter rechnet gegen HEUTE, und das ist
 * die richtige Auskunft für den Menschen, der gerade draufsieht.
 */
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'admin'],
  requiredCapability: 'insights.manage',
  // Betreiber-Sache, wie Liste und Editor daneben.
  dashboardScope: 'operator',
})

const { t, locale } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
useBrandTitle(() => t('insights.radar.title'))

const readerLocale = computed(() => (locale.value === 'de' ? 'de' : 'en') as 'de' | 'en')

const { data, refresh, status } = await useFetch<InsightsRadarResponse>('/api/insights/radar', {
  lazy: true,
  server: false,
})

const videos = computed<InsightsRadarVideoItem[]>(() => data.value?.videos ?? [])
/** Ohne Antwort gibt es keinen Stichtag — der heutige Tag ist die ehrlichste Angabe. */
const today = computed(() => data.value?.today ?? new Date().toISOString().slice(0, 10))
const configured = computed(() => data.value?.configured === true)

/**
 * Das dritte Signal kommt aus der ZEILE und wird nicht neu geraten: die
 * Schlagwortliste lief beim Abruf, und ein zweiter Lauf im Browser könnte mit
 * einer neueren Liste zu einem anderen Ergebnis kommen als die gespeicherte
 * Zahl daneben.
 */
function resolveRelevance(video: { videoId: string }): number | undefined {
  return videos.value.find(entry => entry.videoId === video.videoId)?.relevance
}

/**
 * DAS URTEIL AUS DEM RADAR (BI2 K4).
 *
 * Ein Klick auf „Interessant" LEGT das Video in die Fundstücke — das Urteil
 * wohnt dort, weil die Radar-Zeile täglich überschrieben und nach dreissig
 * Tagen gelöscht wird. Die Antwort sagt, ob jetzt eine Zeile steht; die
 * Rückmeldung nennt das, damit der Klick nicht nur eine Farbe ändert.
 *
 * `refresh()` danach ist kein Luxus: der Filter „ohne Uninteressante" greift
 * auf die dazugelesenen Urteile, und ohne Nachladen bliebe die eben
 * abgehakte Zeile stehen, bis jemand die Seite neu lädt.
 */
const verdictBusy = ref('')

async function setVerdict(videoId: string, verdict: InsightsVerdict): Promise<void> {
  verdictBusy.value = videoId
  try {
    const result = await $fetch<InsightsWatchVerdictResponse>('/api/insights/watchlist/verdict', {
      method: 'POST',
      body: { videoId, verdict },
    })
    if (result.listed && verdict === 'interesting') {
      toast.add({ title: t('insights.radar.verdictListed'), color: 'success' })
    }
    await refresh()
  }
  catch (error) {
    const reason = (error as { data?: { reason?: string } } | null)?.data?.reason
    const key = `insights.finds.error.${reason ?? 'generic'}`
    const text = t(key)
    toast.add({ title: text === key ? t('insights.finds.error.generic') : text, color: 'error' })
  }
  finally {
    verdictBusy.value = ''
  }
}

/**
 * „JETZT LAUFEN LASSEN" IM HINTERGRUND (LL1 a, 2026-11-17).
 *
 * Die Route antwortet 202, sobald der Lauf gesperrt und gezählt ist, und
 * rechnet dahinter. Die Seite fragt dann alle `RUN_LEASE_POLL_MS` die
 * Radar-Antwort neu ab (`useRunPolling`, ruht bei verstecktem Reiter) — darin
 * steht `run`, gegen die Server-Uhr gerechnet, und mit ihm die frische Liste.
 * Endet der Lauf, kommen dieselben Zahlen wie früher als Rückmeldung.
 *
 * Läuft schon einer (zweiter Reiter, ein Kollege), kommt 409 `run_running` —
 * kein Fehler, sondern genau der Zustand, den die Seite dann zeigen soll: ein
 * ruhiger Hinweis, und sie fragt mit. Nach dem Neuladen zeigt sie einen
 * laufenden Lauf wieder als laufend, einen abgebrochenen mit einem ruhigen
 * Satz (der Knopf ist dann wieder frei).
 */
const runView = computed<InsightsRadarRunView | null>(() => data.value?.run ?? null)
/** Die Start-Anfrage ist unterwegs. */
const starting = ref(false)
/** Ein Lauf, dessen Ende die Seite melden soll. */
const watching = ref(false)
/** Der Beginn des beobachteten Laufs — ein älterer ist nicht dieser. */
const watchedStartedAt = ref('')
const running = computed(() => starting.value || runView.value?.state === 'running')
const interrupted = computed(() => !running.value && runView.value?.state === 'stalled')

/**
 * DIE ZAHLEN DES LETZTEN LAUFS, AUCH SPÄTER (LL1 c, 2026-11-17) — aus der
 * Lauf-Zeile gelesen (`insightsRadarLastRun`), nicht aus der Meldung beim
 * Ende: wer die Seite erst am nächsten Morgen öffnet, sieht dieselben Zahlen.
 * Ein gescheiterter oder abgebrochener Lauf wird als solcher benannt, ohne
 * Zahlen. Während ein Lauf läuft, steht hier nichts (der Satz am Knopf sagt
 * es) — die Lauf-Zeile kennt dann nur den laufenden.
 */
const lastRun = computed(() => (running.value ? null : insightsRadarLastRun(runView.value)))
const lastRunText = computed(() => {
  const last = lastRun.value
  if (!last) return ''
  const date = insightsDay(last.at.slice(0, 10), readerLocale.value)
  switch (last.kind) {
    case 'done': {
      const parts = [t('insights.radar.lastResult.done', {
        date,
        channels: last.result.channels,
        videos: last.result.videos,
        upserted: last.result.upserted,
        deleted: last.result.deleted,
        tooOld: last.result.tooOld,
      })]
      if (last.result.errors > 0) parts.push(t('insights.radar.runErrors', { count: last.result.errors }))
      if (last.result.partial) parts.push(t('insights.radar.lastResult.partial'))
      return parts.join(' · ')
    }
    case 'skipped':
      return t('insights.radar.lastResult.skipped', { date, reason: t(`insights.radar.skipped.${last.reason}`) })
    case 'failed':
      return t('insights.radar.lastResult.failed', { date })
    case 'stalled':
      return t('insights.radar.lastResult.stalled', { date })
  }
  return ''
})

function announce(result: InsightsRadarRunResult): void {
  if (result.skipped) {
    toast.add({ title: t(`insights.radar.skipped.${result.skipped}`), color: 'warning' })
    return
  }
  toast.add({
    title: t('insights.radar.runDone', {
      channels: result.channels,
      videos: result.videos,
      upserted: result.upserted,
      deleted: result.deleted,
      tooOld: result.tooOld,
    }),
    color: result.errors > 0 ? 'warning' : 'success',
    description: result.errors > 0 ? t('insights.radar.runErrors', { count: result.errors }) : undefined,
  })
  // Der Lauf hat seinen Herzschlag verloren und keine neuen Abrufe mehr
  // begonnen: kein Fehler, nur ein Teil — der Rest kommt nachts.
  if (result.partial) {
    toast.add({ title: t('insights.radar.runPartial'), color: 'info' })
  }
}

watch(runView, (run) => {
  if (!run) return
  if (run.state === 'running') {
    watching.value = true
    return
  }
  if (!watching.value) return
  if (watchedStartedAt.value && run.startedAt < watchedStartedAt.value) return
  watching.value = false
  watchedStartedAt.value = ''
  if (run.state === 'done' && run.result) announce(run.result)
  else if (run.state === 'failed') toast.add({ title: t('insights.radar.runFailed'), color: 'error' })
  // `stalled` zeigt der ruhige Hinweis über dem Knopf.
}, { immediate: true })

useRunPolling({ active: running, intervalMs: RUN_LEASE_POLL_MS, tick: refresh })

async function runNow(): Promise<void> {
  if (running.value) return
  starting.value = true
  try {
    const response = await $fetch<InsightsRadarRunResponse>('/api/insights/radar/run', { method: 'POST' })
    watching.value = true
    watchedStartedAt.value = response.run.startedAt
    if (data.value) data.value = { ...data.value, run: response.run }
  }
  catch (error) {
    // Der zentrale Handler hebt `data.code` als `reason` ins Envelope — genau
    // dafür setzt die Route ihn. Ohne Grund bleibt der allgemeine Satz.
    const reason = (error as { data?: { reason?: string } } | null)?.data?.reason
    if (reason === RUN_LEASE_BUSY_CODE) {
      toast.add({ title: t('insights.radar.runAlreadyRunning'), color: 'info' })
      watching.value = true
      watchedStartedAt.value = ''
      await refresh()
      return
    }
    const key = reason === 'rate_limited'
      ? 'insights.radar.rateLimited'
      : (reason === 'not_configured' ? 'insights.radar.notConfigured' : 'insights.radar.runFailed')
    toast.add({ title: t(key), color: 'error' })
  }
  finally {
    starting.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="insights-radar">
    <template #header>
      <UDashboardNavbar :title="t('insights.radar.title')">
        <template #leading>
          <CoreSidebarCollapse />
        </template>
        <template #right>
          <UButton
            :label="t('insights.editor.backToList')" icon="i-ph-arrow-left"
            color="neutral" variant="ghost"
            :to="localePath('/dashboard/insights')"
          />
          <UButton
            :label="t('insights.finds.title')" icon="i-ph-bookmark-simple"
            color="neutral" variant="ghost"
            :to="localePath('/dashboard/insights/finds')"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-if="data && !configured"
        icon="i-ph-key"
        color="warning"
        variant="subtle"
        :title="t('insights.radar.missingTitle')"
        :description="t('insights.radar.missingText', { days: INSIGHTS_RADAR_RETENTION_DAYS })"
      />

      <!--
        `shrink-0` IST KEIN FEINSCHLIFF (Klick-Beweis 2026-09-09): der Body der
        UDashboardPanel ist eine Flex-SPALTE mit fester Höhe, und ein Kind mit
        `overflow-hidden` (UCard) verliert dort sein `min-height: auto` — es
        schrumpft auf NULL, sobald der Inhalt darunter (die Radar-Tabelle)
        überläuft. Die Karte stand im DOM, die Seite las sich richtig vor
        (innerText), gerendert war ein Strich; der Knopf war da und nicht
        anklickbar. Kein Fehler in Konsole, Lint oder Typecheck.
      -->
      <UCard class="mt-6 shrink-0">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <dl class="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div class="flex items-baseline gap-2">
              <dt class="text-muted">{{ t('insights.radar.statusKey') }}</dt>
              <dd>
                <UBadge :color="configured ? 'success' : 'warning'" variant="subtle">
                  {{ configured ? t('insights.radar.keyPresent') : t('insights.radar.keyMissing') }}
                </UBadge>
                <code class="ml-2 text-xs text-dimmed">NUXT_INSIGHTS_YOUTUBE_KEY</code>
              </dd>
            </div>
            <div class="flex items-baseline gap-2">
              <dt class="text-muted">{{ t('insights.radar.statusChannels') }}</dt>
              <dd>{{ t('insights.radar.channelsCount', data?.channels ?? 0) }}</dd>
            </div>
            <div class="flex items-baseline gap-2">
              <dt class="text-muted">{{ t('insights.radar.statusQuota') }}</dt>
              <dd>
                {{ t('insights.radar.quotaOf', {
                  units: insightsNumber(data?.quotaEstimate ?? 0, readerLocale),
                  total: insightsNumber(INSIGHTS_RADAR_DAILY_QUOTA, readerLocale),
                }) }}
              </dd>
            </div>
            <div class="flex items-baseline gap-2">
              <dt class="text-muted">{{ t('insights.radar.statusLastRun') }}</dt>
              <dd>{{ data?.lastRunAt ? insightsDay(data.lastRunAt.slice(0, 10), readerLocale) : t('insights.radar.lastRunNever') }}</dd>
            </div>
            <div v-if="lastRun" class="flex items-baseline gap-2 sm:col-span-2" data-testid="radar-last-result">
              <dt class="shrink-0 text-muted">{{ t('insights.radar.statusLastResult') }}</dt>
              <dd :class="lastRun.kind === 'failed' || lastRun.kind === 'stalled' ? 'text-warning' : ''">
                {{ lastRunText }}
              </dd>
            </div>
          </dl>

          <div class="flex flex-col items-end gap-2">
            <UButton
              :label="t('insights.radar.run')"
              icon="i-ph-play"
              :loading="running"
              :disabled="!configured || running || (status === 'pending' && !data)"
              @click="runNow"
            />
            <p v-if="running" class="text-xs text-muted">
              {{ t('insights.radar.runRunning') }}
            </p>
            <p v-else-if="interrupted" class="max-w-64 text-right text-xs text-muted">
              {{ t('insights.radar.runStalled') }}
            </p>
          </div>
        </div>
      </UCard>

      <div class="bw-root mt-6">
        <InRadar
          :videos="videos"
          :locale="readerLocale"
          :today="today"
          :resolve-relevance="resolveRelevance"
          :max-age-days="data?.maxVideoAgeDays"
          :verdicts="data?.verdicts"
          :busy-video-id="verdictBusy"
          @verdict="setVerdict"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
