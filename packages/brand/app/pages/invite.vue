<script setup lang="ts">
import { inviteViewState } from '../../shared/brandInviteView'
import type { BrandInviteCheckResponse, BrandInviteRedeemResponse } from '../../shared/types/brand'

/**
 * EINLADUNG EINLÖSEN — die Landestelle des Beta-Links (`/invite?code=…`).
 *
 * Der Server konnte den Zugang schon vor dieser Seite vollständig: die
 * Kontoanlage nimmt einen `admissionCode` (Admission-Naht),
 * `POST /api/brand/invite/check` beurteilt einen Code neutral, und
 * `POST /api/brand/invite/redeem` löst ihn NACH der E-Mail-Verifizierung ein.
 * Es fehlte genau der Weg dorthin — kein Formular schickte einen Code, keine
 * Seite las `?code=`. Diese Seite ist dieser Weg und sonst nichts.
 *
 * ── SIE ENTSCHEIDET NICHTS SELBST ─────────────────────────────────────────
 * Was sie zeigt, sagt `inviteViewState()` (shared/brandInviteView.ts) — EINE
 * pure Funktion, vollständig getestet. Im Template steht deshalb kein
 * verschachteltes `v-if` über fünf Bedingungen, sondern ein Zustand.
 *
 * ── DAS COOKIE IST FÜR DEN MAIL-UMWEG DA ──────────────────────────────────
 * Zwischen „Code geprüft" und „Code eingelöst" liegt die Bestätigungs-Mail.
 * Deren Link öffnet sehr oft einen NEUEN Tab, und der trägt die Query nicht
 * mit: die Person käme mit gültiger Session zurück, aber ohne Code, und stünde
 * wieder vor dem leeren Feld. `brand_invite_code` überbrückt genau diese Lücke
 * (7 Tage, `lax`, denn er reist nur bei eigener Navigation mit). Die QUERY
 * gewinnt immer — wer einen zweiten Link öffnet, meint den zweiten Code. Nach
 * erfolgreicher Einlösung wird das Cookie gelöscht; es hat dann keine Aufgabe
 * mehr, und ein liegengebliebener Code ist ein Code, der irgendwann in einem
 * fremden Browserprofil auftaucht.
 *
 * ── ÖFFENTLICH, ABSICHTLICH ───────────────────────────────────────────────
 * Kein `auth`-Guard: der Empfänger einer Einladung hat typischerweise noch
 * kein Konto. Ein Guard schickte ihn auf `/login`, und dort hilft ihm niemand.
 * Die drei Vorbedingungen der Einlösung (Konto, bestätigte Adresse, gültiger
 * Code) sind hier deshalb Zustände der Seite und keine Sperren davor.
 *
 * ── DIE AUTOMATIK LÄUFT NUR IM BROWSER ────────────────────────────────────
 * `redeem` SCHREIBT (eine `brand_access`-Zeile, ein Stempel auf der
 * Einladung). Ein Schreibvorgang beim SSR-Rendern liefe bei jedem Vorab-Abruf
 * eines Link-Scanners mit — deshalb `onMounted` und ein Wächter gegen den
 * zweiten Aufruf. Die Route selbst ist idempotent; das entschuldigt nur keinen
 * überflüssigen Ruf.
 */
definePageMeta({ layout: 'default' })

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const request = useRequestFetch()
const { user, isLoggedIn } = useCurrentUser()

useBrandTitle(() => t('brand.invite.title'))

/** Sieben Tage — dieselbe Grössenordnung wie die Frist einer Einladung. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7

const inviteCookie = useCookie<string | null>('brand_invite_code', {
  maxAge: COOKIE_MAX_AGE,
  sameSite: 'lax',
  path: '/',
})

const queryCode = computed(() => {
  const value = route.query.code
  return typeof value === 'string' ? value.trim() : ''
})
/** Query schlägt Cookie (s. Kopf). */
const code = computed(() => queryCode.value || inviteCookie.value?.trim() || '')

/**
 * EINMAL fragen, ob der Code taugt. Über `useRequestFetch`, damit der Abruf
 * beim SSR dieselbe Herkunft trägt wie der Seitenaufruf (die Route ist
 * gedrosselt, Bucket `brand:invite`).
 *
 * Ein Fehler ist hier KEIN Fehler, sondern ein `false`: die Route antwortet
 * ohnehin neutral, und ein 429 oder ein Netzabbruch darf keine Fehlerseite
 * über eine Einladung legen.
 */
const { data: check, status: checkStatus } = await useAsyncData<BrandInviteCheckResponse>(
  'brand-invite-check',
  async () => {
    if (!code.value) return { valid: false }
    try {
      return await request<BrandInviteCheckResponse>('/api/brand/invite/check', {
        method: 'POST',
        body: { code: code.value },
      })
    }
    catch {
      return { valid: false }
    }
  },
  { watch: [code], default: () => ({ valid: false }) },
)

/**
 * Der erste gültige Befund merkt sich den Code. Bewusst NUR bei `valid` — ein
 * Tippfehler soll nicht sieben Tage lang wiederkommen und jede spätere
 * Einladung überdecken.
 */
