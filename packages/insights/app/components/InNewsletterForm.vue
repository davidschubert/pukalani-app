<script setup lang="ts">
import {
  INSIGHTS_NEWSLETTER_EMAIL_MAX,
  INSIGHTS_NEWSLETTER_HONEYPOT_MAX,
  createInsightsNewsletterSubscribeSchema,
} from '../../shared/insightsNewsletter'
import { insightsNewsletterEnabled } from '../../shared/insightsPublic'
import type { InsightsNewsletterSubscribeResponse } from '../../shared/types/insightsApi'

/**
 * „SCHREIBT MIR, WENN ETWAS NEUES DA IST" — das Eintrags-Formular des
 * Newsletters (BI1 I5a, Plan §9.3a).
 *
 * ── ES SITZT AN ZWEI STELLEN, UND BRINGT SEINEN RAHMEN MIT ──────────────
 * Zentral unter der Journal-Liste (`source: 'list'`) und am Ende jeder
 * öffentlichen Beitragsseite (`source: 'post:<slug>'`); Profil, Duell und
 * Ranking erben es, sobald ihr Format-Riegel aufgeht. Deshalb bringt die
 * Komponente ihre Karte selbst mit (Muster `BwWaitlistForm`): eine Seite baut
 * sie mit EINER Zeile ein, und die Optik ist an beiden Stellen dieselbe.
 *
 * ── DER RIEGEL STEHT HIER, NICHT IN DEN SEITEN ──────────────────────────
 * `pukalani.insights.newsletter.enabled` ist Layer-Default `false` (die
 * Rechtstexte sind Entwurf, BS1 R2/R3 — „erst Text, dann Schalter"). Ist er
 * zu, gibt diese Komponente NICHTS aus. Die Prüfung liegt an EINER Stelle und
 * nicht in jeder einbauenden Seite: zwei Einbauorte wären zwei Gelegenheiten,
 * den Riegel zu vergessen, und der dritte (Profil) kommt noch. Die Routen
 * prüfen ihn unabhängig davon — eine Sperre nur in der Oberfläche ist keine.
 *
 * ── DAS VERSPRECHEN HAT KEINEN TAKT (Davids Entscheidung 2026-10-24) ────
 * „Wir schreiben, wenn ein neues Stück erscheint." Kein „wöchentlich", kein
 * „regelmäßig" — nicht hier, nicht in der Mail, nicht im Betreff. Ein Test
 * hält die Locale-Werte darauf fest.
 *
 * ── DAS SCHEMA IST DASSELBE WIE AUF DEM SERVER ──────────────────────────
 * `createInsightsNewsletterSubscribeSchema(t)` — die Route ruft dieselbe
 * Fabrik ohne `t`. `UForm` prüft damit vor dem Absenden; ersetzt wird die
 * Serverprüfung dadurch nicht.
 *
 * ── DER HONIGTOPF REIST IMMER MIT ───────────────────────────────────────
 * Das Schema der Route ist `.strict()`; ein Feld, das erst bei Verdacht
 * mitgeschickt wird, wäre die Falle, die sich selbst ankündigt. Für Menschen
 * ist es unsichtbar UND unerreichbar (`tabindex="-1"`, `autocomplete="off"`).
 *
 * ── VIER ZUSTÄNDE, UND „FERTIG" IST EINE AUFFORDERUNG ───────────────────
 * Ruhe · sendet · „schau in dein Postfach" · Fehler. Der Erfolgs-Satz sagt
 * NICHT „du bist eingetragen": das ist er erst nach dem Klick in der Mail, und
 * eine Zusage, die noch an einer Bedingung hängt, wird hier nicht gegeben.
 * Für die drei Fehlerfälle (429 zu viel, 503 gerade nicht möglich, 400
 * Eingabe) gibt es einen Toast und keinen roten Block — das Formular bleibt
 * ausgefüllt stehen, damit ein zweiter Versuch ein Klick ist.
 */
const props = withDefaults(defineProps<{ source: string, compact?: boolean }>(), { compact: false })

const { t, locale } = useI18n()
const toast = useToast()
const appConfig = useAppConfig() as { pukalani?: { insights?: { newsletter?: { enabled?: unknown } } } }

const open = computed(() => insightsNewsletterEnabled(appConfig.pukalani?.insights?.newsletter?.enabled))

const schema = computed(() => createInsightsNewsletterSubscribeSchema(t))

const state = reactive({
  email: '',
  locale: locale.value === 'de' ? ('de' as const) : ('en' as const),
  source: props.source,
  hp: '',
})

// Die Sprache der Oberfläche entscheidet die Sprache der Mails. Sie kann sich
// ändern, bevor jemand absendet (Sprachumschalter im Kopf) — deshalb ein
// `watch` und kein einmaliger Wert.
watch(locale, (value) => {
  state.locale = value === 'de' ? 'de' : 'en'
})
watch(() => props.source, (value) => {
  state.source = value
})

