import { requiredConsents, type ConsentConfig } from '../../shared/consent'
import type { ConsentStateResponse } from '../../shared/types/consent'
import CoreConsentPrompt from '../components/core/ConsentPrompt.vue'

/**
 * DIE NACHFRAGE ÖFFNEN (SEC-007, „Tür zu und einmal fragen").
 *
 * Drei Anlässe, ein Dialog (`CoreConsentPrompt` über `useOverlay()` — er
 * hängt am `UApp` jeder App, kein Layout muss ihn einbinden):
 *  1. der Seitenaufbau bringt fehlende Zustimmungen mit (SSR,
 *     `consent-state.server.ts`) ⇒ einmal nach dem Mounten;
 *  2. jemand meldet sich im Browser an (kein neuer Seitenaufbau) ⇒ einmal
 *     `GET /api/auth/consent`;
 *  3. eine Schreib-Anfrage kam mit 403 `consent_required` zurück — der
 *     zentrale Fehler-Leser (`community-suspended-notice.client.ts`) zählt
 *     `useConsentPromptRequests()` hoch.
 *
 * „Später" schließt den Dialog bis zum nächsten Anlass 3 oder zum nächsten
 * Seitenaufbau — einmal je Besuch gefragt, nicht bei jeder Navigation.
 *
 * In einer App ohne Pflicht (Core-Default) tut dieses Plugin nichts und
 * fragt nichts an.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const appConfig = useAppConfig() as { pukalani?: { auth?: ConsentConfig } }
  if (!requiredConsents(appConfig.pukalani?.auth).length) return

  const state = useConsentState()
  const requests = useConsentPromptRequests()
  const auth = useAuthStore()
  const overlay = useOverlay()
  const prompt = overlay.create(CoreConsentPrompt)
  let showing = false

  async function refreshState(): Promise<void> {
    try {
      const result = await $fetch<ConsentStateResponse>('/api/auth/consent')
      state.value = { missing: result.missing }
    }
    catch {
      // Stand unbekannt — die Tür am Server bleibt die Grenze.
    }
  }

  async function show(): Promise<void> {
    if (showing || !state.value.missing.length) return
    showing = true
    try {
      await prompt.open({ missing: [...state.value.missing] })
    }
    finally {
      showing = false
    }
  }

  nuxtApp.hook('app:mounted', () => {
    void show()
  })

  watch(() => auth.isLoggedIn, async (loggedIn, before) => {
    if (!loggedIn) {
      state.value = { missing: [] }
      return
    }
    if (before) return
    await refreshState()
    await show()
  })

  watch(requests, async () => {
    if (!auth.isLoggedIn) return
    if (!state.value.missing.length) await refreshState()
    await show()
  })
})
