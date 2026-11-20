<script setup lang="ts">
import { isBotCheckReason, type BotCheckReason } from '../../../../../packages/core/shared/turnstile'
import { CONTACT } from '../../data/contact'
import {
  BUDGET_OPTIONS,
  GOAL_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  SETUP_OPTIONS,
  TEAM_SIZE_OPTIONS,
  TIMING_OPTIONS,
  WIZARD_ERRORS,
  WIZARD_META,
  WIZARD_QUESTIONS,
  WIZARD_STEPS,
  WIZARD_SUCCESS,
  WIZARD_TRUST,
  WIZARD_UI,
} from '../../data/erstgespraech'
import type { Lang } from '../../data/localized'
import type {
  IntroBudget,
  IntroCallRequest,
  IntroCallResponse,
  IntroProjectType,
  IntroSetup,
  IntroTeamSize,
  IntroTiming,
} from '#shared/types/introCall'
import { breadcrumbList } from '../../utils/schema'

/**
 * Der Erstgespräch-Wizard (W1) — das EINE Conversion-Ziel dieser Site.
 *
 * WARUM EIN WIZARD UND NICHT DER DIREKTE cal.com-LINK: der Direktlink hat null
 * Vorqualifizierung und lässt jeden stehen, der noch nicht buchen will. Fünf
 * kurze Schritte sind zugleich Lead-Formular, Vorqualifizierung und
 * Gesprächsvorbereitung — wer durchklickt, hat investiert, und das Gespräch
 * startet mit Ziel, Budget, Reifegrad und Zeitrahmen auf dem Tisch.
 *
 * KEIN SERVER-ROUNDTRIP VOR DEM ABSENDEN. Alle Antworten liegen im Client-State,
 * „Zurück" behält sie. Erst Schritt 5 spricht mit `POST /api/intro-call`; ein
 * Zwischenspeichern je Schritt wäre eine Datenspur über Leute, die abbrechen —
 * und die haben sich bewusst gegen das Absenden entschieden.
 *
 * DIE ERFOLGSANSICHT ERSETZT DEN WIZARD AUF DERSELBEN ADRESSE (kein Redirect
 * auf /danke): eine eigene Danke-Seite ist per Zurück-Taste und per Direktlink
 * erreichbar und behauptet dann eine Absendung, die es nie gab.
 */
