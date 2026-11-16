<script setup lang="ts">
import {
  SITE_CATEGORIES,
  type SiteVibeId,
} from '../../../../control/shared/onboarding'
import { OPERATOR_APEX, nameToSubdomain } from '../../../../control/schemas/tenant'
import {
  WIZARD_STEPS,
  isStepComplete,
  nextStep,
  normalizeStep,
  previousStep,
  stepIndex,
  type SlugCheck,
  type WizardStep,
} from '../../../shared/wizardSteps'
import {
  OPERATOR_TERMS_REQUIRED_CODE,
  operatorTermsHref,
  resolveOperatorTerms,
  type OperatorTermsConfig,
} from '../../../shared/operatorTerms'
import type { Choice } from '../../components/OnboardingChoices.vue'

/**
 * Der Setup-Flow (SAAS-ROADMAP #1).
 *
 * EINE Seite, vier Schritte, Schritt im URL (`?step=`): der Browser-Zurück-
 * Knopf tut damit das Erwartbare, und ein geteilter Link landet nicht mitten
 * im Formular eines anderen. Der Entwurf lebt in sessionStorage — bis zum
 * Abschluss ist NICHTS angelegt, ein Abbruch hinterlässt also keine halbe
 * Community.
 *
 * DREI FRAGEN, EIN ABSCHLUSS (U12, Davids Entscheidung 2026-08-10): Name/
 * Adresse, Kategorie, Vibe. Warum genau diese drei und wo die vier
 * weggefallenen Antworten hingehen, steht in shared/wizardSteps.ts.
 *
 * Angelegt wird genau EINMAL, am Ende: ein Aufruf, alle Antworten. Die
 * Idempotenz liegt serverseitig am Hostnamen, ein Doppelklick kann also nichts
 * doppelt erzeugen.
 */
definePageMeta({ layout: 'onboarding', middleware: 'auth' })

const STEPS = WIZARD_STEPS

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const localePath = useLocalePath()
const draft = useOnboardingDraft()
const auth = useAuthStore()
const { trackFunnel } = useFunnelEvent()

// ── Schritt aus der URL (fehlerhafte Werte → erster Schritt) ────────────────
const step = computed<WizardStep>(() => normalizeStep(route.query.step))
const index = computed(() => stepIndex(step.value))

function goTo(next: WizardStep) {
  router.push({ query: { ...route.query, step: next } })
}

// ── Kataloge als Auswahlkarten (Beschriftungen aus i18n, Ids aus dem Vertrag) ─
const categoryOptions = computed<Choice[]>(() => SITE_CATEGORIES.map(id => ({
  value: id, label: t(`onboarding.categories.${id}.label`), hint: t(`onboarding.categories.${id}.hint`),
})))

// ── Adresse: Vorschlag aus dem Namen, bis der Nutzer selbst tippt ───────────
watch(() => draft.value.name, (name) => {
  if (draft.value.slugTouched) return
  draft.value.slug = nameToSubdomain(name ?? '')
})

const host = computed(() => draft.value.slug ? `${draft.value.slug}.${OPERATOR_APEX}` : '')

const slugState = ref<SlugCheck>('idle')
let slugTimer: ReturnType<typeof setTimeout> | undefined

async function checkSlug() {
  const slug = (draft.value.slug ?? '').trim()
  if (slug.length < 3) {
    slugState.value = 'idle'
    return
  }
  slugState.value = 'checking'
  try {
    const result = await $fetch<{ slugAvailable?: boolean }>('/api/onboarding/precheck', {
      method: 'POST',
      body: { slug },
    })
    slugState.value = result.slugAvailable ? 'free' : 'taken'
  }
  catch {
    // Netz-/Serverproblem darf nicht wie „belegt" aussehen — sonst sucht
    // jemand einen neuen Namen, obwohl der alte frei ist.
    slugState.value = 'error'
  }
}

