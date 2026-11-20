<script setup lang="ts">
import { resolveGettingStarted, type GettingStartedResponse, type GettingStartedStep } from '../../shared/gettingStarted'

/**
 * DIE WILLKOMMENS-CHECKLISTE (U4 / Trichter-G2, Benchmark-E1) — fünf Schritte
 * auf der Dashboard-Übersicht, damit die ersten Minuten in einer frischen
 * Community nicht aus lauter Nullen bestehen.
 *
 * ORT: derselbe Hinweis-Slot wie Sperre und Testphase
 * (`pukalani.admin.notices`), also über den Kennzahlen — was JETZT zu tun ist,
 * steht über dem, was war. GLOBAL registriert (`.global.vue`), weil
 * `<component :is="'CommunityGettingStartedNotice'">` den Namen zur Laufzeit
 * auflöst.
 *
 * KEIN `UTable` (Regel B6 gilt Datenlisten): das hier sind fünf feste
 * Schritte in entschiedener Reihenfolge — nichts zu sortieren, nichts
 * auszuwählen, nichts zu blättern.
 *
 * NUR CLIENT (`server: false`) wie die Geschwister-Hinweise: die Antwort hängt
 * am Mandanten und an einem Control-Ruf; ein 404 auf einem Nicht-Pool-Host ist
 * der Normalfall und darf die Übersicht nicht mit einem Fehler behelligen —
 * `default` fängt ihn ab, `resolveGettingStarted(null)` rendert dann nichts.
 *
 * DIE REIHENFOLGE UND DAS VERSCHWINDEN entscheidet die pure Regel in
 * `shared/gettingStarted.ts`, nicht dieses Markup.
 */
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()

const { data } = await useFetch<GettingStartedResponse | null>('/api/community/getting-started', {
  lazy: true,
  server: false,
  default: () => null,
})

/** Nach dem Klick sofort weg — der prefs-Merker ist schon geschrieben. */
const hidden = ref(false)
const dismissing = ref(false)

const view = computed(() => resolveGettingStarted(data.value))

/**
 * Die Ziele. Keine Seite hier lokalisiert ihren PFAD (kein
 * `defineI18nRoute`), also genügt `localePath` mit dem Pfad — bei einer Seite
 * MIT Sprachpfaden müsste stattdessen der Routen-NAME stehen.
 *
 * „Beitrag schreiben" zeigt auf den Feed und nicht ins Dashboard: dort steht
 * der Composer, und `my-posts.vue` verlinkt aus demselben Grund ebendorthin.
 */
const STEP_LINKS: Record<GettingStartedStep, string> = {
  post: '/feed',
  branding: '/dashboard/community/branding',
  invite: '/dashboard/members',
  homePage: '/dashboard/pages',
  plan: '/dashboard/community/plan',
}

async function dismiss() {
  dismissing.value = true
  try {
    await $fetch('/api/community/getting-started/dismiss', { method: 'POST' })
    hidden.value = true
  }
  catch {
    toast.add({ title: t('onboarding.gettingStarted.dismissFailed'), color: 'error' })
  }
  finally {
    dismissing.value = false
  }
}
</script>

<template>
  <UCard v-if="view.visible && !hidden" data-getting-started>
    <template #header>
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="font-semibold">
            {{ t('onboarding.gettingStarted.title') }}
          </h2>
          <p class="mt-1 text-sm text-muted">
            {{ t('onboarding.gettingStarted.intro') }}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <UBadge color="neutral" variant="subtle" size="sm" data-getting-started-progress>
            {{ t('onboarding.gettingStarted.progress', { done: view.doneCount, total: view.total }) }}
          </UBadge>
          <UButton
            icon="i-ph-x"
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="dismissing"
            :aria-label="t('onboarding.gettingStarted.dismiss')"
            :title="t('onboarding.gettingStarted.dismiss')"
            data-getting-started-dismiss
            @click="dismiss"
          />
        </div>
      </div>
    </template>

    <ul class="space-y-1">
      <li v-for="step in view.steps" :key="step.key">
        <ULink
          :to="localePath(STEP_LINKS[step.key])"
          class="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-elevated"
          :data-getting-started-step="step.key"
          :data-getting-started-done="step.done"
        >
          <UIcon
            :name="step.done ? 'i-ph-check-circle-fill' : 'i-ph-circle-dashed'"
            class="mt-0.5 size-5 shrink-0"
            :class="step.done ? 'text-primary' : 'text-dimmed'"
            aria-hidden="true"
          />
          <span class="min-w-0">
            <span class="block text-sm font-medium" :class="step.done ? 'text-muted line-through' : ''">
              {{ t(`onboarding.gettingStarted.steps.${step.key}.label`) }}
            </span>
            <!-- Durchgestrichen sieht man, hören kann man es nicht (UX-010). -->
            <span v-if="step.done" class="sr-only">{{ t('onboarding.gettingStarted.stepDone') }}</span>
            <span v-if="!step.done" class="block text-sm text-muted">
              {{ t(`onboarding.gettingStarted.steps.${step.key}.hint`) }}
            </span>
          </span>
        </ULink>
      </li>
    </ul>
  </UCard>
</template>