definePageMeta({ layout: 'site' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { trackFunnel } = useFunnelEvent()

const lang = computed<Lang>(() => (locale.value.startsWith('de') ? 'de' : 'en'))

const STEP_COUNT = WIZARD_STEPS.length

/** Die Felder, die eine eigene Fehlerzeile tragen können. */
type FieldKey =
  | 'goals' | 'projectType' | 'budget' | 'teamSize' | 'currentSetup' | 'timing'
  | 'name' | 'company' | 'email' | 'privacy' | 'submit'

const step = ref(1)
const sent = ref(false)
const sending = ref(false)
/**
 * Fehler stehen als SCHLÜSSEL im State, nicht als fertiger Satz: sonst bliebe
 * nach einem Sprachwechsel mitten im Formular die alte Sprache stehen. Eine
 * `Map` statt eines Objekts, damit „Fehler wegnehmen" ein `delete` mit
 * berechnetem Schlüssel bleiben darf (auf einem Objekt verbietet ESLint das —
 * zu Recht, dort ist es eine Prototype-Falle).
 */
const errors = ref(new Map<FieldKey, keyof typeof WIZARD_ERRORS>())

/** Die fertige Fehlerzeile eines Feldes — leer heißt „kein Fehler". */
function errorText(field: FieldKey): string {
  const key = errors.value.get(field)
  return key ? WIZARD_ERRORS[key][lang.value] : ''
}

const form = reactive({
  goals: [] as string[],
  projectType: '' as IntroProjectType | '',
  industry: '',
  budget: '' as IntroBudget | '',
  teamSize: '' as IntroTeamSize | '',
  market: '',
  currentSetup: '' as IntroSetup | '',
  timing: '' as IntroTiming | '',
  note: '',
  name: '',
  company: '',
  email: '',
  phone: '',
  privacy: false,
  /** Honeypot — bleibt leer, solange ein Mensch tippt. */
  website: '',
})

function toggleGoal(id: string): void {
  const index = form.goals.indexOf(id)
  if (index === -1) form.goals.push(id)
  else form.goals.splice(index, 1)
  clear('goals')
}

function clear(...fields: FieldKey[]): void {
  for (const field of fields) errors.value.delete(field)
}

function fail(field: FieldKey, message: keyof typeof WIZARD_ERRORS): void {
  errors.value.set(field, message)
}

/**
 * Sind GENAU DIESE Felder fehlerfrei? Bewusst nicht „ist die Fehler-Ablage
 * leer": wer auf Schritt 5 einen Fehler stehen lässt und zurückgeht, hinge
 * sonst auf Schritt 1 fest — die Prüfung dort räumt die Kontakt-Fehler ja nicht.
 */
function ok(...fields: FieldKey[]): boolean {
  return fields.every(field => !errors.value.has(field))
}

/**
 * Prüfung EINES Schritts. Bewusst nicht „das ganze Formular am Ende": ein
 * Fehler, der vier Schritte später auffällt, wirft den Menschen zurück an eine
 * Stelle, die er längst hinter sich glaubte.
 */
function validateStep(current: number): boolean {
  if (current === 1) {
    clear('goals', 'projectType')
    if (form.goals.length === 0) fail('goals', 'goals')
    if (!form.projectType) fail('projectType', 'projectType')
    return ok('goals', 'projectType')
  }
  if (current === 2) {
    clear('budget')
    if (!form.budget) fail('budget', 'budget')
    return ok('budget')
  }
  if (current === 3) {
    clear('teamSize')
    if (!form.teamSize) fail('teamSize', 'teamSize')
    return ok('teamSize')
  }
  if (current === 4) {
    clear('currentSetup', 'timing')
    if (!form.currentSetup) fail('currentSetup', 'currentSetup')
    if (!form.timing) fail('timing', 'timing')
    return ok('currentSetup', 'timing')
  }
  clear('name', 'company', 'email', 'privacy', 'submit')
  if (!form.name.trim()) fail('name', 'name')
  if (!form.company.trim()) fail('company', 'company')
  // Absichtlich locker geprüft: die harte Prüfung macht Zod auf dem Server.
  // Hier geht es nur darum, den offensichtlichen Tippfehler zu fangen, bevor
  // jemand auf eine Serverantwort wartet.
  if (!form.email.trim()) fail('email', 'email')
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) fail('email', 'emailInvalid')
  if (!form.privacy) fail('privacy', 'privacy')
  return ok('name', 'company', 'email', 'privacy')
}

function goNext(): void {
  if (!validateStep(step.value)) return
  // Nur die Schritte 1–4 melden einen ABSCHLUSS; Schritt 5 ist das Absenden
  // und hat sein eigenes Ereignis.
  trackFunnel('studio_wizard_step', { step: String(step.value) })
  step.value += 1
}

function goBack(): void {
  if (step.value > 1) step.value -= 1
}

/**
 * BOT-PRÜFUNG (Turnstile, Aktion `portfolio_intro_call`, NF1 b). Ohne
 * Site-Key rendert das Widget nichts, `turnstileEnabled` ist `false`, der
 * Knopf bleibt offen und der Wizard schickt keinen Token — alles wie vorher.
 * Ein Token gilt EINMAL: nach jedem Fehlschlag `reset()`.
 */
const turnstileToken = ref('')
const botCheck = ref<{ reset: () => void } | null>(null)
const turnstileEnabled = Boolean(useRuntimeConfig().public.turnstileSiteKey)
const waitingForBotCheck = computed(() => turnstileEnabled && turnstileToken.value === '')

const BOT_CHECK_ERRORS: Record<BotCheckReason, keyof typeof WIZARD_ERRORS> = {
  bot_check_required: 'botCheckRequired',
  bot_check_failed: 'botCheckFailed',
  bot_check_unavailable: 'botCheckUnavailable',
}

async function submit(): Promise<void> {
  if (sending.value) return
  if (!validateStep(STEP_COUNT)) return
  // Nach der Prüfung stehen alle Pflicht-Auswahlen fest — hier festhalten,
  // damit der Typ die leere Zeichenkette nicht mehr enthält.
  const { projectType, budget, teamSize, currentSetup, timing } = form
  if (!projectType || !budget || !teamSize || !currentSetup || !timing) return

  clear('submit')
  sending.value = true
  const payload: IntroCallRequest = {
    goals: [...form.goals],
    projectType,
    industry: form.industry.trim() || undefined,
    budget,
    teamSize,
    market: form.market.trim() || undefined,
    currentSetup,
    timing,
    note: form.note.trim() || undefined,
    name: form.name.trim(),
    company: form.company.trim(),
    email: form.email.trim(),
    phone: form.phone.trim() || undefined,
    locale: lang.value,
    website: form.website,
    ...(turnstileToken.value ? { turnstileToken: turnstileToken.value } : {}),
  }

  try {
    // Nitros Routen-Typisierung ist projektweit aus — der Antworttyp wird hier
    // genannt und im Handler annotiert.
    await $fetch<IntroCallResponse>('/api/intro-call', { method: 'POST', body: payload })
    trackFunnel('studio_wizard_submitted', {
      goal: form.goals.join(','),
      budget,
      timing,
    })
    sent.value = true
  }
  catch (error) {
    // Ein Turnstile-Token ist EINMALIG: nach jedem Fehlschlag ein neuer.
    botCheck.value?.reset()
    // Der Grund bleibt draußen: der Server nennt ihn bewusst nicht, und ein
    // „500" hilft dem Absender nicht weiter. Der zweite Weg (E-Mail) steht im
    // Text. Einzige Ausnahme sind die Gründe der Bot-Prüfung (`reason` im
    // Envelope, core/server/error.ts) — die kann der Mensch beheben.
    const reason = (error as { data?: { reason?: string } })?.data?.reason
    fail('submit', isBotCheckReason(reason) ? BOT_CHECK_ERRORS[reason] : 'submit')
  }
  finally {
    sending.value = false
  }
}

/** Enter im Formular: auf den Zwischenschritten „Weiter", erst zuletzt absenden. */
function onFormSubmit(): void {
  if (step.value < STEP_COUNT) goNext()
  else void submit()
}

/**
 * `ready` stempelt `data-ready` an die Wizard-Sektion — das Hydrations-Signal
 * für die E2E-Spec. Ein Klick VOR der Hydration ist ein toter SSR-Klick
 * (F10-Lektion aus den Embed-Specs: `#__nuxt.__vue_app__` reicht nicht, weil
 * der Seiten-Teilbaum unter `<Suspense>` erst danach hydratisiert); dieses
 * Attribut entsteht dagegen IM Teilbaum selbst und lügt deshalb nicht.
 */
const ready = ref(false)
onMounted(() => {
  ready.value = true
  trackFunnel('studio_wizard_start')
})

usePortfolioSeo({
  path: '/erstgespraech',
  title: () => WIZARD_META.title[lang.value],
  description: () => WIZARD_META.description[lang.value],
  ogType: 'website',
  // Bewusst schlank: das ist ein Formular, kein Angebot und kein Artikel — ein
  // `Service`-Knoten hier wäre eine zweite, konkurrierende Beschreibung der
  // Leistungen, die vollständig auf der Startseite steht.
  graph: ctx => [
    {
      '@type': 'WebPage',
      '@id': `${ctx.pageUrl}#webpage`,
      'url': ctx.pageUrl,
      'name': WIZARD_META.title[lang.value],
      'description': WIZARD_META.description[lang.value],
      'inLanguage': lang.value,
      'isPartOf': { '@id': ctx.websiteId },
      'breadcrumb': { '@id': `${ctx.pageUrl}#breadcrumb` },
    },
    breadcrumbList(ctx.pageUrl, [
      { name: t('portfolio.common.home'), item: ctx.homeUrl },
      { name: WIZARD_META.breadcrumb[lang.value], item: ctx.pageUrl },
    ]),
  ],
})
</script>

<template>
  <div>
    <header class="page-head">
      <div class="container reveal">
        <nav :aria-label="t('portfolio.common.contents')">
          <ol class="breadcrumb">
            <li><NuxtLink :to="localePath('/')">{{ t('portfolio.common.home') }}</NuxtLink></li>
            <li aria-hidden="true">→</li>
            <li aria-current="page">{{ WIZARD_META.breadcrumb[lang] }}</li>
          </ol>
        </nav>
        <h1 class="page-head__title">{{ WIZARD_META.heading[lang] }}</h1>
        <p class="page-head__intro">{{ WIZARD_META.intro[lang] }}</p>
      </div>
    </header>

    <section class="section wizard" :data-ready="ready ? 'true' : undefined" aria-labelledby="wizard-step-title">
      <div class="container wizard__grid">
        <!-- SCHRITT-LEISTE: auf breiten Viewports links, auf schmalen eine
             kompakte Fortschrittszeile oben (siehe Media Query unten). -->
        <aside v-if="!sent" class="wizard__aside" :aria-label="WIZARD_META.breadcrumb[lang]">
          <ol class="stepper">
            <li
              v-for="(entry, index) in WIZARD_STEPS"
              :key="entry.title.en"
              class="stepper__item"
              :class="{
                'stepper__item--active': step === index + 1,
                'stepper__item--done': step > index + 1,
              }"
              :aria-current="step === index + 1 ? 'step' : undefined"
            >
              <span class="stepper__index" aria-hidden="true">{{ step > index + 1 ? '✓' : index + 1 }}</span>
              <span class="stepper__label">{{ entry.title[lang] }}</span>
            </li>
          </ol>
          <ul class="stepper__trust">
            <li v-for="line in WIZARD_TRUST" :key="line.en">{{ line[lang] }}</li>
          </ul>
        </aside>

        <!-- ERFOLG: ersetzt den Wizard, buchen steht vorne. -->
        <div v-if="sent" class="wizard__main wizard__main--done">
          <h2 id="wizard-step-title" class="section-title">{{ WIZARD_SUCCESS.title[lang] }}</h2>
          <p class="section-lead">{{ WIZARD_SUCCESS.lead[lang] }}</p>
          <div class="wizard__actions">
            <a
              :href="CONTACT.calLink"
              target="_blank"
              rel="noopener nofollow"
              class="btn btn--solid"
              @click="trackFunnel('studio_booking_click')"
            >
              {{ WIZARD_SUCCESS.bookCta[lang] }} →
            </a>
          </div>
          <p class="section-note">{{ WIZARD_SUCCESS.fallback[lang] }}</p>
        </div>

        <form v-else class="wizard__main" novalidate @submit.prevent="onFormSubmit">
          <p class="wizard__count">
            {{ WIZARD_UI.stepOf[lang] }} {{ step }} {{ WIZARD_UI.stepSeparator[lang] }} {{ STEP_COUNT }}
          </p>
          <h2 id="wizard-step-title" class="section-title wizard__title">
            {{ WIZARD_STEPS[step - 1]?.title[lang] }}
          </h2>
          <p class="section-lead wizard__micro">{{ WIZARD_STEPS[step - 1]?.microcopy[lang] }}</p>

          <!-- SCHRITT 1: ZIEL ------------------------------------------- -->
          <template v-if="step === 1">
            <fieldset class="field">
              <legend class="field__label">{{ WIZARD_QUESTIONS.goals.label[lang] }}</legend>
              <p class="field__hint">{{ WIZARD_QUESTIONS.goals.hint[lang] }}</p>
              <div class="opts">
                <label
                  v-for="option in GOAL_OPTIONS"
                  :key="option.id"
                  class="opt"
                  :class="{ 'opt--on': form.goals.includes(option.id) }"
                >
                  <input
                    type="checkbox"
                    class="opt__input"
                    :value="option.id"
                    :checked="form.goals.includes(option.id)"
                    @change="toggleGoal(option.id)"
                  >
                  <span class="opt__title">{{ option.title[lang] }}</span>
                  <span class="opt__note">{{ option.note[lang] }}</span>
                </label>
              </div>
              <p v-if="errorText('goals')" class="field__error" role="alert">{{ errorText('goals') }}</p>
            </fieldset>

            <fieldset class="field">
              <legend class="field__label">{{ WIZARD_QUESTIONS.projectType.label[lang] }}</legend>
              <p class="field__hint">{{ WIZARD_QUESTIONS.projectType.hint[lang] }}</p>
              <div class="opts">
                <label
                  v-for="option in PROJECT_TYPE_OPTIONS"
                  :key="option.id"
                  class="opt"
                  :class="{ 'opt--on': form.projectType === option.id }"
                >
                  <input
                    v-model="form.projectType"
                    type="radio"
                    class="opt__input"
                    name="projectType"
                    :value="option.id"
                    @change="clear('projectType')"
                  >
                  <span class="opt__title">{{ option.title[lang] }}</span>
                  <span class="opt__note">{{ option.note[lang] }}</span>
                </label>
              </div>
              <p v-if="errorText('projectType')" class="field__error" role="alert">
                {{ errorText('projectType') }}
              </p>
            </fieldset>
          </template>

          <!-- SCHRITT 2: PROJEKT ---------------------------------------- -->
          <template v-else-if="step === 2">
            <div class="field">
              <label class="field__label" for="intro-industry">{{ WIZARD_QUESTIONS.industry.label[lang] }}</label>
              <p class="field__hint">{{ WIZARD_QUESTIONS.industry.hint[lang] }}</p>
              <input
                id="intro-industry"
                v-model="form.industry"
                type="text"
                class="input"
                maxlength="120"
                autocomplete="organization-title"
                :placeholder="WIZARD_QUESTIONS.industry.placeholder[lang]"
              >
            </div>

            <fieldset class="field">
              <legend class="field__label">{{ WIZARD_QUESTIONS.budget.label[lang] }}</legend>
              <p class="field__hint">{{ WIZARD_QUESTIONS.budget.hint[lang] }}</p>
              <div class="opts">
                <label
                  v-for="option in BUDGET_OPTIONS"
                  :key="option.id"
                  class="opt"
                  :class="{ 'opt--on': form.budget === option.id }"
                >
                  <input
                    v-model="form.budget"
                    type="radio"
                    class="opt__input"
                    name="budget"
                    :value="option.id"
                    @change="clear('budget')"
                  >
                  <span class="opt__title">{{ option.title[lang] }}</span>
                  <span class="opt__note">{{ option.note[lang] }}</span>
                </label>
              </div>
              <p v-if="errorText('budget')" class="field__error" role="alert">{{ errorText('budget') }}</p>
            </fieldset>
          </template>

          <!-- SCHRITT 3: UNTERNEHMEN ------------------------------------ -->
          <template v-else-if="step === 3">
            <fieldset class="field">
              <legend class="field__label">{{ WIZARD_QUESTIONS.teamSize.label[lang] }}</legend>
              <p class="field__hint">{{ WIZARD_QUESTIONS.teamSize.hint[lang] }}</p>
              <div class="opts">
                <label
                  v-for="option in TEAM_SIZE_OPTIONS"
                  :key="option.id"
                  class="opt"
                  :class="{ 'opt--on': form.teamSize === option.id }"
                >
                  <input
                    v-model="form.teamSize"
                    type="radio"
                    class="opt__input"
                    name="teamSize"
                    :value="option.id"
                    @change="clear('teamSize')"
                  >
                  <span class="opt__title">{{ option.title[lang] }}</span>
                  <span class="opt__note">{{ option.note[lang] }}</span>
                </label>
              </div>
              <p v-if="errorText('teamSize')" class="field__error" role="alert">{{ errorText('teamSize') }}</p>
            </fieldset>

            <div class="field">
              <label class="field__label" for="intro-market">{{ WIZARD_QUESTIONS.market.label[lang] }}</label>
              <p class="field__hint">{{ WIZARD_QUESTIONS.market.hint[lang] }}</p>
              <input
                id="intro-market"
                v-model="form.market"
                type="text"
                class="input"
                maxlength="120"
                :placeholder="WIZARD_QUESTIONS.market.placeholder[lang]"
              >
            </div>
          </template>

          <!-- SCHRITT 4: STATUS & ZEITRAHMEN ---------------------------- -->
          <template v-else-if="step === 4">
            <fieldset class="field">
              <legend class="field__label">{{ WIZARD_QUESTIONS.currentSetup.label[lang] }}</legend>
              <p class="field__hint">{{ WIZARD_QUESTIONS.currentSetup.hint[lang] }}</p>
              <div class="opts">
                <label
                  v-for="option in SETUP_OPTIONS"
                  :key="option.id"
                  class="opt"
                  :class="{ 'opt--on': form.currentSetup === option.id }"
                >
                  <input
                    v-model="form.currentSetup"
                    type="radio"
                    class="opt__input"
                    name="currentSetup"
                    :value="option.id"
                    @change="clear('currentSetup')"
                  >
                  <span class="opt__title">{{ option.title[lang] }}</span>
                  <span class="opt__note">{{ option.note[lang] }}</span>
                </label>
              </div>
              <p v-if="errorText('currentSetup')" class="field__error" role="alert">
                {{ errorText('currentSetup') }}
              </p>
            </fieldset>

            <fieldset class="field">
              <legend class="field__label">{{ WIZARD_QUESTIONS.timing.label[lang] }}</legend>
              <p class="field__hint">{{ WIZARD_QUESTIONS.timing.hint[lang] }}</p>
              <div class="opts">
                <label
                  v-for="option in TIMING_OPTIONS"
                  :key="option.id"
                  class="opt"
                  :class="{ 'opt--on': form.timing === option.id }"
                >
                  <input
                    v-model="form.timing"
                    type="radio"
                    class="opt__input"
                    name="timing"
                    :value="option.id"
                    @change="clear('timing')"
                  >
                  <span class="opt__title">{{ option.title[lang] }}</span>
                  <span class="opt__note">{{ option.note[lang] }}</span>
                </label>
              </div>
              <p v-if="errorText('timing')" class="field__error" role="alert">{{ errorText('timing') }}</p>
            </fieldset>

            <div class="field">
              <label class="field__label" for="intro-note">{{ WIZARD_QUESTIONS.note.label[lang] }}</label>
              <p class="field__hint">{{ WIZARD_QUESTIONS.note.hint[lang] }}</p>
              <textarea
                id="intro-note"
                v-model="form.note"
                class="input input--area"
                rows="4"
                maxlength="4000"
                :placeholder="WIZARD_QUESTIONS.note.placeholder[lang]"
              />
            </div>
          </template>

          <!-- SCHRITT 5: KONTAKT ---------------------------------------- -->
          <template v-else>
            <div class="field">
              <label class="field__label" for="intro-name">{{ WIZARD_QUESTIONS.name.label[lang] }}</label>
              <input
                id="intro-name"
                v-model="form.name"
                type="text"
                class="input"
                maxlength="120"
                autocomplete="name"
                required
                :placeholder="WIZARD_QUESTIONS.name.placeholder[lang]"
                @input="clear('name')"
              >
              <p v-if="errorText('name')" class="field__error" role="alert">{{ errorText('name') }}</p>
            </div>

            <div class="field">
              <label class="field__label" for="intro-company">{{ WIZARD_QUESTIONS.company.label[lang] }}</label>
              <input
                id="intro-company"
                v-model="form.company"
                type="text"
                class="input"
                maxlength="120"
                autocomplete="organization"
                required
                :placeholder="WIZARD_QUESTIONS.company.placeholder[lang]"
                @input="clear('company')"
              >
              <p v-if="errorText('company')" class="field__error" role="alert">{{ errorText('company') }}</p>
            </div>

            <div class="field">
              <label class="field__label" for="intro-email">{{ WIZARD_QUESTIONS.email.label[lang] }}</label>
              <input
                id="intro-email"
                v-model="form.email"
                type="email"
                class="input"
                maxlength="254"
                autocomplete="email"
                required
                :placeholder="WIZARD_QUESTIONS.email.placeholder[lang]"
                @input="clear('email')"
              >
              <p v-if="errorText('email')" class="field__error" role="alert">{{ errorText('email') }}</p>
            </div>

            <div class="field">
              <label class="field__label" for="intro-phone">{{ WIZARD_QUESTIONS.phone.label[lang] }}</label>
              <p class="field__hint">{{ WIZARD_QUESTIONS.phone.hint[lang] }}</p>
              <input
                id="intro-phone"
                v-model="form.phone"
                type="tel"
                class="input"
                maxlength="40"
                autocomplete="tel"
                :placeholder="WIZARD_QUESTIONS.phone.placeholder[lang]"
              >
            </div>

            <!-- HONEYPOT: für Menschen unsichtbar, aus der Tab-Reihenfolge und
                 aus dem Vorlesen genommen. Ist er gefüllt, antwortet die Route
                 freundlich und schreibt nichts. -->
            <div class="hp" aria-hidden="true">
              <label for="intro-website">{{ WIZARD_QUESTIONS.honeypot.label[lang] }}</label>
              <input
                id="intro-website"
                v-model="form.website"
                type="text"
                tabindex="-1"
                autocomplete="off"
              >
            </div>

            <div class="field">
              <label class="consent">
                <input
                  v-model="form.privacy"
                  type="checkbox"
                  class="consent__box"
                  @change="clear('privacy')"
                >
                <span>
                  {{ WIZARD_QUESTIONS.privacy.before[lang] }}
                  <NuxtLink :to="localePath('/privacy')" class="link-accent" target="_blank">
                    {{ WIZARD_QUESTIONS.privacy.link[lang] }}
                  </NuxtLink>
                  {{ WIZARD_QUESTIONS.privacy.after[lang] }}
                </span>
              </label>
              <p v-if="errorText('privacy')" class="field__error" role="alert">{{ errorText('privacy') }}</p>
            </div>

            <AuthTurnstileWidget ref="botCheck" v-model="turnstileToken" action="portfolio_intro_call" />
          </template>

          <p v-if="errorText('submit')" class="field__error field__error--block" role="alert">
            {{ errorText('submit') }}
          </p>

          <div class="wizard__actions">
            <button v-if="step > 1" type="button" class="btn" @click="goBack">
              ← {{ WIZARD_UI.back[lang] }}
            </button>
            <button v-if="step < STEP_COUNT" type="button" class="btn btn--solid" @click="goNext">
              {{ WIZARD_UI.next[lang] }} →
            </button>
            <button v-else type="submit" class="btn btn--solid" :disabled="sending || waitingForBotCheck">
              {{ sending ? WIZARD_UI.submitting[lang] : WIZARD_UI.submit[lang] }}
            </button>
          </div>
        </form>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page-head__title {
  margin-top: 1.6rem;
  font-size: clamp(2rem, 5.2vw, 4rem);
  max-width: 20ch;
}
.page-head__intro {
  margin-top: 1.6rem;
  max-width: 62ch;
  color: var(--text-soft);
  font-size: clamp(1rem, 1.8vw, 1.15rem);
}