// Entprellt: jeder Tastendruck wäre eine Anfrage.
watch(() => draft.value.slug, () => {
  slugState.value = 'idle'
  clearTimeout(slugTimer)
  slugTimer = setTimeout(checkSlug, 450)
})
onMounted(() => {
  if (!draft.value.inviteCode) {
    // Ohne Code gibt es keinen Wizard (das Tor steht in /start).
    navigateTo(localePath('/start'))
    return
  }
  if (draft.value.slug) checkSlug()
})
onBeforeUnmount(() => clearTimeout(slugTimer))

// ── Weiter-Bedingung je Schritt (Regel + Tests: shared/wizardSteps.ts) ──────
const canContinue = computed(() => isStepComplete(step.value, draft.value, slugState.value))

function next() {
  if (!canContinue.value) return
  const target = nextStep(step.value)
  if (target) goTo(target)
}
/**
 * Der Zurück-Weg AUS dem ersten Schritt führt auf das Code-Tor — und das gibt
 * es nur, solange es eines gibt (U2). Steht es offen, leitet `/start` sofort
 * wieder hierher zurück; ein Knopf, der nichts tut, gehört nicht ins Bild.
 */
const gate = useOnboardingGate()
const canGoBack = computed(() => previousStep(step.value) !== null || gate.value.inviteRequired)

function back() {
  const target = previousStep(step.value)
  if (target) goTo(target)
  else navigateTo(localePath('/start'))
}

// ── Bedingungen für Community-Betreiber (Regeln: shared/operatorTerms.ts) ──
/**
 * Bei eingeschaltetem Schalter (`pukalani.onboarding.operatorTerms`) ein
 * Kästchen im letzten Schritt; ohne Häkchen bleibt „Anlegen" gesperrt. Die
 * Autorität ist der Server — er lehnt die Anlage ohne `operatorTerms: true`
 * ab und hält die Fassung fest.
 *
 * Das Häkchen lebt BEWUSST nur in dieser Seite, nicht im Entwurf: wer
 * wiederkommt, bestätigt neu — eine Zustimmung von gestern aus dem
 * sessionStorage wäre keine, die der Mensch in diesem Moment gegeben hat.
 */
const appConfig = useAppConfig() as { pukalani?: { onboarding?: { operatorTerms?: OperatorTermsConfig } } }
const operatorTerms = computed(() => resolveOperatorTerms(appConfig.pukalani?.onboarding?.operatorTerms))
const operatorTermsUrl = computed(() => operatorTerms.value ? operatorTermsHref(operatorTerms.value, locale.value) : '')
const operatorTermsAccepted = ref(false)
const canCreate = computed(() => !operatorTerms.value || operatorTermsAccepted.value)

// ── Anlegen ─────────────────────────────────────────────────────────────────
const creating = ref(false)
const createError = ref('')

