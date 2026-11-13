<script setup lang="ts">
import { safeRedirectTarget } from '../../../core/shared/redirectTarget'
/**
 * Einladung annehmen — die Landestelle des Mail-Links (`/join?token=…`) UND der
 * Glocken-Meldung (`/join` ohne Token).
 *
 * Zwei Wege, EIN Klick (Davids Entscheidung 2 vom 2026-07-29):
 *  - MIT Token: der Link aus der Mail. Funktioniert auch auf einem Gerät, auf dem
 *    man noch nie angemeldet war — der Auth-Guard schickt über /login zurück
 *    (?redirect=, safeRedirectTarget), danach steht der Knopf hier.
 *  - OHNE Token: wer schon ein Konto hat, findet seine offene Einladung über die
 *    eigene, geprüfte Adresse. Das ist der Fall „Person kennt Pukalani aus einer
 *    anderen Community": anmelden, klicken, drin.
 *
 * Die Seite lebt auf dem COMMUNITY-Host, nicht im Kundenbereich: die
 * Mitgliedschaft gehört dieser Community, und Session-Cookies sind host-gebunden.
 *
 * Bewusst im STANDARD-Layout und nicht im `onboarding`-Layout: das trägt
 * Betreiber-Branding („Pukalani", Plattform-Fußzeile) und gehört damit nicht auf
 * einen Mandanten-Host (N7). Wer eingeladen wird, soll die COMMUNITY sehen, in
 * die er eintritt.
 */
/**
 * MIT TOKEN OHNE ANMELDUNG (Davids Entscheidung 2026-08-15).
 *
 * Der `auth`-Guard schickte bisher JEDEN Nicht-Angemeldeten zur Anmeldung —
 * für den Weg „ich habe schon ein Konto" genau richtig. Wer noch KEINS hat,
 * kam auf einer geschlossenen Community aber nirgendwo an: die Register-Seite
 * sagt dort „Nur auf Einladung … melde dich einfach an", und anmelden kann man
 * sich ohne Konto nicht. Trägt die Adresse einen Token, bleibt die Person
 * deshalb hier — die Seite bietet beides an.
 *
 * OHNE Token bleibt es beim alten Verhalten (der Weg aus der Glocke): dort
 * IST die Anmeldung die Voraussetzung, denn gesucht wird nach der eigenen,
 * geprüften Adresse. Die Umleitung ist wortgleich die des `auth`-Guards —
 * inklusive `safeRedirectTarget`, damit daraus keine Weiterleitung nach aussen
 * wird.
 */
definePageMeta({
  middleware: [
    (to) => {
      const value = to.query.token
      const hatToken = typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
      if (hatToken || useAuthStore().isLoggedIn) return
      const target = safeRedirectTarget(to.fullPath)
      return navigateTo({
        path: useLocalePath()('/login'),
        ...(target ? { query: { redirect: target } } : {}),
      })
    },
  ],
})

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const toast = useToast()
const auth = useAuthStore()

// Öffentliche Seite auf dem Community-Host → Brand-Kette wie /login (C5).
useBrandTitle(() => t('join.title'))

const token = computed(() => {
  const value = route.query.token
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null
})

/**
 * Ohne Token: gibt es eine offene Einladung an MEINE Adresse? Nur mit Konto —
 * die Route setzt eine Sitzung voraus, und ohne Anmeldung gibt es keine
 * „eigene Adresse", nach der man suchen könnte.
 */
const { data: mine } = await useFetch<{ invites: { id: string, role: string, expiresAt: string }[], siteName: string }>(
  '/api/community/invites/mine',
  { default: () => ({ invites: [], siteName: '' }), immediate: auth.isLoggedIn },
)

/**
 * Wem gehört dieser Token? Beantwortet auch OHNE Konto — das ist der ganze
 * Zweck: erst dadurch kann die Seite sagen, als was man eingeladen ist und an
 * welche Adresse das Konto gehört.
 *
 * NUR IM BROWSER (`server: false`, SEC-004): beim Server-Rendern reicht Nuxt
 * die Kopfzeilen der Navigation an den internen POST weiter. Kam die Person
 * über den Link in ihrem Webmail, trägt er `sec-fetch-site: cross-site`, und
 * die Herkunftsprüfung lehnt ihn ab — die Seite sagte dann „keine Einladung".
 * Im Browser ist der Aufruf `same-origin`. Bis die Antwort da ist, zeigt die
 * Seite ihren Ladezustand (`pruefeEinladung`), kein Urteil: der Status ist beim
 * SSR und beim Hydrieren gleich `idle`, also kein Hydration-Unterschied.
 */
const { data: einladung, status: einladungStatus } = await useFetch<{ ok: boolean, email: string, role: string }>(
  '/api/community/invites/preview',
  {
    method: 'POST',
    body: computed(() => ({ token: token.value })),
    immediate: Boolean(token.value),
    server: false,
    // Ein ungültiger Token ist keine Ausnahme, sondern eine Antwort.
    default: () => ({ ok: false, email: '', role: '' }),
  },
)

/** Mit Token und noch ohne Antwort: noch nichts entschieden — Ladezustand statt „ungültig". */
const pruefeEinladung = computed(() =>
  Boolean(token.value) && (einladungStatus.value === 'idle' || einladungStatus.value === 'pending'))

/** Angemeldet? Dann annehmen. Sonst: Konto anlegen — hier, auf dieser Seite. */
const brauchtKonto = computed(() => !auth.isLoggedIn && Boolean(token.value) && Boolean(einladung.value?.ok))

