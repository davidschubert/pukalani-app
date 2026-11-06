<script setup lang="ts">
import { BRAND_INTRO_MESSAGE_MAX } from '../../schemas/brandIntroCall'
import { resolveBrandLegalLinks } from '../../shared/brandLegalLinks'
import type { BrandIntroCallResponse, BrandProfileListResponse } from '../../shared/types/brand'
import { brandJsonLdScript } from '../utils/brandJsonLd'

/**
 * DAS ERSTGESPRÄCH — `/erstgespraech` (BS1 Paket Z0; Plan
 * docs/plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md §4.1 (a), §7 Zeile Z0,
 * Davids Entscheidung 5 vom 2026-09-07).
 *
 * ── WAS DIESE SEITE ERSETZT ───────────────────────────────────────────────
 * Der eine Conversion-Weg dieser Marke zeigte bis R0 auf eine Route, die es
 * hier nicht gab (404), und seit R0 auf pukalani.studio — in einem neuen Tab,
 * auf einer fremden Marke, mitten im Trichter. Jetzt bleibt er im Haus.
 *
 * ── WARUM SIE IM LAYER LIEGT UND NICHT IN DER APP ─────────────────────────
 * `/about` und `/team` liegen bewusst in `apps/branding`: sie erzählen von
 * DIESEM Unternehmen, und der Layer ist host-agnostisch. Diese Seite ist das
 * Gegenteil — sie ist das ZIEL zweier Layer-Komponenten (`BwFoundationChapter`
 * und die Marktvergleich-Schranke), und ihr Ziel steht als Layer-Default in
 * `app.config.ts`. Läge sie in der App, wäre der Default des Layers wieder ein
 * Versprechen, das die App einlösen muss — genau der Zustand, den R0 abstellen
 * musste. Was der Layer verspricht, liefert der Layer.
 *
 * ── SIE IST ÖFFENTLICH, UND ZWAR MIT ABSICHT ──────────────────────────────
 * Kein `requireBrandAccess`, keine Anmeldung. Die eine Hälfte der Menschen,
 * die hier ankommen soll, kommt aus dem Brand-Check oder von `/about` und hat
 * kein Konto. Eine Anmelde-Wand vor dem Gesprächs-Einstieg wäre die teuerste
 * Hürde dieser Site.
 *
 * ── WER ANGEMELDET IST, TIPPT WENIGER ─────────────────────────────────────
 * Name und Adresse kommen aus dem Konto, die Marke aus der Werkstatt. Die
 * Branding-Auswahl wird NUR gezeigt, wenn die Liste wirklich etwas hergibt —
 * ein leeres Auswahlfeld wäre eine Frage ohne Antwortmöglichkeit. Für alle
 * anderen steht dort ein gewöhnliches Textfeld.
 *
 * `?profileId=` aus der Adresszeile wählt vor; die Route prüft die Id
 * anschliessend gegen die Datentür und VERWIRFT sie, wenn sie einem fremden
 * Konto gehört (`resolveBrandIntroProfileId`). Die Vorauswahl hier ist
 * Bequemlichkeit, nie ein Beweis.
 *
 * ── DIE DREI BREMSEN, VON DIESER SEITE AUS GESEHEN ────────────────────────
 * Der Honigtopf (`hp`) ist ein für Menschen unsichtbares Feld; die Uhr
 * (`elapsedMs`) läuft ab `onMounted`. Beide sind Client-Werte und damit
 * fälschbar — das ist bekannt und im Schema begründet. Die Bremse, die
 * wirklich zählt, ist die Drossel je IP in der Middleware.
 *
 * ── KEINE PREISE (G4) ─────────────────────────────────────────────────────
 * Diese Seite nennt keine Zahl. Was ein Brand Design kostet, entscheidet das
 * Gespräch — eine erfundene Zahl wäre teurer als eine fehlende.
 */
definePageMeta({ layout: 'default' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const appConfig = useAppConfig()
const { user, isLoggedIn } = useCurrentUser()

useSeoMeta({
  title: () => t('brand.introCall.seoTitle'),
  description: () => t('brand.introCall.seoDescription'),
  ogTitle: () => t('brand.introCall.hero.title'),
  ogDescription: () => t('brand.introCall.seoDescription'),
})

useHead({
  script: computed(() => [brandJsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    'name': t('brand.introCall.seoTitle'),
    'description': t('brand.introCall.seoDescription'),
    'inLanguage': locale.value,
  })]),
})

