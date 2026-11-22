<script setup lang="ts">
import type { Choice } from './OnboardingChoices.vue'
import {
  SITE_GOALS,
  SITE_MEMBER_RANGES,
  SITE_PURPOSES,
  isEarlyAccessGoal,
} from '../../../control/shared/onboarding'
import type { ProfileSignalResponse } from '../../shared/profileSignal'

/**
 * „HILF UNS, PUKALANI ZU SCHÄRFEN" (U19, Benchmark-Befund E5).
 *
 * Die drei Fragen, die U12 aus dem Wizard geworfen hat — Größe, Zweck, Ziel —,
 * gestellt an dem Punkt, an dem sie hingehören: HINTER dem Aha-Moment, an
 * jemanden, der schon einen eigenen Beitrag geschrieben hat. Freiwillig,
 * Teilantworten erlaubt, jederzeit wegklickbar.
 *
 * ORT: derselbe Hinweis-Slot wie Sperre, Testphase und Willkommens-Checkliste
 * (`pukalani.admin.notices`), aber als LETZTER Eintrag — es ist eine BITTE, und
 * eine Bitte steht hinter allem, was der Owner für sich selbst zu tun hat.
 * GLOBAL registriert (`.global.vue`), weil `<component :is="'…'">` den Namen
 * zur Laufzeit auflöst.
 *
 * ── ZWEI STUFEN, DAMIT DIE ÜBERSICHT EINE ÜBERSICHT BLEIBT ──────────────────
 * Ausgeklappt sind das 16 Auswahlkarten (3 + 6 + 7) — auf der meistbesuchten
 * Seite des Dashboards wäre das kein Hinweis mehr, sondern ein Formular, das
 * sich vordrängelt. Deshalb steht zuerst EINE Zeile mit einem Knopf; die Fragen
 * erscheinen erst auf Wunsch. Wer nicht mag, sieht nie mehr als diese Zeile.
 *
 * ── DIE KATALOGE KOMMEN AUS DEM VERTRAG ─────────────────────────────────────
 * `SITE_PURPOSES`/`SITE_MEMBER_RANGES`/`SITE_GOALS` gehören dem control-Layer
 * und werden explizit importiert (A14: Cross-Layer nur als benannter Vertrag) —
 * dieselbe Kopplung, die der Wizard schon hatte. Hier stehen NUR Ids; die
 * Beschriftungen sind i18n-Schlüssel.
 *
 * NUR CLIENT (`server: false`) wie die Geschwister-Hinweise: die Antwort hängt
 * am Mandanten, und ein 404 auf einem Nicht-Pool-Host ist der Normalfall und
 * darf die Übersicht nicht mit einem Fehler behelligen — `default` fängt ihn
 * ab, `visible: false` rendert dann nichts.
 */
const { t } = useI18n()
const toast = useToast()

const { data, error, refresh } = await useFetch<ProfileSignalResponse | null>('/api/community/profile-signal', {
  lazy: true,
  server: false,
  default: () => null,
})

/**
 * Nur ein echter AUSFALL (kein Status = Netz, oder 5xx) zeigt den Fehler-Zustand
 * (LZ1). 401/403/404 sind hier ERWARTET (Gast, keine Rolle, kein Pool-Host).
 */
const failed = computed(() => {
  return isFetchOutage(error.value)
})

/** Nach dem Klick sofort weg — der Merker bzw. die Antwort ist geschrieben. */
const hidden = ref(false)
const expanded = ref(false)
const saving = ref(false)
const postponing = ref(false)

const visible = computed(() => data.value?.visible === true && !hidden.value)

const answers = reactive<{ purpose: string, memberRange: string, goal: string }>({
  purpose: '',
  memberRange: '',
  goal: '',
})

/** Teilantworten sind erlaubt — nur gar nichts ist keine Antwort. */
const hasAnswer = computed(() => Boolean(answers.purpose || answers.memberRange || answers.goal))

const purposeOptions = computed<Choice[]>(() => SITE_PURPOSES.map(value => ({
  value,
  label: t(`onboarding.profileSignal.purpose.${value}.label`),
  hint: t(`onboarding.profileSignal.purpose.${value}.hint`),
})))

const memberRangeOptions = computed<Choice[]>(() => SITE_MEMBER_RANGES.map(value => ({
  value,
  label: t(`onboarding.profileSignal.memberRange.${value}`),
})))