.wizard {
  padding-top: clamp(1rem, 3vw, 2rem);
}
.wizard__grid {
  display: grid;
  grid-template-columns: 16rem minmax(0, 1fr);
  gap: clamp(2rem, 5vw, 4rem);
  align-items: start;
}

/* SCHRITT-LEISTE ------------------------------------------------------- */
.wizard__aside {
  position: sticky;
  top: 6.5rem;
}
.stepper {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.stepper__item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--metal-text);
  font-size: 0.86rem;
  font-weight: 700;
}
.stepper__index {
  display: grid;
  place-items: center;
  width: 1.7rem;
  height: 1.7rem;
  flex: none;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 0.78rem;
  transition: border-color 0.3s var(--ease), background 0.3s var(--ease), color 0.3s var(--ease);
}
.stepper__item--active {
  color: var(--text);
}
.stepper__item--active .stepper__index {
  border-color: var(--accent);
  color: var(--accent);
}
.stepper__item--done {
  color: var(--text-soft);
}
.stepper__item--done .stepper__index {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}
.stepper__trust {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-top: 2rem;
  padding-top: 1.4rem;
  border-top: 1px solid var(--line);
  color: var(--metal-text);
  font-size: 0.8rem;
}

/* SCHRITT-INHALT ------------------------------------------------------- */
.wizard__main {
  min-width: 0;
  scroll-margin-top: 7rem;
}
.wizard__count {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--accent);
}
.wizard__title {
  margin-top: 0.5rem;
  font-size: clamp(1.5rem, 3.4vw, 2.4rem);
}
.wizard__micro {
  margin-top: 0.9rem;
  max-width: 56ch;
}

