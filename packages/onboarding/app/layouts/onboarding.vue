<script setup lang="ts">
/**
 * Layout des Setup-Flows: eine Bühne, keine Navigation.
 *
 * Bewusst KEINE Community-Nav und kein Zurück-Link wie im auth-Layout — wer
 * hier ist, hat genau eine Aufgabe.
 *
 * WAS ES SEIT U1 (2026-08-10) TROTZDEM GIBT: ein Konto-Menü. Der alte
 * Kommentar hier versprach den Ausgang „Konto-Menü, sobald es mehrere
 * Communities gibt" — bis dahin stand oben rechts nur die E-Mail-Adresse als
 * TOTER TEXT. Wer sich mit dem falschen Konto angemeldet hatte oder ohne
 * Einladungs-Code vor der Code-Wand stand, konnte sich aus dieser Bühne weder
 * abmelden noch irgendwohin klicken. Der Ausgang gehört nicht an eine
 * Bedingung, sondern an jede Seite, die eine Anmeldung voraussetzt.
 *
 * Der Menü-Auslöser trägt die ADRESSE (nicht den Namen): sie beantwortet die
 * Frage, die man an dieser Stelle stellt — „bin ich hier mit dem richtigen
 * Konto?".
 */
import type { DropdownMenuItem } from '@nuxt/ui'

const { t } = useI18n()
const localePath = useLocalePath()
const auth = useAuthStore()
const { logout } = useLogout()

/**
 * DIE AUSGÄNGE, SEIT ES SIE GIBT (AH-2, 2026-08-11).
 *
 * Hier stand bis AH-2 nur die Adresse und „Abmelden", mit einer Begründung, die
 * damals stimmte: „Meine Communities" wäre für ein Konto OHNE Community ein
 * Ausgang im Kreis gewesen (`/communities` schickt genau die weiter in den
 * Wizard). Das Argument ist mit der Account-Startseite hinfällig — `/` ist die
 * EINE Adresse, die für beide Fälle stimmt: mit Communities zeigt sie die
 * Liste, ohne sie den ersten Schritt. Verlinkt wird deshalb sie, nicht
 * `/communities`.
 *
 * Profil und Einstellungen stehen bedingungslos: sie gehören dem KONTO und
 * brauchen keine Community. Genau das war der Grund für AH-2 — bis dahin lagen
 * beide ausschließlich im Dashboard einer Community.
 */
const items = computed<DropdownMenuItem[]>(() => [
  { label: auth.user?.email ?? '', type: 'label' },
  { type: 'separator' },
  { label: t('onboarding.account.home.navLabel'), icon: 'i-ph-house', to: localePath('/') },
  { label: t('account.nav.profile'), icon: 'i-ph-user-circle', to: localePath('/profile') },
  { label: t('onboarding.account.settings.title'), icon: 'i-ph-gear', to: localePath('/settings') },
  { type: 'separator' },
  {
    label: t('auth.logout'),
    icon: 'i-ph-sign-out',
    onSelect: () => { void logout() },
  },
])

/**
 * EINE Breite für den ganzen Kundenbereich: max-w-7xl = 1280 px (Davids
 * Entscheidung 2026-08-23 — zuerst nur für die Sessions-Route aufgezogen,
 * dann bewusst auf alle Seiten ausgeweitet; die vorige Lesebreite max-w-2xl
 * sprang sonst beim Reiter-Wechsel). Wer schmaler sein will, begrenzt sich
 * selbst in der Seite (heute nur join.vue) — nicht über die Bühne.
 */
</script>

<template>
  <div class="min-h-screen bg-default">
    <header class="flex items-center justify-between px-4 py-3 sm:px-6">
      <span class="flex items-center gap-2 font-semibold tracking-tight">
        <!-- Das Zeichen der Marketing-Site, derselbe Baustein (Q24, R4). Die
             Farbwelt bleibt zurückhaltend: nur das Zeichen trägt Farbe. -->
        <PukaMark :size="26" />
        Pukalani
      </span>
      <UDropdownMenu v-if="auth.user" :items="items">
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          trailing-icon="i-ph-caret-down"
          class="max-w-[14rem]"
          :title="auth.user.email"
        >
          <!-- Name = sichtbare Adresse + versteckter Zweck (UX-011, Q09). -->
          <span class="truncate">{{ auth.user.email }}</span>
          <span class="sr-only">{{ t('onboarding.layout.accountMenu') }}</span>
        </UButton>
      </UDropdownMenu>
    </header>

    <main class="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <slot />
    </main>

    <p class="pb-8 text-center text-xs text-dimmed">
      {{ t('onboarding.layout.footer') }}
    </p>
  </div>
</template>