/* ── Die Felder ─────────────────────────────────────────────────────────── */

const name = ref('')
const email = ref('')
const company = ref('')
const message = ref('')
const phone = ref('')
const profileId = ref(typeof route.query.profileId === 'string' ? route.query.profileId : '')
const hp = ref('')

const status = ref<'idle' | 'sending' | 'done' | 'error'>('idle')
/** Der Grund des Fehlschlags, so weit die Route ihn preisgibt. */
const failure = ref<'too_fast' | 'rate_limited' | 'unavailable'>('unavailable')
/** Ist die Bestätigungs-Mail raus? Entscheidet den Erfolgstext (s. u.). */
const mailed = ref(false)

/**
 * DIE HERKUNFT. `?source=` ist der Normalfall (die Knöpfe der Werkstatt
 * hängen sie an); ohne sie steht `direct`, damit die Spalte nicht leer bleibt
 * und „unbekannt" von „direkt aufgerufen" unterscheidbar ist.
 */
const source = computed(() => {
  const raw = route.query.source
  return (typeof raw === 'string' && raw.trim()) ? raw.trim().slice(0, 64) : 'direct'
})

/**
 * DIE UHR DER DRITTEN BREMSE. `onMounted` und nicht `setup`: im SSR liefe sie
 * ab dem Server-Rendern, und eine Seite, die zehn Sekunden im Cache lag, wäre
 * dann sofort „langsam genug" — die Bremse misst den MENSCHEN, nicht die
 * Auslieferung.
 */
const mountedAt = ref(0)
onMounted(() => {
  mountedAt.value = Date.now()
})

/* ── Vorbelegung aus dem Konto ──────────────────────────────────────────── */

watchEffect(() => {
  if (!isLoggedIn.value) return
  // Nur in LEERE Felder — was jemand selbst getippt hat, überschreibt nichts
  // (dieselbe Regel wie bei der Website-Vorbelegung im Warteliste-Formular).
  if (!name.value && user.value?.name) name.value = user.value.name
  if (!email.value && user.value?.email) email.value = user.value.email
})

/**
 * DIE EIGENEN BRANDINGS — nur für Angemeldete, und fail-soft.
 *
 * `GET /api/brand/profiles` hängt an `requireBrandAccess` und antwortet für
 * ein Konto OHNE Beta-Zugang mit 404. Das ist hier kein Fehler, sondern der
 * erwartete Fall: dann gibt es eben nichts vorzubelegen, und das Textfeld
 * übernimmt. Deshalb `.catch(() => null)` statt einer Fehleranzeige — eine
 * rote Zeile über einer Bequemlichkeit wäre falsch gewichtet.
 *
 * `immediate: false` + Abruf erst im Browser: die Seite ist öffentlich und
 * soll im SSR keine Session-abhängige Abfrage machen (das wäre ein
 * Hydration-Unterschied, sobald sie einmal ohne Cookie gerendert im Cache
 * läge).
 */
const profiles = ref<BrandProfileListResponse['profiles']>([])
onMounted(async () => {
  if (!isLoggedIn.value) return
  const result = await $fetch<BrandProfileListResponse>('/api/brand/profiles').catch(() => null)
  profiles.value = result?.profiles ?? []
})

/** Nur zeigen, wenn die Liste etwas hergibt (s. Kopf). */
const showProfilePicker = computed(() => profiles.value.length > 0)

const profileItems = computed(() => [
  { label: t('brand.introCall.form.noBrand'), value: '' },
  ...profiles.value.map(profile => ({
    label: profile.title || t('brand.introCall.form.untitledBrand'),
    value: profile.id,
  })),
])

/**
 * Die gewählte Marke füllt das Firmenfeld mit — der Betreiber liest die Zeile
 * sonst als „Branding abc123" ohne Namen. Nur in ein LEERES Feld, aus
 * demselben Grund wie oben.
 */
watch(profileId, (value) => {
  if (!value) return
  const picked = profiles.value.find(profile => profile.id === value)
  if (picked?.title && !company.value) company.value = picked.title
})