watchEffect(() => {
  if (code.value && check.value?.valid && inviteCookie.value !== code.value) {
    inviteCookie.value = code.value
  }
})

/**
 * EIN ABGELEHNTER COOKIE-CODE IST ALTLAST, KEIN URTEIL (Davids Test-Audit
 * 2026-09-03): der Cookie überlebt sieben Tage — auch das ERFOLGREICHE
 * Einlösen von früher, wenn das Löschen damals fehlte oder in einem anderen
 * Tab passierte. Ein leerer /invite-Besuch begrüsste dann mit „Code ungültig
 * oder abgelaufen", bevor irgendjemand etwas eingegeben hatte. Nur ein
 * QUERY-Code trägt eine echte Behauptung des Besuchers; einen Cookie-Code,
 * den der Server ablehnt, räumen wir still weg — die Seite fällt damit auf
 * `enterCode` (das leere Feld) zurück.
 */
watchEffect(() => {
  if (!queryCode.value && inviteCookie.value && checkStatus.value === 'success' && !check.value?.valid) {
    inviteCookie.value = null
  }
})

/** `null` = noch kein Versuch. Siehe Kopf von `brandInviteView.ts`. */
const redeemed = ref<boolean | null>(null)
const redeeming = ref(false)

const state = computed(() => inviteViewState({
  hasCode: Boolean(code.value),
  valid: Boolean(check.value?.valid),
  loggedIn: isLoggedIn.value,
  verified: user.value?.emailVerification === true,
  redeemed: redeemed.value,
}))

/** Solange geprüft wird, ist noch nichts entschieden — Ladeanzeige statt Urteil. */
const checking = computed(() => checkStatus.value === 'pending')

/** Die eigene Adresse MIT Code — Ziel nach Anmeldung und nach Kontoanlage. */
const selfPath = computed(() =>
  code.value ? `${route.path}?code=${encodeURIComponent(code.value)}` : route.path)

async function redeem(): Promise<void> {
  if (redeeming.value) return
  redeeming.value = true
  try {
    const result = await $fetch<BrandInviteRedeemResponse>('/api/brand/invite/redeem', {
      method: 'POST',
      body: { code: code.value },
    })
    redeemed.value = result.redeemed
    if (result.redeemed) {
      inviteCookie.value = null
      await navigateTo(localePath('/dashboard/brands'))
    }
  }
  catch {
    // Auch ein 404 (keine verifizierte Session) und ein 429 landen hier. Nach
    // aussen ist beides dieselbe neutrale Ablehnung — die Seite hat den
    // Zustand „eingeloggt und verifiziert" gerade selbst festgestellt, ein
    // eigener Text dafür wäre eine Erklärung, die sie nicht belegen kann.
    redeemed.value = false
  }
  finally {
    redeeming.value = false
  }
}

/**
 * Der Beobachter steht IM `onMounted`, nicht daneben: so läuft er garantiert
 * nur im Browser (s. Kopf), fängt aber auch den Übergang, der erst nach dem
 * Aufbau eintritt — die Adresse wird in einem zweiten Tab bestätigt, der
 * Auth-Store zieht nach, und die Seite steht plötzlich vor einer einlösbaren
 * Einladung. Ein einmaliger Aufruf beim Aufbau verpasste genau diesen Fall.
 *
 * ABER DER STORE ZIEHT NICHT VON SELBST NACH (P1d-Abnahme, 2026-09-01 live
 * erwischt): die Verifizierung passiert im ZWEITEN Tab, und nichts im ersten
 * ruft danach je wieder `/api/auth/me` — der Beobachter wartete auf einen
 * Übergang, der nie eintraf, und Davids Einlösung blieb aus. Deshalb holt
 * dieser Tab den Konto-Stand nach, sobald er den FOKUS zurückbekommt (genau
 * der Moment, in dem jemand vom Mail-Tab zurückwechselt) — und nur im
 * Warte-Zustand: überall sonst gibt es nichts nachzuholen.
 */
onMounted(() => {
  watch(state, (value) => {
    if (value === 'redeeming' && redeemed.value === null && !redeeming.value) void redeem()
  }, { immediate: true })

  const auth = useAuthStore()
  let refreshing = false
  const onFocus = async () => {
    if (state.value !== 'verifyPending' || refreshing) return
    refreshing = true
    try {
      await auth.refresh()
    }
    finally {
      refreshing = false
    }
  }
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', onFocus)
  onUnmounted(() => {
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onFocus)
  })
})

/** Der Knopf im abgelehnten Zustand — derselbe Vorgang, neu angestossen. */
async function retry(): Promise<void> {
  redeemed.value = null
  await redeem()
}

const entered = ref('')

/**
 * Der eingetippte Code wandert in die QUERY, nicht direkt in einen API-Ruf.
 * Damit ist die Adresse teilbar, der Zurück-Knopf tut das Erwartete, und der
 * Prüf-Aufruf hat genau eine Stelle (`useAsyncData` oben).
 */
