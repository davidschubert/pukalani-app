<script setup lang="ts">
import type { MyCommunitiesResponse, MyCommunityView } from '../../../control/shared/myCommunities'

/**
 * DIE ACCOUNT-STARTSEITE auf account.pukalani.app (AH-2, Davids URL-Liste vom
 * 2026-08-11) — das Zuhause der Pukalani-ID.
 *
 * WAS SIE ERSETZT: bis AH-2 leitete `/` auf einem Kontroll-Host stumpf nach
 * `/communities` weiter. Das beantwortete genau eine der drei Fragen, mit denen
 * jemand hierher kommt („wo ist meine Community?") und verschwieg die anderen
 * beiden („wie heiße ich hier?", „wie stelle ich Benachrichtigungen ab?"). Der
 * Kundenbereich hatte damit Bereiche, die nur über das Konto-Menü im Dashboard
 * einer Community erreichbar waren — also ausgerechnet dort nicht, wo man
 * keine hat.
 *
 * ── WARUM EINE KOMPONENTE UND KEINE SEITE ─────────────────────────────────
 * `/` gehört der APP (apps/platform/app/pages/index.vue): auf einem
 * Mandanten-Host rendert diese Route die im Dashboard gepflegte
 * Community-Startseite. Zwei Dateien können denselben Pfad nicht beanspruchen
 * — eine `pages/index.vue` in diesem Layer würde von der App-Seite verdeckt und
 * wäre toter Code, der beim Lesen wie eine Seite aussieht. Der Inhalt lebt
 * deshalb hier, im Layer, dem der Kundenbereich gehört; die App-Seite ist nur
 * die Weiche.
 *
 * ── DER ZÄHLER IST KEINE ZIERDE ───────────────────────────────────────────
 * `/communities` schickt ein Konto OHNE Community sofort in den Wizard weiter
 * (communities.vue) — das ist gewolltes Verhalten und bleibt. Eine Karte
 * „Deine Communities" wäre für so ein Konto aber eine Falle: ein Klick, der
 * verlässlich woanders endet. Deshalb wird gezählt, und bei null steht statt
 * der Karte der ehrliche erste Schritt.
 *
 * ── KEIN @name IN DER BEGRÜSSUNG ──────────────────────────────────────────
 * Seit AH-7 (2026-08-11) GÄBE es hier einen: der @name gehört dem Konto
 * (`account_handles`), und `/api/account/handle` antwortet auch auf diesem
 * Host. Begrüßt wird trotzdem mit dem Konto-Namen und, solange keiner gesetzt
 * ist, mit der Adresse — eine Begrüßung nennt den Menschen, nicht seine
 * Kennung, und der Rückfall auf die Adresse stimmt immer. Gesetzt wird der
 * @name eine Seite weiter, unter `/profile`.
 */
const { t } = useI18n()
const localePath = useLocalePath()
const auth = useAuthStore()

const { data, status, error, refresh } = await useFetch<MyCommunitiesResponse>('/api/onboarding/communities', {
  default: () => ({ communities: [] as MyCommunityView[] }),
})

const communities = computed(() => data.value?.communities ?? [])
const hasCommunities = computed(() => communities.value.length > 0)

/** Name vor Adresse — die Adresse ist der Rückfall, der nie leer ist. */
const greetingName = computed(() => auth.user?.name?.trim() || auth.user?.email || '')

useBrandTitle(() => t('onboarding.account.home.title'))
</script>

<template>
  <div class="space-y-8" data-account-home>
    <div class="space-y-3">
      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
        {{ t('onboarding.account.home.greeting', { name: greetingName }) }}
      </h1>
      <p class="text-muted">{{ t('onboarding.account.home.intro') }}</p>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <!--
        Erst die Communities (der häufigste Grund, hier zu sein), dann die
        Pukalani-ID, dann die Einstellungen. Ohne Community fällt die erste
        Karte weg und der Trichter rückt an ihre Stelle.
      -->
      <UPageCard
        v-if="hasCommunities"
        :to="localePath('/communities')"
        :title="t('onboarding.account.home.communities.title')"
        :description="t('onboarding.account.home.communities.description', communities.length)"
        icon="i-ph-users-three"
        variant="subtle"
        data-account-card="communities"
      />

      <UPageCard
        v-else-if="status !== 'pending' && !error"
        :to="localePath('/start')"
        :title="t('onboarding.account.home.create.title')"
        :description="t('onboarding.account.home.create.description')"
        icon="i-ph-plus-circle"
        variant="subtle"
        data-account-card="create"
      />

      <!-- Fehler statt „Community anlegen" (FE-004, LZ1) -->
      <div v-else-if="error" role="alert">
        <CoreLoadError :retry="refresh" />
      </div>

      <UPageCard
        :to="localePath('/profile')"
        :title="t('onboarding.account.home.profile.title')"
        :description="t('onboarding.account.home.profile.description')"
        icon="i-ph-user-circle"
        variant="subtle"
        data-account-card="profile"
      />

      <UPageCard
        :to="localePath('/settings')"
        :title="t('onboarding.account.home.settings.title')"
        :description="t('onboarding.account.home.settings.description')"
        icon="i-ph-gear"
        variant="subtle"
        data-account-card="settings"
      />
    </div>

    <!-- Der Weg zu einer WEITEREN Community — unauffällig, weil er für die
         meisten nicht der nächste Schritt ist. Wer noch keine hat, sieht ihn
         oben als Karte. -->
    <UButton
      v-if="hasCommunities"
      :to="localePath('/start')"
      variant="ghost"
      color="neutral"
      icon="i-ph-plus"
      data-create-community
    >
      {{ t('onboarding.account.home.create.title') }}
    </UButton>
  </div>
</template>