/**
 * Die Kennzeichnung der Early-Access-Ziele wird MITGEFÜHRT (dieselbe
 * Claim-Disziplin wie im Wizard und auf der Landingpage): auswählbar ja — das
 * ist wertvolles Signal —, versprochen nein.
 */
const goalOptions = computed<Choice[]>(() => SITE_GOALS.map(goal => ({
  value: goal.id,
  label: t(`onboarding.profileSignal.goal.${goal.id}`),
  ...(isEarlyAccessGoal(goal.id) ? { badge: t('onboarding.profileSignal.earlyAccess') } : {}),
})))

async function submit() {
  if (!hasAnswer.value) return
  saving.value = true
  try {
    await $fetch('/api/community/profile-signal', {
      method: 'POST',
      // Leere Felder werden WEGGELASSEN, nicht als '' geschickt: das Schema
      // kennt nur Katalog-Werte, und ein leerer String wäre keiner.
      body: {
        ...(answers.purpose ? { purpose: answers.purpose } : {}),
        ...(answers.memberRange ? { memberRange: answers.memberRange } : {}),
        ...(answers.goal ? { goal: answers.goal } : {}),
      },
    })
    hidden.value = true
    toast.add({ title: t('onboarding.profileSignal.thanks'), color: 'success' })
  }
  catch {
    toast.add({ title: t('onboarding.profileSignal.failed'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function postpone(mode: 'later' | 'never') {
  postponing.value = true
  try {
    await $fetch('/api/community/profile-signal/postpone', { method: 'POST', body: { mode } })
    hidden.value = true
  }
  catch {
    toast.add({ title: t('onboarding.profileSignal.failed'), color: 'error' })
  }
  finally {
    postponing.value = false
  }
}
</script>

<template>
  <UCard v-if="visible" data-profile-signal>
    <template #header>
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="font-semibold">
            {{ t('onboarding.profileSignal.title') }}
          </h2>
          <p class="mt-1 text-sm text-muted">
            {{ t('onboarding.profileSignal.intro') }}
          </p>
        </div>
        <UButton
          v-if="!expanded"
          color="primary"
          variant="soft"
          size="sm"
          class="shrink-0"
          data-profile-signal-start
          @click="expanded = true"
        >
          {{ t('onboarding.profileSignal.start') }}
        </UButton>
      </div>
    </template>

    <!-- Der Rumpf ist ein BEDINGTER Slot, kein `v-if` im Slot: UCard zeichnet
         seinen Rumpf (mit Abstand und zwei Trennlinien), sobald ein
         Default-Slot existiert — zugeklappt stand dort ein leeres Band (UI-011). -->
    <template v-if="expanded" #default>
      <div class="space-y-6" data-profile-signal-form>
        <div class="space-y-3">
          <p class="text-sm font-medium">
            {{ t('onboarding.profileSignal.questions.purpose') }}
          </p>
          <OnboardingChoices
            v-model="answers.purpose"
            name="profile-signal-purpose"
            :legend="t('onboarding.profileSignal.questions.purpose')"
            :options="purposeOptions"
            :columns="1"
          />
        </div>

        <div class="space-y-3">
          <p class="text-sm font-medium">
            {{ t('onboarding.profileSignal.questions.memberRange') }}
          </p>
          <OnboardingChoices
            v-model="answers.memberRange"
            name="profile-signal-member-range"
            :legend="t('onboarding.profileSignal.questions.memberRange')"
            :options="memberRangeOptions"
          />
        </div>

        <div class="space-y-3">
          <p class="text-sm font-medium">
            {{ t('onboarding.profileSignal.questions.goal') }}
          </p>
          <OnboardingChoices
            v-model="answers.goal"
            name="profile-signal-goal"
            :legend="t('onboarding.profileSignal.questions.goal')"
            :options="goalOptions"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="postponing"
            data-profile-signal-later
            @click="postpone('later')"
          >
            {{ t('onboarding.profileSignal.later') }}
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="postponing"
            data-profile-signal-never
            @click="postpone('never')"
          >
            {{ t('onboarding.profileSignal.never') }}
          </UButton>
        </div>
        <UButton
          v-if="expanded"
          color="primary"
          size="sm"
          :loading="saving"
          :disabled="!hasAnswer"
          data-profile-signal-submit
          @click="submit"
        >
          {{ t('onboarding.profileSignal.submit') }}
        </UButton>
      </div>
    </template>
  </UCard>
  <CoreInlineLoadError v-else-if="failed" :retry="refresh" data-profile-signal-error />
</template>