const pending = computed(() => mine.value?.invites?.[0] ?? null)
const siteName = computed(() => mine.value?.siteName ?? '')
/**
 * Etwas anzunehmen gibt es nur mit Token ODER mit gefundener Einladung — und
 * ANGEMELDET.
 *
 * Die Anmelde-Bedingung kam mit dem Konto-Anlegen dazu: seit die Seite auch
 * ohne Konto erreichbar ist, landet hier auch, wer einen ABGELAUFENEN oder
 * erfundenen Token mitbringt. Ohne sie stünde dort ein „Einladung annehmen",
 * das nur ein 401 liefern kann — ein Knopf, der nicht kann, was er verspricht.
 * Jetzt sieht diese Person denselben ehrlichen Hinweis wie jede andere ohne
 * gültige Einladung.
 */
const hasSomething = computed(() =>
  auth.isLoggedIn && (Boolean(token.value) || Boolean(pending.value)))

/**
 * Die Rolle, die die Einladung vergibt — aus der Vorschau (ohne Konto) oder
 * aus der eigenen Einladungs-Liste (mit Konto). Nur zur Anzeige; verbindlich
 * wird sie beim Annehmen im Control Plane.
 */
const rolle = computed(() => einladung.value?.ok ? einladung.value.role : pending.value?.role ?? '')

const busy = ref(false)
const done = ref(false)

/**
 * Die Einladung ist gültig, nur die Adresse ist noch nicht bestätigt
 * (Sicherheits-Audit 2026-08-02). Ein Toast wäre hier falsch: das ist kein
 * Fehler, den man wegklickt, sondern ein Schritt, den man tut. Deshalb bleibt
 * der Hinweis stehen — mitsamt dem Knopf, der die Mail erneut schickt.
 */
const needsVerification = ref(false)

async function accept() {
  busy.value = true
  needsVerification.value = false
  try {
    await $fetch('/api/community/members/accept', {
      method: 'POST',
      body: token.value ? { token: token.value } : { inviteId: pending.value?.id },
    })
    done.value = true
    toast.add({ title: t('join.done'), color: 'success' })
    // Ins Dashboard: die neue Rolle greift dort sofort (die Route prüft sie
    // serverseitig neu), und der Weg „drin sein" ist damit sichtbar zu Ende.
    await navigateTo(localePath('/dashboard'))
  }
  catch (error) {
    const status = (error as { statusCode?: number, status?: number }).statusCode
      ?? (error as { status?: number }).status
    // Der fachliche Grund reist als `reason` im Fehler-Envelope (core/server/
    // error.ts) — quer über die Control-Plane-Naht, die ihn durchreicht.
    const reason = (error as { data?: { reason?: string } }).data?.reason
    if (status === 403 && reason === 'email_unverified') {
      needsVerification.value = true
      return
    }
    toast.add({
      title: status === 403 ? t('join.wrongAccount') : t('join.invalid'),
      color: 'error',
    })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UContainer class="py-12">
    <UPageCard
      :title="siteName ? t('join.titleNamed', { name: siteName }) : t('join.title')"
      :description="t('join.description')"
      variant="subtle"
      class="mx-auto max-w-xl"
    >
      <!--
        OHNE KONTO, MIT GÜLTIGEM TOKEN: hier entsteht das Konto. Ein Verweis auf
        die Register-Seite hülfe nicht — auf einer geschlossenen Community sagt
        die „Nur auf Einladung".
      -->
      <!--
        Die Vorschau läuft nur im Browser (s. Skript). Angemeldet steht der
        Annehmen-Knopf ohnehin; wer OHNE Konto kommt, sieht bis zur Antwort
        diesen Platzhalter statt „keine Einladung".
      -->
      <div v-if="pruefeEinladung && !hasSomething" class="space-y-3" aria-busy="true" data-join-checking>
        <USkeleton class="h-4 w-3/4" />
        <USkeleton class="h-4 w-1/2" />
        <USkeleton class="h-9 w-40" />
      </div>

      <div v-else-if="brauchtKonto" class="space-y-4" data-join-register-box>
        <p class="text-sm text-muted">
          {{ t('join.roleNote', { role: t(`members.roles.${rolle}`) }) }}
        </p>
        <p class="text-sm text-muted">{{ t('join.createAccountIntro') }}</p>

        <AuthRegisterForm
          :invite-token="token ?? undefined"
          :locked-email="einladung?.email"
          :redirect-to="route.fullPath"
        />

        <USeparator />
        <p class="text-center text-sm text-muted">
          {{ t('auth.register.hasAccount') }}
          <ULink
            :to="{ path: localePath('/login'), query: { redirect: route.fullPath } }"
            class="font-medium text-primary"
          >{{ t('auth.register.loginLink') }}</ULink>
        </p>
      </div>

      <div v-else-if="hasSomething" class="space-y-4" data-join-accept-box>
        <p v-if="rolle" class="text-sm text-muted">
          {{ t('join.roleNote', { role: t(`members.roles.${rolle}`) }) }}
        </p>
        <AuthEmailVerifyRequired v-if="needsVerification" :title="t('join.verifyFirst')" />
        <UButton :loading="busy" :disabled="done" icon="i-ph-check" data-join-accept @click="accept">
          {{ t('join.accept') }}
        </UButton>
      </div>

      <UAlert
        v-else
        color="neutral"
        variant="subtle"
        icon="i-ph-info"
        :title="t('join.noneTitle')"
        :description="auth.isLoggedIn ? t('join.noneText') : t('join.noneTextAnonymous')"
      />
    </UPageCard>
  </UContainer>
</template>
