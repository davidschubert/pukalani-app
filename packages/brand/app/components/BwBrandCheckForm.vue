<script setup lang="ts">
import type { BrandCheckStartResponse } from '../../shared/types/brand'

/**
 * DER BRAND-CHECK-EINSTIEG — ein Feld, ein Knopf, ein Ergebnis
 * (Konzept: docs/archiv/BRAND-CHECK.md §1).
 *
 * Bis heute stand an dieser Stelle die Warteliste mit `source: 'brand-check'`,
 * weil es das Instrument noch nicht gab. Jetzt gibt es es: die Adresse geht an
 * `POST /api/brand/check`, und die Antwort trägt die Id des Ergebnisses. Diese
 * Komponente entscheidet nichts über den Score — sie startet, wartet und
 * schickt weiter.
 *
 * ── DAS SCHEMA ERGÄNZEN WIR, STATT ES ZU VERLANGEN ────────────────────────
 * Der Platzhalter sagt „eure-website.de", und genau so tippen Menschen. Ein
 * fehlendes `https://` wird deshalb hier ergänzt (dieselbe Haltung wie in
 * `normalizeBrandWaitlistWebsite`) — ein vorhandenes Schema bleibt unangetastet,
 * auch ein falsches: dessen Ablehnung gehört dem Server, nicht diesem Feld.
 *
 * ── DREI STATUSZEILEN SIND ANZEIGE, KEIN FORTSCHRITT ──────────────────────
 * Ein Check dauert 10–40 Sekunden; ein einzelner Spinner sieht in dieser Zeit
 * aus wie ein Hänger. Die Zeilen erscheinen zeitgesteuert (~4 s) und sagen, was
 * gerade passiert — sie MESSEN nichts, deshalb bleibt die letzte stehen, bis
 * die Antwort da ist. Ein Balken, der 90 % anzeigt und dann wartet, wäre eine
 * Lüge; drei Sätze sind es nicht.
 *
 * ── HONEYPOT WIE BEI DER WARTELISTE ───────────────────────────────────────
 * `hp` ist für Menschen unsichtbar; füllt ein Skript es, entscheidet der
 * Server. Ein Captcha kostete jeden ehrlichen Check einen Klick.
 *
 * ── DAS RANKING IST EIN OPT-IN, DEFAULT AUS ───────────────────────────────
 * Davids Entscheidung 2026-09-05 (Plan §8.1): ein Check kommt NUR mit
 * Häkchen in die öffentliche Liste; ohne Häkchen bleibt das Ergebnis privat
 * und ist trotzdem über seine Adresse teilbar. Das Häkchen steht deshalb im
 * FORMULAR (jede Einbettung trägt es), nicht auf der Seite darum herum.
 *
 * ── DAS FELD GEHÖRT INS SCHEMA, BEVOR ES HIER MITREIST ────────────────────
 * Das Schema der Route ist `.strict()` (schemas/brandCheck.ts): ein Feld, das
 * es dort nicht gibt, wird nicht ignoriert, sondern mit 400 abgewiesen — ein
 * blindes Mitschicken hätte JEDEN Check umgebracht, auch den ohne Häkchen.
 * `rankingOptIn` steht dort (Default `false`), deshalb reist es hier
 * bedingungslos mit.
 */
defineProps<{
  /** Woher der Check gestartet wurde — für die spätere Auswertung. */
  source?: string
}>()

const { t, locale } = useI18n()
const localePath = useLocalePath()

/** Eine Zeile alle vier Sekunden; die dritte bleibt stehen (s. Kopf). */
const STATUS_STEP_MS = 4000
const STATUS_KEYS = ['status1', 'status2', 'status3'] as const

const url = ref('')
const hp = ref('')
/** Ins öffentliche Ranking? Default AUS (s. Kopf). */
const rankingOptIn = ref(false)
const status = ref<'idle' | 'running' | 'error'>('idle')
const errorKey = ref('generic')
const statusIndex = ref(0)

let statusTimer: ReturnType<typeof setInterval> | null = null

function stopStatusTimer(): void {
  if (statusTimer !== null) {
    clearInterval(statusTimer)
    statusTimer = null
  }
}

function startStatusTimer(): void {
  stopStatusTimer()
  statusIndex.value = 0
  statusTimer = setInterval(() => {
    if (statusIndex.value >= STATUS_KEYS.length - 1) {
      stopStatusTimer()
      return
    }
    statusIndex.value += 1
  }, STATUS_STEP_MS)
}

onBeforeUnmount(stopStatusTimer)

