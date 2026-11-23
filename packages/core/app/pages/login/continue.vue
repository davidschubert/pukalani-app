<script setup lang="ts">
/**
 * ZENTRALE ANMELDESEITE (PK1 E2, Prototyp der Variante A — Plan
 * `docs/plans/PUKALANI-KONTO-E2.md` § 13). Lebt im Kundenbereich
 * (`account.*`): eine Community schickt den Browser mit `?site=<ihr Host>`
 * und `?to=<Pfad>` hierher.
 *
 * - Ob `site` eine bekannte Community ist, sagt der Server
 *   (`GET /api/auth/central/target`); mit Schalter aus, auf einem anderen
 *   Host oder bei einem fremden Wert kommt 404, die Seite zeigt dann nur
 *   einen Hinweis und keinen Weg zurück.
 * - Angemeldet ⇒ „Weiter als …"; sonst das Formular mit dem Kästchen
 *   „Auf diesem Gerät angemeldet bleiben".
 * - Zurück geht es über `POST /api/auth/central/return` (Siegel für genau
 *   diesen Host) und `GET /api/auth/site-session` auf der Community.
 *
 * KEIN `guest`-Middleware wie `/login`: wer angemeldet ist, soll hier
 * „Weiter als …" sehen, nicht weggeschickt werden.
 */
definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()
const localePath = useLocalePath()
const { authErrorMessage } = useAuthErrorMessage()

const site = computed(() => (typeof route.query.site === 'string' ? route.query.site : ''))
const to = computed(() => (typeof route.query.to === 'string' ? route.query.to : undefined))

const { data: target, error: targetError } = await useFetch<{ host: string, name: string }>('/api/auth/central/target', {
  query: { site },
  key: 'central-login-target',
})

const communityName = computed(() => target.value?.name || target.value?.host || '')
useBrandTitle(() => (communityName.value ? t('auth.central.title', { name: communityName.value }) : t('auth.login.title')))

const switching = ref(false)
const leaving = ref(false)
const errorMessage = ref<string | null>(null)

async function continueToSite() {
  if (leaving.value) return
  leaving.value = true
  errorMessage.value = null
  try {
    const { url } = await $fetch<{ url: string }>('/api/auth/central/return', {
      method: 'POST',
      body: to.value ? { site: site.value, to: to.value } : { site: site.value },
    })
    window.location.assign(url)
  }
  catch (error) {
    errorMessage.value = authErrorMessage(error, t('auth.central.returnFailed'))
    leaving.value = false
  }
}

/** „Mit anderem Konto": zentral abmelden, dann das Formular zeigen. */
async function useOtherAccount() {
  switching.value = true
  try {
    await $fetch('/api/auth/logout', { method: 'POST' })
    auth.setUser(null)
  }
  catch (error) {
    errorMessage.value = authErrorMessage(error, t('auth.logoutError'))
  }
  finally {
    switching.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-sm space-y-4" data-central-login>
    <template v-if="targetError || !target">
      <UAlert
        role="alert"
        color="warning"
        variant="subtle"
        icon="i-ph-warning"
        :title="t('auth.central.unknownSite')"
        :description="t('auth.central.unknownSiteHint')"
        data-central-unknown
      />
      <UButton :to="localePath('/')" color="neutral" variant="subtle" block>{{ t('auth.central.toAccount') }}</UButton>
    </template>

    <template v-else>
      <div class="text-center" data-central-heading>
        <h1 class="text-xl font-semibold">{{ t('auth.central.title', { name: communityName }) }}</h1>
        <p class="mt-1 text-sm text-muted">{{ t('auth.central.description', { host: target.host }) }}</p>
      </div>

      <UAlert v-if="errorMessage" role="alert" color="error" variant="subtle" :title="errorMessage" />

      <template v-if="auth.user">
        <UCard data-central-continue>
          <div class="flex items-center gap-3">
            <UAvatar :alt="auth.user.name || auth.user.email" size="md" />
            <div class="min-w-0">
              <p class="truncate font-medium">{{ auth.user.name || auth.user.email }}</p>
              <p class="truncate text-sm text-muted">{{ auth.user.email }}</p>
            </div>
          </div>
        </UCard>
        <UButton block size="lg" :loading="leaving" icon="i-ph-arrow-right" trailing data-central-continue-button @click="continueToSite">
          {{ t('auth.central.continueAs', { name: auth.user.name || auth.user.email }) }}
        </UButton>
        <UButton block color="neutral" variant="ghost" :loading="switching" data-central-other @click="useOtherAccount">
          {{ t('auth.central.otherAccount') }}
        </UButton>
      </template>

      <AuthLoginForm v-else central @signed-in="continueToSite" />
    </template>
  </div>
</template>
