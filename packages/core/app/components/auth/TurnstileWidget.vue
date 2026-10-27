<script setup lang="ts">
import type { TurnstileAction } from '../../../shared/turnstile'
import type { TurnstileApi } from '../../../shared/types/turnstile'

/**
 * BOT-BEWEIS IM FORMULAR (Cloudflare Turnstile, Vorfall 2026-10-27).
 *
 * Das Widget holt einen Einmal-Token, das Formular schickt ihn als
 * `turnstileToken` mit, der Server prüft ihn (server/utils/turnstile.ts).
 *
 * OHNE SITE-KEY RENDERT ES NICHTS — kein Markup, kein Skript, kein Token. Die
 * Formulare verhalten sich dann exakt wie vor dem Vorfall; davon leben Dev,
 * CI und die E2E-Specs, die über das Formular registrieren.
 *
 * `appearance: 'interaction-only'`: die allermeisten Menschen sehen nichts —
 * das Feld erscheint nur, wenn Cloudflare tatsächlich eine Interaktion will.
 *
 * Ein Token gilt EINMAL. Nach jedem Request (Erfolg wie Fehler) ruft das
 * Formular `reset()` über die Template-Ref, sonst schickt der nächste Versuch
 * einen verbrauchten Token und scheitert garantiert.
 */
const props = defineProps<{
  action: TurnstileAction
  modelValue: string
}>()
const emit = defineEmits<{ 'update:modelValue': [token: string] }>()

const config = useRuntimeConfig()
const { locale } = useI18n()
const siteKey = computed(() => config.public.turnstileSiteKey ?? '')
const container = ref<HTMLElement | null>(null)
let widgetId: string | undefined

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/**
 * Das Skript GENAU EINMAL je Seite: das Promise hängt am `window`, nicht am
 * Modul-Scope einer Instanz — Login ↔ Register ↔ Code wechseln die
 * Komponenten, die Seite bleibt. Ein zweites `<script>` würde `turnstile`
 * neu aufsetzen und offene Widgets verwaisen lassen.
 */
type TurnstileWindow = Window & {
  turnstile?: TurnstileApi
  __pukalaniTurnstileLoader?: Promise<TurnstileApi>
}

function loadTurnstile(): Promise<TurnstileApi> {
  const w = window as TurnstileWindow
  if (w.turnstile) return Promise.resolve(w.turnstile)
  if (!w.__pukalaniTurnstileLoader) {
    w.__pukalaniTurnstileLoader = new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SCRIPT_URL
      script.async = true
      script.onload = () => {
        if (w.turnstile) resolve(w.turnstile)
        else reject(new Error('turnstile api missing after load'))
      }
      script.onerror = () => {
        // Nächster Versuch (nächstes Mounten) darf neu laden — ein
        // verworfenes Promise am window bliebe sonst für immer verworfen.
        w.__pukalaniTurnstileLoader = undefined
        script.remove()
        reject(new Error('turnstile script failed to load'))
      }
      document.head.appendChild(script)
    })
  }
  return w.__pukalaniTurnstileLoader
}

onMounted(async () => {
  if (!siteKey.value) return
  let api: TurnstileApi
  try {
    api = await loadTurnstile()
  }
  catch (error) {
    // Kein Token ⇒ der Knopf bleibt gesperrt und der Server sagt notfalls
    // „bitte bestätigen" — mehr kann das Formular hier nicht tun.
    console.warn('[core] Turnstile konnte nicht geladen werden:', error)
    return
  }
  // Zwischen Mounten und Laden kann die Komponente schon wieder weg sein.
  if (!container.value) return
  widgetId = api.render(container.value, {
    sitekey: siteKey.value,
    action: props.action,
    theme: 'auto',
    language: locale.value === 'de' ? 'de' : 'en',
    appearance: 'interaction-only',
    size: 'flexible',
    callback: token => emit('update:modelValue', token),
    'expired-callback': () => emit('update:modelValue', ''),
    'error-callback': () => emit('update:modelValue', ''),
  })
})

/** Neuen Token anfordern — nach JEDEM Request, weil ein Token nur einmal gilt. */
function reset() {
  emit('update:modelValue', '')
  const w = window as TurnstileWindow
  if (widgetId && w.turnstile) w.turnstile.reset(widgetId)
}

onBeforeUnmount(() => {
  const w = window as TurnstileWindow
  if (widgetId && w.turnstile) w.turnstile.remove(widgetId)
  widgetId = undefined
})

defineExpose({ reset })
</script>

<template>
  <div v-if="siteKey" ref="container" data-turnstile />
</template>