/* ── Absenden ───────────────────────────────────────────────────────────── */

const remaining = computed(() => BRAND_INTRO_MESSAGE_MAX - message.value.trim().length)

const canSend = computed(() => status.value !== 'sending'
  && name.value.trim().length > 0
  && message.value.trim().length > 0
  && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()))

async function submit(): Promise<void> {
  if (!canSend.value) return
  status.value = 'sending'
  try {
    const result = await $fetch<BrandIntroCallResponse>('/api/brand/intro-call', {
      method: 'POST',
      body: {
        name: name.value.trim(),
        email: email.value.trim(),
        company: company.value.trim(),
        message: message.value.trim(),
        phone: phone.value.trim(),
        locale: locale.value === 'de' ? 'de' : 'en',
        source: source.value,
        profileId: profileId.value,
        // 0 heisst „noch nie montiert" — dann wird das Feld weggelassen, statt
        // eine Dauer zu melden, die es nicht gibt (das Schema lässt es zu).
        ...(mountedAt.value ? { elapsedMs: Date.now() - mountedAt.value } : {}),
        hp: hp.value,
      },
    })
    mailed.value = result.mailed
    status.value = 'done'
  }
  catch (error) {
    // Die Route trägt ihren Grund als `reason` im Envelope (core/server/
    // error.ts). Ehrlich unterscheiden heisst hier: „zu schnell" ist ein
    // Hinweis, „zu oft" eine Bitte um Geduld, alles andere ein Ausfall.
    const reason = (error as { data?: { reason?: string } })?.data?.reason
    const statusCode = (error as { statusCode?: number, status?: number })?.statusCode
      ?? (error as { status?: number })?.status
    failure.value = reason === 'too_fast'
      ? 'too_fast'
      : statusCode === 429 ? 'rate_limited' : 'unavailable'
    status.value = 'error'
  }
}

/**
 * DER DATENSCHUTZ-LINK kommt aus DEMSELBEN Schalter wie der Fuss
 * (`pukalani.brand.legalLinks`, BS1 R1) und nicht als getippter Pfad. Grund:
 * eine App ohne den `pages`-Layer hat `/privacy` nicht, und ein Link ins 404
 * unter einer Einwilligungs-Zeile ist schlechter als gar keiner — genau die
 * Regel, die `brandLegalLinks.ts` für den Fuss aufstellt. Fehlt der Eintrag,
 * steht der Hinweis als reiner Text da.
 */
const privacyLink = computed(() =>
  resolveBrandLegalLinks(appConfig.pukalani?.brand?.legalLinks).find(link => link.id === 'privacy') ?? null)

const STEPS = ['s1', 's2', 's3'] as const
</script>