/** Fehlendes Schema ergänzen, vorhandenes stehen lassen (s. Kopf). */
function withScheme(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

/**
 * Ein Punkt im Namen genügt als Vorprüfung — alles Weitere (Schema, Ports,
 * private Netze) entscheidet der SSRF-Vertrag auf dem Server, und zwar dort
 * allein: eine zweite, schwächere Regel im Browser wäre eine zweite Wahrheit.
 */
const canSend = computed(() => {
  if (status.value === 'running') return false
  const candidate = withScheme(url.value)
  if (!candidate) return false
  try {
    return new URL(candidate).hostname.includes('.')
  }
  catch {
    return false
  }
})

interface FetchErrorLike {
  status?: number
  statusCode?: number
  response?: { status?: number }
  data?: { reason?: string }
}

/**
 * Der zentrale Fehler-Handler hebt `data.code` als `reason` ins Envelope
 * (CLAUDE.md); die Statuszahl ist der Rückfall, wenn keiner mitkommt. 429 wird
 * BEWUSST generisch behandelt — ob der Tages-Deckel der Instanz oder die
 * IP-Drossel zugeschlagen hat, ist für den Menschen davor dieselbe Auskunft.
 */
function messageKey(error: unknown): string {
  const value = error as FetchErrorLike | null
  const code = value?.status ?? value?.statusCode ?? value?.response?.status ?? 0
  const reason = typeof value?.data?.reason === 'string' ? value.data.reason : ''
  if (code === 429) return 'rateLimited'
  if (reason === 'invalid_url') return 'invalidUrl'
  if (reason === 'blocked_target') return 'blockedTarget'
  // BS1 R2b: die Website untersagt die automatische Auswertung. VOR dem
  // Status-Rückfall, denn 409 heisst hier nichts anderes.
  if (reason === 'site_blocked') return 'siteBlocked'
  if (reason === 'fetch_failed') return 'fetchFailed'
  if (reason === 'check_unavailable') return 'unavailable'
  if (code === 409) return 'siteBlocked'
  if (code === 503) return 'unavailable'
  if (code === 422) return 'fetchFailed'
  if (code === 400) return 'invalidUrl'
  return 'generic'
}

async function submit(): Promise<void> {
  if (!canSend.value) return
  status.value = 'running'
  startStatusTimer()
  try {
    const result = await $fetch<BrandCheckStartResponse>('/api/brand/check', {
      method: 'POST',
      body: {
        url: withScheme(url.value),
        locale: locale.value === 'de' ? 'de' : 'en',
        hp: hp.value,
        rankingOptIn: rankingOptIn.value,
      },
    })
    stopStatusTimer()
    // Ohne Id gibt es nichts anzusehen — das ist die Honigtopf-Antwort
    // (`cached: true`, leere Id). Ein Mensch sieht sie nie; träfe sie ihn doch,
    // wäre eine Weiterleitung auf eine leere Adresse schlechter als ein Satz.
    if (!result.id) {
      errorKey.value = 'generic'
      status.value = 'error'
      return
    }
    await navigateTo(localePath(`/brand-check/${result.id}`))
  }
  catch (error) {
    stopStatusTimer()
    errorKey.value = messageKey(error)
    status.value = 'error'
  }
}
</script>

<template>
  <div data-brand-check-form>
    <form class="space-y-3" @submit.prevent="submit">
      <UInput
        v-model="url" type="text" name="website" autocomplete="url" inputmode="url" size="lg"
        :disabled="status === 'running'"
        :placeholder="t('brand.check.form.placeholder')" :aria-label="t('brand.check.form.label')"
        class="w-full"
      />
      <!-- Honeypot: für Menschen unsichtbar und unerreichbar (s. Kopf). -->
      <div class="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <input v-model="hp" type="text" name="hp" tabindex="-1" autocomplete="off">
      </div>
      <!-- Ranking-Opt-in: Default AUS, mit dem Satz, der sagt, was OHNE
           Häkchen gilt (s. Kopf). -->
      <div class="pt-1">
        <UCheckbox
          v-model="rankingOptIn" :disabled="status === 'running'"
          :label="t('brand.check.form.ranking')" data-brand-check-ranking
        />
        <p class="bw-label mt-1.5 leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.check.form.rankingHint') }}</p>
      </div>
      <UButton
        type="submit" size="lg" class="rounded-full" :disabled="!canSend" :loading="status === 'running'"
        :label="status === 'running' ? t('brand.check.form.running') : t('brand.check.form.submit')"
        data-brand-check-submit
      />
      <p class="bw-label leading-relaxed" style="color: var(--bw-muted)">{{ t('brand.check.form.hint') }}</p>
    </form>

    <!-- Die Zeilen erscheinen nacheinander; die zuletzt erreichte trägt den
         Spinner, die früheren ein Häkchen (s. Kopf: Anzeige, kein Fortschritt). -->
    <ul v-if="status === 'running'" class="mt-4 space-y-2" data-brand-check-status>
      <li
        v-for="(key, index) in STATUS_KEYS"
        v-show="index <= statusIndex" :key="key"
        class="bw-label flex items-center gap-2"
        :style="index === statusIndex ? 'color: var(--bw-ink-soft)' : 'color: var(--bw-muted)'"
      >
        <UIcon
          :name="index === statusIndex ? 'i-ph-circle-notch' : 'i-ph-check'"
          class="size-3.5 flex-none" :class="index === statusIndex ? 'animate-spin' : ''"
          :style="index === statusIndex ? '' : 'color: var(--bw-accent)'"
        />
        {{ t(`brand.check.form.${key}`) }}
      </li>
    </ul>

    <p
      v-if="status === 'error'" class="mt-3 text-sm leading-relaxed"
      style="color: var(--bw-stale)" data-brand-check-error
    >
      {{ t(`brand.check.form.errors.${errorKey}`) }}
    </p>
  </div>
</template>
