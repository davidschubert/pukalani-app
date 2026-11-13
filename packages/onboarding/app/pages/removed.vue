<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { resolveControlHosts } from '../../../core/shared/controlCenter'
import {
  REMOVED_CONTACT_LIMIT_CODE,
  REMOVED_CONTACT_MAX_LENGTH,
  createRemovedContactSchema,
  customerAreaUrl,
  type RemovedContactForm,
} from '../../shared/removedContact'

/**
 * DIE HINWEISSEITE FÜR ENTFERNTE (SEC-030 Teil 2, seit 2026-11-13 — Davids
 * Entscheidung: wer entfernt wurde, hat keinen Zugriff mehr auf die Community
 * und erfährt, dass ein Administrator ihn entfernt hat; von hier kann er die
 * Leitung erreichen).
 *
 * Hierher führt die Core-Routen-Middleware `community-removed.global.ts` JEDE
 * Seite dieses Hosts, solange der Zustand „entfernt" gesetzt ist (Pfad aus
 * `pukalani.community.removedNoticePath`, app/app.config.ts dieses Layers).
 * Wer NICHT entfernt ist, hat hier nichts zu suchen und geht zur Startseite —
 * kein Formular für andere.
 *
 * SCHLANK MIT ABSICHT: `layout: false` — keine Community-Navigation, keine
 * Glocke, keine Anwesenheit. Jeder dieser Bausteine fragt Routen, die einer
 * entfernten Person ohnehin 403 antworten. Realtime bleibt über das Gate aus
 * (`realtimeEnabled`, Zustand „entfernt"). Was die Seite selbst ruft, steht
 * auf der Erlaubnisliste: die eigenen offenen Einladungen (der Rückweg), die
 * Annahme, das Kontaktformular und das Abmelden.
 *
 * KEIN NAME DES ADMINS: der Satz sagt „ein Administrator dieser Community".
 * Der Name der Community steht da — er ist öffentlich (Seitentitel jedes
 * Besuchers).
 */
definePageMeta({
  layout: false,
  middleware: [
    () => {
      if (!useCommunityRemoved().value) return navigateTo(useLocalePath()('/'), { replace: true })
    },
  ],
})

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { logout, loading: loggingOut } = useLogout()
const communityName = useTenantBrand()

useSeoMeta({
  title: () => t('removedNotice.title'),
  robots: 'noindex, nofollow',
})

/**
 * Der Ausgang in den Kundenbereich — über die konfigurierten Kontroll-Hosts
 * (Env schlägt Config, wie überall), nie hart kodiert.
 */
const runtimeConfig = useRuntimeConfig()
const appConfig = useAppConfig() as { pukalani?: { tenancy?: { controlHosts?: string[] } } }
const requestUrl = useRequestURL()
const customerArea = customerAreaUrl(
  resolveControlHosts(
    (runtimeConfig.public as { tenancy?: { controlHosts?: string } }).tenancy?.controlHosts,
    appConfig.pukalani?.tenancy?.controlHosts,
  ),
  requestUrl.port,
)

/**
 * DER RÜCKWEG: eine NEUE Einladung. Die eigenen offenen Einladungen dieser
 * Community (nur für das eigene Konto, geprüfte Adresse im Control Plane).
 * Ein Fehler hier ist kein Fehler der Seite — dann gibt es eben keinen Knopf.
 */
interface MyInvites { invites: { id: string, role: string, expiresAt: string }[], siteName: string }
const { data: mine } = await useFetch<MyInvites>('/api/community/invites/mine', {
  default: () => ({ invites: [], siteName: '' }),
})
const pendingInvite = computed(() => mine.value?.invites?.[0] ?? null)

const accepting = ref(false)
const acceptError = ref<'unverified' | 'failed' | null>(null)
async function acceptInvite() {
  if (!pendingInvite.value) return
  accepting.value = true
  acceptError.value = null
  try {
    await $fetch('/api/community/members/accept', { method: 'POST', body: { inviteId: pendingInvite.value.id } })
    // VOLL neu laden: erst der neue Seitenaufbau holt den Zustand ohne
    // „entfernt" per SSR, und mit ihm Realtime, Glocke und Navigation.
    reloadNuxtApp({ path: localePath('/'), persistState: false })
  }
  catch (error) {
    const reason = (error as { data?: { reason?: string } }).data?.reason
    acceptError.value = reason === 'email_unverified' ? 'unverified' : 'failed'
    accepting.value = false
  }
}