<template>
  <div class="pb-10">
    <div class="@container mx-auto max-w-7xl">
      <!-- 1 · Hero mit dem Formular -->
      <section class="bw-card mt-10 grid items-start gap-10 p-10 @lg:grid-cols-[minmax(0,1fr)_28rem] @lg:p-14" data-intro-hero>
        <div class="min-w-0">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
            {{ t('brand.introCall.hero.eyebrow') }}
          </p>
          <h1 class="mt-4 max-w-xl text-balance text-5xl font-extralight leading-tight tracking-tight sm:text-6xl">
            {{ t('brand.introCall.hero.title') }}
          </h1>
          <p class="mt-5 max-w-lg text-lg leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t('brand.introCall.hero.lead') }}
          </p>

          <ol class="mt-10 space-y-5">
            <li v-for="(step, index) in STEPS" :key="step" class="flex gap-4">
              <span
                class="bw-label mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full"
                style="background: var(--bw-accent-soft); color: var(--bw-ink)"
              >{{ index + 1 }}</span>
              <div class="min-w-0">
                <p class="font-medium tracking-tight">{{ t(`brand.introCall.steps.${step}Title`) }}</p>
                <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
                  {{ t(`brand.introCall.steps.${step}Body`) }}
                </p>
              </div>
            </li>
          </ol>
        </div>

        <!-- Das Formular. Erfolg und Fehler tauschen es aus, nicht ergänzen es:
             ein abgeschicktes Formular, das weiter dasteht, lädt zum zweiten
             Absenden ein. -->
        <div class="min-w-0">
          <div v-if="status === 'done'" class="bw-frame p-6" style="background: var(--bw-accent-soft)" data-intro-done>
            <p class="font-medium tracking-tight" style="color: var(--bw-ink)">
              {{ t('brand.introCall.done.title') }}
            </p>
            <p class="mt-1.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
              {{ mailed ? t('brand.introCall.done.bodyMailed') : t('brand.introCall.done.body') }}
            </p>
          </div>

          <form v-else class="space-y-3" data-intro-form @submit.prevent="submit">
            <UInput
              v-model="name" type="text" name="name" autocomplete="name" required size="lg"
              :placeholder="t('brand.introCall.form.namePlaceholder')" :aria-label="t('brand.introCall.form.name')"
              class="w-full"
            />
            <UInput
              v-model="email" type="email" name="email" autocomplete="email" required size="lg"
              :placeholder="t('brand.introCall.form.emailPlaceholder')" :aria-label="t('brand.introCall.form.email')"
              class="w-full"
            />

            <!-- Drittes Feld, zwei Gestalten (s. Kopf): Auswahl für den, der
                 aus der Werkstatt kommt, Textfeld für alle anderen. -->
            <USelect
              v-if="showProfilePicker"
              v-model="profileId" :items="profileItems" size="lg"
              :aria-label="t('brand.introCall.form.brand')" class="w-full"
            />
            <UInput
              v-else
              v-model="company" type="text" name="organization" autocomplete="organization" size="lg"
              :placeholder="t('brand.introCall.form.companyPlaceholder')" :aria-label="t('brand.introCall.form.company')"
              class="w-full"
            />

            <UTextarea
              v-model="message" name="message" required :rows="5" size="lg"
              :maxlength="BRAND_INTRO_MESSAGE_MAX"
              :placeholder="t('brand.introCall.form.messagePlaceholder')"
              :aria-label="t('brand.introCall.form.message')"
              class="w-full"
            />
            <p class="bw-label text-right" style="color: var(--bw-muted)">
              {{ t('brand.introCall.form.remaining', { count: remaining }) }}
            </p>

            <UInput
              v-model="phone" type="tel" name="tel" autocomplete="tel" size="lg"
              :placeholder="t('brand.introCall.form.phonePlaceholder')" :aria-label="t('brand.introCall.form.phone')"
              class="w-full"
            />

            <!-- Honeypot: für Menschen unsichtbar und unerreichbar (s. Kopf). -->
            <div class="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
              <input v-model="hp" type="text" name="hp" tabindex="-1" autocomplete="off">
            </div>

            <UButton
              type="submit" size="lg" class="rounded-full" :disabled="!canSend" :loading="status === 'sending'"
              :label="status === 'sending' ? t('brand.introCall.form.sending') : t('brand.introCall.form.submit')"
            />

            <p v-if="status === 'error'" class="text-sm" style="color: var(--bw-stale)" data-intro-error>
              {{ t(`brand.introCall.form.error.${failure}`) }}
            </p>

            <p class="bw-label leading-relaxed" style="color: var(--bw-muted)">
              {{ t('brand.introCall.form.consent') }}
              <NuxtLink
                v-if="privacyLink" :to="localePath(privacyLink.to)" class="underline underline-offset-2"
              >{{ t('brand.legal.privacy') }}</NuxtLink>
            </p>
          </form>
        </div>
      </section>

      <!-- 2 · Was das Gespräch ist und was nicht -->
      <section class="mt-24" data-intro-what>
        <div class="mx-auto max-w-3xl text-center">
          <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
            {{ t('brand.introCall.what.eyebrow') }}
          </p>
          <h2 class="mt-3 text-balance text-3xl font-extralight tracking-tight sm:text-4xl">
            {{ t('brand.introCall.what.title') }}
          </h2>
          <p class="mx-auto mt-5 max-w-2xl text-base leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ t('brand.introCall.what.body') }}
          </p>
          <p class="bw-label mx-auto mt-4 max-w-2xl leading-relaxed" style="color: var(--bw-muted)">
            {{ t('brand.introCall.what.honest') }}
          </p>
        </div>
      </section>
    </div>
  </div>
</template>
