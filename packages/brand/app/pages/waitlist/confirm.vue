<script setup lang="ts">
import type { BrandWaitlistConfirmResponse } from '../../../shared/types/brand'

/**
 * DIE LANDESTELLE DES BESTÄTIGUNGS-LINKS — `/waitlist/confirm?token=…`
 * (Double-Opt-in der Warteliste, Davids Auftrag 2026-09-04).
 *
 * Die Mail trägt den ROH-Token, die Tabelle nur seinen Hash; diese Seite
 * reicht ihn genau einmal an `POST /api/brand/waitlist/confirm` weiter und
 * zeigt, was der Server sagt. Sie entscheidet nichts selbst: vier Zustände,
 * vier Sätze, ein Weg zurück.
 *
 * ── ÖFFENTLICH, ABSICHTLICH ───────────────────────────────────────────────
 * Wer sich einträgt, hat typischerweise KEIN Konto — ein Auth-Guard schickte
 * ihn auf /login, und dort hilft ihm niemand (dieselbe Begründung wie bei
 * /invite).
 *
 * ── DER TOKEN REIST NUR IM BODY ───────────────────────────────────────────
 * Ein GET mit `?token=` in der API läge im Server-Log; der Browser hat ihn
 * ohnehin in der Adresszeile — mehr Stellen braucht er nicht.
 */
definePageMeta({ layout: 'default' })

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()

useSeoMeta({ title: () => t('brand.waitlist.confirm.title'), robots: 'noindex, nofollow' })

type State = 'checking' | 'confirmed' | 'already' | 'invalid' | 'expired'
const state = ref<State>('checking')

const token = computed(() => {
  const raw = route.query.token
  return typeof raw === 'string' ? raw.trim() : ''
})

onMounted(async () => {
  if (!token.value) { state.value = 'invalid'; return }
  try {
    const result = await $fetch<BrandWaitlistConfirmResponse>('/api/brand/waitlist/confirm', {
      method: 'POST',
      body: { token: token.value },
    })
    state.value = result.state === 'already_confirmed' ? 'already' : 'confirmed'
  }
  catch (error) {
    const status = (error as { status?: number, statusCode?: number, response?: { status?: number } } | null)
    const code = status?.status ?? status?.statusCode ?? status?.response?.status ?? null
    state.value = code === 410 ? 'expired' : 'invalid'
  }
})

const ok = computed(() => state.value === 'confirmed' || state.value === 'already')
</script>

<template>
  <div class="pb-10">
    <div class="mx-auto mt-14 max-w-xl">
      <div class="bw-card p-10 text-center" data-waitlist-confirm>
        <template v-if="state === 'checking'">
          <UIcon name="i-ph-circle-notch" class="mx-auto size-6 animate-spin" style="color: var(--bw-muted)" />
          <p class="mt-4 text-sm" style="color: var(--bw-ink-soft)">{{ t('brand.waitlist.confirm.checking') }}</p>
        </template>
        <template v-else>
          <span
            class="mx-auto grid size-12 place-items-center rounded-full"
            :style="ok ? 'background: var(--bw-accent-soft)' : 'background: var(--bw-stale-soft)'"
          >
            <UIcon :name="ok ? 'i-ph-check' : 'i-ph-link-break'" class="size-5" :style="ok ? 'color: var(--bw-accent)' : 'color: var(--bw-stale)'" />
          </span>
          <h1 class="mt-6 text-balance text-3xl font-extralight tracking-tight">{{ t(`brand.waitlist.confirm.${state}Title`) }}</h1>
          <p class="mx-auto mt-4 max-w-md text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t(`brand.waitlist.confirm.${state}Text`) }}</p>
          <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
            <UButton
              v-if="!ok" :label="t('brand.waitlist.confirm.back')" :to="localePath('/about')" size="lg" class="rounded-full"
            />
            <UButton :label="t('brand.waitlist.confirm.home')" :to="localePath('/')" size="lg" color="neutral" :variant="ok ? 'solid' : 'ghost'" class="rounded-full" />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
