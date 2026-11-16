<script setup lang="ts">
import { safeRedirectTarget } from '../../../shared/redirectTarget'
import { CONSENT_COOKIE, CONSENT_COOKIE_MAX_AGE_S, formatConsentCookie } from '../../../shared/consent'
import type { ConsentKind } from '../../../shared/types/consent'

/**
 * Die Social-Login-Knöpfe (U14) — EINE Fläche für Anmelden UND Registrieren.
 *
 * `disabled` trägt heute genau einen Fall: das AGB-Häkchen im
 * Register-Formular ist noch nicht gesetzt. Der Passwort-Weg lässt das
 * Formular dann nicht abschicken, und ein Google-Knopf daneben, der einfach
 * losläuft, wäre die Hintertür um genau diese Zusage herum.
 */
const props = withDefaults(defineProps<{
  /** Sperrt die Knöpfe sichtbar, statt sie zu verstecken (AGB noch offen). */
  disabled?: boolean
  /** Grund für die Sperre — als Titel/Hinweis, damit sie nicht stumm ist. */
  disabledHint?: string
  /**
   * Auf welcher Seite steht das „oder"? Beim Anmelden stehen die Knöpfe ÜBER
   * dem Formular ('after' — erst Knöpfe, dann Trenner), beim Registrieren
   * DARUNTER ('before'), weil sie dort hinter dem AGB-Häkchen stehen müssen:
   * ein gesperrter Knopf, dessen Grund vier Felder weiter oben liegt, erklärt
   * sich nicht.
   */
  separator?: 'before' | 'after'
  /**
   * Die Bestätigungen, die das Formular daneben gerade trägt (SEC-008). Beim
   * Klick legt der Knopf sie für zehn Minuten in das Merkzeichen
   * `pk_consent`; die Rückkehr vom Anbieter hält sie dann als Nachweis fest
   * (`server/utils/consentRecords.ts`). Leer = kein Merkzeichen.
   */
  consentKinds?: ConsentKind[]
}>(), { separator: 'after', disabledHint: undefined, consentKinds: () => [] })

const { t } = useI18n()
const route = useRoute()
const providers = useOauthProviders()

/**
 * Das Ziel nach der Anmeldung überlebt den Ausflug zum Provider nur, wenn wir
 * es mitgeben — die Rückkehr kommt von Appwrite und trägt nur `userId` +
 * `secret`. Die Start-Route prüft es NOCHMAL und legt es in ein kurzlebiges
 * Cookie; hier wird es nur weitergereicht, geprüft mit derselben einen Regel
 * wie überall (kein offener Weiterleiter).
 */
const redirectTarget = computed(() => safeRedirectTarget(route.query.redirect))

function startUrl(id: string): string {
  const query = new URLSearchParams({ provider: id })
  if (redirectTarget.value) query.set('redirect', redirectTarget.value)
  return `/api/auth/oauth?${query.toString()}`
}

function rememberConsent() {
  const value = formatConsentCookie(props.consentKinds)
  if (!value || typeof document === 'undefined') return
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=${CONSENT_COOKIE_MAX_AGE_S}; Path=/; SameSite=Lax${secure}`
}
</script>

<template>
  <div v-if="providers.length" class="space-y-2" data-oauth-buttons>
    <USeparator v-if="props.separator === 'before'" :label="t('auth.or')" />

    <UButton
      v-for="provider in providers"
      :key="provider.id"
      :label="t(`auth.oauth.${provider.id}`)"
      :icon="provider.icon"
      color="neutral"
      variant="subtle"
      size="lg"
      block
      :to="props.disabled ? undefined : startUrl(provider.id)"
      :disabled="props.disabled"
      :title="props.disabled ? props.disabledHint : undefined"
      external
      :data-provider="provider.id"
      @click="rememberConsent"
    />

    <!-- Die erklärte Haltung (U14): was der Anbieter erfährt und was nicht.
         Sie steht NEBEN dem Knopf, nicht in einer verlinkten Erklärseite —
         wer hier klickt, soll es vorher gelesen haben können. -->
    <p class="text-xs text-muted">{{ t('auth.oauth.privacy') }}</p>

    <USeparator v-if="props.separator === 'after'" :label="t('auth.or')" />
  </div>
</template>