const status = ref<'idle' | 'sending' | 'done'>('idle')

interface FetchErrorLike {
  status?: number
  statusCode?: number
  response?: { status?: number }
  data?: { reason?: string }
}

/**
 * Der fachliche Grund reist als `data.code` durch den zentralen Fehler-Handler
 * und kommt als `error.data.reason` an (CLAUDE.md). Unbekanntes fällt auf den
 * allgemeinen Satz zurück — ein leerer Hinweis wäre schlimmer als ein
 * ungenauer.
 */
function messageKey(error: unknown): string {
  const value = error as FetchErrorLike | null
  const code = value?.status ?? value?.statusCode ?? value?.response?.status ?? 0
  const reason = typeof value?.data?.reason === 'string' ? value.data.reason : ''
  if (reason === 'rate_limited_hour' || reason === 'rate_limited_day' || code === 429) return 'rateLimited'
  if (reason === 'newsletter_mail_failed' || reason === 'storage_unavailable' || code === 503) return 'unavailable'
  if (code === 400) return 'invalid'
  // 404 heisst hier „der Riegel ist zu" — für den Menschen davor ist das
  // dasselbe wie „gerade nicht möglich", und mehr soll er auch nicht erfahren.
  return 'generic'
}

async function submit(): Promise<void> {
  if (status.value === 'sending') return
  status.value = 'sending'
  try {
    await $fetch<InsightsNewsletterSubscribeResponse>('/api/insights/public/newsletter/subscribe', {
      method: 'POST',
      body: { email: state.email, locale: state.locale, source: state.source, hp: state.hp },
    })
    status.value = 'done'
  }
  catch (error) {
    status.value = 'idle'
    toast.add({
      title: t('insights.newsletter.errorTitle'),
      description: t(`insights.newsletter.errors.${messageKey(error)}`),
      color: 'error',
      icon: 'i-ph-warning-circle',
    })
  }
}
</script>

<template>
  <section
    v-if="open"
    class="bw-frame p-6 sm:p-8"
    style="background: var(--bw-surface)"
    data-insights-newsletter
  >
    <div v-if="status === 'done'" data-insights-newsletter-done>
      <p class="font-medium tracking-tight" style="color: var(--bw-ink)">
        {{ t('insights.newsletter.doneTitle') }}
      </p>
      <p class="mt-1.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
        {{ t('insights.newsletter.doneText') }}
      </p>
    </div>

    <template v-else>
      <p v-if="!compact" class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
        {{ t('insights.newsletter.eyebrow') }}
      </p>
      <h2 :class="compact ? 'text-xl font-light tracking-tight' : 'mt-2 text-2xl font-extralight tracking-tight sm:text-3xl'">
        {{ t('insights.newsletter.title') }}
      </h2>
      <p class="mt-2 max-w-xl text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
        {{ t('insights.newsletter.lead') }}
      </p>

      <UForm
        :schema="schema" :state="state" class="mt-5 space-y-3"
        @submit="submit"
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start">
          <!-- Ohne sichtbares Label, aber MIT `name`: nur so zeigt `UForm` den
               Zod-Fehler an der richtigen Stelle. Die Beschriftung trägt das
               Feld selbst (`aria-label`) — eine Zeile „E-Mail" über einem Feld
               mit dem Platzhalter „E-Mail" wäre dasselbe Wort zweimal. -->
          <UFormField name="email" class="flex-1">
            <UInput
              v-model="state.email" type="email" name="email" autocomplete="email" size="lg"
              :maxlength="INSIGHTS_NEWSLETTER_EMAIL_MAX"
              :placeholder="t('insights.newsletter.emailPlaceholder')"
              :aria-label="t('insights.newsletter.emailLabel')"
              class="w-full" data-insights-newsletter-email
            />
          </UFormField>
          <UButton
            type="submit" size="lg" class="rounded-full"
            :loading="status === 'sending'"
            :label="status === 'sending' ? t('insights.newsletter.sending') : t('insights.newsletter.submit')"
            data-insights-newsletter-submit
          />
        </div>

        <!-- Honigtopf: für Menschen unsichtbar und unerreichbar (s. Kopf). -->
        <div class="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <input v-model="state.hp" type="text" name="hp" tabindex="-1" autocomplete="off" :maxlength="INSIGHTS_NEWSLETTER_HONEYPOT_MAX">
        </div>

        <!-- Das Versprechen OHNE Takt (s. Kopf) plus der Hinweis auf das
             Double-Opt-in: beides gehört unter das Feld und nicht in ein
             Kleingedrucktes, das niemand liest. -->
        <p class="bw-label leading-relaxed" style="color: var(--bw-muted)">
          {{ t('insights.newsletter.promise') }}
        </p>
      </UForm>
    </template>
  </section>
</template>