async function submitCode(): Promise<void> {
  const value = entered.value.trim()
  if (!value) return
  await navigateTo({ path: route.path, query: { code: value } })
}
</script>

<template>
  <UContainer class="py-16">
    <UPageCard
      :title="t('brand.invite.title')"
      :description="t('brand.invite.description')"
      variant="subtle"
      class="mx-auto max-w-xl"
    >
      <div v-if="checking" class="flex items-center gap-2 text-sm text-muted" data-invite-checking>
        <UIcon name="i-ph-circle-notch" class="size-4 animate-spin" />
        {{ t('brand.invite.checking') }}
      </div>

      <!--
        OHNE CODE und UNGÜLTIG teilen sich das Feld: in beiden Fällen ist der
        nächste Schritt derselbe (einen Code eingeben), nur die Ansage darüber
        unterscheidet sich. Zwei Zweige mit demselben Formular wären zwei
        Stellen, an denen es künftig auseinanderläuft.
      -->
      <div
        v-else-if="state === 'enterCode' || state === 'invalid'"
        class="space-y-4"
        data-invite-enter
      >
        <!-- Ungültig: EIN Satz für jeden Grund (Enumeration wäre ein Orakel). -->
        <UAlert
          v-if="state === 'invalid'"
          color="warning"
          variant="subtle"
          icon="i-ph-warning-circle"
          :title="t('brand.invite.invalidTitle')"
          :description="t('brand.invite.invalidText')"
          data-invite-invalid
        />
        <!-- Kein Code: ruhiger Hinweis, kein Vorwurf. -->
        <UAlert
          v-else
          color="neutral"
          variant="subtle"
          icon="i-ph-envelope-simple"
          :title="t('brand.invite.betaTitle')"
          :description="t('brand.invite.betaText')"
        />
        <UFormField :label="t('brand.invite.codeLabel')" name="code">
          <UInput
            v-model="entered"
            size="lg"
            class="w-full"
            :placeholder="t('brand.invite.codePlaceholder')"
            @keyup.enter="submitCode"
          />
        </UFormField>
        <UButton
          block
          size="lg"
          icon="i-ph-arrow-right"
          :disabled="!entered.trim()"
          data-invite-submit
          @click="submitCode"
        >
          {{ t('brand.invite.submit') }}
        </UButton>

        <!-- OHNE CODE GAB ES HIER NICHTS ZU TUN (bis 2026-09-04): „sonst
             melden wir uns" versprach eine Meldung, für die es keinen Weg
             gab. Die Warteliste ist der Weg — unter dem Code-Feld, damit
             der Code-Besitzer sie nicht suchen muss und der Code-Lose nicht
             leer ausgeht. -->
        <div class="pt-2" data-invite-waitlist>
          <p class="text-sm font-medium tracking-tight">{{ t('brand.invite.noCodeTitle') }}</p>
          <p class="mt-1 text-sm text-muted">{{ t('brand.invite.noCodeText') }}</p>
          <div class="mt-4">
            <BwWaitlistForm source="invite" />
          </div>
        </div>
      </div>

      <!-- Gültig, aber kein Konto: es entsteht HIER. Ein Verweis auf
           /register hülfe nicht — die Registrierung ist geschlossen, und nur
           der Code öffnet sie (für genau diese Anlage). -->
      <div v-else-if="state === 'register'" class="space-y-4" data-invite-register>
        <p class="text-sm text-muted">{{ t('brand.invite.registerIntro') }}</p>

        <AuthRegisterForm :admission-code="code" :redirect-to="selfPath" />

        <USeparator />
        <p class="text-center text-sm text-muted">
          {{ t('auth.register.hasAccount') }}
          <ULink
            :to="{ path: localePath('/login'), query: { redirect: selfPath } }"
            class="font-medium text-primary"
          >{{ t('auth.register.loginLink') }}</ULink>
        </p>
      </div>

      <!-- Konto da, Adresse unbestätigt: die Einlösung verlangt sie
           ausdrücklich (ein unverifiziertes Konto hat den Code nicht
           verbrannt). Der Kasten des Core bringt den Weg mit. -->
      <div v-else-if="state === 'verifyPending'" class="space-y-4" data-invite-verify>
        <AuthEmailVerifyRequired :title="t('brand.invite.verifyTitle')" />
        <p class="text-sm text-muted">{{ t('brand.invite.verifyText') }}</p>
      </div>

      <div v-else-if="state === 'denied'" class="space-y-4" data-invite-denied>
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-ph-warning-circle"
          :title="t('brand.invite.invalidTitle')"
          :description="t('brand.invite.deniedHint')"
        />
        <UButton
          variant="outline"
          icon="i-ph-arrow-clockwise"
          :loading="redeeming"
          data-invite-retry
          @click="retry"
        >
          {{ t('brand.invite.retry') }}
        </UButton>
      </div>

      <div v-else class="flex items-center gap-2 text-sm text-muted" data-invite-redeeming>
        <UIcon name="i-ph-circle-notch" class="size-4 animate-spin" />
        {{ t('brand.invite.redeeming') }}
      </div>
    </UPageCard>
  </UContainer>
</template>