.field {
  margin-top: clamp(2rem, 4vw, 2.8rem);
  border: 0;
}
.field__label {
  display: block;
  font-family: "Syne", ui-sans-serif, system-ui, sans-serif;
  font-weight: 800;
  font-size: 1.05rem;
  letter-spacing: -0.01em;
}
.field__hint {
  margin-top: 0.35rem;
  color: var(--metal-text);
  font-size: 0.82rem;
}
.field__error {
  margin-top: 0.8rem;
  color: #ff9a9a;
  font-size: 0.85rem;
  font-weight: 700;
}
.field__error--block {
  margin-top: 2rem;
  max-width: 62ch;
  font-weight: 400;
}

/* AUSWAHL-KARTEN — der Radio/Checkbox bleibt im Markup (Tastatur, Vorlesen),
   sichtbar ist die Karte. `:focus-visible` sitzt deshalb am versteckten
   Element und färbt über `:has()` die Karte. */
.opts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
  margin-top: 1.1rem;
}
.opt {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  cursor: pointer;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  padding: 0.95rem 1.1rem;
  transition: border-color 0.25s var(--ease), background 0.25s var(--ease);
}
.opt:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}
.opt--on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}
.opt:has(.opt__input:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.opt__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.opt__title {
  font-weight: 700;
  font-size: 0.95rem;
}
.opt--on .opt__title {
  color: var(--accent);
}
.opt__note {
  color: var(--text-soft);
  font-size: 0.82rem;
  line-height: 1.5;
}

/* FREITEXT ------------------------------------------------------------- */
.input {
  display: block;
  width: 100%;
  max-width: 34rem;
  margin-top: 0.9rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  padding: 0.8rem 1rem;
  color: var(--text);
  font: inherit;
  font-size: 0.95rem;
  transition: border-color 0.25s var(--ease);
}
.input:focus-visible {
  outline: none;
  border-color: var(--accent);
}
.input::placeholder {
  color: var(--metal-text);
}
.input--area {
  max-width: 44rem;
  resize: vertical;
  line-height: 1.6;
}

.consent {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  max-width: 60ch;
  cursor: pointer;
  color: var(--text-soft);
  font-size: 0.9rem;
}
.consent__box {
  margin-top: 0.25rem;
  width: 1.1rem;
  height: 1.1rem;
  flex: none;
  accent-color: var(--accent);
}

/* Honeypot: unsichtbar, aber im DOM und im Formular — `display:none` würde
   von manchen Bots erkannt und ausgelassen. */
.hp {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}

.wizard__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin-top: clamp(2.2rem, 5vw, 3rem);
}
.wizard__actions .btn[disabled] {
  opacity: 0.6;
  cursor: progress;
}
.wizard__main--done {
  max-width: 52rem;
}

@media (max-width: 900px) {
  /* Schmale Viewports: aus der Seitenleiste wird eine Fortschrittszeile über
     dem Schritt — die Beschriftungen fallen weg, die Nummern bleiben. */
  .wizard__grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .wizard__aside {
    position: static;
  }
  .stepper {
    flex-direction: row;
    gap: 0.5rem;
  }
  .stepper__label {
    display: none;
  }
  .stepper__item--active .stepper__label {
    display: inline;
  }
  .stepper__trust {
    margin-top: 1.4rem;
    padding-top: 1rem;
  }
}
@media (max-width: 680px) {
  .opts {
    grid-template-columns: 1fr;
  }
}
</style>