async function create() {
  if (creating.value || !canCreate.value) return
  creating.value = true
  createError.value = ''
  try {
    const site = await $fetch<{ communityId: string, host: string, url: string, trialEndsAt: string | null }>('/api/onboarding/site', {
      method: 'POST',
      body: {
        name: (draft.value.name ?? '').trim(),
        slug: draft.value.slug,
        category: draft.value.category,
        vibe: draft.value.vibe,
        // Bei OFFENEM Tor (U2) gibt es keinen Code, und ein leerer Wert wäre
        // ein 400 aus dem Schema statt einer Anlage. Weggelassen heißt hier
        // wirklich „keiner" — geprüft wird er ohnehin nur, wenn das Control
        // Plane das Tor geschlossen meldet.
        ...(draft.value.inviteCode ? { inviteCode: draft.value.inviteCode } : {}),
        locale: locale.value,
        // Nur bei eingeschaltetem Schalter — und dann ist es nach `canCreate` gesetzt.
        ...(operatorTerms.value ? { operatorTerms: operatorTermsAccepted.value } : {}),
      },
    })
    /**
     * Trichter-Punkt „angelegt" (U18) — HIER und nicht auf der Abschluss-Seite:
     * `/start/done` ist eine Adresse mit Query, die man neu laden, teilen und
     * über den Zurück-Knopf wieder betreten kann. Gezählt würde dort der
     * BESUCH, nicht das Ereignis.
     */
    trackFunnel('funnel_site_created')
    // NUR die Id — die Adresse holt sich die Abschluss-Seite aus der eigenen
    // Mitgliedschafts-Liste. Ein `host` in der Query war der Einstieg für die
    // Handoff-Übernahme (Audit 2026-08-02) und darf hier nicht wieder auftauchen.
    await navigateTo({ path: localePath('/start/done'), query: { site: site.communityId } })
  }
  catch (error) {
    const status = (error as { status?: number, statusCode?: number }).status
      ?? (error as { statusCode?: number }).statusCode
    // Jede Ablehnung bekommt einen Satz, der sagt, was JETZT zu tun ist.
    // `email_unverified` (Audit 2026-08-02) ist der einzige Grund, den das
    // Control Plane hier namentlich nennt — er sagt, was zu tun ist, und ohne
    // ihn stünde ein eingeladener Kunde vor „gilt nicht mehr", obwohl sein Code
    // in Ordnung ist. Der Weg zur Bestätigung steht schon im Schritt 0.
    const reason = (error as { data?: { reason?: string } }).data?.reason
    createError.value = status === 409
      ? t('onboarding.errors.hostTaken')
      : status === 403
        ? (reason === 'email_unverified'
            ? t('onboarding.errors.verifyFirst')
            : t('onboarding.errors.notAllowed'))
        : status === 400
          ? (reason === OPERATOR_TERMS_REQUIRED_CODE
              ? t('onboarding.errors.operatorTermsRequired')
              : t('onboarding.errors.invalid'))
          : t('onboarding.errors.unavailable')
  }
  finally {
    creating.value = false
  }
}

const summaryRows = computed(() => [
  { label: t('onboarding.summary.name'), value: draft.value.name ?? '' },
  { label: t('onboarding.summary.address'), value: host.value },
  { label: t('onboarding.summary.category'), value: draft.value.category ? t(`onboarding.categories.${draft.value.category}.label`) : '' },
  { label: t('onboarding.summary.vibe'), value: draft.value.vibe ? t(`onboarding.vibes.${draft.value.vibe}.label`) : '' },
].filter(row => row.value))

useBrandTitle(() => `${t(`onboarding.steps.${step.value}.title`)} · ${t('onboarding.gate.title')}`)
</script>

