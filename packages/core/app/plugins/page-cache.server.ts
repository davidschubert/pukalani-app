import { pageEligibleForCache } from '../../shared/pageCache'

/**
 * SEITEN KURZ FERTIG HALTEN (Q22, R3) — sagt nach dem Rendern, ob DIESE
 * Seite gehalten werden darf: nur der Router kennt Layout und Seiten-Meta.
 * Portfolio hält nur Seiten mit dem Layout `site`; eine Seite meldet sich
 * mit `definePageMeta({ pageCache: false })` ab (Erstgespräch). Fehlerseiten
 * nie. Ob die ANFRAGE gehalten werden darf, entscheidet die Middleware.
 */
export default defineNuxtPlugin({
  name: 'core:page-cache',
  setup(nuxtApp) {
    const gate = useAppConfig().pukalani?.pageCache
    if (!gate?.enabled) return
    const router = useRouter()
    nuxtApp.hooks.hook('app:rendered', ({ ssrContext }) => {
      const event = ssrContext?.event
      if (!event || !event.context.pageCacheKey) return
      if (nuxtApp.payload.error || ssrContext?.noSSR) return
      if (pageEligibleForCache(gate, router.currentRoute.value.meta)) event.context.pageCacheEligible = true
    })
  },
})