const schema = computed(() => createRemovedContactSchema(t))
const state = reactive<RemovedContactForm>({ message: '' })
const sending = ref(false)
const sent = ref(false)
const limitReached = ref(false)
const retryAt = ref<Date | null>(null)
const sendFailed = ref(false)

const retryAtLabel = computed(() => retryAt.value
  ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'full', timeStyle: 'short' }).format(retryAt.value)
  : '')

async function onSubmit(event: FormSubmitEvent<RemovedContactForm>) {
  sending.value = true
  sendFailed.value = false
  try {
    await $fetch('/api/community/removed-contact', { method: 'POST', body: { message: event.data.message } })
    sent.value = true
  }
  catch (error) {
    const fetchError = error as {
      status?: number
      statusCode?: number
      data?: { reason?: string }
      response?: { headers?: Headers }
    }
    const status = fetchError.status ?? fetchError.statusCode
    if (status === 429 && fetchError.data?.reason === REMOVED_CONTACT_LIMIT_CODE) {
      limitReached.value = true
      const seconds = Number(fetchError.response?.headers?.get('retry-after'))
      retryAt.value = Number.isFinite(seconds) && seconds > 0 ? new Date(Date.now() + seconds * 1000) : null
    }
    else {
      sendFailed.value = true
    }
  }
  finally {
    sending.value = false
  }
}
</script>

<template>
  <main class="min-h-screen bg-default px-4 py-12 sm:py-20" data-removed-notice>
    <UPageCard
      variant="subtle"
      class="mx-auto max-w-xl"
      icon="i-ph-door-open"
      :title="t('removedNotice.title')"
    >
      <div class="space-y-4">
        <p class="text-sm text-default">
          {{ communityName ? t('removedNotice.leadNamed', { name: communityName }) : t('removedNotice.lead') }}
        </p>
        <p class="text-sm text-muted">
          {{ t('removedNotice.noAccess') }}
        </p>

        <!-- Der Rückweg: eine neue Einladung dieser Community. -->
        <UAlert
          v-if="pendingInvite"
          color="primary"
          variant="subtle"
          icon="i-ph-envelope-open"
          :title="t('removedNotice.invite.title')"
          :description="t('removedNotice.invite.description')"
          data-removed-invite
        >
          <template #actions>
            <UButton :loading="accepting" size="sm" @click="acceptInvite">
              {{ t('removedNotice.invite.accept') }}
            </UButton>
          </template>
        </UAlert>
        <p v-if="acceptError" class="text-sm text-error">
          {{ acceptError === 'unverified' ? t('removedNotice.invite.unverified') : t('removedNotice.invite.failed') }}
        </p>

        <USeparator />

        <div v-if="sent" class="space-y-1" data-removed-contact-sent>
          <p class="text-sm font-medium text-default">{{ t('removedNotice.contact.sentTitle') }}</p>
          <p class="text-sm text-muted">{{ t('removedNotice.contact.sentText') }}</p>
        </div>

        <div v-else-if="limitReached" class="space-y-1" data-removed-contact-limit>
          <p class="text-sm font-medium text-default">{{ t('removedNotice.contact.limitTitle') }}</p>
          <p class="text-sm text-muted">
            {{ retryAtLabel ? t('removedNotice.contact.limitUntil', { date: retryAtLabel }) : t('removedNotice.contact.limitText') }}
          </p>
        </div>

        <UForm v-else :schema="schema" :state="state" class="space-y-3" data-removed-contact-form @submit="onSubmit">
          <p class="text-sm font-medium text-default">{{ t('removedNotice.contact.title') }}</p>
          <UFormField name="message" :label="t('removedNotice.contact.label')" :help="t('removedNotice.contact.hint')">
            <UTextarea
              v-model="state.message"
              :rows="5"
              :maxlength="REMOVED_CONTACT_MAX_LENGTH"
              autoresize
              class="w-full"
            />
          </UFormField>
          <p v-if="sendFailed" class="text-sm text-error">{{ t('removedNotice.contact.failed') }}</p>
          <UButton type="submit" :loading="sending" icon="i-ph-paper-plane-tilt">
            {{ t('removedNotice.contact.send') }}
          </UButton>
        </UForm>

        <USeparator />

        <div class="flex flex-wrap items-center gap-3">
          <UButton color="neutral" variant="outline" icon="i-ph-sign-out" :loading="loggingOut" @click="logout">
            {{ t('removedNotice.logout') }}
          </UButton>
          <UButton v-if="customerArea" :to="customerArea" external color="neutral" variant="ghost" icon="i-ph-arrow-square-out">
            {{ t('removedNotice.customerArea') }}
          </UButton>
        </div>
      </div>
    </UPageCard>
  </main>
</template>
