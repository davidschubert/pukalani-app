<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { isBotCheckReason } from '../../../core/shared/turnstile'
import { createGuestCommentSchema } from '../../schemas/comment'

/**
 * Gast-Kommentar-Formular (Embed E4): Kommentieren ohne Account — Name und Text.
 * Sichtbar, wo `guestCommentsAllowed` ja sagt und niemand eingeloggt ist (bis
 * K7 hieß das: nur im iframe-Embed). Postet an /api/comments/guest
 * (store.addGuestComment).
 *
 * DAS E-MAIL-FELD IST WEG (F18, Davids Entscheidung 2026-08-02). Es war als
 * Rückfragekanal für die Moderation gedacht, aber die Gegenstelle wurde nie
 * gebaut: die Adresse landete in `guest_authors`, und diese Tabelle hatte im
 * ganzen Repo keine Lese-Stelle. Ein Pflichtfeld, dessen Inhalt niemand je
 * ansieht, ist gegenüber dem Gast eine Zumutung und gegenüber der DSGVO eine
 * Erhebung ohne Zweck. Der Name bleibt — er ist der ANZEIGENAME und steht
 * ohnehin öffentlich am Kommentar.
 *
 * SEIT BI2 K7 (2026-11-09) STEHT ES AUCH AUSSERHALB DES EMBEDS: unter den
 * öffentlichen Insights-Artikeln von branding.supply, freigegeben über
 * `pukalani.comments.guestsOnPublicPages`. Damit kam der Bot-Beweis dazu
 * (Turnstile, Aktion `guest_comment`) — ein öffentliches Formular ohne Konto
 * ist genau die Fläche, über die am 2026-10-27 209 Spam-Mails liefen. Ohne
 * Turnstile-Schlüssel zeigt das Widget nichts und der Knopf bleibt offen
 * (`mode: 'off'`): Dev, CI und die Embed-E2E laufen unverändert.
 */
const props = defineProps<{
  /** Gesetzt = Antwort-Formular, sonst Top-Level */
  parentId?: string
}>()
const emit = defineEmits<{ created: [] }>()

const { t } = useI18n()
const store = inject(commentStoreKey)!
const toast = useToast()
const loading = ref(false)

// Bot-Beweis wie im Registrierformular (BI2 K7): solange ein Site-Key gesetzt
// ist, bleibt der Knopf gesperrt, bis das Widget einen Token geliefert hat —
// sonst liefe der erste Klick garantiert in ein 403 `bot_check_required`.
const turnstileToken = ref('')
const botCheck = ref<{ reset: () => void } | null>(null)
const turnstileEnabled = Boolean(useRuntimeConfig().public.turnstileSiteKey)
const waitingForBotCheck = computed(() => turnstileEnabled && turnstileToken.value === '')

// Validierung: dieselbe Factory wie der Server (Name/Content).
const schema = computed(() => createGuestCommentSchema(t).pick({ guestName: true, content: true }))
type FormInput = z.infer<typeof schema.value>
const state = reactive<FormInput>({ guestName: '', content: '' })

async function onSubmit(event: FormSubmitEvent<FormInput>) {
  loading.value = true
  try {
    await store.addGuestComment(event.data.content, event.data.guestName, props.parentId, turnstileToken.value || undefined)
    state.content = ''
    // Den Namen für Folgekommentare stehen lassen — bequemer, kein PII-Leak
    // (bleibt im lokalen Formularzustand dieses Tabs).
    emit('created')
    toast.add({ title: t('comments.guest.posted'), color: 'success' })
  }
  catch (error) {
    const code = (error as { data?: { data?: { code?: string } } })?.data?.data?.code
    const status = (error as { statusCode?: number, status?: number })?.statusCode ?? (error as { status?: number })?.status
    // Ein Turnstile-Token ist EINMALIG: nach jedem Fehlschlag ein neuer, sonst
    // scheitert der zweite Versuch an einem verbrauchten Token statt an der
    // Ursache (dieselbe Zeile steht im Registrierformular).
    botCheck.value?.reset()
    const key = code === 'maintenance'
      ? 'comments.disabled.maintenanceToast'
      : code === 'comments_disabled'
        ? 'comments.disabled.toast'
        // Die drei Roboter-Gründe tragen die TEXTE DES CORE
        // (`auth.botCheck.*`, dieselbe Zuordnung wie `useAuthErrorMessage`):
        // eine zweite Formulierung desselben Satzes im comments-Layer wäre
        // eine zweite Wahrheit über dieselbe Hürde.
        : isBotCheckReason(code)
          ? `auth.botCheck.${code === 'bot_check_required' ? 'required' : code === 'bot_check_failed' ? 'failed' : 'unavailable'}`
          : status === 429 ? 'comments.guest.rateLimited' : 'comments.form.error'
    // Wie im angemeldeten Formular: der Text bleibt stehen, das gehört gesagt
    toast.add({
      title: t(key),
      description: t(key === 'comments.form.error' ? 'comments.form.errorHint' : 'comments.disabled.draftKeptHint'),
      color: 'error',
    })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UForm :schema="schema" :state="state" class="space-y-2" data-guest-form @submit="onSubmit">
    <!-- Nur noch EIN Feld (F18) — das Zweispalten-Raster hatte die E-Mail
         daneben und würde jetzt eine halbe Zeile Leere stempeln. -->
    <UFormField name="guestName">
      <UInput v-model="state.guestName" :placeholder="t('comments.guest.namePlaceholder')" class="w-full" autocomplete="name" />
    </UFormField>
    <UFormField name="content">
      <UTextarea
        v-model="state.content"
        :rows="parentId ? 2 : 3"
        autoresize
        :placeholder="parentId ? t('comments.form.replyPlaceholder') : t('comments.form.placeholder')"
        class="w-full"
        data-comment-input
      />
    </UFormField>
    <!-- Der Hinweis „Deine E-Mail bleibt privat" ist mit dem Feld gefallen
         (F18). Ein Ersatzsatz „wir speichern nichts" wäre zu viel versprochen:
         die Server-Protokolle sehen weiterhin eine IP-Adresse. -->
    <AuthTurnstileWidget ref="botCheck" v-model="turnstileToken" action="guest_comment" />
    <div class="flex items-center gap-2">
      <UButton type="submit" size="sm" :loading="loading" :disabled="waitingForBotCheck">
        {{ parentId ? t('comments.form.replySubmit') : t('comments.form.submit') }}
      </UButton>
    </div>
  </UForm>
</template>