<template>
  <div class="space-y-8">
    <OnboardingProgress
      :current="index + 1"
      :total="STEPS.length"
      :label="t('onboarding.progress', { step: index + 1, total: STEPS.length })"
    />

    <div class="space-y-2">
      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
        {{ step === 'basics' ? t('onboarding.steps.basics.heading', { name: auth.user?.name || t('onboarding.gate.fallbackName') }) : t(`onboarding.steps.${step}.title`) }}
      </h1>
      <p class="text-muted">{{ t(`onboarding.steps.${step}.intro`) }}</p>
    </div>

    <form class="space-y-8" @submit.prevent="step === 'summary' ? create() : next()">
      <!-- 1 · Name und Adresse -->
      <template v-if="step === 'basics'">
        <div class="space-y-6">
          <UFormField :label="t('onboarding.fields.name')" :description="t('onboarding.fields.nameHint')">
            <UInput
              v-model="draft.name"
              :placeholder="t('onboarding.fields.namePlaceholder')"
              size="lg"
              class="w-full"
              autofocus
            />
          </UFormField>

          <UFormField :label="t('onboarding.fields.address')">
            <div class="flex items-stretch">
              <UInput
                v-model="draft.slug"
                :placeholder="t('onboarding.fields.addressPlaceholder')"
                size="lg"
                class="w-full"
                :ui="{ base: 'rounded-e-none' }"
                @input="draft.slugTouched = true"
              />
              <span class="flex select-none items-center rounded-e-md border border-s-0 border-accented bg-elevated px-3 text-sm text-muted">
                .{{ OPERATOR_APEX }}
              </span>
            </div>
            <template #help>
              <span v-if="slugState === 'checking'" class="text-muted">{{ t('onboarding.fields.addressChecking') }}</span>
              <span v-else-if="slugState === 'free'" class="text-success">{{ t('onboarding.fields.addressFree', { host }) }}</span>
              <span v-else-if="slugState === 'taken'" class="text-error">{{ t('onboarding.fields.addressTaken') }}</span>
              <span v-else-if="slugState === 'error'" class="text-warning">{{ t('onboarding.fields.addressUnknown') }}</span>
              <span v-else class="text-dimmed">{{ t('onboarding.fields.addressHint') }}</span>
            </template>
          </UFormField>
        </div>
      </template>

      <!-- 2 · Kategorie -->
      <OnboardingChoices
        v-else-if="step === 'category'"
        v-model="draft.category"
        name="category"
        :options="categoryOptions"
        :legend="t('onboarding.steps.category.title')"
      />

      <!-- 3 · Vibe -->
      <OnboardingVibePicker
        v-else-if="step === 'vibe'"
        :model-value="draft.vibe"
        @update:model-value="(value: SiteVibeId) => draft.vibe = value"
      />

      <!-- 4 · Zusammenfassung -->
      <template v-else-if="step === 'summary'">
        <div class="space-y-6">
          <dl class="divide-y divide-default overflow-hidden rounded-xl border border-default">
            <div v-for="row in summaryRows" :key="row.label" class="flex flex-wrap gap-1 px-4 py-3 sm:flex-nowrap sm:gap-4">
              <dt class="w-40 shrink-0 text-sm text-muted">{{ row.label }}</dt>
              <dd class="min-w-0 break-words text-sm font-medium">{{ row.value }}</dd>
            </div>
          </dl>

          <div class="flex items-start gap-3 rounded-xl border border-default p-4">
            <UIcon name="i-ph-clock-countdown" class="mt-0.5 size-5 shrink-0 text-primary" />
            <div class="space-y-1 text-sm">
              <p class="font-medium">{{ t('onboarding.summary.trialTitle') }}</p>
              <p class="text-muted">{{ t('onboarding.summary.trialBody') }}</p>
            </div>
          </div>

          <div v-if="operatorTerms" class="space-y-1" data-operator-terms>
            <UCheckbox v-model="operatorTermsAccepted" name="operatorTerms" :label="t('onboarding.summary.operatorTermsLabel')" />
            <p v-if="operatorTerms.draft" class="ps-6 text-xs text-muted" data-operator-terms-draft>
              {{ t('onboarding.summary.operatorTermsDraftNotice') }}
            </p>
            <p class="ps-6">
              <ULink :to="operatorTermsUrl" target="_blank" class="text-sm text-muted hover:text-primary">
                {{ t('onboarding.summary.operatorTermsLink') }}
              </ULink>
            </p>
          </div>

          <p v-if="createError" class="flex items-start gap-2 text-sm text-error">
            <UIcon name="i-ph-warning-circle" class="mt-0.5 size-4 shrink-0" />
            {{ createError }}
          </p>
        </div>
      </template>

      <!-- Steuerung -->
      <div class="flex items-center justify-between gap-3 border-t border-default pt-6">
        <UButton v-if="canGoBack" type="button" color="neutral" variant="ghost" icon="i-ph-arrow-left" @click="back">
          {{ t('onboarding.back') }}
        </UButton>
        <!-- Platzhalter, damit der Weiter-Knopf rechts stehen bleibt, wenn es
             nichts zurück zu gehen gibt (justify-between). -->
        <span v-else />

        <UButton
          v-if="step === 'summary'"
          type="submit"
          size="lg"
          :loading="creating"
          :disabled="!canCreate"
          trailing-icon="i-ph-check"
        >
          {{ t('onboarding.create') }}
        </UButton>
        <UButton
          v-else
          type="submit"
          size="lg"
          :disabled="!canContinue"
          trailing-icon="i-ph-arrow-right"
        >
          {{ t('onboarding.next') }}
        </UButton>
      </div>
    </form>
  </div>
</template>
